import { Buffer } from "node:buffer";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import process from "node:process";

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v27.0";
if (!/^v\d+\.\d+$/.test(GRAPH_API_VERSION)) {
  throw new Error("META_GRAPH_API_VERSION має бути у форматі vNN.0.");
}
const GRAPH_REQUEST_TIMEOUT_MS = 30000;
const META_SESSION_TTL_SECONDS = 12 * 60 * 60;
const META_SESSION_COOKIE = "meta_business_session";
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MEDIA_ID_TTL_MS = 15 * 60 * 1000;
const MAX_MEDIA_IDS = 1000;
const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;
const CONVERSATION_RECIPIENT_TTL_MS = 60 * 60 * 1000;
const mediaIds = new Map();
const mediaIdsByKey = new Map();
const profileCache = new Map();
const conversationRecipients = new Map();
const loginAttempts = new Map();

const platformConfig = {
  messenger: {
    tokenEnv: "META_MESSENGER_PAGE_ACCESS_TOKEN",
    graphPlatform: "MESSENGER",
  },
  instagram: {
    tokenEnv: "META_INSTAGRAM_PAGE_ACCESS_TOKEN",
    graphPlatform: "INSTAGRAM",
  },
};

function isLoopbackAddress(address = "") {
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  return normalized === "127.0.0.1" || normalized === "::1";
}

function isLocalOrigin(origin = "") {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isMetaAuthenticationRequired() {
  return isProduction() || Boolean(process.env.META_API_PASSWORD?.trim());
}

function getExpectedOrigin() {
  const configuredOrigin = process.env.META_APP_ORIGIN?.trim();
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const value = configuredOrigin || (railwayDomain ? `https://${railwayDomain}` : "");
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isAllowedOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return false;
  const expectedOrigin = getExpectedOrigin();
  if (expectedOrigin) return origin === expectedOrigin;
  return !isProduction() && isLocalOrigin(origin);
}

function createSessionSignature(expiresAt, password) {
  return createHmac("sha256", password).update(String(expiresAt)).digest("base64url");
}

function getSessionCookie(req) {
  const cookieHeader = req.get("cookie") || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${META_SESSION_COOKIE}=`));
  return cookie ? cookie.slice(META_SESSION_COOKIE.length + 1) : "";
}

function hasValidMetaSession(req) {
  const password = process.env.META_API_PASSWORD?.trim() || "";
  if (!password) return false;
  const [expiresAtText, signature] = getSessionCookie(req).split(".");
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !signature) {
    return false;
  }
  const expected = Buffer.from(createSessionSignature(expiresAt, password));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function clearMetaSession(res) {
  res.clearCookie(META_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: isMetaAuthenticationRequired(),
    path: "/api/meta",
  });
}

function isLoginRateLimited(req) {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts) {
    if (attempts.resetAt <= now) loginAttempts.delete(key);
  }
  const key = req.socket.remoteAddress || "unknown";
  let attempts = loginAttempts.get(key);
  if (!attempts || attempts.resetAt <= now) {
    attempts = { count: 0, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS };
    loginAttempts.set(key, attempts);
  }
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) return true;
  attempts.count += 1;
  return false;
}

function requireMetaApiAccess(req, res, next) {
  const origin = req.get("origin");
  const isLocalRequest = isLoopbackAddress(req.socket.remoteAddress)
    && (!origin || isLocalOrigin(origin));
  if (!isMetaAuthenticationRequired() && isLocalRequest) return next();
  if (origin && !isAllowedOrigin(req)) {
    return res.status(403).json({
      error: "Цей сайт не має доступу до Business Chat API.",
    });
  }
  if (req.method !== "GET" && !isAllowedOrigin(req)) {
    return res.status(403).json({ error: "Потрібен запит із дозволеного домену Business Chat." });
  }
  if (!hasValidMetaSession(req)) {
    return res.status(401).json({ error: "Увійдіть у Business Chat, щоб продовжити." });
  }
  next();
}

function setMetaSession(req, res) {
  const password = process.env.META_API_PASSWORD?.trim() || "";
  if (password.length < 16) {
    return res.status(503).json({
      error: "У Railway задайте META_API_PASSWORD довжиною щонайменше 16 символів.",
    });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: "Вхід дозволений лише з домену Business Chat." });
  }
  if (isLoginRateLimited(req)) {
    return res.status(429).json({ error: "Забагато спроб входу. Спробуйте через 15 хвилин." });
  }
  const providedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  const expected = Buffer.from(password);
  const provided = Buffer.from(providedPassword);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: "Пароль неправильний." });
  }
  loginAttempts.delete(req.socket.remoteAddress || "unknown");
  const expiresAt = Math.floor(Date.now() / 1000) + META_SESSION_TTL_SECONDS;
  const signature = createSessionSignature(expiresAt, password);
  res.cookie(META_SESSION_COOKIE, `${expiresAt}.${signature}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: isMetaAuthenticationRequired(),
    maxAge: META_SESSION_TTL_SECONDS * 1000,
    path: "/api/meta",
  });
  return res.json({ authenticated: true });
}

