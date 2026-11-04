import { useCallback, useEffect, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  ArrowLeft,
  FileUp,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  Sliders,
  Wand2,
  Sparkles,
  Layers,
  RefreshCw,
  ScanFace,
  BookOpen,
  DollarSign,
  ExternalLink
} from 'lucide-react';

const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

const coloringOptions = [
  {
    key: 'thinLines',
    title: 'Тонші контури',
    description: 'Делікатні лінії для акуратного друку.',
    prompt: 'Use thin, delicate, clean black outlines.'
  },
  {
    key: 'simplifyBackground',
    title: 'Спростити фон',
    description: 'Менше дрібних деталей позаду людей.',
    prompt: 'Simplify the background and remove distracting minor details.'
  },
  {
    key: 'preserveScene',
    title: 'Зберегти важливі деталі фото',
    description: 'Залишити впізнавані предмети та оточення.',
    prompt: 'Preserve the recognizable important objects and background elements from the source photo.'
  },
  {
    key: 'largeColoringAreas',
    title: 'Більші ділянки для розфарбовування',
    description: 'Менше дрібної штриховки, більше чистих форм.',
    prompt: 'Create larger, clearly enclosed areas for coloring and avoid tiny details or hatching.'
  },
  {
    key: 'extraDetails',
    title: 'Більше деталей одягу й предметів',
    description: 'Додати чіткі, але не надто дрібні контури.',
    prompt: 'Add a little more clean, readable line-art detail to clothing and important objects without making the page cluttered.'
  }
];

const formatUah = (value) => (
  Number.isFinite(value)
    ? new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        maximumFractionDigits: 2
      }).format(value)
    : '—'
);

