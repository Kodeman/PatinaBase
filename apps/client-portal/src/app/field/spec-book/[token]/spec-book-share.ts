import "server-only";

import { createServiceClient } from "@patina/supabase/server";
import { isSpecBookGuestEntryEnabled } from "./spec-book-feature-gate";

export const SPEC_BOOK_SHARE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const SPEC_BOOK_SIGNED_URL_TTL_SECONDS = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SPEC_BOOK_AUDIENCES = new Set([
  "client",
  "vendor",
  "installer",
  "internal",
  "care",
] as const);

export type SpecBookAudience =
  | "client"
  | "vendor"
  | "installer"
  | "internal"
  | "care";

export interface SpecBookShare {
  artifactId: string;
  audience: SpecBookAudience;
  format: "pdf";
  label: string | null;
  title: string;
  sizeBytes: number | null;
  checksumSha256: string;
  issuedAt: string;
  shareExpiresAt: string | null;
}

export interface SpecBookSignedArtifact {
  signedUrl: string;
  title: string;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseResolvedShare(value: unknown): SpecBookShare | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate)) return null;

  const {
    artifactId,
    audience,
    format,
    label,
    title,
    sizeBytes,
    checksumSha256,
    issuedAt,
    shareExpiresAt,
  } = candidate;

  if (
    typeof artifactId !== "string" ||
    !UUID_PATTERN.test(artifactId) ||
    typeof audience !== "string" ||
    !SPEC_BOOK_AUDIENCES.has(audience as SpecBookAudience) ||
    format !== "pdf" ||
    (label !== null && typeof label !== "string") ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    (sizeBytes !== null &&
      (typeof sizeBytes !== "number" ||
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 0)) ||
    typeof checksumSha256 !== "string" ||
    !SHA256_PATTERN.test(checksumSha256) ||
    !isIsoDate(issuedAt) ||
    (shareExpiresAt !== null && !isIsoDate(shareExpiresAt))
  ) {
    return null;
  }

  return {
    artifactId,
    audience: audience as SpecBookAudience,
    format,
    label,
    title: title.trim(),
    sizeBytes,
    checksumSha256,
    issuedAt,
    shareExpiresAt,
  };
}

export async function resolveSpecBookShare(
  token: string,
  client?: ServiceClient,
): Promise<SpecBookShare | null> {
  if (!SPEC_BOOK_SHARE_TOKEN_PATTERN.test(token)) return null;

  try {
    const admin = client ?? createServiceClient();
    const { data, error } = await admin.rpc("resolve_spec_book_share", {
      p_token: token,
    });
    if (error) return null;
    const share = parseResolvedShare(data);
    if (!share) return null;
    return (await isSpecBookGuestEntryEnabled(share.artifactId, admin))
      ? share
      : null;
  } catch {
    return null;
  }
}

function singleRowQuery<T>(
  client: ServiceClient,
  table: "spec_book_artifacts" | "project_documents",
  columns: string,
  id: string,
): Promise<{ data: T | null; error: unknown }> {
  return client
    .from(table)
    .select(columns)
    .eq("id", id)
    .maybeSingle() as unknown as Promise<{ data: T | null; error: unknown }>;
}

interface ArtifactRow {
  id: string;
  audience: string;
  format: string;
  status: string;
  project_document_id: string | null;
  storage_bucket: string;
  storage_path: string | null;
}

interface ProjectDocumentRow {
  id: string;
  title: string;
  doc_type: string;
  status: string | null;
  storage_path: string | null;
}

export async function signResolvedSpecBookArtifact(
  token: string,
  download: boolean,
  client?: ServiceClient,
): Promise<SpecBookSignedArtifact | null> {
  if (!SPEC_BOOK_SHARE_TOKEN_PATTERN.test(token)) return null;

  try {
    const admin = client ?? createServiceClient();
    const share = await resolveSpecBookShare(token, admin);
    if (!share) return null;

    const { data: artifact, error: artifactError } =
      await singleRowQuery<ArtifactRow>(
        admin,
        "spec_book_artifacts",
        "id, audience, format, status, project_document_id, storage_bucket, storage_path",
        share.artifactId,
      );
    if (
      artifactError ||
      !artifact ||
      artifact.id !== share.artifactId ||
      artifact.audience !== share.audience ||
      artifact.format !== share.format ||
      artifact.status !== "ready" ||
      !artifact.project_document_id ||
      artifact.storage_bucket !== "project-documents" ||
      !artifact.storage_path
    ) {
      return null;
    }

    const { data: document, error: documentError } =
      await singleRowQuery<ProjectDocumentRow>(
        admin,
        "project_documents",
        "id, title, doc_type, status, storage_path",
        artifact.project_document_id,
      );
    if (
      documentError ||
      !document ||
      document.id !== artifact.project_document_id ||
      document.doc_type !== "pdf" ||
      document.status !== "ready" ||
      document.storage_path !== artifact.storage_path
    ) {
      return null;
    }

    const options = download
      ? {
          download: `${share.title.replace(/[^\w .()-]+/g, "").trim() || "spec-book"}.pdf`,
        }
      : undefined;
    const { data: signed, error: signedError } = await admin.storage
      .from("project-documents")
      .createSignedUrl(
        artifact.storage_path,
        SPEC_BOOK_SIGNED_URL_TTL_SECONDS,
        options,
      );
    if (signedError || !signed?.signedUrl) return null;

    return { signedUrl: signed.signedUrl, title: share.title };
  } catch {
    return null;
  }
}
