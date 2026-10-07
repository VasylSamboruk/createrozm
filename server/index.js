import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

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

const OPENAI_IMAGE_MODEL = "gpt-image-2";

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

// ============================================================
// PROMPT
// ============================================================

function buildColoringPrompt({ lineWidth = "medium", style = "children" } = {}) {
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
`;
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

    console.log("✂️ Зменшуємо фото через Sharp (800px) для економії токенів...");

    const resizedBuffer = await sharp(req.file.buffer)
      .resize({
        width: 800,
        height: 800,
        fit: "inside", // Зберігає пропорції без обрізання та спотворень
        withoutEnlargement: true, // Не збільшує, якщо фото менше 800px
      })
      .jpeg({ quality: 85 }) // Конвертуємо у легкий JPEG для економії
      .toBuffer();

    console.log(`📉 Новий розмір: ${(resizedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🧠 Model: ${OPENAI_IMAGE_MODEL}`);
    console.log(`📄 Output: ${OUTPUT_SIZE}`);

    // --------------------------------------------------------
    // Налаштування з frontend
    // --------------------------------------------------------

    const lineWidth = req.body?.lineWidth || "medium";
    const style = req.body?.style || "children";

    const prompt = buildColoringPrompt({
      lineWidth,
      style,
    });

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

    formData.append("prompt", prompt);

    // A4 portrait
    formData.append("size", OUTPUT_SIZE);

    // 🔥 ГОЛОВНА ЕКОНОМІЯ: Змінено з "high" на "low"
    formData.append("quality", "low");

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