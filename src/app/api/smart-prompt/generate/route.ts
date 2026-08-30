import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/smart-prompt/generate
 * Auto-generate prompt fields using Xiaomi MiMo LLM.
 */

export async function POST(request: NextRequest) {
  try {
    const { task } = await request.json();

    if (!task || typeof task !== 'string' || task.trim().length < 3) {
      return NextResponse.json({ role: '', background: '', constraints: '', format: '' });
    }

    const apiKey = process.env.XIAOMI_API_KEY;
    if (!apiKey) {
      console.error('[smart-prompt] XIAOMI_API_KEY not set');
      return NextResponse.json(ruleBasedGenerate(task));
    }

    const systemPrompt = `你是prompt工程助手。用户给你一个任务描述，你需要推断其他4个字段。

严格输出JSON，不要任何其他文字。格式：
{"role":"...","background":"...","constraints":"...","format":"..."}

规则：
- role: 最适合的角色身份（一句话）
- background: 推断的技术背景（一句话，推断不出就空字符串）
- constraints: 合理约束（一句话，推断不出就空字符串）
- format: 输出格式要求（一句话，推断不出就空字符串）`;

    try {
      const res = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'mimo-v2.5-pro',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task.trim() },
          ],
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = extractJson(content);
        if (parsed) {
          return NextResponse.json(parsed);
        }
      }
    } catch (e) {
      console.error('[smart-prompt] LLM call failed:', e);
    }

    // Fallback to rule-based
    return NextResponse.json(ruleBasedGenerate(task));
  } catch {
    return NextResponse.json({ role: '', background: '', constraints: '', format: '' });
  }
}

function extractJson(text: string): { role: string; background: string; constraints: string; format: string } | null {
  try {
    let cleaned = text.trim();
    // Remove markdown code blocks
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        role: String(parsed.role || ''),
        background: String(parsed.background || ''),
        constraints: String(parsed.constraints || ''),
        format: String(parsed.format || ''),
      };
    }
  } catch {}
  
  // Try to find JSON in text
  const match = text.match(/\{[^{}]*"role"[^{}]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        role: String(parsed.role || ''),
        background: String(parsed.background || ''),
        constraints: String(parsed.constraints || ''),
        format: String(parsed.format || ''),
      };
    } catch {}
  }
  
  return null;
}

// Rule-based fallback
function ruleBasedGenerate(task: string) {
  const role = inferField(task, [
    [/分析|检查|诊断|排查/i, '技术分析师'],
    [/写|编写|生成|创建|开发|实现/i, '软件工程师'],
    [/设计|架构|规划/i, '系统架构师'],
    [/优化|性能|改进/i, '性能优化工程师'],
    [/测试|验证/i, '测试工程师'],
    [/部署|运维|配置/i, 'DevOps工程师'],
    [/文档|说明/i, '技术文档工程师'],
    [/安全|加密/i, '安全工程师'],
    [/数据|统计/i, '数据分析师'],
    [/UI|界面|前端/i, '前端工程师'],
    [/API|后端/i, '后端工程师'],
  ]);
  return { role, background: '', constraints: '', format: '' };
}

function inferField(task: string, patterns: [RegExp, string][]): string {
  for (const [regex, value] of patterns) {
    if (regex.test(task)) return value;
  }
  return '';
}
