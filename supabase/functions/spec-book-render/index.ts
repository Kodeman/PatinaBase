// JWT-protected Spec Book publication worker.
//
// Input: { artifactId: uuid } (artifact_id accepted for RPC-style callers).
// The caller first passes the artifact table's RLS boundary. A service-role
// repository then atomically claims the artifact and reads only immutable
// revision snapshots; it never loads live FF&E, products, vendors, or notes.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  type ClaimedArtifact,
  type FrozenRevision,
  type ProjectDocumentRecord,
  runSpecBookRender,
  SPEC_BOOK_BUCKET,
  SpecBookRenderError,
  type SpecBookRenderRepository,
} from "./core.ts";
import {
  type FrozenSnapshot,
  type RenderMedia,
  RenderModelError,
  SPEC_BOOK_AUDIENCES,
  type SpecBookAudience,
  type SpecBookIssueType,
} from "./render-model.ts";
import {
  parseAllowedRemoteImageOrigins,
  safeRemoteImageRedirectUrl,
  safeRemoteImageUrl,
} from "./remote-media.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_REMOTE_IMAGE_ORIGINS = parseAllowedRemoteImageOrigins(
  Deno.env.get("SPEC_BOOK_IMAGE_ORIGINS"),
);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8_000;
const STALE_RENDER_MS = 15 * 60 * 1_000;
const ALLOWED_MEDIA_BUCKETS = new Set([
  "product-images",
  "capture-media",
  "field-media",
  "project-documents",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseArtifactId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const value = body.artifactId ?? body.artifact_id;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function mapRevision(row: any): FrozenRevision {
  if (
    !row?.id ||
    !row?.spec_book_id ||
    !row?.render_snapshot ||
    !row?.snapshot_checksum ||
    !row?.created_by ||
    !row?.created_at
  ) {
    throw new SpecBookRenderError(
      "invalid_revision",
      "Frozen revision is incomplete",
    );
  }
  return {
    id: row.id,
    specBookId: row.spec_book_id,
    revisionNumber: row.revision_number,
    issueType: row.issue_type as SpecBookIssueType,
    baseRevisionId: row.base_revision_id ?? row.prior_revision_id ?? null,
    renderSnapshot: row.render_snapshot as FrozenSnapshot,
    snapshotChecksum: row.snapshot_checksum,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function bytesToDataUri(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function imageBlobToDataUri(blob: Blob): Promise<string | null> {
  const type = blob.type.toLowerCase().split(";")[0];
  if (
    !["image/jpeg", "image/png"].includes(type) || blob.size > IMAGE_MAX_BYTES
  ) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) return null;
  return bytesToDataUri(bytes, type);
}

async function fetchRemoteImage(url: URL): Promise<Blob | null> {
  let next = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const safe = safeRemoteImageUrl(
      next.toString(),
      SUPABASE_URL,
      ALLOWED_REMOTE_IMAGE_ORIGINS,
    );
    if (!safe) return null;
    const response = await fetch(safe, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) return null;
      const redirect = safeRemoteImageRedirectUrl(
        location,
        safe,
        SUPABASE_URL,
        ALLOWED_REMOTE_IMAGE_ORIGINS,
      );
      if (!redirect) return null;
      next = redirect;
      continue;
    }
    if (!response.ok) return null;
    const contentLength = Number(
      response.headers.get("content-length") ?? 0,
    );
    if (contentLength > IMAGE_MAX_BYTES) return null;
    return await response.blob();
  }
  return null;
}

function repository(
  admin: SupabaseClient,
  mediaClient: SupabaseClient,
): SpecBookRenderRepository {
  return {
    async claimArtifact(artifactId): Promise<ClaimedArtifact | null> {
      const { data: current, error: lookupError } = await admin
        .from("spec_book_artifacts")
        .select(
          "id, revision_id, audience, format, status, attempt_count, render_started_at, storage_path, checksum_sha256, size_bytes",
        )
        .eq("id", artifactId)
        .maybeSingle();
      if (lookupError) {
        throw new SpecBookRenderError(
          "artifact_lookup_failed",
          lookupError.message,
        );
      }
      if (!current) {
        return null;
      }
      if (
        !SPEC_BOOK_AUDIENCES.includes(current.audience as SpecBookAudience) ||
        current.format !== "pdf"
      ) {
        throw new SpecBookRenderError(
          "invalid_artifact",
          "Artifact audience or format is invalid",
        );
      }
      if (current.status === "ready") {
        if (
          typeof current.storage_path !== "string" ||
          current.storage_path.length === 0 ||
          typeof current.checksum_sha256 !== "string" ||
          !/^[0-9a-f]{64}$/i.test(current.checksum_sha256) ||
          !Number.isSafeInteger(current.size_bytes) ||
          current.size_bytes <= 0
        ) {
          throw new SpecBookRenderError(
            "invalid_ready_artifact",
            "Ready artifact is missing durable storage identity",
          );
        }
        return {
          id: current.id,
          revisionId: current.revision_id,
          audience: current.audience as SpecBookAudience,
          format: "pdf",
          attemptCount: current.attempt_count ?? 0,
          mode: "finalize",
          storagePath: current.storage_path,
          checksumSha256: current.checksum_sha256.toLowerCase(),
          sizeBytes: current.size_bytes,
        };
      }
      const renderStartedAt = current.render_started_at
        ? Date.parse(current.render_started_at)
        : Number.NaN;
      const staleRendering = current.status === "rendering" &&
        Number.isFinite(renderStartedAt) &&
        renderStartedAt < Date.now() - STALE_RENDER_MS;
      if (!["pending", "failed"].includes(current.status) && !staleRendering) {
        return null;
      }
      const now = new Date().toISOString();
      let claimQuery = admin
        .from("spec_book_artifacts")
        .update({
          status: "rendering",
          attempt_count: (current.attempt_count ?? 0) + 1,
          render_started_at: now,
          rendered_at: null,
          error_code: null,
          error_message: null,
        })
        .eq("id", artifactId)
        .eq("status", current.status);
      if (staleRendering) {
        claimQuery = claimQuery.eq(
          "render_started_at",
          current.render_started_at,
        );
      }
      const { data, error } = await claimQuery
        .select("id, revision_id, audience, format, attempt_count")
        .maybeSingle();
      if (error) {
        throw new SpecBookRenderError("artifact_claim_failed", error.message);
      }
      if (!data) return null;
      return {
        id: data.id,
        revisionId: data.revision_id,
        audience: data.audience as SpecBookAudience,
        format: data.format as "pdf",
        attemptCount: data.attempt_count,
        mode: "render",
      };
    },

    async loadRevision(revisionId): Promise<FrozenRevision> {
      const { data, error } = await admin
        .from("spec_book_revisions")
        .select(
          "id, spec_book_id, revision_number, issue_type, prior_revision_id, base_revision_id, render_snapshot, snapshot_checksum, created_by, created_at",
        )
        .eq("id", revisionId)
        .maybeSingle();
      if (error) {
        throw new SpecBookRenderError("revision_lookup_failed", error.message);
      }
      if (!data) {
        throw new SpecBookRenderError(
          "revision_not_found",
          "Frozen revision not found",
        );
      }
      return mapRevision(data);
    },

    async loadBaseRevision(revisionId): Promise<FrozenRevision | null> {
      if (!revisionId) return null;
      const { data, error } = await admin
        .from("spec_book_revisions")
        .select(
          "id, spec_book_id, revision_number, issue_type, prior_revision_id, base_revision_id, render_snapshot, snapshot_checksum, created_by, created_at",
        )
        .eq("id", revisionId)
        .maybeSingle();
      if (error) {
        throw new SpecBookRenderError(
          "base_revision_lookup_failed",
          error.message,
        );
      }
      return data ? mapRevision(data) : null;
    },

    async resolveImage(media: RenderMedia): Promise<string | null> {
      try {
        if (media.storagePath) {
          const bucket = media.storageBucket ?? "product-images";
          if (!ALLOWED_MEDIA_BUCKETS.has(bucket)) return null;
          // Use the authenticated caller so storage RLS remains the object-level
          // authorization boundary. The service-role client must never become a
          // confused deputy for a frozen path from another project or owner.
          const { data, error } = await mediaClient.storage
            .from(bucket)
            .download(media.storagePath);
          if (error || !data) return null;
          return await imageBlobToDataUri(data);
        }
        if (!media.url) return null;
        if (
          media.url.startsWith("data:image/png;base64,") ||
          media.url.startsWith("data:image/jpeg;base64,")
        ) {
          return media.url.length <= Math.ceil(IMAGE_MAX_BYTES * 1.4)
            ? media.url
            : null;
        }
        const url = safeRemoteImageUrl(
          media.url,
          SUPABASE_URL,
          ALLOWED_REMOTE_IMAGE_ORIGINS,
        );
        if (!url) return null;
        const blob = await fetchRemoteImage(url);
        return blob ? await imageBlobToDataUri(blob) : null;
      } catch {
        return null;
      }
    },

    async uploadPdf(path, bytes): Promise<void> {
      const { error } = await admin.storage.from(SPEC_BOOK_BUCKET).upload(
        path,
        bytes,
        {
          contentType: "application/pdf",
          upsert: true,
        },
      );
      if (error) throw new SpecBookRenderError("upload_failed", error.message);
    },

    async upsertProjectDocument(
      record: ProjectDocumentRecord,
    ): Promise<string> {
      const { data, error } = await admin
        .from("project_documents")
        .upsert(
          {
            id: record.id,
            project_id: record.projectId,
            title: record.title,
            doc_type: "pdf",
            category: "spec",
            storage_path: record.storagePath,
            url: null,
            size_bytes: record.sizeBytes,
            version: record.version,
            status: "ready",
            uploaded_by: record.uploadedBy,
            anchor_kind: "section",
            section_key: "spec-book",
            client_visible: false,
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();
      if (error) {
        throw new SpecBookRenderError("document_record_failed", error.message);
      }
      return data.id;
    },

    async markArtifactReady(input): Promise<void> {
      const { data, error } = await admin
        .from("spec_book_artifacts")
        .update({
          status: "ready",
          project_document_id: input.projectDocumentId,
          storage_bucket: SPEC_BOOK_BUCKET,
          storage_path: input.storagePath,
          checksum_sha256: input.checksumSha256,
          size_bytes: input.sizeBytes,
          rendered_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq("id", input.artifactId)
        .eq("status", "rendering")
        .select("id")
        .maybeSingle();
      if (error) {
        throw new SpecBookRenderError(
          "artifact_finalize_failed",
          error.message,
        );
      }
      if (!data) {
        throw new SpecBookRenderError(
          "artifact_state_conflict",
          "Artifact left rendering state",
        );
      }
    },

    async markArtifactFailed(artifactId, code, message): Promise<void> {
      const { error } = await admin
        .from("spec_book_artifacts")
        .update({
          status: "failed",
          error_code: code,
          error_message: message,
          rendered_at: null,
        })
        .eq("id", artifactId)
        .eq("status", "rendering");
      if (error) {
        throw new SpecBookRenderError("failure_persist_failed", error.message);
      }
    },

    async finalizeRevision(revisionId): Promise<void> {
      const { error } = await admin.rpc("finalize_spec_book_issue", {
        p_revision_id: revisionId,
      });
      if (error) {
        throw new SpecBookRenderError("finalization_guard", error.message);
      }
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const artifactId = parseArtifactId(raw);
  if (!artifactId) return json({ error: "artifact_id_required" }, 400);

  // The gateway verifies the JWT. This caller-scoped read additionally applies
  // artifact RLS before any service-role client is constructed.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: visible, error: visibleError } = await caller
    .from("spec_book_artifacts")
    .select("id")
    .eq("id", artifactId)
    .maybeSingle();
  if (visibleError || !visible) return json({ error: "not_found" }, 404);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await runSpecBookRender(
      repository(admin, caller),
      artifactId,
    );
    return json({ ok: true, ...result });
  } catch (error) {
    const code =
      error instanceof SpecBookRenderError || error instanceof RenderModelError
        ? error.code
        : "render_failed";
    const message = error instanceof Error ? error.message : String(error);
    console.error("spec-book-render:", code, message);
    const status = code === "artifact_not_claimable" ? 409 : 500;
    return json({ error: code }, status);
  }
});
