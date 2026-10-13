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
    // US-28 S6 — the topic's title, the search, then a Section per prefix.
    <div>
      <div className="mb-8">
        <p className="eb">{decodedPrefix}</p>
        <h1 className="t-d2 mt-2">{title}</h1>
        {topic ? (
          <p className="t-body-sm mt-2 max-w-[64ch] text-[var(--text-muted)]">
            {topic.description}
          </p>
        ) : null}
      </div>

      <div className="mb-12 max-w-[560px]">
        <HelpSearch placeholder={`Search within ${title}…`} />
      </div>

      {prefixes.length === 1 ? (
        <RelatedArticles surfaceKeyPrefix={prefixes[0]} max={20} heading="Articles" />
      ) : (
        prefixes.map((sectionPrefix) => (
          // One Section per prefix in the topic. RelatedArticles renders
          // nothing while a prefix has no published articles, so the `:has()`
          // gate keeps the Section hidden with it.
          <section
            key={sectionPrefix}
            aria-label={prefixSectionLabel(sectionPrefix)}
            className="section [&:not(:has([data-testid=related-articles]))]:hidden"
          >
            <div className="sec-head">
              <p className="eb">
                <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
                  <path d="M0 2h34M0 6h28M0 10h20" />
                </svg>
                <span>{prefixSectionLabel(sectionPrefix)}</span>
              </p>
            </div>
            <RelatedArticles surfaceKeyPrefix={sectionPrefix} max={20} heading="" />
          </section>
        ))
      )}
    </div>
  );
}
