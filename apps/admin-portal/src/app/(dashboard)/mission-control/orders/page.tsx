'use client';

import { useState } from 'react';
import { PageHeader, FilterTabs, type FilterTab } from '@/components/portal';
import { Button } from '@/components/ui/button';
import { MissionControlTabs } from '@/components/mission-control/mission-control-tabs';
import { OrdersList } from '@/components/mission-control/orders/orders-list';
import { NewOrderDialog } from '@/components/mission-control/orders/new-order-dialog';

// WP-2.3 · Transaction Tracker — the concierge order lifecycle in Mission
// Control. A ledger-style list (10-20 orders max), not a BI grid: each row
// walks po_draft -> reconciled with per-stage checklists, a payment-vs-ledger
// flag (terracotta on mismatch) and a damage countdown when active. Payment
// discrepancies flagged by the daily job surface both here and in the Approval
// Inbox (via the payment_discrepancy agent_task the reconciler enqueues).

type OrderView = 'all' | 'flagged';

const VIEW_TABS: FilterTab<OrderView>[] = [
  { value: 'all', label: 'All orders' },
  { value: 'flagged', label: 'Payment flagged' },
];

export default function OrdersPage() {
  const [view, setView] = useState<OrderView>('all');
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Transaction"
        accent="Tracker"
        description="Concierge Rail-A orders, po_draft to reconciled. Checklists gate each stage; the daily reconciler flags any payment that disagrees with the internal ledger."
        actions={<Button onClick={() => setNewOpen(true)}>New order</Button>}
      />
      <MissionControlTabs />
      <FilterTabs items={VIEW_TABS} value={view} onChange={setView} className="mt-1" />

      <div className="mt-4">
        <OrdersList filterFlag={view === 'flagged' ? 'mismatch' : undefined} />
      </div>

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
