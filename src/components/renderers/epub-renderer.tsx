'use client';

/**
 * EPUB 电子书渲染器
 *
 * 功能：
 * - 用 JSZip 解压 .epub 文件
 * - 读取 META-INF/container.xml → content.opf → 获取章节列表
 * - 渲染章节内容（XHTML）为 HTML，用 dangerouslySetInnerHTML + basicSanitize
 * - 左侧目录导航 + 右侧内容区
 * - 上一章/下一章翻页
 * - 暗色/亮色主题自动适配
 * - 缩放 / 全屏
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
  ChevronLeft,
  ChevronRight,
  BookOpen,
  List,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** EPUB 章节信息 */
interface EpubChapter {
  /** 章节 ID（来自 opf manifest） */
  id: string;
  /** 章节标题（来自 nav 或文件名） */
  title: string;
  /** 章节在 ZIP 中的路径（相对于 opf 文件所在目录） */
  href: string;
  /** 媒体类型 */
  mediaType: string;
}

/** 解析后的 EPUB 数据 */
interface EpubData {
  /** 书籍标题 */
  title: string;
  /** 章节列表 */
  chapters: EpubChapter[];
  /** opf 文件所在目录（用于解析相对路径） */
  basePath: string;
}

/** 组件 Props */
interface EpubRendererProps {
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
/*  HTML 清理函数                                                       */
/* ------------------------------------------------------------------ */

/**
 * 基础 HTML 清理（轻量方案，不依赖 DOMPurify）
 * 移除 script/style/iframe/object/embed 标签及其内容
 * 移除所有 on* 事件属性
 * 移除 javascript: 协议的 href/src
 */
function basicSanitize(html: string): string {
  // 移除危险标签及其内容
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '');

  // 移除 on* 事件属性
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 移除 javascript: 协议
  clean = clean.replace(
    /((?:href|src|action)\s*=\s*)(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    '$1""'
  );

  return clean;
}

/* ------------------------------------------------------------------ */
/*  EPUB 解析工具函数                                                   */
/* ------------------------------------------------------------------ */

/**
 * 从 ArrayBuffer（ZIP）中解析 EPUB 结构
 *
 * EPUB 结构：
 * - META-INF/container.xml → 指向 content.opf 的路径
 * - content.opf → manifest 列出所有资源，spine 定义阅读顺序
 * - 每个 spine item 指向一个 XHTML 章节文件
 */
async function parseEpubFromBuffer(buffer: ArrayBuffer): Promise<EpubData> {
  // 动态导入 JSZip（项目已安装）
  const JSZip = await import('jszip');
  const zip = await JSZip.default.loadAsync(buffer);

  // 1. 读取 META-INF/container.xml
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('未找到 META-INF/container.xml，请确认是有效的 EPUB 文件');
  }

  const containerXml = await containerFile.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');

  // 查找 rootfile（content.opf 的路径）
  const rootfile = containerDoc.querySelector('rootfile');
  if (!rootfile) {
    throw new Error('container.xml 中未找到 rootfile 元素');
  }

  const opfPath = rootfile.getAttribute('full-path');
  if (!opfPath) {
    throw new Error('rootfile 缺少 full-path 属性');
  }

