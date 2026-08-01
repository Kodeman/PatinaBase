/**
 * Closure derivation (Track 7 · R80) — the pure logic behind the Care band's
 * "Close the book": the closure checklist vocabulary (ported from the legacy
 * /portal/projects/[id]/complete page, minus its hardcoded fixture dates), the
 * all-complete gate, and the portfolio-snapshot seeding math. Review outreach
 * is deliberately post-close work; the checklist never asks a designer to
 * attest that a request was sent before the request UI becomes available.
 *
 * Everything here is presentation-free so the band stays testable; the write
 * itself is one transaction (close_project, 00238).
 */

export interface ClosureItem {
  key: string;
  label: string;
  completed: boolean;
}

/** The legacy checklist vocabulary, keys preserved (types/project-ui
 *  ClosureItem used the same keys). All items start unchecked — the fixture
 *  dates the old page shipped were demo furniture, not data. */
export const CLOSURE_ITEM_DEFS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'walkthrough', label: 'Final walkthrough completed with client' },
  { key: 'punch_list', label: 'All punch list items resolved' },
  { key: 'payment', label: 'Final payment collected' },
  { key: 'photography', label: 'Professional photography scheduled' },
  { key: 'photos', label: 'Final project photos on file (for portfolio)' },
  { key: 'case_study', label: 'Project case study written for portfolio' },
];

export function defaultClosureItems(): ClosureItem[] {
  return CLOSURE_ITEM_DEFS.map((d) => ({ ...d, completed: false }));
}

export function toggleClosureItem(items: ClosureItem[], key: string): ClosureItem[] {
  return items.map((i) => (i.key === key ? { ...i, completed: !i.completed } : i));
}

/** The gate on "Close the book" — every line ticked (legacy allComplete). */
export function allClosureComplete(items: ClosureItem[]): boolean {
  return items.length > 0 && items.every((i) => i.completed);
}

// ── Operational closeout truth ─────────────────────────────────────────────

export type CloseoutBlockerCode =
  | 'operational_data_unavailable'
  | 'phase_unfinished'
  | 'coordination_unresolved'
  | 'scope_change_unresolved'
  | 'ffe_not_installed'
  | 'ffe_not_paid'
  | 'milestone_unpaid'
  | 'invoice_balance_due'
  | 'project_balance_due';

export interface CloseoutBlocker {
  code: CloseoutBlockerCode;
  count: number;
  label: string;
}

export interface CloseoutReadiness {
  ready: boolean;
  blockers: CloseoutBlocker[];
}

export interface CloseoutReadinessInput {
  /** Fail closed while any operational read is pending or failed. */
  dataReady?: boolean;
  /** Positive contracted value must be backed by collected invoice payments. */
  projectTotalCents?: number | null;
  projectPhases?: ReadonlyArray<{
    id: string;
    status: string | null;
  }>;
  coordinationItems?: ReadonlyArray<{
    id: string;
    status: string | null;
  }>;
  scopeChanges?: ReadonlyArray<{
    id: string;
    status: string | null;
    applied_at?: string | null;
  }>;
  ffeItems: ReadonlyArray<{
    id: string;
    status: string | null;
    quantity?: number | null;
    unit_price_cents?: number | null;
    line_total_cents?: number | null;
  }>;
  ffeCoverage: Record<
    string,
    {
      coverage: 'uninvoiced' | 'invoiced' | 'paid' | string;
      billedCents?: number | null;
    }
  >;
  paymentMilestones: ReadonlyArray<{
    id: string;
    status: string | null;
    amount_cents: number | null;
  }>;
  invoices: ReadonlyArray<{
    id: string;
    status: string | null;
    total_cents: number | null;
    amount_paid_cents: number | null;
  }>;
}

const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/**
 * Operational truth behind the Care checklist. Empty FF&E/milestone/invoice
 * sets are valid (a consulting-only project may have no procurement or billable
 * milestone rows). Once an operational row exists, completion means:
 *
 *   - every FF&E line is installed;
 *   - every positive-value FF&E line is covered for its canonical sell value
 *     by a fully-paid live invoice (zero/unpriced installed lines need none);
 *   - every positive-value payment milestone is paid; and
 *   - every non-void invoice has no remaining positive balance; and
 *   - a positive project contract total has been collected across invoices.
 *
 * The server RPC enforces the same predicates atomically; this derivation makes
 * them visible before submit and never turns a user-authored checkbox into
 * financial truth.
 */
