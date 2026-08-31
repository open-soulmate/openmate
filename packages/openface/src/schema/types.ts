// OpenFace UI Schema Types v1.0
// Declarative UI format for dynamic rendering

export type ComponentType =
  // Layout
  | 'page' | 'panel' | 'card' | 'tabs' | 'grid' | 'flex' | 'divider' | 'spacer'
  // Input
  | 'text-input' | 'number-input' | 'textarea' | 'select' | 'multi-select'
  | 'toggle' | 'checkbox' | 'radio-group' | 'slider' | 'button-group'
  | 'color-picker' | 'file-upload' | 'date-picker'
  // Display
  | 'text' | 'heading' | 'badge' | 'progress' | 'code' | 'image'
  | 'markdown' | 'json-view' | 'table' | 'stat'
  // Action
  | 'button' | 'icon-button' | 'link' | 'dropdown-menu';

export type DataRef = { $ref: string };

export type ValueBinding = any | DataRef;

export interface Option {
  value: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  description?: string;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: any;
  message: string;
}

export interface Condition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'empty' | 'notEmpty';
  value: any;
}

export interface EventAction {
  action: 'update' | 'submit' | 'navigate' | 'fetch' | 'emit' | 'validate' | 'custom';
  target?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any>;
  headers?: Record<string, string>;
  url?: string;
  event?: string;
  payload?: any;
  fields?: string[];
  onSuccess?: EventAction;
  onError?: EventAction;
  loadingRef?: string;
}

export interface Component {
  type: ComponentType | string;
  id?: string;
  width?: string;
  className?: string;
  label?: string;
  placeholder?: string;
  description?: string;
  value?: ValueBinding;
  defaultValue?: any;
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  validation?: ValidationRule[];
  onChange?: EventAction;
  onClick?: EventAction;
  onSubmit?: EventAction;
  children?: Component[];
  visibleWhen?: Condition;
  disabledWhen?: Condition;
  // Type-specific props
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  src?: string;
  content?: string;
  columns?: number;
  gap?: number;
  direction?: 'row' | 'column';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  tabs?: { id: string; label: string; children: Component[] }[];
  headers?: string[];
  rows?: any[][];
  // Custom pass-through
  props?: Record<string, any>;
}

export interface UISchema {
  version: '1.0';
  id: string;
  title?: string;
  description?: string;
  data?: Record<string, any>;
  children: Component[];
  events?: Record<string, EventAction>;
}

// Runtime context for data binding
export interface SchemaContext {
  data: Record<string, any>;
  env?: Record<string, any>;
  response?: Record<string, any>;
  loading?: Record<string, boolean>;
  errors?: Record<string, string>;
}
