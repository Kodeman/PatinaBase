'use client';

import { use } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useInvoice, useInvoicePaymentOptions, useStudioIdentity } from '@patina/supabase';
import {
  INVOICE_STATUS_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  invoicePaymentMethodLabel,
} from '@patina/shared';
import { QueryFailure } from '@/components/query-failure';

/**
 * Chromeless, printable invoice for the client portal. Ports the designer
 * portal's print route pattern: a full-viewport white overlay on screen,
 * collapsing to a plain document in print via visibility-scoped rules.
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
  const { data: identity } = useStudioIdentity({ projectId: invoice?.project_id });
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

  const balance = invoiceBalanceCents(invoice);
  const designerName =
    identity?.name ??
    (invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'Your Designer');
  // logoUrl is non-null only for a resolved studio org; already ?v= cache-busted.
  const logoUrl = identity?.logoUrl ?? null;
  const taxPercent = (Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '');
  const succeededPayments = (invoice.payments ?? []).filter((p) => p.status === 'succeeded');

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

      <div
        className="mx-auto max-w-[44rem] px-8 py-12"
        style={{ fontFamily: 'var(--font-body, Georgia, serif)', color: '#2B2925' }}
      >
        {/* Brand header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={designerName}
                style={{ maxHeight: '48px', width: 'auto', marginBottom: '0.6rem', display: 'block' }}
              />
            )}
            <div
              style={{
                fontFamily: 'var(--font-heading, Georgia, serif)',
                fontSize: '1.45rem',
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {designerName}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#8A857C',
                marginTop: '0.35rem',
              }}
            >
              Interior Design · via Patina
            </div>
          </div>
          <div className="text-right">
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#8A857C',
              }}
            >
              Invoice
            </div>
            <div
              style={{
                fontFamily: 'var(--font-heading, Georgia, serif)',
                fontSize: '1.2rem',
                fontWeight: 600,
              }}
            >
              {invoice.invoice_number ?? 'Invoice'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#8A857C', marginTop: '0.2rem' }}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </div>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="mb-10 grid grid-cols-3 gap-6">
          <div>
            <PrintLabel>Billed To</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              {invoice.client?.full_name ?? '—'}
              {invoice.client?.email && (
                <>
                  <br />
                  <span style={{ color: '#8A857C' }}>{invoice.client.email}</span>
                </>
              )}
            </div>
          </div>
          <div>
            <PrintLabel>Project</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              {invoice.project?.name ?? '—'}
            </div>
          </div>
          <div>
            <PrintLabel>Dates</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              Issued {formatInvoiceDate(invoice.issue_date)}
              <br />
              Due {formatInvoiceDate(invoice.due_date)}
            </div>
          </div>
        </div>

        {/* Lines */}
        <table className="mb-6 w-full border-collapse" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #2B2925' }}>
              <th className="py-2 text-left" style={printThStyle}>
                Description
              </th>
              <th className="py-2 text-right" style={printThStyle}>
                Qty
              </th>
              <th className="py-2 text-right" style={printThStyle}>
                Unit
              </th>
              <th className="py-2 text-right" style={printThStyle}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items ?? []).map((line) => (
              <tr key={line.id} style={{ borderBottom: '1px solid #E5E2DD' }}>
                <td className="py-2.5 pr-4">{line.description}</td>
                <td className="py-2.5 text-right">{Number(line.quantity)}</td>
                <td className="py-2.5 text-right">
                  {formatCurrency(line.unit_amount_cents, invoice.currency)}
                </td>
                <td className="py-2.5 text-right">
                  {formatCurrency(line.amount_cents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mb-10 ml-auto" style={{ maxWidth: '16rem', fontSize: '0.85rem' }}>
          <div className="flex justify-between py-1">
            <span style={{ color: '#8A857C' }}>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal_cents, invoice.currency)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: '#8A857C' }}>Tax{taxPercent ? ` (${taxPercent}%)` : ''}</span>
            <span>{formatCurrency(invoice.tax_cents, invoice.currency)}</span>
          </div>
          <div
            className="flex justify-between py-2"
            style={{ borderTop: '1.5px solid #2B2925', fontWeight: 600, fontSize: '1rem' }}
          >
            <span>Total</span>
            <span>{formatCurrency(invoice.total_cents, invoice.currency)}</span>
          </div>
          {invoice.amount_paid_cents > 0 && (
            <>
              <div className="flex justify-between py-1">
                <span style={{ color: '#8A857C' }}>Paid</span>
                <span>−{formatCurrency(invoice.amount_paid_cents, invoice.currency)}</span>
              </div>
              <div className="flex justify-between py-1" style={{ fontWeight: 600 }}>
                <span>Balance due</span>
                <span>{formatCurrency(balance, invoice.currency)}</span>
              </div>
            </>
          )}
        </div>

        {/* Payments received */}
        {succeededPayments.length > 0 && (
          <div className="mb-10">
            <PrintLabel>Payments Received</PrintLabel>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.7 }}>
              {succeededPayments.map((p) => {
                // A settled payment's fee is historical fact, not a live quote
                // — it can't drift, so the printed record carries it exactly as
                // the interactive PaymentRow does.
                const surchargeCents = p.surcharge_cents ?? 0;
                return (
                  <div key={p.id}>
                    {formatInvoiceDate(p.received_at ?? p.created_at)} ·{' '}
                    {invoicePaymentMethodLabel(p)}
                    {p.reference ? ` · ${p.reference}` : ''}
                    {surchargeCents > 0
                      ? ` · + ${formatCurrency(surchargeCents, invoice.currency)} processing fee (${formatCurrency(
                          p.amount_cents + surchargeCents,
                          invoice.currency,
                        )} charged)`
                      : ''}{' '}
                    — {formatCurrency(p.amount_cents, invoice.currency)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Memo */}
        {invoice.memo && (
          <div className="mb-10">
            <PrintLabel>Notes</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {invoice.memo}
            </div>
          </div>
        )}

        {/* How to pay — no dollar fee amounts here; they drift from the live
            chooser. The exact figure is shown only on the interactive page. */}
        {balance > 0 && invoice.status !== 'void' && (
          <div className="mb-10">
            <PrintLabel>How to Pay</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
              <p>Pay online by card or bank transfer from the digital invoice.</p>
              {/* An address-labeled slot only ever holds a real address. With no
                  remit-to configured there is nothing to mail to, so the copy
                  says so instead of printing a sentence under "mail to:". */}
              {paymentOptions.data?.check_remit_to?.trim() ? (
                <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-line' }}>
                  To pay by check, mail to:
                  <br />
                  {paymentOptions.data.check_remit_to.trim()}
                </p>
              ) : (
                <p style={{ marginTop: '0.5rem' }}>
                  To pay by check, contact your designer for mailing details.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="border-t pt-4"
          style={{
            borderColor: '#E5E2DD',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#8A857C',
          }}
        >
          Net {invoice.payment_terms_days} · {invoice.currency} · Prepared with Patina
        </div>
      </div>
    </div>
  );
}

const printThStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#8A857C',
  fontWeight: 500,
};

function PrintLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.6rem',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: '#8A857C',
        marginBottom: '0.4rem',
      }}
    >
      {children}
    </div>
  );
}
