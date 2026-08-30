'use client';

import { useSidebar } from '@/components/ui/sidebar';
import { PageLayout as OpenFacePageLayout, type PageLayoutProps } from '@opensoulmate/openface';

/**
 * OpenMate's PageLayout wrapper.
 * Bridges shadcn/ui sidebar state into @opensoulmate/openface's PageLayout.
 * All pages should import from '@/components/page-layout' — this file is the single bridge.
 */
export function PageLayout(props: PageLayoutProps) {
  const { open: sidebarOpen, toggleSidebar } = useSidebar();

  return (
    <OpenFacePageLayout
      {...props}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={toggleSidebar}
    />
  );
}

export type { PageLayoutProps };
