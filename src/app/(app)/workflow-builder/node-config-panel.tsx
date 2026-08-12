"use client";

import { useCallback } from "react";
import { useWorkflowStore, type WorkflowNodeData } from "@/stores/workflow-store";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeConfigPanelProps {
  nodeId: string;
  data: WorkflowNodeData;
  onClose: () => void;
}

export function NodeConfigPanel({ nodeId, data, onClose }: NodeConfigPanelProps) {
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const update = useCallback(
    (key: string, value: unknown) => updateNodeData(nodeId, { [key]: value }),
    [nodeId, updateNodeData],
  );

  const handleDelete = useCallback(() => {
    setNodes(nodes.filter((n) => n.id !== nodeId));
    setEdges(edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
    selectNode(null);
    onClose();
  }, [nodeId, nodes, edges, setNodes, setEdges, selectNode, onClose]);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <h3 className="text-xs font-medium text-foreground">节点配置</h3>
        <div className="flex items-center gap-1">
          {data.type !== "start" && (
            <button
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="删除节点"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Common: label + description */}
        <Field label="名称">
          <input
            value={data.label}
            onChange={(e) => update("label", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="描述">
          <textarea
            value={data.description || ""}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            className={cn(inputCls, "resize-none")}
          />
        </Field>

        {/* Type-specific */}
        {data.type === "start" && <StartConfig data={data} update={update} />}
        {data.type === "llm" && <LLMConfig data={data} update={update} />}
        {data.type === "tool" && <ToolConfig data={data} update={update} />}
        {data.type === "condition" && <ConditionConfig data={data} update={update} />}
        {data.type === "loop" && <LoopConfig data={data} update={update} />}
        {data.type === "code" && <CodeConfig data={data} update={update} />}
        {data.type === "knowledge" && <KnowledgeConfig data={data} update={update} />}
        {data.type === "end" && <EndConfig data={data} update={update} />}
      </div>
    </div>
  );
}

// ── Shared field wrapper ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// ── Type-specific configs ───────────────────────────────────────────────────

type ConfigProps = { data: WorkflowNodeData; update: (key: string, value: unknown) => void };

function StartConfig({ data, update }: ConfigProps) {
  return (
    <Field label="触发方式">
      <select
        value={data.triggerType || "manual"}
        onChange={(e) => update("triggerType", e.target.value)}
        className={inputCls}
      >
        <option value="manual">手动触发</option>
        <option value="schedule">定时触发</option>
        <option value="webhook">Webhook</option>
        <option value="event">事件触发</option>
      </select>
    </Field>
  );
}

const models = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-sonnet-4-20250514",
  "claude-haiku",
  "deepseek-chat",
  "qwen-plus",
  "glm-4",
];

function LLMConfig({ data, update }: ConfigProps) {
  return (
    <>
      <Field label="模型">
        <select
          value={data.model || "gpt-4o"}
          onChange={(e) => update("model", e.target.value)}
          className={inputCls}
        >
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="Prompt 模板">
        <textarea
          value={data.prompt || ""}
          onChange={(e) => update("prompt", e.target.value)}
          rows={5}
          placeholder="输入 Prompt，支持 {{variable}} 变量引用"
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
      <Field label="温度">
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={data.temperature ?? 0.7}
          onChange={(e) => update("temperature", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
      <Field label="最大 Token 数">
        <input
          type="number"
          min={1}
          max={128000}
          value={data.maxTokens ?? 4096}
          onChange={(e) => update("maxTokens", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function ToolConfig({ data, update }: ConfigProps) {
  return (
    <>
      <Field label="工具名称">
        <input
          value={data.toolName || ""}
          onChange={(e) => update("toolName", e.target.value)}
          placeholder="例如: web_search, read_file"
          className={inputCls}
        />
      </Field>
      <Field label="参数映射 (JSON)">
        <textarea
          value={data.toolParams ? JSON.stringify(data.toolParams, null, 2) : "{}"}
          onChange={(e) => {
            try {
              update("toolParams", JSON.parse(e.target.value));
            } catch { /* ignore parse errors while typing */ }
          }}
          rows={4}
          placeholder='{"key": "{{variable}}"}'
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
    </>
  );
}

function ConditionConfig({ data, update }: ConfigProps) {
  return (
    <Field label="条件表达式">
      <textarea
        value={data.condition || ""}
        onChange={(e) => update("condition", e.target.value)}
        rows={4}
        placeholder="例如: output.score > 0.8"
        className={cn(inputCls, "resize-none font-mono text-[11px]")}
      />
    </Field>
  );
}

function LoopConfig({ data, update }: ConfigProps) {
  return (
    <>
      <Field label="列表变量">
        <input
          value={data.listVariable || ""}
          onChange={(e) => update("listVariable", e.target.value)}
          placeholder="例如: items"
          className={inputCls}
        />
      </Field>
      <Field label="迭代变量名">
        <input
          value={data.itemVariable || ""}
          onChange={(e) => update("itemVariable", e.target.value)}
          placeholder="例如: item"
          className={inputCls}
        />
      </Field>
    </>
  );
}

function CodeConfig({ data, update }: ConfigProps) {
  return (
    <>
      <Field label="语言">
        <select
          value={data.language || "javascript"}
          onChange={(e) => update("language", e.target.value)}
          className={inputCls}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
        </select>
      </Field>
      <Field label="代码">
        <textarea
          value={data.code || ""}
          onChange={(e) => update("code", e.target.value)}
          rows={10}
          placeholder="// 输入变量通过 input 对象访问\nreturn input;"
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
    </>
  );
}

function KnowledgeConfig({ data, update }: ConfigProps) {
  return (
    <>
      <Field label="知识库 ID">
        <input
          value={data.knowledgeBaseId || ""}
          onChange={(e) => update("knowledgeBaseId", e.target.value)}
          placeholder="选择知识库"
          className={inputCls}
        />
      </Field>
      <Field label="Top K">
        <input
          type="number"
          min={1}
          max={20}
          value={data.topK ?? 5}
          onChange={(e) => update("topK", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function EndConfig({ data, update }: ConfigProps) {
  return (
    <Field label="输出映射">
      <textarea
        value={data.outputMapping || ""}
        onChange={(e) => update("outputMapping", e.target.value)}
        rows={3}
        placeholder="定义输出字段映射"
        className={cn(inputCls, "resize-none font-mono text-[11px]")}
      />
    </Field>
  );
}
