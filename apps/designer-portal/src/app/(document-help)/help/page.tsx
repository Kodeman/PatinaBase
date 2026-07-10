'use client';

/**
 * The Help Center index (R89, overhauled help-desk Wave 1) — `/help`,
 * paper-styled. Three shelves down the page:
 *
 *   1. A pinned walkthrough row — the six-stop Desk tour, replayable any time
 *      via `/desk?tour=desk-walkthrough`.
 *   2. FEATURED — the curated FEATURED_SURFACE_KEYS list via RelatedArticles'
 *      exact-keys mode. Articles are Sanity drafts until publish, so the list
 *      can be empty — the whole section (eyebrow included) stays hidden until
 *      it has something to show (`:has()` gate; RelatedArticles renders
 *      nothing when empty).
 *   3. By topic — the 8 human HELP_TOPICS shelves (label + one-line
 *      description), each tile linking to the topic's FIRST prefix; the topic
 *      page fans out to the rest.
 *
 * Shell grammar is the Document's paper: flat ink edges, DM-mono eyebrows,
 * zero shadows (D4).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { HelpSearch, RelatedArticles } from '@patina/help-system';
import { FEATURED_SURFACE_KEYS, HELP_TOPICS } from '@/lib/help-system/help-topics';

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

      {/* Pinned walkthrough row — always present, above Featured. */}
      <section aria-label="The Desk walkthrough">
        <Link
          href="/desk?tour=desk-walkthrough"
          className="flex items-baseline justify-between gap-4 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-4 py-3.5 transition-colors hover:border-[var(--color-clay)]"
        >
          <span className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
            The Desk walkthrough
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            about a minute
          </span>
        </Link>
      </section>

      {/* FEATURED — curated exact-keys list. Hidden entirely (eyebrow too)
          while RelatedArticles has nothing to render: drafts-only today. */}
      <section
        aria-labelledby="featured-heading"
        className="space-y-3 [&:not(:has([data-testid=related-articles]))]:hidden"
      >
        <p
          id="featured-heading"
          className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
        >
          Featured
          <span className="h-px flex-1 bg-[var(--color-pearl)]" />
        </p>
        <RelatedArticles
          surfaceKeys={FEATURED_SURFACE_KEYS}
          fromSurfaceKey="help-center"
          max={FEATURED_SURFACE_KEYS.length}
          heading=""
        />
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
          {HELP_TOPICS.map((topic) => (
            <Link
              key={topic.label}
              href={`/help/topic/${encodeURIComponent(topic.prefixes[0])}`}
              className="block rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-4 py-3.5 transition-colors hover:border-[var(--color-clay)]"
            >
              <span className="font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
                {topic.label}
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
                {topic.description}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
