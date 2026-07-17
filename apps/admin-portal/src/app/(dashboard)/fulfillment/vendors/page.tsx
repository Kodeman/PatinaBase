import { PageHeader, EmptyState } from '@/components/portal';

// Placeholder — the Vendor Directory & scorecards (spec §7) isn't one of the
// eight numbered S0-S7 slices in back-of-house-v1-package.md; it's not yet
// scheduled to a specific slice. This route exists so the Fulfillment zone's
// sub-nav (config/navigation.ts) links to a real page today rather than a
// typedRoutes build error. Visible-not-fake.

export default function FulfillmentVendorsPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Vendors" description="Protocol sheets + scorecards computed from the Run Log — ack time, on-time ship, damage rate, fill rate." />
      <EmptyState label="Vendor Directory" message="The Vendor Directory lands in a later slice." />
    </div>
  );
}
