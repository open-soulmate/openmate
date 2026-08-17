#!/usr/bin/env python3
"""Replace hardcoded Chinese strings with i18n t() calls in OpenMate workflow-builder files."""
import json, os

os.chdir(os.path.expanduser('~/openmate'))

# Load locale files
with open('src/locales/zh.json') as f:
    zh = json.load(f)
with open('src/locales/en.json') as f:
    en = json.load(f)

def read(path):
    with open(path) as f:
        return f.read()

def write(path, content):
    with open(path, 'w') as f:
        f.write(content)

# ============ 1. node-config-panel.tsx ============
fp = 'src/app/(app)/workflow-builder/node-config-panel.tsx'
c = read(fp)

# Add import
c = c.replace(
    'import { useCallback } from "react";',
    'import { useCallback } from "react";\nimport { useTranslation } from "react-i18next";'
)

# Add useTranslation to main component
c = c.replace(
    'export function NodeConfigPanel({ nodeId, data, onClose }: NodeConfigPanelProps) {\n  const updateNodeData',
    'export function NodeConfigPanel({ nodeId, data, onClose }: NodeConfigPanelProps) {\n  const { t } = useTranslation();\n  const updateNodeData'
)

# Main panel strings
c = c.replace('>节点配置<', ">{t('workflow.nodeConfig.nodeConfig')}<")
c = c.replace('title="删除节点"', "title={t('workflow.nodeConfig.deleteNode')}")
c = c.replace('<Field label="名称">', "<Field label={t('workflow.nodeConfig.name')}>")
c = c.replace('<Field label="描述">', "<Field label={t('workflow.nodeConfig.description')}>")

# Add useTranslation to each sub-config function
sub_funcs = ['StartConfig', 'LLMConfig', 'ToolConfig', 'ConditionConfig', 'LoopConfig',
             'CodeConfig', 'KnowledgeConfig', 'EndConfig', 'HTTPConfig', 'NotifyConfig',
             'OrganConfig', 'ScriptConfig']
for func in sub_funcs:
    c = c.replace(
        f'function {func}({{ data, update }}: ConfigProps) {{',
        f'function {func}({{ data, update }}: ConfigProps) {{\n  const {{ t }} = useTranslation();'
    )

# StartConfig
c = c.replace('<Field label="触发方式">', "<Field label={t('workflow.nodeConfig.triggerType')}>")
c = c.replace('>手动触发<', ">{t('workflow.nodeConfig.manualTrigger')}<")
c = c.replace('>定时触发<', ">{t('workflow.nodeConfig.scheduleTrigger')}<")
c = c.replace('>事件触发<', ">{t('workflow.nodeConfig.eventTrigger')}<")

# LLMConfig
c = c.replace('<Field label="模型">', "<Field label={t('workflow.nodeConfig.model')}>")
c = c.replace('<Field label="Prompt 模板">', "<Field label={t('workflow.nodeConfig.promptTemplate')}>")
c = c.replace('placeholder="输入 Prompt，支持 {{variable}} 变量引用"', "placeholder={t('workflow.nodeConfig.promptPlaceholder')}")
c = c.replace('<Field label="温度">', "<Field label={t('workflow.nodeConfig.temperature')}>")
c = c.replace('<Field label="最大 Token 数">', "<Field label={t('workflow.nodeConfig.maxTokens')}>")

# ToolConfig
c = c.replace('<Field label="工具名称">', "<Field label={t('workflow.nodeConfig.toolName')}>")
c = c.replace('placeholder="例如: web_search, read_file"', "placeholder={t('workflow.nodeConfig.toolNamePlaceholder')}")
c = c.replace('<Field label="参数映射 (JSON)">', "<Field label={t('workflow.nodeConfig.paramMapping')}>")

# ConditionConfig
c = c.replace('<Field label="条件表达式">', "<Field label={t('workflow.nodeConfig.conditionExpr')}>")
c = c.replace('placeholder="例如: output.score > 0.8"', "placeholder={t('workflow.nodeConfig.conditionPlaceholder')}")

# LoopConfig
c = c.replace('<Field label="列表变量">', "<Field label={t('workflow.nodeConfig.listVariable')}>")
c = c.replace('placeholder="例如: items"', "placeholder={t('workflow.nodeConfig.listVariablePlaceholder')}")
c = c.replace('<Field label="迭代变量名">', "<Field label={t('workflow.nodeConfig.iterationVariable')}>")
c = c.replace('placeholder="例如: item"', "placeholder={t('workflow.nodeConfig.iterationVariablePlaceholder')}")

