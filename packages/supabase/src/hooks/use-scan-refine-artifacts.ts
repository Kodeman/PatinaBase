/**
 * Refine artifact reader (Field Capture P2, Layer 3).
 *
 * The Refine stage publishes eleven immutable objects per run under
 * `room_file/{userId}/{scanId}/v{n}/refine/` in the private `room-scans`
 * bucket, and records where they landed in `room_files.present.refine_engine`
 * (Layer 2). This hook is the ONLY portal reader of that record: it resolves
 * the record, signs the handful of keys a consumer actually wants, and fetches
 * those documents.
 *
 * ─── FOUR PROPERTIES WORTH KNOWING BEFORE YOU CHANGE THIS ───────────────────
 *
 * 1. **It is gated at the QUERY level, not the render level.** Callers pass
 *    `enabled: false` when their feature flag is off, and the hook then costs
 *    exactly zero database calls and zero Storage calls. A component that
 *    renders nothing but still signed eleven URLs would be a flag that does
 *    not actually turn the feature off.
 *
 * 2. **`staleTime: Infinity`.** Refine's artifacts are create-only and
 *    checksummed, so for a given `(scanId, version)` they can never change.
 *    Re-fetching them would be pure cost. (The signed URLs themselves do
 *    expire, but they are consumed inside this query function — the cached
 *    value is parsed JSON, not a URL.)
 *
 * 3. **Bare object keys, not URLs.** R122 repaired columns carrying a
 *    non-resolving `/object/public/` form against a private bucket. Layer 2
 *    writes bare keys, and `publicUrlToPath` passes a scheme-less value
 *    through unchanged — so the same code path works either way and this hook
 *    does not need to know which form landed.
 *
 * 4. **A missing artifact is `null`, not an error.** Signing or fetching one
 *    document can fail (a key typo'd in a hand-run delivery, an object not yet
 *    replicated) without failing the query. The consumer's degradation ladder
 *    already treats every document as optional; making the query throw would
 *    convert a quiet "no readout" into a React Query error boundary.
 *
 * ⚠ Refine refines Field SfM KEYFRAMES. Nothing here relates to
 * `room_scan_images` (context photos) — the two lanes share no identifier and
 * must not be joined. See `refined-poses.ts` in the designer portal.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { publicUrlToPath } from '../lib/storage-url';

// Lazy client getter to avoid module-level initialization during SSR.
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — Layer 2's `present.refine_engine` record
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Layer-2 delivery record, as written into
 * `room_files.present.refine_engine`. Only the fields a reader needs are
 * modelled; the stored record carries more (per-artifact digests, sizes,
 * created/replayed key lists, the posture block).
 */
export interface ScanRefineArtifacts {
  scanId: string;
  roomFileId: string;
  roomFileVersion: number;
  /** Always `'room-scans'` today; read from the record rather than assumed. */
  bucket: string;
  /** Artifact name (e.g. `'pose-deltas-v1.json'`) → BARE object key. */
  keysByName: Record<string, string>;
  refinementEvidenced: boolean;
  /**
   * ⚠ ALWAYS `false`. `evaluate_refinement_evidence` never sets it true, so
   * `true` is unreachable — surfaces must render the not-certified treatment
   * regardless of what this says.
   */
  absoluteAccuracyCertified: boolean;
  verdictReason: string;
  /**
   * R123's advisory, verbatim. `refine_adapter.py:1116`: *"Nothing reads this
   * string; it exists to be read."* Render it as-is or not at all — a
   * paraphrase would launder a number nobody has authority to interpret.
   */
  loopConsistencyAdvisory: string;
}

/** What the hook resolves: the record plus the documents it was asked for. */
export interface ScanRefineArtifactSet {
  record: ScanRefineArtifacts;
  /** Artifact name → parsed JSON, or `null` when that slot did not resolve. */
  documents: Record<string, unknown | null>;
}

/** The artifacts Layer 3 reads. `pose-deltas-v1.json` carries BOTH the raw and
 *  the aligned pose per frame, so prefer-refined-with-fallback is a per-frame
 *  branch inside one document — no cross-artifact join. */
