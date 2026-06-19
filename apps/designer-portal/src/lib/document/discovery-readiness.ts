/**
 * Discovery readiness — ruling R66 (Track 6, Slice 5).
 *
 * The Discovery section is a self-composing body (R40): eight blocks fill in
 * any order, the Strata Mark is the only progress device, and "successful
 * discovery" = the FIVE STRUCTURED ESSENTIALS captured → "ready for Direction"
 * (a soft gate — authoring is never blocked; only the Begin-the-Direction act
 * and the seed RPC require the five).
 *
 * Pure: derives each block's done-state, the essential count, readiness, and
 * the local Strata fill for the readiness header. Mirrors the server gate in
 * begin_direction_from_discovery (00224) so the UI and the RPC agree.
 */

import type { FillState } from './fill-state';

/** The subset of client_discovery the readiness gate reads (arrays pre-parsed). */
export interface DiscoveryFacts {
  project_type: string | null;
  rooms: unknown[];
  budget_max_cents: number | null;
  target_date: string | null;
  hard_date: string | null;
  style_tag_ids: string[];
  style_keywords: string[];
  lifestyle: unknown[];
  keep_items: unknown[];
  avoid_items: unknown[];
  decision_makers: unknown[];
  room_scan_id: string | null;
  site_notes: string | null;
}

export type EssentialKey = 'scope' | 'budget' | 'timeline' | 'style' | 'lifestyle';
export type DeepeningKey = 'keep_avoid' | 'deciders' | 'site_scan';
export type BlockKey = EssentialKey | DeepeningKey;

export const ESSENTIAL_KEYS: EssentialKey[] = [
  'scope',
  'budget',
  'timeline',
  'style',
  'lifestyle',
];
export const DEEPENING_KEYS: DeepeningKey[] = ['keep_avoid', 'deciders', 'site_scan'];
export const ALL_BLOCK_KEYS: BlockKey[] = [...ESSENTIAL_KEYS, ...DEEPENING_KEYS];

export interface DiscoveryReadiness {
  /** Per-block completion (drives the ✓ tick + filled style). */
  done: Record<BlockKey, boolean>;
  /** 0..5 — how many essentials are captured. */
  essentialsDone: number;
  /** All five essentials captured → the Begin-the-Direction CTA enables. */
  ready: boolean;
  /** Local Strata fill for the readiness header: [essentials, depth, ready]. */
  fill: FillState;
}

function len(v: unknown[]): number {
  return Array.isArray(v) ? v.length : 0;
}

/** Each block's done-state. Essentials gate readiness; deepening never does. */
export function deriveBlockDone(f: DiscoveryFacts): Record<BlockKey, boolean> {
  return {
    scope: !!(f.project_type && f.project_type.trim()) && len(f.rooms) > 0,
    budget: f.budget_max_cents != null,
    timeline: !!(f.target_date || f.hard_date),
    style: (f.style_tag_ids?.length ?? 0) > 0 || (f.style_keywords?.length ?? 0) > 0,
    lifestyle: len(f.lifestyle) > 0,
    keep_avoid: len(f.keep_items) > 0 || len(f.avoid_items) > 0,
    deciders: len(f.decision_makers) > 0,
    site_scan: !!f.room_scan_id || !!(f.site_notes && f.site_notes.trim()),
  };
}

export function deriveDiscoveryReadiness(f: DiscoveryFacts): DiscoveryReadiness {
  const done = deriveBlockDone(f);
  const essentialsDone = ESSENTIAL_KEYS.reduce((n, k) => n + (done[k] ? 1 : 0), 0);
  const allDone = ALL_BLOCK_KEYS.reduce((n, k) => n + (done[k] ? 1 : 0), 0);
  const ready = essentialsDone === ESSENTIAL_KEYS.length;
  const fill: FillState = [
    essentialsDone / ESSENTIAL_KEYS.length,
    allDone / ALL_BLOCK_KEYS.length,
    ready ? 1 : 0,
  ];
  return { done, essentialsDone, ready, fill };
}
