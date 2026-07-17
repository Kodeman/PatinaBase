'use client';

import { PageHeader, EmptyState } from '@/components/portal';
import { useVendorDirectory } from '@/hooks/use-fulfillment-vendors';
import { VendorDirectoryTable } from '@/components/fulfillment/vendors/vendor-directory-table';

// Vendor Directory (S4, spec §7) — replaces S1's placeholder. Protocol sheets
// (R1.6) + scorecards computed from the Run Log; every vendor appears
// whether profiled or not so an unprofiled vendor reads as a gap, not an
// absence.

export default function FulfillmentVendorsPage() {
  const { data: rows, isLoading, error } = useVendorDirectory();

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Vendors"
        description="Protocol sheets + scorecards computed from the Run Log — ack time, on-time ship, damage rate, fill rate."
        meta={
          rows ? (
            <span data-testid="vendor-directory-total" className="type-meta">
              {rows.length} vendor{rows.length === 1 ? '' : 's'}
            </span>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="vendor-directory-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load the vendor directory: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows && rows.length === 0 && (
        <EmptyState label="Vendor Directory" message="No vendors found." />
      )}

      {!isLoading && !error && rows && rows.length > 0 && (
        <div className="mt-4">
          <VendorDirectoryTable rows={rows} />
        </div>
      )}
    </div>
  );
}
