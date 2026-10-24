'use client';

import type { ReactNode } from 'react';

import { urgentInvoice } from '@/lib/threshold/asks-line';
import { galleryRemainingAmounts } from '@/lib/threshold/gallery-invoices';
import type { InvoiceProjection, InvoiceRow } from '@/lib/threshold/invoice-rollup';

import { InvoiceGroupList, type InvoiceListState } from './earlier-invoices';

type RemainderProps = { projection: InvoiceProjection; state: InvoiceListState; remaining: InvoiceRow[] };

function RemainingGroups({ projection, state, remaining }: RemainderProps) {
  return <>
    {remaining.length > 0 && <InvoiceGroupList testId="gallery-other-payable" heading="Other invoices" rows={remaining} state={state} />}
    {projection.processing.length > 0 && <InvoiceGroupList testId="invoices-in-progress" heading="Payments in progress" rows={projection.processing} state={state} />}
    {projection.review.length > 0 && <InvoiceGroupList testId="invoices-under-review" heading="Payment needs review" rows={projection.review} state={state} />}
  </>;
}

function alsoOpenTitle(amounts: string[] | null) {
  return amounts?.length ? `Also open, ${amounts.join(' · ')}` : 'Also open';
}

function AlsoOpen({ projection, state, remaining, urgent }: RemainderProps & { urgent: InvoiceRow | null }) {
  if (remaining.length + projection.processing.length + projection.review.length === 0) return null;
  const amounts = galleryRemainingAmounts(projection, urgent);
  return <section data-testid="gallery-also-open" className="flex flex-col gap-6 border-t border-[var(--border-subtle)] pt-6">
    <h3 className="text-[16px] leading-[1.5]">{alsoOpenTitle(amounts)}</h3>
    {amounts === null && <p className="text-[16px]">The total is hidden until every invoice’s payment status is confirmed.</p>}
    <RemainingGroups projection={projection} state={state} remaining={remaining} />
  </section>;
}

/** Presentation only: the same invoice rows and payment state, with asks between them. */
export function GalleryInvoiceList({ projection, state, approvals }: {
  projection: InvoiceProjection;
  state: InvoiceListState;
  approvals: ReactNode;
}) {
  const urgent = urgentInvoice(projection);
  const remaining = projection.payable.filter((row) => row.invoice.id !== urgent?.invoice.id);
  return <>
    {urgent && <InvoiceGroupList testId="invoices-to-pay" heading="To pay" rows={[urgent]} state={state} />}
    {approvals}
    <AlsoOpen projection={projection} state={state} remaining={remaining} urgent={urgent} />
    {projection.nothingToPay && <p data-testid="invoices-none" className="text-[16px]">No invoices to pay.</p>}
  </>;
}
