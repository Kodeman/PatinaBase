# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.2 — **supersedes v1.1.** Slices 0–3 complete · Session 01 GREEN (L1) · Slice 4 scoped with riders (Note kind, Strata fill-state, per-item DAMAGED) · default-flip gates updated.
**Last updated:** 2026-06-12 (design session, post-Slice-3 + L1 review)
**Authority order:** Codebase (current behavior) → this spec (intent & contracts) → prototypes (look, feel, motion) → `DECISIONS.md` (running log; D1–D13, R1–R15, I1–I13 are folded in here)
**Repo reality:** patina-merged monorepo, `@patina/*` packages, React 19, Next.js 15, Tailwind, self-hosted Supabase.
**Canonical prototypes** (in `docs/design/the-document/`): `patina-the-document-prototype-v4.html` (desktop, full-bleed) · `patina-the-document-mobile-d3-v1.html` (mobile pattern). Companion: `leah-session-01-first-tuesday.html` (session instrument; reusable for Session 02).

Section numbering is unchanged from v1.1 — existing `spec §N` references in `DECISIONS.md` remain valid.

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** `CODEBASE-MAP.md` mappings are canon. Shipped Slice 1–3 mechanics (00188 `document_state`, 00189 claim counts, 00191 `margin_items`, 00192 `send_weekly_pulse`, the `/doc/[id]` resolver) are now part of "what exists" — build on them, don't parallel them.
2. **This spec is the authority on intent.** Surviving conflicts go to `DECISIONS.md` as open items — never silently resolved.
3. **The prototypes are the authority on look, feel, motion.** v0.4 for desktop, mobile-d3-v1 for the phone. Port intent, never markup.
4. **`DECISIONS.md` is append-only.** New decisions appended, dated, never edited.
5. **Audit-first still applies to new artifacts** — e.g., R14's escalate-to-SCA targets a Scope Change Authorization artifact that may not exist; verify, stub, and flag rather than invent (§14.9).

---

## 1. The concept in one page

Zone navigation fragments one client relationship across eight places. The Document model replaces it with the designer's job-folder mental model:

- **The Desk** — home. Documents that *need the designer's hand today*, documents in motion, nothing else. No dashboard furniture, no badges.
- **The Document** — one living document per **engagement** (R1), filling the entire viewport when in hand (D12). It grows through seven sections: **Brief → Discovery → Direction → Proposal → Project → Install → Care.** Nothing converts; the document gains sections. The FF&E line drafted in the Proposal is the same row that carries stamps in the Project section.
- **The Margins** — six kinds of marginalia (R14) anchored to the line or section they concern: decisions, messages, money, the Weekly Pulse, time, and the designer's own **Notes**. The margin is also the notification model.
- **The Ledgers** — cross-engagement views as books in the persistent **Studio Drawer**: Library, Orders, Accounts, People, Hours. Lenses over the documents; every line links home; sheets over whatever is held.

**The ledger rule:** worked for one engagement → in the document. Across engagements → a ledger. Applied to relationships: a client with N projects has N documents; the client is a People-ledger entry.

**The focus model:** strict one-document-at-a-time (D1). Pick up → work → put down. ⌘K jumps anywhere; every destination is a document or a ledger, never a zone.

**Session 01 verdict (L1, GREEN):** unaided anchor discovery and an unaided margin act on first contact — the core bet validated, with the caveat of a one-folder desk. The three best findings were Leah's, now ratified: her thresholds (R10), the Note kind (R14), and the Strata Mark as a progress device (R15).

---

## 2. Ratified decisions

**D1–D11** as logged (v1.0 seed): strict focus · designer-driven interruptions · mobile gates the flip · zero shadows, CI-enforced · Pulse in the margin · visible-to-all + presence · ship-alongside-phase-in · persistent drawer · capture-in-document/review-in-drawer · suggestive adjustable capture · provisional auto-start (D11 gut-check at Session 02).

**D12 · Full-bleed document.** In hand, the paper IS the screen — no surround, border, radius, or stacked edge (Desk-state devices only). Drawer is the only persistent layer; sheets/log strip/Doc* popovers/⌘K the only other overlays. Spine + margin = sticky full-height rails; pick up = raise-to-fill (~270ms; reduced-motion crossfade).

