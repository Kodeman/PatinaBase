'use client';

/**
 * Designer Portal — Help Center · Article page (Layer 4 · Reference)
 *
 * Sprint 3 Stream E5. Direct-URL surface for a single help article keyed
 * by `surfaceKey`. The `surfaceKey` path-parameter is URL-encoded when
 * linked from anywhere in the system, then decoded here before being
 * handed off to `<HelpArticle />`.
 *
 * Example URL:
 *   /portal/help/designer-portal%2Faesthete%2Foverview
 *   → surfaceKey = "designer-portal/aesthete/overview"
 *
 * `source="help_center"` is forwarded to the article so the
 * `help.article.opened` analytics event records that the open originated
 * from the Help Center rather than the in-context panel.
 *
 * Component dependencies (parallel-built in Sprint 3, see /help index for note).
 */

import { useParams } from 'next/navigation';
import { HelpArticle, RelatedArticles } from '@patina/help-system';

export default function HelpArticlePage() {
  const { surfaceKey } = useParams<{ surfaceKey: string }>();
  const decoded = decodeURIComponent(surfaceKey);

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <HelpArticle
        surfaceKey={decoded}
        source="help_center"
        renderRelated={(ids: string[]) => <RelatedArticles articleIds={ids} />}
      />
    </div>
  );
}
