# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.1 — **supersedes v1.0.** Slice 0 audit complete; rulings R1–R5 incorporated; Slices 1–5 unblocked; Slice 6 destinies assigned.
**Last updated:** 2026-06-11 (design session, post-audit decision interview)
**Authority order:** Codebase (current behavior) → this spec (intent & contracts) → prototype (look, feel, motion) → `DECISIONS.md` (running log; R1–R5 are folded in here)
**Repo reality (per audit I3):** patina-merged monorepo, `@patina/*` packages, **React 19**, Next.js 15, Tailwind, self-hosted Supabase. Prototype reference: `docs/design/the-document/patina-the-document-prototype-v3.html` (the only prototype in-repo; canonical).

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** `CODEBASE-MAP.md` (Slice 0, approved 2026-06-11) is the bridge; its §4 and §5 mapping tables are now canon and reproduced here.
2. **This spec is the authority on intent.** Conflicts with the codebase that survive v1.1 go to `DECISIONS.md` as open items — never silently resolved.
3. **The prototype is the authority on look, feel, motion.** Port intent (tokens, rhythm, recipes, timing) into React 19/Tailwind; never port markup.
4. **`DECISIONS.md` is append-only.** D1–D11 + R1–R5 are ratified. New decisions get appended, dated, never edited.

---

## 1. The concept in one page

Zone navigation fragments one client relationship across eight places. The Document model replaces it with the designer's existing mental model — the job folder:

- **The Desk** — home. Documents that *need the designer's hand today*, documents in motion, nothing else. No dashboard furniture, no badges.
- **The Document** — one living document per **engagement** (R1). It grows through seven sections: **Brief → Discovery → Direction → Proposal → Project → Install → Care.** Nothing converts; the document gains sections. The FF&E line drafted in the Proposal is the same row that carries stamps in the Project section. Settled sections compress to a letterhead bar + seal; unfold in place.
- **The Margins** — decisions, messages, money, the Weekly Pulse, and time records are marginalia anchored to the line or section they concern. The margin is also the notification model.
- **The Ledgers** — cross-engagement views are books in a persistent **Studio Drawer**: Library, Orders, Accounts, People, Hours. Lenses over the documents; every line links home. Ledgers open as sheets over whatever is held; they never navigate away.

**The ledger rule:** worked for one engagement → in the document. Worked across engagements → a ledger. Applied to relationships too: a client with N projects has N documents; *the client* is a People-ledger entry linking them (R1).

**The focus model:** strict one-document-at-a-time (D1). Pick up → work → put down. ⌘K jumps anywhere; every destination is a document or a ledger, never a zone.

---

## 2. Ratified decisions

**D1–D11** as logged in `DECISIONS.md` (seeded from v1.0 §2): strict focus · designer-driven interruptions · mobile chips+sheet pattern gates the flip · zero shadows (mechanically enforced) · Pulse in the margin · visible-to-all + presence · ship-alongside-phase-in · persistent drawer · capture-in-document/review-in-drawer · suggestive adjustable capture · provisional auto-start.

**R1–R5** (2026-06-11, full text in `DECISIONS.md`):

| ID | Ruling (one line) |
|----|----|
| R1 | Document = engagement; Desk unions project / proposal-chain / lead shapes; N folders per client; Direction ≈ draft proposal; manual projects ghost early sections. |
| R2 | Stamps render the codebase FF&E machine 1:1 (8 stages, STAGE_CONFIG canonical) + derived RECEIVED (delivered + clean inspection) + DECISION DUE (current date) + DAMAGED; EXTENDED/RETURNED dropped. |
| R3 | Shadow lint scoped to Document dirs now, app-wide at dissolve; overlay primitives enter only via `Doc*` wrappers; `no-restricted-imports` + `no-restricted-syntax`, CI-blocking. |
| R4 | Extend `project_time_entries` additively (minutes canonical + `raw_seconds`/`idle_seconds`/`source`/`activity`); phase auto-fills from the document, designer picks activity; sub-60s rule follows start mode; pick-up chains out any running timer. |
| R5 | Destinies for all unmapped surfaces: Aesthete folds into Library+Accounts; Insights = ledger front-matter; vendors → Orders; Reviews → Care+margin; Nurture/Rooms/Inbox dissolve; Portfolio/Resources/Team exiled quietly. |

