'use client';

import { useLayoutEffect, useRef, useState, Fragment, type MutableRefObject } from 'react';
import { cn } from '../lib/utils';

export type ChatViewType = 'messages' | 'files' | 'images' | 'videos' | 'audio' | 'links' | 'dates';

export interface ChatViewTab {
  value: ChatViewType;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface ChatViewToggleProps {
  value: ChatViewType;
  onChange: (view: ChatViewType) => void;
  tabs: ChatViewTab[];
  className?: string;
}

const TAB_H = 32;
const MIN_W = 60;
const MAX_W = 200;
const MARGIN = 8;
const SKIRT = 6;

function genTabPath(w: number, h: number) {
  const r = Math.min(6, w / 2);
  const m = Math.min(4, r);
  const outerL = -MARGIN;
  const outerR = w + MARGIN;
  const outerSkirtY = h + 2;
  return [
    `M ${-MARGIN} ${outerSkirtY}`,
    `L ${-MARGIN} ${r}`,
    `Q ${-MARGIN} 0 ${-MARGIN + r} 0`,
    `L ${-m} 0`,
    `Q 0 0 0 ${m}`,
    `L 0 ${h - r}`,
    `Q 0 ${h} ${r} ${h}`,
    `L ${w - r} ${h}`,
    `Q ${w} ${h} ${w} ${h - r}`,
    `L ${w} ${m}`,
    `Q ${w} 0 ${w + m} 0`,
    `L ${outerR - r} 0`,
    `Q ${outerR} 0 ${outerR} ${r}`,
    `L ${outerR} ${outerSkirtY}`,
  ].join(' ');
}

export function ChatViewToggle({ value, onChange, tabs, className }: ChatViewToggleProps) {
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const [tabWidths, setTabWidths] = useState<Record<string, number>>({});
  const [activeTabLeft, setActiveTabLeft] = useState(0);
  const [activeTabWidth, setActiveTabWidth] = useState(0);
  const [barLeft, setBarLeft] = useState(0);
  const [barRight, setBarRight] = useState(0);

  const measureTab = (id: string, el: HTMLElement) => {
    const w = el.getBoundingClientRect().width;
    setTabWidths(prev => {
      if (prev[id] === w) return prev;
      return { ...prev, [id]: w };
    });
  };

  useLayoutEffect(() => {
    const calc = () => {
      if (!tabBarRef.current || !activeTabRef.current) return;
      const barRect = tabBarRef.current.getBoundingClientRect();
      const tabRect = activeTabRef.current.getBoundingClientRect();
      setBarLeft(barRect.left);
      setBarRight(barRect.right);
      setActiveTabLeft(tabRect.left);
      setActiveTabWidth(tabRect.width);
    };
    calc();
    requestAnimationFrame(calc);
  }, [tabs, value, tabWidths]);

  useLayoutEffect(() => {
    const recalc = () => {
      if (!tabBarRef.current || !activeTabRef.current) return;
      const barRect = tabBarRef.current.getBoundingClientRect();
      const tabRect = activeTabRef.current.getBoundingClientRect();
      setBarLeft(barRect.left);
      setBarRight(barRect.right);
      setActiveTabLeft(tabRect.left);
      setActiveTabWidth(tabRect.width);
    };
    window.addEventListener('resize', recalc);
    const ro = new ResizeObserver(recalc);
    if (tabBarRef.current) ro.observe(tabBarRef.current);
    return () => { window.removeEventListener('resize', recalc); ro.disconnect(); };
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        className="flex items-end shrink-0 px-2"
        style={{ height: TAB_H, marginTop: 12, gap: 0, overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.value === value;
          const nextTab = tabs[index + 1];
          const showDivider = !isActive && nextTab && nextTab.value !== value;
          return (
            <Fragment key={tab.value}>
            <button
              ref={(el) => {
                if (el) measureTab(tab.value, el);
                if (isActive) (activeTabRef as MutableRefObject<HTMLButtonElement | null>).current = el;
              }}
              onClick={() => onChange(tab.value)}
              className="group relative shrink cursor-pointer touch-manipulation min-w-0"
              style={{
                height: TAB_H,
                minWidth: Math.max(MIN_W, Math.min(MAX_W, Math.floor((tabBarRef.current?.clientWidth || 600) / tabs.length) - 10)),
                maxWidth: MAX_W,
                flex: '0 1 auto',
                alignItems: 'center',
                border: 'none',
                outline: 'none',
                padding: 0,
                background: 'transparent',
                overflow: 'visible',
              }}
            >
              {(tabWidths[tab.value] ?? 0) && (
                <svg
                  className="absolute pointer-events-none"
                  style={{ left: -MARGIN, width: (tabWidths[tab.value] ?? 0)! + MARGIN * 2, height: TAB_H, overflow: 'visible' }}
                  viewBox={`${-MARGIN} -1 ${(tabWidths[tab.value] ?? 0)! + MARGIN * 2} ${TAB_H + 1}`}
                >
                  <path
                    d={genTabPath((tabWidths[tab.value] ?? 0)!, TAB_H)}
                    fill="none"
                    strokeWidth={1}
                    strokeLinejoin="round"
                    style={{ stroke: isActive ? 'var(--color-border, var(--border))' : 'transparent', transition: 'stroke 0.15s' }}
                  />
                </svg>
              )}
              <div className="relative flex items-center w-full h-full z-10" style={{ padding: '0 12px', gap: 8 }}>
                {tab.icon || <span className="w-4 h-4 shrink-0" />}
                <span className={cn('truncate flex-1 text-[13px] transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                  {tab.label}
                </span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={cn(
                    'shrink-0 text-[10px] px-1.5 py-0 rounded-full font-medium min-w-[18px] text-center',
                    isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
            {showDivider && (
              <div className="shrink-0 self-center" style={{ width: 1, height: 20, background: 'var(--color-border, var(--border))', margin: '0 2px', opacity: 0.5 }} />
            )}
            </Fragment>
          );
        })}
      </div>

      {/* Underline: two segments, gap under skirt */}
      <div className="relative shrink-0" style={{ height: 1, marginTop: -1 }}>
        <div
          className="absolute top-0 left-0"
          style={{ height: 1, background: 'var(--color-border, var(--border))', width: Math.max(0, activeTabLeft - barLeft - SKIRT) }}
        />
        <div
          className="absolute top-0"
          style={{ height: 1, background: 'var(--color-border, var(--border))', left: activeTabLeft - barLeft + activeTabWidth + SKIRT, right: 0 }}
        />
      </div>
    </div>
  );
}
