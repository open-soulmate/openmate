'use client';

/**
 * Mermaid 图表渲染器
 *
 * 功能：
 * - 动态导入 mermaid（SSR 兼容）
 * - 支持 .mmd / .mermaid 文件以及 markdown 中的 ```mermaid 代码块
 * - SVG 缩放（CSS transform scale + 鼠标滚轮）
 * - 拖拽平移（pointer events，兼容触摸）
 * - 全屏切换
 * - 工具栏：缩放+/-、重置、全屏、下载 SVG
 * - 暗色/亮色主题自动适配
 * - 渲染失败时显示错误信息和原始代码
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props 定义                                                         */
/* ------------------------------------------------------------------ */

interface MermaidRendererProps {
  /** 文件名（用于下载等） */
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
/*  唯一 ID 生成器（避免多个图表 ID 冲突）                             */
/* ------------------------------------------------------------------ */

let mermaidIdCounter = 0;
function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${++mermaidIdCounter}`;
}

/* ------------------------------------------------------------------ */
/*  从 Markdown 中提取 mermaid 代码块                                   */
/* ------------------------------------------------------------------ */

function extractMermaidFromMarkdown(text: string): string | null {
  // 匹配 ```mermaid ... ``` 代码块
  const match = text.match(/```mermaid\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
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
    // 监听 <html> 的 class 变化
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
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function MermaidRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: MermaidRendererProps) {
  /* -------- 状态 -------- */
  const [svgContent, setSvgContent] = useState<string>('');
  const [rawCode, setRawCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

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
  const mermaidIdRef = useRef(generateMermaidId());

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 加载文件内容 -------- */
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
              // 检查是否是 base64 编码
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

        // 检查是否是 markdown 中的 mermaid 代码块
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (ext === 'md' || ext === 'markdown' || ext === 'mdx') {
          const extracted = extractMermaidFromMarkdown(text);
          if (extracted) {
            text = extracted;
          } else {
            setError('未在 Markdown 中找到 ```mermaid 代码块');
            setRawCode(text);
            setLoading(false);
            return;
          }
        }

        setRawCode(text);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '加载文件失败';
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

  /* -------- 渲染 Mermaid -------- */
  useEffect(() => {
    if (!rawCode) return;

    let cancelled = false;

    const renderMermaid = async () => {
      setLoading(true);
      setError(null);

      try {
        // 动态导入 mermaid（避免 SSR 问题）
        const mermaid = (await import('mermaid')).default;

        // 初始化 mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        // 生成新的唯一 ID
        const id = generateMermaidId();
        mermaidIdRef.current = id;

        // 渲染 SVG
        const { svg } = await mermaid.render(id, rawCode);

        if (!cancelled) {
          setSvgContent(svg);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Mermaid 渲染失败';
          setError(message);
          onError?.(err instanceof Error ? err : new Error(message));
          setLoading(false);
        }
      }
    };

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [rawCode, isDark, onError]);

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
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.max(0.1, Math.min(5, s * delta)));
    },
    []
  );

  /* -------- 拖拽（pointer events，兼容触摸） -------- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 只响应左键（鼠标）或触摸
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
      // 捕获指针，确保拖拽不丢失
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

  // 监听全屏状态变化（用户按 Esc 退出等）
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  /* -------- 下载 SVG -------- */
  const handleDownloadSVG = useCallback(() => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 下载文件名：原文件名去掉扩展名 + .svg
    const baseName = fileName.replace(/\.[^.]+$/, '');
    a.download = `${baseName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [svgContent, fileName]);

  /* -------- 渲染 -------- */
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}
    >
      {/* ---- 工具栏 ---- */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式徽章 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
          MERMAID
        </span>
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

        {/* 下载 SVG */}
        <button
          onClick={handleDownloadSVG}
          className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors"
          title="下载 SVG"
          disabled={!svgContent}
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
              <span>渲染中...</span>
            </div>
          </div>
        )}

        {/* 源码视图 */}
        {showSource && (
          <pre className="absolute inset-0 p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-auto text-green-400 bg-[var(--color-background)] z-20">
            {rawCode}
          </pre>
        )}

        {/* 错误状态 */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 z-10">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">渲染失败</span>
            </div>
            <div className="max-w-lg text-center">
              <p className="text-xs text-muted-foreground mb-3">{error}</p>
              {/* 显示原始代码供调试 */}
              <details className="text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  查看原始代码
                </summary>
                <pre className="mt-2 p-3 bg-muted/30 rounded text-[11px] font-mono overflow-auto max-h-60 text-muted-foreground">
                  {rawCode}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* SVG 渲染区域（支持缩放和拖拽） */}
        {!showSource && svgContent && !error && (
          <div
            ref={svgContainerRef}
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }} /* 禁止触摸时浏览器默认缩放 */
          >
            <div
              className="w-full h-full flex items-center justify-center p-4"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
