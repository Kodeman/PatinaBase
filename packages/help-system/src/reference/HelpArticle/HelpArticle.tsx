'use client'

/**
 * <HelpArticle /> — Layer 4 · Reference
 *
 * Portable-text article renderer with a thumbs-up/down feedback widget.
 * Built for the Help Center page (E5), but also unblocks the
 * `<ContextualHelpPanel />` Sprint 2 deferral — that panel can now render full
 * article bodies inline by passing pre-fetched content via the `content` prop.
 *
 * Spec refs:
 *   - §4   — Reference layer overview
 *   - §4.9 — `<HelpArticle />` contract (title, one-sentence answer, body ≤600
 *            words, feedback, related)
 *   - §7   — `helpArticleContent` schema (the underlying portable-text doc)
 *   - §8   — Article body word-count rules
 *   - §10.1 — Analytics events. Per task R11 every property key is snake_case.
 *
 * Content sourcing modes:
 *   1. `content` prop — pre-fetched `HelpArticleContent` (used by E5 + C5 when
 *      they already have the article in hand).
 *   2. `surfaceKey` prop — component fetches via `useHelpContent(key, 'helpArticle')`.
 *   If neither resolves to a renderable article, the component shows the
 *   fallback title (if provided) and renders nothing else. Sanity downtime
 *   must never crash the UI (spec §13.4).
 *
 * Analytics:
 *   • `help.article.opened`         — fires once on mount, when content present
 *   • `help.article.scrolled_to_end` — fires once per article view, when a
 *      sentinel at the end of the body intersects the viewport
 *   • `help.article.feedback_given` — fires when the user clicks thumbs-up/down
 *
 * The intersection observer is torn down on unmount. The "once per view"
 * latch is keyed off the resolved article id so navigation between articles
 * resets the latch.
 *
 * Deferred to Sprint 4:
 *   • Feedback comment textarea (current widget stops at the boolean)
 *   • Reading-time / last-updated chip styling iteration
 *   • Video embed for `videoUrl` (currently rendered as a plain link)
 */

import * as React from 'react'
import { PortableText, type PortableTextBlock } from '@portabletext/react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useHelpContent } from '../../hooks/useHelpContent'
import type { HelpArticleContent } from '../../contentTypes'
import { portableTextComponents } from './portableTextComponents'

// ─── Local cn ────────────────────────────────────────────────────────────────
// Same convention as sibling components — keeps the package self-contained.

const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

// ─── PostHog safe-capture ────────────────────────────────────────────────────

type PosthogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

function safeCapture(event: string, properties: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const ph = (window as unknown as { posthog?: PosthogLike }).posthog
    ph?.capture(event, properties)
  } catch {
    // analytics must never crash the UI
  }
}

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * A related-article reference as it arrives from Sanity. The schema uses
 * `{ _ref: string }` for the array entries — we extract the string id so
 * consumers can decide how to resolve titles (e.g., E4 RelatedArticles loads
 * the matching helpContent docs in one round-trip).
 */
export type RelatedArticleId = string

export interface HelpArticleProps {
  /**
   * Surface key the article is keyed off. Used both for the Sanity fetch
   * (when `content` is omitted) and as the `surface_key` analytics property.
   */
  surfaceKey?: string
  /**
   * Pre-fetched article content. When supplied, skips the `useHelpContent`
   * fetch entirely. Used by E5 (Help Center index → detail) and C5
   * (ContextualHelpPanel expand-to-full-article) to avoid double-loading.
   */
  content?: HelpArticleContent | null
  /**
   * Render-prop slot for the related-articles list (built in parallel by
   * E4). The parent renders whatever component it owns — the article view
   * just delegates the bottom slot to it. Receives the resolved
   * `relatedArticles` id strings.
   */
  renderRelated?: (relatedIds: RelatedArticleId[]) => React.ReactNode
  /**
   * Where the article was opened from. Flows into the `source` property on
   * `help.article.opened`. Examples: 'help_center', 'contextual_panel',
   * 'search', 'empty_state'. Free-form on purpose so portals can label new
   * entry points without an enum bump.
   */
  source?: string
  /**
   * Rendered when the article content cannot be resolved (Sanity miss or
   * downtime). When omitted the component renders nothing on a miss.
   */
  fallbackTitle?: string
  /** Forwarded to the article root element. */
  className?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanity returns the `_id` of the document, but inline objects nested in
 * `helpContent` don't carry an id. We synthesize a stable analytics id from
 * the surface key + title so events from inline-mode articles still link to
 * something queryable.
 */
function resolveArticleId(
  content: HelpArticleContent | null | undefined,
  surfaceKey: string | undefined,
): string {
  if (!content) return surfaceKey ?? 'unknown'
  // Sanity-returned docs include `_id`; inline objects don't. Honor _id when
  // present (typed loosely so we don't widen the public contract).
  const id = (content as HelpArticleContent & { _id?: unknown })._id
  if (typeof id === 'string' && id.length > 0) return id
  return surfaceKey ?? content.surfaceKey ?? content.title ?? 'unknown'
}

/**
 * Extract `relatedArticles` from a Sanity helpArticleContent doc, accepting
 * both the typed array-of-references shape (`{ _ref: string }`) and a
 * pre-flattened array of strings. The schema authors references; consumers
 * may resolve them upstream.
 */
function extractRelatedIds(content: HelpArticleContent | null | undefined): RelatedArticleId[] {
  if (!content) return []
  const related = (content as HelpArticleContent & { relatedArticles?: unknown }).relatedArticles
  if (!Array.isArray(related)) return []
  const ids: RelatedArticleId[] = []
  for (const entry of related) {
    if (typeof entry === 'string') {
      ids.push(entry)
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { _ref?: unknown })._ref === 'string'
    ) {
      ids.push((entry as { _ref: string })._ref)
    } else if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { _id?: unknown })._id === 'string'
    ) {
      ids.push((entry as { _id: string })._id)
    }
  }
  return ids
}