---

## 3. Information architecture & navigation contract

```
DESK (home when `the-document-pilot` flag is on)
 ├── "Needs your hand" (actionable engagements only; never a feed)
 ├── "In motion" chips (incl. on_hold = "paused"; never actionable)
 └── [Studio Drawer — persistent, §8]

DOCUMENT (one engagement; three addressable shapes — R1)
 ├── signed:        /doc/[projectId]
 ├── pre-signing:   proposal chain (keyed by chain root)
 ├── pre-proposal:  lead / designer_client
 │   (concrete route scheme for the latter two is implementation-level;
 │    log the choice in DECISIONS.md — a resolver that accepts any of the
 │    three keys and canonicalizes is acceptable)
 ├── Spine: Put down · 7 section markers · timer · presence
 ├── Main: letterhead · settled bars (unfold in place) · active section
 └── Margin: anchored items (decision/message/invoice/pulse/time)

LEDGER SHEETS (overlay state, never routes; must not unmount the document)
 ├── Library (+ teaching mode, R5) · Orders (+ vendor pane, R5)
 ├── Accounts (+ royalties & Pledge, R5) · People (clients only, R5) · Hours

COMMAND BAR (⌘K — extend the existing command-palette.tsx)
 └── documents · sections · lines · ledgers · start/stop timer (existing)
```

**Navigation invariants:** sheet open/close preserves all document state (scroll, unfolds, in-progress compose, running timer). Esc priority: help overlay → log strip (= discard) → open sheet → put down.

**Old portal → Document mapping (extended per audit §2 + R5):**

| Today | → Desk |
| Pipeline (leads/proposals/projects/rooms) | → Desk arrangement + document sections; rooms directory dissolves into documents (R5) |
| Procurement | → line stamps + Orders ledger |
| Products (library/catalog/vendors) | → Library ledger; **vendors → Orders ledger directory pane** (R5) |
| Clients (clients/reviews/nurture/decisions) | → People ledger (clients only) · Reviews → Care + margin · Nurture dissolves into Desk + Care + People filter (R5) · decisions → margin items |
| Billing (invoices/AR/earnings/time) | → Accounts ledger + invoice margins + Hours ledger |
| Messages | → message margin items + Desk |
| Aesthete (teaching/companion) | → **teaching = Library ledger mode; Engine stats & royalties = Accounts** (R5) |
| Insights | → **each ledger's front-matter summary page** (R5): Accounts revenue/AR · People pipeline conversion · Orders throughput · Hours utilization |
| Portfolio / Resources / Team / Inbox | → quiet exile (⌘K) / help / settings / retire after Slice-6 verification (R5) |

All old surfaces run untouched until the default flip (D7).

---

## 4. Document anatomy

**Identity (R1).** A document is one engagement. Once a project row exists, the document is the project. Pre-signing, it is the live proposal chain (supersede via `parent_proposal_id`; chain root is the key). Pre-proposal, it is the lead/designer_client. Brief→Proposal sections of a signed document reconstruct from the activating proposal via provenance FKs (`proposals.project_id`, `source_proposal_item_id`). A client with two projects = two folders (tab = surname; title distinguishes); the household-level view is the People ledger.

**Stage → section state mapping (canon, per audit §4 / R1):**

