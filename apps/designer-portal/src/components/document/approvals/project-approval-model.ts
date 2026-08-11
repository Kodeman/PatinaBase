import type {
  ProjectApprovalArtifactCandidate,
  ProjectApprovalReview,
} from '@patina/supabase';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

export function parseSignedDelta(value: string, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a whole signed number`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is outside the supported range`);
  }
  if (parsed < INT32_MIN || parsed > INT32_MAX) {
    throw new Error(`${label} must fit a signed 32-bit integer`);
  }
  return parsed;
}

export function toFutureDueAt(value: string, now = new Date()): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) {
    throw new Error('Due date must be in the future');
  }
  return new Date(timestamp).toISOString();
}

export function projectApprovalActions(
  review: ProjectApprovalReview,
  { boundPhaseCompleted = false }: { boundPhaseCompleted?: boolean } = {},
) {
  const leaf =
    review.disposition === 'active' && review.successorDecisionId === null;
  return {
    publish:
      leaf &&
      review.lifecycleStatus === 'draft' &&
      review.requiredReviewCount > 0 &&
      review.completedReviewCount >= review.requiredReviewCount,
    withdraw:
      leaf &&
      (review.lifecycleStatus === 'draft' ||
        review.lifecycleStatus === 'pending'),
    supersede:
      leaf &&
      !boundPhaseCompleted &&
      (review.lifecycleStatus === 'pending' ||
        review.lifecycleStatus === 'responded'),
  };
}

export function eligibleSupersessionCandidates(
  review: ProjectApprovalReview,
  candidates: readonly ProjectApprovalArtifactCandidate[],
) {
  return candidates.filter(
    (candidate) =>
      (candidate.artifactKind !== review.artifactKind ||
        candidate.artifactId !== review.artifactId) &&
      candidate.artifactChecksum !== review.artifactChecksum,
  );
}

export function newApprovalIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
