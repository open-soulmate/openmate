'use client';

/**
 * CAD 图纸渲染器（自研，基于 @mlightcad/libredwg-web）
 *
 * 功能：
 * - DWG/DXF 文件解析（LibreDWG WASM convert()）
 * - Canvas 2D 渲染所有基本实体
 * - 坐标变换：CAD Y向上 → Canvas Y向下
 * - 图层可见性 + ACI颜色 + trueColor
 * - INSERT 块引用递归渲染
 * - 缩放/拖拽/fitBounds
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
/*  简化的实体/数据库类型                                                */
/* ------------------------------------------------------------------ */

interface Pt { x: number; y: number; z?: number; }
interface Ent {
  type: string;
  startPoint?: Pt; endPoint?: Pt;
  center?: Pt; radius?: number;
  startAngle?: number; endAngle?: number;
  points?: Pt[]; bulges?: number[]; flags?: number;
  vertices?: Pt[]; flag?: number;
  text?: string; insertionPoint?: Pt; height?: number; textHeight?: number;
  rotation?: number; halign?: number; valign?: number;
  majorAxisEndpoint?: Pt; axisRatio?: number; startParam?: number; endParam?: number;
  name?: string; scaleX?: number; scaleY?: number; scaleZ?: number;
  corner1?: Pt; corner2?: Pt; corner3?: Pt; corner4?: Pt;
  boundaryPaths?: unknown[]; solidFill?: boolean;
  controlPoints?: Pt[]; degree?: number; knots?: number[];
  point?: Pt;
  colorIndex?: number; color?: number; layer?: string;
  [k: string]: unknown;
}
interface Layer { name: string; colorIndex: number; frozen?: boolean; off?: boolean; [k: string]: unknown; }
interface Block { entities?: Ent[]; [k: string]: unknown; }
interface DwgDb { entities?: Ent[]; layers?: Record<string, Layer>; blocks?: Record<string, Block>; [k: string]: unknown; }

/* ------------------------------------------------------------------ */
/*  ACI 颜色表                                                          */
/* ------------------------------------------------------------------ */

const ACI: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080',
  9: '#c0c0c0', 0: '#000000',
};

/** 解析实体颜色 */
function entColor(e: Ent, isDark: boolean): string {
  /* trueColor（24位整数）优先 */
  if (e.color && e.color > 0) {
    const r = (e.color >> 16) & 0xff;
    const g = (e.color >> 8) & 0xff;
    const b = e.color & 0xff;
    return `rgb(${r},${g},${b})`;
  }
  const ci = e.colorIndex ?? 7;
  if (ci === 7) return isDark ? '#e5e5e5' : '#000000';
  return ACI[ci] || (isDark ? '#e5e5e5' : '#000000');
}

/* ------------------------------------------------------------------ */
/*  世界坐标 → 屏幕坐标（Y轴翻转）                                       */
/* ------------------------------------------------------------------ */

function w2s(p: Pt, cx: number, cy: number, s: number, w: number, h: number) {
  return {
    x: w / 2 + (p.x - cx) * s,
    y: h / 2 - (p.y - cy) * s,
  };
}

/* ------------------------------------------------------------------ */
/*  计算实体边界框                                                       */
/* ------------------------------------------------------------------ */

