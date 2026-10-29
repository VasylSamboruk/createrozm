import { useEffect, useRef, useState } from 'react';
import { Check, RotateCw, X, ZoomIn } from 'lucide-react';

const A4_WIDTH = 2480;
const A4_HEIGHT = 3508;

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Не вдалося завантажити макет.'));
  image.src = src;
});

export default function SheetEditor({ sheet, onClose, onApply }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transforms, setTransforms] = useState(() => sheet.pages.map(() => ({
    rotation: sheet.kind === 'sticker' ? 90 : 0,
    zoom: sheet.kind === 'sticker' ? 1.35 : 1,
    x: 0,
    y: 0
  })));
  const dragRef = useRef(null);
  const activeTransform = transforms[activeIndex] || transforms[0];

  const updateActive = (changes) => {
    setTransforms((current) => current.map((item, index) => (
      index === activeIndex ? { ...item, ...changes } : item
    )));
  };

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const { startX, startY, x, y } = dragRef.current;
      const nextX = x + event.clientX - startX;
      const nextY = y + event.clientY - startY;
      dragRef.current.onMove(nextX, nextY);
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const startDrag = (event) => {
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: activeTransform.x,
      y: activeTransform.y,
      onMove: (x, y) => updateActive({ x, y })
    };
  };

  const save = async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = A4_WIDTH;
      canvas.height = A4_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не вдалося підготувати аркуш A4.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

      for (let index = 0; index < sheet.pages.length; index += 1) {
        const image = await loadImage(sheet.pages[index].src);
        const isCalendar = sheet.kind === 'calendar';
        const areaTop = isCalendar ? index * (A4_HEIGHT / 2) : 0;
        const areaHeight = isCalendar ? A4_HEIGHT / 2 : A4_HEIGHT;
        const imageRatio = image.width / image.height;
        const areaRatio = A4_WIDTH / areaHeight;
        const transform = transforms[index];
        const rotatedQuarterTurn = sheet.kind !== 'calendar' && transform.rotation % 180 !== 0;
        const displayedRatio = rotatedQuarterTurn ? 1 / imageRatio : imageRatio;
        const displayedWidth = displayedRatio > areaRatio ? A4_WIDTH : areaHeight * displayedRatio;
        const displayedHeight = displayedRatio > areaRatio ? A4_WIDTH / displayedRatio : areaHeight;
        let width = rotatedQuarterTurn ? displayedHeight : displayedWidth;
        let height = rotatedQuarterTurn ? displayedWidth : displayedHeight;
        width *= transform.zoom;
        height *= transform.zoom;
        const centerX = A4_WIDTH / 2 + transform.x * (A4_WIDTH / 100);
        const centerY = areaTop + areaHeight / 2 + transform.y * (A4_HEIGHT / 100);

        context.save();
        context.translate(centerX, centerY);
        context.rotate((transform.rotation * Math.PI) / 180);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
      }

      onApply(canvas.toDataURL('image/jpeg', 0.95));
    } catch (error) {
      console.error('Не вдалося зберегти A4-аркуш:', error);
      alert(error.message || 'Не вдалося зберегти A4-аркуш.');
    }
  };

  const previewStyle = (transform) => ({
    transform: `translate(${transform.x}%, ${transform.y}%) rotate(${transform.rotation}deg) scale(${transform.zoom})`,
    transformOrigin: 'center center'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <section className="flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="font-semibold text-slate-800">Редагування всього аркуша A4</h2>
            <p className="text-xs text-slate-500">{sheet.kind === 'calendar' ? 'Оберіть календарик і редагуйте його окремо' : 'Одна наклейка на весь аркуш'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-6">
          <div
            className="relative mx-auto aspect-[2480/3508] h-full max-h-full max-w-full overflow-hidden bg-white shadow-xl"
            onMouseDown={startDrag}
            title="Перетягуйте аркуш мишкою"
          >
            {sheet.pages.map((page, index) => (
              <img
                key={page.id}
                src={page.src}
                alt=""
                draggable={false}
                className={`absolute left-0 w-full object-contain ${sheet.kind === 'calendar' ? 'h-1/2' : 'top-0 h-full'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
                style={sheet.kind === 'calendar'
                  ? { top: `${index * 50}%`, ...previewStyle(transforms[index]) }
                  : {
                      left: 0,
                      width: '100%',
                      top: transforms[index].rotation % 180 !== 0 ? '14.65%' : 0,
                      height: transforms[index].rotation % 180 !== 0 ? '70.7%' : '100%',
                      ...previewStyle(transforms[index])
                    }}
              />
            ))}
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            {sheet.kind === 'calendar' && sheet.pages.map((page, index) => (
              <button key={page.id} type="button" onClick={() => setActiveIndex(index)} className={`rounded-lg px-3 py-2 text-xs font-medium ${activeIndex === index ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                Календарик {index + 1}
              </button>
            ))}
            <ZoomIn size={18} className="text-slate-500" />
            <label htmlFor="sheet-zoom" className="text-sm font-medium text-slate-700">Масштаб</label>
            <input id="sheet-zoom" type="range" min="0.5" max="2.5" step="0.01" value={activeTransform.zoom} onChange={(event) => updateActive({ zoom: Number(event.target.value) })} className="w-40 accent-blue-600" />
            <button type="button" onClick={() => updateActive({ rotation: (activeTransform.rotation + 90) % 360 })} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">
              <RotateCw size={16} /> {activeTransform.rotation}°
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">Скасувати</button>
            <button type="button" onClick={save} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600"><Check size={16} /> Застосувати A4</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
