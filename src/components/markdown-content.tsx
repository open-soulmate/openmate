'use client';
import { copyToClipboard } from "@/lib/clipboard";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Pencil } from 'lucide-react';
import { useState, useCallback, lazy, Suspense, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './mermaid-diagram';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/app-store';
import { getApiBaseUrl } from '@/lib/api-client';

// Lazy load Monaco editor to avoid SSR issues
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

// Memoized CodeBlock component to prevent unnecessary re-renders
const CodeBlock = memo(function CodeBlock({ 
  code, 
  language, 
  onApply 
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(code);

  // Only update editedCode if the prop actually changed
  useMemo(() => {
    setEditedCode(code);
  }, [code]);

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

  // Memoize syntax highlighter styles
  const syntaxHighlighterStyle = useMemo(() => ({
    margin: 0,
    borderRadius: 0,
  }), []);

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
                {t('markdown.loadingEditor')}
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
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: 'off',
              }}
            />
          </Suspense>
          <div className="flex justify-end gap-2 px-3 py-2 border-t border-border/30">
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-xs rounded-md hover:bg-muted transition-colors"
            >
              {t('markdown.cancel')}
            </button>
            <button
              onClick={handleApply}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {t('markdown.apply')}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/30">
          <SyntaxHighlighter
            style={oneDark}
            language={language || 'text'}
            customStyle={syntaxHighlighterStyle}
            showLineNumbers
          >
            {code}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
});

interface CodeBlockProps {
  code: string;
  language: string;
  onApply?: (code: string) => void;
}

// Memoized Markdown content component
const MarkdownContent = memo(function MarkdownContent({ 
  content, 
  onApplyCode,
  className = '' 
}: MarkdownContentProps) {
  const { t } = useTranslation();
  const { assistantStreaming } = useAppStore();
  
  // Parse and memoize content to avoid unnecessary re-renders
  const processedContent = useMemo(() => {
    if (!content) return '';
    
    // Incremental processing for streaming content
    // Only process the new part if content is being streamed
    return content;
  }, [content]);

  // Memoize the components configuration
  const markdownComponents = useMemo(() => ({
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const code = String(children).replace(/\n$/, '');
      
      if (!inline && match) {
        return (
          <CodeBlock 
            code={code} 
            language={match[1]} 
            onApply={onApplyCode}
          />
        );
      }
      
      return <code className={className} {...props}>{children}</code>;
    },
    a({ href, children, ...props }: any) {
      // Handle links that might be streaming
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          {...props}
        >
          {children}
        </a>
      );
    },
  }), [onApplyCode]);

  // Memoize remark plugins
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={markdownComponents}
        // Use key for stable identity during streaming updates
        // This helps React optimize re-renders
        key={assistantStreaming ? 'streaming' : 'complete'}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

interface MarkdownContentProps {
  content: string;
  onApplyCode?: (code: string) => void;
  className?: string;
}

export default MarkdownContent;