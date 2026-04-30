import { useQuery } from '@tanstack/react-query';
import type { OutboxResponse } from '@/app/api/admin/outbox-events/route';

const POLL_INTERVAL_MS = 30_000;

async function fetchOutbox(unpublishedOnly: boolean): Promise<OutboxResponse> {
  const params = new URLSearchParams({
    limit: '200',
    unpublishedOnly: String(unpublishedOnly),
  });
  const res = await fetch(`/api/admin/outbox-events?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load outbox events (${res.status})`);
  }
  const json = (await res.json()) as { data: OutboxResponse };
  return json.data;
}

export function useOutboxEvents(unpublishedOnly: boolean) {
  return useQuery({
    queryKey: ['admin-outbox-events', unpublishedOnly],
    queryFn: () => fetchOutbox(unpublishedOnly),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10_000,
  });
}