**D13 · Mobile pattern (fulfills D3).** Unified bottom bar in a document (section handle = spine sheet · timer glance · drawer handle; on the Desk: drawer + "in hand today"). Margin items = anchored chips beneath their lines → tap raises a bottom sheet with full item + actions. Spine sheet doubles: sections + "In the margin · N" jump rows. Material rule: paper sheets = document parts; charcoal sheets = desk books. Conservative gestures; system back = put down (chains the timer through the log offer). No margin count in the bar. **Leah's on-device validation is a flip gate.**

**R1–R15 (one line each; full text in `DECISIONS.md`):**

| ID | Ruling |
|----|----|
| R1 | Document = engagement; Desk unions project / proposal-chain / lead; N folders per client; Direction ≈ draft proposal; manual projects ghost early sections. |
| R2 | Stamps render the FF&E machine 1:1 (STAGE_CONFIG canonical) + derived RECEIVED, DECISION DUE (current date), DAMAGED; EXTENDED/RETURNED dropped. |
| R3 | Shadow lint scoped to Document dirs now, app-wide at dissolve; overlays only via `Doc*` wrappers; two ESLint rules, CI-blocking. |
| R4 | Extend `project_time_entries` additively; phase auto-fills, designer picks activity; sub-60s rule follows start mode; pick-up chains out any running timer. |
| R5 | Destinies for all unmapped surfaces (Aesthete → Library+Accounts; Insights → ledger front-matter; vendors → Orders; Reviews → Care; Nurture/Rooms/Inbox dissolve; Portfolio/Resources/Team exiled). |
| R6 | Resolver redirects activated-proposal ids to `/doc/[projectId]` — pre-signing links survive the signing moment. |
| R7 | DAMAGED deferred to per-item attribution (Slice 4 `ffe_item_id` FK); until then claims surface in unfold + Orders + Desk need line. |
| R8 | Slice-2 seams: margin placeholder line; no unfold-hint on inert bars; real dates only. |
| R9 | First structured Leah session after Slice 3 (executed — L1 GREEN). |
| R10 | I6 retune to Leah's numbers: 1d unopened / 2d unsigned / 24h lead; precision watch at Session 02; per-studio settings when studio #2 onboards. |
| R11 | CLAIM OPEN need-line stamp blessed; "Record Sarah's pick" personalization on the decision-override action. |
| R12 | Margin ordering under load: needs-action floats (urgency-ranked) → anchor order → "Settled · N" collapsed fold. No counts elsewhere. |
| R13 | Pulse v1 = portal message + comms notification; **full Friday email (Resend, journey template) is a flip gate.** |
| R14 | **The Note** — sixth margin kind: designer-authored, ≤5s capture, anchored, optional due date, escalates to decision or SCA; studio-visible, never client-visible. |
| R15 | Strata Mark fill-state (3 lines = Shaping / Commitment / Delivery) on tabs, letterhead, ⌘K rows; one motion only — a slow breath on the active spine marker; nothing on the Desk moves. |

---

## 3. Information architecture & navigation contract

```
DESK (home under PostHog flag `the-document-pilot`)
 ├── "Needs your hand" (actionable engagements; R10 thresholds; never a feed)
 ├── "In motion" chips (incl. on_hold = paused)
 └── [Studio Drawer — persistent, §8]

DOCUMENT — full-bleed (D12)
 ├── Route: /doc/[id] — id accepts ANY engagement key (project id /
 │   proposal-chain root / live proposal id / lead id / relationship id),
 │   resolved via one document_state lookup (I8); activated-proposal ids
 │   redirect to the project id (R6). URL not otherwise rewritten.
 ├── Spine: sticky rail — Put down · 7 markers · timer (Slice 5) · presence
 ├── Main: letterhead · settled bars (unfold in place) · active section
 └── Margin: sticky rail — six anchored kinds, R12 ordering

LEDGER SHEETS (overlay state; must not unmount the document)
 ├── Library (+ teaching mode) · Orders (+ vendor pane) · Accounts
 │   (+ royalties/Pledge) · People (clients only) · Hours

COMMAND BAR (⌘K) — documents · sections · lines · ledgers · timer commands
```

**Invariants:** sheet open/close preserves all document state. Esc priority: help → log strip (discard) → open sheet → put down. One active section per document; opening lands on it.

