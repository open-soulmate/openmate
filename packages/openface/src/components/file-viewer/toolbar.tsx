import { cn } from '../../lib/utils';
import type { FileCategory } from './types';

interface FileViewerToolbarProps {
  fileName: string;
  category: FileCategory;
  editMode: boolean;
  canEdit: boolean;
  onToggleEdit: () => void;
  onSave?: () => void;
  onSendBack?: () => void;
  onDownload?: () => void;
}

const categoryLabels: Record<FileCategory, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
  markdown: 'Markdown',
  code: '代码',
  text: '文本',
  csv: 'CSV',
  json: 'JSON',
  html: 'HTML',
  unknown: '文件',
  svg: 'SVG',
  log: '日志',
  archive: '压缩包',
};

export function FileViewerToolbar({
  fileName,
  category,
  editMode,
  canEdit,
  onToggleEdit,
  onSave,
  onSendBack,
  onDownload,
}: FileViewerToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        {categoryLabels[category]}
      </span>
      <span className="text-sm font-medium truncate flex-1">{fileName}</span>

      <div className="flex items-center gap-1">
        {canEdit && (
          <button
            onClick={onToggleEdit}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              editMode
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "hover:bg-muted text-muted-foreground"
            )}
            title={editMode ? '预览' : '编辑'}
          >
            {editMode ? '预览' : '编辑'}
          </button>
        )}
        {editMode && onSave && (
          <button
            onClick={onSave}
            className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="保存"
          >
            保存
          </button>
        )}
        {editMode && onSendBack && (
          <button
            onClick={onSendBack}
            className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
            title="发回给AI"
          >
            发回
          </button>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            title="下载"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
