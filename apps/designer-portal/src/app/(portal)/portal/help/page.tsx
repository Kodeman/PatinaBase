'use client';

/**
 * Designer Portal — Help Center (Layer 4 · Reference)
 *
 * Sprint 3 Stream E5. The canonical destination users land on when they want
 * deep reference content. Combines HelpSearch + featured articles + by-category
 * browse. Reachable from the utility bar `?` panel and (Sprint 4) the
 * command palette.
 *
 * Spec refs:
 *   - docs/prds/Guide/patina-help-guidance-engineering-handoff.md §4 (Reference)
 *   - docs/prds/Guide/patina-help-guidance-engineering-handoff.md §13 (Help Center)
 *
 * Component dependencies (parallel-built in Sprint 3):
 *   - HelpSearch       — Stream E2
 *   - HelpArticle      — Stream E1
 *   - RelatedArticles  — Stream E4
 *
 * These components are imported from `@patina/help-system`. In the isolated
 * Sprint-3 E5 worktree the package barrel may not yet re-export them — that's
 * expected. Integration-wave merge resolves the imports without any code
 * change here.
 */

import { useEffect } from 'react';
import { HelpSearch, RelatedArticles } from '@patina/help-system';

const TOPIC_CATEGORIES: Array<{ label: string; prefix: string }> = [
  { label: 'Pipeline & Projects', prefix: 'designer-portal/pipeline' },
  { label: 'Aesthete Engine', prefix: 'designer-portal/aesthete' },
  { label: 'Products & Capture', prefix: 'designer-portal/products' },
  { label: 'Clients', prefix: 'designer-portal/clients' },
  { label: 'Activation Wizard', prefix: 'designer-portal/activation-wizard' },
];

export default function HelpCenterPage() {
  // Fire `help.help_center.viewed` once per page mount. snake_case per spec R11.
  // We intentionally use `window.posthog?.capture` rather than the typed
  // `helpEvents` taxonomy because `help_center` is a new event introduced by
  // E5 — it can be folded into the taxonomy in a follow-up without renaming.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const posthog = (window as unknown as {
      posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
    }).posthog;
    posthog?.capture('help.help_center.viewed', { source: 'page_view' });
  }, []);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Help Center</h1>
        <p className="text-muted-foreground mt-2">
          Search articles, browse by topic, or pick one of the featured guides below.
        </p>
      </header>

      <section aria-labelledby="search-heading">
        <h2 id="search-heading" className="sr-only">
          Search
        </h2>
        <HelpSearch placeholder="Search help articles..." />
      </section>

      <section aria-labelledby="featured-heading">
        <h2 id="featured-heading" className="text-xl font-semibold mb-4">
          Featured
        </h2>
        <RelatedArticles surfaceKeyPrefix="designer-portal" max={6} heading="" />
      </section>

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-xl font-semibold mb-4">
          By topic
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOPIC_CATEGORIES.map((category) => (
            <a
              key={category.prefix}
              href={`/portal/help/topic/${encodeURIComponent(category.prefix)}`}
              className="block p-4 border rounded-lg hover:border-foreground transition-colors"
            >
              <h3 className="font-medium">{category.label}</h3>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
