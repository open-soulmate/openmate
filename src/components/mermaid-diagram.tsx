'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Copy, Check, Pencil, Download } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';

interface MermaidDiagramProps {
  code: string;
  onEdit?: (code: string) => void;
}

export function MermaidDiagram({ code, onEdit }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#1e1e2e',
            primaryTextColor: '#cdd6f4',
            primaryBorderColor: '#45475a',
            lineColor: '#89b4fa',
            secondaryColor: '#313244',
            tertiaryColor: '#181825',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          },
        });
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError('');
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code]);

  const handleCopy = useCallback(() => {
    copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleDownload = useCallback(() => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [svg]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-secondary)] text-xs text-muted-foreground">
        <span>mermaid</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSource(!showSource)}
            className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            <Pencil className="w-3 h-3" />
            <span>{showSource ? '预览' : '源码'}</span>
          </button>
          {svg && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
            >
              <Download className="w-3 h-3" />
              <span>SVG</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>

      {/* Diagram or source */}
      {showSource ? (
        <pre className="p-3 text-xs bg-[#0d0d14] overflow-x-auto m-0">
          <code>{code}</code>
        </pre>
      ) : error ? (
        <div className="p-3 text-xs text-red-400 bg-[#0d0d14]">
          <div className="font-medium mb-1">渲染失败：</div>
          <pre className="whitespace-pre-wrap m-0">{error}</pre>
          <button
            onClick={() => setShowSource(true)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
          >
            查看源码
          </button>
        </div>
      ) : svg ? (
        <div
          ref={containerRef}
          className="p-4 bg-[#0d0d14] overflow-x-auto flex justify-center [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex items-center justify-center h-[100px] bg-[#0d0d14] text-muted-foreground text-xs">
          渲染中...
        </div>
      )}
    </div>
  );
}