  // 2. 读取 content.opf
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`未找到 content.opf 文件: ${opfPath}`);
  }

  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');

  // opf 所在目录（用于解析相对路径）
  const basePath = opfPath.includes('/')
    ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
    : '';

  // 3. 获取书籍标题
  const titleEl = opfDoc.querySelector('metadata title, metadata > dc\\:title, title');
  const title = titleEl?.textContent || '(未知标题)';

  // 4. 解析 manifest（资源清单）
  // manifest 中每个 item 有 id, href, media-type
  const manifestItems = new Map<string, { href: string; mediaType: string }>();
  const manifestEl = opfDoc.querySelector('manifest');
  if (manifestEl) {
    const items = manifestEl.querySelectorAll('item');
    items.forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';
      if (id && href) {
        manifestItems.set(id, { href, mediaType });
      }
    });
  }

  // 5. 解析 spine（阅读顺序）
  const chapters: EpubChapter[] = [];
  const spineEl = opfDoc.querySelector('spine');
  if (spineEl) {
    const itemrefs = spineEl.querySelectorAll('itemref');
    itemrefs.forEach((ref) => {
      const idref = ref.getAttribute('idref');
      if (idref && manifestItems.has(idref)) {
        const item = manifestItems.get(idref)!;
        // 只包含 XHTML/HTML 类型的章节
        if (
          item.mediaType.includes('html') ||
          item.mediaType.includes('xhtml')
        ) {
          // 解码 href（可能包含 %20 等编码）
          const decodedHref = decodeURIComponent(item.href);
          chapters.push({
            id: idref,
            title: decodedHref.replace(/\.x?html?$/i, '').replace(/[-_]/g, ' '),
            href: basePath + decodedHref,
            mediaType: item.mediaType,
          });
        }
      }
    });
  }

  // 如果 spine 没有章节，尝试从 manifest 中直接获取 HTML 文件
  if (chapters.length === 0) {
    manifestItems.forEach((item, id) => {
      if (item.mediaType.includes('html') || item.mediaType.includes('xhtml')) {
        const decodedHref = decodeURIComponent(item.href);
        chapters.push({
          id,
          title: decodedHref.replace(/\.x?html?$/i, '').replace(/[-_]/g, ' '),
          href: basePath + decodedHref,
          mediaType: item.mediaType,
        });
      }
    });
  }

  if (chapters.length === 0) {
    throw new Error('EPUB 文件中未找到任何章节内容');
  }

  return { title, chapters, basePath };
}

/**
 * 从 ZIP 中读取指定章节的 HTML 内容
 * 同时尝试提取 <body> 内容以避免嵌套 HTML 文档问题
 */