function expandBounds(e: Ent, b: { x0: number; y0: number; x1: number; y1: number }, blocks?: Record<string, Block>) {
  const addPt = (p?: Pt) => {
    if (p && isFinite(p.x) && isFinite(p.y)) {
      b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
      b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
    }
  };
  const addCircle = (c: Pt, r: number) => {
    b.x0 = Math.min(b.x0, c.x - r); b.y0 = Math.min(b.y0, c.y - r);
    b.x1 = Math.max(b.x1, c.x + r); b.y1 = Math.max(b.y1, c.y + r);
  };
  addPt(e.startPoint); addPt(e.endPoint); addPt(e.insertionPoint); addPt(e.point);
  addPt(e.corner1); addPt(e.corner2); addPt(e.corner3); addPt(e.corner4);
  if (e.center) {
    addPt(e.center);
    if (e.radius) addCircle(e.center, e.radius);
  }
  if (e.points) e.points.forEach(addPt);
  if (e.vertices) e.vertices.forEach(addPt);
  if (e.controlPoints) e.controlPoints.forEach(addPt);
  if (e.type === 'INSERT' && e.name && blocks) {
    const blk = blocks[e.name];
    if (blk?.entities) {
      for (const be of blk.entities) expandBounds(be, b, blocks);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  绘制单个实体                                                        */
/* ------------------------------------------------------------------ */

function drawEnt(
  ctx: CanvasRenderingContext2D,
  e: Ent,
  cx: number, cy: number, s: number, w: number, h: number,
  isDark: boolean,
  blocks?: Record<string, Block>,
  depth = 0,
) {
  const color = entColor(e, isDark);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  const p = (pt: Pt) => w2s(pt, cx, cy, s, w, h);

  switch (e.type) {
    case 'LINE': {
      if (e.startPoint && e.endPoint) {
        const a = p(e.startPoint), b = p(e.endPoint);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      break;
    }
    case 'CIRCLE': {
      if (e.center && e.radius) {
        const c = p(e.center);
        ctx.beginPath();
        ctx.arc(c.x, c.y, e.radius * Math.abs(s), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'ARC': {
      if (e.center && e.radius && e.startAngle !== undefined && e.endAngle !== undefined) {
        const c = p(e.center);
        /* CAD角度是度数逆时针，Canvas弧度顺时针，Y翻转后角度取反 */
        const sa = (-e.startAngle * Math.PI) / 180;
        const ea = (-e.endAngle * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(c.x, c.y, e.radius * Math.abs(s), ea, sa);
        ctx.stroke();
      }
      break;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE_2D': {
      const pts = e.points || e.vertices;
      const closed = !!(e.flags && (e.flags & 1)) || !!(e.flag && (e.flag & 1));
      if (pts && pts.length > 1) {
        const sp = pts.map(p);
        ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y);
        for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
        if (closed) ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case 'TEXT':
    case 'MTEXT': {
      const ip = e.insertionPoint || e.startPoint;
      const txt = e.text;
      const sz = e.height || e.textHeight || 2.5;
      if (ip && txt) {
        const sp = p(ip);
        ctx.save();
        ctx.translate(sp.x, sp.y);
        /* 文字需要再次翻转Y（因为整体已经翻转过了） */
        ctx.scale(1, -1);
        if (e.rotation) ctx.rotate((-e.rotation * Math.PI) / 180);
        ctx.font = `${Math.max(1, sz * Math.abs(s))}px sans-serif`;
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      }
      break;
    }
    case 'ELLIPSE': {
      if (e.center && e.majorAxisEndpoint && e.axisRatio) {
        const c = p(e.center);
        const majLen = Math.sqrt(e.majorAxisEndpoint.x ** 2 + e.majorAxisEndpoint.y ** 2);
        const minLen = majLen * e.axisRatio;
        const angle = Math.atan2(e.majorAxisEndpoint.y, e.majorAxisEndpoint.x);
        ctx.save();
        ctx.translate(c.x, c.y);
        /* Y翻转后角度取反 */
        ctx.rotate(-angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, majLen * Math.abs(s), minLen * Math.abs(s), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'POINT': {
      if (e.point) {
        const sp = p(e.point);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'SOLID': {
      const corners = [e.corner1, e.corner2, e.corner3, e.corner4].filter((c): c is Pt => !!c).map(p);
      if (corners.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'INSERT': {
      if (depth > 8) break; /* 防止递归过深 */
      if (e.name && blocks) {
        const blk = blocks[e.name];
        if (blk?.entities) {
          for (const be of blk.entities) {
            /* 应用 INSERT 的偏移（简化版，忽略缩放/旋转） */
            const be2 = { ...be };
            if (e.insertionPoint) {
              if (be2.startPoint) be2.startPoint = { x: be2.startPoint.x + e.insertionPoint.x, y: be2.startPoint.y + e.insertionPoint.y };
              if (be2.endPoint) be2.endPoint = { x: be2.endPoint.x + e.insertionPoint.x, y: be2.endPoint.y + e.insertionPoint.y };
              if (be2.center) be2.center = { x: be2.center.x + e.insertionPoint.x, y: be2.center.y + e.insertionPoint.y };
              if (be2.insertionPoint) be2.insertionPoint = { x: be2.insertionPoint.x + e.insertionPoint.x, y: be2.insertionPoint.y + e.insertionPoint.y };
              if (be2.points) be2.points = be2.points.map(pt => ({ x: pt.x + e.insertionPoint!.x, y: pt.y + e.insertionPoint!.y }));
              if (be2.vertices) be2.vertices = be2.vertices.map(pt => ({ x: pt.x + e.insertionPoint!.x, y: pt.y + e.insertionPoint!.y }));
            }
            drawEnt(ctx, be2, cx, cy, s, w, h, isDark, blocks, depth + 1);
          }
        }
      }
      break;
    }
    case 'HATCH': {
      /* 简化：如果有 boundaryPaths，尝试渲染边界 */
      if (e.boundaryPaths && Array.isArray(e.boundaryPaths)) {
        for (const path of e.boundaryPaths) {
          const bp = path as { points?: Pt[] };
          if (bp.points && bp.points.length > 1) {
            const sp = bp.points.map(p);
            ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y);
            for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
            ctx.closePath();
            if (e.solidFill) ctx.fill(); else ctx.stroke();
          }
        }
      }
      break;
    }
    case 'SPLINE': {
      if (e.controlPoints && e.controlPoints.length > 1) {
        const sp = e.controlPoints.map(p);
        ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y);
        /* 简化：用折线连接控制点 */
        for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
        ctx.stroke();
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  主渲染函数                                                          */
/* ------------------------------------------------------------------ */

function renderAll(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  db: DwgDb,
  view: { cx: number; cy: number; scale: number },
  isDark: boolean,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  /* 背景色 */
  ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const entities = db.entities || [];
  for (const e of entities) {
    /* 图层可见性检查 */
    if (e.layer && db.layers) {
      const layer = db.layers[e.layer];
      if (layer && (layer.frozen || layer.off)) continue;
    }
    drawEnt(ctx, e, view.cx, view.cy, view.scale, w, h, isDark, db.blocks);
  }
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器组件                                                      */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('初始化...');
  const [entCount, setEntCount] = useState(0);

  /* 视图状态 */
  const viewRef = useRef({ cx: 0, cy: 0, scale: 1 });
  const dbRef = useRef<DwgDb | null>(null);
  const isDarkRef = useRef(document.documentElement.classList.contains('dark'));

  /* 拖拽状态 */
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, cx: 0, cy: 0 });

  /* 重绘 */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dbRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderAll(ctx, canvas, dbRef.current, viewRef.current, isDarkRef.current);
  }, []);

  /* 加载文件 */
  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  /* ------------------------------------------------------------------ */
  /*  解析 DWG/DXF                                                       */
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

        setStatusText('转换数据...');
        const db = libredwg.convert(ptr) as unknown as DwgDb;
        libredwg.dwg_free(ptr);

        if (disposed) return;
        dbRef.current = db;
        setEntCount(db.entities?.length || 0);

        /* 计算 bounds */
        const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (const e of db.entities || []) expandBounds(e, b, db.blocks);
        if (!isFinite(b.x0)) { b.x0 = -100; b.y0 = -100; b.x1 = 100; b.y1 = 100; }

        /* fitToView */
        const canvas = canvasRef.current;
        if (canvas) {
          const cw = canvas.clientWidth || 800;
          const ch = canvas.clientHeight || 600;
          const bw = b.x1 - b.x0 || 1;
          const bh = b.y1 - b.y0 || 1;
          const scale = Math.min(cw / bw, ch / bh) * 0.92;
          viewRef.current = {
            cx: (b.x0 + b.x1) / 2,
            cy: (b.y0 + b.y1) / 2,
            scale,
          };
        }

        setLoading(false);
        /* 首次渲染需要等 canvas 挂载 */
        requestAnimationFrame(() => redraw());
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 CAD 文件失败');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    /* 监听主题变化 */
    const observer = new MutationObserver(() => {
      isDarkRef.current = document.documentElement.classList.contains('dark');
      redraw();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => { disposed = true; observer.disconnect(); };
  }, [loadBuffer, fileName, onError, redraw]);

  /* ------------------------------------------------------------------ */
  /*  交互：缩放/拖拽                                                     */
  /* ------------------------------------------------------------------ */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { cx, cy, scale } = viewRef.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    /* 鼠标位置的世界坐标 */
    const wx = cx + (mx - w / 2) / scale;
    const wy = cy - (my - h / 2) / scale;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = scale * factor;
    /* 保持鼠标位置不变 */
    viewRef.current = {
      cx: wx - (mx - w / 2) / newScale,
      cy: wy + (my - h / 2) / newScale,
      scale: newScale,
    };
    redraw();
  }, [redraw]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, cx: viewRef.current.cx, cy: viewRef.current.cy };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const s = viewRef.current.scale;
    viewRef.current.cx = dragStart.current.cx - dx / s;
    viewRef.current.cy = dragStart.current.cy + dy / s;
    redraw();
  }, [redraw]);

  const handlePointerUp = useCallback(() => { isDragging.current = false; }, []);

  /* fitBounds */
  const fitBounds = useCallback(() => {
    const db = dbRef.current;
    const canvas = canvasRef.current;
    if (!db || !canvas) return;
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const e of db.entities || []) expandBounds(e, b, db.blocks);
    if (!isFinite(b.x0)) return;
    const cw = canvas.clientWidth || 800;
    const ch = canvas.clientHeight || 600;
    const bw = b.x1 - b.x0 || 1;
    const bh = b.y1 - b.y0 || 1;
    viewRef.current = {
      cx: (b.x0 + b.x1) / 2,
      cy: (b.y0 + b.y1) / 2,
      scale: Math.min(cw / bw, ch / bh) * 0.92,
    };
    redraw();
  }, [redraw]);

  /* 全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  }, []);

  /* 窗口大小变化时重绘 */
  useEffect(() => {
    const h = () => redraw();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [redraw]);

  /* 比例尺显示 */
  const [zoomPercent, setZoomPercent] = useState(100);
  useEffect(() => {
    const interval = setInterval(() => {
      setZoomPercent(Math.round(viewRef.current.scale * 100));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}>
      {/* Canvas 画布 */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
            {entCount} 实体 · {zoomPercent}%
          </span>
          <div className="w-px h-4 bg-border" />
          <button onClick={() => { viewRef.current.scale *= 1.2; redraw(); }} className="p-1.5 hover:bg-accent rounded" title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => { viewRef.current.scale *= 0.8; redraw(); }} className="p-1.5 hover:bg-accent rounded" title="缩小">
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
