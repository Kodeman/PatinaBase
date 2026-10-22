"use client";

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT EDITIONS (US-49 Phase 2) — the studio's side of The House Issue.
//
// An edition is one composed issue of the homeowner's page (00844). The studio
// reads every edition of a job, approves or holds the one awaiting review,
// takes an approved one back (Undo), sets a photograph's focal point, and says
// whether makers are named (00842). All writes are RPCs; nothing here writes a
// table.
//
// The 00845 RPCs may not be in the generated `database.types.ts` yet (they are
// built in parallel), so the client is typed through `EditionDatabase` below:
// the generated Database with these functions laid over its own.
// ═══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "../client";
import type { Database, Json } from "../database.types";

type EditionFunctions = {
  list_client_editions: { Args: { p_project_id: string }; Returns: Json };
  approve_client_edition: {
    Args: { p_edition_id: string; p_overrides?: Json };
    Returns: undefined;
  };
  hold_client_edition: { Args: { p_edition_id: string }; Returns: undefined };
  undo_client_edition: { Args: { p_edition_id: string }; Returns: undefined };
  set_plate_focal: {
    // A photograph with no subject box keeps it null: the worker reads a box
    // as hard containment, so a manufactured whole-frame box drops crops.
    Args: { p_asset_id: string; p_subject_box: number[] | null; p_focal: number[] };
    Returns: undefined;
  };
  set_project_show_makers: {
    Args: { p_project_id: string; p_show: boolean };
    Returns: undefined;
  };
};

type PublicSchema = Database["public"];
type EditionDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: Omit<PublicSchema["Functions"], keyof EditionFunctions> & EditionFunctions;
  };
};

const getSupabase = () =>
  createBrowserClient() as unknown as SupabaseClient<EditionDatabase>;

// ── The list_client_editions envelope (00845, camelCase) ─────────────────────

export type ClientEditionStatus =
  | "drafting"
  | "awaiting_review"
  | "approved"
  | "superseded"
  | "failed";

export type PlateSourceKind =
  | "upload"
  | "installed"
  | "scan"
  | "board"
  | "sheet"
  | "maker"
  | "concept";

export interface ClientEditionImage {
  assetId: string;
  plateRole: string;
  cropKey: string;
  rank: number;
  chapterKey: string | null;
  alt: string | null;
  captionWhat: string | null;
  captionWhose: string | null;
  captionWhen: string | null;
  /** The kind of the request row the picture was fetched from (its address's provenance). */
  sourceKind: PlateSourceKind | null;
  /** A storage object path (upload, concept, scan, board) or a hotlink. */
  sourceUrl: string | null;
  /** That same request row's `source_ref->>'table'`: which bucket a bare path lives in. */
  sourceTable: string | null;
  /** The homeowner reader's frozen attribution kind; may differ from sourceKind. */
  attributionKind: PlateSourceKind | null;
  /** The worker's ground, as planCrops reads it ('white' | 'scene' | 'drawing'). */
  ground: string | null;
  width: number | null;
  height: number | null;
  /** [x, y], each 0–1 of the source. */
  focal: number[] | null;
  /** [x, y, w, h], each 0–1 of the source. */
  subjectBox: number[] | null;
  focalOrigin: "model" | "designer" | null;
}

export interface ClientEditionChapter {
  key: string;
  headline?: string | null;
  standing?: string | null;
}

export interface ClientEditionComposition {
  hero?: { assetId?: string | null } | null;
  chapters?: ClientEditionChapter[] | null;
  doorstep?: { standing?: string | null } | null;
  notice?: string | null;
}

/** What Approve may lay over an edition (approve_client_edition p_overrides). */
export interface ClientEditionOverrides {
  heroAssetId?: string;
  chapters?: Record<string, { headline?: string; standing?: string }>;
  captions?: Record<string, { whose?: string; when?: string }>;
}

export interface ClientEdition {
  id: string;
  seq: number;
  status: ClientEditionStatus;
  kind: "full" | "plates_only" | null;
  autoPublished: boolean;
  /** The one studio-reviewed final issue captured when the job closed. */
  closing?: boolean;
  held: boolean;
  approvedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  createdAt: string | null;
  supersededAt: string | null;
  /** The edition that replaced this one (00845); Undo restores the approved
   *  edition whose supersededBy is the edition taken back. */
  supersededBy: string | null;
  frozenAt: string | null;
  composition: ClientEditionComposition | null;
  overrides: ClientEditionOverrides | null;
  images: ClientEditionImage[];
}

export interface ClientEditions {
  showMakers: boolean;
  /** The job is completed or archived (00848): no edition of it changes. */
  projectClosed: boolean;
  /** Newest first (seq descending). */
  editions: ClientEdition[];
}

const EMPTY_EDITIONS: ClientEditions = { showMakers: false, projectClosed: false, editions: [] };

