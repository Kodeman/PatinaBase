/**
 * Measured rooms, grouped by job (US-28 S10a; uplift.md (c) area 3).
 *
 * Pure: no React, no IO. The roster arrives newest scan first, so a job's
 * Section stands where its newest scan stands. Scans with no Document behind
 * them gather in one last group. Within a Section at most ROOM_CARD_CAP rooms
 * are Cards; the rest are ledger rows ("Forty scans: the cap and the grouping
 * bound it").
 */

import type { RoomRosterEntry } from '@/lib/room-view/geometry';
import { ftIn } from '@/lib/room-view/geometry';

/** At most three room Cards per Section; the fourth room on is a row. */
export const ROOM_CARD_CAP = 3;

/** The six stages that carry a stage edge (`.st-<stage>` in the S1 block). */
const STAGES = new Set(['brief', 'discovery', 'direction', 'proposal', 'project', 'install']);

export interface RoomJobGroup {
  /** The engagement id, or 'unfiled' for scans with no Document. */
  key: string;
  engagementId: string | null;
  clientName: string | null;
  /** The stage word as printed ("Project"), null for unfiled scans. */
  stageWord: string | null;
  /** `st-<stage>` for the job's tick, null when the stage carries no edge. */
  stageClass: string | null;
  cards: RoomRosterEntry[];
  rows: RoomRosterEntry[];
}

export function stageClassFor(stageWord: string | null): string | null {
  if (!stageWord) return null;
  const stage = stageWord.toLowerCase();
  return STAGES.has(stage) ? `st-${stage}` : null;
}

export function groupRoomsByJob(entries: RoomRosterEntry[]): RoomJobGroup[] {
  const jobs = new Map<string, RoomRosterEntry[]>();
  const unfiled: RoomRosterEntry[] = [];
  for (const entry of entries) {
    const id = entry.docRef?.engagementId;
    if (!id) {
      unfiled.push(entry);
      continue;
    }
    const list = jobs.get(id);
    if (list) list.push(entry);
    else jobs.set(id, [entry]);
  }

  const groups: RoomJobGroup[] = [];
  for (const [id, list] of jobs) {
    const first = list[0];
    const stageWord = first.docRef?.phaseLabel ?? null;
    groups.push({
      key: id,
      engagementId: id,
      clientName: first.clientName,
      stageWord,
      stageClass: stageClassFor(stageWord),
      cards: list.slice(0, ROOM_CARD_CAP),
      rows: list.slice(ROOM_CARD_CAP),
    });
  }
  if (unfiled.length > 0) {
    groups.push({
      key: 'unfiled',
      engagementId: null,
      clientName: null,
      stageWord: null,
      stageClass: null,
      cards: unfiled.slice(0, ROOM_CARD_CAP),
      rows: unfiled.slice(ROOM_CARD_CAP),
    });
  }
  return groups;
}

/** "dining_room" -> "Dining room". */
export function humanizeRoomType(roomType: string | null): string | null {
  if (!roomType) return null;
  const spaced = roomType.replace(/_/g, ' ').trim();
  if (!spaced) return null;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The room's own name on its Card or row. The client stands in the Section's
 *  eyebrow, so the unit names the room. */
export function roomName(entry: RoomRosterEntry): string {
  return humanizeRoomType(entry.roomType) ?? 'Unnamed room';
}

/** "Tuesday 29 September", or null when the date is missing or unreadable. */
export function scanDay(scanDate: string | null): string | null {
  if (!scanDate) return null;
  // Postgres may print a whole-hour offset as "+00", which Date cannot read.
  const d = new Date(scanDate.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "12′ 10″ × 15′ 1″", or null before the scan's geometry has parsed. */
export function roomSize(entry: RoomRosterEntry): string | null {
  if (!entry.dims) return null;
  return `${ftIn(entry.dims.w)} × ${ftIn(entry.dims.d)}`;
}

/** "Quality good": the grade is a word, never a graded dot (V20 U-Q13). */
export function qualityWord(grade: string | null): string | null {
  return grade ? `Quality ${grade}` : null;
}