function getToken(platform) {
  const { tokenEnv } = platformConfig[platform];
  return process.env[tokenEnv]?.trim() || "";
}

function getGraphUrl(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", token);
  return url;
}

async function graphRequest(path, params, token, options = {}) {
  const url = getGraphUrl(path, params, token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_REQUEST_TIMEOUT_MS);
  let response;
  const fetchOptions = {
    method: options.method || "GET",
    signal: controller.signal,
  };
  if (options.body !== undefined) {
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Meta API не відповів вчасно. Спробуйте ще раз.", { cause: error });
    }
    throw new Error("Не вдалося з’єднатися з Meta API.", { cause: error });
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const graphError = data?.error;
    const isRateLimited = response.status === 429 || graphError?.type === "TooManyRequestsException";
    const message = isRateLimited
      ? "Meta тимчасово обмежила запити до цього каналу. Зачекайте кілька хвилин і оновіть список."
      : (graphError?.message || `Meta API повернув помилку ${response.status}.`).split(token).join("[приховано]");
    const error = new Error(message);
    error.status = isRateLimited ? 429 : graphError?.code === 190 ? 401 : graphError?.code === 200 ? 403 : 502;
    throw error;
  }
  return data;
}

function getPageInfo(platform) {
  const token = getToken(platform);
  const pageId = process.env.META_PAGE_ID?.trim() || "";
  const pageIdIsValid = /^\d+$/.test(pageId);
  return {
    configured: Boolean(token && pageIdIsValid),
    tokenConfigured: Boolean(token),
    pageIdConfigured: pageIdIsValid,
    pageId: pageIdIsValid ? pageId : null,
    pageName: null,
  };
}

function getMediaUrl(attachment) {
  return attachment?.image_data?.url
    || attachment?.image_data?.media_url
    || attachment?.file_url
    || "";
}

function getSubattachments(attachment) {
  if (Array.isArray(attachment?.subattachments)) return attachment.subattachments;
  return attachment?.subattachments?.data || [];
}

function getAttachmentFields(platform) {
  const extraFields = platform === "messenger"
    ? ",mime_type,subattachments{id,name,mime_type,image_data,file_url}"
    : "";
  return `attachments{id,name,image_data,file_url${extraFields}}`;
}

function getMessageAttachments(message) {
  return (message.attachments?.data || []).flatMap((attachment) => {
    const subattachments = getSubattachments(attachment);
    if (!subattachments.length) return [attachment];
    return subattachments.map((subattachment, subattachmentIndex) => ({
      ...subattachment,
      id: subattachment.id || `${attachment.id || message.id || "attachment"}:${subattachmentIndex}`,
    }));
  });
}

