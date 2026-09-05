'use client';

/**
 * CAD 图纸渲染器
 *
 * 功能：
 * - DXF 文本格式：解析 ENTITIES 段提取 LINE/ARC/CIRCLE/LWPOLYLINE，SVG 渲染
 * - DWG/DWF 二进制格式：显示文件元信息（大小、版本检测）
 * - 缩放/拖拽/全屏
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw,
  AlertTriangle, Code,
} from 'lucide-react';

interface CadRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  DXF 实体类型                                                       */
/* ------------------------------------------------------------------ */

interface DxfEntity {
  type: string;
  /** SVG path 片段 */
  d?: string;
  /** SVG 元素（圆等） */
  svg?: string;
}

/** 解析 DXF 文本，提取 ENTITIES 段中的几何实体 */
function parseDxfEntities(text: string): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const lines = text.split(/\r?\n/);

  let inEntities = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line === 'ENTITIES') inEntities = true;
    if (inEntities && line === 'ENDSEC') break;

    if (inEntities) {
      if (line === 'LINE') {
        const coords: Record<string, number> = {};
        for (let j = 0; j < 12 && i + j + 1 < lines.length; j += 2) {
          const code = lines[i + j + 1]?.trim();
          const val = lines[i + j + 2]?.trim();
          if (code === '10') coords.x1 = parseFloat(val);
          if (code === '20') coords.y1 = parseFloat(val);
          if (code === '11') coords.x2 = parseFloat(val);
          if (code === '21') coords.y2 = parseFloat(val);
        }
        if (coords.x1 !== undefined && coords.y1 !== undefined &&
            coords.x2 !== undefined && coords.y2 !== undefined) {
          entities.push({
            type: 'LINE',
            d: `M${coords.x1},${-coords.y1}L${coords.x2},${-coords.y2}`,
          });
        }
      } else if (line === 'CIRCLE') {
        const props: Record<string, number> = {};
        for (let j = 0; j < 8 && i + j + 1 < lines.length; j += 2) {
          const code = lines[i + j + 1]?.trim();
          const val = lines[i + j + 2]?.trim();
          if (code === '10') props.cx = parseFloat(val);
          if (code === '20') props.cy = parseFloat(val);
          if (code === '40') props.r = parseFloat(val);
        }
        if (props.cx !== undefined && props.r !== undefined) {
          entities.push({
            type: 'CIRCLE',
            svg: `<circle cx="${props.cx}" cy="${-props.cy}" r="${props.r}" fill="none" stroke-width="1"/>`,
          });
        }
      } else if (line === 'LWPOLYLINE') {
        const pts: [number, number][] = [];
        let vertexCount = 0;
        for (let j = 0; j < 200 && i + j + 1 < lines.length; j += 2) {
          const code = lines[i + j + 1]?.trim();
          const val = lines[i + j + 2]?.trim();
          if (code === '90') vertexCount = parseInt(val);
          if (code === '10') { pts.push([parseFloat(val), 0]); }
          if (code === '20' && pts.length > 0) { pts[pts.length - 1][1] = -parseFloat(val); }
          if (code === '0') break; // 下一个实体
        }
        if (pts.length > 1) {
          const d = 'M' + pts.map(p => `${p[0]},${p[1]}`).join('L');
          entities.push({ type: 'LWPOLYLINE', d });
        }
      }
    }
    i++;
  }
  return entities;
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器                                                         */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<DxfEntity[]>([]);
  const [isBinary, setIsBinary] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ size: number; type: string }>({ size: 0, type: '' });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const loadContent = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const buf = await loadContent();
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        setFileInfo({ size: buf.byteLength, type: ext === 'dxf' ? 'DXF' : ext === 'dwg' ? 'DWG' : 'DWF' });

        if (ext === 'dxf') {
          const text = new TextDecoder().decode(buf);
          /* 检测是否为二进制 DXF */
          if (text.startsWith('AutoCAD Binary DXF')) {
            setIsBinary(true);
            setError('二进制 DXF 文件，暂不支持预览');
          } else {
            const ents = parseDxfEntities(text);
            setEntities(ents);
            if (ents.length === 0) setError('未找到可渲染的几何实体');
          }
        } else {
          /* DWG/DWF 是纯二进制 */
          setIsBinary(true);
        }
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 CAD 文件失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadContent, fileName, onError]);

  /* 计算 SVG viewBox */
  const getViewBox = () => {
    if (entities.length === 0) return '-100 -100 200 200';
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      if (e.d) {
        const nums = e.d.match(/-?[\d.]+/g)?.map(Number) || [];
        for (let k = 0; k < nums.length; k += 2) {
          minX = Math.min(minX, nums[k]); maxX = Math.max(maxX, nums[k]);
          minY = Math.min(minY, nums[k + 1]); maxY = Math.max(maxY, nums[k + 1]);
        }
      }
    }
    const pad = 20;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(10, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x, y: dragStart.current.py + e.clientY - dragStart.current.y });
  };
  const handlePointerUp = () => setIsDragging(false);

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="text-sm text-muted-foreground">解析 CAD 文件...</div>
        </div>
      )}

      {error && !isBinary && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-10">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* 二进制文件信息 */}
      {isBinary && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 z-10">
          <Code className="w-12 h-12 text-blue-400" />
          <div className="text-lg font-medium">{fileName}</div>
          <div className="text-sm text-muted-foreground">
            {fileInfo.type} 二进制文件 · {(fileInfo.size / 1024).toFixed(1)} KB
          </div>
          <p className="text-xs text-muted-foreground max-w-md text-center">
            {fileInfo.type === 'DWG'
              ? 'DWG 是 AutoCAD 私有二进制格式，需要专用解析库。当前仅显示文件信息。'
              : fileInfo.type === 'DWF'
              ? 'DWF 是 Autodesk Design Web Format，需要专用解析库。'
              : '二进制 DXF 文件需要专用解析器。请使用文本格式的 DXF。'}
          </p>
        </div>
      )}

      {/* SVG 渲染 DXF 实体 */}
      {!loading && !isBinary && entities.length > 0 && (
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox={getViewBox()}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <g transform={`translate(${pan.x / zoom},${pan.y / zoom}) scale(${zoom})`}>
            {entities.map((e, i) =>
              e.d ? (
                <path key={i} d={e.d} fill="none" stroke="var(--color-text-primary, #e5e5e5)" strokeWidth="0.5" />
              ) : e.svg ? (
                <g key={i} dangerouslySetInnerHTML={{ __html: e.svg.replace('/>', ` stroke="var(--color-text-primary, #e5e5e5)"/>`) }} />
              ) : null
            )}
          </g>
        </svg>
      )}

      {/* 工具栏 */}
      {!loading && !isBinary && entities.length > 0 && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">DXF · {entities.length} 实体</span>
          <div className="w-px h-4 bg-border" />
          <button onClick={() => setZoom(z => z * 1.2)} className="p-1.5 hover:bg-accent rounded"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => setZoom(z => z * 0.8)} className="p-1.5 hover:bg-accent rounded"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={resetView} className="p-1.5 hover:bg-accent rounded"><RotateCcw className="w-4 h-4" /></button>
          <button onClick={toggleFullscreen} className="p-1.5 hover:bg-accent rounded">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
