import { A4_HEIGHT, A4_WIDTH } from './prepareA4Image';

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося відкрити QR-код із public/QR.jpg.'));
    image.src = src;
  });

export async function addQrToBackCover(src) {
  const [coverImage, qrImage] = await Promise.all([
    loadImage(src),
    loadImage(`${import.meta.env.BASE_URL}QR.jpg`)
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = A4_WIDTH;
  canvas.height = A4_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не вдалося підготувати задню обкладинку.');

  context.drawImage(coverImage, 0, 0, A4_WIDTH, A4_HEIGHT);

  const cardSize = 390;
  const padding = 25;
  const qrSize = cardSize - padding * 2;
  const margin = 95;
  const x = margin;
  const y = A4_HEIGHT - margin - cardSize;

  context.save();
  context.shadowColor = 'rgba(15, 23, 42, 0.24)';
  context.shadowBlur = 22;
  context.shadowOffsetY = 8;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(x, y, cardSize, cardSize, 24);
  context.fill();
  context.restore();

  context.strokeStyle = '#e2e8f0';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(x + 1.5, y + 1.5, cardSize - 3, cardSize - 3, 24);
  context.stroke();

  context.imageSmoothingEnabled = false;
  context.drawImage(qrImage, x + padding, y + padding, qrSize, qrSize);

  const resultSrc = canvas.toDataURL('image/jpeg', 0.96);
  const imgObj = await loadImage(resultSrc);

  return { src: resultSrc, imgObj };
}
