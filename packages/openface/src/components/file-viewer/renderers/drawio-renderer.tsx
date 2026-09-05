'use client';

/**
 * Draw.io (diagrams.net) 图表渲染器
 *
 * 功能：
 * - 解析 .drawio XML（mxfile 格式），提取内嵌 SVG 直接渲染（离线可用）
 * - 若 XML 中无 SVG 内容，fallback 到 iframe 嵌入 viewer.diagrams.net（需联网）
 * - 支持多页面切换（多个 <diagram> 节点）
 * - SVG 缩放（CSS transform scale + 鼠标滚轮）
 * - 拖拽平移（pointer events，兼容触摸）
 * - 全屏切换
 * - 工具栏：页面切换、缩放+/-、重置、全屏、下载 SVG
 * - 暗色/亮色主题自动适配
 * - 错误处理：解析失败时显示错误信息和原始 XML
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  RotateCcw,
  AlertTriangle,
  Code,
  Eye,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** 单个 diagram 页面 */
interface DiagramPage {
  /** 页面 ID */
  id: string;
  /** 页面名称 */
  name: string;
  /** 内嵌 SVG 字符串（可能为空） */
  svg: string;
  /** 原始 mxGraphModel XML（用于 fallback） */
  xml: string;
}

/** 组件 Props */
interface DrawioRendererProps {
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
/*  XML 解析工具函数                                                   */
/* ------------------------------------------------------------------ */

/**
 * 解析 .drawio XML，提取所有 diagram 页面
 *
 * .drawio 文件结构：
 * <mxfile>
 *   <diagram name="Page-1" id="xxx">
 *     <mxGraphModel>...</mxGraphModel>
 *     <!-- 或者包含 <svg>...</svg> -->
 *   </diagram>
 * </mxfile>
 */
function parseDrawioXml(xmlText: string): DiagramPage[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // 检查解析错误
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML 解析失败: ${parseError.textContent?.slice(0, 200)}`);
  }

  // 获取所有 <diagram> 节点
  const diagrams = doc.querySelectorAll('diagram');
  if (diagrams.length === 0) {
    // 有些 .drawio 文件直接是 <mxfile> 包裹 <mxGraphModel>，没有 <diagram> 包装
    // 尝试直接查找 mxGraphModel
    const mxGraphModel = doc.querySelector('mxGraphModel');
    if (mxGraphModel) {
      // 整个文档作为一个页面
      const svgEl = doc.querySelector('svg');
      return [
        {
          id: 'default',
          name: 'Page-1',
          svg: svgEl ? new XMLSerializer().serializeToString(svgEl) : '',
          xml: new XMLSerializer().serializeToString(mxGraphModel),
        },
      ];
    }
    throw new Error('未找到 <diagram> 或 <mxGraphModel> 节点，请确认文件格式');
  }

  // 提取每个 diagram 页面
  const pages: DiagramPage[] = [];
  diagrams.forEach((diagram, index) => {
    const id = diagram.getAttribute('id') || `page-${index}`;
    const name = diagram.getAttribute('name') || `Page-${index + 1}`;

    // 查找内嵌 SVG（diagrams.net 导出时可能包含 SVG）
    const svgEl = diagram.querySelector('svg');
    const svg = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';

    // 获取 mxGraphModel 的完整 XML（用于 iframe fallback）
    const mxGraphModel = diagram.querySelector('mxGraphModel');
    const xml = mxGraphModel
      ? new XMLSerializer().serializeToString(mxGraphModel)
      : new XMLSerializer().serializeToString(diagram);

    pages.push({ id, name, svg, xml });
  });

  return pages;
}

/**
 * 为 iframe fallback 构建 mxfile XML（单个 diagram 页面）
 */
function buildMxfileXml(page: DiagramPage): string {
  return `<mxfile><diagram id="${page.id}" name="${page.name}">${page.xml}</diagram></mxfile>`;
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function DrawioRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: DrawioRendererProps) {
  /* -------- 状态 -------- */
  const [pages, setPages] = useState<DiagramPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [rawXml, setRawXml] = useState<string>('');

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
  const svgContainerRef = useRef<HTMLDivElement>(null);

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 当前页面 -------- */
  const currentPageData = useMemo(
    () => pages[currentPage] || null,
    [pages, currentPage]
  );

  /* 是否需要 iframe fallback（当前页面无 SVG 内容） */
  const useIframeFallback = useMemo(
    () => currentPageData && !currentPageData.svg,
    [currentPageData]
  );

  /* -------- 加载并解析文件内容 -------- */
  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      try {
        let text = '';

        if (fileBuffer) {
          // 从 ArrayBuffer 解码
          text = new TextDecoder().decode(fileBuffer);
        } else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            // data URL 解码
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
            // 普通 URL fetch
            const res = await fetch(fileUrl);
            text = await res.text();
          }
        }

        if (cancelled) return;

        // 保存原始 XML
        setRawXml(text);

        // 解析 drawio XML
        const parsed = parseDrawioXml(text);
        if (parsed.length === 0) {
          throw new Error('未在文件中找到任何 diagram 页面');
        }

        setPages(parsed);
        setCurrentPage(0);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '加载 Draw.io 文件失败';
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

  /* -------- 切换页面时重置缩放 -------- */
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [currentPage]);

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

  /* -------- 拖拽（pointer events，兼容触摸） -------- */
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

  /* -------- 页面切换 -------- */
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(pages.length - 1, p + 1));
  }, [pages.length]);

  /* -------- 下载 SVG -------- */
  const handleDownloadSVG = useCallback(() => {
    if (!currentPageData?.svg) return;
    const blob = new Blob([currentPageData.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    a.download = pages.length > 1
      ? `${baseName}-${currentPageData.name}.svg`
      : `${baseName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentPageData, fileName, pages.length]);

