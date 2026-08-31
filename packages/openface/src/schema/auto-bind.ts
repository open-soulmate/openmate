// OpenFace Auto-Binding Engine
// Converts MCP tool definitions (with UI hints) → UISchema for rendering

import type { MCPToolDefinition, MCPToolUI, RiskLevel } from './mcp-types';
import type { UISchema, Component } from './types';

// ─── Type Detection ────────────────────────────────────────────────
function inferInputType(key: string, paramSchema: any): string {
  if (key.includes('password') || key.includes('secret') || key.includes('token')) return 'password';
  if (key.includes('path') && (key.includes('file') || key.includes('doc'))) return 'file';
  if (key.includes('path') && (key.includes('dir') || key.includes('folder'))) return 'folder';
  if (key.includes('url') || key.includes('endpoint') || key.includes('uri')) return 'url';
  if (key.includes('email')) return 'email';
  if (key.includes('color') || key.includes('colour')) return 'color';

  const type = paramSchema?.type;
  const format = paramSchema?.format;

  if (type === 'string' && paramSchema?.enum) return 'select';
  if (type === 'string' && format === 'uri') return 'url';
  if (type === 'string' && format === 'email') return 'email';
  if (type === 'string' && format === 'binary') return 'file';
  if (type === 'string' && (paramSchema?.maxLength || 0) > 200) return 'textarea';
  if (type === 'string') return 'text';
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'toggle';
  if (type === 'array') return 'multi-select';
  if (type === 'object') return 'json';
  return 'text';
}



// ─── Risk → Interaction Rules ──────────────────────────────────────
const RISK_RULES: Record<RiskLevel, { confirm: boolean; progress: boolean; cancel: boolean; auto: boolean }> = {
  low:      { confirm: false, progress: false, cancel: false, auto: true },
  medium:   { confirm: false, progress: true,  cancel: true,  auto: false },
  high:     { confirm: true,  progress: true,  cancel: true,  auto: false },
  critical: { confirm: true,  progress: true,  cancel: true,  auto: false },
};

// ─── Auto-Binding Engine ───────────────────────────────────────────
export interface BindingOptions {
  /** Env vars to pass to SchemaRenderer */
  env?: Record<string, any>;
  /** Override layout */
  layout?: 'form' | 'single-action' | 'dashboard' | 'wizard';
  /** API base URL for MCP calls */
  apiBase?: string;
}

