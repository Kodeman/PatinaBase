import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { createServerClient } from '@patina/supabase/server';

import { fetchClientOrders } from '@/lib/data/orders';
import { CheckoutForm } from '@/components/orders/CheckoutForm';

interface CheckoutPageProps {
  params: Promise<{ id: string }>;
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/signin?callbackUrl=/orders/${id}/checkout`);

  const orders = await fetchClientOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href={`/orders/${id}`}
        className="inline-flex items-center gap-1.5 type-meta no-underline transition hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to order
      </Link>

      <header className="mt-6">
        <h1 className="type-page-title">Checkout</h1>
        <p className="type-body mt-2">
          Pay <strong>{formatCurrency(order.totalCents, order.currency)}</strong> for{' '}
          {order.orderNumber ?? `order ${order.id.slice(0, 8)}`}.
        </p>
      </header>

      <section className="mt-8">
        <CheckoutForm
          orderId={order.id}
          amountCents={order.totalCents}
          currency={order.currency}
        />
      </section>
    </main>
  );
}
