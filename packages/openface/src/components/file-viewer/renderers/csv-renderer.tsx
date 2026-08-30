import { useState, useEffect, useCallback, useMemo } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { Pencil, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { decodeWithEncoding, decodeDataUrl } from "./encoding-utils";
import { buildDiffPrompt } from "./diff-utils";

const PAGE_SIZE = 100;
const ENCODINGS = ['utf-8', 'gbk', 'gb2312', 'big5', 'shift_jis', 'euc-kr', 'iso-8859-1'];

export function CsvRenderer({ fileUrl, fileBuffer, fileName, onSave, onSendToAgent, onError }: RendererProps) {
  const [rawContent, setRawContent] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(1);
  const [encoding, setEncoding] = useState<string>('utf-8');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [showEncodingMenu, setShowEncodingMenu] = useState(false);

  const isTsv = fileName.toLowerCase().endsWith('.tsv');

  // Load content with encoding
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let buffer: ArrayBuffer | undefined;
        if (fileBuffer) buffer = fileBuffer;
        else if (fileUrl) {
          const res = await fetch(fileUrl);
          buffer = await res.arrayBuffer();
        }
        if (!buffer || cancelled) return;

        const decoder = new TextDecoder(encoding);
        const text = decoder.decode(buffer);
        setRawContent(text);
        parseCSV(text, isTsv ? '\t' : delimiter);
        setLoading(false);
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer, encoding, delimiter]);

  const parseCSV = useCallback((text: string, sep: string) => {
    const lines: string[][] = [];
    let current: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === sep) { current.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          current.push(field); field = '';
          if (current.some(c => c.trim())) lines.push(current);
          current = [];
        }
        else { field += ch; }
      }
    }
    current.push(field);
    if (current.some(c => c.trim())) lines.push(current);
    setRows(lines);
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);

  const handleSendToAI = useCallback(async (instruction: string) => {
    if (!onSendToAgent) return;
    const prompt = buildDiffPrompt(rawContent, rawContent, fileName, instruction, "CSV");
    const result = await onSendToAgent(rawContent, prompt, fileName);
    if (result) { setRawContent(result); setDirty(true); setEditMode(true); }
  }, [onSendToAgent, rawContent, fileName]);

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

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解析中...</div>;

  const headers = rows[0] || [];
  const dataRows = pageRows.length > 0 && page === 1 ? pageRows.slice(1) : pageRows;
  const colCount = headers.length || (rows[0]?.length ?? 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="CSV"
        onCopy={handleCopy} onSave={onSave ? handleSave : undefined} dirty={dirty} onSendToAgent={onSendToAgent ? handleSendToAI : undefined}>
        {/* Edit toggle */}
        <button onClick={() => setEditMode(!editMode)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${editMode ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
          {editMode ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{editMode ? '查看' : '编辑'}</span>
        </button>

        {/* Delimiter */}
        {!isTsv && (
          <select value={delimiter} onChange={e => setDelimiter(e.target.value)}
            className="px-1 py-0.5 text-xs bg-transparent border border-border/30 rounded text-muted-foreground outline-none">
            <option value=",">逗号</option>
            <option value=";">分号</option>
            <option value={"\t"}>Tab</option>
            <option value="|">管道</option>
          </select>
        )}

        {/* Encoding */}
        <div className="relative">
          <button onClick={() => setShowEncodingMenu(!showEncodingMenu)}
            className="px-1.5 py-0.5 text-[10px] rounded border border-border/30 text-muted-foreground hover:bg-muted/30">
            {encoding}
          </button>
          {showEncodingMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[#1a1a2e] border border-border/30 rounded shadow-lg z-50">
              {ENCODINGS.map(enc => (
                <button key={enc} onClick={() => { setEncoding(enc); setShowEncodingMenu(false); }}
                  className={`block w-full text-left px-3 py-1 text-xs hover:bg-muted/30 ${enc === encoding ? 'text-primary' : 'text-muted-foreground'}`}>
                  {enc}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Page nav */}
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-0.5 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-0.5 rounded hover:bg-muted/30 disabled:opacity-30 text-muted-foreground">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] text-muted-foreground/40 ml-1">{rows.length}行</span>
      </RendererToolbar>

      <div className="flex-1 overflow-auto">
        {editMode ? (
          <textarea value={rawContent} onChange={e => { setRawContent(e.target.value); setDirty(true); parseCSV(e.target.value, isTsv ? '\t' : delimiter); }}
            className="w-full h-full resize-none bg-[#0d1117] text-green-300 font-mono text-xs p-4 outline-none leading-relaxed"
            spellCheck={false} />
        ) : (
          <table className="w-full text-xs border-collapse">
            {headers.length > 0 && (
              <thead>
                <tr className="bg-muted/30 sticky top-0">
                  {headers.map((h, i) => (
                    <th key={i} className="border border-border/30 px-2 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/10">
                  {Array.from({ length: Math.max(colCount, row.length) }, (_, ci) => (
                    <td key={ci} className="border border-border/30 px-2 py-1 whitespace-nowrap">{row[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
