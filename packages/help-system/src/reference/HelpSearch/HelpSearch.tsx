'use client'

/**
 * HelpSearch — Layer 4 (Reference) full-text search across help content.
 *
 * Spec references:
 *   - §4 (Reference layer) — full-text search across articles + tooltips
 *   - §10.1 — Analytics: `help.search.performed`, `help.search.result_clicked`
 *            with snake_case property keys (R11 decision)
 *   - §7.3 — Sanity stale-while-revalidate cache window (5 min)
 *
 * Behavior summary:
 *   - Renders an accessible <input type="search"> wired to a 250ms debounce.
 *   - Once the debounced query is non-empty, fires a parameterized GROQ query
 *     against the deployed `helpContent` schema (see studios/help-system/
 *     schemas/helpContent.ts). The query searches:
 *       • helpArticleContent.title         (string)
 *       • pt::text(helpArticleContent.body) (portable text → plain text)
 *       • tooltipContent.body              (used by tooltip / fieldHelper /
 *                                           learnMore / coachmark variants)
 *   - Persona filter (when provided) is applied as a parameter; documents
 *     marked `persona == "all"` are always included.
 *   - Renders four states:
 *       1. empty (no query)
 *       2. loading (query in flight)
 *       3. results (listbox with role="option" rows)
 *       4. no-results
 *   - Analytics events use snake_case property keys per R11. The raw `query`
 *     text is NOT sent — only `query_length` — to avoid leaking PII through
 *     casual searches.
 *   - Keyboard navigation: ArrowDown / ArrowUp move the active row; Enter
 *     selects it. Aria-selected is set on the active option.
 *   - On click, the component:
 *       a. Fires `help.search.result_clicked`
 *       b. Calls `onResultClick` if provided (delegated navigation — typical
 *          for the C5 panel)
 *       c. Otherwise opens `/help/{surfaceKey}` in the same tab (default
 *          behaviour for the /help page consumer of E5)
 *
 * Graceful degradation (spec §13.4):
 *   - Sanity throws → component renders the no-results state, never crashes
 *   - window.posthog absent → analytics calls no-op silently
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { getSanityClient } from '../../sanityClient'
import type { Persona } from '../../contentTypes'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface HelpSearchResult {
  id: string
  surfaceKey: string
  contentType: 'helpArticle' | 'tooltip' | 'fieldHelper' | 'sectionIntro' | string
  title?: string
  excerpt?: string
}

export interface HelpSearchProps {
  /** Optional initial query — seeds the input and triggers an immediate search. */
  initialQuery?: string
  /** Optional placeholder; defaults to "Search help articles". */
  placeholder?: string
  /**
   * Optional click handler. If provided, the panel is purely a list view and
   * the consumer owns navigation (typical for the C5 panel embedding). If
   * omitted, clicking a row navigates to `/help/{surfaceKey}` in the same tab
   * (E5's /help page consumer).
   */
  onResultClick?: (result: HelpSearchResult) => void
  /** Maximum results to fetch. Defaults to 20. */
  maxResults?: number
  /**
   * Optional persona filter. When set, results are scoped to that persona
   * plus documents with persona === 'all'. Omit or pass null for no filter.
   */
  persona?: Persona | null
  /** Forwarded to the outer container. */
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 250
const SEARCH_STALE_MS = 5 * 60 * 1000 // 5 min — mirrors useHelpContent

// ─── GROQ ─────────────────────────────────────────────────────────────────────

/**
 * Lightweight GROQ tagged template literal — same convention as useHelpContent
 * and ContextualHelpPanel. Returns the interpolated string verbatim so the
 * tag exists purely for editor highlighting and grep-ability. Crucially:
 * `$q`, `$max`, and `$persona` remain parameter placeholders that the Sanity
 * client binds at query time, NOT string-concatenated user input.
 */
const groq = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  String.raw({ raw: strings }, ...values)

/**
 * GROQ query — searches help content across three text surfaces.
 *
 *   1. helpArticleContent.title          — exact + substring via `match`
 *   2. pt::text(helpArticleContent.body) — portable-text body, plain-text
 *   3. tooltipContent.body               — short-form copy (tooltips, field
 *                                          helpers, learn-more, coachmarks)
 *
 * Persona filter: docs with persona === 'all' are always candidates; when a
 * persona is passed, that persona's docs are also included.
 *
 * `$q` is bound as a Sanity parameter — never string-concatenated. The Sanity
 * client escapes regex metacharacters inside `match` operands, so the input
 * is safe.
 */
