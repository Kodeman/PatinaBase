/**
 * Feedback layer shared vocabulary + context capture
 * (docs/ledger/patina-feedback-layer-prd.md). The four buckets, the status
 * lifecycle, and the auto-captured context (§8) live here so the button, sheet,
 * ledger, and loop all read the same source. Pure/derivable pieces are unit-
 * tested (no React, no field-primitives import — see the jest ESM gotcha).
 *
 * Colors map the PRD's four buckets onto the document's charcoal/paper palette
 * (the screens HTML's verdigris/brass was illustrative only).
 */

import type {
  FeedbackBucket,
  FeedbackEvent,
  FeedbackStatus,
  FeedbackWeight,
} from '@patina/supabase';

export interface BucketMeta {
  key: FeedbackBucket;
  label: string;
  glyph: string;
  /** CSS custom property carrying the bucket hue. */
  colorVar: string;
  /** Placeholder that adapts to the chosen bucket (R7.2.2). */
  placeholder: string;
}

export const BUCKETS: BucketMeta[] = [
  {
    key: 'working',
    label: 'Working',
    glyph: '✓',
    colorVar: 'var(--color-sage)',
    placeholder: "What feels good and should never break?",
  },
  {
    key: 'not_working',
    label: 'Not working',
    glyph: '✕',
    colorVar: 'var(--color-terracotta)',
    placeholder: 'What tripped you up, broke, or confused you?',
  },
  {
    key: 'missing',
    label: 'Missing',
    glyph: '+',
    colorVar: 'var(--color-golden-hour)',
    placeholder: 'What do you wish it could do?',
  },
  {
    key: 'change',
    label: 'Change',
    glyph: '↻',
    colorVar: 'var(--color-clay)',
    placeholder: 'Right idea, wrong execution — what would you change?',
  },
];

const BUCKET_BY_KEY: Record<FeedbackBucket, BucketMeta> = BUCKETS.reduce(
  (acc, b) => ((acc[b.key] = b), acc),
  {} as Record<FeedbackBucket, BucketMeta>,
);

export function bucketMeta(key: FeedbackBucket): BucketMeta {
  return BUCKET_BY_KEY[key];
}

export interface StatusMeta {
  key: FeedbackStatus;
  label: string;
  colorVar: string;
}

export const STATUSES: StatusMeta[] = [
  { key: 'noted', label: 'Noted', colorVar: 'var(--text-muted)' },
  { key: 'building', label: 'Building', colorVar: 'var(--color-golden-hour)' },
  { key: 'shipped', label: 'Shipped', colorVar: 'var(--color-sage)' },
  { key: 'archived', label: 'Archived', colorVar: 'var(--text-muted)' },
];

const STATUS_BY_KEY: Record<FeedbackStatus, StatusMeta> = STATUSES.reduce(
  (acc, s) => ((acc[s.key] = s), acc),
  {} as Record<FeedbackStatus, StatusMeta>,
);

export function statusMeta(key: FeedbackStatus): StatusMeta {
  return STATUS_BY_KEY[key];
}

export const WEIGHTS: { key: FeedbackWeight; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'med', label: 'Med' },
  { key: 'high', label: 'High' },
];

export const WEIGHT_RANK: Record<FeedbackWeight, number> = { high: 3, med: 2, low: 1 };

/** Filled dot count (of 3) for a note's weight; unweighted = 0. */
export function weightDots(weight: FeedbackWeight | null | undefined): number {
  return weight ? WEIGHT_RANK[weight] : 0;
}

/**
 * A human-readable screen name from the document-model pathname (R7.2.3) — the
 * same route→label shape as studio-drawer's breadcrumbFor, kept here so context
 * capture is self-contained and testable.
 */
export function screenNameFromPath(pathname: string | null | undefined): string {
  const p = pathname ?? '';
  if (p === '/desk' || p === '/') return 'The Desk';
  if (p.startsWith('/library')) return 'Library';
  if (p.startsWith('/drafting')) return 'Drafting Room';
  if (p.startsWith('/compose')) return 'Composing';
  if (p.startsWith('/doc')) return 'Document';
  if (p.startsWith('/people')) return 'People';
  if (p.startsWith('/help')) return 'Help';
  const last = p.split('/').filter(Boolean).pop();
  if (!last) return 'Portal';
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
}

export interface TimelineEntry {
  label: string;
  when: string;
  now: boolean;
}

/**
 * The note's status timeline (R7.5.3): "Noted" at creation, then each
 * status_change event in order; the final entry is "now". Pure — unit-tested.
 */
export function buildTimeline(
  createdAt: string,
  status: FeedbackStatus,
  events: FeedbackEvent[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [{ label: 'Noted', when: createdAt, now: false }];
  for (const e of events) {
    if (e.kind !== 'status_change') continue;
    const to = e.payload?.to as FeedbackStatus | undefined;
    if (!to || to === 'noted') continue;
    entries.push({ label: statusMeta(to).label, when: e.created_at, now: false });
  }
  const last = entries[entries.length - 1];
  if (last.label.toLowerCase() !== status) {
    entries.push({ label: statusMeta(status).label, when: createdAt, now: true });
  } else {
    last.now = true;
  }
  return entries;
}

export interface CapturedContext {
  screen_name: string;
  route: string;
  app_version: string;
  viewport: string;
}

/** Auto-capture the note's origin (§8). Never types where she is. */
export function captureContext(pathname: string | null | undefined): CapturedContext {
  const route = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';
  return {
    screen_name: screenNameFromPath(route),
    route,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    viewport,
  };
}

/**
 * Capture the underlying screen as it is right now (R7.2.4), excluding the
 * feedback layer itself (nodes tagged data-feedback-layer) so the shot is the
 * screen, never the button or sheet. Best-effort: returns null on any failure
 * so a note is never lost to a screenshot error.
 */
export async function captureScreenshot(): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { domToBlob } = await import('modern-screenshot');
    return await domToBlob(document.body, {
      type: 'image/png',
      // Halve device-pixel-ratio work; a feedback shot doesn't need retina.
      scale: 1,
      filter: (node: Node) =>
        !(node instanceof HTMLElement && node.hasAttribute('data-feedback-layer')),
    });
  } catch {
    return null;
  }
}
