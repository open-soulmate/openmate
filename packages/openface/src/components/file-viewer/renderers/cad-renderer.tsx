'use client';

/**
 * CAD 图纸渲染器（自己实现，基于 @mlightcad/libredwg-web）
 *
 * 功能：
 * - DWG/DXF 文件解析（LibreDWG WASM）
 * - Canvas 2D 渲染几何实体（LINE/CIRCLE/ARC/POLYLINE/TEXT/ELLIPSE/INSERT）
 * - 缩放/拖拽（鼠标滚轮+指针拖拽）
 * - 自动 fitBounds
 * - 全屏
 * - 暗色/亮色主题
 * - 图层颜色支持
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
/*  DwgDatabase 实体类型（简化版，覆盖常见实体）                         */
/* ------------------------------------------------------------------ */

interface DwgPoint { x: number; y: number; z?: number; }
interface DwgEntity {
  type: string;
  // LINE
  start?: DwgPoint;
  end?: DwgPoint;
  // CIRCLE / ARC
  center?: DwgPoint;
  radius?: number;
  start_angle?: number;
  end_angle?: number;
  // POLYLINE / LWPOLYLINE
  points?: DwgPoint[];
  flag?: number;
  // TEXT / MTEXT
  insertion_point?: DwgPoint;
  text_value?: string;
  height?: number;
  rotation?: number;
  // ELLIPSE
  major_axis?: DwgPoint;
  axis_ratio?: number;
  // INSERT (block reference)
  name?: string;
  // 通用
  layer?: string;
  color_index?: number;
  [key: string]: unknown;
}

interface DwgDatabase {
  entities?: DwgEntity[];
  blocks?: Record<string, { entities?: DwgEntity[] }>;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  ACI 颜色表（AutoCAD Color Index，前10个常用色）                      */
/* ------------------------------------------------------------------ */

const ACI_COLORS: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080',
  9: '#c0c0c0', 0: '#000000',
};

