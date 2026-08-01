export interface ProposalPaymentMilestoneLike {
  id?: string;
  label: string;
  percentage: number;
  amount_cents: number;
  trigger_condition?: string | null;
}

export type ProposalPaymentScheduleIssueCode =
  | 'missing_schedule'
  | 'non_positive_total'
  | 'allocation_not_100'
  | 'missing_label'
  | 'non_positive_milestone'
  | 'amount_total_mismatch';

export interface ProposalPaymentScheduleIssue {
  code: ProposalPaymentScheduleIssueCode;
  message: string;
  milestoneId?: string;
}

export interface ProposalPaymentScheduleAssessment<
  T extends ProposalPaymentMilestoneLike,
> {
  milestones: Array<T & { percentage: number; amount_cents: number }>;
  percentageTotal: number;
  amountTotal: number;
  storedAmountsMatch: boolean;
  safeToSend: boolean;
  issues: ProposalPaymentScheduleIssue[];
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isFullyAllocated(percentageTotal: number): boolean {
  return Math.abs(percentageTotal - 100) < 0.000_001;
}

/**
 * The percentage allocation and the current proposal total are the canonical
 * payment terms. `amount_cents` is a persisted projection for downstream
 * readers, so never trust an older positive amount after the proposal total
 * changes. The final positive milestone absorbs any integer-rounding penny so
 * a valid 100% schedule adds up to the exact amount the client signs.
 */
export function canonicalizeProposalPaymentSchedule<
  T extends ProposalPaymentMilestoneLike,
>(milestones: readonly T[], totalCents: number) {
  const canonicalTotal = Math.max(0, Math.round(finiteNumber(totalCents)));
  const canonical = milestones.map((milestone) => {
    const percentage = finiteNumber(milestone.percentage);
    return {
      ...milestone,
      percentage,
      amount_cents: Math.round((canonicalTotal * percentage) / 100),
    };
  });

  const percentageTotal = canonical.reduce(
    (sum, milestone) => sum + milestone.percentage,
    0,
  );

  if (isFullyAllocated(percentageTotal) && canonical.length > 0) {
    const projectedTotal = canonical.reduce(
      (sum, milestone) => sum + milestone.amount_cents,
      0,
    );
    const roundingDelta = canonicalTotal - projectedTotal;
    let lastPositiveIndex = -1;
    for (let index = canonical.length - 1; index >= 0; index -= 1) {
      if (canonical[index].percentage > 0) {
        lastPositiveIndex = index;
        break;
      }
    }
    if (roundingDelta !== 0 && lastPositiveIndex >= 0) {
      canonical[lastPositiveIndex] = {
        ...canonical[lastPositiveIndex],
        amount_cents: canonical[lastPositiveIndex].amount_cents + roundingDelta,
      };
    }
  }

  return canonical;
}

/**
 * Validates the exact schedule shape the client copy consumes. This is shared
 * by the live mirror and the send mutation preflight so editor readiness and
 * the payload that is actually sent cannot use different rules.
 */
export function assessProposalPaymentSchedule<
  T extends ProposalPaymentMilestoneLike,
>(
  milestones: readonly T[],
  totalCents: number,
): ProposalPaymentScheduleAssessment<T> {
  const canonicalTotal = Math.max(0, Math.round(finiteNumber(totalCents)));
  const canonical = canonicalizeProposalPaymentSchedule(
    milestones,
    canonicalTotal,
  );
  const percentageTotal = canonical.reduce(
    (sum, milestone) => sum + milestone.percentage,
    0,
  );
  const amountTotal = canonical.reduce(
    (sum, milestone) => sum + milestone.amount_cents,
    0,
  );
  const issues: ProposalPaymentScheduleIssue[] = [];

  if (canonicalTotal <= 0) {
    issues.push({
      code: 'non_positive_total',
      message: 'The client-facing proposal total must be greater than $0.',
    });
  }

  if (canonical.length === 0) {
    issues.push({
      code: 'missing_schedule',
      message: 'Add a payment schedule before sending.',
    });
  }

  if (!isFullyAllocated(percentageTotal)) {
    issues.push({
      code: 'allocation_not_100',
      message: `Payment milestones currently allocate ${percentageTotal}%; they must total 100%.`,
    });
  }

  for (const milestone of canonical) {
    if (!milestone.label.trim()) {
      issues.push({
        code: 'missing_label',
        message: 'Every payment milestone needs a client-facing label.',
        milestoneId: milestone.id,
      });
    }
    if (milestone.percentage <= 0 || milestone.amount_cents <= 0) {
      issues.push({
        code: 'non_positive_milestone',
        message: `${milestone.label.trim() || 'A payment milestone'} must be greater than 0% and $0.`,
        milestoneId: milestone.id,
      });
    }
  }

  if (
    canonicalTotal > 0 &&
    isFullyAllocated(percentageTotal) &&
    amountTotal !== canonicalTotal
  ) {
    issues.push({
      code: 'amount_total_mismatch',
      message:
        'The client-facing payment amounts do not match the proposal total.',
    });
  }

  const storedAmountsMatch = canonical.every(
    (milestone, index) =>
      finiteNumber(milestones[index]?.amount_cents) === milestone.amount_cents,
  );

  return {
    milestones: canonical,
    percentageTotal,
    amountTotal,
    storedAmountsMatch,
    safeToSend: issues.length === 0,
    issues,
  };
}