| Section | `active` when | `settled` when | Source |
|---|---|---|---|
| Brief | lead exists, not yet accepted | designer accepts | `leads` + `designer_clients.status='lead'` |
| Discovery | accepted, no proposal draft | a draft exists | `designer_clients` + proposal absence |
| Direction | latest proposal `draft` | proposal sent | `proposals.status` — *approximate; settled = "direction work concluded." Upgrade when a direction-share feature ships (see §14).* |
| Proposal | latest chain proposal `sent`/`viewed` | `accepted` → SIGNED seal (`signed_at`, `signed_by_name` real) | proposal chain |
| Project | project `active`, phase ∈ consultation…procurement | install begins | `projects` + `project_phases` |
| Install | phase ∈ installation, final_walkthrough | phases complete | `project_phases` |
| Care | project `completed` (permanent) | never | `projects` + `designer_clients ∈ (completed, nurture)` |

**Edge cases (blessed):** manual projects (no proposal lineage) ghost Brief→Proposal and open at Project. `on_hold` = paused in-motion chip, never needs-your-hand. `archived` = ⌘K/People only. Declined/expired proposals hold at Proposal-active with the state in the need line.

**Rendering rules:** exactly one active section; opening lands there. Settled sections = letterhead bar + stamp, unfold in place read-only (the Proposal unfold renders the canonical proposal block components). Letterhead = mini Strata Mark + names + one-line vitals. **Care additionally hosts:** the Care Guide, reviews (R5), and the follow-up cadence whose due touchpoints rise on the Desk.

**The signing moment:** Proposal seals (real signature data exists), Project unfurls beneath, FF&E lines gain stamp affordances. No route change; data continuity via `activate_proposal_as_project` (00180) provenance.

**Presence (D6):** Supabase Realtime presence channel per document — net-new; do **not** build against the projects-service socket.io presence (audit §9).

---

## 5. The Margins

Kinds (one component shell; 2.5px kind-accent left border): `decision` (Golden Hour) · `message` (Dusty Blue) · `invoice` (Clay) · `pulse` (Sage, D5) · `time` (Mocha).

**Sources and anchors (per audit §6):**

| Kind | Source | Anchoring |
|---|---|---|
| decision | `client_decisions` (+options, events) | project/phase/room/proposal FKs exist; **line anchor derivable in reverse** via `project_ffe_items.blocked_by_decision_id` / `source_decision_id` — computable in the view, no migration |
| message | `comms_threads`/`comms_messages` | additive `anchor_kind`/`anchor_id` on threads (nullable; default letterhead) |
| invoice | `invoices` + line items | anchor derivable from lines (`milestone_id`/`ffe_item_id`, 00187). **Auto-draft-from-stamp trigger (first line hits `production` → milestone invoice drafts) is net-new** |
| pulse | net-new `weekly_pulses` (anchors built in) + Friday draft job + client mirror | section anchor (Project) |
| time | `project_time_entries` (R4) | daily-summary margin item is a query; `phase_key` → section |

**Unified read model:** a `margin_items` Postgres view normalizing to `{kind, anchor_kind ∈ (line, section, letterhead), anchor_id, state, timestamps, payload}`.

**One-act-many-surfaces invariant:** margin actions extend the existing transactional RPC pattern (`apply_decision` 00175; PO cascade triggers 00184) — one transaction updates line stamp, margin state, Desk input, and client-portal mirror. Never deferred sync.

**The margin is the notification model (D2):** events accumulate silently in unopened documents; the Desk re-sorts in the background; nothing breaks through unless a designer's own rules (shipping empty) say so.

---

## 6. Procurement woven in — stamps (R2)

Stamps are a **pure rendering** of the DB-enforced FF&E machine (rank-ratchet, 00184). `stages.ts` `STAGE_CONFIG` is the canonical label/color source. No parallel status store.

