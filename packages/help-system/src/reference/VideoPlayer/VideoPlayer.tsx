'use client'

import { useCallback, useRef, useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { VideoContent } from '../../contentTypes'

// Local cn() — mirrors @patina/design-system/utils/cn. clsx + tailwind-merge
// are direct deps of @patina/help-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// Spec §16 open question: hosting (Sanity CDN vs Mux vs YouTube) deferred.
// For Sprint 3 we treat src as an opaque URL. Captions ride on a separate
// `.vtt` track URL.
//
// Spec §4 Layer 4: video walkthroughs ship inside HelpArticle bodies and the
// HelpCenter. This component is the lowest-level primitive — render the
// media, expose a transcript fallback for a11y, fire the minimum analytics
// (started + completed). Significant pause / seek / progress percentile
// instrumentation is deferred to Sprint 4 per task contract.

type AspectRatio = '16:9' | '4:3' | '1:1'

const ASPECT_RATIO_CLASS: Record<AspectRatio, string> = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
}

export interface VideoPlayerProps {
  /** Direct asset URL (Sanity CDN URL, Mux playback URL, etc.). Takes precedence over CMS lookup. */
  src?: string
  /** Surface key from the help-system registry — resolves to a videoContent doc in Sanity. */
  surfaceKey?: string
  /** Optional poster image URL. */
  poster?: string
  /** Optional WebVTT captions track URL. */
  captionsUrl?: string
  /** Optional transcript content. Rendered inside a collapsible reveal. */
  transcript?: React.ReactNode
  /** Aspect ratio for the player frame. Defaults to '16:9'. */
  aspectRatio?: AspectRatio
  /** a11y label for the <video> element. Defaults to "Help video". */
  ariaLabel?: string
  /** Additional Tailwind classes merged onto the outer container. */
  className?: string
}

/** Resolve `window.posthog?.capture` without crashing in non-browser envs. */
function captureEvent(event: string, props: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const ph = (window as unknown as {
    posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void }
  }).posthog
  ph?.capture?.(event, props)
}

/** Type-guard for CMS docs that look like a VideoContent payload. */
function isVideoShaped(content: unknown): content is VideoContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'src' in content &&
    typeof (content as { src: unknown }).src === 'string' &&
    (content as { src: string }).src.length > 0
  )
}

/**
 * <VideoPlayer /> — Reference-layer video walkthrough player (spec §4 Layer 4).
 *
 * Wraps a native HTML5 <video> with:
 *   - Native controls (captioning surface is provided by the browser)
 *   - Optional captions <track kind="captions" default> when captionsUrl set
 *   - Optional transcript reveal below the player
 *   - Aspect-ratio enforced frame (16:9 default; 4:3 and 1:1 supported)
 *   - Minimum analytics: help.video.started (first play), help.video.completed (ended)
 *
 * Sourcing: pass `src` directly, OR pass `surfaceKey` to resolve a Sanity
 * `videoContent` doc. If both are set, the explicit `src` wins. If neither
 * resolves, the component renders nothing (silent absence — spec §13.4).
 *
 * Autoplay is intentionally NOT exposed in v1 — reduced-motion safety per
 * task contract. Significant-pause / seek / progress-percentile events are
 * deferred to Sprint 4.
 *
 * Analytics property keys use snake_case per Sprint 2 R11 decision.
 */
export function VideoPlayer({
  src,
  surfaceKey,
  poster,
  captionsUrl,
  transcript,
  aspectRatio = '16:9',
  ariaLabel = 'Help video',
  className,
}: VideoPlayerProps) {
  const shouldFetchCms = !src && Boolean(surfaceKey)
  // `useHelpContent` short-circuits on a falsy surface key; we still call it
  // unconditionally to keep hook order stable and let the cache do its work.
  const { data: cmsContent } = useHelpContent(surfaceKey ?? '', 'video')

  // Resolve effective source values — explicit props always win.
  const effectiveSrc = src ?? (shouldFetchCms && isVideoShaped(cmsContent) ? cmsContent.src : undefined)
  const effectivePoster =
    poster ?? (isVideoShaped(cmsContent) ? cmsContent.posterUrl : undefined)
  const effectiveCaptionsUrl =
    captionsUrl ?? (isVideoShaped(cmsContent) ? cmsContent.captionsUrl : undefined)
  const effectiveTranscript =
    transcript ?? (isVideoShaped(cmsContent) ? cmsContent.transcript : undefined)

  // Transcript reveal state — collapsed by default.
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const toggleTranscript = useCallback(() => setTranscriptOpen((prev) => !prev), [])

  // Track first-play (de-dupe started event) and play-start wallclock for
  // completed.duration_ms.
  const startedRef = useRef(false)
  const playStartedAtRef = useRef<number | null>(null)

  const handlePlay = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    playStartedAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    captureEvent('help.video.started', {
      surface_key: surfaceKey,
      src: effectiveSrc,
    })
  }, [surfaceKey, effectiveSrc])

  const handleEnded = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const wall = playStartedAtRef.current
      // Prefer the media's reported duration (seconds) when known; fall back
      // to wallclock measurement. Both bottom out at 0.
      const mediaDurationMs =
        typeof video.duration === 'number' && Number.isFinite(video.duration) && video.duration > 0
          ? Math.round(video.duration * 1000)
          : null
      const wallDurationMs = wall !== null ? Math.max(0, Math.round(now - wall)) : 0
      const duration_ms = mediaDurationMs ?? wallDurationMs
      playStartedAtRef.current = null
      captureEvent('help.video.completed', {
        surface_key: surfaceKey,
        src: effectiveSrc,
        duration_ms,
      })
    },
    [surfaceKey, effectiveSrc],
  )

  // Silent absence: no usable source means we render nothing. Honor spec §13.4
  // — help-system surfaces should never block the UI when content is missing.
  if (!effectiveSrc) return null

  const frameClass = ASPECT_RATIO_CLASS[aspectRatio]

  return (
    <div className={cn('w-full', className)}>
      <div
        data-help-video-frame
        className={cn(
          'relative w-full overflow-hidden rounded-md bg-black',
          frameClass,
        )}
      >
        <video
          className="absolute inset-0 h-full w-full"
          src={effectiveSrc}
          poster={effectivePoster}
          controls
          playsInline
          preload="metadata"
          aria-label={ariaLabel}
          onPlay={handlePlay}
          onEnded={handleEnded}
        >
          {effectiveCaptionsUrl ? (
            <track
              kind="captions"
              srcLang="en"
              src={effectiveCaptionsUrl}
              label="English captions"
              default
            />
          ) : null}
        </video>
      </div>

      {effectiveTranscript ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleTranscript}
            aria-expanded={transcriptOpen}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm text-sm font-medium',
              'text-primary underline-offset-2 hover:underline',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {transcriptOpen ? 'Hide transcript' : 'Show transcript'}
          </button>
          {transcriptOpen ? (
            <div
              className="mt-2 rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground"
              data-help-video-transcript
            >
              {effectiveTranscript}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
