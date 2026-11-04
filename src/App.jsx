import { useCallback, useEffect, useState } from 'react';
import { takeHandoff } from './utils/handoff';
import PdfEditor from './PdfEditor';
import AiColoringEditor from './AiColoringEditor';
import StickerCalendarEditor from './StickerCalendarEditor';
import AiChatStudio from './AiChatStudio';
import { CalendarDays, Layers, MessageCircle, Sparkles } from 'lucide-react';

export default function App() {
  const [appMode, setAppMode] = useState(null);
  const [pdfInitialImages, setPdfInitialImages] = useState([]);
  const [sheetInitialPages, setSheetInitialPages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    takeHandoff().then((payload) => {
      if (cancelled || !payload?.items?.length) return;
      if (payload.mode === 'sheets') {
        setSheetInitialPages(payload.items);
        setAppMode('sticker-calendar');
      } else {
        setPdfInitialImages(payload.items);
        setAppMode('pdf');
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleSendToPdf = (images) => {
    setPdfInitialImages(images);
    setAppMode('pdf');
  };

  const handleSendToSheets = (pages) => {
    setSheetInitialPages(pages);
    setAppMode('sticker-calendar');
  };

  const handleSheetPagesLoaded = useCallback(() => {
    setSheetInitialPages([]);
  }, []);

  const handleInitialImagesLoaded = useCallback(() => {
    setPdfInitialImages([]);
  }, []);

  if (appMode === 'pdf') {
    return (
      <PdfEditor
        onBack={() => setAppMode(null)}
        initialImages={pdfInitialImages}
        onInitialImagesLoaded={handleInitialImagesLoaded}
      />
    );
  }
  if (appMode === 'ai-coloring') {
    return (
      <AiColoringEditor
        onBack={() => setAppMode(null)}
        onSendToPdf={handleSendToPdf}
      />
    );
  }
  if (appMode === 'sticker-calendar') {
    return (
      <StickerCalendarEditor
        onBack={() => setAppMode(null)}
        initialPages={sheetInitialPages}
        onInitialPagesLoaded={handleSheetPagesLoaded}
      />
    );
  }
  if (appMode === 'ai-personalization') {
    return (
      <AiChatStudio
        onBack={() => setAppMode(null)}
        onSendToPdf={handleSendToPdf}
        onSendToSheets={handleSendToSheets}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">Оберіть робочий простір</h1>
      
      <div className="flex gap-6 flex-wrap justify-center">

        <button
          onClick={() => setAppMode('ai-personalization')}
          className="flex w-64 cursor-pointer flex-col items-center gap-4 rounded-2xl border border-fuchsia-200 bg-white/80 p-8 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="rounded-full bg-gradient-to-br from-fuchsia-100 to-violet-100 p-4 text-fuchsia-600">
            <MessageCircle size={40} />
          </div>
          <h2 className="text-xl font-semibold text-slate-700">AI-дизайнер (чат)</h2>
          <p className="text-center text-sm text-slate-500">Чат з AI: кидайте приклади, просіть ідеї й готові зображення для обкладинок, календариків і наклейок.</p>
        </button>
        
        <button 
          onClick={() => setAppMode('ai-coloring')}
          className="flex flex-col items-center gap-4 bg-white/70 backdrop-blur-xl border border-white/40 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-1 w-64 cursor-pointer"
        >
          <div className="bg-fuchsia-100 text-fuchsia-600 p-4 rounded-full">
            <Sparkles size={40} />
          </div>
          <h2 className="text-xl font-semibold text-slate-700">AI Розмальовки</h2>
          <p className="text-sm text-slate-500 text-center">Пакетний конвеєр перетворення фото в контурні розмальовки.</p>
        </button>

        <button 
          onClick={() => setAppMode('pdf')}
          className="flex flex-col items-center gap-4 bg-white/70 backdrop-blur-xl border border-white/40 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-1 w-64 cursor-pointer"
        >
          <div className="bg-blue-100 text-blue-600 p-4 rounded-full">
            <Layers size={40} />
          </div>
          <h2 className="text-xl font-semibold text-slate-700">PDF Редактор</h2>
          <p className="text-sm text-slate-500 text-center">Підготовка фото A4, перегляд журналу та експорт PDF.</p>
        </button>

        <button
          onClick={() => setAppMode('sticker-calendar')}
          className="flex w-64 cursor-pointer flex-col items-center gap-4 rounded-2xl border border-white/40 bg-white/70 p-8 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-md"
        >
          <div className="rounded-full bg-emerald-100 p-4 text-emerald-600">
            <CalendarDays size={40} />
          </div>
          <h2 className="text-xl font-semibold text-slate-700">Наклейки та календарики</h2>
          <p className="text-center text-sm text-slate-500">2 горизонтальні календарики на A4 або 1 вертикальний аркуш наклейок.</p>
        </button>

      </div>
    </div>
  );
}