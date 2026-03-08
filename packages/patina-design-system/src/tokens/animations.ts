/**
 * Animation Duration Tokens
 */
export const durations = {
  instant: '50ms',
  fast: '100ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
  slowest: '800ms',
} as const

/**
 * Animation Easing Functions
 */
export const easings = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  // Custom cubic-bezier easings
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  emphasized: 'cubic-bezier(0.0, 0, 0.2, 1)',
  decelerated: 'cubic-bezier(0.0, 0, 0.2, 1)',
  accelerated: 'cubic-bezier(0.4, 0, 1, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const

/**
 * Transition Presets
 */
export const transitions = {
  all: {
    property: 'all',
    duration: durations.normal,
    easing: easings.standard,
  },
  colors: {
    property: 'background-color, border-color, color, fill, stroke',
    duration: durations.fast,
    easing: easings.standard,
  },
  opacity: {
    property: 'opacity',
    duration: durations.normal,
    easing: easings.standard,
  },
  shadow: {
    property: 'box-shadow',
    duration: durations.normal,
    easing: easings.standard,
  },
  transform: {
    property: 'transform',
    duration: durations.normal,
    easing: easings.emphasized,
  },
} as const

/**
 * Keyframe Animations
 */
export const keyframes = {
  'fade-in': {
    from: { opacity: '0' },
    to: { opacity: '1' },
  },
  'fade-out': {
    from: { opacity: '1' },
    to: { opacity: '0' },
  },
  'slide-in-from-top': {
    from: { transform: 'translateY(-100%)' },
    to: { transform: 'translateY(0)' },
  },
  'slide-in-from-bottom': {
    from: { transform: 'translateY(100%)' },
    to: { transform: 'translateY(0)' },
  },
  'slide-in-from-left': {
    from: { transform: 'translateX(-100%)' },
    to: { transform: 'translateX(0)' },
  },
  'slide-in-from-right': {
    from: { transform: 'translateX(100%)' },
    to: { transform: 'translateX(0)' },
  },
  'slide-out-to-top': {
    from: { transform: 'translateY(0)' },
    to: { transform: 'translateY(-100%)' },
  },
  'slide-out-to-bottom': {
    from: { transform: 'translateY(0)' },
    to: { transform: 'translateY(100%)' },
  },
  'slide-out-to-left': {
    from: { transform: 'translateX(0)' },
    to: { transform: 'translateX(-100%)' },
  },
  'slide-out-to-right': {
    from: { transform: 'translateX(0)' },
    to: { transform: 'translateX(100%)' },
  },
  'scale-in': {
    from: { transform: 'scale(0.95)', opacity: '0' },
    to: { transform: 'scale(1)', opacity: '1' },
  },
  'scale-out': {
    from: { transform: 'scale(1)', opacity: '1' },
    to: { transform: 'scale(0.95)', opacity: '0' },
  },
  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
  pulse: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.5' },
  },
  bounce: {
    '0%, 100%': {
      transform: 'translateY(-25%)',
      animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
    },
    '50%': {
      transform: 'translateY(0)',
      animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
    },
  },
  'accordion-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-accordion-content-height)' },
  },
  'accordion-up': {
    from: { height: 'var(--radix-accordion-content-height)' },
    to: { height: '0' },
  },
} as const

/**
 * All animation tokens
 */
export const animations = {
  durations,
  easings,
  transitions,
  keyframes,
} as const

export type Durations = typeof durations
export type Easings = typeof easings
export type Transitions = typeof transitions
export type Keyframes = typeof keyframes
export type Animations = typeof animations
