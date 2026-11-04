import { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import {
  ArrowLeft,
  Download,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  X
} from 'lucide-react';
import { openInNewTab } from './utils/handoff';

const apiBaseUrl = () => import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
const MAX_ATTACHMENTS = 4;

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Чернетка (дешево)' },
  { value: 'medium', label: 'Стандарт' },
  { value: 'high', label: 'Висока (для друку)' }
];

const STARTERS = [
  { label: '🔍 Проаналізуй мій приклад', text: 'Проаналізуй приклад, який я додав: опиши стиль, композицію, шрифти й кольори та скажи, як це повторити.' },
  { label: '🎨 Зроби за прикладом', text: 'Зроби обкладинку в такому самому стилі, як на доданому прикладі, але з дитиною з другого фото.' },
  { label: '🎄 Ідеї новорічних тем', text: 'Запропонуй 6 ідей новорічних тем для обкладинки, календарика й наклейок для дівчинки та для хлопчика.' },
  { label: '🧁 Обкладинка без напису', text: 'Зроби передню обкладинку розмальовки на день народження без жодного напису.' }
];

const dataUrlToFile = async (dataUrl, name) => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/png' });
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    if ([502, 503, 504].includes(response.status)) {
      throw new Error('Сервер не запущений. Запустіть `npm run dev:all` (або `npm run server`) і повторіть.');
    }
    throw new Error(`Сервер повернув некоректну відповідь (${response.status})`);
  }
};

