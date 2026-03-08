/**
 * Shadow Tokens
 * Elevation system for creating depth
 */
export const shadows = {
  none: 'none',
  xs: '2px 3px 5px 0px hsl(28 13% 20% / 0.06)',
  sm: '2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 1px 2px -1px hsl(28 13% 20% / 0.12)',
  md: '2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 2px 4px -1px hsl(28 13% 20% / 0.12)',
  lg: '2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 4px 6px -1px hsl(28 13% 20% / 0.12)',
  xl: '2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 8px 10px -1px hsl(28 13% 20% / 0.12)',
  '2xl': '2px 3px 5px 0px hsl(28 13% 20% / 0.12), 2px 12px 16px -1px hsl(28 13% 20% / 0.12)',
  double: '2px 3px 5px 0px hsl(28 13% 20% / 0.30)',
  inner: 'inset 0 2px 4px 0 hsl(28 13% 20% / 0.06)',
} as const

/**
 * Focus Ring Styles
 */
export const focusRings = {
  default: '0 0 0 2px hsl(var(--ring))',
  offset: '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring))',
  thick: '0 0 0 3px hsl(var(--ring))',
} as const

/**
 * Elevation levels mapping
 */
export const elevation = {
  0: shadows.none,
  1: shadows.xs,
  2: shadows.sm,
  3: shadows.md,
  4: shadows.lg,
  5: shadows.xl,
  6: shadows['2xl'],
} as const

export type Shadows = typeof shadows
export type FocusRings = typeof focusRings
export type Elevation = typeof elevation
