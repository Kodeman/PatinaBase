import { PageHeader, EmptyState } from '@/components/portal';

// Placeholder — UI editing of `fulfillment_config` (commission rate,
// settlement tolerance, margin floor, SLA hours, business-hours calendar —
// spec §10) isn't yet scheduled to a specific slice; the RPC
// (fulfillment_update_config, 00353) exists, the UI doesn't. This route
// exists so the Fulfillment zone's sub-nav (config/navigation.ts) links to a
// real page today rather than a typedRoutes build error. Visible-not-fake.

export default function FulfillmentConfigPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Config" description="Commission rate, settlement tolerance, margin floor, SLA hours, business-hours calendar." />
      <EmptyState label="Fulfillment Config" message="Config editing lands in a later slice." />
    </div>
  );
}
