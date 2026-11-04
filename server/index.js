import express from "express";
import process from "node:process";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { registerAiChat } from "./aichat.js";

// ============================================================
// ВИПРАВЛЕННЯ ШЛЯХУ ДО .ENV
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Вказуємо шукати .env на рівень вище (у кореневій папці проєкту)
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// НАЛАШТУВАННЯ
// ============================================================

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

// A4-подібний вертикальний формат.
const OUTPUT_SIZE = "1024x1536";

// Максимальний розмір завантаженого фото — 20 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(express.json({ limit: "2mb" }));

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "AI Coloring API працює (Optimized LOW Quality, 800px)",
    model: OPENAI_IMAGE_MODEL,
    size: OUTPUT_SIZE,
  });
});

async function getUsdUahRate() {
  const configuredRate = Number(process.env.USD_TO_UAH);
  if (process.env.USD_TO_UAH?.trim()) {
    if (!Number.isFinite(configuredRate) || configuredRate <= 0) {
      throw new Error("USD_TO_UAH має бути додатним числом.");
    }
    return configuredRate;
  }

  const response = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json");
  if (!response.ok) throw new Error(`Не вдалося отримати курс НБУ (${response.status}).`);
  const rates = await response.json();
  const rate = rates?.[0]?.rate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("НБУ повернув некоректний курс USD/UAH.");
  return rate;
}

