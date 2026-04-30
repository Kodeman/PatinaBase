import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, serverError } from '@/lib/supabase-admin';

export type OutboxSource = 'media' | 'orders';

export interface OutboxEventRow {
  id: string;
  source: OutboxSource;
  eventType: string;
  published: boolean;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface OutboxCounts {
  source: OutboxSource;
  unpublished: number;
  published: number;
  oldestUnpublished: string | null;
}

export interface OutboxResponse {
  events: OutboxEventRow[];
  counts: OutboxCounts[];
  totals: {
    unpublished: number;
    published: number;
    oldestUnpublished: string | null;
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { adminClient } = auth;

  const url = new URL(request.url);
  const limit = Math.min(
    1000,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
  );
  const unpublishedOnly = url.searchParams.get('unpublishedOnly') !== 'false';

  try {
    const [eventsRes, countsRes] = await Promise.all([
      // RPC types aren't generated for these new functions yet; cast through unknown.
      (adminClient.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'get_outbox_events',
        { p_limit: limit, p_unpublished_only: unpublishedOnly },
      ),
      (adminClient.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'get_outbox_counts',
      ),
    ]);

    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (countsRes.error) throw new Error(countsRes.error.message);

    type RawEvent = {
      id: string;
      source: OutboxSource;
      event_type: string;
      published: boolean;
      retry_count: number;
      last_error: string | null;
      created_at: string;
      published_at: string | null;
    };

    type RawCount = {
      source: OutboxSource;
      unpublished: number | string;
      published: number | string;
      oldest_unpublished: string | null;
    };

    const events: OutboxEventRow[] = ((eventsRes.data ?? []) as RawEvent[]).map((r) => ({
      id: r.id,
      source: r.source,
      eventType: r.event_type,
      published: r.published,
      retryCount: r.retry_count,
      lastError: r.last_error,
      createdAt: r.created_at,
      publishedAt: r.published_at,
    }));

    const counts: OutboxCounts[] = ((countsRes.data ?? []) as RawCount[]).map((c) => ({
      source: c.source,
      unpublished: Number(c.unpublished),
      published: Number(c.published),
      oldestUnpublished: c.oldest_unpublished,
    }));

    const totals = counts.reduce(
      (acc, c) => ({
        unpublished: acc.unpublished + c.unpublished,
        published: acc.published + c.published,
        oldestUnpublished:
          c.oldestUnpublished &&
          (!acc.oldestUnpublished || c.oldestUnpublished < acc.oldestUnpublished)
            ? c.oldestUnpublished
            : acc.oldestUnpublished,
      }),
      { unpublished: 0, published: 0, oldestUnpublished: null as string | null },
    );

    const payload: OutboxResponse = { events, counts, totals };
    return NextResponse.json({ data: payload });
  } catch (err) {
    return serverError((err as Error).message ?? 'Failed to load outbox events');
  }
}
