'use client';

// OpenFace Schema Renderer — recursively renders UI from JSON Schema
// This is the core of OpenFace's "empty shell" architecture

import React, { useState, useCallback } from 'react';
import type { UISchema, Component, SchemaContext, EventAction } from './types';
import { resolveValue, resolveBody, evaluateCondition } from './resolver';
// cn helper
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// ─── Icon mapping (Lucide) ─────────────────────────────────────────
import {
  Moon, Sun, Palette, Monitor, Save, Bot, Cpu, Globe, Key,
  HardDrive, Info, Wrench, Sliders, Check, X, Plus, Minus,
  RefreshCw, Download, Upload, Trash2, ExternalLink, Terminal,
  Wifi, FolderOpen, Gauge, RotateCcw, Zap, ChevronRight,
  CheckCircle2, AlertCircle, LogOut, User, Settings, Menu,
  Search, Filter, Copy, Eye, EyeOff, ArrowRight, ArrowLeft,
  ChevronDown, ChevronUp, MoreHorizontal, Bell, Shield,
} from 'lucide-react';

const ICONS: Record<string, React.ElementType> = {
  Moon, Sun, Palette, Monitor, Save, Bot, Cpu, Globe, Key,
  HardDrive, Info, Wrench, Sliders, Check, X, Plus, Minus,
  RefreshCw, Download, Upload, Trash2, ExternalLink, Terminal,
  Wifi, FolderOpen, Gauge, RotateCcw, Zap, ChevronRight,
  CheckCircle2, AlertCircle, LogOut, User, Settings, Menu,
  Search, Filter, Copy, Eye, EyeOff, ArrowRight, ArrowLeft,
  ChevronDown, ChevronUp, MoreHorizontal, Bell, Shield,
};

function getIcon(name?: string): React.ElementType | null {
  if (!name) return null;
  return ICONS[name] || null;
}

// ─── Event handler ─────────────────────────────────────────────────
type EventHandler = (action: EventAction, value?: any) => void;

function useEventHandler(
  context: SchemaContext,
  setContext: React.Dispatch<React.SetStateAction<SchemaContext>>,
  onEvent?: (event: string, payload: any) => void,
): EventHandler {
  return useCallback((action: EventAction, value?: any) => {
    switch (action.action) {
      case 'update':
        if (action.target) {
          setContext(prev => ({
            ...prev,
            data: { ...prev.data, [action.target!]: value },
          }));
        }
        break;
      case 'fetch':
      case 'submit':
        if (action.endpoint) {
          const body = resolveBody(action.body, context);
          setContext(prev => ({ ...prev, loading: { ...prev.loading, [action.endpoint!]: true } }));
          fetch(action.endpoint, {
            method: action.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...action.headers },
            body: action.method === 'GET' ? undefined : JSON.stringify(body),
          })
            .then(r => r.json())
            .then(data => {
              if (action.onSuccess) { /* handled recursively */ setContext(prev => ({ ...prev, response: data })); }
            })
            .catch(err => {
              if (action.onError) { setContext(prev => ({ ...prev, errors: { ...prev.errors, _last: err.message } })); }
            })
            .finally(() => {
              setContext(prev => ({ ...prev, loading: { ...prev.loading, [action.endpoint!]: false } }));
            });
        }
        break;
      case 'navigate':
        if (action.url) window.location.href = action.url;
        break;
      case 'emit':
        onEvent?.(action.event || 'custom', action.payload || value);
        break;
    }
  }, [context, setContext, onEvent]);
}

// ─── Component Renderer ────────────────────────────────────────────
interface RenderProps {
  component: Component;
  context: SchemaContext;
  handleEvent: EventHandler;
}

