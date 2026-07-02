'use client';

/**
 * The Help Center · Article page (R89) — re-homed to `/help/[surfaceKey]`,
 * paper-styled. Ported from `app/(portal)/portal/help/[surfaceKey]/page.tsx`.
 * The `surfaceKey` path-parameter is URL-encoded when linked and decoded here
 * before being handed to <HelpArticle />. `source="help_center"` records that
 * the open originated from the Help Center rather than the in-context panel.
 */

import { useParams } from 'next/navigation';
import { HelpArticle, RelatedArticles } from '@patina/help-system';

export default function HelpArticlePage() {
  const { surfaceKey } = useParams<{ surfaceKey: string }>();
  const decoded = decodeURIComponent(surfaceKey);

  return (
    <article>
      <HelpArticle
        surfaceKey={decoded}
        source="help_center"
        renderRelated={(ids: string[]) => <RelatedArticles articleIds={ids} />}
      />
    </article>
  );
}
