# THE PROPOSAL AUTHORING PACKAGE — closing the #1 P0 gap, with Desk integration

**To:** Claude Code · **From:** the design session, 2026-06-14
**Closes:** Feature Gap Matrix — **Proposals zone: 20 ABSENT, all P0, the single largest gap.** Every proposal is built in `/portal` today; this brings authoring into the Document.
**Canonical design references (commit all to `docs/design/the-document/`):**
- `patina-proposal-authoring-prototype.html` — **the primary build target** (The Drafting Room)
- `patina-lead-to-proposal-prototype.html` — the lead→proposal→signed→project spine the authoring lives inside
- `patina-composing-page-prototype.html` — the anti-wizard pattern the Drafting Room applies (R40 lineage)
- `patina-library-room-prototype.html` — the Room shell the Drafting Room reuses (D14)
- `patina-strata-mark-progress-system.html` — the progress device (R35)
- `portal-vs-desk-feature-gap-matrix.md` — the source of truth for what's missing

**Port intent, never markup** — same contract as every prototype. **Authority order unchanged:** codebase → spec → prototypes → DECISIONS.md.

> **NUMBERING FLAG (read first).** These rulings are numbered **R42–R45**, assuming the live repo is at **R41 / I30** (per the gap matrix dating, 2026-06-14, which references R37/R39/R40/R41 and I30 as shipped). The uploaded DECISIONS.md copy is a stale pre-Track-1 snapshot (last id I25). **Before appending: run `workstream_state.py` against the real repo and renumber to the true next-R if it differs.** The skill's `append_entry.py` will recompute the footer from the real file regardless.

---

# PART A — DECISIONS.md paste block (append verbatim, renumber if needed)

```markdown
## Rulings — design session, 2026-06-14 (Proposal Authoring + Desk integration)

> Source: the approved prototypes (patina-proposal-authoring-prototype.html primary)
> and the Feature Gap Matrix (portal-vs-desk-feature-gap-matrix.md), Proposals zone.
> Closes the matrix's #1 P0 gap: proposal authoring (20 absent capabilities).

### R42 · The Drafting Room — proposal authoring as a Room — 2026-06-14

Resolves the matrix's largest gap: the legacy 8-tab Scope Builder
(/portal/proposals/[id]/scope) and the block-based section editor
(/portal/proposals/[id]) are reconceived, not ported. **Proposal authoring
is a Room** (D14) — "The Drafting Room" — entered from the Proposal section
of a document, never a top-level zone. Inside, the eight scope-builder tabs
become **eight facets that compose in any order** (R40 anti-wizard): Rooms
in scope · FF&E schedule · Palette · Mood boards · Phases & fees ·
Exclusions · Payments · Change-order terms. **The Strata Mark is the only
progress** (R35) — no "step N of 8" — filling across three movements:
*scope* (Rooms + FF&E, line 1) · *the offer* (Phases, Exclusions, Payments,
Terms, line 2) · *the vision* (Palette, Boards, line 3). Each facet is a
checkable section showing its own completion and summary; draft saves at any
percentage (the proposal is a real, usable draft throughout). The drawer bar
persists inside (D8) — the Library is one tap away for FF&E selections.
Declined from scope: a wizard stepper, hard gates between tabs, a separate
"generate" step (see R43).

### R43 · The live proposal — generate-as-you-compose — 2026-06-14

Resolves "Generate Proposal from Scope" (matrix ABSENT) by dissolving it.
There is no generate button. The Drafting Room shows a **live proposal
preview** (right rail) that builds itself as facets fill — "Sarah's copy" —
rendering rooms, palette, pieces, exclusions, and the investment total in
client-mirror grammar (NO cost breakdown, NO margin, NO TBD logic; CI-tested
exclusion per R27). The full client view opens via the existing client
mirror (R27). The FF&E schedule carries the three line types from the
lead→proposal flow as canonical: **Fixed** (a specific piece at a set price)
· **Allowance** (a budget for a category not yet chosen) · **TBD** (to be
determined), tap-to-cycle. Section editors (Concept/Space Plan/Selections/
Investment/Timeline/Terms — all matrix ABSENT) are the facet editors; asset
uploads (mood boards, palette, space plan) clip via the Folio (R24).

### R44 · Send and revise — letterhead instrument + supersede — 2026-06-14

Resolves "Send Proposal to Client" and "Revise Proposal (Supersede/Clone)"
(both matrix ABSENT, P0). **Send is a letterhead instrument** (R27 family):
a sheet carrying recipient, CC, expiry, and a personal note (the matrix's
/send ClientPicker form), flowing into the client mirror and the
signature-as-decision (R23). Sending a proposal does NOT mutate the sent
copy thereafter. **Revise creates a new version:** "Sarah asked for a
change" opens a revise sheet showing her feedback on v1, then opens **v2**,
which **supersedes v1 and carries the feedback forward** (the matrix's
useCreateProposalRevision); v1 is kept in version history on the document,
never deleted (D7). Signature settles the Proposal section and opens the
Project in the same document — nothing converts (R23, the lead→proposal
spine). Proposal *list/filter* and *tracking dashboard* (matrix ABSENT) stay
TRANSFORMED into Desk need-derivation and the margin, per the matrix's own
"TRANSFORMED ≠ gap" caveat — not rebuilt as zones.

### R45 · The proposal on the Desk — lifecycle tiers — 2026-06-14

Defines how an authoring/sent proposal surfaces on the Desk, completing the
thread from Drafting Room to Desk. The Desk's two populations (R1/R22)
classify a proposal by its lifecycle state, derived — never a list:
- **Drafting, actively** → quiet; nothing waits, nothing shows.
- **Drafting, untouched** past a threshold → an **in-motion chip**
  (`drafting` kind) — one quiet line ("Aspen Loft — drafting, untouched
  3d"), awareness tier, no urgency stamp.
- **Sent, unopened ≥1 day** → an **in-motion chip** (`sent_unopened`) —
  awareness tier; the client hasn't acted, no hand needed yet.
- **Hesitating** (opened, no signature past the R10 threshold) → **promotes
  to a needs-your-hand FolderCard** (`hesitating_proposal` need-line — "sent
  6 days ago, opened twice, no signature"), because a nudge is the available
  act (passes R22).
- **Signed** → the folder resolves; the engagement re-enters the Desk as a
  **project** with its first real need. The Drafting Room's send is the hinge
  that drives this whole chain.
The Drafting Room is reachable only through the document (Desk → folder →
document → Proposal section → the Room doorway), consistent with D14/D1.
```

