import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, FilePlus, ImagePlus, ScanLine } from 'lucide-react';

export default function SortablePage({ page, index, onRemove, onAddBlank, onInsertPhoto, onEditA4, onSelect }) {
  const fileInputRef = useRef(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Викликаємо системне вікно вибору файлу
  const handleButtonClick = (e) => {
    e.stopPropagation();
    fileInputRef.current.click();
  };

  // Коли файл вибрано
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onInsertPhoto(index, file);
    }
    e.target.value = ''; // Скидаємо, щоб можна було обрати той самий файл знову
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-xl p-3 shadow-sm flex flex-col gap-2 relative group ${isDragging ? 'z-30 opacity-60 shadow-xl' : ''}`}
    >
      
      {/* Прихований input для вибору файлу */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onSelect(page.id)}
        className={`relative w-full h-32 bg-white/50 border border-slate-200 border-dashed rounded-lg overflow-hidden flex items-center justify-center text-slate-400 text-xs cursor-grab active:cursor-grabbing touch-none ${page.isSelected ? 'ring-2 ring-blue-500 border-blue-300' : ''}`}
        title="Перетягніть, щоб змінити порядок; натисніть, щоб відкрити у перегляді"
        aria-label={`Сторінка ${index + 1}: натисніть для перегляду або перетягніть для зміни порядку`}
      >
        <span className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 text-xs font-bold text-white shadow-md">
          {index + 1}
        </span>
        {page.type === 'image' ? (
          <img src={page.src} className="w-full h-full object-contain" alt={`Сторінка ${index + 1}`} />
        ) : (
          'Пуста сторінка'
        )}
      </button>

      {/* Кнопки дій */}
      <div className="flex gap-1">
        <button onClick={() => onRemove(page.id)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-500 py-1.5 rounded-lg flex justify-center transition-colors" title="Видалити">
          <Trash2 size={16} />
        </button>

        {page.type === 'image' && (
          <button
            type="button"
            onClick={() => onEditA4(page)}
            className="flex-1 bg-violet-50 hover:bg-violet-100 text-violet-600 py-1.5 rounded-lg flex justify-center transition-colors"
            title="Кадрувати фото для друку A4"
          >
            <ScanLine size={14} />
            <span className="ml-1 text-[10px] font-semibold">A4</span>
          </button>
        )}
        
        {/* Кнопка вставки фото */}
        <button 
          type="button"
          onClick={handleButtonClick} 
          className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-1.5 rounded-lg flex justify-center items-center transition-colors cursor-pointer" 
          title="Вставити фото після цієї сторінки"
        >
          <ImagePlus size={16} />
        </button>

        <button onClick={() => onAddBlank(index)} className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 py-1.5 rounded-lg flex justify-center transition-colors" title="Додати білу сторінку">
          <FilePlus size={16} />
        </button>
      </div>
    </div>
  );
}