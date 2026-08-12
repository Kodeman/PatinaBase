// board-asset-cleanup · pure safety and reconciliation helpers.
//
// Storage deletion is intentionally absent from this module. The edge shell
// may act only on the explicit plan returned here, after service-role auth and
// after applying both the request dry-run and environment kill switch.

export const BOARD_ASSET_BUCKET = "proposal-mood-boards";
export const BOARD_ASSET_GRACE_DAYS = 14;
export const DESTRUCTIVE_ENV = "BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bearerRole(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const parts = header.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
    const value = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof value.role === "string" ? value.role : null;
  } catch {
    return null;
  }
}

/** Exact opt-in: absent, mixed-case, or truthy-looking values remain off. */
export function destructiveCleanupEnabled(value: string | undefined): boolean {
  return value === "true";
}

export interface CleanupMode {
  requested_dry_run: boolean;
  destructive_requested: boolean;
  destructive_enabled: boolean;
  dry_run: boolean;
  forced_dry_run: boolean;
}

/**
 * A caller can request deletion only with literal JSON `false`, and deletion
 * remains impossible unless the separate environment switch is exactly true.
 */
export function resolveCleanupMode(
  requested: unknown,
  destructiveEnabled: boolean,
): CleanupMode {
  const destructiveRequested = requested === false;
  const dryRun = !destructiveRequested || !destructiveEnabled;
  return {
    requested_dry_run: !destructiveRequested,
    destructive_requested: destructiveRequested,
    destructive_enabled: destructiveEnabled,
    dry_run: dryRun,
    forced_dry_run: destructiveRequested && !destructiveEnabled,
  };
}

function decodePathSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded || decoded === "." || decoded === ".." ||
      decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")
    ) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Convert only canonical Storage URLs (or raw keys) for this bucket into an
 * object key. Keys must remain inside `{uuid}/boards/{uuid}/...`; arbitrary
 * URLs containing a coincidental bucket substring are rejected.
 */