# CodeConfig
c = c.replace('<Field label="语言">', "<Field label={t('workflow.nodeConfig.language')}>")
c = c.replace('<Field label="代码">', "<Field label={t('workflow.nodeConfig.code')}>")

# KnowledgeConfig
c = c.replace('<Field label="知识库 ID">', "<Field label={t('workflow.nodeConfig.knowledgeBaseId')}>")
c = c.replace('placeholder="选择知识库"', "placeholder={t('workflow.nodeConfig.selectKnowledgeBase')}")

# EndConfig
c = c.replace('<Field label="输出映射">', "<Field label={t('workflow.nodeConfig.outputMapping')}>")
c = c.replace('placeholder="定义输出字段映射"', "placeholder={t('workflow.nodeConfig.outputMappingPlaceholder')}")

# HTTPConfig - handle "请求方法" which appears twice (HTTPConfig and OrganConfig)
c = c.replace('<Field label="请求方法">', "<Field label={t('workflow.nodeConfig.requestMethod')}>", 1)
c = c.replace('placeholder="https://api.example.com/data，支持 ${var}"', "placeholder={t('workflow.nodeConfig.httpUrlPlaceholder')}")
c = c.replace('<Field label="请求头 (JSON)">', "<Field label={t('workflow.nodeConfig.requestHeaders')}>")
c = c.replace('<Field label="请求体 (JSON)">', "<Field label={t('workflow.nodeConfig.requestBody')}>")
c = c.replace('<Field label="超时 (秒)">', "<Field label={t('workflow.nodeConfig.timeoutSeconds')}>", 1)

# NotifyConfig
c = c.replace('<Field label="通知渠道">', "<Field label={t('workflow.nodeConfig.notifyChannel')}>")
c = c.replace('>邮件<', ">{t('workflow.nodeConfig.email')}<")
c = c.replace('>钉钉<', ">{t('workflow.nodeConfig.dingtalk')}<")
c = c.replace('>企业微信<', ">{t('workflow.nodeConfig.wecom')}<")
c = c.replace('>短信<', ">{t('workflow.nodeConfig.sms')}<")
c = c.replace('<Field label="标题">', "<Field label={t('workflow.nodeConfig.title')}>")
c = c.replace('placeholder="通知标题，支持 ${var}"', "placeholder={t('workflow.nodeConfig.notifyTitlePlaceholder')}")
c = c.replace('<Field label="内容">', "<Field label={t('workflow.nodeConfig.content')}>")
c = c.replace('placeholder="通知内容，支持 ${var}"', "placeholder={t('workflow.nodeConfig.notifyContentPlaceholder')}")
c = c.replace('<Field label="目标地址">', "<Field label={t('workflow.nodeConfig.targetAddress')}>")
c = c.replace('placeholder="Webhook URL / 邮箱 / 手机号"', "placeholder={t('workflow.nodeConfig.targetAddressPlaceholder')}")

# OrganConfig
c = c.replace('label: "🩸 Vein - 文件存储统计"', "label: t('workflow.nodeConfig.organVein')")
c = c.replace('label: "🧪 Gland - 模型网关状态"', "label: t('workflow.nodeConfig.organGland')")
c = c.replace('label: "🧪 Gland - Token 用量"', "label: t('workflow.nodeConfig.organGlandToken')")
c = c.replace('label: "🛡 Immune - 安全状态"', "label: t('workflow.nodeConfig.organImmune')")
c = c.replace('label: "🦴 Marrow - 备份列表"', "label: t('workflow.nodeConfig.organMarrow')")
c = c.replace('label: "🧬 Gene - 模板列表"', "label: t('workflow.nodeConfig.organGene')")
c = c.replace('label: "🔊 Echo - 消息历史"', "label: t('workflow.nodeConfig.organEcho')")
c = c.replace('label: "🪞 Mirror - 沙箱列表"', "label: t('workflow.nodeConfig.organMirror')")
c = c.replace('label: "🔗 Link - 连接器列表"', "label: t('workflow.nodeConfig.organLink')")
c = c.replace('label: "🧠 Hippo - 记忆列表"', "label: t('workflow.nodeConfig.organHippo')")
c = c.replace('label: "📊 Vital - 体征状态"', "label: t('workflow.nodeConfig.organVital')")
c = c.replace('label: "🧩 Cortex - 皮层状态"', "label: t('workflow.nodeConfig.organCortex')")
c = c.replace('label: "⚡ Nerve - 事件总线"', "label: t('workflow.nodeConfig.organNerve')")
c = c.replace('<Field label="目标器官">', "<Field label={t('workflow.nodeConfig.targetOrgan')}>")
c = c.replace('>选择器官 API...<', ">{t('workflow.nodeConfig.selectOrganApi')}<")
c = c.replace('<Field label="自定义端点">', "<Field label={t('workflow.nodeConfig.customEndpoint')}>")