function formatLastUpdated(value: string | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  // ISO date strings from Sanity (e.g. "2026-04-12"). Render as readable
  // text without pulling in date-fns.
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  try {
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
//
// The public `<HelpArticle />` is a thin shell that decides whether to fetch
// content via `useHelpContent` or use the caller-supplied `content` prop. The
// split keeps Rules of Hooks happy: the fetch hook only runs when we actually
// need the network round-trip, so passing `content` directly never triggers a
// "no content found" warning from the shared hook.

export function HelpArticle(props: HelpArticleProps) {
  const { content, surfaceKey } = props
  if (content !== undefined) {
    return <HelpArticleView {...props} content={content ?? null} />
  }
  if (surfaceKey && surfaceKey.length > 0) {
    return <HelpArticleFromSurfaceKey {...props} surfaceKey={surfaceKey} />
  }
  // Neither prop supplied — render the fallback path with null content.
  return <HelpArticleView {...props} content={null} />
}

HelpArticle.displayName = 'PatinaHelpArticle'

// ─── Surface-key fetcher subcomponent ─────────────────────────────────────────

interface HelpArticleFromSurfaceKeyProps extends HelpArticleProps {
  surfaceKey: string
}

function HelpArticleFromSurfaceKey(props: HelpArticleFromSurfaceKeyProps) {
  const { data } = useHelpContent(props.surfaceKey, 'helpArticle')
  return <HelpArticleView {...props} content={data ?? null} />
}

// ─── Article body — content is already resolved ──────────────────────────────

interface HelpArticleViewProps extends HelpArticleProps {
  content: HelpArticleContent | null
}

function HelpArticleView({
  surfaceKey,
  content,
  renderRelated,
  source,
  fallbackTitle,
  className,
}: HelpArticleViewProps) {
  const articleId = resolveArticleId(content, surfaceKey)
  const resolvedSurfaceKey = surfaceKey ?? content?.surfaceKey ?? ''
  const relatedIds = React.useMemo(() => extractRelatedIds(content), [content])

  // ─── help.article.opened — once per article view ─────────────────────────
  // The latch is keyed on articleId so navigation between articles (same
  // mount, prop changes) refires correctly.
  const lastOpenedRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!content) return
    if (lastOpenedRef.current === articleId) return
    lastOpenedRef.current = articleId
    safeCapture('help.article.opened', {
      article_id: articleId,
      surface_key: resolvedSurfaceKey,
      source: source ?? null,
    })
  }, [articleId, content, resolvedSurfaceKey, source])

  // Reset the scroll-to-end latch when the article changes
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)
  const scrolledToEndRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    // Reset the latch when articleId changes (new article in same mount).
    scrolledToEndRef.current = null
  }, [articleId])

  // ─── help.article.scrolled_to_end — IntersectionObserver on a sentinel ──
  React.useEffect(() => {
    if (!content) return
    const node = sentinelRef.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (scrolledToEndRef.current === articleId) continue
          scrolledToEndRef.current = articleId
          safeCapture('help.article.scrolled_to_end', {
            article_id: articleId,
            surface_key: resolvedSurfaceKey,
          })
          // Latch flipped — no need to keep observing this article.
          observer.disconnect()
          break
        }
      },
      // 0 threshold + small rootMargin keeps the trigger reliable even when
      // the sentinel is partially hidden behind a sticky footer.
      { threshold: 0, rootMargin: '0px 0px -20% 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [articleId, content, resolvedSurfaceKey])

  // ─── Feedback widget state ───────────────────────────────────────────────

  const [feedback, setFeedback] = React.useState<null | 'up' | 'down'>(null)
  // Reset feedback when the article changes
  React.useEffect(() => {
    setFeedback(null)
  }, [articleId])

  const handleFeedback = React.useCallback(
    (sentiment: 'up' | 'down') => {
      // Toggle off if the user clicks the same button twice — common pattern
      // in survey widgets. Only fires analytics on the engaged-state transition.
      setFeedback((current) => {
        const next = current === sentiment ? null : sentiment
        if (next !== null) {
          safeCapture('help.article.feedback_given', {
            article_id: articleId,
            surface_key: resolvedSurfaceKey,
            helpful: next === 'up',
            has_comment: false,
          })
        }
        return next
      })
    },
    [articleId, resolvedSurfaceKey],
  )

  // ─── Empty / fallback rendering ──────────────────────────────────────────

  if (!content) {
    if (fallbackTitle) {
      return (
        <article
          className={cn(
            'mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 text-foreground',
            className,
          )}
          data-testid="help-article-fallback"
        >
          <h1 className="text-2xl font-semibold leading-tight text-foreground">
            {fallbackTitle}
          </h1>
          <p className="text-sm text-muted-foreground" role="status">
            This article is not available yet.
          </p>
        </article>
      )
    }
    return null
  }

  const lastUpdated = formatLastUpdated(content.lastUpdated)

  return (
    <article
      className={cn(
        'mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6 text-foreground',
        className,
      )}
      data-testid="help-article"
      data-article-id={articleId}
    >
      {/* ─── Header ──────────────────────────────────────────────────── */}
      {content.eyebrow ? (
        <p
          className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
          data-testid="help-article-eyebrow"
        >
          {content.eyebrow}
        </p>
      ) : null}

      <h1 className="text-2xl font-semibold leading-tight text-foreground">
        {content.title}
      </h1>

      {content.oneSentenceAnswer ? (
        <p
          className="text-base italic leading-relaxed text-muted-foreground"
          data-testid="help-article-one-sentence-answer"
        >
          {content.oneSentenceAnswer}
        </p>
      ) : null}

      {/* ─── Body (portable text) ─────────────────────────────────────── */}
      <div
        className="prose-help text-sm leading-relaxed text-foreground/90"
        data-testid="help-article-body"
      >
        <PortableText
          value={(content.body ?? []) as PortableTextBlock[]}
          components={portableTextComponents}
        />
      </div>

      {/* Sentinel — intersection observer target for scrolled_to_end */}
      <div
        ref={sentinelRef}
        aria-hidden="true"
        data-testid="help-article-sentinel"
        className="h-px w-full"
      />

      {/* ─── Metadata footer ─────────────────────────────────────────── */}
      {lastUpdated || content.readingTimeMinutes ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="help-article-meta"
        >
          {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
          {lastUpdated && content.readingTimeMinutes ? (
            <span aria-hidden="true"> · </span>
          ) : null}
          {content.readingTimeMinutes ? (
            <span>{content.readingTimeMinutes} min read</span>
          ) : null}
        </p>
      ) : null}

      {/* ─── Feedback widget ──────────────────────────────────────────── */}
      <FeedbackWidget
        feedback={feedback}
        onFeedback={handleFeedback}
        articleId={articleId}
      />

      {/* ─── Related articles (parent-rendered) ───────────────────────── */}
      {renderRelated && relatedIds.length > 0 ? (
        <div
          className="mt-4 border-t border-border pt-4"
          data-testid="help-article-related"
        >
          {renderRelated(relatedIds)}
        </div>
      ) : null}
    </article>
  )
}

