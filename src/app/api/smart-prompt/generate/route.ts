'use client';

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/smart-prompt/generate
 * Auto-generate prompt fields from a task description.
 * Uses OpenSoul's LLM endpoint for quick generation.
 */
export async function POST(request: NextRequest) {
  try {
    const { task, context } = await request.json();

    if (!task || typeof task !== 'string' || task.trim().length < 5) {
      return NextResponse.json({ error: 'Task too short' }, { status: 400 });
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

    const systemPrompt = `你是一个prompt工程助手。根据用户输入的任务描述，自动生成结构化prompt的其他字段。

输出JSON格式：
{
  "role": "最适合完成这个任务的角色/专家身份",
  "background": "完成任务需要的背景信息（从任务描述推断）",
  "constraints": "合理的约束条件",
  "format": "合理的输出格式要求"
}

规则：
- 每个字段一句话即可，不要啰嗦
- 如果任务简单，字段可以留空字符串
- 不要编造不存在的上下文
- 只输出JSON，不要其他文字`;

    const userPrompt = context
      ? `任务：${task}\n\n当前上下文：${context}`
      : `任务：${task}`;

    // Call OpenSoul LLM endpoint
    const llmRes = await fetch(`${apiBase}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!llmRes.ok) {
      // Fallback: return empty fields
      return NextResponse.json({
        role: '',
        background: '',
        constraints: '',
        format: '',
      });
    }

    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content || llmData.content || '';

    // Parse JSON from response
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.split('\n', 1)[1].rsplit('```', 1)[0].trim();
      }
      const parsed = JSON.parse(cleaned);
      return NextResponse.json({
        role: parsed.role || '',
        background: parsed.background || '',
        constraints: parsed.constraints || '',
        format: parsed.format || '',
      });
    } catch {
      return NextResponse.json({
        role: '',
        background: '',
        constraints: '',
        format: '',
      });
    }
  } catch {
    return NextResponse.json({
      role: '',
      background: '',
      constraints: '',
      format: '',
    });
  }
}
