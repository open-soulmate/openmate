import { useState, useEffect } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";

export function XlsxRenderer({ fileUrl, fileBuffer, fileName, onError }: RendererProps) {
  const [sheets, setSheets] = useState<{ name: string; data: string[][] }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const XLSX = await import("xlsx");
        let buffer = fileBuffer;
        if (!buffer && fileUrl) {
          const res = await fetch(fileUrl);
          buffer = await res.arrayBuffer();
        }
        if (!buffer || cancelled) return;
        const wb = XLSX.read(buffer, { type: "array" });
        const result = wb.SheetNames.map(name => ({
          name,
          data: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1 }) as string[][],
        }));
        if (!cancelled) { setSheets(result); setLoading(false); }
      } catch (err) {
        if (!cancelled) { onError?.(err as Error); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const sheet = sheets[activeSheet];

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="XLS">
        {sheets.length > 1 && sheets.map((s, i) => (
          <button key={i} onClick={() => setActiveSheet(i)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${i === activeSheet ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}>
            {s.name}
          </button>
        ))}
      </RendererToolbar>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解析中...</div>
        ) : !sheet ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">无数据</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <tbody>
              {sheet.data.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-muted/30 font-semibold" : "hover:bg-muted/10"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-border/30 px-2 py-1 whitespace-nowrap">{cell ?? ""}</td>
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