function createMediaId(url, name, key) {
  const now = Date.now();
  for (const [id, media] of mediaIds) {
    if (media.expiresAt <= now) {
      mediaIds.delete(id);
      if (media.key) mediaIdsByKey.delete(media.key);
    }
  }
  const cachedId = mediaIdsByKey.get(key);
  const cached = cachedId ? mediaIds.get(cachedId) : null;
  if (cached && cached.expiresAt > now) {
    cached.url = url;
    cached.name = name;
    cached.expiresAt = now + MEDIA_ID_TTL_MS;
    return cachedId;
  }
  while (mediaIds.size >= MAX_MEDIA_IDS) {
    const oldestId = mediaIds.keys().next().value;
    const oldest = mediaIds.get(oldestId);
    mediaIds.delete(oldestId);
    if (oldest?.key) mediaIdsByKey.delete(oldest.key);
  }
  const id = randomUUID();
  mediaIds.set(id, { url, name, key, expiresAt: now + MEDIA_ID_TTL_MS });
  mediaIdsByKey.set(key, id);
  return id;
}

export function mapMessage(message, platform) {
  const attachments = getMessageAttachments(message).map((attachment, index) => {
    const url = getMediaUrl(attachment);
    const attachmentId = attachment.id || `${message.id || "message"}:${index}`;
    const imageName = `${attachment.name || ""} ${url}`;
    const isImage = Boolean(url) && (
      Boolean(attachment.image_data)
      || String(attachment.mime_type || "").startsWith("image/")
      || /\.(?:jpe?g|png|webp|gif|avif|heic)(?:$|[?#])/i.test(imageName)
    );
    return {
      id: attachmentId,
      name: attachment.name || "Фото з повідомлення",
      isImage,
      mediaId: isImage ? createMediaId(url, attachment.name, `${platform}:${message.id}:${attachmentId}`) : null,
    };
  });

  return {
    id: message.id,
    text: message.message || "",
    createdTime: message.created_time || null,
    from: message.from || null,
    attachments,
  };
}

function isAllowedMediaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (host === "lookaside.fbsbx.com"
        || host.endsWith(".fbcdn.net")
        || (host.startsWith("fbcdn-profile-") && host.endsWith(".akamaihd.net"))
        || host.endsWith(".cdninstagram.com"));
  } catch {
    return false;
  }
}

async function getProfilePhotoUrl(platform, userId, token) {
  const key = `${platform}:${userId}`;
  const cached = profileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const fields = platform === "messenger"
    ? "name,first_name,last_name,profile_pic"
    : "name,username,profile_pic";
  let profile;
  try {
    profile = await graphRequest(encodeURIComponent(userId), { fields }, token);
  } catch (error) {
    cacheProfilePhoto(key, "", 60 * 1000);
    throw error;
  }
  const url = profile.profile_pic || "";
  if (url && !isAllowedMediaUrl(url)) {
    throw new Error("Meta повернула недозволену адресу фото профілю.");
  }
  cacheProfilePhoto(key, url, PROFILE_CACHE_TTL_MS);
  return url;
}

function getMedia(mediaId) {
  const media = mediaIds.get(mediaId);
  if (!media || media.expiresAt <= Date.now()) {
    mediaIds.delete(mediaId);
    return null;
  }
  return media;
}

function cacheProfilePhoto(key, url, ttl) {
  const now = Date.now();
  for (const [cachedKey, cached] of profileCache) {
    if (cached.expiresAt <= now) profileCache.delete(cachedKey);
  }
  while (profileCache.size >= MAX_MEDIA_IDS) {
    profileCache.delete(profileCache.keys().next().value);
  }
  profileCache.set(key, { url, expiresAt: now + ttl });
}

function cacheConversationRecipient(platform, conversationId, customerId) {
  const now = Date.now();
  for (const [key, value] of conversationRecipients) {
    if (value.expiresAt <= now) conversationRecipients.delete(key);
  }
  while (conversationRecipients.size >= MAX_MEDIA_IDS) {
    conversationRecipients.delete(conversationRecipients.keys().next().value);
  }
  conversationRecipients.set(`${platform}:${conversationId}`, {
    customerId,
    expiresAt: now + CONVERSATION_RECIPIENT_TTL_MS,
  });
}

