/**
 * Per-document presence (D6) — a Supabase Realtime presence channel per
 * engagement. Net-new: deliberately NOT built on the projects-service
 * socket.io presence (spec §4 / audit §9). Soft and quiet: names only —
 * no locks, no cursors, no exclusive holds.
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';

export function useDocumentPresence(engagementId: string | null): string[] {
  const { user } = useAuth();
  const [others, setOthers] = useState<string[]>([]);
  const userId = user?.id ?? null;
  const userName = user?.name || user?.email || 'A studio member';

  useEffect(() => {
    if (!engagementId || !userId) return;
    const supabase = createBrowserClient();

    const channel = supabase.channel(`document:${engagementId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, { name?: string }[]>;
        setOthers(
          Object.entries(state)
            .filter(([key]) => key !== userId)
            .map(([, metas]) => metas[0]?.name ?? 'A studio member'),
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ name: userName });
      });

    return () => {
      setOthers([]);
      void supabase.removeChannel(channel);
    };
  }, [engagementId, userId, userName]);

  return others;
}
