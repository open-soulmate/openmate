import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";

export function AudioRenderer({ fileUrl, fileName }: RendererProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-4xl">🎵</div>
        <audio src={fileUrl} controls className="w-full max-w-md" />
        <p className="text-xs text-muted-foreground">{fileName}</p>
      </div>
    </div>
  );
}
