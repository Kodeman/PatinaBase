import { createClient, type SanityClient } from '@sanity/client'

const SANITY_PROJECT_ID =
  (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SANITY_PROJECT_ID : undefined) ??
  'kv3qrinl'
const SANITY_DATASET =
  (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SANITY_DATASET : undefined) ??
  'production'

/**
 * Freeze API version on sprint-1 plan date (Sanity best practice: never use 'latest').
 * Increment when adopting a new Sanity API feature.
 */
const SANITY_API_VERSION = '2026-05-18'

let _client: SanityClient | null = null

/**
 * Returns a memoized Sanity client. Consumers (portals) MAY override by passing
 * a custom client via the SanityClientProvider (added in A6).
 */
export function getSanityClient(): SanityClient {
  if (!_client) {
    _client = createClient({
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      apiVersion: SANITY_API_VERSION,
      useCdn: true,      // help content is read-mostly; CDN is fine and faster
      perspective: 'published', // only published content, never drafts
    })
  }
  return _client
}

/** Test helper — reset the memoized client. Do NOT export from index. */
export function _resetSanityClient(): void {
  _client = null
}