export function normalizeBoardObjectReference(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  let candidate: string | null = null;

  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const prefixes = [
      `/storage/v1/object/public/${BOARD_ASSET_BUCKET}/`,
      `/storage/v1/object/authenticated/${BOARD_ASSET_BUCKET}/`,
      `/storage/v1/object/sign/${BOARD_ASSET_BUCKET}/`,
      `/storage/v1/render/image/public/${BOARD_ASSET_BUCKET}/`,
      `/storage/v1/render/image/authenticated/${BOARD_ASSET_BUCKET}/`,
      `/storage/v1/render/image/sign/${BOARD_ASSET_BUCKET}/`,
    ];
    const prefix = prefixes.find((item) => url.pathname.startsWith(item));
    if (!prefix) return null;
    candidate = url.pathname.slice(prefix.length);
  } catch {
    candidate = input.split(/[?#]/, 1)[0].replace(/^\/+/, "");
    if (candidate.startsWith(`${BOARD_ASSET_BUCKET}/`)) {
      candidate = candidate.slice(BOARD_ASSET_BUCKET.length + 1);
    }
  }

  const parts = candidate.split("/").map(decodePathSegment);
  if (
    parts.length < 4 || parts.some((part) => part === null) ||
    parts[1] !== "boards" || !UUID_RE.test(parts[0]!) ||
    !UUID_RE.test(parts[2]!)
  ) return null;

  return (parts as string[]).join("/");
}

export type ReferenceCounts = Map<string, number>;

function addReference(counts: ReferenceCounts, value: unknown): void {
  const objectName = normalizeBoardObjectReference(value);
  if (!objectName) return;
  counts.set(objectName, (counts.get(objectName) ?? 0) + 1);
}

function canonicalKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function isImageReferenceKey(key: string): boolean {
  const normalized = canonicalKey(key);
  return normalized === "image" || normalized === "images" ||
    normalized === "image_url" || normalized === "image_urls" ||
    normalized === "original" || normalized === "originals" ||
    normalized === "original_url" || normalized === "original_urls" ||
    normalized === "original_image_url" ||
    normalized === "original_image_urls" ||
    normalized === "thumbnail" || normalized === "thumbnails" ||
    (normalized.startsWith("thumbnail_") &&
      (normalized.endsWith("_url") || normalized.endsWith("_urls")));
}

/** Recursively find image/original/thumbnail values, including nested shapes. */
export function addNestedImageReferences(
  counts: ReferenceCounts,
  value: unknown,
  referenceContext = false,
): void {
  if (typeof value === "string") {
    if (referenceContext) addReference(counts, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      addNestedImageReferences(counts, entry, referenceContext);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    addNestedImageReferences(
      counts,
      entry,
      referenceContext || isImageReferenceKey(key),
    );
  }
}

export interface LiveBoardItemReferenceRow {
  image_url: string | null;
  data: unknown;
}

export interface ProjectBoardReferenceRow {
  cover_image_url: string | null;
  items: unknown;
}

export interface BoardTemplateReferenceRow {
  cover_url: string | null;
  items: unknown;
  sections?: unknown;
}

export interface ProposalBoardReferenceRow {
  id: string;
  proposal_id: string | null;
  project_id: string | null;
  cover_image_url: string | null;
}

export interface BoardShareReferenceRow {
  board_payload: unknown;
}

export interface BoardReferenceDataset {
  liveItems: LiveBoardItemReferenceRow[];
  projectSnapshots: ProjectBoardReferenceRow[];
  templates: BoardTemplateReferenceRow[];
  boards: ProposalBoardReferenceRow[];
  shares: BoardShareReferenceRow[];
}

/** Build exact persisted-field counts; counts > 0 are live, regardless of board. */
export function buildBoardReferenceCounts(
  dataset: BoardReferenceDataset,
): ReferenceCounts {
  const counts: ReferenceCounts = new Map();

  for (const item of dataset.liveItems) {
    addReference(counts, item.image_url);
    addNestedImageReferences(counts, item.data);
  }
  for (const snapshot of dataset.projectSnapshots) {
    addReference(counts, snapshot.cover_image_url);
    addNestedImageReferences(counts, snapshot.items);
  }
  for (const template of dataset.templates) {
    addReference(counts, template.cover_url);
    addNestedImageReferences(counts, template.items);
    addNestedImageReferences(counts, template.sections);
  }
  for (const board of dataset.boards) {
    addReference(counts, board.cover_image_url);
    const ownerId = board.proposal_id ?? board.project_id;
    if (ownerId) {
      addReference(counts, `${ownerId}/boards/${board.id}/cover.png`);
    }
  }
  for (const share of dataset.shares) {
    addNestedImageReferences(counts, share.board_payload);
  }

  return counts;
}

export interface CandidateRow {
  bucket_id: string;
  object_name: string;
  first_unreferenced_at: string;
  last_scanned_at: string;
  eligible_after: string;
  last_reference_count: number;
  deleted_at: string | null;
  last_job_run_id: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface CleanupPlan {
  resetCandidateNames: string[];
  newCandidateNames: string[];
  observedCandidates: CandidateRow[];
  eligibleObjectNames: string[];
  deleteObjectNames: string[];
}

/**
 * Reconcile the current storage/reference snapshot against the durable ledger.
 * New sightings are never eligible in the same run. A reference (or a missing
 * object) removes prior history so a future reference loss receives a fresh,
 * continuous 14-day grace window.
 */
export function planCleanup(input: {
  objectNames: Iterable<string>;
  referenceCounts: ReferenceCounts;
  candidates: CandidateRow[];
  now: Date;
  dryRun: boolean;
  destructiveEnabled: boolean;
}): CleanupPlan {
  const objectNames = new Set(input.objectNames);
  const byName = new Map(input.candidates.map((row) => [row.object_name, row]));
  const reset = new Set<string>();
  const newCandidates: string[] = [];
  const observed: CandidateRow[] = [];
  const eligible: string[] = [];
  const deletions: string[] = [];
  const nowMs = input.now.getTime();

  for (const candidate of input.candidates) {
    const referenced =
      (input.referenceCounts.get(candidate.object_name) ?? 0) > 0;
    // A restored reference always resets eligibility. An active candidate for
    // an object removed outside this worker also resets, so a later re-upload
    // receives a fresh grace window. Completed deletion receipts remain durable
    // until that same key is referenced or reappears.
    if (
      referenced ||
      (!objectNames.has(candidate.object_name) && candidate.deleted_at === null)
    ) reset.add(candidate.object_name);
  }

  for (const objectName of [...objectNames].sort()) {
    if ((input.referenceCounts.get(objectName) ?? 0) > 0) continue;
    const candidate = byName.get(objectName);
    if (
      !candidate || candidate.deleted_at !== null ||
      candidate.last_reference_count > 0
    ) {
      if (candidate) reset.add(objectName);
      newCandidates.push(objectName);
      continue;
    }

    observed.push(candidate);
    const eligibleAt = Date.parse(candidate.eligible_after);
    if (!Number.isFinite(eligibleAt) || eligibleAt > nowMs) continue;
    eligible.push(objectName);
    if (!input.dryRun && input.destructiveEnabled) deletions.push(objectName);
  }

  return {
    resetCandidateNames: [...reset].sort(),
    newCandidateNames: newCandidates,
    observedCandidates: observed,
    eligibleObjectNames: eligible,
    deleteObjectNames: deletions,
  };
}
