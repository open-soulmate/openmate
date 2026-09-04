'use client';

import React from 'react';
import { cn } from '../../lib/utils';
import { Eye, EyeOff } from 'lucide-react';

// ─── SettingCard ─────────────────────────────────────────────────
export interface SettingCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingCard({ title, description, children, className }: SettingCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 space-y-3", className)}>
      <div>
        <h3 className="text-xs lg:text-sm font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────
export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      {label && <span className="text-xs lg:text-sm">{label}</span>}
      <button onClick={() => onChange(!checked)} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
    </div>
  );
}

// ─── SelectInput ─────────────────────────────────────────────────
export interface SelectInputProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export function SelectInput({ value, onChange, options }: SelectInputProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── ButtonGroup ─────────────────────────────────────────────────
export interface ButtonGroupProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ElementType }[];
}

export function ButtonGroup<T extends string>({ value, onChange, options }: ButtonGroupProps<T>) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 rounded-lg border border-border p-0.5 bg-muted/50">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all", value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.icon && <o.icon size={12} />}{o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Slider ──────────────────────────────────────────────────────
export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export function Slider({ value, onChange, min, max, step, unit }: SliderProps) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-primary" />
      <span className="text-xs lg:text-sm font-mono text-muted-foreground min-w-16 text-right">{value}{unit}</span>
    </div>
  );
}

// ─── TextInput ───────────────────────────────────────────────────
export interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

export function TextInput({ value, onChange, placeholder, type = "text" }: TextInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  return (
    <div className="relative">
      <input type={type === "password" && !showPassword ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30 pr-8" />
      {type === "password" && (
        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
}
