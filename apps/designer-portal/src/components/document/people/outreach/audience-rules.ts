/**
 * Audience ↔ directory wiring (R53 / Track D).
 *
 * An Outreach audience is a slice of the SAME unified directory the Room is
 * built on (people_directory). Rather than invent a parallel segmentation
 * vocabulary, audiences segment by the four directory axes Leah already reads:
 * ROLE, STATUS (lifecycle), HISTORY (recency of last touch), and TRUST (revenue,
 * completed projects, satisfaction — the same trust signal the nurture queue
 * ranks on). The live preview count runs over the directory rows in memory, so
 * "who is in it" is always honest against the roster on screen.
 *
 * Pure logic — no React, no I/O — so it can be unit-tested and reused by the
 * preview and the create payload alike.
 */

import type { PeopleDirectoryRow, PartyRole } from '@patina/supabase';
import type { SegmentRules } from '@patina/shared/types';

const DAY_MS = 86_400_000;

/** A directory-grounded audience rule: a filter over a single directory axis. */
export type AudienceAxis = 'role' | 'status' | 'history' | 'trust';

export interface AudienceRule {
  /** Which directory facet this constrains. */
  axis: AudienceAxis;
  /** A short mono label for the chip (e.g. "Clients", "Past clients"). */
  label: string;
  /** The predicate over a directory row. */
  match: (p: PeopleDirectoryRow, now: Date) => boolean;
  /** Equivalent server-side SegmentRules conditions (best-effort mapping for the
   *  create payload — the live count is always the directory source of truth). */
  conditions: SegmentRules['conditions'];
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY_MS);
}

/** The "trust" signal — the same blend the nurture queue ranks on. */
export function trustScore(p: PeopleDirectoryRow): number {
  return (
    num(p.meta?.['total_revenue']) / 100_000 +
    num(p.meta?.['total_projects']) +
    num(p.meta?.['satisfaction_score'])
  );
}

const roleRule = (role: PartyRole, label: string): AudienceRule => ({
  axis: 'role',
  label,
  match: (p) => p.role === role,
  conditions: [{ field: 'role', operator: 'eq', value: role }],
});

const statusRule = (
  label: string,
  statuses: string[],
  role?: PartyRole,
): AudienceRule => ({
  axis: 'status',
  label,
  match: (p) => (role ? p.role === role : true) && statuses.includes(p.status_raw ?? ''),
  // status_raw has no single SegmentField; we approximate with has_active_project
  // for "active" and leave the rest to the directory-grounded live count.
  conditions: statuses.includes('active')
    ? [{ field: 'has_active_project', operator: 'eq', value: true }]
    : [],
});

/** Past clients quiet ≥ N days (HISTORY axis). */
const historyDormantRule = (label: string, minDays: number): AudienceRule => ({
  axis: 'history',
  label,
  match: (p, now) => {
    if (p.role !== 'client') return false;
    const status = p.status_raw ?? '';
    if (status !== 'completed' && status !== 'nurture') return false;
    const d = daysSince(p.last_touch_at, now);
    return d != null && d >= minDays;
  },
  conditions: [{ field: 'last_active_at', operator: 'older_than', value: `${minDays}d` }],
});

/** High-trust clients (TRUST axis) — referrers, high-revenue, well-rated. */
const trustRule = (label: string, minTrust: number): AudienceRule => ({
  axis: 'trust',
  label,
  match: (p) => p.role === 'client' && trustScore(p) >= minTrust,
  conditions: [{ field: 'engagement_tier', operator: 'eq', value: 'high' }],
});

const foundingMakerRule: AudienceRule = {
  axis: 'trust',
  label: 'Founding Circle makers',
  match: (p) => p.role === 'maker' && Boolean(p.meta?.['founding_circle']),
  conditions: [{ field: 'founding_circle', operator: 'eq', value: true }],
};

/**
 * The directory-grounded audience presets, in the prototype's order. Each is a
 * named slice of the roster Leah can preview live and then save as a segment.
 */
export const AUDIENCE_PRESETS: ReadonlyArray<{ key: string; name: string; rule: AudienceRule }> = [
  { key: 'past_clients', name: 'Past clients', rule: historyDormantRule('Past clients', 1) },
  { key: 'active_leads', name: 'Active leads', rule: roleRule('lead', 'Active leads') },
  { key: 'founding_makers', name: 'Founding Circle makers', rule: foundingMakerRule },
  { key: 'high_trust', name: 'High-trust clients', rule: trustRule('High-trust referrers', 3) },
  { key: 'active_clients', name: 'Active-project clients', rule: statusRule('Active', ['active'], 'client') },
  { key: 'all_clients', name: 'All clients', rule: roleRule('client', 'Clients') },
  { key: 'all_makers', name: 'All makers', rule: roleRule('maker', 'Makers') },
];

/** The live count of a rule against the directory rows — the source of truth
 *  for "who is in this audience" (always honest against the roster on screen). */
export function countAudience(
  rule: AudienceRule,
  people: PeopleDirectoryRow[],
  now: Date,
): number {
  return people.reduce((n, p) => (rule.match(p, now) ? n + 1 : n), 0);
}

/** A human description of who a preset draws in (shown under its name). */
export function describeAudience(rule: AudienceRule): string {
  switch (rule.axis) {
    case 'role':
      return 'by role · the directory';
    case 'status':
      return 'by lifecycle status · the directory';
    case 'history':
      return 'by recency of last touch · the directory';
    case 'trust':
      return 'by trust — revenue, projects, rating · the directory';
  }
}

/** The SegmentRules payload for persisting a preset as a saved segment. */
export function presetToSegmentRules(rule: AudienceRule): SegmentRules {
  return { logic: 'and', conditions: rule.conditions };
}
