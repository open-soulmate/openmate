import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";

export function VideoRenderer({ fileUrl, fileName }: RendererProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} />
      <div className="flex-1 flex items-center justify-center p-4">
        <video src={fileUrl} controls className="max-w-full max-h-full rounded-lg" preload="metadata" />
      </div>
    </div>
  );
}