function SchemaComponent({ component, context, handleEvent }: RenderProps): React.ReactNode {
  // Conditional rendering
  if (component.visibleWhen && !evaluateCondition(
    component.visibleWhen.field,
    component.visibleWhen.operator,
    component.visibleWhen.value,
    context,
  )) {
    return null;
  }

  const disabled = component.disabledWhen
    ? evaluateCondition(component.disabledWhen.field, component.disabledWhen.operator, component.disabledWhen.value, context)
    : false;

  const value = component.value !== undefined ? resolveValue(component.value, context) : component.defaultValue;
  const Icon = getIcon(component.icon);

  switch (component.type) {
    // ─── Layout ──────────────────────────────
    case 'page':
      return (
        <div className="space-y-6">
          {component.label && <h1 className="text-2xl font-bold">{component.label}</h1>}
          {component.description && <p className="text-muted-foreground">{component.description}</p>}
          {component.children?.map((child, i) => (
            <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
          ))}
        </div>
      );

    case 'panel':
      return (
        <div className="space-y-4">
          {component.label && <h2 className="text-lg font-semibold">{component.label}</h2>}
          {component.children?.map((child, i) => (
            <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
          ))}
        </div>
      );

    case 'card':
      return (
        <div className={cn("rounded-xl border border-border bg-card/50 p-4 space-y-3", component.className)}>
          {component.label && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">{component.label}</h3>
              {component.description && <p className="text-xs text-muted-foreground">{component.description}</p>}
            </div>
          )}
          {component.children?.map((child, i) => (
            <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
          ))}
        </div>
      );

    case 'grid':
      return (
        <div className={cn("grid gap-4", component.columns === 2 ? "grid-cols-2" : component.columns === 3 ? "grid-cols-3" : "grid-cols-1")}>
          {component.children?.map((child, i) => (
            <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
          ))}
        </div>
      );

    case 'flex':
      return (
        <div className={cn("flex gap-3", component.direction === 'column' ? 'flex-col' : 'flex-row', component.className)}>
          {component.children?.map((child, i) => (
            <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
          ))}
        </div>
      );

    case 'tabs':
      return <TabsRenderer component={component} context={context} handleEvent={handleEvent} />;

    case 'divider':
      return <div className="border-t border-border my-4" />;

    case 'spacer':
      return <div style={{ height: component.props?.height || 16 }} />;

    // ─── Input ───────────────────────────────
    case 'text-input':
    case 'number-input':
      return (
        <div className="space-y-1.5">
          {component.label && <label className="text-xs font-medium text-muted-foreground">{component.label}</label>}
          <input
            type={component.type === 'number-input' ? 'number' : 'text'}
            value={value || ''}
            placeholder={component.placeholder}
            disabled={disabled}
            min={component.min}
            max={component.max}
            step={component.step}
            onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, 
              component.type === 'number-input' ? Number(e.target.value) : e.target.value)}
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {context.errors?.[component.id || ''] && (
            <p className="text-xs text-red-500">{context.errors[component.id || '']}</p>
          )}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          {component.label && <label className="text-xs font-medium text-muted-foreground">{component.label}</label>}
          <textarea
            value={value || ''}
            placeholder={component.placeholder}
            disabled={disabled}
            rows={component.props?.rows || 4}
            onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, e.target.value)}
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1.5">
          {component.label && <label className="text-xs font-medium text-muted-foreground">{component.label}</label>}
          <select
            value={value || ''}
            disabled={disabled}
            onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, e.target.value)}
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {component.options?.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
            ))}
          </select>
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <div>
            {component.label && <span className="text-sm">{component.label}</span>}
            {component.description && <p className="text-xs text-muted-foreground">{component.description}</p>}
          </div>
          <button
            disabled={disabled}
            onClick={() => handleEvent(component.onChange || { action: 'update', target: component.id }, !value)}
            className={cn("relative w-10 h-5 rounded-full transition-colors", value ? "bg-primary" : "bg-muted")}
          >
            <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", value ? "left-5" : "left-0.5")} />
          </button>
        </div>
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            disabled={disabled}
            onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm">{component.label}</span>
        </label>
      );

    case 'button-group':
      return (
        <div className="space-y-1.5">
          {component.label && <label className="text-xs font-medium text-muted-foreground">{component.label}</label>}
          <div className="flex gap-1 flex-wrap">
            {component.options?.map(opt => {
              const OptIcon = getIcon(opt.icon);
              return (
                <button
                  key={opt.value}
                  disabled={disabled || opt.disabled}
                  onClick={() => handleEvent(component.onChange || { action: 'update', target: component.id }, opt.value)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors",
                    value === opt.value ? "bg-primary/15 text-primary border border-primary/30" : "border border-border hover:bg-muted/50"
                  )}
                >
                  {OptIcon && <OptIcon size={13} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-1.5">
          {component.label && (
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">{component.label}</label>
              <span className="text-xs text-muted-foreground">{value}</span>
            </div>
          )}
          <input
            type="range"
            min={component.min || 0}
            max={component.max || 100}
            step={component.step || 1}
            value={value || 0}
            disabled={disabled}
            onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      );

    case 'file-upload':
      return (
        <div className="space-y-1.5">
          {component.label && <label className="text-xs font-medium text-muted-foreground">{component.label}</label>}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{component.placeholder || '点击或拖拽文件到此处'}</p>
            <input
              type="file"
              accept={component.props?.accept}
              multiple={component.props?.multiple}
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={e => handleEvent(component.onChange || { action: 'update', target: component.id }, e.target.files)}
            />
          </div>
        </div>
      );

    // ─── Display ─────────────────────────────
    case 'text':
      return <p className={cn("text-sm", component.className)}>{component.content || value || component.label}</p>;

    case 'heading':
      return <h3 className={cn("text-lg font-semibold", component.className)}>{component.content || component.label}</h3>;

    case 'badge':
      return (
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
          component.variant === 'primary' ? "bg-primary/15 text-primary" :
          component.variant === 'danger' ? "bg-red-500/15 text-red-500" :
          "bg-muted text-muted-foreground"
        )}>
          {Icon && <Icon size={12} className="mr-1" />}
          {component.label || value}
        </span>
      );

    case 'progress':
      return (
        <div className="space-y-1">
          {component.label && <span className="text-xs text-muted-foreground">{component.label}</span>}
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${value || 0}%` }} />
          </div>
        </div>
      );

    case 'stat':
      return (
        <div className="text-center p-3">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{component.label}</div>
        </div>
      );

    case 'code':
      return (
        <pre className="p-3 rounded-lg bg-muted/50 text-xs font-mono overflow-x-auto">
          <code>{component.content || value}</code>
        </pre>
      );

    case 'table':
      return <TableRenderer component={component} context={context} />;

    // ─── Action ──────────────────────────────
    case 'button':
      return (
        <button
          disabled={disabled}
          onClick={() => {
            if (component.onClick) handleEvent(component.onClick, value);
            else if (component.id) handleEvent({ action: 'update', target: component.id }, value);
          }}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors",
            component.variant === 'primary' ? "bg-primary text-primary-foreground hover:bg-primary/90" :
            component.variant === 'danger' ? "bg-red-500 text-white hover:bg-red-600" :
            component.variant === 'ghost' ? "hover:bg-muted/50" :
            "border border-border hover:bg-muted/50"
          )}
        >
          {Icon && <Icon size={14} />}
          {component.label}
        </button>
      );

    case 'link':
      return (
        <a
          href={component.props?.href || value}
          target={component.props?.target || '_blank'}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          {component.label}
          <ExternalLink size={12} />
        </a>
      );

    default:
      return (
        <div className="p-2 rounded border border-dashed border-yellow-500/50 text-xs text-yellow-500">
          Unknown component type: {component.type}
        </div>
      );
  }
}

// ─── Tabs sub-renderer ─────────────────────────────────────────────
function TabsRenderer({ component, context, handleEvent }: RenderProps) {
  const [activeTab, setActiveTab] = useState(component.tabs?.[0]?.id || '');
  const tabs = component.tabs || [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn("px-3 py-2 text-xs border-b-2 transition-colors",
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {tabs.find(t => t.id === activeTab)?.children.map((child, i) => (
          <SchemaComponent key={child.id || i} component={child} context={context} handleEvent={handleEvent} />
        ))}
      </div>
    </div>
  );
}

// ─── Table sub-renderer ────────────────────────────────────────────
function TableRenderer({ component }: { component: Component; context: SchemaContext }) {
  const headers = component.headers || [];
  const rows = component.rows || [];

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-xs">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main SchemaRenderer ───────────────────────────────────────────
export interface SchemaRendererProps {
  schema: UISchema;
  env?: Record<string, any>;
  onEvent?: (event: string, payload: any) => void;
  className?: string;
}

export function SchemaRenderer({ schema, env, onEvent, className }: SchemaRendererProps) {
  const [context, setContext] = useState<SchemaContext>({
    data: schema.data || {},
    env,
    loading: {},
    errors: {},
  });

  const handleEvent = useEventHandler(context, setContext, onEvent);

  return (
    <div className={cn("space-y-4", className)}>
      {schema.children.map((component, i) => (
        <SchemaComponent
          key={component.id || i}
          component={component}
          context={context}
          handleEvent={handleEvent}
        />
      ))}
    </div>
  );
}
