# THE DOCUMENT — Design & Engineering Specification

**Workstream:** Designer Portal navigation replacement ("The Document" model)
**Status:** v1.6 — **supersedes v1.5.** The Document is **flipped to default** (THE GO + FLIP CONFIRMED, 2026-06-12): `/portal` resolves to `/desk`, zone routes stay URL-reachable with no nav entry, the pilot flag is default-on for the studio, rollback = the same toggle in reverse. Slices 0–6, the flip, and **Dissolve Tracks 1–2 + the Strata Mark** are complete, as are **Track 3** (the reusable Rooms shell, the Library Room, the Engine, Accounts + the Aesthete fold, the Composing Page; R41, I29–I34, L4), **Track 4 — Proposal Authoring** (R42–R45, I35), **Track 5 — Project Coordination · the ball-in-court** (R46–R54, O7, I36), and **the Decision Composer** (R55–R56, I37–I38). Since v1.5 a sixth body of work shipped: **The People Room** — the unified party directory as a walk-in Room, the role-adaptive Person Profile with the derived Relationship Journey, the relationship operations (Threads/Nurture/Reviews/Portfolio), and Outreach + People on the Desk (R57–R60, I40). This cut folds it into the body.
**Last updated:** 2026-06-17 (the v1.6 fold of the People Room, R57–R60 + I40).
**Authority order:** Codebase → this spec → prototypes → `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I40 · R1–R60 · L1–L4 · THE GO · FLIP CONFIRMED).
**Repo reality:** patina-merged monorepo, `@patina/*` packages, React 19, Next.js 15, Tailwind, self-hosted Supabase. Document-stack migrations through **00221** (Track 3 read models; Track 4 `00210`–`00211`; Track 5 `00212`–`00220`; the People Room read model `00221`).
**Canonical prototypes** (in `docs/design/the-document/`): desktop `patina-the-document-prototype-v4.html` · mobile `patina-the-document-mobile-d3-v1.html` (D13) · the Dissolve look/feel `patina-dissolve-eleven-surfaces-v1.html` · the Strata progress system `patina-strata-mark-progress-system.html` · the Room shell + Library `patina-library-room-prototype.html` · the Composing Page `patina-composing-page-prototype.html` · proposal authoring `patina-proposal-authoring-prototype.html` (Track 4) · project coordination `patina-project-coordination-prototype.html` (Track 5, R54) · the decision system `patina-decision-system-prototype.html` (R55–R56) · **the People Room `people/patina-people-room-prototype.html`** (R57–R60). Session instrument: `leah-session-01-first-tuesday.html`.

Section numbering is unchanged from v1.1–v1.5 — existing `spec §N` references in `DECISIONS.md` remain valid. §14 items keep their numbers permanently; resolved items are marked, never renumbered. Material since v1.5 folds into the existing sections plus one new section — **§20 (The People Room)**.

---

## 0. How to use this document

1. **The codebase is the authority on what exists.** Canon now includes everything through v1.5, plus: **The People Room (shipped, Wave 0 foundation I40)** — the People book opens as a walk-in Room (not a Drawer Sheet), a unified directory of every party (clients/makers/GCs/team/leads) over six Strata-ruled views (Directory/Threads/Nurture/Reviews/Portfolio/Outreach), a role-adaptive Person Profile whose heart is a *derived* Relationship Journey (+ Style DNA for clients), and Outreach + a People-nurture-due need-line on the Desk — review-blessed (R57–R60), founded on migration `00221` `public.people_directory`.
2. **This spec is the authority on intent.** Conflicts → `DECISIONS.md` as open items.
3. **The prototypes are the authority on look, feel, motion.** Port intent, never markup.
4. **`DECISIONS.md` is append-only**, lives ONLY in the repo, edited only by commit, and carries the integrity footer (entry count + last id) on every append.

---

## 1. The concept in one page

Unchanged from v1.5 §1 (Desk · Document-per-engagement Brief→Care · six-kind anchored Margins · Ledgers/Rooms in the persistent Drawer · the ledger rule · strict one-document focus; pilot **resolved** L1–L3 GREEN; Rooms join the model, D14; the Document now authors as well as reads — the Drafting Room §17, the ball-in-court §18, the margin composer §19). The model now also carries **the relationship layer**: the **People Room** (§20) is a second walk-in Room (after the Library) whose spine is a unified party directory and whose heart — the **Relationship Journey** — is the same physics as everything else: a *derivation* over existing tables (the person's documents, threads, touchpoints, reviews), not a stored log. Device validation (L4) confirms the Rooms shell and the Track-3 surfaces hold on Leah's phone; the People Room is built on that same shell.

---

## 2. Ratified decisions

**D1–D14** as logged (D12 full-bleed · D13 mobile pattern · D14 Sheets & Rooms). **R1–R60** — full text in `DECISIONS.md`. R1–R56 folded in prior cuts; new since v1.5 §2:

| ID | Ruling |
|----|----|
| R57 | **The People Room** — the People book opens as a walk-in **Room** (D14, full-bleed paper, put-down returns to origin), NOT a Drawer Sheet. Its spine is a **unified directory of every party** (clients · makers/vendors · GCs · studio team · open leads) in one role-filterable roster, over six Strata-ruled left-rail views (Directory · Threads · Nurture · Reviews · Portfolio · Outreach) + a derivation-backed ask bar. Declined: a clients-only CRM, a sheet form, a separate per-zone contacts page. |
| R58 | **The relationship journey — the role-adaptive Person Profile.** Opening a person opens a profile whose heart is the **Relationship Journey** — a single woven timeline that is a **DERIVATION, not a stored activity log** (`deriveRelationshipJourney` over documents/threads/touchpoints/reviews; `client_activity_log` is not extended). For clients it also shows **Style DNA — the Engine's read** (taste tags + palette + narrative from existing columns + the `styles` taxonomy). For makers/GCs/team the profile adapts (Orders + coordination cross-links; team → margin visibility / the colophon). |
| R59 | **Relationship operations.** Four operating views over the directory: **Threads** (a unified inbox reusing the shared `use-comms` model — one conversation surfaced everywhere, never duplicated; read + reply) · **Nurture** (the touchpoint queue, ranked by dormancy + trust via `deriveNurtureQueue`) · **Reviews** (three-state collection pending/collected/queued) · **Portfolio** (the finished-rooms gallery). |
| R60 | **Outreach + People on the Desk + the cross-link contract.** **Outreach** is the marketing-ops view (campaigns list/compose/send/stats · an email template library · audience segments that draw from the same directory). **People on the Desk:** nurture-due / reconnect surfaces as a Desk **need-line** (a `desk-derivation` extension); the inbox notifications tab + the Sales Pipeline stay TRANSFORMED, not rebuilt. **Cross-link contract:** maker/GC terms+orders live in the Orders book; GC open-items in the coordination view; team management stays /portal/team (the colophon handles margin visibility); lead detail cross-links to the Brief. The People Room is the *people* layer over those, not a re-home of them. |

---

## 3. Information architecture & navigation contract

Unchanged from v1.5 §3 (the flip; Rooms join the contract, two Drawer weights; entering any Room puts the document down, chains out the timer, keeps the Drawer bar, renders full-bleed paper with no shadows, returns to origin on leave; the ball-in-court renders in the Project section, the composer opens as a Sheet — capability without zones). **A second walk-in Room joins the contract:** the **People Room** (§20), like the Library (§16) and the Drafting Room (§17), is entered as a Room on the reusable shell — the People book flipped from a Drawer Sheet to a Room (the Drawer weight flip, §8). Its six views are a Strata-ruled left rail *inside* the Room, not new routes.

---

## 4. Document anatomy

Unchanged from v1.5 §4 (The Work · the Account Page · the folio · Rooms-on-schedule · the letterhead instruments · the colophon; the Drafting Room doorway R42/§17; the Coordination band R46–R54/§18; the enriched decision detail R56/§19). The People Room is a **Room, not a document section** — it does not change the document's anatomy; it reads *across* documents (a person's whole history) where a document reads *one engagement*. The two cross-link: a person's Relationship Journey threads through their documents, and a document's colophon names the team whose visibility the People Room's team profiles describe (R60).

---

## 5. The Margins — six kinds

Unchanged from v1.5 §5 (all six shipped; own voice settles; files are the folio; the Decision margin's authoring half R55/§19; coordination items are decisions with an owner; the band joins the §5 invalidation set). The People Room's **Threads** view (R59) reads the **same shared `use-comms` thread model** as the margin's Message kind: a thread is **one conversation surfaced everywhere** (it lives on the person AND on their document margin, R27) — never duplicated, never a parallel store. The People Room is the people-indexed entry to those conversations; the margin is the document-indexed entry.

---

## 6. Procurement woven in — stamps, the send lifecycle, the Orders book

Unchanged from v1.5 §6 (stamp vocabulary, the send weave, the Orders book pages, Via Patina; coordination meets procurement via `blocks_kind`↔`blocking_status`; the `decision_due` light/clear hinge). **The People Room respects the cross-link contract (R60):** a maker's/GC's terms and orders are NOT re-homed into the People Room — they stay in the Orders book and the coordination view; the maker/GC profile *cross-links* to them. The People Room adds the people layer (who they are, the relationship, the directory), not a second procurement surface.

---

## 7. The Desk

Unchanged from v1.5 §7 (the awareness tier, the final constants; the proposal lifecycle tiers R45; the coordination courts R22). **A new Desk need-line — People nurture-due (R60).** The Desk is now also fed by the People layer: a **dormant high-trust tie** (a past client or warm lead gone quiet past the nurture threshold) surfaces as a need-line — a `desk-derivation` extension (`desk-reconnect.tsx`), derived never listed, in the same FolderCard/in-motion grammar. The need's available act is *reconnect* (open the person / send a touchpoint). The directory status dot and the nurture "due" accent are **separate signals** (I40): a proposal-stage client can read a warm dot yet still be nurture-due. The inbox notifications tab + the Sales Pipeline stay TRANSFORMED, not rebuilt.

---

## 8. The Studio Drawer & Ledgers

Unchanged from v1.5 §8 (the Accounts book R36 + the Aesthete fold R37 shipped; the Library is a Room; the Drafting Room is a Room entered from the Proposal section). **The Drawer weight flip — People is now a Room (R57, I40).** Drawer weights hold (D14), with one correction: People flipped from `weight:'sheet'` to `weight:'room'` (`studio-drawer.tsx` + `mobile-sheets.tsx`; the dead generic-sheet placeholder removed). So the Drawer's two weights now read: **Orders / Hours / Accounts are Sheets; the Library and the People book are Rooms** (the Drafting Room is also a Room, entered from a document's Proposal section rather than the Drawer). The People Room is detailed in §20.

---

## 9. The time system — SHIPPED (I16)

Unchanged from v1.5 §9 (D11 auto-start resolved R19; write-first close-out R20; idle 1 min final; Rooms chain the timer out on entry). Walking into the People Room — like the Library or the Drafting Room — puts the current document down through the normal flow and chains out the running timer (the Rooms-shell physics, R39/§16).

---

## 10. Visual & craft system

Unchanged from v1.5 §10 (the Strata Mark progress system, three-hue fill, `.breathing`, `.sweeping`; the Strata Mark is the only progress on the Composing-Page-grammar surfaces; zero shadows D4 holds across every new surface). The People Room obeys the same craft system: full-bleed paper, the Strata-ruled left rail (Strata Marks as the view dividers, not tabs or cards), zero shadows on the directory rows / profile / view sheets (depth from value contrast + flat stacked edges), and the Engine's nurture nudge renders in the librarian voice ("Designer-Taught Intelligence," never "AI").

---

## 11. Additive schema work (status-consolidated)

Through v1.5's list (shipped through 00220), now extended — **all additive, D7, no destructive migrations until the dissolve's Stage 3:**
- **The People Room read model** — `00221` `public.people_directory`, an **additive `security_invoker` VIEW** (R57, I40) that `UNION ALL`s clients (`designer_clients`) + open leads (`leads`) + makers (`vendors` via `saved_vendors` / engaged via `project_parties.vendor_id`) + GCs (`project_parties` party_kind='gc') + team (`project_team_members`, de-duped to one row per teammate) into one roster: `(person_id, role, display_name, email, phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta)`. RLS is inherited (security_invoker) plus explicit `auth.uid()`/project-ownership filters; verified that a designer sees only their own roster. **No other migration** — the Relationship Journey, the Nurture queue, and Style DNA are **derivations** (`people-derivation.ts`) over existing tables (documents/proposals/decisions, the shared comms threads, `client_activity_log` *read not extended*, `designer_clients.style_*` + the `styles` taxonomy); the directory/profile/views read via `use-people.ts` (`usePeopleDirectory`/`usePerson`) + the shared `use-comms` model. The Desk nurture-due need-line is an app-layer `desk-derivation` extension. People surfaces are VIEWS / derivations — they recompute on read, never a parallel store.

---

## 12. Phase-in plan (D7) — FLIPPED

Unchanged from v1.5 §12 (1–4 ✅; **5. Default flip DONE**; **6. Dissolve IN PROGRESS, telemetry-gated**). The dissolve's content tracks continue to ship past the ruling stage: on top of Track 3's surfaces and the Document's authoring/coordination growth (Tracks 4–5, the composer), **the People Room now closes the CRM/People cluster** (§13) — the People book is no longer a placeholder. Stage 3 (old-URL redirects, zone removal, app-wide shadow ban, Inbox retirement) remains the terminal step; the prod deploy of the Document-stack migrations (00191–**00221**, migrations-before-app) is the standing operational prerequisite.

---

## 13. Build order (status + scope)

**Slices 0–6 ✅. The flip ✅. Dissolve Track 1 ✅ · Track 2 ✅ · grammar polish ✅ · Strata progress ✅. Track 3 ✅ (R41, I29–I34, L4). Track 4 ✅ (R42–R45, I35). Track 5 ✅ (R46–R54, I36). The Decision Composer ✅ (R55–R56, I37–I38). The People Room ✅ (R57–R60, I40 — Wave 0 foundation + Wave 1 Tracks A–D).**

Against the feature gap matrix's P0 cluster (`portal-vs-desk-feature-gap-matrix.md`): **#1 Proposal authoring — CLOSED** by Track 4. **#2 Decision composition + detail — CLOSED** by Track 5 + the Decision Composer. **The CRM / People cluster — CLOSED toward parity** by the People Room: the directory, the role-adaptive profile + the derived Relationship Journey + Style DNA, the Threads/Nurture/Reviews/Portfolio operations, the Communications/Outreach dashboard, and the People nurture-due Desk need are now FULL; the Outreach *write* paths (campaign/template/audience create-send-delete) land with the Outreach view; lead intake/detail stays the cross-link to the Brief. The remaining named gaps (project lifecycle create/edit; invoicing depth; vendor directory + create) are the next candidates; flight telemetry ranks them.

**Recurring discovery across Tracks 3–5 + the composer + the People Room:** the data layer was repeatedly more complete than the matrix's "absent" implied — the People Room, like Proposal Authoring / Project Coordination / the Decision Composer, was largely a **new surface (a Room) + a read-model view (`00221`) + derivations over existing tables**, not a from-scratch CRM build (clients/leads/vendors/threads/touchpoints/reviews already existed). Audit-first stays the standing rule.

---

## 14. Open questions (numbers permanent; resolved items marked)

1.–14. as in v1.5 (1–3 resolved; 4 Activity vocabulary; 5 Billable default; 6 Multi-designer Desk; 7 Direction-share; 8 Mobile Receiving/iOS; 9–14 resolved/landed).
15. **Via Patina commission rate + the Designer-Selections-vs-Style-Matches split (R37)** — marketplace-config / brand input; the Accounts/Earnings rendering is built to receive it. **(Still open — carried from Track 3.)**
16. **Proposal drafting-untouched threshold + hesitation copy (R45)** — `DRAFTING_UNTOUCHED_CHIP_DAYS=3d` shipped provisional; "opened twice" is not backable (only first-open `proposal_viewed_at` is tracked); the Drafting Room facet display order is Scope→Vision→Offer — a Leah-facing call, flagged.
17. **Sign→project two-step availability (R44/I35)** — `sign_proposal` ships `p_auto_activate=true`; the legacy two-step Desk folder is retained as a safety net. Revisit with Leah.
18. **GC/vendor real logins (R46)** — `project_parties.profile_id` is ready to flip from nullable to a real `auth.uid()`; the punch↔PO closeout link and multi-hop cycle detection (R53) are deferred until real webs need them.
19. **The decision_type taxonomy values (R55)** — the composer writes the existing `decision_type` column (00084); "Finish" folds into the existing seven rather than adding an enum value — a Leah-facing call, flagged.
20. **The People Room derivation thresholds + the ask bar's reach (R57–R60, I40)** — `people-derivation.ts` ships provisional tunables (`NURTURE_DUE_DAYS=240`, `DORMANT=180`, `LEAD_RESPOND_HOURS=24`, `MAKER_WARM_DAYS=75`); the ask bar is **derivation-backed v1** (keyword routing + the nurture-derived Engine nudge — semantic people-search is deferred). The directory status dot and the nurture "due" accent are deliberately separate signals (a proposal-stage client can read warm yet be nurture-due). All Leah-facing thresholds + the deferred semantic search, flagged.

---

## 15. References

Prototypes: desktop v4 · mobile-d3-v1 · the Dissolve eleven-surfaces · the Strata progress system · the Library Room shell · the Composing Page · proposal authoring · project coordination · the decision system · **the People Room** · the session instrument · `CODEBASE-MAP.md` · `the-document-parity-map.md` · `portal-vs-desk-feature-gap-matrix.md` · `DECISIONS.md` (D1–D14 · O1–O7 resolved · I1–I40 · R1–R60 · L1–L4 · THE GO · FLIP CONFIRMED).

---

## 16. The Dissolve — tracks, the eleven surfaces, and Rooms

Unchanged from v1.5 §16 in intent (the dissolve turns the whole portal into the Document; D14 two Drawer weights; Tracks 1–2 shipped; Track 3 shipped — the Library Room R39/R32, the Engine R31/R38, the Accounts book + the Aesthete fold R36/R37, the Composing Page R40; Via Patina R30 the marketplace rail). **A further Room has now shipped:**
- **The People Room — the second walk-in Room (R57–R60) — SHIPPED.** On the same reusable Rooms shell as the Library: a unified party directory (clients/makers/GCs/team/leads) over six Strata-ruled views (Directory · Threads · Nurture · Reviews · Portfolio · Outreach), a role-adaptive Person Profile whose heart is the *derived* Relationship Journey (+ Style DNA for clients), Outreach (campaigns/templates/audiences drawing from the directory), and a People nurture-due Desk need-line. Founded on `00221` `public.people_directory` (the `security_invoker` roster view) + the `people-derivation.ts` contracts (I40). The CRM/People placeholder in the Dissolve's surface list is now a built Room.

**Dissolve staging (R21, telemetry-gated):** Stage 1 — R5 quiet exiles, Inbox verification. Stage 2 — ledger front-matter (✓), the Aesthete fold (✓, R37). Stage 3 — old-URL redirects (now including `/portal/clients`, `/portal/inbox`, `/portal/messages`, `/portal/nurture`, `/portal/reviews`, `/portal/portfolio`, `/portal/communications/*` → the People Room), zone removal, app-wide shadow ban (R3), Inbox retirement. The Document-stack migration deploy (00191–**00221**) precedes Stage 3.

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

---

## 20. The People Room — the unified party directory, as a Room (R57–R60, I40)

The CRM / People book is **a walk-in Room**, not a Drawer Sheet (D14, R57) — the second Room after the Library, on the same reusable shell (enter = put-down + timer chain-out, the Drawer persists, full-bleed paper, zero shadows, return-to-origin on leave). It replaces the literal placeholder the gap matrix flagged: clients/leads/vendors/threads/touchpoints/reviews all existed in the data layer; the People Room is the **surface + the read-model view + the derivations** over them, not a from-scratch CRM (the §13 audit-first finding).

- **The unified directory (R57).** The spine is one **roster of every party Patina works with** — clients · makers/vendors · GCs · studio team · open leads — role-filterable (All/Clients/Makers/GCs/Team/Leads), each row carrying a role badge + a role-appropriate relationship line + a status dot. A **Strata-ruled left rail** (not tabs, not cards) switches between six **views**: Directory · Threads · Nurture · Reviews · Portfolio · Outreach. An **ask bar** queries over people + history — **derivation-backed v1** (keyword routing + the nurture-derived Engine nudge; semantic people-search deferred, §14.20). New leads enter the directory; lead detail cross-links to the Brief.
- **The role-adaptive Person Profile + the Relationship Journey (R58).** Opening a person opens a profile whose heart is the **Relationship Journey** — a single woven timeline (inquiry → proposal → project → messages → decisions → touchpoints → install → care). **The journey is a DERIVATION, not a stored activity log** (`deriveRelationshipJourney`) — woven from the person's document history (projects, proposals, decisions), their threads, their nurture touchpoints, and their reviews, the same way sections / Desk / margin are derived; the pre-existing `client_activity_log` is **not** extended. For **clients** the profile also shows **Style DNA — the Engine's read** (taste tags + palette + narrative from `designer_clients.style_tags/style_preferences/inspiration_quote` + the `styles` taxonomy; no parallel store), plus Projects, Trust & history, Nurture, and a private note. For **makers/GCs/team** the profile adapts: makers/GCs cross-link to the Orders book + the coordination view (§6, §18); team links to document-margin visibility (the colophon, §4).
- **Relationship operations — Threads · Nurture · Reviews · Portfolio (R59).** Four operating views over the directory. **Threads** is a unified inbox — every conversation in one list, scope-filterable (all/direct/project/vendor), opening to a conversation (read + reply) — reusing the shared **`use-comms` model** (§5): a thread is **one conversation surfaced everywhere** (it lives on the person AND on their document margin, R27), never duplicated. **Nurture** is the touchpoint queue — relationships ranked by dormancy + trust (`deriveNurtureQueue`, a derivation), the proposal-hesitating / dormant-high-trust ties floating to "reconnect now". **Reviews** is three-state collection (pending / collected / queued). **Portfolio** is the finished-rooms gallery (completed projects).
- **Outreach + People on the Desk + the cross-link contract (R60).** **Outreach** is the marketing-ops view: **campaigns** (list / compose / send / stats), an **email template library** (browse / author / edit / delete), and **audience segments** that **draw from the same directory** (segment by role / status / history / trust). **People on the Desk:** nurture-due / reconnect surfaces as a Desk **need-line** (the `desk-derivation` extension in `desk-reconnect.tsx`, §7) — a dormant high-trust tie is a need; the inbox *notifications* tab + the Sales Pipeline stay **TRANSFORMED** into the Desk/margin model, not rebuilt. **Cross-link contract (not rebuilt here):** maker/GC terms + orders live in the Orders book; GC open-items in the coordination view; team invite/management stays /portal/team (the colophon handles margin-visibility); lead detail cross-links to the Brief. The People Room is the *people* layer over those, not a re-home of them.

**The additive foundation (I40).** **Migration `00221`** — `public.people_directory`, an additive `security_invoker` VIEW (D7) that `UNION ALL`s clients (`designer_clients`) + open leads (`leads`) + makers (`vendors` via `saved_vendors` / engaged via `project_parties.vendor_id`) + GCs (`project_parties` party_kind='gc') + team (`project_team_members`, de-duped) into one roster `(person_id, role, display_name, email, phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta)`; RLS inherited (security_invoker) + explicit `auth.uid()`/project-ownership filters (verified scoping — a designer sees only their own roster). **`people-derivation.ts`** freezes the contracts (`DirectoryPerson`, `JourneyEvent`, `NurtureEntry`, `JourneyInputs`), the tunable thresholds (`NURTURE_DUE_DAYS=240`, `DORMANT=180`, `LEAD_RESPOND_HOURS=24`, `MAKER_WARM_DAYS=75`, §14.20), the directory helpers (`deriveStatusDot` / `deriveRelationshipLine` / `isNurtureDue` / `roleLabel`) + a working `deriveNurtureQueue` + `deriveRelationshipJourney`; the **status dot and the nurture "due" accent are separate signals** (a proposal-stage client reads a warm dot yet is nurture-due). **`use-people.ts`** (`usePeopleDirectory` / `usePerson`) + the view added to `database.types.ts`. The **Drawer weight flip** (People `sheet`→`room`, §8) lands in the same foundation. **No other migration:** every People surface is a VIEW or a derivation over existing tables — it recomputes on read, never a parallel store.

**Contract / schema:** `00221` `public.people_directory` (the only migration); `people-derivation.ts` (the frozen contracts + the journey/nurture/directory derivations); `use-people.ts` + the shared `use-comms` model (Threads); `desk-reconnect.tsx` (the Desk nurture-due need-line). Components under `apps/designer-portal/src/components/document/people/**` (the Room shell `people-room.tsx`; the six views under `views/`; the profile under `profile/`; directory/ops/outreach subfolders). Authority: `people/patina-people-room-prototype.html`.