export function deriveCloseoutReadiness(
  input: CloseoutReadinessInput,
): CloseoutReadiness {
  if (input.dataReady === false) {
    return {
      ready: false,
      blockers: [
        {
          code: 'operational_data_unavailable',
          count: 1,
          label: 'Operational status is still loading — closeout stays locked',
        },
      ],
    };
  }

  const blockers: CloseoutBlocker[] = [];

  // The database uses one terminal phase state: completed. A delayed phase is
  // paused work, and a pending phase is still promised work, so neither may be
  // erased by project closeout.
  const unfinishedPhases = (input.projectPhases ?? []).filter(
    (phase) => phase.status !== 'completed',
  ).length;
  if (unfinishedPhases > 0) {
    blockers.push({
      code: 'phase_unfinished',
      count: unfinishedPhases,
      label: `${countLabel(unfinishedPhases, 'project phase')} not completed`,
    });
  }

  // responded and expired are the two terminal client_decisions states.
  // Draft and pending rows still have a live hand to resolve before closeout.
  const unresolvedCoordination = (input.coordinationItems ?? []).filter(
    (item) => item.status !== 'responded' && item.status !== 'expired',
  ).length;
  if (unresolvedCoordination > 0) {
    blockers.push({
      code: 'coordination_unresolved',
      count: unresolvedCoordination,
      label: `${countLabel(unresolvedCoordination, 'coordination item')} unresolved`,
    });
  }

  // A declined/cancelled amendment is terminal; an approved amendment remains
  // live until apply_scope_change stamps applied_at.
  const unresolvedScopeChanges = (input.scopeChanges ?? []).filter(
    (change) =>
      change.status !== 'declined' && change.status !== 'cancelled' && change.applied_at == null,
  ).length;
  if (unresolvedScopeChanges > 0) {
    blockers.push({
      code: 'scope_change_unresolved',
      count: unresolvedScopeChanges,
      label: `${countLabel(unresolvedScopeChanges, 'scope change')} unresolved`,
    });
  }

  const notInstalled = input.ffeItems.filter(
    (item) => item.status !== 'installed',
  ).length;
  if (notInstalled > 0) {
    blockers.push({
      code: 'ffe_not_installed',
      count: notInstalled,
      label: `${countLabel(notInstalled, 'FF&E item')} not installed`,
    });
  }

  const notPaid = input.ffeItems.filter((item) => {
    // `line_total_cents` is the canonical sell value once present. Older/
    // partially-composed rows fall back to quantity × unit price. A real zero
    // or unpriced installed item is operational work, but not a receivable.
    const expectedSellCents = Math.max(
      0,
      item.line_total_cents ??
        (item.quantity ?? 0) * (item.unit_price_cents ?? 0),
    );
    if (expectedSellCents === 0) return false;

    const coverage = input.ffeCoverage[item.id];
    return (
      coverage?.coverage !== 'paid' ||
      (coverage.billedCents ?? 0) < expectedSellCents
    );
  }).length;
  if (notPaid > 0) {
    blockers.push({
      code: 'ffe_not_paid',
      count: notPaid,
      label: `${countLabel(notPaid, 'FF&E item')} not fully paid`,
    });
  }

  const unpaidMilestones = input.paymentMilestones.filter(
    (milestone) =>
      (milestone.amount_cents ?? 0) > 0 && milestone.status !== 'paid',
  ).length;
  if (unpaidMilestones > 0) {
    blockers.push({
      code: 'milestone_unpaid',
      count: unpaidMilestones,
      label: `${countLabel(unpaidMilestones, 'payment milestone')} not paid`,
    });
  }

  const invoicesWithBalance = input.invoices.filter(
    (invoice) =>
      invoice.status !== 'void' &&
      (invoice.total_cents ?? 0) > (invoice.amount_paid_cents ?? 0),
  ).length;
  if (invoicesWithBalance > 0) {
    blockers.push({
      code: 'invoice_balance_due',
      count: invoicesWithBalance,
      label: `${countLabel(invoicesWithBalance, 'invoice')} with a balance due`,
    });
  }

  const projectTotalCents = input.projectTotalCents ?? 0;
  const collectedCents = input.invoices
    .filter((invoice) => invoice.status !== 'void')
    .reduce(
      (sum, invoice) =>
        sum +
        Math.min(
          Math.max(0, invoice.total_cents ?? 0),
          Math.max(0, invoice.amount_paid_cents ?? 0),
        ),
      0,
    );
  if (projectTotalCents > collectedCents) {
    blockers.push({
      code: 'project_balance_due',
      count: projectTotalCents - collectedCents,
      label: 'The project contract balance has not been fully collected',
    });
  }

  return { ready: blockers.length === 0, blockers };
}

export function closureReady(
  items: ClosureItem[],
  operational: CloseoutReadiness,
): boolean {
  return allClosureComplete(items) && operational.ready;
}

// ── Portfolio snapshot ───────────────────────────────────────────────────────

export interface PortfolioSnapshot {
  headline: string;
  description: string;
  /** Project value in cents (seeded from the project's money columns). */
  value_cents: number | null;
  duration: string;
  rooms: string;
}

/** Dollars-in, cents-out ('' / junk → null). Shared by the money fields on
 *  the OpenProjectSheet, the vitals band, and the snapshot form. */
export function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '').trim();
  if (cleaned === '') return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

export function centsToDollarString(cents: number | null | undefined): string {
  if (cents == null) return '';
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

/** "5 months" from the project's start date to its close (today when still
 *  open). Weeks under two months; never claims what the dates can't. */
export function durationLabel(
  startDate: string | null | undefined,
  endDate?: string | null,
): string {
  if (!startDate) return '';
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  const days = Math.round((end - start) / 86_400_000);
  if (days < 60) {
    const weeks = Math.max(1, Math.round(days / 7));
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  const months = Math.round(days / 30.44);
  return `${months} month${months === 1 ? '' : 's'}`;
}

/** Seed the snapshot from the project row: value from the contract total
 *  (falling back per the post-00139 money convention), duration from the real
 *  dates, rooms left to the designer's words. */
export function seedSnapshot(project: {
  total_amount_cents?: number | null;
  budget_cents?: number | null;
  start_date?: string | null;
  completed_at?: string | null;
}): PortfolioSnapshot {
  return {
    headline: '',
    description: '',
    value_cents: project.total_amount_cents ?? project.budget_cents ?? null,
    duration: durationLabel(project.start_date, project.completed_at ?? null),
    rooms: '',
  };
}
