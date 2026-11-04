export const SIZES = {
  cover: [2480, 3508],
  back: [2480, 3508],
  calendar: [2480, 1754],
  stickers: [3508, 2480]
};

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// Кожна палітра: заголовок місяця, рамка, вихідні, бант.
export const PALETTES = {
  winter: { title: '#a4161a', border: '#d4a73a', weekend: '#c1121f', bow: '#c1121f', paper: '#fff6e0' },
  rainbow: { title: '#1d4ed8', border: '#e0a526', weekend: '#c1121f', bow: '#2563eb', paper: '#fffaf0' },
  pink: { title: '#be185d', border: '#e8a2c0', weekend: '#e11d48', bow: '#ec4899', paper: '#fff5f8' },
  autumn: { title: '#9a3412', border: '#c98a2b', weekend: '#b91c1c', bow: '#c2410c', paper: '#fff3df' }
};

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
const TITLE_FONT = 'italic 700 46px Georgia, "Palatino Linotype", "Times New Roman", serif';

export const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Не вдалося завантажити зображення.'));
  image.src = src;
});

const createCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не вдалося підготувати полотно.');
  context.imageSmoothingQuality = 'high';
  return { canvas, context };
};

const drawCover = (context, image, width, height) => {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
};

const toJpeg = (canvas) => canvas.toDataURL('image/jpeg', 0.95);

export async function fitToProduct(src, product) {
  const [width, height] = SIZES[product];
  const image = await loadImage(src);
  const { canvas, context } = createCanvas(width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  drawCover(context, image, width, height);
  if (product === 'stickers') drawStickerDivider(context, width, height);
  return toJpeg(canvas);
}
// Аркуш наклейок ділиться навпіл (2 × A5) пунктирною лінією посередині.
function drawStickerDivider(context, width, height) {
  context.save();
  context.strokeStyle = 'rgba(90, 90, 90, 0.85)';
  context.lineWidth = 4;
  context.setLineDash([26, 18]);
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.stroke();
  context.restore();
}

const roundRect = (context, x, y, w, h, r) => {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
};

function drawBow(context, cx, cy, size, color) {
  context.save();
  context.translate(cx, cy);
  context.fillStyle = color;
  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  context.lineWidth = 2;
  [-1, 1].forEach((side) => {
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(side * size * 0.5, -size * 0.7, side * size * 1.25, -size * 0.55, side * size * 1.1, size * 0.1);
    context.bezierCurveTo(side * size * 1.05, size * 0.6, side * size * 0.4, size * 0.4, 0, 0);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(side * size * 0.45, size * 0.95);
    context.lineTo(side * size * 0.12, size * 0.8);
    context.lineTo(side * size * 0.02, size * 1.05);
    context.closePath();
    context.fill();
    context.stroke();
  });
  context.beginPath();
  context.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function drawSnowflake(context, cx, cy, size) {
  context.save();
  context.translate(cx, cy);
  context.strokeStyle = '#ffffff';
  context.shadowColor = 'rgba(70, 120, 180, 0.7)';
  context.shadowBlur = 6;
  context.lineWidth = 4;
  context.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    context.rotate(Math.PI / 3);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -size);
    context.moveTo(0, -size * 0.55);
    context.lineTo(size * 0.28, -size * 0.8);
    context.moveTo(0, -size * 0.55);
    context.lineTo(-size * 0.28, -size * 0.8);
    context.stroke();
  }
  context.restore();
}

function drawMonth(context, { x, y, w, h, month, year, theme }) {
  const headerH = 84;
  const weekdayH = 40;
  const pad = 14;

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 16;
  context.shadowOffsetY = 5;
  context.fillStyle = theme.paper;
  roundRect(context, x, y, w, h, 26);
  context.fill();
  context.restore();

  context.strokeStyle = theme.border;
  context.lineWidth = 6;
  roundRect(context, x, y, w, h, 26);
  context.stroke();

  context.fillStyle = theme.title;
  context.font = TITLE_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(MONTHS[month], x + w / 2, y + headerH / 2 + 18);

  const colW = (w - pad * 2) / 7;
  context.font = `bold 23px ${FONT}`;
  WEEKDAYS.forEach((day, index) => {
    context.fillStyle = index >= 5 ? theme.weekend : '#1f2937';
    context.fillText(day, x + pad + colW * index + colW / 2, y + headerH + weekdayH / 2 - 6);
  });

  const rowH = (h - headerH - weekdayH - pad) / 6;
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  context.font = `700 29px ${FONT}`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = offset + day - 1;
    const col = cell % 7;
    const row = Math.floor(cell / 7);
    context.fillStyle = col >= 5 ? theme.weekend : '#111827';
    context.fillText(String(day), x + pad + colW * col + colW / 2, y + headerH + weekdayH + rowH * row + rowH / 2 - 4);
  }

  if (month % 2 === 0) drawBow(context, x + w / 2, y - 2, 30, theme.bow);
  else drawSnowflake(context, x + w / 2, y - 4, 28);
}

// Сцена, ім'я та рік малює AI; сітку місяців і дати — код (точні дати).
export async function composeCalendar(sceneSrc, { year, palette = 'winter' }) {
  const [width, height] = SIZES.calendar;
  const scene = await loadImage(sceneSrc);
  const { canvas, context } = createCanvas(width, height);
  drawCover(context, scene, width, height);

  const theme = PALETTES[palette] || PALETTES.winter;
  const margin = 40;
  const gap = 16;
  const gridTop = Math.round(height * 0.535);
  const cardW = (width - margin * 2 - gap * 5) / 6;
  const cardH = (height - 40 - gridTop - gap) / 2;

  for (let month = 0; month < 12; month += 1) {
    const col = month % 6;
    const row = Math.floor(month / 6);
    drawMonth(context, {
      x: margin + col * (cardW + gap),
      y: gridTop + row * (cardH + gap),
      w: cardW,
      h: cardH,
      month,
      year,
      theme
    });
  }

  return toJpeg(canvas);
}
