/**
 * Supabase backend for return-teaching state (`public.teaching_note_state`).
 *
 * Own-row table, read through RLS and written only through the SECURITY
 * DEFINER RPC `teaching_note_state_patch(p_path, p_value)`, which returns the
 * resulting state. The caller adopts that result; nothing is merged locally.
 * Unlike the `help_state` adapter this backend is async and keeps no cache:
 * React Query owns caching. Errors are thrown for the query layer to handle.
 * See return-teaching system-architecture §1.3.
 */

import type { HelpStateSupabaseClient } from './types'

const TEACHING_NOTE_STATE_TABLE = 'teaching_note_state'
const TEACHING_NOTE_STATE_COLUMN = 'state'
const TEACHING_NOTE_STATE_PATCH_RPC = 'teaching_note_state_patch'

export type TeachingNoteOutcome = 'acted' | 'dismissed' | 'retired_max' | 'superseded'

export interface TeachingNoteSeen {
  n?: number
  first?: string
  last?: string
  /** `null` (or absent) while the note is still live. */
  out?: TeachingNoteOutcome | null
}

export interface TeachingNoteState {
  v: 1
  cursor?: { lastSeenReleaseId?: string | null }
  visit?: {
    startedAt?: string
    prevStartedAt?: string
    lastActiveAt?: string
    unsolicitedShown?: string | null
  }
  /** At most two instants, rolling seven-day cap. */
  recentUnsolicited?: string[]
  ignoredStreak?: number
  quiet?: { off?: boolean; until?: string | null }
  seen?: Record<string, TeachingNoteSeen>
}

export const EMPTY_TEACHING_NOTE_STATE: TeachingNoteState = Object.freeze({ v: 1 })

/** Client mirror of the RPC's path whitelist, so a bad path never round-trips. */
const TOP_LEVEL_KEYS = new Set([
  'v',
  'cursor',
  'visit',
  'recentUnsolicited',
  'ignoredStreak',
  'quiet',
  'seen',
])
const SEEN_LEAF_KEYS = new Set(['n', 'first', 'last', 'out'])

function assertPatchPath(path: string[]): void {
  const ok =
    path.length >= 1 &&
    path.length <= 3 &&
    TOP_LEVEL_KEYS.has(path[0]) &&
    (path[0] !== 'seen' || (path.length === 3 && SEEN_LEAF_KEYS.has(path[2])))
  if (!ok) {
    throw new Error(`teaching_note_state_patch: path refused: ${JSON.stringify(path)}`)
  }
}

/** A fresh row holds `{}`; default the version so callers always see `v: 1`. */
function toState(raw: unknown): TeachingNoteState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_TEACHING_NOTE_STATE
  return { v: 1, ...(raw as Partial<TeachingNoteState>) } as TeachingNoteState
}

export interface TeachingNoteBackend {
  load(): Promise<TeachingNoteState>
  patch(path: string[], value: unknown): Promise<TeachingNoteState>
}

export function createSupabaseTeachingNoteBackend(
  client: HelpStateSupabaseClient,
): TeachingNoteBackend {
  return {
    async load(): Promise<TeachingNoteState> {
      const { data, error } = await client
        .from(TEACHING_NOTE_STATE_TABLE)
        .select(TEACHING_NOTE_STATE_COLUMN)
        .maybeSingle()
      if (error) {
        throw new Error(`teaching_note_state load failed: ${error.message}`)
      }
      if (!data) return EMPTY_TEACHING_NOTE_STATE
      return toState(data[TEACHING_NOTE_STATE_COLUMN])
    },
    async patch(path: string[], value: unknown): Promise<TeachingNoteState> {
      assertPatchPath(path)
      const { data, error } = await client.rpc(TEACHING_NOTE_STATE_PATCH_RPC, {
        p_path: path,
        p_value: value,
      })
      if (error) {
        throw new Error(`teaching_note_state_patch failed: ${error.message}`)
      }
      if (!data || typeof data !== 'object') {
        throw new Error('teaching_note_state_patch returned no state')
      }
      return toState(data)
    },
  }
}
