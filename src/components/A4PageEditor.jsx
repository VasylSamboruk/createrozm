import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Save, Sticker, X, ZoomIn } from 'lucide-react';

const A4_WIDTH = 2480;
const A4_HEIGHT = 3508;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося відкрити зображення.'));
    image.src = src;
  });

function DraggableSticker({ sticker, containerRef, onChange, onRemove }) {
  const handleMouseDown = (event) => {
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startStickerX = sticker.x;
    const startStickerY = sticker.y;

    const onMouseMove = (moveEvent) => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      onChange({
        ...sticker,
        x: startStickerX + ((moveEvent.clientX - startX) / width) * 100,
        y: startStickerY + ((moveEvent.clientY - startY) / height) * 100
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleWheel = (event) => {
    event.stopPropagation();
    event.preventDefault();
    onChange({
      ...sticker,
      scale: Math.max(0.1, sticker.scale + (event.deltaY > 0 ? -0.05 : 0.05))
    });
  };

  return (
    <div
      className="group absolute z-20"
      style={{
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        width: `${sticker.baseWidthPct * sticker.scale}%`,
        transform: 'translate(-50%, -50%)',
        cursor: 'move',
        pointerEvents: 'auto'
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      title="Перетягніть наклейку; коліщатко змінює її розмір"
    >
      <img src={sticker.url} alt="Наклейка" className="w-full h-auto drop-shadow-xl" draggable={false} />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-1 text-xs text-white opacity-0 shadow group-hover:opacity-100"
        aria-label="Видалити наклейку"
      >
        ×
      </button>
    </div>
  );
}

export default function A4PageEditor({ page, onClose, onApply }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [stickers, setStickers] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const stickerContainerRef = useRef(null);
  const stickerInputRef = useRef(null);
  const stickerUrlsRef = useRef([]);

  useEffect(() => () => {
    stickerUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const addSticker = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    stickerUrlsRef.current.push(url);
    setStickers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        url,
        x: 50,
        y: 50,
        scale: 1,
        baseWidthPct: 30
      }
    ]);
    event.target.value = '';
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsSaving(true);

    try {
      const image = await loadImage(page.sourceSrc || page.src);
      const canvas = document.createElement('canvas');
      canvas.width = A4_WIDTH;
      canvas.height = A4_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не вдалося підготувати полотно A4.');

      context.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        A4_WIDTH,
        A4_HEIGHT
      );

      for (const sticker of stickers) {
        const stickerImage = await loadImage(sticker.url);
        const width = A4_WIDTH * (sticker.baseWidthPct / 100) * sticker.scale;
        const height = stickerImage.height * (width / stickerImage.width);
        context.drawImage(
          stickerImage,
          (sticker.x / 100) * A4_WIDTH - width / 2,
          (sticker.y / 100) * A4_HEIGHT - height / 2,
          width,
          height
        );
      }

      await onApply(canvas.toDataURL('image/jpeg', 0.95));
      onClose();
    } catch (error) {
      console.error('Помилка підготовки сторінки A4:', error);
      alert(error?.message || 'Не вдалося підготувати сторінку A4.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <section
        className="flex h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Підготовка фото для друку A4"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="font-semibold text-slate-800">Підготовка фото для A4</h2>
            <p className="text-xs text-slate-500">Формат 2480 × 3508 px · 300 DPI</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-slate-900">
          <Cropper
            image={page.sourceSrc || page.src}
            crop={crop}
            zoom={zoom}
            aspect={A4_WIDTH / A4_HEIGHT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              ref={stickerContainerRef}
              className="relative"
              style={{
                aspectRatio: `${A4_WIDTH} / ${A4_HEIGHT}`,
                height: '100%',
                maxHeight: '100%',
                maxWidth: '100%',
                pointerEvents: 'none'
              }}
            >
              {stickers.map((sticker) => (
                <DraggableSticker
                  key={sticker.id}
                  sticker={sticker}
                  containerRef={stickerContainerRef}
                  onChange={(updated) =>
                    setStickers((current) =>
                      current.map((item) => item.id === updated.id ? updated : item)
                    )
                  }
                  onRemove={() =>
                    setStickers((current) =>
                      current.filter((item) => item.id !== sticker.id)
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <ZoomIn size={18} className="text-slate-500" />
            <label htmlFor="a4-zoom" className="text-sm font-medium text-slate-700">Масштаб</label>
            <input
              id="a4-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-40 accent-blue-600"
            />
            <button
              type="button"
              onClick={() => stickerInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200"
            >
              <Sticker size={16} /> Додати наклейку
            </button>
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={addSticker}
              className="hidden"
            />
            {stickers.length > 0 && (
              <span className="text-xs text-slate-500">Перетягніть наклейку; коліщатко змінює розмір</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!croppedAreaPixels || isSaving}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} /> {isSaving ? 'Зберігаю…' : 'Застосувати A4'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