**Mobile (D13).** Same IA, different physics: the unified bottom bar owns the thumb edge (section handle / timer glance / drawer); the spine is a paper bottom sheet doing double duty (sections + margin summary with jump-to-anchor rows); margin items are chips beneath their anchors, raising paper sheets with actions at the thumb; ledgers are charcoal sheets. System back = put down, chaining the timer through the log offer. Canonical reference: `patina-the-document-mobile-d3-v1.html`. Built in Slice 6; validated by Leah on her own phone before the flip.

**Old portal → Document mapping:** unchanged from v1.1 §3 (R5 destinies). All old surfaces run untouched until the flip (D7).

---

## 4. Document anatomy

Identity, the stage→section mapping table, edge cases (manual projects ghost Brief→Proposal; on_hold/archived/declined handling), the signing moment, and presence are unchanged from v1.1 §4, with these accretions:

- **The signed-awaiting-activation sub-state (I7)** is canon: an `accepted` proposal with no project row surfaces as a needs-your-hand folder — need line "Signed — open the project", SIGNED stamp — ranked directly under overdue decisions.
- **`document_state` (00188)** is the shared derivation source for Desk, spine, and ⌘K; extend it, never fork it (00189 added claim counts).
- **Rendering honesty (R8):** inert settled bars show no "unfold ↓" hint; hint copy appears only when a bar's unfold ships. Spine sub-labels claim only dates the data carries.
- **Letterhead** carries the fill-state Strata Mark (R15, §10).

---

## 5. The Margins — six kinds (R14)

One component shell, kind-accent left border (2.5px). All anchored: `anchor_kind ∈ {line, section, letterhead}` + `anchor_id`.

| Kind | Accent | Source & mechanics |
|---|---|---|
| `decision` | Golden Hour | `client_decisions`; line anchor derived via `blocked_by_decision_id` / `source_decision_id`. Resolution from the margin = the shipped override-with-consent path (`apply_decision`), button personalized: **"Record Sarah's pick"** (R11). Extension = `due_date` patch; the item narrates it; the stamp shows only the current date (R2). |
| `message` | Dusty Blue | `comms_threads/messages` + additive anchor columns; `unread` derives from caller's `last_read_at`; opening marks read (I13). |
| `invoice` | Clay | `invoices` + lines; anchor from `milestone_id`/`ffe_item_id`; auto-draft trigger (first line → `production` ⇒ milestone drafts). |
| `pulse` | Sage | `weekly_pulses` (00192): pg_cron Friday draft per active project, body composed from the week's real movement; **send = one transaction** flipping the pulse and posting the client comms message (I12). Email leg gates the flip (R13). |
| `time` | Mocha | `project_time_entries` daily summaries; read-only until Slice 5. |
| `note` | Aged Oak | **R14, new.** Designer-authored marginalia. Capture ≤5 seconds: "+ Note" in the rail header (desktop) and the spine sheet's margin section (mobile); from a line unfold, pre-anchored to that line; default anchor = letterhead. Optional due date (a dued note joins needs-action ordering). **Escalates in place** → (a) a client decision via shipped machinery, or (b) a Scope Change Authorization (verify the artifact exists; stub + flag if not, §14.9). Studio-visible (D6); **never client-visible** — the margin's private layer. Storage additive (`margin_notes` or repo-convention equivalent). |

**Architecture (I13):** `margin_items` (00191) is an **index** — kind, anchor, state, thin payload; expanding fetches through existing domain hooks.

**Ordering under load (R12):** needs-action floats to the top, urgency-ranked like the Desk → everything else in **anchor order** (the margin reads top-to-bottom beside the paper it annotates) → resolved items fold into a collapsed **"Settled · N"** group at the bottom. The fold label is the only number anywhere in the margin.

**One-act-many-surfaces invariant:** unchanged — margin actions update line stamp, margin state, Desk, and client mirror in one transaction (extends `apply_decision` / PO-cascade patterns).

**The margin is the notification model (D2):** unchanged.

---

## 6. Procurement woven in — stamps

The R2 table stands (SPECIFIED → INSTALLED, 1:1 with STAGE_CONFIG; derived RECEIVED; DECISION DUE with current date), with the claims amendment finalized:

