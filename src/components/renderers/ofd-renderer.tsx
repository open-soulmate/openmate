'use client';

/**
 * OFD 文档渲染器（基础版）
 *
 * OFD（Open Fixed-layout Document）是中国国标文档格式（GB/T 33190-2016）
 * 结构类似 ZIP 包，内含 XML 文件定义页面布局和内容。
 *
 * 功能：
 * - 用 JSZip 解压 .ofd 文件
 * - 读取 OFD.xml → Document.xml → 获取页面列表
 * - 基础渲染：显示页面 XML 结构（树形视图）
 * - 如果有 TextCode 元素，提取文本内容显示
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
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  FileCode,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** OFD 页面信息 */
interface OfdPage {
  /** 页面序号 */
  index: number;
  /** 页面 ID（来自 Document.xml） */
  id: string;
  /** 页面文件路径（如 Doc_0/Pages/Page_0/Content.xml） */
  contentPath: string;
  /** 页面原始 XML 内容 */
  xmlContent: string;
  /** 从页面中提取的文本内容 */
  textContent: string;
}

/** 组件 Props */
interface OfdRendererProps {
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
/*  XML 树节点组件                                                      */
/* ------------------------------------------------------------------ */

/** 树节点属性 */
interface TreeNodeProps {
  /** XML 元素 */
  element: Element;
  /** 深度 */
  depth: number;
  /** 是否暗色主题 */
  isDark: boolean;
}

/**
 * 递归渲染 XML 元素为树形结构
 */
function XmlTreeNode({ element, depth, isDark }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2); // 前两层默认展开

  const tagName = element.tagName;
  const children = Array.from(element.children);
  const textContent = element.textContent?.trim() || '';
  const hasChildren = children.length > 0;
  const attributes = Array.from(element.attributes);

  // 判断是否是文本内容节点（TextCode 等）
  const isTextNode = tagName === 'TextCode' || tagName === 'TextObject';

