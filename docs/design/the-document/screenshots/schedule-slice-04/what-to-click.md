# Slice 04 — Adjust · what to click

Flag `schedule-spine` stays **OFF** in production. This is the **fourth** screenshot drop —
per R104 (the continuous-execution ruling), the per-slice review gate stays superseded through
Slice 05: this drop joins Slice 01's, Slice 02's, and Slice 03's for one **consolidated
review**, not a per-slice go/no-go.

## Drive it locally

```
apps/designer-portal/.env.local → NEXT_PUBLIC_FLAG_OVERRIDES=schedule-spine:true,the-document-pilot:true
pnpm supabase:start && pnpm --filter @patina/designer-portal dev
designer@patina.dev / password123
```
Project spine + Rule: `/doc/[projectId]` on a chained, anchored project — Aspen Loft Refresh
(`b0000000-0000-0000-0000-0000000000d1`) is the walked specimen: Schematic Design → Design
Development (follows SD) and Procurement & Orders (thread, follows SD) → Installation &
Styling (anchored) → Completion. Drag the Rule's two internal boundary ticks or its milestone
diamonds; type into a phase's "Edit dates" duration/anchor fields on the spine. Either surface
opens the same confirm strip.

## Screenshots

| File | What it shows |
|---|---|
| `ripple-drag-ghosts.png` | Mid-drag on the Schematic Design↔Design Development boundary (+5d): dashed-terracotta ghost ticks, ghost diamonds, and per-phase ghost-line meta ("→ JUN 11 – JUL 7", "→ JUL 7 – AUG 4") all render over the solid committed layers underneath, plus the confirm strip open below. |
| `confirm-strip.png` | The confirm strip alone, mid-preview: bold lead "Schematic Design +5d", the follow/hold clauses ("2 phases follow · Installation & Styling holds Aug 25"), "Esc · Revert" and "Commit the change". |
| `confirm-strip-conflict.png` | Same boundary dragged further (+14d, to a duration that overruns the anchor): the terracotta conflict clause appended — "The chain projects Sep 1 — 7 days past Installation & Styling" — and Commit disabled. |
| `anchored-refuse-nudge.png` | Mid-drag-attempt on the anchored "Install day" milestone diamond: the transient terracotta nudge "Install day is anchored — unpin to move it", no ghost, no session begun. |
| `spine-field-ripple.png` | The spine's own "Set phase duration" field (absolute grammar, "31d") mid-preview: downstream ghost-line meta on Design Development and Procurement & Orders, the same confirm strip as the Rule-driven edit. |
| `milestone-drag.png` | Mid-drag on the (unanchored) "Design Development sign-off" diamond, offset −3 → +2 (+5d): the strip's sentence "Design Development sign-off → Aug 6 · Schematic Design holds Jun 11 · Installation & Styling holds Aug 24". |
| `post-commit.png` | Aspen after every committed edit this walk: Schematic Design 26d/anchored Jun 11, Design Development 28d, Installation & Styling anchored Aug 26 with "8 days slack", Completion following — all solid, no ghosts, no strip. |
| `gate-off.png` | `schedule-spine:false` — Rule/Spine/confirm-strip sections all count zero; the old PhaseTimeline band ("THE SCHEDULE") renders in their place, byte-identical to pre-Slice-01, unaffected by this slice's own committed mutations. |
| `mobile-390.png` | Aspen's Rule + spine at 390px, gate on. |

(The floating "Error / An unexpected error occurred" toast + "1 Issue" badge visible in the
bottom-right/left of several captures is a pre-existing local-dev artifact, present
identically in gate-on AND gate-off captures regardless of any schedule interaction — not a
Slice 04 regression. Not chased further; out of scope for this walk.)

## What the walk found

