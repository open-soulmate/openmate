# Mastra 深度架构分析

> **项目**: [mastra-ai/mastra](https://github.com/mastra-ai/mastra)
> **语言**: TypeScript
> **许可证**: Apache 2.0 + Mastra Enterprise License (ee/ 目录)
> **定位**: 现代 TypeScript AI 应用和 Agent 框架，从原型到生产的一站式解决方案
> **来源**: Y Combinator W25 批次项目

Mastra 是一个面向 TypeScript 生态的 AI Agent 框架，提供 Agent、Workflow、Tool、Memory、MCP Server 等完整能力。其架构以 `@mastra/core` 为核心，围绕 Agent-Tool-Workflow 三角关系构建，支持 40+ 模型提供商，提供 Human-in-the-loop、RAG、评估和可观测性等生产级特性。

---

## 1. Agent 核心架构

Mastra 的 Agent 是框架的中枢，继承自 `MastraBase`，整合了 LLM 调用、工具执行、记忆管理、信号系统和可观测性。

```typescript
// packages/core/src/agent/agent.ts
export type MastraLLM = MastraLLMV1 | MastraLLMVNext;

// Agent 配置接口核心字段
export interface AgentConfig {
  id: string;
  name: string;
  instructions: DynamicArgument<string>;  // 支持静态字符串或动态函数
  model: DynamicArgument<MastraModelConfig>;
  tools?: DynamicArgument<ToolsInput>;
  workflows?: DynamicArgument<Record<string, AnyWorkflow>>;
  memory?: AgentMemoryOption;
  voice?: MastraVoice;
  scorers?: DynamicArgument<MastraScorers>;
  processors?: {
    input?: InputProcessorOrWorkflow[];
    output?: OutputProcessorOrWorkflow[];
    error?: ErrorProcessorOrWorkflow[];
  };
}
```

Agent 支持两种 LLM 后端：`MastraLLMV1`（传统 AI SDK v2）和 `MastraLLMVNext`（AI SDK v5 循环模式），通过统一接口对外暴露 `generate()` 和 `stream()` 方法。Agent 内部维护一个 `MessageList` 管理对话历史，支持 Observational Memory（观察性记忆）让 Agent 行为连贯。

**关键设计**: Agent 的 `instructions` 支持 `DynamicArgument<string>`，即可以是静态字符串也可以是 `(args) => Promise<string>` 函数，实现运行时动态指令生成。

---

## 2. 工具系统（Tool System）

Mastra 的工具系统基于泛型 `Tool` 类实现，支持完整的输入/输出 Schema 验证、挂起/恢复、审批机制和 MCP 协议集成。

```typescript
// packages/core/src/tools/tool.ts
export const MASTRA_TOOL_MARKER = Symbol.for('mastra.core.tool.Tool');

export class Tool<
  TSchemaIn = unknown,
  TSchemaOut = unknown,
  TSuspendSchema = unknown,
  TResumeSchema = unknown,
  TContext extends ToolExecutionContext = ToolExecutionContext<TSuspendSchema, TResumeSchema>,
  TId extends string = string,
  TRequestContext extends Record<string, any> | unknown = unknown,
> implements ToolAction {
  id: TId;
  description: string;
  inputSchema?: StandardSchemaWithJSON;
  outputSchema?: StandardSchemaWithJSON;
  suspendSchema?: StandardSchemaWithJSON;
  resumeSchema?: StandardSchemaWithJSON;
  execute?: ToolAction['execute'];
  mastra?: Mastra;
  requireApproval?: boolean | ((params: any) => Promise<boolean>);
  needsApprovalFn?: NeedsApprovalFn;
  strict?: boolean;
  providerOptions?: Record<string, Record<string, any>>;
  toModelOutput?: (output: TSchemaOut) => unknown;
  transform?: ToolPayloadTransform;
  mcp?: MCPToolProperties;
  background?: ToolBackgroundConfig;
}
```

**工厂函数 `createTool`** 是创建工具的推荐方式：

```typescript
// packages/core/src/tools/tool.ts
export function createTool<
  TId extends string = string,
  TInputSchema extends SchemaLike = undefined,
  TOutputSchema extends SchemaLike = undefined,
  TSuspendSchema extends SchemaLike = undefined,
  TResumeSchema extends SchemaLike = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
  TContext extends ToolExecutionContext = ToolExecutionContext<...>,
>(opts: CreateToolOpts): Tool<...> {
  return new Tool(opts);
}
```

**设计亮点**：
- 使用 `Symbol.for('mastra.core.tool.Tool')` 作为标记，即使在 Vite SSR 等模块重复加载环境下也能正确识别工具实例
- `requireApproval` 支持布尔值或异步谓词函数，实现条件审批
- `toModelOutput` 允许将原始输出转换为模型友好的格式，应用逻辑仍可获取原始结果
- `background` 配置支持工具在后台执行，Agent 对话不阻塞

---

## 3. Workflow 引擎

Mastra 的 Workflow 引擎是一个图执行引擎，支持链式、分支、并行、循环等控制流，以及挂起/恢复（Human-in-the-loop）。

```typescript
// packages/core/src/workflows/workflow.ts
// 控制流 API 示例
workflow
  .then(step1)
  .branch(conditionFn, [branchA, branchB])
  .parallel([step2, step3])
  .dowhile(loopStep, conditionFn)
  .dountil(loopStep, conditionFn)
  .foreach(items, step);
```

Workflow 的执行核心在 `DefaultExecutionEngine`，通过 `ExecutionGraph` 描述执行拓扑：

```typescript
// packages/core/src/workflows/workflow.ts
const result = await this.executionEngine.execute<WorkflowResult>({
  workflowId: this.workflowId,
  runId: this.runId,
  resourceId: this.resourceId,
  graph: this.executionGraph,
  serializedStepGraph: this.serializedStepGraph,
  input: inputDataToUse,
  initialState: initialStateToUse,
  pubsub: this.pubsub,
  retryConfig: this.retryConfig,
  requestContext: requestContext ?? new RequestContext(),
  abortController: this.abortController,
  outputWriter,
  workflowSpan,
  format,
  outputOptions,
  perStep,
});
```

Workflow 支持两种执行模式：`start()`（同步等待完成）和 `startAsync()`（立即返回 runId，后台执行）。

---

## 4. Step 抽象与工厂

Step 是 Workflow 的最小执行单元，每个 Step 定义输入/输出 Schema 和执行函数。

```typescript
// packages/core/src/workflows/step.ts
export interface Step<
  TStepId extends string = string,
  TState = unknown,
  TInput = unknown,
  TOutput = unknown,
  TResume = unknown,
  TSuspend = unknown,
  TEngineType = any,
  TRequestContext extends Record<string, any> | unknown = unknown,
> {
  id: TStepId;
  description?: string;
  inputSchema: StandardSchemaWithJSON<TInput>;
  outputSchema: StandardSchemaWithJSON<TOutput>;
  resumeSchema?: StandardSchemaWithJSON<TResume>;
  suspendSchema?: StandardSchemaWithJSON<TSuspend>;
  stateSchema?: StandardSchemaWithJSON<TState>;
  execute: ExecuteFunction<TState, TInput, TOutput, TResume, TSuspend, TEngineType, TRequestContext>;
  scorers?: DynamicArgument<MastraScorers>;
  retries?: number;
}
```

Mastra 提供三个工厂函数将不同类型的原语转换为 Step：

```typescript
// packages/core/src/workflows/step-factories.ts
// Agent → Step
export function createStepFromAgent<TStepId extends string, TStepOutput>(
  params: SubAgent<TStepId, any> | Agent<TStepId, any, any>,
  agentOrToolOptions?: AgentStepOptions<TStepOutput>,
): Step<TStepId, unknown, { prompt: string }, TStepOutput, ...>

// Tool → Step
export function createStepFromTool<TStepInput, TSuspend, TResume, TStepOutput>(
  params: ToolStep<TStepInput, TSuspend, TResume, TStepOutput, any>,
  toolOpts?: { retries?: number; scorers?: DynamicArgument<MastraScorers> },
): Step<string, any, TStepInput, TStepOutput, TSuspend, TResume, ...>

// Mapping → Step（数据映射步骤）
export function createMappingStep(
  id: string,
  mappingConfig: MappingConfig | ExecuteFunction<...>,
): Step<string, any, any, any, any, any, DefaultEngineType>
```

**设计哲学**: Agent、Tool、Mapping 都可以作为 Step 嵌入 Workflow，实现 Agent-Workflow 统一编排。

---

## 5. Mastra 核心容器

`Mastra` 类是整个框架的 DI 容器和注册中心，管理所有 Agent、Tool、Workflow、Storage、Vector、Scorer 等组件。

```typescript
// packages/core/src/mastra/index.ts
export interface Config<
  TAgents extends Record<string, Agent<any>> = Record<string, Agent<any>>,
  TWorkflows extends Record<string, AnyWorkflow> = Record<string, AnyWorkflow>,
  // ...更多泛型参数
> {
  agents?: TAgents;
  workflows?: TWorkflows;
  storage?: MastraCompositeStore;
  vectors?: Record<string, MastraVector>;
  tts?: Record<string, MastraTTS>;
  logger?: IMastraLogger;
  scorers?: Record<string, MastraScorer>;
  mcpServers?: Record<string, MCPServerBase>;
  processors?: Record<string, Processor>;
  schedulers?: SchedulesConfig;
  backgroundTasks?: BackgroundTaskManagerConfig;
  idGenerator?: MastraIdGenerator;
  editor?: IMastraEditor;
  channels?: Record<string, ChannelProvider>;
  versions?: VersionOverrides;
}
```

Mastra 提供 `addAgent()`、`addWorkflow()`、`addTool()` 等方法动态注册组件，所有组件通过 `getAgent()`、`getWorkflow()` 等方法按名获取。

**核心职责**：
- 统一生命周期管理（Agent/Workflow/Tool 注册与发现）
- Storage 抽象层（支持 PostgreSQL、LibSQL 等）
- 可观测性集成（tracing、logging、metrics）
- 调度系统（cron-like schedules for agents and workflows）
- MCP Server 暴露

---

## 6. Human-in-the-Loop 机制

Mastra 的挂起/恢复是其最独特的架构特性之一。Workflow 和 Agent 都支持 `suspend()` 暂停执行，等待外部输入后恢复。

```typescript
// packages/core/src/workflows/step.ts
export type SuspendOptions = {
  resumeLabel?: string | string[];
} & Record<string, any>;

// 执行函数参数中的 suspend/bail 方法
export type ExecuteFunctionParams<...> = {
  suspend: (suspendPayload?: TSuspend, suspendOptions?: SuspendOptions) => InnerOutput | Promise<InnerOutput>;
  bail(result: TStepOutput): InnerOutput;  // 提前终止并返回结果
  abort(): void;                           // 中止整个工作流
  resume?: { steps: string[]; resumePayload: TResume }; // 恢复时的数据
};
```

Agent 的 resume 通过快照机制实现：

```typescript
// packages/core/src/agent/agent.ts
async #loadAgenticLoopSnapshotOrThrow({ runId, method }: { runId: string; method: string }) {
  const effectiveMastra = this.#mastra ?? (await this.#getOrCreateEphemeralMastra());
  const workflowsStore = await effectiveMastra?.getStorage()?.getStore('workflows');
  const existingSnapshot = await waitForSuspendedSnapshot(workflowsStore, 'agentic-loop', runId, {
    missingSnapshotGraceReads: 3,
  });
  if (!existingSnapshot) {
    throw new MastraError({
      id: 'AGENT_RESUME_NO_SNAPSHOT_FOUND',
      // ...
    });
  }
  return existingSnapshot;
}
```

**架构意义**: 挂起状态通过 Storage 持久化，支持无限期暂停，跨进程恢复。这使得长时间运行的 Agent 任务（如需要人工审批）可以在任意时间点恢复执行。

---

## 7. 委托与子 Agent 系统（Delegation）

Mastra 实现了完整的 Agent 委托机制，支持父 Agent 调用子 Agent 或 Workflow，并通过生命周期钩子控制委托行为。

```typescript
// packages/core/src/agent/agent.types.ts
export interface DelegationStartContext {
  primitiveId: string;
  primitiveType: 'agent' | 'workflow';
  prompt: string;
  params: { threadId?: string; resourceId?: string; instructions?: string; maxSteps?: number };
  iteration: number;
  runId: string;
  parentAgentId: string;
  parentAgentName: string;
  toolCallId: string;
  messages: MastraDBMessage[];
  requestContext: RequestContext;
}

export interface DelegationStartResult {
  proceed?: boolean;              // 是否继续委托
  rejectionReason?: string;       // 拒绝原因
  modifiedPrompt?: string;        // 修改后的 prompt
  modifiedInstructions?: string;  // 修改后的指令
  modifiedMaxSteps?: number;      // 修改后的最大步数
}

export interface DelegationConfig {
  onDelegationStart?: OnDelegationStartHandler;
  onDelegationComplete?: OnDelegationCompleteHandler;
  messageFilter?: (context: MessageFilterContext) => MastraDBMessage[] | Promise<MastraDBMessage[]>;
  hookErrorStrategy?: 'throw' | 'log' | 'ignore';
}
```

**关键设计**: `messageFilter` 允许父 Agent 控制哪些历史消息传递给子 Agent，避免上下文污染。`onDelegationComplete` 的 `bail()` 方法支持在并发工具调用中，当某个子 Agent 完成后中止其他正在执行的委托。

---

## 8. 信号系统与发布/订阅

Mastra 内置了 `PubSub` 事件总线，用于组件间通信，支持 Agent 信号、目标信号、通知信号等。

```typescript
// packages/core/src/agent/agent.ts 中的信号相关导入
import type { SignalProvider } from '../signals/signal-provider';
import type { CreatedAgentSignal } from './signals';
import { GoalSignalProvider, resolveGoalStore, readObjective, writeObjective, clearObjective } from './goal';

// 信号类型定义
export type AgentSignalType = 'state' | 'notification' | 'goal';

// Agent 可以发送和接收信号
export interface SendAgentSignalOptions {
  targetAgentId: string;
  signal: AgentSignal;
  threadId?: string;
  resourceId?: string;
}

export interface SendAgentNotificationSignalOptions {
  targetAgentId: string;
  signal: AgentStateSignalInput;
  deliveryPolicy?: NotificationDeliveryPolicyInput;
}
```

Agent 还支持 **Goal（目标）系统**，通过 `GoalSignalProvider` 追踪目标完成进度，支持 Agent 自主判断任务是否完成。

---

## 9. 可观测性与评估

Mastra 内置了完整的可观测性体系，包括分布式追踪、日志、指标和 Agent 评估（Evals）。

```typescript
// packages/core/src/agent/agent.ts 中的可观测性集成
import type { ObservabilityContext, Span, TracingOptions, TracingPolicy } from '../observability';
import {
  EntityType,
  SpanType,
  createObservabilityContext,
  getOrCreateSpan,
  getRootExportSpan,
  resolveObservabilityContext,
} from '../observability';

// Agent 执行选项中的评估配置
export type AgentExecutionOptionsBase<OUTPUT> = {
  scorers?: DynamicArgument<MastraScorers>;
  tracingOptions?: TracingOptions;
  // ...
};

// 评分采样配置
export interface ScoringSamplingConfig {
  rate: number;           // 采样率 0-1
  strategy?: 'random' | 'always-first';
}
```

Mastra 的评估系统支持在 Agent 执行后自动运行评分器（Scorer），通过 `scoringSamplingConfig` 控制采样率以降低评估成本。评分结果与可观测性系统集成，可追溯到具体运行。

---

## 10. 流式处理与并发控制

Mastra 的流式架构支持实时输出、后台任务持续化和并发工具调用控制。

```typescript
// packages/core/src/agent/agent.ts
// stream() 方法支持 untilIdle 模式，保持流开放直到所有后台任务完成
export type AgentStreamOptions = {
  untilIdle?: boolean | { maxIdleMs?: number };
  _skipBgTaskWait?: boolean;
  // ...
};

// 并发工具调用控制
export type ToolCallConcurrency = {
  maxConcurrent?: number;  // 最大并发工具调用数
};

// 迭代钩子支持中断循环
export interface IterationCompleteContext {
  iteration: number;
  maxIterations?: number;
  text: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  toolResults: Array<{ id: string; name: string; result: unknown; error?: Error }>;
  isFinal: boolean;
  finishReason: string;
}

export interface IterationCompleteResult {
  continue?: boolean;   // true=继续, false=强制停止, undefined=让模型决定
  feedback?: string;    // 注入到下一轮迭代前的反馈消息
}
```

**后台任务系统**: Tool 可以通过 `background` 配置在后台执行，Agent 的 `untilIdle` 模式会在后台任务完成后自动重新调用 LLM，将结果流式输出到同一个 `fullStream`，实现异步任务的无缝集成。

**TripWire 安全机制**: Mastra 提供 `TripWire` 类用于在 Agent 执行中触发安全熔断，当检测到不安全行为时立即终止执行。

---

## 架构总结

Mastra 的核心架构特征：

| 维度 | 设计选择 | 优势 |
|------|---------|------|
| 语言 | 纯 TypeScript | 类型安全、与前端生态无缝集成 |
| Agent 模型 | LLM + Tools + Memory 三角 | 灵活组合，支持复杂推理 |
| Workflow | 图执行引擎 + 链式 API | 声明式控制流，易于理解和调试 |
| 工具系统 | 泛型 Tool + Symbol 标记 | 跨模块边界可靠识别 |
| 挂起恢复 | Storage 持久化快照 | 无限期暂停，跨进程恢复 |
| 委托机制 | 生命周期钩子 + 消息过滤 | 精细控制子 Agent 行为 |
| 可观测性 | 内置 tracing + evals | 生产级监控和质量保证 |
| 流式处理 | untilIdle + 后台任务 | 异步任务无缝流式集成 |

Mastra 的设计哲学是 **"TypeScript-first, production-ready"** — 不只是 Agent 框架，而是完整的 AI 应用开发平台，从模型路由、Agent 编排到生产监控的全链路覆盖。
