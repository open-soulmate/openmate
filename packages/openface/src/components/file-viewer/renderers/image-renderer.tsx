import { useState, useCallback } from "react";
import type { RendererProps } from "./base";
import { CanvasAnnotation } from "../canvas-annotation";
import { RendererToolbar } from "./renderer-toolbar";
import { PenTool } from "lucide-react";

export function ImageRenderer({ fileUrl, fileName, onContentChange }: RendererProps) {
  const [annotating, setAnnotating] = useState(false);

  const handleExport = useCallback((blob: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      onContentChange?.(reader.result as string);
    };
    reader.readAsDataURL(blob);
  }, [onContentChange]);

  if (annotating) {
    return (
      <CanvasAnnotation
        imageSrc={fileUrl}
        onExport={handleExport}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl}>
        <button
          onClick={() => setAnnotating(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-muted/30 text-muted-foreground transition-colors"
          title="标注模式"
        >
          <PenTool className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">标注</span>
        </button>
      </RendererToolbar>
      <div className="flex-1 overflow-hidden flex items-center justify-center bg-muted/10">
        <img src={fileUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  );
}