const SEARCH_QUERY = groq`
  *[_type == "helpContent"
    && (
         helpArticleContent.title match $q
      || title match $q
      || pt::text(helpArticleContent.body) match $q
      || pt::text(body) match $q
      || tooltipContent.body match $q
      || body match $q
    )
    && ($persona == null || !defined(persona) || persona == "all" || persona == $persona)
  ] | order(_updatedAt desc) [0...$max] {
    "_id": _id,
    surfaceKey,
    contentType,
    "title": coalesce(helpArticleContent.title, title, surfaceKey),
    "excerpt": coalesce(
      helpArticleContent.oneSentenceAnswer,
      oneSentenceAnswer,
      pt::text(coalesce(helpArticleContent.body, body))[0...160],
      tooltipContent.body
    )
  }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawResult = {
  _id?: unknown
  surfaceKey?: unknown
  contentType?: unknown
  title?: unknown
  excerpt?: unknown
}

function normaliseResult(row: RawResult): HelpSearchResult | null {
  if (typeof row._id !== 'string' || typeof row.surfaceKey !== 'string') {
    return null
  }
  const contentType =
    typeof row.contentType === 'string' && row.contentType.length > 0
      ? row.contentType
      : 'helpArticle'
  return {
    id: row._id,
    surfaceKey: row.surfaceKey,
    contentType,
    title: typeof row.title === 'string' && row.title.length > 0 ? row.title : undefined,
    excerpt: typeof row.excerpt === 'string' && row.excerpt.length > 0 ? row.excerpt : undefined,
  }
}

/**
 * Build the Sanity `match` operand for the user's query. We:
 *   1. Lowercase + trim (GROQ `match` is case-insensitive on Sanity's side,
 *      but normalising keeps the parameter stable for cache keys).
 *   2. Strip regex-metacharacters that GROQ's `match` would otherwise treat
 *      as wildcards.
 *   3. Wrap each whitespace-separated token in a leading-prefix wildcard so
 *      "pipe" matches "Pipeline".
 *
 * Returns null for empty input.
 */
function buildMatchOperand(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed.length === 0) return null
  // Strip characters that would have special meaning in GROQ's match glob
  // ('*' and '?'). The remaining text is bound as a parameter, so SQL/GROQ
  // injection is impossible.
  const sanitised = trimmed.replace(/[*?]/g, ' ').replace(/\s+/g, ' ').trim()
  if (sanitised.length === 0) return null
  // Add a trailing wildcard so prefix matching works ("pipe" → "Pipeline").
  return `${sanitised}*`
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

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSearchResults(
  query: string,
  max: number,
  persona: Persona | null,
): Promise<HelpSearchResult[]> {
  const operand = buildMatchOperand(query)
  if (!operand) return []
  try {
    const client = getSanityClient()
    const result = (await client.fetch(SEARCH_QUERY, {
      q: operand,
      max,
      persona,
    })) as unknown
    if (!Array.isArray(result)) return []
    return result
      .map((row) => normaliseResult(row as RawResult))
      .filter((r): r is HelpSearchResult => r !== null)
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[help-system] HelpSearch fetch failed', err)
    }
    return []
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HelpSearch({
  initialQuery = '',
  placeholder = 'Search help articles',
  onResultClick,
  maxResults = 20,
  persona = null,
  className,
}: HelpSearchProps) {
  const [query, setQuery] = React.useState(initialQuery)
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS)
  const trimmedDebounced = debouncedQuery.trim()
  const hasQuery = trimmedDebounced.length > 0

  // Active row index for keyboard navigation. -1 means "input has focus, no
  // option selected yet".
  const [activeIndex, setActiveIndex] = React.useState(-1)

  // Track the most recent performed `query_length` so we only emit one
  // `help.search.performed` per debounced query.
  const lastPerformedRef = React.useRef<string | null>(null)

  const searchQueryHook = useQuery({
    queryKey: ['help-search', trimmedDebounced, maxResults, persona ?? 'all'],
    queryFn: () => fetchSearchResults(trimmedDebounced, maxResults, persona),
    enabled: hasQuery,
    staleTime: SEARCH_STALE_MS,
    gcTime: SEARCH_STALE_MS * 2,
    retry: 1,
  })

  const results = React.useMemo<HelpSearchResult[]>(
    () => (hasQuery && searchQueryHook.data ? searchQueryHook.data : []),
    [hasQuery, searchQueryHook.data],
  )

  // Reset active row whenever the result set changes
  React.useEffect(() => {
    setActiveIndex(-1)
  }, [trimmedDebounced, results.length])

  // Fire help.search.performed after each debounced search settles (once per
  // unique query value).
  React.useEffect(() => {
    if (!hasQuery) return
    if (searchQueryHook.isFetching) return
    if (lastPerformedRef.current === trimmedDebounced) return
    lastPerformedRef.current = trimmedDebounced
    safeCapture('help.search.performed', {
      query_length: trimmedDebounced.length,
      result_count: results.length,
    })
  }, [hasQuery, searchQueryHook.isFetching, trimmedDebounced, results.length])

  const handleSelect = React.useCallback(
    (result: HelpSearchResult, index: number) => {
      safeCapture('help.search.result_clicked', {
        surface_key: result.surfaceKey,
        result_index: index,
        content_type: result.contentType,
        query_length: trimmedDebounced.length,
      })
      if (onResultClick) {
        onResultClick(result)
        return
      }
      // Default: navigate to the canonical /help/{surfaceKey} page (E5's
      // dedicated Reference page). In SSR / test contexts there is no
      // window.location; guard the call. The try/catch swallows jsdom's
      // "navigation is not implemented" warning so default-handler tests do
      // not pollute their own output.
      if (typeof window !== 'undefined' && window.location) {
        try {
          window.location.assign(`/help/${result.surfaceKey}`)
        } catch {
          // jsdom / SSR — default navigation is unavailable; ignore silently.
        }
      }
    },
    [onResultClick, trimmedDebounced.length],
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => (prev + 1) % results.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
      } else if (event.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < results.length) {
          event.preventDefault()
          handleSelect(results[activeIndex], activeIndex)
        }
      } else if (event.key === 'Escape') {
        setActiveIndex(-1)
      }
    },
    [activeIndex, results, handleSelect],
  )

  const isLoading = hasQuery && searchQueryHook.isFetching
  const showResults = hasQuery && !isLoading && results.length > 0
  const showNoResults =
    hasQuery && !isLoading && results.length === 0 && searchQueryHook.isFetched

  const listboxId = React.useId()

  return (
    <div
      className={[
        'flex w-full flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="help-search"
    >
      {/* ── Input ────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          role="searchbox"
          aria-label="Search help articles"
          aria-controls={showResults ? listboxId : undefined}
          aria-expanded={showResults}
          aria-activedescendant={
            showResults && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-input bg-background px-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="help-search-input"
        />
      </div>

      {/* ── States ───────────────────────────────────────────────────────── */}
      {!hasQuery ? (
        <p
          className="px-1 py-4 text-sm text-muted-foreground"
          data-testid="help-search-empty"
        >
          Start typing to search help articles.
        </p>
      ) : isLoading ? (
        <p
          className="flex items-center gap-2 px-1 py-4 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="help-search-loading"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 animate-pulse rounded-full bg-muted-foreground/40"
          />
          Searching…
        </p>
      ) : showNoResults ? (
        <div
          className="flex flex-col gap-1 px-1 py-4"
          data-testid="help-search-no-results"
        >
          <p className="text-sm font-medium text-foreground">
            No results for &quot;{trimmedDebounced}&quot;
          </p>
          <p className="text-xs text-muted-foreground">
            Try a different keyword or browse the Help Center.
          </p>
        </div>
      ) : showResults ? (
        <ul
          role="listbox"
          id={listboxId}
          aria-label="Help search results"
          className="flex flex-col divide-y divide-border/40"
          data-testid="help-search-results"
        >
          {results.map((result, index) => {
            const isActive = index === activeIndex
            return (
              <li
                key={result.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isActive}
                data-testid={`help-search-result-${result.id}`}
                data-active={isActive ? 'true' : undefined}
                className={[
                  'group flex cursor-pointer flex-col gap-1 rounded-sm px-2 py-3 transition-colors',
                  'hover:bg-muted/40 focus-within:bg-muted/40',
                  isActive ? 'bg-muted/40' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelect(result, index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="text-sm font-medium text-foreground">
                  {result.title ?? result.surfaceKey}
                </span>
                {result.excerpt ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {result.excerpt}
                  </span>
                ) : null}
                <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground/60">
                  {result.contentType}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

HelpSearch.displayName = 'PatinaHelpSearch'