# Second "请求方法" (OrganConfig)
c = c.replace('<Field label="请求方法">', "<Field label={t('workflow.nodeConfig.requestMethod')}>")
# Second "超时 (秒)" (ScriptConfig)
c = c.replace('<Field label="超时 (秒)">', "<Field label={t('workflow.nodeConfig.timeoutSeconds')}>")

# ScriptConfig
c = c.replace('<Field label="Shell 命令">', "<Field label={t('workflow.nodeConfig.shellCommand')}>")
c = c.replace('placeholder="echo \'Hello ${name}\'，支持 ${var}"', "placeholder={t('workflow.nodeConfig.shellCommandPlaceholder')}")
c = c.replace('<Field label="工作目录">', "<Field label={t('workflow.nodeConfig.workingDirectory')}>")
c = c.replace('placeholder="/home/user (可选)"', "placeholder={t('workflow.nodeConfig.workingDirectoryPlaceholder')}")

write(fp, c)
print("1. node-config-panel.tsx done")

# ============ 2. node-palette.tsx ============
fp = 'src/app/(app)/workflow-builder/node-palette.tsx'
c = read(fp)

c = c.replace(
    'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\nimport { useTranslation } from "react-i18next";'
)

# Replace the static paletteItems array and move it inside the component
old_palette = '''const paletteItems: PaletteItem[] = [
  // Flow control
  { type: "start", label: "开始", icon: Play, color: "text-emerald-500", group: "flow" },
  { type: "condition", label: "条件", icon: GitBranch, color: "text-sky-500", group: "flow" },
  { type: "loop", label: "循环", icon: Repeat, color: "text-orange-500", group: "flow" },
  { type: "end", label: "结束", icon: Square, color: "text-red-500", group: "flow" },
  // Actions
  { type: "llm", label: "LLM 调用", icon: Bot, color: "text-violet-500", group: "action" },
  { type: "http", label: "HTTP 请求", icon: Globe, color: "text-blue-500", group: "action" },
  { type: "notify", label: "发送通知", icon: Bell, color: "text-amber-500", group: "action" },
  { type: "organ", label: "器官调用", icon: Zap, color: "text-pink-500", group: "action" },
  { type: "knowledge", label: "知识库搜索", icon: Database, color: "text-teal-500", group: "action" },
  { type: "script", label: "执行脚本", icon: Terminal, color: "text-orange-400", group: "action" },
  { type: "tool", label: "工具", icon: Wrench, color: "text-amber-500", group: "action" },
  { type: "code", label: "代码", icon: Code2, color: "text-pink-500", group: "action" },
];'''

c = c.replace(old_palette, '')

c = c.replace(
    'export function NodePalette() {\n  const onDragStart',
    '''export function NodePalette() {
  const { t } = useTranslation();
  const paletteItems: PaletteItem[] = [
    { type: "start", label: t("workflow.nodePalette.start"), icon: Play, color: "text-emerald-500", group: "flow" },
    { type: "condition", label: t("workflow.nodePalette.condition"), icon: GitBranch, color: "text-sky-500", group: "flow" },
    { type: "loop", label: t("workflow.nodePalette.loop"), icon: Repeat, color: "text-orange-500", group: "flow" },
    { type: "end", label: t("workflow.nodePalette.end"), icon: Square, color: "text-red-500", group: "flow" },
    { type: "llm", label: t("workflow.nodePalette.llmCall"), icon: Bot, color: "text-violet-500", group: "action" },
    { type: "http", label: t("workflow.nodePalette.httpRequest"), icon: Globe, color: "text-blue-500", group: "action" },
    { type: "notify", label: t("workflow.nodePalette.sendNotify"), icon: Bell, color: "text-amber-500", group: "action" },
    { type: "organ", label: t("workflow.nodePalette.organCall"), icon: Zap, color: "text-pink-500", group: "action" },
    { type: "knowledge", label: t("workflow.nodePalette.knowledgeSearch"), icon: Database, color: "text-teal-500", group: "action" },
    { type: "script", label: t("workflow.nodePalette.runScript"), icon: Terminal, color: "text-orange-400", group: "action" },
    { type: "tool", label: t("workflow.nodePalette.tool"), icon: Wrench, color: "text-amber-500", group: "action" },
    { type: "code", label: t("workflow.nodePalette.code"), icon: Code2, color: "text-pink-500", group: "action" },
  ];
  const onDragStart'''
)

