// OpenFace MCP UI Extension Types v1.0
// Extends standard MCP tool definitions with UI rendering hints

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ToolCategory =
  | 'document' | 'code' | 'search' | 'file' | 'network'
  | 'system' | 'data' | 'media' | 'communication' | 'security' | 'custom';

export type InputType =
  | 'text' | 'number' | 'textarea' | 'select' | 'multi-select'
  | 'toggle' | 'checkbox' | 'slider' | 'file' | 'folder'
  | 'date' | 'color' | 'json' | 'code' | 'password' | 'url' | 'email';

export type OutputType =
  | 'text' | 'markdown' | 'code' | 'json' | 'html' | 'image'
  | 'video' | 'audio' | 'file' | 'table' | 'chart' | 'diff'
  | 'log' | 'progress' | 'pdf' | 'terminal';

export interface OptionHint {
  value: string;
  label: string;
  icon?: string;
  description?: string;
  disabled?: boolean;
  deprecated?: boolean;
}

export interface InputHint {
  key: string;
  type?: InputType;
  label?: string;
  placeholder?: string;
  description?: string;
  accept?: string[];
  multiple?: boolean;
  options?: OptionHint[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  defaultValue?: any;
  required?: boolean;
  validation?: string;
  group?: string;
  order?: number;
}

export interface OutputAction {
  label: string;
  icon?: string;
  action: 'copy' | 'download' | 'open-external' | 'send-to' | 'custom';
  target?: string;
  customEndpoint?: string;
}

export interface OutputHint {
  key: string;
  type?: OutputType;
  label?: string;
  language?: string;
  downloadable?: boolean;
  previewable?: boolean;
  copyable?: boolean;
  stream?: boolean;
  actions?: OutputAction[];
}

export interface MCPToolUI {
  category?: ToolCategory;
  risk?: RiskLevel;
  tags?: string[];
  inputs?: InputHint[];
  outputs?: OutputHint[];
  confirmBeforeExecute?: boolean;
  showProgress?: boolean;
  allowCancel?: boolean;
  autoExecute?: boolean;
  suggestedShortcut?: string;
  layout?: 'form' | 'single-action' | 'dashboard' | 'wizard';
  size?: 'compact' | 'normal' | 'fullscreen';
  streaming?: boolean;
  streamTarget?: string;
}

// Standard MCP tool definition with UI extension
export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    required?: string[];
    properties: Record<string, any>;
  };
  ui?: MCPToolUI;
}

// MCP result with optional UI hints
export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
  _ui?: {
    toast?: { type: 'success' | 'error' | 'warning' | 'info'; message: string };
    refresh?: string[];
    openPreview?: string;
    navigate?: string;
    emit?: { event: string; payload: any };
  };
}

export interface MCPContent {
  type: 'text' | 'image' | 'file' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  name?: string;
  uri?: string;
}
