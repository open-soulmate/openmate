import { useState, useEffect, useCallback, useRef } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PptxRenderer({ fileUrl, fileBuffer, fileName, onError }: RendererProps) {
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [totalSlides, setTotalSlides] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let buffer: ArrayBuffer | undefined;
        if (fileBuffer) buffer = fileBuffer;
        else if (fileUrl) {
          const res = await fetch(fileUrl);
          buffer = await res.arrayBuffer();
        }
        if (!buffer || cancelled) return;

        const pptxPreview = await import('pptx-preview');
        if (!containerRef.current || cancelled) return;

        const previewer = pptxPreview.init(containerRef.current, {
          width: 960,
          height: 540,
          mode: 'slide',
        });

        await previewer.preview(buffer);
        if (!cancelled) {
          previewerRef.current = previewer;
          setTotalSlides(previewer.slideCount);
          setCurrentSlide(1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) { onError?.(err as Error); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const goToSlide = useCallback((index: number) => {
    const previewer = previewerRef.current;
    if (!previewer) return;
    const target = Math.max(0, Math.min(index - 1, totalSlides - 1));
    previewer.removeCurrentSlide();
    previewer.renderSingleSlide(target);
    setCurrentSlide(index);
  }, [totalSlides]);

  useEffect(() => {
    return () => { previewerRef.current?.destroy(); };
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解析中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="PPT">
        <div className="flex items-center gap-1">
          <button onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide <= 1}
            className="p-1 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground">{currentSlide}/{totalSlides}</span>
          <button onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide >= totalSlides}
            className="p-1 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </RendererToolbar>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Slide thumbnails */}
        {totalSlides > 1 && (
          <div className="w-20 shrink-0 border-r border-border/30 overflow-y-auto bg-[#12122a] p-2 flex flex-col gap-1">
            {Array.from({ length: totalSlides }, (_, i) => (
              <button key={i} onClick={() => goToSlide(i + 1)}
                className={`text-xs text-center py-1.5 rounded transition-colors ${currentSlide === i + 1 ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Slide container */}
        <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/5" />
      </div>
    </div>
  );
}
