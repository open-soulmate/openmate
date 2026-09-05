'use client';

/**
 * CAD 图纸渲染器（自研，基于 @mlightcad/libredwg-web）
 *
 * 功能：
 * - DWG/DXF 文件解析（LibreDWG WASM）
 * - dwg_to_svg 直接输出 SVG
 * - 缩放/拖拽
 * - 自动 fitBounds
 * - 全屏
 * - 暗色/亮色主题
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut,
  AlertTriangle, Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CadRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器主组件                                                    */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('初始化...');
  const [svgContent, setSvgContent] = useState<string>('');

  /* 缩放和平移状态 */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  /* ------------------------------------------------------------------ */
  /*  加载文件内容                                                        */
  /* ------------------------------------------------------------------ */

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) {
      const r = await fetch(fileUrl);
      return r.arrayBuffer();
    }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  /* ------------------------------------------------------------------ */
  /*  解析 DWG/DXF → SVG                                                 */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        setStatusText('加载 LibreDWG WASM...');
        const buf = await loadBuffer();

        /* 动态导入 libredwg-web */
        const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');

        if (disposed) return;
        setStatusText('初始化 WASM...');

        /* 初始化 WASM */
        const libredwg = await LibreDwg.create('/wasm/libredwg/');

        if (disposed) return;
        setStatusText('解析文件...');

        /* 根据扩展名判断类型 */
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const fileType = ext === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;

        /* 解析文件，返回 Dwg_Data 指针 */
        const dataPtr = libredwg.dwg_read_data(buf, fileType);

        if (disposed) return;
        if (dataPtr === undefined || dataPtr === null) {
          throw new Error('解析失败：可能是不支持的文件格式或文件损坏');
        }

        setStatusText('转换为 SVG...');
        const db = libredwg.convert(dataPtr);

        if (disposed) return;

        /* 释放原始 DWG 数据 */
        libredwg.dwg_free(dataPtr);

        /* 转换为 SVG 字符串 */
        const svg = libredwg.dwg_to_svg(db);

        if (disposed) return;
        if (!svg) {
          throw new Error('SVG 转换失败');
        }

        setSvgContent(svg);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          const msg = err instanceof Error ? err.message : '加载 CAD 文件失败';
          setError(msg);
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => { disposed = true; };
  }, [loadBuffer, fileName, onError]);

  /* ------------------------------------------------------------------ */
  /*  交互：缩放/拖拽                                                     */
  /* ------------------------------------------------------------------ */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.max(0.1, Math.min(50, prev * factor)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* 重置视图 */
  const fitBounds = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /* 全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[400px] overflow-hidden bg-white dark:bg-[#1a1a1a] ${className ?? ''}`}
    >
      {/* SVG 画布区域 */}
      <div
        ref={svgContainerRef}
        className="w-full h-full"
        style={{
          cursor: isDragging.current ? 'grabbing' : 'grab',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* 加载遮罩 */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{statusText}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-10">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground max-w-md text-center px-4">{error}</p>
        </div>
      )}

      {/* 工具栏 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">
            {fileName.split('.').pop()?.toUpperCase()} · {(zoom * 100).toFixed(0)}%
          </span>
          <div className="w-px h-4 bg-border" />
          <button onClick={() => setZoom(z => z * 1.2)} className="p-1.5 hover:bg-accent rounded" title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setZoom(z => z * 0.8)} className="p-1.5 hover:bg-accent rounded" title="缩小">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={fitBounds} className="p-1.5 hover:bg-accent rounded" title="适应窗口">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={toggleFullscreen} className="p-1.5 hover:bg-accent rounded" title="全屏">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
