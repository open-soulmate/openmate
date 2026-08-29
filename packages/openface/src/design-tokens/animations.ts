export const barHeight = {
  topbar: 48,
  bottombar: 48,
  sidebar: 48,
  header: 48,
} as const;

export const animations = {
  fadeIn: { duration: 200, easing: 'ease-in-out' },
  fadeOut: { duration: 150, easing: 'ease-in-out' },
  slideIn: { duration: 250, easing: 'ease-out' },
  slideOut: { duration: 200, easing: 'ease-in' },
  scale: { duration: 200, easing: 'ease-in-out' },
} as const;

export type BarHeightToken = keyof typeof barHeight;
export type AnimationToken = keyof typeof animations;
