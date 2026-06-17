'use client';

/**
 * Threads ops — shared helpers (Track C). A thread is ONE shared conversation
 * (`use-comms`), the same row that renders on a document's margin — never a
 * copy. These helpers read a thread's counterpart (the participant who isn't
 * me), its scope label, and map the comms participant role onto a People-Room
 * PartyRole so the shared person-bits avatar/badge read identically here and
 * in the directory.
 */

import type { PartyRole } from '@patina/supabase';
import type { ThreadSummary, CommsThread, ParticipantRole } from '@patina/supabase';

/** The prototype's scope chips (all/direct/project/vendor). */
export type ThreadScope = 'all' | 'direct' | 'project' | 'vendor';

export const THREAD_SCOPES: Array<[ThreadScope, string]> = [
  ['all', 'All'],
  ['direct', 'Direct'],
  ['project', 'Project'],
  ['vendor', 'Vendor'],
];

/**
 * Map the prototype's scope chip onto the `useThreads({ scope })` parameter.
 * `all` → the full inbox; `vendor` → the comms `vendor_brief` kind.
 */
export function toCommsScope(
  scope: ThreadScope,
): 'inbox' | 'direct' | 'project' | 'vendor_brief' {
  switch (scope) {
    case 'direct':
      return 'direct';
    case 'project':
      return 'project';
    case 'vendor':
      return 'vendor_brief';
    case 'all':
    default:
      return 'inbox';
  }
}

/** A thread's kind → the short mono scope tag shown on its row. */
export function scopeLabel(kind: CommsThread['kind']): string {
  switch (kind) {
    case 'direct':
      return 'direct';
    case 'project':
      return 'project';
    case 'vendor_brief':
      return 'vendor';
    case 'support':
      return 'support';
    default:
      return kind;
  }
}

/** A comms participant role → the People-Room PartyRole the avatar reads off. */
export function participantPartyRole(role: ParticipantRole | undefined): PartyRole {
  switch (role) {
    case 'client':
      return 'client';
    case 'vendor':
      return 'maker';
    case 'designer':
    case 'admin':
    default:
      return 'team';
  }
}

export interface ThreadCounterpart {
  name: string;
  role: PartyRole;
}

/**
 * Who the thread is *with*, from my point of view — the first participant who
 * isn't me (and isn't a designer/admin, when one exists). Falls back to the
 * thread title, then a role-generic label. Drives the row avatar + "who" line.
 */
export function threadCounterpart(
  thread: ThreadSummary,
  myId: string | undefined,
): ThreadCounterpart {
  const others = thread.participants.filter(
    (p) => p.profile_id !== myId && !p.left_at,
  );
  // Prefer a non-designer counterpart (the client / vendor / GC the thread is
  // really with) over a co-designer on the same thread.
  const primary =
    others.find((p) => p.role === 'client' || p.role === 'vendor') ?? others[0];

  if (primary?.profile?.full_name) {
    return {
      name: primary.profile.full_name,
      role: participantPartyRole(primary.role),
    };
  }
  if (thread.title?.trim()) {
    return {
      name: thread.title.trim(),
      role: participantPartyRole(primary?.role),
    };
  }
  // Last resort — a role-shaped placeholder so the row never reads blank.
  return {
    name:
      thread.kind === 'vendor_brief'
        ? 'Vendor brief'
        : thread.kind === 'project'
          ? 'Project thread'
          : 'Conversation',
    role: participantPartyRole(primary?.role),
  };
}

/** A quiet, terse "how long ago" for a thread's last-message stamp. */
export function relativeStamp(iso: string | null | undefined, now: Date): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((now.getTime() - t) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
