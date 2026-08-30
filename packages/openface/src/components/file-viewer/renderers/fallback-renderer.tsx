import { RendererToolbar } from "./renderer-toolbar";

export function FallbackRenderer({ url, fileName }: { url: string; fileName: string }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={url} />
      <iframe src={url} title={fileName} className="flex-1 border-0" sandbox="allow-same-origin allow-scripts" />
    </div>
  );
}
