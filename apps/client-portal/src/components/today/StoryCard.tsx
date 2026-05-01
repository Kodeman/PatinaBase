'use client';

import Image from 'next/image';

interface EmbeddedProduct {
  id: string;
  name: string;
  price_retail: number | null;
  images: string[] | null;
}

export interface DailyStory {
  id: string;
  story_type: string | null;
  title: string;
  subtitle: string | null;
  hero_image_url: string | null;
  body_content: string | null;
  read_time_minutes: number | null;
  publish_date: string;
  embedded_products: EmbeddedProduct[];
}

function formatPrice(cents: number | null): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function StoryCard({ story }: { story: DailyStory }) {
  return (
    <article
      className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-white"
      data-testid="daily-story-card"
    >
      {story.hero_image_url ? (
        <div className="relative aspect-[16/9] w-full bg-[var(--bg-surface)]">
          <Image
            src={story.hero_image_url}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="p-6">
        <p className="type-meta">
          {story.story_type ?? 'Story'}
          {story.read_time_minutes ? ` · ${story.read_time_minutes} min read` : ''}
        </p>
        <h2 className="font-heading mt-2 text-2xl text-[var(--text-primary)]">{story.title}</h2>
        {story.subtitle ? (
          <p className="type-body mt-2 text-[var(--text-muted)]">{story.subtitle}</p>
        ) : null}
        {story.body_content ? (
          <div className="prose prose-sm mt-4 max-w-none whitespace-pre-line text-[var(--text-primary)]">
            {story.body_content}
          </div>
        ) : null}

        {story.embedded_products?.length ? (
          <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <h3 className="type-meta">Featured</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {story.embedded_products.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded border border-[var(--border-subtle)] p-2"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-[var(--bg-surface)]">
                    {p.images?.[0] ? (
                      <Image
                        src={p.images[0]}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                    {p.price_retail != null ? (
                      <p className="type-meta-small text-[var(--text-muted)]">
                        {formatPrice(p.price_retail)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}