| Stamp | Derivation |
|---|---|
| SPECIFIED / QUOTED / APPROVED | `status` 1:1 — the three pre-order states render distinctly (designer workflow buckets; "approved but not ordered" stays visible) |
| DECISION DUE | `blocked_by_decision_id` → pending decision with `blocking_status='blocks_procurement'`; **always shows the current due date** — extensions narrated by the decision margin item, never a stamp |
| ORDERED / PRODUCTION / SHIPPED | `status` 1:1 (PO cascade); `po_number`, `acknowledged_at`, `confirmed_eta` surface in the unfold |
| DELIVERED | `status='delivered'`, no clean inspection yet — **a visible "awaiting inspection" studio to-do and valid need-line input** |
| RECEIVED | derived: `delivered` + clean `receiving_inspections` row |
| DAMAGED | inspection outcome damaged/partial or open `damage_claims`; claim state in the unfold |
| INSTALLED | `status='installed'` (manual designer act) |

Dropped from v1 (no data): EXTENDED, RETURNED (R2).

**Line unfold:** PO detail, movement, receiving summary, actions. **Order Assistant** (`order-assistant.tsx`, props-driven, decision-block aware) mounts inside the unfold with minimal change. Receiving mounts `log-inspection-drawer.tsx`; the photo-rich "Mobile Receiving" lives in iOS — its web placement is an open item (§14). FF&E table builds from the existing `ffe/*` kit; keep the unified query keys (`['project-ffe-items', projectId]`, `['procurement-items']`).

Cross-engagement procurement (receiving plan, vendor PO batching) = Orders ledger; batch actions write back into each document.

---

## 7. The Desk

Inputs (per audit §7): overdue/expiring decisions ✅ · hesitating proposals (`sent/viewed` + engagement data) ✅ · new leads with response deadlines ✅ · DELIVERED-awaiting-inspection items (new input, R2) · Friday unsent Pulses (needs `weekly_pulses`) · designer pins (needs `desk_flags`) · Care follow-ups due (R5).
Folder card: tab (surname) · title · stage line · single need line with stamp. Urgent = Golden Hour outline. "In motion" includes `on_hold` as "paused." Prefer encapsulating the §4 derivation in a `document_state` view so Desk, spine, and ⌘K share one source (audit §11.6).

---

## 8. The Studio Drawer & Ledgers (D8, D9, R5)

Persistent bottom strip (charcoal, hairline top border) on Desk and inside documents: five books + the quiet right-edge "In hand today" readout (opens Hours). No badges, ever.