HelpArticleView.displayName = 'PatinaHelpArticleView'

// ─── Feedback widget ─────────────────────────────────────────────────────────
//
// Split out for clarity — single button group with accessible labels. Buttons
// are <button type=button>, so they're focusable + Enter/Space-activatable
// without any extra wiring.

interface FeedbackWidgetProps {
  feedback: null | 'up' | 'down'
  onFeedback: (sentiment: 'up' | 'down') => void
  articleId: string
}

function FeedbackWidget({ feedback, onFeedback, articleId }: FeedbackWidgetProps) {
  return (
    <section
      aria-labelledby={`help-article-feedback-label-${articleId}`}
      className="mt-6 flex flex-col gap-3 border-t border-border pt-4"
      data-testid="help-article-feedback"
    >
      <p
        id={`help-article-feedback-label-${articleId}`}
        className="text-sm font-medium text-foreground"
      >
        Was this helpful?
      </p>
      <div className="flex items-center gap-2" role="group" aria-label="Article feedback">
        <button
          type="button"
          onClick={() => onFeedback('up')}
          aria-pressed={feedback === 'up'}
          aria-label="Yes, this was helpful"
          data-testid="help-article-feedback-up"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
            'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            feedback === 'up' ? 'border-foreground bg-muted/40 text-foreground' : 'text-foreground/80',
          )}
        >
          <ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Yes</span>
        </button>
        <button
          type="button"
          onClick={() => onFeedback('down')}
          aria-pressed={feedback === 'down'}
          aria-label="No, this was not helpful"
          data-testid="help-article-feedback-down"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
            'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            feedback === 'down' ? 'border-foreground bg-muted/40 text-foreground' : 'text-foreground/80',
          )}
        >
          <ThumbsDown aria-hidden="true" className="h-3.5 w-3.5" />
          <span>No</span>
        </button>
        {feedback ? (
          <span
            className="ml-1 text-xs italic text-muted-foreground"
            role="status"
            aria-live="polite"
            data-testid="help-article-feedback-thanks"
          >
            Thanks for the feedback.
          </span>
        ) : null}
      </div>
    </section>
  )
}
