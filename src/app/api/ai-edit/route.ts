import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai-edit
 * Generic AI edit endpoint for SelectionAIBar and BrowserAIControl.
 * Sends text + instruction to LLM, returns modified text.
 */

export async function POST(request: NextRequest) {
  try {
    const { text, instruction, context, mode } = await request.json();

    if (!text || !instruction) {
      return NextResponse.json({ error: 'Missing text or instruction' }, { status: 400 });
    }

    const apiKey = process.env.XIAOMI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'LLM API key not configured' }, { status: 500 });
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (mode === 'browser-action') {
      // Browser AI control mode - return action sequence
      systemPrompt = `你是一个网页操作助手。用户给你一个网页的DOM结构和操作指令，你需要返回一个操作序列。

严格输出JSON数组，不要任何其他文字。格式：
[{"type":"click|type|navigate|scroll|wait","selector":"CSS选择器","value":"输入的值或URL","description":"操作描述"}]

规则：
- type: click(点击)、type(输入)、navigate(跳转)、scroll(滚动)、wait(等待)
- selector: 有效的CSS选择器
- value: type操作时为输入内容，navigate时为URL，scroll时为滚动像素，wait时为毫秒数
- description: 中文描述这个操作做了什么
- 每个操作按执行顺序排列
- 如果需要等待页面加载，在操作间插入wait操作`;
      userPrompt = `网页信息：\n${context || ''}\n\n操作指令：${instruction}`;
    } else {
      // Text edit mode
      systemPrompt = `你是一个文本编辑助手。用户给你一段文字和修改指令，你需要返回修改后的文字。

规则：
- 只返回修改后的文字，不要加任何解释
- 不要加代码块标记
- 保持原文的格式和风格
- 如果是代码，保持缩进和语法正确`;
      userPrompt = `原文：\n${text}\n\n修改指令：${instruction}`;
    }

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
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[ai-edit] LLM API error:', err);
      return NextResponse.json({ error: 'LLM API call failed' }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (mode === 'browser-action') {
      // Parse JSON action array
      try {
        let cleaned = content.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        const actions = JSON.parse(cleaned);
        return NextResponse.json({ actions: Array.isArray(actions) ? actions : [actions] });
      } catch {
        // Try to find JSON array in text
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            const actions = JSON.parse(match[0]);
            return NextResponse.json({ actions });
          } catch {}
        }
        return NextResponse.json({ error: 'Failed to parse AI response', raw: content }, { status: 500 });
      }
    }

    // Text edit mode - return the modified text directly
    return NextResponse.json({ result: content.trim() });
  } catch (e) {
    console.error('[ai-edit] Error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
