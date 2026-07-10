'use client';

/**
 * The Help Center · Topic page (R89, overhauled help-desk Wave 1) —
 * `/help/topic/[prefix]`, paper-styled.
 *
 * A topic spans MULTIPLE surface-key prefixes (help-topics.ts) but the route
 * keeps the single-prefix param so every old deep link still resolves. The
 * page titles itself with the topic's human label (`topicLabelFor` — a raw
 * key NEVER renders as the title; it stays as the small DM-mono eyebrow).
 * When the decoded prefix belongs to a HELP_TOPICS shelf, the page renders
 * the topic's FULL article set — one quiet sub-section per prefix, each its
 * own RelatedArticles list, hidden while empty (drafts-only today). A prefix
 * no shelf claims falls back to the single plain list it always had.
 */

import { useParams } from 'next/navigation';
import { HelpSearch, RelatedArticles } from '@patina/help-system';
import { topicLabelFor } from '@/lib/help-system/help-topics';
import { prefixSectionLabel, topicForPrefix } from '@/lib/help-system/help-topic-page';

export default function HelpTopicPage() {
  const { prefix } = useParams<{ prefix: string }>();
  const decodedPrefix = decodeURIComponent(prefix);

  const topic = topicForPrefix(decodedPrefix);
  const title = topicLabelFor(decodedPrefix);
  // The topic's full fan-out when a shelf claims the prefix; otherwise the
  // lone prefix the deep link asked for.
  const prefixes = topic ? topic.prefixes : [decodedPrefix];

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {decodedPrefix}
        </p>
        <h1 className="mt-1 font-heading text-[24px] font-medium text-[var(--color-charcoal)]">
          {title}
        </h1>
        {topic ? (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            {topic.description}
          </p>
        ) : null}
      </div>

      <HelpSearch placeholder={`Search within ${title}…`} />

      {prefixes.length === 1 ? (
        <RelatedArticles surfaceKeyPrefix={prefixes[0]} max={20} heading="Articles" />
      ) : (
        prefixes.map((sectionPrefix) => (
          // One quiet sub-section per prefix in the topic. RelatedArticles
          // renders nothing while a prefix has no published articles, so the
          // `:has()` gate keeps the sub-heading hidden with it.
          <section
            key={sectionPrefix}
            aria-label={prefixSectionLabel(sectionPrefix)}
            className="space-y-3 [&:not(:has([data-testid=related-articles]))]:hidden"
          >
            <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {prefixSectionLabel(sectionPrefix)}
              <span className="h-px flex-1 bg-[var(--color-pearl)]" />
            </p>
            <RelatedArticles surfaceKeyPrefix={sectionPrefix} max={20} heading="" />
          </section>
        ))
      )}
    </div>
  );
}
