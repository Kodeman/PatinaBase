'use client';

import { use } from 'react';
import Link from 'next/link';
import { useInvoice, useInvoicePaymentOptions, useStudioIdentity } from '@patina/supabase';
import { InvoicePaper } from '@patina/design-system';
import { AccountsQueryFailure } from '@/components/document/accounts/accounts-query-failure';

/**
 * The printable invoice, designer side (BIL-01 refit).
 *
 * Deliberately OUTSIDE the (document) route group: the desk shell, the studio
 * drawer and the overlay stack have no business on a sheet of paper, and the
 * folio used to print in place only because it had nowhere else to go. That
 * in-place print came out blank — globals.css's `@media print { body * {
 * visibility: hidden } }` reveals only `.proposal-print-area`, so the folio's
 * own display-toggling print block never made its content visible again. This
 * page carries the `#invoice-print-root` visibility pattern instead, which
 * out-specifies the global rule, and the folio's Print act now opens it.
 *
 * Auth is the middleware's: the path is neither public nor an auth page, so it
 * takes the signed-in + designer/admin role gate like every other route.
 */
export default function DesignerInvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = use(params);
  const { data: invoice, isLoading, isError, refetch } = useInvoice(invoiceId);
  // Letterhead: a studio invoice has no project to resolve through, so it
  // brands off the studio it was drawn FOR (00571's p_studio_id), with the
  // designer join as the fallback leg.
  const { data: identity } = useStudioIdentity(
    invoice?.project_id
      ? { projectId: invoice.project_id }
      : { studioId: invoice?.studio_id, designerId: invoice?.designer_id },
  );
  // check_remit_to for the "How to pay" block (migration 00428). Falls back to
  // platform defaults on any failure — a config read never blocks printing.
  const paymentOptions = useInvoicePaymentOptions(invoiceId);

  if (isLoading) {
    return (
      <div className="px-6 py-16 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Fetching the invoice…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <AccountsQueryFailure
          title="Unable to load this invoice"
          message="The printable invoice could not be opened just now."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!invoice || invoice.status === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-[13px] text-[var(--color-aged-oak)]">Invoice not found.</p>
      </div>
    );
  }

  // The ledger is a drawer sheet, not a page, so there is no URL that reopens
  // the folio. The Accounts doorway is the nearest address that works for a
  // studio invoice too, since it needs no project.
  const backHref = `/desk?book=accounts&page=ledger&invoiceId=${invoice.id}`;

  return (
    <div
      id="invoice-print-root"
      className="fixed inset-0 z-[60] overflow-auto"
      style={{ background: '#FFFFFF' }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-root, #invoice-print-root * { visibility: visible; }
          #invoice-print-root {
            position: absolute !important;
            inset: auto !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }
          .invoice-print-toolbar { display: none !important; }
          @page { margin: 0.75in; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="invoice-print-toolbar sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-[#E5E2DD] bg-white px-6 py-3">
        <Link
          href={backHref}
          className="inline-flex min-h-[44px] items-center px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#2B2925] no-underline hover:opacity-70"
        >
          ← Back to invoice
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center rounded-md bg-[#2B2925] px-4 text-sm text-white transition hover:opacity-90"
        >
          Print / Save PDF
        </button>
      </div>

      <InvoicePaper
        invoice={invoice}
        identity={identity}
        checkRemitTo={paymentOptions.data?.check_remit_to}
      />
    </div>
  );
}
