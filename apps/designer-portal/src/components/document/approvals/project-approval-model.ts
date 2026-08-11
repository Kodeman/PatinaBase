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

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * R2 · IMPACT — the deltas, signed, and explicitly unchanged when zero. A zero
 * delta is stored evidence, so it is stated rather than omitted.
 */
export function formatGateImpact(review: {
  costCentsDelta: number;
  scheduleDaysDelta: number;
  leadTimeDaysDelta: number;
}): string {
  const signed = (value: number) => (value > 0 ? '+' : '-');
  const cost =
    review.costCentsDelta === 0
      ? 'cost unchanged'
      : `${signed(review.costCentsDelta)}${USD.format(
          Math.abs(review.costCentsDelta) / 100,
        )}`;
  const schedule =
    review.scheduleDaysDelta === 0
      ? 'schedule unchanged'
      : `${signed(review.scheduleDaysDelta)}${Math.abs(
          review.scheduleDaysDelta,
        )} day${Math.abs(review.scheduleDaysDelta) === 1 ? '' : 's'}`;
  const leadTime =
    review.leadTimeDaysDelta === 0
      ? 'lead time unchanged'
      : `${signed(review.leadTimeDaysDelta)}${Math.abs(
          review.leadTimeDaysDelta,
        )} lead-time day${
          Math.abs(review.leadTimeDaysDelta) === 1 ? '' : 's'
        }`;

  return `${cost} · ${schedule} · ${leadTime}`;
}

export interface GateScope {
  /** What the record structurally binds — never inferred. */
  binding: string;
  /** The author's stated qualification, verbatim, when one was written. */
  note: string | null;
}

/**
 * R2 · SCOPE — rendered from the decision's structured binding rather than a
 * new column. One decision binds exactly one project phase, so the phase is
 * the honest statement of what the gate releases; the free-text note carries
 * the author's qualification when they wrote one.
 */
export function gateScope(
  review: { context: string | null },
  boundPhaseName: string | null,
): GateScope {
  const note = review.context?.trim();
  return {
    binding: boundPhaseName
      ? `Bound to ${boundPhaseName}. No other phase is bound to this decision.`
      : 'Bound to the recorded project phase. No other phase is bound to this decision.',
    note: note ? note : null,
  };
}

export function newApprovalIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
