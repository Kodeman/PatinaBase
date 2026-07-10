'use client'

/**
 * ContextualHelpPanel — Layer 2 (Reactive) slide-out help panel.
 *
 * Spec references:
 *   - §4.6 — Component contract (props, behavior, visual spec)
 *   - §6   — Surface key catalogue and parent-prefix matching
 *   - §10.1 — Analytics events (snake_case property keys per R11)
 *   - §7.3 — Sanity stale-while-revalidate cache window (5 min)
 *
 * Behavior summary:
 *   - Resolves `surfaceKey`: explicit prop wins; otherwise reads from
 *     `useSurfaceKey()` context. If neither is present, falls back to '' so the
 *     panel can still open and show the empty state.
 *   - When open, fetches help articles related to the surface key through a
 *     GROQ-style query. Matches the exact surfaceKey OR any helpContent doc
 *     whose surfaceKey is a prefix path of the current one
 *     (e.g. 'designer-portal/pipeline' matches when active key is
 *     'designer-portal/pipeline/project-list').
 *   - Slides in from the right (~400px wide on desktop, 100vw on mobile).
 *   - Closes via backdrop click, Escape, or the header close button. All three
 *     paths are handled by Radix Dialog primitives.
 *   - Article rows show title + 1-line summary derived from the body. Clicking
 *     a row expands an inline excerpt + a "Coming soon: full article" notice.
 *     The full <HelpArticle /> renderer ships in Sprint 3 (Stream E).
 *   - Analytics: `help.panel.opened`, `help.panel.closed` (with duration_ms),
 *     `help.article.opened` (with source = 'contextual_panel'). All property
 *     keys snake_case per R11. Window.posthog calls are wrapped in try/catch.
 *
 * Sprint 2 deferrals (documented per task spec):
 *   - Full portable-text body rendering — Sprint 3 (<HelpArticle />)
 *   - Related-article links — Sprint 3
 *   - In-panel search — Sprint 3 (<HelpSearch />)
 *   - Feedback widget — Sprint 3
 */

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { getSanityClient } from '../../sanityClient'
import { isPlaceholderContent } from '../../isPlaceholderContent'
import { useSurfaceKey } from '../../providers/SurfaceKeyProvider'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ContextualHelpPanelProps {
  /**
   * Explicit surface key override. If omitted, the panel reads the current
   * surface from `useSurfaceKey()` context.
   */
  surfaceKey?: string
  /** Controlled open state. If omitted the panel manages it internally. */
  open?: boolean
  /** Fires when Radix wants to change open state (controlled or uncontrolled). */
  onOpenChange?: (open: boolean) => void
  /**
   * Optional trigger element. If provided, the panel wires it through
   * `<Dialog.Trigger asChild>`. Most consumers will pass the utility-bar `?`
   * icon here (provided by C6). If omitted, the panel is purely controlled
   * via `open` / `onOpenChange`.
   */
  trigger?: React.ReactNode
  /** Forwarded to the panel content root. */
  className?: string
  /**
   * Optional footer content rendered as a fixed-height row below the
   * scrollable article list, inside the panel's flex column. Callers that
   * expose a browsable help center render their "Browse all help" link here
   * so it survives loading/empty/article states.
   */
  footer?: React.ReactNode
}

// ─── Article shape (returned by the GROQ query below) ─────────────────────────

interface PanelArticle {
  _id: string
  surfaceKey: string
  title: string
  /** First plain-text excerpt extracted from the portable-text body. */
  excerpt: string
}

// ─── PostHog helper — safe capture ────────────────────────────────────────────

type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => void }

function safeCapture(event: string, props: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const ph = (window as unknown as { posthog?: PostHogLike }).posthog
    ph?.capture(event, props)
  } catch {
    // analytics must never crash the UI
  }
}

// ─── GROQ query for articles related to a surface key ─────────────────────────

/**
 * Lightweight GROQ tagged template literal (also used by useHelpContent). Just
 * returns the interpolated string with no transformation — exists for editor
 * highlighting and grep-ability.
 */
const groq = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  String.raw({ raw: strings }, ...values)

/**
 * Match an article when its surfaceKey is:
 *   (a) an exact match of the current key, OR
 *   (b) a prefix path of the current key (e.g. 'designer-portal/pipeline'
 *       matches when active key is 'designer-portal/pipeline/project-list').
 *
 * GROQ's `string::startsWith` is the explicit prefix-match function.
 * We also order by surfaceKey length (longest first) so the most-specific
 * matches surface at the top.
 */
const ARTICLES_QUERY = groq`
  *[_type == "helpContent"
    && contentType == "helpArticle"
    && (
      surfaceKey == $sk
      || string::startsWith($sk, surfaceKey + "/")
    )
  ] | order(length(surfaceKey) desc) [0...10] {
    "_id": _id,
    surfaceKey,
    "title": coalesce(title, helpArticleContent.title),
    "excerpt": pt::text(coalesce(body, helpArticleContent.body))
  }
`

const PANEL_STALE_MS = 5 * 60 * 1000 // 5 min, same as useHelpContent

