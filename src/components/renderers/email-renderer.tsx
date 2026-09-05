'use client';

/**
 * 邮件文件渲染器
 *
 * 功能：
 * - 动态导入 omnimail 解析 .eml / .msg / .mbox 邮件文件
 * - 显示邮件头：发件人、收件人、抄送、主题、日期
 * - 邮件正文：优先 HTML 渲染（DOMPurify sanitize），fallback 到纯文本
 * - 附件列表：文件名、大小、下载按钮
 * - 暗色/亮色主题自动适配
 * - 错误处理（非邮件文件、损坏文件等）
 * - SSR 安全（动态导入 omnimail / DOMPurify）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  User,
  Users,
  Paperclip,
  Download,
  Calendar,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  File,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** 邮件地址对象 */
interface EmailAddress {
  name?: string;
  address: string;
}

/** 附件对象 */
interface EmailAttachment {
  filename?: string;
  mimeType: string;
  size: number;
  content: Uint8Array;
  isInline: boolean;
  disposition?: 'attachment' | 'inline';
}

/** 解析后的邮件数据（简化版，只取渲染需要的字段） */
interface ParsedEmailData {
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject?: string;
  date?: string;
  body: {
    html?: string;
    text?: string;
  };
  attachments: EmailAttachment[];
}

