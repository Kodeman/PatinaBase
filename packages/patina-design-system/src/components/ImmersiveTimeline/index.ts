/**
 * Immersive Timeline Components
 *
 * Scroll-driven timeline experience with progressive disclosure
 */

export { ImmersiveTimeline } from './ImmersiveTimeline'
export type { ImmersiveTimelineProps } from './ImmersiveTimeline'

export { TimelineSegment } from './TimelineSegment'
export type { TimelineSegmentProps, TimelineSegmentData, MediaAsset } from './TimelineSegment'

export { ScrollProgressIndicator } from './ScrollProgressIndicator'
export type { ScrollProgressIndicatorProps, TimelineSegmentMarker } from './ScrollProgressIndicator'

export { ContentReveal } from './ContentReveal'
export type { ContentRevealProps } from './ContentReveal'

export { ParallaxLayer } from './ParallaxLayer'
export type { ParallaxLayerProps } from './ParallaxLayer'

export { LazyImage } from './LazyImage'
export type { LazyImageProps } from './LazyImage'

export { ProgressiveContent } from './ProgressiveContent'
export type { ProgressiveContentProps } from './ProgressiveContent'

// Scroll Animation exports
export type { ScrollAnimationConfig } from './types'
export {
  useHeaderFade,
  useBackgroundTransition,
  useCardAnimations,
  useExpansionAnimations
} from './hooks'
export type {
  UseHeaderFadeReturn,
  UseBackgroundTransitionReturn,
  UseCardAnimationsReturn,
  UseExpansionAnimationsReturn
} from './hooks'
