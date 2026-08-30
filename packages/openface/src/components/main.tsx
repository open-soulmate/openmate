'use client';

import { useEffect, type ReactNode } from 'react';
import { MainHeader } from './main-header';
import { useAppStore } from '../store/app-store';
import { useIsMobile } from '../hooks/use-mobile';
import { cn } from '../lib/utils';

// ── Types ────────────────────────────────────────────────────────

export interface MainProps {
  /** Page title displayed in banner */
  title?: string;
  /** Icon/emoji displayed before title */
  icon?: ReactNode;
  /** Badge/label displayed after title */
  badge?: string;
  /** Right panel content (optional, defaults to global workspace tabs) */
  workspace?: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Additional banner actions (buttons, etc.) */
  headerActions?: ReactNode;
  /** Custom banner content (replaces default MainHeader) */
  header?: ReactNode;
  /** Whether to show left panel toggle button (default: true) */
  showSidebarToggle?: boolean;
  /** Whether to show right panel toggle button (default: true) */
  showWorkspaceToggle?: boolean;
  /** Additional class names for the root container */
  className?: string;
  /** Left panel open state — consumer manages this */
  sidebarOpen?: boolean;
  /** Toggle left panel callback — consumer manages this */
  onToggleSidebar?: () => void;
}

// ── Main Component ───────────────────────────────────────────────

export function Main({
  title,
  icon,
  badge,
  workspace,
  children,
  headerActions,
  header,
  showSidebarToggle = true,
  showWorkspaceToggle = true,
  className,
  sidebarOpen,
  onToggleSidebar,
}: MainProps) {
  // Register page-specific workspace content
  const setPageWorkspace = useAppStore((s) => s.setPageWorkspace);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  const isMobile = useIsMobile();

  useEffect(() => {
    setPageWorkspace(workspace ?? null);
    return () => setPageWorkspace(null);
  }, [workspace, setPageWorkspace]);

  const handleToggleLeft = () => {
    onToggleSidebar?.();
    if (isMobile) {
      setRightPanelOpen(false);
    }
  };

  const handleToggleRight = () => {
    toggleRightPanel();
    if (isMobile && sidebarOpen) {
      onToggleSidebar?.();
    }
  };

  return (
    <div className={cn('flex flex-1 min-h-0 relative', className)}>
      <div className="flex flex-1 flex-col min-w-0">
        {/* Banner */}
        {header || (
          <MainHeader
            title={title}
            icon={icon}
            badge={badge}
            actions={headerActions}
            showLeftToggle={showSidebarToggle}
            showRightToggle={showWorkspaceToggle}
            onToggleLeft={handleToggleLeft}
            onToggleRight={handleToggleRight}
          />
        )}

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
