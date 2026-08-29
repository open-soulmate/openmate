'use client';

import { useEffect, type ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useAppStore } from '@/stores/app-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────

export interface PageLayoutProps {
  /** Page title displayed in header */
  title?: string;
  /** Icon/emoji displayed before title */
  icon?: ReactNode;
  /** Badge/label displayed after title */
  badge?: string;
  /** Right workspace content (optional, defaults to global workspace tabs) */
  workspace?: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Additional header actions (buttons, etc.) */
  headerActions?: ReactNode;
  /** Custom header content (replaces default title+actions) */
  header?: ReactNode;
  /** Whether to show sidebar toggle button (default: true) */
  showSidebarToggle?: boolean;
  /** Whether to show workspace toggle button (default: true) */
  showWorkspaceToggle?: boolean;
  /** Additional class names for the root container */
  className?: string;
}

// ── Default Header ───────────────────────────────────────────────

function DefaultHeader({
  title,
  icon,
  badge,
  headerActions,
  showSidebarToggle,
  showWorkspaceToggle,
}: {
  title?: string;
  icon?: ReactNode;
  badge?: string;
  headerActions?: ReactNode;
  showSidebarToggle: boolean;
  showWorkspaceToggle: boolean;
}) {
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  const isMobile = useIsMobile();

  const handleToggleSidebar = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSidebar();
    if (isMobile) {
      setRightPanelOpen(false);
    }
  };

  const handleToggleWorkspace = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRightPanel();
    if (isMobile && sidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <div className="h-12 border-b border-border flex items-center px-3 lg:px-4 justify-between shrink-0">
      {/* Left: sidebar toggle + title */}
      <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-1">
        {showSidebarToggle && (
          <button
            onClick={handleToggleSidebar}
            className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation"
            aria-label="Toggle Sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        {icon && <span className="text-sm shrink-0">{icon}</span>}
        {title && (
          <span className="font-medium text-sm truncate">{title}</span>
        )}
        {badge && (
          <span className="text-[10px] lg:text-xs text-muted-foreground px-1 lg:px-1.5 py-0.5 rounded bg-muted shrink-0 truncate max-w-[80px] lg:max-w-none">
            {badge}
          </span>
        )}
      </div>

      {/* Right: actions + workspace toggle */}
      <div className="flex items-center gap-1 shrink-0">
        {headerActions}
        {showWorkspaceToggle && (
          <button
            onClick={handleToggleWorkspace}
            className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation"
            aria-label="Toggle Workspace"
          >
            <PanelLeft className="w-4 h-4 scale-x-[-1]" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function PageLayout({
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
}: PageLayoutProps) {
  // Register page-specific workspace content
  const setPageWorkspace = useAppStore((s) => s.setPageWorkspace);
  
  useEffect(() => {
    setPageWorkspace(workspace ?? null);
    return () => setPageWorkspace(null);
  }, [workspace, setPageWorkspace]);

  return (
    <div className={cn("flex flex-1 min-h-0 relative", className)}>
      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        {header || (
          <DefaultHeader
            title={title}
            icon={icon}
            badge={badge}
            headerActions={headerActions}
            showSidebarToggle={showSidebarToggle}
            showWorkspaceToggle={showWorkspaceToggle}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
