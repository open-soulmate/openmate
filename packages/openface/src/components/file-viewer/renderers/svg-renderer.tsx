import { useState, useEffect, useCallback, useRef } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { Eye, Code, Pencil } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { SelectionAIBar } from "./selection-ai-bar";
import { buildDiffPrompt } from "./diff-utils";

export function SvgRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError }: RendererProps) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'preview' | 'source' | 'edit'>('preview');
  const [originalSource, setOriginalSource] = useState("");
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let text = "";
        if (fileBuffer) text = new TextDecoder().decode(fileBuffer);
        else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            const commaIdx = fileUrl.indexOf(',');
            if (commaIdx >= 0) text = decodeDataUrl(fileUrl);
          } else { const res = await fetch(fileUrl); text = await res.text(); }
        }
        if (!cancelled) { setSource(text); setOriginalSource(text); setLoading(false); }
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const handleSendToAI = useCallback(async (instruction: string) => {
    if (!onSendToAgent) return;
    const prompt = buildDiffPrompt(originalSource, source, fileName, instruction, "SVG");
    const result = await onSendToAgent(source, prompt, fileName);
    if (result) { setSource(result); setDirty(true); setMode("edit"); }
  }, [onSendToAgent, source, originalSource, fileName]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(source); } catch {
      const ta = document.createElement('textarea'); ta.value = source;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }, [source]);

  const handleSave = useCallback(() => {
    onSave?.(source, fileName);
    setDirty(false);
  }, [onSave, source, fileName]);

  // Create blob URL for preview
  const previewUrl = mode !== 'source' ? (() => {
    const blob = new Blob([source], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
  })() : '';

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="SVG"
        onCopy={handleCopy} onSave={onSave ? handleSave : undefined} dirty={dirty} onSendToAgent={onSendToAgent ? handleSendToAI : undefined}>
        <button onClick={() => setMode('preview')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${mode === 'preview' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          <Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">预览</span>
        </button>
        <button onClick={() => setMode('source')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${mode === 'source' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          <Code className="w-3.5 h-3.5" /><span className="hidden sm:inline">源码</span>
        </button>
        <button onClick={() => setMode('edit')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${mode === 'edit' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          <Pencil className="w-3.5 h-3.5" /><span className="hidden sm:inline">编辑</span>
        </button>
      </RendererToolbar>

      <div className="flex-1 overflow-auto">
        {mode === 'preview' && (
          <div className="flex items-center justify-center h-full bg-white p-4">
            <img src={previewUrl} alt={fileName} className="max-w-full max-h-full" />
          </div>
        )}
        {mode === 'source' && (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-green-300 bg-[#0d1117] h-full">{source}</pre>
        )}
        {mode === 'edit' && (
          <div className="flex h-full">
            <div className="flex-1 border-r border-border/30">
              <textarea value={source} onChange={e => { setSource(e.target.value); setDirty(true); }}
                className="w-full h-full resize-none bg-[#0d1117] text-green-300 font-mono text-xs p-4 outline-none leading-relaxed"
                spellCheck={false} />
            </div>
            <div className="flex-1 flex items-center justify-center bg-white">
              <img src={previewUrl} alt="preview" className="max-w-full max-h-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
