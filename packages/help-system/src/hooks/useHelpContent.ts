/**
 * Help content fetch hook.
 *
 * CANONICAL CONTRACT — see
 * `packages/help-system/src/persistence/helpContentQuery.md`.
 *
 * The same 4-step persona fallback chain is implemented on iOS at
 * `apps/mobile/Patina/Patina/Features/Help/Services/SanityHelpClient.swift`.
 * The same (surfaceKey, contentType, persona) triple must resolve to the
 * same Sanity `_id` on both platforms. If you change anything below,
 * update the Swift client, the shared doc, and both test suites in the
 * same commit — drift here re-opens risk R3.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getSanityClient } from '../sanityClient'
import { isPlaceholderContent } from '../isPlaceholderContent'
import type { ContentTypeMap, HelpContentType, Persona } from '../contentTypes'

/**
 * Lightweight GROQ tagged template literal — avoids pulling in next-sanity or
 * any extra bundle weight. The Sanity client accepts plain strings; the tag
 * just returns the interpolated string with no transformation. It exists
 * purely for editor syntax highlighting and grep-ability.
 */
const groq = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  String.raw({ raw: strings }, ...values)

const HELP_CONTENT_STALE_MS = 5 * 60 * 1000 // 5 minutes per spec §7.3

/**
 * Fetches help content from Sanity by surface key + content type, applying
 * the canonical 4-step persona fallback chain (spec §7.3, full contract in
 * `packages/help-system/src/persistence/helpContentQuery.md`):
 *
 *   1. Exact match — surfaceKey + contentType + persona
 *   2. surfaceKey + contentType + persona='all'       (skip if persona==='all')
 *   3. Parent surfaceKey + contentType + persona      (one level up — split
 *                                                       on last `/`)
 *   4. Parent surfaceKey + contentType + persona='all' (skip if persona==='all')
 *   5. Return null and log a single warning.
 *
 * On Sanity downtime: returns null gracefully (spec Section 13.4).
 *
 * @param surfaceKey  - A surface key from SurfaceKeys (e.g. "designer-portal/pipeline/project-list")
 * @param contentType - The content type to fetch (e.g. 'tooltip', 'emptyState')
 * @param persona     - The current user's persona; defaults to 'all'
 */
export function useHelpContent<T extends HelpContentType>(
  surfaceKey: string,
  contentType: T,
  persona: Persona = 'all',
): UseQueryResult<ContentTypeMap[T] | null> {
  return useQuery({
    queryKey: ['help-content', surfaceKey, contentType, persona],
    queryFn: async () => {
      const client = getSanityClient()
      const result = await fetchWithFallback(client, surfaceKey, contentType, persona)
      return (result ?? null) as ContentTypeMap[T] | null
    },
    staleTime: HELP_CONTENT_STALE_MS,
    gcTime: HELP_CONTENT_STALE_MS * 2,
    retry: 1, // one quiet retry; help content downtime must not spam error logs
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type SanityClientType = ReturnType<typeof getSanityClient>

/**
 * Executes the canonical 4-step fallback chain. The plan is documented in
 * `packages/help-system/src/persistence/helpContentQuery.md` and mirrored
 * in `SanityHelpClient.fallbackPlan` on iOS.
 *
 * Each step issues one GROQ query. Sanity network errors are caught at the
 * query level and logged to console; the chain returns null rather than
 * propagating (spec §13.4 — Sanity downtime must not crash the UI).
 */
async function fetchWithFallback(
  client: SanityClientType,
  surfaceKey: string,
  contentType: HelpContentType,
  persona: Persona,
): Promise<unknown | null> {
  // Step 1: exact match
  const exact = await tryFetch(client, surfaceKey, contentType, persona)
  if (exact) return exact

  // Step 2: same surface key, persona='all' fallback (skip if we already tried 'all')
  if (persona !== 'all') {
    const allPersona = await tryFetch(client, surfaceKey, contentType, 'all')
    if (allPersona) return allPersona
  }

  // Steps 3 & 4: parent surface key (one level up)
  const lastSlash = surfaceKey.lastIndexOf('/')
  if (lastSlash > 0) {
    const parentKey = surfaceKey.slice(0, lastSlash)

    // Step 3: parent + original persona
    const parent = await tryFetch(client, parentKey, contentType, persona)
    if (parent) return parent

    // Step 4: parent + 'all'
    if (persona !== 'all') {
      const parentAll = await tryFetch(client, parentKey, contentType, 'all')
      if (parentAll) return parentAll
    }
  }

  // All fallbacks exhausted
  if (typeof console !== 'undefined') {
    console.warn(
      `[help-system] No content found for surfaceKey="${surfaceKey}" contentType="${contentType}" persona="${persona}"`,
    )
  }
  return null
}

/**
 * Executes a single GROQ fetch. Returns null on both "not found" and network
 * errors — help content absence must never crash the UI (spec §13.4).
 */
async function tryFetch(
  client: SanityClientType,
  surfaceKey: string,
  contentType: HelpContentType,
  persona: Persona,
): Promise<unknown | null> {
  // Project to flat field names the components read, falling back from a
  // top-level field to the studio's nested object shape (tooltipContent.* etc.).
  // `coalesce(flat, nested...)` keeps flat-authored docs working while also
  // rendering content authored via the Studio's nested schema (SEC-06/07).
  const query = groq`*[_type == "helpContent" && surfaceKey == $sk && contentType == $ct && persona == $p][0]{
    _id, surfaceKey, contentType, persona,
    "eyebrow": coalesce(eyebrow, tooltipContent.eyebrow, helpArticleContent.eyebrow),
    "body": coalesce(body, tooltipContent.body, coachmarkContent.body),
    "heading": coalesce(heading, emptyStateContent.heading, coachmarkContent.heading),
    "description": coalesce(description, emptyStateContent.description),
    "icon": coalesce(icon, emptyStateContent.icon),
    "primaryActionLabel": coalesce(primaryActionLabel, emptyStateContent.primaryActionLabel),
    "secondaryActionLabel": coalesce(secondaryActionLabel, emptyStateContent.secondaryActionLabel),
    "secondaryActionArticleKey": coalesce(secondaryActionArticleKey, emptyStateContent.secondaryActionArticleKey),
    "ctaLabel": coalesce(ctaLabel, coachmarkContent.ctaLabel)
  }`
  try {
    const result: unknown = await client.fetch(query, { sk: surfaceKey, ct: contentType, p: persona })
    if (!result) return null
    // Centralized placeholder guard: a seed doc whose copy is still placeholder
    // text must be treated as a MISS so the fallback chain continues (and
    // ultimately yields null → inline fallback / graceful absence per §13.4).
    if (isPlaceholderDocument(result)) return null
    return result
  } catch (err) {
    // Sanity unavailable — fail silently per spec §13.4
    if (typeof console !== 'undefined') {
      console.warn('[help-system] Sanity fetch failed', err)
    }
    return null
  }
}

/**
 * A fetched help document is placeholder when any of the user-visible copy
 * fields the components render (`body`, `heading`, `description`) is recognized
 * seed/placeholder text. We check all three because different content types
 * surface different fields (e.g. tooltip→body, emptyState→heading+description).
 */
function isPlaceholderDocument(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false
  const { body, heading, description } = doc as {
    body?: unknown
    heading?: unknown
    description?: unknown
  }
  return (
    isPlaceholderContent(body) ||
    isPlaceholderContent(heading) ||
    isPlaceholderContent(description)
  )
}
