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
| `anchor-slack-project.png` | Aspen's Installation & Styling phase, pre-mutation — "Aug 24 – Aug 29 · Anchored · Holds when upstream moves". **No "N days slack" segment renders** — see the defect note below. |
| `overrun-terracotta.png` | Aspen with Schematic Design's duration pushed to 35d — Installation's meta reads "Chain overruns Aug 24 by 2 days" in terracotta, directly beneath its normal anchored meta. Reverted after capture. |
| `milestone-composer.png` | Proposal composer's anchored-milestones mini-list — "Concept sign-off" (Sign-off · Aug 1) added to Schematic Design. |
| `milestone-composer-project.png` | Project spine's `MilestoneComposer` open on Completion, mid-entry ("Handoff walkthrough" · Event · "-3d") before submit. |
| `delete-confirm.png` | The inline typographic delete-relink confirm on Aspen's Completion phase: `Delete "Completion"? 1 milestone go with it; 1 phase will follow Installation & Styling.` (grammar nit: "go" doesn't conjugate for the singular count — see below). |
| `negative-duration-guard.png` | "-3d" typed into a phase duration (project surface) — inline terracotta "Durations must be positive — e.g. 3w or 10d", no write. |
| `proposal-keydates-readonly.png` | The Patina-Six draft's client-copy preview: phases + the "Key dates" sub-line carrying the anchored "Concept sign-off" milestone. No unanchored working milestone anywhere, as required. |
| `activated-spine.png` | The newly-activated project's document, right after `activate_proposal_as_project` — the born schedule (Consultation active; Schematic Design, Design Development, Procurement & Orders on the Rule; Installation & Styling and Completion render as thread hairlines — see the lane-promotion finding below, an honest consequence of the "Sep 21" anchor set during the demo). |
| `compose-mobile.png` | Aspen's spine at 390px — persistent quiet compose actions (+ Item / + Milestone / Edit dates / Delete) survive the mobile fold; the "Edit dates" label truncates at the right edge (minor). |
| `gate-off.png` | `schedule-spine:false` — the old PhaseTimeline + CoordinationBand render byte-identical to pre-Slice-01. The proposal composer's grammar field is **not** behind this flag by design; confirmed still present with the gate off. |

## What the walk found (report in full at the task's scratchpad path; summarized here)

**Confirmed defect — slack meta never renders.** `packages/utils/src/schedule.ts:620` sets
each resolved phase's `slackDays` from `downstreamSlack(id)` (the nearest slack among a
phase's *followers*), not from that phase's own `anchorSlack` entry. The one branch that
consumes `slackDays` (`phaseMeta`'s `future && anchored` case) wants the anchored phase's
*own* slack — so "N days slack" never appears anywhere, confirmed on Aspen's live,
unmutated Installation & Styling phase (12 days slack in the DB's chain math, zero
occurrences of "days slack" in the rendered DOM). The anchor chip and the rest of the meta
line are unaffected.

**Structural finding — lane auto-promotion can swallow the overrun UI.** The resolver's
greedy main-lane packer promotes a phase to `thread` lane whenever its computed start falls
before the running main-lane end. An anchored phase in `chain_does_not_fit` conflict, by
definition, often satisfies exactly that condition against its own upstream main-lane
predecessor — so the very phase the terracotta "Chain overruns…" text exists to warn about
can get silently reclassified as a thread hairline (no heading, no meta, no compose actions,
no conflict text) before the warning ever renders. The `overrun-terracotta.png` capture
required choosing a mutation that produces the conflict *without* also triggering this
promotion; a different mutation (increasing the same anchored phase's direct main-lane
predecessor far enough) reproduces the swallow — reachable live on `activated-spine.png`,
which incidentally demonstrates the same mechanic with Installation & Styling and Completion
both rendering as thread hairlines rather than spine rows.

**Confirmed — thread-lane phases expose no compose actions.** `ThreadStitch` has zero
interactive elements (no Edit dates / + Milestone / Delete). This was already an anticipated
plan §10 escalation ("no follows/lane editors… procurement-as-thread pre-signature?"); the
walk confirms it concretely — check 6's "delete a mid-chain phase" had to target a main-lane
phase (Completion) because Procurement, the thread-lane phase, has no delete affordance at
all.

**HTML-validity finding.** `AnchorChip`'s unpin `<button>` nests inside the phase heading's
own toggle `<button>` (`phase-section.tsx`, the `{name}{anchorChip}` composition) whenever a
collapsed phase is anchored — confirmed via a live React hydration-error console warning on
Aspen's page load. Nested interactive controls are invalid HTML and unreliable for
pointer/keyboard/AT interaction; this is a plausible root cause behind the existing
escalation "chip-unpin failures show no inline error."

**Copy nit.** `phase-delete-confirm.tsx`'s `plural()` helper pluralizes the noun but not the
verb — "1 milestone go with it" reads ungrammatically at n=1.

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
Slice 04 from starting — but the two structural findings (lane-promotion swallowing the
overrun/slack meta, and the confirmed slack-meta wiring bug) are worth an explicit ruling
before Slice 05's baseline cut leans on either signal.
