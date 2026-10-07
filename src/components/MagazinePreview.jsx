import React, { useCallback, useEffect, useRef } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Page = React.forwardRef((props, ref) => {
  return (
    <div className="page relative overflow-hidden bg-white border border-slate-300" ref={ref}>
      <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-black/15 pointer-events-none z-10" />
      {props.children}
    </div>
  );
});

export default function MagazinePreview({ pages, selectedPageId, onSelectPage }) {
  const bookRef = useRef(); // Посилання на екземпляр книги

  const bookKey = pages.map(p => p.id).join(',');
  const goToSelectedPage = useCallback(() => {
    const pageIndex = pages.findIndex((page) => page.id === selectedPageId);
    const pageFlip = bookRef.current?.pageFlip();
    if (pageIndex >= 0 && pageFlip && pageFlip.getCurrentPageIndex() !== pageIndex) {
      pageFlip.flip(pageIndex);
    }
  }, [pages, selectedPageId]);

  useEffect(() => {
    const frame = requestAnimationFrame(goToSelectedPage);
    return () => cancelAnimationFrame(frame);
  }, [bookKey, goToSelectedPage]);

  if (pages.length === 0) return null;

  // Функції для гортання кнопками
  const goNext = () => bookRef.current.pageFlip().flipNext();
  const goPrev = () => bookRef.current.pageFlip().flipPrev();

  return (
    <div className="flex-1 h-full flex items-center justify-center p-8 relative group">
      
      {/* Стрілочка Вліво */}
      <button onClick={goPrev} className="absolute left-8 z-20 p-4 bg-white/80 backdrop-blur-md rounded-full shadow-lg text-slate-700 hover:bg-white hover:scale-110 transition-all border border-slate-200">
        <ChevronLeft size={24} />
      </button>

      <HTMLFlipBook
        ref={bookRef}
        key={bookKey}
        width={350}
        height={495}
        size="stretch"
        minWidth={315}
        maxWidth={450}
        minHeight={445}
        maxHeight={636}
        drawShadow={true}
        maxShadowOpacity={0.6}
        showCover={true}
        usePortrait={false}
        flippingTime={800}
        className="shadow-2xl"
        onInit={goToSelectedPage}
        onFlip={(event) => {
          const selectedPage = pages[event.data];
          if (selectedPage) onSelectPage(selectedPage.id);
        }}
      >
        {pages.map((page) => (
          <Page key={page.id}>
            {page.type === 'image' ? (
              <img src={page.src} alt="page" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white" />
            )}
          </Page>
        ))}
      </HTMLFlipBook>

      {/* Стрілочка Вправо */}
      <button onClick={goNext} className="absolute right-8 z-20 p-4 bg-white/80 backdrop-blur-md rounded-full shadow-lg text-slate-700 hover:bg-white hover:scale-110 transition-all border border-slate-200">
        <ChevronRight size={24} />
      </button>

    </div>
  );
}