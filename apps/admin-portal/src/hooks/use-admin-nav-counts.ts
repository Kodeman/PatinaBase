'use client';

import { useQuery } from '@tanstack/react-query';
import type { ZoneKey } from '@/config/navigation';

interface NavCounts {
  [label: string]: number;
}

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Returns count badges keyed by sub-nav item label for the given zone.
 * Silently returns an empty map if data isn't available yet.
 */
export function useNavCounts(zone: ZoneKey | null): NavCounts {
  const { data: peopleCounts } = useQuery({
    queryKey: ['admin', 'nav-counts', 'people'],
    queryFn: async (): Promise<NavCounts> => {
      const [verification, applications, waitlist] = await Promise.all([
        fetchJson('/api/admin/verification-queue?status=submitted&pageSize=1'),
        fetchJson('/api/admin/applications?status=pending&pageSize=1'),
        fetchJson('/api/waitlist/stats'),
      ]);

      const counts: NavCounts = {};
      const verificationCount =
        verification?.count ?? verification?.pagination?.total ?? verification?.total;
      if (typeof verificationCount === 'number') counts['Verification'] = verificationCount;

      const applicationsCount =
        applications?.count ?? applications?.pagination?.total ?? applications?.total;
      if (typeof applicationsCount === 'number') counts['Applications'] = applicationsCount;

      const waitlistCount =
        waitlist?.total ?? waitlist?.count ?? waitlist?.pending;
      if (typeof waitlistCount === 'number') counts['Waitlist'] = waitlistCount;

      // No Studios badge: nothing ever writes organizations.status =
      // 'pending_approval', so the count was permanently 0.

      return counts;
    },
    enabled: zone === 'people',
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (zone === 'people' && peopleCounts) return peopleCounts;
  return {};
}