c = c.replace('>节点<', ">{t('workflow.nodePalette.nodes')}<")
c = c.replace('>流程控制<', ">{t('workflow.nodePalette.flowControl')}<")
c = c.replace('>动作<', ">{t('workflow.nodePalette.actions')}<")

write(fp, c)
print("2. node-palette.tsx done")

# ============ 3. workflow-toolbar.tsx ============
fp = 'src/app/(app)/workflow-builder/workflow-toolbar.tsx'
c = read(fp)

c = c.replace(
    'import { cn } from "@//lib/utils";',
    'import { cn } from "@//lib/utils";\nimport { useTranslation } from "react-i18next";'
)
c = c.replace(
    'export function WorkflowToolbar({ onCreateNew }: WorkflowToolbarProps) {\n  const isDirty',
    'export function WorkflowToolbar({ onCreateNew }: WorkflowToolbarProps) {\n  const { t } = useTranslation();\n  const isDirty'
)

c = c.replace('title="新建工作流"', "title={t('workflow.toolbar.newWorkflow')}")
c = c.replace('>新建<', ">{t('workflow.toolbar.new')}<")
c = c.replace('title={isExecuting ? "取消执行" : "运行工作流"}', "title={isExecuting ? t('workflow.toolbar.cancelExecution') : t('workflow.toolbar.runWorkflow')}")
c = c.replace('>停止<', ">{t('workflow.toolbar.stop')}<")
c = c.replace('>运行<', ">{t('workflow.toolbar.run')}<")
c = c.replace('title="调试模式"', "title={t('workflow.toolbar.debugMode')}")
c = c.replace('>调试<', ">{t('workflow.toolbar.debug')}<")
c = c.replace('title="保存"', "title={t('workflow.toolbar.save')}")
c = c.replace('>保存{isDirty ? " *" : ""}<', ">{t('workflow.toolbar.save')}{isDirty ? ' *' : ''}<")
c = c.replace('title="导出"', "title={t('workflow.toolbar.export')}")
c = c.replace('>导出<', ">{t('workflow.toolbar.export')}<")
c = c.replace('title="导入"', "title={t('workflow.toolbar.import')}")
c = c.replace('>导入<', ">{t('workflow.toolbar.import')}<")
c = c.replace('title="查看执行结果"', "title={t('workflow.toolbar.viewResult')}")
c = c.replace('title="执行面板"', "title={t('workflow.toolbar.executionPanel')}")

write(fp, c)
print("3. workflow-toolbar.tsx done")

# ============ 4. workflow-execution-panel.tsx ============
fp = 'src/app/(app)/workflow-builder/workflow-execution-panel.tsx'
c = read(fp)

c = c.replace(
    'import { useState } from "react";',
    'import { useState } from "react";\nimport { useTranslation } from "react-i18next";'
)
c = c.replace(
    'export function WorkflowExecutionPanel() {\n  const showExecutionPanel',
    'export function WorkflowExecutionPanel() {\n  const { t } = useTranslation();\n  const showExecutionPanel'
)

