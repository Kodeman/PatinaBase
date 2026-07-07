import { redirect } from 'next/navigation';

import { createServerClient } from '@patina/supabase/server';

import { fetchClientOrders } from '@/lib/data/orders';
import { OrderRow } from '@/components/orders/OrderRow';
import { OrdersErrorState } from '@/components/orders/OrdersErrorState';

export const metadata = {
  title: 'Orders · Patina',
};

const ACTIVE_STATUSES = new Set(['pending', 'processing', 'paid', 'shipped']);
const COMPLETED_STATUSES = new Set(['delivered']);
const ARCHIVED_STATUSES = new Set(['cancelled', 'refunded']);

export default async function ClientOrdersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createServerClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin?callbackUrl=/orders');

  const result = await fetchClientOrders();
  const orders = result.orders ?? [];

  const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const completed = orders.filter((o) => COMPLETED_STATUSES.has(o.status));
  const archived = orders.filter((o) => ARCHIVED_STATUSES.has(o.status));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Your Orders</h1>
      <p className="type-body mt-2">
        Furniture, fixtures, and equipment ordered for your project. Track payments and
        deliveries here.
      </p>

      {result.error && <OrdersErrorState error={result.error} returnTo="/orders" />}

      {!result.error && orders.length === 0 && (
        <div className="py-16 text-center">
          <p className="type-body-small">
            Your orders will appear here once your designer adds items to your project.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-[var(--accent-primary)]">
            Active ({active.length})
          </h2>
          <ul className="space-y-0">
            {active.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-sage">Delivered ({completed.length})</h2>
          <ul className="space-y-0">
            {completed.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">Archive ({archived.length})</h2>
          <ul className="space-y-0">
            {archived.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