function GeneratedImage({ src, index, onReuse, onSend }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="mt-2 w-full max-w-[420px] overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <img src={src} alt="Згенероване зображення" className="max-h-[520px] w-full bg-slate-50 object-contain" />
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-2">
        <button type="button" onClick={async () => saveAs(await (await fetch(src)).blob(), `ai-${Date.now()}-${index + 1}.png`)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <Download size={13} /> Завантажити
        </button>
        <button type="button" onClick={() => onReuse(src)} className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100">
          <Plus size={13} /> Змінити це
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
            <FileText size={13} /> У PDF ▾
          </button>
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {[
                ['cover', 'Передня обкладинка', FileText],
                ['back', 'Задня обкладинка (+ QR)', FileText],
                ['calendar', 'Календарик', Layers],
                ['sticker', 'Наклейки', Layers]
              ].map(([kind, label, Icon]) => (
                <button type="button" key={kind} onClick={() => { setMenuOpen(false); onSend(kind, src); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-violet-50">
                  <Icon size={14} className="text-violet-500" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AiChatStudio({ onBack, onSendToPdf, onSendToSheets }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [quality, setQuality] = useState('low');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const endRef = useRef(null);
  const abortRef = useRef(null);
  const urlsRef = useRef([]);
  const fileInputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (files) => {
    const images = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    setAttachments((current) => {
      const next = images.map((file) => {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        return { id: crypto.randomUUID(), file, url };
      });
      return [...current, ...next].slice(0, MAX_ATTACHMENTS);
    });
  };

  const reuseImage = async (src) => {
    addFiles([await dataUrlToFile(src, `ai-${Date.now()}.png`)]);
    document.getElementById('ai-chat-input')?.focus();
  };

  const sendImage = async (kind, src) => {
    const stamp = Date.now();
    const pdfItem = (suffix, extra = {}) => ({ name: `ai-${suffix}-${stamp}.png`, src, ...extra });
    if (kind === 'cover' || kind === 'back') {
      const items = [pdfItem(kind, kind === 'back' ? { isBackCover: true } : {})];
      if (!(await openInNewTab('pdf', items))) onSendToPdf(items);
      return;
    }
    const items = [{ kind, name: `ai-${kind}-${stamp}.png`, src }];
    if (!(await openInNewTab('sheets', items))) onSendToSheets(items);
  };

  const send = async (override) => {
    const text = (typeof override === 'string' ? override : draft).trim();
    if ((!text && !attachments.length) || busy) return;

    const userMessage = { id: crypto.randomUUID(), role: 'user', text, previews: attachments.map((a) => a.url) };
    const history = messages.map(({ role, text: t, images }) => ({
      role,
      text: images?.length ? `${t}\n[Було згенеровано зображення]` : t
    }));
    const files = attachments.map((a) => a.file);

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setAttachments([]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append('messages', JSON.stringify(history));
      form.append('text', text);
      form.append('quality', quality);
      files.forEach((file) => form.append('images', file));

      const response = await fetch(`${apiBaseUrl()}/api/aichat/message`, { method: 'POST', body: form, signal: controller.signal });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || `Помилка сервера: ${response.status}`);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: data.reply, images: data.images || [] }]);
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: 'Зупинено.', images: [], isError: true }]);
      } else {
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: error.message, images: [], isError: true }]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const resetChat = () => {
    if (busy) abortRef.current?.abort();
    setMessages([]);
    setAttachments([]);
    setDraft('');
  };

  return (
    <div
      className="flex h-screen flex-col bg-[#f7f5fb] text-slate-800"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-violet-100 bg-white px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Назад до меню" className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft size={19} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white"><Sparkles size={21} /></div>
          <div>
            <h1 className="font-bold leading-tight">AI-дизайнер</h1>
            <p className="text-xs text-slate-500">Кидайте приклади й просіть: аналіз, ідеї, обкладинки, календарики, наклейки</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Якість зображень" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
            {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" onClick={resetChat} disabled={!messages.length && !draft && !attachments.length} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            <RotateCcw size={14} /> Нова розмова
          </button>
        </div>
      </header>

      <main className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
          {!messages.length && (
            <div className="mx-auto flex max-w-xl flex-col items-center pt-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-100 to-violet-100 text-violet-600"><Sparkles size={30} /></div>
              <h2 className="text-xl font-bold">Чим допомогти?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Додайте фото дитини чи приклад макета (кнопка скріпки, перетягування або Ctrl+V) і напишіть, що потрібно.
                Я знаю формати: обкладинки A4, календарики (2 на A4) і наклейки (A4 з пунктирною лінією).
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button type="button" key={s.label} onClick={() => setDraft(s.text)} className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
              {m.previews?.length > 0 && (
                <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {m.previews.map((url) => <img key={url} src={url} alt="Додане зображення" className="h-24 w-24 rounded-xl border border-violet-100 object-cover" />)}
                </div>
              )}
              {m.text && (
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-md bg-violet-600 text-white' : m.isError ? 'rounded-bl-md bg-rose-50 text-rose-700' : 'rounded-bl-md bg-white text-slate-700 shadow-sm'
                }`}>{m.text}</p>
              )}
              {m.images?.map((src, index) => (
                <GeneratedImage key={index} src={src} index={index} onReuse={reuseImage} onSend={sendImage} />
              ))}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin text-violet-600" /> Думаю… створення зображення може тривати до хвилини
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-violet-100 bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="relative">
                  <img src={a.url} alt="Вкладення" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                  <button type="button" onClick={() => setAttachments((c) => c.filter((x) => x.id !== a.id))} aria-label="Прибрати" className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white hover:bg-rose-500"><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS} aria-label="Додати зображення" title={`До ${MAX_ATTACHMENTS} зображень`} className="rounded-xl p-2.5 text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40">
              <Paperclip size={19} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <textarea
              id="ai-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files || []);
                if (files.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(files); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              maxLength={3000}
              aria-label="Повідомлення"
              placeholder="Опишіть, що зробити… (Enter — надіслати, Shift+Enter — новий рядок)"
              className="max-h-40 min-h-11 flex-1 resize-y bg-transparent px-1 py-2 text-sm outline-none placeholder:text-slate-400"
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Зупинити" className="rounded-xl bg-rose-500 p-3 text-white hover:bg-rose-600"><Square size={17} /></button>
            ) : (
              <button type="submit" disabled={!draft.trim() && !attachments.length} aria-label="Надіслати" className="rounded-xl bg-violet-600 p-3 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><Send size={17} /></button>
            )}
          </form>
          <p className="mt-2 text-center text-[11px] text-slate-400">Зображення створюється лише коли ви про це просите. Текстові відповіді майже безкоштовні.</p>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-violet-400 bg-violet-50/90 text-violet-700">
            <ImagePlus size={40} /> <span className="font-semibold">Відпустіть, щоб додати зображення</span>
          </div>
        )}
      </main>
    </div>
  );
}
