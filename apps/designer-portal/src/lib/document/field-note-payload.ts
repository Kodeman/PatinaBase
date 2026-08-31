/**
 * The one reader for the margin_items `note` branch's field lane (§9.4).
 *
 * Dependency-free on purpose, like margin-derivation.ts beside it: the margin
 * suites hit the @portabletext/react ESM trap the moment a module here pulls a
 * component graph in.
 *
 * `body` never comes back empty. A row written before the view replace — or
 * held in a stale React Query cache across a deploy — has no payload.body, and
 * the honest fallback is the eighty-character title it did carry, not a blank
 * note.
 */
import type { MarginItemRow } from './margin-derivation';

export interface FieldNotePayload {
  body: string;
  fieldCaptureId: string | null;
  captureVisible: boolean;
  hasAudio: boolean;
  audioPaths: string[];
  photoPaths: string[];
  durationSeconds: number | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function readFieldNotePayload(row: MarginItemRow): FieldNotePayload {
  const p = row.payload ?? {};
  const segments = strings(p.audio_segments);
  const single = str(p.audio_path);
  const duration = typeof p.voice_duration_seconds === 'number'
    && Number.isFinite(p.voice_duration_seconds)
    ? p.voice_duration_seconds
    : null;

  return {
    body: str(p.body) ?? row.title,
    fieldCaptureId: str(p.field_capture_id),
    captureVisible: p.capture_visible === true,
    hasAudio: p.has_audio === true,
    audioPaths: segments.length > 0 ? segments : single ? [single] : [],
    photoPaths: strings(p.photo_paths),
    durationSeconds: duration,
  };
}

/** 64.5 → "1:04". Null when there is no duration worth stating. */
export function formatNoteDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
