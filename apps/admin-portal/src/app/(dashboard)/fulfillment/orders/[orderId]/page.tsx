'use client';

import { use } from 'react';
import { PageHeader, EmptyState } from '@/components/portal';

// Placeholder — the Order Workbench is S2 (spec §5.2, "where one becomes
// six"). This route exists so the Queue's Enter shortcut (use-queue-keyboard
// + the S1 page) and typedRoutes both have a real target today. Visible-
// not-fake: it names the order it was asked to open and says when the real
// Workbench lands.

export default function FulfillmentOrderWorkbenchPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Order"
        accent="Workbench"
        description={`Order ${orderId}`}
      />
      <EmptyState label="Order Workbench" message="The Order Workbench lands in S2." />
    </div>
  );
}
