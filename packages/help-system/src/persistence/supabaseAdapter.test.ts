/**
 * Tests for the Supabase persistence adapter (Sprint 4 / S4-1).
 *
 * Covers:
 *  • loadHelpState returns the blob, treats errors as empty
 *  • saveHelpState patches the column; failures are logged not thrown
 *  • createSupabaseTourStateBackend writes through to the cache
 *  • createSupabaseFeatureAnnouncementBackend writes through to the cache
 *  • createSupabaseHelpStateBackends.hydrate populates the cache from Supabase
 *  • migrateLocalToSupabase walks localStorage and clears keys
 *  • Hydration race: pending in-memory writes during hydrate are not lost
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSupabaseFirstAuthoredBackend,
  createSupabaseHelpStateBackends,
  createSupabaseMarginNoteBackend,
  loadHelpState,
  migrateLocalToSupabase,
  saveHelpState,
} from './supabaseAdapter'
import type { HelpStateSupabaseClient, HelpStateBlob } from './types'
import { TOUR_STATE_STORAGE_PREFIX } from '../proactive/TourController/tourState'

/**
 * Tiny in-memory Supabase stub. `help_state_merge` is modelled as the W1-c RPC
 * (top-level shallow merge into the stored column, returning the result).
 * `lastWrite` is the column after the last successful merge; `rpcCalls`
 * captures each RPC payload sent across the wire.
 */
