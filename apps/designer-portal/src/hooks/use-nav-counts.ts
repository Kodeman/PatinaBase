'use client';

import { useMemo } from 'react';
import { useLeads, useProposals, useProjects, useClients, useProducts, useAllDecisions } from '@patina/supabase';
import { useClientReviews, useNurtureTouchpoints, useTeachingQueue } from '@patina/supabase';
import type { ZoneKey } from '@/config/navigation';

/**
 * Returns count data for sub-nav badges, keyed by sub-nav label.
 * Uses existing Supabase hooks with aggressive stale times to avoid over-fetching.
 */
export function useNavCounts(zone: ZoneKey | null): Record<string, number | undefined> {
  // Pipeline counts
  const { data: leads } = useLeads(zone === 'pipeline' ? undefined : undefined);
  const { data: proposals } = useProposals(zone === 'pipeline' ? undefined : undefined);
  const { data: projects } = useProjects();

  // Products counts
  const { data: products } = useProducts();
  const { data: teachingQueue } = useTeachingQueue();

  // Clients counts
  const { data: clients } = useClients();
  const { data: reviews } = useClientReviews();
  const { data: nurture } = useNurtureTouchpoints();
  const { data: decisions } = useAllDecisions();

  return useMemo(() => {
    const counts: Record<string, number | undefined> = {};

    if (zone === 'pipeline') {
      const allLeads = leads?.length ?? 0;
      const allProposals = proposals?.length ?? 0;
      const activeProjects = projects?.filter((p) => p.status === 'active')?.length ?? 0;
      const completedProjects = projects?.filter((p) => p.status === 'completed')?.length ?? 0;

      counts['All'] = allLeads + allProposals + (projects?.length ?? 0);
      counts['Leads'] = allLeads;
      counts['Proposals'] = allProposals;
      counts['Active'] = activeProjects;
      counts['Completed'] = completedProjects;
    }

    if (zone === 'products') {
      counts['Catalog'] = products?.data?.length;
      counts['Teaching'] = teachingQueue?.length;
    }

    if (zone === 'clients') {
      counts['All Clients'] = clients?.length;
      counts['Reviews'] = reviews?.length;
      counts['Nurture Queue'] = nurture?.length;
      counts['Decisions'] = decisions?.length;
    }

    return counts;
  }, [zone, leads, proposals, projects, products, teachingQueue, clients, reviews, nurture, decisions]);
}
