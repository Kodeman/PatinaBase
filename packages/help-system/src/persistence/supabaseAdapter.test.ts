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
  createSupabaseHelpStateBackends,
  loadHelpState,
  migrateLocalToSupabase,
  saveHelpState,
} from './supabaseAdapter'
import type { HelpStateSupabaseClient, HelpStateBlob } from './types'
import { TOUR_STATE_STORAGE_PREFIX } from '../proactive/TourController/tourState'

/**
 * Tiny in-memory Supabase stub. Captures last write so assertions can inspect
 * the JSONB payload sent across the wire.
 */
function makeStubClient(initial: HelpStateBlob | null = {}): {
  client: HelpStateSupabaseClient
  lastWrite: { current: HelpStateBlob | null }
  selectError: { current: { message: string } | null }
  updateError: { current: { message: string } | null }
} {
  const lastWrite: { current: HelpStateBlob | null } = { current: null }
  const selectError: { current: { message: string } | null } = { current: null }
  const updateError: { current: { message: string } | null } = { current: null }
  const client: HelpStateSupabaseClient = {
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => ({
          single: async () => ({
            data: selectError.current ? null : { help_state: initial },
            error: selectError.current,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, _value: string) => {
          if (!updateError.current) {
            lastWrite.current = (values.help_state as HelpStateBlob | null) ?? null
          }
          return { error: updateError.current }
        },
      }),
    }),
  }
  return { client, lastWrite, selectError, updateError }
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
  it('writes the blob through to the table', async () => {
    const { client, lastWrite } = makeStubClient({})
    await saveHelpState(client, 'user-1', {
      tours: { tour: { abandoned: true } },
    })
    expect(lastWrite.current).toEqual({
      tours: { tour: { abandoned: true } },
    })
  })

  it('does not throw when the Supabase update fails', async () => {
    const { client, updateError } = makeStubClient({})
    updateError.current = { message: 'permission denied' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(saveHelpState(client, 'user-1', { tours: {} })).resolves.toBeUndefined()
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
    const { client } = makeStubClient({
      tours: { x: { completed: true } },
    })
    const backends = createSupabaseHelpStateBackends(client, 'user-1')
    // Simulate a user action firing before the hydrate completes.
    backends.tourBackend.setTourState('y', { abandoned: true })
    await backends.hydrate()
    // Both keys survive.
    expect(backends.tourBackend.getTourState('x').completed).toBe(true)
    expect(backends.tourBackend.getTourState('y').abandoned).toBe(true)
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
    expect(result).toEqual({ toursMigrated: 0, featureAnnouncementsMigrated: 0 })
  })
})
