import type {
  ApprovalArtifactCitation,
  DecisionRecipient,
} from "./decision-notify.ts";

export interface EmbeddedApprovalArtifact {
  source_kind: string | null;
  source_version: number | null;
  artifact_hash: string | null;
  artifact_title: string | null;
}

export interface EmbeddedAuthoritySnapshot {
  decision_lead_id: string | null;
  decision_lead:
    | EmbeddedProfile
    | EmbeddedProfile[]
    | null;
}

export interface EmbeddedProfile {
  id: string | null;
  full_name: string | null;
  email: string | null;
}

export function toOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function resolveApprovalArtifactCitation(
  value:
    | EmbeddedApprovalArtifact
    | EmbeddedApprovalArtifact[]
    | null
    | undefined,
): ApprovalArtifactCitation | null {
  const artifact = toOne(value);
  if (!artifact) return null;
  if (
    artifact.source_kind !== "plan_issue" &&
    artifact.source_kind !== "spec_book_artifact" &&
    artifact.source_kind !== "budget_version"
  ) return null;
  if (
    !Number.isInteger(artifact.source_version) ||
    (artifact.source_version ?? 0) <= 0
  ) {
    return null;
  }
  if (!artifact.artifact_hash?.match(/^[0-9a-f]{64}$/)) return null;
  if (!artifact.artifact_title?.trim()) return null;
  return {
    kind: artifact.source_kind,
    version: artifact.source_version as number,
    checksum: artifact.artifact_hash,
    title: artifact.artifact_title,
  };
}

export function resolveFrozenLeadRecipient(
  value:
    | EmbeddedAuthoritySnapshot
    | EmbeddedAuthoritySnapshot[]
    | null
    | undefined,
): DecisionRecipient | null {
  const snapshot = toOne(value);
  const lead = toOne(snapshot?.decision_lead);
  if (!snapshot?.decision_lead_id || !lead?.id) return null;
  if (lead.id !== snapshot.decision_lead_id) return null;
  return {
    userId: snapshot.decision_lead_id,
    email: lead.email ?? null,
    name: lead.full_name ?? null,
  };
}
