'use client';
import { copyToClipboard } from "@/lib/clipboard";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Pencil } from 'lucide-react';
import { useState, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

// Lazy load Monaco editor to avoid SSR issues
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

interface CodeBlockProps {
  code: string;
  language: string;
  onApply?: (code: string) => void;
}

function CodeBlock({ code, language, onApply }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(code);

  const handleCopy = useCallback(() => {
    copyToClipboard(isEditing ? editedCode : code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code, editedCode, isEditing]);

  const handleApply = useCallback(() => {
    onApply?.(editedCode);
    setIsEditing(false);
  }, [editedCode, onApply]);

  const handleCancel = useCallback(() => {
    setEditedCode(code);
    setIsEditing(false);
  }, [code]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-secondary)] text-xs text-muted-foreground">
        <span>{language || 'text'}</span>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
            >
              <Pencil className="w-3 h-3" />
              <span>{t('markdown.edit')}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? t('markdown.copied') : t('markdown.copy')}
          </button>
        </div>
      </div>

      {/* Editor or syntax highlighter */}
      {isEditing ? (
        <div className="border-t border-border/30">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[200px] bg-[var(--color-card)] text-muted-foreground text-xs">
                {t('markdown.loading')}
              </div>
            }
          >
            <MonacoEditor
              height="200px"
              language={language || 'text'}
              value={editedCode}
              onChange={(value) => setEditedCode(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 20,
                padding: { top: 8, bottom: 8 },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2,
                renderLineHighlight: 'none',
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'auto',
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
          </Suspense>
          {/* Action bar */}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-[var(--color-secondary)] border-t border-border/30">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              {t('markdown.cancel')}
            </button>
            {onApply && (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('markdown.apply')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneDark}
          customStyle={{ margin: 0, fontSize: '13px', lineHeight: '1.5', background: '#0d0d14' }}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  );
}

interface MarkdownContentProps {
  content: string;
  onCodeApply?: (code: string, language: string) => void;
}

// Lazy load FileViewer for send_file results
const FileViewer = lazy(() =>
  import('@opensoulmate/openface').then(m => ({ default: m.FileViewer }))
);

// Detect send_file artifact pattern: ```file:path\ncontent\n```
// Or: 📎 文件: name\n--- 文件内容开始 ---\ncontent\n--- 文件内容结束 ---
function hasFileArtifact(content: string): { path: string; content: string } | null {
  // Pattern 1: ```file:/path/to/file\n...\n```
  const codeMatch = content.match(/```file:(.+)\n([\s\S]*?)```/);
  if (codeMatch) return { path: codeMatch[1].trim(), content: codeMatch[2].trimEnd() };
  // Pattern 2: 📎 文件: name + --- 文件内容开始 --- ... --- 文件内容结束 ---
  const p2 = content.match(/📎 文件: (.+?)\n.*?--- 文件内容开始 ---\n([\s\S]*?)\n--- 文件内容结束 ---/);
  if (p2) return { path: p2[1].trim(), content: p2[2] };
  return null;
}

// Detect MEDIA:/path tags (Hermes-style file delivery)
function renderMediaTags(content: string): React.ReactNode[] | null {
  const mediaRegex = /MEDIA:(\S+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mediaRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before.trim()) parts.push(<span key={lastIndex} className="whitespace-pre-wrap">{before}</span>);
    }
    const filePath = match[1];
    const fileName = filePath.split('/').pop() || 'file';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png','jpg','jpeg','gif','webp','svg','bmp'].includes(ext);
    const downloadUrl = `/api/file?path=${encodeURIComponent(filePath)}`;
    parts.push(
      <div key={match.index} className="my-2 rounded-lg border border-border/50 bg-muted/30 p-3 flex items-center gap-3">
        <span className="text-2xl">{isImage ? '🖼️' : '📎'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{fileName}</div>
          <div className="text-xs text-muted-foreground truncate">{filePath}</div>
        </div>
        <a href={downloadUrl} download={fileName}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          下载
        </a>
      </div>
    );
    lastIndex = match.index + match[0].length;
  }
  if (parts.length === 0) return null;
  if (lastIndex < content.length) {
    const rest = content.slice(lastIndex);
    if (rest.trim()) parts.push(<span key={lastIndex} className="whitespace-pre-wrap">{rest}</span>);
  }
  return parts;
}

export function MarkdownContent({ content, onCodeApply }: MarkdownContentProps) {
  if (!content) return null;

  // Check for MEDIA tags (Hermes-style file delivery)
  if (content.includes('MEDIA:')) {
    const mediaParts = renderMediaTags(content);
    if (mediaParts) return <>{mediaParts}</>;
  }

  // Check for file artifact (send_file result)
  const fileArtifact = hasFileArtifact(content);
  if (fileArtifact) {
    // Extract the non-file parts of the message (before/after the artifact)
    const filePattern = /(```file:[\s\S]*?```|📎 文件:[\s\S]*?--- 文件内容结束 ---)/;
    const segments = content.split(filePattern).filter(Boolean);
    return (
      <>
        {segments.map((seg, i) => {
          const artifact = hasFileArtifact(seg);
          if (artifact) {
            // Convert text content to data URL for FileViewer
            const encoder = new TextEncoder();
            const bytes = encoder.encode(artifact.content);
            const blob = new Blob([bytes], { type: 'text/plain' });
            const dataUrl = URL.createObjectURL(blob);
            return (
              <Suspense key={i} fallback={<div className="text-xs text-muted-foreground">Loading file...</div>}>
                <FileViewer
                  fileUrl={dataUrl}
                  fileName={artifact.path.split('/').pop() || 'file'}
                  className="my-2 rounded-lg border border-border/50 overflow-hidden"
                />
              </Suspense>
            );
          }
          return <span key={i} className="whitespace-pre-wrap">{seg}</span>;
        })}
      </>
    );
  }

  const parts: React.ReactNode[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={lastIndex} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }
    const lang = match[1];
    parts.push(
      <CodeBlock
        key={match.index}
        language={lang}
        code={match[2].trimEnd()}
        onApply={(code) => onCodeApply?.(code, lang)}
      />
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(
      <span key={lastIndex} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>
    );
  }
  return <>{parts}</>;
}
