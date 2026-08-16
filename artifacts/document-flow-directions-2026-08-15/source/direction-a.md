# Direction A — "The Work Order" (structural, conservative)
Lane A's proposal v1, followed by its corrections addendum (v2). The addendum supersedes the cited passages; the deck must present the merged, corrected direction.

---

## v1 proposal

### 1. Thesis

A document is not a filing cabinet; it is a work order. The paper we print today is honest but shuffled — the record sits above the work, two instruments claim the name Schedule, and the verb a designer needs next is often printed on a page she hasn't reached or a route she hasn't guessed. We do not propose a cleverer surface. We propose the same surface, collated. One fixed canonical order that reads the way the job runs — begin, spec loosely, firm, sign, file — with one progression instrument instead of three, and a guarantee we will hold as doctrine: **at every stage of the job, the next verb is inked where the eye already rests.** The paper stays paper. It simply gets put in order.

### 2. Principles

**P1 — The paper reads in work order.** Top to bottom is start → loose spec → firm spec → finalize → record. What's live rises; what's settled sinks. History is an appendix, never a preamble.

**P2 — One instrument tells time.** Seven sections, eleven stages, and project_phases are three readings of one clock. They collapse into a single visible device — the Rule — and every other progress display (spine rail, sub-labels, date editor) is a reflection of it, never a second opinion.

**P3 — The next verb is printed in place.** No region may state a need whose verb lives elsewhere. An empty region's inked leader is its constructive verb. Routes away from the paper (Drafting Room, spec book) are reached *from* the section they serve, and return to it.

**P4 — Signatures at the foot.** Letters are signed at the bottom. Approvals, publish, supersede, and release-for-authorization form one signature block at the foot of the live work — not scattered above the schedule and inside the FF&E head.

**P5 — The address never changes.** /doc/[id] is the job's address for its whole life. Sections seal, proposals bind, the paper reorders itself by settling — the URL does not.

### 3. The Corrected Canonical Paper Order (centerpiece)

Fixed. Not adaptive. One array in code drives both the paper and the spine's running index, so they can never disagree again.

| # | Position | Justification |
|---|----------|---------------|
| — | **Spine (left edge)** | Orientation and memory only, per doctrine. Its index is now *generated from the paper order below* — index order = paper order, by construction. |
| 1 | **Letterhead** | Who, what, where — and the job's begin leader (see addendum C1). |
| 2 | **Guide line ("next up")** | The printed next verb, directly under the letterhead where the eye lands (kept, not built — see C2). |
| 3 | **The Rule** (unified progression instrument) | One graduated device: where the job stands and when (see §4). First real content because "where am I" precedes "what do I touch." |
| 4 | **The active section — the work** | Brief, Discovery, Direction, Proposal, or Project/FF&E, printed immediately after the Rule. Loose spec → firm spec happens *here*: Add-a-line in place, rooms in flow, row verbs surfaced. Money region rides inside as today. |
| 5 | **The signature block** (approvals + release) | Finalize. Client approvals draft/publish/supersede and the release-for-authorization ceremony, promoted to inked leaders at the foot of the work they gate. A document is signed at its foot. |
| 6 | **Account band** — pinned | Always here, every section, every stage. The running account is the paper's footer rule; it stops migrating (cost corrected — C5). |
| 7 | **The Record** (formerly PreviousWork) + Care band when unsealed care work exists | Settled Brief/Discovery/Direction/Proposal bars sink to the bottom as the job's appendix. Memory belongs after work, not between the guide and the work. |

The arc is legible in the order itself: **1–2 start, 3 orient, 4 spec (loose → firm), 5 finalize, 7 record.**

### 4. The Unified Progression Instrument: "the Rule"

**The problem:** three layered models — 7 spine sections, 11 residential stages (a thin sub-label), and project_phases (the schedule) — plus an explicitly unresolved conflict (DECISIONS I114: does Direction seal, or does stage 05 complete?). And two regions both named "Schedule."

**The resolution — stages are the ledger of record; sections and phases are readings of it:**

