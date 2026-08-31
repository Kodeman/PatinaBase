/**
 * readFieldNotePayload — the one parser for the margin_items `note` branch's
 * field lane (the margin migration, §9.4). margin-derivation.ts is
 * dependency-free by design, so this suite needs no mocks at all.
 */
import type { MarginItemRow } from '../margin-derivation';
import { readFieldNotePayload, formatNoteDuration } from '../field-note-payload';

function noteRow(payload: Record<string, unknown>, title = 'A short lede'): MarginItemRow {
  return {
    kind: 'note',
    item_id: 'note-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title,
    detail: '',
    ts: '2026-08-25T15:00:00Z',
    payload,
  };
}

describe('readFieldNotePayload', () => {
  it('returns the full body, not the eighty-character title', () => {
    const body = 'The base cabinet scribe is short on the left return and the filler behind the range needs re-cutting.';
    const parsed = readFieldNotePayload(noteRow({ body }, body.slice(0, 80)));
    expect(parsed.body).toBe(body);
    expect(parsed.body.length).toBeGreaterThan(80);
  });

  it('falls back to the title when a row predates the view replace', () => {
    const parsed = readFieldNotePayload(noteRow({}, 'Ask about the runner.'));
    expect(parsed.body).toBe('Ask about the runner.');
  });

  it('reads a field note as visible with its segments and photos', () => {
    const parsed = readFieldNotePayload(
      noteRow({
        body: 'spoken',
        field_capture_id: 'capture-1',
        capture_visible: true,
        has_audio: true,
        audio_segments: ['a/voice-000.m4a', 'a/voice-001.m4a'],
        audio_path: 'a/voice-000.m4a',
        photo_paths: ['a/photo-0.heic'],
        voice_duration_seconds: 64.5,
      }),
    );
    expect(parsed.fieldCaptureId).toBe('capture-1');
    expect(parsed.captureVisible).toBe(true);
    expect(parsed.hasAudio).toBe(true);
    expect(parsed.audioPaths).toEqual(['a/voice-000.m4a', 'a/voice-001.m4a']);
    expect(parsed.photoPaths).toEqual(['a/photo-0.heic']);
    expect(parsed.durationSeconds).toBe(64.5);
  });

  it('falls back to the single audio path when no segments were written', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'x', has_audio: true, audio_segments: [], audio_path: 'a/only.m4a' }),
    );
    expect(parsed.audioPaths).toEqual(['a/only.m4a']);
  });

  it('reads a typed note as field-less — this is what "renders nothing" rests on', () => {
    const parsed = readFieldNotePayload(noteRow({ author_name: 'Leah' }));
    expect(parsed.fieldCaptureId).toBeNull();
    expect(parsed.captureVisible).toBe(false);
    expect(parsed.hasAudio).toBe(false);
    expect(parsed.audioPaths).toEqual([]);
    expect(parsed.photoPaths).toEqual([]);
    expect(parsed.durationSeconds).toBeNull();
  });

  it('reads a co-member row as referenced-but-not-visible, never as absent', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'spoken', field_capture_id: 'capture-1', capture_visible: false, has_audio: false }),
    );
    expect(parsed.fieldCaptureId).toBe('capture-1');
    expect(parsed.captureVisible).toBe(false);
  });

  it('drops non-string junk out of the path arrays', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'x', photo_paths: ['a.heic', null, 7, ''], audio_segments: [null] }),
    );
    expect(parsed.photoPaths).toEqual(['a.heic']);
    expect(parsed.audioPaths).toEqual([]);
  });
});

describe('formatNoteDuration', () => {
  it('renders minutes and seconds, zero-padded', () => {
    expect(formatNoteDuration(64.5)).toBe('1:04');
    expect(formatNoteDuration(9)).toBe('0:09');
    expect(formatNoteDuration(600)).toBe('10:00');
  });

  it('returns null when there is no duration to state', () => {
    expect(formatNoteDuration(null)).toBeNull();
    expect(formatNoteDuration(0)).toBeNull();
  });

  it('floors a sub-second note to a minimum of one second, never "0:00"', () => {
    expect(formatNoteDuration(0.4)).toBe('0:01');
  });

  it('floors down within a minute and across a minute boundary', () => {
    expect(formatNoteDuration(59.9)).toBe('0:59');
    expect(formatNoteDuration(119.6)).toBe('1:59');
  });

  it('returns null for a negative or non-finite duration', () => {
    expect(formatNoteDuration(-5)).toBeNull();
    expect(formatNoteDuration(Infinity)).toBeNull();
    expect(formatNoteDuration(NaN)).toBeNull();
  });
});
