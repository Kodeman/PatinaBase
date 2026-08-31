/**
 * groupCapturesIntoVisits — the whole Visits block reduces to this function,
 * so it is tested with no mocks at all (the hook around it is a two-line
 * useQuery). §11.3 fixes three rules and this suite is those three rules:
 *   · one row per visit_id, newest first
 *   · a mid-visit rename leaves TWO visit_label values for one visit_id —
 *     latest created_at wins
 *   · the span is min/max(created_at), NEVER visit_ended_at, because
 *     commit_field_capture's upsert skips a status='saved' row without
 *     touching it (00235:187-199), so a market-run capture is immutable the
 *     moment it commits and can never receive an end stamp.
 */
import { describe, expect, it } from 'vitest';

import {
  groupCapturesIntoVisits,
  VISIT_CAPTURE_SELECT,
  type ProjectVisitRow,
} from '../use-project-visits';

function row(over: Partial<ProjectVisitRow>): ProjectVisitRow {
  return {
    id: 'c1',
    visit_id: 'v1',
    visit_label: 'Maple St',
    visit_kind: 'site',
    capture_kind: 'specimen',
    created_at: '2026-08-25T15:00:00Z',
    project_room_id: null,
    room: null,
    voice_transcript: null,
    voice_duration_seconds: null,
    photos: [],
    captured_timezone: null,
    margin_notes: [],
    ...over,
  };
}

describe('groupCapturesIntoVisits', () => {
  it('returns nothing for a project with no field captures', () => {
    expect(groupCapturesIntoVisits([])).toEqual([]);
  });

  it('drops captures that belong to no visit rather than inventing one', () => {
    expect(groupCapturesIntoVisits([row({ visit_id: null })])).toEqual([]);
  });

  it('counts photos and notes off the schema, not off a heuristic', () => {
    // W4-C10: photoCount is a photograph TALLY — c2 alone holds two, so the
    // three files across two captures must read 3, never "2 photo-bearing
    // captures".
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', photos: [{ path: 'a.heic' }] }),
      row({ id: 'c2', photos: [{ path: 'b.heic' }, { path: 'c.heic' }] }),
      row({ id: 'c3', capture_kind: 'note', voice_transcript: 'the alcove reads forty-two' }),
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0].photoCount).toBe(3);
    expect(visits[0].noteCount).toBe(1);
  });

  it('lets the latest created_at win when she renamed mid-visit', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', visit_label: 'Maple St' }),
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z', visit_label: 'Maple St · punch walk' }),
    ]);
    expect(visits[0].label).toBe('Maple St · punch walk');
  });

  it('ignores a null label when resolving the name', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', visit_label: 'Maple St' }),
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z', visit_label: null }),
    ]);
    expect(visits[0].label).toBe('Maple St');
  });

  it('derives the span from min/max created_at', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z' }),
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z' }),
      row({ id: 'c3', created_at: '2026-08-25T16:10:00Z' }),
    ]);
    expect(visits[0].startedAt).toBe('2026-08-25T15:00:00Z');
    expect(visits[0].endedAt).toBe('2026-08-25T17:30:00Z');
  });

  it('lists the rooms it touched, once each, in the order it met them', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', room: { name: 'Living' } }),
      row({ id: 'c2', created_at: '2026-08-25T16:00:00Z', room: { name: 'Dining' } }),
      row({ id: 'c3', created_at: '2026-08-25T17:00:00Z', room: { name: 'Living' } }),
      row({ id: 'c4', created_at: '2026-08-25T18:00:00Z', room: null }),
    ]);
    expect(visits[0].rooms).toEqual(['Living', 'Dining']);
  });

  it('orders visits newest first and their captures newest first', () => {
    // F14: PostgREST's real shape is `+00:00`, not always `Z` — b2 uses it so
    // the ordering path (now plain `<`, not `localeCompare`) is exercised
    // against the actual wire format at least once.
    const visits = groupCapturesIntoVisits([
      row({ id: 'a1', visit_id: 'v1', created_at: '2026-08-15T09:00:00Z', visit_label: 'Whole house' }),
      row({ id: 'b1', visit_id: 'v2', created_at: '2026-08-25T15:00:00Z' }),
      row({ id: 'b2', visit_id: 'v2', created_at: '2026-08-25T17:00:00+00:00' }),
    ]);
    expect(visits.map((v) => v.visitId)).toEqual(['v2', 'v1']);
    expect(visits[0].captures.map((c) => c.id)).toEqual(['b2', 'b1']);
  });

  it('pulls photo storage keys out of the photos jsonb, skipping pathless entries', () => {
    const visits = groupCapturesIntoVisits([
      row({ photos: [{ path: 'a.heic' }, { isPrimary: true }, { path: '' }] }),
    ]);
    expect(visits[0].captures[0].photoPaths).toEqual(['a.heic']);
  });

  it('carries the margin note a capture filed itself as, so the row can link to it', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', margin_notes: [{ id: 'note-1' }] }),
    ]);
    expect(visits[0].captures[0].marginNoteId).toBe('note-1');
  });

  it('reads marginNoteId as null when nothing filed — every pre-wave-4 capture', () => {
    expect(groupCapturesIntoVisits([row({ margin_notes: [] })])[0].captures[0].marginNoteId)
      .toBeNull();
    expect(groupCapturesIntoVisits([row({ margin_notes: null })])[0].captures[0].marginNoteId)
      .toBeNull();
  });

  // W4-C11: the visit's day is read in the zone it happened in, not the
  // reader's. That zone travels on the ROW that ends the visit (endedAt) —
  // it is where fmtDay reads it from.
  it('carries the ending row’s captured_timezone onto the visit', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', captured_timezone: 'America/New_York' }),
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z', captured_timezone: 'America/Chicago' }),
    ]);
    expect(visits[0].timezone).toBe('America/Chicago');
  });

  it('is null when nothing on the visit recorded a timezone', () => {
    expect(groupCapturesIntoVisits([row({ captured_timezone: null })])[0].timezone).toBeNull();
  });
});

// FIX 3: a tripwire, not proof — it only catches an accidental future edit
// to the select string; it proves nothing about whether the string is
// actually valid against the live schema. The live check (against a real
// Postgres + PostgREST) is Task 18's.
describe('VISIT_CAPTURE_SELECT — the only thing at real risk in this hook', () => {
  it('disambiguates the room embed to the assignment FK, never the suggestion one', () => {
    expect(VISIT_CAPTURE_SELECT).toContain(
      'room:project_rooms!field_captures_project_room_id_fkey(name)',
    );
    expect(VISIT_CAPTURE_SELECT).not.toContain('suggested_project_room_id');
  });
});
