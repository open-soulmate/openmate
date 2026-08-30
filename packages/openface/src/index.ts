// @opensoulmate/openface — Soulmate Design System

// Components
export { MainPanel } from './components/main-panel';
export type { MainPanelProps } from './components/main-panel';
export { LeftPanel } from './components/left-panel';
export { RightPanel, useRightPanel } from './components/right-panel';
export type { RightPanelProps, RightPanelSection, RightPanelItem } from './components/right-panel';

export { TopBar } from './components/top-bar';
export type { TopBarProps } from './components/top-bar';

export { BottomBar } from './components/bottom-bar';
export type { BottomBarProps } from './components/bottom-bar';

// Hooks
export { useIsMobile, useMediaQuery } from './hooks/use-mobile';
export { useResizeObserver } from './hooks/use-resize-observer';

// Design Tokens
export * from './design-tokens';

// Charts (ECharts option builders)
export { buildLineOption } from './charts/line-chart';
export { buildBarOption } from './charts/bar-chart';
export { buildPieOption } from './charts/pie-chart';
export { buildGaugeOption, buildDualGaugeOption } from './charts/gauge-chart';
export { buildAreaOption } from './charts/area-chart';

// Theme
export { darkTheme } from './theme/dark';
export { lightTheme } from './theme/light';
export { purpleTheme } from './theme/purple';
export { ThemeProvider, ThemeContext } from './theme/provider';
export { useTheme } from './theme/use-theme';
export type { ThemeTokens, ThemeName } from './theme/types';

// Store
export { useAppStore } from './store/app-store';

// Utils
export { cn } from './lib/utils';

export { MainHeader } from './components/main-header';
export type { MainHeaderProps } from './components/main-header';
