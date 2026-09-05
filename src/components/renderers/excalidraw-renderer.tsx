'use client';

/**
 * Excalidraw 图表渲染器
 *
 * 功能：
 * - 解析 .excalidraw JSON 格式
 * - 提取 elements 数组，根据 type 渲染为 SVG 元素
 * - 支持：rectangle → rect, ellipse → ellipse, line → line,
 *         arrow → line + marker, text → text, diamond → polygon
 * - 圆角矩形模拟手绘风格
 * - 缩放 / 拖拽平移 / 全屏
 * - 暗色/亮色主题自动适配
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** Excalidraw 元素基础属性 */
interface ExcalidrawElement {
  /** 元素类型 */
  type: string;
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 线条颜色 */
  strokeColor?: string;
  /** 填充颜色 */
  backgroundColor?: string;
  /** 线条宽度 */
  strokeWidth?: number;
  /** 透明度 */
  opacity?: number;
  /** 文本内容 */
  text?: string;
  /** 字体大小 */
  fontSize?: number;
  /** 点坐标（用于 line/arrow） */
  points?: [number, number][];
  /** 角度 */
  angle?: number;
  /** 是否填充 */
  fillStyle?: string;
  /** 圆角半径 */
  roundness?: { type: number } | null;
  /** 箭头头部类型 */
  startArrowhead?: string | null;
  /** 箭头尾部类型 */
  endArrowhead?: string | null;
}

/** Excalidraw 文件结构 */
interface ExcalidrawData {
  /** 图表元素 */
  elements: ExcalidrawElement[];
  /** 应用状态 */
  appState?: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
  };
  /** 文件类型标识 */
  type?: string;
  /** 版本 */
  version?: number;
  /** 源 */
  source?: string;
}

/** 组件 Props */
interface ExcalidrawRendererProps {
  /** 文件名 */
  fileName: string;
  /** 文件内容 data URL 或 blob URL */
  fileUrl?: string;
  /** 文件内容 ArrayBuffer */
  fileBuffer?: ArrayBuffer;
  /** 错误回调 */
  onError?: (err: Error) => void;
  /** 额外 className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  检测当前主题是否为暗色                                              */
/* ------------------------------------------------------------------ */

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/* ------------------------------------------------------------------ */
/*  Excalidraw 解析工具函数                                             */
/* ------------------------------------------------------------------ */

/**
 * 解析 .excalidraw JSON
 */
function parseExcalidraw(text: string): ExcalidrawData {
  const data = JSON.parse(text);

  if (!data.elements || !Array.isArray(data.elements)) {
    throw new Error('无效的 Excalidraw 文件：缺少 elements 数组');
  }

  return data as ExcalidrawData;
}

/**
 * 计算所有元素的边界框（用于自动居中）
 */
function getBoundingBox(elements: ExcalidrawElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const x = el.x;
    const y = el.y;
    const x2 = x + (el.width || 0);
    const y2 = y + (el.height || 0);

    // 对于 line/arrow，需要考虑 points
    if (el.points && el.points.length > 0) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, x + px);
        minY = Math.min(minY, y + py);
        maxX = Math.max(maxX, x + px);
        maxY = Math.max(maxY, y + py);
      }
    } else {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x2);
      maxY = Math.max(maxY, y2);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX || 100,
    height: maxY - minY || 100,
  };
}

/* ------------------------------------------------------------------ */
/*  单个元素渲染                                                        */
/* ------------------------------------------------------------------ */

