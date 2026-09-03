/**
 * 安全的剪贴板写入 — 兼容HTTP环境（navigator.clipboard不可用时用fallback）
 * @param text 要复制的文本
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // HTTP fallback: textarea + execCommand
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
