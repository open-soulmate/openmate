import { useState, useEffect, useCallback } from "react";
import type { RendererProps } from "./base";
import { RendererToolbar } from "./renderer-toolbar";
import { Folder, File, ChevronRight, ChevronDown, Download, FileText, Image, Code, Table } from "lucide-react";

interface ZipEntry {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: TreeNode[];
  expanded?: boolean;
}

function buildTree(entries: ZipEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      let existing = current.find(n => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: pathSoFar,
          isDir: !isLast || entry.isDir,
          size: isLast && !entry.isDir ? entry.size : undefined,
          children: !isLast || entry.isDir ? [] : undefined,
          expanded: i < 1,
        };
        current.push(existing);
      }
      if (existing.children) current = existing.children;
    }
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => { if (n.children) sort(n.children); });
  };
  sort(root);
  return root;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return Image;
  if (['js', 'ts', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'sh'].includes(ext)) return Code;
  if (['csv', 'xlsx', 'xls'].includes(ext)) return Table;
  if (['txt', 'md', 'json', 'html', 'css', 'log'].includes(ext)) return FileText;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

const TEXT_EXTS = ['txt', 'md', 'json', 'jsonl', 'csv', 'tsv', 'html', 'htm', 'css', 'js', 'ts', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'sh', 'yaml', 'yml', 'toml', 'xml', 'svg', 'log', 'ini', 'cfg', 'env', 'sql', 'graphql', 'vue', 'svelte'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

export function ZipArchiveRenderer({ fileUrl, fileBuffer, fileName, onError }: RendererProps) {
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewType, setPreviewType] = useState<'text' | 'image' | 'none'>('none');
  const [zipBuffer, setZipBuffer] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const JSZip = await import('jszip');
        let buffer: ArrayBuffer | undefined;
        if (fileBuffer) buffer = fileBuffer;
        else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            const commaIdx = fileUrl.indexOf(',');
            if (commaIdx >= 0) {
              const binary = atob(fileUrl.slice(commaIdx + 1));
              const arr = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
              buffer = arr.buffer;
            }
          } else { const res = await fetch(fileUrl); buffer = await res.arrayBuffer(); }
        }
        if (!buffer || cancelled) return;
        setZipBuffer(buffer);

        const zip = await JSZip.loadAsync(buffer);
        const result: ZipEntry[] = [];
        zip.forEach((path, zipEntry) => {
          result.push({ path, name: path.split('/').filter(Boolean).pop() || path, isDir: zipEntry.dir, size: 0 });
        });

        if (!cancelled) {
          setEntries(result);
          setTree(buildTree(result));
          setLoading(false);
        }
      } catch (err) { if (!cancelled) { onError?.(err as Error); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [fileUrl, fileBuffer]);

  const handleFileClick = useCallback(async (entry: ZipEntry) => {
    if (entry.isDir || !zipBuffer) return;
    setSelectedFile(entry.path);

    const ext = entry.name.split('.').pop()?.toLowerCase() || '';

    try {
      const JSZip = await import('jszip');
      const zip = await JSZip.loadAsync(zipBuffer);
      const file = zip.file(entry.path);
      if (!file) return;

      if (TEXT_EXTS.includes(ext)) {
        const text = await file.async('string');
        setPreviewContent(text);
        setPreviewType('text');
      } else if (IMAGE_EXTS.includes(ext)) {
        const blob = await file.async('blob');
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
        setPreviewType('image');
      } else {
        setPreviewContent('');
        setPreviewType('none');
      }
    } catch (err) {
      console.error('Failed to read zip entry:', err);
    }
  }, [zipBuffer]);

  const handleDownloadEntry = useCallback(async (entryPath: string, entryName: string) => {
    if (!zipBuffer) return;
    try {
      const JSZip = await import('jszip');
      const zip = await JSZip.loadAsync(zipBuffer);
      const file = zip.file(entryPath);
      if (!file) return;
      const blob = await file.async('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = entryName; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, [zipBuffer]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">解压中...</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <RendererToolbar fileName={fileName} fileUrl={fileUrl} category="ZIP">
        <span className="text-[10px] text-muted-foreground/40">{entries.filter(e => !e.isDir).length} 个文件</span>
      </RendererToolbar>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-64 shrink-0 border-r border-border/30 overflow-y-auto bg-[#12122a] p-2">
          {tree.map(node => (
            <TreeNodeComponent key={node.path} node={node} depth={0}
              selectedFile={selectedFile}
              onFileClick={path => { const entry = entries.find(e => e.path === path); if (entry) handleFileClick(entry); }}
              onDownload={handleDownloadEntry} />
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {previewType === 'text' ? (
            <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-green-300 bg-[#0d1117] h-full">{previewContent}</pre>
          ) : previewType === 'image' ? (
            <div className="flex items-center justify-center h-full bg-white p-4">
              <img src={previewContent} alt={selectedFile} className="max-w-full max-h-full" />
            </div>
          ) : selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <p className="text-sm">不支持预览此文件格式</p>
              <button onClick={() => {
                const entry = entries.find(e => e.path === selectedFile);
                if (entry) handleDownloadEntry(entry.path, entry.name);
              }} className="px-3 py-1.5 text-xs bg-muted rounded hover:bg-muted/80">下载</button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">点击左侧文件预览</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeNodeComponent({ node, depth, selectedFile, onFileClick, onDownload }: {
  node: TreeNode; depth: number; selectedFile: string;
  onFileClick: (path: string) => void; onDownload: (path: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(node.expanded ?? depth < 1);
  const Icon = node.isDir ? Folder : getFileIcon(node.name);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer text-xs group
          ${selectedFile === node.path ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted/30'}`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => { if (node.isDir) setExpanded(!expanded); else onFileClick(node.path); }}
      >
        {node.isDir ? (
          expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />
        ) : <span className="w-3 shrink-0" />}
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1">{node.name}</span>
        {node.size !== undefined && <span className="text-[10px] text-muted-foreground/40 shrink-0">{formatSize(node.size)}</span>}
        {!node.isDir && (
          <button onClick={e => { e.stopPropagation(); onDownload(node.path, node.name); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted/50 rounded" title="下载">
            <Download className="w-3 h-3" />
          </button>
        )}
      </div>
      {node.isDir && expanded && node.children?.map(child => (
        <TreeNodeComponent key={child.path} node={child} depth={depth + 1}
          selectedFile={selectedFile} onFileClick={onFileClick} onDownload={onDownload} />
      ))}
    </div>
  );
}
