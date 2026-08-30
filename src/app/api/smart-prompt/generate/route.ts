import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/smart-prompt/generate
 * Auto-generate prompt fields from a task description using rule-based analysis.
 * No LLM dependency — instant response.
 */

// Role inference patterns
const ROLE_PATTERNS: [RegExp, string][] = [
  [/分析|检查|诊断|排查|debug/i, '技术分析师'],
  [/写|编写|生成|创建|开发|实现|做/i, '软件工程师'],
  [/设计|架构|规划/i, '系统架构师'],
  [/优化|性能|提速|改进/i, '性能优化工程师'],
  [/测试|验证|检查/i, '测试工程师'],
  [/部署|运维|配置|安装/i, 'DevOps工程师'],
  [/文档|说明|教程/i, '技术文档工程师'],
  [/翻译|转换|迁移/i, '技术迁移专家'],
  [/安全|加密|权限/i, '安全工程师'],
  [/数据|统计|报表/i, '数据分析师'],
  [/UI|界面|样式|布局|前端/i, '前端工程师'],
  [/API|接口|后端|服务/i, '后端工程师'],
  [/数据库|SQL|查询/i, '数据库工程师'],
  [/PPT|演示|汇报/i, '演示文稿设计师'],
  [/标书|投标|方案/i, '售前工程师'],
];

// Constraint inference patterns
const CONSTRAINT_PATTERNS: [RegExp, string][] = [
  [/不(能|要|许|可)改/i, '不能修改现有代码结构'],
  [/兼容/i, '保持向后兼容性'],
  [/快速|尽快|马上/i, '快速完成，优先可用性'],
  [/安全|加密/i, '确保安全性'],
  [/性能|速度/i, '注重性能优化'],
  [/移动端|手机/i, '移动端优先，响应式设计'],
  [/中文/i, '支持中文'],
  [/开源/i, '使用开源方案'],
];

// Format inference patterns
const FORMAT_PATTERNS: [RegExp, string][] = [
  [/代码|实现|函数/i, '给出完整代码实现'],
  [/步骤|流程/i, '分步骤说明'],
  [/对比|比较/i, '用表格对比'],
  [/方案|建议/i, '给出方案建议和理由'],
  [/修复|修|fix/i, '给出修复代码和原因说明'],
  [/解释|说明/i, '用通俗语言解释'],
  [/文档/i, 'Markdown格式文档'],
];

function inferField(task: string, patterns: [RegExp, string][]): string {
  const matches: string[] = [];
  for (const [regex, value] of patterns) {
    if (regex.test(task) && !matches.includes(value)) {
      matches.push(value);
    }
  }
  return matches.slice(0, 2).join('；');
}

function inferBackground(task: string): string {
  // Extract technology mentions
  const techs: string[] = [];
  const techPatterns: [RegExp, string][] = [
    [/React|Next\.?js|jsx|tsx/i, 'React/Next.js项目'],
    [/Vue|Nuxt/i, 'Vue项目'],
    [/Python|Django|Flask|FastAPI/i, 'Python项目'],
    [/Node|Express|Nest/i, 'Node.js项目'],
    [/Java|Spring/i, 'Java项目'],
    [/Go|Golang/i, 'Go项目'],
    [/Rust/i, 'Rust项目'],
    [/Docker|容器/i, 'Docker容器化环境'],
    [/Linux|Ubuntu|CentOS/i, 'Linux服务器环境'],
    [/MySQL|PostgreSQL|SQLite/i, '数据库环境'],
    [/TypeScript/i, 'TypeScript项目'],
    [/Tailwind|CSS/i, '使用Tailwind CSS'],
  ];
  for (const [regex, name] of techPatterns) {
    if (regex.test(task)) techs.push(name);
  }
  return techs.slice(0, 3).join('，') || '';
}

export async function POST(request: NextRequest) {
  try {
    const { task } = await request.json();

    if (!task || typeof task !== 'string' || task.trim().length < 5) {
      return NextResponse.json({ role: '', background: '', constraints: '', format: '' });
    }

    const result = {
      role: inferField(task, ROLE_PATTERNS),
      background: inferBackground(task),
      constraints: inferField(task, CONSTRAINT_PATTERNS),
      format: inferField(task, FORMAT_PATTERNS),
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ role: '', background: '', constraints: '', format: '' });
  }
}
