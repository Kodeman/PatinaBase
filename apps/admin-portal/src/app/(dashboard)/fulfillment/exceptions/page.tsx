'use client';

import { PageHeader, EmptyState, LoadingStrata } from '@/components/portal';
import { useFulfillmentExceptions } from '@/hooks/use-fulfillment-exceptions';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { ExceptionsList } from '@/components/fulfillment/exceptions/exceptions-list';

// The Exception Desk (S7, spec §5.5) — the case-file list, clock-urgency sorted.
// Realtime keeps it live (an exception opened from the queue's `x`, evidence
// added via a client link, or a Leah ruling all re-figure without a reload).

export default function FulfillmentExceptionsPage() {
  useFulfillmentRealtime();
  const { data, isLoading, isError, error } = useFulfillmentExceptions();

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Exceptions"
        description="Case files for damage, delay, backorder, and substitution — clock dominant, ledger consequence shown before commit."
      />
      {isLoading ? (
        <LoadingStrata />
      ) : isError ? (
        <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load exceptions'} />
      ) : (
        <ExceptionsList rows={data ?? []} />
      )}
    </div>
  );
}
