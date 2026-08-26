/**
 * The money ladder — six rungs in dependency order, derived once and read
 * everywhere money is summarised:
 *
 *   Budget → Plan → Authorized → Moved → Owed → Not drawn
 *
 * Every rung's `cents` is null until its own source has answered. A rung that
 * states a number and later softens it is the same lie, briefly, so an
 * unsettled or failed read prints its state rather than a figure.
 *
 * `Moved` is the only rung that is not a restatement of a figure the product
 * already held: it is what has been ordered LESS what has actually been paid
 * out to makers (ruling 10), which is why it stops equalling `Authorized`.
 */

import type { Invoice, PurchaseOrder } from '@patina/supabase';
import { computeArAging, invoiceDaysOverdue } from '@patina/supabase';
import { money } from './project-commerce';
import {
  selectUndrawnVendorPayments,
  sumPaidVendorPayments,
} from './vendor-payouts';

export interface MoneyRung {
  /** The rung's figure, in cents. Null until its source answers. */
  cents: number | null;
  /** The words printed after the figure — or, with no figure, the honest state. */
  note: string;
  /** The rung's own word, for the one-line form the running index prints. */
  word: string;
}

export interface MoneyLadder {
  /** What the client has agreed to fund. */
  budget: MoneyRung;
  /** What the plan intends to spend. */
  plan: MoneyRung;
  /** What is contractually owed to makers. */
  authorized: MoneyRung;
  /** Authorized, less what has actually been paid out to makers. */
  moved: MoneyRung;
  /** The receivable — billed and not yet paid. */
  owed: MoneyRung;
  /** Deposits and holdbacks committed on a PO and not yet drawn. */
  notDrawn: MoneyRung;
}

/** Every source states whether it has answered and whether it failed. */
export interface MoneyLadderSource {
  settled: boolean;
  failed: boolean;
}

export interface MoneyLadderInput {
  /** `useProjectBillingAuthority` — the authority the client approved. */
  budget: MoneyLadderSource & { authorizedCents: number | null };
  /** `useWorkingBudget` — the draft version's own target lines. */
  plan: MoneyLadderSource & {
    versionNumber: number | null;
    lineCount: number;
    targetCents: number;
  };
  /** Executed instruments and trade scopes. */
  authorized: MoneyLadderSource & {
    executedCount: number;
    committedCents: number;
  };
  /** `usePurchaseOrders({ projectId })`, which nests `po_payments`. */
  purchaseOrders: MoneyLadderSource & { rows: readonly PurchaseOrder[] };
  /** `useProjectInvoices(projectId)`. */
  invoices: MoneyLadderSource & { rows: readonly Invoice[] };
}

const PENDING = '';
const UNREADABLE = 'could not be read';

function rung(word: string, cents: number | null, note: string): MoneyRung {
  return { cents, note, word };
}

/** Invoice statuses that represent money actually billed to the client. */
function isBilled(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'void';
}

function deriveBudget(input: MoneyLadderInput): MoneyRung {
  const { failed, settled, authorizedCents } = input.budget;
  if (failed) return rung('budget', null, UNREADABLE);
  if (!settled) return rung('budget', null, PENDING);
  if (authorizedCents == null) return rung('budget', null, 'nothing approved yet');
  return rung('budget', authorizedCents, 'approved');
}

function derivePlan(input: MoneyLadderInput): MoneyRung {
  const { failed, settled, versionNumber, lineCount, targetCents } = input.plan;
  if (failed) return rung('plan', null, UNREADABLE);
  if (!settled) return rung('plan', null, PENDING);
  if (versionNumber == null) return rung('plan', null, 'no working budget yet');
  // A version row is created before its lines are derived (00422's
  // derive_working_budget_draft), so a line-less version is a real state — and
  // summing nothing into "$0" would state a plan that does not exist.
  if (lineCount === 0) {
    return rung('plan', null, `working budget v${versionNumber} · no rooms yet`);
  }
  return rung('plan', targetCents, 'specified');
}

function deriveAuthorized(input: MoneyLadderInput): MoneyRung {
  const { failed, settled, executedCount, committedCents } = input.authorized;
  if (failed) return rung('authorized', null, UNREADABLE);
  if (!settled) return rung('authorized', null, PENDING);
  if (executedCount === 0) return rung('authorized', null, 'nothing executed yet');
  return rung('authorized', committedCents, 'ordered');
}

function deriveMoved(input: MoneyLadderInput): MoneyRung {
  const { authorized, purchaseOrders } = input;
  if (authorized.failed || purchaseOrders.failed) {
    return rung('moved', null, UNREADABLE);
  }
  if (!authorized.settled || !purchaseOrders.settled) {
    return rung('moved', null, PENDING);
  }
  const paidOutCents = sumPaidVendorPayments(purchaseOrders.rows);
  const orderedCents = authorized.executedCount === 0 ? 0 : authorized.committedCents;
  if (orderedCents === 0 && paidOutCents === 0) {
    return rung('moved', null, 'nothing in motion yet');
  }
  // A PO raised past its instrument's snapshot can be paid beyond what was
  // ordered; "in motion" never runs backwards.
  const movedCents = Math.max(orderedCents - paidOutCents, 0);
  return rung(
    'moved',
    movedCents,
    `in motion — ordered ${money(orderedCents)} less ${money(paidOutCents)} paid out`,
  );
}

function deriveOwed(input: MoneyLadderInput): MoneyRung {
  const { failed, settled, rows } = input.invoices;
  if (failed) return rung('owed', null, UNREADABLE);
  if (!settled) return rung('owed', null, PENDING);

  const aging = computeArAging([...rows]);
  const lead = aging.openInvoices[0];
  if (!lead) return rung('owed', null, 'nothing owed yet');

  const billedCents = rows
    .filter(isBilled)
    .reduce((sum, invoice) => sum + (invoice.total_cents || 0), 0);
  const days = invoiceDaysOverdue(lead);

  const parts: string[] = [];
  if (lead.invoice_number) {
    parts.push(days > 0 ? `Invoice ${lead.invoice_number}, ${days} days` : `Invoice ${lead.invoice_number}`);
  } else if (days > 0) {
    parts.push(`${days} days`);
  }
  parts.push(`${money(billedCents)} billed to date`);

  return rung('owed', aging.totalBalanceCents, `out · ${parts.join(' · ')}`);
}

function deriveNotDrawn(input: MoneyLadderInput): MoneyRung {
  const { failed, settled, rows } = input.purchaseOrders;
  if (failed) return rung('not drawn', null, UNREADABLE);
  if (!settled) return rung('not drawn', null, PENDING);

  const undrawn = selectUndrawnVendorPayments(rows);
  if (undrawn.cents === 0) return rung('not drawn', null, 'nothing standing undrawn');

  const detail = [undrawn.poNumber, undrawn.label].filter(Boolean).join(', ');
  const note = [undrawn.kind, detail].filter(Boolean).join(' · ');
  return rung('not drawn', undrawn.cents, note);
}

export function deriveMoneyLadder(input: MoneyLadderInput): MoneyLadder {
  return {
    budget: deriveBudget(input),
    plan: derivePlan(input),
    authorized: deriveAuthorized(input),
    moved: deriveMoved(input),
    owed: deriveOwed(input),
    notDrawn: deriveNotDrawn(input),
  };
}

/**
 * The one-line form the running index prints — `$17,500 owed`. Null when the
 * rung has no figure, so the index can fall through to another rung rather
 * than report an empty tier while money is moving.
 */
export function formatLadderRung(rung: MoneyRung): string | null {
  if (rung.cents == null) return null;
  return `${money(rung.cents)} ${rung.word}`;
}
