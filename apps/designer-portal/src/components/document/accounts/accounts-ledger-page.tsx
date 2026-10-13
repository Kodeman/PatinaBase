'use client';

/**
 * The Accounts book · Ledger (R36, R74): every invoice in the studio's book,
 * what is owed first — draft / sent / partially-paid / paid / void — narrated as
 * paper rows, not a dashboard. The old Billing list, re-housed.
 *
 * R74 made the book WRITE: rows are folio-first (the row opens the Invoice
 * folio, where issue/send/record/void/print live), with a quiet doorway to
 * the document kept on the row; the page head carries "Draw an invoice"
 * (the R74b composer).
 *
 * US-28 S8: the register is one Section of Ledger rows closing on its rule.
 * State is an ink word (U-Q13), invoices are never Cards, and nothing
 * truncates — a long line wraps at 390.
 *
 * SQ-858 (money-p1): "Who owes us what?" — the register reads what is owed
 * first (see `owedFirst`), and every figure prints to the cent.
 */

import { useEffect, useRef } from 'react';
import {
  invoiceDaysOverdue,
  useEmailDelivery,
  type EmailDelivery,
  type Invoice,
} from '@patina/supabase';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { DeliveryWord } from '../delivery-word';
import { EmptyState } from '../empty-state';
import { formatCurrency } from '@patina/shared';
import { fmtDay } from '@/lib/document/format';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import { AccountsExportAction } from './accounts-export';
import { openInvoiceComposer, openInvoiceFolio } from './invoice-overlays';
import { InvoiceStateWord } from './money-state-word';

export function AccountsLedgerPage({
  invoices,
  highlightInvoiceId = null,
  canExport = false,
  onOpenDocument,
  onOpenFolio = openInvoiceFolio,
}: {
  invoices: Invoice[];
  /** Q10 (walk W-D5) — the studio-wide export is an owner's or admin's. */
  canExport?: boolean;
  /** The invoice named by the /desk?book=accounts&page=ledger&invoiceId=…
   *  doorway (desk-doorway.tsx) — e.g. the print page's "Back to invoice". */
  highlightInvoiceId?: string | null;
  onOpenDocument: (projectId: string | null) => void;
  /** U-Q16 — the Accounts book opens the folio in place, inside its own
   *  sheet; without a host, the folio opens as its own sheet. */
  onOpenFolio?: (invoiceId: string) => void;
}) {
  // One read for the whole ledger — a per-row hook would open N queries.
  const emailDelivery = useEmailDelivery(
    'invoice',
    invoices.filter((inv) => inv.status !== 'draft').map((inv) => inv.id),
  );

  // Arriving by that doorway lands on the ledger; the invoice it names is the
  // one the reader asked for, so open its folio rather than making them find
  // the row again. Waits until the invoice is actually in the loaded list (the
  // first render has none), and fires once per id so closing the folio — or
  // any later re-render — does not reopen it.
  const openedFolioFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightInvoiceId || openedFolioFor.current === highlightInvoiceId) return;
    if (!invoices.some((inv) => inv.id === highlightInvoiceId)) return;
    openedFolioFor.current = highlightInvoiceId;
    onOpenFolio(highlightInvoiceId);
  }, [highlightInvoiceId, invoices, onOpenFolio]);

  return (
    <div>
      {/* R74b — the book learns to write: draw an invoice from the page head.
          A ledger holds no filled act (U-Q3), so it is the secondary ＋. */}
      <DocumentActionGroup surfaceKey="accounts" regionKey="ledger-head" className="money-front-acts">
        <DocumentAction
          actionKey="draw-invoice"
          variant="secondary"
          leading={<span className="money-plus">＋</span>}
          onClick={() => openInvoiceComposer()}
        >
          Draw an invoice
        </DocumentAction>
      </DocumentActionGroup>

      {/* P3 — and the book learns to LEAVE: the studio's own billing register
          as one spreadsheet, so "your data exports" is a fact. */}
      {canExport && <AccountsExportAction />}

      {invoices.length === 0 ? (
        /* The zero-invoice state (help-desk Wave 1, copy §E.3), as the one
           empty state: the Section's eyebrow, one sentence, its close. */
        <EmptyState eyebrow="Invoices">
          No invoices drawn yet. Draw from a milestone, tracked time, FF&amp;E or
          an ad-hoc line and it appears here; paid and overdue both show here.
        </EmptyState>
      ) : (
        <InvoiceRows
          invoices={invoices}
          deliveryByRef={emailDelivery.byRef}
          onOpenDocument={onOpenDocument}
          onOpenFolio={onOpenFolio}
        />
      )}
    </div>
  );
}

