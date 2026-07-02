'use client';

/**
 * The Help Center · Topic page (R89) — re-homed to `/help/topic/[prefix]`,
 * paper-styled. Ported from `app/(portal)/portal/help/topic/[prefix]/page.tsx`.
 * The `surfaceKey` prefix is URL-encoded when linked and decoded here.
 */

import { useParams } from 'next/navigation';
import { HelpSearch, RelatedArticles } from '@patina/help-system';

export default function HelpTopicPage() {
  const { prefix } = useParams<{ prefix: string }>();
  const decodedPrefix = decodeURIComponent(prefix);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Topic
        </p>
        <h1 className="mt-1 font-heading text-[24px] font-medium text-[var(--color-charcoal)]">
          {decodedPrefix}
        </h1>
      </div>

      <HelpSearch placeholder={`Search within ${decodedPrefix}…`} />

      <RelatedArticles surfaceKeyPrefix={decodedPrefix} max={20} heading="Articles" />
    </div>
  );
}
