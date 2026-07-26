'use client';

/**
 * The Accounts book · Receivables (R36): A/R aging buckets plus the dunning act
 * the Billing zone carried — "send the reminder / chase". This is the act
 * surface for the Desk's overdue-invoice need line: an overdue receivable rises
 * on the Desk (deriveNeed), its folder opens this page, and chasing here clears
 * BOTH surfaces (one act). The chase emails the overdue notice
 * (useSendInvoice type:'reminder', which leaves the automated cadence untouched)
 * AND stamps ar_last_chased_at (useChaseInvoice, 00209) so the Desk need drops.
 *
 * A receivable within terms has no available act — it reads as an in-motion line
 * (R22), never a chase button.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChaseInvoice,
  useSendInvoice,
  invoiceDaysOverdue,
  type ArAging,
  type Invoice,
} from '@patina/supabase';
import { fmtDay, fmtUsd } from '@/lib/document/format';
import { invoiceBalanceCents } from '@/lib/document/account-summary';
import { DocumentAction } from '../document-action';
import { openInvoiceFolio } from './invoice-overlays';

export function AccountsReceivablesPage({
  aging,
  highlightInvoiceId,
  onOpenDocument,
}: {
  aging: ArAging;
  highlightInvoiceId: string | null;
  onOpenDocument: (projectId: string | null) => void;
}) {
  const { openInvoices, buckets, totalBalanceCents } = aging;

  if (openInvoices.length === 0) {
    return (
      <p className="py-5 font-heading text-[13px] italic text-[var(--color-aged-oak)]">
        Nothing outstanding — every sent invoice is settled.
      </p>
    );
  }

  return (
    <div>
      {/* Aging buckets — quiet mono pairs, never a chart. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-[var(--color-pearl)] pb-2.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)]">
          {fmtUsd(totalBalanceCents)} owed
        </span>
        {buckets
          .filter((b) => b.balanceCents > 0)
          .map((b) => (
            <span key={b.key} className="flex items-baseline gap-1.5">
              <span className="font-heading text-[14px] text-[var(--color-charcoal)]">
                {fmtUsd(b.balanceCents)}
              </span>
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                {b.label}
              </span>
            </span>
          ))}
      </div>

      <ul>
        {openInvoices.map((inv) => (
          <ReceivableRow
            key={inv.id}
            invoice={inv}
            highlight={inv.id === highlightInvoiceId}
            onOpenDocument={onOpenDocument}
          />
        ))}
      </ul>
    </div>
  );
}

function ReceivableRow({
  invoice,
  highlight,
  onOpenDocument,
}: {
  invoice: Invoice;
  highlight: boolean;
  onOpenDocument: (projectId: string | null) => void;
}) {
  // R83 — the chase renders its failure inline (the `note` under the row);
  // errorSurface:'inline' keeps the global mutation toast from duplicating it
  // (walk finding F2b).
  const send = useSendInvoice({ errorSurface: 'inline' });
  const chase = useChaseInvoice({ errorSurface: 'inline' });
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLLIElement>(null);

  // The Desk's act lands here pre-addressed — scroll the named row into view.
  useEffect(() => {
    if (highlight)
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight]);

  const days = invoiceDaysOverdue(invoice);
  const overdue = days > 0;
  const balance = invoiceBalanceCents(invoice);
  const busy = send.isPending || chase.isPending;
  const chasedAt = invoice.ar_last_chased_at;

  const doChase = async () => {
    setNote(null);
    try {
      // One act, two writes: the overdue-notice email + the chase timestamp the
      // Desk reads. Stamp the timestamp even if the email is suppressed (opted
      // out) — the designer DID chase; the Desk need should still clear.
      const result = await send.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
        type: 'reminder',
      });
      await chase.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
      });
      // The Desk reads invoices under its OWN key (['document-state','desk']),
      // not ['invoices'] — so clear that too, or the overdue-invoice need lingers
      // until the 60s tick. (The Orders book's same-truck batch does the same.)
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      setNote(
        result.suppressed
          ? 'chased · email opted out'
          : `reminded ${result.recipient}`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not send the reminder');
    }
  };

  return (
    <li
      ref={ref}
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--color-pearl)] px-1.5 py-2.5 ${
        highlight ? 'rounded-[4px] bg-[rgba(196,165,123,0.1)]' : ''
      }`}
    >
      <div className="min-w-0">
        {/* Folio-first (R74): the receivable itself opens the Invoice folio —
            record payment / resend / void live there; the chase stays here. */}
        <button
          type="button"
          onClick={() => openInvoiceFolio(invoice.id)}
          className="block w-full truncate rounded-[3px] text-left text-[12.5px] font-medium text-[var(--color-charcoal)] hover:bg-[rgba(196,165,123,0.06)]"
        >
          {invoice.invoice_number
            ? `Invoice ${invoice.invoice_number}`
            : 'Draft invoice'}
          <span className="ml-2 font-mono text-[10px] font-medium text-[var(--color-charcoal)]">
            {fmtUsd(balance)}
          </span>
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)]">
            folio →
          </span>
        </button>
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
          {[
            invoice.project?.name ?? 'Project',
            invoice.due_date ? `due ${fmtDay(invoice.due_date)}` : null,
            overdue ? `${days}d overdue` : 'within terms',
            invoice.ar_flagged_at ? 'cadence exhausted' : null,
            invoice.reminder_count > 0
              ? `${invoice.reminder_count} reminded`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {note && (
          <p
            className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.05em]"
            style={{
              color: note.startsWith('Could not') ? '#C4836F' : '#85947C',
            }}
          >
            {note}
          </p>
        )}
      </div>

      {/* R22: only an OVERDUE receivable carries the chase act. */}
      {overdue ? (
        <DocumentAction
          actionKey="send-invoice-reminder"
          surfaceKey="accounts"
          regionKey="receivable-row"
          variant="primary"
          disabled={busy}
          onClick={() => void doChase()}
          loading={busy}
          loadingLabel="Sending…"
        >
          {chasedAt ? 'Chase again' : 'Send reminder'}
        </DocumentAction>
      ) : (
        <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          in motion
        </span>
      )}

      <button
        type="button"
        onClick={() => onOpenDocument(invoice.project_id)}
        className="min-h-11 whitespace-nowrap rounded-[3px] text-[10.5px] text-[var(--color-clay)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        document ↗
      </button>
    </li>
  );
}
