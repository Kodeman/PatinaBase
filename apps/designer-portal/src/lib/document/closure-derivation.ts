/**
 * Closure derivation (Track 7 · R80) — the pure logic behind the Care band's
 * "Close the book": the closure checklist vocabulary (ported from the legacy
 * /portal/projects/[id]/complete page, minus its hardcoded fixture dates), the
 * all-complete gate, and the portfolio-snapshot seeding math.
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
  { key: 'review', label: 'Client review request sent' },
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
  ffeItems: ReadonlyArray<{ id: string; status: string | null }>;
  ffeCoverage: Record<
    string,
    { coverage: 'uninvoiced' | 'invoiced' | 'paid' | string }
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
 *   - every FF&E line's live invoice is fully paid (issued is not collected);
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

  const notPaid = input.ffeItems.filter(
    (item) => input.ffeCoverage[item.id]?.coverage !== 'paid',
  ).length;
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