async function readChapterContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zip: any,
  href: string
): Promise<string> {
  // ZIP 中的路径需要 URI 编码（处理中文和空格）
  // 先尝试原始路径，再尝试编码后的路径
  let file = zip.file(href);
  if (!file) {
    // 尝试对路径中每个段分别编码
    const encodedHref = href
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    file = zip.file(encodedHref);
  }

  if (!file) {
    return `<p style="color: #999;">无法加载章节内容: ${href}</p>`;
  }

  const html = await file.async('text');

  // 尝试提取 <body> 内容（避免嵌套 <html>/<head> 标签）
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function EpubRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: EpubRendererProps) {
  /* -------- 状态 -------- */
  const [epubData, setEpubData] = useState<EpubData | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapterContent, setChapterContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* 缩放 */
  const [scale, setScale] = useState(1);

  /* 全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* 侧边栏目录显示状态 */
  const [showToc, setShowToc] = useState(true);

  /* Refs */
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** 保存解压后的 zip 实例，用于后续读取章节 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zipRef = useRef<any>(null);

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 加载并解析 .epub 文件 -------- */
  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      try {
        let buffer: ArrayBuffer;

        if (fileBuffer) {
          buffer = fileBuffer;
        } else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            // data URL 解码为 ArrayBuffer
            const commaIdx = fileUrl.indexOf(',');
            if (commaIdx < 0) throw new Error('无效的 data URL');
            const base64Part = fileUrl.substring(commaIdx + 1);
            const binaryStr = atob(base64Part);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            buffer = bytes.buffer;
          } else {
            // 普通 URL fetch
            const res = await fetch(fileUrl);
            buffer = await res.arrayBuffer();
          }
        } else {
          throw new Error('未提供文件内容（fileUrl 或 fileBuffer）');
        }

        if (cancelled) return;

        // 解压 ZIP 并保存实例
        const JSZip = await import('jszip');
        const zip = await JSZip.default.loadAsync(buffer);
        zipRef.current = zip;

        // 解析 EPUB 结构
        const data = await parseEpubFromBuffer(buffer);

        if (cancelled) return;

        setEpubData(data);
        setCurrentChapter(0);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '加载 EPUB 文件失败';
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

  /* -------- 加载当前章节内容 -------- */
  useEffect(() => {
    if (!epubData || !zipRef.current) return;

    let cancelled = false;

    const loadChapter = async () => {
      try {
        const chapter = epubData.chapters[currentChapter];
        if (!chapter) return;

        const content = await readChapterContent(zipRef.current!, chapter.href);

        if (!cancelled) {
          setChapterContent(content);
          // 滚动到顶部
          contentRef.current?.scrollTo({ top: 0 });
        }
      } catch (err) {
        if (!cancelled) {
          setChapterContent('<p>加载章节内容失败</p>');
        }
      }
    };

    loadChapter();
    return () => {
      cancelled = true;
    };
  }, [epubData, currentChapter]);

  /* -------- 缩放控制 -------- */
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + 0.1, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - 0.1, 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
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

  /* -------- 章节切换 -------- */
  const handlePrevChapter = useCallback(() => {
    setCurrentChapter((c) => Math.max(0, c - 1));
  }, []);

  const handleNextChapter = useCallback(() => {
    if (!epubData) return;
    setCurrentChapter((c) => Math.min(epubData.chapters.length - 1, c + 1));
  }, [epubData]);

  /* -------- 错误状态 -------- */
  if (error) {
    return (
      <div className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}>
        {/* 工具栏 */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400">
            EPUB
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        {/* 错误信息 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-base font-medium text-foreground mb-2">
              EPUB 文件加载失败
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
  if (loading || !epubData) {
    return (
      <div className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}>
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400">
            EPUB
          </span>
          <div className="flex-1" />
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">正在解析 EPUB 文件...</span>
          </div>
        </div>
      </div>
    );
  }

  /* -------- 正常渲染 -------- */
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}
    >
      {/* ---- 工具栏 ---- */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式徽章 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400">
          EPUB
        </span>

        {/* 目录切换 */}
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <button
          onClick={() => setShowToc((v) => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            showToc
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted/30 text-muted-foreground'
          }`}
          title={showToc ? '隐藏目录' : '显示目录'}
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">目录</span>
        </button>

        {/* 章节切换 */}
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <button
          onClick={handlePrevChapter}
          disabled={currentChapter <= 0}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="上一章"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <select
          value={currentChapter}
          onChange={(e) => setCurrentChapter(Number(e.target.value))}
          className="text-[11px] bg-transparent border border-border/30 rounded px-1 py-0.5 text-muted-foreground cursor-pointer max-w-[180px] truncate"
          title="选择章节"
        >
          {epubData.chapters.map((ch, idx) => (
            <option key={ch.id} value={idx}>
              {ch.title}
            </option>
          ))}
        </select>
        <button
          onClick={handleNextChapter}
          disabled={currentChapter >= epubData.chapters.length - 1}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="下一章"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-muted-foreground/50">
          {currentChapter + 1}/{epubData.chapters.length}
        </span>

        {/* 右侧工具 */}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[150px] mr-1">
          {epubData.title}
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

      {/* ---- 内容区域：左侧目录 + 右侧正文 ---- */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左侧目录 */}
        {showToc && (
          <div
            className="shrink-0 overflow-y-auto border-r border-border/30"
            style={{
              width: '220px',
              backgroundColor: isDark
                ? 'rgba(0,0,0,0.15)'
                : 'rgba(0,0,0,0.02)',
            }}
          >
            <div className="px-3 py-2">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  目录
                </span>
              </div>
              <nav className="space-y-0.5">
                {epubData.chapters.map((ch, idx) => (
                  <button
                    key={ch.id}
                    onClick={() => setCurrentChapter(idx)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate ${
                      idx === currentChapter
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    }`}
                    title={ch.title}
                  >
                    {ch.title}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* 右侧正文 */}
        <div
          ref={contentRef}
          className="flex-1 overflow-auto"
          style={{
            padding: '24px 32px',
          }}
        >
          <div
            className="epub-content max-w-[700px] mx-auto"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
              fontSize: '15px',
              lineHeight: '1.8',
              color: isDark ? '#e0e0e0' : '#1a1a1a',
            }}
            dangerouslySetInnerHTML={{
              __html: basicSanitize(chapterContent),
            }}
          />
        </div>
      </div>
    </div>
  );
}
