'use client';

import { cn } from '../lib/utils';

export type ChatViewType = 'messages' | 'files' | 'images' | 'videos' | 'audio' | 'links' | 'dates';

export interface ChatViewTab {
  value: ChatViewType;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface ChatViewToggleProps {
  activeView: ChatViewType;
  onViewChange: (view: ChatViewType) => void;
  tabs: ChatViewTab[];
  visible?: boolean;
  className?: string;
}

/* 裙摆形状：底部向外微微张开 */
function skirtPath(w: number, h: number): string {
  const r = 8, s = 6, bulge = 4, m = s + bulge;
  return [
    `M ${r} 0`,
    `Q 0 0 0 ${r}`,
    `L 0 ${h - s}`,
    `C 0 ${h} ${-m} ${h} ${-s} ${h}`,
    `L ${w + s} ${h}`,
    `C ${w + m} ${h} ${w} ${h} ${w} ${h - s}`,
    `L ${w} ${r}`,
    `Q ${w} 0 ${w - r} 0`,
    `Z`,
  ].join(' ');
}

export function ChatViewToggle({
  activeView,
  onViewChange,
  tabs,
  visible = true,
  className,
}: ChatViewToggleProps) {
  if (!visible) return null;

  return (
    <div className={cn('px-3 lg:px-6 pt-2', className)}>
      <div className="flex items-end gap-px overflow-x-auto chat-scrollbar pb-0">
        {tabs.map((tab) => {
          const isActive = activeView === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onViewChange(tab.value)}
              className={cn(
                'relative flex items-center gap-1.5 px-3.5 pt-2 pb-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              style={isActive ? { zIndex: 2 } : { zIndex: 1 }}
            >
              {/* 裙摆背景（仅激活时显示） */}
              {isActive && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ overflow: 'visible' }}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="skirt-active" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary) / 0.08)" />
                      <stop offset="100%" stopColor="hsl(var(--primary) / 0.15)" />
                    </linearGradient>
                  </defs>
                  <path
                    d={skirtPath(
                      Math.max(60, (tab.label.length + 4) * 12),
                      34
                    )}
                    fill="url(#skirt-active)"
                    stroke="hsl(var(--primary) / 0.25)"
                    strokeWidth="1"
                  />
                </svg>
              )}
              {/* 内容 */}
              <span className="relative z-10 flex items-center gap-1.5">
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      'px-1.5 rounded-full text-[10px] font-semibold leading-[16px] min-w-[18px] text-center',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted-foreground/10 text-muted-foreground'
                    )}
                  >
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {/* 底部基线 */}
        <div className="flex-1 border-b border-border/40 self-end h-0" />
      </div>
    </div>
  );
}
