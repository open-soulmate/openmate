'use client';

/**
 * XMind 思维导图渲染器
 *
 * 功能：
 * - 解析 .xmind 文件（ZIP 格式），使用 JSZip 读取 content.json
 * - 解析 topic 树结构，渲染为水平树形思维导图
 * - 纯 HTML+CSS 渲染（flexbox 布局），支持交互
 * - 支持展开/折叠节点
 * - 支持多主题（content.json 是数组，多个 sheet）
 * - 缩放（鼠标滚轮 + 按钮）/ 拖拽平移 / 全屏
 * - 工具栏：缩放+/-、重置、全屏、Sheet 切换
 * - 暗色/亮色主题自动适配
 * - 错误处理（非 ZIP 文件、无 content.json 等）
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
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Map,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** XMind topic 节点结构 */
interface XmindTopic {
  id?: string;
  title?: string;
  children?: {
    attached?: XmindTopic[];
  };
  /** 折叠状态标记 */
  markers?: Array<{ markerId: string }>;
}

/** XMind sheet（单个主题页） */
interface XmindSheet {
  id?: string;
  title?: string;
  class?: string;
  rootTopic: XmindTopic;
}

/** 扁平化后的节点（用于渲染） */
interface FlatNode {
  /** 唯一 key */
  key: string;
  /** 节点标题 */
  title: string;
  /** 子节点 */
  children: FlatNode[];
  /** 是否有子节点 */
  hasChildren: boolean;
  /** 深度（0 = 根节点） */
  depth: number;
}

