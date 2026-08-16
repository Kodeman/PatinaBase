import {
  type AudienceRenderModel,
  buildAudienceRenderModel,
  canonicalStringify,
  type FrozenSnapshot,
  type RenderMedia,
  renderMediaIdentity,
  RenderModelError,
  sha256Hex,
  type SpecBookAudience,
  type SpecBookIssueType,
} from "./render-model.ts";
import { renderSpecBookPdf } from "./pdf.ts";

export const SPEC_BOOK_BUCKET = "project-documents";
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export interface ClaimedArtifact {
  id: string;
  revisionId: string;
  audience: SpecBookAudience;
  format: "pdf";
  attemptCount: number;
}

export interface FrozenRevision {
  id: string;
  specBookId: string;
  revisionNumber: number;
  issueType: SpecBookIssueType;
  baseRevisionId: string | null;
  renderSnapshot: FrozenSnapshot;
  snapshotChecksum: string;
  createdBy: string;
  createdAt: string;
}

export interface ProjectDocumentRecord {
  id: string;
  projectId: string;
  title: string;
  storagePath: string;
  sizeBytes: number;
  version: string;
  uploadedBy: string;
}

export interface SpecBookRenderRepository {
  claimArtifact(artifactId: string): Promise<ClaimedArtifact | null>;
  loadRevision(revisionId: string): Promise<FrozenRevision>;
  loadBaseRevision(revisionId: string): Promise<FrozenRevision | null>;
  resolveImage(media: RenderMedia): Promise<string | null>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<void>;
  upsertProjectDocument(record: ProjectDocumentRecord): Promise<string>;
  markArtifactReady(input: {
    artifactId: string;
    projectDocumentId: string;
    storagePath: string;
    checksumSha256: string;
    sizeBytes: number;
  }): Promise<void>;
  markArtifactFailed(
    artifactId: string,
    code: string,
    message: string,
  ): Promise<void>;
  finalizeRevision(revisionId: string): Promise<void>;
}

export interface SpecBookRenderResult {
  artifactId: string;
  revisionId: string;
  audience: SpecBookAudience;
  storagePath: string;
  checksumSha256: string;
  sizeBytes: number;
  finalized: boolean;
}

export class SpecBookRenderError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SpecBookRenderError";
  }
}

function errorCode(error: unknown): string {
  if (
    error instanceof SpecBookRenderError || error instanceof RenderModelError
  ) return error.code;
  return "render_failed";
}

function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[\r\n]+/g, " ").slice(0, 500);
}

async function resolveImages(
  repository: SpecBookRenderRepository,
  model: AudienceRenderModel,
): Promise<Map<string, string>> {
  const media = [...model.items, ...model.allowances, ...model.tbd]
    .flatMap((item) => item.media);
  const unique = new Map(
    media.map((entry) => [renderMediaIdentity(entry), entry]),
  );
  const out = new Map<string, string>();
  // Resolve in deterministic batches. Missing/invalid images intentionally
  // produce the in-document fallback instead of failing the whole artifact.
  const entries = [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (let index = 0; index < entries.length; index += 8) {
    const batch = entries.slice(index, index + 8);
    const results = await Promise.all(
      batch.map(([, item]) => repository.resolveImage(item)),
    );
    results.forEach((data, resultIndex) => {
      if (data) out.set(batch[resultIndex][0], data);
    });
  }
  return out;
}

function expectedFinalizeGuard(error: unknown): boolean {
  return error instanceof SpecBookRenderError &&
    error.code === "finalization_guard" &&
    error.message.toLowerCase().includes(
      "all requested artifacts must be durable before finalization",
    );
}

export async function runSpecBookRender(
  repository: SpecBookRenderRepository,
  artifactId: string,
): Promise<SpecBookRenderResult> {
  let claimed: ClaimedArtifact | null = null;
  let artifactReady = false;
  try {
    claimed = await repository.claimArtifact(artifactId);
    if (!claimed) {
      throw new SpecBookRenderError(
        "artifact_not_claimable",
        "Artifact is not pending, failed, or eligible for retry",
      );
    }
    if (claimed.format !== "pdf") {
      throw new SpecBookRenderError(
        "unsupported_format",
        `Unsupported format: ${claimed.format}`,
      );
    }

    const revision = await repository.loadRevision(claimed.revisionId);
    const actualSnapshotChecksum = await sha256Hex(
      canonicalStringify(revision.renderSnapshot),
    );
    if (actualSnapshotChecksum !== revision.snapshotChecksum.toLowerCase()) {
      throw new SpecBookRenderError(
        "snapshot_checksum_mismatch",
        "Frozen snapshot checksum mismatch",
      );
    }
    const baseRevision = revision.issueType === "addendum"
      ? await repository.loadBaseRevision(revision.baseRevisionId ?? "")
      : null;
    if (revision.issueType === "addendum" && !baseRevision) {
      throw new SpecBookRenderError(
        "base_revision_not_found",
        "Frozen addendum base revision not found",
      );
    }
    if (baseRevision) {
      const actualBaseChecksum = await sha256Hex(
        canonicalStringify(baseRevision.renderSnapshot),
      );
      if (actualBaseChecksum !== baseRevision.snapshotChecksum.toLowerCase()) {
        throw new SpecBookRenderError(
          "base_snapshot_checksum_mismatch",
          "Frozen addendum base snapshot checksum mismatch",
        );
      }
    }

    const model = await buildAudienceRenderModel(
      revision.renderSnapshot,
      claimed.audience,
      {
        revisionNumber: revision.revisionNumber,
        createdAt: revision.createdAt,
        issueType: revision.issueType,
      },
      baseRevision?.renderSnapshot,
    );
    const imageData = await resolveImages(repository, model);
    const bytes = await renderSpecBookPdf(model, imageData);
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new SpecBookRenderError(
        "pdf_too_large",
        `Rendered PDF exceeds ${MAX_PDF_BYTES} bytes`,
      );
    }
    const checksumSha256 = await sha256Hex(bytes);
    const storagePath =
      `${model.project.id}/spec-books/${revision.id}/${claimed.audience}.pdf`;
    await repository.uploadPdf(storagePath, bytes);

    const projectDocumentId = await repository.upsertProjectDocument({
      id: claimed.id,
      projectId: model.project.id,
      title: `${model.book.title.slice(0, 180)} — ${model.editionLabel}`,
      storagePath,
      sizeBytes: bytes.byteLength,
      version: `r${revision.revisionNumber}`,
      uploadedBy: revision.createdBy,
    });
    await repository.markArtifactReady({
      artifactId: claimed.id,
      projectDocumentId,
      storagePath,
      checksumSha256,
      sizeBytes: bytes.byteLength,
    });
    artifactReady = true;

    let finalized = true;
    try {
      await repository.finalizeRevision(revision.id);
    } catch (error) {
      if (!expectedFinalizeGuard(error)) throw error;
      finalized = false;
    }
    return {
      artifactId: claimed.id,
      revisionId: revision.id,
      audience: claimed.audience,
      storagePath,
      checksumSha256,
      sizeBytes: bytes.byteLength,
      finalized,
    };
  } catch (error) {
    if (claimed && !artifactReady) {
      try {
        await repository.markArtifactFailed(
          claimed.id,
          errorCode(error),
          errorMessage(error),
        );
      } catch (markError) {
        console.error(
          "spec-book-render: failed to persist artifact failure",
          errorMessage(markError),
        );
      }
    }
    throw error;
  }
}
