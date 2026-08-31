import { useState, useEffect, useCallback, useRef } from "react";
import type { RendererProps } from "./base";
import type { FileCategory } from "../types";
import { RendererToolbar } from "./renderer-toolbar";
import { SelectionAIBar } from "./selection-ai-bar";
import { WrapText, Pencil, Eye } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { buildDiffPrompt } from "./diff-utils";

interface CodeRendererProps extends RendererProps {
  category: FileCategory;
}

const extToLang: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
  cs: "csharp", rb: "ruby", php: "php", sh: "shell", bash: "shell",
  yaml: "yaml", yml: "yaml", toml: "toml", json: "json", xml: "xml",
  html: "html", css: "css", sql: "sql", md: "markdown", vue: "vue",
  svelte: "svelte", graphql: "graphql",
};

const categoryBadge: Record<string, string> = {
  code: 'CODE', json: 'JSON', csv: 'CSV', text: 'TXT',
};

export function CodeRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError, category }: CodeRendererProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [originalContent, setOriginalContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const lang = extToLang[ext] || "text";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let text = "";
        if (fileBuffer) { text = new TextDecoder().decode(fileBuffer); }
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

  const handleSelectionAI = useCallback(async (selectedText: string, instruction: string): Promise<string | null> => {
    if (!onSendToAgent) return null;
    const prompt = `你正在帮助用户编辑代码文件 "${fileName}"（语言: ${lang}）。

用户选中了以下代码：
\`\`\`${lang}
${selectedText}
\`\`\`

用户的修改指令：${instruction}

请直接返回修改后的代码（不要加任何解释、不要加代码块标记），保持原有的缩进和代码风格。`;
    const result = await onSendToAgent(selectedText, prompt, fileName);
    if (result) { setDirty(true); setEditMode(true); }
    return result;
  }, [onSendToAgent, fileName, lang]);

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

  const lines = content.split("\n");

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category={categoryBadge[category] || 'CODE'}
        onCopy={handleCopy} onSave={onSave ? handleSave : undefined} dirty={dirty} onSendToAgent={onSendToAgent ? handleSendToAI : undefined}>
        <span className="text-[10px] text-muted-foreground/40 px-1">{lang}</span>
        <button onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${editMode ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          {editMode ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{editMode ? '查看' : '编辑'}</span>
        </button>
        <button onClick={() => setWordWrap(!wordWrap)}
          className={`p-1.5 rounded transition-colors ${wordWrap ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`} title="自动换行">
          <WrapText className="w-3.5 h-3.5" />
        </button>
      </RendererToolbar>
      <div ref={containerRef} className="flex-1 overflow-auto flex bg-[var(--color-background)]">
        {onSendToAgent && (
          <SelectionAIBar containerRef={containerRef} onAIEdit={handleSelectionAI} />
        )}
        {editMode ? (
          <textarea value={content} onChange={handleChange} spellCheck={false}
            className={`flex-1 resize-none bg-transparent text-green-400 font-mono text-xs p-4 outline-none leading-relaxed ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`} />
        ) : (
          <>
            <div className="flex flex-col py-4 px-2 text-right select-none border-r border-border/30 bg-muted/10 shrink-0">
              {lines.map((_, i) => <span key={i} className="text-[11px] text-muted-foreground/40 leading-relaxed font-mono">{i + 1}</span>)}
            </div>
            <pre className={`flex-1 p-4 text-xs font-mono leading-relaxed ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
              <code className="text-green-400">{content}</code>
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
