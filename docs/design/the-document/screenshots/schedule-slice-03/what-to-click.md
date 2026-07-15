# Slice 03 — Compose · what to click

Flag `schedule-spine` stays **OFF** in production. This is the **third** screenshot drop —
per R104 (mid-Slice-03 process ruling), the per-slice review gate is superseded for
Slices 03–05: the build proceeds continuously, and this drop joins Slice 01's and Slice 02's
for one **consolidated review** at the end of Slice 05, not a per-slice go/no-go.

## Drive it locally

```
apps/designer-portal/.env.local → NEXT_PUBLIC_FLAG_OVERRIDES=schedule-spine:true,the-document-pilot:true
pnpm supabase:start && pnpm --filter @patina/designer-portal dev
designer@patina.dev / password123
```
Proposal composer: `/drafting/[proposalId]` on any DRAFT proposal (Phases → zero-phase state
shows the three starting points). Project spine: `/doc/[projectId]` on any phase-less or
chained project — Aspen Loft Refresh (seeded, chained + anchored) is the richest specimen.

## Screenshots

| File | What it shows |
|---|---|
| `birth-proposal.png` | Drafting Room, zero-phase proposal — the three typographic starting points + ghost line. |
| `birth-spine.png` | Project spine, zero-phase project (Chen Residence) — the same three starting points on the project surface. |
| `patina-six-born.png` | The Patina Six applied to a proposal — 6 chained phases, PROJECT PROGRESS summary (1/3/4/8/3/1w = 20w total). |
| `ghost-add-typing.png` | Mid-capture on the project spine's ghost line — the passive compute line ("→ Computes … · Slack → N days") visible before Enter commits. |
| `anchor-slack.png` | Proposal composer: typing "Sep 21" into Installation's duration cell → the `ANCHORED · SEP 21` chip renders. The proposal surface has no slack meta (by design — see §5); for the project-side meta line, see `anchor-slack-project.png`. |
| `anchor-slack-project.png` | Aspen's Installation & Styling phase, pre-mutation — "Aug 24 – Aug 29 · Anchored · Holds when upstream moves · 12 days slack". Fixed in 459883f7 — see the note below (was missing the "· N days slack" segment entirely). |
| `overrun-terracotta.png` | Aspen with Schematic Design's duration pushed to 35d — Installation's meta reads "Chain overruns Aug 24 by 2 days" in terracotta, directly beneath its normal anchored meta, **with the anchor still in the main lane** (heading, compose actions, and all — fixed in 459883f7; previously this exact mutation could lane-demote the phase and swallow the warning it exists to show). Reverted after capture. |
| `milestone-composer.png` | Proposal composer's anchored-milestones mini-list — "Concept sign-off" (Sign-off · Aug 1) added to Schematic Design. |
| `milestone-composer-project.png` | Project spine's `MilestoneComposer` open on Completion, mid-entry ("Handoff walkthrough" · Event · "-3d") before submit. |
| `delete-confirm.png` | The inline typographic delete-relink confirm on Aspen's Completion phase: `Delete "Completion"? 1 milestone go with it; 1 phase will follow Installation & Styling.` (grammar nit: "go" doesn't conjugate for the singular count — see below). |
| `negative-duration-guard.png` | "-3d" typed into a phase duration (project surface) — inline terracotta "Durations must be positive — e.g. 3w or 10d", no write. |
| `proposal-keydates-readonly.png` | The Patina-Six draft's client-copy preview: phases + the "Key dates" sub-line carrying the anchored "Concept sign-off" milestone. No unanchored working milestone anywhere, as required. |
| `activated-spine.png` | Re-taken post-fix. The newly-activated project's document, right after `activate_proposal_as_project` — Consultation, Schematic Design, Design Development, Procurement & Orders on the Rule; **Installation & Styling now renders as a full spine row** (heading, compose actions, "Anchored · Sep 21" chip, "Chain overruns Sep 21 by 44 days" in terracotta) instead of vanishing into a thread hairline — the lane-demotion fix. Completion still renders as a Rule-only thread hairline, correctly: it's unanchored, so R100's "overlap is legal" promotion still applies to it. |
| `compose-mobile.png` | Re-taken post-fix. Aspen's spine at 390px — persistent quiet compose actions (+ Item / + Milestone / Edit dates / Delete) survive the mobile fold; Installation & Styling's meta now includes "· 12 days slack"; the "2 Issues" console-warning badge from the earlier capture (nested-button warning) is gone. The "Edit dates" label truncation at the right edge remains (minor, unrelated). |
| `gate-off.png` | `schedule-spine:false` — the old PhaseTimeline + CoordinationBand render byte-identical to pre-Slice-01. The proposal composer's grammar field is **not** behind this flag by design; confirmed still present with the gate off. |