c = c.replace('>工作流执行<', ">{t('workflow.execution.workflowExecution')}<")
c = c.replace('>当前执行<', ">{t('workflow.execution.currentExecution')}<")
c = c.replace('>历史记录<', ">{t('workflow.execution.history')}<")
c = c.replace('<StopCircle size={12} />\n              取消', "<StopCircle size={12} />\n              {t('workflow.execution.cancel')}")
c = c.replace('title="刷新"', "title={t('workflow.execution.refresh')}")
c = c.replace('>尚未执行工作流<', ">{t('workflow.execution.notExecuted')}<")
c = c.replace('>点击工具栏的「运行」按钮开始执行<', ">{t('workflow.execution.clickRunHint')}<")
c = c.replace('? "执行中..."', '? t("workflow.execution.executing")')
c = c.replace(': "执行完成"', ': t("workflow.execution.completed")')
c = c.replace(': "执行失败"', ': t("workflow.execution.failed")')
c = c.replace(': "已取消"', ': t("workflow.execution.cancelled")')
c = c.replace('>错误信息<', ">{t('workflow.execution.errorMessage')}<")
c = c.replace('>执行步骤<', ">{t('workflow.execution.executionSteps')}<")
c = c.replace('>输入变量<', ">{t('workflow.execution.inputVariables')}<")
c = c.replace('>暂无执行历史<', ">{t('workflow.execution.noHistory')}<")
c = c.replace('{exec.steps.length} 步', '{exec.steps.length} {t("workflow.execution.steps")}')

write(fp, c)
print("4. workflow-execution-panel.tsx done")

# ============ 5. workflow-list-panel.tsx ============
fp = 'src/app/(app)/workflow-builder/workflow-list-panel.tsx'
c = read(fp)

c = c.replace(
    'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\nimport { useTranslation } from "react-i18next";'
)
c = c.replace(
    'export function WorkflowListPanel({ onLoad }: WorkflowListPanelProps) {\n  const workflows',
    'export function WorkflowListPanel({ onLoad }: WorkflowListPanelProps) {\n  const { t } = useTranslation();\n  const workflows'
)

c = c.replace('title="展开列表"', "title={t('workflow.list.expandList')}")
c = c.replace('>工作流列表<', ">{t('workflow.list.workflowList')}<")
c = c.replace('>暂无工作流<', ">{t('workflow.list.noWorkflows')}<")
c = c.replace('title="复制"', "title={t('workflow.list.duplicate')}")
c = c.replace('title="删除"', "title={t('workflow.list.delete')}")
c = c.replace('{wf.nodes.length} 节点 · v{wf.version}', '{wf.nodes.length} {t("workflow.list.nodes")} · v{wf.version}')
c = c.replace('>确认删除？<', ">{t('workflow.list.confirmDelete')}<")
# The "删除" and "取消" buttons in the delete confirmation
c = c.replace('              删除\n            </button>\n            <button\n              onClick={() => setConfirmDeleteId(null)}', "              {t('workflow.list.delete')}\n            </button>\n            <button\n              onClick={() => setConfirmDeleteId(null)}")
c = c.replace('              取消\n            </button>\n          </div>\n        </div>\n      )}\n    </div>', "              {t('workflow.list.cancel')}\n            </button>\n          </div>\n        </div>\n      )}\n    </div>")

write(fp, c)
print("5. workflow-list-panel.tsx done")

