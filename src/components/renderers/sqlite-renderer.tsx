'use client';

/**
 * SQLite 数据库浏览器渲染器
 *
 * 功能：
 * - 使用 sql.js（WASM）解析 SQLite 数据库文件
 * - 左侧：表列表（从 sqlite_master 查询）
 * - 右侧：选中表的数据表格（SELECT * FROM table LIMIT 100）
 * - 表结构：显示列名、类型、是否主键
 * - SQL查询：输入框可执行自定义SQL
 * - 分页：每页100行，上一页/下一页
 * - 暗色/亮色主题自动适配
 * - 错误处理（非SQLite文件、损坏文件等）
 * - SSR安全（动态导入 sql.js）
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database as DatabaseIcon,
  Table2,
  Columns3,
  Play,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Terminal,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型定义                                                           */
/* ------------------------------------------------------------------ */

/** sql.js Database 类型（运行时实例） */
type SqlJsDb = import('sql.js').Database;

/** 表的列信息 */
interface ColumnInfo {
  /** 列名 */
  name: string;
  /** 数据类型 */
  type: string;
  /** 是否为主键 */
  isPrimaryKey: boolean;
}

/** 查询结果 */
interface QueryResult {
  /** 列名列表 */
  columns: string[];
  /** 数据行 */
  values: any[][];
}

