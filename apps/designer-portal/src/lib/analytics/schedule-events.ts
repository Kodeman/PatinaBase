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
 * Slice 04 (adjust) adds `schedule_edit_committed` — one previewed time edit
 * committed through the ripple's confirm strip, fired ONLY inside the commit
 * mutation's `onSuccess` (project surface only; a reverted edit never fires).
 *
 * Slice 05 (memory) adds `schedule_revision_cut` — a numbered
 * `schedule_revisions` row was cut (00326's `cut_schedule_revision`, the ONE
 * writer to that ledger). DEF ONLY here — S5-2 defines the event, S5-3 wires
 * the call site: the confirm strip's commit mutation `onSuccess` (mirrors
 * `scheduleEditCommitted`'s placement), reading `v` off `useCommitScheduleEdit`'s
 * now-numeric return value and firing with `trigger: 'edit'`. The
 * `trigger: 'signature'` case (v1, cut inside `activate_proposal_as_project`
 * on the client's signing flow) has no designer-portal call site — a future
 * slice may wire it from wherever the signature flow's success path lives, if
 * that surface should also see the cut. Both cases fire ONLY on a successful
 * cut; there is no failure path that fires with a stale `v`.
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

  // ── Slice 04 (Adjust — the ripple) — a previewed time edit committed ──

  /** A time edit was committed through the ripple's confirm strip (R100 —
   *  "Nothing moves until Commit"). Fires ONLY inside the commit mutation's
   *  `onSuccess`: a reverted (Esc) or failed edit is never counted. `surface`
   *  names the edit origin — `'rule'` (a boundary/diamond drag on the Rule) or
   *  `'spine'` (an inline date field in a phase meta line). `edit_kind` mirrors
   *  `RipplePendingEdit['kind']`; `ripple_size` is the diff's `rippleSize`
   *  (phases + milestones moved); `conflict_count` is the committed edit's
   *  remaining conflict count (an anchor-violating edit cannot commit, so this
   *  is only ever the non-blocking residue). Project-side only — no proposal
   *  surface edits a live schedule. */
  scheduleEditCommitted: (p: {
    project_id: string;
    surface: 'rule' | 'spine';
    edit_kind:
      | 'phase-duration'
      | 'phase-anchor'
      | 'milestone-offset'
      | 'milestone-anchor';
    ripple_size: number;
    conflict_count: number;
  }) => track('schedule_edit_committed', p),

  // ── Slice 05 (Memory, R100) — a numbered revision was cut ──

  /** A `schedule_revisions` row was cut (00326's `cut_schedule_revision`, the
   *  ONE writer to that append-only ledger). `v` is the newly cut revision's
   *  number (returned by the RPC — `activate_proposal_as_project` for
   *  `trigger: 'signature'`, `commit_schedule_edit` for `trigger: 'edit'`).
   *  Def only in S5-2; S5-3 wires the `trigger: 'edit'` call site into the
   *  ripple's confirm-strip commit mutation `onSuccess` (see module banner). */
  scheduleRevisionCut: (p: { project_id: string; v: number; trigger: 'signature' | 'edit' }) =>
    track('schedule_revision_cut', p),
};
