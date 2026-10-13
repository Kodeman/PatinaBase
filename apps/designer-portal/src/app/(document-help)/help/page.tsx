'use client';

/**
 * The Help Center index (R89, overhauled help-desk Wave 1) — `/help`,
 * paper-styled. Three shelves down the page:
 *
 *   1. A pinned walkthrough row — the six-stop Desk tour, replayable any time
 *      via `/desk?tour=desk-walkthrough`.
 *   2. FEATURED — the curated FEATURED_SURFACE_KEYS list via RelatedArticles'
 *      exact-keys mode. Articles are Sanity drafts until publish, so the list
 *      can settle empty; `RelatedArticles`' `onEmpty` callback swaps in one
 *      fallback line ("Featured guides arrive as they're written…") once the
 *      query resolves with nothing, rather than a `:has()` CSS gate watching
 *      the DOM for a testid that may never render.
 *   3. By topic — the 8 human HELP_TOPICS shelves (label + one-line
 *      description), each tile linking to the topic's FIRST prefix; the topic
 *      page fans out to the rest.
 *
 * Shell grammar is the Document's paper: flat ink edges, DM-mono eyebrows,
 * zero shadows (D4).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpSearch, RelatedArticles } from '@patina/help-system';
import { FEATURED_SURFACE_KEYS, HELP_TOPICS } from '@/lib/help-system/help-topics';
import { HELP_EVENTS, safeCapture } from '@/lib/help-system/help-events';

export default function HelpCenterPage() {
  // FEATURED is drafts-only today, so it can settle empty. `onEmpty` (fired
  // once the query resolves with nothing) drives the fallback copy below —
  // replaces the old `:has()` CSS gate, which watched the DOM instead of
  // asking the data.
  const [featuredEmpty, setFeaturedEmpty] = useState(false);
  const handleFeaturedEmpty = useCallback(() => setFeaturedEmpty(true), []);

  // Fire `help.help_center.viewed` once per mount (snake_case per spec R11).
  useEffect(() => {
    safeCapture(HELP_EVENTS.HELP_CENTER_VIEWED, { source: 'page_view' });
  }, []);

  // US-28 S6 — Sections of plain rows: no topic cards, no boxed links.
  return (
    <div>
      <section aria-labelledby="search-heading" className="mb-12 max-w-[560px]">
        <h2 id="search-heading" className="eb mb-2">
          Search help
        </h2>
        <HelpSearch placeholder="Search help articles…" />
      </section>

      {/* The pinned walkthrough row stands first in Featured guides, always. */}
      <section aria-labelledby="featured-heading" className="section">
        <SectionHead id="featured-heading">Featured guides</SectionHead>
        <div className="ledger">
          <ul className="rows">
            <li className="lrow plain">
              <p className="lname">
                <Link href="/desk?tour=desk-walkthrough" className="name t-d4">
                  The Desk walkthrough
                </Link>
              </p>
              <p className="lsent t-body-sm">Six stops around the Desk, about a minute.</p>
            </li>
          </ul>
        </div>
        {/* FEATURED — curated exact-keys list. Drafts-only today, so it can
            settle empty; `onEmpty` (fired once the query resolves) swaps in
            one sentence rather than hiding the section via a `:has()` watch. */}
        {featuredEmpty ? (
          <p className="t-body-sm mt-3 text-[var(--text-subtle)]">
            Featured guides arrive as they&apos;re written. Browse by topic below.
          </p>
        ) : (
          <RelatedArticles
            surfaceKeys={FEATURED_SURFACE_KEYS}
            fromSurfaceKey="help-center"
            max={FEATURED_SURFACE_KEYS.length}
            heading=""
            onEmpty={handleFeaturedEmpty}
          />
        )}
      </section>

      <section aria-labelledby="categories-heading" className="section">
        <SectionHead id="categories-heading">Browse topics</SectionHead>
        <div className="ledger">
          <ul className="rows">
            {HELP_TOPICS.map((topic) => (
              <li key={topic.label} className="lrow plain">
                <p className="lname">
                  <Link
                    href={`/help/topic/${encodeURIComponent(topic.prefixes[0])}`}
                    className="name t-d4"
                  >
                    {topic.label}
                  </Link>
                </p>
                <p className="lsent t-body-sm">{topic.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** A Section's eyebrow with the clay ornament (uplift (b)1). */
function SectionHead({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="sec-head">
      <h2 id={id} className="eb">
        <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
          <path d="M0 2h34M0 6h28M0 10h20" />
        </svg>
        <span>{children}</span>
      </h2>
    </div>
  );
}
