'use client';

/**
 * Git Bundle 渲染器
 *
 * 功能：
 * - 解析 .bundle 文件头部
 * - 提取 VERSION、前置/后置 refs
 * - 结构化显示分支列表和对象信息
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, GitBranch } from 'lucide-react';

interface GitBundleRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

interface BundleInfo {
  version: string;
  prerequisites: string[];
  references: { hash: string; ref: string }[];
  objectCount: number;
  size: number;
}

function parseBundle(buf: ArrayBuffer): BundleInfo {
  const text = new TextDecoder().decode(buf);
  const lines = text.split('\n');
  const prerequisites: string[] = [];
  const references: { hash: string; ref: string }[] = [];
  let version = '未知';

  let i = 0;
  /* 第一行是版本标记 */
  if (lines[0]?.startsWith('# v')) {
    version = lines[0].trim();
    i = 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line.startsWith('-')) {
      /* 前置条件：-<hash> <ref> */
      const parts = line.substring(1).split(' ');
      prerequisites.push(parts[0]);
    } else if (/^[0-9a-f]{40}\s/.test(line)) {
      /* 引用：<hash> <ref> */
      const [hash, ref] = line.split(/\s+/, 2);
      references.push({ hash, ref });
    } else if (line.startsWith('#')) {
      /* 注释行，跳过 */
    } else {
      /* PACK 数据开始，不再解析 */
      break;
    }
  }

  return {
    version,
    prerequisites,
    references,
    objectCount: references.length,
    size: buf.byteLength,
  };
}

export function GitBundleRenderer({ fileName, fileUrl, fileBuffer, onError, className }: GitBundleRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<BundleInfo | null>(null);

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const buf = await loadBuffer();
        const bundle = parseBundle(buf);
        setInfo(bundle);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析 Git Bundle 失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadBuffer, onError]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-[var(--color-secondary)]">
        <GitBranch className="w-4 h-4 text-orange-400" />
        <span className="text-xs font-medium">{fileName}</span>
        {info && <span className="text-xs text-muted-foreground">{(info.size / 1024).toFixed(1)} KB</span>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-muted-foreground">解析中...</p>}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
        {info && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>版本：{info.version}</div>
              <div>引用数：{info.references.length}</div>
              {info.prerequisites.length > 0 && <div>前置条件：{info.prerequisites.length} 个</div>}
            </div>

            {info.prerequisites.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">前置条件（Prerequisites）</h4>
                {info.prerequisites.map((p, i) => (
                  <code key={i} className="block text-xs font-mono px-2 py-1 bg-muted/20 rounded mb-1">{p}</code>
                ))}
              </div>
            )}

            {info.references.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">引用（References）</h4>
                {info.references.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-muted/20 rounded mb-1 text-xs">
                    <GitBranch className="w-3 h-3 text-green-400 shrink-0" />
                    <code className="font-mono text-muted-foreground">{r.hash.substring(0, 8)}</code>
                    <span className="truncate">{r.ref}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
