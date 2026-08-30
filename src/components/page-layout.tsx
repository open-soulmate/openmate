'use client';

import { useSidebar } from '@/components/ui/sidebar';
import { MainPanel, type MainPanelProps } from '@opensoulmate/openface';

/**
 * OpenMate's PageLayout wrapper (bridges to openface MainPanel).
 * Bridges shadcn/ui sidebar state into @opensoulmate/openface's MainPanel.
 * All pages should import PageLayout from '@/components/page-layout'.
 */
export function PageLayout(props: MainPanelProps) {
  const { open: sidebarOpen, toggleSidebar } = useSidebar();

  return (
    <MainPanel
      {...props}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
    />
  );
}

export type { MainPanelProps as PageLayoutProps };
