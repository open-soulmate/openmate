/**
 * Simple line-level diff for AI collaborative editing.
 * Returns changed regions with context lines.
 */
export function computeDiff(original: string, current: string, contextLines = 3): string {
  if (original === current) return '（无变更）';

  const origLines = original.split('\n');
  const currLines = current.split('\n');

  // Find first difference
  let start = 0;
  while (start < origLines.length && start < currLines.length && origLines[start] === currLines[start]) start++;

  // Find last difference
  let origEnd = origLines.length - 1;
  let currEnd = currLines.length - 1;
  while (origEnd >= start && currEnd >= start && origLines[origEnd] === currLines[currEnd]) { origEnd--; currEnd--; }

  // Add context
  const ctxStart = Math.max(0, start - contextLines);
  const origCtxEnd = Math.min(origLines.length, origEnd + contextLines + 1);
  const currCtxEnd = Math.min(currLines.length, currEnd + contextLines + 1);

  const parts: string[] = [];

  if (ctxStart > 0) parts.push(`... (第${ctxStart + 1}行)`);

  // Removed lines
  const removed = origLines.slice(Math.max(ctxStart, start), origCtxEnd);
  if (removed.length > 0) parts.push(removed.map(l => `- ${l}`).join('\n'));

  // Added lines
  const added = currLines.slice(Math.max(ctxStart, start), currCtxEnd);
  if (added.length > 0) parts.push(added.map(l => `+ ${l}`).join('\n'));

  if (currCtxEnd < currLines.length) parts.push(`... (共${currLines.length}行)`);

  return parts.join('\n');
}

/**
 * Build a prompt for AI collaboration that only sends the diff.
 */
export function buildDiffPrompt(
  original: string,
  current: string,
  fileName: string,
  instruction: string,
  langLabel: string = 'code',
): string {
  const diff = computeDiff(original, current);
  if (diff === '（无变更）') {
    return `当前文件 ${fileName} 的${langLabel}：\n\`\`\`\n${current}\n\`\`\`\n\n用户指令：${instruction}\n\n请返回完整的修改后代码。`;
  }
  return `当前文件 ${fileName} 用户已修改，变更如下：\n\`\`\`diff\n${diff}\n\`\`\`\n\n用户指令：${instruction}\n\n请返回完整的修改后代码。`;
}
