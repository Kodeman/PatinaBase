import { redirect } from 'next/navigation';

/** /portal/billing has no page of its own — Invoices is the zone landing. */
export default function BillingIndexPage() {
  redirect('/portal/billing/invoices');
}
