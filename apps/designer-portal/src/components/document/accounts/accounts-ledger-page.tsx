'use client';

/**
 * The Accounts book · Ledger (R36, R74): every invoice in the studio's book,
 * newest first — draft / sent / partially-paid / paid / void — narrated as
 * paper rows, not a dashboard. The old Billing list, re-housed.
 *
 * R74 made the book WRITE: rows are folio-first (the row opens the Invoice
 * folio, where issue/send/record/void/print live), with a quiet doorway to
 * the document kept on the tail; the page head carries "Draw an invoice"
 * (the R74b composer).
 */

import type { Invoice } from '@patina/supabase';
import { Stamp } from '../stamp';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import { openInvoiceComposer, openInvoiceFolio } from './invoice-overlays';

// Laid-paper palette (R96) — matches the Invoice folio's re-inked stamps
// (accounts/invoice-folio.tsx FOLIO_STAMP), so the same invoice reads the
// same ink whichever surface shows it.
const INVOICE_STAMP: Record<string, { label: string; color: string; ink?: string }> = {
  draft: { label: 'draft', color: '#C9C2B6', ink: 'var(--text-muted)' },
  sent: { label: 'sent', color: 'var(--color-dusty-blue)', ink: '#7E8FA6' },
  partially_paid: { label: 'part paid', color: 'var(--color-golden-hour)', ink: '#B89A2E' },
  paid: { label: 'paid', color: 'var(--color-sage)', ink: '#85947C' },
  void: { label: 'void', color: 'var(--color-terracotta)', ink: '#C4836F' },
};

export function AccountsLedgerPage({
  invoices,
  onOpenDocument,
}: {
  invoices: Invoice[];
  onOpenDocument: (projectId: string | null) => void;
}) {
  return (
    <div>
      {/* R74b — the book learns to write: draw an invoice from the page head. */}
      <div className="mb-2 flex items-baseline justify-end">
        <button
          type="button"
          onClick={() => openInvoiceComposer()}
          className="whitespace-nowrap rounded-[4px] border border-[rgba(196,165,123,0.4)] px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-clay)] hover:text-white"
        >
          Draw an invoice →
        </button>
      </div>

      {invoices.length === 0 ? (
        <p className="py-5 font-heading text-[13px] italic text-[var(--color-aged-oak)]">
          No invoices yet — the book opens when the first one is drawn.
        </p>
      ) : (
        <InvoiceRows invoices={invoices} onOpenDocument={onOpenDocument} />
      )}
    </div>
  );
}

function InvoiceRows({
  invoices,
  onOpenDocument,
}: {
  invoices: Invoice[];
  onOpenDocument: (projectId: string | null) => void;
}) {
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
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[var(--color-pearl)] px-1 py-2.5"
          >
            {/* Folio-first (R74): the row opens the Invoice folio — the acts
                live there. The document doorway stays on the tail. */}
            <button
              type="button"
              onClick={() => openInvoiceFolio(inv.id)}
              className="min-w-0 rounded-[3px] text-left hover:bg-[rgba(196,165,123,0.06)]"
            >
              <p className="truncate text-[12.5px] font-medium text-[var(--color-charcoal)]">
                {inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Draft invoice'}
                <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
                  folio →
                </span>
              </p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                {[
                  inv.project?.name ?? 'Project',
                  fmtUsd(inv.total_cents),
                  inv.due_date ? `due ${fmtDay(inv.due_date)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </button>
            <span className="whitespace-nowrap font-mono text-[10px] text-[var(--color-mocha)]">
              {tail}
            </span>
            <Stamp label={stamp.label} color={stamp.color} ink={stamp.ink} />
            <button
              type="button"
              onClick={() => onOpenDocument(inv.project_id)}
              className="whitespace-nowrap text-[10.5px] text-[var(--color-clay)] hover:underline"
            >
              document ↗
            </button>
          </li>
        );
      })}
    </ul>
  );
}
