'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { X, Info, Settings, Activity, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────

export interface DetailItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}

export interface DetailSection {
  title: string;
  items: DetailItem[];
  actions?: ReactNode;
}

export interface DetailPanelProps {
  /** Title displayed at top */
  title: string;
  /** Subtitle/description */
  subtitle?: string;
  /** Icon displayed in header */
  icon?: ReactNode;
  /** Badge/label */
  badge?: string;
  /** Sections to display */
  sections?: DetailSection[];
  /** Custom content (overrides sections) */
  children?: ReactNode;
  /** Close handler */
  onClose?: () => void;
  /** Additional header actions */
  headerActions?: ReactNode;
  /** Additional class names */
  className?: string;
}

// ── Main Component ───────────────────────────────────────────────

export function DetailPanel({
  title,
  subtitle,
  icon,
  badge,
  sections,
  children,
  onClose,
  headerActions,
  className,
}: DetailPanelProps) {
  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 lg:p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-sm shrink-0">{icon}</span>}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{title}</span>
              {badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-4">
        {children || (
          sections?.map((section, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </h3>
                {section.actions}
              </div>
              <div className="space-y-1.5">
                {section.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    {item.icon && (
                      <span className="text-muted-foreground shrink-0 mt-0.5">
                        {item.icon}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">{item.label}</div>
                      <div className="text-sm truncate">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Hook for managing detail panel state ─────────────────────────

export function useDetailPanel() {
  const [detailItem, setDetailItem] = useState<{
    id: string;
    type: string;
    data: any;
  } | null>(null);

  const openDetail = (id: string, type: string, data: any) => {
    setDetailItem({ id, type, data });
  };

  const closeDetail = () => {
    setDetailItem(null);
  };

  return {
    detailItem,
    openDetail,
    closeDetail,
    isOpen: detailItem !== null,
  };
}
