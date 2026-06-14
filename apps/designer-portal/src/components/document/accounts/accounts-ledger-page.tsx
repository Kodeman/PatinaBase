'use client';

/**
 * The Accounts book · Ledger (R36): every invoice in the studio's book, newest
 * first — draft / sent / partially-paid / paid / void — narrated as paper rows,
 * not a dashboard. The old Billing list, re-housed. One act per row: open the
 * document it belongs to (the leaf Account Page is where the invoice is made
 * and sent; the book only sums and points).
 */

import type { Invoice } from '@patina/supabase';
import { Stamp } from '../stamp';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { invoiceBalanceCents } from '@/lib/document/account-summary';

// Dark-sheet palette (the book renders on charcoal, like the Orders book).
const INVOICE_STAMP: Record<string, { label: string; color: string; ink?: string }> = {
  draft: { label: 'draft', color: 'var(--color-pearl)', ink: 'rgba(250,247,242,0.6)' },
  sent: { label: 'sent', color: 'var(--color-dusty-blue)' },
  partially_paid: { label: 'part paid', color: 'var(--color-golden-hour)', ink: '#D8BE56' },
  paid: { label: 'paid', color: 'var(--color-sage)' },
  void: { label: 'void', color: 'var(--color-terracotta)', ink: '#C4836F' },
};

export function AccountsLedgerPage({
  invoices,
  onOpenDocument,
}: {
  invoices: Invoice[];
  onOpenDocument: (projectId: string | null) => void;
}) {
  if (invoices.length === 0) {
    return (
      <p className="py-5 font-heading text-[13px] italic text-[rgba(250,247,242,0.5)]">
        No invoices yet — the book opens when the first one is drafted.
      </p>
    );
  }

  return (
    <ul>
      {invoices.map((inv) => {
        const stamp = INVOICE_STAMP[inv.status] ?? INVOICE_STAMP.draft;
        const balance = invoiceBalanceCents(inv);
        // "Owed" only reads true for an issued receivable — a draft isn't owed
        // yet (it's not been sent), so it shows nothing on the tail.
        const owedNow = inv.status === 'sent' || inv.status === 'partially_paid';
        const tail =
          inv.status === 'paid'
            ? inv.paid_at
              ? `paid ${fmtDay(inv.paid_at)}`
              : 'paid'
            : inv.status === 'void'
              ? 'void'
              : owedNow && balance > 0
                ? `${fmtUsd(balance)} owed`
                : '—';
        return (
          <li
            key={inv.id}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[rgba(250,247,242,0.08)] px-1 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-[var(--color-off-white)]">
                {inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Draft invoice'}
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[rgba(250,247,242,0.4)]">
                {[
                  inv.project?.name ?? 'Project',
                  fmtUsd(inv.total_cents),
                  inv.due_date ? `due ${fmtDay(inv.due_date)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className="whitespace-nowrap font-mono text-[10px] text-[rgba(250,247,242,0.55)]">
              {tail}
            </span>
            <Stamp label={stamp.label} color={stamp.color} ink={stamp.ink} />
            <button
              type="button"
              onClick={() => onOpenDocument(inv.project_id)}
              className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
            >
              open document →
            </button>
          </li>
        );
      })}
    </ul>
  );
}
