'use client';

import { use } from 'react';
import Link from 'next/link';
import { useCampaign, useDeleteCampaign, useSendCampaign } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: campaign, isLoading } = useCampaign(id) as { data: Any; isLoading: boolean };
  const sendCampaign = useSendCampaign();
  const deleteCampaign = useDeleteCampaign();

  if (isLoading) return <LoadingStrata />;
  if (!campaign) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Campaign not found.</p>;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/communications/campaigns" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Campaigns</Link>
        <span className="mx-2">&rarr;</span><span>{campaign.name || 'Campaign'}</span>
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
          <PortalButton variant="primary" onClick={() => sendCampaign.mutate(id)} disabled={sendCampaign.isPending}>
            {sendCampaign.isPending ? 'Sending...' : 'Send Campaign'}
          </PortalButton>
          <PortalButton variant="ghost" onClick={() => deleteCampaign.mutate(id)} disabled={deleteCampaign.isPending}>Delete</PortalButton>
        </div>
      )}
    </div>
  );
}
