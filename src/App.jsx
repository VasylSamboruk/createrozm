import { useCallback, useState } from 'react';
import PdfEditor from './PdfEditor';
import AiColoringEditor from './AiColoringEditor';
import StickerCalendarEditor from './StickerCalendarEditor';
import { CalendarDays, Layers, Sparkles } from 'lucide-react';

export default function App() {
  const [appMode, setAppMode] = useState(null);
  const [pdfInitialImages, setPdfInitialImages] = useState([]);

  const handleSendToPdf = (images) => {
    setPdfInitialImages(images);
    setAppMode('pdf');
  };

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
    return <StickerCalendarEditor onBack={() => setAppMode(null)} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-8">Оберіть редактор</h1>
      
      <div className="flex gap-6 flex-wrap justify-center">
        
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