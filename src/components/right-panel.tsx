'use client';

import { useCallback } from 'react';
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

  // AI callback for browser control
  const handleBrowserAIAction = useCallback(async (
    context: { url: string; title: string; domSummary: string; interactiveElements: any[] },
    instruction: string,
  ) => {
    try {
      const res = await fetch('/api/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: context.domSummary,
          instruction,
          context: `URL: ${context.url}\n标题: ${context.title}\n\n${context.domSummary}`,
          mode: 'browser-action',
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.actions || null;
    } catch {
      return null;
    }
  }, []);

  // AI callback for text selection edit
  const handleSelectionAIEdit = useCallback(async (
    selectedText: string,
    instruction: string,
  ) => {
    try {
      const res = await fetch('/api/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText, instruction }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.result || null;
    } catch {
      return null;
    }
  }, []);

  return (
    <WorkspacePanel
      sessionId={sessionId}
      pageWorkspace={pageWorkspace as any}
      sessionDetails={sessionDetails}
      onBrowserAIAction={handleBrowserAIAction}
      onSelectionAIEdit={handleSelectionAIEdit}
      className="h-full"
    />
  );
}
