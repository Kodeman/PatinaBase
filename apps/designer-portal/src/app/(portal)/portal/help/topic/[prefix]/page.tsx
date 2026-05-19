'use client';

/**
 * Designer Portal — Help Center · Topic page (Layer 4 · Reference)
 *
 * Sprint 3 Stream E5 stub. Renders a topic-scoped view of the Help Center
 * driven by a `surfaceKey` prefix path-parameter. The prefix is URL-encoded
 * when linked from the Help Center index and decoded here before passing
 * to `RelatedArticles` / `HelpSearch`.
 *
 * Example URL:
 *   /portal/help/topic/designer-portal%2Faesthete
 *   → prefix = "designer-portal/aesthete"
 *
 * Component dependencies (parallel-built in Sprint 3, see /help index for note).
 */

import { useParams } from 'next/navigation';
import { HelpSearch, RelatedArticles } from '@patina/help-system';

export default function HelpTopicPage() {
  const { prefix } = useParams<{ prefix: string }>();
  const decodedPrefix = decodeURIComponent(prefix);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Topic: {decodedPrefix}</h1>
      </header>

      <HelpSearch placeholder={`Search within ${decodedPrefix}...`} />

      <RelatedArticles
        surfaceKeyPrefix={decodedPrefix}
        max={20}
        heading="Articles"
      />
    </div>
  );
}