/** 组件 Props */
interface SqliteRendererProps {
  /** 文件名 */
  fileName: string;
  /** 文件内容 data URL 或 blob URL */
  fileUrl?: string;
  /** 文件内容 ArrayBuffer */
  fileBuffer?: ArrayBuffer;
  /** 错误回调 */
  onError?: (err: Error) => void;
  /** 额外 className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  检测当前主题是否为暗色                                              */
/* ------------------------------------------------------------------ */

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/* ------------------------------------------------------------------ */
/*  从 fileUrl 加载文件为 ArrayBuffer                                   */
/* ------------------------------------------------------------------ */

async function loadFileBuffer(fileUrl?: string): Promise<ArrayBuffer | null> {
  if (!fileUrl) return null;

  // data URL：直接解码
  if (fileUrl.startsWith('data:')) {
    const base64 = fileUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // blob URL / http URL：fetch
  const resp = await fetch(fileUrl);
  return resp.arrayBuffer();
}

/* ------------------------------------------------------------------ */
/*  SQLite 渲染器主组件                                                 */
/* ------------------------------------------------------------------ */

export function SqliteRenderer({
  fileName,
  fileUrl,
  fileBuffer: initialBuffer,
  onError,
  className,
}: SqliteRendererProps) {
  const isDark = useIsDarkMode();

  /* ---- 状态 ---- */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<SqlJsDb | null>(null);

  // 表列表
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // 当前表的列信息
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  // 当前表数据
  const [tableData, setTableData] = useState<QueryResult | null>(null);
  // 当前表总行数
  const [totalRows, setTotalRows] = useState(0);
  // 当前页码（从0开始）
  const [page, setPage] = useState(0);

  // SQL 查询模式
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // 每页行数
  const PAGE_SIZE = 100;

  /* ---- 初始化：加载 sql.js 并打开数据库 ---- */
  useEffect(() => {
    let cancelled = false;
    let dbInstance: SqlJsDb | null = null;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // 动态导入 sql.js（SSR安全）
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs({
          locateFile: (file: string) =>
            `https://sql.js.org/dist/${file}`,
        });

        // 加载文件数据
        let buffer = initialBuffer;
        if (!buffer) {
          const loaded = await loadFileBuffer(fileUrl);
          if (!loaded) {
            throw new Error('无法加载文件：未提供 fileUrl 或 fileBuffer');
          }
          buffer = loaded;
        }

        if (cancelled) return;

        // 打开数据库
        dbInstance = new SQL.Database(new Uint8Array(buffer));
        setDb(dbInstance);

        // 查询所有表
        const result = dbInstance!.exec(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        if (cancelled) return;

        const tableNames =
          result.length > 0
            ? result[0].values.map((row: any[]) => String(row[0]))
            : [];
        setTables(tableNames);

        // 自动选中第一个表
        if (tableNames.length > 0) {
          setSelectedTable(tableNames[0]);
        }

        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || '未知错误';
        // 常见错误提示
        let friendlyMsg = msg;
        if (
          msg.includes('file is not a database') ||
          msg.includes('not a database')
        ) {
          friendlyMsg = '该文件不是有效的 SQLite 数据库文件';
        } else if (msg.includes('disk image is malformed')) {
          friendlyMsg = 'SQLite 数据库文件已损坏';
        } else if (msg.includes('SQLITE_CORRUPT')) {
          friendlyMsg = 'SQLite 数据库已损坏';
        }
        setError(friendlyMsg);
        setLoading(false);
        onError?.(new Error(friendlyMsg));
      }
    }

    init();

    return () => {
      cancelled = true;
      // 组件卸载时关闭数据库释放内存
      if (dbInstance) {
        try {
          dbInstance.close();
        } catch {
          // 忽略关闭错误
        }
      }
    };
  }, [fileUrl, initialBuffer, onError]);

  /* ---- 加载选中表的数据 ---- */
  const loadTableData = useCallback(
    (tableName: string, pageNum: number) => {
      if (!db) return;

      try {
        // 获取总行数
        const countResult = db.exec(
          `SELECT COUNT(*) FROM "${tableName}"`
        );
        const total =
          countResult.length > 0
            ? Number(countResult[0].values[0][0])
            : 0;
        setTotalRows(total);

        // 获取列信息（PRAGMA table_info）
        const colResult = db.exec(`PRAGMA table_info("${tableName}")`);
        if (colResult.length > 0) {
          const colInfo: ColumnInfo[] = colResult[0].values.map(
            (row: any[]) => ({
              name: String(row[1]),
              type: String(row[2]),
              isPrimaryKey: Number(row[5]) > 0,
            })
          );
          setColumns(colInfo);
        } else {
          setColumns([]);
        }

        // 分页查询数据
        const offset = pageNum * PAGE_SIZE;
        const dataResult = db.exec(
          `SELECT * FROM "${tableName}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        );
        if (dataResult.length > 0) {
          setTableData(dataResult[0]);
        } else {
          // 空表
          setTableData({ columns: [], values: [] });
        }
      } catch (err: any) {
        console.error('加载表数据失败:', err);
        setTableData(null);
        setColumns([]);
        setTotalRows(0);
      }
    },
    [db]
  );

  /* ---- 选中表变化时加载数据 ---- */
  useEffect(() => {
    if (selectedTable && db) {
      setPage(0);
      loadTableData(selectedTable, 0);
    }
  }, [selectedTable, db, loadTableData]);

  /* ---- 翻页 ---- */
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (!selectedTable) return;
      setPage(newPage);
      loadTableData(selectedTable, newPage);
    },
    [selectedTable, loadTableData]
  );

  /* ---- 执行自定义SQL ---- */
  const executeSql = useCallback(() => {
    if (!db || !sqlQuery.trim()) return;

    try {
      setSqlError(null);
      const result = db.exec(sqlQuery.trim());
      if (result.length > 0) {
        setSqlResult(result[0]);
      } else {
        // INSERT/UPDATE/DELETE 等无结果集的语句
        setSqlResult({
          columns: ['影响行数'],
          values: [[db.getRowsModified()]],
        });
      }
    } catch (err: any) {
      setSqlError(err?.message || 'SQL 执行失败');
      setSqlResult(null);
    }
  }, [db, sqlQuery]);

  /* ---- 总页数 ---- */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalRows / PAGE_SIZE)),
    [totalRows]
  );

  /* ---- 加载中状态 ---- */
  if (loading) {
    return (
      <div
        className={`flex flex-col h-full min-h-0 ${className ?? ''}`}
      >
        {/* 工具栏 */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
            SQLITE
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        {/* 加载动画 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <p className="text-sm">正在加载 SQLite 数据库...</p>
          <p className="text-xs text-muted-foreground/50">
            首次加载需下载 sql.js WASM（约 1MB）
          </p>
        </div>
      </div>
    );
  }

  /* ---- 错误状态 ---- */
  if (error) {
    return (
      <div
        className={`flex flex-col h-full min-h-0 ${className ?? ''}`}
      >
        {/* 工具栏 */}
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
            SQLITE
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
            {fileName}
          </span>
        </div>
        {/* 错误信息 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-base font-medium text-foreground mb-2">
              无法打开 SQLite 数据库
            </h3>
            <p className="text-sm text-red-400 mb-1">{error}</p>
            <p className="text-xs text-muted-foreground/60">
              文件：{fileName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- 主界面 ---- */
  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      {/* 顶部工具栏 */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400">
          SQLITE
        </span>
        <button
          onClick={() => setShowSqlInput(!showSqlInput)}
          className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            showSqlInput
              ? 'bg-green-500/20 text-green-400'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
          title="切换 SQL 查询面板"
        >
          <Terminal className="w-3 h-3 inline mr-0.5" />
          SQL
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
          {fileName}
        </span>
      </div>

      {/* SQL 查询面板（可折叠） */}
      {showSqlInput && (
        <div className="shrink-0 border-b border-border/30 bg-[var(--color-secondary)]/50 p-2">
          <div className="flex gap-1.5">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder='输入 SQL 查询语句，如: SELECT * FROM "table_name" WHERE ...'
              className="flex-1 h-16 px-2 py-1 text-xs font-mono bg-background border border-border/50 rounded resize-none focus:outline-none focus:border-amber-400/50"
              onKeyDown={(e) => {
                // Ctrl+Enter 执行
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  executeSql();
                }
              }}
            />
            <button
              onClick={executeSql}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
              title="执行 SQL（Ctrl+Enter）"
            >
              <Play className="w-3 h-3" />
              执行
            </button>
          </div>
          {/* SQL 错误 */}
          {sqlError && (
            <div className="mt-1.5 px-2 py-1 text-xs text-red-400 bg-red-500/10 rounded font-mono">
              {sqlError}
            </div>
          )}
          {/* SQL 结果 */}
          {sqlResult && (
            <div className="mt-1.5 overflow-auto max-h-48 border border-border/30 rounded">
              <ResultTable result={sqlResult} isDark={isDark} />
            </div>
          )}
        </div>
      )}

      {/* 主内容区域：左侧表列表 + 右侧数据表格 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：表列表 */}
        <div className="w-48 shrink-0 border-r border-border/30 overflow-y-auto bg-[var(--color-secondary)]/30">
          <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/20">
            <DatabaseIcon className="w-3 h-3 inline mr-1" />
            表 ({tables.length})
          </div>
          {tables.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground/50 text-center">
              数据库中没有表
            </div>
          ) : (
            <div className="py-0.5">
              {tables.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTable(t)}
                  className={`w-full text-left px-2 py-1 text-xs transition-colors flex items-center gap-1 ${
                    selectedTable === t
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'text-muted-foreground hover:bg-muted/30'
                  }`}
                >
                  <Table2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：表结构 + 数据表格 */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {selectedTable ? (
            <>
              {/* 表结构信息栏 */}
              <div className="shrink-0 border-b border-border/30 bg-[var(--color-secondary)]/30 px-3 py-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <Columns3 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-medium text-foreground">
                    {selectedTable}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {totalRows} 行 · {columns.length} 列
                  </span>
                </div>
                {/* 列信息标签 */}
                <div className="flex flex-wrap gap-1">
                  {columns.map((col) => (
                    <span
                      key={col.name}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted/30 text-muted-foreground"
                    >
                      {col.isPrimaryKey && (
                        <span className="text-amber-400 font-bold">
                          🔑
                        </span>
                      )}
                      <span className="font-medium">{col.name}</span>
                      <span className="text-muted-foreground/50">
                        {col.type || 'TEXT'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 数据表格 */}
              <div className="flex-1 overflow-auto min-h-0">
                {tableData && tableData.columns.length > 0 ? (
                  <ResultTable result={tableData} isDark={isDark} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground/50 text-sm">
                    此表为空
                  </div>
                )}
              </div>

              {/* 分页控件 */}
              {totalPages > 1 && (
                <div className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 border-t border-border/30 bg-[var(--color-secondary)]/30">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 0}
                    className="p-0.5 rounded text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="上一页"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    第 {page + 1} / {totalPages} 页
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                    className="p-0.5 rounded text-muted-foreground hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="下一页"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] text-muted-foreground/50 ml-2">
                    {page * PAGE_SIZE + 1}-
                    {Math.min((page + 1) * PAGE_SIZE, totalRows)} /{' '}
                    {totalRows}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground/50 text-sm">
              选择左侧的表以查看数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  结果表格组件                                                        */
/* ------------------------------------------------------------------ */

interface ResultTableProps {
  /** 查询结果 */
  result: QueryResult;
  /** 是否暗色模式 */
  isDark: boolean;
}

/**
 * 渲染 SQL 查询结果为可滚动表格
 */
function ResultTable({ result, isDark }: ResultTableProps) {
  const { columns, values } = result;

  if (columns.length === 0) return null;

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr
          className={
            isDark
              ? 'bg-zinc-800/80'
              : 'bg-gray-100/80'
          }
        >
          {/* 行号列 */}
          <th
            className={`sticky top-0 px-2 py-1.5 text-left font-medium border-b border-border/30 ${
              isDark
                ? 'text-zinc-400 bg-zinc-800/80'
                : 'text-gray-500 bg-gray-100/80'
            }`}
            style={{ minWidth: '3rem' }}
          >
            #
          </th>
          {columns.map((col, i) => (
            <th
              key={i}
              className={`sticky top-0 px-2 py-1.5 text-left font-medium border-b border-border/30 ${
                isDark
                  ? 'text-zinc-300 bg-zinc-800/80'
                  : 'text-gray-700 bg-gray-100/80'
              }`}
              style={{ minWidth: '6rem' }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {values.map((row, rowIdx) => (
          <tr
            key={rowIdx}
            className={
              rowIdx % 2 === 0
                ? ''
                : isDark
                  ? 'bg-zinc-800/30'
                  : 'bg-gray-50/50'
            }
          >
            {/* 行号 */}
            <td
              className={`px-2 py-1 border-b border-border/10 font-mono ${
                isDark ? 'text-zinc-500' : 'text-gray-400'
              }`}
            >
              {rowIdx + 1}
            </td>
            {row.map((cell, colIdx) => (
              <td
                key={colIdx}
                className={`px-2 py-1 border-b border-border/10 max-w-[300px] truncate ${
                  isDark ? 'text-zinc-300' : 'text-gray-700'
                }`}
                title={
                  cell === null
                    ? 'NULL'
                    : cell === undefined
                      ? ''
                      : String(cell)
                }
              >
                {cell === null ? (
                  <span
                    className={
                      isDark ? 'text-zinc-500 italic' : 'text-gray-400 italic'
                    }
                  >
                    NULL
                  </span>
                ) : cell === undefined ? (
                  ''
                ) : (
                  String(cell)
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