export function normalizeClientEditions(data: Json | null): ClientEditions {
  if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY_EDITIONS;
  const raw = data as unknown as Partial<ClientEditions>;
  const editions = Array.isArray(raw.editions) ? raw.editions : [];
  return {
    showMakers: raw.showMakers === true,
    projectClosed: raw.projectClosed === true,
    editions: editions
      .map((edition) => ({
        ...edition,
        autoPublished: edition.autoPublished === true,
        closing: edition.closing === true,
        held: edition.held === true,
        supersededBy: edition.supersededBy ?? null,
        // An older list (before 00845 carried them) has no sourceTable,
        // attributionKind or ground: each reads as null.
        images: (Array.isArray(edition.images) ? edition.images : []).map((image) => ({
          ...image,
          sourceTable: image.sourceTable ?? null,
          attributionKind: image.attributionKind ?? null,
          ground: image.ground ?? null,
        })),
      }))
      .sort((a, b) => b.seq - a.seq),
  };
}

// ── Keys and invalidation ────────────────────────────────────────────────────

export const clientEditionsKey = (projectId: string) =>
  ["client-editions", projectId] as const;

/**
 * Every read an edition write can change: the edition list itself; the
 * designer's client mirror (`['client-mirror', id]`,
 * designer-portal client-mirror.tsx:28, stated literally because that key
 * lives in the portal); and the project row (`['project-v2', id]`,
 * use-project-v2.ts), which carries `show_makers`.
 */
export function invalidateClientEditions(queryClient: QueryClient, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: clientEditionsKey(projectId) });
  void queryClient.invalidateQueries({ queryKey: ["client-mirror", projectId] });
  void queryClient.invalidateQueries({ queryKey: ["project-v2", projectId] });
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** How often the open job's band re-reads its editions: the compose lane
 *  publishes plates-only editions with no studio act (C3). */
export const CLIENT_EDITIONS_LIVE_MS = 60_000;

/**
 * The editions read. `live` is for the open job (the Press band): it re-reads
 * every minute while mounted and whenever the window regains focus, so an
 * edition the lane publishes shows up with its Undo. The Desk line reads the
 * same key without polling. A refusal (not a studio member of the project, or
 * not a project) is final, so it is not retried.
 */
export function clientEditionsQueryOptions(
  projectId: string | null | undefined,
  { live = false }: { live?: boolean } = {},
) {
  return {
    queryKey: clientEditionsKey(projectId ?? ""),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("list_client_editions", {
        p_project_id: projectId!,
      });
      if (error) throw error;
      return normalizeClientEditions(data);
    },
    enabled: !!projectId,
    retry: false,
    ...(live
      ? { refetchInterval: CLIENT_EDITIONS_LIVE_MS, refetchOnWindowFocus: "always" as const }
      : {}),
  };
}

/** Every edition of a job, newest first. No project → no read. */
export function useClientEditions(
  projectId: string | null | undefined,
  options?: { live?: boolean },
) {
  return useQuery(clientEditionsQueryOptions(projectId, options));
}

/** The editorial envelope's assets as the cover choice reads them (00842). */
export interface ClientEditorialAsset {
  id: string;
  sourceKind: PlateSourceKind | null;
  ground: "white" | "scene" | "drawing" | null;
  width: number;
  height: number;
  subjectBox: number[] | null;
}

/**
 * The Phase 1 editorial read (get_client_project_editorial, 00842; its guard
 * admits the studio) for what the client page opens on before any edition is
 * approved. Only its assets are kept.
 */
export function useClientEditorialAssets(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["client-editorial-assets", projectId ?? ""],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("get_client_project_editorial", {
        p_project_id: projectId!,
      });
      if (error) throw error;
      const assets = (data as { assets?: unknown } | null)?.assets;
      return (Array.isArray(assets) ? assets : []) as ClientEditorialAsset[];
    },
    enabled: !!projectId && enabled,
    retry: false,
  });
}

/** The bucket each source table's object path lives in: client-plate-copy
 *  lib.ts PRIVATE_BUCKET_BY_TABLE / PUBLIC_BUCKET_BY_TABLE (00843 queues a
 *  path, not a URL, for these). */
const PRIVATE_BUCKET_BY_TABLE: Record<string, string> = {
  project_rooms: "room-renders",
  room_scan_images: "room-scans",
  project_boards: "proposal-mood-boards",
  field_captures: "capture-media",
};
const PUBLIC_BUCKET_BY_TABLE: Record<string, string> = {
  project_ffe_item_images: "project-item-images",
};
/** A list without sourceTable: the bucket by the request's kind instead. */
const PRIVATE_BUCKET_BY_KIND: Partial<Record<PlateSourceKind, string>> = {
  concept: "room-renders",
  scan: "room-scans",
  board: "proposal-mood-boards",
  installed: "capture-media",
};
const PUBLIC_BUCKET_BY_KIND: Partial<Record<PlateSourceKind, string>> = {
  upload: "project-item-images",
};
const SOURCE_URL_SECONDS = 3600;

