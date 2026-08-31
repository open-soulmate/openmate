// @ts-nocheck
import { useRef, useState, useCallback, useEffect } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Pen, Highlighter, Eraser, Square, ArrowRight, Type, Undo2, Redo2, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

type Tool = "pen" | "highlighter" | "eraser" | "rect" | "arrow" | "text";

interface Point { x: number; y: number; }

interface Stroke {
  tool: Tool;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  textPos?: Point;
  pageIndex?: number;
}

export interface CanvasAnnotationProps {
  imageSrc?: string;
  pdfBuffer?: ArrayBuffer;
  onExport?: (blob: Blob, format: "png" | "pdf") => void;
  className?: string;
}

// ── Config ─────────────────────────────────────────────────────

const tools: { id: Tool; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pen", label: "画笔", Icon: Pen },
  { id: "highlighter", label: "高亮", Icon: Highlighter },
  { id: "eraser", label: "橡皮", Icon: Eraser },
  { id: "rect", label: "矩形", Icon: Square },
  { id: "arrow", label: "箭头", Icon: ArrowRight },
  { id: "text", label: "文字", Icon: Type },
];

const palette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff"];
const widths = [2, 4, 6, 10];

// ── Draw helper ────────────────────────────────────────────────

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
  }

  const pts = stroke.points;
  switch (stroke.tool) {
    case "pen":
    case "highlighter":
    case "eraser":
      if (pts.length < 2) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1], c = pts[i];
          ctx.quadraticCurveTo(p.x, p.y, (p.x + c.x) / 2, (p.y + c.y) / 2);
        }
        ctx.stroke();
      }
      break;
    case "rect":
      if (stroke.start && stroke.end) {
        ctx.beginPath();
        ctx.rect(stroke.start.x, stroke.start.y, stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y);
        ctx.stroke();
      }
      break;
    case "arrow":
      if (stroke.start && stroke.end) {
        const { start: s, end: e } = stroke;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        const angle = Math.atan2(e.y - s.y, e.x - s.x);
        const hl = stroke.width * 4;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - hl * Math.cos(angle - Math.PI / 6), e.y - hl * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - hl * Math.cos(angle + Math.PI / 6), e.y - hl * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      break;
    case "text":
      if (stroke.text && stroke.textPos) {
        ctx.font = `bold ${Math.max(stroke.width * 3, 14)}px sans-serif`;
        ctx.fillText(stroke.text, stroke.textPos.x, stroke.textPos.y);
      }
      break;
  }
  ctx.restore();
}

// ── Component ──────────────────────────────────────────────────

