import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { ChevronRight, ChevronDown, Pencil, Eye, Table, Code } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { SelectionAIBar } from "./selection-ai-bar";
import { buildDiffPrompt } from "./diff-utils";

const PAGE_SIZE = 100;

export function JsonRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError }: RendererProps) {
  const [rawContent, setRawContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'source' | 'table'>('tree');
  const [parsed, setParsed] = useState<any>(null);
  const [jsonlRows, setJsonlRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>('');

  const isJsonl = fileName.toLowerCase().endsWith('.jsonl');

  const handleSendToAI = useCallback(async (instruction: string) => {
    if (!onSendToAgent) return;
    const prompt = buildDiffPrompt(rawContent, rawContent, fileName, instruction, "JSON");
    const result = await onSendToAgent(rawContent, prompt, fileName);
    if (result) { setRawContent(result); setDirty(true); setEditMode(true); }
  }, [onSendToAgent, rawContent, fileName]);

  const handleSelectionAI = useCallback(async (selectedText: string, instruction: string): Promise<string | null> => {
    if (!onSendToAgent) return null;
    const prompt = `你正在帮助用户编辑 JSON 文件 "${fileName}"。

用户选中了以下内容：
\`\`\`json
${selectedText}
\`\`\`

用户的修改指令：${instruction}

请直接返回修改后的内容（不要加任何解释、不要加代码块标记），保持JSON格式正确。`;
    const result = await onSendToAgent(selectedText, prompt, fileName);
    if (result) { setDirty(true); setEditMode(true); }
    return result;
  }, [onSendToAgent, fileName]);


  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let text = "";
        if (fileBuffer) text = new TextDecoder().decode(fileBuffer);
        else if (fileUrl) { const res = await fetch(fileUrl); text = await res.text(); }
        if (cancelled) return;
        setRawContent(text);

        if (isJsonl) {
          const lines = text.split('\n').filter(l => l.trim());
          const parsed_lines: any[] = [];
          for (const line of lines) {
            try { parsed_lines.push(JSON.parse(line)); } catch { parsed_lines.push(line); }
          }
          setJsonlRows(parsed_lines);
          setViewMode('table');
        } else {
          try {
            setParsed(JSON.parse(text));
          } catch (e) {
            setError((e as Error).message);
          }
        }
        setLoading(false);
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(rawContent); } catch {
      const ta = document.createElement('textarea'); ta.value = rawContent;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  }, [rawContent]);

  const handleSave = useCallback(() => {
    onSave?.(rawContent, fileName);
    setDirty(false);
  }, [onSave, rawContent, fileName]);

  const formatted = useMemo(() => {
    if (parsed !== null) {
      try { return JSON.stringify(parsed, null, 2); } catch { return rawContent; }
    }
    return rawContent;
  }, [parsed, rawContent]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解析中...</div>;

  // JSONL table
  const totalPages = Math.max(1, Math.ceil(jsonlRows.length / PAGE_SIZE));
  const pageRows = jsonlRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const jsonlHeaders = jsonlRows.length > 0 && typeof jsonlRows[0] === 'object'
    ? Object.keys(jsonlRows[0]) : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="JSON"
        onCopy={handleCopy} onSave={onSave ? handleSave : undefined} dirty={dirty}>
        {isJsonl ? (
          <button onClick={() => setViewMode(viewMode === 'table' ? 'source' : 'table')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${viewMode === 'table' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
            <Table className="w-3.5 h-3.5" /><span className="hidden sm:inline">表格</span>
          </button>
        ) : (
          <>
            <button onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${viewMode === 'tree' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
              <ChevronDown className="w-3.5 h-3.5" /><span className="hidden sm:inline">树状</span>
            </button>
            <button onClick={() => setViewMode('source')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${viewMode === 'source' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
              <Code className="w-3.5 h-3.5" /><span className="hidden sm:inline">源码</span>
            </button>
          </>
        )}
        <button onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${editMode ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          {editMode ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{editMode ? '查看' : '编辑'}</span>
        </button>
        {isJsonl && viewMode === 'table' && (
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-0.5 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground text-xs">&lt;</button>
            <span className="text-[10px] text-muted-foreground">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-0.5 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground text-xs">&gt;</button>
            <span className="text-[10px] text-muted-foreground/40 ml-1">{jsonlRows.length}行</span>
          </div>
        )}
      </RendererToolbar>

      <div ref={containerRef} className="flex-1 overflow-auto bg-[var(--color-background)] relative">
        {onSendToAgent && <SelectionAIBar containerRef={containerRef} onAIEdit={handleSelectionAI} />}
        {editMode ? (
          <textarea value={rawContent} onChange={e => { setRawContent(e.target.value); setDirty(true); }}
            className="w-full h-full resize-none bg-transparent text-green-400 font-mono text-xs p-4 outline-none leading-relaxed"
            spellCheck={false} />
        ) : error ? (
          <div className="p-4 text-red-400 text-xs font-mono">JSON解析错误: {error}</div>
        ) : viewMode === 'tree' && parsed !== null ? (
          <div className="p-4">
            <JsonTreeNode data={parsed} />
          </div>
        ) : viewMode === 'table' && isJsonl ? (
          <table className="w-full text-xs border-collapse">
            {jsonlHeaders.length > 0 && (
              <thead>
                <tr className="bg-muted/30 sticky top-0">
                  {jsonlHeaders.map(h => (
                    <th key={h} className="border border-border/30 px-2 py-1 text-left font-semibold whitespace-nowrap text-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/10">
                  {jsonlHeaders.map(h => (
                    <td key={h} className="border border-border/30 px-2 py-1 whitespace-nowrap text-foreground">
                      {typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-green-400">{formatted}</pre>
        )}
      </div>
    </div>
  );
}

/** Recursive JSON tree node with collapse/expand */
function JsonTreeNode({ data, depth = 0 }: { data: any; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (data === null) return <span className="text-muted-foreground">null</span>;
  if (data === undefined) return <span className="text-muted-foreground">undefined</span>;
  if (typeof data === 'boolean') return <span className="text-orange-400">{String(data)}</span>;
  if (typeof data === 'number') return <span className="text-blue-400">{data}</span>;
  if (typeof data === 'string') return <span className="text-green-400">"{data.length > 200 ? data.slice(0, 200) + '...' : data}"</span>;

  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v: any, i: number) => [i, v]) : Object.entries(data);
  const bracket = isArray ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) return <span className="text-muted-foreground">{bracket[0]}{bracket[1]}</span>;

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
        {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        <span className="text-muted-foreground/60">{bracket[0]}</span>
        {!expanded && <span className="text-muted-foreground/40"> {entries.length} items {bracket[1]}</span>}
      </button>
      {expanded && (
        <>
          {entries.map((entry) => {
            const key = String(entry[0]);
            const value = entry[1];
            return (
              <div key={key} className="flex items-start gap-1">
                {!isArray && <span className="text-purple-400 shrink-0">"{key}"</span>}
                {!isArray && <span className="text-muted-foreground shrink-0">:</span>}
                <JsonTreeNode data={value} depth={depth + 1} />
              </div>
            );
          })}
          <span className="text-muted-foreground/60">{bracket[1]}</span>
        </>
      )}
    </div>
  );
}