app.get("/api/coloring/usage", async (req, res) => {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return res.json({
      available: false,
      reason: "Додайте OPENAI_ADMIN_KEY у .env, щоб бачити фактичні витрати OpenAI.",
      tokenUsageAvailable: false,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const todayStart = Math.floor(Date.now() / 86400000) * 86400;
  const usageUrl = new URL("https://api.openai.com/v1/organization/usage/images");
  usageUrl.searchParams.set("start_time", String(todayStart));
  usageUrl.searchParams.set("end_time", String(now));
  usageUrl.searchParams.set("bucket_width", "1d");
  usageUrl.searchParams.append("group_by[]", "model");
  usageUrl.searchParams.append("models[]", OPENAI_IMAGE_MODEL);
  usageUrl.searchParams.set("limit", "1");

  const costsUrl = new URL("https://api.openai.com/v1/organization/costs");
  costsUrl.searchParams.set("start_time", String(todayStart));
  costsUrl.searchParams.set("end_time", String(now));
  costsUrl.searchParams.set("bucket_width", "1d");
  costsUrl.searchParams.append("group_by[]", "line_item");

  const projectId = process.env.OPENAI_PROJECT_ID?.trim();
  if (projectId) {
    usageUrl.searchParams.append("project_ids[]", projectId);
    costsUrl.searchParams.append("project_ids[]", projectId);
  }

  try {
    const headers = { Authorization: `Bearer ${adminKey}` };
    const [usageResponse, costsResponse, usdToUah] = await Promise.all([
      fetch(usageUrl, { headers }),
      fetch(costsUrl, { headers }),
      getUsdUahRate(),
    ]);

    const [usageData, costsData] = await Promise.all([
      usageResponse.json(),
      costsResponse.json(),
    ]);

    if (!usageResponse.ok || !costsResponse.ok) {
      const error = usageData?.error?.message || costsData?.error?.message;
      return res.json({
        available: false,
        reason: error || "OpenAI не дозволив прочитати usage/costs. Перевірте права Admin API key.",
        tokenUsageAvailable: false,
      });
    }

    const imageResults = (usageData.data || []).flatMap((bucket) => bucket.results || []);
    const images = imageResults.reduce((total, result) => total + (Number(result.images) || 0), 0);
    const costResults = (costsData.data || []).flatMap((bucket) => bucket.results || []);
    const imageCosts = costResults.filter((result) => {
      const lineItem = String(result.line_item || "").toLowerCase();
      return lineItem.includes("image") || lineItem.includes(OPENAI_IMAGE_MODEL.toLowerCase());
    });
    const spendUsd = imageCosts.length ? imageCosts.reduce((total, result) => {
      const amount = Number(result.amount?.value);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0) : null;

    return res.json({
      available: true,
      model: OPENAI_IMAGE_MODEL,
      period: "today",
      images,
      spendUsd,
      spendUah: Number.isFinite(spendUsd) ? spendUsd * usdToUah : null,
      averagePerImageUsd: images > 0 && Number.isFinite(spendUsd) ? spendUsd / images : null,
      averagePerImageUah: images > 0 && Number.isFinite(spendUsd) ? (spendUsd / images) * usdToUah : null,
      usdToUah,
      currencyRateSource: process.env.USD_TO_UAH?.trim() ? "env" : "NBU",
      tokenUsageAvailable: false,
      tokenUsageNote: "OpenAI Images Usage API does not report token counts for image requests.",
      projectScoped: Boolean(projectId),
    });
  } catch (error) {
    console.error("Не вдалося отримати OpenAI usage/costs:", error);
    return res.json({
      available: false,
      reason: error.message || "Не вдалося отримати звіт OpenAI.",
      tokenUsageAvailable: false,
    });
  }
});

// ============================================================
// PROMPT
// ============================================================

function buildColoringPrompt({ lineWidth = "medium", style = "children", faceBoost = false } = {}) {
  const faceBlock = faceBoost
    ? `

==============================
FACE LIKENESS - TOP PRIORITY
==============================

This is a re-generation because the previous result did not look enough like the real person.
Faces MUST be an accurate line-art copy of the faces in the photograph:

- trace the real face shape, jawline and chin exactly
- keep the exact eye shape, eye size, eye spacing and eyelids
- keep the exact eyebrow shape and position
- keep the exact nose shape and mouth shape, lip fullness and smile
- keep the real cheeks, ears, forehead and hairline
- keep the real facial expression and the real age
- hair must follow the real hairstyle, parting and length strand direction

Do NOT make cartoon faces. Do NOT enlarge the eyes. Do NOT make the face rounder, younger or "cuter".
Do NOT beautify or idealise. Draw the face as a faithful, realistic but clean line drawing.
For faces use slightly more detailed thin lines than for the rest of the scene.
Every person must be clearly recognisable as the same real person from the photograph.
`
    : "";

  return `
EDIT THE PROVIDED PHOTOGRAPH INTO A PROFESSIONAL A4 CHILDREN'S COLORING BOOK PAGE.

The uploaded photograph is the PRIMARY VISUAL REFERENCE.
Do NOT create a completely new random scene.
Do NOT replace the people with unrelated fictional people.

The final image must look like a professionally illustrated printable coloring-book page based on the uploaded photograph.

==============================
1. PRESERVE THE MAIN PERSON
==============================

Preserve the person's recognizable appearance from the photograph:

- facial structure
- approximate facial proportions
- hairstyle
- hair length
- hair shape
- age appearance
- body proportions
- pose
- posture
- head direction
- arm positions
- hand positions
- legs and feet positions
- clothing
- shoes
- important accessories

If multiple people are visible, preserve the correct number of people and their relative positions.

Do NOT:
- change the person's identity
- invent a different person
- change the age
- dramatically change the face
- change the hairstyle
- change the body proportions
- move people into completely different poses
- add extra people
- remove important people

The people should remain clearly recognizable as the people from the input photograph.

==============================
2. TRANSFORM THE ENTIRE SCENE
==============================

Convert the complete photograph into a polished black-and-white coloring-book illustration.

Do NOT simply draw a crude outline around the people.

Instead, transform:
- people
- clothing
- furniture
- architecture
- walls
- doors
- windows
- plants
- decorations
- toys
- important objects
- background environment

into clean illustrated line art.

The background should remain visually related to the original photograph while becoming a beautiful coloring-book illustration.

==============================
3. PROFESSIONAL COLORING BOOK STYLE
==============================

The result should resemble a professionally printed children's coloring book.

Style characteristics:

- clean black outlines
- white paper background
- elegant hand-drawn line art
- consistent line weight
- clear closed shapes where appropriate
- enough detail for coloring
- pleasant readable composition
- attractive illustrated background
- carefully simplified details
- clean printable artwork
- polished children's illustration

Line quality:
${lineWidth === "thin" ? "thin and delicate black outlines" : "clean medium-weight black outlines"}

The illustration should have enough detail to feel rich and premium, similar to a professionally designed children's coloring page.

==============================
4. IMPORTANT: NO PHOTOREALISM
==============================

The output must be a COLORING PAGE.

Do NOT use:
- color
- gray shading
- gradients
- realistic shadows
- photographic textures
- skin tones
- painterly rendering
- 3D rendering
- realistic lighting
- watercolor
- oil painting
- anime rendering
- comic-book coloring

Use only:
BLACK LINE ART ON WHITE.

==============================
5. CHILD-FRIENDLY DETAIL
==============================

Simplify tiny photographic details that would be unpleasant or impossible for a child to color.

Turn them into clean, readable shapes.

Keep:
- recognizable facial features
- clothing details
- important objects
- meaningful background elements
- major architectural shapes
- decorative elements

Avoid:
- noisy texture
- excessive tiny random lines
- messy hatching
- black filled areas
- dense dark shadows

==============================
6. COMPOSITION
==============================

Create a vertical printable composition.

A4 portrait orientation.

Keep the main person as the visual focus.

Do not unnecessarily crop the person.

Do not create an unrelated new composition.

The output should feel like:

ORIGINAL PHOTO
        ↓
PROFESSIONAL COLORING BOOK ILLUSTRATION

NOT:

ORIGINAL PHOTO
        ↓
COMPLETELY DIFFERENT GENERATED CHARACTER

==============================
7. FACE QUALITY
==============================

Faces are extremely important.

Keep faces:
- friendly
- natural
- recognizable
- proportionally correct
- cleanly outlined

Use simple but expressive coloring-book facial features.

Do NOT exaggerate eyes.
Do NOT create distorted mouths.
Do NOT create strange noses.
Do NOT create duplicated facial features.
Do NOT create deformed hands.

==============================
8. FINAL PRINT QUALITY
==============================

Pure white background.

Black line art.

Clean contours.

No color.

No gray.

No gradients.

No visible AI artifacts.

No text unless text is clearly present in the original photograph and is an important part of the scene.

The final result must be suitable for printing as an A4 children's coloring page.

Create a beautiful, polished, professional coloring-book illustration based on the supplied photograph.
${faceBlock}`;
}

// ============================================================
// IMAGE EDIT
// ============================================================

app.post("/api/coloring", upload.single("image"), async (req, res) => {
  const requestStarted = Date.now();

  try {
    console.log("");
    console.log("======================================");
    console.log("🎨 НОВА РОЗМАЛЬОВКА (ОПТИМІЗОВАНО 800px)");
    console.log("======================================");

    // --------------------------------------------------------
    // ДИНАМІЧНЕ ЧИТАННЯ КЛЮЧА
    // --------------------------------------------------------
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY відсутній у .env");

      return res.status(500).json({
        error: "OPENAI_API_KEY не налаштований на сервері.",
      });
    }

    // --------------------------------------------------------
    // Перевірка файлу
    // --------------------------------------------------------

    if (!req.file) {
      console.error("❌ Файл не отримано");

      return res.status(400).json({
        error: "Не було завантажено фотографію.",
      });
    }

    console.log(`📷 Початковий файл: ${req.file.originalname}`);
    console.log(`📦 Початковий розмір: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // --------------------------------------------------------
    // ЗМЕНШЕННЯ ЗОБРАЖЕННЯ ЧЕРЕЗ SHARP (Збереження пропорцій)
    // --------------------------------------------------------

    // Режим «краща схожість» вмикається лише для окремого фото: більша вхідна картинка й medium.
    const faceBoost = req.body?.faceBoost === "1";
    const inputSide = faceBoost ? 1536 : 800;

    console.log(`✂️ Зменшуємо фото через Sharp (${inputSide}px)${faceBoost ? " · КРАЩА СХОЖІСТЬ" : " для економії токенів"}...`);

    let pipeline = sharp(req.file.buffer);
    if (faceBoost) pipeline = pipeline.rotate();

    const resizedBuffer = await pipeline
      .resize({
        width: inputSide,
        height: inputSide,
        fit: "inside", // Зберігає пропорції без обрізання та спотворень
        withoutEnlargement: true, // Не збільшує, якщо фото менше за ліміт
      })
      .jpeg({ quality: faceBoost ? 92 : 85 }) // Конвертуємо у легкий JPEG для економії
      .toBuffer();

    console.log(`📉 Новий розмір: ${(resizedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🧠 Model: ${OPENAI_IMAGE_MODEL}`);
    console.log(`📄 Output: ${OUTPUT_SIZE}`);

    // --------------------------------------------------------
    // Налаштування з frontend
    // --------------------------------------------------------

    const lineWidth = req.body?.lineWidth || "medium";
    const style = req.body?.style || "children";

    const basePrompt = buildColoringPrompt({
      lineWidth,
      style,
      faceBoost,
    });
    const customPrompt = typeof req.body?.prompt === "string"
      ? req.body.prompt.trim().slice(0, 2000)
      : "";
    let optionPrompts = [];
    if (typeof req.body?.options === "string" && req.body.options.length > 0) {
      try {
        const parsedOptions = JSON.parse(req.body.options);
        if (!Array.isArray(parsedOptions) || parsedOptions.some((option) => typeof option !== "string")) {
          return res.status(400).json({ error: "Некоректний список додаткових опцій." });
        }
        optionPrompts = parsedOptions.slice(0, 10).map((option) => option.slice(0, 500));
      } catch {
        return res.status(400).json({ error: "Не вдалося прочитати додаткові опції." });
      }
    }
    const prompt = customPrompt
      ? `${basePrompt}\n\nADDITIONAL USER INSTRUCTIONS:\n${customPrompt}`
      : basePrompt;
    const completePrompt = optionPrompts.length
      ? `${prompt}\n\nADDITIONAL COLORING OPTIONS:\n- ${optionPrompts.join("\n- ")}`
      : prompt;

    console.log("🖍️ Надсилаємо фотографію на OpenAI (Якість: LOW)...");

    // --------------------------------------------------------
    // FormData
    // --------------------------------------------------------

    const formData = new FormData();

    formData.append("model", OPENAI_IMAGE_MODEL);

    formData.append(
      "image",
      new Blob([resizedBuffer], {
        type: "image/jpeg",
      }),
      req.file.originalname.replace(/\.[^/.]+$/, ".jpg")
    );

    formData.append("prompt", completePrompt);

    // A4 portrait
    formData.append("size", OUTPUT_SIZE);

    // 🔥 ГОЛОВНА ЕКОНОМІЯ: Змінено з "high" на "low"
    formData.append("quality", faceBoost ? "medium" : "low");

    formData.append("output_format", "png");

    // --------------------------------------------------------
    // OPENAI
    // --------------------------------------------------------

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      }
    );

    const responseText = await openaiResponse.text();

    let openaiData;

    try {
      openaiData = JSON.parse(responseText);
    } catch {
      console.error("❌ OpenAI повернув не JSON:");
      console.error(responseText);

      return res.status(502).json({
        error: "OpenAI повернув некоректну відповідь.",
        details: responseText.slice(0, 1000),
      });
    }

    // --------------------------------------------------------
    // OPENAI ERROR
    // --------------------------------------------------------

    if (!openaiResponse.ok) {
      console.error("❌ OpenAI ERROR:");
      console.error(JSON.stringify(openaiData, null, 2));

      return res.status(openaiResponse.status).json({
        error:
          openaiData?.error?.message ||
          "Помилка OpenAI Image API.",
        details: openaiData?.error || openaiData,
      });
    }

    // --------------------------------------------------------
    // RESULT
    // --------------------------------------------------------

    const generatedImage = openaiData?.data?.[0];

    if (!generatedImage) {
      console.error("❌ OpenAI не повернув зображення");
      console.error(JSON.stringify(openaiData, null, 2));

      return res.status(502).json({
        error: "OpenAI не повернув готове зображення.",
      });
    }

    if (!generatedImage.b64_json) {
      console.error("❌ У відповіді немає b64_json");
      console.error(JSON.stringify(generatedImage, null, 2));

      return res.status(502).json({
        error: "OpenAI повернув відповідь без image data.",
      });
    }

    const imageDataUrl = `data:image/png;base64,${generatedImage.b64_json}`;

    const elapsed = ((Date.now() - requestStarted) / 1000).toFixed(1);

    console.log("");
    console.log("✅ РОЗМАЛЬОВКА ГОТОВА!");
    console.log(`⏱️ Час: ${elapsed} сек.`);
    console.log("======================================");
    console.log("");

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.json({
      success: true,
      image: imageDataUrl,
      model: OPENAI_IMAGE_MODEL,
      size: OUTPUT_SIZE,
      format: "png",
      quality: faceBoost ? "medium" : "low",
      tokenUsage: openaiData.usage
        ? {
            inputTokens: openaiData.usage.input_tokens ?? null,
            outputTokens: openaiData.usage.output_tokens ?? null,
            totalTokens: openaiData.usage.total_tokens ?? null,
          }
        : null,
      elapsedSeconds: Number(elapsed),
    });
  } catch (error) {
    console.error("");
    console.error("======================================");
    console.error("💥 SERVER ERROR");
    console.error("======================================");
    console.error(error);
    console.error("======================================");
    console.error("");

    return res.status(500).json({
      error: error?.message || "Внутрішня помилка сервера.",
    });
  }
});

// Старий конвеєр (server/legacy/personalize.js) вимкнено; щоб повернути — імпортуйте registerPersonalize.
registerAiChat(app, upload);

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "Маршрут API не знайдено.",
  });
});

app.use(express.static(path.join(__dirname, "../dist")));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  res.sendFile(path.join(__dirname, "../dist/index.html"), (error) => {
    if (error) next(error);
  });
});

// ============================================================
// MULTER ERROR
// ============================================================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Фотографія занадто велика. Максимум 20 MB.",
      });
    }

    return res.status(400).json({
      error: `Помилка завантаження файлу: ${error.message}`,
    });
  }

  next(error);
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
  console.error("💥 Unhandled server error:", error);

  res.status(500).json({
    error: error?.message || "Внутрішня помилка сервера.",
  });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {
  console.log("");
  console.log("======================================");
  console.log("🎨 NEO COLORING AI SERVER (CHEAP MODE)");
  console.log("======================================");
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`❤️ Health: http://localhost:${PORT}/api/health`);
  console.log(`🧠 Model: ${OPENAI_IMAGE_MODEL}`);
  console.log(`📄 Output: ${OUTPUT_SIZE} portrait (low quality)`);
  console.log("======================================");
  console.log("");
});