/** An open receivable: issued, with money still owed on it. */
const owedNowOf = (inv: Invoice) =>
  (inv.status === 'sent' || inv.status === 'partially_paid') && invoiceBalanceCents(inv) > 0;

/** money-p1's order: overdue, then owed and not yet due, then drafts, then
 *  paid, then void. Within each, the book's own order (newest first) holds. */
function owedRank(inv: Invoice) {
  if (owedNowOf(inv)) return invoiceDaysOverdue(inv) > 0 ? 0 : 1;
  if (inv.status === 'draft') return 2;
  if (inv.status === 'void') return 4;
  return 3;
}

export const owedFirst = (invoices: readonly Invoice[]) =>
  invoices
    .map((inv, at) => ({ inv, at, rank: owedRank(inv) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map(({ inv }) => inv);

function InvoiceRows({
  invoices,
  deliveryByRef,
  onOpenDocument,
  onOpenFolio,
}: {
  invoices: Invoice[];
  deliveryByRef: Record<string, EmailDelivery>;
  onOpenDocument: (projectId: string | null) => void;
  onOpenFolio: (invoiceId: string) => void;
}) {
  return (
    <section className="section ledger money-register" aria-labelledby="accounts-ledger-rows">
      <div className="sec-head">
        <p className="eb" id="accounts-ledger-rows">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>Invoices · what is owed first</span>
        </p>
      </div>
      <ul className="rows">
        {owedFirst(invoices).map((inv) => {
          const balance = invoiceBalanceCents(inv);
          // "Owed" only reads true for an issued receivable — a draft isn't
          // owed yet (it's not been sent), so it says nothing more.
          const owedNow = inv.status === 'sent' || inv.status === 'partially_paid';
          const overdueDays = owedNow && balance > 0 ? Math.max(invoiceDaysOverdue(inv), 0) : 0;
          // R136 — a studio invoice has no house, so no doorway to walk through.
          const studioInvoice = inv.project_id === null;
          const clause =
            inv.status === 'paid'
              ? inv.paid_at
                ? fmtDay(inv.paid_at)
                : null
              : owedNow && balance > 0
                ? [
                    balance !== inv.total_cents ? `${formatCurrency(balance, inv.currency)} owed` : null,
                    inv.due_date && overdueDays === 0 ? `due ${fmtDay(inv.due_date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || null
                : null;
          return (
            <li key={inv.id} className="lrow plain" data-invoice-row={inv.id}>
              {/* Folio-first (R74): the row's name opens the Invoice folio —
                  the acts live there. */}
              <div className="lname">
                <button
                  type="button"
                  onClick={() => onOpenFolio(inv.id)}
                  className="name t-d4"
                  data-invoice-folio-opener={inv.id}
                >
                  {inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Draft invoice'}
                </button>
              </div>
              <span className="lsent t-body-sm">
                <span className="money-job">{inv.project?.name ?? inv.title ?? 'Studio'}</span>
                {studioInvoice && (
                  <>
                    {' '}
                    <span className="word word--quiet">studio</span>
                  </>
                )}
                {inv.due_date && inv.status === 'draft' ? ` · due ${fmtDay(inv.due_date)}` : null}
                <DeliveryWord
                  delivery={deliveryByRef[inv.id] ?? null}
                  recipient={inv.client?.email}
                  mode="attention"
                  className="block"
                />
                {!studioInvoice && (
                  <span className="money-row-act">
                    <DocumentAction
                      actionKey="open-invoice-document"
                      surfaceKey="accounts"
                      regionKey="ledger-row"
                      variant="tertiary"
                      onClick={() => onOpenDocument(inv.project_id)}
                    >
                      document ↗
                    </DocumentAction>
                  </span>
                )}
              </span>
              <span className="lwhen">
                <InvoiceStateWord status={inv.status} overdueDays={overdueDays} />
                {clause && <span className="t-body-sm money-clause">{clause}</span>}
              </span>
              <span className="lfig">{formatCurrency(inv.total_cents, inv.currency)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
