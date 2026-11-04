import sharp from "sharp";

const CHAT_MODEL = process.env.AICHAT_MODEL || "gpt-4o-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const SIZES = new Set(["1024x1536", "1536x1024", "1024x1024"]);
const QUALITIES = new Set(["low", "medium", "high"]);
const MAX_IMAGES = 4;

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .trim()
    .slice(0, max);

const SYSTEM_PROMPT = `
Ти — AI-дизайнер і помічник бізнесу, що робить персоналізовані дитячі розмальовки, календарики та наклейки з фото дитини. Відповідай українською, дружньо і по суті.

ЯК ПРАЦЮЄ ВИРОБНИЦТВО (знай це точно)
- Усі PDF — портретний A4 (210×297 мм, 300 DPI = 2480×3508 px).
- Передня обкладинка: вертикальна, зверху великий заголовок "Моя Розмальовка", у центрі дитина, ім'я дитини, тематична сцена. Задня обкладинка: спокійна, у лівому нижньому куті місце під QR-код.
- Календарик: горизонтальний, 2 штуки на одному A4 (кожен 210×148.5 мм). Зверху сцена з дитиною, ім'я та рік, знизу 12 місяців у 2 ряди по 6.
- Наклейки: аркуш A4, що ділиться навпіл пунктирною лінією; на ньому наклейки-вирізки з дитиною (змінюється одяг і пози) з білою обводкою та пунктирним контуром.

ЩО ТИ ВМІЄШ
- Аналізувати приклади, які надсилає користувач (фото обкладинок, календариків, наклейок): описувати стиль, композицію, шрифти, кольори, пропонувати, як це повторити.
- Давати поради: теми, стилі, шаблони, тексти, що змінити чи додати.
- Створювати або редагувати зображення викликом функції generate_image.

КОЛИ ВИКЛИКАТИ generate_image
- Лише коли користувач явно просить створити, намалювати, згенерувати або змінити зображення («зроби», «намалюй», «створи», «зміни на фото…»). Якщо запит неясний або тільки питання — спершу відповідай текстом (генерація коштує грошей).
- Генеруй рівно одне зображення за раз.
- Якщо до повідомлення додано фото і користувач просить зберегти дитину або змінити/доповнити саме це зображення — став use_attached_images=true. Якщо не потрібні прикріплені зображення — false.
- Пиши prompt англійською, дуже детально: сцена, стиль, кольори, освітлення, композиція. Якщо потрібен текст на зображенні, вкажи його ДОСЛІВНО в лапках кирилицею та кажи, що літери мають бути ідеально розбірливі й без зайвих символів. Якщо користувач просить без напису — не додавай жодного тексту.
- Для обкладинок обирай size 1024x1536, для календариків і наклейок 1536x1024. Якщо дитина на прикріпленому фото — збережи її обличчя, вік, колір волосся й шкіри; не змінюй дитину.
- AI погано малює точні цифри й таблиці. Тому для календаря малюй лише ілюстрацію (дитина, ім'я, рік за бажанням) і залишай порожню спокійну область унизу під сітку місяців; не малюй числа дат.
- Не використовуй бренди та захищених персонажів; пропонуй оригінальних персонажів.
- Після виклику функції не потрібен довгий текст: напиши 1–2 речення (що зробив і що ще можна змінити).
`.trim();

const TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Створити або відредагувати одне зображення за детальним англомовним описом.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Детальний опис зображення англійською." },
          size: { type: "string", enum: ["1024x1536", "1536x1024", "1024x1024"] },
          use_attached_images: {
            type: "boolean",
            description: "true — використати прикріплені до повідомлення зображення як вхідні (фото дитини, приклад, зображення для редагування).",
          },
        },
        required: ["prompt", "size", "use_attached_images"],
      },
    },
  },
];

async function prepareImage(file) {
  return sharp(file.buffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function runImage({ apiKey, prompt, size, quality, images }) {
  const useEdits = images.length > 0;
  let response;

  if (useEdits) {
    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    images.forEach((buffer, index) => {
      form.append(images.length > 1 ? "image[]" : "image", new Blob([buffer], { type: "image/jpeg" }), `input-${index + 1}.jpg`);
    });
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", "png");
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size, quality, output_format: "png", n: 1 }),
    });
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("❌ OpenAI Image:", JSON.stringify(data?.error || data));
    const error = new Error(data?.error?.message || "Помилка OpenAI Image API.");
    error.status = response.status;
    throw error;
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI не повернув зображення.");
  return `data:image/png;base64,${b64}`;
}

export function registerAiChat(app, upload) {
  app.post("/api/aichat/message", upload.array("images", MAX_IMAGES), async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY не налаштований на сервері." });
      }

      let history = [];
      try {
        history = JSON.parse(req.body?.messages || "[]");
      } catch {
        return res.status(400).json({ error: "Некоректна історія розмови." });
      }
      const past = (Array.isArray(history) ? history : [])
        .slice(-16)
        .map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: clean(m?.text, 2000) }))
        .filter((m) => m.content);

      const text = clean(req.body?.text, 3000);
      const files = req.files || [];
      if (!text && !files.length) {
        return res.status(400).json({ error: "Напишіть повідомлення або додайте зображення." });
      }

      const quality = QUALITIES.has(req.body?.quality) ? req.body.quality : "low";

      let buffers;
      try {
        buffers = await Promise.all(files.map(prepareImage));
      } catch {
        return res.status(400).json({ error: "Не вдалося прочитати зображення. Використайте JPG, PNG або WebP." });
      }

      const content = [{ type: "text", text: text || "(Користувач надіслав лише зображення — опиши, що бачиш, і запропонуй, що з цим зробити.)" }];
      buffers.forEach((buffer) => {
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}`, detail: "auto" } });
      });

      const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.7,
          tools: TOOLS,
          tool_choice: "auto",
          parallel_tool_calls: false,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...past, { role: "user", content }],
        }),
      });

      const chatData = await chatResponse.json().catch(() => null);
      if (!chatResponse.ok) {
        return res.status(chatResponse.status).json({ error: chatData?.error?.message || "Помилка чату OpenAI." });
      }

      const message = chatData?.choices?.[0]?.message || {};
      const reply = clean(message.content, 2000);
      const call = message.tool_calls?.find((c) => c?.function?.name === "generate_image");

      if (!call) {
        return res.json({ reply: reply || "Розкажіть, що саме потрібно зробити.", images: [] });
      }

      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        return res.json({ reply: "Не вдалося зрозуміти запит на зображення. Спробуйте сформулювати ще раз.", images: [] });
      }

      const prompt = clean(args.prompt, 3800);
      if (!prompt) {
        return res.json({ reply: "Опишіть детальніше, що намалювати.", images: [] });
      }
      const size = SIZES.has(args.size) ? args.size : "1024x1536";
      const inputs = args.use_attached_images ? buffers : [];

      console.log(`🖼️ AI-чат: ${size} · ${quality} · вхідних зображень: ${inputs.length}`);
      const image = await runImage({ apiKey, prompt, size, quality, images: inputs });

      return res.json({
        reply: reply || "Готово! Напишіть, що змінити чи додати.",
        images: [image],
        prompt,
      });
    } catch (error) {
      console.error("💥 AI-чат:", error);
      return res.status(error?.status || 500).json({ error: error?.message || "Внутрішня помилка сервера." });
    }
  });
}
