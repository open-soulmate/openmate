import { useState, useEffect } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";

export function DocxRenderer({ fileUrl, fileBuffer, fileName, onError }: RendererProps) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const docx = await import("docx-preview");
        let buffer = fileBuffer;
        if (!buffer && fileUrl) {
          const res = await fetch(fileUrl);
          buffer = await res.arrayBuffer();
        }
        if (!buffer || cancelled) return;
        const container = document.createElement("div");
        await docx.renderAsync(buffer, container);
        if (!cancelled) {
          setHtml(container.innerHTML);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(err as Error);
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} />
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解析中...</div>
        ) : (
          <div className="p-6 prose prose-invert max-w-none docx-preview" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}