| State | v1 (now) | Slice 4 |
|---|---|---|
| Open damage claim | **No line stamp** (R7). Claims surface where true: line unfold's PO detail, Orders ledger, and the Desk need line with the **CLAIM OPEN** stamp (Terracotta family) — "AP-012 has an open damage claim", ranked below overdue decisions and the signing moment (I11). | Additive `ffe_item_id` FK on `damage_claims`/`receiving_inspections` ⇒ **DAMAGED** ships as a truthful per-item stamp; legacy claims with null attribution keep the unfold/need-line treatment — never guess. |

Line unfolds (Order Assistant mounted; `log-inspection-drawer` for receiving), Orders-ledger batching, and the unified query keys: unchanged from v1.1 §6.

---

## 7. The Desk

**Inputs (canon):** overdue/expiring decisions · hesitating proposals · new leads · signed-awaiting-activation (I7) · DELIVERED-awaiting-inspection · open claims (CLAIM OPEN) · Friday unsent Pulses · dued Notes (R14) · Care follow-ups (R5) · designer pins (`desk_flags`).

**Thresholds (R10 — Leah-calibrated, Middlewest-authoritative):** hesitating = sent **1 day** unopened OR opened **2 days** unsigned · lead urgency = deadline inside **24h**. Constants live in `desk-derivation.ts`. **Precision watch:** Session 02 must capture the precision/recall questions L1 missed — if the Desk runs noisy at this cadence, tune with data, don't revert. Per-studio settings when studio #2 onboards.

Folder card, urgency outline, in-motion rules: unchanged. Folder-tab marks carry fill-state (R15).

---

## 8. The Studio Drawer & Ledgers

Unchanged from v1.1 §8 (five books + front-matter summaries per R5; no badges ever), plus: on mobile the drawer renders as the unified bar's drawer handle and a charcoal sheet (D13).

---

## 9. The time system

Unchanged from v1.1 §9 (R4 consolidated: additive `project_time_entries` extension, two-dimensional attribution with auto-filled phase, source-following sub-60s rule, universal chain-out, adjustable log strip, Hours ledger). Mobile surfaces per D13: bar timer glance + paper timer sheet (pause / manual log); the log strip rides above the bar. **Session 02 (post-Slice 5) settles D11 auto-start and calibrates the idle-annotation threshold.**

---

## 10. Visual & craft system

Token source, type system, stamp recipe, stacked-edge recipe (Desk-state only per D12), folder tab, grain, urgency outline, motion rules, and the R3 enforcement scheme (`Doc*` wrappers + two ESLint rules, CI-blocking, scoped now / app-wide at dissolve): unchanged from v1.1 §10, with these accretions:

- **Full-bleed (D12):** open documents render edge-to-edge paper; spine/margin as sticky 100vh rails (overflow-y auto, padded clear of the drawer); no border/radius/stacked edge in hand. Pick up = raise-to-fill scale ~270ms; reduced-motion = crossfade.
- **Strata fill-state (R15):** wherever the mark stands for a document (folder tab, letterhead, ⌘K rows), its three lines render filled/unfilled by engagement movement — line 1 through **Shaping** (Brief→Direction), line 2 at **Commitment** (signed), line 3 through **Delivery** (Install→Care); unfilled lines at ghost opacity. Spine section markers keep per-section state colors — they answer "which section"; fill-state answers "how far."
- **The breath (R15):** exactly one ambient motion in the entire system — a slow (~3s ease) opacity swell on the **active spine marker only**; `prefers-reduced-motion` disables; nothing on the Desk ever moves. Further "pulsing" is declined by ruling.
- **Mobile materials (D13):** paper sheets for document parts (spine, margin items, timer); charcoal sheets for desk books (drawer, ledgers); scrim dimming is the only depth device.

---

## 11. Additive schema work (status-consolidated)

**Shipped:** 00188 `document_state` (SECURITY INVOKER; Desk/spine/⌘K shared source) · 00189 claim counts on `document_state` · 00191 `margin_items` index view · 00192 `weekly_pulses` + `send_weekly_pulse` single-transaction send · resolver redirect (R6/I11).

**Remaining (all additive, zero destructive — D7):**
1. Slice 4: `ffe_item_id` FK on `damage_claims` + `receiving_inspections` (R7) · `margin_notes` storage + note→decision/SCA escalation (R14; SCA audit-first).
2. Slice 5: `project_time_entries` extensions per R4 (`raw_seconds`, `idle_seconds`, `source`, `activity`).
3. Slice 6 / flip: `desk_flags` · `designer_interruption_rules` (ships empty) · Pulse email leg via Resend using the journey-set template (R13) · invoice auto-draft trigger if not yet landed.

