'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Copy, Check, Download, ZoomIn, ZoomOut, Maximize2, Code, Image } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [view, setView] = useState<'diagram' | 'code'>('diagram');
  const [zoom, setZoom] = useState(1);

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

  const handleCopyCode = useCallback(() => {
    copyToClipboard(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [code]);

  const handleCopyImage = useCallback(async () => {
    if (!svg) return;
    try {
      // Convert SVG to PNG via canvas, then copy to clipboard
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // 2x for retina
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (pngBlob) => {
          if (pngBlob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': pngBlob })
              ]);
              setCopiedImage(true);
              setTimeout(() => setCopiedImage(false), 2000);
            } catch {
              // Fallback: download
              const a = document.createElement('a');
              a.href = URL.createObjectURL(pngBlob);
              a.download = 'diagram.png';
              a.click();
            }
          }
        }, 'image/png');
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch {}
  }, [svg]);

  const handleDownloadSvg = useCallback(() => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [svg]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
  const handleFitScreen = useCallback(() => setZoom(1), []);

  const btnClass = "flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors";

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--color-secondary)] border-b border-border/30">
        {/* Left: view toggle */}
        <div className="flex items-center gap-0.5 bg-black/20 rounded-md p-0.5">
          <button
            onClick={() => setView('diagram')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              view === 'diagram' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Image className="w-3 h-3" />
            图
          </button>
          <button
            onClick={() => setView('code')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              view === 'code' ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code className="w-3 h-3" />
            代码
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          {view === 'diagram' && svg && (
            <>
              <button onClick={handleZoomOut} className={btnClass} title="缩小">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-muted-foreground w-10 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={handleZoomIn} className={btnClass} title="放大">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFitScreen} className={btnClass} title="适配屏幕">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border/50 mx-0.5" />
              <button onClick={handleCopyImage} className={btnClass} title="复制图片">
                {copiedImage ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Image className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleDownloadSvg} className={btnClass} title="下载SVG">
                <Download className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={handleCopyCode} className={btnClass} title="复制代码">
            {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'code' ? (
        <pre className="p-3 text-xs bg-[#0d0d14] overflow-x-auto m-0 leading-relaxed">
          <code className="text-[#cdd6f4]">{code}</code>
        </pre>
      ) : error ? (
        <div className="p-3 text-xs text-red-400 bg-[#0d0d14]">
          <div className="font-medium mb-1">渲染失败：</div>
          <pre className="whitespace-pre-wrap m-0">{error}</pre>
          <button
            onClick={() => setView('code')}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
          >
            查看源码
          </button>
        </div>
      ) : svg ? (
        <div
          ref={containerRef}
          className="p-4 bg-[#0d0d14] overflow-auto max-h-[600px]"
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-[100px] bg-[#0d0d14] text-muted-foreground text-xs">
          渲染中...
        </div>
      )}
    </div>
  );
}
