'use client';

import { use } from 'react';
import { PageHeader, EmptyState, LoadingStrata } from '@/components/portal';
import { useBreadcrumbLastLabel } from '@/contexts/breadcrumb-context';
import { useExceptionCaseFile } from '@/hooks/use-fulfillment-exceptions';
import { useFulfillmentRealtime } from '@/hooks/use-fulfillment-realtime';
import { CaseFile } from '@/components/fulfillment/exceptions/case-file';
import { EXCEPTION_TYPE_LABELS } from '@patina/fulfillment';

// The Exception case file (S7, spec §5.5). Thin page: fetch → <CaseFile />, with
// the breadcrumb set to the type + order, mirroring the workbench/composer pages.

export default function ExceptionCaseFilePage({
  params,
}: {
  params: Promise<{ exceptionId: string }>;
}) {
  const { exceptionId } = use(params);
  useFulfillmentRealtime();
  const { data: caseFile, isLoading, isError, error } = useExceptionCaseFile(exceptionId);

  useBreadcrumbLastLabel(
    caseFile
      ? `${EXCEPTION_TYPE_LABELS[caseFile.type] ?? caseFile.type}${caseFile.orderNo != null ? ` · Order #${caseFile.orderNo}` : ''}`
      : null,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
      <PageHeader title="Case file" description="One exception — clock, evidence, resolution paths with their ledger consequence in mono before commit." />
      {isLoading ? (
        <LoadingStrata />
      ) : isError || !caseFile ? (
        <EmptyState label="Not found" message={(error as Error)?.message ?? 'This exception could not be loaded.'} />
      ) : (
        <CaseFile caseFile={caseFile} />
      )}
    </div>
  );
}
