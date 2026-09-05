'use client';

/**
 * CAD 图纸渲染器（基于 @mlightcad/libredwg-web 的 SVG 输出）
 *
 * 核心策略：使用库自带的 dwg_to_svg() 生成完整 SVG，避免自行遍历实体导致的
 * 文字镜像、坐标错误、细节缺失等问题。
 *
 * 流程：DWG/DXF 二进制 → dwg_read_data() → convert() → DwgDatabase → dwg_to_svg() → SVG 字符串
 *
 * 坐标系说明：
 * - CAD 坐标系：Y 轴向上
 * - SVG 坐标系：Y 轴向下
 * - 库的 SvgConverter 已在主 group 上应用 matrix(1,0,0,-1,0,0) 做全局 Y 翻转
 * - 文字元素单独用 translate(x,y) scale(1,-1) translate(-x,-y) 翻转回来
 * - 我们只需要正确处理 viewBox 和缩放/拖拽即可
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
/*  解析 SVG viewBox                                                    */
/* ------------------------------------------------------------------ */

interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseViewBox(svg: string): SvgViewBox {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (m) {
    const parts = m[1].split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  return { x: 0, y: 0, width: 1000, height: 1000 };
}

/* ------------------------------------------------------------------ */
/*  计算实体数量（从 SVG 大致估算）                                       */
/* ------------------------------------------------------------------ */

function countEntities(svg: string): number {
  /* 统计 SVG 中的主要绘图元素 */
  const tags = ['<line ', '<circle ', '<ellipse ', '<path ', '<text ', '<use ', '<polyline ', '<polygon '];
  let count = 0;
  for (const tag of tags) {
    let idx = 0;
    while ((idx = svg.indexOf(tag, idx)) !== -1) {
      count++;
      idx += tag.length;
    }
  }
  return count;
}

/* ------------------------------------------------------------------ */
/*  后处理 SVG：适配暗色模式                                             */
/* ------------------------------------------------------------------ */

function postProcessSvg(svg: string, isDark: boolean): string {
  if (!isDark) return svg;

  /*
   * 暗色模式策略：
   * 1. 将默认黑色 stroke (#000000 / black) 替换为浅色 (#e5e5e5)
   * 2. 将默认黑色 fill 替换为浅色
   * 3. 保留非黑色的颜色不变
   *
   * SVG 中库生成的默认颜色是 stroke="#000000" 和 fill="none"
   * 在主 <g> 标签上设置
   */
  let result = svg;

  /* 替换主 group 的 stroke 颜色 */
  result = result.replace(
    /stroke="#000000"/g,
    'stroke="#e5e5e5"',
  );
  result = result.replace(
    /stroke="black"/g,
    'stroke="#e5e5e5"',
  );

  /* 替换 fill="black"（SOLID 等实体） */
  result = result.replace(
    /fill="black"/g,
    'fill="#e5e5e5"',
  );

  /* 文字默认是黑色的 fill，需要替换 */
  result = result.replace(
    /fill="#000000"/g,
    'fill="#e5e5e5"',
  );

  /* 确保 SVG 背景透明（由容器背景控制） */

  return result;
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器组件                                                      */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('初始化...');
  const [entCount, setEntCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);

  /* SVG 原始数据 */
  const svgRawRef = useRef<string>('');
  const viewBoxRef = useRef<SvgViewBox>({ x: 0, y: 0, width: 1000, height: 1000 });

  /* 视图状态：缩放和偏移 */
  const viewRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const isDarkRef = useRef(isDark);

  /* ------------------------------------------------------------------ */
  /*  将 SVG 渲染到容器                                                    */
  /* ------------------------------------------------------------------ */

  const renderSvg = useCallback(() => {
    const container = svgContainerRef.current;
    if (!container || !svgRawRef.current) return;

    const svg = postProcessSvg(svgRawRef.current, isDarkRef.current);
    container.innerHTML = svg;

    /* 获取插入的 SVG 元素并设置样式 */
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.display = 'block';

      /* 应用缩放和平移变换 */
      const { scale, panX, panY } = viewRef.current;
      svgEl.style.transform = `scale(${scale}) translate(${panX}px, ${panY}px)`;
      svgEl.style.transformOrigin = 'center center';
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  加载文件                                                            */
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
        const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');

        if (disposed) return;
        setStatusText('初始化 WASM...');
        const libredwg = await LibreDwg.create('/wasm/libredwg/');

        if (disposed) return;
        setStatusText('解析文件...');
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const ft = ext === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
        const ptr = libredwg.dwg_read_data(buf, ft);

        if (disposed) return;
        if (ptr === undefined || ptr === null) throw new Error('解析失败');

        setStatusText('转换为数据库...');
        const db = libredwg.convert(ptr);

        if (disposed) return;
        setStatusText('生成 SVG...');
        let svg = "";
        try {
          svg = libredwg.dwg_to_svg(db);
        } catch (svgErr) {
          console.warn("[CAD] dwg_to_svg 失败，尝试 convert:", svgErr);
        }
        if (!svg) throw new Error("SVG 生成失败");

        /* 释放 WASM 内存 */
        libredwg.dwg_free(ptr);

        if (disposed) return;

        /* 保存原始 SVG */
        svgRawRef.current = svg;
        viewBoxRef.current = parseViewBox(svg);
        setEntCount(countEntities(svg));

        console.log('[CAD] SVG前2000字符:', svg.substring(0, 2000));
        console.log('[CAD] SVG 生成完成, viewBox:', viewBoxRef.current, '长度:', svg.length);

        /* 初始视图 */
        viewRef.current = { scale: 1, panX: 0, panY: 0 };
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 CAD 文件失败');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    /* 监听暗色模式切换 */
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      isDarkRef.current = dark;
      setIsDark(dark);
      renderSvg();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    isDarkRef.current = isDark;

    return () => { disposed = true; observer.disconnect(); };
  }, [loadBuffer, fileName, onError, renderSvg]);

  /* ------------------------------------------------------------------ */
  /*  loading 结束后渲染 SVG                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!loading && !error && svgRawRef.current) {
      requestAnimationFrame(() => {
        renderSvg();
        fitToView();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error]);

  /* ------------------------------------------------------------------ */
  /*  适应视图                                                            */
  /* ------------------------------------------------------------------ */

  const fitToView = useCallback(() => {
    viewRef.current = { scale: 1, panX: 0, panY: 0 };
    setZoomPercent(100);
    renderSvg();
  }, [renderSvg]);

  /* ------------------------------------------------------------------ */
  /*  缩放                                                                */
  /* ------------------------------------------------------------------ */

  const applyZoom = useCallback((newScale: number, centerX?: number, centerY?: number) => {
    const container = svgContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = centerX ?? rect.width / 2;
    const cy = centerY ?? rect.height / 2;

    const oldScale = viewRef.current.scale;
    const factor = newScale / oldScale;

    /* 以鼠标位置为中心缩放 */
    viewRef.current.panX = cx - factor * (cx - viewRef.current.panX);
    viewRef.current.panY = cy - factor * (cy - viewRef.current.panY);
    viewRef.current.scale = newScale;

    setZoomPercent(Math.round(newScale * 100));
    renderSvg();
  }, [renderSvg]);

  /* ------------------------------------------------------------------ */
  /*  交互：滚轮缩放                                                      */
  /* ------------------------------------------------------------------ */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = svgContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = viewRef.current.scale * factor;
    applyZoom(newScale, mx, my);
  }, [applyZoom]);

  /* ------------------------------------------------------------------ */
  /*  交互：拖拽平移                                                      */
  /* ------------------------------------------------------------------ */

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const s = viewRef.current.scale;
    viewRef.current.panX = dragStart.current.panX + dx / s;
    viewRef.current.panY = dragStart.current.panY + dy / s;
    renderSvg();
  }, [renderSvg]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* ------------------------------------------------------------------ */
  /*  全屏                                                                */
  /* ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ */
  /*  窗口大小变化时重绘                                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const h = () => renderSvg();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [renderSvg]);

  /* ------------------------------------------------------------------ */
  /*  渲染                                                                */
  /* ------------------------------------------------------------------ */

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}
    >
      {/* SVG 渲染区域 */}
      <div
        ref={svgContainerRef}
        className="w-full h-full overflow-hidden"
        style={{
          cursor: isDragging.current ? 'grabbing' : 'grab',
          background: isDark ? '#1a1a1a' : '#ffffff',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* 加载中 */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{statusText}</span>
        </div>
      )}

      {/* 错误 */}
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
            {entCount} 实体 · {zoomPercent}%
          </span>
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => applyZoom(viewRef.current.scale * 1.2)}
            className="p-1.5 hover:bg-accent rounded"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => applyZoom(viewRef.current.scale / 1.2)}
            className="p-1.5 hover:bg-accent rounded"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToView}
            className="p-1.5 hover:bg-accent rounded"
            title="适应窗口"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-accent rounded"
            title="全屏"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
