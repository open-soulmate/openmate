'use client';

import { cn } from '../lib/utils';

export interface ChatViewToggleProps {
  /** 当前激活的视图 */
  activeView: 'messages' | 'files';
  /** 切换视图回调 */
  onViewChange: (view: 'messages' | 'files') => void;
  /** 消息视图标签（默认"消息"） */
  messagesLabel?: string;
  /** 文件视图标签（默认"文件"） */
  filesLabel?: string;
  /** 消息图标 */
  messagesIcon?: React.ReactNode;
  /** 文件图标 */
  filesIcon?: React.ReactNode;
  /** 文件数量（显示badge） */
  fileCount?: number;
  /** 仅在有消息时显示 */
  visible?: boolean;
  className?: string;
}

export function ChatViewToggle({
  activeView,
  onViewChange,
  messagesLabel = '消息',
  filesLabel = '文件',
  messagesIcon,
  filesIcon,
  fileCount,
  visible = true,
  className,
}: ChatViewToggleProps) {
  if (!visible) return null;

  return (
    <div className={cn('flex items-center gap-1 px-3 lg:px-6 pt-2', className)}>
      <button
        onClick={() => onViewChange('messages')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          activeView === 'messages'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        {messagesIcon}
        {messagesLabel}
      </button>
      <button
        onClick={() => onViewChange('files')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          activeView === 'files'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        {filesIcon}
        {filesLabel}
        {fileCount !== undefined && fileCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] font-semibold leading-none">
            {fileCount}
          </span>
        )}
      </button>
    </div>
  );
}