/** Where a bare object path lives: by its source table, else by its kind. */
function sourceBucket(
  table: string | null,
  kind: PlateSourceKind | null,
): { bucket: string; public: boolean } | null {
  const own = (map: Record<string, string | undefined>, key: string | null) =>
    key !== null && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  const byTable = table !== null;
  const publicBucket = byTable ? own(PUBLIC_BUCKET_BY_TABLE, table) : own(PUBLIC_BUCKET_BY_KIND, kind);
  if (publicBucket) return { bucket: publicBucket, public: true };
  const privateBucket = byTable ? own(PRIVATE_BUCKET_BY_TABLE, table) : own(PRIVATE_BUCKET_BY_KIND, kind);
  return privateBucket ? { bucket: privateBucket, public: false } : null;
}

/**
 * A viewable address for each edition image's SOURCE picture, by asset id: a
 * hotlink as it is, an upload's public object URL, a private object signed
 * under the studio's own storage policy. The bucket follows the request's
 * source table as the plate copy does; an unknown table gets no preview.
 * Never the client page's plate route.
 */
export function useClientEditionSourceUrls(images: readonly ClientEditionImage[]) {
  const sources = images
    .filter((image) => image.sourceUrl)
    .map(
      (image) =>
        [image.assetId, image.sourceTable ?? null, image.sourceKind ?? null, image.sourceUrl!] as const,
    );
  return useQuery({
    queryKey: ["client-edition-sources", sources],
    queryFn: async () => {
      const supabase = getSupabase();
      const urls: Record<string, string> = {};
      const toSign = new Map<string, Array<[string, string]>>();
      for (const [assetId, table, kind, address] of sources) {
        if (/^https?:\/\//i.test(address)) {
          urls[assetId] = address;
          continue;
        }
        const path = address.replace(/^\/+/, "");
        const where = sourceBucket(table, kind);
        if (!where) continue;
        if (where.public) {
          urls[assetId] = supabase.storage.from(where.bucket).getPublicUrl(path).data.publicUrl;
          continue;
        }
        toSign.set(where.bucket, [...(toSign.get(where.bucket) ?? []), [assetId, path]]);
      }
      for (const [bucket, entries] of toSign) {
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrls(entries.map(([, path]) => path), SOURCE_URL_SECONDS);
        (data ?? []).forEach((signed, index) => {
          if (signed?.signedUrl) urls[entries[index][0]] = signed.signedUrl;
        });
      }
      return urls;
    },
    enabled: sources.length > 0,
    staleTime: (SOURCE_URL_SECONDS - 300) * 1000,
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface ClientEditionActInput {
  projectId: string;
  editionId: string;
}

export function useApproveClientEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      editionId,
      overrides,
    }: ClientEditionActInput & { overrides: ClientEditionOverrides }) => {
      const { error } = await getSupabase().rpc("approve_client_edition", {
        p_edition_id: editionId,
        p_overrides: overrides as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { projectId, editionId }) => {
      queryClient.setQueryData<ClientEditions>(clientEditionsKey(projectId), (data) => data && ({
        ...data,
        editions: data.editions.map((edition) => edition.id === editionId
          ? { ...edition, status: "approved" }
          : edition),
      }));
    },
    onSettled: (_data, _error, { projectId }) => invalidateClientEditions(queryClient, projectId),
  });
}

export function useHoldClientEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ editionId }: ClientEditionActInput) => {
      const { error } = await getSupabase().rpc("hold_client_edition", {
        p_edition_id: editionId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { projectId, editionId }) => {
      queryClient.setQueryData<ClientEditions>(clientEditionsKey(projectId), (data) => data && ({
        ...data,
        editions: data.editions.map((edition) => edition.id === editionId
          ? { ...edition, held: true }
          : edition),
      }));
    },
    onSettled: (_data, _error, { projectId }) => invalidateClientEditions(queryClient, projectId),
  });
}

export function useUndoClientEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ editionId }: ClientEditionActInput) => {
      const { error } = await getSupabase().rpc("undo_client_edition", {
        p_edition_id: editionId,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, { projectId }) => invalidateClientEditions(queryClient, projectId),
  });
}

export interface SetPlateFocalInput {
  projectId: string;
  assetId: string;
  /** [x, y, w, h], each 0–1; null when the photograph has no subject box. */
  subjectBox: number[] | null;
  /** [x, y], each 0–1. */
  focal: number[];
}

export function useSetPlateFocal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, subjectBox, focal }: SetPlateFocalInput) => {
      const { error } = await getSupabase().rpc("set_plate_focal", {
        p_asset_id: assetId,
        p_subject_box: subjectBox,
        p_focal: focal,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, { projectId }) => invalidateClientEditions(queryClient, projectId),
  });
}

export function useSetProjectShowMakers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, show }: { projectId: string; show: boolean }) => {
      const { error } = await getSupabase().rpc("set_project_show_makers", {
        p_project_id: projectId,
        p_show: show,
      });
      if (error) throw error;
    },
    onSettled: (_data, _error, { projectId }) => invalidateClientEditions(queryClient, projectId),
  });
}
