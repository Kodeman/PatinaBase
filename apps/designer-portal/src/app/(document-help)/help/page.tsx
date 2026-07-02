'use client';

/**
 * The Help Center index (R89) — re-homed to `/help`, paper-styled.
 * Ported from `app/(portal)/portal/help/page.tsx`: HelpSearch + featured +
 * by-topic browse. The reference components render their own content; the shell
 * (eyebrows, topic cards, links) is the Document's paper grammar — flat ink
 * edges, DM-mono labels, zero shadows (D4). Topic links point at `/help/...`.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { HelpSearch, RelatedArticles } from '@patina/help-system';

const TOPIC_CATEGORIES: Array<{ label: string; prefix: string }> = [
  { label: 'Pipeline & Projects', prefix: 'designer-portal/pipeline' },
  { label: 'The Document', prefix: 'designer-portal/document' },
  { label: 'Aesthete Engine', prefix: 'designer-portal/aesthete' },
  { label: 'Products & Capture', prefix: 'designer-portal/products' },
  { label: 'Clients', prefix: 'designer-portal/clients' },
  { label: 'Activation Wizard', prefix: 'designer-portal/activation-wizard' },
];

export default function HelpCenterPage() {
  // Fire `help.help_center.viewed` once per mount (snake_case per spec R11).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const posthog = (
      window as unknown as {
        posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
      }
    ).posthog;
    posthog?.capture('help.help_center.viewed', { source: 'page_view' });
  }, []);

  return (
    <div className="space-y-10">
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
        Search the articles, browse by topic, or start with one of the featured guides.
      </p>

      <section aria-labelledby="search-heading">
        <h2 id="search-heading" className="sr-only">
          Search
        </h2>
        <HelpSearch placeholder="Search help articles…" />
      </section>

      <section aria-labelledby="featured-heading" className="space-y-3">
        <p
          id="featured-heading"
          className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
        >
          Featured
          <span className="h-px flex-1 bg-[var(--color-pearl)]" />
        </p>
        <RelatedArticles surfaceKeyPrefix="designer-portal" max={6} heading="" />
      </section>

      <section aria-labelledby="categories-heading" className="space-y-3">
        <p
          id="categories-heading"
          className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
        >
          By topic
          <span className="h-px flex-1 bg-[var(--color-pearl)]" />
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TOPIC_CATEGORIES.map((category) => (
            <Link
              key={category.prefix}
              href={`/help/topic/${encodeURIComponent(category.prefix)}`}
              className="block rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-4 py-3.5 transition-colors hover:border-[var(--color-clay)]"
            >
              <span className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
                {category.label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