| Ledger | Contents after R5 | Re-homes (audit §8) |
|---|---|---|
| **Library** | three-layer catalog **+ teaching mode** (classification, match correction — the Aesthete's input side lives with the products it touches) | `library-layer-nav`, `@patina/catalog-ui`; needs pathname-independent layer state |
| **Orders** | cross-engagement procurement **+ vendor directory pane** | by-vendor/by-status/calendar/receiving + Order Assistant |
| **Accounts** | invoices, A/R, earnings **+ Aesthete royalties — the 25% Pledge as a line in the studio's own book** | billing surfaces + Stripe flows |
| **People** | **clients only**; documents per household; reviews aggregate; nurture filter | clients directory + designer_clients lifecycle |
| **Hours** | time review/edit/batch/export (R4) | `/portal/time` + `use-time-tracking.ts` |

**Front matter (R5):** each ledger opens onto a one-page summary (its Insights slice — Accounts: revenue/AR · People: pipeline conversion · Orders: throughput · Hours: utilization), then its rows. No dashboard book exists.

---

## 9. The time system (D9, D10, D11, R4)

**Storage:** extend `project_time_entries` (00177) additively — never fork:

```sql
alter table project_time_entries
  add column raw_seconds  integer,        -- pre-adjustment elapsed (audit trail)
  add column idle_seconds integer,        -- annotation only; never subtracted (D10)
  add column source       text not null default 'timer_manual'
    check (source in ('timer_auto','timer_manual','manual_entry')),
  add column activity     text;           -- Design/Sourcing/Client/Site visit/Admin (v1)
-- duration_minutes stays canonical; invoice guard trigger, project_unbilled_time
-- view, and one-running-timer-per-user index all untouched.
```

**Attribution (R4):** two-dimensional. `phase_key` **auto-fills** from the document's current phase at log time — the spine knows where the pen is; the designer is never asked. The picker asks only `activity`. `task_id` stays optional.

**Lifecycle:** pick up → timer starts (`timer_auto`; D11 provisional — fall back to one-tap start if Leah's first session says so). Spine widget: IN HAND + mm:ss + Pause + "+ Log" (`manual_entry`). Put down → log strip: editable duration pre-filled with elapsed, adjustable **up or down** (D10), activity select, Log/Discard.

**Rules (R4):** sub-60s follows start mode — `timer_auto` discards silently; `timer_manual` keeps the shipped round-up-to-1-minute. **Picking up a document chains out ANY running timer** (header-started included) through the log offer — one mechanic everywhere. The header TimerButton continues unchanged in old zones and dissolves with them. Idle detection (later): annotates the offer ("includes ~N quiet minutes"); never modifies the number.

**Hours ledger:** entries across engagements (doc · activity · phase · source · duration editable inline · billed/unbilled), today/week totals, batch add, "Export week → Accounts," then job-costing (hours absorbed vs. proposal pricing). Daily per-document totals also render as `time` margin items.

---

## 10. Visual & craft system

**Token source:** the CSS vars in `apps/designer-portal/src/app/globals.css` (`--color-clay` et al. — the spec's exact hexes). **Not** `@patina/design-system/tokens/colors.ts` (divergent OKLCH). Fonts already loaded.

**Recipes (port intent):** ink stamp — DM Mono 600 uppercase, 1.5px state-color border, 3px radius, `rotate(-1.5deg)`, transparent fill. Flat stacked edge — two offset solid sheets (≈2.5px/5px), 1px ink borders, no blur. Folder tab. Paper grain at 1% opacity. Urgent = Golden Hour outline. Strata Mark at three scales (spine markers / letterhead / ledger spines) — **net-new primitive**; component name `StrataMark` (it is the brand-canonical device name; the repo being Patina-branded is not a conflict). Motion: 250–280ms lift-and-settle, vertical folds, 80ms stamp settle, nothing slides from screen edges, full `prefers-reduced-motion`.

**Enforcement (R3):** ESLint flat config, CI-blocking via `pnpm lint`, scoped to Document dirs: (1) `no-restricted-syntax` for `shadow-*` strings + `box-shadow`/`drop-shadow`; (2) `no-restricted-imports` banning direct design-system overlay primitives — overlays enter via Document-local **`Doc*` wrappers** (DocDialog, DocPopover, DocCommand, DocSheet…) baking in `shadow-none` + paper treatment. Wrappers portal-local first; promote per the catalog-ui precedent. App-wide widening at dissolve.

---

## 11. Additive schema work (consolidated)

1. `weekly_pulses` (anchor columns from day one) + Friday draft job + client mirror.
2. `desk_flags` · `designer_interruption_rules` (D2, ships empty).
3. `comms_threads.anchor_kind`/`anchor_id` (nullable, letterhead default).
4. `project_time_entries` extensions (§9, post-R4 — unblocked).
5. `margin_items` view (§5).
6. `document_state` view (§4 derivation, shared by Desk/spine/⌘K).
7. Invoice auto-draft trigger/job (first FF&E line → `production` ⇒ milestone invoice drafts).

Zero destructive changes; old zones keep functioning (D7).

---

## 12. Phase-in plan (D7)

1. Parallel flagged route — PostHog `the-document-pilot` via `useFeatureFlag` (fail-closed; `NEXT_PUBLIC_FLAG_OVERRIDES` for env/dev). Real data, read-mostly first.
2. Leah works real Tuesdays in it; old nav one click away; friction → `DECISIONS.md`. (Settles D11 + idle threshold.)
3. Action parity per slices.
4. **D3 mobile pattern built and validated — hard gate.** (Request mockups from the design session first.)
5. Default flip (`/portal` redirect → `/desk`); zones reachable by URL only. R5 destinies executed here.
6. Dissolve: remove zone routes when telemetry flatlines; redirect old URLs into documents/ledgers; widen the shadow ban app-wide (R3); retire Inbox after verification (R5).

---

## 13. Build order (updated)

**Slice 0 — ✅ complete** (CODEBASE-MAP approved; rulings R1–R5 issued).

**Slice 1 — Desk (read-only).** Engagement union per R1 (project / chain / lead shapes); folders with R2 stamps in need lines; in-motion incl. paused; drawer strip (sheets stubbed); R3 lint rules + first `Doc*` wrappers land in this PR. *Accept:* Leah's real Tuesday shows correct folders with truthful need lines; zero shadows; the lint fails a deliberately-shadowed test commit.

**Slice 2 — Document shell (read-only).** §4 mapping (ideally via `document_state` view); ghost sections for manual projects; letterhead; settled bars with Proposal unfold (canonical blocks, read-only, real seal data); Project section from the `ffe/*` kit with R2 stamps; presence line. *Accept:* every real engagement renders at its stage; open lands at active section; Esc puts down.

**Slice 3 — Margins (read, then act).** `margin_items` view + anchors + hover highlight; then decision resolve (extends `apply_decision`; one-act invariant), message reply (thread anchors; client mirror), invoice send, Pulse (table + Friday draft + send). *Accept:* the prototype's Whitfield loop end-to-end on real data.

**Slice 4 — Line unfolds + Orders ledger.** Order Assistant mounted in unfold; LogInspectionDrawer for receiving; DELIVERED→RECEIVED rendering; Orders sheet (incl. vendor pane per R5) with open-document links + one batch action. *Accept:* document state survives sheet open/close intact.

**Slice 5 — Time (R4).** Migration §9; spine timer (auto, provisional); log strip with adjustable duration; chain-out of any running timer; "+ Log"; Hours ledger (inline edit, batch add, totals, export stub); "in hand today" readout; time margin items. *Accept:* doc-switch and header-timer chaining both offer correctly; `timer_auto` <60s silent-discards while `timer_manual` rounds up; adjusted entries persist `raw_seconds`.

**Slice 6 — Polish + flip gates.** ⌘K extension; Friday Pulse desk-rise; interruption settings (empty); idle annotation; ledger front-matter summaries (R5); Aesthete fold (teaching mode in Library; royalties in Accounts); motion + reduced-motion; **D3 mobile pattern** (after design input); R5 exiles/retirements staged for the flip.

---

## 14. Open questions (do not resolve unilaterally)

1. **D11**: auto-start vs opt-in — Leah's first real session decides.
2. **Idle annotation threshold** (start 8 min) — Leah calibration; required before billing leans on timer data.
3. **D3 mobile pattern** — anchored chips + bottom-sheet spine: request dedicated mockups from the design session before Slice 6 mobile work.
4. **Activity vocabulary** — fixed five vs designer-extensible; revisit after two weeks of real entries.
5. **Billable default** — `project_time_entries.billable` semantics vs Middlewest's flat-fee job-costing; confirm with Leah.
6. **Multi-designer Desk semantics (D6)** — same document on two members' desks when both have a need; validate at second designer.
7. **Direction-share upgrade** — when client reactions on boards ship, upgrade the §4 Direction derivation (R1 notes it as approximate).
8. **Mobile Receiving placement** — photo-rich receiving is iOS-only today; decide web parity vs iOS-first.
9. **Inbox retirement** — verify margins + Desk cover all unique functions before removal (R5).

---

## 15. References

`patina-the-document-prototype-v3.html` (canonical interaction reference) · `CODEBASE-MAP.md` (Slice 0, approved) · `DECISIONS.md` (D1–D11, R1–R5, I1–I3) · designer-client journey docs · three-layer catalog handoff (Library internals).