## What the walk found (report in full at the task's scratchpad path; summarized here)

**Slack meta not rendering — found by this walk, fixed in `459883f7`, re-verified.** The
resolver was crediting an anchored phase's slack to the wrong field (`downstreamSlack`, which
only looks at *followers*, never the phase's own absorbed float), so "N days slack" never
appeared anywhere. Fixed by keying `slackDays` off the phase's own `anchorSlack` entry when
it's the anchor. Re-walked on Aspen's unmutated Installation & Styling phase: the seed chain's
known 12-day float (procurement ends +28, anchor +40) now renders verbatim — "Aug 24 – Aug 29
· Anchored · Holds when upstream moves · 12 days slack" — see `anchor-slack-project.png` and
`compose-mobile.png`.

**Lane auto-promotion swallowing the overrun UI — also found by this walk, also fixed in
`459883f7`, re-verified for the anchored case.** Anchored phases are now exempted from the
greedy packer's demote-on-overlap rule, so a `chain_does_not_fit` anchor stays a full spine
row (heading, compose actions, terracotta conflict text) instead of vanishing into a
Rule-only thread hairline. Re-walked two ways: (1) raising Schematic Design's duration to 35d
on Aspen — Installation & Styling stays on the main lane and shows "Chain overruns Aug 24 by
2 days" (`overrun-terracotta.png`); (2) the `activated-spine.png` specimen, where Installation
& Styling now renders fully even though its chain overruns by 44 days. The fix is scoped to
*anchored* phases only — Completion (unanchored) still legitimately lane-promotes per R100 on
`activated-spine.png`, which is correct, not a residual bug.

**Confirmed — thread-lane phases expose no compose actions.** `ThreadStitch` has zero
interactive elements (no Edit dates / + Milestone / Delete). This was already an anticipated
plan §10 escalation ("no follows/lane editors… procurement-as-thread pre-signature?"); the
walk confirms it concretely — check 6's "delete a mid-chain phase" had to target a main-lane
phase (Completion) because Procurement, the thread-lane phase, has no delete affordance at
all. Not in scope for `459883f7` — still open.

**HTML-validity finding — found by this walk, fixed in `459883f7`, re-verified.**
`AnchorChip`'s unpin `<button>` nested inside the phase heading's own toggle `<button>`
whenever a collapsed phase was anchored, confirmed via a live React hydration-error console
warning on Aspen's page load. `phase-section.tsx` now renders the fold-toggle, chip, and fold
mark as three siblings instead of nesting the chip's button inside the toggle button. Re-walk
console listener attached from page load through every mutation this session: zero
nested-button / `validateDOMNesting` warnings observed.

**Copy nit — still open.** `phase-delete-confirm.tsx`'s `plural()` helper pluralizes the noun
but not the verb — "1 milestone go with it" reads ungrammatically at n=1. Not in scope for
`459883f7`.

## Escalations for the consolidated review

Same list as I59's DECISIONS entry (bare-number unit per surface · year inference ·
compute-line-is-passive · delete-relink wording · slack + overrun placement, now sharpened
by the two findings above · no follows/lane editors in the proposal composer · anchored
milestones client-visible in readonly · Patina Six names/durations + should Procurement
default thread · as-built = actual-elapsed w/ planned fallback · project-side birth in scope
· composer flag scope · `proposal_schedule_milestones` RLS omits studio-comember ·
edit-dates single-commit-per-open · name-only phase needs two Enters · chip-unpin silent
failure (now root-caused above) · weeks-mirror rounds 1–3d to 0w · milestones live under
"Deliverables, gates & key dates").

## The ask

Deferred to the consolidated review at the end of Slice 05, per R104. Nothing here blocks
Slice 04 from starting. The slack-meta wiring bug and the anchored-phase lane-demotion bug
are both fixed and re-verified (`459883f7`) — no ruling needed on those two. Still open for
the consolidated review: the thread-lane-phases-have-no-compose-actions gap, the delete-confirm
copy nit, and the full escalations list below.
