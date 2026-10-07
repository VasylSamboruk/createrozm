import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortablePage from './SortablePage';

export default function Sidebar({ pages, onRemove, onAddBlank, onInsertPhoto, onEditA4, onSelectPage, selectedPageId }) {
  return (
    <div className="w-80 h-full bg-white/40 backdrop-blur-xl border-r border-slate-200/50 p-4 overflow-y-auto shadow-2xl z-10 flex flex-col gap-4">
      {pages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
          Завантажте фотографії, щоб почати редагування журналу
        </div>
      ) : (
        <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {pages.map((page, index) => (
            <SortablePage 
              key={page.id} 
              page={page} 
              index={index} 
              onRemove={onRemove}
              onAddBlank={onAddBlank}
              onInsertPhoto={onInsertPhoto}
              onEditA4={onEditA4}
              onSelect={onSelectPage}
              page={{ ...page, isSelected: page.id === selectedPageId }}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}