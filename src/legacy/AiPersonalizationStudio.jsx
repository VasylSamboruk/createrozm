import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { JOB_ORDER, PRODUCTS, QUALITY_OPTIONS, STYLE_PRESETS, THEME_PRESETS } from './personalize/config';
import { askAssistant, generateProduct } from './personalize/pipeline';
import { openInNewTab } from '../utils/handoff';

const emptyResult = () => ({ status: 'idle', image: null, versions: [], error: '' });

const newProject = (file) => ({
  id: crypto.randomUUID(),
  file,
  photoUrl: URL.createObjectURL(file),
  name: '',
  age: '',
  year: 2027,
  theme: '',
  style: '',
  notes: '',
  palette: 'rainbow',
  want: { cover: true, back: true, calendar: true, stickers: true },
  results: Object.fromEntries(PRODUCTS.map((product) => [product.id, emptyResult()]))
});

const safeName = (value) => (value || 'dytyna').trim().replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 40) || 'dytyna';

const downloadDataUrl = async (dataUrl, filename) => saveAs(await (await fetch(dataUrl)).blob(), filename);

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100';

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1.5 text-[11px] transition ${
        active ? 'border-violet-400 bg-violet-100 text-violet-800' : 'border-violet-100 bg-violet-50/70 text-violet-700 hover:border-violet-300'
      }`}
    >
      {children}
    </button>
  );
}

function ProductCard({ product, project, busy, onGenerate, onToggle, onPick }) {
  const result = project.results[product.id];
  const working = result.status === 'working';
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <label className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={project.want[product.id]} onChange={() => onToggle(product.id)} className="accent-violet-600" />
          <span className="truncate">{product.label}</span>
        </label>
        {working && <Loader2 size={15} className="shrink-0 animate-spin text-violet-600" />}
        {result.status === 'done' && <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />}
        {result.status === 'error' && <AlertCircle size={15} className="shrink-0 text-rose-600" />}
      </div>
      <div className="flex items-center justify-center bg-slate-50 p-3">
        <div className="relative w-full max-w-[220px] overflow-hidden rounded-lg border border-slate-200 bg-white" style={{ aspectRatio: product.aspect }}>
          {result.image ? (
            <img src={result.image} alt={product.label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-slate-400">
              <Sparkles size={22} strokeWidth={1.5} />
              <span className="text-[11px]">{product.hint}</span>
            </div>
          )}
          {working && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-xs font-medium text-violet-700">
              <Loader2 className="animate-spin" size={24} /> Генерація…
            </div>
          )}
        </div>
      </div>
      {result.versions.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2">
          {result.versions.map((version, index) => (
            <button
              type="button"
              key={index}
              onClick={() => onPick(product.id, index)}
              className={`h-9 w-9 shrink-0 overflow-hidden rounded border-2 ${version === result.image ? 'border-violet-500' : 'border-transparent'}`}
              aria-label={`Версія ${index + 1}`}
            >
              <img src={version} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {result.error && <p role="alert" className="px-3 pb-2 text-xs text-rose-600">{result.error}</p>}
      <div className="mt-auto flex gap-2 border-t border-slate-100 p-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onGenerate(product.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {result.image ? <RefreshCw size={14} /> : <Play size={14} />}
          {result.image ? 'Ще варіант' : 'Створити'}
        </button>
        <button
          type="button"
          disabled={!result.image}
          onClick={() => downloadDataUrl(result.image, `${safeName(project.name)}-${product.file}.jpg`)}
          aria-label="Завантажити"
          title="Завантажити JPG"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={15} /> JPG
        </button>
      </div>
    </div>
  );
}

export default function AiPersonalizationStudio({ onBack, onSendToPdf, onSendToSheets }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quality, setQuality] = useState('medium');
  const [isRunning, setIsRunning] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [draft, setDraft] = useState('');
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', text: 'Привіт! Завантажте фото дітей, оберіть тему й запустіть чергу. Тут я підкажу, що додати чи змінити.', suggestions: [] }
  ]);
  const projectsRef = useRef([]);
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const chatEndRef = useRef(null);

  const commit = (updater) => {
    projectsRef.current = updater(projectsRef.current);
    setProjects(projectsRef.current);
  };

  const patchProject = (id, patch) => commit((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const patchResult = (id, product, patch) => commit((list) => list.map((p) => (
    p.id === id ? { ...p, results: { ...p.results, [product]: { ...p.results[product], ...patch } } } : p
  )));

  useEffect(() => () => projectsRef.current.forEach((p) => URL.revokeObjectURL(p.photoUrl)), []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  const handleFiles = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    if (!files.length) return;
    const added = files.map(newProject);
    commit((list) => [...list, ...added]);
    setSelectedId((current) => current || added[0].id);
  };

  const removeProject = (id) => {
    const target = projectsRef.current.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.photoUrl);
    const rest = projectsRef.current.filter((p) => p.id !== id);
    commit(() => rest);
    if (selectedId === id) setSelectedId(rest[0]?.id || null);
  };

  const runJobs = async (jobs) => {
    if (runningRef.current || !jobs.length) return;
    runningRef.current = true;
    stopRef.current = false;
    setIsRunning(true);
    for (const { id, product } of jobs) {
      if (stopRef.current) break;
      const project = projectsRef.current.find((p) => p.id === id);
      if (!project) continue;
      patchResult(id, product, { status: 'working', error: '' });
      try {
        const image = await generateProduct(project, product, quality);
        const current = projectsRef.current.find((p) => p.id === id);
        if (!current) continue;
        patchResult(id, product, { status: 'done', image, versions: [...current.results[product].versions, image].slice(-6) });
      } catch (error) {
        patchResult(id, product, { status: 'error', error: error?.message || 'Не вдалося згенерувати.' });
      }
    }
    runningRef.current = false;
    setIsRunning(false);
  };

  const applyTemplate = (id, label) => {
    const preset = THEME_PRESETS.find((t) => t.label === label);
    if (preset) patchProject(id, { theme: preset.value, palette: preset.palette });
  };

  const applyTemplateToAll = (label) => {
    const preset = THEME_PRESETS.find((t) => t.label === label);
    if (preset) commit((list) => list.map((p) => ({ ...p, theme: preset.value, palette: preset.palette })));
  };

  const runQueue = () => {
    const invalid = projectsRef.current.filter((p) => !p.name.trim() || !p.theme.trim());
    setShowErrors(invalid.length > 0);
    if (invalid.length) {
      setSelectedId(invalid[0].id);
      alert(`Вкажіть ім’я та шаблон (тему) для кожної дитини. Не заповнено: ${invalid.length}.`);
      return;
    }
    const jobs = [];
    projectsRef.current.forEach((project) => {
      JOB_ORDER.forEach((product) => {
        if (project.want[product] && project.results[product].status !== 'done') jobs.push({ id: project.id, product });
      });
    });
    runJobs(jobs);
  };

  const pickVersion = (product, index) => {
    if (!selected) return;
    patchResult(selected.id, product, { image: selected.results[product].versions[index] });
  };

  const toggleWant = (product) => {
    if (!selected) return;
    patchProject(selected.id, { want: { ...selected.want, [product]: !selected.want[product] } });
  };

  const appendNote = (text) => {
    if (!selected) return;
    const notes = selected.notes ? `${selected.notes}; ${text}` : text;
    patchProject(selected.id, { notes: notes.slice(0, 800) });
  };

  const collect = (product) => projects
    .filter((p) => p.results[product].image)
    .map((p) => ({ project: p, src: p.results[product].image }));

  const sendCoversToPdf = async () => {
    const items = projects.flatMap((p) => [
      p.results.cover.image && { name: `${safeName(p.name)}-obkladynka.jpg`, src: p.results.cover.image },
      p.results.back.image && { name: `${safeName(p.name)}-zadnya.jpg`, src: p.results.back.image, isBackCover: true }
    ].filter(Boolean));
    if (!items.length) return alert('Немає готових обкладинок.');
    if (!(await openInNewTab('pdf', items))) onSendToPdf(items);
  };

  const sendSheets = async () => {
    const items = [
      ...collect('calendar').map(({ project, src }) => ({ kind: 'calendar', name: `${safeName(project.name)}-kalendar.jpg`, src })),
      ...collect('stickers').map(({ project, src }) => ({ kind: 'sticker', name: `${safeName(project.name)}-naklejky.jpg`, src }))
    ];
    if (!items.length) return alert('Немає готових календариків або наклейок.');
    if (!(await openInNewTab('sheets', items))) onSendToSheets(items);
  };

  const downloadChild = async (project) => {
    const zip = new JSZip();
    PRODUCTS.forEach((product) => {
      const image = project.results[product.id].image;
      if (image) zip.file(`${safeName(project.name)}-${product.file}.jpg`, image.split(',')[1], { base64: true });
    });
    if (!Object.keys(zip.files).length) return alert('Немає готових зображень.');
    saveAs(await zip.generateAsync({ type: 'blob' }), `${safeName(project.name)}.zip`);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    projects.forEach((p) => {
      PRODUCTS.forEach((product) => {
        const image = p.results[product.id].image;
        if (image) zip.file(`${safeName(p.name)}/${product.file}.jpg`, image.split(',')[1], { base64: true });
      });
    });
    if (!Object.keys(zip.files).length) return alert('Немає готових зображень.');
    saveAs(await zip.generateAsync({ type: 'blob' }), 'personalizovani-maketi.zip');
  };

  const sendMessage = async (text = draft) => {
    const content = text.trim();
    if (!content || isChatBusy) return;
    const userMessage = { id: crypto.randomUUID(), role: 'user', text: content };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft('');
    setIsChatBusy(true);
    try {
      const data = await askAssistant(
        history.filter((m) => m.id !== 'welcome').map(({ role, text: t }) => ({ role, text: t })),
        selected ? { name: selected.name, age: selected.age, theme: selected.theme, style: selected.style, notes: selected.notes } : {}
      );
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: data.reply, suggestions: data.suggestions || [] }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: `Не вдалося отримати підказку: ${error.message}`, suggestions: [] }]);
    } finally {
      setIsChatBusy(false);
    }
  };

  const readyCount = projects.reduce((sum, p) => sum + PRODUCTS.filter((x) => p.results[x.id].image).length, 0);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f5fb] text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-white px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Назад до меню" className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
            <ArrowLeft size={19} />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Sparkles size={21} /></div>
          <div>
            <h1 className="font-bold leading-tight">AI-студія персоналізації</h1>
            <p className="text-xs text-slate-500">Обкладинки · календарики · наклейки з фото дитини</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Якість генерації" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
            {QUALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {isRunning ? (
            <button type="button" onClick={() => { stopRef.current = true; }} className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600">
              <Square size={14} /> Зупинити після поточного
            </button>
          ) : (
            <button type="button" disabled={!projects.length} onClick={runQueue} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              <Play size={14} /> Запустити чергу
            </button>
          )}
          <button type="button" disabled={!readyCount} onClick={downloadZip} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-40">
            <Download size={14} /> ZIP
          </button>
          <button type="button" disabled={!readyCount} onClick={sendCoversToPdf} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40">
            <FileText size={14} /> Обкладинки → PDF
          </button>
          <button type="button" disabled={!readyCount} onClick={sendSheets} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
            <Layers size={14} /> Календарики й наклейки → PDF
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1700px] flex-1 gap-5 p-4 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Черга ({projects.length})</p>
          <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-200 px-3 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-50">
            <Plus size={16} /> Додати фото дітей
            <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
          </label>
          {projects.length > 1 && (
            <select value="" onChange={(e) => { applyTemplateToAll(e.target.value); }} aria-label="Шаблон для всіх" className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">
              <option value="">Шаблон для всіх дітей…</option>
              {THEME_PRESETS.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
            </select>
          )}
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className={`rounded-xl border p-2 ${p.id === selectedId ? 'border-violet-300 bg-violet-50' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelectedId(p.id)} className="shrink-0" aria-label="Обрати дитину">
                    <img src={p.photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      value={p.name}
                      maxLength={40}
                      onFocus={() => setSelectedId(p.id)}
                      onChange={(e) => patchProject(p.id, { name: e.target.value })}
                      placeholder="Ім’я *"
                      aria-label="Ім’я дитини"
                      className={`w-full rounded-md border bg-white px-2 py-1 text-xs outline-none focus:border-violet-300 ${showErrors && !p.name.trim() ? 'border-rose-400' : 'border-slate-200'}`}
                    />
                    <select
                      value={THEME_PRESETS.find((t) => t.value === p.theme)?.label || ''}
                      onChange={(e) => applyTemplate(p.id, e.target.value)}
                      aria-label="Шаблон"
                      className={`w-full rounded-md border bg-white px-1.5 py-1 text-xs ${showErrors && !p.theme.trim() ? 'border-rose-400' : 'border-slate-200'}`}
                    >
                      <option value="">{p.theme.trim() ? 'Власна тема' : 'Шаблон *'}</option>
                      {THEME_PRESETS.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => removeProject(p.id)} aria-label="Видалити" className="self-start rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button>
                </div>
                <span className="mt-1.5 flex gap-1">
                  {PRODUCTS.map((x) => {
                    const status = p.results[x.id].status;
                    return (
                      <span key={x.id} title={x.short} className={`h-2 w-5 rounded-full ${status === 'done' ? 'bg-emerald-400' : status === 'working' ? 'animate-pulse bg-violet-400' : status === 'error' ? 'bg-rose-400' : 'bg-slate-200'}`} />
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
          {!projects.length && <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">Одне фото = одна дитина. Для кожної вкажіть ім’я та шаблон (новорічна, день народження…), потім запустіть чергу.</p>}
        </aside>

        <section className="min-w-0">
          {!selected ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-200 bg-white/60 text-center text-slate-400">
              <ImagePlus size={40} strokeWidth={1.4} />
              <p className="text-sm">Завантажте фото дитини, щоб почати</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
                  <img src={selected.photoUrl} alt="Фото дитини" className="h-28 w-28 rounded-xl object-cover" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium text-slate-500 sm:col-span-1">Ім’я на макетах
                      <input value={selected.name} maxLength={40} onChange={(e) => patchProject(selected.id, { name: e.target.value })} placeholder="Наприклад: Моніка" className={`${inputClass} mt-1`} />
                    </label>
                    <label className="text-xs font-medium text-slate-500">Вік (необов’язково)
                      <input value={selected.age} maxLength={30} onChange={(e) => patchProject(selected.id, { age: e.target.value })} placeholder="3 рочки" className={`${inputClass} mt-1`} />
                    </label>
                    <label className="text-xs font-medium text-slate-500">Рік календарика
                      <input type="number" min={2024} max={2100} value={selected.year} onChange={(e) => patchProject(selected.id, { year: Number(e.target.value) || 2027 })} className={`${inputClass} mt-1`} />
                    </label>
                  </div>
                </div>

                <p className="mb-2 mt-4 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Шаблон / тема</span>
                  <button type="button" onClick={() => downloadChild(selected)} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50">
                    <Download size={12} /> Усі фото дитини (ZIP)
                  </button>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_PRESETS.map((t) => (
                    <Chip key={t.label} active={selected.theme === t.value} onClick={() => patchProject(selected.id, { theme: t.value, palette: t.palette })}>{t.label}</Chip>
                  ))}
                </div>
                <textarea value={selected.theme} rows={2} maxLength={300} onChange={(e) => patchProject(selected.id, { theme: e.target.value })} placeholder="Або опишіть свою тему (можна українською)…" className={`${inputClass} mt-2`} />

                <p className="mb-2 mt-3 text-xs font-semibold text-slate-500">Стиль</p>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_PRESETS.map((s) => (
                    <Chip key={s.label} active={selected.style === s.value} onClick={() => patchProject(selected.id, { style: selected.style === s.value ? '' : s.value })}>{s.label}</Chip>
                  ))}
                </div>

                <label className="mt-3 block text-xs font-semibold text-slate-500">Побажання та деталі
                  <textarea value={selected.notes} rows={2} maxLength={800} onChange={(e) => patchProject(selected.id, { notes: e.target.value })} placeholder="Підказки з чату додаються сюди; можна редагувати вручну" className={`${inputClass} mt-1 font-normal`} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {PRODUCTS.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    project={selected}
                    busy={isRunning}
                    onGenerate={(id) => runJobs([{ id: selected.id, product: id }])}
                    onToggle={toggleWant}
                    onPick={pickVersion}
                  />
                ))}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                Спочатку створюється передня обкладинка — задня, календарик і наклейки беруть її стиль. Місяці й дати календарика малюються програмою, тому завжди точні.
                Якщо результат не подобається — натисніть «Ще варіант» після зміни побажань.
              </p>
            </div>
          )}
        </section>

        <section className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm lg:max-h-[calc(100vh-140px)]">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600"><MessageCircle size={18} /></div>
            <div>
              <h2 className="text-sm font-bold">Помічник дизайнера</h2>
              <p className="text-xs text-slate-500">{selected ? `Проєкт: ${selected.name || 'без імені'}` : 'Оберіть дитину в черзі'}</p>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <p className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-700'}`}>{m.text}</p>
                {m.suggestions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s) => (
                      <button type="button" key={s} disabled={!selected} onClick={() => appendNote(s)} title="Додати до побажань" className="rounded-full border border-violet-200 bg-white px-2.5 py-1.5 text-left text-[11px] text-violet-700 hover:bg-violet-50 disabled:opacity-40">
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isChatBusy && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Думаю…</p>}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {['Що додати для хлопчика 3 років?', 'Запропонуй яскравішу тему', 'Як зробити стиль ніжнішим?'].map((s) => (
                <Chip key={s} onClick={() => sendMessage(s)}>{s}</Chip>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-end gap-2 rounded-xl border border-slate-200 p-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={2}
                aria-label="Повідомлення помічнику"
                placeholder="Що змінити чи додати?"
                className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={!draft.trim() || isChatBusy} aria-label="Надіслати" className="rounded-lg bg-violet-600 p-2.5 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><Send size={16} /></button>
            </form>
            <p className="mt-2 text-center text-[10px] text-slate-400">Клікніть підказку «+» або кнопку «У побажання» — текст потрапить у побажання обраної дитини й врахується при створенні.</p>
            <button type="button" disabled={!selected || !draft.trim()} onClick={() => { appendNote(draft.trim()); setDraft(''); }} className="mt-2 w-full rounded-lg border border-violet-200 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40">
              У побажання (без запиту до помічника)
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
