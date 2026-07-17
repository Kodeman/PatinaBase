import { PageHeader, EmptyState } from '@/components/portal';

// Placeholder — the Exception Desk is S7 (spec §5.5). This route exists so
// the Fulfillment zone's sub-nav (config/navigation.ts) links to a real page
// today rather than a typedRoutes build error, and so the `x` queue shortcut
// has somewhere real to eventually land. Visible-not-fake.

export default function FulfillmentExceptionsPage() {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader title="Exceptions" description="Case files for damage, delay, backorder, and substitution — clock dominant, ledger consequence shown before commit." />
      <EmptyState label="Exception Desk" message="The Exception Desk lands in S7." />
    </div>
  );
}
