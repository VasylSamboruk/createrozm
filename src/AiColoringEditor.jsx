import { useState } from 'react';
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
  RefreshCw
} from 'lucide-react';

export default function AiColoringEditor({ onBack }) {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  const [batchSettings] = useState({
    style: 'children',
    lineWidth: 3,
    prompt: ''
  });

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

    // Налаштування
    formData.append(
      'prompt',
      `
Transform the uploaded portrait photo into a beautiful printable children's coloring book page.

IMPORTANT:
- Preserve the identity, pose, facial features, hairstyle, clothing and main composition of the people from the uploaded photo.
- Do NOT create a completely different person.
- Convert the actual uploaded photo into line art.
- Black and white coloring page.
- Clean white background.
- Clear black outlines.
- Smooth elegant contours.
- No color.
- No gray shading.
- No gradients.
- No shadows.
- No realistic photographic textures.
- Remove unnecessary background details.
- Keep important objects and people recognizable.
- Make the result suitable for printing and hand coloring.
- Professional children's coloring book illustration.
- Clean vector-like line art.
- Avoid excessive tiny details.

${item.settings?.prompt || ''}
      `.trim()
    );

    formData.append(
      'lineWidth',
      String(item.settings?.lineWidth || 3)
    );

    formData.append(
      'style',
      item.settings?.style || 'children'
    );

    const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
    const response = await fetch(`${apiBaseUrl}/api/coloring`, {
      method: 'POST',
      body: formData
    });

    let data = null;

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

    // Backend повертає data URL
    return data.image;
  };

  // ============================================================
  // ОБРОБКА ЧЕРГИ
  // ============================================================

  const startQueueProcessing = async () => {
    if (items.length === 0 || isProcessingAll) return;

    setIsProcessingAll(true);

    const pendingItems = items.filter(
      (item) =>
        item.status === 'pending' ||
        item.status === 'error'
    );

    for (const item of pendingItems) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'processing',
                progressText: 'AI створює розмальовку...'
              }
            : i
        )
      );

      try {
        const resultUrl = await generateColoring(item);

        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i;

            const newVersion = {
              id: crypto.randomUUID(),
              url: resultUrl,
              prompt: i.settings.prompt,
              settings: { ...i.settings }
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
    const targetItem = items.find(
      (item) => item.id === id
    );

    if (!targetItem) return;

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
      const resultUrl =
        await generateColoring(targetItem);

      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;

          const newVersion = {
            id: crypto.randomUUID(),
            url: resultUrl,
            prompt: i.settings.prompt,
            settings: { ...i.settings }
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

  // ============================================================
  // АКТИВНЕ ФОТО
  // ============================================================

  const activeItem = items.find(
    (item) => item.id === activeId
  );

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
              items.length === 0
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
              : 'Запустити генерацію'}

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

            <div>

              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
                <Sliders
                  size={14}
                  className="text-violet-400"
                />
                Налаштування
              </h3>

              <div className="flex flex-col gap-4">

                <button
                  onClick={() =>
                    handleRegenerateSingle(
                      activeItem.id
                    )
                  }
                  disabled={
                    activeItem.status ===
                    'processing'
                  }
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-600/30 active:scale-95 cursor-pointer mt-2"
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

                  Перегенерувати це фото

                </button>

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