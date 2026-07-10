'use client'

/**
 * <RelatedArticles /> — Layer 4 · Reference (Sprint 3 · Stream E · Task E4)
 *
 * A small supplementary surface rendered at the foot of long-form help
 * articles (or anywhere a list of related reads is useful). Two query modes:
 *
 *   1. By IDs            — pass `articleIds` (typically from the parent
 *                          article's `relatedArticles` reference array).
 *   2. By surface prefix — pass `surfaceKeyPrefix` to surface siblings under
 *                          the same parent surface key.
 *
 * Per spec §4 (Reference layer): supplementary, fully optional, never
 * blocking. Empty state renders NOTHING — a noisy empty list at the foot of
 * an article would distract from the answer the user came for.
 *
 * Analytics (R11 — snake_case property keys):
 *   • help.related_article.clicked
 *       { from_surface_key, to_surface_key, to_article_id }
 *
 * GROQ queries are parameterized; no string interpolation in the query body.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getSanityClient } from '../../sanityClient'

// Local cn — same convention as sibling components, keeps the package
// self-contained for test runs without depending on @patina/design-system.
const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RelatedArticlesProps {
  /** Article IDs to query directly. Highest precedence. */
  articleIds?: string[]
  /**
   * Exact surface keys to query (`surfaceKey in $keys`), rendered in the order
   * given (preserved client-side, since GROQ's `in` does not guarantee order).
   * The FEATURED variant — a curated list — as opposed to `surfaceKeyPrefix`'s
   * "everything under a parent" mode. Wins over `surfaceKeyPrefix`; loses to
   * `articleIds`.
   */
  surfaceKeys?: string[]
  /** Surface-key prefix to query siblings under the same parent surface. */
  surfaceKeyPrefix?: string
  /** Maximum number of articles to render. Defaults to 5. */
  max?: number
  /** Optional click handler — fires alongside the analytics event. */
  onArticleClick?: (articleId: string, surfaceKey: string) => void
  /** Heading override. Defaults to "Related articles". */
  heading?: string
  /** Additional Tailwind classes merged onto the outer container. */
  className?: string
}

// ─── Internal article shape (returned by the GROQ queries below) ──────────────

interface RelatedArticleRow {
  _id: string
  surfaceKey: string
  title: string
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

// ─── GROQ queries (parameterized — never interpolate caller input) ────────────

/**
 * Lightweight GROQ tagged template literal — just returns the interpolated
 * string. Exists for editor highlighting and grep-ability. Matches the
 * convention used elsewhere in the package (ContextualHelpPanel).
 */
const groq = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  String.raw({ raw: strings }, ...values)

/**
 * IDs mode — fetch up to $max articles whose _id is in $ids.
 *
 * The article body lives on the inline `helpArticleContent` field of the
 * parent `helpContent` document (set up in A3). When the inline object is
 * absent (legacy docs), fall back to top-level title/oneSentenceAnswer if
 * present. The query returns both shapes so the component can flatten them.
 */
const QUERY_BY_IDS = groq`
  *[_id in $ids
    && _type == "helpContent"
    && contentType == "helpArticle"
  ] [0...$max] {
    "_id": _id,
    surfaceKey,
    helpArticleContent {
      title,
      oneSentenceAnswer
    },
    title,
    oneSentenceAnswer
  }
`

/**
 * Exact-keys mode — fetch articles whose `surfaceKey` is one of $keys. GROQ's
 * `in` does not guarantee result order, so the caller-supplied order is
 * re-applied client-side (see `fetchByKeys`). No slice here: FEATURED lists are
 * small and curated; the component caps to `max` after ordering.
 */
const QUERY_BY_KEYS = groq`
  *[_type == "helpContent"
    && contentType == "helpArticle"
    && surfaceKey in $keys
  ] {
    "_id": _id,
    surfaceKey,
    helpArticleContent {
      title,
      oneSentenceAnswer
    },
    title,
    oneSentenceAnswer
  }
`

/**
 * Prefix mode — fetch up to $max articles whose `surfaceKey` is a child
 * of `$prefix` (using GROQ's `string::startsWith`). Excludes documents whose
 * surfaceKey exactly matches the prefix so the current page never lists
 * itself among its own "related" articles.
 */
const QUERY_BY_PREFIX = groq`
  *[_type == "helpContent"
    && contentType == "helpArticle"
    && string::startsWith(surfaceKey, $prefix)
    && surfaceKey != $prefix
  ] | order(surfaceKey asc) [0...$max] {
    "_id": _id,
    surfaceKey,
    helpArticleContent {
      title,
      oneSentenceAnswer
    },
    title,
    oneSentenceAnswer
  }
`

const RELATED_STALE_MS = 5 * 60 * 1000 // 5 min, mirrors useHelpContent

// ─── Row normaliser ───────────────────────────────────────────────────────────

interface RawRow {
  _id?: unknown
  surfaceKey?: unknown
  helpArticleContent?: { title?: unknown; oneSentenceAnswer?: unknown } | null
  title?: unknown
  oneSentenceAnswer?: unknown
}

function normaliseRow(row: unknown): RelatedArticleRow | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as RawRow
  if (typeof r._id !== 'string' || r._id.length === 0) return null
  if (typeof r.surfaceKey !== 'string' || r.surfaceKey.length === 0) return null

