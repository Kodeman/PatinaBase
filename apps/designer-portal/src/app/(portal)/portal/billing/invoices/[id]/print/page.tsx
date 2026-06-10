'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInvoice, useProfile } from '@patina/supabase';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_PAYMENT_METHOD_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  timeLineHoursLabel,
} from '@patina/shared';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { Button } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Chromeless, printable invoice. Renders as a full-viewport overlay on screen
 * (covering the portal chrome) and collapses to a plain document in print via
 * the visibility-scoped @media print rules below.
 */
export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { data: invoice, isLoading } = useInvoice(params.id);
  const { data: profile } = useProfile();

  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!invoice) {
    return (
      <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
        Invoice not found.
      </p>
    );
  }

  const balance = invoiceBalanceCents(invoice);
  const designerName =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any)?.full_name || (profile as any)?.display_name || 'Your Designer';
  const taxPercent = (Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '');

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
      <div className="invoice-print-toolbar sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-[#E5E2DD] bg-white px-6 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/portal/billing/invoices/${invoice.id}`}>← Back to invoice</Link>
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div
        className="mx-auto max-w-[44rem] px-8 py-12"
        style={{ fontFamily: 'var(--font-body, Georgia, serif)', color: '#2B2925' }}
      >
        {/* Brand header */}
        <div className="mb-10 flex items-start justify-between">
          <div>
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
                fontFamily: 'var(--font-meta, monospace)',
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
                fontFamily: 'var(--font-meta, monospace)',
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
              {invoice.invoice_number ?? 'DRAFT'}
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
            {(invoice.line_items ?? []).map((line) => {
              // Time lines roll many entries into one amount (qty 1, unit =
              // total) — print the logged hours instead of a misleading
              // "1 × $X" that reads like an hourly rate.
              const timeHours = line.kind === 'time' ? timeLineHoursLabel(line.metadata) : null;
              return (
                <tr key={line.id} style={{ borderBottom: '1px solid #E5E2DD' }}>
                  <td className="py-2.5 pr-4">
                    {line.description}
                    {line.kind === 'time' && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.7rem',
                          color: '#8A857C',
                          marginTop: '0.15rem',
                        }}
                      >
                        Logged design time{timeHours ? ` · ${timeHours}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {line.kind === 'time' ? '—' : Number(line.quantity)}
                  </td>
                  <td className="py-2.5 text-right">
                    {line.kind === 'time'
                      ? '—'
                      : formatCurrency(line.unit_amount_cents, invoice.currency)}
                  </td>
                  <td className="py-2.5 text-right">
                    {formatCurrency(line.amount_cents, invoice.currency)}
                  </td>
                </tr>
              );
            })}
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
        {(invoice.payments ?? []).filter((p) => p.status === 'succeeded').length > 0 && (
          <div className="mb-10">
            <PrintLabel>Payments Received</PrintLabel>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.7 }}>
              {(invoice.payments ?? [])
                .filter((p) => p.status === 'succeeded')
                .map((p) => (
                  <div key={p.id}>
                    {formatInvoiceDate(p.received_at ?? p.created_at)} ·{' '}
                    {INVOICE_PAYMENT_METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ''} —{' '}
                    {formatCurrency(p.amount_cents, invoice.currency)}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Memo */}
        {invoice.memo && (
          <div className="mb-10">
            <PrintLabel>Notes</PrintLabel>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{invoice.memo}</div>
          </div>
        )}

        {/* Footer */}
        <div
          className="border-t pt-4"
          style={{
            borderColor: '#E5E2DD',
            fontFamily: 'var(--font-meta, monospace)',
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
  fontFamily: 'var(--font-meta, monospace)',
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
        fontFamily: 'var(--font-meta, monospace)',
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
