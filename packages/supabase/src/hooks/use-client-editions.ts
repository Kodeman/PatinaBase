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
    Args: { p_asset_id: string; p_subject_box: number[]; p_focal: number[] };
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
  sourceKind: PlateSourceKind | null;
  /** A storage object path (upload, concept, scan, board) or a hotlink. */
  sourceUrl: string | null;
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
  /** The hero candidates offered to the studio (Call A2), when present. */
  candidates?: Array<string | { assetId?: string | null }> | null;
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
  held: boolean;
  approvedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  createdAt: string | null;
  supersededAt: string | null;
  frozenAt: string | null;
  composition: ClientEditionComposition | null;
  overrides: ClientEditionOverrides | null;
  images: ClientEditionImage[];
}

export interface ClientEditions {
  showMakers: boolean;
  /** Newest first (seq descending). */
  editions: ClientEdition[];
}

const EMPTY_EDITIONS: ClientEditions = { showMakers: false, editions: [] };

function normalizeClientEditions(data: Json | null): ClientEditions {
  if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY_EDITIONS;
  const raw = data as unknown as Partial<ClientEditions>;
  const editions = Array.isArray(raw.editions) ? raw.editions : [];
  return {
    showMakers: raw.showMakers === true,
    editions: editions
      .map((edition) => ({
        ...edition,
        autoPublished: edition.autoPublished === true,
        held: edition.held === true,
        images: Array.isArray(edition.images) ? edition.images : [],
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

/**
 * Every edition of a job, newest first. A refusal (not a studio member of the
 * project, or not a project) is final, so it is not retried.
 */
export function useClientEditions(projectId: string | null | undefined) {
  return useQuery({
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
  });
}

/** The private bucket each source kind's object path lives in (00843;
 *  client-plate-copy lib.ts). Uploads are in the public item-images bucket. */
const PRIVATE_BUCKET_BY_KIND: Partial<Record<PlateSourceKind, string>> = {
  concept: "room-renders",
  scan: "room-scans",
  board: "proposal-mood-boards",
};
const PUBLIC_BUCKET_BY_KIND: Partial<Record<PlateSourceKind, string>> = {
  upload: "project-item-images",
};
const SOURCE_URL_SECONDS = 3600;

/**
 * A viewable address for each edition image's SOURCE picture, by asset id: a
 * hotlink as it is, an upload's public object URL, a private object signed
 * under the studio's own storage policy. Never the client page's plate route.
 */
export function useClientEditionSourceUrls(images: readonly ClientEditionImage[]) {
  const sources = images
    .filter((image) => image.sourceUrl)
    .map((image) => [image.assetId, image.sourceKind ?? "", image.sourceUrl!] as const);
  return useQuery({
    queryKey: ["client-edition-sources", sources],
    queryFn: async () => {
      const supabase = getSupabase();
      const urls: Record<string, string> = {};
      const toSign = new Map<string, Array<[string, string]>>();
      for (const [assetId, kind, address] of sources) {
        if (/^https?:\/\//i.test(address)) {
          urls[assetId] = address;
          continue;
        }
        const path = address.replace(/^\/+/, "");
        const publicBucket = PUBLIC_BUCKET_BY_KIND[kind as PlateSourceKind];
        if (publicBucket) {
          urls[assetId] = supabase.storage.from(publicBucket).getPublicUrl(path).data.publicUrl;
          continue;
        }
        const bucket = PRIVATE_BUCKET_BY_KIND[kind as PlateSourceKind];
        if (bucket) toSign.set(bucket, [...(toSign.get(bucket) ?? []), [assetId, path]]);
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
  /** [x, y, w, h], each 0–1. */
  subjectBox: number[];
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
