'use client';

/**
 * CAD 图纸渲染器（基于 @flyfish-dev/cad-viewer）
 *
 * 功能：
 * - DWG/DXF/DWF 真实渲染（WebGL 优先，Canvas2D 回退）
 * - WASM 驱动的 LibreDWG 解析（DWG 二进制格式）
 * - 暗色/亮色主题自动适配
 * - 工具栏：重置视图（fit）、缩放、全屏切换
 * - 文件信息显示（格式、大小、加载耗时）
 * - 错误处理与加载状态
 * - 组件卸载时自动清理 viewer 资源
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

interface CadRendererProps {
  /** 文件名 */
  fileName: string;
  /** 文件内容 URL（可选） */
  fileUrl?: string;
  /** 文件内容 ArrayBuffer（可选） */
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器                                                         */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  /* 容器 DOM 引用 */
  const containerRef = useRef<HTMLDivElement>(null);
  /* viewer 实例引用（用于清理） */
  const viewerRef = useRef<any>(null);
  /* 全屏状态监听的容器引用 */
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ format: string; size: number; elapsedMs?: number } | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const isDark = useIsDarkMode();

  /* 加载文件内容 */
  const loadContent = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) {
      const resp = await fetch(fileUrl);
      if (!resp.ok) throw new Error(`获取文件失败: ${resp.status}`);
      return resp.arrayBuffer();
    }
    throw new Error('未提供文件内容（fileBuffer 或 fileUrl）');
  }, [fileUrl, fileBuffer]);

  /* 初始化 CadViewer */
  useEffect(() => {
    let destroyed = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        /* 动态导入 cad-viewer（避免 SSR 问题） */
        const { CadViewer } = await import('@flyfish-dev/cad-viewer');
        /* 导入样式 */
        await import('@flyfish-dev/cad-viewer/style.css');

        /* 检查组件是否已卸载 */
        if (destroyed || !containerRef.current) return;

        /* 获取文件内容 */
        const buf = await loadContent();
        if (destroyed) return;

        /* 记录文件大小 */
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const format = ext === 'dxf' ? 'DXF' : ext === 'dwg' ? 'DWG' : ext === 'dwf' ? 'DWF' : ext.toUpperCase();

        /* 创建 CadViewer 实例 */
        /* wasmPath 默认指向 /wasm/，WASM 文件已部署到 public/wasm/ */
        const viewer = new CadViewer({
          container: containerRef.current,
          renderer: 'auto', // WebGL 优先，Canvas2D 回退
          autoFit: true,
          onLoad(result) {
            if (destroyed) return;
            setLoading(false);
            setFileInfo({
              format: result.format?.toUpperCase() || format,
              size: buf.byteLength,
              elapsedMs: result.elapsedMs,
            });
            /* 更新缩放百分比 */
            try {
              const doc = viewer.getDocument();
              if (doc) {
                setZoomPercent(Math.round(viewer.getZoomPercent()));
              }
            } catch { /* 忽略 */ }
          },
          onError(err) {
            if (destroyed) return;
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            setLoading(false);
            onError?.(err instanceof Error ? err : new Error(msg));
          },
        });

        viewerRef.current = viewer;

        /* 加载文件 */
        await viewer.loadBuffer(buf, fileName);
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : '加载 CAD 文件失败';
        setError(msg);
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(msg));
      }
    }

    init();

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch { /* 忽略清理错误 */ }
        viewerRef.current = null;
      }
    };
  }, [loadContent, fileName, onError]);

  /* 监听全屏变化 */
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  /* 切换全屏 */
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => { /* 忽略 */ });
    } else {
      document.exitFullscreen().catch(() => { /* 忽略 */ });
    }
  }, []);

  /* 重置视图（fit to screen） */
  const resetView = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.fit();
        setZoomPercent(Math.round(viewerRef.current.getZoomPercent()));
      } catch { /* 忽略 */ }
    }
  }, []);

  /* 放大 */
  const zoomIn = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.zoomIn();
        setZoomPercent(Math.round(viewerRef.current.getZoomPercent()));
      } catch { /* 忽略 */ }
    }
  }, []);

  /* 缩小 */
  const zoomOut = useCallback(() => {
    if (viewerRef.current) {
      try {
        viewerRef.current.zoomOut();
        setZoomPercent(Math.round(viewerRef.current.getZoomPercent()));
      } catch { /* 忽略 */ }
    }
  }, []);

  /* 暗色主题下覆盖 cad-viewer 默认的白色背景 */
  const bgStyle = isDark ? { backgroundColor: '#1a1a1a' } : undefined;

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}
    >
      {/* 加载状态 */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 z-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">正在加载 CAD 文件...</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-20">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground text-center max-w-md px-4">{error}</p>
        </div>
      )}

      {/* cad-viewer 挂载容器 */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={bgStyle}
      />

      {/* 工具栏 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          {/* 文件信息 */}
          {fileInfo && (
            <>
              <span className="text-xs text-muted-foreground px-2">
                {fileInfo.format} · {(fileInfo.size / 1024).toFixed(1)} KB
                {fileInfo.elapsedMs !== undefined && ` · ${fileInfo.elapsedMs}ms`}
              </span>
              <div className="w-px h-4 bg-border" />
            </>
          )}
          {/* 缩放百分比 */}
          <span className="text-xs text-muted-foreground px-1 min-w-[3rem] text-center">
            {zoomPercent}%
          </span>
          <div className="w-px h-4 bg-border" />
          {/* 缩小 */}
          <button
            onClick={zoomOut}
            className="p-1.5 hover:bg-accent rounded"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {/* 放大 */}
          <button
            onClick={zoomIn}
            className="p-1.5 hover:bg-accent rounded"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {/* 重置视图 */}
          <button
            onClick={resetView}
            className="p-1.5 hover:bg-accent rounded"
            title="重置视图"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {/* 全屏切换 */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-accent rounded"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
