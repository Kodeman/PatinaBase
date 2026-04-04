'use client';

import { useRouter } from 'next/navigation';
import { useCampaigns } from '@patina/supabase';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function CampaignsPage() {
  const router = useRouter();
  const { data: rawCampaigns, isLoading } = useCampaigns() as { data: Any; isLoading: boolean };
  const campaigns = Array.isArray(rawCampaigns) ? rawCampaigns : [];

  return (
    <div className="pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Campaigns</h1>
        <PortalButton variant="primary" onClick={() => router.push('/portal/communications/campaigns/new')}>New Campaign</PortalButton>
      </div>

      {isLoading ? <LoadingStrata /> : campaigns.length > 0 ? (
        <div>
          {campaigns.map((campaign: Any) => (
            <div key={campaign.id} className="cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]" onClick={() => router.push(`/portal/communications/campaigns/${campaign.id}`)}>
              <div className="flex items-baseline justify-between">
                <span className="type-label">{campaign.name || campaign.subject}</span>
                <span className="type-meta">{campaign.status}</span>
              </div>
              <div className="type-label-secondary mt-1">
                {[campaign.total_recipients ? `${campaign.total_recipients} recipients` : null, campaign.sent_at ? `Sent ${new Date(campaign.sent_at).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">No campaigns yet. Create one to get started.</p>
      )}
    </div>
  );
}
