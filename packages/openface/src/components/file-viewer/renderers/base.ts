export interface RendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onContentChange: (content: string) => void;
  onSave?: (content: string, fileName: string) => void;
  /** Send current content to AI for collaborative editing. Returns new content. */
  onSendToAgent?: (content: string, instruction: string, fileName: string) => Promise<string>;
  onError?: (err: Error) => void;
}