function getConversationRecipient(platform, conversationId) {
  const key = `${platform}:${conversationId}`;
  const cached = conversationRecipients.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    conversationRecipients.delete(key);
    return null;
  }
  return cached.customerId;
}

async function sendMedia(media, res) {
  const result = await fetchMetaMedia(media);
  res.set("Content-Type", result.contentType);
  res.set("Cache-Control", "private, max-age=300");
  res.send(result.buffer);
}

async function fetchMetaMedia(media) {
  let url = media.url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isAllowedMediaUrl(url)) {
      throw new Error("Meta повернула недозволену адресу фото.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(url, { redirect: "manual", signal: controller.signal });
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Завантаження фото з Meta тривало надто довго.", { cause: error });
      }
      throw new Error("Не вдалося завантажити фото з Meta.", { cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Meta повернула забагато перенаправлень для фото.");
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Meta не дозволила завантажити фото (${response.status}).`);

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/") || contentType === "image/svg+xml") {
      throw new Error("Вкладення не є підтримуваним зображенням.");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
      throw new Error("Фото завелике. Максимальний розмір — 20 МБ.");
    }

    if (!response.body) throw new Error("Meta повернула порожнє фото.");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_MEDIA_BYTES) {
        await response.body.cancel().catch(() => {});
        throw new Error("Фото завелике. Максимальний розмір — 20 МБ.");
      }
      chunks.push(chunk);
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType,
    };
  }
  throw new Error("Не вдалося отримати фото з Meta.");
}

export function registerMetaRoutes(app) {
  app.get("/api/meta/auth/status", (req, res) => {
    const required = isMetaAuthenticationRequired();
    return res.json({
      required,
      authenticated: !required || hasValidMetaSession(req),
    });
  });

  app.post("/api/meta/auth/login", setMetaSession);

  app.post("/api/meta/auth/logout", (req, res) => {
    if (isMetaAuthenticationRequired() && !isAllowedOrigin(req)) {
      return res.status(403).json({ error: "Вихід дозволений лише з домену Business Chat." });
    }
    clearMetaSession(res);
    return res.json({ authenticated: false });
  });

  app.use("/api/meta", requireMetaApiAccess);

  app.get("/api/meta/status", async (req, res) => {
    const channels = {};
    for (const platform of Object.keys(platformConfig)) {
      channels[platform] = getPageInfo(platform);
    }
    res.json({ channels, mode: "manual-refresh" });
  });

  app.get("/api/meta/conversations", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const config = platformConfig[platform];
    if (!config) return res.status(400).json({ error: "Невідома платформа." });
    const token = getToken(platform);
    const pageInfo = getPageInfo(platform);
    if (!token || !pageInfo.pageIdConfigured) {
      return res.status(503).json({
        error: !token
          ? `Додайте ${config.tokenEnv} у локальний .env і перезапустіть сервер.`
          : "Додайте коректний META_PAGE_ID у локальний .env і перезапустіть сервер.",
      });
    }

    const after = String(req.query.after || "");
    if (after.length > 500) return res.status(400).json({ error: "Некоректний курсор сторінки." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);

    try {
      const params = {
        platform: config.graphPlatform,
        fields: platform === "instagram"
          ? "id,participants{id,name,username},updated_time"
          : `id,participants{id,name,username},updated_time,messages.limit(1){id,created_time,message,from,${getAttachmentFields(platform)}}`,
        limit,
        after,
      };
      const result = await graphRequest(`${encodeURIComponent(pageInfo.pageId)}/conversations`, params, token);
      const rows = result.data || [];
      const participantCounts = new Map();
      if (platform === "instagram") {
        rows.forEach((conversation) => {
          (conversation.participants?.data || []).forEach((participant) => {
            if (participant.id) {
              participantCounts.set(participant.id, (participantCounts.get(participant.id) || 0) + 1);
            }
          });
        });
      }
      const businessParticipantId = platform === "messenger"
        ? pageInfo.pageId
        : [...participantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const conversations = rows.map((conversation) => {
        const participants = conversation.participants?.data || [];
        const customer = participants.find((participant) => participant.id !== businessParticipantId)
          || participants[0]
          || {};
        if (conversation.id && customer.id) {
          cacheConversationRecipient(platform, conversation.id, customer.id);
        }
        const latestMessage = conversation.messages?.data?.[0];
        const latestAttachments = latestMessage
          ? getMessageAttachments(latestMessage)
          : [];
        const hasPhoto = latestAttachments.some((attachment) => Boolean(getMediaUrl(attachment)));
        const preview = latestMessage?.message?.trim()
          || (hasPhoto ? "Надіслано фото" : latestAttachments.length ? "Нове вкладення" : "");
        return {
          id: conversation.id,
          customerId: customer.id || null,
          customerName: customer.name || customer.username || customer.id || "Клієнт",
          customerUsername: customer.username || null,
          preview,
          updatedTime: conversation.updated_time || null,
        };
      });
      res.json({
        conversations,
        pageId: pageInfo.pageId,
        nextCursor: result.paging?.cursors?.after || null,
        hasMore: Boolean(result.paging?.next),
      });
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Не вдалося отримати чати з Meta." });
    }
  });

  app.get("/api/meta/conversations/:conversationId/messages", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const config = platformConfig[platform];
    if (!config) return res.status(400).json({ error: "Невідома платформа." });
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(req.params.conversationId)) {
      return res.status(400).json({ error: "Некоректний ідентифікатор чату." });
    }
    const after = String(req.query.after || "");
    if (after.length > 500) return res.status(400).json({ error: "Некоректний курсор повідомлень." });
    const customerId = platform === "instagram"
      ? getConversationRecipient(platform, req.params.conversationId)
      : null;
    if (platform === "instagram" && !customerId) {
      return res.status(409).json({ error: "Оновіть список чатів і знову відкрийте цей діалог." });
    }
    const token = getToken(platform);
    if (!token) {
      return res.status(503).json({
        error: `Додайте ${config.tokenEnv} у локальний .env і перезапустіть сервер.`,
      });
    }

    try {
      const result = await graphRequest(
        `${encodeURIComponent(req.params.conversationId)}/messages`,
        {
          fields: `id,created_time,from,message,${getAttachmentFields(platform)}`,
          limit: 20,
          after,
        },
        token,
      );
      const metaMessages = (result.data || []).map((message) => mapMessage(message, platform)).reverse();
      res.json({
        messages: metaMessages,
        hasMore: Boolean(result.paging?.next),
        nextCursor: result.paging?.cursors?.after || null,
      });
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Не вдалося завантажити повідомлення." });
    }
  });

  app.get("/api/meta/conversations/:conversationId/photos", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const config = platformConfig[platform];
    if (!config) return res.status(400).json({ error: "Невідома платформа." });
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(req.params.conversationId)) {
      return res.status(400).json({ error: "Некоректний ідентифікатор чату." });
    }
    const after = String(req.query.after || "");
    if (after.length > 500) return res.status(400).json({ error: "Некоректний курсор фото." });
    const customerId = getConversationRecipient(platform, req.params.conversationId);
    if (!customerId) {
      return res.status(409).json({ error: "Оновіть список чатів і знову відкрийте цей діалог." });
    }
    const token = getToken(platform);
    if (!token) {
      return res.status(503).json({
        error: `Додайте ${config.tokenEnv} у локальний .env і перезапустіть сервер.`,
      });
    }

    try {
      const result = await graphRequest(
        `${encodeURIComponent(req.params.conversationId)}/messages`,
        {
          fields: `id,created_time,from,${getAttachmentFields(platform)}`,
          limit: 20,
          after,
        },
        token,
      );
      const photos = (result.data || []).flatMap((message) => {
        if (message.from?.id !== customerId) return [];
        return mapMessage(message, platform).attachments
          .filter((attachment) => attachment.isImage)
          .map((attachment) => ({
            ...attachment,
            messageId: message.id,
            createdTime: message.created_time || null,
          }));
      });
      res.json({
        photos,
        hasMore: Boolean(result.paging?.next),
        nextCursor: result.paging?.cursors?.after || null,
      });
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Не вдалося отримати фото з діалогу." });
    }
  });

  app.post("/api/meta/conversations/:conversationId/replies", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const config = platformConfig[platform];
    if (!config) return res.status(400).json({ error: "Невідома платформа." });
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(req.params.conversationId)) {
      return res.status(400).json({ error: "Некоректний ідентифікатор чату." });
    }
    if (typeof req.body?.text !== "string") {
      return res.status(400).json({ error: "Напишіть текст відповіді." });
    }
    const text = req.body.text.trim();
    if (!text) return res.status(400).json({ error: "Напишіть текст відповіді." });
    if (Buffer.byteLength(text, "utf8") > 1000) {
      return res.status(400).json({ error: "Повідомлення має бути не довшим за 1000 байтів UTF-8." });
    }
    const recipientId = getConversationRecipient(platform, req.params.conversationId);
    if (!recipientId) {
      return res.status(409).json({ error: "Оновіть список чатів і знову відкрийте цей діалог." });
    }
    const token = getToken(platform);
    const pageId = process.env.META_PAGE_ID?.trim() || "";
    if (!token || !/^\d+$/.test(pageId)) {
      return res.status(503).json({
        error: !token
          ? `Додайте ${config.tokenEnv} у локальний .env і перезапустіть сервер.`
          : "Додайте коректний META_PAGE_ID у локальний .env і перезапустіть сервер.",
      });
    }

    try {
      const result = await graphRequest(
        `${encodeURIComponent(pageId)}/messages`,
        {},
        token,
        {
          method: "POST",
          body: {
            recipient: { id: recipientId },
            ...(platform === "messenger" ? { messaging_type: "RESPONSE" } : {}),
            message: { text },
          },
        },
      );
      res.json({ messageId: result.message_id || null });
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Meta не вдалося надіслати відповідь." });
    }
  });

  app.get("/api/meta/profiles/:userId/avatar", async (req, res) => {
    const platform = String(req.query.platform || "").toLowerCase();
    const config = platformConfig[platform];
    if (!config) return res.status(400).end();
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(req.params.userId)) return res.status(400).end();
    const token = getToken(platform);
    if (!token) return res.status(404).end();

    try {
      const url = await getProfilePhotoUrl(platform, req.params.userId, token);
      if (!url) return res.status(404).end();
      await sendMedia({ url, name: "profile-photo" }, res);
    } catch (error) {
      res.set("Cache-Control", "private, max-age=60");
      res.status(error.status || 404).end();
    }
  });

  app.get("/api/meta/media/:mediaId", async (req, res) => {
    const media = getMedia(req.params.mediaId);
    if (!media) {
      return res.status(404).json({ error: "Посилання на фото застаріло. Оновіть повідомлення та спробуйте ще раз." });
    }
    try {
      await sendMedia(media, res);
    } catch (error) {
      res.status(502).json({ error: error.message || "Не вдалося завантажити фото." });
    }
  });

  app.post("/api/meta/media", async (req, res) => {
    const mediaId = String(req.body?.mediaId || "");
    const media = getMedia(mediaId);
    if (!media) {
      return res.status(404).json({ error: "Посилання на фото застаріло. Оновіть повідомлення та спробуйте ще раз." });
    }

    try {
      await sendMedia(media, res);
    } catch (error) {
      res.status(502).json({ error: error.message || "Не вдалося завантажити фото." });
    }
  });
}
