# 19. Vercel AI SDK 架构深度分析

> **版本**: AI SDK v7.0.99 | **许可证**: Apache-2.0 | **仓库**: [vercel/ai](https://github.com/vercel/ai)
> **分析日期**: 2026-09-13

## 概述

Vercel AI SDK 是由 Next.js 团队打造的 **Provider 无关的 TypeScript AI 工具包**，提供统一 API 对接 OpenAI、Anthropic、Google 等 25+ 模型提供商。其核心设计理念是**三层抽象**：Core 层（generateText/streamText）、Provider 层（统一语言模型规范）、UI 层（框架无关的 React/Svelte/Vue hooks）。本文从 10 个维度深入剖析其架构设计。

---

## 1. 统一 Provider 架构

AI SDK 的核心创新是定义了一套 **Language Model Specification（语言模型规范）**，所有 Provider 必须实现该规范接口。通过 `@ai-sdk/provider` 包发布规范，`@ai-sdk/provider-utils` 提供工具函数，各 Provider 包（如 `@ai-sdk/openai`）实现具体适配。

```typescript
// packages/ai/src/model/resolve-model.ts
// 模型解析：字符串 → Provider 实例 → LanguageModel
import type { LanguageModel } from '../types';

// 支持两种使用方式：
// 1. 字符串形式：model: 'openai/gpt-5.4'（通过 Vercel AI Gateway）
// 2. Provider 实例：model: openai('gpt-5.4')（直连 Provider）
export function resolveLanguageModel(model: LanguageModel | string): LanguageModel {
  // 字符串通过 Gateway 路由，对象直接使用
}
```

**架构意义**：开发者可以一行代码切换 Provider，无需修改业务逻辑。Gateway 模式更是将 Provider 选择从代码层提升到配置层。

---

## 2. generateText 核心生成引擎

`generateText` 是整个 SDK 的核心函数，实现了**多步骤工具循环（Tool Loop）**。其签名展示了庞大的参数体系：

```typescript
// packages/ai/src/generate-text/generate-text.ts
const originalGenerateId = createIdGenerator({
  prefix: 'aitxt',
  size: 24,
});

const originalGenerateCallId = createIdGenerator({
  prefix: 'call',
  size: 24,
});

/**
 * Generate a text and call tools for a given prompt using a language model.
 *
 * @param model - The language model to use.
 * @param tools - Tools that are accessible to and can be called by the model.
 * @param toolChoice - The tool choice strategy. Default: 'auto'.
 * @param system - A system message that will be part of the prompt.
 * @param prompt - A simple text prompt.
 * @param messages - A list of messages.
 * @param maxOutputTokens - Maximum number of tokens to generate.
 * @param temperature - Temperature setting.
 * @param stopWhen - Stop condition for multi-step tool loops.
 */
```

该函数的内部流程：
1. **Prompt 标准化**：`standardizePrompt()` 统一 `prompt`/`messages`/`system` 为内部格式
2. **工具准备**：`prepareTools()` 将 ToolSet 转为 Provider 可理解的格式
3. **模型调用**：通过 `LanguageModelV4` 接口调用 Provider
4. **工具执行循环**：解析 tool_call → 执行 → 将结果注入消息 → 再次调用模型
5. **结果聚合**：返回 `GenerateTextResult` 含 text、toolCalls、usage、steps 等

---

## 3. 工具系统（Tool System）

工具系统采用 **Zod Schema 驱动** 的类型安全设计，支持四种工具类型：

```typescript
// packages/ai/src/prompt/content-part.ts - 工具调用部分
export interface ToolCallPart {
  type: 'tool-call';
  /** ID of the tool call. This ID is used to match the tool call with the tool result. */
  toolCallId: string;
  /** Name of the tool that is being called. */
  toolName: string;
  /** Arguments of the tool call. This is a JSON-serializable object. */
  input: unknown;
  /** Additional provider-specific metadata. */
  providerOptions?: ProviderOptions;
}

export const toolCallPartSchema: ZodType<ToolCallPart> = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  providerOptions: providerMetadataSchema.optional(),
  providerExecuted: z.boolean().optional(),
});
```

工具定义通过 `tool()` 辅助函数实现类型推断：

```typescript
// 来自文档 - 工具定义模式
import { tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});
```

四种工具类型：**Function Tool**（自定义）、**Dynamic Tool**（运行时加载，如 MCP）、**Provider Tool**（Provider 内置，如 imageGeneration）、**Tool Caller**（外部调用器）。

---

## 4. 消息与内容类型系统

消息系统采用 **Discriminated Union** 模式，通过 `role` 字段区分四种消息类型：

```typescript
// packages/ai/src/prompt/message.ts
export const systemModelMessageSchema: ZodType<SystemModelMessage> = z.object({
  role: z.literal('system'),
  content: z.string(),
  providerOptions: providerMetadataSchema.optional(),
});

export const userModelMessageSchema: ZodType<UserModelMessage> = z.object({
  role: z.literal('user'),
  content: z.union([
    z.string(),
    z.array(z.union([textPartSchema, imagePartSchema, filePartSchema])),
  ]),
  providerOptions: providerMetadataSchema.optional(),
});

export const assistantModelMessageSchema: ZodType<AssistantModelMessage> = z.object({
  role: z.literal('assistant'),
  content: z.union([
    z.string(),
    z.array(z.union([
      textPartSchema, customPartSchema, filePartSchema,
      reasoningPartSchema, reasoningFilePartSchema,
      toolCallPartSchema, toolResultPartSchema,
      toolApprovalRequestSchema,
    ])),
  ]),
  providerOptions: providerMetadataSchema.optional(),
});

export const toolModelMessageSchema: ZodType<ToolModelMessage> = z.object({
  role: z.literal('tool'),
  content: z.array(z.union([toolResultPartSchema, toolApprovalResponseSchema])),
  providerOptions: providerMetadataSchema.optional(),
});

// 联合类型
export const modelMessageSchema: ZodType<ModelMessage> = z.union([
  systemModelMessageSchema,
  userModelMessageSchema,
  assistantModelMessageSchema,
  toolModelMessageSchema,
]);
```

内容部分（Content Part）支持丰富的多模态类型：`text`、`image`（已废弃）、`file`、`reasoning`、`reasoning-file`、`custom`、`tool-call`、`tool-result`。每种类型都有对应的 Zod Schema 做运行时验证。

---

## 5. 工具执行引擎

工具执行是 Agent 循环的核心，`executeToolCall` 函数管理完整的工具生命周期：

```typescript
// packages/ai/src/generate-text/execute-tool-call.ts
export async function executeToolCall<TOOLS extends ToolSet>({
  toolCall, tools, toolsContext, callId, messages,
  abortSignal, timeout, experimental_sandbox: sandbox,
  onPreliminaryToolResult, onToolExecutionStart, onToolExecutionEnd,
  executeToolInTelemetryContext, runInTracingChannelSpan,
}: { /* ... */ }): Promise<
  { output: ToolOutput<TOOLS>; toolExecutionMs: number } | undefined
> {
  const { toolName, toolCallId, input } = toolCall;
  const tool = getOwn(tools, toolName);

  if (!isExecutableTool(tool)) {
    return undefined;  // 工具无 execute 函数，跳过
  }

  // 1. 验证工具上下文
  const context = await validateToolContext({
    toolName,
    context: getOwn(toolsContext, toolName),
    contextSchema: tool.contextSchema,
  });

  // 2. 触发 onStart 回调
  await notify({
    event: baseCallbackEvent as ToolExecutionStartEvent<TOOLS>,
    callbacks: onToolExecutionStart,
  });

  // 3. 执行工具（支持流式输出）
  const stream = executeTool({
    tool,
    input: input as InferToolInput<typeof tool>,
    options: {
      toolCallId, messages,
      abortSignal: toolAbortSignal,
      context, experimental_sandbox: sandbox,
    },
  });

  for await (const part of stream) {
    if (part.type === 'preliminary') {
      onPreliminaryToolResult?.({ /* 流式中间结果 */ });
    } else {
      output = part.output;  // 最终结果
    }
  }

  // 4. 触发 onEnd 回调（含性能指标）
  await notify({
    event: { ...baseCallbackEvent, toolOutput: toolResult, toolExecutionMs },
    callbacks: onToolExecutionEnd,
  });
}
```

关键设计：
- **流式工具输出**：工具可以产出 `preliminary` 中间结果（如图像生成的 partialImages）
- **超时控制**：每个工具可独立配置超时（`getToolTimeoutMs`）
- **遥测集成**：通过 `runInTracingChannelSpan` 支持分布式追踪
- **沙箱支持**：`experimental_sandbox` 参数传递执行环境

---

## 6. ToolLoopAgent — Agent 抽象

`ToolLoopAgent` 是 SDK 的 Agent 抽象，封装了工具循环的完整逻辑：

```typescript
// packages/ai/src/agent/tool-loop-agent.ts
/**
 * A tool loop agent runs tools in a loop. In each step,
 * it calls the LLM, and if there are tool calls, it executes the tools
 * and calls the LLM again in a new step with the tool results.
 *
 * The loop continues until:
 * - A finish reason other than tool-calls is returned, or
 * - A tool that is invoked does not have an execute function, or
 * - A tool call needs approval, or
 * - A stop condition is met (default: isStepCount(20))
 */
export class ToolLoopAgent<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> implements Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly version = 'agent-v1';

  private readonly settings: ToolLoopAgentSettings</* ... */>;

  constructor(settings: ToolLoopAgentSettings</* ... */>) {
    const { onFinish, onEnd = onFinish } = settings;
    this.settings = { ...settings, onEnd };
  }

  /** 非流式生成 */
  async generate({ abortSignal, timeout, experimental_sandbox, ...options }
  ): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>> {
    const preparedCall = await this.prepareCall({ ...options });
    return await generateText({
      ...preparedCall,
      ...callbackArgs,
      headers: this.agentHeaders(preparedCall),
    });
  }

  /** 流式生成 */
  async stream({ abortSignal, timeout, experimental_sandbox, ...options }
  ): Promise<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>> {
    const preparedCall = await this.prepareCall({ ...options });
    return await streamText({
      ...preparedCall,
      ...callbackArgs,
      headers: this.agentHeaders(preparedCall),
    });
  }
}
```

Agent 接口定义了标准化的 `generate` 和 `stream` 方法，支持：
- **CALL_OPTIONS**：类型安全的运行时配置
- **TOOLS**：工具集类型推断
- **RUNTIME_CONTEXT**：运行时上下文（租户、项目等）
- **OUTPUT**：结构化输出类型

---

## 7. Prompt 工程与标准化

Prompt 系统支持三种输入模式，通过 `standardizePrompt` 统一转换：

```typescript
// packages/ai/src/prompt/prompt.ts - Prompt 类型定义
// 支持三种模式：
// 1. prompt: string — 简单文本
// 2. prompt: Array<ModelMessage> — 消息数组
// 3. messages: Array<ModelMessage> — 对话历史

// packages/ai/src/prompt/standardize-prompt.ts
// 将用户输入统一转换为内部 Prompt 格式
```

Provider Options 支持三层粒度控制：

```typescript
// 函数级
const { text } = await generateText({
  model: azure('your-deployment-name'),
  providerOptions: { openai: { reasoningEffort: 'low' } },
});

// 消息级
const result = await generateText({
  model: anthropic('claude-sonnet-4.5'),
  system: {
    role: 'system',
    content: 'Cached system message',
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  },
  prompt: 'Hello',
});

// 部分级（Part-level）
const messages: ModelMessage[] = [{
  role: 'user',
  content: [{ type: 'text', text: 'Hello', providerOptions: { ... } }],
}];
```

---

## 8. 流式架构

`streamText` 是 `generateText` 的流式对应物，返回 `StreamTextResult`：

```typescript
// 来自 README - 流式使用模式
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
    messages,
  });
  return result.toDataStreamResponse();
}
```

流式架构的关键特性：
- **分块传输**：通过 `toDataStreamResponse()` 转为 SSE 流
- **工具流式输出**：工具的 `preliminary` 结果可实时推送
- **性能指标**：`effectiveOutputTokensPerSecond`、`timeToFirstOutputMs`、`timeBetweenOutputChunksMs`
- **超时控制**：`firstChunkTimeoutMs`、`chunkTimeoutMs`、`stepTimeoutMs`、`totalTimeoutMs`

---

## 9. UI 集成层

AI SDK 的 UI 层提供框架无关的 hooks，将 Agent 状态映射到前端：

```typescript
// 来自 README - 完整 UI 集成模式
// 定义 Agent
const imageGenerationAgent = new ToolLoopAgent({
  model: openai('gpt-5.4'),
  tools: {
    generateImage: openai.tools.imageGeneration({ partialImages: 3 }),
  },
});
export type ImageGenerationAgentMessage = InferAgentUIMessage<typeof imageGenerationAgent>;

// Route Handler
export async function POST(req: Request) {
  const { messages } = await req.json();
  return createAgentUIStreamResponse({
    agent: imageGenerationAgent,
    messages,
  });
}

// UI 组件 - 工具状态驱动渲染
export default function ImageGenerationView({
  invocation,
}: { invocation: UIToolInvocation<ReturnType<typeof openai.tools.imageGeneration>> }) {
  switch (invocation.state) {
    case 'input-available':
      return <div>Generating image...</div>;
    case 'output-available':
      return <img src={`data:image/png;base64,${invocation.output.result}`} />;
  }
}

// 页面 - useChat Hook
const { messages, status, sendMessage } = useChat<ImageGenerationAgentMessage>();
// messages.parts 自动映射到 type: 'text' | 'tool-generateImage' 等
```

`InferAgentUIMessage` 类型工具从 Agent 定义自动推断 UI 消息类型，实现**端到端类型安全**。

---

## 10. 工具审批与安全机制

SDK 内置了工具审批（Tool Approval）机制，支持人工审核敏感操作：

```typescript
// packages/ai/src/prompt/content-part.ts - 审批相关类型
export interface ToolApprovalRequest {
  type: 'tool-approval-request';
  // ...审批请求字段
}

export interface ToolApprovalResponse {
  type: 'tool-approval-response';
  // ...审批响应字段
}

// assistant 消息可包含审批请求
export const assistantModelMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.union([
    z.string(),
    z.array(z.union([
      textPartSchema, toolCallPartSchema,
      toolApprovalRequestSchema,  // ← 审批请求
      // ...
    ])),
  ]),
});

// tool 消息可包含审批响应
export const toolModelMessageSchema = z.object({
  role: z.literal('tool'),
  content: z.array(z.union([toolResultPartSchema, toolApprovalResponseSchema])),
});
```

审批流程：
1. 模型生成 tool-call → SDK 检查是否需要审批
2. 若需要 → 生成 `tool-approval-request`，暂停执行
3. 用户/策略引擎审批 → 返回 `tool-approval-response`
4. SDK 根据审批结果决定是否执行

还支持 **OPA（Open Policy Agent）** 策略引擎（`@ai-sdk/policy-opa`），将审批规则代码化。

---

## 架构总结

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer                                │
│  useChat() / useCompletion() / @ai-sdk/react,svelte,vue     │
├─────────────────────────────────────────────────────────────┤
│                    Agent Layer                               │
│  ToolLoopAgent → generate() / stream()                       │
│  Agent Interface (agent-v1) / Subagents / WorkflowAgent      │
├─────────────────────────────────────────────────────────────┤
│                    Core Layer                                │
│  generateText / streamText / generateObject / streamObject   │
│  Tool Loop Engine / Stop Conditions / Telemetry              │
├─────────────────────────────────────────────────────────────┤
│                   Prompt Layer                               │
│  ModelMessage / ContentPart / ProviderOptions                │
│  standardizePrompt / convertToLanguageModelPrompt            │
├─────────────────────────────────────────────────────────────┤
│                 Provider Layer                               │
│  @ai-sdk/provider (LanguageModelV4 Specification)            │
│  @ai-sdk/openai, anthropic, google, ... (Implementations)    │
│  Vercel AI Gateway (String-based routing)                    │
└─────────────────────────────────────────────────────────────┘
```

**核心设计哲学**：
1. **Provider 无关**：统一接口抽象，一行代码切换模型
2. **类型安全**：Zod Schema 运行时验证 + TypeScript 编译时推断
3. **组合优于继承**：Tool Loop、Stop Condition、PrepareStep 均可独立配置
4. **流式优先**：所有 API 同时提供同步和流式版本
5. **可观测性**：内置遥测、性能指标、工具执行追踪

**与 OpenMate/OpenSoul 的对比启示**：
- AI SDK 的 `ToolLoopAgent` 与 OpenSoul 的 Agent 循环概念一致，但 AI SDK 将工具审批内置于消息协议层
- AI SDK 的 Provider 抽象层值得借鉴——OpenMate 可定义类似的 `LanguageModelSpecification` 来支持多后端
- AI SDK 的 `InferAgentUIMessage` 类型推断模式可应用于 OpenMate 的前后端类型共享