**After appending, restore the footer** (the skill derives it; this is the shape):
`*Entries: D1–D14 · O1–O7 (resolved) · I1–I30 · R1–R45 · L1–L4 · THE GO · FLIP CONFIRMED · last id = R45*`

---

# PART B — Build plan

## Sequencing

Proposal authoring is the **#1 P0 parity blocker** — it gates the entire
front half of the engagement loop in `/desk`. Build it first among open P0s.
Three tracks: the Drafting Room (the bulk), the send/revise lifecycle, and
the Desk derivations that surface it. **Audit-first** every "does X exist?"
note before building — the matrix is capability-grain, not schema-verified.

## Track A — The Drafting Room (R42, R43)

**Audit first:** the `proposals`, `proposal_sections`, `proposal_items`,
`proposal_payment_milestones`, `proposal_phases`, `proposal_exclusions`,
`proposal_scope_rooms` tables (the matrix cites all of these as existing
behind `/portal`); the `useProposal*` hooks; the `uploadProposalAsset`
function. **Most of the data layer likely already exists** — this is largely
a new *surface* over existing tables, like the Library Room was.

1. **The Room shell.** Reuse the D14 room machinery (route, full-bleed paper,
   persistent drawer, put-down origin stash) — the same shell as the Library
   Room (`rooms/library`). New tenant: `rooms/drafting` (or equivalent),
   entered from the document's Proposal section via a doorway affordance.
2. **The eight facets.** Each scope-builder tab → a facet editor (a section
   in the Room), composable in any order, with completion ticks and live
   summaries:
   - Rooms in scope → `proposal_scope_rooms`
   - FF&E schedule → `proposal_items` w/ Fixed/Allowance/TBD type + room group
   - Palette → swatch set (matrix `PaletteBuilder`)
   - Mood boards → board assets via Folio (R24) + Engine suggestions rail
   - Phases & fees → `proposal_phases`
   - Exclusions → `proposal_exclusions`
   - Payments → `proposal_payment_milestones` w/ trigger config (reuse R26's
     trigger kinds — manual/on_signing/on_production/on_section_settled/on_date)
   - Change-order terms → revision rounds + overage rate