/** 渲染单个 Excalidraw 元素为 SVG */
function renderElement(
  el: ExcalidrawElement,
  index: number,
  isDark: boolean
): React.ReactNode {
  const strokeColor = el.strokeColor && el.strokeColor !== 'transparent'
    ? el.strokeColor
    : isDark ? '#e0e0e0' : '#1a1a1a';
  const fillColor = el.backgroundColor && el.backgroundColor !== 'transparent'
    ? el.backgroundColor
    : 'none';
  const strokeWidth = el.strokeWidth || 2;
  const opacity = el.opacity !== undefined ? el.opacity / 100 : 1;

  const commonProps = {
    key: `el-${index}`,
    stroke: strokeColor,
    strokeWidth,
    fill: fillColor,
    opacity,
  };

  switch (el.type) {
    case 'rectangle': {
      // 圆角矩形（模拟手绘风格）
      const rx = el.roundness?.type === 3 ? Math.min(el.width, el.height) * 0.1 : 2;
      return (
        <rect
          {...commonProps}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={rx}
          ry={rx}
        />
      );
    }

    case 'ellipse': {
      return (
        <ellipse
          {...commonProps}
          cx={el.x + el.width / 2}
          cy={el.y + el.height / 2}
          rx={el.width / 2}
          ry={el.height / 2}
        />
      );
    }

    case 'diamond': {
      // 菱形：用 polygon 渲染
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const points = [
        `${cx},${el.y}`,
        `${el.x + el.width},${cy}`,
        `${cx},${el.y + el.height}`,
        `${el.x},${cy}`,
      ].join(' ');
      return (
        <polygon {...commonProps} points={points} />
      );
    }

    case 'line': {
      // 线段：使用 points 数组
      if (!el.points || el.points.length < 2) {
        return null;
      }
      const pathData = el.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${el.x + p[0]} ${el.y + p[1]}`)
        .join(' ');
      return <path {...commonProps} d={pathData} fill="none" />;
    }

    case 'arrow': {
      // 箭头：线段 + 箭头标记
      if (!el.points || el.points.length < 2) {
        return null;
      }
      const arrowPath = el.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${el.x + p[0]} ${el.y + p[1]}`)
        .join(' ');

      // 计算箭头头部方向
      const lastPoint = el.points[el.points.length - 1];
      const prevPoint = el.points[el.points.length - 2];
      const angle = Math.atan2(
        lastPoint[1] - prevPoint[1],
        lastPoint[0] - prevPoint[0]
      );
      const arrowLen = 10;
      const arrowAngle = Math.PI / 6;

      const tipX = el.x + lastPoint[0];
      const tipY = el.y + lastPoint[1];
      const leftX = tipX - arrowLen * Math.cos(angle - arrowAngle);
      const leftY = tipY - arrowLen * Math.sin(angle - arrowAngle);
      const rightX = tipX - arrowLen * Math.cos(angle + arrowAngle);
      const rightY = tipY - arrowLen * Math.sin(angle + arrowAngle);

      return (
        <g key={`el-${index}`} opacity={opacity}>
          <path
            d={arrowPath}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {el.endArrowhead !== null && (
            <polygon
              points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
              fill={strokeColor}
              stroke="none"
            />
          )}
        </g>
      );
    }

    case 'text': {
      // 文本元素
      const fontSize = el.fontSize || 16;
      return (
        <text
          key={`el-${index}`}
          x={el.x}
          y={el.y + fontSize}
          fill={strokeColor}
          fontSize={fontSize}
          fontFamily="sans-serif"
          opacity={opacity}
        >
          {el.text || ''}
        </text>
      );
    }

    case 'freedraw': {
      // 自由绘制路径
      if (!el.points || el.points.length < 2) {
        return null;
      }
      const freePath = el.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${el.x + p[0]} ${el.y + p[1]}`)
        .join(' ');
      return (
        <path
          {...commonProps}
          d={freePath}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    case 'image': {
      // 图片占位符
      return (
        <g key={`el-${index}`} opacity={opacity}>
          <rect
            x={el.x}
            y={el.y}
            width={el.width}
            height={el.height}
            fill={isDark ? '#333' : '#f0f0f0'}
            stroke={strokeColor}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x={el.x + el.width / 2}
            y={el.y + el.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isDark ? '#999' : '#666'}
            fontSize={12}
          >
            [图片]
          </text>
        </g>
      );
    }

    default: {
      // 未知类型：显示占位矩形
      return (
        <g key={`el-${index}`} opacity={opacity}>
          <rect
            x={el.x}
            y={el.y}
            width={el.width || 50}
            height={el.height || 30}
            fill={isDark ? '#333' : '#f0f0f0'}
            stroke={strokeColor}
            strokeWidth={1}
            strokeDasharray="4 2"
            rx={2}
          />
          <text
            x={el.x + (el.width || 50) / 2}
            y={el.y + (el.height || 30) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isDark ? '#999' : '#666'}
            fontSize={10}
          >
            [{el.type}]
          </text>
        </g>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function ExcalidrawRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: ExcalidrawRendererProps) {
  /* -------- 状态 -------- */
  const [data, setData] = useState<ExcalidrawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* 缩放 & 拖拽 */
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  /* 全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* Refs */
  const containerRef = useRef<HTMLDivElement>(null);

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 有效元素（过滤隐藏元素） -------- */
  const visibleElements = useMemo(() => {
    if (!data?.elements) return [];
    return data.elements.filter(
      (el) => el.opacity === undefined || el.opacity > 0
    );
  }, [data]);

  /* -------- 边界框 -------- */
  const bbox = useMemo(
    () => getBoundingBox(visibleElements),
    [visibleElements]
  );

  /* -------- 加载并解析 .excalidraw 文件 -------- */
  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      try {
        let text = '';

        if (fileBuffer) {
          text = new TextDecoder().decode(fileBuffer);
        } else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            const commaIdx = fileUrl.indexOf(',');
            if (commaIdx >= 0) {
              const base64Part = fileUrl.substring(commaIdx + 1);
              if (fileUrl.includes(';base64,')) {
                text = atob(base64Part);
              } else {
                text = decodeURIComponent(base64Part);
              }
            }
          } else {
            const res = await fetch(fileUrl);
            text = await res.text();
          }
        } else {
          throw new Error('未提供文件内容（fileUrl 或 fileBuffer）');
        }

        if (cancelled) return;

        const parsed = parseExcalidraw(text);

        if (cancelled) return;

        setData(parsed);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '加载 Excalidraw 文件失败';
          setError(message);
          onError?.(err instanceof Error ? err : new Error(message));
          setLoading(false);
        }
      }
    };

    loadContent();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, fileBuffer, fileName, onError]);

  /* -------- 缩放控制 -------- */
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s / 1.2, 0.1));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  /* -------- 鼠标滚轮缩放 -------- */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.max(0.1, Math.min(5, s * delta)));
  }, []);

  /* -------- 拖拽（pointer events） -------- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [translate]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setTranslate({
        x: translateStart.current.x + dx,
        y: translateStart.current.y + dy,
      });
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  /* -------- 全屏切换 -------- */
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // 全屏 API 不可用时静默失败
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  /* -------- 错误状态 -------- */
  if (error) {
    return (
      <div className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}>
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-500/20 text-pink-400">
            EXCALIDRAW
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-base font-medium text-foreground mb-2">
              Excalidraw 文件加载失败
            </h3>
            <p className="text-sm text-muted-foreground mb-1">{error}</p>
            <p className="text-xs text-muted-foreground/60">
              文件：{fileName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* -------- 加载中 -------- */
  if (loading || !data) {
    return (
      <div className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}>
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-500/20 text-pink-400">
            EXCALIDRAW
          </span>
          <div className="flex-1" />
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">正在解析 Excalidraw 文件...</span>
          </div>
        </div>
      </div>
    );
  }

  /* -------- SVG 视图框 -------- */
  // 添加一些边距
  const padding = 40;
  const viewBox = `${bbox.minX - padding} ${bbox.minY - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`;

  /* -------- 背景色 -------- */
  const bgColor = data.appState?.viewBackgroundColor;

  /* -------- 正常渲染 -------- */
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}
    >
      {/* ---- 工具栏 ---- */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式徽章 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-500/20 text-pink-400">
          EXCALIDRAW
        </span>

        {/* 元素计数 */}
        <span className="text-[10px] text-muted-foreground/50 ml-1">
          {visibleElements.length} 个元素
        </span>

        {/* 右侧工具 */}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[150px] mr-1">
          {fileName}
        </span>
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <button
          onClick={handleZoomOut}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-muted-foreground/50 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleReset}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title="重置"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ---- SVG 画布 ---- */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          backgroundColor: bgColor || (isDark ? '#1a1a1a' : '#ffffff'),
        }}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            width: '100%',
            height: '100%',
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={viewBox}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 渲染所有元素 */}
            {visibleElements.map((el, idx) => renderElement(el, idx, isDark))}
          </svg>
        </div>
      </div>
    </div>
  );
}
