import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Download, FileUp, Image, RotateCw, Trash2, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import SheetEditor from './components/SheetEditor';

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Не вдалося завантажити зображення.'));
  image.src = src;
});

const makePage = async (file, kind) => {
  const src = URL.createObjectURL(file);
  try {
    const image = await loadImage(src);
    return { id: crypto.randomUUID(), name: file.name, kind, src, sourceSrc: src, width: image.width, height: image.height };
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  }
};

export default function StickerCalendarEditor({ onBack }) {
  const [mode, setMode] = useState('calendar');
  const [pages, setPages] = useState([]);
  const [editingSheet, setEditingSheet] = useState(null);
  const [rotated, setRotated] = useState(true);
  const pagesRef = useRef(pages);
  const previewSheets = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.kind === 'calendar' && pages[index + 1]?.kind === 'calendar') {
      previewSheets.push({ kind: 'calendar', pages: [page, pages[index + 1]] });
      index += 1;
    } else if (page.kind === 'calendar') {
      previewSheets.push({ kind: 'calendar', pages: [page, page] });
    } else if (page.kind === 'calendar-sheet') {
      previewSheets.push({ kind: 'calendar-sheet', pages: [page] });
    } else {
      previewSheets.push({ kind: 'sticker', pages: [page] });
    }
  }

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => () => pagesRef.current.forEach((page) => {
    if (page.src.startsWith('blob:')) URL.revokeObjectURL(page.src);
  }), []);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const added = await Promise.all(files.map((file) => makePage(file, mode)));
      setPages((current) => [...current, ...added]);
    } catch (error) {
      console.error('Не вдалося додати макет:', error);
      alert(error.message || 'Не вдалося додати макет.');
    } finally {
      event.target.value = '';
    }
  };

  const removeSheet = (sheet) => {
    const ids = new Set(sheet.pages.map((page) => page.id));
    setPages((current) => current.filter((page) => !ids.has(page.id)));
    sheet.pages.forEach((page) => {
      if (page.src.startsWith('blob:')) URL.revokeObjectURL(page.src);
    });
  };

  const applyEditedSheet = (src) => {
    if (!editingSheet) return;
    setPages((current) => {
      const firstIndex = current.findIndex((page) => page.id === editingSheet.pages[0].id);
      if (firstIndex < 0) return current;
      if (editingSheet.kind === 'calendar') {
        const updated = {
          ...editingSheet.pages[0],
          kind: 'calendar-sheet',
          src,
          sourceSrc: src,
          sheetSrc: true
        };
        return [...current.slice(0, firstIndex), updated, ...current.slice(firstIndex + 2)];
      }
      return current.map((page) => page.id === editingSheet.pages[0].id
        ? { ...page, src, sourceSrc: src }
        : page);
    });
    setEditingSheet(null);
  };

  const exportPdf = async () => {
    if (!pages.length) {
      alert('Спочатку додайте макети.');
      return;
    }
    const fileName = prompt('Введіть назву PDF:', 'Kalendaryky-ta-Nakleyky-A4');
    if (!fileName) return;

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      let isFirstPage = true;
      for (let index = 0; index < pages.length; index += 1) {
        if (!isFirstPage) doc.addPage('a4', 'portrait');
        isFirstPage = false;
        if (pages[index].kind === 'calendar-sheet') {
          const image = await loadImage(pages[index].src);
          doc.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'MEDIUM');
        } else if (pages[index].kind === 'calendar') {
          const firstPage = pages[index];
          const secondPage = pages[index + 1]?.kind === 'calendar' ? pages[index + 1] : firstPage;
          if (secondPage !== firstPage) index += 1;
          const first = await loadImage(firstPage.src);
          const second = await loadImage(secondPage.src);
          const halfHeight = 148.5;
          const draw = (image, y) => {
            const ratio = image.width / image.height;
            const width = Math.min(210, halfHeight * ratio);
            const height = width / ratio;
            doc.addImage(image, 'JPEG', (210 - width) / 2, y + (halfHeight - height) / 2, width, height, undefined, 'MEDIUM');
          };
          draw(first, 0);
          draw(second, halfHeight);
        } else {
          const image = await loadImage(pages[index].src);
          if (rotated) {
            const canvas = document.createElement('canvas');
            canvas.width = image.height;
            canvas.height = image.width;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Не вдалося повернути макет.');
            context.translate(canvas.width, 0);
            context.rotate(Math.PI / 2);
            context.drawImage(image, 0, 0);
            doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'MEDIUM');
          } else {
            const ratio = image.width / image.height;
            const width = Math.min(210, 297 * ratio);
            const height = width / ratio;
            doc.addImage(image, 'JPEG', (210 - width) / 2, (297 - height) / 2, width, height, undefined, 'MEDIUM');
          }
        }
      }
      doc.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('Не вдалося створити PDF:', error);
      alert(error.message || 'Не вдалося створити PDF.');
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 bg-white/70 px-6 py-3 shadow-sm backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Генератор наклейок і календариків</h1>
          <p className="text-xs text-slate-500">Підготовка макетів до друку на A4</p>
        </div>
        <div className="flex gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-blue-700">
            <FileUp size={16} /> Додати макети
            <input type="file" multiple accept="image/*" onChange={upload} className="hidden" />
          </label>
          <button type="button" onClick={exportPdf} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-emerald-600">
            <Download size={16} /> Створити PDF
          </button>
          <button type="button" onClick={onBack} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300">← В меню</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white/70 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Тип макета</h2>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('calendar')} className={`rounded-xl border p-3 text-left ${mode === 'calendar' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              <CalendarDays size={22} />
              <span className="mt-2 block text-sm font-semibold">Календарики</span>
              <span className="mt-1 block text-xs">2 на A4</span>
            </button>
            <button type="button" onClick={() => setMode('sticker')} className={`rounded-xl border p-3 text-left ${mode === 'sticker' ? 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              <Image size={22} />
              <span className="mt-2 block text-sm font-semibold">Наклейки</span>
              <span className="mt-1 block text-xs">1 на A4</span>
            </button>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            {mode === 'calendar'
              ? 'Кожен лист A4 буде вертикальним і ділитиметься навпіл. Два календарики розміщуються один над одним.'
              : 'Наклейки друкуються на вертикальному A4. Горизонтальний макет можна автоматично повернути на 90°.'}
          </div>
          {mode === 'sticker' && (
            <button type="button" onClick={() => setRotated((value) => !value)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-100 px-3 py-2 text-sm font-medium text-fuchsia-700 hover:bg-fuchsia-200">
              <RotateCw size={16} /> {rotated ? 'Поворот 90° увімкнено' : 'Без повороту'}
            </button>
          )}
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Аркуші PDF</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{previewSheets.length}</span>
            </div>
            {previewSheets.map((sheet, index) => (
              <div key={sheet.pages[0].id} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${sheet.kind === 'calendar' || sheet.kind === 'calendar-sheet' ? 'bg-blue-100 text-blue-700' : 'bg-fuchsia-100 text-fuchsia-700'}`}>
                      {sheet.kind === 'calendar' || sheet.kind === 'calendar-sheet' ? 'Календарики' : 'Наклейка'}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-700">Аркуш {index + 1}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditingSheet(sheet)} title="Редагувати аркуш" className="rounded p-1 text-blue-500 hover:bg-blue-50"><Image size={15} /></button>
                    <button type="button" onClick={() => removeSheet(sheet)} title="Видалити аркуш" className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sheet.pages.map((page, pageIndex) => (
                    <div key={page.id} className="min-w-0 rounded-lg bg-slate-50 p-1">
                      <img src={page.src} alt="" className="h-16 w-full rounded object-contain" />
                      {sheet.kind === 'calendar' && <p className="truncate px-1 pt-1 text-[10px] text-slate-500">Календарик {pageIndex + 1}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Перегляд готового PDF</h2>
                <p className="text-sm text-slate-500">
                  {pages.length
                    ? `${pages.length} макет(ів) → ${previewSheets.length} аркуш(ів) A4`
                    : 'Додайте зображення для початку роботи'}
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {previewSheets.map((sheet, previewIndex) => {
                const [page, secondPage] = sheet.pages;
                return (
                <button
                  type="button"
                  key={page.id}
                  onClick={() => setEditingSheet(sheet)}
                  className="rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
                  title="Натисніть, щоб редагувати весь аркуш"
                >
                  <div className="relative mx-auto aspect-[210/297] max-w-xs overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {sheet.kind === 'calendar' ? (
                      <>
                        <img src={page.src} alt={page.name} className="absolute inset-x-0 top-0 h-1/2 w-full object-contain" />
                        <img src={secondPage.src} alt="" className="absolute inset-x-0 bottom-0 h-1/2 w-full object-contain" />
                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-blue-400" />
                      </>
                    ) : sheet.kind === 'calendar-sheet' ? (
                      <img src={page.src} alt={page.name} className="h-full w-full object-fill" />
                    ) : (
                      <img
                        src={page.src}
                        alt={page.name}
                        className="object-fill"
                        style={rotated
                          ? { position: 'absolute', left: 0, top: '14.65%', width: '100%', height: '70.7%', transform: 'rotate(90deg) scale(1.42)' }
                          : { height: '100%', width: '100%' }}
                      />
                    )}
                  </div>
                  <p className="mt-2 truncate text-center text-xs text-slate-500">Аркуш {previewIndex + 1}</p>
                  <p className="mt-1 text-center text-[11px] text-blue-500">Натисніть для редагування аркуша</p>
                </button>
                );
              })}
            </div>
            {!pages.length && <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 py-24 text-center text-slate-400">Завантажте зображення макетів</div>}
          </div>
        </main>
      </div>
      {editingSheet && (
        <SheetEditor
          sheet={editingSheet}
          onClose={() => setEditingSheet(null)}
          onApply={applyEditedSheet}
        />
      )}
      <button type="button" onClick={onBack} className="hidden"><X /></button>
    </div>
  );
}
