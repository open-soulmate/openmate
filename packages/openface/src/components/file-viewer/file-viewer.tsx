import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { type FileViewerProps, detectCategory } from './types';
import { ImageRenderer } from './renderers/image-renderer';
import { VideoRenderer } from './renderers/video-renderer';
import { AudioRenderer } from './renderers/audio-renderer';
import { PdfRenderer } from './renderers/pdf-renderer';
import { DocxRenderer } from './renderers/docx-renderer';
import { XlsxRenderer } from './renderers/xlsx-renderer';
import { PptxRenderer } from './renderers/pptx-renderer';
import { MarkdownRenderer } from './renderers/markdown-renderer';
import { CodeRenderer } from './renderers/code-renderer';
import { HtmlRenderer } from './renderers/html-renderer';
import { SvgRenderer } from './renderers/svg-renderer';
import { CsvRenderer } from './renderers/csv-renderer';
import { JsonRenderer } from './renderers/json-renderer';
import { TextRenderer } from './renderers/text-renderer';
import { LogRenderer } from './renderers/log-renderer';
import { ZipArchiveRenderer } from './renderers/zip-renderer';
import { FallbackRenderer } from './renderers/fallback-renderer';
import { RendererToolbar } from './renderers/renderer-toolbar';

export function FileViewer({
  fileName,
  mimeType,
  fileUrl,
  fileBuffer,
  fallbackIframeUrl,
  onSave,
  onSendToAgent,
  onError,
  className,
}: FileViewerProps) {
  const category = useMemo(() => detectCategory(fileName, mimeType), [fileName, mimeType]);

  const rendererProps = {
    fileName,
    fileUrl,
    fileBuffer,
    onContentChange: () => {},
    onSave,
    onSendToAgent,
    onError,
  };

  const renderContent = () => {
    if (fallbackIframeUrl) {
      return <FallbackRenderer url={fallbackIframeUrl} fileName={fileName} />;
    }

    switch (category) {
      case 'image':
        return <ImageRenderer {...rendererProps} />;
      case 'video':
        return <VideoRenderer {...rendererProps} />;
      case 'audio':
        return <AudioRenderer {...rendererProps} />;
      case 'pdf':
        return <PdfRenderer {...rendererProps} />;
      case 'docx':
        return <DocxRenderer {...rendererProps} />;
      case 'xlsx':
        return <XlsxRenderer {...rendererProps} />;
      case 'pptx':
        return <PptxRenderer {...rendererProps} />;
      case 'markdown':
        return <MarkdownRenderer {...rendererProps} />;
      case 'html':
        return <HtmlRenderer {...rendererProps} />;
      case 'svg':
        return <SvgRenderer {...rendererProps} />;
      case 'csv':
        return <CsvRenderer {...rendererProps} />;
      case 'json':
        return <JsonRenderer {...rendererProps} />;
      case 'log':
        return <LogRenderer {...rendererProps} />;
      case 'text':
        return <TextRenderer {...rendererProps} />;
      case 'archive':
        return <ZipArchiveRenderer {...rendererProps} />;
      case 'code':
        return <CodeRenderer {...rendererProps} category={category} />;
      default:
        return (
          <div className="flex flex-col h-full min-h-0">
            <RendererToolbar fileName={fileName} fileUrl={fileUrl} />
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">不支持预览此文件格式</p>
              {fileUrl && (
                <a href={fileUrl} download={fileName}
                  className="px-3 py-1.5 text-xs bg-muted rounded hover:bg-muted/80 transition-colors">
                  下载文件
                </a>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className={cn('flex flex-col h-full w-full bg-background', className)}>
      <div className="flex-1 overflow-auto min-h-0">
        {renderContent()}
      </div>
    </div>
  );
}