  return (
    <div style={{ marginLeft: depth > 0 ? '16px' : '0' }}>
      {/* 节点行 */}
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-muted/20 rounded px-1 group"
        onClick={() => hasChildren && setExpanded((v) => !v)}
      >
        {/* 展开/折叠图标 */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
          ) : (
            <ChevronRightIcon className="w-3 h-3 text-muted-foreground/60 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* 标签名 */}
        <span
          className="text-xs font-mono"
          style={{ color: isDark ? '#7dd3fc' : '#0369a1' }}
        >
          &lt;{tagName}
        </span>

        {/* 属性 */}
        {attributes.length > 0 && (
          <span className="text-xs font-mono text-muted-foreground/60 truncate max-w-[300px]">
            {attributes.map((attr) => ` ${attr.name}="${attr.value}"`).join('')}
          </span>
        )}

        {/* 闭合括号 */}
        <span className="text-xs font-mono text-muted-foreground/40">
          {hasChildren ? (expanded ? '>' : '>...') : '/>'}
        </span>

        {/* 文本内容预览 */}
        {!hasChildren && textContent && (
          <span
            className="text-xs font-mono truncate max-w-[200px]"
            style={{
              color: isTextNode
                ? isDark
                  ? '#86efac'
                  : '#15803d'
                : isDark
                  ? '#d4d4d8'
                  : '#52525b',
            }}
          >
            {textContent.length > 80
              ? textContent.substring(0, 80) + '...'
              : textContent}
          </span>
        )}
      </div>

      {/* 子节点 */}
      {expanded &&
        hasChildren &&
        children.map((child, idx) => (
          <XmlTreeNode
            key={`${child.tagName}-${idx}`}
            element={child}
            depth={depth + 1}
            isDark={isDark}
          />
        ))}

      {/* 闭合标签 */}
      {expanded && hasChildren && (
        <div
          className="text-xs font-mono text-muted-foreground/40"
          style={{ marginLeft: '12px' }}
        >
          &lt;/{tagName}&gt;
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OFD 解析工具函数                                                    */
/* ------------------------------------------------------------------ */

/**
 * 从 ArrayBuffer（ZIP）中解析 OFD 文件结构
 *
 * OFD 结构：
 * - OFD.xml → 顶层入口，指向 Document 路径
 * - Doc_0/Document.xml → 定义页面列表
 * - Doc_0/Pages/Page_N/Content.xml → 页面内容
 */
async function parseOfdFromBuffer(buffer: ArrayBuffer): Promise<OfdPage[]> {
  // 动态导入 JSZip
  const JSZip = await import('jszip');
  const zip = await JSZip.default.loadAsync(buffer);

  // 1. 读取 OFD.xml（顶层入口）
  const ofdXmlFile = zip.file('OFD.xml');
  if (!ofdXmlFile) {
    throw new Error('未找到 OFD.xml，请确认是有效的 OFD 文件');
  }

  const ofdXml = await ofdXmlFile.async('text');
  const ofdDoc = new DOMParser().parseFromString(ofdXml, 'text/xml');

  // 2. 获取 Document 路径（通常是 Doc_0/Document.xml）
  const docBody = ofdDoc.querySelector('DocBody');
  const docPath =
    docBody?.querySelector('DocRoot')?.textContent?.trim() || 'Doc_0/Document.xml';

  // 3. 读取 Document.xml
  const docXmlFile = zip.file(docPath);
  if (!docXmlFile) {
    throw new Error(`未找到 Document.xml: ${docPath}`);
  }

  const docXml = await docXmlFile.async('text');
  const docDoc = new DOMParser().parseFromString(docXml, 'text/xml');

  // 获取 Document 所在目录（用于解析相对路径）
  const docDir = docPath.includes('/')
    ? docPath.substring(0, docPath.lastIndexOf('/') + 1)
    : '';

  // 4. 解析页面列表
  const pages: OfdPage[] = [];
  const pageElements = docDoc.querySelectorAll('Page');

  // 如果没有找到 Page 元素，尝试查找 CT_Page 和其他常见结构
  const pagesToProcess =
    pageElements.length > 0
      ? Array.from(pageElements)
      : Array.from(docDoc.querySelectorAll('[BaseLoc]'));

  if (pagesToProcess.length === 0) {
    // 尝试直接列出 ZIP 中的 Content.xml 文件
    const contentFiles = zip.file(/Content\.xml$/i);
    for (let i = 0; i < contentFiles.length; i++) {
      const file = contentFiles[i];
      const xmlContent = await file.async('text');
      const textContent = extractTextFromXml(xmlContent);
      pages.push({
        index: i,
        id: `page-${i}`,
        contentPath: file.name,
        xmlContent,
        textContent,
      });
    }
  } else {
    // 按页面元素解析
    for (let i = 0; i < pagesToProcess.length; i++) {
      const pageEl = pagesToProcess[i];
      const baseLoc = pageEl.getAttribute('BaseLoc') || '';
      const pageId = pageEl.getAttribute('ID') || `page-${i}`;

      // 页面内容路径
      const contentPath = baseLoc
        ? docDir + baseLoc + (baseLoc.endsWith('.xml') ? '' : '/Content.xml')
        : `${docDir}Pages/Page_${i}/Content.xml`;

      // 尝试读取页面 XML
      let xmlContent = '';
      let textContent = '';

      // 尝试多种可能的路径
      const possiblePaths = [
        contentPath,
        `${docDir}Pages/Page_${i}/Content.xml`,
        `Doc_0/Pages/Page_${i}/Content.xml`,
      ];

      for (const path of possiblePaths) {
        const file = zip.file(path);
        if (file) {
          xmlContent = await file.async('text');
          textContent = extractTextFromXml(xmlContent);
          break;
        }
      }

      if (!xmlContent) {
        xmlContent = `<error>无法找到页面 ${i} 的内容文件</error>`;
      }

      pages.push({
        index: i,
        id: pageId,
        contentPath,
        xmlContent,
        textContent,
      });
    }
  }

  if (pages.length === 0) {
    throw new Error('OFD 文件中未找到任何页面');
  }

  return pages;
}

/**
 * 从 XML 字符串中提取 TextCode 元素的文本内容
 */
function extractTextFromXml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const textCodes = doc.querySelectorAll('TextCode');
  const texts: string[] = [];

  textCodes.forEach((tc) => {
    const text = tc.textContent?.trim();
    if (text) {
      texts.push(text);
    }
  });

  return texts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function OfdRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: OfdRendererProps) {
  /* -------- 状态 -------- */
  const [pages, setPages] = useState<OfdPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'text'>('text');

  /* 全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* Refs */
  const containerRef = useRef<HTMLDivElement>(null);

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 当前页面 -------- */
  const currentPageData = useMemo(
    () => pages[currentPage] || null,
    [pages, currentPage]
  );

  /* -------- 解析 XML 为 DOM（用于树形视图） -------- */
  const parsedXml = useMemo(() => {
    if (!currentPageData?.xmlContent) return null;
    try {
      return new DOMParser().parseFromString(
        currentPageData.xmlContent,
        'text/xml'
      );
    } catch {
      return null;
    }
  }, [currentPageData]);

  /* -------- 加载并解析 .ofd 文件 -------- */
  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      try {
        let buffer: ArrayBuffer;

        if (fileBuffer) {
          buffer = fileBuffer;
        } else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
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
            const res = await fetch(fileUrl);
            buffer = await res.arrayBuffer();
          }
        } else {
          throw new Error('未提供文件内容（fileUrl 或 fileBuffer）');
        }

        if (cancelled) return;

        const parsedPages = await parseOfdFromBuffer(buffer);

        if (cancelled) return;

        setPages(parsedPages);
        setCurrentPage(0);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '加载 OFD 文件失败';
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

  /* -------- 页面切换 -------- */
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(pages.length - 1, p + 1));
  }, [pages.length]);

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
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
            OFD
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
              OFD 文件加载失败
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
  if (loading || !pages.length) {
    return (
      <div className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}>
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
            OFD
          </span>
          <div className="flex-1" />
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm">正在解析 OFD 文件...</span>
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
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
          OFD
        </span>

        {/* 页面切换 */}
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
              页面 {idx + 1}
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

        {/* 视图模式切换 */}
        <div className="w-px h-4 bg-border/30 mx-0.5" />
        <button
          onClick={() => setViewMode('text')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            viewMode === 'text'
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted/30 text-muted-foreground'
          }`}
          title="文本视图"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">文本</span>
        </button>
        <button
          onClick={() => setViewMode('tree')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            viewMode === 'tree'
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted/30 text-muted-foreground'
          }`}
          title="XML 树形视图"
        >
          <FileCode className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">XML</span>
        </button>

        {/* 右侧工具 */}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[150px]">
          {fileName}
        </span>
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors ml-1"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* ---- 内容区域 ---- */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'text' ? (
          /* 文本视图：显示提取的文本内容 */
          <div className="max-w-[700px] mx-auto">
            {currentPageData?.textContent ? (
              <div
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{
                  color: isDark ? '#e0e0e0' : '#1a1a1a',
                  fontFamily: 'monospace',
                }}
              >
                {currentPageData.textContent}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
                <FileText className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm">此页面未检测到文本内容</p>
                <p className="text-xs text-muted-foreground/60">
                  可切换到 XML 视图查看页面结构
                </p>
              </div>
            )}
          </div>
        ) : (
          /* XML 树形视图 */
          <div className="font-mono text-xs">
            {parsedXml?.documentElement ? (
              <XmlTreeNode
                element={parsedXml.documentElement}
                depth={0}
                isDark={isDark}
              />
            ) : (
              <pre
                className="whitespace-pre-wrap break-all text-xs"
                style={{ color: isDark ? '#d4d4d8' : '#3f3f46' }}
              >
                {currentPageData?.xmlContent || '无内容'}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
