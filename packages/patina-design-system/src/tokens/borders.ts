/**
 * Border Radius Tokens
 */
export const borderRadius = {
  none: '0',
  sm: '0.5rem', // 8px
  base: '0.25rem', // 4px
  md: '0.75rem', // 12px
  lg: '1rem', // 16px
  xl: '1.5rem', // 24px
  '2xl': '2rem', // 32px
  '3xl': '3rem', // 48px
  full: '9999px',
} as const

/**
 * Border Widths
 */
export const borderWidths = {
  0: '0',
  1: '1px',
  2: '2px',
  4: '4px',
  8: '8px',
  default: '1px',
} as const

/**
 * Border Styles
 */
export const borderStyles = {
  solid: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
  double: 'double',
  none: 'none',
} as const

/**
 * Common border presets
 */
export const borderPresets = {
  card: {
    width: borderWidths[1],
    style: borderStyles.solid,
    radius: borderRadius.lg,
  },
  button: {
    width: borderWidths[1],
    style: borderStyles.solid,
    radius: borderRadius.md,
  },
  input: {
    width: borderWidths[1],
    style: borderStyles.solid,
    radius: borderRadius.md,
  },
  modal: {
    width: borderWidths[0],
    style: borderStyles.none,
    radius: borderRadius.xl,
  },
  badge: {
    width: borderWidths[1],
    style: borderStyles.solid,
    radius: borderRadius.full,
  },
} as const

export type BorderRadius = typeof borderRadius
export type BorderWidths = typeof borderWidths
export type BorderStyles = typeof borderStyles
export type BorderPresets = typeof borderPresets
