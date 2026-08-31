import { useState, useEffect, useCallback, useRef } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { SelectionAIBar } from "./selection-ai-bar";
import { Eye, Code, Pencil } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { buildDiffPrompt } from "./diff-utils";

export function MarkdownRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError }: RendererProps) {
  const [content, setContent] = useState("");
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
        if (fileBuffer) { text = new TextDecoder().decode(fileBuffer); }
        else if (fileUrl) { const res = await fetch(fileUrl); text = await res.text(); }
        if (!cancelled) { setContent(text); setOriginalSource(text); setLoading(false); }
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const handleSendToAI = useCallback(async (instruction: string) => {
    if (!onSendToAgent) return;
    const prompt = buildDiffPrompt(originalSource, content, fileName, instruction, "Markdown");
    const result = await onSendToAgent(content, prompt, fileName);
    if (result) { setContent(result); setDirty(true); setMode("edit"); }
  }, [onSendToAgent, content, originalSource, fileName]);

  const handleSelectionAI = useCallback(async (selectedText: string, instruction: string): Promise<string | null> => {
    if (!onSendToAgent) return null;
    const prompt = `你正在帮助用户编辑 Markdown 文件 "${fileName}"。

用户选中了以下文字：
\`\`\`
${selectedText}
\`\`\`

用户的修改指令：${instruction}

请直接返回修改后的文字（不要加任何解释、不要加代码块标记），保持 Markdown 格式。`;
    const result = await onSendToAgent(selectedText, prompt, fileName);
    if (result) { setDirty(true); setMode("edit"); }
    return result;
  }, [onSendToAgent, fileName]);

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setDirty(true);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="MD" onCopy={handleCopy} onSave={onSave ? handleSave : undefined} dirty={dirty} onSendToAgent={onSendToAgent ? handleSendToAI : undefined}>
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
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        {onSendToAgent && (
          <SelectionAIBar containerRef={containerRef} onAIEdit={handleSelectionAI} />
        )}
        {mode === 'preview' && (
          <div className="p-6 prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }} />
        )}
        {mode === 'source' && (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-green-300 bg-[#0d1117] h-full">{content}</pre>
        )}
        {mode === 'edit' && (
          <textarea value={content} onChange={handleChange}
            className="w-full h-full resize-none bg-[#0d1117] text-green-300 font-mono text-xs p-4 outline-none leading-relaxed"
            spellCheck={false} />
        )}
      </div>
    </div>
  );
}

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
}