- **The eleven stages become the single ledger.** Each stage row carries its dates (absorbed from project_phases) and its completing act.
- **Sections are chapters — bindings over contiguous stage runs.** A section **seals when its last mapped stage completes, by definition.** Sealing stops being a separate act and becomes derived, ceremonial ink. I114 dissolves: "Direction seals" and "stage 05 completes" are the same event, stated once, in the mapping printed on the Rule itself.
- **project_phases becomes the calendar column of the ledger**, not a third model. The date editor survives as a **fold seam under the Rule** (folded by default, exactly as today's ScheduleRuleRegion behaves) — you unfold the Rule to touch dates.

**The device:** one horizontal graduated rule at position 3 — seven major graduations (sections), eleven minor ticks (stages), dates printed beneath, today's mark inked. The spine's rail mirrors the major graduations only.

**Naming:** the instrument is **the Rule** (its date fold is **the Calendar**); the stage listing inside the project section is **the Ledger**. Nothing on the paper is named "Schedule" twice — nothing is named Schedule at all.

(Phasing corrected — see C6: v1 ships the UI merge only; sealing semantics is a separate, gated migration.)

### 5. Fix List, Mapped to Evidence

| Friction (verified) | Fix | Cost |
|---|---|---|
| PreviousWork sits between guide and live work | Moves to position 7 as **the Record** — history is an appendix | S |
| Spine index order ≠ paper order | One canonical-order array drives both paper and index; disagreement becomes impossible | S |
| Two regions named "Schedule" | Merged into **the Rule** (+ its Calendar fold) and **the Ledger** | L (see C6) |
| Three phase models; I114 unresolved | Stages = ledger of record; section seal = last stage completing (deferred, gated — C6) | L deferred |
| AccountBand migrates by section | Pinned to position 6 (cost corrected M — C5) | M |
| Triplicate entry doors | Per-document begin leaders (re-scoped — C1); Desk consolidation recommended separately | M |
| "Begin the Direction" hard-jumps to /drafting, skipping the Direction section | Lands on the **Direction section on the doc**; the Drafting Room is reached by an inked leader in Direction's RegionHead and returns there | M |
| Doc URL rebinds; bookmarks die | **No doc id ever 404s** — alias/redirect table (claim narrowed — C9) | M |
| Project spine ignores stage completion | Project-side spine state derives from ledger stage completion (renamed — C4) | M |
| Empty FF&E: only verb is "Open the spec book," a route away | Empty region's inked leader becomes **"Add a line," in place**; spec book route kept <1440, shelf ≥1440 (C8) | M |
| Add room demoted by one-inked-leader rule (flagged, unruled) | **The ruling:** an empty region's leader is its constructive verb; when rooms exist, "Add a room" prints as a scored-ink line at the foot of the room list — answers I135's open flag; RegionHead's contract polices the head only (C11) | S |
| Mood boards exiled to a shelf leaf | Boards fold-seam — reclassified as an explicit doctrine amendment (reverses I136), **cut from v1** (C7) | amendment |
| Spine index/rooms/shelves exist only ≥1440px | Below 1440, the running index prints as a one-line strip under the letterhead | M |
| Approvals verbs demoted; release ceremony buried in FF&E head; no path past the send wall | All consolidated into the **signature block** (position 5): inked draft/publish leaders, the release ceremony, and a printed state line at the wall ("Sent 3 days ago — nudge / withdraw / awaiting countersign") | M |
| Decisions only in right margin | Unchanged (margin = attention is doctrine); the Guide line cites the open-decision count so the margin is summoned, not hunted | S |

### 7. Scope Honesty, Risks, Cost (v1, amended by C13)

**Deliberately not doing:** no adaptive or mode-switching surface; no merging the Drafting Room onto the paper; no right-margin redesign; no client-portal changes; no rewrite of the stage data model (additive per D7); no mobile-first rework beyond the index strip; Desk-level entry-door consolidation (recommended as separate work — C1).

**Risks:** (1) The Rule is the load-bearing change — merging two shipped regions risks regression in date editing; mitigate by keeping the Calendar fold's internals intact behind the new head. (2) "Section seal = stage completion" must be socialized and is gated on ruling I114's unclassified cases (C6). (3) Moving the Record down changes muscle memory; it is the cheapest change and the easiest to explain.

---

## v2 Corrections Addendum (supersedes cited passages)

**C1 — §3 pos. 1 / §5 "Begin leader."** Withdrawn as written. The three entry doors are Desk/⌘K chrome (desk/page.tsx:209, 219; command registry:256–282) and create engagements *before a document exists* — a letterhead leader cannot host them. Re-scoped: **per-document begin leaders only** — a lead doc's letterhead prints *Accept*, a discovery doc prints *Begin discovery*, a proposal-eligible doc prints *Draft the agreement*. Desk-level consolidation of the triplicate capture affordances is real but is **Desk work, outside this paper's scope** — recommended separately. Cost of the in-scope portion: **M**.

**C2 — Guide row.** Struck from the change list. The Guide already renders directly under the letterhead and activates in place (page.tsx:984–991, `activateGuide`/`jumpToSection`). Position 2 is **kept, not built**.

**C3 — Calendar fold / row verbs.** Both **kept, not built**. The folded-by-default date editor is I136 as shipped; the always-visible ··· row verb is I135 as ratified.

**C4 — Rail fix renamed.** There is no "proposal never advances" bug — active_section advances draft→direction and sent→proposal (migration 00327:267). The actual gap: **a project doc's spine advances only on `current_phase ∈ (installation, final_walkthrough)` (00327:98–102) and ignores phase/stage completion.** Fix: project-side spine state derives from ledger stage completion. **M, not S** (view-derivation change with Desk/mirror consumers).

**C5 — AccountBand.** W2 moved accounts *inside* MoneyRegion when the project section is open (money-region.tsx:39; page.tsx:1343–1356); an unconditional pin double-prints the account. The pin requires **extracting AccountBand from MoneyRegion into the fixed tier-4 slot**: **M, not S**.

**C6 — The Rule split.** The "L×1" hid a second L. **(L-a) UI merge** — ScheduleRuleRegion + ScheduleSpine + stage sub-label become one instrument, *reading* the existing models side by side. **(L-b) sealing-semantics migration** — moving section sealing from `active_section` (derived column, 00191/00327; consumed by Desk, the D13 mobile sheet, and the client mirror) to stage completion, additive per D7. **v1 ships L-a only; `active_section` remains the sealing authority.** The I114 resolution stands as the *target* semantics, gated on ruling the stage↔phase classification's recorded unclassified cases.

**C7 — Mood boards.** The boards fold-seam **reverses I136, ratified 2026-08-15** ("the paper holds the work, the shelves hold the artifacts"). Presented as an **explicit proposed doctrine amendment, cut from v1**. If the team declines the amendment, the shelf leaf stands and nothing else in this proposal depends on it. (Shared plank with Direction B.)

**C8 — Spec book.** Shelves are ≥1440-only; demoting the spec book to shelf-only strands narrower viewports. **The /doc/[id]/spec-book route is kept as the <1440 form**; ≥1440 gets the shelf reference. "Add a line" in place is unaffected.

**C9 — Stable URL narrowed.** Document identity changes twice *by design* (relationship→proposal at Begin the Direction; proposal→project at the seal, R6), touching Desk links, MRU, analytics, client mirror — full identity stabilization is **L, deferred**. v1 claims only: **no doc id ever 404s** — alias/redirect table so every historical /doc/[id] resolves to the current canonical doc. **M**.

**C10 — Shared planks.** The Direction-landing fix, the send-wall state line, and the (cut) boards seam also appear in Direction B. Retained but presented as **shared planks**, not differentiators. This direction's distinct claims: the canonical order with index-from-order, the Rule, the signature block, and the sealing-semantics roadmap.

**C11 — Add-room ruling.** The exception **answers the open flag recorded in I135**; RegionHead's one-leader contract polices the region head only — the room-list foot line does not violate it.

**C12 — Bonus evidence.** The running index's declared reading order — `schedule → approvals → ffe → money` (document-index.ts:18–23, comment: "Reading order down the paper") — **contradicts the paper's own DOM**, which mounts approvals (page.tsx:1035) above the ledger (~1256). The index and the paper currently disagree about what the paper says. This is the exact defect the one-canonical-order-array fix makes structurally impossible.

**C13 — Cost line, restated.** S ×3 (Record repositioning, index-from-order, add-room ruling) · M ×8 (per-doc begin leaders, Direction landing, no-404 aliases, FF&E add-in-place + spec-book route kept, <1440 index strip, signature block, AccountBand extraction, project-spine derivation) · L ×1 in v1 (Rule UI merge) · L ×2 deferred and gated (sealing semantics; full URL identity). The S set still ships first as proof.

## Re-walked Journey (against current main: I135/I136 shipped)

| Before (current main) | hunts | After (Work Order v1) | hunts |
|---|---|---|---|
| Desk: Capture a lead (primary affordance) | 1 | Same — Desk untouched in v1 | 1 |
| Doc opens: guide under letterhead — but the Record sits between guide and live work; scroll past history | 1 | Guide → Rule → active section contiguous; Record at the foot | 0 |
| Spec living room: FF&E empty, sole verb "Open the spec book" — route out, add pieces, route back | 3 (2 surfaces) | "Add a line" inked in place; spec book optional (route kept <1440) | 1 |
| Add a room from secondary position; boards via shelf leaf (one press ≥1440; stranded <1440) | 2 | Add-a-room in flow at room-list foot; boards unchanged (amendment cut from v1) | 1 |
| Firm rows via always-visible ··· (I135) | 1 | Kept as-is | 1 |
| Begin the Direction: hard-jump to /drafting, Direction skipped, URL rebinds — bookmark dead | 2 (2 surfaces, 1 dead bookmark) | Lands on Direction on the doc; Drafting Room entered/exited from its RegionHead; aliases guarantee no 404 | 1 |
| Approval arrives: approvals above the ledger while the index says otherwise; release ceremony inside the FF&E head; project spine doesn't move on stage completion | 3 | Signature block at the foot: publish, wall state, release in one place; spine derives from the ledger | 1 |
| **Total** | **≈ 13 hunts, 5–6 surfaces, 1 dead bookmark** | | **≈ 6 hunts, 3–4 surfaces, 0 dead bookmarks** |

The honest delta is roughly **half the hunts, not two-thirds** — the shipped I135/I136 work already removed real friction. The case rests less on the count than on *where* the remaining hunts live: every one of them is an ordering or naming defect (history above work, two Schedules, signatures above the ledger, index ≠ DOM), and those are exactly what a fixed canonical order eliminates by construction.

### Critical files
- apps/designer-portal/src/app/(document)/doc/[id]/page.tsx — canonical order, Record repositioning, signature block, AccountBand slot
- apps/designer-portal/src/lib/document/document-index.ts — index-from-order (declared order currently contradicts the DOM)
- apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx — Rule UI merge (L-a), fold behavior kept
- apps/designer-portal/src/components/document/commercial/money-region.tsx — AccountBand tier-4 extraction
- docs/design/the-document/DECISIONS.md — I114 target semantics, I135 add-room ruling, I136 amendment proposal, canonical-order doctrine
