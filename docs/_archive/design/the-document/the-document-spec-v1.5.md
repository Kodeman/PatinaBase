# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.5 — **supersedes v1.4.** The Document is **flipped to default** (THE GO + FLIP CONFIRMED, 2026-06-12): `/portal` resolves to `/desk`, zone routes stay URL-reachable with no nav entry, the pilot flag is default-on for the studio, rollback = the same toggle in reverse. Slices 0–6, the flip, and **Dissolve Tracks 1–2 + the Strata Mark** are complete. Since v1.4 the **build** has caught up to and passed the rulings: **Track 3 SHIPPED** — the reusable Rooms shell, the Library Room, the Engine-as-presence, the Accounts book + Aesthete fold, the Composing Page (R41, I29–I34, device-validated L4). On that foundation three new bodies of work shipped: **Track 4 — Proposal Authoring** (the Drafting Room; R42–R45, I35), **Track 5 — Project Coordination · the ball-in-court** (R46–R54, O7, I36), and **the Decision Composer** — the authoring + enriched-detail half of the Decisions zone (R55–R56, I37–I38). This cut folds all of it into the body.
**Last updated:** 2026-06-16 (the v1.5 fold of Tracks 3–5 + the Decision Composer; R54's owed spec-fold delivered).
**Authority order:** Codebase → this spec → prototypes → `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I38 · R1–R56 · L1–L4 · THE GO · FLIP CONFIRMED).
**Repo reality:** patina-merged monorepo, `@patina/*` packages, React 19, Next.js 15, Tailwind, self-hosted Supabase. Document-stack migrations through **00220** (Track 3 read models; Track 4 `00210`–`00211`; Track 5 `00212`–`00220`).
**Canonical prototypes** (in `docs/design/the-document/`): desktop `patina-the-document-prototype-v4.html` · mobile `patina-the-document-mobile-d3-v1.html` (D13) · the Dissolve look/feel `patina-dissolve-eleven-surfaces-v1.html` · the Strata progress system `patina-strata-mark-progress-system.html` · the Room shell + Library `patina-library-room-prototype.html` · the Composing Page `patina-composing-page-prototype.html` · **proposal authoring `patina-proposal-authoring-prototype.html`** (Track 4) · **project coordination `patina-project-coordination-prototype.html`** (Track 5, R54) · **the decision system `patina-decision-system-prototype.html`** (R55–R56). Session instrument: `leah-session-01-first-tuesday.html`.

Section numbering is unchanged from v1.1–v1.4 — existing `spec §N` references in `DECISIONS.md` remain valid. §14 items keep their numbers permanently; resolved items are marked, never renumbered. Material since v1.4 folds into the existing sections plus three new sections — **§17 (Proposal Authoring)**, **§18 (Project Coordination)**, **§19 (The Decision Composer)**.

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** Canon now includes everything through v1.4, plus: **Track 3 (shipped)** — the reusable Rooms shell (enter = put-down + timer chain-out, Drawer persists, full-bleed paper, zero shadows, doorway affordance, leave = return-to-origin), the Library Room (three shelves My/Studio/Patina, capture→promote→nominate, the librarian on top, teach-while-browsing), the Engine as a presence (⌘K ask-and-place + the Library librarian, placement provenance), the Accounts book + the Aesthete fold (the two-sided 25% Pledge), the Composing Page grammar (self-composing paper, Strata-only progress) — review-blessed (R41), device-validated on Leah's phone (L4); **Track 4 (shipped)** — Proposal Authoring as the Drafting Room (R42–R45); **Track 5 (shipped)** — Project Coordination, the ball-in-court (R46–R54); **the Decision Composer (shipped)** — create/build/publish from the margin + the enriched decision detail (R55–R56).
2. **This spec is the authority on intent.** Conflicts → `DECISIONS.md` as open items.
3. **The prototypes are the authority on look, feel, motion.** Port intent, never markup.
4. **`DECISIONS.md` is append-only**, lives ONLY in the repo, edited only by commit, and carries the integrity footer (entry count + last id) on every append.

---

## 1. The concept in one page

Unchanged from v1.4 §1 (Desk · Document-per-engagement Brief→Care · six-kind anchored Margins · Ledgers/Rooms in the persistent Drawer · the ledger rule · strict one-document focus; pilot **resolved** L1–L3 GREEN; Rooms join the model, D14). The model now **authors as well as reads**: the Composing Page grammar (R40), proven on the Library Room (Track 3), governs three new creation surfaces — a proposal builds itself in the **Drafting Room** (§17), a project's open work is composed and resolved through the **ball-in-court** (§18), and a decision is created/built/published from the **margin composer** (§19). Each is the same physics: a paper artifact that composes in any order, shows its own gaps, is a usable draft at every percent, and carries the Strata Mark as its only progress. Device validation (L4) confirms the Rooms shell and the Track-3 surfaces hold on Leah's phone.

---

## 2. Ratified decisions

**D1–D14** as logged (D12 full-bleed · D13 mobile pattern · D14 Sheets & Rooms). **R1–R56** — full text in `DECISIONS.md`. R1–R40 folded in prior cuts; new since v1.4 §2:

| ID | Ruling |
|----|----|
| R41 | **Track 3 review** — blessed, with rulings on the flagged calls and four fixes (F1 ≥1280 screenshots, F2 provisional commons match-rate, F3 "taught today" daily read, F4 paper RoomSheet for Promote/Nominate). |
| R42 | **The Drafting Room** — proposal authoring is a Room (D14), eight scope-builder tabs become eight facets composing in any order (R40); the Strata Mark is the only progress (three movements: scope · the offer · the vision). |
| R43 | **The live proposal** — no generate button; a live "client's copy" preview builds as facets fill (mirror grammar, no cost/margin/TBD, CI-tested per R27); FF&E line types Fixed · Allowance · TBD, tap-to-cycle. |
| R44 | **Send and revise** — Send is a letterhead instrument (R27 family) flowing into the mirror + signature-as-decision; Revise creates a new version that supersedes-on-send (v1 kept in history, D7); signature settles the Proposal section and opens the Project in the same document (nothing converts). |
| R45 | **The proposal on the Desk** — lifecycle tiers, derived never listed: drafting-actively = quiet · drafting-untouched = in-motion chip · sent-unopened ≥1d = chip · hesitating = needs-hand folder · signed = the folder resolves into a project. |
| R46 | **Tracked parties** — four courts (designer/client/gc/vendor); a GC/vendor is *tracked, not authenticated* (`project_parties`, `profile_id` nullable = no login v1); the designer records its move on its behalf; giving a party a login later is a flag flip, never a migration. |
| R47 | **RFI answer authority** — the designer writes the answer; the GC court tracks accountability, not write access; no new GC write surface ships in v1. |
| R48 | **The submittal split** — a vendor resubmit creates a Rev-N revision (RPC-only), the item stays pending; only the designer approves a revision and resolves the item. The two acts never collapse. |
| R49 | **The punch two-step** — open with the GC court (the fix is theirs); resolving is the designer's verify-and-close (explicit `p_next_court` gc→designer); a punch's "done" is a designer assertion, not a status the GC can set. |
| R50 | **One thread per item** — a coordination item's conversation lives in one canonical thread (`comms_threads.coordination_item_id`); `decision_comments` retained for back-compat (D7). |
| R51 | **Quiet inline confirmation, never a toast (D2)** — a coordination act confirms by the document changing (the §5 one-act fan-out), optionally a quiet inline "recorded ✓"; no toast, ever. Resolves O7 (Track 5). |
| R52 | **Block-on-phase unlocks, it does not auto-advance** — resolving a blocking item unlocks what it gated (FF&E/task/phase); only the sign-off (an approval gate, R23) still settles a section via the 00204 trigger. Coordination unblocks; the gate-as-decision settles. |
| R53 | **Cycle prevention** — the DB enforces only the direct self-reference guard; multi-hop cycle detection is app-side for v1 (the webs are shallow); promote to a DB-side closure check only if real webs grow deep. |
| R54 | **The Track 5 prototype is canonical; the spec fold is owed** — `patina-project-coordination-prototype.html` governs Track 5 look/feel; the spec fold (this cut) lands R46–R54 + I36 in the body. |
| R55 | **The decision composer** — create/build/publish from the margin: one composition *sheet* (never a route/modal), composing any-order (decision_kind taxonomy · title · context · options + materialize-from-Library · due · phase · blocking + the FF&E line it gates); draft → publish → delete; publishing a *blocking* decision lights the `decision_due` stamp; the same sheet is the front door for the Track-5 coordination kinds. |
| R56 | **The enriched decision detail** — deepen the read-only margin `DecisionBody` into the designer's enriched view: the kind-line, rich context, full option attributes, status lifecycle, extend+nudge, and the full resolution audit trail (choice/recorded-by/method/evidence/timestamp); override-consent + reminder preserved verbatim. |

---

## 3. Information architecture & navigation contract

Unchanged from v1.4 §3 (the flip; Rooms join the contract, two Drawer weights). **Reinforced by the shipped Rooms shell:** entering any Room (the Library; the **Drafting Room**, §17) puts the current document down through the normal flow, chains out the timer, keeps the Drawer bar, renders full-bleed paper with no shadows, and returns you to origin on leave — the physics is now reusable, not Library-specific. The **ball-in-court** (§18) and the **decision composer** (§19) are not new routes: coordination renders in the Project section of the document and the composer opens as a Sheet from the margin — the navigation contract gains capability without gaining zones.

---

## 4. Document anatomy

Unchanged from v1.4 §4 (The Work · the Account Page · the folio · Rooms-on-schedule · the letterhead instruments · the colophon), now extended:

- **The Proposal section's Drafting Room doorway (R42, §17).** A document's Proposal section carries a doorway ("Into the Drafting Room ↗") into the proposal-authoring Room and, via `ProposalInstruments`, the Send/Preview/Revise sheets (R44) — the document never unmounts (D1). A signed proposal's section settles and the same document re-renders as the active project (R44).
- **The Coordination band (R46–R54, §18).** Mounted above the FF&E in the **Project section**: a court bar (open items grouped designer/client/gc/vendor) over kind-grouped rows (selection/rfi/submittal/sign-off/punch), the dependency web (a blocked task's ⊘ tick opens its blocker), and the open-item sheet that resolves each kind. It is read+act in the paper's grammar — no kanban, no separate coordination zone.
- **The decision detail (R56, §19).** The margin's `DecisionBody` is now the enriched, expandable detail (kind-line · rich context · full option attributes · status lifecycle · the resolution audit trail), with the one-act controls (nudge/extend/override-consent) inline.

---

## 5. The Margins — six kinds

Unchanged from v1.4 §5 (all six shipped; own voice settles; files are the folio). The **Decision** margin kind gains its **authoring half (R55, §19):** a margin **"+ New"** opens the composition Sheet (gated on a resolved `designer_clients.id`), and a **"Drafts · N"** disclosure re-opens unsent drafts; a draft is client-invisible until published. Publishing a *blocking* decision lights the FF&E line's `decision_due` stamp in the same act; the Track-5 resolve cascade clears it (§6, R52). Coordination items (§18) are **decisions with an owner** — the same `client_decisions` row widened by `coordination_kind`/`court`/`blocks_kind`, surfaced in the margin (selection) and the Coordination band (all five kinds). The enriched read view is R56 (§19). The §5 one-act-many-surfaces invariant now spans margin + Desk + FF&E line stamp **+ the Coordination band** (the band shares the invalidation set so a margin record keeps it in sync).

---

## 6. Procurement woven in — stamps, the send lifecycle, the Orders book

Unchanged from v1.4 §6 (stamp vocabulary, the send weave, the Orders book pages, Via Patina). **Coordination meets procurement (R52):** a coordination item's `blocks_kind` (none/ffe/task/phase) maps onto the existing `blocking_status` axis so the Desk need-lines and the FF&E machinery read truthfully. The **`decision_due` stamp** is the hinge: a *blocking* decision (selection or any coordination kind gating an FF&E line) lights it — `project_ffe_items.blocked = true` + a `pending` blocking decision — the instant it publishes (R55); resolving the item clears `blocked` and the stamp goes dark, letting procurement proceed (R52). Lighting is the create→publish direction (R55); clearing is the Track-5 `resolve_coordination_item` cascade. A blocking decision **gates an existing FF&E line** — it never auto-creates one (the feed-through path is for non-blocking selections only). The two ends are the same `blocked` / `blocked_by_decision_id` columns; no parallel stamp store.

---

## 7. The Desk

Unchanged from v1.4 §7 (the awareness tier, the final constants), now also fed by **proposal lifecycle tiers (R45)** — drafting-untouched and sent-unopened render as in-motion chips; a *hesitating* proposal (opened, no signature past the R10 threshold) promotes to a needs-your-hand folder because a nudge is the available act — and by **coordination courts (R22)**: an open item whose only act is *waiting on a party* is awareness-tier; one that needs the designer's move (an RFI to record, a submittal to approve, a punch to verify) is a folder. Signing a proposal resolves its folder and re-enters the engagement as a project with its first real need (R44/R45).

---

## 8. The Studio Drawer & Ledgers

Unchanged from v1.4 §8, now **shipped through Track 3:** the **Accounts book (R36)** — the three-page Drawer Sheet (Ledger · Receivables · Earnings) rolling up the per-engagement Account Pages — and **the Aesthete fold (R37)** on the Earnings page (two bands; the two-sided 25% Pledge) are built (I29–I34). Drawer weights hold (D14): Orders/Hours/Accounts/People are Sheets; the **Library is a Room** (shipped on the reusable shell, §16). The Drafting Room (§17) is a Room too — entered from a document's Proposal section, not the Drawer.

---

## 9. The time system — SHIPPED (I16)

Unchanged from v1.4 §9 (D11 auto-start resolved R19; write-first close-out R20; idle 1 min final). Rooms chain the timer out on entry (the Rooms-shell physics, R39/§16) — putting down the document to walk into the Library or the Drafting Room releases the running timer through the normal flow.

---

## 10. Visual & craft system

Unchanged from v1.4 §10 (the Strata Mark progress system, three-hue fill, `.breathing`, `.sweeping`). The Strata Mark is now the **only** progress on all three Composing-Page-grammar surfaces: the Drafting Room (three movements scope · offer · vision, R42), the Library/Composing Page (R40), and — implicitly — the decision composer's facet form. Zero shadows (D4) holds across every new surface: the Drafting Room, the Coordination band + its sheets, and the decision composer's `DocSheet` all build depth from value contrast + flat stacked edges, never `box-shadow`.

---

## 11. Additive schema work (status-consolidated)

Through v1.4's list (shipped through 00207), now extended — **all additive, D7, no destructive migrations until the dissolve's Stage 3:**
- **Track 3 read models** (Accounts revenue/AR/margin + earnings/royalty/Pledge rows; Rooms-shell state; Library shelves + capture/promote/nominate; Engine ask provenance + ⌘K intent; Composing-Page draft state) — shipped (I29–I34).
- **Track 4** — `00210` `sign_proposal` (SECURITY DEFINER, client-invoked: one tx settles an `approval` `client_decision`, flips the proposal to `accepted`, logs a `signed` engagement, auto-activates the project — the §5 invariant; idempotent via `accepted` short-circuit + a partial unique index) + `request_proposal_change`; `00211` `document_state.proposal_updated_at` (the R45 drafting-untouched tier).
- **Track 5** — `00212` `project_parties` (login-less GC/vendor, `profile_id` nullable, R46); `00213` `coordination_kind` + `court` + `court_party_id` + `blocks_kind` + `answer` on `client_decisions` — a **third axis orthogonal to `decision_type` (00084) and `decision_kind` (00202)**, both untouched (selection rides `decision_kind='choice'`); `00214` `coordination_item_revisions` (RPC-only write via `submit_coordination_revision`, R48); the `project_tasks` dependency web (`blocked_by_item_id`, `seq_after_task_id`, `owner`, self-ref guard R53); `00216` `comms_threads.coordination_item_id` (one thread per item, R50); `00217` party RLS; `00218` `resolve_coordination_item` (the one-act resolve cascade) + `may_resolve_coordination_item`/`is_coordination_party`; `00219` `coordination_court_summary` + `task_blocked_state` views + margin/document_state enrichment; `00220` intentional no-op (the existing decision notify/overdue covers all kinds).
- **The Decision Composer (R55–R56)** — **no migration.** The composer writes onto the widened `client_decisions` via the existing hooks; the lighting write (set `blocked=true` + `blocked_by_decision_id` on publish) and the three lifecycle hooks (`useUpdate/Publish/Delete CoordinationItem`) are app-layer; the enriched detail reads the full row via `useDecision` + the trail via `useDecisionOverrides`. Margin/Desk/coordination surfaces are VIEWS — they recompute on read, never written directly.

---

## 12. Phase-in plan (D7) — FLIPPED

Unchanged from v1.4 §12 (1–4 ✅; **5. Default flip DONE**; **6. Dissolve IN PROGRESS, telemetry-gated**). The dissolve's content tracks have now *shipped past* the ruling stage: Track 3's surfaces (the Library Room, the Engine, Accounts, the Composing Page) are built (I29–I34), and the Document has grown three authoring/coordination capabilities (Tracks 4–5, the composer) that close the gap matrix's #1 and #2 P0 clusters (§13). Stage 3 (old-URL redirects, zone removal, app-wide shadow ban, Inbox retirement) remains the terminal step; the prod deploy of the Document-stack migrations (00191–00220, migrations-before-app) is the standing operational prerequisite.

---

## 13. Build order (status + scope)

**Slices 0–6 ✅. The flip ✅. Dissolve Track 1 ✅ · Track 2 ✅ · grammar polish ✅ · Strata progress ✅. Track 3 ✅ (R41, I29–I34, L4). Track 4 ✅ (R42–R45, I35). Track 5 ✅ (R46–R54, I36). The Decision Composer ✅ (R55–R56, I37–I38).**

Against the feature gap matrix's P0 cluster (`portal-vs-desk-feature-gap-matrix.md`): **#1 Proposal authoring — CLOSED** by Track 4 (the Drafting Room replaces the 8-tab Scope Builder + the block editor; send/revise/sign as instruments). **#2 Decision composition + detail — CLOSED** by Track 5 (the generalized ball-in-court) + the Decision Composer (the create/build/publish authoring half + the enriched read detail). The remaining named P0 gaps (project lifecycle create/edit; the People/CRM book; invoicing depth; vendor directory+create) are the next candidates; flight telemetry ranks them.

**Recurring discovery across Tracks 3–5 + the composer:** the data layer was repeatedly more complete than the matrix's "absent" implied — Proposal Authoring, Project Coordination, and the Decision Composer were each largely a **new surface (or a generalize-in-place) over existing tables/hooks**, not a from-scratch build. Audit-first stays the standing rule.

---

## 14. Open questions (numbers permanent; resolved items marked)

1.–14. as in v1.4 (1–3 resolved; 4 Activity vocabulary; 5 Billable default; 6 Multi-designer Desk; 7 Direction-share; 8 Mobile Receiving/iOS; 9–14 resolved/landed).
15. **Via Patina commission rate + the Designer-Selections-vs-Style-Matches split (R37)** — marketplace-config / brand input; the Accounts/Earnings rendering is built to receive it. **(Still open — carried from Track 3.)**
16. **Proposal drafting-untouched threshold + hesitation copy (R45)** — `DRAFTING_UNTOUCHED_CHIP_DAYS=3d` shipped provisional; the matrix's "opened twice" is not backable (only first-open `proposal_viewed_at` is tracked, so the copy reads "Opened {date} — no signature yet"); the Drafting Room facet display order is Scope→Vision→Offer — a Leah-facing call, flagged.
17. **Sign→project two-step availability (R44/I35)** — `sign_proposal` ships `p_auto_activate=true` (the project opens on signature); the legacy two-step "Signed — open the project" Desk folder is retained as a safety net. Revisit with Leah whether to keep the two-step ever available.
18. **GC/vendor real logins (R46)** — `project_parties.profile_id` is ready to flip from nullable to a real `auth.uid()`; until then a party is tracked, not authenticated. The punch↔PO closeout link and multi-hop (DB-side) cycle detection (R53) are deferred until real webs need them.
19. **The decision_type taxonomy values (R55)** — the composer's subject-matter picker writes the existing `decision_type` column (00084: material/color/product/layout/substitution/budget/approval); "Finish" folds into the existing seven rather than adding an enum value — a Leah-facing call, flagged.

---

## 15. References

Prototypes: desktop v4 · mobile-d3-v1 · the Dissolve eleven-surfaces · the Strata progress system · the Library Room shell · the Composing Page · **proposal authoring** · **project coordination** · **the decision system** · the session instrument · `CODEBASE-MAP.md` · `the-document-parity-map.md` · `portal-vs-desk-feature-gap-matrix.md` · `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I38 · R1–R56 · L1–L4 · THE GO · FLIP CONFIRMED).

---

## 16. The Dissolve — tracks, the eleven surfaces, and Rooms

Unchanged from v1.4 §16 in intent (the dissolve turns the whole portal into the Document; D14 two Drawer weights; Tracks 1–2 shipped). **Track 3 has now shipped** (R41 review-blessed, L4 device-validated):
- **The Library — the first Room (R39, R32) — SHIPPED.** Three shelves (My/Studio/Patina) on the reusable Rooms shell; capture→promote→nominate via paper RoomSheets (R41 F4); the librarian on top; teach-while-browsing; "taught today" a daily read (F4 F3); the commons match-rate provisional (F2).
- **The Engine — a presence, not a place (R31, R38) — SHIPPED.** ⌘K ask-and-place (paper result-lines, Place →, the R35 sweep while thinking) + the Library librarian; placement carries "via the Engine" provenance; the inline "placed ✓" with no toast (the R51 discipline). Always "Designer-Taught Intelligence," never "AI."
- **The Accounts book + the Aesthete fold (R36, R37) — SHIPPED.** §8.
- **The Composing Page (R40) — SHIPPED**, and now the governing grammar for three further surfaces: the Drafting Room (§17), the ball-in-court composer (§18), the decision composer (§19).
- **Via Patina (R30)** — the marketplace rail; commission + two-sided Pledge at the moment of ordering, landing in Accounts.

**Dissolve staging (R21, telemetry-gated):** Stage 1 — R5 quiet exiles, Inbox verification. Stage 2 — ledger front-matter (✓), the Aesthete fold (✓, R37). Stage 3 — old-URL redirects, zone removal, app-wide shadow ban (R3), Inbox retirement. The Document-stack migration deploy (00191–00220) precedes Stage 3.

---

## 17. Proposal Authoring — the Drafting Room (Track 4, R42–R45)

Proposal authoring is **a Room**, not a zone (D14, R42). Entered from the Proposal section of a document (Desk → folder → document → Proposal → the doorway), never a top-level route — consistent with D1/D14.

- **Eight facets, any order (R42, R40 anti-wizard).** The legacy 8-tab Scope Builder + block editor become eight facets — Rooms in scope · FF&E schedule · Palette · Mood boards · Phases & fees · Exclusions · Payments · Change-order terms — each a checkable section showing its own completion and summary, composing in any order with no "step N of 8" and no hard gates. The **Strata Mark is the only progress**, filling across three movements: *scope* (Rooms + FF&E) · *the offer* (Phases, Exclusions, Payments, Terms) · *the vision* (Palette, Boards). The draft saves at any percentage — a real, usable proposal throughout. The Drawer persists inside (D8): the Library is one tap away for FF&E selections.
- **The live proposal (R43).** No generate button. A live "client's copy" preview (right rail) builds itself as facets fill — rooms, palette, pieces, exclusions, the investment total — in client-mirror grammar with **no cost breakdown, no margin, no TBD** (a CI-tested exclusion, R27). FF&E lines carry three types, tap-to-cycle: **Fixed** (a specific piece at a set price) · **Allowance** (a budget for a not-yet-chosen category) · **TBD**. Assets (mood boards, palette, space plan) clip via the Folio (R24).
- **Send and revise (R44).** **Send is a letterhead instrument** (R27 family): a sheet carrying recipient/CC/expiry/personal-note, flowing into the client mirror and the signature-as-decision (R23); a sent copy is not mutated thereafter. **Revise creates a new version** that supersedes the old **on send** — v1 is kept in version history on the document, never deleted (D7). **Signature settles the Proposal section and opens the Project in the same document** — nothing converts (the lead→proposal spine). Proposal list/filter and the tracking dashboard stay TRANSFORMED into Desk need-derivation + the margin, not rebuilt as zones.
- **On the Desk (R45).** A proposal is classified by lifecycle, derived never listed: drafting-actively = quiet · drafting-untouched past a threshold = an in-motion `drafting` chip · sent-unopened ≥1 day = a `sent_unopened` chip · hesitating (opened, no signature past R10) = a needs-your-hand `hesitating_proposal` folder (a nudge is the available act) · signed = the folder resolves and the engagement re-enters as a project. The send is the hinge of the whole chain.

**Contract / schema:** `sign_proposal` (00210, the one-tx settle→accept→sign→auto-activate, idempotent) + `request_proposal_change`; `document_state.proposal_updated_at` (00211). Provisional, flagged for Leah (§14.16–14.17): the untouched threshold (3d), the "opened twice" backing, the facet order, and the sign→project two-step's availability. Authority: `patina-proposal-authoring-prototype.html`.

---

## 18. Project Coordination — the ball-in-court (Track 5, R46–R54)

Every open item on a project is **a decision with an owner**. Track 5 generalizes the decision in place: five workflow shapes — **Selection · RFI · Submittal · Sign-off · Punch** — each in someone's **court** (designer / client / gc / vendor), blocking a **dependency web** of tasks, resolved by a **one-act cascade**. It renders as the **Coordination band** above the FF&E in the Project section (§4); it is not a new zone.

- **Tracked parties, not logins (R46).** A GC or vendor is tracked (`project_parties`), not authenticated — `profile_id` is nullable; the designer records the party's move on its behalf through the same one-act path used to record a client's pick (R11). Giving a party a login later is a flag flip, never a migration (§14.18).
- **Per-kind authority.** RFI (R47): the designer writes the answer; the GC court tracks accountability, not write access. Submittal (R48): a vendor resubmit creates a Rev-N revision (RPC-only `submit_coordination_revision`), the item stays pending; **only the designer approves** a revision and resolves the item — the two acts never collapse. Punch (R49): open with the GC court; resolving is the designer's **verify-and-close** (explicit `p_next_court` gc→designer) — "done" is a designer assertion, not a GC status. Sign-off keeps the gate-as-decision settle path (R52).
- **The resolve cascade (R51, R52, the §5 invariant).** One transaction: the item's status, the court bar's per-court count, the dependent task flipping blocked→todo (respecting `seq_after`), the FF&E block clearing, the margin row, and the Coordination band all change together — **that visible change IS the confirmation** (no toast, ever; D2). A selection's resolve delegates to `apply_decision`; the others record their answer/approval and cascade. **Resolving a blocking item UNLOCKS what it gated — it does not advance the phase** (R52); only the sign-off, an approval gate (R23), settles a section.
- **One thread per item (R50).** A coordination item's conversation lives in one canonical thread (`comms_threads.coordination_item_id`); `decision_comments` is retained for back-compat (D7).
- **Cycle prevention (R53).** The DB holds the direct self-reference guard; multi-hop cycle detection is app-side for v1 (the webs are shallow), promotable to a DB-side closure check only if real webs grow deep.

**Contract / schema:** the widened `client_decisions` (`coordination_kind`/`court`/`court_party_id`/`blocks_kind`/`answer`, 00213 — orthogonal to `decision_type`/`decision_kind`); `project_parties` (00212); `coordination_item_revisions` (00214); the `project_tasks` dependency web; `resolve_coordination_item` (00218); the read-model views (00219). The composer (§19) is the **front door** — it writes the row; this section's resolve path settles it. Authority: `patina-project-coordination-prototype.html` (R54).

---

## 19. The Decision Composer — authoring + the enriched detail (R55–R56)

The Decisions zone's **read/act** half was already full (the margin `DecisionBody`, override-consent, nudge); Track 5 generalized the decision in place. This is the **authoring** half plus the enriched read detail — and it is built by **generalizing the Track-5 composer, not rebuilding** (one create-surface, one resolve-path).

- **The composer (R55).** A single composition **Sheet** — opened from the margin **"+ New"** (or a project section), never a full-page modal or a separate route; reuses the Track-4/Track-5 sheet machinery + the Composing-Page fill-in-any-order grammar (R40). It composes, in any order: the **decision_kind taxonomy** (the subject matter — Material/Color/Product/Layout/… written to `decision_type`, the existing 00084 column; §14.19) · title · the client-facing **context** · **options** with full attributes (name/price/qty/image-swatch/designer-note/recommended "pick") · **materialize options from the Library** (the draft-product-seeding path) · due date · phase link (`phase_id`) · **blocking + the FF&E line it gates**. The **lifecycle** is draft → publish → delete: a draft is unsent, client-invisible, and editable in the margin (a "Drafts · N" disclosure re-opens it); publish flips draft→pending; delete clears the dependency web first.
- **The authoring side of the §5 invariant.** Publishing a *blocking* decision **lights the `decision_due` stamp** on its FF&E line the instant it goes pending — the mirror of Track 5's resolve cascade that clears it (§6, R52). R55 owns only the create→publish→light direction.
- **The front door for the generalized item.** A selection is the default decision; an RFI / submittal / sign-off / punch (§18) is *composed* through this same sheet — the composer writes the row, Track 5 resolves it.
- **The enriched detail (R56).** The read-only margin `DecisionBody` is deepened in the designer's view: the **kind-line** (subject · shape+court when not a plain client selection · approval-gate · lifecycle word) · **rich context** (ported from the client mirror) · **full option attributes** (price/qty/imagery/designer note/"your pick"/"chosen") · **status lifecycle** legibility · **extend + nudge** when pending/overdue · the **full resolution audit trail** (choice · recorded-by · consent method · evidence · timestamp — previously a date-only "Resolved · date" line). The two FULL flows — override-consent (`useApplyDecisionOverride`) and reminder (`useSendDecisionReminder`) — are **preserved verbatim**; a record updates margin + Desk need-line + FF&E line stamp + the Coordination band in one act. Discussion stays transformed into the project comms thread (R27) and the one-thread-per-item model (R50); decision analytics (P2) and internal designer notes stay out of the Document.

**Contract / schema:** no migration — the composer writes the widened `client_decisions` via the existing hooks (the lighting write + `useUpdate/Publish/Delete CoordinationItem` are app-layer); the detail reads the full row via `useDecision` + `useDecisionOverrides`. Declined from scope: a full-page composer, a modal, a separate "+ New" picker route, decision analytics, internal designer notes in the client-visible margin. Authority: `patina-decision-system-prototype.html`.