3. **The Strata Mark (R35).** The room's progress is the three-movement fill;
   reuse the shipped `strata-mark.tsx` + a compose-progress derivation mapping
   the eight facets to the three lines (the prototype's `progress()`).
4. **The live preview (R43).** Right rail renders the client mirror projection
   live as facets fill; reuse `client-mirror.tsx`'s projection + its CI
   exclusion test (no cost/margin/TBD).

*Accept:* a designer opens the Drafting Room from a document's Proposal
section · fills facets in any order and the Strata Mark fills across the
right movements · the FF&E facet cycles Fixed/Allowance/TBD and groups by
room · the live preview updates and never shows cost or margin (CI) · a
half-composed proposal saves as a draft and reopens intact.

## Track B — Send & revise (R44)

**Audit first:** `useSendProposal`, the `/send` ClientPicker form,
`useProposalVersions` + `useCreateProposalRevision`, the activation RPC
(`activateProposal`) — the matrix cites all as existing in `/portal`.

1. **Send instrument.** A letterhead-family sheet (recipient/CC/expiry/note)
   → existing send RPC → client mirror becomes signable. Preview does not
   stamp; send does.
2. **Signature → settle → project.** Reuse R23 (gates-are-decisions): the
   signature is a `client_decision` of kind approval that settles the
   Proposal section; activation opens the Project in the same document (the
   lead→proposal spine — already partly wired per matrix `/signed` PART row).
3. **Revise → supersede.** "Request a change" → revise sheet (feedback on v1)
   → new version that supersedes v1, carries feedback forward, keeps v1 in
   history (D7, no destruction). Reuse `useCreateProposalRevision`.

*Accept:* send delivers v1 and the sent copy is immutable thereafter · the
client mirror shows a Sign action only after send · signing settles the
Proposal section and opens the Project with no conversion step · revising
produces v2 with v1 retained in version history and feedback visible.

## Track C — Desk derivations (R45)

**Audit first:** `desk-derivation.ts` + `partitionDesk()` and the existing
need-kinds (the matrix lists `hesitating_proposal` thresholds at R10 and an
in-motion tier for "sent-unopened proposals ≥1d" as **already partially
present** — verify what's wired before adding).

1. New/confirmed in-motion chip kinds: `drafting` (untouched draft past
   threshold) and `sent_unopened` (≥1d).
2. Confirm/wire the `hesitating_proposal` FolderCard need-line (R10
   threshold: opened, unsigned, past the hesitation window).
3. On signing, the proposal folder resolves and the engagement re-derives as
   a project with its first need — one-act-many-surfaces (spec §5): the
   signature updates the decision stamp, the Proposal settled bar, the Desk
   folder/chip, and the client mirror gate in one mutation.

*Accept:* an actively-drafted proposal shows nothing on the Desk · an
untouched draft surfaces as a quiet `drafting` chip · a sent-unopened
proposal shows as a chip and promotes to a `hesitating_proposal` folder once
it crosses R10 · signing clears the folder and the engagement reappears as a
project folder with a real need · no proposal ever appears as a queryable
list (Desk is derived, R1).

## Dependencies & flags

- **Artifact landing (the recurring bug):** all six referenced files must
  reach `docs/design/the-document/` WITH this ruling. Run
  `land_artifact.py --check` on Part A; land any missing before building.
- **Spec fold:** after Track A review, fold R42–R45 into the spec's proposal
  section and **update the gap matrix's Proposals row** from "20 absent"
  toward parity (the matrix is a living scorecard).
- **TRANSFORMED, not built:** proposal list/filter, tracking dashboard,
  proposal-specific analytics namespace — stay as Desk/margin derivations
  per the matrix caveat, unless telemetry says otherwise.

**Kickoff:** *"R42–R45 appended (renumber to true next-R first, footer
restored). Six design references committed to docs/design/the-document/.
Build Track A (The Drafting Room) first — it's the #1 P0 gap; audit the
proposal_* tables and useProposal* hooks before building, since this is
mostly a new surface over existing data. Then Track B (send/revise) and
Track C (Desk derivations). Review milestone: the Drafting Room on a real
proposal — eight facets composing in any order, the Strata Mark filling, the
live preview excluding cost/margin (CI), then send → sign → project-opens on
the document, and the proposal surfacing correctly across the Desk's tiers."*