function getColor(entity: DwgEntity, isDark: boolean): string {
  const ci = entity.color_index ?? 7;
  if (ci === 7) return isDark ? '#e5e5e5' : '#000000';
  if (ci === 0) return isDark ? '#e5e5e5' : '#000000';
  return ACI_COLORS[ci] || (isDark ? '#e5e5e5' : '#000000');
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器主组件                                                    */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('初始化...');

  /* 视图状态：缩放和平移 */
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  /* 解析后的实体数据 */
  const entitiesRef = useRef<DwgEntity[]>([]);
  const boundsRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const dbRef = useRef<DwgDatabase | null>(null);

  /* 检测暗色主题 */
  const isDarkRef = useRef(document.documentElement.classList.contains('dark'));

  /* ------------------------------------------------------------------ */
  /*  加载文件内容                                                        */
  /* ------------------------------------------------------------------ */

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  /* ------------------------------------------------------------------ */
  /*  解析 DWG/DXF 并渲染                                                */
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
        setStatusText('解析文件...');

        /* 初始化 WASM */
        const libredwg = await LibreDwg.create('/wasm/libredwg/');

        if (disposed) return;
        setStatusText('读取 DWG 数据...');

        /* 根据扩展名判断类型 */
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const fileType = ext === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;

        /* 解析文件 */
        const dwg = libredwg.dwg_read_data(buf as ArrayBuffer, fileType);

        if (disposed) return;
        if (!dwg) {
          throw new Error('解析失败：可能是不支持的文件格式或文件损坏');
        }

        setStatusText('转换数据...');
        const db = libredwg.convert(dwg) as unknown as DwgDatabase;
        libredwg.dwg_free(dwg);

        if (disposed) return;
        dbRef.current = db;

        /* 收集所有实体（包括块内的） */
        const allEntities: DwgEntity[] = [];
        if (db.entities) allEntities.push(...db.entities);

        /* 展开 INSERT 引用 */
        if (db.blocks) {
          for (const ent of db.entities || []) {
            if (ent.type === 'INSERT' && ent.name && db.blocks[ent.name]) {
              const block = db.blocks[ent.name];
              if (block.entities) {
                for (const bEnt of block.entities) {
                  allEntities.push({
                    ...bEnt,
                    /* 应用 INSERT 的偏移 */
                    insertion_point: ent.insertion_point || bEnt.insertion_point,
                  });
                }
              }
            }
          }
        }

        entitiesRef.current = allEntities;

        /* 计算边界框 */
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const ent of allEntities) {
          const pts: DwgPoint[] = [];
          if (ent.start) pts.push(ent.start);
          if (ent.end) pts.push(ent.end);
          if (ent.center) pts.push(ent.center);
          if (ent.insertion_point) pts.push(ent.insertion_point);
          if (ent.points) pts.push(...ent.points);
          for (const p of pts) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          }
          if (ent.center && ent.radius) {
            minX = Math.min(minX, ent.center.x - ent.radius);
            maxX = Math.max(maxX, ent.center.x + ent.radius);
            minY = Math.min(minY, ent.center.y - ent.radius);
            maxY = Math.max(maxY, ent.center.y + ent.radius);
          }
        }

        if (minX === Infinity) { minX = -100; minY = -100; maxX = 100; maxY = 100; }
        boundsRef.current = { minX, minY, maxX, maxY };

        /* 自动 fitBounds */
        const canvas = canvasRef.current;
        if (canvas) {
          const w = canvas.width;
          const h = canvas.height;
          const bw = maxX - minX || 1;
          const bh = maxY - minY || 1;
          const padding = 40;
          const scaleX = (w - padding * 2) / bw;
          const scaleY = (h - padding * 2) / bh;
          const zoom = Math.min(scaleX, scaleY);
          const panX = (w - bw * zoom) / 2 - minX * zoom;
          const panY = (h - bh * zoom) / 2 + maxY * zoom; /* Y轴翻转 */
          viewRef.current = { zoom, panX, panY };
        }

        setStatusText(`渲染 ${allEntities.length} 个实体...`);
        drawEntities();
        setLoading(false);
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
      drawEntities();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [loadBuffer, fileName, onError]);

  /* ------------------------------------------------------------------ */
  /*  Canvas 渲染                                                        */
  /* ------------------------------------------------------------------ */

  const drawEntities = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* 高 DPI 支持 */
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { zoom, panX, panY } = viewRef.current;
    const isDark = isDarkRef.current;

    /* 清除画布 */
    ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    /* 设置变换：CAD坐标→屏幕坐标（Y轴翻转） */
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, -zoom);

    /* 渲染每个实体 */
    for (const ent of entitiesRef.current) {
      const color = getColor(ent, isDark);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1 / zoom; /* 线宽不随缩放变化 */

      try {
        switch (ent.type) {
          case 'LINE': {
            if (ent.start && ent.end) {
              ctx.beginPath();
              ctx.moveTo(ent.start.x, ent.start.y);
              ctx.lineTo(ent.end.x, ent.end.y);
              ctx.stroke();
            }
            break;
          }
          case 'CIRCLE': {
            if (ent.center && ent.radius) {
              ctx.beginPath();
              ctx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
              ctx.stroke();
            }
            break;
          }
          case 'ARC': {
            if (ent.center && ent.radius && ent.start_angle !== undefined && ent.end_angle !== undefined) {
              ctx.beginPath();
              /* CAD 角度是度数，逆时针；Canvas 是弧度，顺时针 */
              const startRad = (ent.start_angle * Math.PI) / 180;
              const endRad = (ent.end_angle * Math.PI) / 180;
              ctx.arc(ent.center.x, ent.center.y, ent.radius, startRad, endRad, false);
              ctx.stroke();
            }
            break;
          }
          case 'POLYLINE':
          case 'LWPOLYLINE': {
            if (ent.points && ent.points.length > 1) {
              ctx.beginPath();
              ctx.moveTo(ent.points[0].x, ent.points[0].y);
              for (let i = 1; i < ent.points.length; i++) {
                ctx.lineTo(ent.points[i].x, ent.points[i].y);
              }
              /* 如果是闭合多段线 */
              if (ent.flag && (ent.flag & 1)) {
                ctx.closePath();
              }
              ctx.stroke();
            }
            break;
          }
          case 'TEXT':
          case 'MTEXT': {
            if (ent.insertion_point && ent.text_value) {
              const fontSize = ent.height || 2.5;
              ctx.save();
              ctx.translate(ent.insertion_point.x, ent.insertion_point.y);
              ctx.scale(1, -1); /* 文字需要再次翻转Y轴 */
              if (ent.rotation) {
                ctx.rotate((-ent.rotation * Math.PI) / 180);
              }
              ctx.font = `${fontSize}px sans-serif`;
              ctx.fillText(ent.text_value, 0, 0);
              ctx.restore();
            }
            break;
          }
          case 'ELLIPSE': {
            if (ent.center && ent.major_axis && ent.axis_ratio) {
              const majorLen = Math.sqrt(ent.major_axis.x ** 2 + ent.major_axis.y ** 2);
              const minorLen = majorLen * ent.axis_ratio;
              const angle = Math.atan2(ent.major_axis.y, ent.major_axis.x);
              ctx.save();
              ctx.translate(ent.center.x, ent.center.y);
              ctx.rotate(angle);
              ctx.beginPath();
              ctx.ellipse(0, 0, majorLen, minorLen, 0, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
            break;
          }
          case 'POINT': {
            if (ent.insertion_point) {
              ctx.beginPath();
              ctx.arc(ent.insertion_point.x, ent.insertion_point.y, 2 / zoom, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          default:
            /* 其他实体类型暂不渲染 */
            break;
        }
      } catch {
        /* 单个实体渲染失败不影响整体 */
      }
    }

    ctx.restore();
  }, []);

  /* ------------------------------------------------------------------ */
  /*  交互：缩放/拖拽                                                     */
  /* ------------------------------------------------------------------ */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { zoom, panX, panY } = viewRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = zoom * factor;

    /* 以鼠标位置为中心缩放 */
    const newPanX = mouseX - (mouseX - panX) * factor;
    const newPanY = mouseY - (mouseY - panY) * factor;

    viewRef.current = { zoom: newZoom, panX: newPanX, panY: newPanY };
    drawEntities();
  }, [drawEntities]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    const { panX, panY } = viewRef.current;
    dragStart.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    viewRef.current.panX = dragStart.current.px + dx;
    viewRef.current.panY = dragStart.current.py + dy;
    drawEntities();
  }, [drawEntities]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* fitBounds */
  const fitBounds = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { minX, minY, maxX, maxY } = boundsRef.current;
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const padding = 40;
    const scaleX = (w - padding * 2) / bw;
    const scaleY = (h - padding * 2) / bh;
    const zoom = Math.min(scaleX, scaleY);
    const panX = (w - bw * zoom) / 2 - minX * zoom;
    const panY = (h - bh * zoom) / 2 + maxY * zoom;
    viewRef.current = { zoom, panX, panY };
    drawEntities();
  }, [drawEntities]);

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

  /* 窗口大小变化时重绘 */
  useEffect(() => {
    const handleResize = () => drawEntities();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawEntities]);

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
          <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
        </div>
      )}

      {/* 工具栏 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">
            DWG · {entitiesRef.current.length} 实体
          </span>
          <div className="w-px h-4 bg-border" />
          <button onClick={() => {
            viewRef.current.zoom *= 1.2;
            drawEntities();
          }} className="p-1.5 hover:bg-accent rounded" title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => {
            viewRef.current.zoom *= 0.8;
            drawEntities();
          }} className="p-1.5 hover:bg-accent rounded" title="缩小">
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
