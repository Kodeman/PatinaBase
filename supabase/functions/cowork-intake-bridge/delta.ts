// cowork-intake-bridge/delta.ts — PURE driveItem classifier.
//
// Given one Microsoft Graph delta driveItem, decide whether the bridge should
// ingest it, skip it, or flag it as unsupported. No I/O — this is the whole
// gate the bridge uses to decide what enters the queue, and it unit-tests
// exhaustively offline.
//
// Rules (WP-1.5):
//   • folders and deleted items      → skip
//   • parentReference.path must end   /Ops Inbox/{scout|vendor|event|content}
//     (tolerating URL-encoding + case); anything else → skip
//   • extension gate: only .md / .txt ingest; any other extension inside a
//     watched lane → unsupported (so it surfaces as a reviewable intake_error,
//     never silently vanishes)

export type DeltaAction = 'ingest' | 'skip' | 'unsupported';
export type Lane = 'scout' | 'vendor' | 'event' | 'content';

export const LANES: readonly Lane[] = ['scout', 'vendor', 'event', 'content'] as const;
const INGEST_EXTENSIONS: readonly string[] = ['.md', '.txt'] as const;

/** The subset of a Graph driveItem the classifier reads. */
export interface DriveItemLike {
  id?: string;
  name?: string;
  file?: { mimeType?: string } | null;
  folder?: Record<string, unknown> | null;
  deleted?: Record<string, unknown> | null;
  parentReference?: { path?: string | null; id?: string | null } | null;
  [key: string]: unknown;
}

export interface Classification {
  action: DeltaAction;
  lane: Lane | null;
  reason?: string;
}

/**
 * The watched lane a driveItem's parent path resolves to, or null. Matches a
 * path whose last two segments are `Ops Inbox` / `<lane>`, case-insensitively,
 * after URL-decoding. Deeper nesting (…/Ops Inbox/scout/sub) does NOT match —
 * only files directly in a lane folder are ingested.
 */
export function laneFromPath(rawPath: string | null | undefined): Lane | null {
  if (!rawPath) return null;
  let p = rawPath;
  try {
    p = decodeURIComponent(rawPath);
  } catch {
    // leave raw on malformed encoding
  }
  const normalized = p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  const match = normalized.match(/ops inbox\/([^/]+)$/);
  if (!match) return null;
  const seg = match[1];
  return (LANES as readonly string[]).includes(seg) ? (seg as Lane) : null;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function classifyDriveItem(item: DriveItemLike): Classification {
  if (item.deleted) return { action: 'skip', lane: null, reason: 'deleted' };
  if (item.folder) return { action: 'skip', lane: null, reason: 'folder' };

  const lane = laneFromPath(item.parentReference?.path ?? null);
  if (!lane) return { action: 'skip', lane: null, reason: 'outside_watched_lanes' };

  const ext = extensionOf(item.name ?? '');
  if (INGEST_EXTENSIONS.includes(ext)) return { action: 'ingest', lane };

  return { action: 'unsupported', lane, reason: `unsupported_extension:${ext || 'none'}` };
}
