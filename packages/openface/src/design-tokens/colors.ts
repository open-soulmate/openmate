export const colors = {
  border: '#27272a',
  borderHover: '#3f3f46',
  primary: '#7c3aed',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  background: '#09090b',
  foreground: '#fafafa',
  muted: '#27272a',
  mutedForeground: '#a1a1aa',
  card: '#0a0a0a',
  cardForeground: '#fafafa',
} as const;

export type ColorToken = keyof typeof colors;
