export const A4_WIDTH = 2480;
export const A4_HEIGHT = 3508;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося відкрити зображення.'));
    image.src = src;
  });

export async function prepareA4Image(src) {
  const image = await loadImage(src);
  const scale = Math.min(1, A4_WIDTH / image.width, A4_HEIGHT / image.height);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = Math.max(1, Math.round(image.width * scale));
  sourceCanvas.height = Math.max(1, Math.round(image.height * scale));

  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('Не вдалося підготувати вихідне фото.');
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const sourceSrc = sourceCanvas.toDataURL('image/jpeg', 0.92);

  const sourceRatio = sourceCanvas.width / sourceCanvas.height;
  const targetRatio = A4_WIDTH / A4_HEIGHT;
  let cropX = 0;
  let cropY = 0;
  let cropWidth = sourceCanvas.width;
  let cropHeight = sourceCanvas.height;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceCanvas.height * targetRatio;
    cropX = (sourceCanvas.width - cropWidth) / 2;
  } else {
    cropHeight = sourceCanvas.width / targetRatio;
    cropY = (sourceCanvas.height - cropHeight) / 2;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = A4_WIDTH;
  outputCanvas.height = A4_HEIGHT;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) throw new Error('Не вдалося підготувати сторінку A4.');
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  outputContext.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    A4_WIDTH,
    A4_HEIGHT
  );

  const outputSrc = outputCanvas.toDataURL('image/jpeg', 0.95);
  return {
    sourceSrc,
    src: outputSrc,
    imgObj: await loadImage(outputSrc)
  };
}
