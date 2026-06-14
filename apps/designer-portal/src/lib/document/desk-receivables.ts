/**
 * Desk receivables inputs (R36 / R22): the Accounts book's aging, promoted.
 *
 * The same Wave 2.1 client-side precedent as desk-conflicts.ts — the Desk hook
 * reads invoices alongside document_state and classifies the overdue ones here,
 * keyed by project_id. An overdue + unchased receivable becomes the folder's
 * need line (deriveNeed); the act ("send the reminder") lives on the Accounts
 * book's Receivables page, so the folder opens that ledger.
 *
 * The R22 awareness tier: a receivable past due needs the designer's hand
 * (act: chase) until she chases it, after which the only available act is over.
 * So the signal gates on overdue AND not chased within AR_CHASE_COOLDOWN_DAYS —
 * chasing stamps ar_last_chased_at (00209), and the need clears on the next read.
 *
 * Pure presentation logic; no money figure is authored here — balances come
 * straight off the invoice rows (total_cents − amount_paid_cents).
 */

import type { Invoice } from '@patina/supabase';
import {
  AR_OVERDUE_NEEDS_DAYS,
  AR_CHASE_COOLDOWN_DAYS,
  type ReceivableSignal,
} from './desk-derivation';

const DAY_MS = 86_400_000;

/** Whole days past due (UTC-pinned bare-DATE math; <= 0 means not yet due). */
function daysOverdue(dueDate: string, now: Date): number {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(due)) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - due) / DAY_MS);
}

function balanceCents(inv: Invoice): number {
  return Math.max((inv.total_cents || 0) - (inv.amount_paid_cents || 0), 0);
}

/** An open invoice is a live receivable. */
function isOpen(inv: Invoice): boolean {
  return (inv.status === 'sent' || inv.status === 'partially_paid') && inv.due_date != null;
}

/** Chased within the cooldown → the act is spent; it shouldn't re-rise yet. */
function recentlyChased(inv: Invoice, now: Date): boolean {
  if (!inv.ar_last_chased_at) return false;
  const since = now.getTime() - Date.parse(inv.ar_last_chased_at);
  return since < AR_CHASE_COOLDOWN_DAYS * DAY_MS;
}

/** Per-project Desk receivables from the designer's invoice list. */
export function buildDeskReceivables(
  invoices: Invoice[],
  now: Date,
): Map<string, ReceivableSignal> {
  // The overdue + unchased receivables, oldest-due first.
  const overdue = invoices
    .filter(
      (inv) =>
        isOpen(inv) &&
        daysOverdue(inv.due_date!, now) >= AR_OVERDUE_NEEDS_DAYS &&
        !recentlyChased(inv, now),
    )
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0));

  const byProject = new Map<string, Invoice[]>();
  for (const inv of overdue) {
    const list = byProject.get(inv.project_id) ?? [];
    list.push(inv);
    byProject.set(inv.project_id, list);
  }

  const map = new Map<string, ReceivableSignal>();
  for (const [projectId, list] of byProject) {
    // list is already oldest-due-first → the first is the act's target.
    const oldest = list[0];
    map.set(projectId, {
      count: list.length,
      oldestDue: oldest.due_date ?? null,
      totalBalanceCents: list.reduce((s, inv) => s + balanceCents(inv), 0),
      invoiceId: oldest.id,
      invoiceLabel: oldest.invoice_number ? `Invoice ${oldest.invoice_number}` : 'A draft invoice',
    });
  }

  return map;
}
