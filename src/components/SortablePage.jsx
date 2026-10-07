import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, FilePlus, ImagePlus } from 'lucide-react';

export default function SortablePage({ page, index, onRemove, onAddBlank, onInsertPhoto }) {
  const fileInputRef = useRef(null);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: page.id });

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
    <div ref={setNodeRef} style={style} className="bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-xl p-3 shadow-sm flex flex-col gap-2 relative group">
      
      {/* Прихований input для вибору файлу */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      <div {...attributes} {...listeners} className="absolute top-2 left-2 bg-slate-900/80 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md z-10 cursor-grab active:cursor-grabbing backdrop-blur-sm">
        {index + 1}
      </div>

      <div className="w-full h-32 bg-white/50 border border-slate-200 border-dashed rounded-lg overflow-hidden flex items-center justify-center text-slate-400 text-xs">
        {page.type === 'image' ? (
          <img src={page.src} className="w-full h-full object-cover" alt="Preview" />
        ) : (
          'Пуста сторінка'
        )}
      </div>

      {/* Кнопки дій */}
      <div className="flex gap-1">
        <button onClick={() => onRemove(page.id)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-500 py-1.5 rounded-lg flex justify-center transition-colors" title="Видалити">
          <Trash2 size={16} />
        </button>
        
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