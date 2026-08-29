'use client';

import { useState, useRef, useEffect, useCallback, Fragment, type ReactNode, type MutableRefObject } from 'react';
import { X, Plus } from 'lucide-react';

// ── SVG Constants ─────────────────────────────────────────────────
const TOP_R = 12;
const SKIRT = 10;
const BULGE = 8;
const MARGIN = SKIRT + BULGE;

function genTabPath(w: number, h = 36) {
  const r = TOP_R, s = SKIRT, m = MARGIN;
  return [
    `M ${r} 0`,
    `Q 0 0 0 ${r}`,
    `L 0 ${h - s}`,
    `C 0 ${h} ${-m} ${h} ${-s} ${h}`,
    `M ${w + s} ${h}`,
    `C ${w + m} ${h} ${w} ${h} ${w} ${h - s}`,
    `L ${w} ${r}`,
    `Q ${w} 0 ${w - r} 0`,
    `L ${r} 0`,
  ].join(' ');
}

// ── Types ─────────────────────────────────────────────────────────
export interface SkirtTab {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Custom close handler; omit to hide close button */
  onClose?: () => void;
}

export interface SkirtTabsProps {
  tabs: SkirtTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  /** Called when the "+" button is clicked; omit to hide the button */
  onAddTab?: () => void;
  /** Custom render for tab content (icon + title + close); omit for default */
  renderTabContent?: (tab: SkirtTab, isActive: boolean) => ReactNode;
  /** Stroke color for active tab skirt outline */
  strokeColor?: string;
  /** Underline color for the two-segment line */
  underlineColor?: string;
  /** Tab height in px */
  tabHeight?: number;
  /** Min tab width */
  minWidth?: number;
  /** Max tab width */
  maxWidth?: number;
  /** Divider color between non-active tabs */
  dividerColor?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────
export function SkirtTabs({
  tabs,
  activeTabId,
  onTabChange,
  onAddTab,
  renderTabContent,
  strokeColor = '#27272a',
  underlineColor = '#27272a',
  dividerColor = '#333',
  tabHeight = 36,
  minWidth = 140,
  maxWidth = 240,
  className,
}: SkirtTabsProps) {
  const [tabWidths, setTabWidths] = useState<Record<string, number>>({});
  const [activeTabLeft, setActiveTabLeft] = useState(0);
  const [activeTabWidth, setActiveTabWidth] = useState(0);
  const [barLeft, setBarLeft] = useState(0);
  const [barRight, setBarRight] = useState(0);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const measureTab = useCallback((id: string, el: HTMLButtonElement) => {
    const w = el.offsetWidth;
    setTabWidths((prev) => (prev[id] === w ? prev : { ...prev, [id]: w }));
  }, []);

  // Calculate active tab position for underline segments
  useEffect(() => {
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
  }, [tabs, activeTabId, tabWidths]);

  // Recalculate on resize
  useEffect(() => {
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
    return () => window.removeEventListener('resize', recalc);
  }, []);

  const defaultRenderTab = (tab: SkirtTab, isActive: boolean) => (
    <>
      {tab.icon || <span className="w-4 h-4 shrink-0" />}
      <span className={`truncate flex-1 text-[13px] transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
        {tab.title}
      </span>
      {tab.onClose && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); tab.onClose!(); }}
          className="shrink-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-70 group-active:opacity-70 hover:!opacity-100 hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer touch-manipulation"
          style={{ width: 20, height: 20 }}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </span>
      )}
    </>
  );

  return (
    <div className={className}>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        className="flex items-end shrink-0 px-2"
        style={{ height: tabHeight, marginTop: 12, gap: 0, overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const nextTab = tabs[index + 1];
          const showDivider = !isActive && nextTab && nextTab.id !== activeTabId;
          return (
            <Fragment key={tab.id}>
            <button
              ref={(el) => {
                if (el) measureTab(tab.id, el);
                if (isActive) (activeTabRef as MutableRefObject<HTMLButtonElement | null>).current = el;
              }}
              onClick={() => onTabChange(tab.id)}
              className="group relative shrink-0 cursor-pointer touch-manipulation"
              style={{
                height: tabHeight,
                minWidth,
                maxWidth,
                display: 'flex',
                alignItems: 'center',
                border: 'none',
                outline: 'none',
                padding: 0,
                background: 'transparent',
                overflow: 'visible',
              }}
            >
              {tabWidths[tab.id] && (
                <svg
                  className="absolute pointer-events-none"
                  style={{ left: -MARGIN, width: tabWidths[tab.id] + MARGIN * 2, height: tabHeight, overflow: 'visible' }}
                  viewBox={`${-MARGIN} 0 ${tabWidths[tab.id] + MARGIN * 2} ${tabHeight}`}
                >
                  <path
                    d={genTabPath(tabWidths[tab.id], tabHeight)}
                    fill="none"
                    stroke={isActive ? strokeColor : 'transparent'}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    style={{ transition: 'stroke 0.15s' }}
                  />
                </svg>
              )}
              <div className="relative flex items-center w-full h-full z-10" style={{ padding: '0 12px', gap: 8 }}>
                {renderTabContent ? renderTabContent(tab, isActive) : defaultRenderTab(tab, isActive)}
              </div>
            </button>
            {showDivider && (
              <div className="shrink-0 self-center" style={{ width: 1, height: 20, background: dividerColor, margin: '0 2px' }} />
            )}
            </Fragment>
          );
        })}
        {onAddTab && (
          <button
            onClick={onAddTab}
            className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground transition-colors touch-manipulation mb-0.5 ml-1"
            title="New tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Underline: two segments, gap under skirt */}
      <div className="relative shrink-0" style={{ height: 1, marginTop: -1 }}>
        <div
          className="absolute top-0 left-0"
          style={{ height: 1, background: underlineColor, width: Math.max(0, activeTabLeft - barLeft - SKIRT - 1) }}
        />
        <div
          className="absolute top-0 right-0"
          style={{ height: 1, background: underlineColor, width: Math.max(0, barRight - activeTabLeft - activeTabWidth - SKIRT - 1) }}
        />
      </div>
    </div>
  );
}