# ============ Add workflow locale keys ============
zh.setdefault('workflow', {})['nodeConfig'] = {
    "nodeConfig": "节点配置", "deleteNode": "删除节点", "name": "名称", "description": "描述",
    "triggerType": "触发方式", "manualTrigger": "手动触发", "scheduleTrigger": "定时触发",
    "eventTrigger": "事件触发", "model": "模型", "promptTemplate": "Prompt 模板",
    "promptPlaceholder": "输入 Prompt，支持 {{variable}} 变量引用", "temperature": "温度",
    "maxTokens": "最大 Token 数", "toolName": "工具名称",
    "toolNamePlaceholder": "例如: web_search, read_file", "paramMapping": "参数映射 (JSON)",
    "conditionExpr": "条件表达式", "conditionPlaceholder": "例如: output.score > 0.8",
    "listVariable": "列表变量", "listVariablePlaceholder": "例如: items",
    "iterationVariable": "迭代变量名", "iterationVariablePlaceholder": "例如: item",
    "language": "语言", "code": "代码", "knowledgeBaseId": "知识库 ID",
    "selectKnowledgeBase": "选择知识库", "outputMapping": "输出映射",
    "outputMappingPlaceholder": "定义输出字段映射", "requestMethod": "请求方法",
    "requestHeaders": "请求头 (JSON)", "requestBody": "请求体 (JSON)", "timeoutSeconds": "超时 (秒)",
    "httpUrlPlaceholder": "https://api.example.com/data，支持 ${var}", "notifyChannel": "通知渠道",
    "email": "邮件", "dingtalk": "钉钉", "wecom": "企业微信", "sms": "短信", "title": "标题",
    "notifyTitlePlaceholder": "通知标题，支持 ${var}", "content": "内容",
    "notifyContentPlaceholder": "通知内容，支持 ${var}", "targetAddress": "目标地址",
    "targetAddressPlaceholder": "Webhook URL / 邮箱 / 手机号", "targetOrgan": "目标器官",
    "selectOrganApi": "选择器官 API...", "customEndpoint": "自定义端点",
    "organVein": "🩸 Vein - 文件存储统计", "organGland": "🧪 Gland - 模型网关状态",
    "organGlandToken": "🧪 Gland - Token 用量", "organImmune": "🛡 Immune - 安全状态",
    "organMarrow": "🦴 Marrow - 备份列表", "organGene": "🧬 Gene - 模板列表",
    "organEcho": "🔊 Echo - 消息历史", "organMirror": "🪞 Mirror - 沙箱列表",
    "organLink": "🔗 Link - 连接器列表", "organHippo": "🧠 Hippo - 记忆列表",
    "organVital": "📊 Vital - 体征状态", "organCortex": "🧩 Cortex - 皮层状态",
    "organNerve": "⚡ Nerve - 事件总线", "shellCommand": "Shell 命令",
    "shellCommandPlaceholder": "echo 'Hello ${name}'，支持 ${var}", "workingDirectory": "工作目录",
    "workingDirectoryPlaceholder": "/home/user (可选)",
}
en.setdefault('workflow', {})['nodeConfig'] = {
    "nodeConfig": "Node Config", "deleteNode": "Delete Node", "name": "Name", "description": "Description",
    "triggerType": "Trigger Type", "manualTrigger": "Manual", "scheduleTrigger": "Schedule",
    "eventTrigger": "Event", "model": "Model", "promptTemplate": "Prompt Template",
    "promptPlaceholder": "Enter prompt, supports {{variable}} variable references", "temperature": "Temperature",
    "maxTokens": "Max Tokens", "toolName": "Tool Name",
    "toolNamePlaceholder": "e.g. web_search, read_file", "paramMapping": "Parameter Mapping (JSON)",
    "conditionExpr": "Condition Expression", "conditionPlaceholder": "e.g. output.score > 0.8",
    "listVariable": "List Variable", "listVariablePlaceholder": "e.g. items",
    "iterationVariable": "Iteration Variable", "iterationVariablePlaceholder": "e.g. item",
    "language": "Language", "code": "Code", "knowledgeBaseId": "Knowledge Base ID",
    "selectKnowledgeBase": "Select knowledge base", "outputMapping": "Output Mapping",
    "outputMappingPlaceholder": "Define output field mapping", "requestMethod": "Request Method",
    "requestHeaders": "Request Headers (JSON)", "requestBody": "Request Body (JSON)", "timeoutSeconds": "Timeout (seconds)",
    "httpUrlPlaceholder": "https://api.example.com/data, supports ${var}", "notifyChannel": "Notification Channel",
    "email": "Email", "dingtalk": "DingTalk", "wecom": "WeCom", "sms": "SMS", "title": "Title",
    "notifyTitlePlaceholder": "Notification title, supports ${var}", "content": "Content",
    "notifyContentPlaceholder": "Notification content, supports ${var}", "targetAddress": "Target Address",
    "targetAddressPlaceholder": "Webhook URL / Email / Phone", "targetOrgan": "Target Organ",
    "selectOrganApi": "Select organ API...", "customEndpoint": "Custom Endpoint",
    "organVein": "🩸 Vein - File Storage Stats", "organGland": "🧪 Gland - Model Gateway Status",
    "organGlandToken": "🧪 Gland - Token Usage", "organImmune": "🛡 Immune - Security Status",
    "organMarrow": "🦴 Marrow - Backup List", "organGene": "🧬 Gene - Template List",
    "organEcho": "🔊 Echo - Message History", "organMirror": "🪞 Mirror - Sandbox List",
    "organLink": "🔗 Link - Connector List", "organHippo": "🧠 Hippo - Memory List",
    "organVital": "📊 Vital - Vital Signs", "organCortex": "🧩 Cortex - Cortex Status",
    "organNerve": "⚡ Nerve - Event Bus", "shellCommand": "Shell Command",
    "shellCommandPlaceholder": "echo 'Hello ${name}', supports ${var}", "workingDirectory": "Working Directory",
    "workingDirectoryPlaceholder": "/home/user (optional)",
}

