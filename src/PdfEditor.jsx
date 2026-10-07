import { useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { jsPDF } from 'jspdf';
import { FileUp, Download, Trash2, Layers, BookOpen, Printer, Image } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MagazinePreview from './components/MagazinePreview';

export default function PdfEditor({ onBack }) {
  const [pages, setPages] = useState([]);

  // Завантаження файлів (в кінець)
  // Завантаження файлів з автоматичною оптимізацією для друкарні (300 DPI)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newPages = await Promise.all(
      files.map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new window.Image();
            img.onload = () => {
              // Створюємо Canvas для зменшення зображення до стандарту 300 DPI (А4)
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 2480; 
              const MAX_HEIGHT = 3508; 
              
              let width = img.width;
              let height = img.height;

              // Якщо фото більше за А4, пропорційно його зменшуємо
              if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                width = width * ratio;
                height = height * ratio;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);

              // Конвертуємо оптимізоване зображення у JPEG з якістю 85%
              const optimizedSrc = canvas.toDataURL('image/jpeg', 0.85);

              // Зберігаємо оптимізований варіант для PDF
              const optimizedImg = new window.Image();
              optimizedImg.onload = () => {
                resolve({ id: crypto.randomUUID(), type: 'image', src: optimizedSrc, imgObj: optimizedImg });
              };
              optimizedImg.src = optimizedSrc;
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      })
    );
    setPages((prev) => [...prev, ...newPages]);
    e.target.value = ''; 
  };

  // Вставка нового фото після конкретної сторінки
  const handleInsertPhoto = (index, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        setPages((prev) => {
          const newPages = [...prev];
          newPages.splice(index + 1, 0, { id: crypto.randomUUID(), type: 'image', src: e.target.result, imgObj: img });
          return newPages;
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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

  const handleRemovePage = (id) => setPages(pages.filter(p => p.id !== id));
  const handleClearAll = () => { if (confirm('Видалити всі сторінки?')) setPages([]); };

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

  // ЕКСПОРТ 1: Обкладинка
  const exportCover = () => {
    if (pages.length < 2) return alert('Потрібно мінімум 2 сторінки для обкладинки!');
    const doc = createPrintReadyPDF();
    
    addPageToPDF(doc, pages[0], true, false); 
    addPageToPDF(doc, pages[pages.length - 1], false, false); 
    doc.save('Obkladynka_Kolir.pdf');
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
            <button onClick={exportCover} className="bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all active:scale-95">
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
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Sidebar pages={pages} onRemove={handleRemovePage} onAddBlank={handleAddBlank} onInsertPhoto={handleInsertPhoto} />
        </DndContext>
        
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <MagazinePreview pages={pages} />
      </main>

    </div>
  );
}