function makeStubClient(initial: HelpStateBlob | null = {}): {
  client: HelpStateSupabaseClient
  lastWrite: { current: HelpStateBlob | null }
  rpcCalls: { fn: string; args: { p_patch: HelpStateBlob } }[]
  selectError: { current: { message: string } | null }
  rpcError: { current: { message: string } | null }
} {
  let stored: HelpStateBlob | null = initial
  const lastWrite: { current: HelpStateBlob | null } = { current: null }
  const rpcCalls: { fn: string; args: { p_patch: HelpStateBlob } }[] = []
  const selectError: { current: { message: string } | null } = { current: null }
  const rpcError: { current: { message: string } | null } = { current: null }
  const client: HelpStateSupabaseClient = {
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => ({
          single: async () => ({
            data: selectError.current ? null : { help_state: stored },
            error: selectError.current,
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: { p_patch: HelpStateBlob }) => {
      rpcCalls.push({ fn, args: JSON.parse(JSON.stringify(args)) })
      if (rpcError.current) return { data: null, error: rpcError.current }
      // Two-level merge, as 00674: an object patch value merges one level down
      // onto the stored value (or onto {} when that is not an object) and a
      // second-level null deletes that entry; anything else replaces the key.
      const isObj = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null && !Array.isArray(v)
      const base: Record<string, unknown> = isObj(stored) ? { ...stored } : {}
      const patch = JSON.parse(JSON.stringify(args.p_patch)) as Record<string, unknown>
      for (const [key, value] of Object.entries(patch)) {
        const prev = base[key]
        if (!isObj(value)) {
          base[key] = value
          continue
        }
        const level: Record<string, unknown> = { ...(isObj(prev) ? prev : {}), ...value }
        for (const k of Object.keys(level)) if (level[k] === null) delete level[k]
        base[key] = level
      }
      stored = base as HelpStateBlob
      lastWrite.current = stored
      return { data: stored, error: null }
    },
  }
  return { client, lastWrite, rpcCalls, selectError, rpcError }
}

describe('loadHelpState', () => {
  it('returns the blob from Supabase', async () => {
    const { client } = makeStubClient({
      tours: { foo: { completed: true } },
    })
    const blob = await loadHelpState(client, 'user-1')
    expect(blob).toEqual({ tours: { foo: { completed: true } } })
  })

  it('returns empty when Supabase returns an error', async () => {
    const { client, selectError } = makeStubClient({})
    selectError.current = { message: 'rls denied' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const blob = await loadHelpState(client, 'user-1')
    expect(blob).toEqual({})
    warn.mockRestore()
  })

  it('returns empty when the column is null', async () => {
    const { client } = makeStubClient(null)
    const blob = await loadHelpState(client, 'user-1')
    expect(blob).toEqual({})
  })
})

describe('saveHelpState', () => {
  it('merges only the named keys through help_state_merge and returns the column', async () => {
    const { client, rpcCalls } = makeStubClient({
      marginNotes: { 'doc-first-touch': '2026-01-01T00:00:00Z' },
    })
    const merged = await saveHelpState(
      client,
      'user-1',
      {
        tours: { tour: { abandoned: true } },
        marginNotes: { stale: '2020-01-01T00:00:00Z' },
      },
      ['tours'],
    )
    expect(rpcCalls).toEqual([
      { fn: 'help_state_merge', args: { p_patch: { tours: { tour: { abandoned: true } } } } },
    ])
    expect(merged).toEqual({
      tours: { tour: { abandoned: true } },
      marginNotes: { 'doc-first-touch': '2026-01-01T00:00:00Z' },
    })
  })

  it('does not throw when the RPC fails', async () => {
    const { client, rpcError } = makeStubClient({})
    rpcError.current = { message: 'permission denied' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(saveHelpState(client, 'user-1', { tours: {} }, ['tours'])).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('createSupabaseHelpStateBackends', () => {
  it('returns empty state until hydrate resolves', () => {
    const { client } = makeStubClient({ tours: { x: { completed: true } } })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    // Before hydrate, the in-memory cache is empty.
    expect(backends.tourBackend.getTourState('x')).toEqual({})
    expect(backends.featureBackend.getFeatureAnnouncementState('anything')).toBeNull()
  })

  it('hydrate populates the cache with server state', async () => {
    const { client } = makeStubClient({
      tours: { x: { completed: true, completedAt: '2026-05-19T00:00:00Z' } },
      featureAnnouncements: { 'v2-tags': { dismissedAt: '2026-05-19T00:00:00Z' } },
    })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    expect(backends.tourBackend.getTourState('x').completed).toBe(true)
    expect(backends.featureBackend.getFeatureAnnouncementState('v2-tags')).toEqual({
      dismissedAt: '2026-05-19T00:00:00Z',
    })
  })

  it('write-through patches Supabase', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    backends.tourBackend.setTourState('alpha', {
      completed: true,
      completedAt: '2026-05-19T00:00:00Z',
    })
    await backends.flush()
    expect(lastWrite.current).toEqual({
      tours: {
        alpha: { completed: true, completedAt: '2026-05-19T00:00:00Z' },
      },
    })
  })

  it('write-through serializes concurrent writes', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    // Three writes in quick succession — the last write must include the
    // accumulated state, never just the latest patch in isolation.
    backends.tourBackend.setTourState('a', { completed: true })
    backends.tourBackend.setTourState('b', { abandoned: true })
    backends.featureBackend.setFeatureAnnouncementState('feat', {
      dismissedAt: '2026-05-19',
    })
    await backends.flush()
    expect(lastWrite.current?.tours?.a).toEqual({ completed: true })
    expect(lastWrite.current?.tours?.b).toEqual({ abandoned: true })
    expect(lastWrite.current?.featureAnnouncements?.feat).toEqual({
      dismissedAt: '2026-05-19',
    })
  })

  it('hydrate does not clobber in-memory writes that happened during the round-trip', async () => {
    const { client, lastWrite, rpcCalls } = makeStubClient({
      tours: { x: { completed: true } },
    })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    // Simulate a user action firing before the hydrate completes.
    backends.tourBackend.setTourState('y', { abandoned: true })
    await backends.hydrate()
    await backends.flush()
    // Both keys survive.
    expect(backends.tourBackend.getTourState('x').completed).toBe(true)
    expect(backends.tourBackend.getTourState('y').abandoned).toBe(true)
    // The pre-hydrate write carried only its own tour (SQ-294 R1 finding 9) ...
    expect(rpcCalls[0]!.args.p_patch.tours).toEqual({ y: { abandoned: true } })
    // ... and the server's two-level merge kept the stored sibling.
    expect(lastWrite.current?.tours?.x).toEqual({ completed: true })
    expect(lastWrite.current?.tours?.y).toEqual({ abandoned: true })
  })

  it('clearTourState drops the record + writes the cleared blob through, leaving siblings', async () => {
    const { client, lastWrite, rpcCalls } = makeStubClient({
      tours: { walk: { completed: true }, keep: { abandoned: true } },
    })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    expect(backends.tourBackend.getTourState('walk')).toEqual({ completed: true })

    // This is what TourController.restart() dispatches through for a signed-in
    // user — the record must leave BOTH the in-memory cache and Supabase.
    backends.tourBackend.clearTourState?.('walk')
    await backends.flush()

    expect(backends.tourBackend.getTourState('walk')).toEqual({})
    // The server merges `tours` one level down, so the clear is an explicit null.
    expect(rpcCalls.at(-1)!.args.p_patch).toEqual({ tours: { walk: null } })
    expect(lastWrite.current?.tours?.walk).toBeUndefined()
    // Sibling tour is untouched.
    expect(lastWrite.current?.tours?.keep).toEqual({ abandoned: true })
    expect(backends.tourBackend.getTourState('keep')).toEqual({ abandoned: true })
  })

  it('clearTourState on an absent record schedules no write', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    // hydrate only reads — no write yet.
    expect(lastWrite.current).toBeNull()
    backends.tourBackend.clearTourState?.('nope')
    await backends.flush()
    expect(lastWrite.current).toBeNull()
  })
})

describe('migrateLocalToSupabase', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('copies tour state out of localStorage into Supabase and clears local keys', async () => {
    window.localStorage.setItem(
      `${TOUR_STATE_STORAGE_PREFIX}walk`,
      JSON.stringify({
        completed: true,
        completedAt: '2026-05-19T00:00:00Z',
      }),
    )
    const { client, lastWrite } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    const result = await migrateLocalToSupabase(backends)
    expect(result.toursMigrated).toBe(1)
    expect(lastWrite.current?.tours?.walk).toEqual({
      completed: true,
      completedAt: '2026-05-19T00:00:00Z',
    })
    expect(
      window.localStorage.getItem(`${TOUR_STATE_STORAGE_PREFIX}walk`),
    ).toBeNull()
  })

  it('copies feature announcement state and clears the local key', async () => {
    window.localStorage.setItem(
      'patina.help.feature_announcement.v1',
      JSON.stringify({
        'v2-batch-tagging': { dismissedAt: '2026-05-19T00:00:00Z' },
      }),
    )
    const { client, lastWrite } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    const result = await migrateLocalToSupabase(backends)
    expect(result.featureAnnouncementsMigrated).toBe(1)
    expect(lastWrite.current?.featureAnnouncements?.['v2-batch-tagging']).toEqual({
      dismissedAt: '2026-05-19T00:00:00Z',
    })
    expect(window.localStorage.getItem('patina.help.feature_announcement.v1')).toBeNull()
  })

  it('does not overwrite Supabase entries that already resolved a tour', async () => {
    window.localStorage.setItem(
      `${TOUR_STATE_STORAGE_PREFIX}walk`,
      JSON.stringify({ abandoned: true, atStep: 2 }),
    )
    const { client, lastWrite } = makeStubClient({
      tours: { walk: { completed: true } },
    })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    const result = await migrateLocalToSupabase(backends)
    // Local should be cleared, but no migration write counted.
    expect(result.toursMigrated).toBe(0)
    expect(
      window.localStorage.getItem(`${TOUR_STATE_STORAGE_PREFIX}walk`),
    ).toBeNull()
    // The Supabase blob should still reflect completed, not abandoned.
    // (Either no write happened OR the existing completed: true survives.)
    if (lastWrite.current?.tours?.walk) {
      expect(lastWrite.current.tours.walk.completed).toBe(true)
      expect(lastWrite.current.tours.walk.abandoned).toBeUndefined()
    }
  })

  it('is a no-op when localStorage is empty', async () => {
    const { client } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    await backends.hydrate()
    const result = await migrateLocalToSupabase(backends)
    expect(result).toEqual({
      toursMigrated: 0,
      featureAnnouncementsMigrated: 0,
      marginNotesMigrated: 0,
      firstAuthoredMigrated: 0,
    })
  })

  it('sweeps patina:margin-note:* keys into the margin-note backend and clears them', async () => {
    window.localStorage.setItem('patina:margin-note:doc-first-touch', '1747699200000')
    const { client } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const marginNoteBackend = createSupabaseMarginNoteBackend(client, 'user-1')
    await backends.hydrate()
    await marginNoteBackend.hydrate()
    const result = await migrateLocalToSupabase(backends, marginNoteBackend)
    expect(result.marginNotesMigrated).toBe(1)
    expect(marginNoteBackend.hasSeen('doc-first-touch')).toBe(true)
    expect(
      window.localStorage.getItem('patina:margin-note:doc-first-touch'),
    ).toBeNull()
  })

  it('does not double-count a margin note the backend already has', async () => {
    window.localStorage.setItem('patina:margin-note:desk-first-touch', '1')
    const { client } = makeStubClient({ marginNotes: { 'desk-first-touch': '2026-01-01T00:00:00Z' } })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const marginNoteBackend = createSupabaseMarginNoteBackend(client, 'user-1')
    await backends.hydrate()
    await marginNoteBackend.hydrate()
    const result = await migrateLocalToSupabase(backends, marginNoteBackend)
    expect(result.marginNotesMigrated).toBe(0)
    expect(
      window.localStorage.getItem('patina:margin-note:desk-first-touch'),
    ).toBeNull()
  })

  it('sweeps the patina:first-authored key into the first-authored backend and clears it', async () => {
    window.localStorage.setItem('patina:first-authored', '1747699200000')
    const { client } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const firstAuthoredBackend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    await backends.hydrate()
    await firstAuthoredBackend.hydrate()
    const result = await migrateLocalToSupabase(backends, undefined, firstAuthoredBackend)
    expect(result.firstAuthoredMigrated).toBe(1)
    expect(firstAuthoredBackend.hasAuthored()).toBe(true)
    expect(window.localStorage.getItem('patina:first-authored')).toBeNull()
  })

  it('does not double-count first-authored when the backend already has it, but still clears the local key', async () => {
    window.localStorage.setItem('patina:first-authored', '1')
    const { client } = makeStubClient({ firstAuthoredAt: '2026-01-01T00:00:00Z' })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const firstAuthoredBackend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    await backends.hydrate()
    await firstAuthoredBackend.hydrate()
    const result = await migrateLocalToSupabase(backends, undefined, firstAuthoredBackend)
    expect(result.firstAuthoredMigrated).toBe(0)
    expect(window.localStorage.getItem('patina:first-authored')).toBeNull()
  })

  it('leaves first-authored untouched when no local key exists', async () => {
    const { client } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const firstAuthoredBackend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    await backends.hydrate()
    await firstAuthoredBackend.hydrate()
    const result = await migrateLocalToSupabase(backends, undefined, firstAuthoredBackend)
    expect(result.firstAuthoredMigrated).toBe(0)
    expect(firstAuthoredBackend.hasAuthored()).toBe(false)
  })
})

describe('createSupabaseMarginNoteBackend', () => {
  it('hasSeen is false before hydrate and before markSeen', () => {
    const { client } = makeStubClient({})
    const backend = createSupabaseMarginNoteBackend(client, 'user-1')
    expect(backend.hasSeen('doc-first-touch')).toBe(false)
  })

  it('markSeen then hasSeen round-trips true and writes through', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backend = createSupabaseMarginNoteBackend(client, 'user-1')
    backend.markSeen('doc-first-touch')
    expect(backend.hasSeen('doc-first-touch')).toBe(true)
    await backend.flush()
    expect(lastWrite.current?.marginNotes?.['doc-first-touch']).toEqual(
      expect.any(String),
    )
  })

  it('a version-suffixed key is unseen even when its unsuffixed sibling is seen (decision 5)', () => {
    const { client } = makeStubClient({})
    const backend = createSupabaseMarginNoteBackend(client, 'user-1')
    backend.markSeen('doc-first-touch')
    expect(backend.hasSeen('doc-first-touch')).toBe(true)
    expect(backend.hasSeen('doc-first-touch@2')).toBe(false)
    backend.markSeen('doc-first-touch@2')
    expect(backend.hasSeen('doc-first-touch@2')).toBe(true)
    // Original key is untouched by the re-arm.
    expect(backend.hasSeen('doc-first-touch')).toBe(true)
  })

  it('hydrate merges server state without clobbering an in-flight local write', async () => {
    const { client, lastWrite, rpcCalls } = makeStubClient({
      marginNotes: { 'desk-first-touch': '2026-01-01T00:00:00Z' },
    })
    const backend = createSupabaseMarginNoteBackend(client, 'user-1')
    backend.markSeen('doc-first-touch')
    await backend.hydrate()
    await backend.flush()
    expect(backend.hasSeen('desk-first-touch')).toBe(true)
    expect(backend.hasSeen('doc-first-touch')).toBe(true)
    // The pre-hydrate write carried only its own note (SQ-294 R1 finding 9) ...
    expect(Object.keys(rpcCalls[0]!.args.p_patch.marginNotes ?? {})).toEqual(['doc-first-touch'])
    // ... and the server's two-level merge kept the stored sibling.
    expect(lastWrite.current?.marginNotes?.['desk-first-touch']).toBe('2026-01-01T00:00:00Z')
    expect(lastWrite.current?.marginNotes?.['doc-first-touch']).toEqual(expect.any(String))
  })

  it('a tour write after a margin-note write leaves marginNotes intact (SQ-265)', async () => {
    const { client, lastWrite, rpcCalls } = makeStubClient({})
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    const marginNoteBackend = createSupabaseMarginNoteBackend(client, 'user-1')
    await backends.hydrate()
    await marginNoteBackend.hydrate()

    marginNoteBackend.markSeen('doc-first-touch')
    await marginNoteBackend.flush()
    backends.tourBackend.setTourState('desk-walkthrough', { completed: true })
    await backends.flush()

    expect(rpcCalls.map((c) => Object.keys(c.args.p_patch).sort())).toEqual([
      ['marginNotes'],
      ['featureAnnouncements', 'tours'],
    ])
    expect(rpcCalls[1]!.args.p_patch).not.toHaveProperty('marginNotes')
    expect(lastWrite.current?.marginNotes?.['doc-first-touch']).toEqual(expect.any(String))
    expect(lastWrite.current?.tours?.['desk-walkthrough']).toEqual({ completed: true })
    // The tour cache adopted the returned column, so it now sees the note too.
    expect(backends.getBlob().marginNotes?.['doc-first-touch']).toEqual(expect.any(String))

    // Concurrent: both caches write before either flushes. Each payload names only
    // its own keys, and the last stored column keeps every key from both caches.
    marginNoteBackend.markSeen('desk-first-touch')
    backends.tourBackend.setTourState('doc-walkthrough', { abandoned: true })
    await Promise.all([marginNoteBackend.flush(), backends.flush()])
    const last2 = rpcCalls.slice(-2).map((c) => Object.keys(c.args.p_patch).sort())
    expect(last2).toEqual([['marginNotes'], ['featureAnnouncements', 'tours']])
    expect(lastWrite.current?.marginNotes).toEqual({
      'doc-first-touch': expect.any(String),
      'desk-first-touch': expect.any(String),
    })
    expect(lastWrite.current?.tours).toEqual({
      'desk-walkthrough': { completed: true },
      'doc-walkthrough': { abandoned: true },
    })
  })
})

describe('createSupabaseFirstAuthoredBackend', () => {
  it('hasAuthored is false before hydrate and before markAuthored', () => {
    const { client } = makeStubClient({})
    const backend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    expect(backend.hasAuthored()).toBe(false)
  })

  it('markAuthored then hasAuthored round-trips true and writes through', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    backend.markAuthored()
    expect(backend.hasAuthored()).toBe(true)
    await backend.flush()
    expect(lastWrite.current?.firstAuthoredAt).toEqual(expect.any(String))
  })

  it('markAuthored is idempotent — a second call does not overwrite the first instant', async () => {
    const { client, lastWrite } = makeStubClient({})
    const backend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    backend.markAuthored()
    await backend.flush()
    const first = lastWrite.current?.firstAuthoredAt
    backend.markAuthored()
    await backend.flush()
    expect(lastWrite.current?.firstAuthoredAt).toBe(first)
  })

  it('hydrate merges server state without clobbering an in-flight local write', async () => {
    const { client } = makeStubClient({
      firstAuthoredAt: '2026-01-01T00:00:00Z',
    })
    const backend = createSupabaseFirstAuthoredBackend(client, 'user-1')
    await backend.hydrate()
    expect(backend.hasAuthored()).toBe(true)
  })
})