**Every §8 check passed.** Drag→preview→commit lands in exactly 2 interactions (drag, click).
Esc restores the exact prior state — psql-confirmed unchanged after reverting both a Rule
drag and a spine field entry. The anchor-violation path is provably uncommittable: Commit
disabled, a force-enabled DOM click (devtools-style — `removeAttribute('disabled')` then a
forced click) fires **zero** network requests to `commit_schedule_edit` (route-intercepted)
and leaves `duration_days` unchanged (psql). Unpinning the blocking anchor clears the
conflict and re-enables Commit; re-anchoring to a date the chain actually reaches commits
clean. The anchored diamond refuses with the nudge text alone — no ghost, no session.
Milestone drags commit with `anchor_date` confirmed still `NULL`. Ghost-add, milestone-create,
and delete-relink all stay direct — verified live on a scratch phase added and removed
mid-walk, no strip ever appeared for any of the three. Telemetry (`schedule_edit_committed`)
is a single call site inside the commit mutation's `onSuccess`; the Esc handler calls only
`clear()` — code-path-verified (no local PostHog key this session).

**Structural finding, not a bug — "boundary-refuse-in-gapped-case."** Aspen's Installation &
Styling has no rendered boundary handle at its own start at all: its upstream edge
(Procurement & Orders → Installation & Styling) is thread-lane, and `ruleBoundaries` only
draws a handle when the upstream is main-lane. So "drag the anchored phase's own start
boundary" has no target to exercise in this specimen's chain — worked around by driving the
anchored-diamond refuse instead (the same underlying refuse path, same component family).
Logged as an escalation, not fixed (out of scope for a verification walk).

**One tooling mistake, self-caught mid-walk.** An "Edit dates" button locator scoped to the
whole spine section (rather than one phase's own DOM region) grabbed Schematic Design's field
instead of Installation & Styling's, briefly setting the wrong phase's anchor to Aug 24.
Caught immediately from the committed confirm-strip sentence text ("Schematic Design anchored
Aug 24" where "Installation & Styling anchored Aug 24" was expected), corrected via a direct
SQL UPDATE, and every subsequent step used a `#doc-phase-<id>`-scoped locator. Not a product
defect — a driver-script bug, logged here for the record per convention.

**The slack + lane-resolver fixes that closed I59's two open defects (`459883f7`) hold under
this slice's own mutations.** Every ripple sentence captured this walk reads the edited
phase's own absorbed slack float correctly (e.g. "8 days slack" after the Aug 26 re-anchor,
matching the live chain), and no anchored phase ever lane-demoted out of the main row across
any of this walk's overrun/restore states.

## Escalations for the consolidated review

Sentence wording (clause order/terminology in the confirm strip is implementation-chosen, not
design-ruled) · strip placement (directly under the Rule vs. floating/docked, unreviewed) ·
ghost overflow clamp (an overflow drag clamps the ghost's position to the scale's padded edge
while the label keeps the true date — reads correctly, never shown to the design authority) ·
touch treatment (drag mechanics are pointer-only; no touch-specific affordance exists or was
tested) · boundary-refuse-in-gapped-case (see above — Install's own start has no rendered
handle in this chain shape) · root-start drag deferred (the very first phase's own start
boundary is never drawn by construction — no design ruling on whether it someday needs a
different edit affordance) · studio-comember gap on the schedule RPCs (00323–00325 all guard
on `designer_id = auth.uid()` directly, the same known gap as `proposal_schedule_milestones`'
RLS from I59 — tracked follow-up, not fixed here) · Slice-05 seam (the `commit_schedule_edit`
hook comment describes cutting a `schedule_revisions` row on commit, but the INSERT will need
either a permissive policy or a SECURITY DEFINER wrapper since the function itself is
SECURITY INVOKER — noted for whoever picks up Slice 05).

## The ask

Deferred to the consolidated review at the end of Slice 05, per R104. Nothing here blocks
Slice 05 from starting. No confirmed product defects this walk — the one deviation
(the mis-scoped locator) was a driver-script mistake, self-corrected, not a shipped bug.
