/**
 * Schedule Spine telemetry (C7, §7 name-contract). Separate module from
 * document-events.ts — the Spine is a Slice 01+ surface behind its own
 * `schedule-spine` flag, not part of the Document's existing command-bar /
 * wayfinding / desk taxonomy. Follows document-events.ts's shape exactly:
 * module-local `track()` guarding `isAnalyticsEnabled()` → `posthog.capture`,
 * flat snake_case props.
 *
 * `spine_phase_unfolded` (Slice 01) and `rule_minimap_jump` (Slice 02) are
 * scaffolded here; the rest of §7's contract belongs to later slices — do
 * not add events ahead of the UI that fires them.
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
};