/** 组件 Props */
interface XmindRendererProps {
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
/*  XMind 解析工具函数                                                 */
/* ------------------------------------------------------------------ */

/**
 * 从 ArrayBuffer（ZIP）中解析 content.json
 * .xmind 文件是 ZIP 包，内含 content.json
 */
async function parseXmindFromBuffer(buffer: ArrayBuffer): Promise<XmindSheet[]> {
  // 动态导入 JSZip（项目已安装）
  const JSZip = await import('jszip');
  const zip = await JSZip.default.loadAsync(buffer);

  // 查找 content.json（可能在根目录或子目录）
  const contentFile = zip.file('content.json') || zip.file(/content\.json$/i)[0];
  if (!contentFile) {
    throw new Error('未在 .xmind 文件中找到 content.json，请确认文件格式');
  }

  const contentText = await contentFile.async('text');
  const content = JSON.parse(contentText);

  // content.json 是数组，每个元素是一个 sheet
  if (!Array.isArray(content)) {
    throw new Error('content.json 格式不正确：期望数组格式');
  }

  if (content.length === 0) {
    throw new Error('content.json 为空数组，没有任何主题页');
  }

  // 验证每个 sheet 有 rootTopic
  for (let i = 0; i < content.length; i++) {
    if (!content[i].rootTopic) {
      throw new Error(`Sheet ${i + 1} 缺少 rootTopic 字段`);
    }
  }

  return content as XmindSheet[];
}

/**
 * 将 XmindTopic 递归转换为 FlatNode 树
 */
function topicToFlatNode(topic: XmindTopic, depth: number, parentKey: string): FlatNode {
  const children = topic.children?.attached || [];
  const key = parentKey || topic.id || `root-${depth}`;

  return {
    key,
    title: topic.title || '(未命名)',
    children: children.map((child, idx) =>
      topicToFlatNode(child, depth + 1, `${key}-${child.id || idx}`)
    ),
    hasChildren: children.length > 0,
    depth,
  };
}

/* ------------------------------------------------------------------ */
/*  节点颜色方案（按深度分配不同颜色）                                   */
/* ------------------------------------------------------------------ */

/** 节点背景色（亮色模式） */
const NODE_COLORS_LIGHT = [
  '#6366f1', // indigo-500 — 根节点
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#3b82f6', // blue-500
];

/** 节点背景色（暗色模式） */
const NODE_COLORS_DARK = [
  '#818cf8', // indigo-400 — 根节点
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#f472b6', // pink-400
  '#60a5fa', // blue-400
];

/**
 * 获取节点颜色（根据深度循环）
 */
function getNodeColor(depth: number, isDark: boolean): string {
  const palette = isDark ? NODE_COLORS_DARK : NODE_COLORS_LIGHT;
  return palette[depth % palette.length];
}

/* ------------------------------------------------------------------ */
/*  单个节点组件                                                       */
/* ------------------------------------------------------------------ */

interface MindNodeProps {
  node: FlatNode;
  isDark: boolean;
  /** 被折叠的节点 key 集合 */
  collapsedKeys: Set<string>;
  /** 切换折叠状态 */
  onToggleCollapse: (key: string) => void;
}

function MindNode({ node, isDark, collapsedKeys, onToggleCollapse }: MindNodeProps) {
  const isCollapsed = collapsedKeys.has(node.key);
  const color = getNodeColor(node.depth, isDark);
  const showChildren = node.hasChildren && !isCollapsed;

  // 根节点样式特殊
  const isRoot = node.depth === 0;

  return (
    <div className="flex items-start" style={{ minHeight: '32px' }}>
      {/* 当前节点 */}
      <div
        className="flex items-center shrink-0 group"
      >
        {/* 节点卡片 */}
        <div
          className="relative flex items-center gap-1.5 cursor-pointer select-none transition-all duration-150 hover:brightness-110"
          style={{
            padding: isRoot ? '10px 20px' : '6px 14px',
            borderRadius: isRoot ? '24px' : '8px',
            backgroundColor: color,
            color: '#fff',
            fontSize: isRoot ? '15px' : '13px',
            fontWeight: isRoot ? 600 : 400,
            boxShadow: isRoot
              ? '0 4px 14px rgba(0,0,0,0.2)'
              : '0 1px 4px rgba(0,0,0,0.1)',
            maxWidth: isRoot ? '300px' : '240px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          onClick={() => {
            if (node.hasChildren) {
              onToggleCollapse(node.key);
            }
          }}
          title={node.title}
        >
          <span className="truncate">{node.title}</span>

          {/* 展开/折叠指示器 */}
          {node.hasChildren && (
            <span className="shrink-0 opacity-80">
              {isCollapsed ? (
                <ChevronRightIcon className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* 子节点区域 */}
      {showChildren && (
        <div className="flex flex-col ml-0 relative" style={{ paddingTop: '0' }}>
          {/* 连接线（竖线）—— 用 SVG 路径绘制 */}
          {node.children.map((child, idx) => {
            const isLast = idx === node.children.length - 1;
            const childColor = getNodeColor(child.depth, isDark);

            return (
              <div key={child.key} className="flex items-start relative" style={{ minHeight: '36px' }}>
                {/* 横向连接线起点 */}
                <div
                  className="shrink-0 relative"
                  style={{ width: '32px', height: '36px' }}
                >
                  {/* 竖线 */}
                  <svg
                    className="absolute"
                    style={{
                      left: '0px',
                      top: 0,
                      width: '100%',
                      height: '100%',
                      overflow: 'visible',
                    }}
                  >
                    {/* 竖线段（从上到下） */}
                    {node.children.length > 1 && (
                      <line
                        x1="1"
                        y1={idx === 0 ? '18' : '0'}
                        x2="1"
                        y2={isLast ? '18' : '100%'}
                        stroke={isDark ? '#555' : '#d1d5db'}
                        strokeWidth="1.5"
                      />
                    )}
                    {/* 横线段（从左到节点） */}
                    <line
                      x1="1"
                      y1="18"
                      x2="100%"
                      y2="18"
                      stroke={isDark ? '#555' : '#d1d5db'}
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>

                {/* 递归渲染子节点 */}
                <MindNode
                  node={child}
                  isDark={isDark}
                  collapsedKeys={collapsedKeys}
                  onToggleCollapse={onToggleCollapse}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function XmindRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: XmindRendererProps) {
  /* -------- 状态 -------- */
  const [sheets, setSheets] = useState<XmindSheet[]>([]);
  const [currentSheet, setCurrentSheet] = useState(0);
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

  /* 折叠状态：记录被折叠的节点 key 集合 */
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  /* Refs */
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* 主题 */
  const isDark = useIsDarkMode();

  /* -------- 当前 sheet 的根节点树 -------- */
  const rootNode = useMemo(() => {
    const sheet = sheets[currentSheet];
    if (!sheet?.rootTopic) return null;
    return topicToFlatNode(sheet.rootTopic, 0, 'root');
  }, [sheets, currentSheet]);

  /* -------- 加载并解析 .xmind 文件 -------- */
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

        // 解析 .xmind ZIP 包
        const parsedSheets = await parseXmindFromBuffer(buffer);

        if (cancelled) return;

        setSheets(parsedSheets);
        setCurrentSheet(0);
        setCollapsedKeys(new Set());
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : '加载 XMind 文件失败';
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

  /* -------- 切换 sheet 时重置缩放和折叠 -------- */
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setCollapsedKeys(new Set());
  }, [currentSheet]);

  /* -------- 切换折叠状态 -------- */
  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key); // 展开
      } else {
        next.add(key); // 折叠
      }
      return next;
    });
  }, []);

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

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  /* -------- Sheet 切换 -------- */
  const handlePrevSheet = useCallback(() => {
    setCurrentSheet((p) => Math.max(0, p - 1));
  }, []);

  const handleNextSheet = useCallback(() => {
    setCurrentSheet((p) => Math.min(sheets.length - 1, p + 1));
  }, [sheets.length]);

  /* -------- 渲染 -------- */
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full min-h-0 bg-background ${className ?? ''}`}
    >
      {/* ---- 工具栏 ---- */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式徽章 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400">
          XMIND
        </span>

        {/* Sheet 切换（仅多 sheet 时显示） */}
        {sheets.length > 1 && (
          <>
            <div className="w-px h-4 bg-border/30 mx-0.5" />
            <button
              onClick={handlePrevSheet}
              disabled={currentSheet <= 0}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一个主题"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <select
              value={currentSheet}
              onChange={(e) => setCurrentSheet(Number(e.target.value))}
              className="text-[11px] bg-transparent border border-border/30 rounded px-1 py-0.5 text-muted-foreground cursor-pointer max-w-[120px] truncate"
              title="选择主题"
            >
              {sheets.map((sheet, idx) => (
                <option key={sheet.id || idx} value={idx}>
                  {sheet.title || `主题 ${idx + 1}`}
                </option>
              ))}
            </select>
            <button
              onClick={handleNextSheet}
              disabled={currentSheet >= sheets.length - 1}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一个主题"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground/50">
              {currentSheet + 1}/{sheets.length}
            </span>
          </>
        )}

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
      </div>

      {/* ---- 内容区域 ---- */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        {/* 加载状态 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10 bg-background/80">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>解析 XMind 文件...</span>
            </div>
          </div>
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
            </div>
          </div>
        )}

        {/* 思维导图渲染区域（支持缩放和拖拽） */}
        {!loading && !error && rootNode && (
          <div
            ref={scrollRef}
            className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            <div
              className="p-8 inline-block"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: 'top left',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                minWidth: '100%',
                minHeight: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
              }}
            >
              <MindNode
                node={rootNode}
                isDark={isDark}
                collapsedKeys={collapsedKeys}
                onToggleCollapse={handleToggleCollapse}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
