"use client";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWorkflowStore, type WorkflowNodeData } from "@/stores/workflow-store";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeConfigPanelProps {
  nodeId: string;
  data: WorkflowNodeData;
  onClose: () => void;
}

export function NodeConfigPanel({ nodeId, data, onClose }: NodeConfigPanelProps) {
  const { t } = useTranslation();
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
        <h3 className="text-xs font-medium text-foreground">{t('workflow.nodeConfig.nodeConfig')}</h3>
        <div className="flex items-center gap-1">
          {data.type !== "start" && (
            <button
              onClick={handleDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title={t('workflow.nodeConfig.deleteNode')}
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
        <Field label={t('workflow.nodeConfig.name')}>
          <input
            value={data.label}
            onChange={(e) => update("label", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t('workflow.nodeConfig.description')}>
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
        {data.type === "http" && <HTTPConfig data={data} update={update} />}
        {data.type === "notify" && <NotifyConfig data={data} update={update} />}
        {data.type === "organ" && <OrganConfig data={data} update={update} />}
        {data.type === "script" && <ScriptConfig data={data} update={update} />}
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
  const { t } = useTranslation();
  return (
    <Field label={t('workflow.nodeConfig.triggerType')}>
      <select
        value={data.triggerType || "manual"}
        onChange={(e) => update("triggerType", e.target.value)}
        className={inputCls}
      >
        <option value="manual">{t('workflow.nodeConfig.manualTrigger')}</option>
        <option value="schedule">{t('workflow.nodeConfig.scheduleTrigger')}</option>
        <option value="webhook">Webhook</option>
        <option value="event">{t('workflow.nodeConfig.eventTrigger')}</option>
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
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.model')}>
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
      <Field label={t('workflow.nodeConfig.promptTemplate')}>
        <textarea
          value={data.prompt || ""}
          onChange={(e) => update("prompt", e.target.value)}
          rows={5}
          placeholder={t('workflow.nodeConfig.promptPlaceholder')}
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.temperature')}>
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
      <Field label={t('workflow.nodeConfig.maxTokens')}>
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
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.toolName')}>
        <input
          value={data.toolName || ""}
          onChange={(e) => update("toolName", e.target.value)}
          placeholder={t('workflow.nodeConfig.toolNamePlaceholder')}
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.paramMapping')}>
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
  const { t } = useTranslation();
  return (
    <Field label={t('workflow.nodeConfig.conditionExpr')}>
      <textarea
        value={data.condition || ""}
        onChange={(e) => update("condition", e.target.value)}
        rows={4}
        placeholder={t('workflow.nodeConfig.conditionPlaceholder')}
        className={cn(inputCls, "resize-none font-mono text-[11px]")}
      />
    </Field>
  );
}

function LoopConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.listVariable')}>
        <input
          value={data.listVariable || ""}
          onChange={(e) => update("listVariable", e.target.value)}
          placeholder={t('workflow.nodeConfig.listVariablePlaceholder')}
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.iterationVariable')}>
        <input
          value={data.itemVariable || ""}
          onChange={(e) => update("itemVariable", e.target.value)}
          placeholder={t('workflow.nodeConfig.iterationVariablePlaceholder')}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function CodeConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.language')}>
        <select
          value={data.language || "javascript"}
          onChange={(e) => update("language", e.target.value)}
          className={inputCls}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
        </select>
      </Field>
      <Field label={t('workflow.nodeConfig.code')}>
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
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.knowledgeBaseId')}>
        <input
          value={data.knowledgeBaseId || ""}
          onChange={(e) => update("knowledgeBaseId", e.target.value)}
          placeholder={t('workflow.nodeConfig.selectKnowledgeBase')}
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
  const { t } = useTranslation();
  return (
    <Field label={t('workflow.nodeConfig.outputMapping')}>
      <textarea
        value={data.outputMapping || ""}
        onChange={(e) => update("outputMapping", e.target.value)}
        rows={3}
        placeholder={t('workflow.nodeConfig.outputMappingPlaceholder')}
        className={cn(inputCls, "resize-none font-mono text-[11px]")}
      />
    </Field>
  );
}

function HTTPConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.requestMethod')}>
        <select
          value={(data.httpMethod as string) || "GET"}
          onChange={(e) => update("httpMethod", e.target.value)}
          className={inputCls}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </Field>
      <Field label="URL">
        <input
          value={(data.httpUrl as string) || ""}
          onChange={(e) => update("httpUrl", e.target.value)}
          placeholder={t('workflow.nodeConfig.httpUrlPlaceholder')}
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.requestHeaders')}>
        <textarea
          value={data.httpHeaders ? JSON.stringify(data.httpHeaders, null, 2) : ""}
          onChange={(e) => {
            try { update("httpHeaders", JSON.parse(e.target.value)); } catch {}
          }}
          rows={3}
          placeholder='{"Authorization": "Bearer ${token}"}'
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.requestBody')}>
        <textarea
          value={data.httpBody ? JSON.stringify(data.httpBody, null, 2) : ""}
          onChange={(e) => {
            try { update("httpBody", JSON.parse(e.target.value)); } catch {}
          }}
          rows={4}
          placeholder='{"key": "${variable}"}'
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.timeoutSeconds')}>
        <input
          type="number"
          min={1}
          max={300}
          value={(data.httpTimeout as number) ?? 30}
          onChange={(e) => update("httpTimeout", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function NotifyConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.notifyChannel')}>
        <select
          value={(data.notifyChannel as string) || "webhook"}
          onChange={(e) => update("notifyChannel", e.target.value)}
          className={inputCls}
        >
          <option value="webhook">Webhook</option>
          <option value="email">{t('workflow.nodeConfig.email')}</option>
          <option value="dingtalk">{t('workflow.nodeConfig.dingtalk')}</option>
          <option value="wecom">{t('workflow.nodeConfig.wecom')}</option>
          <option value="sms">{t('workflow.nodeConfig.sms')}</option>
        </select>
      </Field>
      <Field label={t('workflow.nodeConfig.title')}>
        <input
          value={(data.notifyTitle as string) || ""}
          onChange={(e) => update("notifyTitle", e.target.value)}
          placeholder={t('workflow.nodeConfig.notifyTitlePlaceholder')}
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.content')}>
        <textarea
          value={(data.notifyContent as string) || ""}
          onChange={(e) => update("notifyContent", e.target.value)}
          rows={4}
          placeholder={t('workflow.nodeConfig.notifyContentPlaceholder')}
          className={cn(inputCls, "resize-none")}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.targetAddress')}>
        <input
          value={(data.notifyTarget as string) || ""}
          onChange={(e) => update("notifyTarget", e.target.value)}
          placeholder={t('workflow.nodeConfig.targetAddressPlaceholder')}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function OrganConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  const organs = [
    { value: "/api/vein/stats", label: t('workflow.nodeConfig.organVein') },
    { value: "/api/gland/health", label: t('workflow.nodeConfig.organGland') },
    { value: "/api/gland/usage", label: t('workflow.nodeConfig.organGlandToken') },
    { value: "/api/immune/health", label: t('workflow.nodeConfig.organImmune') },
    { value: "/api/marrow/backups", label: t('workflow.nodeConfig.organMarrow') },
    { value: "/api/gene/templates", label: t('workflow.nodeConfig.organGene') },
    { value: "/api/echo/history", label: t('workflow.nodeConfig.organEcho') },
    { value: "/api/mirror/sandboxes", label: t('workflow.nodeConfig.organMirror') },
    { value: "/api/link/connectors", label: t('workflow.nodeConfig.organLink') },
    { value: "/api/hippo/memories", label: t('workflow.nodeConfig.organHippo') },
    { value: "/api/vital/health", label: t('workflow.nodeConfig.organVital') },
    { value: "/api/cortex/health", label: t('workflow.nodeConfig.organCortex') },
    { value: "/api/nerve/events", label: t('workflow.nodeConfig.organNerve') },
  ];
  return (
    <>
      <Field label={t('workflow.nodeConfig.targetOrgan')}>
        <select
          value={(data.organEndpoint as string) || ""}
          onChange={(e) => update("organEndpoint", e.target.value)}
          className={inputCls}
        >
          <option value="">{t('workflow.nodeConfig.selectOrganApi')}</option>
          {organs.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label={t('workflow.nodeConfig.customEndpoint')}>
        <input
          value={(data.organEndpoint as string) || ""}
          onChange={(e) => update("organEndpoint", e.target.value)}
          placeholder="/api/xxx/yyy"
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.requestMethod')}>
        <select
          value={(data.organMethod as string) || "GET"}
          onChange={(e) => update("organMethod", e.target.value)}
          className={inputCls}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
      </Field>
    </>
  );
}

function ScriptConfig({ data, update }: ConfigProps) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('workflow.nodeConfig.shellCommand')}>
        <textarea
          value={(data.scriptCommand as string) || ""}
          onChange={(e) => update("scriptCommand", e.target.value)}
          rows={4}
          placeholder={t('workflow.nodeConfig.shellCommandPlaceholder')}
          className={cn(inputCls, "resize-none font-mono text-[11px]")}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.workingDirectory')}>
        <input
          value={(data.scriptCwd as string) || ""}
          onChange={(e) => update("scriptCwd", e.target.value)}
          placeholder={t('workflow.nodeConfig.workingDirectoryPlaceholder')}
          className={inputCls}
        />
      </Field>
      <Field label={t('workflow.nodeConfig.timeoutSeconds')}>
        <input
          type="number"
          min={1}
          max={300}
          value={(data.scriptTimeout as number) ?? 30}
          onChange={(e) => update("scriptTimeout", Number(e.target.value))}
          className={inputCls}
        />
      </Field>
    </>
  );
}