export function bindToolToSchema(tool: MCPToolDefinition, options: BindingOptions = {}): UISchema {
  const ui = tool.ui || {};
  const risk = ui.risk || 'low';
  const rules = { ...RISK_RULES[risk], confirm: ui.confirmBeforeExecute ?? RISK_RULES[risk].confirm };
  const layout = options.layout || ui.layout || 'form';
  const apiBase = options.apiBase || '';

  // Build input components
  const inputs = buildInputComponents(tool, ui);

  // Build output components
  const outputs = buildOutputComponents(ui);

  // Build action buttons
  const actions = buildActionComponents(tool, rules, apiBase);

  // Assemble based on layout
  if (layout === 'single-action') {
    return {
      version: '1.0',
      id: `tool-${tool.name}`,
      title: tool.description,
      data: buildDefaultData(tool),
      children: [
        ...inputs.map(c => c),
        { type: 'divider' },
        ...actions,
        { type: 'divider' },
        ...outputs,
      ],
    };
  }

  // Form layout (default)
  return {
    version: '1.0',
    id: `tool-${tool.name}`,
    title: tool.description,
    data: buildDefaultData(tool),
    children: [
      {
        type: 'grid',
        columns: 2,
        children: [
          {
            type: 'panel',
            label: '输入',
            children: inputs,
          },
          {
            type: 'panel',
            label: '输出',
            children: outputs,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'flex',
        children: actions,
      },
    ],
  };
}

// ─── Input Components ──────────────────────────────────────────────
function buildInputComponents(tool: MCPToolDefinition, ui: MCPToolUI): Component[] {
  const params = tool.parameters?.properties || {};
  const required = tool.parameters?.required || [];
  const hints = new Map((ui.inputs || []).map(h => [h.key, h]));

  return Object.entries(params)
    .map(([key, schema]) => {
      const hint = hints.get(key);
      const inputType = hint?.type || inferInputType(key, schema);
      const order = hint?.order ?? 99;

      const base: Component = {
        type: mapInputType(inputType),
        id: key,
        label: hint?.label || schema.title || key,
        placeholder: hint?.placeholder || schema.description?.slice(0, 50),
        description: hint?.description || schema.description,
        required: hint?.required ?? required.includes(key),
        value: { $ref: `data.${key}` },
        onChange: { action: 'update', target: key },
      };

      // Type-specific props
      if (inputType === 'select' || inputType === 'multi-select') {
        base.options = hint?.options || (schema.enum || []).map((v: string) => ({ value: v, label: v }));
      }
      if (inputType === 'file') {
        base.props = { accept: hint?.accept, multiple: hint?.multiple };
      }
      if (inputType === 'slider' || inputType === 'number') {
        if (hint?.min !== undefined) base.min = hint.min;
        if (hint?.max !== undefined) base.max = hint.max;
        if (hint?.step !== undefined) base.step = hint.step;
      }
      if (inputType === 'textarea') {
        base.props = { rows: hint?.rows || 4 };
      }
      if (hint?.defaultValue !== undefined) {
        base.defaultValue = hint.defaultValue;
      }

      return { ...base, props: { ...base.props, _order: order } };
    })
    .sort((a, b) => ((a.props?._order ?? 99) as number) - ((b.props?._order ?? 99) as number));
}

function mapInputType(type: string): string {
  const map: Record<string, string> = {
    text: 'text-input', number: 'number-input', textarea: 'textarea',
    select: 'select', 'multi-select': 'multi-select', toggle: 'toggle',
    checkbox: 'checkbox', slider: 'slider', file: 'file-upload',
    folder: 'file-upload', date: 'date-picker', color: 'color-picker',
    json: 'textarea', code: 'textarea', password: 'text-input',
    url: 'text-input', email: 'text-input',
  };
  return map[type] || 'text-input';
}

// ─── Output Components ─────────────────────────────────────────────
function buildOutputComponents(ui: MCPToolUI): Component[] {
  const outputs = ui.outputs || [];
  if (outputs.length === 0) {
    return [
      { type: 'text', label: '执行后将在此显示结果', className: 'text-muted-foreground text-xs' },
    ];
  }

  return outputs.map(out => {
    const base: Component = {
      type: mapOutputType(out.type || 'text'),
      label: out.label || out.key,
      id: `output-${out.key}`,
    };

    if (out.type === 'code') base.props = { language: out.language };
    if (out.stream) base.props = { ...base.props, stream: true };
    if (out.actions) base.props = { ...base.props, actions: out.actions };

    return base;
  });
}

function mapOutputType(type: string): string {
  const map: Record<string, string> = {
    text: 'text', markdown: 'markdown', code: 'code', json: 'json-view',
    html: 'text', image: 'image', video: 'text', audio: 'text',
    file: 'text', table: 'table', chart: 'text', diff: 'text',
    log: 'code', progress: 'progress', pdf: 'text', terminal: 'code',
  };
  return map[type] || 'text';
}

// ─── Action Components ─────────────────────────────────────────────
function buildActionComponents(tool: MCPToolDefinition, rules: { confirm: boolean; progress: boolean; cancel: boolean; auto: boolean }, apiBase: string): Component[] {
  const actions: Component[] = [];

  // Execute button
  actions.push({
    type: 'button',
    label: '执行',
    icon: 'Zap',
    variant: 'primary',
    onClick: {
      action: 'submit',
      endpoint: `${apiBase}/mcp/${tool.name}`,
      method: 'POST',
      body: buildRequestBody(tool),
    },
  });

  // Cancel button (if allowed)
  if (rules.cancel) {
    actions.push({
      type: 'button',
      label: '取消',
      icon: 'X',
      variant: 'ghost',
      onClick: { action: 'emit', event: 'cancel', payload: { tool: tool.name } },
    });
  }

  return actions;
}

// ─── Helpers ───────────────────────────────────────────────────────
function buildDefaultData(tool: MCPToolDefinition): Record<string, any> {
  const data: Record<string, any> = {};
  const params = tool.parameters?.properties || {};
  const hints = new Map((tool.ui?.inputs || []).map(h => [h.key, h]));

  for (const [key, schema] of Object.entries(params)) {
    const hint = hints.get(key);
    if (hint?.defaultValue !== undefined) {
      data[key] = hint.defaultValue;
    } else if ((schema as any)?.default !== undefined) {
      data[key] = (schema as any).default;
    } else {
      data[key] = (schema as any)?.type === 'boolean' ? false : '';
    }
  }
  return data;
}

function buildRequestBody(tool: MCPToolDefinition): Record<string, any> {
  const body: Record<string, any> = {};
  const params = tool.parameters?.properties || {};
  for (const key of Object.keys(params)) {
    body[key] = { $ref: `data.${key}` };
  }
  return body;
}

// ─── Batch: Bind Multiple Tools ────────────────────────────────────
export function bindToolsToSchemas(tools: MCPToolDefinition[], options: BindingOptions = {}): Map<string, UISchema> {
  const schemas = new Map<string, UISchema>();
  for (const tool of tools) {
    schemas.set(tool.name, bindToolToSchema(tool, options));
  }
  return schemas;
}

// ─── Generate Tool Menu ────────────────────────────────────────────
export interface ToolMenuItem {
  name: string;
  label: string;
  description: string;
  category: string;
  risk: RiskLevel;
  icon?: string;
  shortcut?: string;
}

export function generateToolMenu(tools: MCPToolDefinition[]): ToolMenuItem[] {
  return tools.map(tool => ({
    name: tool.name,
    label: tool.ui?.inputs?.[0]?.label || tool.name,
    description: tool.description,
    category: tool.ui?.category || 'custom',
    risk: tool.ui?.risk || 'low',
    icon: categoryIcon(tool.ui?.category),
    shortcut: tool.ui?.suggestedShortcut,
  }));
}

function categoryIcon(category?: string): string {
  const icons: Record<string, string> = {
    document: 'FileText', code: 'Terminal', search: 'Search',
    file: 'FolderOpen', network: 'Wifi', system: 'Settings',
    data: 'Database', media: 'Image', communication: 'Mail',
    security: 'Shield', custom: 'Zap',
  };
  return icons[category || 'custom'] || 'Zap';
}