  const innerTitle =
    typeof r.helpArticleContent?.title === 'string' ? r.helpArticleContent.title : ''
  const innerAnswer =
    typeof r.helpArticleContent?.oneSentenceAnswer === 'string'
      ? r.helpArticleContent.oneSentenceAnswer
      : ''
  const topTitle = typeof r.title === 'string' ? r.title : ''
  const topAnswer = typeof r.oneSentenceAnswer === 'string' ? r.oneSentenceAnswer : ''

  const title = innerTitle || topTitle || 'Untitled article'
  const excerpt = innerAnswer || topAnswer || ''

  return { _id: r._id, surfaceKey: r.surfaceKey, title, excerpt }
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchByIds(ids: string[], max: number): Promise<RelatedArticleRow[]> {
  if (ids.length === 0) return []
  try {
    const client = getSanityClient()
    const result = (await client.fetch(QUERY_BY_IDS, { ids, max })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .map(normaliseRow)
      .filter((row): row is RelatedArticleRow => row !== null)
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[help-system] RelatedArticles fetchByIds failed', err)
    }
    return []
  }
}

async function fetchByKeys(keys: string[], max: number): Promise<RelatedArticleRow[]> {
  if (keys.length === 0) return []
  try {
    const client = getSanityClient()
    const result = (await client.fetch(QUERY_BY_KEYS, { keys, max })) as unknown
    if (!Array.isArray(result)) return []
    const rows = result
      .map(normaliseRow)
      .filter((row): row is RelatedArticleRow => row !== null)
    // Preserve the caller-supplied order; drop keys that returned no doc.
    const orderOf = new Map(keys.map((key, index) => [key, index]))
    return rows
      .slice()
      .sort(
        (a, b) =>
          (orderOf.get(a.surfaceKey) ?? Number.POSITIVE_INFINITY) -
          (orderOf.get(b.surfaceKey) ?? Number.POSITIVE_INFINITY),
      )
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[help-system] RelatedArticles fetchByKeys failed', err)
    }
    return []
  }
}

