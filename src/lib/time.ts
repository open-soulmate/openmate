/**
 * OpenSoulmate 全局时间工具
 * 见 docs/specs/29-Time-v1.0-全局时间规范.md
 *
 * 铁律：
 * - 业务时间 → ms UTC (Date.now())
 * - 前端高精度 → μs (performance.now())
 * - 展示 → 本地时区 + fractionalSecondDigits: 3
 */

// ── 业务时间（ms UTC）──────────────────────────────────

/** 业务标准时间戳（全局唯一业务时间源） */
export const getTimestamp = (): number => Date.now();

// ── 前端高精度（μs）────────────────────────────────────

/** 前端高精度耗时（微秒） */
export const getHRTime = (): number => performance.now() * 1000;

// ── 耗时计算 ──────────────────────────────────────────

/** 计算耗时（ms），输入为 getTimestamp() 的起始值 */
export function calcCostMs(startMs: number): number {
  return Date.now() - startMs;
}

/** 计算耗时（μs），输入为 getHRTime() 的起始值 */
export function calcCostUs(startUs: number): number {
  return getHRTime() - startUs;
}

// ── 展示格式化（本地时区 + 毫秒）────────────────────────

const ZH_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
};

/** 格式化为本地时间字符串（带毫秒），如 "2026/09/06 14:30:45.123" */
export function formatTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', ZH_FORMAT_OPTIONS);
}

/** 格式化为本地时间字符串（仅时分秒毫秒），如 "14:30:45.123" */
export function formatTimeShort(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

/** 格式化为 ISO 8601 UTC 字符串（数据库/日志用） */
export function toISOString(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toISOString();
}

/** UTC 毫秒时间戳 → 本地显示 */
export function tsToLocal(ts: number): string {
  return formatTime(ts);
}

/** 秒级时间戳（后端常见）→ 本地显示 */
export function secTsToLocal(ts: number): string {
  return formatTime(ts * 1000);
}