async function fetchPanelArticles(surfaceKey: string): Promise<PanelArticle[]> {
  if (!surfaceKey) return []
  try {
    const client = getSanityClient()
    const result = (await client.fetch(ARTICLES_QUERY, { sk: surfaceKey })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .filter((row): row is { _id: string; surfaceKey: string; title?: string; excerpt?: string } => {
        return Boolean(row && typeof row === 'object' && '_id' in row && 'surfaceKey' in row)
      })
      // Drop seed/placeholder articles (title or excerpt still stub copy) so
      // they never surface in the panel — same guard as useHelpContent.
      .filter((row) => !isPlaceholderContent(row.title) && !isPlaceholderContent(row.excerpt))
      .map((row) => ({
        _id: String(row._id),
        surfaceKey: String(row.surfaceKey),
        title: typeof row.title === 'string' && row.title.length > 0 ? row.title : 'Untitled article',
        excerpt: typeof row.excerpt === 'string' ? row.excerpt : '',
      }))
  } catch (err) {
    // Sanity unavailable — log + return [] (spec §13.4)
    if (typeof console !== 'undefined') {
      console.warn('[help-system] ContextualHelpPanel fetch failed', err)
    }
    return []
  }
}

// ─── Helpers for the article row ──────────────────────────────────────────────

const SUMMARY_MAX_CHARS = 110
const EXCERPT_MAX_CHARS = 500

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  // Try to break on a word boundary near the limit
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice
  return cut + '…'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContextualHelpPanel({
  surfaceKey: surfaceKeyProp,
  open: openProp,
  onOpenChange,
  trigger,
  className,
  footer,
}: ContextualHelpPanelProps) {
  // Resolve surface key: explicit prop wins, otherwise from context.
  const contextSurfaceKey = useSurfaceKey()
  const resolvedSurfaceKey =
    surfaceKeyProp ?? (typeof contextSurfaceKey === 'string' ? contextSurfaceKey : '')

  // Manage open state internally only when no controlled prop is passed.
  const isControlled = openProp !== undefined
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isOpen = isControlled ? Boolean(openProp) : internalOpen

  // Track open timestamp for analytics duration_ms
  const openedAtRef = React.useRef<number | null>(null)
  const prevOpenRef = React.useRef<boolean>(false)

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  // Fire panel.opened / panel.closed when isOpen transitions
  React.useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isOpen

    if (!wasOpen && isOpen) {
      openedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
      safeCapture('help.panel.opened', { surface_key: resolvedSurfaceKey })
    } else if (wasOpen && !isOpen) {
      const openedAt = openedAtRef.current
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const durationMs = openedAt != null ? Math.max(0, Math.round(now - openedAt)) : 0
      openedAtRef.current = null
      safeCapture('help.panel.closed', {
        surface_key: resolvedSurfaceKey,
        duration_ms: durationMs,
      })
    }
  }, [isOpen, resolvedSurfaceKey])

  // Fetch articles only while the panel is open (avoid useless requests).
  const articlesQuery = useQuery({
    queryKey: ['help-panel-articles', resolvedSurfaceKey],
    queryFn: () => fetchPanelArticles(resolvedSurfaceKey),
    enabled: isOpen && Boolean(resolvedSurfaceKey),
    staleTime: PANEL_STALE_MS,
    gcTime: PANEL_STALE_MS * 2,
    retry: 1,
  })

  // Track which article rows are expanded inline (Sprint 2 stub for full article)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const handleArticleClick = React.useCallback(
    (article: PanelArticle) => {
      setExpandedId((current) => (current === article._id ? null : article._id))
      safeCapture('help.article.opened', {
        article_id: article._id,
        surface_key: resolvedSurfaceKey,
        source: 'contextual_panel',
      })
    },
    [resolvedSurfaceKey],
  )

  // Reset expanded row when the panel closes
  React.useEffect(() => {
    if (!isOpen) setExpandedId(null)
  }, [isOpen])

  const articles = articlesQuery.data ?? []
  const isLoading = articlesQuery.isLoading && articlesQuery.isFetching

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      {trigger != null ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="help-panel-overlay"
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ animationDuration: '200ms' }}
        />
        <DialogPrimitive.Content
          data-testid="help-panel-content"
          className={[
            'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-background shadow-2xl outline-none sm:w-[400px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'motion-reduce:transition-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ transitionDuration: '200ms', animationDuration: '200ms' }}
          aria-describedby={undefined}
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogPrimitive.Title className="text-base font-semibold text-foreground">
              Help
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-testid="help-panel-close"
              className="rounded-sm p-1 text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close help panel"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                Loading help articles…
              </p>
            ) : articles.length === 0 ? (
              <div className="flex flex-col gap-2 py-6 text-center" data-testid="help-panel-empty">
                <p className="text-sm font-medium text-foreground">No articles for this surface yet.</p>
                <p className="text-xs text-muted-foreground">Search the Help Center to find what you need.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1" data-testid="help-panel-article-list">
                {articles.map((article) => {
                  const isExpanded = expandedId === article._id
                  const summary = truncate(article.excerpt, SUMMARY_MAX_CHARS)
                  const fullExcerpt = truncate(article.excerpt, EXCERPT_MAX_CHARS)
                  return (
                    <li key={article._id} className="border-b border-border/40 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => handleArticleClick(article)}
                        aria-expanded={isExpanded}
                        data-testid={`help-panel-article-${article._id}`}
                        className="flex w-full flex-col gap-1 rounded-sm py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="text-sm font-medium text-foreground">{article.title}</span>
                        {summary.length > 0 ? (
                          <span className="text-xs text-muted-foreground">{summary}</span>
                        ) : null}
                      </button>
                      {isExpanded ? (
                        <div className="pb-3 pl-1 pr-1" data-testid={`help-panel-article-expanded-${article._id}`}>
                          {fullExcerpt.length > 0 ? (
                            <p className="text-sm leading-relaxed text-foreground/90">{fullExcerpt}</p>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">
                              No preview text available.
                            </p>
                          )}
                          <p className="mt-2 text-xs italic text-muted-foreground">
                            Coming soon: full article view.
                          </p>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {footer != null ? footer : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

ContextualHelpPanel.displayName = 'PatinaContextualHelpPanel'
