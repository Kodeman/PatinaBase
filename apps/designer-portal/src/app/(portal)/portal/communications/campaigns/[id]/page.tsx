'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCampaign, useDeleteCampaign, useSendCampaign } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { Button } from '@/components/ui/controls';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const { data: campaign, isLoading } = useCampaign(id) as { data: Any; isLoading: boolean };
  const sendCampaign = useSendCampaign();
  const deleteCampaign = useDeleteCampaign();

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!campaign) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Campaign not found.</p>;

  return (
    <div className="pt-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/communications/campaigns">← Campaigns</Link>
        </Button>
      </div>
      <h1 className="type-page-title mb-4">{campaign.name || campaign.subject}</h1>

      <FieldGroup label="Campaign Details">
        <DetailRow label="Status" value={campaign.status || '—'} />
        <DetailRow label="Subject" value={campaign.subject || '—'} />
        <DetailRow label="Recipients" value={String(campaign.total_recipients || 0)} />
        {campaign.open_rate !== undefined && <DetailRow label="Open Rate" value={`${Math.round(campaign.open_rate * 100)}%`} />}
        {campaign.click_rate !== undefined && <DetailRow label="Click Rate" value={`${Math.round(campaign.click_rate * 100)}%`} />}
        {campaign.sent_at && <DetailRow label="Sent" value={new Date(campaign.sent_at).toLocaleString()} />}
      </FieldGroup>

      {campaign.status === 'draft' && (
        <div className="mt-6 flex gap-4">
          <Button variant="primary" onClick={() => sendCampaign.mutate(id)} disabled={sendCampaign.isPending}>
            {sendCampaign.isPending ? 'Sending...' : 'Send Campaign'}
          </Button>
          <Button variant="ghost" onClick={() => deleteCampaign.mutate(id, { onSuccess: () => router.push('/portal/communications/campaigns') })} disabled={deleteCampaign.isPending}>Delete</Button>
        </div>
      )}
    </div>
  );
}
