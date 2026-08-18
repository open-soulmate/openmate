'use client';
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
    navigator.clipboard.writeText(isEditing ? editedCode : code);
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
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] text-xs text-muted-foreground">
        <span>{language || 'text'}</span>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
            >
              <Pencil className="w-3 h-3" />
              <span>{t('markdown.edit')}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
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
              <div className="flex items-center justify-center h-[200px] bg-[#0d0d14] text-muted-foreground text-xs">
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
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-[#1e1e2e] border-t border-border/30">
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

export function MarkdownContent({ content, onCodeApply }: MarkdownContentProps) {
  if (!content) return null;
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
