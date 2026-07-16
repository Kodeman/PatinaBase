# The Document · Schedule Package — the Spine & the Rule

**Handoff · design authority → Claude Code · 2026-07-15**

This package carries the master direction for the project Schedule: the Ledger
Spine as the project page's architecture, the Ruled Line as its collapsed
header, the chain model for composing and editing, and the baseline/revision
system. It is consumed whole: Part A is the append-ready DECISIONS.md block,
Part B is the build plan, and the kickoff line closes it.

**Landing note (do this first).** This package was cut in a session without
repo access, so entry ids are placeholders. Your first act:

1. Land the three files in `docs/design/the-document/`:
   `the-document-schedule-package.md` (this file),
   `the-document-schedule-master-direction.html` (the prototype — the
   look/feel authority for every state described below),
   `the-document-schedule-four-directions.html` (the review deck, for the
   record — it carries the rejected options' reasoning).
2. Run `scripts/workstream_state.py <repo_root>` and substitute the real next
   ids for `R99`, `R100`, `R101`, `O8` throughout Part A (they are
   consecutive, in that order).
3. Append the Part A entries via `append_entry.py` — it recomputes the
   integrity footer from the file's real contents. **Never hand-edit the
   footer; never hand-number an entry.**
4. Log the landing itself as your first I-entry.

Authority order, as always: codebase → spec → prototypes → DECISIONS.md. The
prototype's markup is not ported — its **intent** is.

---

## Part A — the append-ready DECISIONS.md block

Substitute ids per the landing note, keep true entry order, dates stay
2026-07-15.

---

### R99 · The Schedule master direction — the Spine and the Rule — 2026-07-15

**Ruled.** From the four-directions review (Jul 14–15): the Ledger Spine (B)
becomes the project page's architecture, and the Ruled Line (A) becomes its
collapsed header. The Loom (C, lead-time Gantt) and the Almanac (D, the
client-facing commitment ledger) are deferred with their roles reserved: the
spine's procurement thread is the Loom's future front door, and the spine's
milestone rows are the Almanac's future entries. Nothing built now is thrown
away later — we are building the trunk; C and D are branches.

**The core architectural call: A and B are not two components.** They are one
schedule with a folded and an unfolded state, both rendered from one resolved
chain (see R100). There is nothing to sync because there is only one schedule.

**The Rule (folded state).** Sits where the current phase bar sits; pins
beneath the project title on scroll at reduced height (labels fold into the
line; diamonds and the today rule remain). It is three things at once:

- *The glance* — a full-width drawn rule. Phase labels sit above the line at
  natural width, staggered to a second row when they would collide; **nothing
  ever truncates.** Weight encodes status: light for closed, bold for active,
  muted Aged Oak for ahead. Today is a strong vertical Charcoal rule with its
  date in DM Mono. Milestones are diamonds on the line wearing stamp colors.
  Overlapping phases (procurement is the canonical case) render as a parallel
  hairline beneath the main rule, spanning their true dates — the component
  stops lying about sequence.
- *The minimap* — click a phase label and the spine scrolls there and unfolds
  it; click a diamond and the spine opens that milestone's phase with the row
  highlighted.
- *The time surface* — phase boundaries are drag handles; milestones slide
  along the line. All time edits pass the ripple (R100). Anchored entries
  refuse the drag with a firm nudge ("Install is anchored — unpin to move
  it").

**The Spine (unfolded state).** Replaces the Coordination and The Work
sections — they dissolve into it. Each phase is a Playfair heading on a
vertical spine (solid above today, dashed below; the today rule crosses the
spine between rows). Closed phases compress to a single light line with meta
(dates, item count, key signatures). The active phase opens fully. Future
phases show heading, target, and dependency meta in muted weight.

A phase holds three row types: **milestones** (diamonds — sign-off, decision,
delivery, event — with the stamp vocabulary upcoming/due/signed/slipped),
**items** (the existing chips: sign-off, punch — ball-in-court rendered as a
chip on the row), and **threads** (parallel work like procurement, drawn as a
running stitch, never forced into sequence). Hovering a phase heading reveals
three quiet mono actions — + Item, + Milestone, Edit dates; long-press on
touch. **Any phase or milestone can be anchored** — pinned to a hard date,
wearing a charcoal chip, holding its ground when upstream moves.

**Rationale.** The old bar's five failures (truncation, false sequence,
whispered today, withheld dates, and total disconnection from the work) are
all versions of one failure: the schedule and the work were different
objects. The spine makes them the same object — every open question lives
inside the chapter where it belongs — and the rule keeps the glance that the
spine alone would lose. Division of labor: **words in the spine, time on the
rule.**

Prototype: `the-document-schedule-master-direction.html` (all states,
including the interactive ripple and baseline specimens). The rejected
options' full reasoning: `the-document-schedule-four-directions.html`.

---

### R100 · The chain model — durations and links; dates are derived — 2026-07-15

**Ruled.** A phase is a **duration plus a link** ("4 weeks, following
Schematic Design") or an **anchor** (a pinned hard date). Dates are never
stored as primary truth on unanchored entries — they are computed by one pure
resolver, `resolve()`: chain in; dates, slack, and conflicts out. Both
surfaces render from its output; **nothing else in the app computes time.**
This is what makes the schedule adaptable — a 3-phase refresh and a 7-phase
renovation are the same machine with different links.

**Birth.** The schedule is born in the proposal (proposals and projects are
already the same structure in two views) and is never rebuilt — the client's
signature cuts baseline v1. Three starting points, typographic, no modals:
(i) **the Patina Six** — Consultation · Schematic Design · Design Development
· Procurement & Orders · Installation & Styling · Completion, pre-chained
with studio-standard durations; (ii) **from a past project** — the phase
chain with as-built durations, your history as your estimate; (iii) **blank**
— a ghost line reading "Name a phase…". With an anchored install date the
chain computes **backward** and renders slack (or a Terracotta warning that
the chain doesn't fit); otherwise forward from signature.

**Entry grammar.** Duration fields accept how people talk: `3w`, `10d`,
`Sep 21`. Typing a hard date anchors the entry automatically (chip appears;
one click unpins). Milestones live inside phases as offsets ("3 days before
phase end") or anchored dates, four kinds (sign-off, decision, delivery,
event), and ride their phase when it moves — anchored ones hold.

**Overlap is legal.** Linking a phase to an earlier predecessor — or dragging
its start before the predecessor's end — does not snap back or error. The
phase drops to a parallel thread lane. The schedule permits what reality
insists on.

**Editing: the ripple.** Every time edit previews before it takes: ghost
consequences render in dashed Terracotta (new dates, sliding milestones,
shrinking slack) over the still-solid committed schedule, then a confirm
strip states the change in one honest sentence — what moved, what follows,
what holds, the slack delta, any conflicts — with **Commit** and **Esc ·
Revert**. Nothing moves silently, ever. The ripple flows around anchors; a
drag that would break one names the conflict instead of moving the anchor.
In the spine, any date in a meta line becomes an inline field accepting the
same grammar (`+5d`, `Jul 29`) with the ripple previewed in downstream meta
lines. One grammar, two surfaces.

**Memory.** The signature freezes baseline v1 (phase snapshots). Every
committed change cuts a numbered revision — who, what, why (the reason
defaults to the confirm strip's sentence, editable). Where current dates
differ from baseline, faint **Clay ghosts** mark where the promise stood,
with a toggle. The brand is "Where Time Adds Value" — the schedule earns a
patina: it doesn't hide its history, it numbers it, names it, and holds the
line anyway.

---

### R101 · Slice-gating rulings: client visibility · item sort · proposal granularity — 2026-07-15

Three calls that gate the build, interviewed and ruled 2026-07-15.

**1 · The client does not see the spine in Slice 01.** Studio-only first; the
client-facing schedule arrives later as the Almanac projection (a filtered
view of the same milestones and stamps). *Rejected:* a filtered spine from
day one — real earlier client value, but it roughly doubles Slice 01's
surface (auth scoping, row filtering, a second audience to QA) and delivers
the client a diluted studio tool instead of the view built for them; a
read-only "peek" link — a third artifact to maintain for marginal value.

**2 · Inside an open phase, items sort blocking-first, then due date.** The
thing holding the line surfaces first — the exception-first instinct that
runs Mission Control runs here too. Ball-in-court survives as a chip on
every row, but it is no longer the grouping. *Rejected:* court groups
(continuity with the old Coordination section, but they bury a blocker in
whosever court it happens to sit); straight due-date order (simplest, but it
hides blockage semantics entirely). The old Coordination grouping dies
consciously here, not by accident.

**3 · The proposal carries phases plus anchored milestones only.** The
client signs against commitments — install day, the sign-off gates — not
against working scaffolding; working milestones are composed after
signature. The baseline therefore freezes exactly what was promised.
*Rejected:* the full chain with all milestones (strongest baseline, but
every working milestone becomes a "promise" and proposals get heavy);
phases only (cleanest proposal, but the baseline can't hold the schedule
accountable for the dates that matter most).

---

### O8 · Open — do clients see the ghosts and the revision ledger? — 2026-07-15

Unresolved; resolve before Slice 05 cuts. The brand case says full
transparency — the 25% Pledge runs on a public ledger because transparency
is the credibility engine, and a designer who shows her schedule's history
is a designer a client trusts with the next date. The comfort case says
studio eyes only — not every slip needs a client-facing scar. **Leaning
(design authority):** the middle path — clients see revisions that touched
client-facing dates (anchored milestones, install); the full ledger stays
studio-side. Slice 05 builds studio-side only until this is ruled.

---

**Footer-restore note:** after appending, `append_entry.py` recomputes the
integrity footer from the file's real contents. If the footer it prints
doesn't match what you expected, stop — that's the corruption alarm working.

---

## Part B — the build plan

Five slices; each ships something whole. **Sequence gates are real:** Slice 02
does not start before the Slice 01 review ruling; Slice 04 requires Slice 03's
entry grammar; Slice 05 requires the signature event verified in §0. The
existing project page stays live behind a flip gate until the Slice 01 review
blesses the dissolve.

### §0 · Audit first — verify before building (the I25 discipline)

The current portal already renders phases, items, and a signed proposal.
Audit what exists before any migration; extend additively; log findings.

- **A0.1 — Phases.** Something already stores phases with dates ("tap a phase
  to set dates" ships today). Find the table/columns. Determine whether the
  chain model extends it or supersedes it. The live data renders phases out
  of order (Procurement drawn after Completion) — the backfill must **infer
  the chain from dates, never trust sort order**, and flag unparseable chains
  for manual review rather than guessing.
- **A0.2 — Items.** Open items exist (kinds: sign-off, punch; ball-in-court;
  a "blocks an FF&E line" relation). Verify the schema before adding
  `phase_id` and `blocks_milestone_id`. Items with no inferable phase land in
  the active phase and are flagged.
- **A0.3 — Milestones.** Verify none exist under another name (check for
  deliverable/gate/task tables) before creating the table.
- **A0.4 — The signature event.** The proposal already renders `SIGNED ·
  JUL 8`. Find the event or status transition that fires on signature — the
  baseline cut (Slice 05) hooks it. If it's a status column with no event,
  that's a §0 finding to log, not a silent workaround.
- **A0.5 — The sections that dissolve.** Inventory the Coordination and The
  Work components and their data hooks — the spine reuses their queries where
  clean. Nothing is deleted in Slice 01; the flip gate decides when they go.

### §1 · Additive schema (no destructive migration anywhere)

```
phases           + duration_days int · follows_phase_id fk nullable
                 + anchor_date date nullable · lane enum(main|thread) · sort
milestones       NEW: id · phase_id fk · name · kind enum(signoff|decision|
                 delivery|event) · offset_days int nullable · anchor_date
                 nullable · status enum(upcoming|due|signed|slipped)
items            + phase_id fk nullable · + blocks_milestone_id fk nullable
schedule_revisions  NEW: id · project_id fk · v int · cut_at timestamptz ·
                 actor · reason text · phase_snapshots jsonb
```

Computed-date caching (materialized columns vs. resolve-at-read) is yours to
bless — code-only. The rule that is not yours to bless: **`resolve()` is the
only source of dates.** One pure function in a shared `@strata/*` package:
chain in → dates, slack, conflicts out.

### §2 · Slice 01 — Read

Build: `resolve()` with unit tests (forward chain; backward from anchor;
overlap → thread lane; slack; conflict = anything landing past an anchored
install). `<ScheduleSpine/>` replaces Coordination + The Work on the project
page behind the `schedule_spine` flip gate, studio-only (no client render
path exists in this slice — R101.1). Phase states per R99: closed
compresses, active opens, future mutes. Items sort blocking-first then due
date, court as chip (R101.2). Today rule crosses the spine. Thread-lane
phases render as the running stitch inside the active phase. Typography per
the prototype: no shadows, weight/size/color hierarchy, DM Mono meta,
Playfair headings — intent, not markup.

**Accept when:** a seed project shaped like the prototype's specimen (five
phases, an overdue blocking sign-off, a thread-lane procurement, an anchored
install) renders matching the prototype's spine slide; existing item detail
views still open from spine rows; items CRUD regressions zero; the old page
still renders with the gate off.

**⟶ FIRST REVIEW MILESTONE: screenshot drop of the Slice 01 spine.** The
flip gate stays off until that review's ruling blesses the dissolve.

### §3 · Slice 02 — Glance

Build: `<ScheduleRule/>` at the current bar's location, same `resolve()`
output. Natural-width labels above the line with two-row stagger — test at 3
and at 7 phases with long names; truncation anywhere fails the slice.
Minimap behaviors per R99. Pin-on-scroll: sticky under the project title at
reduced height, labels folding into the line, diamonds and today surviving;
no layout shift on pin. Mobile: the rule folds to diamonds + today only —
full mobile treatment escalates at this slice's review.

**Accept when:** both phase-count extremes render clean; minimap click lands
on and unfolds the right phase; pinned state correct at every scroll depth.

### §4 · Slice 03 — Compose

Build: the three typographic starting points (Patina Six · past project
as-built · blank), no modals, no wizards. Ghost add-line inline on the
spine: name → tab → duration → a phase joins the chain. Entry grammar `3w`
/ `10d` / `Sep 21`, hard dates auto-anchor with the chip, one-click unpin.
+ Milestone inside a phase (name, kind, offset or date). Backward compute
from an anchored install with slack in the meta line; chain-doesn't-fit
warns in Terracotta. The proposal composer carries phases + anchored
milestones only (R101.3). Deleting a mid-chain phase relinks its neighbors
behind a confirm.

**Accept when:** a schedule is born from each starting point in under a
minute; adding one phase takes under five seconds (the capture rule); the
proposal view shows no unanchored working milestones.

### §5 · Slice 04 — Adjust

Build: boundary handles on the rule; drag renders the ripple ghosts (dashed
Terracotta ticks, diamonds, date labels) over the solid committed schedule.
The confirm strip states the change in one sentence — what moved, what
follows, what holds, slack delta, conflicts — Commit / Esc·Revert. Anchors
hold under ripple and name the conflict; a drag that violates an anchor
**cannot commit** without an explicit unpin. Spine meta dates become inline
fields with the same grammar and inline downstream preview. Milestone
diamonds drag with day snapping; anchored ones refuse with the nudge. No
mutation path exists that bypasses commit.

**Accept when:** the drag→preview→commit loop is three interactions or
fewer; Esc restores exact prior state from any preview; the anchor-violation
path provably cannot commit.

### §6 · Slice 05 — Memory

Build: the signature event (from A0.4) cuts baseline v1 into
`schedule_revisions` with phase snapshots. Every Slice 04 commit writes a
revision — v, actor, reason (defaulting to the confirm strip's sentence,
editable). Clay ghosts on the rule where current differs from baseline,
with the toggle, positions derived from the snapshot. `<RevisionLedger/>`
renders v · what · who · when, append-only. **Studio-side only** until O8
is ruled.

**Accept when:** signing a seeded proposal freezes v1; two subsequent
commits produce v2 and v3 with ghosts matching the snapshots exactly; the
ledger cannot be edited, only appended.

### §7 · Telemetry (names are the contract; property shapes are yours)

PostHog events, all slices: `schedule_phase_added`,
`schedule_edit_committed` (carry ripple size + conflict count),
`schedule_anchor_set`, `schedule_revision_cut`, `spine_phase_unfolded`,
`rule_minimap_jump`, `schedule_born` (carry starting-point kind).

### §8 · Bless vs escalate, for this package

**Yours to bless (code-only):** schema details and caching, migration
numbering, resolver internals, event property shapes, query reuse from the
dissolved sections. **Escalates (designer-visible):** pin height and fold
behavior, stagger edge cases, confirm-strip wording pattern, ghost styling,
every empty state, the mobile rule treatment, anything the prototype leaves
ambiguous. The splitting question stands: would a designer notice?

---

## The kickoff line

> Read `docs/design/the-document/the-document-schedule-package.md` end to
> end, execute the landing note (land the three files, number and append
> Part A via the scripts, log the landing as your I-entry), run the §0
> audit and log findings, then build Slice 01 (Read) only — first review
> milestone is a screenshot drop of the spine on the seed project, flip
> gate off, before any Slice 02 work begins.