export function CanvasAnnotation({ imageSrc, pdfBuffer, onExport, className }: CanvasAnnotationProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [activeWidth, setActiveWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // PDF state
  const [pdfPageCanvases, setPdfPageCanvases] = useState<HTMLCanvasElement[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const pageStrokesRef = useRef<Map<number, Stroke[]>>(new Map());

  // ── Load background ────────────────────────────────────────────

  useEffect(() => {
    if (!imageSrc || !bgCanvasRef.current) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const bg = bgCanvasRef.current!;
      const draw = drawCanvasRef.current!;
      bg.width = img.width;
      bg.height = img.height;
      draw.width = img.width;
      draw.height = img.height;
      bg.getContext("2d")!.drawImage(img, 0, 0);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!pdfBuffer) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
        const pages: HTMLCanvasElement[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp } as any).promise;
          pages.push(c);
        }
        if (!cancelled && pages.length > 0) {
          setPdfPageCanvases(pages);
          setCurrentPage(0);
          renderPage(pages[0]);
        }
      } catch (err) {
        console.error("PDF load error:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfBuffer]);

  const renderPage = useCallback((pageCanvas: HTMLCanvasElement) => {
    const bg = bgCanvasRef.current!;
    const draw = drawCanvasRef.current!;
    bg.width = pageCanvas.width;
    bg.height = pageCanvas.height;
    draw.width = pageCanvas.width;
    draw.height = pageCanvas.height;
    bg.getContext("2d")!.drawImage(pageCanvas, 0, 0);
    const drawCtx = draw.getContext("2d")!;
    drawCtx.clearRect(0, 0, draw.width, draw.height);
    const pageStrokes = pageStrokesRef.current.get(currentPage) || [];
    pageStrokes.forEach(s => drawStroke(drawCtx, s));
  }, [currentPage]);

  const goToPage = useCallback((p: number) => {
    if (p < 0 || p >= pdfPageCanvases.length) return;
    setCurrentPage(p);
    const canvas = pdfPageCanvases[p]; if (canvas) renderPage(canvas);
  }, [pdfPageCanvases, renderPage]);

  // ── Pointer handlers ─────────────────────────────────────────

  const getCanvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = drawCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const point = getCanvasPoint(e);
    setIsDrawing(true);

    if (activeTool === "text") {
      const text = prompt("输入文字:");
      if (text) {
        const stroke: Stroke = { tool: "text", color: activeColor, width: activeWidth, opacity: 1, points: [point], text, textPos: point, pageIndex: currentPage };
        setStrokes(s => [stroke, ...s]);
        setRedoStack([]);
        const ctx = drawCanvasRef.current!.getContext("2d")!;
        drawStroke(ctx, stroke);
      }
      return;
    }

    const stroke: Stroke = {
      tool: activeTool,
      color: activeTool === "highlighter" ? "#fef08a" : activeColor,
      width: activeTool === "highlighter" ? 20 : activeWidth,
      opacity: activeTool === "highlighter" ? 0.4 : 1,
      points: [point],
      start: point,
      end: point,
      pageIndex: currentPage,
    };
    setCurrentStroke(stroke);
  }, [activeTool, activeColor, activeWidth, currentPage]);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    const updated = { ...currentStroke, points: [...currentStroke.points, point], end: point };
    setCurrentStroke(updated);

    const ctx = drawCanvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, drawCanvasRef.current!.width, drawCanvasRef.current!.height);
    (pageStrokesRef.current.get(currentPage) || []).forEach(s => drawStroke(ctx, s));
    drawStroke(ctx, updated);
  }, [isDrawing, currentStroke, currentPage]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    setStrokes(s => [currentStroke, ...s]);
    setRedoStack([]);
    const arr = pageStrokesRef.current.get(currentPage) || [];
    arr.push(currentStroke);
    pageStrokesRef.current.set(currentPage, arr);
    setCurrentStroke(null);
  }, [isDrawing, currentStroke, currentPage]);

  // ── Undo / Redo / Clear ─────────────────────────────────────

  const undo = useCallback(() => {
    setStrokes(prev => {
      const [first, ...rest] = prev;
      if (!first) return prev;
      setRedoStack(r => [first, ...r]);
      const arr = pageStrokesRef.current.get(currentPage) || [];
      pageStrokesRef.current.set(currentPage, arr.filter(s => s !== first));
      const ctx = drawCanvasRef.current!.getContext("2d")!;
      ctx.clearRect(0, 0, drawCanvasRef.current!.width, drawCanvasRef.current!.height);
      rest.filter(s => s.pageIndex === currentPage).forEach(s => drawStroke(ctx, s));
      return rest;
    });
  }, [currentPage]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      const [last, ...rest] = prev;
      if (!last) return prev;
      const arr = pageStrokesRef.current.get(currentPage) || [];
      arr.push(last);
      pageStrokesRef.current.set(currentPage, arr);
      setStrokes(s => [...s, last]);
      const ctx = drawCanvasRef.current!.getContext("2d")!;
      drawStroke(ctx, last);
      return rest;
    });
  }, [currentPage]);

  const clearAll = useCallback(() => {
    pageStrokesRef.current.set(currentPage, []);
    setStrokes([]);
    setRedoStack([]);
    const ctx = drawCanvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, drawCanvasRef.current!.width, drawCanvasRef.current!.height);
  }, [currentPage]);

  // ── Export ────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (pdfPageCanvases.length > 0) {
      const { jsPDF } = await import("jspdf");
      let pdf: any = null;
      for (let i = 0; i < pdfPageCanvases.length; i++) {
        const pc = pdfPageCanvases[i];
        if (!pc) continue;
        const merged = document.createElement("canvas");
        merged.width = pc.width;
        merged.height = pc.height;
        const ctx = merged.getContext("2d")!;
        ctx.drawImage(pc, 0, 0);
        (pageStrokesRef.current.get(i) || []).forEach(s => drawStroke(ctx, s));
        const orient = pc.width > pc.height ? "landscape" : "portrait";
        if (!pdf) {
          pdf = new jsPDF({ orientation: orient as any, unit: "px", format: [pc.width, pc.height] });
        } else {
          pdf.addPage([pc.width, pc.height], orient as any);
        }
        pdf.addImage(merged.toDataURL("image/png"), "PNG", 0, 0, pc.width, pc.height);
      }
      const blob = pdf!.output("blob");
      onExport?.(blob, "pdf");
    } else {
      const bg = bgCanvasRef.current!;
      const draw = drawCanvasRef.current!;
      const merged = document.createElement("canvas");
      merged.width = bg.width;
      merged.height = bg.height;
      const ctx = merged.getContext("2d")!;
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(draw, 0, 0);
      merged.toBlob(blob => { if (blob) onExport?.(blob, "png"); }, "image/png");
    }
  }, [pdfPageCanvases, onExport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") { e.preventDefault(); undo(); }
        if (e.key === "y") { e.preventDefault(); redo(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // ── Render ────────────────────────────────────────────────────

  const ToolBtn = ({ id, label, Icon }: { id: Tool; label: string; Icon: React.ComponentType<{ className?: string }> }) => (
    <button onClick={() => setActiveTool(id)}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${activeTool === id ? "bg-primary/20 text-primary" : "hover:bg-muted/30 text-muted-foreground"}`}
      title={label}>
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );

  return (
    <div className={`flex flex-col h-full ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/30 shrink-0 bg-[var(--color-secondary)] flex-wrap">
        {/* Tools */}
        {tools.map(t => <ToolBtn key={t.id} id={t.id} label={t.label} Icon={t.Icon} />)}

        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {/* Colors */}
        {palette.map(c => (
          <button key={c} onClick={() => setActiveColor(c)}
            className="w-4 h-4 rounded-full border transition-transform hover:scale-125"
            style={{ backgroundColor: c, borderColor: activeColor === c ? "white" : "rgba(255,255,255,0.2)", transform: activeColor === c ? "scale(1.3)" : undefined }} />
        ))}

        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {/* Widths */}
        {widths.map(w => (
          <button key={w} onClick={() => setActiveWidth(w)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${activeWidth === w ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/30"}`}>{w}px</button>
        ))}

        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {/* Actions */}
        <button onClick={undo} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="撤销 (Ctrl+Z)">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={redo} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="重做 (Ctrl+Y)">
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={clearAll} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="清除">
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        {/* Export */}
        <button onClick={handleExport} className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors">
          <Download className="w-3.5 h-3.5" />
          <span>导出</span>
        </button>
      </div>

      {/* PDF page nav */}
      {pdfPageCanvases.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border/30 text-xs text-muted-foreground shrink-0 bg-[var(--color-secondary)]">
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} className="p-1 rounded hover:bg-muted/30 disabled:opacity-30">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span>{currentPage + 1} / {pdfPageCanvases.length}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pdfPageCanvases.length - 1} className="p-1 rounded hover:bg-muted/30 disabled:opacity-30">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/5 relative">
        <div className="relative inline-block">
          <canvas ref={bgCanvasRef} className="block" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          <canvas ref={drawCanvasRef}
            className="absolute inset-0 cursor-crosshair"
            style={{ touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>
    </div>
  );
}
