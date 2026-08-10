import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";

/**
 * The generated database types intentionally lag this module until the
 * additive spec-book migration lands. Keep every provisional cast in this
 * file so integration can remove them without leaking untyped table access
 * into either portal.
 */
const getSupabase = () => createBrowserClient() as any;

export type SpecBookAudience =
  | "client"
  | "vendor"
  | "installer"
  | "internal"
  | "care";
export type SpecBookIssueType = "full" | "replacement" | "addendum";
export type SpecBookReadiness = "draft" | "incomplete" | "ready" | "blocked";
export type SpecBookArtifactStatus =
  | "pending"
  | "rendering"
  | "ready"
  | "failed";

export interface SpecBook {
  id: string;
  project_id: string;
  title: string;
  template_id: string | null;
  default_audiences: SpecBookAudience[];
  working_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SpecBookChapter {
  id: string;
  spec_book_id: string;
  project_room_id: string | null;
  title: string;
  position: number;
  hero_media: unknown;
  included: boolean;
  page_template: string | null;
  review_state: string;
}

export interface ProjectFfeSpec {
  id: string;
  ffe_item_id: string;
  configuration_id: string | null;
  configuration_snapshot: Record<string, unknown> | null;
  configuration_snapshot_hash: string | null;
  configuration_locked_at: string | null;
  sku: string | null;
  finish: string | null;
  material: string | null;
  color_fabric: string | null;
  selected_dimensions: Record<string, unknown> | null;
  exact_location: string | null;
  client_notes: string | null;
  trade_notes: string | null;
  install_notes: string | null;
  care_notes: string | null;
  warranty_notes: string | null;
  selected_media: unknown[];
  source_verifications: Record<string, string>;
  na_declarations: Record<
    string,
    { na: true; reason: string; declared_at?: string }
  >;
  field_provenance: Record<string, unknown>;
  readiness_status: SpecBookReadiness;
  row_version: number;
  updated_at: string;
}

export interface SpecBookItemSetting {
  id: string;
  spec_book_id: string;
  ffe_item_id: string;
  chapter_id: string | null;
  position: number;
  included: boolean;
  page_template: string | null;
  review_state: string;
  publication_overrides: Record<string, unknown>;
}

export interface SpecBookRevision {
  id: string;
  spec_book_id: string;
  revision_number: number;
  issue_type: SpecBookIssueType;
  base_revision_id: string | null;
  reason: string | null;
  status: "pending" | "preparing" | "rendering" | "issued" | "failed";
  requested_audiences: SpecBookAudience[];
  snapshot_checksum: string | null;
  issued_at: string | null;
  created_at: string;
}

export interface SpecBookArtifact {
  id: string;
  revision_id: string;
  audience: SpecBookAudience;
  format: "pdf";
  status: SpecBookArtifactStatus;
  project_document_id: string | null;
  checksum_sha256: string | null;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface SpecBookWorkItem {
  id: string;
  project_id: string;
  project_room_id: string | null;
  slot_id: string | null;
  product_id: string | null;
  name: string | null;
  document_code: string | null;
  item_type: "fixed" | "allowance" | "tbd" | string;
  status: string;
  quantity: number | null;
  purchase_order_id: string | null;
  image_url: string | null;
  vendor_name: string | null;
  sku: string | null;
  finish: string | null;
  material: string | null;
  color_fabric: string | null;
  selected_dimensions: Record<string, unknown> | string | null;
  dimensions: string | null;
  exact_location: string | null;
  lead_time: string | null;
  unit_price_cents: number | null;
  trade_price_cents: number | null;
  markup_percent: number | null;
  updated_at: string | null;
  custom_fields: Record<string, unknown>;
  room: { id: string; name: string } | null;
  product: Record<string, unknown> | null;
  spec: ProjectFfeSpec | null;
  setting: SpecBookItemSetting | null;
}

export interface SpecBookWorkbench {
  book: SpecBook;
  chapters: SpecBookChapter[];
  items: SpecBookWorkItem[];
  revisions: SpecBookRevision[];
  artifacts: SpecBookArtifact[];
}

export const specBookKeys = {
  all: ["spec-books"] as const,
  project: (projectId: string) => ["spec-books", "project", projectId] as const,
  workbench: (projectId: string) =>
    ["spec-books", "workbench", projectId] as const,
  revision: (revisionId: string) =>
    ["spec-books", "revision", revisionId] as const,
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return value ?? [];
}

async function ensureProjectBook(projectId: string): Promise<SpecBook> {
  const { data, error } = await getSupabase().rpc("ensure_project_spec_book", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as SpecBook;
}

/** Ensures and returns the one canonical working book for a project. */
export function useProjectSpecBook(projectId: string) {
  return useQuery({
    queryKey: specBookKeys.project(projectId),
    queryFn: () => ensureProjectBook(projectId),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}

/**
 * Loads the full designer-only working set. Publication never uses this
 * result; renderers read the frozen revision snapshot exclusively.
 */
export function useSpecBookWorkbench(projectId: string) {
  return useQuery<SpecBookWorkbench>({
    queryKey: specBookKeys.workbench(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const book = await ensureProjectBook(projectId);
      const itemsResult = await supabase
        .from("project_ffe_items")
        .select(
          "*, room:project_rooms!project_room_id(id, name), product:products!product_id(*)",
        )
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (itemsResult.error) throw itemsResult.error;
      const rawItems = asArray<Record<string, any>>(itemsResult.data);
      const itemIds = rawItems.map((item) => item.id);

      const [chaptersResult, settingsResult, specsResult, revisionsResult] =
        await Promise.all([
          supabase
            .from("spec_book_chapters")
            .select("*")
            .eq("spec_book_id", book.id)
            .order("position", { ascending: true }),
          supabase
            .from("spec_book_item_settings")
            .select("*")
            .eq("spec_book_id", book.id)
            .order("position", { ascending: true }),
          supabase
            .from("project_ffe_specs")
            .select("*")
            .in(
              "ffe_item_id",
              itemIds.length > 0
                ? itemIds
                : ["00000000-0000-0000-0000-000000000000"],
            ),
          supabase
            .from("spec_book_revisions")
            .select("*, artifacts:spec_book_artifacts(*)")
            .eq("spec_book_id", book.id)
            .order("created_at", { ascending: false }),
        ]);

      const firstError = [
        chaptersResult,
        settingsResult,
        specsResult,
        revisionsResult,
      ].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const settings = asArray<SpecBookItemSetting>(settingsResult.data);
      const specs = asArray<ProjectFfeSpec>(specsResult.data);
      const settingsByItem = new Map(
        settings.map((setting) => [setting.ffe_item_id, setting]),
      );
      const specsByItem = new Map(
        specs.map((spec) => [spec.ffe_item_id, spec]),
      );
      const revisionRows = asArray<
        SpecBookRevision & { artifacts?: SpecBookArtifact[] }
      >(revisionsResult.data);

      return {
        book,
        chapters: asArray<SpecBookChapter>(chaptersResult.data),
        items: rawItems.map((item) => {
          const customFields =
            item.custom_fields && typeof item.custom_fields === "object"
              ? item.custom_fields
              : {};
          const product = item.product as Record<string, unknown> | null;
          const images = product?.images;
          return {
            ...item,
            document_code: item.doc_code ?? null,
            slot_id: (customFields.slot_id as string | undefined) ?? null,
            image_url:
              Array.isArray(images) && typeof images[0] === "string"
                ? images[0]
                : null,
            sku: item.sku ?? null,
            finish: item.finish ?? null,
            material: item.material ?? null,
            color_fabric: item.color_fabric ?? null,
            selected_dimensions:
              item.selected_dimensions ?? item.dimensions ?? null,
            dimensions: item.dimensions ?? null,
            exact_location: item.exact_location ?? null,
            lead_time: item.lead_time ?? null,
            custom_fields: customFields,
            spec: specsByItem.get(item.id) ?? null,
            setting: settingsByItem.get(item.id) ?? null,
          };
        }) as SpecBookWorkItem[],
        revisions: revisionRows.map(
          ({ artifacts: _artifacts, ...revision }) => revision,
        ),
        artifacts: revisionRows.flatMap((revision) => revision.artifacts ?? []),
      };
    },
  });
}

export interface UpdateProjectFfeSpecInput {
  projectId: string;
  specId: string;
  expectedRowVersion: number;
  changes: Partial<
    Pick<
      ProjectFfeSpec,
      | "sku"
      | "finish"
      | "material"
      | "color_fabric"
      | "selected_dimensions"
      | "exact_location"
      | "client_notes"
      | "trade_notes"
      | "install_notes"
      | "care_notes"
      | "warranty_notes"
      | "selected_media"
      | "source_verifications"
      | "na_declarations"
      | "field_provenance"
    >
  >;
}

/**
 * Optimistic concurrency is enforced in the UPDATE predicate. A zero-row
 * result means another editor advanced row_version and is surfaced as a
 * conflict instead of silently overwriting their work.
 */
export function useUpdateProjectFfeSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      specId,
      expectedRowVersion,
      changes,
    }: UpdateProjectFfeSpecInput): Promise<ProjectFfeSpec> => {
      if ("readiness_status" in changes) {
        throw new Error("Readiness is derived from the active spec template and cannot be edited.");
      }
      const { data, error } = await getSupabase()
        .from("project_ffe_specs")
        // row_version is database-managed by spec_book_bump_spec_version().
        // Sending it in the payload is rejected before the trigger can bump it.
        .update(changes)
        .eq("id", specId)
        .eq("row_version", expectedRowVersion)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "This selection changed in another session. Refresh before saving.",
        );
      }
      return data as ProjectFfeSpec;
    },
    // A stale version is a user-visible conflict, not a transient failure.
    retry: false,
    onSuccess: (_data, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["project-ffe-items", projectId],
      });
    },
  });
}

