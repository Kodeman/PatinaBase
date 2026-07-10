/**
 * Help Center topic-page model (help-desk Wave 1) — the pure logic behind
 * `/help/topic/[prefix]`, extracted so the mapping is unit-testable without
 * rendering the page.
 *
 * A topic spans MULTIPLE surface-key prefixes (see help-topics.ts), but the
 * route stays `/help/topic/[prefix]` so old deep links keep resolving. Given
 * the decoded prefix from the URL:
 *
 *   - `topicForPrefix`     — the HELP_TOPICS shelf the prefix files under
 *                            (at-or-below one of its prefixes), or null.
 *   - `prefixSectionLabel` — a quiet human label for one prefix's sub-section
 *                            ('designer-portal/document/the-post' → 'The Post')
 *                            so a raw key never renders as a heading.
 *
 * Plain data + string logic, no @patina/help-system barrel import (jest/ESM
 * rationale in document-surface-keys.ts).
 */

import { HELP_TOPICS, type HelpTopic } from './help-topics';

/** True when `key` is `prefix` itself or a descendant (`prefix/…`) — segment
 *  boundaries, never bare startsWith (mirrors help-topics.ts). */
function underPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

/**
 * The topic a decoded URL prefix belongs to: the shelf owning the LONGEST
 * matching prefix (so a deeper claim beats a shallower one, mirroring
 * topicLabelFor). Returns null when no shelf claims it — the page then falls
 * back to a single plain article list for that prefix.
 */
export function topicForPrefix(prefix: string): HelpTopic | null {
  let best: { topic: HelpTopic; length: number } | null = null;
  for (const topic of HELP_TOPICS) {
    for (const p of topic.prefixes) {
      if (underPrefix(prefix, p) && (!best || p.length > best.length)) {
        best = { topic, length: p.length };
      }
    }
  }
  return best?.topic ?? null;
}

/**
 * Sub-section label for one prefix inside a topic — the last path segment,
 * kebab split, title-cased: '…/the-post' → 'The Post', '…/command-bar' →
 * 'Command Bar'. Never returns the raw key.
 */
export function prefixSectionLabel(prefix: string): string {
  const tail = prefix.split('/').filter(Boolean).pop() ?? '';
  const words = tail.split('-').filter(Boolean);
  if (words.length === 0) return 'Articles';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
