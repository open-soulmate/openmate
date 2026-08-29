import { create } from "zustand";

// ─── UI Layout State (subset of full app store) ─────────────────────────────
// Only the layout-related state needed by @opensoulmate/openface components.
// Extend this store or merge with a larger app store as needed.

interface AppLayoutState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Right workspace panel
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;

  // Page-specific sidebar/workspace content (for PageLayout framework)
  pageSidebar: React.ReactNode | null;
  pageWorkspace: React.ReactNode | null;
  setPageSidebar: (content: React.ReactNode | null) => void;
  setPageWorkspace: (content: React.ReactNode | null) => void;
}

export const useAppStore = create<AppLayoutState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  rightPanelOpen: false,
  toggleRightPanel: () =>
    set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open: boolean) =>
    set({ rightPanelOpen: open }),

  pageSidebar: null,
  pageWorkspace: null,
  setPageSidebar: (content) => set({ pageSidebar: content }),
  setPageWorkspace: (content) => set({ pageWorkspace: content }),
}));
