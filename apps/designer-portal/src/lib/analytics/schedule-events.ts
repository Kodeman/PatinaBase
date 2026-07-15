/**
 * Schedule Spine telemetry (C7, §7 name-contract). Separate module from
 * document-events.ts — the Spine is a Slice 01+ surface behind its own
 * `schedule-spine` flag, not part of the Document's existing command-bar /
 * wayfinding / desk taxonomy. Follows document-events.ts's shape exactly:
 * module-local `track()` guarding `isAnalyticsEnabled()` → `posthog.capture`,
 * flat snake_case props.
 *
 * `spine_phase_unfolded` (Slice 01) and `rule_minimap_jump` (Slice 02) are
 * scaffolded here. Slice 03 (compose) adds `schedule_born` /
 * `schedule_phase_added` / `schedule_anchor_set` — fired from BOTH surfaces
 * (`surface: 'project'` on the Spine, `surface: 'proposal'` on PhaseBuilder;
 * the proposal side is NOT behind the `schedule-spine` flag, so these fire
 * there unconditionally). Every one of these three fires ONLY inside a
 * mutation's `onSuccess` — a failed write is never counted as a compose act.
 *
 * No-ops when PostHog is not initialized (the track() guard).
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const scheduleEvents = {
  /** §7 contract — a folded (closed/future) phase unfolded in the spine. */
  spinePhaseUnfolded: (props: {
    project_id: string;
    phase_id: string;
    phase_state: 'closed' | 'future';
    item_count: number;
    milestone_count: number;
  }) => track('spine_phase_unfolded', props),
  /** §7 contract — a Rule minimap control (label, diamond, or the Unplaced
   *  control) revealed a phase/milestone in the spine (Slice 02). */
  ruleMinimapJump: (p: {
    project_id: string;
    target_kind: 'phase' | 'milestone';
    phase_id: string;
    milestone_id?: string;
    from_pinned: boolean;
  }) => track('rule_minimap_jump', p),

  // ── Slice 03 (Compose) — the three birth/edit acts, both surfaces ──

  /** A schedule went from zero phases to its first one. Fired once per birth,
   *  from whichever starting point produced it (Patina Six / a past
   *  project's as-built chain / the blank ghost line's first commit). */
  scheduleBorn: (p: {
    surface: 'project' | 'proposal';
    project_id?: string;
    proposal_id?: string;
    kind: 'patina_six' | 'past_project' | 'blank';
    /** The source project's id — 'past_project' births only. */
    source_project_id?: string;
  }) => track('schedule_born', p),

  /** A phase was appended to an existing (or just-born) chain. */
  schedulePhaseAdded: (p: {
    surface: 'project' | 'proposal';
    project_id?: string;
    proposal_id?: string;
    via: 'ghost_line' | 'composer';
  }) => track('schedule_phase_added', p),

  /** A phase or milestone's anchor_date was set or cleared (the chip unpin). */
  scheduleAnchorSet: (p: {
    surface: 'project' | 'proposal';
    project_id?: string;
    proposal_id?: string;
    target: 'phase' | 'milestone';
    /** true = an anchor was set; false = unpinned (cleared). */
    set: boolean;
  }) => track('schedule_anchor_set', p),
};
