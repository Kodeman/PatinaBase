'use client';

import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';

interface FeedProduct {
  id: string;
  name: string;
  price_retail: number | null;
  images: string[] | null;
  dimensions: { width?: number; height?: number; depth?: number; unit?: string } | null;
  spatial_context: Record<string, string>;
}

interface FeedResponse {
  room: { id: string; name: string };
  products: FeedProduct[];
  new_count: number;
  total: number;
  cache_generated_at: string | null;
}

interface RoomFeedSectionProps {
  roomId: string;
  roomName: string;
}

function formatPrice(cents: number | null): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

async function fetchFeed(roomId: string): Promise<FeedResponse | null> {
  const res = await fetch(`/api/feed/${roomId}?limit=8`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Feed fetch failed (${res.status})`);
  }
  return (await res.json()) as FeedResponse;
}

export function RoomFeedSection({ roomId, roomName }: RoomFeedSectionProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['feed', roomId],
    queryFn: () => fetchFeed(roomId),
  });

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)]">{roomName}</h3>
        <p className="type-body-small mt-2 text-[var(--text-muted)]">Loading recommendations…</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)]">{roomName}</h3>
        <p className="type-body-small mt-2 text-patina-terracotta">
          Couldn&rsquo;t load recommendations.
        </p>
      </section>
    );
  }

  const products = data?.products ?? [];

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid={`room-feed-${roomId}`}
    >
      <header className="flex items-baseline justify-between">
        <h3 className="font-heading text-base text-[var(--text-primary)]">{roomName}</h3>
        {data?.new_count ? (
          <span className="type-meta-small text-[var(--accent-primary)]">
            {data.new_count} new
          </span>
        ) : null}
      </header>

      {products.length === 0 ? (
        <p className="type-body-small mt-3 text-[var(--text-muted)]">
          Your designer is curating recommendations for this room.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => {
            const why = p.spatial_context?.fit ?? p.spatial_context?.why ?? null;
            return (
              <li
                key={p.id}
                className="overflow-hidden rounded border border-[var(--border-subtle)]"
              >
                <div className="relative aspect-square w-full bg-[var(--bg-surface)]">
                  {p.images?.[0] ? (
                    <Image
                      src={p.images[0]}
                      alt={p.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="p-2">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {p.name}
                  </p>
                  {p.price_retail != null ? (
                    <p className="type-meta-small text-[var(--text-muted)]">
                      {formatPrice(p.price_retail)}
                    </p>
                  ) : null}
                  {why ? (
                    <p className="mt-1 type-meta-small text-[var(--text-muted)]">{why}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