export const DEFAULT_REFINE_ARTIFACT_NAMES = [
  'pose-deltas-v1.json',
  'refinement-evidence-v1.json',
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// PURE HELPERS — exported for direct unit testing
// ═══════════════════════════════════════════════════════════════════════════

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * `room_files.present` (JSONB) → the delivery record, or `null` when no usable
 * record is present. Never throws.
 *
 * The bar for "usable" is deliberately: a bucket, at least one key, and both
 * verdict booleans. A record missing any of those cannot drive an honest
 * readout, and half-rendering one would be worse than rendering none.
 */
export function parseScanRefineRecord(
  present: unknown,
  context: { scanId: string; roomFileId: string; roomFileVersion: number },
): ScanRefineArtifacts | null {
  if (!isRecord(present)) return null;
  const raw = present.refine_engine;
  if (!isRecord(raw)) return null;

  const bucket = readString(raw.bucket);
  if (!bucket) return null;

  const keysByName: Record<string, string> = {};
  if (isRecord(raw.keysByName)) {
    for (const [name, key] of Object.entries(raw.keysByName)) {
      const value = readString(key);
      if (value) keysByName[name] = value;
    }
  } else if (Array.isArray(raw.artifacts)) {
    // Tolerated alternative shape: the record's per-artifact rows carry
    // `{ name, key }`. Layer 2 writes both; reading either costs one branch
    // and means a reshaped record degrades rather than dark-fails.
    for (const entry of raw.artifacts) {
      if (!isRecord(entry)) continue;
      const name = readString(entry.name);
      const key = readString(entry.key);
      if (name && key) keysByName[name] = key;
    }
  }
  if (Object.keys(keysByName).length === 0) return null;

  if (
    typeof raw.refinementEvidenced !== 'boolean' ||
    typeof raw.absoluteAccuracyCertified !== 'boolean'
  ) {
    return null;
  }

  return {
    scanId: readString(raw.scanId) ?? context.scanId,
    roomFileId: readString(raw.roomFileId) ?? context.roomFileId,
    roomFileVersion:
      typeof raw.roomFileVersion === 'number' && Number.isFinite(raw.roomFileVersion)
        ? raw.roomFileVersion
        : context.roomFileVersion,
    bucket,
    keysByName,
    refinementEvidenced: raw.refinementEvidenced,
    absoluteAccuracyCertified: raw.absoluteAccuracyCertified,
    verdictReason: readString(raw.verdictReason) ?? '',
    loopConsistencyAdvisory: readString(raw.loopConsistencyAdvisory) ?? '',
  };
}

export interface UseScanRefineArtifactsOptions {
  /** Gate here, NOT at render — `false` costs zero DB and zero Storage calls. */
  enabled?: boolean;
  /** Artifact names to resolve. Defaults to `DEFAULT_REFINE_ARTIFACT_NAMES`. */
  names?: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The newest Room File version for `scanId` that carries a Refine delivery
 * record, plus the requested artifacts' parsed JSON.
 *
 * Resolves to `null` — not an error — for every "nothing to show" case: no
 * `scanId`, no `room_files` row, no `present.refine_engine`, or a record none
 * of whose keys match the requested names. No refine artifact exists in
 * production today, so `null` is the expected answer everywhere until Refine
 * is enabled and Layer 2 has run.
 */
export function useScanRefineArtifacts(
  scanId: string | null | undefined,
  options: UseScanRefineArtifactsOptions = {},
) {
  const { enabled = true, names = DEFAULT_REFINE_ARTIFACT_NAMES } = options;
  const wanted = Array.from(new Set(names)).sort();

  return useQuery<ScanRefineArtifactSet | null>({
    queryKey: ['scan-refine-artifacts', scanId, wanted],
    enabled: Boolean(scanId) && enabled,
    // Create-only, checksummed artifacts for a fixed (scanId, version) — they
    // can never change, so there is nothing for a stale window to buy.
    staleTime: Infinity,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('room_files')
        .select('id, scan_id, version, present')
        .eq('scan_id', scanId as string)
        .order('version', { ascending: false });

      if (error) throw error;

      // Newest version first — the first row carrying a usable record wins.
      let record: ScanRefineArtifacts | null = null;
      for (const row of (data ?? []) as Array<{
        id: string;
        scan_id: string;
        version: number;
        present: unknown;
      }>) {
        record = parseScanRefineRecord(row.present, {
          scanId: row.scan_id,
          roomFileId: row.id,
          roomFileVersion: row.version,
        });
        if (record) break;
      }
      if (!record) return null;

      // Only the wanted names, and only ones the record actually carries.
      const requested = wanted
        .map((name) => ({ name, key: record!.keysByName[name] }))
        .filter((entry): entry is { name: string; key: string } => Boolean(entry.key));
      if (requested.length === 0) return null;

      // ONE createSignedUrls call for every wanted key. Bare keys pass through
      // publicUrlToPath unchanged; a legacy public-URL form is repaired.
      const paths = Array.from(
        new Set(
          requested
            .map((entry) => publicUrlToPath(entry.key))
            .filter((path): path is string => Boolean(path)),
        ),
      );

      const signedByPath = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signedData, error: signError } = await supabase.storage
          .from(record.bucket)
          .createSignedUrls(paths, 3600);
        // A signing failure is not fatal: every slot simply resolves to null
        // and the consumer's ladder degrades, exactly as it does for a 404.
        if (!signError) {
          for (const entry of (signedData ?? []) as Array<{
            path: string | null;
            signedUrl: string;
            error: string | null;
          }>) {
            if (entry.path && !entry.error) signedByPath.set(entry.path, entry.signedUrl);
          }
        }
      }

      const documents: Record<string, unknown | null> = {};
      const settled = await Promise.allSettled(
        requested.map(async (entry) => {
          const path = publicUrlToPath(entry.key);
          const url = path ? signedByPath.get(path) : undefined;
          if (!url) return { name: entry.name, document: null };
          const response = await fetch(url);
          // A 404 yields null for THAT slot rather than failing the query.
          if (!response.ok) return { name: entry.name, document: null };
          return { name: entry.name, document: (await response.json()) as unknown };
        }),
      );

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        documents[requested[i].name] =
          outcome.status === 'fulfilled' ? outcome.value.document : null;
      }

      return { record, documents };
    },
  });
}