export function useUpdateSpecBookChapter(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      chapterId,
      changes,
    }: {
      chapterId: string;
      changes: Partial<
        Pick<
          SpecBookChapter,
          | "title"
          | "position"
          | "included"
          | "page_template"
          | "review_state"
          | "hero_media"
        >
      >;
    }) => {
      const { data, error } = await getSupabase()
        .from("spec_book_chapters")
        .update(changes)
        .eq("id", chapterId)
        .select("*")
        .single();
      if (error) throw error;
      return data as SpecBookChapter;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}

export function useUpdateSpecBookItemSetting(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      settingId,
      changes,
    }: {
      settingId: string;
      changes: Partial<
        Pick<
          SpecBookItemSetting,
          | "chapter_id"
          | "position"
          | "included"
          | "page_template"
          | "review_state"
          | "publication_overrides"
        >
      >;
    }) => {
      const { data, error } = await getSupabase()
        .from("spec_book_item_settings")
        .update(changes)
        .eq("id", settingId)
        .select("*")
        .single();
      if (error) throw error;
      return data as SpecBookItemSetting;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}

export interface PrepareSpecBookIssueInput {
  projectId: string;
  specBookId: string;
  audiences: SpecBookAudience[];
  issueType: SpecBookIssueType;
  reason: string | null;
  baseRevisionId: string | null;
  idempotencyKey: string;
  warningAcknowledgements: Array<{ code: string; reason: string }>;
}

