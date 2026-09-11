import * as React from 'react'
import {
  INVOICE_STATUS_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  invoicePaymentMethodLabel,
  type InvoicePaymentMethodLabelInput,
  type InvoiceStatus,
} from '@patina/shared'

/**
 * The invoice paper — letterhead through footer, as it prints.
 *
 * Presentational only: every value arrives by prop, so the same paper serves
 * the client portal's print page and the designer portal's. It owns no print
 * visibility rules; the page that renders it wraps it in the element its own
 * `@media print` block reveals (see either portal's print route), because
 * neither portal's globals.css reveals anything but `.proposal-print-area`.
 *
 * Shapes below are structural on purpose — the minimal columns the markup
 * reads, mirroring the `InvoiceLineForTotals` / `InvoicePaymentMethodLabelInput`
 * pattern in @patina/shared. `Invoice` from @patina/supabase satisfies them
 * structurally, so this package never depends on the data layer.
 */

export interface InvoicePaperLine {
  id: string
  description: string
  quantity: number
  unit_amount_cents: number
  amount_cents: number
}

export interface InvoicePaperPayment extends InvoicePaymentMethodLabelInput {
  id: string
  status: string
  amount_cents: number
  reference?: string | null
  received_at?: string | null
  created_at: string
  surcharge_cents?: number | null
}

export interface InvoicePaperInvoice {
  status: InvoiceStatus
  invoice_number: string | null
  /** NULL on a studio invoice — the invoice with no house (00571, ruling S1). */
  project_id: string | null
  /** The regarding line of a studio invoice (S12); NULL on a project invoice. */
  title: string | null
  currency: string
  issue_date: string | null
  due_date: string | null
  payment_terms_days: number
  subtotal_cents: number
  tax_rate: number
  tax_cents: number
  total_cents: number
  amount_paid_cents: number
  memo: string | null
  client?: { full_name: string | null; email: string } | null
  project?: { name: string } | null
  designer?: { full_name: string | null; business_name: string | null } | null
  line_items?: InvoicePaperLine[]
  payments?: InvoicePaperPayment[]
}

export interface InvoicePaperIdentity {
  /** May be NULL in degenerate cases — the designer join is the fallback. */
  name: string | null
  /** Non-null only for a resolved studio org; already ?v= cache-busted. */
  logoUrl: string | null
}

export interface InvoicePaperProps {
  invoice: InvoicePaperInvoice
  identity?: InvoicePaperIdentity | null
  /** `check_remit_to` for the "How to pay" block (migration 00428). */
  checkRemitTo?: string | null
}

export function InvoicePaper({ invoice, identity, checkRemitTo }: InvoicePaperProps) {
  const balance = invoiceBalanceCents(invoice)
  const designerName =
    identity?.name ??
    (invoice.designer?.full_name?.trim() ||
      invoice.designer?.business_name?.trim() ||
      'Your Designer')
  const logoUrl = identity?.logoUrl ?? null
  const taxPercent = (Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')
  const succeededPayments = (invoice.payments ?? []).filter((p) => p.status === 'succeeded')

  return (
    <div
      className="mx-auto max-w-[44rem] px-8 py-12"
      style={{ fontFamily: 'var(--font-body, Georgia, serif)', color: '#2B2925' }}
    >
      {/* Brand header */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          {logoUrl && (
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
          {/* A studio invoice names no house. Its regarding line stands
              where the project name would, under its own label. */}
          <PrintLabel>{invoice.project_id ? 'Project' : 'Regarding'}</PrintLabel>
          <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
            {invoice.project?.name ?? invoice.title ?? '—'}
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
              const surchargeCents = p.surcharge_cents ?? 0
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
              )
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
            {checkRemitTo?.trim() ? (
              <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-line' }}>
                To pay by check, mail to:
                <br />
                {checkRemitTo.trim()}
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
  )
}

const printThStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#8A857C',
  fontWeight: 500,
}

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
  )
}
