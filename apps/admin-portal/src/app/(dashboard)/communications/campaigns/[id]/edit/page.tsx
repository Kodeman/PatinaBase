'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useCampaign } from '@patina/supabase/hooks';
import { useCampaignWizardStore } from '@/stores/campaign-wizard-store';

export default function CampaignEditPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading, error } = useCampaign(id);
  const loadCampaign = useCampaignWizardStore((s) => s.loadCampaign);
  const loaded = useRef(false);

  useEffect(() => {
    if (!campaign || loaded.current) return;

    // Only draft/scheduled campaigns can be edited
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      router.replace(`/communications/campaigns/${id}`);
      return;
    }

    loadCampaign(campaign as unknown as Record<string, unknown>);
    loaded.current = true;
    router.replace('/communications/campaigns/new');
  }, [campaign, id, loadCampaign, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">Failed to load campaign</p>
          <button
            onClick={() => router.push('/communications/campaigns')}
            className="mt-4 text-sm text-patina-mocha-brown underline"
          >
            Back to Campaigns
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-patina-clay-beige border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-patina-clay-beige">Loading campaign...</p>
      </div>
    </div>
  );
}