export function usePrepareSpecBookIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      specBookId,
      audiences,
      issueType,
      reason,
      baseRevisionId,
      idempotencyKey,
      warningAcknowledgements,
    }: PrepareSpecBookIssueInput) => {
      const { data, error } = await getSupabase().rpc(
        "prepare_spec_book_issue",
        {
          p_spec_book_id: specBookId,
          p_audiences: audiences,
          p_issue_type: issueType,
          p_reason: reason,
          p_base_revision_id: baseRevisionId,
          p_idempotency_key: idempotencyKey,
          p_warning_acknowledgements: warningAcknowledgements,
        },
      );
      if (error) throw error;
      return data as {
        revision: SpecBookRevision;
        artifacts: SpecBookArtifact[];
        warnings: unknown[];
        idempotent: boolean;
      };
    },
    onSuccess: (_data, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}

export function useFinalizeSpecBookIssue(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (revisionId: string) => {
      const { data, error } = await getSupabase().rpc(
        "finalize_spec_book_issue",
        { p_revision_id: revisionId },
      );
      if (error) throw error;
      return data as SpecBookRevision;
    },
    onSuccess: (revision) => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.revision(revision.id),
      });
    },
  });
}

/** Retries one audience artifact in place; no revision is created. */
export function useRenderSpecBookArtifact(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (artifactId: string) => {
      const { data, error } = await getSupabase().functions.invoke(
        "spec-book-render",
        { body: { artifactId } },
      );
      if (error) throw error;
      return data as { artifact: SpecBookArtifact };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}

export function useCreateSpecBookShare(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artifactId,
      label,
      expiresAt,
    }: {
      artifactId: string;
      label: string;
      expiresAt?: string | null;
    }) => {
      const { data, error } = await getSupabase().rpc(
        "create_spec_book_share",
        {
          p_artifact_id: artifactId,
          p_label: label,
          p_expires_at: expiresAt ?? null,
        },
      );
      if (error) throw error;
      return data as {
        share_id: string;
        token: string;
        expires_at: string | null;
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}

export function useRevokeDocumentShare(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: string) => {
      const { data, error } = await getSupabase().rpc("revoke_document_share", {
        p_share_id: shareId,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: specBookKeys.workbench(projectId),
      });
    },
  });
}
