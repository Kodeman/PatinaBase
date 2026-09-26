/**
 * Tests for the return-teaching state backend (`teaching_note_state`).
 *
 * Covers:
 *  • load returns the own row's state; no row ⇒ EMPTY_TEACHING_NOTE_STATE
 *  • patch forwards the exact rpc args and adopts the returned state
 *  • patch refuses a bad path client-side without calling the rpc
 */

import { describe, expect, it } from 'vitest'

import {
  EMPTY_TEACHING_NOTE_STATE,
  createSupabaseTeachingNoteBackend,
  type TeachingNoteState,
} from './teachingNoteBackend'
import type { HelpStateSupabaseClient } from './types'

/** Tiny Supabase stub: one own-row select and one rpc, both captured. */
function makeStubClient(options: {
  row?: { state: unknown } | null
  rpcResult?: unknown
}): {
  client: HelpStateSupabaseClient
  fromCalls: string[]
  selectCalls: string[]
  rpcCalls: Array<{ fn: string; args: unknown }>
} {
  const fromCalls: string[] = []
  const selectCalls: string[] = []
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const client: HelpStateSupabaseClient = {
    from: (table: string) => {
      fromCalls.push(table)
      return {
        select: (columns: string) => {
          selectCalls.push(columns)
          return {
            maybeSingle: async () => ({ data: options.row ?? null, error: null }),
          }
        },
      }
    },
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return { data: options.rpcResult ?? null, error: null }
    },
  }
  return { client, fromCalls, selectCalls, rpcCalls }
}

describe('createSupabaseTeachingNoteBackend.load', () => {
  it('returns the state of the own row', async () => {
    const state: TeachingNoteState = {
      v: 1,
      cursor: { lastSeenReleaseId: '2026-09-25-galley-po' },
      seen: { 'galley-po@1': { n: 1, out: 'dismissed' } },
    }
    const { client, fromCalls, selectCalls } = makeStubClient({ row: { state } })
    const loaded = await createSupabaseTeachingNoteBackend(client).load()
    expect(loaded).toEqual(state)
    expect(fromCalls).toEqual(['teaching_note_state'])
    expect(selectCalls).toEqual(['state'])
  })

  it('returns EMPTY_TEACHING_NOTE_STATE when there is no row', async () => {
    const { client } = makeStubClient({ row: null })
    const loaded = await createSupabaseTeachingNoteBackend(client).load()
    expect(loaded).toEqual(EMPTY_TEACHING_NOTE_STATE)
    expect(loaded).toEqual({ v: 1 })
  })
})

describe('createSupabaseTeachingNoteBackend.patch', () => {
  it('forwards the exact rpc args and adopts the returned state', async () => {
    const returned: TeachingNoteState = {
      v: 1,
      ignoredStreak: 2,
      seen: { 'galley-po@1': { n: 3, out: 'retired_max' } },
    }
    const { client, rpcCalls } = makeStubClient({ rpcResult: returned })
    const next = await createSupabaseTeachingNoteBackend(client).patch(
      ['seen', 'galley-po@1', 'out'],
      'retired_max',
    )
    expect(rpcCalls).toEqual([
      {
        fn: 'teaching_note_state_patch',
        args: { p_path: ['seen', 'galley-po@1', 'out'], p_value: 'retired_max' },
      },
    ])
    expect(next).toEqual(returned)
  })

  it('rejects a path longer than 3 segments without calling the rpc', async () => {
    const { client, rpcCalls } = makeStubClient({ rpcResult: { v: 1 } })
    await expect(
      createSupabaseTeachingNoteBackend(client).patch(['seen', 'galley-po@1', 'out', 'x'], 'acted'),
    ).rejects.toThrow(Error)
    expect(rpcCalls).toEqual([])
  })
})
