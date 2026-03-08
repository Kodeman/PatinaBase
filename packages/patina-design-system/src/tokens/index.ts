/**
 * Patina Design System Tokens
 *
 * This file exports all design tokens for the Patina design system.
 * Tokens are the foundational design decisions that power the entire system.
 */

export * from './colors'
export * from './typography'
export * from './spacing'
export * from './shadows'
export * from './borders'
export * from './breakpoints'
export * from './animations'

import { colors } from './colors'
import { typography } from './typography'
import { spacing, containerMaxWidths, layoutSpacing } from './spacing'
import { shadows, focusRings, elevation } from './shadows'
import { borderRadius, borderWidths, borderStyles, borderPresets } from './borders'
import { breakpoints, breakpointValues, mediaQueries } from './breakpoints'
import { animations } from './animations'

/**
 * Complete design token theme
 */
export const tokens = {
  colors,
  typography,
  spacing,
  containerMaxWidths,
  layoutSpacing,
  shadows,
  focusRings,
  elevation,
  borderRadius,
  borderWidths,
  borderStyles,
  borderPresets,
  breakpoints,
  breakpointValues,
  mediaQueries,
  animations,
} as const

/**
 * Legacy export for backwards compatibility
 */
export const patinaTheme = {
  colors: colors,
  radii: borderRadius,
  shadows: shadows,
  typography: {
    heading: typography.fontFamilies.heading,
    body: typography.fontFamilies.body,
  },
  motion: {
    instant: animations.durations.instant,
    fast: animations.durations.fast,
    normal: animations.durations.normal,
    slow: animations.durations.slow,
    slower: animations.durations.slower,
    easing: animations.easings.standard,
  },
  spacing: {
    unit: spacing[1],
  },
}

export type Tokens = typeof tokens
export type PatinaTheme = typeof patinaTheme
