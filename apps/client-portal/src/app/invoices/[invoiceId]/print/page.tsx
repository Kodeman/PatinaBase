'use client';

import { use } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useInvoice, useInvoicePaymentOptions, useStudioIdentity } from '@patina/supabase';
import { InvoicePaper } from '@patina/design-system';
import { QueryFailure } from '@/components/query-failure';

/**
 * Chromeless, printable invoice for the client portal. Ports the designer
 * portal's print route pattern: a full-viewport white overlay on screen,
 * collapsing to a plain document in print via visibility-scoped rules.
 *
 * The paper itself is @patina/design-system's InvoicePaper, shared with the
 * designer portal's print route so both portals print the same document.
 */
export default function ClientInvoicePrintPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = use(params);
  const { data: invoice, isLoading, isError, refetch } = useInvoice(invoiceId);
  // Studio brand identity (Designer Studios). projectId path; disabled until the
  // invoice resolves. name/logoUrl are nullable — fall back to the designer join.
  // A studio invoice has no project to resolve through, so it brands off the
  // studio it was drawn FOR (00571's p_studio_id, which takes precedence over
  // the designer's primary studio — a two-studio designer would otherwise
  // print the wrong letterhead), with the designer as the fallback leg.
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <QueryFailure
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
        <p className="type-body-small">Invoice not found.</p>
      </div>
    );
  }

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
          href={`/invoices/${invoice.id}`}
          className="type-meta inline-flex min-h-[44px] items-center px-3 text-[#2B2925] no-underline hover:opacity-70"
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
