import { useState, useEffect, useCallback, useRef } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { ArrowDown, Search, X } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";

export function LogRenderer({ fileUrl, fileBuffer, fileName, onError }: RendererProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let text = "";
        if (fileBuffer) text = new TextDecoder().decode(fileBuffer);
        else if (fileUrl) { const res = await fetch(fileUrl); text = await res.text(); }
        if (!cancelled) { setContent(text); setLoading(false); }
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, autoScroll]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); } catch {
      const ta = document.createElement('textarea'); ta.value = content;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }, [content]);

  // Detect log level from line
  const getLogLevel = (line: string): string => {
    const upper = line.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('FATAL') || upper.includes('PANIC')) return 'error';
    if (upper.includes('WARN')) return 'warn';
    if (upper.includes('INFO')) return 'info';
    if (upper.includes('DEBUG') || upper.includes('TRACE')) return 'debug';
    return '';
  };

  const logColors: Record<string, string> = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-muted-foreground/60',
  };

  const lines = content.split('\n');
  const filteredLines = searchTerm
    ? lines.filter(l => l.toLowerCase().includes(searchTerm.toLowerCase()))
    : lines;

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="LOG" onCopy={handleCopy}>
        <button onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${autoScroll ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}
          title="自动滚动到底部">
          <ArrowDown className="w-3.5 h-3.5" /><span className="hidden sm:inline">跟踪</span>
        </button>
        <button onClick={() => setShowSearch(!showSearch)}
          className={`p-1.5 rounded transition-colors ${showSearch ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`} title="搜索">
          <Search className="w-3.5 h-3.5" />
        </button>
        {searchTerm && <span className="text-[10px] text-primary">{filteredLines.length}/{lines.length}</span>}
      </RendererToolbar>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border/30 bg-[#1a1a2e]">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索日志..."
            className="flex-1 bg-transparent text-xs outline-none text-foreground" autoFocus />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-auto bg-[#0d1117] p-4 font-mono text-xs leading-relaxed">
        {filteredLines.map((line, i) => {
          const level = getLogLevel(line);
          const highlighted = searchTerm
            ? line.replace(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<<<MARK>>>$1<<<MARKEND>>>')
            : line;
          const parts = highlighted.split(/<<<MARK>>>|<<<MARKEND>>>/);

          return (
            <div key={i} className={`${logColors[level] || 'text-foreground'} hover:bg-muted/10`}>
              {searchTerm ? parts.map((part, pi) =>
                pi % 2 === 1
                  ? <mark key={pi} className="bg-yellow-500/30 text-yellow-200">{part}</mark>
                  : <span key={pi}>{part}</span>
              ) : line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
