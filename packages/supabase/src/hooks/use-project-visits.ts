import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/**
 * The Visits block's only read (§11.3). One line per field_captures.visit_id
 * on a project, grouped here rather than in the component so the three rules
 * below are testable without a DOM.
 *
 * ⚠ The span is min/max(created_at), NEVER visit_ended_at. A capture routed to
 * the Library commits at status='saved', and commit_field_capture's upsert
 * ends `WHERE field_captures.status NOT IN ('saved','dismissed')` and returns
 * without touching the row (00235:187-199) — so a market-run capture is
 * immutable the moment it commits and closing its visit can never stamp it.
 * visit_ended_at is a device-side nicety, correct only while status='inbox'.
 *
 * ⚠ There is no scan count. room_scans carries no visit key, and attributing a
 * scan to a visit by timestamp overlap would render a guess as a fact
 * (Principle 4). Scans stay in the Room files block; a room_scans.visit_id
 * column is owed.
 */

export interface ProjectVisitRow {
  id: string;
  visit_id: string | null;
  visit_label: string | null;
  visit_kind: string | null;
  capture_kind: string | null;
  created_at: string;
  project_room_id: string | null;
  room: { name: string | null } | null;
  voice_transcript: string | null;
  voice_duration_seconds: number | null;
  photos: unknown;
  /** The zone the device was in when it captured this row — carried onto
   *  the visit (from the row that ends it) so a day can be read honestly
   *  (FC-R11 / W4-C11). */
  captured_timezone: string | null;
  /** Embedded through margin_notes.field_capture_id (the margin migration). */
  margin_notes: { id: string }[] | null;
}

export interface ProjectVisitCapture {
  id: string;
  captureKind: string | null;
  createdAt: string;
  roomName: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  photoPaths: string[];
  marginNoteId: string | null;
}

export interface ProjectVisit {
  visitId: string;
  label: string | null;
  kind: string | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  noteCount: number;
  rooms: string[];
  captures: ProjectVisitCapture[];
  /** captured_timezone off the row that ends the visit (endedAt), or null
   *  when no capture in it recorded one — the reader's own zone is the
   *  caller's fallback (FC-R11 / W4-C11). */
  timezone: string | null;
}

function photoPathsOf(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p) =>
      p && typeof p === 'object' && typeof (p as { path?: unknown }).path === 'string'
        ? ((p as { path: string }).path)
        : '',
    )
    .filter((p) => p.length > 0);
}

// ISO-8601 timestamps compare correctly under plain `<`/`>` (same-length
// fields, most-significant first) without collation, and PostgREST's own
// output isn't always `Z` (`2026-01-15T12:00:00+00:00` is the real shape) —
// `localeCompare` is both slower and the wrong tool for it (F14).
function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function groupCapturesIntoVisits(
  rows: readonly ProjectVisitRow[],
): ProjectVisit[] {
  const byVisit = new Map<string, ProjectVisitRow[]>();
  for (const r of rows) {
    if (!r.visit_id) continue;
    const bucket = byVisit.get(r.visit_id);
    if (bucket) bucket.push(r);
    else byVisit.set(r.visit_id, [r]);
  }

  const visits: ProjectVisit[] = [];
  for (const [visitId, bucket] of byVisit) {
    const ascending = [...bucket].sort((a, b) => compareIso(a.created_at, b.created_at));
    const descending = [...ascending].reverse();

    // A mid-visit rename leaves two labels for one visit_id. Latest wins.
    const label = descending.find((r) => r.visit_label)?.visit_label ?? null;

    const rooms: string[] = [];
    for (const r of ascending) {
      const name = r.room?.name ?? null;
      if (name && !rooms.includes(name)) rooms.push(name);
    }

    const captures: ProjectVisitCapture[] = descending.map((r) => ({
      id: r.id,
      captureKind: r.capture_kind,
      createdAt: r.created_at,
      roomName: r.room?.name ?? null,
      transcript: r.voice_transcript,
      durationSeconds: r.voice_duration_seconds,
      photoPaths: photoPathsOf(r.photos),
      // A capture files at most one margin note (one client-minted id per
      // lane), but the embed is a to-many relationship, so take the first.
      marginNoteId: r.margin_notes?.[0]?.id ?? null,
    }));

    visits.push({
      visitId,
      label,
      kind: descending.find((r) => r.visit_kind)?.visit_kind ?? null,
      startedAt: ascending[0].created_at,
      endedAt: ascending[ascending.length - 1].created_at,
      // F: photoCount is a photo TALLY, not a count of photo-bearing
      // captures — a capture holding three photographs reports as three
      // (W4-C10), never one.
      photoCount: captures.reduce((sum, c) => sum + c.photoPaths.length, 0),
      noteCount: captures.filter((c) => c.captureKind === 'note').length,
      rooms,
      captures,
      // descending[0] is the same row as ascending[last] — the row that
      // ends the visit and therefore owns the day endedAt prints.
      timezone: descending[0].captured_timezone ?? null,
    });
  }

  return visits.sort((a, b) => compareIso(b.endedAt, a.endedAt));
}

/**
 * The read's `select` string, exported so a test can assert it exactly
 * (FIX 3). That assertion is a TRIPWIRE, not proof the query works — it only
 * catches an accidental future edit to the string; it says nothing about
 * whether the string is actually valid against the live schema (PostgREST
 * embeds are resolved server-side, not by anything client-side type-checking
 * can see). The live check is Task 18's.
 *
 * `field_captures` carries two FKs to `project_rooms` — `project_room_id`
 * (the assignment) and `suggested_project_room_id` (Wave 3's routing
 * suggestion, 00532) — so `project_rooms(name)` alone is an ambiguous embed
 * and PostgREST refuses it (PGRST201) on every call. FC-R5: the suggestion
 * lane must never be cross-assigned, so the disambiguation hint always
 * resolves to `field_captures_project_room_id_fkey`.
 */
export const VISIT_CAPTURE_SELECT =
  'id, visit_id, visit_label, visit_kind, capture_kind, created_at, ' +
  'project_room_id, captured_timezone, voice_transcript, voice_duration_seconds, ' +
  'photos, room:project_rooms!field_captures_project_room_id_fkey(name), ' +
  // The margin note this capture filed itself as (ruling 1). The
  // relationship is margin_notes.field_capture_id → field_captures.id,
  // created by the margin migration; margin_items is a view and cannot
  // be embedded, so the base table is read directly. RLS applies:
  // margin_notes_designer_all is the author's own, so a studio
  // co-member reads no id and the row simply does not link.
  'margin_notes(id)';

export function useProjectVisits(
  projectId: string | null,
): UseQueryResult<ProjectVisit[]> {
  return useQuery({
    queryKey: ['project-visits', projectId],
    enabled: Boolean(projectId),
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectVisit[]> => {
      if (!projectId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_captures')
        .select(VISIT_CAPTURE_SELECT)
        .eq('project_id', projectId)
        .not('visit_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) {
        // FIX 2: FC-R10 renders nothing for an empty project, which makes a
        // thrown query indistinguishable from an empty one unless the throw
        // is logged somewhere a QA pass can see it — this is that somewhere.
        console.error('[useProjectVisits] field_captures read failed', error);
        throw error;
      }
      return groupCapturesIntoVisits((data ?? []) as ProjectVisitRow[]);
    },
  });
}
