export const typography = {
  h1: { size: 22, weight: 700, family: 'system-ui' },
  h2: { size: 16, weight: 600, family: 'system-ui' },
  h3: { size: 14, weight: 600, family: 'system-ui' },
  body: { size: 12, weight: 400, family: 'system-ui' },
  caption: { size: 10, weight: 400, family: 'system-ui' },
} as const;

export type TypographyToken = keyof typeof typography;
