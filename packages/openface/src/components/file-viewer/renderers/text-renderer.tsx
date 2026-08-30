import { useState, useEffect, useCallback } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { Pencil, Eye } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { buildDiffPrompt } from "./diff-utils";

export function TextRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError }: RendererProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let text = "";
        if (fileBuffer) text = new TextDecoder().decode(fileBuffer);
        else if (fileUrl) { const res = await fetch(fileUrl); text = await res.text(); }
        if (!cancelled) { setContent(text); setOriginalContent(text); setLoading(false); }
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const handleSendToAI = useCallback(async (instruction: string) => {
    if (!onSendToAgent) return;
    const prompt = buildDiffPrompt(originalContent, content, fileName, instruction);
    const result = await onSendToAgent(content, prompt, fileName);
    if (result) { setContent(result); setDirty(true); setEditMode(true); }
  }, [onSendToAgent, content, originalContent, fileName]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(content); } catch {
      const ta = document.createElement('textarea'); ta.value = content;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }, [content]);

  const handleSave = useCallback(() => {
    onSave?.(content, fileName);
    setDirty(false);
  }, [onSave, content, fileName]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="TXT" onCopy={handleCopy}
        onSave={onSave ? handleSave : undefined} dirty={dirty} onSendToAgent={onSendToAgent ? handleSendToAI : undefined}>
        <button onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${editMode ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          {editMode ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{editMode ? '查看' : '编辑'}</span>
        </button>
      </RendererToolbar>
      <div className="flex-1 overflow-auto">
        {editMode ? (
          <textarea value={content} onChange={e => { setContent(e.target.value); setDirty(true); }}
            className="w-full h-full resize-none bg-[#0d1117] text-foreground font-mono text-xs p-4 outline-none leading-relaxed"
            spellCheck={false} />
        ) : (
          <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">{content}</pre>
        )}
      </div>
    </div>
  );
}
