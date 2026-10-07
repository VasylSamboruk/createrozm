import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { A4_HEIGHT, A4_WIDTH } from './prepareA4Image';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося підготувати сторінку імпортованого PDF.'));
    image.src = src;
  });

export async function importPdfPages(file, onProgress) {
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer())
  });
  const pdfDocument = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const pdfPage = await pdfDocument.getPage(pageNumber);
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(
        A4_WIDTH / baseViewport.width,
        A4_HEIGHT / baseViewport.height
      );
      const viewport = pdfPage.getViewport({ scale });
      const renderedCanvas = window.document.createElement('canvas');
      renderedCanvas.width = Math.max(1, Math.ceil(viewport.width));
      renderedCanvas.height = Math.max(1, Math.ceil(viewport.height));
      const renderedContext = renderedCanvas.getContext('2d');

      if (!renderedContext) {
        throw new Error(`Не вдалося відобразити сторінку ${pageNumber} PDF.`);
      }

      await pdfPage.render({
        canvasContext: renderedContext,
        viewport,
        background: '#ffffff'
      }).promise;

      const pageCanvas = window.document.createElement('canvas');
      pageCanvas.width = A4_WIDTH;
      pageCanvas.height = A4_HEIGHT;
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext) {
        throw new Error(`Не вдалося створити сторінку ${pageNumber} A4.`);
      }

      pageContext.fillStyle = '#ffffff';
      pageContext.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
      pageContext.drawImage(
        renderedCanvas,
        (A4_WIDTH - renderedCanvas.width) / 2,
        (A4_HEIGHT - renderedCanvas.height) / 2
      );

      const src = pageCanvas.toDataURL('image/jpeg', 0.94);
      pages.push({
        id: crypto.randomUUID(),
        type: 'image',
        name: `${file.name} — сторінка ${pageNumber}`,
        src,
        sourceSrc: src,
        imgObj: await loadImage(src)
      });

      renderedCanvas.width = 0;
      renderedCanvas.height = 0;
      pageCanvas.width = 0;
      pageCanvas.height = 0;
      pdfPage.cleanup();
      onProgress?.(pageNumber, pdfDocument.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