/** 组件 Props */
interface EmailRendererProps {
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
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

/**
 * 格式化邮件地址列表为可读字符串
 * 多个收件人用逗号分隔，带名称的显示 "Name <address>" 格式
 */
function formatAddresses(addresses: EmailAddress[]): string {
  return addresses
    .map((addr) => {
      if (addr.name) {
        return `${addr.name} <${addr.address}>`;
      }
      return addr.address;
    })
    .join('，');
}

/**
 * 格式化附件大小为人类可读格式
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 格式化日期字符串
 * 尝试解析为本地化日期格式，失败则返回原始字符串
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return '未知日期';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * 基础 HTML 清理（不依赖 DOMPurify 的轻量方案）
 * 移除 script/style/iframe/object/embed 标签及其内容
 * 移除所有 on* 事件属性
 * 移除 javascript: 协议的 href/src
 */
function basicSanitizeHtml(html: string): string {
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

/**
 * 获取附件的图标颜色（根据 MIME 类型）
 */
function getAttachmentColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'text-green-400';
  if (mimeType.startsWith('video/')) return 'text-purple-400';
  if (mimeType.startsWith('audio/')) return 'text-pink-400';
  if (mimeType.includes('pdf')) return 'text-red-400';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-400';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'text-emerald-400';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-400';
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive'))
    return 'text-yellow-400';
  return 'text-muted-foreground';
}

/* ------------------------------------------------------------------ */
/*  邮件正文渲染                                                        */
/* ------------------------------------------------------------------ */

interface EmailBodyProps {
  /** HTML 正文（可能包含危险内容） */
  html?: string;
  /** 纯文本正文 */
  text?: string;
  /** 是否暗色模式 */
  isDark: boolean;
}

/**
 * 邮件正文渲染组件
 * 优先使用 HTML 渲染（经过 sanitize），fallback 到纯文本
 */
function EmailBody({ html, text, isDark }: EmailBodyProps) {
  const [renderMode, setRenderMode] = useState<'html' | 'text'>(html ? 'html' : 'text');

  /* 确定可用的渲染模式 */
  const hasHtml = !!html;
  const hasText = !!text;

  /* 如果选中的模式不可用，自动切换 */
  useEffect(() => {
    if (renderMode === 'html' && !hasHtml && hasText) {
      setRenderMode('text');
    }
    if (renderMode === 'text' && !hasText && hasHtml) {
      setRenderMode('html');
    }
  }, [renderMode, hasHtml, hasText]);

  /* 渲染模式切换按钮 */
  const renderModeToggle = hasHtml && hasText && (
    <div className="flex items-center gap-1 border-b border-border/30 px-2 py-1">
      <button
        onClick={() => setRenderMode('html')}
        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
          renderMode === 'html'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        }`}
      >
        HTML
      </button>
      <button
        onClick={() => setRenderMode('text')}
        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
          renderMode === 'text'
            ? 'bg-blue-500/20 text-blue-400'
            : 'text-muted-foreground/60 hover:text-muted-foreground'
        }`}
      >
        纯文本
      </button>
    </div>
  );

  /* 正文内容 */
  const bodyContent =
    renderMode === 'html' && html ? (
      /* HTML 渲染模式：使用 dangerouslySetInnerHTML + sanitize */
      <div
        className="email-html-body prose prose-sm dark:prose-invert max-w-none p-4 break-words overflow-auto"
        dangerouslySetInnerHTML={{ __html: basicSanitizeHtml(html) }}
        style={{
          /* 基础样式覆盖，确保邮件 HTML 不会溢出 */
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}
      />
    ) : text ? (
      /* 纯文本渲染模式：保留换行和空格 */
      <pre className="whitespace-pre-wrap break-words p-4 text-sm font-sans leading-relaxed text-foreground">
        {text}
      </pre>
    ) : (
      /* 无正文 */
      <div className="flex items-center justify-center p-8 text-muted-foreground/50">
        <FileText className="w-5 h-5 mr-2" />
        <span className="text-sm">（无正文内容）</span>
      </div>
    );

  return (
    <div className="flex flex-col min-h-0">
      {renderModeToggle}
      <div className="flex-1 overflow-auto min-h-0">{bodyContent}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  附件列表渲染                                                        */
/* ------------------------------------------------------------------ */

interface AttachmentListProps {
  /** 附件列表（过滤掉 inline 附件） */
  attachments: EmailAttachment[];
  /** 是否暗色模式 */
  isDark: boolean;
}

/**
 * 附件列表渲染组件
 * 显示附件文件名、大小，并提供下载按钮
 */
function AttachmentList({ attachments, isDark }: AttachmentListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  /* 过滤掉纯 inline 附件（已被 HTML 引用的图片等） */
  const realAttachments = attachments.filter(
    (att) => !att.isInline || att.disposition === 'attachment'
  );

  if (realAttachments.length === 0) return null;

  /**
   * 下载单个附件
   * 创建 Blob → URL.createObjectURL → 临时链接点击 → 清理
   */
  const handleDownload = useCallback((attachment: EmailAttachment) => {
    try {
      const blob = new Blob([attachment.content.slice()], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      /* 延迟释放 URL，给浏览器足够时间开始下载 */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('下载附件失败:', err);
    }
  }, []);

  return (
    <div className="border-t border-border/30">
      {/* 附件区域标题栏（可折叠） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors"
      >
        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          附件 ({realAttachments.length})
        </span>
        <div className="flex-1" />
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </button>

      {/* 附件列表 */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1">
          {realAttachments.map((att, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/20 group transition-colors"
            >
              {/* 附件图标 */}
              <File className={`w-4 h-4 shrink-0 ${getAttachmentColor(att.mimeType)}`} />

              {/* 附件信息 */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground truncate">
                  {att.filename || '未命名附件'}
                </div>
                <div className="text-[10px] text-muted-foreground/60">
                  {formatFileSize(att.size)}
                  {att.mimeType && ` · ${att.mimeType}`}
                </div>
              </div>

              {/* 下载按钮 */}
              <button
                onClick={() => handleDownload(att)}
                className="shrink-0 p-1 rounded hover:bg-muted/30 opacity-0 group-hover:opacity-100 transition-opacity"
                title="下载附件"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  邮件头信息渲染                                                      */
/* ------------------------------------------------------------------ */

interface EmailHeaderProps {
  /** 发件人 */
  from?: EmailAddress;
  /** 收件人列表 */
  to: EmailAddress[];
  /** 抄送列表 */
  cc: EmailAddress[];
  /** 主题 */
  subject?: string;
  /** 日期 */
  date?: string;
  /** 是否暗色模式 */
  isDark: boolean;
}

/**
 * 邮件头信息渲染组件
 * 显示发件人、收件人、抄送、主题、日期
 */
function EmailHeader({ from, to, cc, subject, date, isDark }: EmailHeaderProps) {
  const [showFullHeaders, setShowFullHeaders] = useState(false);

  return (
    <div className="border-b border-border/30 bg-[var(--color-secondary)]/50">
      {/* 主题行 */}
      <div className="px-3 py-2 border-b border-border/20">
        <h3 className="text-sm font-semibold text-foreground leading-snug break-words">
          {subject || '（无主题）'}
        </h3>
      </div>

      {/* 基本邮件头 */}
      <div className="px-3 py-2 space-y-1.5">
        {/* 发件人 */}
        <div className="flex items-start gap-2">
          <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] text-muted-foreground/60 mr-1.5">发件人</span>
            <span className="text-xs text-foreground break-all">
              {from ? formatAddresses([from]) : '未知发件人'}
            </span>
          </div>
        </div>

        {/* 收件人 */}
        {to.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground/60 mr-1.5">收件人</span>
              <span className="text-xs text-foreground break-all">{formatAddresses(to)}</span>
            </div>
          </div>
        )}

        {/* 抄送 */}
        {cc.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground/60 mr-1.5">抄送</span>
              <span className="text-xs text-muted-foreground break-all">{formatAddresses(cc)}</span>
            </div>
          </div>
        )}

        {/* 日期 */}
        {date && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground/60 mr-1.5">日期</span>
            <span className="text-xs text-muted-foreground">{formatDate(date)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

/**
 * 邮件文件渲染器
 *
 * 接收 .eml / .msg 文件的 ArrayBuffer，使用 omnimail 解析并渲染
 */
export function EmailRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: EmailRendererProps) {
  const isDark = useIsDarkMode();

  /* 解析状态 */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailData, setEmailData] = useState<ParsedEmailData | null>(null);

  /* 用于取消过期的异步操作 */
  const mountedRef = useRef(true);

  /**
   * 解析邮件文件
   * 动态导入 omnimail 以兼容 SSR
   */
  useEffect(() => {
    mountedRef.current = true;

    async function parseEmail() {
      try {
        setLoading(true);
        setError(null);

        /* 获取文件内容的 ArrayBuffer */
        let buffer: ArrayBuffer | null = fileBuffer ?? null;

        /* 如果没有 buffer 但有 fileUrl，从 URL 获取 */
        if (!buffer && fileUrl) {
          const response = await fetch(fileUrl);
          buffer = await response.arrayBuffer();
        }

        if (!buffer) {
          throw new Error('无法获取邮件文件内容');
        }

        /* 动态导入 omnimail */
        const { parse } = await import('omnimail');

        /* 解析邮件 */
        const parsed = parse(buffer);

        if (!mountedRef.current) return;

        /* 提取渲染所需的数据 */
        const data: ParsedEmailData = {
          from: parsed.from,
          to: parsed.to || [],
          cc: parsed.cc || [],
          bcc: parsed.bcc || [],
          subject: parsed.subject,
          date: parsed.date,
          body: {
            html: parsed.body.html as string | undefined,
            text: parsed.body.text,
          },
          attachments: parsed.attachments || [],
        };

        setEmailData(data);
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : '解析邮件文件失败';
        setError(message);
        onError?.(err instanceof Error ? err : new Error(message));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }

    parseEmail();

    return () => {
      mountedRef.current = false;
    };
  }, [fileBuffer, fileUrl, onError]);

  /* -------- 加载状态 -------- */
  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* 工具栏 */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
            EML
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        {/* 加载动画 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="text-sm">正在解析邮件...</span>
        </div>
      </div>
    );
  }

  /* -------- 错误状态 -------- */
  if (error) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* 工具栏 */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
            EML
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
            <h3 className="text-base font-medium text-foreground mb-2">邮件解析失败</h3>
            <p className="text-sm text-muted-foreground mb-2">{error}</p>
            <p className="text-xs text-muted-foreground/60">文件：{fileName}</p>
          </div>
        </div>
      </div>
    );
  }

  /* -------- 正常渲染 -------- */
  if (!emailData) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
          EML
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
          {fileName}
        </span>
      </div>

      {/* 邮件内容（可滚动区域） */}
      <div className="flex-1 overflow-auto min-h-0 flex flex-col">
        {/* 邮件头 */}
        <EmailHeader
          from={emailData.from}
          to={emailData.to}
          cc={emailData.cc}
          subject={emailData.subject}
          date={emailData.date}
          isDark={isDark}
        />

        {/* 邮件正文 */}
        <div className="flex-1 min-h-0 overflow-auto">
          <EmailBody
            html={emailData.body.html}
            text={emailData.body.text}
            isDark={isDark}
          />
        </div>

        {/* 附件列表 */}
        <AttachmentList
          attachments={emailData.attachments}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
