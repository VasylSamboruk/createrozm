import { useState, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ArrowLeft, FileUp, Download, Trash2, CheckCircle2, Sticker, ZoomIn } from 'lucide-react';

// Завантаження зображення для канвасу
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

// Генерація фінального зображення А4 + наклейки
async function getCroppedImgBlob(imageSrc, pixelCrop, stickers = []) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 2480;
  canvas.height = 3508;

  // Малюємо основне обрізане фото
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    2480,
    3508
  );

  // Малюємо наклейки поверх фото
  for (let sticker of stickers) {
    const stickerImg = await createImage(sticker.url);
    
    // Вираховуємо координати відносно А4 (в пікселях)
    const centerX = (sticker.x / 100) * 2480;
    const centerY = (sticker.y / 100) * 3508;

    // Фізична ширина наклейки на полотні А4
    const width = 2480 * ((sticker.baseWidthPct || 30) / 100) * sticker.scale;
    const height = stickerImg.height * (width / stickerImg.width);

    const drawX = centerX - width / 2;
    const drawY = centerY - height / 2;

    ctx.drawImage(stickerImg, drawX, drawY, width, height);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
}

// Компонент наклейки, яку можна тягати
function DraggableSticker({ sticker, containerRef, onChange, onRemove }) {
  const handleMouseDown = (e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startStickerX = sticker.x;
    const startStickerY = sticker.y;

    const onMouseMove = (moveEvent) => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      // Конвертуємо зміщення в проценти для адаптивності
      const deltaPercentX = (deltaX / width) * 100;
      const deltaPercentY = (deltaY / height) * 100;

      onChange({
        ...sticker,
        x: startStickerX + deltaPercentX,
        y: startStickerY + deltaPercentY
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    // Плавний скейл наклейки коліщатком миші
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    let newScale = (sticker.scale || 1) + delta;
    if (newScale < 0.1) newScale = 0.1;
    onChange({ ...sticker, scale: newScale });
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${sticker.x}%`,
        top: `${sticker.y}%`,
        transform: `translate(-50%, -50%)`,
        width: `${(sticker.baseWidthPct || 30) * sticker.scale}%`,
        pointerEvents: 'auto',
        cursor: 'move'
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      className="group z-50"
      title="Покрутіть коліщатко, щоб змінити розмір"
    >
      <img src={sticker.url} alt="наклейка" className="w-full h-auto drop-shadow-xl" draggable={false} />
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function PhotoEditor({ onBack }) {
  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const stickerContainerRef = useRef(null);

  // Завантаження фотографій
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newImages = files.map((file) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      stickers: [] // Масив наклейок для кожного фото
    }));

    setImages((prev) => {
      const updated = [...prev, ...newImages];
      if (!activeId && updated.length > 0) setActiveId(updated[0].id);
      return updated;
    });
    e.target.value = '';
  };

  // Завантаження наклейки для АКТИВНОГО фото
  const handleStickerUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !activeId) return;

    const newSticker = {
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      x: 50, // по центру (50%)
      y: 50,
      scale: 1,
      baseWidthPct: 30 // Займає 30% ширини А4 за замовчуванням
    };

    setImages((prev) => prev.map((img) => 
      img.id === activeId 
        ? { ...img, stickers: [...img.stickers, newSticker] } 
        : img
    ));
    e.target.value = '';
  };

  // Оновлення параметрів фото та наклейок
  const onCropChange = (crop) => setImages((prev) => prev.map((img) => (img.id === activeId ? { ...img, crop } : img)));
  const onZoomChange = (zoom) => setImages((prev) => prev.map((img) => (img.id === activeId ? { ...img, zoom } : img)));
  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setImages((prev) => prev.map((img) => (img.id === activeId ? { ...img, croppedAreaPixels } : img)));
  }, [activeId]);

  const updateSticker = (stickerId, newProps) => {
    setImages((prev) => prev.map((img) => 
      img.id === activeId 
        ? { ...img, stickers: img.stickers.map(s => s.id === stickerId ? newProps : s) } 
        : img
    ));
  };

  const removeSticker = (stickerId) => {
    setImages((prev) => prev.map((img) => 
      img.id === activeId 
        ? { ...img, stickers: img.stickers.filter(s => s.id !== stickerId) } 
        : img
    ));
  };

  const removeImage = (id, e) => {
    e.stopPropagation();
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (activeId === id) setActiveId(filtered.length > 0 ? filtered[0].id : null);
      return filtered;
    });
  };

  // Скачування ZIP
  const handleDownloadZip = async () => {
    if (images.length === 0) return alert('Немає фотографій для збереження!');
    setIsProcessing(true);

    try {
      const zip = new JSZip();
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.croppedAreaPixels) continue;
        const blob = await getCroppedImgBlob(img.url, img.croppedAreaPixels, img.stickers || []);
        zip.file(`${i + 1}.jpg`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'A4_Photos.zip');
    } catch (error) {
      console.error('Помилка при створенні архіву:', error);
      alert('Сталася помилка при генерації фото.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activeImage = images.find((img) => img.id === activeId);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      
      {/* Верхня панель */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex justify-between items-center z-10">
        <div className="flex gap-4 items-center">
          <button onClick={onBack} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-all shadow-md active:scale-95">
            <ArrowLeft size={16} className="mr-2" /> Назад
          </button>
          
          <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer font-medium text-sm flex items-center gap-2 transition-all shadow-md active:scale-95">
            <FileUp size={16} /> + Завантажити фото
            <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>

          {activeImage && (
            <label className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg cursor-pointer font-medium text-sm flex items-center gap-2 transition-all shadow-md active:scale-95">
              <Sticker size={16} /> + Наклейка на фото
              <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleStickerUpload} className="hidden" />
            </label>
          )}
        </div>

        <button 
          onClick={handleDownloadZip} 
          disabled={images.length === 0 || isProcessing}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-md active:scale-95"
        >
          {isProcessing ? 'Генерація архіву...' : <><Download size={16} /> СКАЧАТИ ВСІ В ZIP</>}
        </button>
      </header>

      {/* Робоча область */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Бічна панель */}
        <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex flex-col p-4 gap-3">
          {images.length === 0 ? (
            <div className="text-slate-400 text-center text-sm mt-10">Завантажте фотографії для початку роботи</div>
          ) : (
            images.map((img, index) => (
              <div 
                key={img.id} 
                onClick={() => setActiveId(img.id)}
                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-[1/1.414] ${activeId === img.id ? 'border-blue-500 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <img src={img.url} className="w-full h-full object-cover" alt={`Фото ${index + 1}`} />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {index + 1}
                </div>
                {img.stickers?.length > 0 && (
                  <div className="absolute top-1 left-7 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow">
                    <Sticker size={10} />
                  </div>
                )}
                <button 
                  onClick={(e) => removeImage(img.id, e)}
                  className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full backdrop-blur-sm"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </aside>

        {/* Зона редагування */}
        <section className="flex-1 relative bg-slate-200/50">
          {activeImage ? (
            <div className="absolute inset-0 p-8">
              <div className="relative w-full h-full bg-slate-300 rounded-xl overflow-hidden shadow-inner border border-slate-300">
                <Cropper
                  image={activeImage.url}
                  crop={activeImage.crop}
                  zoom={activeImage.zoom}
                  aspect={2480 / 3508} // Пропорція А4
                  onCropChange={onCropChange}
                  onZoomChange={onZoomChange}
                  onCropComplete={onCropComplete}
                  showGrid={true}
                />
                
                {/* Шар для наклейок, що ідеально накладається на А4-пропорцію */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div 
                    ref={stickerContainerRef}
                    style={{ aspectRatio: '2480 / 3508', height: '100%', maxHeight: '100%', maxWidth: '100%' }}
                    className="relative"
                  >
                    {activeImage.stickers?.map(sticker => (
                      <DraggableSticker
                        key={sticker.id}
                        sticker={sticker}
                        containerRef={stickerContainerRef}
                        onChange={(newProps) => updateSticker(sticker.id, newProps)}
                        onRemove={() => removeSticker(sticker.id)}
                      />
                    ))}
                  </div>
                </div>

              </div>

              {/* Плавний повзунок для масштабу (внизу по центру екрану) */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg flex items-center gap-4 z-20 border border-slate-200">
                <ZoomIn size={18} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Масштаб:</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={activeImage.zoom}
                  onChange={(e) => onZoomChange(Number(e.target.value))}
                  className="w-48 accent-blue-600 cursor-pointer"
                />
              </div>

            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              Оберіть фото зліва для налаштування масштабу
            </div>
          )}
        </section>

      </main>
    </div>
  );
}