import sharp from "sharp";

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const CHAT_MODEL = process.env.PERSONALIZE_CHAT_MODEL || "gpt-4o-mini";

// Розміри, які підтримує Image API; клієнт потім підганяє їх під A4.
const PRODUCTS = {
  cover: { size: "1024x1536" },
  back: { size: "1024x1536" },
  calendar: { size: "1536x1024" },
  stickers: { size: "1536x1024" },
};

const QUALITIES = new Set(["low", "medium", "high"]);

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);

const COMMON_RULES = `
GENERAL RULES
- Image 1 is the photograph of the real child. Preserve the child's identity: face shape, eyes, hair colour and style, age appearance, skin tone. Do NOT create a different child and do NOT change the age.
- Keep the child's face natural, friendly and clearly recognisable; polished, bright, high-quality digital illustration / retouched-photo look with rich saturated colours and soft glowing light.
- All visible text must be Ukrainian Cyrillic, spelled EXACTLY as given, with no extra, mirrored or invented letters. Do not add any other text, logos, watermarks or brand characters.
- No distorted hands, no extra fingers, no duplicate children.
`.trim();

function themeBlock({ theme, style, notes }) {
  const lines = [];
  if (theme) lines.push(`THEME / WORLD: ${theme}`);
  if (style) lines.push(`VISUAL STYLE: ${style}`);
  if (notes) lines.push(`EXTRA WISHES FROM THE CLIENT (follow them): ${notes}`);
  return lines.join("\n");
}

function referenceLine(hasReference) {
  return hasReference
    ? "Image 2 is the APPROVED FRONT COVER of this child's coloring book. Reuse exactly its world, colour palette, lighting, decorative style and props so everything looks like one matching set. Take only the style from it; the child's identity still comes from Image 1."
    : "";
}

export function buildPrompt(product, input, hasReference) {
  const { name, age, year } = input;
  const theme = themeBlock(input);
  const ref = referenceLine(hasReference);
  const ageLine = age ? `Below the name add a small ribbon/banner with the text "${age}".` : "";

  if (product === "cover") {
    return `
Create the FRONT COVER of a personalised children's coloring book. Vertical A4 portrait poster.

${COMMON_RULES}

LAYOUT (like a professional printed cover)
- Top: a huge glossy 3D bubble-letter title in two lines: "Моя" and "Розмальовка", with a few small themed decorations (snow caps, stars, leaves) on the letters, but NO frame, NO outline shape, NO cloud, NO banner or plate behind or around the title — the letters sit directly on the scene. Letters must be perfectly readable. EXCEPTION: if the client's extra wishes ask for no title / no text / no inscription, omit the title (and any text they excluded) and fill that space with the scene instead.
- Centre: the child from Image 1, large, occupying about 50-60% of the height, head and upper body clearly visible, naturally integrated into the scene with matching lighting. Keep the head fully inside the frame and away from the title.
- The child's name written exactly: "${name}" as beautiful large decorative lettering (elegant glossy calligraphic script with a soft golden glow and a thin darker outline, matching the theme colours) placed directly on the scene below the child. It must NOT be on a wooden board, plaque, sign, frame or ribbon — only the lettering itself with small themed decorations (stars, holly, flowers) around it. The name must be perfectly readable. ${ageLine}
- Surroundings: rich themed scene with friendly props and animals/characters from the theme, plus coloured pencils, paints or an open coloring book with line-art pages somewhere in the foreground.
- Keep 6% safe margin from every edge; nothing important should touch the borders.

${theme}
`.trim();
  }

  if (product === "back") {
    return `
Create the BACK COVER of a personalised children's coloring book. Vertical A4 portrait.

${COMMON_RULES}

${ref}

LAYOUT
- Same world, palette and style as the front cover, but a calmer composition WITHOUT the child's face and WITHOUT any title or text.
- A cozy decorative themed scene: props, characters/animals from the theme, an open coloring book and coloured pencils/paints, soft glow.
- The bottom-left corner (about 20% of the width and 14% of the height) must be a calm, simple, uncluttered area because a QR code will be placed there. Nothing busy or text-like in that corner.
- Keep 6% safe margin from every edge.

${theme}
`.trim();
  }

  if (product === "calendar") {
    return `
Create the ARTWORK for a personalised wall calendar poster for the year ${year}. Horizontal landscape orientation, aspect ratio 3:2.

${COMMON_RULES}

${ref}

LAYOUT (very important)
- The TOP 52% of the image holds the whole main scene: the child from Image 1 large (head and upper body, sitting or posed with a themed prop), themed characters/props around, in the same rich style as the approved cover.
- Next to the child (the opposite side from the child's face, in the upper area) write the child's name exactly: "${name}" as large beautiful decorative lettering in the SAME lettering style as the cover (glossy calligraphic script, warm glow, thin outline, themed decorations around it, no board or plaque unless the reference cover has one). Directly below the name write the year "${year}" in huge glossy 3D golden numerals with snow/sparkles, exactly these digits: ${year}.
- The BOTTOM 48% of the image must be a calm, simple, low-detail themed foreground (soft snow / garlands / glowing bokeh / pillows, a few gift boxes, branches or props peeking from the very bottom corners) with NO text and NO numbers. Software will place 12 month cards over it, so do NOT draw any calendar, grid, month names, weekday names or other date numbers anywhere. The child's body may simply continue behind where the cards will be.

${theme}
`.trim();
  }

  return `
Create a printable personalised STICKER SHEET of one child. Horizontal landscape sheet, aspect ratio 3:2, plain clean white background.

${COMMON_RULES}

${ref}

LAYOUT
- The sheet is split into TWO equal halves (left and right), each half a portrait A5 page. Leave a clear empty white vertical gutter (about 4% of the width) exactly in the centre; do not draw the centre line itself (it is added by software).
- Each half contains 6 stickers in 2 columns and 3 rows (12 stickers in total), evenly spaced, nothing touching the sheet edges or the central gutter (5% margin).
- EVERY sticker is a die-cut portrait of the SAME child from Image 1: different cheerful expressions and poses (head-and-shoulders or half-body), and the CLOTHING CHANGES from sticker to sticker according to the theme (cosy sweater, costume, festive outfit, hat, scarf, antlers, party dress, etc.). Some stickers hold one small themed prop (gift, mug, toy, star, plush). The face must stay clearly the same child.
- Do NOT add any standalone stickers without the child (no separate hearts, stars, gifts, snowflakes, animals or icons). Only the child stickers.
- Every sticker has a thick clean white border following the outline with a thin grey dashed cut line along the outer edge and a very subtle soft shadow.
- No text at all. No background inside the sheet other than white.

${theme}
`.trim();
}

