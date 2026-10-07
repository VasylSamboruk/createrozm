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
import { FileUp, Download, Trash2, Layers, BookOpen, Printer, Image } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MagazinePreview from './components/MagazinePreview';
import A4PageEditor from './components/A4PageEditor';
import CoverUploadModal from './components/CoverUploadModal';
import { prepareA4Image } from './utils/prepareA4Image';

export default function PdfEditor({ onBack, initialImages, onInitialImagesLoaded }) {
  const [pages, setPages] = useState([]);
  const [editingPage, setEditingPage] = useState(null);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
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
    const imgObj = new window.Image();
    await new Promise((resolve, reject) => {
      imgObj.onload = resolve;
      imgObj.onerror = () => reject(new Error('Не вдалося оновити сторінку A4.'));
      imgObj.src = src;
    });
    setPages((current) =>
      current.map((page) => page.id === pageId
        ? { ...page, src, sourceSrc: page.sourceSrc || page.src, imgObj, a4Prepared: true }
        : page)
    );
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
      const [frontCover, backCover] = await Promise.all([
        preparePageFromFile(frontFile),
        preparePageFromFile(backFile)
      ]);
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

  // КРАТНЕ 4 (Для друку на скобу)
  const padToMultipleOf4 = () => {
    if (pages.length === 0) return alert('Додайте сторінки!');
    const remainder = pages.length % 4;
    if (remainder === 0) return alert('Журнал вже має кількість сторінок, кратну 4! Все ідеально.');
    
    const needed = 4 - remainder;
    const blankPages = Array(needed).fill(null).map(() => ({ id: crypto.randomUUID(), type: 'blank' }));
    
    setPages((prev) => [...prev, ...blankPages]);
    alert(`Додано ${needed} білих сторінок у кінець для формату "на скобу".`);
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

  // Переведення картинки в ЧБ (Grayscale)
  const convertToGrayscale = (imgObj) => {
    const canvas = document.createElement('canvas');
    canvas.width = imgObj.width;
    canvas.height = imgObj.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgObj, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg; data[i + 1] = avg; data[i + 2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
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
  const addPageToPDF = (doc, page, isFirst, forceGrayscale = false) => {
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

      const imgSrc = forceGrayscale ? convertToGrayscale(page.imgObj) : page.src;
      // Використовуємо 'SLOW' або 'MEDIUM' замість 'FAST' для максимальної якості друку
      doc.addImage(imgSrc, 'JPEG', x, y, finalWidth, finalHeight, undefined, 'MEDIUM');
    }
  };

  // ЕКСПОРТ 2: Середина Ч/Б
  const exportInnerBW = () => {
    if (pages.length <= 2) return alert('Немає внутрішніх сторінок!');
    const doc = createPrintReadyPDF();
    
    const innerPages = pages.slice(1, pages.length - 1);
    innerPages.forEach((page, i) => {
      addPageToPDF(doc, page, i === 0, true); 
    });
    doc.save('Seredyna_ChornoBila.pdf');
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
            <button onClick={onBack} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-md active:scale-95 mr-4">
              ← В меню
            </button>
            <button onClick={handleAutoFormat} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
              <Layers size={16} /> Фото+Біла
            </button>
            <button onClick={padToMultipleOf4} className="bg-amber-50 hover:bg-amber-100 text-amber-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95" title="Додасть пусті сторінки в кінець, щоб загальна кількість ділилась на 4">
              <BookOpen size={16} /> Кратне 4 (на скобу)
            </button>
            <button onClick={handleClearAll} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition-all active:scale-95">
              <Trash2 size={16} />
            </button>
          </div>
          
          <div className="flex gap-2 border-l border-slate-300 pl-4">
            <button onClick={() => setIsCoverModalOpen(true)} className="bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
              <Image size={16} /> Обкладинка
            </button>
            <button onClick={exportInnerBW} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
              <Printer size={16} /> Середина (Ч/Б)
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