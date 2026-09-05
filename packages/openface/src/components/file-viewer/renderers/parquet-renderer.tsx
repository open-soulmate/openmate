'use client';

/**
 * Parquet 数据文件渲染器
 *
 * 功能：
 * - 使用 parquet-wasm 在浏览器中读取 Parquet 文件
 * - 表格化显示数据（前100行）
 * - 显示 schema（列名、类型）
 * - 分页浏览
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Database } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ParquetRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Parquet 渲染器                                                     */
/* ------------------------------------------------------------------ */

export function ParquetRenderer({ fileName, fileUrl, fileBuffer, onError, className }: ParquetRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [schema, setSchema] = useState<{ name: string; type: string }[]>([]);

  const pageSize = 100;

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const buf = await loadBuffer();
        const parquet = await import('parquet-wasm');

        if (disposed) return;

        /* 读取 Parquet 文件 */
        const arr = new Uint8Array(buf);
        const arrowIPC = parquet.readParquet(arr);

        /* 用 arrow 解析 IPC 格式 */
        const arrow = await import('apache-arrow');
        const table = arrow.tableFromIPC(arrowIPC);

        /* 提取 schema */
        const schemaFields = table.schema.fields.map(f => ({
          name: f.name,
          type: String(f.type),
        }));
        setSchema(schemaFields);

        /* 提取列名 */
        const cols = schemaFields.map(f => f.name);
        setColumns(cols);

        /* 提取所有行 */
        const allRows: unknown[][] = [];
        for (let i = 0; i < table.numRows; i++) {
          const row = cols.map(col => {
            const colData = table.getChild(col);
            if (!colData) return null;
            const val = colData.get(i);
            return val === null || val === undefined ? null : String(val);
          });
          allRows.push(row);
        }

        setRows(allRows);
        setTotalRows(allRows.length);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          /* parquet-wasm 可能不支持所有格式，降级显示文件信息 */
          setError(err instanceof Error ? err.message : '加载 Parquet 失败（可能需要 apache-arrow 依赖）');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => { disposed = true; };
  }, [loadBuffer, onError]);

  /* 分页 */
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-[var(--color-secondary)]">
        <Database className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium">{fileName}</span>
        {!loading && !error && (
          <>
            <span className="text-xs text-muted-foreground">
              {totalRows} 行 × {columns.length} 列
            </span>
            <div className="flex-1" />
            {/* Schema 信息 */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {schema.slice(0, 5).map(s => (
                <span key={s.name} className="px-1.5 py-0.5 rounded bg-muted/30">
                  {s.name}: {s.type}
                </span>
              ))}
              {schema.length > 5 && <span>+{schema.length - 5}</span>}
            </div>
          </>
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            解析 Parquet 中...
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center gap-2 h-full p-4">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--color-secondary)] z-10">
              <tr>
                <th className="px-2 py-1.5 text-left border-b border-border/30 text-muted-foreground font-medium w-12">#</th>
                {columns.map(col => (
                  <th key={col} className="px-2 py-1.5 text-left border-b border-border/30 text-muted-foreground font-medium whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-2 py-1 border-b border-border/10 text-muted-foreground/50">
                    {page * pageSize + i + 1}
                  </td>
                  {row.map((val, j) => (
                    <td key={j} className="px-2 py-1 border-b border-border/10 max-w-[200px] truncate">
                      {val === null ? <span className="text-muted-foreground/30 italic">null</span> : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {!loading && !error && totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-border/30 bg-[var(--color-secondary)]">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="w-3 h-3" /> 上一页
          </button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-30"
          >
            下一页 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
