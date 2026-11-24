import { useCallback, useEffect, useState } from 'react';
import { takeHandoff } from './utils/handoff';
import PdfEditor from './PdfEditor';
import AiColoringEditor from './AiColoringEditor';
import StickerCalendarEditor from './StickerCalendarEditor';
import AiChatStudio from './AiChatStudio';
import BusinessChat from './BusinessChat';
import { CalendarDays, Layers, MessageCircle, MessagesSquare, Sparkles } from 'lucide-react';

const telegramKey = new URLSearchParams(window.location.hash.slice(1)).get('telegram');
if (telegramKey) window.history.replaceState(null, '', window.location.pathname + window.location.search);
let telegramImport;

function importTelegramPhotos() {
  if (!telegramImport) {
    const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
    telegramImport = fetch(`${apiBase}/api/telegram/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: telegramKey })
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не вдалося отримати фото з Telegram.');
      return result.items.map((item) => {
        const binary = atob(item.data);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new File([bytes], item.name, { type: item.type });
      });
    });
  }
  return telegramImport;
}

export default function App() {
  const [appMode, setAppMode] = useState(null);
  const [pdfInitialImages, setPdfInitialImages] = useState([]);
  const [sheetInitialPages, setSheetInitialPages] = useState([]);
  const [coloringInitialFiles, setColoringInitialFiles] = useState([]);
  const [telegramStatus, setTelegramStatus] = useState(telegramKey ? 'loading' : '');

  useEffect(() => {
    if (!telegramKey) return;
    let cancelled = false;
    importTelegramPhotos().then((files) => {
      if (cancelled) return;
      setColoringInitialFiles(files);
      setAppMode('ai-coloring');
      setTelegramStatus('');
    }).catch((error) => {
      if (!cancelled) setTelegramStatus(error.message || 'Не вдалося отримати фото з Telegram.');
    });
    return () => { cancelled = true; };
  }, []);

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

  const handleColoringFilesLoaded = useCallback(() => {
    setColoringInitialFiles([]);
  }, []);

  if (telegramStatus) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center text-slate-700">
        <p>{telegramStatus === 'loading' ? 'Завантажуємо фото з Telegram…' : telegramStatus}</p>
        {telegramStatus !== 'loading' && (
          <button className="rounded-xl bg-sky-600 px-4 py-2 text-white" onClick={() => setTelegramStatus('')}>
            На головну
          </button>
        )}
      </div>
    );
  }
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
        initialFiles={coloringInitialFiles}
        onInitialFilesLoaded={handleColoringFilesLoaded}
      />
    );
  }
  if (appMode === 'business-chat') {
    return (
      <BusinessChat
        onBack={() => setAppMode(null)}
        onSendToColoring={(files) => {
          setColoringInitialFiles(files);
          setAppMode('ai-coloring');
        }}
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
          onClick={() => setAppMode('business-chat')}
          className="flex w-64 cursor-pointer flex-col items-center gap-4 rounded-2xl border border-sky-200 bg-white/80 p-8 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 p-4 text-sky-700">
            <MessagesSquare size={40} />
          </div>
          <h2 className="text-xl font-semibold text-slate-700">Бізнес-чат</h2>
          <p className="text-center text-sm text-slate-500">Перегляд чатів Facebook та Instagram і передавання фото в AI-розмальовки.</p>
        </button>

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