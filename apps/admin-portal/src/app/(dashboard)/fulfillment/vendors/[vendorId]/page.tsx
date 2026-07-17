'use client';

import { use } from 'react';
import { PageHeader, Section, EmptyState } from '@/components/portal';
import { useBreadcrumbLastLabel } from '@/contexts/breadcrumb-context';
import { useToast } from '@/components/portal/toast-provider';
import { useUpdateVendorProfile, useVendorDetail } from '@/hooks/use-fulfillment-vendors';
import { VendorProfileEditor } from '@/components/fulfillment/vendors/vendor-profile-editor';
import { scorecardToCsv, VendorScorecardPanel } from '@/components/fulfillment/vendors/vendor-scorecard';

// A vendor's protocol sheet (spec §7, R1.6) + scorecard. Reached from the
// Vendor Directory list.

export default function FulfillmentVendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = use(params);
  const { toast } = useToast();
  const { data, isLoading, error } = useVendorDetail(vendorId);
  const updateProfile = useUpdateVendorProfile(vendorId);

  useBreadcrumbLastLabel(data ? data.vendorName : null);

  const handleSave = (patch: Record<string, unknown>) => {
    updateProfile.mutate(patch, {
      onSuccess: () => toast('Protocol sheet saved.', 'success'),
      onError: (err) => toast(`Couldn't save the protocol sheet: ${(err as Error).message}`, 'error'),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const csv = scorecardToCsv(data.vendorName, data.scorecard);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.vendorName.replace(/\s+/g, '-').toLowerCase()}-scorecard.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={data ? data.vendorName : 'Vendor'}
        accent="Protocol sheet"
        description={data?.profile ? 'Operator-editable protocol facts (R1.6).' : 'This vendor has no protocol sheet yet.'}
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="vendor-detail-loading">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load this vendor: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && !data && <EmptyState label="Vendor" message="This vendor could not be found." />}

      {data && (
        <>
          <Section title="Protocol sheet" className="mt-8">
            <VendorProfileEditor
              vendorId={vendorId}
              vendorName={data.vendorName}
              profile={data.profile}
              onSave={handleSave}
              saving={updateProfile.isPending}
            />
          </Section>

          <Section title="Scorecard" className="mt-10">
            <VendorScorecardPanel scorecard={data.scorecard} onExportCsv={handleExport} />
          </Section>
        </>
      )}
    </div>
  );
}