export default function AiColoringEditor({ onBack, onSendToPdf }) {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  const [batchSettings] = useState({
    style: 'children',
    lineWidth: 3,
    prompt: '',
    faceBoost: false,
    thinLines: false,
    simplifyBackground: false,
    preserveScene: false,
    largeColoringAreas: false,
    extraDetails: false
  });

  const loadUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    setUsageError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/coloring/usage`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status >= 500
            ? 'Не вдалося підключитися до API сервера. Перевірте, що сервер запущений.'
            : data?.error || `Помилка сервера: ${response.status}`
        );
      }
      setUsageInfo(data);
    } catch (error) {
      console.error('Не вдалося завантажити OpenAI usage:', error);
      setUsageError(error.message || 'Не вдалося завантажити витрати OpenAI.');
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
    const timer = window.setInterval(loadUsage, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadUsage]);

  const setFaceBoost = (id, value) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, settings: { ...i.settings, faceBoost: value } }
          : i
      )
    );
  };

  const updateItemSetting = (id, key, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, settings: { ...item.settings, [key]: value } }
          : item
      )
    );
  };

  const downloadVersion = async (item) => {
    const version = item.versions[item.activeVersionIndex];
    if (!version) return;
    const blob = await (await fetch(version.url)).blob();
    const base = item.name.replace(/\.[^/.]+$/, '');
    saveAs(blob, `${base}-rozmalovka-v${item.activeVersionIndex + 1}.png`);
  };

  // ============================================================
  // ЗАВАНТАЖЕННЯ ФОТО
  // ============================================================

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    const newItems = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      originalUrl: URL.createObjectURL(file),
      name: file.name,
      status: 'pending',
      progressText: 'В черзі',
      versions: [],
      activeVersionIndex: 0,
      settings: {
        ...batchSettings,
        prompt: ''
      }
    }));

    setItems((prev) => {
      const updated = [...prev, ...newItems];

      if (!activeId && updated.length > 0) {
        setActiveId(updated[0].id);
      }

      return updated;
    });

    e.target.value = '';
  };

  // ============================================================
  // ВИДАЛЕННЯ
  // ============================================================

  const removeItem = (id, e) => {
    e?.stopPropagation();

    setItems((prev) => {
      const filtered = prev.filter((item) => item.id !== id);

      if (activeId === id) {
        const removedIndex = prev.findIndex((i) => i.id === id);

        const nextActive =
          filtered[removedIndex] ||
          filtered[removedIndex - 1] ||
          filtered[0] ||
          null;

        setActiveId(nextActive ? nextActive.id : null);
      }

      return filtered;
    });
  };

  // ============================================================
  // ГЕНЕРАЦІЯ ОДНОГО ЗОБРАЖЕННЯ
  // ============================================================

  const generateColoring = async (item) => {
    if (!item?.file) {
      throw new Error('Оригінальне фото не знайдено');
    }

    const formData = new FormData();

    // Саме оригінальне фото передається на backend
    formData.append('image', item.file);

    formData.append('prompt', item.settings?.prompt || '');

    formData.append(
      'lineWidth',
      item.settings?.thinLines ? 'thin' : 'medium'
    );

    formData.append(
      'style',
      item.settings?.style || 'children'
    );

    formData.append(
      'faceBoost',
      item.settings?.faceBoost ? '1' : '0'
    );
    const selectedOptionPrompts = coloringOptions
      .filter((option) => item.settings?.[option.key])
      .map((option) => option.prompt);
    formData.append('options', JSON.stringify(selectedOptionPrompts));

    const response = await fetch(`${apiBaseUrl}/api/coloring`, {
      method: 'POST',
      body: formData
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Сервер повернув некоректну відповідь (${response.status})`
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Помилка сервера: ${response.status}`
      );
    }

    if (!data?.image) {
      throw new Error('AI не повернув готове зображення');
    }

    return {
      image: data.image,
      tokenUsage: data.tokenUsage,
      quality: data.quality,
      elapsedSeconds: data.elapsedSeconds
    };
  };

  // ============================================================
  // ОБРОБКА ЧЕРГИ
  // ============================================================

  const startQueueProcessing = async (includeCompleted = false) => {
    if (items.length === 0 || isProcessingAll || items.some((item) => item.status === 'processing')) return;

    setIsProcessingAll(true);

    const pendingItems = items.filter((item) =>
      includeCompleted
        ? item.status === 'completed'
        : item.status === 'pending' || item.status === 'error'
    );

    for (const item of pendingItems) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'processing',
                progressText: includeCompleted
                  ? 'Перегенерація...'
                  : 'AI створює розмальовку...'
              }
            : i
        )
      );

      try {
        const result = await generateColoring(item);
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;

            const newVersion = {
              id: crypto.randomUUID(),
              url: result.image,
              prompt: i.settings.prompt,
              settings: { ...i.settings },
              tokenUsage: result.tokenUsage,
              elapsedSeconds: result.elapsedSeconds
            };

            const updatedVersions = [
              ...i.versions,
              newVersion
            ];

            return {
              ...i,
              status: 'completed',
              progressText: 'Готово',
              versions: updatedVersions,
              activeVersionIndex:
                updatedVersions.length - 1
            };
          })
        );
      } catch (error) {
        console.error(
          `Помилка обробки ${item.name}:`,
          error
        );

        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'error',
                  progressText:
                    error?.message || 'Помилка API'
                }
              : i
          )
        );
      }
    }

    setIsProcessingAll(false);
  };

  // ============================================================
  // ПЕРЕГЕНЕРАЦІЯ ОДНОГО ФОТО
  // ============================================================

  const handleRegenerateSingle = async (id) => {
    if (isProcessingAll) return;
    const targetItem = items.find(
      (item) => item.id === id
    );

    if (!targetItem || targetItem.status === 'processing') return;

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: 'processing',
              progressText: 'Перегенерація...'
            }
          : i
      )
    );

    try {
      const result = await generateColoring(targetItem);
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;

          const newVersion = {
            id: crypto.randomUUID(),
            url: result.image,
            prompt: i.settings.prompt,
            settings: { ...i.settings },
            tokenUsage: result.tokenUsage,
            elapsedSeconds: result.elapsedSeconds
          };

          const updatedVersions = [
            ...i.versions,
            newVersion
          ];

          return {
            ...i,
            status: 'completed',
            progressText: 'Готово',
            versions: updatedVersions,
            activeVersionIndex:
              updatedVersions.length - 1
          };
        })
      );
    } catch (error) {
      console.error(
        'Помилка перегенерації:',
        error
      );

      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: 'error',
                progressText:
                  error?.message || 'Помилка'
              }
            : i
        )
      );
    }
  };

  const handleRegenerateAll = () => {
    const completedItems = items.filter((item) => item.status === 'completed');
    if (!completedItems.length || isProcessingAll) return;
    if (window.confirm(`Перегенерувати готові сторінки (${completedItems.length})? Це створить нові платні версії. Фактичні витрати з'являться у звіті OpenAI після оновлення.`)) {
      startQueueProcessing(true);
    }
  };

  // ============================================================
  // ZIP
  // ============================================================

  const handleDownloadZip = async () => {
    const completedItems = items.filter(
      (i) =>
        i.status === 'completed' &&
        i.versions.length > 0
    );

    if (completedItems.length === 0) {
      alert('Немає готових розмальовок!');
      return;
    }

    const zip = new JSZip();

    for (
      let idx = 0;
      idx < completedItems.length;
      idx++
    ) {
      const item = completedItems[idx];

      const activeVer =
        item.versions[item.activeVersionIndex];

      if (!activeVer) continue;

      try {
        const response = await fetch(
          activeVer.url
        );

        if (!response.ok) {
          throw new Error(
            'Не вдалося завантажити результат'
          );
        }

        const blob =
          await response.blob();

        const originalName =
          item.name
            .replace(/\.[^/.]+$/, '')
            .replace(/[^\wа-яА-ЯіІїЇєЄґҐ-]/g, '_');

        zip.file(
          `${originalName}_coloring.png`,
          blob
        );
      } catch (err) {
        console.error(
          'Помилка додавання в ZIP:',
          err
        );
      }
    }

    const content =
      await zip.generateAsync({
        type: 'blob'
      });

    saveAs(
      content,
      'AI_Coloring_Pages.zip'
    );
  };

  const handleSendToPdf = () => {
    const completedImages = items.flatMap((item) => {
      if (item.status !== 'completed' || item.versions.length === 0) return [];
      const activeVersion = item.versions[item.activeVersionIndex];
      return activeVersion?.url
        ? [{ name: item.name, src: activeVersion.url }]
        : [];
    });

    if (completedImages.length > 0) onSendToPdf(completedImages);
  };

  // ============================================================
  // АКТИВНЕ ФОТО
  // ============================================================

  const activeItem = items.find(
    (item) => item.id === activeId
  );
  const pendingCount = items.filter((item) => item.status === 'pending' || item.status === 'error').length;
  const completedCount = items.filter((item) => item.status === 'completed').length;

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0f19] text-slate-100 overflow-hidden font-sans select-none">

      {/* TOP BAR */}
      <header className="h-16 bg-[#111827]/80 backdrop-blur-xl border-b border-slate-800 px-6 flex justify-between items-center z-30 flex-shrink-0">

        <div className="flex items-center gap-4">

          <button
            onClick={onBack}
            className="bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl font-medium text-xs flex items-center gap-2 transition-all border border-slate-700/50 active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={14} />
            Назад
          </button>

          <div className="flex items-center gap-2">

            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <Sparkles
                size={16}
                className="text-white"
              />
            </div>

            <span className="font-bold text-sm tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              NEO COLORING STUDIO
            </span>

          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden xl:flex flex-col items-end text-[10px] leading-tight text-slate-400">
            <span>Сьогодні: {usageInfo?.available ? formatUah(usageInfo.spendUah) : 'OpenAI usage'}</span>
            <a
              href="https://platform.openai.com/usage"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-violet-300 hover:text-violet-200"
            >
              Звіт OpenAI <ExternalLink size={10} />
            </a>
          </div>

          {completedCount > 0 && (
            <button
              type="button"
              onClick={handleRegenerateAll}
              disabled={isProcessingAll}
              className="flex items-center gap-2 rounded-xl border border-violet-700/70 bg-violet-950/50 px-3 py-2 text-xs font-semibold text-violet-200 transition-all hover:bg-violet-900/70 disabled:opacity-40"
            >
              <RefreshCw size={13} />
              Перегенерувати готові ({completedCount})
            </button>
          )}

          {/* UPLOAD */}
          <label className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl cursor-pointer font-semibold text-xs flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">

            <FileUp size={14} />

            Завантажити пачку фото

            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />

          </label>

          {/* GENERATE */}
          <button
            onClick={startQueueProcessing}
            disabled={
              isProcessingAll ||
              pendingCount === 0
            }
            className="bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-fuchsia-600/30 active:scale-95 cursor-pointer"
          >

            {isProcessingAll ? (
              <Loader2
                size={14}
                className="animate-spin"
              />
            ) : (
              <Sparkles size={14} />
            )}

            {isProcessingAll
              ? 'Обробка черги...'
              : `Запустити генерацію${pendingCount ? ` (${pendingCount})` : ''}`}

          </button>

          <button
            type="button"
            onClick={handleSendToPdf}
            disabled={
              items.filter(
                (item) => item.status === 'completed' && item.versions.length > 0
              ).length === 0
            }
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition-all hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BookOpen size={14} />
            У PDF ({items.filter(
              (item) => item.status === 'completed' && item.versions.length > 0
            ).length})
          </button>

          {/* ZIP */}
          <button
            onClick={handleDownloadZip}
            disabled={
              items.filter(
                (i) => i.status === 'completed'
              ).length === 0
            }
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <Download size={14} />
            ZIP
          </button>

        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 flex overflow-hidden relative">

        <section className="flex-1 flex flex-col h-full bg-[#0d1322] relative overflow-hidden">

          {activeItem ? (

            <div className="absolute inset-0 flex flex-col p-6">

              {/* HEADER */}
              <div className="flex justify-between items-center mb-4 bg-[#161f33]/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-800 shadow-xl flex-shrink-0">

                <div className="flex items-center gap-3">

                  <span className="text-xs font-bold text-violet-400 bg-violet-950/80 px-2.5 py-1 rounded-lg border border-violet-800/50">
                    {activeItem.name}
                  </span>

                  <span className="text-xs text-slate-400 flex items-center gap-1.5">

                    {activeItem.status ===
                      'completed' && (
                      <CheckCircle2
                        size={13}
                        className="text-emerald-400"
                      />
                    )}

                    {activeItem.status ===
                      'processing' && (
                      <Loader2
                        size={13}
                        className="text-fuchsia-400 animate-spin"
                      />
                    )}

                    {activeItem.progressText}

                  </span>

                </div>

                {/* VERSIONS */}
                {activeItem.versions.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-medium">

                    <span className="text-slate-400 mr-1">
                      Версія:
                    </span>

                    {activeItem.versions.map(
                      (_, idx) => (
                        <button
                          key={idx}
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id ===
                                activeItem.id
                                  ? {
                                      ...i,
                                      activeVersionIndex:
                                        idx
                                    }
                                  : i
                              )
                            )
                          }
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeItem.activeVersionIndex ===
                            idx
                              ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold shadow-md'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      )
                    )}

                  </div>
                )}

              </div>

              {/* ORIGINAL + RESULT */}
              <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">

                {/* ORIGINAL */}
                <div className="bg-[#111827]/40 backdrop-blur-md border border-slate-800/80 rounded-3xl p-5 flex flex-col shadow-2xl relative overflow-hidden">

                  <div className="absolute top-4 left-5 z-10 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold tracking-wider text-slate-300 uppercase border border-white/10">
                    Оригінал
                  </div>

                  <div className="flex-1 flex items-center justify-center overflow-hidden rounded-2xl">

                    <img
                      src={activeItem.originalUrl}
                      alt="Original"
                      className="max-h-full max-w-full object-contain drop-shadow-2xl"
                    />

                  </div>

                </div>

                {/* RESULT */}
                <div className="bg-[#111827]/40 backdrop-blur-md border border-slate-800/80 rounded-3xl p-5 flex flex-col shadow-2xl relative overflow-hidden">

                  <div className="absolute top-4 left-5 z-10 bg-fuchsia-950/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold tracking-wider text-fuchsia-300 uppercase border border-fuchsia-500/30 flex items-center gap-1.5">
                    <Sparkles size={11} />
                    Розмальовка AI
                  </div>

                  <div className="flex-1 flex items-center justify-center overflow-hidden rounded-2xl bg-white/5 border border-white/5">

                    {activeItem.versions.length > 0 ? (

                      <img
                        src={
                          activeItem.versions[
                            activeItem
                              .activeVersionIndex
                          ]?.url
                        }
                        alt="Coloring page"
                        className="max-h-full max-w-full object-contain drop-shadow-2xl"
                      />

                    ) : (

                      <div className="text-slate-500 text-xs text-center p-6 flex flex-col items-center gap-3">

                        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 shadow-inner">
                          <Wand2
                            size={20}
                            className="animate-pulse"
                          />
                        </div>

                        <span>
                          Натисніть «Запустити
                          генерацію», щоб
                          отримати розмальовку
                        </span>

                      </div>

                    )}

                  </div>

                </div>

              </div>

            </div>

          ) : (

            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">

              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shadow-2xl">
                <FileUp size={28} />
              </div>

              <p className="text-sm font-medium text-slate-400">
                Завантажте фото пачкою,
                щоб відкрити студію
              </p>

            </div>

          )}

        </section>

        {/* RIGHT PANEL */}
        {activeItem && (
          <aside className="w-80 bg-[#111827]/90 backdrop-blur-2xl border-l border-slate-800 p-6 flex flex-col gap-6 z-20 shadow-2xl overflow-y-auto flex-shrink-0">

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                  <DollarSign size={14} className="text-emerald-400" />
                  Фактичні витрати
                </h3>
                <button
                  type="button"
                  onClick={loadUsage}
                  disabled={isLoadingUsage}
                  title="Оновити звіт"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isLoadingUsage ? 'animate-spin' : ''} />
                </button>
              </div>
              {usageInfo?.available ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg bg-slate-950/70 p-2">
                      <span className="text-slate-500">Витрати сьогодні</span>
                      <p className="mt-1 font-bold text-amber-300">{formatUah(usageInfo.spendUah)}</p>
                      <p className="text-slate-500">
                        {Number.isFinite(usageInfo.spendUsd) ? `$${usageInfo.spendUsd.toFixed(4)}` : 'ще немає звіту'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-950/70 p-2">
                      <span className="text-slate-500">Середнє на сторінку</span>
                      <p className="mt-1 font-bold text-emerald-300">{formatUah(usageInfo.averagePerImageUah)}</p>
                      <p className="text-slate-500">{usageInfo.images} сторінок за звітом</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                    OpenAI Usage API не повертає токени для генерації зображень. Тут фактична сума з Costs API та середня на одне зображення за сьогодні
                    {usageInfo.projectScoped ? ' у вибраному проєкті' : ' в організації'}. Звіт OpenAI може оновлюватися із затримкою.
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Курс: 1 USD = {Number.isFinite(usageInfo.usdToUah) ? usageInfo.usdToUah.toFixed(2) : '—'} грн ({usageInfo.currencyRateSource === 'NBU' ? 'НБУ' : '.env'})
                  </p>
                </>
              ) : (
                <p role="status" className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  {usageError || usageInfo?.reason || 'Завантажую звіт OpenAI…'}
                </p>
              )}
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-300 hover:text-violet-200"
              >
                Відкрити звіт OpenAI <ExternalLink size={10} />
              </a>
            </section>

            <div>

              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
                <Sliders
                  size={14}
                  className="text-violet-400"
                />
                Налаштування
              </h3>

              <div className="flex flex-col gap-4">

                <div className="flex flex-col gap-2">
                  {coloringOptions.map((option) => (
                    <label
                      key={option.key}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        activeItem.settings?.[option.key]
                          ? 'border-violet-500/60 bg-violet-950/30'
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(activeItem.settings?.[option.key])}
                        onChange={(event) => updateItemSetting(activeItem.id, option.key, event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-violet-500"
                      />
                      <span>
                        <span className="block text-xs font-semibold text-slate-100">{option.title}</span>
                        <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-400">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="block text-xs font-semibold text-slate-300">
                  Додаткові побажання до малюнка
                  <textarea
                    value={activeItem.settings?.prompt || ''}
                    onChange={(event) => updateItemSetting(activeItem.id, 'prompt', event.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Наприклад: спростити фон, додати більше великих ділянок для розфарбовування…"
                    className="mt-1 w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white outline-none focus:border-violet-500"
                  />
                  <span className="mt-1 block text-right text-[10px] font-normal text-slate-500">
                    {(activeItem.settings?.prompt || '').length}/2000
                  </span>
                </label>

                <label
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    activeItem.settings?.faceBoost
                      ? 'border-fuchsia-500/60 bg-fuchsia-950/30 shadow-lg shadow-fuchsia-600/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(activeItem.settings?.faceBoost)}
                      onChange={(e) =>
                        setFaceBoost(activeItem.id, e.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 accent-fuchsia-500"
                    />
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                        <ScanFace size={14} className="text-fuchsia-400" />
                        Краща схожість облич
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        Для цього фото: більша вхідна картинка, вища якість і суворіша вимога копіювати риси обличчя.
                        Трохи дорожче й повільніше — вмикайте, якщо результат несхожий.
                      </p>
                    </div>
                  </div>
                </label>

                <button
                  onClick={() =>
                    handleRegenerateSingle(
                      activeItem.id
                    )
                  }
                  disabled={
                    isProcessingAll ||
                    activeItem.status === 'processing'
                  }
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-600/30 active:scale-95 cursor-pointer"
                >

                  {activeItem.status ===
                  'processing' ? (
                    <Loader2
                      size={14}
                      className="animate-spin"
                    />
                  ) : (
                    <RefreshCw size={14} />
                  )}

                  {activeItem.settings?.faceBoost
                    ? 'Перегенерувати з кращою схожістю'
                    : 'Перегенерувати це фото'}

                </button>

                <button
                  onClick={() => downloadVersion(activeItem)}
                  disabled={activeItem.versions.length === 0}
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all border border-slate-700 active:scale-95 cursor-pointer"
                >
                  <Download size={14} />
                  Завантажити цю версію
                </button>

                {activeItem.versions.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Версії ({activeItem.versions.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {activeItem.versions.map((version, idx) => (
                        <button
                          key={version.id}
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === activeItem.id
                                  ? { ...i, activeVersionIndex: idx }
                                  : i
                              )
                            )
                          }
                          className={`relative aspect-[2/3] overflow-hidden rounded-lg border-2 bg-white transition-all cursor-pointer ${
                            activeItem.activeVersionIndex === idx
                              ? 'border-fuchsia-500 shadow-lg shadow-fuchsia-500/20'
                              : 'border-slate-800 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={version.url} alt={`Версія ${idx + 1}`} className="h-full w-full object-contain" />
                          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[9px] font-bold text-white">
                            {idx + 1}
                          </span>
                          {version.settings?.faceBoost && (
                            <span title="Краща схожість" className="absolute bottom-1 right-1 rounded bg-fuchsia-600 p-0.5 text-white">
                              <ScanFace size={10} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {activeItem.versions[activeItem.activeVersionIndex]?.tokenUsage && (
                  <p className="text-[10px] text-slate-500">
                    Токени за версію:{' '}
                    {activeItem.versions[activeItem.activeVersionIndex].tokenUsage.totalTokens ?? '—'}
                  </p>
                )}

              </div>

            </div>

          </aside>
        )}

      </main>

      {/* QUEUE */}
      <footer className="h-24 bg-[#111827]/90 backdrop-blur-xl border-t border-slate-800 px-6 flex items-center gap-3 overflow-x-auto z-30 shadow-2xl flex-shrink-0">

        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 mr-2 flex items-center gap-1.5">

          <Layers
            size={14}
            className="text-violet-400"
          />

          Черга ({items.length}):

        </div>

        {items.length === 0 ? (

          <span className="text-xs text-slate-600 italic">
            Черга порожня
          </span>

        ) : (

          items.map((item, index) => {

            const isActive =
              item.id === activeId;

            return (

              <div
                key={item.id}
                onClick={() =>
                  setActiveId(item.id)
                }
                className={`relative w-16 h-16 rounded-2xl overflow-hidden cursor-pointer flex-shrink-0 transition-all border-2 group ${
                  isActive
                    ? 'border-violet-500 scale-105 shadow-xl shadow-violet-500/20 ring-2 ring-violet-500/20'
                    : 'border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-100'
                }`}
              >

                <img
                  src={item.originalUrl}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                />

                <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold pointer-events-none">
                  #{index + 1}
                </div>

                {item.settings?.faceBoost && (
                  <div
                    className="absolute bottom-1 left-1 rounded-full bg-fuchsia-600 p-0.5 text-white pointer-events-none"
                    title="Краща схожість облич"
                  >
                    <ScanFace size={10} />
                  </div>
                )}

                <div className="absolute bottom-1 right-1 pointer-events-none">

                  {item.status ===
                    'completed' && (
                    <div
                      className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm border border-black"
                      title="Готово"
                    />
                  )}

                  {item.status ===
                    'processing' && (
                    <div
                      className="w-3 h-3 rounded-full bg-fuchsia-500 animate-pulse border border-black"
                      title="Обробка"
                    />
                  )}

                  {item.status === 'error' && (
                    <div
                      className="w-3 h-3 rounded-full bg-red-500 border border-black"
                      title={item.progressText}
                    />
                  )}

                </div>

                <button
                  onClick={(e) =>
                    removeItem(item.id, e)
                  }
                  title="Видалити з черги"
                  className="absolute top-1 right-1 bg-red-600 hover:bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md cursor-pointer z-10"
                >
                  <Trash2 size={10} />
                </button>

              </div>

            );
          })

        )}

      </footer>

    </div>
  );
}