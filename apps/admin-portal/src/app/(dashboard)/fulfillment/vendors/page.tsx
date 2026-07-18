'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/portal';
import { Button } from '@/components/ui/button';
import { useVendorDirectory } from '@/hooks/use-fulfillment-vendors';
import { VendorDirectoryTable } from '@/components/fulfillment/vendors/vendor-directory-table';
import { AddVendorDialog } from '@/components/fulfillment/vendors/add-vendor-dialog';

// Vendor Directory (S4, spec §7) — replaces S1's placeholder. Protocol sheets
// (R1.6) + scorecards computed from the Run Log; every vendor appears
// whether profiled or not so an unprofiled vendor reads as a gap, not an
// absence.
//
// "Add vendor" (I15, BOH-DECISIONS.md) is the only affordance that creates a
// vendors row — prior to this the Directory was list/edit-only and prod's
// public.vendors started genuinely empty. Creating routes straight to the
// new vendor's profile editor so the natural flow is create -> fill in
// protocol facts, not create -> hunt for it in the list.

export default function FulfillmentVendorsPage() {
  const router = useRouter();
  const { data: rows, isLoading, error } = useVendorDirectory();
  const [isAddOpen, setIsAddOpen] = useState(false);

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
        actions={
          <Button data-testid="vendor-directory-add" onClick={() => setIsAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add vendor
          </Button>
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

      <AddVendorDialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={(vendorId) => {
          setIsAddOpen(false);
          router.push(`/fulfillment/vendors/${vendorId}`);
        }}
      />
    </div>
  );
}
