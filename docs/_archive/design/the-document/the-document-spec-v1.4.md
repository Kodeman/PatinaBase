# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.4 — **supersedes v1.3.** The Document is **flipped to default** (THE GO + FLIP CONFIRMED, 2026-06-12): `/portal` resolves to `/desk`, zone routes stay URL-reachable with no nav entry, the pilot flag is default-on for the studio, rollback = the same toggle in reverse. Slices 0–6 complete. **Dissolve Track 1** (in-document parity, R23–R27/R29 — I25, fixes I26) and **Track 2** (the Orders book grows pages, R28 — I26) shipped and grammar-polished (I27); the **Strata Mark progress system** (R35 — I28) shipped. **Track 3 RULED, build pending:** the Accounts book (R36), the Aesthete fold (R37), the Engine as a presence (R38), the Library Room on a reusable Rooms shell (R39), the Composing Page (R40).
**Last updated:** 2026-06-13 (design session — Track 3 rulings + the Library-Room and Composing-Page prototypes).
**Authority order:** Codebase → this spec → prototypes → `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I28 · R1–R40 · L1–L3 · THE GO · FLIP CONFIRMED).
**Repo reality:** patina-merged monorepo, `@patina/*` packages, React 19, Next.js 15, Tailwind, self-hosted Supabase. Document-stack migrations through **00207** (+ 00199 activation `vendor_id`).
**Canonical prototypes** (in `docs/design/the-document/`): desktop `patina-the-document-prototype-v4.html` · mobile `patina-the-document-mobile-d3-v1.html` (D13) · the Dissolve look/feel `patina-dissolve-eleven-surfaces-v1.html` · the Strata progress system `patina-strata-mark-progress-system.html` · **the Room shell + Library `patina-library-room-prototype.html`** · **the Composing Page `patina-composing-page-prototype.html`**. Session instrument: `leah-session-01-first-tuesday.html`.

Section numbering is unchanged from v1.1–v1.3 — existing `spec §N` references in `DECISIONS.md` remain valid. §14 items keep their numbers permanently; resolved items are marked, never renumbered. Material since v1.3 folds into the existing sections plus a new **§16 (the Dissolve)**.

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** Canon now includes everything through v1.3, plus: the **flip** (`/portal`→`/desk`; flight telemetry `document_zone_flight`; week-one watch `document_desk_rendered` / `document_log_strip_acted`); **Track 1** — gates-are-decisions (an approval gate IS a `client_decision`; server-side one-transaction settlement advances the project's real vocabulary; client approval settles the section), the folio (files clipped to the paper, studio-only default, versions stacked), rooms-on-schedule, the Account *Page* (per-engagement financials, studio-eyes-only, CI-enforced), the letterhead instruments (client mirror, send-a-note, the scan), the colophon (+ §14.6 RLS widening, 00205); **Track 2** — the Orders book pages LEDGER · THE WEEK · RECEIVING · VENDORS (install collisions rise on the Desk; one shared inspection drawer; 00206–00207); the **Strata Mark progress system** (three-hue fill + the `.sweeping` loader replacing spinners portal-wide).
2. **This spec is the authority on intent.** Conflicts → `DECISIONS.md` as open items.
3. **The prototypes are the authority on look, feel, motion.** Port intent, never markup.
4. **`DECISIONS.md` is append-only**, lives ONLY in the repo, edited only by commit, and carries the integrity footer (entry count + last id) on every append.

---

## 1. The concept in one page

Unchanged from v1.3 §1 (Desk · Document-per-engagement growing Brief→Care · six-kind anchored Margins · Ledgers in the persistent Drawer · the ledger rule · strict one-document focus), with the pilot **resolved**: Session 01 GREEN (L1), Session 02 (L2) and the L3 device-validation walk both GREEN — both flip gates satisfied ("Very slick"; 0 false-positive / 0 miss at heat). The Document is the default. The model now reaches past the document into the Drawer's **two weights** — Sheets you pull vs **Rooms** you walk into (D14) — and gains a creation grammar, the **Composing Page** (R40). See §16.

---

## 2. Ratified decisions

**D1–D14** as logged (D12 full-bleed · D13 mobile pattern · **D14 Sheets & Rooms**). **R1–R40** — full text in `DECISIONS.md`. R1–R18 folded in prior cuts; new since v1.3 §2:

| ID | Ruling |
|----|----|
| R19 | D11 auto-start **RESOLVED** — ratified at Session 02. |
| R20 | Write-first close-out vindicated; the log strip persists (no timeout — confirmed). |
| R21 | The flip protocol — gate definitions, stage-now/toggle-later, flight telemetry, telemetry-gated dissolve staging. |
| R22 | **The action test** — the awareness tier: if the only available act is *waiting*, it renders as an in-motion chip carrying state, not a Desk folder. The pressure valve for hot-threshold/noisy-desk tension. |
| R23 | The Work — tasks/deliverables in the paper's grammar; a gate **is** a client decision; client approval settles the section. Declined: kanban, assignees, priority, custom phases. |
| R24 | The Folio — files clip to the paper (a folio strip, not a margin kind); versions stack via the stacked-edge recipe; studio-only default. |
| R25 | Rooms on the schedule — the FF&E written as room headings (Playfair-italic) in the Project section. |
| R26 | The Account Page — engagement financials in the document (settled-bar band); studio-eyes-only, CI-enforced. |
| R27 | The letterhead instruments — view-as-client mirror, send-a-note (the Pulse's ad-hoc sibling), the scan (iOS RoomPlan handshake, advances §14.8). |
| R28 | The Orders book grows pages — LEDGER · THE WEEK · RECEIVING · VENDORS (never tabs); install collisions rise on the Desk (R22 tiers). |
| R29 | The Colophon — the document states its own facts; Hold/Archive/Team…; §14.6 RLS widening rides the Team popover. |
| R30 | Via Patina — the marketplace rail; commission + the two-sided Pledge shown at the instant of ordering. |
| R31 | The Engine — a presence, not a place (answers in ⌘K and the Library librarian; renders in document grammar). |
| R32 | The Library — the first Room (three shelves; teaching while browsing). |
| R33 | Track 1 review — blessed, with six fixes (F1–F6: own-voice settles, mirror attribution, Pulse idempotency, MANUAL label, room vocabulary, sender names). |
| R34 | Milestone triggers — `on_date` auto-drafts (review-then-send); `on_signing` stays a designer act. |
| R35 | Strata Mark progress system — per-line three-hue fill + the `.sweeping` loader (extends R15). |
| R36 | The Accounts book — Drawer **Sheet**, three pages (Ledger · Receivables · Earnings), front-matter Revenue · AR · margin; aging AR rises on the Desk (R22) with dunning on the page; rolls up the R26 Account Pages. |
| R37 | The Aesthete fold — Earnings in two bands (earn / teaching-return); the **25% Pledge two-sided** (returned-to-you / given-to-the-commons, labelled); a one-line teaching lens in front-matter. |
| R38 | The Engine, build-grade — ⌘K intent-detected jump-vs-ask, ask-and-place paper result-lines; no thread/history/avatar but placement carries "via the Engine" provenance; the Library librarian is the second home; `/portal/companion` re-skinned, retires at dissolve. |
| R39 | The Library — first Room on a **reusable Rooms shell**; build the shell first, the Library as its first tenant. |
| R40 | The Composing Page — detailed processes as **self-composing paper** (no wizard/Step N of M); the Strata Mark is the only progress; inline · sheet · room; first instance "Compose a piece." |

---

## 3. Information architecture & navigation contract

Unchanged from v1.3 §3, plus: **the flip** — `/portal` resolves to `/desk`; zone routes stay URL-reachable with no nav entry points; the pilot flag is default-on. **Rooms join the contract (D14, §16):** the Drawer now holds two weights — Sheets (overlay, document stays mounted) and Rooms (full-screen paper you walk into; entering puts the document down through the normal flow). The Drawer bar persists inside both.

---

## 4. Document anatomy

Unchanged from v1.3 §4, now extended by the shipped Track-1 surfaces: **The Work** (R23) — each active section carries a quiet work block (deliverables/tasks as sage-tick stamps; a dued task passes R22 and may rise to the Desk; an approval gate is a `client_decision` that settles the section). **The Account Page** (R26) — a settled-bar band at the top of the Project section, studio-eyes-only. **The folio** (R24) — a thin strip under section heads and on FF&E unfolds; versions stack. **Rooms** (R25) — room headings as Playfair-italic sub-heads in the Project section, lines assigned by room. **The letterhead instruments** (R27) and **the colophon** (R29) — the document's top and foot rows. Files are material, never a margin kind.

---

## 5. The Margins — six kinds

Unchanged from v1.3 §5 (all six shipped, the Note live with dual escalation). Reinforced by R33 F1: **studio-authored messages settle** (own voice never qualifies as needs-action). Files are the folio (R24), not a seventh margin kind.

---

## 6. Procurement woven in — stamps, the send lifecycle, the Orders book

Unchanged from v1.3 §6 (stamp vocabulary, the R18 send weave), plus **the Orders book pages (R28, shipped):** LEDGER · THE WEEK · RECEIVING · VENDORS as DM-mono page links, never tabs. **The Week** promotes its intelligence — cross-project install collisions rise on the Desk as need lines (collision/late = folder; drift/overlap = in-motion chip, R22). **Receiving** reuses the same inspection drawer as the unfolds. **Vendors** carries terms, open POs, and the thread (vendor comms in the margin's message grammar, PO-anchored deep links). **Via Patina (R30):** the marketplace rail — the Via-Patina mark on catalog PO cells/vendor pages, ordering through the same Order Assistant + preview-as-confirm, and the commission + two-sided Pledge line at the moment of ordering (lands in the Accounts Earnings page, R36/R37).

---

## 7. The Desk

Unchanged from v1.3 §7, plus **the awareness tier (R22):** any need-line input whose only act is waiting renders as an in-motion chip (tappable into the document), promoting to a folder when an act becomes available. **Final constants (FINAL, Leah's numbers):** idle annotation **1 min** · PO drafted-unsent **1 day** · PO sent-unacknowledged **1 day** · R10 hesitation/lead thresholds **stand** · sent-unopened proposal = chip, folder at **2 days**. Install collisions and dued tasks/notes are Desk inputs (R28, R23).

---

## 8. The Studio Drawer & Ledgers

Unchanged from v1.3 §8 (Orders ledger v2, Hours ledger; ledger front-matter shipped — I23, the Insights distribution). **New — the Accounts book (R36):** a Drawer **Sheet** that grows three pages — **Ledger** (invoices), **Receivables** (A/R aging + dunning; an aged invoice also rises on the Desk per R22), **Earnings** (design fees + Via-Patina commissions + teaching royalties). Front-matter: Revenue · AR · margin, plus a one-line teaching lens (R37). It rolls up the per-engagement Account Pages (R26) with no figure authored twice; studio-eyes-only; bookkeeper access via the colophon Team… (R29/§14.6). **The Aesthete fold (R37)** lives on the Earnings page: two bands (*what you earn* / *what teaching returns*), the 25% Pledge rendered two-sided (returned-to-you / given-to-the-commons). **Drawer weights (D14):** Orders/Hours/Accounts/People are Sheets; the Library is a Room (§16).

---

## 9. The time system — SHIPPED (I16)

Unchanged from v1.3 §9, with Session-02 settlements: **D11 auto-start RESOLVED/ratified (R19)**; write-first close-out vindicated, the strip persists with no timeout (R20); idle threshold **1 min** (final). Activity-default and pause-noise remain watch items (§14.4).

---

## 10. Visual & craft system

Unchanged from v1.3 §10, plus **the Strata Mark progress system (R35 — extends R15):** each line carries its MOVEMENT hue (line 1 Mocha = Shaping, line 2 Clay = Commitment, line 3 Dusty Blue = Delivery at ~55%), a `--f` (0..1) per-line fill over a ghost track; behavior classes `(static fill)` / `.breathing` (the one ambient motion, active element only) / `.sweeping` (the indeterminate loader replacing spinners — used for scans, saves, and Engine "thinking"). Movement hues are for the mark only — never the stamp palette. The Strata Mark is also the **only** progress indicator on the Composing Page (R40).

---

## 11. Additive schema work (status-consolidated)

Through v1.3's list, now shipped through **00207**: gates-as-decisions + settlement trigger, folio (+ RLS on table and storage), rooms (zero-migration off 00066), the Account Page projection, the mirror projection, the colophon RLS widening (00205), own-voice + milestone-date cron (00206), vendor pane links + `contact_profile_id` (00207), `00199` activation `vendor_id`. **Remaining (Track 3, additive):** Accounts book read models (revenue/AR/margin + earnings/royalty/Pledge rows; Via-Patina commission rows); Rooms-shell state; Library shelves + capture/promote/nominate; Engine ask provenance + ⌘K intent; Composing-Page draft state (piece compose, two-sided authorship). No destructive migrations until the dissolve's Stage 3.

---

## 12. Phase-in plan (D7) — FLIPPED

1.–4. ✅ (parallel route → Session 02 → action parity → gates). **5. Default flip — DONE** (THE GO, FLIP CONFIRMED). **6. Dissolve — IN PROGRESS,** telemetry-gated (R21): Stage 1 (R5 quiet exiles, Inbox verification), Stage 2 (ledger front-matter ✓, the Aesthete fold — now ruled R37), Stage 3 (old-URL redirects, zone removal, app-wide shadow ban, Inbox retirement). Spec v1.4 is the flip-state consolidation. Flight telemetry ranks the remaining work from day one.

---

## 13. Build order (status + scope)

**Slices 0–6 ✅. The flip ✅. Dissolve Track 1 ✅ (I25, fixes I26/R33). Track 2 ✅ (I26). Grammar polish ✅ (I27). Strata progress ✅ (I28).**

**→ Track 3 (RULED R36–R40, build pending).** Recommended build order (dependency-sound; flight telemetry may re-rank):
1. **The Rooms shell (R39)** — reusable physics: enter = put-down + timer chain-out (D1), Drawer persists (D8), full-bleed paper (D12), zero shadows (D4), doorway affordance, leave = return-to-origin. Authority: `patina-library-room-prototype.html`.
2. **The Library Room (R39)** — three shelves (My/Studio/Patina), capture→promote→nominate, the librarian on top, teach-while-browsing; absorbs the Teaching Queue + Products zone.
3. **The Engine (R38)** — ⌘K intent-detected ask-and-place (paper result-lines, Place →, the R35 sweep while thinking) + the Library librarian; placement carries provenance; re-skin `/portal/companion`'s backend.
4. **The Accounts book (R36)** — the three-page Drawer Sheet + front-matter; aging AR → Desk + dunning.
5. **The Aesthete fold (R37)** — Earnings two bands + the two-sided Pledge + the front-matter teaching lens.
6. **The Composing Page (R40)** — "Compose a piece" from the Library; the self-composing paper pattern (Strata-only progress, two-sided marketplace authorship). Authority: `patina-composing-page-prototype.html`.
*Via Patina's order-moment line (R30)* wires through 3–5 (commission + Pledge into Earnings).

---

## 14. Open questions (numbers permanent; resolved items marked)

1. ~~D11 auto-start~~ — **RESOLVED (R19).**
2. ~~Idle threshold~~ — **RESOLVED: 1 min (final).**
3. ~~Desk precision at R10 thresholds~~ — **RESOLVED: 0-FP/0-miss at L3; R10 stands.**
4. **Activity vocabulary** (+ sticky default) — after two weeks of entries.
5. **Billable default** — travels with time data.
6. **Multi-designer Desk** + per-studio thresholds — at studio #2 (RLS widening shipped via R29/00205).
7. **Direction-share upgrade** — when client board reactions ship.
8. **Mobile Receiving / iOS handshake** — advanced by R27's scan; iOS-first vs web parity ongoing.
9. ~~SCA artifact~~ — **RESOLVED.**
10. **Inbox retirement** — dissolve Stage 1/3 (must cover the Vendors thread tab).
11. ~~Old-portal flight trigger~~ — flight telemetry live; ranks the dissolve.
12. ~~R18 send thresholds~~ — **RESOLVED: 1d/1d (final).**
13. ~~AP-012 engagement-scoping~~ — **RESOLVED/CLOSED at flip.**
14. ~~vendor_id fix~~ — **LANDED (00199).**
15. **Via Patina commission rate + the Designer-Selections-vs-Style-Matches split** (R37) — marketplace-config / brand input; the Accounts/Earnings rendering is built to receive it.

---

## 15. References

Prototypes: desktop v4 · mobile-d3-v1 · the Dissolve eleven-surfaces · the Strata progress system · **the Library Room shell** · **the Composing Page** · the session instrument · `CODEBASE-MAP.md` · `the-document-parity-map.md` · `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I28 · R1–R40 · L1–L3 · THE GO · FLIP CONFIRMED).

---

## 16. The Dissolve — tracks, the eleven surfaces, and Rooms

The dissolve turns the whole portal into the Document. Source authority: `patina-dissolve-eleven-surfaces-v1.html` (the eleven surfaces) + `the-document-parity-map.md` (old-portal → Document, buckets A/B/C).

**D14 — the Drawer's two weights.** **Sheets** are charcoal overlays for quick reference (pull, glance, put back; the document stays mounted) — Orders, Hours, Accounts, People. **Rooms** are full-screen paper workplaces you walk into; entering a Room puts the current document down through the normal flow (D1 holds — a Room IS the thing in hand; the timer chains out), the Drawer persists (D8), Rooms render full-bleed paper (D12) with no shadows (D4), and the Drawer marks room-weight objects with a doorway affordance (spine tick + "↗"). Leaving returns you where you were.

**Track 1 (shipped) — in-document parity:** The Work (R23), the Folio (R24), Rooms-on-schedule (R25), the Account Page (R26), the letterhead instruments (R27), the Colophon (R29). **Track 2 (shipped) — the Orders book grows pages** (R28). **Track 3 (ruled, building):**

- **The Library — the first Room (R39, R32).** Three shelves separated by Strata rules: My Library (raw captures), Studio Library (proven), Patina Catalog (the marketplace, Via-Patina marks, maker nomination); capture→promote→nominate. The librarian (the Engine) on top; teaching while browsing (Quick Tags inline, Deep Analysis as a sheet); stats compress to one foot line. Built on the reusable Rooms shell (shell first).
- **The Engine — a presence, not a place (R31, R38).** No standalone surface/thread/history/avatar. Two homes: ⌘K (intent-detected ask-and-place, paper result-lines, Place →, the R35 sweep while thinking) and the Library librarian. A placed item carries a quiet "via the Engine" provenance mark. `/portal/companion` re-skinned, exiled, retires at dissolve. Always "Designer-Taught Intelligence," never "AI."
- **The Accounts book + the Aesthete fold (R36, R37).** §8. The studio money Sheet; teaching royalties + the two-sided 25% Pledge on the Earnings page; a teaching lens in front-matter.
- **Via Patina (R30).** The marketplace rail; the commission + two-sided Pledge at the moment of ordering, landing in Accounts.
- **The Composing Page (R40).** The model's answer to the wizard: a paper artifact that builds itself — sections in any order, gaps shown, a usable draft at every percent, the Strata Mark the only progress, three weights (inline · sheet · room). First instance: "Compose a piece," authored from both sides of the marketplace. Governs detailed creation flows generally.

**Dissolve staging (R21, telemetry-gated):** Stage 1 — R5 quiet exiles (Portfolio/Resources/Team), Inbox verification. Stage 2 — ledger front-matter (✓), the Aesthete fold (R37). Stage 3 — old-URL redirects, zone removal, app-wide shadow ban (R3), Inbox retirement.
