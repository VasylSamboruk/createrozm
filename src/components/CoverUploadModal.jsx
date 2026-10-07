import { useEffect, useRef, useState } from 'react';
import { BookOpen, ImagePlus, X } from 'lucide-react';

function CoverSlot({ label, hint, file, preview, inputRef, onChange }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="font-semibold text-slate-800">{label}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex aspect-[210/297] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 transition hover:border-violet-400 hover:shadow-lg"
      >
        {preview ? (
          <>
            <img src={preview} alt={label} className="h-full w-full object-contain" />
            <span className="absolute inset-x-2 bottom-2 truncate rounded-lg bg-slate-950/75 px-3 py-2 text-left text-xs text-white">
              {file.name} · Натисніть, щоб замінити
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-3 p-5 text-center text-violet-700">
            <span className="rounded-2xl bg-white p-4 shadow-sm transition group-hover:scale-105">
              <ImagePlus size={28} />
            </span>
            <span className="text-sm font-semibold">Вибрати зображення</span>
            <span className="text-xs text-slate-500">PNG, JPG або WebP</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChange}
        className="hidden"
      />
    </div>
  );
}

export default function CoverUploadModal({ onClose, onAddCovers }) {
  const [covers, setCovers] = useState({ front: null, back: null });
  const [isAdding, setIsAdding] = useState(false);
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  useEffect(() => {
    const preview = covers.front?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [covers.front?.preview]);

  useEffect(() => {
    const preview = covers.back?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [covers.back?.preview]);

  const handleFileChange = (side) => (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setCovers((current) => ({ ...current, [side]: { file, preview } }));
    event.target.value = '';
  };

  const handleAdd = async () => {
    if (!covers.front || !covers.back || isAdding) return;
    setIsAdding(true);
    try {
      await onAddCovers(covers.front.file, covers.back.file);
    } catch {
      // The parent reports the file preparation error.
    } finally {
      setIsAdding(false);
    }
  };

  const canAdd = Boolean(covers.front && covers.back);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cover-modal-title"
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white/15 p-2.5">
              <BookOpen size={22} />
            </span>
            <div>
              <h2 id="cover-modal-title" className="text-lg font-bold">Обкладинки журналу</h2>
              <p className="mt-1 text-sm text-white/80">
                Додайте передню й задню обкладинки на початок і в кінець журналу.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAdding}
            className="rounded-xl p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto p-6">
          <div className="flex gap-4">
            <CoverSlot
              label="Передня обкладинка"
              hint="Буде першою сторінкою"
              file={covers.front?.file}
              preview={covers.front?.preview}
              inputRef={frontInputRef}
              onChange={handleFileChange('front')}
            />
            <CoverSlot
              label="Задня обкладинка"
              hint="QR-код сайту додасться автоматично внизу зліва"
              file={covers.back?.file}
              preview={covers.back?.preview}
              inputRef={backInputRef}
              onChange={handleFileChange('back')}
            />
          </div>
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
            Наявні сторінки залишаться між обкладинками. На задню обкладинку QR-код сайту буде додано автоматично; сторінки можна буде переставляти перетягуванням.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd || isAdding}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isAdding ? 'Додаю…' : 'Додати обкладинки в журнал'}
          </button>
        </footer>
      </section>
    </div>
  );
}
