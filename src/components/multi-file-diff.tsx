'use client';
import { useState, useCallback, lazy, Suspense } from 'react';
import { FileText, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const MonacoDiffEditor = lazy(() => import('@monaco-editor/react').then(mod => ({ default: mod.DiffEditor })));

export interface FileChange {
  path: string;
  language: string;
  original: string;
  modified: string;
  status: 'added' | 'modified' | 'deleted';
}

interface MultiFileDiffProps {
  files: FileChange[];
  onAccept?: (path: string, content: string) => void;
  onReject?: (path: string) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
}

export function MultiFileDiff({ files, onAccept, onReject, onAcceptAll, onRejectAll }: MultiFileDiffProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [acceptedFiles, setAcceptedFiles] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const currentFile = files[activeTab];

  const handleAccept = useCallback((path: string, content: string) => {
    setAcceptedFiles((prev) => new Set(prev).add(path));
    setRejectedFiles((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    onAccept?.(path, content);
  }, [onAccept]);

  const handleReject = useCallback((path: string) => {
    setRejectedFiles((prev) => new Set(prev).add(path));
    setAcceptedFiles((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    onReject?.(path);
  }, [onReject]);

  const handleAcceptAll = useCallback(() => {
    const allPaths = new Set(files.map((f) => f.path));
    setAcceptedFiles(allPaths);
    setRejectedFiles(new Set());
    onAcceptAll?.();
  }, [files, onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    const allPaths = new Set(files.map((f) => f.path));
    setRejectedFiles(allPaths);
    setAcceptedFiles(new Set());
    onRejectAll?.();
  }, [files, onRejectAll]);

  if (files.length === 0) return null;

  const getFileStatusIcon = (path: string) => {
    if (acceptedFiles.has(path)) {
      return <Check className="w-3 h-3 text-green-500" />;
    }
    if (rejectedFiles.has(path)) {
      return <X className="w-3 h-3 text-red-500" />;
    }
    return null;
  };

  const getFileStatusColor = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return 'text-green-500';
      case 'deleted':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  return (
    <div className="my-3 rounded-lg border border-border/50 overflow-hidden bg-[#0d0d14]">
      {/* Header with file count and actions */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e2e] border-b border-border/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-medium">
              {files.length} 个文件修改
            </span>
          </button>
          <span className="text-[10px] text-muted-foreground/60">
            {acceptedFiles.size} 已接受 · {rejectedFiles.size} 已拒绝
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAcceptAll}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-green-500 hover:bg-green-500/10 transition-colors"
          >
            <Check className="w-3 h-3" />
            全部接受
          </button>
          <button
            onClick={handleRejectAll}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3 h-3" />
            全部拒绝
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* File tabs */}
          <div className="flex overflow-x-auto border-b border-border/30 bg-[#111118]">
            {files.map((file, index) => {
              const fileName = file.path.split('/').pop() || file.path;
              const isActive = index === activeTab;
              const statusIcon = getFileStatusIcon(file.path);
              return (
                <button
                  key={file.path}
                  onClick={() => setActiveTab(index)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border/30 transition-colors min-w-0',
                    isActive
                      ? 'bg-[#0d0d14] text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[#0d0d14]/50'
                  )}
                >
                  <FileText className={cn('w-3 h-3 shrink-0', getFileStatusColor(file.status))} />
                  <span className="truncate max-w-[120px]">{fileName}</span>
                  {statusIcon}
                </button>
              );
            })}
          </div>

          {/* Diff editor */}
          {currentFile && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] border-b border-border/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={getFileStatusColor(currentFile.status)}>
                    {currentFile.status === 'added' ? '新增' : currentFile.status === 'deleted' ? '删除' : '修改'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50">
                    {currentFile.path}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!acceptedFiles.has(currentFile.path) && !rejectedFiles.has(currentFile.path) && (
                    <>
                      <button
                        onClick={() => handleAccept(currentFile.path, currentFile.modified)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-green-500 hover:bg-green-500/10 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        接受
                      </button>
                      <button
                        onClick={() => handleReject(currentFile.path)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="w-3 h-3" />
                        拒绝
                      </button>
                    </>
                  )}
                  {acceptedFiles.has(currentFile.path) && (
                    <span className="flex items-center gap-1 text-[11px] text-green-500">
                      <Check className="w-3 h-3" />
                      已接受
                    </span>
                  )}
                  {rejectedFiles.has(currentFile.path) && (
                    <span className="flex items-center gap-1 text-[11px] text-red-500">
                      <X className="w-3 h-3" />
                      已拒绝
                    </span>
                  )}
                </div>
              </div>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground text-xs">
                    加载 Diff 编辑器...
                  </div>
                }
              >
                <MonacoDiffEditor
                  height="300px"
                  language={currentFile.language || 'text'}
                  original={currentFile.original}
                  modified={currentFile.modified}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineHeight: 18,
                    padding: { top: 8, bottom: 8 },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    renderSideBySide: true,
                    enableSplitViewResizing: true,
                    scrollbar: {
                      vertical: 'auto',
                      horizontal: 'auto',
                      verticalScrollbarSize: 6,
                      horizontalScrollbarSize: 6,
                    },
                  }}
                />
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
}