async function readPhoto(file) {
  return sharp(file.buffer)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export function registerPersonalize(app, upload) {
  const files = upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "reference", maxCount: 1 },
  ]);

  app.post("/api/personalize/generate", files, async (req, res) => {
    const started = Date.now();
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY не налаштований на сервері." });
      }

      const product = clean(req.body?.product, 20);
      if (!PRODUCTS[product]) {
        return res.status(400).json({ error: "Невідомий тип продукту." });
      }

      const photoFile = req.files?.photo?.[0];
      if (!photoFile) {
        return res.status(400).json({ error: "Не було завантажено фото дитини." });
      }

      const name = clean(req.body?.name, 40);
      if ((product === "cover" || product === "calendar") && !name) {
        return res.status(400).json({ error: "Вкажіть ім’я дитини." });
      }

      const input = {
        name,
        age: clean(req.body?.age, 30),
        year: clean(req.body?.year, 4).replace(/\D/g, "") || String(new Date().getFullYear() + 1),
        theme: clean(req.body?.theme, 300),
        style: clean(req.body?.style, 300),
        notes: clean(req.body?.notes, 800),
      };
      const quality = QUALITIES.has(req.body?.quality) ? req.body.quality : "medium";

      let photo;
      let reference = null;
      try {
        photo = await readPhoto(photoFile);
        const referenceFile = req.files?.reference?.[0];
        if (referenceFile) reference = await readPhoto(referenceFile);
      } catch {
        return res.status(400).json({ error: "Не вдалося прочитати зображення. Використайте JPG, PNG або WebP." });
      }

      const prompt = buildPrompt(product, input, Boolean(reference));

      const form = new FormData();
      form.append("model", IMAGE_MODEL);
      if (reference) {
        form.append("image[]", new Blob([photo], { type: "image/jpeg" }), "child.jpg");
        form.append("image[]", new Blob([reference], { type: "image/jpeg" }), "style-reference.jpg");
      } else {
        form.append("image", new Blob([photo], { type: "image/jpeg" }), "child.jpg");
      }
      form.append("prompt", prompt);
      form.append("size", PRODUCTS[product].size);
      form.append("quality", quality);
      form.append("output_format", "png");

      console.log(`✨ Персоналізація: ${product} · ${name || "-"} · ${quality}${reference ? " · зі стилем обкладинки" : ""}`);

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(502).json({ error: "OpenAI повернув некоректну відповідь." });
      }

      if (!response.ok) {
        console.error("❌ OpenAI:", JSON.stringify(data?.error || data));
        return res.status(response.status).json({
          error: data?.error?.message || "Помилка OpenAI Image API.",
        });
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) {
        return res.status(502).json({ error: "OpenAI не повернув зображення." });
      }

      return res.json({
        success: true,
        product,
        image: `data:image/png;base64,${b64}`,
        elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      });
    } catch (error) {
      console.error("💥 Personalize error:", error);
      return res.status(500).json({ error: error?.message || "Внутрішня помилка сервера." });
    }
  });

  app.post("/api/personalize/chat", async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY не налаштований на сервері." });
      }

      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages = rawMessages
        .slice(-10)
        .map((m) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          content: clean(m?.text, 1000),
        }))
        .filter((m) => m.content);

      if (!messages.length) {
        return res.status(400).json({ error: "Порожнє повідомлення." });
      }

      const brief = req.body?.brief || {};
      const system = `
Ти — дружній помічник дизайнера персоналізованих дитячих розмальовок, календариків і наклейок з фото дитини.
Відповідай українською, коротко (до 3 речень). Допомагай обрати тему, стиль, деталі, кольори, що додати чи змінити.
Контекст проєкту: ім'я "${clean(brief.name, 40)}", вік "${clean(brief.age, 30)}", тема "${clean(brief.theme, 300)}", стиль "${clean(brief.style, 300)}", побажання "${clean(brief.notes, 500)}".
Поверни ТІЛЬКИ JSON: {"reply": "...", "suggestions": ["...", "..."]}.
"suggestions" — від 3 до 5 коротких (до 10 слів) конкретних побажань до зображення англійською мовою, готових для вставки в промпт генерації (наприклад "add a fluffy white kitten next to the child").
`.trim();

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          response_format: { type: "json_object" },
          temperature: 0.7,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error?.message || "Помилка чату OpenAI.",
        });
      }

      let parsed = {};
      try {
        parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
      } catch {
        parsed = {};
      }

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s) => clean(s, 120)).filter(Boolean).slice(0, 5)
        : [];

      return res.json({
        reply: clean(parsed.reply, 800) || "Розкажіть, який настрій і деталі хочете побачити.",
        suggestions,
      });
    } catch (error) {
      console.error("💥 Personalize chat error:", error);
      return res.status(500).json({ error: error?.message || "Внутрішня помилка сервера." });
    }
  });
}
