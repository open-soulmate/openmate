/**
 * sql.js 类型声明
 * sql.js 没有自带 TypeScript 类型，这里提供运行时所需的最小类型定义
 */

declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (buffer?: ArrayLike<number>) => Database;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface Database {
    exec(sql: string): QueryExecResult[];
    getRowsModified(): number;
    close(): void;
  }

  interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(
    config?: SqlJsConfig
  ): Promise<SqlJsStatic>;
}
