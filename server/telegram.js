import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

const MAX_PHOTOS = 25;
const MAX_BYTES = 20 * 1024 * 1024;
const LINK_TTL = 30 * 60 * 1000;
const BUTTON_START = "Надіслати фото в AI розмальовки";
const BUTTON_SEND = "Передати в AI розмальовки";
const BUTTON_CLEAR = "Очистити фото";

export function createTelegramBot({ token, allowedUsers, appOrigin, fetchImpl = fetch }) {
  const users = new Set(allowedUsers.map(String));
  const pending = new Map();
  const links = new Map();
  const apiUrl = `https://api.telegram.org/bot${token}/`;
  const keyboard = { keyboard: [[{ text: BUTTON_START }], [{ text: BUTTON_SEND }, { text: BUTTON_CLEAR }]], resize_keyboard: true };

  async function api(method, body) {
    let response;
    try {
      response = await fetchImpl(apiUrl + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(method === "getUpdates" ? 35000 : 20000),
      });
    } catch {
      throw new Error(`Telegram ${method}: помилка мережі.`);
    }
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(`Telegram ${method}: помилка ${response.status}.`);
    return data.result;
  }

  async function send(chatId, text) {
    await api("sendMessage", { chat_id: chatId, text, reply_markup: keyboard });
  }

  function pruneLinks() {
    const now = Date.now();
    for (const [key, value] of links) if (value.expires <= now) links.delete(key);
  }

  async function handleUpdate(update) {
    const message = update.message;
    if (!message || message.chat?.type !== "private" || !message.from?.id) return;
    const id = String(message.from.id);
    if (!users.has(id)) {
      if (message.text === "/start") {
        await api("sendMessage", { chat_id: message.chat.id, text: `Доступ не налаштовано. Передайте адміністратору ваш Telegram ID: ${id}` });
      }
      return;
    }
    const chatId = message.chat.id;
    const text = message.text?.trim();
    if (text === "/start" || text === BUTTON_START) {
      await send(chatId, `Надішліть або перешліть фото, потім натисніть «Передати в AI розмальовки». До ${MAX_PHOTOS} фото сумарно до 20 МБ.`);
      return;
    }
    if (text === BUTTON_CLEAR) {
      pending.delete(id);
      await send(chatId, "Список фото очищено.");
      return;
    }
    if (text === BUTTON_SEND) {
      const photos = pending.get(id) || [];
      if (!photos.length) {
        await send(chatId, "Спочатку надішліть фото.");
        return;
      }
      pruneLinks();
      const key = randomBytes(32).toString("base64url");
      links.set(key, { photos: photos.slice(), expires: Date.now() + LINK_TTL, busy: false });
      setTimeout(() => links.delete(key), LINK_TTL).unref();
      try {
        await send(chatId, `Фото: ${photos.length}. Відкрийте одноразове посилання протягом 30 хвилин:\n${appOrigin}/#telegram=${key}\nНе пересилайте посилання стороннім.`);
      } catch (error) {
        links.delete(key);
        throw error;
      }
      pending.delete(id);
      return;
    }
    const photo = message.photo?.at(-1);
    const document = message.document;
    const allowedDocument = document && ["image/jpeg", "image/png", "image/webp"].includes(document.mime_type);
    const item = photo
      ? { fileId: photo.file_id, size: photo.file_size, type: "image/jpeg" }
      : allowedDocument ? { fileId: document.file_id, size: document.file_size, type: document.mime_type } : null;
    if (!item) {
      if (document) await send(chatId, "Підтримуються фото JPEG, PNG і WebP.");
      return;
    }
    const photos = pending.get(id) || [];
    if (!item.fileId || !Number.isSafeInteger(item.size) || item.size <= 0) {
      await send(chatId, "Telegram не повідомив розмір фото. Спробуйте надіслати його ще раз.");
    } else if (photos.length >= MAX_PHOTOS || photos.reduce((sum, photoItem) => sum + photoItem.size, 0) + item.size > MAX_BYTES) {
      await send(chatId, `Ліміт: ${MAX_PHOTOS} фото і 20 МБ разом. Передайте вже додані фото або очистіть список.`);
    } else {
      photos.push(item);
      pending.set(id, photos);
      await send(chatId, `Додано фото. У списку: ${photos.length}/${MAX_PHOTOS}.`);
    }
  }

  async function readPhoto(photo, remaining) {
    const file = await api("getFile", { file_id: photo.fileId });
    if (!file.file_path || !/^[a-zA-Z0-9_./-]+$/.test(file.file_path) || file.file_path.includes("..")) {
      throw new Error("Telegram повернув некоректний шлях фото.");
    }
    let response;
    try {
      response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
        redirect: "error", signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error("Не вдалося завантажити фото з Telegram.");
    }
    if (!response.ok || !response.body) throw new Error("Не вдалося завантажити фото з Telegram.");
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > remaining) throw new Error("Сумарний розмір фото перевищує 20 МБ.");
      chunks.push(chunk);
    }
    if (!total) throw new Error("Telegram повернув порожнє фото.");
    return Buffer.concat(chunks);
  }

  async function redeem(key) {
    pruneLinks();
    const batch = links.get(key);
    if (!batch) return { status: 404, error: "Посилання недійсне, використане або термін його дії минув." };
    if (batch.busy) return { status: 409, error: "Фото вже завантажуються. Спробуйте ще раз." };
    batch.busy = true;
    try {
      let total = 0;
      const items = [];
      for (const [index, photo] of batch.photos.entries()) {
        const data = await readPhoto(photo, MAX_BYTES - total);
        total += data.length;
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[photo.type];
        items.push({ name: `Telegram - фото ${index + 1}.${extension}`, type: photo.type, data: data.toString("base64") });
      }
      links.delete(key);
      return { status: 200, items };
    } catch {
      return { status: 502, error: "Не вдалося отримати фото з Telegram. Спробуйте ще раз." };
    } finally {
      batch.busy = false;
    }
  }

  async function poll() {
    let offset = 0;
    for (;;) {
      try {
        const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
        for (const update of updates) {
          try {
            await handleUpdate(update);
          } catch {
            console.error("Telegram: не вдалося обробити повідомлення.");
          }
          offset = update.update_id + 1;
        }
      } catch (error) {
        console.error(error.message);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  return { handleUpdate, redeem, poll };
}

export function registerTelegram(app) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const ids = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [];
  const originValue = process.env.TELEGRAM_APP_ORIGIN?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");
  if (!token && !ids.length && !process.env.TELEGRAM_APP_ORIGIN?.trim()) return;
  let origin;
  try {
    const url = new URL(originValue);
    if (url.protocol !== "https:" || url.origin !== originValue || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch {
    console.error("Telegram вимкнено: TELEGRAM_APP_ORIGIN має бути HTTPS-адресою сайту без шляху та / в кінці.");
    return;
  }
  if (!token || !ids.length || ids.some((id) => !/^\d+$/.test(id))) {
    console.error("Telegram вимкнено: задайте TELEGRAM_BOT_TOKEN та TELEGRAM_ALLOWED_USER_IDS.");
    return;
  }
  const bot = createTelegramBot({ token, allowedUsers: ids, appOrigin: origin });
  app.post("/api/telegram/photos", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const key = req.body?.key;
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)) {
      return res.status(400).json({ error: "Некоректне посилання." });
    }
    const result = await bot.redeem(key);
    return res.status(result.status).json(result.status === 200 ? { items: result.items } : { error: result.error });
  });
  bot.poll();
  console.log("Telegram-бот запущено.");
}