  /* -------- 构建 iframe src（fallback 模式） -------- */
  const iframeSrc = useMemo(() => {
    if (!currentPageData || currentPageData.svg) return '';
    // 使用 diagrams.net 的在线 viewer
    // 注意：这是简单的 GET 方式，对于大型图表可能有 URL 长度限制
    // 生产环境可考虑 POST 方式或自托管 viewer
    const mxfileXml = buildMxfileXml(currentPageData);
    const encoded = encodeURIComponent(mxfileXml);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _theme = isDark ? 'dark' : 'light';
    return `https://viewer.diagrams.net/?embed=1&lightbox=1&edit=_blank`;
  }, [currentPageData, isDark]);

  /* -------- iframe load handler（POST xml 数据到 iframe） -------- */
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!useIframeFallback || !currentPageData || !iframeRef.current) return;
    // 等 iframe 加载完成后 POST xml 数据
    const iframe = iframeRef.current;
    const handleLoad = () => {
      try {
        const mxfileXml = buildMxfileXml(currentPageData);
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            action: 'load',
            xml: mxfileXml,
            isDark,
          }),
          'https://viewer.diagrams.net'
        );
      } catch {
        // iframe 通信可能被阻止，静默处理
      }
    };
    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [useIframeFallback, currentPageData, isDark]);

  /* -------- 渲染 -------- */
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}
    >
      {/* ---- 工具栏 ---- */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式徽章 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
          DRAW.IO
        </span>

        {/* 页面切换（仅多页面时显示） */}
        {pages.length > 1 && (
          <>
            <div className="w-px h-4 bg-border/30 mx-0.5" />
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 0}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一页"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              className="text-[11px] bg-transparent border border-border/30 rounded px-1 py-0.5 text-muted-foreground cursor-pointer max-w-[120px] truncate"
              title="选择页面"
            >
              {pages.map((page, idx) => (
                <option key={page.id} value={idx}>
                  {page.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= pages.length - 1}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一页"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground/50">
              {currentPage + 1}/{pages.length}
            </span>
          </>
        )}

        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {/* 源码/预览切换 */}
        <button
          onClick={() => setShowSource(false)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            !showSource
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted/30 text-muted-foreground'
          }`}
          title="预览图表"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">预览</span>
        </button>
        <button
          onClick={() => setShowSource(true)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            showSource
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted/30 text-muted-foreground'
          }`}
          title="查看源码"
        >
          <Code className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">源码</span>
        </button>

        {/* 仅在 SVG 模式下显示缩放控件（iframe 模式由 iframe 自己处理缩放） */}
        {!useIframeFallback && !showSource && (
          <>
            <div className="w-px h-4 bg-border/30 mx-0.5" />

            {/* 缩放控制 */}
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
              title="重置视图"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* 文件名 */}
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px] mx-2">
          {fileName}
        </span>
        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {/* 全屏 */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 下载 SVG（仅当有 SVG 内容时可用） */}
        <button
          onClick={handleDownloadSVG}
          className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30"
          title="下载 SVG"
          disabled={!currentPageData?.svg}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ---- 内容区域 ---- */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {/* 加载状态 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10 bg-background/80">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>解析中...</span>
            </div>
          </div>
        )}

        {/* 源码视图 */}
        {showSource && (
          <pre className="absolute inset-0 p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-auto text-green-400 bg-[var(--color-background)] z-20">
            {rawXml}
          </pre>
        )}

        {/* 错误状态 */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 z-10">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">加载失败</span>
            </div>
            <div className="max-w-lg text-center">
              <p className="text-xs text-muted-foreground mb-3">{error}</p>
              <details className="text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  查看原始 XML
                </summary>
                <pre className="mt-2 p-3 bg-muted/30 rounded text-[11px] font-mono overflow-auto max-h-60 text-muted-foreground">
                  {rawXml}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* SVG 渲染模式（文件内嵌 SVG） */}
        {!showSource && !useIframeFallback && currentPageData?.svg && !error && (
          <div
            ref={svgContainerRef}
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            <div
              className="w-full h-full flex items-center justify-center p-4"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
              dangerouslySetInnerHTML={{ __html: currentPageData.svg }}
            />
          </div>
        )}

        {/* iframe fallback 模式（使用 diagrams.net 在线 viewer） */}
        {!showSource && useIframeFallback && !error && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full border-0"
            title={`Draw.io - ${fileName}`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            allow="clipboard-write"
          />
        )}

        {/* 空状态（无 SVG 也无 xml） */}
        {!loading && !error && !currentPageData && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-muted-foreground/30" />
              <span>无可显示的内容</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
