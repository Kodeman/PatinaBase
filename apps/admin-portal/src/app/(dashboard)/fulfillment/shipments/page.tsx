import { PageHeader, EmptyState } from '@/components/portal';

// Placeholder — the Shipment Board is S5 (spec §5.4). This route exists so
// the Fulfillment zone's sub-nav (config/navigation.ts) links to a real page
// today rather than a typedRoutes build error. Visible-not-fake: it says
// exactly what it is and when it lands.

export default function FulfillmentShipmentsPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Shipments" description="Rows are shipments, not orders — mode chips, freight discipline, inspection windows." />
      <EmptyState label="Shipment Board" message="The Shipment Board lands in S5." />
    </div>
  );
}
