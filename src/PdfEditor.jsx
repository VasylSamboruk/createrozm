import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { jsPDF } from 'jspdf';
import { FileUp, FileText, Download, Trash2, Layers, Image } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MagazinePreview from './components/MagazinePreview';
import A4PageEditor from './components/A4PageEditor';
import CoverUploadModal from './components/CoverUploadModal';
import { prepareA4Image } from './utils/prepareA4Image';
import { addQrToBackCover } from './utils/addQrToBackCover';

const loadPageImage = (src) => new Promise((resolve, reject) => {
  const image = new window.Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Не вдалося завантажити сторінку зображення.'));
  image.src = src;
});

export default function PdfEditor({ onBack, initialImages, onInitialImagesLoaded }) {
  const [pages, setPages] = useState([]);
  const [editingPage, setEditingPage] = useState(null);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [pdfImportProgress, setPdfImportProgress] = useState('');
  const [selectedPageId, setSelectedPageId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!initialImages?.length) return;
    let cancelled = false;

    Promise.all(initialImages.map(async ({ name, src }) => {
      const preparedImage = await prepareA4Image(src);
      return {
        id: crypto.randomUUID(),
        type: 'image',
        name,
        ...preparedImage
      };
    }))
      .then((newPages) => {
        if (!cancelled) {
          setPages((current) => [...current, ...newPages]);
          setSelectedPageId((current) => current || newPages[0]?.id || null);
          onInitialImagesLoaded?.();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Не вдалося передати AI-зображення у PDF:', error);
          alert(error?.message || 'Не вдалося додати AI-зображення у PDF.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialImages, onInitialImagesLoaded]);

  const handleApplyA4 = async (pageId, src) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    try {
      const prepared = page.isBackCover
        ? await addQrToBackCover(src)
        : { src, imgObj: await loadPageImage(src) };
      setPages((current) =>
        current.map((item) => item.id === pageId
          ? { ...item, ...prepared, sourceSrc: page.sourceSrc || page.src, a4Prepared: true }
          : item)
      );
    } catch (error) {
      console.error('Не вдалося оновити сторінку A4:', error);
      alert(error?.message || 'Не вдалося оновити сторінку A4.');
    }
  };

  // Завантаження файлів (в кінець)
  // Завантаження файлів з автоматичною оптимізацією для друкарні (300 DPI)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      const newPages = await Promise.all(files.map(async (file) => {
        const sourceUrl = URL.createObjectURL(file);
        try {
          return {
            id: crypto.randomUUID(),
            type: 'image',
            name: file.name,
            ...await prepareA4Image(sourceUrl)
          };
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }
      }));
      setPages((prev) => [...prev, ...newPages]);
      setSelectedPageId((current) => current || newPages[0]?.id || null);
    } catch (error) {
      console.error('Не вдалося додати фото до журналу:', error);
      alert(error?.message || 'Не вдалося підготувати одне з фото для A4.');
    }
    e.target.value = ''; 
  };

  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingPdf(true);
    setPdfImportProgress('Читаю PDF…');

    try {
      const { importPdfPages } = await import('./utils/importPdfPages');
      const importedPages = await importPdfPages(file, (current, total) => {
        setPdfImportProgress(`Оброблено сторінок: ${current}/${total}`);
      });
      if (importedPages.length === 0) {
        throw new Error('У PDF немає сторінок для імпорту.');
      }
      setPages((current) => [...current, ...importedPages]);
      setSelectedPageId(importedPages[0].id);
    } catch (error) {
      console.error('Не вдалося імпортувати PDF:', error);
      alert(error?.message || 'Не вдалося відкрити PDF. Перевірте файл і спробуйте ще раз.');
    } finally {
      setIsImportingPdf(false);
      setPdfImportProgress('');
      event.target.value = '';
    }
  };

  const preparePageFromFile = async (file) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
      return {
        id: crypto.randomUUID(),
        type: 'image',
        name: file.name,
        ...await prepareA4Image(sourceUrl)
      };
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  const handleAddCovers = async (frontFile, backFile) => {
    try {
      const [frontCover, preparedBackCover] = await Promise.all([
        preparePageFromFile(frontFile),
        preparePageFromFile(backFile)
      ]);
      const backCover = {
        ...preparedBackCover,
        ...await addQrToBackCover(preparedBackCover.src),
        isBackCover: true
      };
      setPages((current) => [frontCover, ...current, backCover]);
      setSelectedPageId(frontCover.id);
      setIsCoverModalOpen(false);
    } catch (error) {
      console.error('Не вдалося додати обкладинки:', error);
      alert(error?.message || 'Не вдалося додати обкладинки.');
      throw error;
    }
  };

  // Вставка нового фото після конкретної сторінки
  const handleInsertPhoto = async (index, file) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
      const page = {
        id: crypto.randomUUID(),
        type: 'image',
        name: file.name,
        ...await prepareA4Image(sourceUrl)
      };
      setPages((current) => {
        const updated = [...current];
        updated.splice(index + 1, 0, page);
        return updated;
      });
      setSelectedPageId(page.id);
    } catch (error) {
      console.error('Не вдалося вставити фото до журналу:', error);
      alert(error?.message || 'Не вдалося підготувати фото для A4.');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  const handleReplacePage = async (index, file) => {
    const sourceUrl = URL.createObjectURL(file);
    try {
      const preparedPage = {
        id: crypto.randomUUID(),
        type: 'image',
        name: file.name,
        ...await prepareA4Image(sourceUrl)
      };
      const currentPage = pages[index];
      const replacement = currentPage?.isBackCover
        ? {
            ...preparedPage,
            ...await addQrToBackCover(preparedPage.src),
            isBackCover: true
          }
        : preparedPage;
      setPages((current) => current.map((page, pageIndex) =>
        pageIndex === index ? replacement : page
      ));
      setSelectedPageId(replacement.id);
    } catch (error) {
      console.error('Не вдалося замінити сторінку:', error);
      alert(error?.message || 'Не вдалося замінити сторінку.');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };

  // Розумний Авто-формат
  const handleAutoFormat = () => {
    if (pages.length === 0) return;
    const newPages = [];
    pages.forEach((page, index) => {
      newPages.push(page);
      if (page.type === 'image' && pages[index + 1]?.type !== 'blank') {
        newPages.push({ id: crypto.randomUUID(), type: 'blank' });
      }
    });
    setPages(newPages);
  };

  // Додавання білої сторінки вручну
  const handleAddBlank = (index) => {
    setPages((prev) => {
      const newPages = [...prev];
      newPages.splice(index + 1, 0, { id: crypto.randomUUID(), type: 'blank' });
      return newPages;
    });
  };

  const handleRemovePage = (id) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      const updated = current.filter((page) => page.id !== id);
      if (selectedPageId === id) {
        setSelectedPageId(updated[Math.min(index, updated.length - 1)]?.id || null);
      }
      return updated;
    });
  };
  const handleClearAll = () => {
    if (confirm('Видалити всі сторінки?')) {
      setPages([]);
      setSelectedPageId(null);
    }
  };

  // Drag & Drop
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Спеціальний ініціалізатор jsPDF з жорсткими стандартами друку (А4: 210 x 297 мм)
  const createPrintReadyPDF = () => {
    return new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });
  };

  // Додавання сторінки з ідеальним калібруванням під А4
  const addPageToPDF = (doc, page, isFirst) => {
    if (!isFirst) {
      doc.addPage('a4', 'portrait');
    }
    
    // Точні розміри сторінки А4 в міліметрах
    const pageWidth = 210;
    const pageHeight = 297;

    if (page.type === 'image' && page.imgObj) {
      const imgRatio = page.imgObj.width / page.imgObj.height;
      const pageRatio = pageWidth / pageHeight;
      let finalWidth, finalHeight, x, y;

      if (imgRatio > pageRatio) {
        finalHeight = pageHeight;
        finalWidth = pageHeight * imgRatio;
      } else {
        finalWidth = pageWidth;
        finalHeight = pageWidth / imgRatio;
      }
      x = (pageWidth - finalWidth) / 2;
      y = (pageHeight - finalHeight) / 2;

      // Використовуємо 'SLOW' або 'MEDIUM' замість 'FAST' для максимальної якості друку
      doc.addImage(page.src, 'JPEG', x, y, finalWidth, finalHeight, undefined, 'MEDIUM');
    }
  };

  // ЕКСПОРТ 3: Повний PDF (Пружина / Кратне 4)
  const exportFullPDF = () => {
    if (pages.length === 0) return alert('Додайте сторінки!');
    const fileName = prompt('Введіть назву для вашого PDF:', 'Miy-Zhurnal');
    if (!fileName) return;
    
    const doc = createPrintReadyPDF();
    pages.forEach((page, i) => addPageToPDF(doc, page, i === 0, false));
    doc.save(`${fileName}.pdf`);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
      
      <header className="bg-white/70 backdrop-blur-xl border-b border-white/40 shadow-sm px-6 py-3 z-20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          
          <div className="flex gap-2">
            <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer font-medium text-sm flex items-center gap-2 transition-all shadow-md active:scale-95">
              <FileUp size={16} /> + Завантажити
              <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <label className={`bg-violet-100 hover:bg-violet-200 text-violet-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all shadow-sm ${isImportingPdf ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
              <FileText size={16} />
              {isImportingPdf ? pdfImportProgress : 'Завантажити PDF'}
              <input type="file" accept="application/pdf,.pdf" onChange={handlePdfUpload} disabled={isImportingPdf} className="hidden" />
            </label>
            <button onClick={onBack} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-md active:scale-95 mr-4">
              ← В меню
            </button>
            <button onClick={handleAutoFormat} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
              <Layers size={16} /> Фото+Біла
            </button>
            <button onClick={handleClearAll} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-all active:scale-95">
              <Trash2 size={16} />
            </button>
          </div>
          
          <div className="flex gap-2 border-l border-slate-300 pl-4">
            <button onClick={() => setIsCoverModalOpen(true)} className="bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
              <Image size={16} /> Обкладинка
            </button>
            <button onClick={exportFullPDF} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-md active:scale-95">
              <Download size={16} /> ПОВНИЙ PDF
            </button>
          </div>

        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Sidebar
            pages={pages}
            onRemove={handleRemovePage}
            onAddBlank={handleAddBlank}
            onInsertPhoto={handleInsertPhoto}
            onReplacePage={handleReplacePage}
            onEditA4={setEditingPage}
            onSelectPage={setSelectedPageId}
            selectedPageId={selectedPageId}
          />
        </DndContext>
        
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <MagazinePreview
          pages={pages}
          selectedPageId={selectedPageId}
          onSelectPage={setSelectedPageId}
        />
      </main>

      {isCoverModalOpen && (
        <CoverUploadModal
          onClose={() => setIsCoverModalOpen(false)}
          onAddCovers={handleAddCovers}
        />
      )}

      {editingPage && (
        <A4PageEditor
          key={editingPage.id}
          page={editingPage}
          onClose={() => setEditingPage(null)}
          onApply={(src) => handleApplyA4(editingPage.id, src)}
        />
      )}
    </div>
  );
}