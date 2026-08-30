'use client';

import { WorkspacePanel } from '@opensoulmate/openface';
import { useAppStore } from '@/stores/app-store';
import { useAIGroupsStore } from '@/stores/ai-groups-store';
import { usePathname } from 'next/navigation';

interface RightPanelProps {
  open: boolean;
  onToggle: () => void;
}

export function RightPanel({ open, onToggle }: RightPanelProps) {
  const pathname = usePathname();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const selectedGroup = useAIGroupsStore((s) => s.selectedGroup);
  const sessionId = pathname.startsWith('/ai-groups')
    ? (selectedGroup?.id || '__no_group__')
    : (activeSessionId || '__default__');

  const pageWorkspace = useAppStore((s) => s.pageWorkspace);
  const sessionDetails = useAppStore((s) => s.sessionDetails);

  return (
    <WorkspacePanel
      sessionId={sessionId}
      pageWorkspace={pageWorkspace as any}
      sessionDetails={sessionDetails}
      className="h-full"
    />
  );
}