async function fetchByPrefix(prefix: string, max: number): Promise<RelatedArticleRow[]> {
  if (!prefix) return []
  try {
    const client = getSanityClient()
    const result = (await client.fetch(QUERY_BY_PREFIX, { prefix, max })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .map(normaliseRow)
      .filter((row): row is RelatedArticleRow => row !== null)
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[help-system] RelatedArticles fetchByPrefix failed', err)
    }
    return []
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const DEFAULT_MAX = 5

export function RelatedArticles({
  articleIds,
  surfaceKeys,
  surfaceKeyPrefix,
  max = DEFAULT_MAX,
  onArticleClick,
  heading = 'Related articles',
  className,
}: RelatedArticlesProps) {
  // Resolve mode by precedence: IDs > exact keys > prefix.
  const idsMode = Array.isArray(articleIds) && articleIds.length > 0
  const keysMode = !idsMode && Array.isArray(surfaceKeys) && surfaceKeys.length > 0
  const prefixMode =
    !idsMode && !keysMode && typeof surfaceKeyPrefix === 'string' && surfaceKeyPrefix.length > 0
  const enabled = idsMode || keysMode || prefixMode
  const mode = idsMode ? 'ids' : keysMode ? 'keys' : 'prefix'

  // Stable query keys so React Query can cache across renders.
  const idsKey = React.useMemo(
    () => (idsMode ? [...(articleIds ?? [])].sort().join(',') : ''),
    [idsMode, articleIds],
  )
  // Exact-keys identity — order-sensitive (order is part of the output), so we
  // do NOT sort it into the cache key.
  const keysKey = React.useMemo(
    () => (keysMode ? (surfaceKeys ?? []).join(',') : ''),
    [keysMode, surfaceKeys],
  )

  const query = useQuery({
    queryKey: [
      'help-related-articles',
      mode,
      idsKey,
      keysKey,
      surfaceKeyPrefix ?? '',
      max,
    ],
    queryFn: () => {
      if (idsMode) return fetchByIds(articleIds!, max)
      if (keysMode) return fetchByKeys(surfaceKeys!, max)
      if (prefixMode) return fetchByPrefix(surfaceKeyPrefix!, max)
      return Promise.resolve<RelatedArticleRow[]>([])
    },
    enabled,
    staleTime: RELATED_STALE_MS,
    gcTime: RELATED_STALE_MS * 2,
    retry: 1,
  })

  // No inputs → render nothing.
  if (!enabled) return null

  const isLoading = query.isLoading && query.isFetching

  // Loading → single skeleton row, no heading (never a noisy spinner — this
  // is a supplementary surface, and "Related articles" with no content
  // beneath it would be a worse experience than silent absence).
  if (isLoading) {
    return (
      <div
        className={cn('flex flex-col gap-2', className)}
        data-testid="related-articles-loading"
        role="status"
        aria-label={`Loading ${heading.toLowerCase()}`}
      >
        <div
          data-testid="related-articles-skeleton"
          className="h-10 w-full animate-pulse rounded-sm bg-muted/60"
          aria-hidden="true"
        />
      </div>
    )
  }

  const rawArticles = query.data ?? []
  // Defensive client-side max — Sanity returns at most $max but we trim again
  // so swap-in mocks / consumers cannot exceed the cap.
  const articles = rawArticles.slice(0, max)

  // Empty state → render NOTHING (spec §4 / task contract).
  if (articles.length === 0) return null

  const fromSurfaceKey = surfaceKeyPrefix && surfaceKeyPrefix.length > 0
    ? surfaceKeyPrefix
    : 'unknown'

  const handleClick = (article: RelatedArticleRow) => {
    safeCapture('help.related_article.clicked', {
      from_surface_key: fromSurfaceKey,
      to_surface_key: article.surfaceKey,
      to_article_id: article._id,
    })
    onArticleClick?.(article._id, article.surfaceKey)
  }

  return (
    <section
      aria-label={heading}
      className={cn('flex flex-col gap-2', className)}
      data-testid="related-articles"
    >
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <ul role="list" className="flex flex-col gap-1">
        {articles.map((article) => (
          <li key={article._id} className="border-b border-border/40 last:border-b-0">
            <a
              href={`#${article.surfaceKey}`}
              role="link"
              data-testid={`related-article-${article._id}`}
              onClick={(event) => {
                // Let the host app intercept navigation via onArticleClick.
                // Default-prevent here so the anchor doesn't trigger a hash
                // jump when the consumer is wiring its own router.
                event.preventDefault()
                handleClick(article)
              }}
              className={cn(
                'flex w-full flex-col gap-1 rounded-sm py-2 text-left transition-colors',
                'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <span className="text-sm font-medium text-foreground">{article.title}</span>
              {article.excerpt.length > 0 ? (
                <span className="text-xs text-muted-foreground">{article.excerpt}</span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

RelatedArticles.displayName = 'PatinaRelatedArticles'
