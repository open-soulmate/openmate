import { useState, useEffect, useMemo } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const binary = atob(dataUrl.slice(commaIdx + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch { return null; }
}

export function PdfRenderer({ fileUrl, fileBuffer, fileName }: RendererProps) {
  const [buffer, setBuffer] = useState<ArrayBuffer | undefined>(fileBuffer);

  useEffect(() => {
    if (fileBuffer) { setBuffer(fileBuffer); return; }
    if (!fileUrl) return;
    if (fileUrl.startsWith('data:')) {
      const buf = dataUrlToArrayBuffer(fileUrl);
      if (buf) setBuffer(buf);
      return;
    }
    let cancelled = false;
    fetch(fileUrl).then(r => r.arrayBuffer()).then(b => { if (!cancelled) setBuffer(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const viewerUrl = useMemo(() => {
    if (!buffer) return undefined;
    const blob = new Blob([buffer], { type: 'application/pdf' });
    return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(URL.createObjectURL(blob))}`;
  }, [buffer]);

  return (
    <div className="flex flex-col h-full">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="PDF" />
      <div className="flex-1 min-h-0">
        {viewerUrl ? (
          <iframe src={viewerUrl} className="w-full h-full border-0" title={fileName || 'PDF'} style={{ background: '#525659' }} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>
        )}
      </div>
    </div>
  );
}
