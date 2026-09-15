// 标题生成工具：从消息内容生成简洁标题
export async function generateChatTitle(message: string): Promise<string | null> {
  if (!message) return null;
  
  // 清理消息内容（去除markdown、代码块等）
  let cleaned = message
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/`[^`]*`/g, '') // 行内代码
    .replace(/#{1,6}\s/g, '') // 标题
    .replace(/\*\*([^*]*)\*\*/g, '$1') // 粗体
    .replace(/\*([^*]*)\*/g, '$1') // 斜体
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接
    .replace(/\n+/g, ' ') // 换行
    .trim();
  
  if (!cleaned) return null;
  
  // 取前50个字符作为标题
  const maxLen = 50;
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen) + '...';
  }
  
  return cleaned;
}
