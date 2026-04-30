'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClient, useStartDirectThread } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';

/**
 * Legacy /portal/clients/:id/messages route.
 *
 * In-app messaging is now thread-based (see docs/prds/in-app-messaging-prd.md).
 * This page resolves the designer↔client direct thread (creating one
 * idempotently on first visit) and redirects to /portal/messages/:threadId.
 */
export default function LegacyClientMessagesRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const { data: client, isLoading } = useClient(id);
  const startThread = useStartDirectThread();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const counterpart = client.client?.id ?? client.client_id;
    if (!counterpart) {
      setError(
        'This client has no profile yet. Direct threads require a registered profile.'
      );
      return;
    }
    let cancelled = false;
    startThread
      .mutateAsync(counterpart)
      .then((threadId) => {
        if (!cancelled) router.replace(`/portal/messages/${threadId}`);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open thread');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h1 className="type-page-title">Cannot open conversation</h1>
        <p className="type-body mt-3">{error}</p>
      </div>
    );
  }
  if (isLoading || !client) return <LoadingStrata />;
  return <LoadingStrata />;
}