---

## 12. Phase-in plan (D7) — with gates

1. ✅ Parallel flagged route (`the-document-pilot`), real data.
2. ✅ → ongoing: Leah works real days in it; **Session 01 GREEN (L1)**; friction → `DECISIONS.md`. Session 02 follows Slice 5: D11 gut-check, idle threshold, **and the precision/recall capture L1 missed**.
3. Action parity per slices (3 of 6 complete).
4. **Default-flip gates (consolidated):** D13 mobile pattern built + **Leah's on-device validation** · **Pulse email leg live** (R13) · idle annotation shipped (D10) · R5 destinies staged · Desk precision verified at R10 thresholds.
5. Default flip (`/portal` → `/desk`); zones URL-only.
6. Dissolve: remove zones on flat telemetry; redirect old URLs; widen shadow ban app-wide (R3); retire Inbox after verification (R5).

---

## 13. Build order (status + scope)

**Slice 0 ✅** audit · **Slice 1 ✅** Desk (I4–I7) · **Slice 2 ✅** shell + full-bleed (I8–I11, D12, R6–R8) · **Slice 3 ✅** margins live (I12–I13, R11), Session 01 GREEN.

**Slice 4 — line unfolds + Orders ledger, plus riders.**
Core: FF&E unfold mounting Order Assistant + `log-inspection-drawer`; DELIVERED→RECEIVED rendering; per-item DAMAGED via the `ffe_item_id` migration (legacy claims keep need-line treatment); Orders sheet (incl. vendor pane) with open-document links + one batch action.
Riders: **the Note kind end-to-end** (capture ≤5s from rail header / line unfold; due dates join needs-action; escalation to decision live, SCA verified-or-stubbed) · **Strata fill-state** (static rendering: tabs, letterhead, ⌘K) · I6 constants retune (R10 — lands immediately, not gated on the slice).
*Accept:* document state survives sheet open/close; a note captured from a line unfold lands anchored to that line in under 5 seconds; DAMAGED appears only on items with attributed claims; fill-state matches each real engagement's movement.

**Slice 5 — time (R4).** Unchanged from v1.1 §13 + D13 forward-compat: the bar/timer components take a state, they aren't forked per surface. Ends with **Session 02** (D11, idle threshold, precision/recall, Note-under-load and R12 ordering validation).

**Slice 6 — polish + flip gates.** ⌘K extension (with fill-state rows) · Friday Pulse desk-rise · **Pulse email leg** (R13) · interruption settings (empty) · idle annotation · ledger front-matter · Aesthete fold · the breath (R15) + motion pass · **D13 mobile build** + Leah device validation · R5 exiles staged.

---

## 14. Open questions (do not resolve unilaterally)

1. **D11** auto-start vs opt-in — Session 02.
2. **Idle threshold** (start 8 min) — Session 02.
3. **Desk precision at R10 thresholds** — Session 02 must capture Q1/Q2; tune with data if noisy.
4. **Activity vocabulary** — revisit after two weeks of real entries.
5. **Billable default** vs flat-fee job-costing — travels with the time session.
6. **Multi-designer Desk semantics** (D6) — at studio member #2; R10 thresholds become per-studio settings then too.
7. **Direction-share upgrade** — replace the draft-proposal approximation when client reactions on boards ship.
8. **Mobile Receiving placement** — photo-rich receiving is iOS-only; web parity vs iOS-first.
9. **SCA artifact** — does a Scope Change Authorization object exist in the codebase? R14's escalation verifies first; if stubbed, designing the SCA flow becomes a named design-session deliverable.
10. **Inbox retirement** — verify unique functions before removal (R5).
11. **Old-portal flight #1 (L1)** — trigger uncaptured; if it recurs in Session 02, name it.

---

## 15. References

`patina-the-document-prototype-v4.html` (desktop canon) · `patina-the-document-mobile-d3-v1.html` (mobile canon, D13) · `leah-session-01-first-tuesday.html` (session instrument — reuse for Session 02 with the §14 capture list) · `CODEBASE-MAP.md` · `DECISIONS.md` (D1–D13, R1–R15, I1–I13, L1) · designer-client journey docs (incl. the Pulse email template for R13) · three-layer catalog handoff.