zh.setdefault('workflow', {})['nodePalette'] = {
    "nodes": "节点", "flowControl": "流程控制", "actions": "动作", "start": "开始",
    "condition": "条件", "loop": "循环", "end": "结束", "llmCall": "LLM 调用",
    "httpRequest": "HTTP 请求", "sendNotify": "发送通知", "organCall": "器官调用",
    "knowledgeSearch": "知识库搜索", "runScript": "执行脚本", "tool": "工具", "code": "代码",
}
en.setdefault('workflow', {})['nodePalette'] = {
    "nodes": "Nodes", "flowControl": "Flow Control", "actions": "Actions", "start": "Start",
    "condition": "Condition", "loop": "Loop", "end": "End", "llmCall": "LLM Call",
    "httpRequest": "HTTP Request", "sendNotify": "Send Notification", "organCall": "Organ Call",
    "knowledgeSearch": "Knowledge Search", "runScript": "Run Script", "tool": "Tool", "code": "Code",
}

zh.setdefault('workflow', {})['toolbar'] = {
    "newWorkflow": "新建工作流", "new": "新建", "cancelExecution": "取消执行",
    "runWorkflow": "运行工作流", "stop": "停止", "run": "运行", "debugMode": "调试模式",
    "debug": "调试", "save": "保存", "export": "导出", "import": "导入",
    "viewResult": "查看执行结果", "executionPanel": "执行面板",
}
en.setdefault('workflow', {})['toolbar'] = {
    "newWorkflow": "New Workflow", "new": "New", "cancelExecution": "Cancel Execution",
    "runWorkflow": "Run Workflow", "stop": "Stop", "run": "Run", "debugMode": "Debug Mode",
    "debug": "Debug", "save": "Save", "export": "Export", "import": "Import",
    "viewResult": "View Result", "executionPanel": "Execution Panel",
}

zh.setdefault('workflow', {})['execution'] = {
    "workflowExecution": "工作流执行", "currentExecution": "当前执行", "history": "历史记录",
    "cancel": "取消", "refresh": "刷新", "notExecuted": "尚未执行工作流",
    "clickRunHint": "点击工具栏的「运行」按钮开始执行", "executing": "执行中...",
    "completed": "执行完成", "failed": "执行失败", "cancelled": "已取消",
    "errorMessage": "错误信息", "executionSteps": "执行步骤", "inputVariables": "输入变量",
    "noHistory": "暂无执行历史", "steps": "步",
}
en.setdefault('workflow', {})['execution'] = {
    "workflowExecution": "Workflow Execution", "currentExecution": "Current Execution", "history": "History",
    "cancel": "Cancel", "refresh": "Refresh", "notExecuted": "Workflow not executed yet",
    "clickRunHint": 'Click the "Run" button in the toolbar to start', "executing": "Executing...",
    "completed": "Completed", "failed": "Failed", "cancelled": "Cancelled",
    "errorMessage": "Error Message", "executionSteps": "Execution Steps", "inputVariables": "Input Variables",
    "noHistory": "No execution history", "steps": "steps",
}

zh.setdefault('workflow', {})['list'] = {
    "expandList": "展开列表", "workflowList": "工作流列表", "noWorkflows": "暂无工作流",
    "duplicate": "复制", "delete": "删除", "nodes": "节点", "confirmDelete": "确认删除？",
    "cancel": "取消",
}
en.setdefault('workflow', {})['list'] = {
    "expandList": "Expand List", "workflowList": "Workflow List", "noWorkflows": "No workflows",
    "duplicate": "Duplicate", "delete": "Delete", "nodes": "nodes", "confirmDelete": "Confirm delete?",
    "cancel": "Cancel",
}

# Save locale files
with open('src/locales/zh.json', 'w') as f:
    json.dump(zh, f, ensure_ascii=False, indent=2)
with open('src/locales/en.json', 'w') as f:
    json.dump(en, f, ensure_ascii=False, indent=2)

print("Locale files updated (workflow modules)")
