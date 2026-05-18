/**
 * Patina Brand Colors
 * Core brand identity colors
 */
export const brandColors = {
  patinaOffWhite: 'rgb(237 233 228)',
  clayBeige: 'rgb(163 146 124)',
  mochaBrown: 'rgb(101 91 82)',
  charcoal: 'rgb(63 59 55)',
  white: 'rgb(255 255 255)',
  lightGray: 'rgb(245 242 237)',
  mediumGray: 'rgb(184 176 166)',
  darkGray: 'rgb(74 69 63)',
} as const

/**
 * Functional Colors
 * Semantic colors for feedback and status
 */
export const functionalColors = {
  success: 'rgb(122 139 112)',
  warning: 'rgb(200 159 93)',
  error: 'rgb(184 121 104)',
  info: 'rgb(139 156 173)',
} as const

/**
 * Light Theme Surface Colors
 * Colors for UI surfaces in light mode using OKLCH color space
 */
export const lightTheme = {
  background: 'oklch(0.9582 0.0152 90.2357)',
  foreground: 'oklch(0.376 0.0225 64.3434)',
  card: 'oklch(0.9914 0.0098 87.4695)',
  cardForeground: 'oklch(0.376 0.0225 64.3434)',
  popover: 'oklch(0.9914 0.0098 87.4695)',
  popoverForeground: 'oklch(0.376 0.0225 64.3434)',
  primary: 'oklch(0.618 0.0778 65.5444)',
  primaryForeground: 'oklch(1 0 0)',
  secondary: 'oklch(0.8846 0.0302 85.5655)',
  secondaryForeground: 'oklch(0.4313 0.03 64.9288)',
  muted: 'oklch(0.9239 0.019 83.0636)',
  mutedForeground: 'oklch(0.5391 0.0387 71.1655)',
  accent: 'oklch(0.8348 0.0426 88.8064)',
  accentForeground: 'oklch(0.376 0.0225 64.3434)',
  destructive: 'oklch(0.5471 0.1438 32.9149)',
  destructiveForeground: 'oklch(1 0 0)',
  border: 'oklch(0.8606 0.0321 84.5881)',
  input: 'oklch(0.8606 0.0321 84.5881)',
  ring: 'oklch(0.618 0.0778 65.5444)',
  sidebar: 'oklch(0.9239 0.019 83.0636)',
  sidebarForeground: 'oklch(0.376 0.0225 64.3434)',
  sidebarPrimary: 'oklch(0.618 0.0778 65.5444)',
  sidebarPrimaryForeground: 'oklch(1 0 0)',
  sidebarAccent: 'oklch(0.8348 0.0426 88.8064)',
  sidebarAccentForeground: 'oklch(0.376 0.0225 64.3434)',
  sidebarBorder: 'oklch(0.8606 0.0321 84.5881)',
  sidebarRing: 'oklch(0.618 0.0778 65.5444)',
} as const

/**
 * Dark Theme Surface Colors
 * Colors for UI surfaces in dark mode using OKLCH color space
 */
export const darkTheme = {
  background: 'oklch(0.2747 0.0139 57.6523)',
  foreground: 'oklch(0.9239 0.019 83.0636)',
  card: 'oklch(0.3237 0.0155 59.0603)',
  cardForeground: 'oklch(0.9239 0.019 83.0636)',
  popover: 'oklch(0.3237 0.0155 59.0603)',
  popoverForeground: 'oklch(0.9239 0.019 83.0636)',
  primary: 'oklch(0.7264 0.0581 66.6967)',
  primaryForeground: 'oklch(0.2747 0.0139 57.6523)',
  secondary: 'oklch(0.3795 0.0181 57.128)',
  secondaryForeground: 'oklch(0.9239 0.019 83.0636)',
  muted: 'oklch(0.3237 0.0155 59.0603)',
  mutedForeground: 'oklch(0.7982 0.0243 82.1078)',
  accent: 'oklch(0.4186 0.0281 56.3404)',
  accentForeground: 'oklch(0.9239 0.019 83.0636)',
  destructive: 'oklch(0.5471 0.1438 32.9149)',
  destructiveForeground: 'oklch(1 0 0)',
  border: 'oklch(0.3795 0.0181 57.128)',
  input: 'oklch(0.3795 0.0181 57.128)',
  ring: 'oklch(0.7264 0.0581 66.6967)',
  sidebar: 'oklch(0.2747 0.0139 57.6523)',
  sidebarForeground: 'oklch(0.9239 0.019 83.0636)',
  sidebarPrimary: 'oklch(0.7264 0.0581 66.6967)',
  sidebarPrimaryForeground: 'oklch(0.2747 0.0139 57.6523)',
  sidebarAccent: 'oklch(0.4186 0.0281 56.3404)',
  sidebarAccentForeground: 'oklch(0.9239 0.019 83.0636)',
  sidebarBorder: 'oklch(0.3795 0.0181 57.128)',
  sidebarRing: 'oklch(0.7264 0.0581 66.6967)',
} as const

/**
 * Help System Accent Palette
 * Added 2026-05-18 for the Help & Guidance System (spec Section 5.1).
 * Values are PLACEHOLDERS — needs Leah's design review before final approval.
 * See Risk R5 in /Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md
 */
export const helpSystemAccents = {
  pearl:       'oklch(0.9450 0.0080 85.0000)',   // soft warm white between offWhite and white
  agedOak:     'oklch(0.5200 0.0450 60.0000)',   // warm tan between clayBeige and mochaBrown
  sage:        'oklch(0.7100 0.0420 145.0000)',  // success/positive accent — muted green
  dustyBlue:   'oklch(0.6800 0.0520 240.0000)',  // info accent — muted slate blue
  terracotta:  'oklch(0.6500 0.1100 35.0000)',   // warning/accent — warm clay
  goldenHour:  'oklch(0.8200 0.1500 90.0000)',   // attention/highlight — amber
} as const

export type HelpSystemAccents = typeof helpSystemAccents

/**
 * All color tokens
 */
export const colors = {
  brand: brandColors,
  functional: functionalColors,
  light: lightTheme,
  dark: darkTheme,
  helpSystem: helpSystemAccents,
} as const

export type BrandColors = typeof brandColors
export type FunctionalColors = typeof functionalColors
export type LightTheme = typeof lightTheme
export type DarkTheme = typeof darkTheme
export type Colors = typeof colors
