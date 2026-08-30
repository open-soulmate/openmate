'use client';

import { useSidebar } from '@/components/ui/sidebar';
import { Main, type MainProps } from '@opensoulmate/openface';

/**
 * OpenMate's PageLayout wrapper (bridges to openface Main).
 * Bridges shadcn/ui sidebar state into @opensoulmate/openface's Main component.
 * All pages should import PageLayout from '@/components/page-layout'.
 */
export function PageLayout(props: MainProps) {
  const { open: sidebarOpen, toggleSidebar } = useSidebar();

  return (
    <Main
      {...props}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
    />
  );
}

export type { MainProps as PageLayoutProps };
