# Field Companion · Wave 4 — "It lands in the Document" · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The material she captured on site is in the portal, in the surfaces she already reads — the margin carries the full note with its recording and its photos, the Visits block carries the visit, a punch item reaches the general contractor through the rail that already texts him — with no card to clear.

**Architecture:** Three additive Postgres migrations (a margin column + one `CREATE OR REPLACE VIEW margin_items` that changes exactly one UNION arm; a `project_tasks` back-reference column; a one-value CHECK widening on `project_time_entries.source`). Four portal reads that only light up when a Field build wrote the data. On the phone, two new **post-commit lanes on the existing capture outbox** — the shape `ProjectPlacementOrchestrator` already proves (`CaptureKit/CaptureKit/Sync/ProjectPlacement.swift`): a pure CaptureKit contract with lookup-before-write idempotency, app-side Supabase glue, and per-lane state on `Specimen`. Every unit-testable line lands in CaptureKit (constraint C1); the AVFoundation/SwiftUI/SDK glue is app-side and verified by the device pass.

**Tech Stack:** Postgres 15 (Supabase/Strata) · plain-psql SQL tests (`DO $$ … ASSERT … $$`, transaction-wrapped, `ROLLBACK`) · Next.js 15 / React 19 / TanStack Query / Jest + Testing Library (designer-portal) · Vitest (`packages/supabase`) · Swift 5 / SwiftUI / SwiftData, iOS 18.0 floor, Swift Testing (`import Testing`, `@Test`, `#expect`)

**Spec:** `docs/design/field-companion/field-companion-package.md` — §6 Flow 2 step 4, Flow 5, Flow 7, Flow 8 · §7.9 · §8.5 · §9.4 · §9.5 · §9.6 · §9.8 · §11.2–11.6
**Program plan:** `docs/design/field-companion/field-companion-plan.md` §4
**Rulings (ratified 2026-08-24, these OVERRIDE the spec where they differ):** `docs/design/field-companion/field-companion-rulings.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **All paths are relative to `/Users/kody/Code/patina-merged`.** Work in a dedicated worktree (`patina-parallel-work`); branch `feat/field-companion-w4`.
- **`git add` explicit pathspecs only. NEVER `git add -A`.** (C9)
- **Conventional Commits.** The husky `commit-msg` hook rejects `merge:` subjects — use `fix(db): merge …` if it comes up. (C10)
- **Migration addresses are claimed at landing, not at authoring.** (C6, FC-R17) The three migrations this wave needs are authored **in full** under `docs/design/field-companion/plans/sql/` as `005NN_<slug>.sql`. `NN` is drawn from the reserved band **00530–00535** at landing, by the orchestrator, after re-checking **both** `docs/engineering/migration-number-reservations.md` **and** `supabase migration list` against Strata. The census must cover the filesystem, `git log --all`, **and** `git worktree list`.
- **Migration ordering inside the band.** The wave-1 routing migration and the wave-3 visit/suggestion migration draw **lower** numbers than anything here. Wave 4's margin migration reads `field_captures.voice_audio_segments` and `.transcript_source` (wave 1) and the Visits hook reads `field_captures.visit_id` / `.visit_label` / `.visit_kind` (wave 3). Neither column exists on `main` today — **verified**, `field_captures` has had zero `ALTER TABLE`s since `00233`.
- **⚠ Wave 4 inherits Wave 1's migration as a prerequisite** (FC-R18, ruling 5). `00516_capture_producer_idempotency.sql` — the shared `commit_field_capture` replacement FC-R18 sequences everything behind — **is merged to `main` at `db2128934`** (2026-08-24), so FC-R18's *"HELD until the Phase 3 lane confirms the merge SHA"* is **released**. It is **not yet applied to prod**; that GO belongs to the Phase 3 lane, not to this wave. Wave 1's `00530_field_capture_notes_and_routing.sql` is authored from `00516`'s post-merge body and today lives only on `feat/field-companion-w1` (`a27e8dfb3`). **Task 0.1 gates on `00530` being on `main` AND applied to Strata.** If Task 0.1 finds `voice_audio_segments` absent, the escalation is to the **wave-1 lane** about `00530` — never a re-implementation here, and never a `db push` from a lane agent.
- **Prod is live. Migrations stay additive and idempotent; RPC signatures stay unchanged.** Patina Field is not live anywhere, so **no backward compatibility is owed inside the app** — no legacy-decode shims, no schema-version compat paths, and a fresh install may reset the local store.
- **`CREATE OR REPLACE VIEW margin_items` recreates the prior body verbatim** and changes only the `note` branch's payload. The prior body is `00282_sms_core.sql:606-909` — verified as the latest definition; nothing between 00283 and 00521 touches this view.
- **Every new `public.` routine gets `REVOKE ALL … FROM PUBLIC, anon;`** (C7). ⚠ **This wave creates no new routine** — FC-R7 removed the DEFINER-RPC replacement from the punch path entirely. Nothing here needs an ACL block; do not invent one.
- **New policies are `TO authenticated`.** This wave creates no new policies either (FC-R8 is per-designer in v1).
- **`capture-gate.sh test` runs `-scheme CaptureKit` only** and `CaptureTests` links CaptureKit alone. App-target code — `ViewfinderModel`, `LocalCaptureSyncService`, every screen — is **not** unit-testable. Any logic that needs a test lives in CaptureKit as a pure type. (C1)
- **`capture-gate.sh lint` silently no-ops and exits 0 without swiftlint** (C2). Run `swiftlint --strict` explicitly and report it separately.
- **`capture-gate.sh build` is a Simulator compile gate** (`CODE_SIGNING_ALLOWED=NO`) and nothing else. Wherever a task says *install on the device*, it means a signed build (`-destination 'platform=iOS,id=<UDID>'`, team `VP22LXHT7L`, automatic signing), never `capture-gate.sh build`. (C5)
- **`generate_project.rb` must be re-run and the `Capture.xcodeproj` diff committed** whenever a `.swift` file is added or removed. `capture-gate.sh` runs it for you. (C4)
- **`Secrets.swift` is gitignored.** Never commit a real key. (C11)
- **The SQL suite is a usable gate.** `supabase/tests/KNOWN_FAILURES.md` records **22** documented known failures across 122 files; `scripts/run-sql-tests.sh` exits 0 if only those fail. Run the named file **and** the full suite, and report both. ⚠ The runner connects as `postgres` (superuser), so `auth.uid()`-shaped assertions run with **RLS bypassed** — they prove logic, never RLS. **No report may claim "RLS verified" from them.** (C8)
- **Portal gates:** `pnpm type-check` · `pnpm build --filter designer-portal` · `pnpm lint --filter designer-portal` (only designer-portal has a working ESLint config).
- **⚠ `packages/supabase` runs Vitest, not Jest.** The program plan's "jest `use-capture-media.test.ts` / `use-project-visits.test.ts`" line is wrong about the runner. Package tests: `pnpm --filter @patina/supabase test`. Portal tests: `cd apps/designer-portal && pnpm jest <path>`.
- **⚠ `apps/*/.env.local` has pointed at Strata prod before.** Check `NEXT_PUBLIC_SUPABASE_URL` before any destructive local action. Portal deploys have needed a wrangler-vars export.
- **Copy** follows `.agents/skills/patina-brand-voice/SKILL.md`: plain-spoken, specific, no mechanism talk, **never "AI"**. FC-R3 naming is binding: *Today* · *a visit* · *Visits* · *unplaced*. The word "Inbox" does not appear in any user-facing string this wave writes.
- **No new portal feature flag** (spec §11.6, FC-R10). *"Renders nothing on a field-less project"* is a **browser-verified acceptance criterion**, not a footnote.

---

## Rulings applied, and what they rewrote

| Ruling | What it changed in this plan |
|---|---|
| **FC-R7** | A Field punch item is a **`project_tasks` row owned by the GC** riding the party-anchored SMS rail — never a `client_decisions` row. Its open `court_party_id` question is answered by ruling 2: **GC-court-only in v1, no picker.** Package **4-8** becomes *"Make it a task"* / *"Make it a punch item"*, both writing `project_tasks`. Package **4-13** is rewritten from `005NN_client_decision_field_capture_ref.sql` to `005NN_project_task_field_capture_ref.sql` — **one additive column, no DEFINER-RPC replacement, no allow-list widening, no adversarial-review gate.** Package **4-7** (`designer_client_id` onto the DTO) is **dropped** — see below. |
| **FC-R4** | The device writes `margin_notes` and `project_tasks` directly, **through the existing capture outbox**, with client-minted ids as idempotency keys. Implemented as two post-commit lanes on `Specimen`, mirroring `ProjectPlacementOrchestrator` exactly. The margin lane is **requested automatically** inside a placed visit (ruling 1). |
| **FC-R15** | The punch item back-references `field_captures`; the portal signs `capture-media`. A **nullable FK column** on `project_tasks`, not a `routing_source` jsonb — `project_tasks` carries zero jsonb columns and three nullable FKs. **A project-general media table is still owed and this does not pay it.** |
| **FC-R8** | Per-designer in v1. A studio co-member's *Make it a task* gets **42501** and degrades honestly to a margin note — **written by the drain, not by the card** (ruling 3), because the card may never be on screen when the refusal arrives. The `margin_items` `note` branch carries `capture_visible` so her missing play button is explained rather than silently dropped. |
| **FC-R10** | Unflagged. Field-less render-nothing is browser-verified (Task 18). |
| **FC-R3** | The block is **Visits**. The Hours ledger's `'site_visit'` entry is its **billing shadow**, and Task 16 links the two by writing both from one act. |

### Rulings applied 2026-08-24

Six orchestrator rulings landed on this plan after its adversarial review
(`docs/design/field-companion/plans/wave-4-plan-review.md`). They override the plan's own reasoning
wherever the two differ, and every task below is written to them.

> **Ruling 1 — the automatic margin note (review F1).** A voice note captured inside a **placed**
> visit writes its `margin_notes` row **automatically**, through the outbox, with no tap: §6 Flow 2
> step 4 (`field-companion-package.md:418-420`) is binding and §11.4's "notes she promoted"
> alternative is overruled. The id is client-minted once and the auto-request is guarded on
> `marginNoteId == nil`, so a replayed drain re-uses it and the write stays idempotent. A
> **deliberate act** is required only for filing an **unplaced** note from Today (FC-R6). The
> duplication §11.4 warns about is the orchestrator's to absorb: **the Visits block's capture rows
> show counts, thumbnails and the first transcript line and deep-link to the margin item
> (`#margin-item-<id>`); they never render the note body.** No per-visit margin fold ships in v1 —
> §11.4's *"field notes grouped under one expandable row per visit in the margin"* is recorded as
> **deferred**, and Task 18's report carries it as an owed decision.

> **Ruling 2 — which court (review F4).** `PunchCourtResolver` resolves **the GC party only**:
> `party_kind = 'gc'` **and** `sms_consent_status = 'granted'`. `owner = 'gc'` is then exactly true
> rather than approximately true, and no array-order routing can text a trade she never named. When
> no such party exists the verb files the item as **her own task** and says so:
> *"No general contractor with texting on this project — this stays as your task."* **No party picker
> in this wave** — FC-R7's `court_party_id` question is answered *court-level, GC-only, v1*, and a
> picker for subs and installers is owed.

> **Ruling 3 — FC-R8 degrades on the drain, not on the card (review F5).** When the background drain
> takes 42501 on a `project_tasks` insert, the drain itself **converts the item into a `margin_notes`
> write** — same client-minted id lineage (the refused task's own UUID becomes the note id, so a
> replay is idempotent), body = the task title, then its context, then the plain line *"Couldn't
> assign — you're not this project's owner."* The C3 card's up-front detection stays; it now
> **reports** a write that already happened instead of being the only place it could happen.

> **Ruling 4 — the Library provenance chip (review F2/F3).** `products.capture_provenance` is a
> verbatim copy of `field_captures.provenance` (`00235:241`), which is `Specimen.provenanceRaw` — a
> `FieldKey → ProvenanceSource` map. **`venueLabel` does not exist there and never will.** The venue
> is persisted at `field_captures.venue_label` (`00233:86`, written `00235:137`), one FK hop away
> (`products_field_capture_id_fkey`, `00233:143-147`), so Task 17 reads it through a PostgREST embed
> rather than inventing it — and falls back to `Field · <Mon YYYY>` when the embed is empty. The date
> is **`products.captured_at`**, which exists (`00001:41`, `NOT NULL`) and is populated by
> `commit_field_capture` (`00235:235,240`) — not `created_at`.

> **Ruling 5 — FC-R18 and the two migration prerequisites.** `00516_capture_producer_idempotency.sql`
> **IS merged to `main`**, at `db2128934` (*"Merge capture producer idempotency + ownership-scoped
> enrichment enqueue (C-A2)"*, 2026-08-24) — the review's *"not on main"* was read from a stale local
> checkout. It is **not yet applied to prod**; that apply is a separate GO named in the merge commit.
> FC-R18's hold on Wave 1's migration is therefore **released**. Wave 1's
> `00530_field_capture_notes_and_routing.sql` exists only on `feat/field-companion-w1` (worktree
> `.claude/worktrees/field-companion-w1`, commit `a27e8dfb3`) and is **not on `main`**. **Task 0
> verifies `00530` is on `main` AND applied to Strata before Tasks 1 and 5 draw their numbers**; the
> orchestrator draws 00531+ at landing.

> **Ruling 6 — the remaining review findings** (F6, F7, F9–F18) are applied as the review specifies,
> with three exceptions where the review's own citation corrections were checked against the files
> and found wrong: `00196:31-32` (`anchor_kind` default) and `00196:51-54`
> (`margin_notes_designer_all`) were already correct and stay; `00196:29` for `body text not null` is
> **`00196:30`**, a drift the review missed. Package 4-7's drop now quotes FC-R7's *"regardless of the
> answer"* sentence and says why option (d) leaves `designer_client_id` with no consumer.

### Why package 4-7 is dropped

**FC-R7 says, literally, that this ships anyway:** *"**Regardless of the answer**: `designer_client_id`
must be added to Field's projects SELECT and DTO"* (`field-companion-rulings.md:549`). That sentence was
written under the (a)/(b)/(c) framing, and all three of those options routed a Field punch through
`create_client_decision`. Kody ratified **(d)**, which removes that RPC from the punch path — and with
it the column's only reader. Dropping 4-7 is therefore a **decision taken against the ratified option**,
not an omission; the ruling's "regardless" no longer has a case to be regardless of.

`designer_client_id` was needed for exactly one caller: `create_client_decision`, whose first act is
`SELECT * FROM designer_clients WHERE id = p_payload->>'designer_client_id'` and whose `NOT FOUND`
branch raises `relation not found or access denied` (live head `00415:575-586` — ⚠ the package cites
`00413`, which is stale; `00415:37` records the chain `00085 → 00175 → 00185 → 00399 → 00413 → 00415`).

FC-R7 removes that RPC from the punch path. Nothing else this wave writes wants the column:
`project_tasks` has no client anchor at all, `project_time_entries` has none, and a field note anchors
to `project_id` (FC-R6 ruled the unplaced note stays a `field_captures` row with a suggestion, not a
`designer_client_id`-anchored margin note). Adding a field to `FieldProject` for no reader is the
unrequested abstraction this program's own dispatch rules forbid. **It is not lost — it is the first
line of any future wave that gives Field a client-facing decision verb, and that wave will need it
anyway.**

### Two contradictions in the source documents, resolved here

1. **Does every transcript become a margin note?** §6 Flow 2 step 4 says the device writes a
   `margin_notes` row for the headline photo+voice flow. §11.3 and §11.4 say the opposite and say it
   later, with a reason: *"the Visits block is the record of a visit; the margin carries the notes she
   promoted,"* because *"forty transcripts across six visits would drown"* a rail that
   `margin-rail.tsx:436-468` renders as a flat list with no visit dimension. §11.4 explicitly marks
   this as a decision *"made before the wave, not during it."*
   **Resolved by orchestrator ruling 2026-08-24 (ruling 1 above): §6 Flow 2 step 4 is binding.** A
   voice note captured inside a **placed** visit writes its `margin_notes` row **automatically**,
   through the outbox, with no tap. §11.4's alternative is overruled. A deliberate act is required
   only for **filing an unplaced note from Today** (FC-R6) — where there is no `project_id` to anchor
   to, so the composer refuses the write anyway. The C3 card's overflow still carries three verbs
   (*Make it a note in the Document* · *Make it a task* · *Make it a punch item*), but inside a placed
   visit the first one is **state, not an action** — see Task 12.

   **The consequence the orchestrator now owns, stated so no task re-derives it:** every in-visit
   voice note appears in **both** the Visits block and the margin rail. §11.4 names that duplication
   as the failure mode and offers the remedy — *"field notes grouped under one expandable row per
   visit in the margin"*. That remedy is **deferred, not taken**, and the mitigation this wave ships
   instead is a rule about what each surface renders: **the margin carries the note body; the Visits
   block carries counts, thumbnails and the first transcript line, and deep-links to the margin item.**
   The same material is listed twice on purpose, once as a record of a visit and once as a note — and
   only one of them is the note. Task 18's report carries the per-visit-fold decision as an owed item
   so it is ruled on a six-visit project rather than discovered on one.
2. **The Visits row's scan count.** §11.3's mock reads *"12 photos · 3 notes · 1 scan"*. There is no
   visit key on `room_scans` anywhere in the schema and the wave-3 visit/suggestion migration puts
   `visit_id` only on `field_captures`. Attributing a scan to a visit by timestamp overlap would be a
   guess rendered as a fact, which Principle 4 forbids.
   **Resolved: the Visits row counts photos and notes. Scans stay in the Room files block.** The copy
   is *"12 photos · 3 notes"*. A `room_scans.visit_id` column is **owed** and is deliberately not
   drawn from the 00530–00535 band, which is fully spoken for. The same refusal applies to V4's
   grouped list (§7.9 names *Captures · Notes · Scans · Unplaced*; this wave ships *Captures · Notes ·
   Unplaced*).

---

## File Structure

**Authored already, complete, awaiting a number** (in this plan's own directory, never `supabase/migrations/`):

| File | Responsibility |
|---|---|
| `docs/design/field-companion/plans/sql/005NN_margin_notes_field_capture.sql` | `margin_notes.field_capture_id` + the `margin_items` replace (§9.4) |
| `docs/design/field-companion/plans/sql/005NN_project_task_field_capture_ref.sql` | `project_tasks.field_capture_id` (§9.5, rewritten by FC-R7) |
| `docs/design/field-companion/plans/sql/005NN_time_entry_field_visit_source.sql` | `project_time_entries.source` gains `'field_visit'` (§9.5) |

All three were syntax-validated against a live local Postgres (`127.0.0.1:54322`) inside a rolled-back
transaction at authoring time, including their `DO $postcondition$` blocks.

**Created by this plan:**

| File | Responsibility |
|---|---|
| `supabase/tests/document/margin_items_note_field_capture_test.sql` | the view's note branch: full body in the payload, `capture_visible`, field-less rows unchanged |
| `supabase/tests/field/project_task_field_capture_ref_test.sql` | the punch column, the GC owner path, and the dispatch trigger's consent gate |
| `supabase/tests/field/time_entry_field_visit_source_test.sql` | `'field_visit'` accepted, running-timer index still standing |
| `apps/designer-portal/src/lib/document/field-note-payload.ts` | pure reader for the `note` branch's new payload keys |
| `apps/designer-portal/src/components/document/visits-block.tsx` | the Visits block on the project spread |
| `apps/designer-portal/src/components/document/field-note-media.tsx` | the play button + photo strip, signed via `useCaptureMediaUrls` |
| `packages/supabase/src/hooks/use-project-visits.ts` | `useProjectVisits` + the pure `groupCapturesIntoVisits` reducer |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift` | the shared post-commit lane state + failure classifier |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/MarginNoteWrite.swift` | the margin-note contract, gateway seam, orchestrator |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift` | the task/punch contract, the GC-party rule, orchestrator |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift` | pure V4 summariser |
| `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift` | durable close record for the time entry |
| `apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift` | the two table inserts, app-side |
| `apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift` | V4 |
| `apps/mobile/Capture/Capture/Features/Session/VisitCloseOutboxDrainer.swift` | drains the close record into `project_time_entries` |

**Modified by this plan:** `margin-bodies.tsx` (the existing `note` case only) · `margin-derivation.ts` ·
`use-margin-notes.ts` · `doc/[id]/page.tsx` (one mount) · `work-block.tsx` (one photo strip) ·
`packages/supabase/src/hooks/index.ts` (one export line) · `Specimen.swift` +
`Specimen+Accessors.swift` (two additive lanes) · `CaptureStore.swift` (the outbox predicate and the
schema list) · `LocalCaptureSyncService.swift` (two post-commit calls) · `SmartGuessSheet.swift` (the
verb menu) · `CaptureNavigation.swift` (one route case) · `SupabaseSiteRequestService.swift` (one
column in a SELECT).

**Task order.** 0 → (1 ∥ 7 ∥ 8) → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18.
Tasks 1, 7 and 8 are independent of each other and of the portal work. Tasks 9–12 are strictly
sequential (they touch the same three files). Task 18 is last.

---

### Task 0 — Pre-flight re-verification against merged Waves 1–3

**Model:** Sonnet. Judgement, not mechanics — this task exists to catch drift, and drift is exactly what a literal checklist misses.

**Why this task exists.** Every wave-1/2/3 name below was a *prediction from the spec*, written before those waves merged. As of the 2026-08-24 review pass the branches carry this, and **none of it is on `main`**:

| Branch | Head | Field Companion content |
|---|---|---|
| `feat/field-companion-w1` | `a27e8dfb3` (local, ahead of origin) | `00530_field_capture_notes_and_routing.sql`, `CaptureMediaMime` + tests, a fail-closed feature-flag seam + tests, `migration-number-reservations.md` edits (records 00521, reserves 00530–00535) |
| `origin/feat/field-companion-w1p` | `95ef8f52f` | **`packages/supabase/src/hooks/use-capture-media.ts` (`useCaptureMediaUrls`) is LANDED**, with its Vitest suite, the barrel export, `capture-context-section.tsx` + tests, and `wave-1p-plan.md` |
| `origin/feat/field-companion-w05` | `26a333631` | Archive/TestFlight scripts, xcconfig, PrivacyInfo |

Waves 1–3 land before this wave. Re-read them before writing a line — the point of this task is to record what *actually* merged, not to confirm a prediction.

**Files:**
- Create: `docs/design/field-companion/plans/wave-4-preflight.md`
- Read only: `supabase/migrations/`, `apps/mobile/Capture/CaptureKit/`, `packages/supabase/src/hooks/`, `apps/designer-portal/src/components/room-file/`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/design/field-companion/plans/wave-4-preflight.md` — the recorded, dated answer to each check below. Every later task reads it before assuming a name.

- [ ] **0.1 Census the migration band and the three columns wave 4 reads**

```bash
cd /Users/kody/Code/patina-merged
ls supabase/migrations/*.sql | tail -8
git log --all --oneline -- 'supabase/migrations/0053*.sql'
git ls-tree main supabase/migrations/ --name-only | grep -E '0053[0-9]'
git worktree list
grep -n '0053' docs/engineering/migration-number-reservations.md
# The applied ledger is a signal the filesystem census cannot see: a number can be
# applied locally from a branch worktree and still read "NOT YET DRAWN" in the doc.
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select version, name from supabase_migrations.schema_migrations where version >= '00520' order by version;"
supabase migration list        # Strata — read-only; this is the prod half of the census
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d field_captures" | grep -E 'visit_|voice_audio_segments|transcript_source|capture_kind'
# The view census grep that actually matches. Every migration in this repo writes
# the view lowercase and unqualified, so a case-sensitive qualified grep finds
# NOTHING and an agent would conclude margin_items does not exist.
grep -rn 'create or replace view margin_items' supabase/migrations/
```

**Two hard gates before Tasks 1 and 5 draw a number** (ruling 5):
1. **`00530` must be on `main`.** It is committed on `feat/field-companion-w1` (`a27e8dfb3`, worktree `.claude/worktrees/field-companion-w1`) and is **not** on `main` as of this plan's writing. Wave 4's margin migration reads `field_captures.voice_audio_segments` / `.transcript_source`, and Task 5 reads `visit_id` / `visit_label` / `visit_kind` — all wave-1/wave-3 columns.
2. **`00530` must be applied to Strata**, confirmed by `supabase migration list` (read-only — never `supabase db push` from this task, never MCP `apply_migration`).

`00516_capture_producer_idempotency.sql` **is merged to `main`** (`db2128934`, 2026-08-24) and FC-R18's hold on wave 1 is released — but `00516` is **not yet applied to prod**; that GO is the Phase 3 lane's, named in the merge commit. If wave 1's migration is missing or unapplied, escalate to the wave-1 lane; **do not re-implement any of it here.**

Expected after waves 1–3: the W1 routing migration and the visit/suggestion migration hold two numbers in `00530–00535`; `field_captures` carries `capture_kind`, `voice_audio_segments`, `transcript_source`, `visit_id`, `visit_kind`, `visit_kit`, `visit_label`, `visit_started_at`, `visit_ended_at`. **If `voice_audio_segments` or `visit_id` is absent, stop — Tasks 1 and 5 cannot be written.** Record the two claimed numbers and the three still free. ⚠ The band is **fully subscribed with zero slack** — six numbers, six scheduled migrations (W1 routing, W3 visit/suggestion, W4 ×3, W6A server transcript); anything unanticipated draws above the head, not inside the band. ⚠ `docs/engineering/migration-number-reservations.md:83` still records the wave-1 migration as **"NOT YET DRAWN"**; that row is expected to be stale and is repaired at landing. Treat a locally-applied-but-unfiled number as **taken**.

- [ ] **0.2 Confirm the Wave 1P hook's exact signature**

```bash
sed -n '1,60p' packages/supabase/src/hooks/use-capture-media.ts
grep -n 'useCaptureMediaUrls' packages/supabase/src/hooks/index.ts
```

Expected — the real signature on `origin/feat/field-companion-w1p` (`95ef8f52f`) is **wider than this plan predicted**, and compatible with all three call sites:

```ts
export function useCaptureMediaUrls(
  paths: readonly (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = CAPTURE_MEDIA_TTL_SECONDS,   // 3600
): UseQueryResult<Record<string, string>>
```

Path→signed-URL map; **unsignable paths are absent from the map rather than present-and-broken**; `enabled: wanted.length > 0`; keyed order-insensitively. Tasks 3, 6 and 13 read it as `data?.[path] ?? null`, which matches exactly. Exported from `packages/supabase/src/hooks/index.ts` and re-exported by `packages/supabase/src/index.ts` (`export * from "./hooks"`), so `import { useCaptureMediaUrls } from '@patina/supabase'` resolves. **If the merged shape differs again — a `Map`, a per-path hook, a different bucket argument — record the real one and use it in Task 3 rather than either version above.** If the file does not exist at all, Wave 1P has not landed and Task 3 must build it first (spec §11.1; the two precedents are `letterhead-instruments.tsx:123` and `use-party-sms.ts:162-179`).

- [ ] **0.3 Confirm what Wave 1P already mounted, so Tasks 6 and 17 do not do it twice**

```bash
grep -n 'RoomFilesSection\|VisitsBlock' apps/designer-portal/src/app/\(document\)/doc/\[id\]/page.tsx
grep -rn 'capture_source' apps/designer-portal/src --include='*.tsx' --include='*.ts'
grep -n 'photoAssetIds' apps/designer-portal/src/components/portal/procurement/log-inspection-drawer.tsx
```

**Record which of these three are true. ⚠ As of the 2026-08-24 review pass, NONE of them are** — Wave 1P modified `room-file/capture-context-section.tsx` instead, `RoomFilesSection` is imported nowhere in `page.tsx`, `log-inspection-drawer.tsx:151` is still exactly `const photoAssetIds: string[] = [];`, and `capture_source` still has zero portal readers (only the generated `database.types.ts`). So the expected answer to all three is *"not done"*, and a literal agent must not record three false *confirmed as planned* verdicts. If any of them **has** landed by the time this runs, record that instead — and **Task 17 is skipped entirely if the provenance chip already shipped in Wave 1P** (the program plan §1.4 moves it there and the wave-4 scope list still names it; doing it twice is worse than either).

- [ ] **0.4 Confirm the wave-1/2/3 Swift names this plan leans on**

```bash
cd apps/mobile/Capture
grep -n 'case visit\|case c6Voice\|case v4VisitReview\|case v0Visit' CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift CaptureKit/CaptureKit/Support/CaptureScreenID.swift
grep -n 'kind\|kit\|label\|endedAt\|projectsInMind' CaptureKit/CaptureKit/Session/CaptureSessionContext.swift
grep -n 'captureKind\|audioSegments' CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift
grep -n 'placementProjectId\|needsProjectPlacement' CaptureKit/CaptureKit/Domain/Specimen.swift CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift
```

Expected: `CaptureSheet.visit` and `CaptureScreenID.v4VisitReview` exist (wave 2 package 2-1); `CaptureSessionContext` carries `kind`/`kit`/`label`/`endedAt` (wave 3 package 3-2); `FieldCapturePayload` carries `captureKind` and `voice.audioSegments` (wave 1). **`CaptureRoute.visitReview` is expected to be ABSENT — Task 15 adds it, and `CaptureNavigation.swift:4-6` marks that enum frozen and foundation-owner-only.** Record the real spellings; every Swift task below uses them verbatim.

- [ ] **0.5 Re-read the two portal seams this wave edits**

```bash
sed -n '814,900p' apps/designer-portal/src/components/document/margin-bodies.tsx
sed -n '11,33p' apps/designer-portal/src/lib/document/margin-derivation.ts
sed -n '83,132p' apps/designer-portal/src/hooks/use-section-work.ts
```

Expected: `NoteBody` renders `row.payload.author_name` and the two escalation actions and **no body**; `MarginItemRow` is a flat interface with `payload: Record<string, unknown>`; `useSectionTasks` already selects `owner, owner_party_id`. Record any drift — Tasks 2, 4 and 13 all edit these exact ranges.

- [ ] **0.6 Write the pre-flight record and commit it**

Create `docs/design/field-companion/plans/wave-4-preflight.md` with a dated section per check above, each carrying the **actual** command output (trimmed) and a one-line verdict: *confirmed as planned* / *drifted to `<real name>`* / *blocked*. End with a **Blocking list** — anything that stops Tasks 1, 3, 5 or 15 — and nothing else.

```bash
git add docs/design/field-companion/plans/wave-4-preflight.md
git commit -m "docs(field-companion): wave-4 pre-flight — waves 1-3 re-verified against the repo"
```

- [ ] **0.7 FC-R21 known gap (N-2)** — `CaptureSessionContextPolicy.resolve`'s 4-hour
      window can replace a still-live same-day visit on W1's stale-prompt Resume with no
      `visit.end`; fix = persisted pending-end slot or reap inside `current()`. Confirm
      the gap still exists against whatever landed on `main` and either schedule the fix
      as a task in this wave or record it forward again.

---

### Task 1 — The margin migration, and a note that arrives whole

**Model:** Sonnet. The SQL is authored; this task is the test, the number, and the apply.

**Files:**
- Create: `supabase/tests/document/margin_items_note_field_capture_test.sql`
- Copy (authored, complete): `docs/design/field-companion/plans/sql/005NN_margin_notes_field_capture.sql` → `supabase/migrations/00<NN>_margin_notes_field_capture.sql`

**Interfaces:**
- Consumes: `field_captures.voice_audio_segments jsonb`, `field_captures.transcript_source text` (the wave-1 routing migration); `margin_items`' 11-column shape at `00282:606-909`.
- Produces:
  - `margin_notes.field_capture_id uuid REFERENCES field_captures(id) ON DELETE SET NULL`
  - `margin_items` `note` branch `payload` keys, consumed by Tasks 2–4:
    `body text` · `field_capture_id uuid|null` · `capture_visible boolean` · `has_audio boolean` · `audio_path text|null` · `audio_segments jsonb (string[])` · `voice_duration_seconds numeric|null` · `transcript_source text|null` · `photo_paths jsonb (string[])`
  - Unchanged and relied upon: `title = left(body, 80)`, `detail = ''`, 11 columns, `anchor_kind IN ('line','section','letterhead')`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/document/margin_items_note_field_capture_test.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- margin_items note branch + margin_notes.field_capture_id
-- (the margin migration — 005NN_margin_notes_field_capture.sql, §9.4)
--
-- 1. FULL BODY        → payload->>'body' is the WHOLE note. Before this
--                       migration the note branch emitted only
--                       left(n.body, 80) as title and ''::text as detail
--                       (00282:828-829), so a one-minute transcript reached
--                       the Document as its first eighty characters.
-- 2. TITLE UNCHANGED  → title is STILL left(body, 80). margin-item.tsx:63
--                       renders it in the collapsed rail row.
-- 3. DETAIL UNCHANGED → detail is STILL ''. margin-item.tsx:64 feeds detail to
--                       that same collapsed preview for EVERY kind; widening
--                       it would dump a transcript into the rail.
-- 4. FIELD LANE       → field_capture_id, capture_visible, has_audio,
--                       audio_segments, photo_paths and voice_duration_seconds
--                       reach the payload from the joined capture.
-- 5. FIELD-LESS NOTE  → a typed R14 note is byte-identical to today apart from
--                       the added keys reading null/false/[]. This is FC-R10's
--                       "renders nothing on a field-less project" at the SQL
--                       layer; the browser half is Task 18.
-- 6. SHAPE            → margin_items still emits exactly 11 columns, so the
--                       CREATE OR REPLACE stayed column-compatible and
--                       MarginItemRow (margin-derivation.ts:21-33) still fits.
-- 7. ANCHOR CHECK     → margin_notes.anchor_kind still admits exactly
--                       ('line','section','letterhead'). A field note anchors
--                       to 'letterhead'; nothing may widen this.
--
-- How to run:
--   scripts/run-sql-tests.sh -f margin_items_note_field_capture
-- and, for the wave report, the FULL suite as well — it exits 0 with the 22
-- documented known failures in supabase/tests/KNOWN_FAILURES.md, so a new
-- unexpected failure is a real regression.
--
-- ⚠ The runner connects as `postgres` (superuser, run-sql-tests.sh:92), so the
-- security_invoker join in margin_items resolves with RLS BYPASSED. This file
-- therefore CANNOT prove the FC-R8 co-member case (capture_visible = false
-- because field_captures is owner-only). Nothing here is evidence about RLS.
-- That case is browser-verified in Task 18.
--
-- ⚠ Every fixture UUID uses hex-only prefixes. 'm'/'r'/'g' are not hex digits
-- and the cast fails before the first assertion runs.
--
-- PREREQUISITE: the wave-1 routing migration (field_captures.voice_audio_segments,
-- .transcript_source). Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fb000000-0000-4000-8000-000000000001', 'fb-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fb000000-0000-4000-8000-000000000001', 'fb-designer@test.invalid', 'FB Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
-- ⚠ DO UPDATE, not DO NOTHING: Supabase's own auth.users trigger has already
-- minted a profiles row by the time this runs, with a null full_name. Case 5e
-- asserts on ap.full_name, so the fixture must overwrite rather than skip.

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fb000000-0000-4000-8000-0000000000a1', 'FB Maple St',
        'fb000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001');

-- The capture the note was spoken into: two audio segments, two photos.
INSERT INTO field_captures (
  id, client_capture_id, designer_id, status, destination, project_id,
  voice_audio_path, voice_transcript, voice_duration_seconds,
  voice_audio_segments, transcript_source, photos, primary_photo_path)
VALUES (
  'fb000000-0000-4000-8000-0000000000f1',
  'fb000000-0000-4000-8000-0000000000c1',
  'fb000000-0000-4000-8000-000000000001',
  'inbox', 'inbox', 'fb000000-0000-4000-8000-0000000000a1',
  'fb/ct/voice-000.m4a',
  'the base cabinet scribe is short on the left return',
  64.5,
  '["fb/ct/voice-000.m4a", "fb/ct/voice-001.m4a"]'::jsonb,
  'device',
  '[{"path": "fb/ct/photo-0.heic", "isPrimary": true}, {"path": "fb/ct/photo-1.heic"}]'::jsonb,
  'fb/ct/photo-0.heic');

-- A field note: body deliberately longer than 80 characters.
INSERT INTO margin_notes (id, project_id, designer_id, body, anchor_kind, field_capture_id)
VALUES (
  'fb000000-0000-4000-8000-0000000000e1',
  'fb000000-0000-4000-8000-0000000000a1',
  'fb000000-0000-4000-8000-000000000001',
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.',
  'letterhead',
  'fb000000-0000-4000-8000-0000000000f1');

-- A typed R14 note with no field capture at all.
INSERT INTO margin_notes (id, project_id, designer_id, body, anchor_kind)
VALUES (
  'fb000000-0000-4000-8000-0000000000e2',
  'fb000000-0000-4000-8000-0000000000a1',
  'fb000000-0000-4000-8000-000000000001',
  'Ask about the runner.',
  'letterhead');

DO $$
DECLARE
  v_field    RECORD;
  v_typed    RECORD;
  v_body     TEXT;
  v_cols     INTEGER;
  v_check    TEXT;
BEGIN
  SELECT body INTO v_body FROM margin_notes
   WHERE id = 'fb000000-0000-4000-8000-0000000000e1';

  SELECT * INTO v_field FROM margin_items
   WHERE kind = 'note' AND item_id = 'fb000000-0000-4000-8000-0000000000e1';
  SELECT * INTO v_typed FROM margin_items
   WHERE kind = 'note' AND item_id = 'fb000000-0000-4000-8000-0000000000e2';

  -- 0 — SELECT … INTO leaves a RECORD null when no row matched, and every
  -- `IS NULL` assertion below would then pass on nothing. Prove both rows
  -- exist before asserting anything about them.
  ASSERT v_field IS NOT NULL,
    'FAIL 0a: the field note did not reach margin_items at all';
  ASSERT v_typed IS NOT NULL,
    'FAIL 0b: the typed note did not reach margin_items at all';

  -- 1 ---------------------------------------------------------------------
  ASSERT length(v_body) > 80,
    'FIXTURE: the field note body must exceed 80 chars or case 1 proves nothing';
  ASSERT v_field.payload->>'body' = v_body,
    'FAIL 1: payload.body must carry the FULL note, got ' ||
    COALESCE(left(v_field.payload->>'body', 40), 'NULL');

  -- 2 + 3 -----------------------------------------------------------------
  ASSERT v_field.title = left(v_body, 80),
    'FAIL 2: title must still be left(body, 80), got ' || COALESCE(v_field.title, 'NULL');
  ASSERT v_field.detail = '',
    'FAIL 3: detail must still be empty, got ' || COALESCE(v_field.detail, 'NULL');

  -- 4 ---------------------------------------------------------------------
  ASSERT v_field.payload->>'field_capture_id' = 'fb000000-0000-4000-8000-0000000000f1',
    'FAIL 4a: payload.field_capture_id missing';
  ASSERT (v_field.payload->>'capture_visible')::boolean,
    'FAIL 4b: capture_visible must be true when the capture joins';
  ASSERT (v_field.payload->>'has_audio')::boolean,
    'FAIL 4c: has_audio must be true when the capture carries segments';
  ASSERT jsonb_array_length(v_field.payload->'audio_segments') = 2,
    'FAIL 4d: audio_segments must carry 2 entries, got ' ||
    COALESCE(v_field.payload->>'audio_segments', 'NULL');
  ASSERT v_field.payload->'photo_paths' = '["fb/ct/photo-0.heic", "fb/ct/photo-1.heic"]'::jsonb,
    'FAIL 4e: photo_paths must be the capture order storage keys, got ' ||
    COALESCE(v_field.payload->>'photo_paths', 'NULL');
  ASSERT (v_field.payload->>'voice_duration_seconds')::numeric = 64.5,
    'FAIL 4f: voice_duration_seconds must reach the payload';
  ASSERT v_field.payload->>'transcript_source' = 'device',
    'FAIL 4g: transcript_source must reach the payload';
  ASSERT v_field.state = 'open',
    'FAIL 4h: an un-escalated, un-dued note is still open, got ' || v_field.state;
  ASSERT v_field.anchor_kind = 'letterhead',
    'FAIL 4i: a field note anchors to letterhead, got ' || v_field.anchor_kind;

  -- 5 ---------------------------------------------------------------------
  ASSERT v_typed.payload->>'field_capture_id' IS NULL,
    'FAIL 5a: a typed note must carry a null field_capture_id';
  ASSERT NOT (v_typed.payload->>'capture_visible')::boolean,
    'FAIL 5b: a typed note must read capture_visible false';
  ASSERT NOT (v_typed.payload->>'has_audio')::boolean,
    'FAIL 5c: a typed note must read has_audio false';
  ASSERT v_typed.payload->'photo_paths' = '[]'::jsonb,
    'FAIL 5d: a typed note must read photo_paths [], got ' ||
    COALESCE(v_typed.payload->>'photo_paths', 'NULL');
  ASSERT v_typed.payload->>'author_name' = 'FB Designer',
    'FAIL 5e: the pre-existing author_name key must survive the replace';
  ASSERT v_typed.title = 'Ask about the runner.' AND v_typed.detail = '',
    'FAIL 5f: a typed note''s title/detail must be byte-identical to today';

  -- 6 ---------------------------------------------------------------------
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'margin_items';
  ASSERT v_cols = 11,
    'FAIL 6: margin_items must still emit 11 columns, got ' || v_cols;

  -- 7 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_check
    FROM pg_constraint
   WHERE conrelid = 'public.margin_notes'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%letterhead%';
  ASSERT v_check LIKE '%''line''%' AND v_check LIKE '%''section''%'
     AND v_check LIKE '%''letterhead''%',
    'FAIL 7a: anchor_kind CHECK lost one of its three values: ' || COALESCE(v_check, 'NULL');
  ASSERT v_check NOT LIKE '%field%',
    'FAIL 7b: anchor_kind was widened — §9.4 forbids a new anchor kind: ' || v_check;

  RAISE NOTICE 'margin_items note/field-capture: all 7 cases passed.';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged
scripts/run-sql-tests.sh -f margin_items_note_field_capture
```

Expected: **FAIL** with `ERROR: column "field_capture_id" of relation "margin_notes" does not exist`, on the field-note INSERT — before any assertion runs. (If it instead fails on `voice_audio_segments`, the wave-1 routing migration has not been applied locally: `pnpm supabase:reset` first.)

- [ ] **Step 3: Draw the number and place the migration**

Re-run the census from Task 0.1 **immediately before copying** — the ledger moves (C6):

```bash
cd /Users/kody/Code/patina-merged
supabase migration list
ls supabase/migrations/*.sql | tail -4
git log --all --oneline -- 'supabase/migrations/0053*.sql'
git worktree list
```

Then copy the authored file to the number you drew, and record the claim in the ledger in the same commit:

```bash
NN=<the number you drew from 00530-00535>
cp docs/design/field-companion/plans/sql/005NN_margin_notes_field_capture.sql \
   supabase/migrations/${NN}_margin_notes_field_capture.sql
```

Edit the copied file's header only where it says `005NN` → the real number. Add a row to `docs/engineering/migration-number-reservations.md` naming the number, the file and this wave. **Change no SQL** — the body was authored complete and syntax-validated against a live Postgres, including its `DO $postcondition$` block.

- [ ] **Step 4: Apply locally and run the test green**

```bash
cd /Users/kody/Code/patina-merged
pnpm supabase:reset
scripts/run-sql-tests.sh -f margin_items_note_field_capture
scripts/run-sql-tests.sh
```

Expected: the named file **PASS** with `NOTICE: margin_items note/field-capture: all 7 cases passed.`; the full suite exits **0** with only the 22 documented known failures. Report both numbers.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00<NN>_margin_notes_field_capture.sql \
        supabase/tests/document/margin_items_note_field_capture_test.sql \
        docs/engineering/migration-number-reservations.md
git commit -m "feat(db): margin notes carry their field capture, and the margin carries the whole note"
```

---

### Task 2 — The margin renders the whole note, and says once that it is a first reading

**Model:** Sonnet.

**Files:**
- Create: `apps/designer-portal/src/lib/document/field-note-payload.ts`
- Create: `apps/designer-portal/src/lib/document/__tests__/field-note-payload.test.ts`
- Create: `apps/designer-portal/src/components/document/__tests__/margin-bodies.field-note.test.tsx`
- Modify: `apps/designer-portal/src/components/document/margin-bodies.tsx:814-895` (`NoteBody` only)

**Interfaces:**
- Consumes: Task 1's `note`-branch payload keys; `MarginItemRow` (`apps/designer-portal/src/lib/document/margin-derivation.ts:21-33` — a flat interface with `payload: Record<string, unknown>`, **not** a discriminated union).
- Produces:

```ts
// apps/designer-portal/src/lib/document/field-note-payload.ts
export interface FieldNotePayload {
  body: string;                  // never empty — falls back to row.title
  fieldCaptureId: string | null;
  captureVisible: boolean;
  hasAudio: boolean;
  audioPaths: string[];          // segments, else the single path, else []
  photoPaths: string[];
  durationSeconds: number | null;
}
export function readFieldNotePayload(row: MarginItemRow): FieldNotePayload;
export function formatNoteDuration(seconds: number | null): string | null; // 64.5 → "1:04"
```

Tasks 3 and 4 both call `readFieldNotePayload`. Nothing else parses this payload.

- [ ] **Step 1: Write the failing tests**

Create `apps/designer-portal/src/lib/document/__tests__/field-note-payload.test.ts`:

```ts
/**
 * readFieldNotePayload — the one parser for the margin_items `note` branch's
 * field lane (the margin migration, §9.4). margin-derivation.ts is
 * dependency-free by design, so this suite needs no mocks at all.
 */
import type { MarginItemRow } from '../margin-derivation';
import { readFieldNotePayload, formatNoteDuration } from '../field-note-payload';

function noteRow(payload: Record<string, unknown>, title = 'A short lede'): MarginItemRow {
  return {
    kind: 'note',
    item_id: 'note-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title,
    detail: '',
    ts: '2026-08-25T15:00:00Z',
    payload,
  };
}

describe('readFieldNotePayload', () => {
  it('returns the full body, not the eighty-character title', () => {
    const body = 'The base cabinet scribe is short on the left return and the filler behind the range needs re-cutting.';
    const parsed = readFieldNotePayload(noteRow({ body }, body.slice(0, 80)));
    expect(parsed.body).toBe(body);
    expect(parsed.body.length).toBeGreaterThan(80);
  });

  it('falls back to the title when a row predates the view replace', () => {
    const parsed = readFieldNotePayload(noteRow({}, 'Ask about the runner.'));
    expect(parsed.body).toBe('Ask about the runner.');
  });

  it('reads a field note as visible with its segments and photos', () => {
    const parsed = readFieldNotePayload(
      noteRow({
        body: 'spoken',
        field_capture_id: 'capture-1',
        capture_visible: true,
        has_audio: true,
        audio_segments: ['a/voice-000.m4a', 'a/voice-001.m4a'],
        audio_path: 'a/voice-000.m4a',
        photo_paths: ['a/photo-0.heic'],
        voice_duration_seconds: 64.5,
      }),
    );
    expect(parsed.fieldCaptureId).toBe('capture-1');
    expect(parsed.captureVisible).toBe(true);
    expect(parsed.hasAudio).toBe(true);
    expect(parsed.audioPaths).toEqual(['a/voice-000.m4a', 'a/voice-001.m4a']);
    expect(parsed.photoPaths).toEqual(['a/photo-0.heic']);
    expect(parsed.durationSeconds).toBe(64.5);
  });

  it('falls back to the single audio path when no segments were written', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'x', has_audio: true, audio_segments: [], audio_path: 'a/only.m4a' }),
    );
    expect(parsed.audioPaths).toEqual(['a/only.m4a']);
  });

  it('reads a typed note as field-less — this is what "renders nothing" rests on', () => {
    const parsed = readFieldNotePayload(noteRow({ author_name: 'Leah' }));
    expect(parsed.fieldCaptureId).toBeNull();
    expect(parsed.captureVisible).toBe(false);
    expect(parsed.hasAudio).toBe(false);
    expect(parsed.audioPaths).toEqual([]);
    expect(parsed.photoPaths).toEqual([]);
    expect(parsed.durationSeconds).toBeNull();
  });

  it('reads a co-member row as referenced-but-not-visible, never as absent', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'spoken', field_capture_id: 'capture-1', capture_visible: false, has_audio: false }),
    );
    expect(parsed.fieldCaptureId).toBe('capture-1');
    expect(parsed.captureVisible).toBe(false);
  });

  it('drops non-string junk out of the path arrays', () => {
    const parsed = readFieldNotePayload(
      noteRow({ body: 'x', photo_paths: ['a.heic', null, 7, ''], audio_segments: [null] }),
    );
    expect(parsed.photoPaths).toEqual(['a.heic']);
    expect(parsed.audioPaths).toEqual([]);
  });
});

describe('formatNoteDuration', () => {
  it('renders minutes and seconds, zero-padded', () => {
    expect(formatNoteDuration(64.5)).toBe('1:04');
    expect(formatNoteDuration(9)).toBe('0:09');
    expect(formatNoteDuration(600)).toBe('10:00');
  });

  it('returns null when there is no duration to state', () => {
    expect(formatNoteDuration(null)).toBeNull();
    expect(formatNoteDuration(0)).toBeNull();
  });
});
```

Create `apps/designer-portal/src/components/document/__tests__/margin-bodies.field-note.test.tsx`:

```tsx
/**
 * NoteBody — the field-note lane (§9.4 + §8.5). Before wave 4 this component
 * rendered the author and the two escalation actions and NEVER the body
 * (margin-bodies.tsx:814-895), so a site transcript reached the Document as
 * its first eighty characters. Mocking shape mirrors
 * letterhead-instruments-scan-door.test.tsx: mock the @patina/supabase barrel
 * plus every app-local hook margin-bodies.tsx imports, and stub the sheets.
 */
import { render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { NoteBody } from '../margin-bodies';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  useApplyDecisionOverride: () => ({ mutate: jest.fn(), isPending: false }),
  useDecision: () => ({ data: undefined }),
  useDecisionOverrides: () => ({ data: [] }),
  useIssueInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useInvoice: () => ({ data: undefined }),
  useProjectFFEItems: () => ({ data: [] }),
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useSendInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useSendMessage: () => ({ mutate: jest.fn(), isPending: false }),
  useThreadMessages: () => ({ data: [] }),
  useUpdateDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useExtendAndReopenDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useCaptureMediaUrls: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/lib/document/field-sms', () => ({ describeFieldEffect: () => '' }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/hooks/use-margin-items', () => ({
  invalidateMarginSurfaces: jest.fn(),
  useSendWeeklyPulse: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-margin-notes', () => ({
  useEscalateNoteToDecision: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));
jest.mock('@/components/document/overlays/amendment-sheet', () => ({
  AmendmentSheet: () => null,
}));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceFolio: jest.fn() }));

const LONG =
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.';

function row(payload: Record<string, unknown>, title: string): MarginItemRow {
  return {
    kind: 'note',
    item_id: 'note-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title,
    detail: '',
    ts: '2026-08-25T15:00:00Z',
    payload,
  };
}

describe('NoteBody — the field note', () => {
  it('renders the whole spoken note, not its first eighty characters', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true }, LONG.slice(0, 80))}
        projectId="project-1"
      />,
    );
    expect(screen.getByText(LONG)).toBeInTheDocument();
  });

  it('says once that the transcript is a first reading, and never says how', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true }, 'x')}
        projectId="project-1"
      />,
    );
    expect(screen.getByText('A first reading. The recording is here.')).toBeInTheDocument();
  });

  it('explains a recording it cannot open instead of dropping it silently', () => {
    render(
      <NoteBody
        row={row({ body: LONG, field_capture_id: 'capture-1', capture_visible: false, has_audio: false }, 'x')}
        projectId="project-1"
      />,
    );
    expect(screen.getByText('The recording is the author’s.')).toBeInTheDocument();
    expect(screen.queryByText('A first reading. The recording is here.')).not.toBeInTheDocument();
  });

  it('leaves a typed R14 note exactly as it was — no draft line, no field chrome', () => {
    render(
      <NoteBody
        row={row({ author_name: 'Leah Kochaver' }, 'Ask about the runner.')}
        projectId="project-1"
      />,
    );
    expect(screen.getByText('Ask about the runner.')).toBeInTheDocument();
    expect(screen.queryByText('A first reading. The recording is here.')).not.toBeInTheDocument();
    expect(screen.queryByText('The recording is the author’s.')).not.toBeInTheDocument();
    expect(screen.getByText('Leah Kochaver')).toBeInTheDocument();
  });

  it('still renders the escalated line rather than a body', () => {
    render(
      <NoteBody
        row={{ ...row({ escalated_to_decision_id: 'd1', body: LONG }, 'x'), state: 'escalated' }}
        projectId="project-1"
      />,
    );
    expect(screen.getByText(/Escalated — now a client decision/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run both and watch them fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/lib/document/__tests__/field-note-payload.test.ts
pnpm jest src/components/document/__tests__/margin-bodies.field-note.test.tsx
```

Expected: the first FAILS with `Cannot find module '../field-note-payload'`; the second FAILS with `Unable to find an element with the text: The base cabinet scribe is short…` — `NoteBody` renders no body at all today.

- [ ] **Step 3: Write the parser**

Create `apps/designer-portal/src/lib/document/field-note-payload.ts`:

```ts
/**
 * The one reader for the margin_items `note` branch's field lane (§9.4).
 *
 * Dependency-free on purpose, like margin-derivation.ts beside it: the margin
 * suites hit the @portabletext/react ESM trap the moment a module here pulls a
 * component graph in.
 *
 * `body` never comes back empty. A row written before the view replace — or
 * held in a stale React Query cache across a deploy — has no payload.body, and
 * the honest fallback is the eighty-character title it did carry, not a blank
 * note.
 */
import type { MarginItemRow } from './margin-derivation';

export interface FieldNotePayload {
  body: string;
  fieldCaptureId: string | null;
  captureVisible: boolean;
  hasAudio: boolean;
  audioPaths: string[];
  photoPaths: string[];
  durationSeconds: number | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export function readFieldNotePayload(row: MarginItemRow): FieldNotePayload {
  const p = row.payload ?? {};
  const segments = strings(p.audio_segments);
  const single = str(p.audio_path);
  const duration = typeof p.voice_duration_seconds === 'number'
    && Number.isFinite(p.voice_duration_seconds)
    ? p.voice_duration_seconds
    : null;

  return {
    body: str(p.body) ?? row.title,
    fieldCaptureId: str(p.field_capture_id),
    captureVisible: p.capture_visible === true,
    hasAudio: p.has_audio === true,
    audioPaths: segments.length > 0 ? segments : single ? [single] : [],
    photoPaths: strings(p.photo_paths),
    durationSeconds: duration,
  };
}

/** 64.5 → "1:04". Null when there is no duration worth stating. */
export function formatNoteDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Make `NoteBody` render the note**

In `apps/designer-portal/src/components/document/margin-bodies.tsx`, add the import beside the existing `margin-derivation` import:

```tsx
import { readFieldNotePayload } from '@/lib/document/field-note-payload';
```

Inside `NoteBody`, after the `state === 'escalated'` early return and **before** the `row.payload.author_name` paragraph, insert:

```tsx
  const field = readFieldNotePayload(row);
```

and render the body plus the one draft line, immediately inside the returned `<div className="border-t …">`, above the author line:

```tsx
      <p className="mb-2 whitespace-pre-wrap text-[11.5px] leading-[1.55] text-[var(--color-charcoal)]">
        {field.body}
      </p>
      {/* §8.5 — the transcript is labelled a draft ONCE, where she reads it.
          No mechanism talk, and never the word "AI". */}
      {field.fieldCaptureId && field.captureVisible && field.hasAudio ? (
        <Quiet>A first reading. The recording is here.</Quiet>
      ) : null}
      {/* FC-R8 / §9.4 — margin_items is security_invoker, so a studio
          co-member reads the note and not the capture. Say so, rather than
          showing her a note with a missing play button and no explanation. */}
      {field.fieldCaptureId && !field.captureVisible ? (
        <Quiet>The recording is the author&rsquo;s.</Quiet>
      ) : null}
```

- [ ] **Step 5: Run both and watch them pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/lib/document/__tests__/field-note-payload.test.ts
pnpm jest src/components/document/__tests__/margin-bodies.field-note.test.tsx
```

Expected: PASS, 8 + 5 tests.

- [ ] **Step 6: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm lint --filter designer-portal
git add apps/designer-portal/src/lib/document/field-note-payload.ts \
        apps/designer-portal/src/lib/document/__tests__/field-note-payload.test.ts \
        apps/designer-portal/src/components/document/__tests__/margin-bodies.field-note.test.tsx \
        apps/designer-portal/src/components/document/margin-bodies.tsx
git commit -m "feat(document): the margin renders the whole field note, and names the draft once"
```

---

### Task 3 — The play button and the photo strip

**Model:** Sonnet.

**Files:**
- Create: `apps/designer-portal/src/components/document/field-note-media.tsx`
- Create: `apps/designer-portal/src/components/document/__tests__/field-note-media.test.tsx`
- Modify: `apps/designer-portal/src/components/document/margin-bodies.tsx` (`NoteBody` — one element)

**Interfaces:**
- Consumes: `useCaptureMediaUrls(paths: readonly string[], ttlSeconds = 3600): UseQueryResult<Record<string, string>>` from `@patina/supabase` (Wave 1P, spec §11.1 — **use the signature Task 0.2 recorded, not this one, if they differ**); `readFieldNotePayload`, `formatNoteDuration` from Task 2.
- Produces:

```tsx
export function FieldNoteMedia({
  audioPaths,
  photoPaths,
  durationSeconds,
}: {
  audioPaths: string[];
  photoPaths: string[];
  durationSeconds: number | null;
}): JSX.Element | null;
```

Returns `null` when both arrays are empty — the whole "renders nothing on a field-less project" posture passes through this one early return.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/document/__tests__/field-note-media.test.tsx`:

```tsx
/**
 * FieldNoteMedia — the margin's play button and photo strip (§11.4), signed
 * through useCaptureMediaUrls (§11.1). One signing call for the audio and the
 * photos together: letterhead-instruments.tsx:123 is the in-repo precedent for
 * batching rather than one round-trip per path.
 */
import { render, screen } from '@testing-library/react';
import { FieldNoteMedia } from '../field-note-media';

const signed = jest.fn();
jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: (paths: readonly string[], ttl?: number) => signed(paths, ttl),
}));

describe('FieldNoteMedia', () => {
  beforeEach(() => signed.mockReset());

  it('renders nothing at all when there is no field media', () => {
    signed.mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(
      <FieldNoteMedia audioPaths={[]} photoPaths={[]} durationSeconds={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('signs the audio and the photos in one batched call', () => {
    signed.mockReturnValue({ data: {}, isLoading: true });
    render(
      <FieldNoteMedia
        audioPaths={['a/voice-000.m4a', 'a/voice-001.m4a']}
        photoPaths={['a/photo-0.heic']}
        durationSeconds={64.5}
      />,
    );
    expect(signed).toHaveBeenCalledTimes(1);
    expect(signed.mock.calls[0][0]).toEqual([
      'a/voice-000.m4a',
      'a/voice-001.m4a',
      'a/photo-0.heic',
    ]);
  });

  it('plays the first segment and states how long the note runs', () => {
    signed.mockReturnValue({
      data: { 'a/voice-000.m4a': 'https://signed/voice-000' },
      isLoading: false,
    });
    render(
      <FieldNoteMedia audioPaths={['a/voice-000.m4a']} photoPaths={[]} durationSeconds={64.5} />,
    );
    const audio = screen.getByTestId('field-note-audio-0');
    expect(audio).toHaveAttribute('src', 'https://signed/voice-000');
    expect(screen.getByText('1:04')).toBeInTheDocument();
  });

  it('renders one player per segment, in capture order', () => {
    signed.mockReturnValue({
      data: {
        'a/voice-000.m4a': 'https://signed/voice-000',
        'a/voice-001.m4a': 'https://signed/voice-001',
      },
      isLoading: false,
    });
    render(
      <FieldNoteMedia
        audioPaths={['a/voice-000.m4a', 'a/voice-001.m4a']}
        photoPaths={[]}
        durationSeconds={null}
      />,
    );
    expect(screen.getByTestId('field-note-audio-0')).toHaveAttribute('src', 'https://signed/voice-000');
    expect(screen.getByTestId('field-note-audio-1')).toHaveAttribute('src', 'https://signed/voice-001');
  });

  it('shows the photos it could sign and says plainly when one would not', () => {
    signed.mockReturnValue({
      data: { 'a/photo-0.heic': 'https://signed/photo-0' },
      isLoading: false,
    });
    render(
      <FieldNoteMedia
        audioPaths={[]}
        photoPaths={['a/photo-0.heic', 'a/photo-1.heic']}
        durationSeconds={null}
      />,
    );
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText('1 photo needs signal.')).toBeInTheDocument();
  });

  it('says it is still fetching rather than showing an empty strip', () => {
    signed.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <FieldNoteMedia audioPaths={['a/voice-000.m4a']} photoPaths={[]} durationSeconds={null} />,
    );
    expect(screen.getByText('Fetching the recording…')).toBeInTheDocument();
    expect(screen.queryByTestId('field-note-audio-0')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/field-note-media.test.tsx
```

Expected: FAIL with `Cannot find module '../field-note-media'`.

- [ ] **Step 3: Write the component**

Create `apps/designer-portal/src/components/document/field-note-media.tsx`:

```tsx
'use client';

/**
 * FieldNoteMedia — the recording and the photographs that came with a field
 * note (§11.4). One batched signing call covers both lanes, the way
 * letterhead-instruments.tsx:123 batches a page of scan heroes rather than
 * signing per row.
 *
 * The `capture-media` bucket is private, so every path here is worthless
 * without a signed URL and a path that fails to sign is stated rather than
 * dropped (§3.3). Native <audio controls> is the player: a bespoke transport
 * would be a second seek/scrub implementation for a one-minute note.
 */
import { useCaptureMediaUrls } from '@patina/supabase';
import { formatNoteDuration } from '@/lib/document/field-note-payload';

export function FieldNoteMedia({
  audioPaths,
  photoPaths,
  durationSeconds,
}: {
  audioPaths: string[];
  photoPaths: string[];
  durationSeconds: number | null;
}) {
  const paths = [...audioPaths, ...photoPaths];
  const { data: signed, isLoading } = useCaptureMediaUrls(paths);

  if (paths.length === 0) return null;

  const urls = signed ?? {};
  const audio = audioPaths.map((p) => urls[p] ?? null);
  const photos = photoPaths.map((p) => urls[p] ?? null);
  const unsignedPhotos = photos.filter((u) => u === null).length;
  const duration = formatNoteDuration(durationSeconds);

  return (
    <div className="mb-2.5">
      {isLoading && audioPaths.length > 0 ? (
        <p className="py-1 text-[10.5px] italic text-[var(--text-muted)]">
          Fetching the recording…
        </p>
      ) : null}

      {audio.map((url, i) =>
        url ? (
          <div key={audioPaths[i]} className="mb-1.5 flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              data-testid={`field-note-audio-${i}`}
              src={url}
              controls
              preload="none"
              className="h-7 w-full max-w-[240px]"
            />
            {i === 0 && duration ? (
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">
                {duration}
              </span>
            ) : null}
          </div>
        ) : null,
      )}

      {photos.some(Boolean) ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {photos.map((url, i) =>
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photoPaths[i]}
                src={url}
                alt=""
                className="h-14 w-14 rounded-[3px] object-cover"
              />
            ) : null,
          )}
        </div>
      ) : null}

      {unsignedPhotos > 0 ? (
        <p className="py-1 text-[10.5px] italic text-[var(--text-muted)]">
          {unsignedPhotos} photo{unsignedPhotos === 1 ? '' : 's'} need
          {unsignedPhotos === 1 ? 's' : ''} signal.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Hang it on the note**

In `margin-bodies.tsx`, add the import beside the Task 2 one:

```tsx
import { FieldNoteMedia } from './field-note-media';
```

and in `NoteBody`, immediately **after** the body paragraph and **before** the two `<Quiet>` lines from Task 2:

```tsx
      {field.captureVisible ? (
        <FieldNoteMedia
          audioPaths={field.audioPaths}
          photoPaths={field.photoPaths}
          durationSeconds={field.durationSeconds}
        />
      ) : null}
```

- [ ] **Step 5: Run both note suites and watch them pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/field-note-media.test.tsx
pnpm jest src/components/document/__tests__/margin-bodies.field-note.test.tsx
```

Expected: PASS, 6 + 5 tests.

- [ ] **Step 6: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm lint --filter designer-portal
git add apps/designer-portal/src/components/document/field-note-media.tsx \
        apps/designer-portal/src/components/document/__tests__/field-note-media.test.tsx \
        apps/designer-portal/src/components/document/margin-bodies.tsx
git commit -m "feat(document): play a field note in the margin, with the photos it was taken with"
```

---

### Task 4 — Escalation carries the whole note, not the lede

**Model:** Haiku. Two call sites, one parser already built.

**Files:**
- Modify: `apps/designer-portal/src/components/document/margin-bodies.tsx:854-892` (the `toDecision.mutate` call and the `AmendmentSheet` seed)
- Create: `apps/designer-portal/src/components/document/__tests__/margin-bodies.escalation-body.test.tsx`

**Interfaces:**
- Consumes: `readFieldNotePayload` (Task 2); `useEscalateNoteToDecision(): { mutate({ noteId, projectId, body }) }` (`apps/designer-portal/src/hooks/use-margin-notes.ts:64-124` — signature unchanged, it already takes a `body`).
- Produces: nothing new. `useEscalateNoteToScopeChange` (`use-margin-notes.ts:128-170`) is **not** wired to `NoteBody` today — the "→ Amendment" button opens `AmendmentSheet`, which records the escalation through `useComposeAmendment`. Do not re-wire it; only its `seed` changes.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/document/__tests__/margin-bodies.escalation-body.test.tsx`:

```tsx
/**
 * Escalating a field note must carry the whole note. Today NoteBody forwards
 * `body: row.title` (margin-bodies.tsx:854-860), and the view truncates title
 * to left(body, 80) — so escalating a one-minute transcript produced a client
 * decision whose text was its first eighty characters. §9.4 calls that "the
 * difference between 'works for free' and 'works'".
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { MarginItemRow } from '@/lib/document/margin-derivation';
import { NoteBody } from '../margin-bodies';

const escalate = jest.fn();
const amendmentSeed = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  useApplyDecisionOverride: () => ({ mutate: jest.fn(), isPending: false }),
  useDecision: () => ({ data: undefined }),
  useDecisionOverrides: () => ({ data: [] }),
  useIssueInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useInvoice: () => ({ data: undefined }),
  useProjectFFEItems: () => ({ data: [] }),
  useSendDecisionReminder: () => ({ mutate: jest.fn(), isPending: false }),
  useSendInvoice: () => ({ mutate: jest.fn(), isPending: false }),
  useSendMessage: () => ({ mutate: jest.fn(), isPending: false }),
  useThreadMessages: () => ({ data: [] }),
  useUpdateDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useExtendAndReopenDecision: () => ({ mutate: jest.fn(), isPending: false }),
  useCaptureMediaUrls: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/lib/document/field-sms', () => ({ describeFieldEffect: () => '' }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/hooks/use-margin-items', () => ({
  invalidateMarginSurfaces: jest.fn(),
  useSendWeeklyPulse: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-margin-notes', () => ({
  useEscalateNoteToDecision: () => ({ mutate: escalate, isPending: false, isError: false }),
}));
jest.mock('@/components/document/overlays/amendment-sheet', () => ({
  AmendmentSheet: (props: { seed?: unknown }) => {
    amendmentSeed(props.seed);
    return null;
  },
}));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceFolio: jest.fn() }));

const LONG =
  'The base cabinet scribe is short on the left return and the filler behind the range needs to be re-cut before the countertop template on Thursday.';

const fieldNote: MarginItemRow = {
  kind: 'note',
  item_id: 'note-1',
  project_id: 'project-1',
  proposal_id: null,
  anchor_kind: 'letterhead',
  anchor_id: null,
  state: 'open',
  title: LONG.slice(0, 80),
  detail: '',
  ts: '2026-08-25T15:00:00Z',
  payload: { body: LONG, field_capture_id: 'capture-1', capture_visible: true, has_audio: true },
};

describe('NoteBody escalation', () => {
  beforeEach(() => {
    escalate.mockReset();
    amendmentSeed.mockReset();
  });

  it('sends the full note to the client decision, not the eighty-character title', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    fireEvent.click(screen.getByText('→ Client decision'));
    expect(escalate).toHaveBeenCalledWith({
      noteId: 'note-1',
      projectId: 'project-1',
      body: LONG,
    });
  });

  it('seeds the amendment with the full note as its description', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    expect(amendmentSeed).toHaveBeenCalledWith(
      expect.objectContaining({ description: LONG, noteId: 'note-1' }),
    );
  });

  it('keeps the amendment title short enough to read in a heading', () => {
    render(<NoteBody row={fieldNote} projectId="project-1" />);
    const seed = amendmentSeed.mock.calls[0][0] as { title: string };
    expect(seed.title.length).toBeLessThanOrEqual(70);
    expect(seed.title.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/margin-bodies.escalation-body.test.tsx
```

Expected: FAIL — `expect(escalate).toHaveBeenCalledWith` reports `body` as the 80-character title, and the amendment `description` likewise.

- [ ] **Step 3: Pass the body instead of the title**

In `NoteBody`, replace `body: row.title` in the `toDecision.mutate` call with `body: field.body`, and in the `AmendmentSheet` `seed` replace both `row.title` uses:

```tsx
          seed={{
            title:
              field.body.length > 70 ? `${field.body.slice(0, 67)}…` : field.body,
            description: field.body,
            noteId: row.item_id,
          }}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/margin-bodies.escalation-body.test.tsx
pnpm jest src/components/document/__tests__/margin-bodies.field-note.test.tsx
```

Expected: PASS, 3 + 5 tests.

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm lint --filter designer-portal
git add apps/designer-portal/src/components/document/margin-bodies.tsx \
        apps/designer-portal/src/components/document/__tests__/margin-bodies.escalation-body.test.tsx
git commit -m "fix(document): escalating a field note carries the whole note"
```

---

### Task 5 — `useProjectVisits`, and the rule that a label is whichever she typed last

**Model:** Sonnet.

**Files:**
- Create: `packages/supabase/src/hooks/use-project-visits.ts`
- Create: `packages/supabase/src/hooks/__tests__/use-project-visits.test.ts`
- Modify: `packages/supabase/src/hooks/index.ts` (one export line)

**Interfaces:**
- Consumes: `field_captures.visit_id / visit_label / visit_kind / capture_kind / photos / primary_photo_path / voice_transcript / voice_duration_seconds` (waves 1 + 3 — confirm the spellings Task 0.1 recorded); `margin_notes.field_capture_id` (**Task 1** — this task cannot run before that migration is applied, and the task order already places it after).
- Produces:

```ts
export interface ProjectVisitCapture {
  id: string;
  captureKind: string | null;
  createdAt: string;
  roomName: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  photoPaths: string[];
  /** The margin note this capture filed itself as, if any (ruling 1). */
  marginNoteId: string | null;
}

export interface ProjectVisit {
  visitId: string;
  label: string | null;
  kind: string | null;
  startedAt: string;      // min(created_at) — NEVER visit_started_at
  endedAt: string;        // max(created_at) — NEVER visit_ended_at
  photoCount: number;
  noteCount: number;
  rooms: string[];
  captures: ProjectVisitCapture[];   // newest first
}

export interface ProjectVisitRow { /* the raw SELECT shape — see the file */ }

export function groupCapturesIntoVisits(rows: readonly ProjectVisitRow[]): ProjectVisit[];
export function useProjectVisits(projectId: string | null): UseQueryResult<ProjectVisit[]>;
```

Task 6 renders `ProjectVisit[]` and nothing else.

**⚠ Why every capture now carries a `marginNoteId`, and what the block may do with it (ruling 1).**
Every in-visit voice note files itself into the margin automatically, so the same material is in two
places. The split that keeps that affordable is a rule about **what each surface renders**: the margin
carries the **note body**; the Visits block carries **counts, a thumbnail and the first transcript
line**, and **deep-links** to the margin item rather than repeating it. `marginNoteId` is the link.
It arrives through a PostgREST embed on the FK Task 1 creates —
`margin_notes.field_capture_id → field_captures.id` — so it costs no second round-trip and is null
until Task 1 has been applied. **§11.4's per-visit margin fold is deferred, not taken**; Task 18's
report carries it as an owed decision.

**⚠ Why there is no `scanCount`.** `room_scans` carries no visit key anywhere in the schema, and the wave-3 visit/suggestion migration puts `visit_id` on `field_captures` only. Attributing a scan to a visit by timestamp overlap would render a guess as a fact. §11.3's mock line reads *"12 photos · 3 notes · 1 scan"*; this ships *"12 photos · 3 notes"* and the scan stays in the Room files block. A `room_scans.visit_id` column is owed and is deliberately not drawn from the 00530–00535 band.

- [ ] **Step 1: Write the failing test**

Create `packages/supabase/src/hooks/__tests__/use-project-visits.test.ts`:

```ts
/**
 * groupCapturesIntoVisits — the whole Visits block reduces to this function,
 * so it is tested with no mocks at all (the hook around it is a two-line
 * useQuery). §11.3 fixes three rules and this suite is those three rules:
 *   · one row per visit_id, newest first
 *   · a mid-visit rename leaves TWO visit_label values for one visit_id —
 *     latest created_at wins
 *   · the span is min/max(created_at), NEVER visit_ended_at, because
 *     commit_field_capture's upsert skips a status='saved' row without
 *     touching it (00235:187-199), so a market-run capture is immutable the
 *     moment it commits and can never receive an end stamp.
 */
import { describe, expect, it } from 'vitest';

import { groupCapturesIntoVisits, type ProjectVisitRow } from '../use-project-visits';

function row(over: Partial<ProjectVisitRow>): ProjectVisitRow {
  return {
    id: 'c1',
    visit_id: 'v1',
    visit_label: 'Maple St',
    visit_kind: 'site',
    capture_kind: 'specimen',
    created_at: '2026-08-25T15:00:00Z',
    project_room_id: null,
    room: null,
    voice_transcript: null,
    voice_duration_seconds: null,
    photos: [],
    primary_photo_path: null,
    margin_notes: [],
    ...over,
  };
}

describe('groupCapturesIntoVisits', () => {
  it('returns nothing for a project with no field captures', () => {
    expect(groupCapturesIntoVisits([])).toEqual([]);
  });

  it('drops captures that belong to no visit rather than inventing one', () => {
    expect(groupCapturesIntoVisits([row({ visit_id: null })])).toEqual([]);
  });

  it('counts photos and notes off the schema, not off a heuristic', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', photos: [{ path: 'a.heic' }] }),
      row({ id: 'c2', photos: [{ path: 'b.heic' }, { path: 'c.heic' }] }),
      row({ id: 'c3', capture_kind: 'note', voice_transcript: 'the alcove reads forty-two' }),
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0].photoCount).toBe(2);
    expect(visits[0].noteCount).toBe(1);
  });

  it('lets the latest created_at win when she renamed mid-visit', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', visit_label: 'Maple St' }),
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z', visit_label: 'Maple St · punch walk' }),
    ]);
    expect(visits[0].label).toBe('Maple St · punch walk');
  });

  it('ignores a null label when resolving the name', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', visit_label: 'Maple St' }),
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z', visit_label: null }),
    ]);
    expect(visits[0].label).toBe('Maple St');
  });

  it('derives the span from min/max created_at', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c2', created_at: '2026-08-25T17:30:00Z' }),
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z' }),
      row({ id: 'c3', created_at: '2026-08-25T16:10:00Z' }),
    ]);
    expect(visits[0].startedAt).toBe('2026-08-25T15:00:00Z');
    expect(visits[0].endedAt).toBe('2026-08-25T17:30:00Z');
  });

  it('lists the rooms it touched, once each, in the order it met them', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', created_at: '2026-08-25T15:00:00Z', room: { name: 'Living' } }),
      row({ id: 'c2', created_at: '2026-08-25T16:00:00Z', room: { name: 'Dining' } }),
      row({ id: 'c3', created_at: '2026-08-25T17:00:00Z', room: { name: 'Living' } }),
      row({ id: 'c4', created_at: '2026-08-25T18:00:00Z', room: null }),
    ]);
    expect(visits[0].rooms).toEqual(['Living', 'Dining']);
  });

  it('orders visits newest first and their captures newest first', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'a1', visit_id: 'v1', created_at: '2026-08-15T09:00:00Z', visit_label: 'Whole house' }),
      row({ id: 'b1', visit_id: 'v2', created_at: '2026-08-25T15:00:00Z' }),
      row({ id: 'b2', visit_id: 'v2', created_at: '2026-08-25T17:00:00Z' }),
    ]);
    expect(visits.map((v) => v.visitId)).toEqual(['v2', 'v1']);
    expect(visits[0].captures.map((c) => c.id)).toEqual(['b2', 'b1']);
  });

  it('pulls photo storage keys out of the photos jsonb, skipping pathless entries', () => {
    const visits = groupCapturesIntoVisits([
      row({ photos: [{ path: 'a.heic' }, { isPrimary: true }, { path: '' }] }),
    ]);
    expect(visits[0].captures[0].photoPaths).toEqual(['a.heic']);
  });

  it('carries the margin note a capture filed itself as, so the row can link to it', () => {
    const visits = groupCapturesIntoVisits([
      row({ id: 'c1', margin_notes: [{ id: 'note-1' }] }),
    ]);
    expect(visits[0].captures[0].marginNoteId).toBe('note-1');
  });

  it('reads marginNoteId as null when nothing filed — every pre-wave-4 capture', () => {
    expect(groupCapturesIntoVisits([row({ margin_notes: [] })])[0].captures[0].marginNoteId)
      .toBeNull();
    expect(groupCapturesIntoVisits([row({ margin_notes: null })])[0].captures[0].marginNoteId)
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-visits.test.ts
```

Expected: FAIL — `Failed to resolve import "../use-project-visits"`.

- [ ] **Step 3: Write the hook**

Create `packages/supabase/src/hooks/use-project-visits.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/**
 * The Visits block's only read (§11.3). One line per field_captures.visit_id
 * on a project, grouped here rather than in the component so the three rules
 * below are testable without a DOM.
 *
 * ⚠ The span is min/max(created_at), NEVER visit_ended_at. A capture routed to
 * the Library commits at status='saved', and commit_field_capture's upsert
 * ends `WHERE field_captures.status NOT IN ('saved','dismissed')` and returns
 * without touching the row (00235:187-199) — so a market-run capture is
 * immutable the moment it commits and closing its visit can never stamp it.
 * visit_ended_at is a device-side nicety, correct only while status='inbox'.
 *
 * ⚠ There is no scan count. room_scans carries no visit key, and attributing a
 * scan to a visit by timestamp overlap would render a guess as a fact
 * (Principle 4). Scans stay in the Room files block; a room_scans.visit_id
 * column is owed.
 */

export interface ProjectVisitRow {
  id: string;
  visit_id: string | null;
  visit_label: string | null;
  visit_kind: string | null;
  capture_kind: string | null;
  created_at: string;
  project_room_id: string | null;
  room: { name: string | null } | null;
  voice_transcript: string | null;
  voice_duration_seconds: number | null;
  photos: unknown;
  primary_photo_path: string | null;
  /** Embedded through margin_notes.field_capture_id (the margin migration). */
  margin_notes: { id: string }[] | null;
}

export interface ProjectVisitCapture {
  id: string;
  captureKind: string | null;
  createdAt: string;
  roomName: string | null;
  transcript: string | null;
  durationSeconds: number | null;
  photoPaths: string[];
  marginNoteId: string | null;
}

export interface ProjectVisit {
  visitId: string;
  label: string | null;
  kind: string | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  noteCount: number;
  rooms: string[];
  captures: ProjectVisitCapture[];
}

function photoPathsOf(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p) =>
      p && typeof p === 'object' && typeof (p as { path?: unknown }).path === 'string'
        ? ((p as { path: string }).path)
        : '',
    )
    .filter((p) => p.length > 0);
}

export function groupCapturesIntoVisits(
  rows: readonly ProjectVisitRow[],
): ProjectVisit[] {
  const byVisit = new Map<string, ProjectVisitRow[]>();
  for (const r of rows) {
    if (!r.visit_id) continue;
    const bucket = byVisit.get(r.visit_id);
    if (bucket) bucket.push(r);
    else byVisit.set(r.visit_id, [r]);
  }

  const visits: ProjectVisit[] = [];
  for (const [visitId, bucket] of byVisit) {
    const ascending = [...bucket].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const descending = [...ascending].reverse();

    // A mid-visit rename leaves two labels for one visit_id. Latest wins.
    const label = descending.find((r) => r.visit_label)?.visit_label ?? null;

    const rooms: string[] = [];
    for (const r of ascending) {
      const name = r.room?.name ?? null;
      if (name && !rooms.includes(name)) rooms.push(name);
    }

    const captures: ProjectVisitCapture[] = descending.map((r) => ({
      id: r.id,
      captureKind: r.capture_kind,
      createdAt: r.created_at,
      roomName: r.room?.name ?? null,
      transcript: r.voice_transcript,
      durationSeconds: r.voice_duration_seconds,
      photoPaths: photoPathsOf(r.photos),
      // A capture files at most one margin note (one client-minted id per
      // lane), but the embed is a to-many relationship, so take the first.
      marginNoteId: r.margin_notes?.[0]?.id ?? null,
    }));

    visits.push({
      visitId,
      label,
      kind: descending.find((r) => r.visit_kind)?.visit_kind ?? null,
      startedAt: ascending[0].created_at,
      endedAt: ascending[ascending.length - 1].created_at,
      photoCount: captures.filter((c) => c.photoPaths.length > 0).length,
      noteCount: captures.filter((c) => c.captureKind === 'note').length,
      rooms,
      captures,
    });
  }

  return visits.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

export function useProjectVisits(
  projectId: string | null,
): UseQueryResult<ProjectVisit[]> {
  return useQuery({
    queryKey: ['project-visits', projectId],
    enabled: Boolean(projectId),
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectVisit[]> => {
      if (!projectId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_captures')
        .select(
          'id, visit_id, visit_label, visit_kind, capture_kind, created_at, ' +
            'project_room_id, voice_transcript, voice_duration_seconds, ' +
            'photos, primary_photo_path, room:project_rooms(name), ' +
            // The margin note this capture filed itself as (ruling 1). The
            // relationship is margin_notes.field_capture_id → field_captures.id,
            // created by the margin migration; margin_items is a view and cannot
            // be embedded, so the base table is read directly. RLS applies:
            // margin_notes_designer_all is the author's own, so a studio
            // co-member reads no id and the row simply does not link.
            'margin_notes(id)',
        )
        .eq('project_id', projectId)
        .not('visit_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return groupCapturesIntoVisits((data ?? []) as ProjectVisitRow[]);
    },
  });
}
```

Then add one line to `packages/supabase/src/hooks/index.ts` (the barrel; `src/index.ts` already does `export * from "./hooks"`):

```ts
export {
  useProjectVisits,
  groupCapturesIntoVisits,
  type ProjectVisit,
  type ProjectVisitCapture,
  type ProjectVisitRow,
} from "./use-project-visits";
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-visits.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
git add packages/supabase/src/hooks/use-project-visits.ts \
        packages/supabase/src/hooks/__tests__/use-project-visits.test.ts \
        packages/supabase/src/hooks/index.ts
git commit -m "feat(supabase): useProjectVisits — one line per visit, spanned by what it captured"
```

---

### Task 6 — The Visits block on the project spread

**Model:** Sonnet.

**Files:**
- Create: `apps/designer-portal/src/components/document/visits-block.tsx`
- Create: `apps/designer-portal/src/components/document/__tests__/visits-block.test.tsx`
- Modify: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (one mount, in the `spreadSection === 'project'` branch)
- Modify: `apps/designer-portal/src/components/document/margin-rail.tsx:443` (give a `note` row a stable dom id so the Visits block can link to it)

**Interfaces:**
- Consumes: `useProjectVisits`, `ProjectVisit` (Task 5); `useCaptureMediaUrls` (Wave 1P).
- Produces: `export function VisitsBlock({ projectId }: { projectId: string }): JSX.Element | null` — **returns `null` when the project has no visits.** That early return is the whole unflagged posture (FC-R10).

**⚠ What this block may and may not render (ruling 1).** Every in-visit voice note now files itself
into the margin automatically, so this block and the margin rail carry the same material. The rule:
**the margin renders the note body; this block renders counts, one thumbnail and the first transcript
line, and links to the margin item.** A capture row must never render the full transcript — that is
the duplication §11.4 warns about, and it is the only thing this wave does about it. The per-visit
margin fold §11.4 offers as the alternative remedy is **deferred**; Task 18's report carries it.

**Copy** (FC-R3; the section title is *Visits*, never "Field", never "Inbox"):

| Surface | String |
|---|---|
| Section title | `Visits` |
| Count meta | `1 visit` / `6 visits` |
| Row lede | `Tue Aug 25 · Living, Dining` — the label replaces the room list when she named the visit |
| Row tally | `12 photos · 3 notes` (singular `1 photo` / `1 note`; a lane with zero is omitted) |
| Expanded capture with no transcript | `Photo` |
| Expanded capture, no room | `Unplaced` |
| The link on a capture that filed a note | `Read it in the margin` |

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/document/__tests__/visits-block.test.tsx`:

```tsx
/**
 * VisitsBlock — §11.3. The load-bearing assertion is the first one: a project
 * with no field data must render NOTHING, because the whole wave ships
 * unflagged on exactly that claim (FC-R10). The browser half of the same
 * criterion is Task 18.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectVisit } from '@patina/supabase';
import { VisitsBlock } from '../visits-block';

const visits = jest.fn();
const signed = jest.fn(() => ({ data: {} as Record<string, string>, isLoading: false }));
jest.mock('@patina/supabase', () => ({
  useProjectVisits: (projectId: string | null) => visits(projectId),
  useCaptureMediaUrls: (paths: readonly string[]) => signed(paths),
}));

function visit(over: Partial<ProjectVisit> = {}): ProjectVisit {
  return {
    visitId: 'v1',
    label: null,
    kind: 'site',
    startedAt: '2026-08-25T15:00:00Z',
    endedAt: '2026-08-25T17:30:00Z',
    photoCount: 12,
    noteCount: 3,
    rooms: ['Living', 'Dining'],
    captures: [
      {
        id: 'c1',
        captureKind: 'note',
        createdAt: '2026-08-25T17:30:00Z',
        roomName: 'Dining',
        transcript: 'the base cabinet scribe is short on the left return',
        durationSeconds: 64.5,
        photoPaths: [],
        marginNoteId: null,
      },
    ],
    ...over,
  };
}

describe('VisitsBlock', () => {
  beforeEach(() => {
    visits.mockReset();
    signed.mockReset();
    signed.mockReturnValue({ data: {}, isLoading: false });
  });

  it('renders nothing on a project with no field data', () => {
    visits.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the read is still in flight', () => {
    visits.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<VisitsBlock projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the block Visits and counts them', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('1 visit')).toBeInTheDocument();
  });

  it('leads with the day and the rooms it touched', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Living, Dining')).toBeInTheDocument();
  });

  it('prefers the name she gave the visit over the room list', () => {
    visits.mockReturnValue({ data: [visit({ label: 'Maple St · punch walk' })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('Tue Aug 25 · Maple St · punch walk')).toBeInTheDocument();
  });

  it('tallies photos and notes, and never a scan', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('12 photos · 3 notes')).toBeInTheDocument();
    expect(screen.queryByText(/scan/i)).not.toBeInTheDocument();
  });

  it('omits a lane that captured nothing, and speaks singular when it is one', () => {
    visits.mockReturnValue({ data: [visit({ photoCount: 1, noteCount: 0 })], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('opens a visit to what it captured', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    expect(
      screen.queryByText('the base cabinet scribe is short on the left return'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(
      screen.getByText('the base cabinet scribe is short on the left return'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
  });

  it('says a capture is unplaced rather than leaving the room blank', () => {
    visits.mockReturnValue({
      data: [
        visit({
          captures: [
            {
              id: 'c1',
              captureKind: 'specimen',
              createdAt: '2026-08-25T17:30:00Z',
              roomName: null,
              transcript: null,
              durationSeconds: null,
              photoPaths: ['a.heic'],
              marginNoteId: null,
            },
          ],
        }),
      ],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.getByText('Unplaced')).toBeInTheDocument();
    expect(screen.getByText('Photo')).toBeInTheDocument();
  });

  // ── ruling 1: the block re-lists what the margin already carries, so it
  //    must show a LEDE and a LINK, never the note.
  it('shows only the first line of a transcript, never the whole note', () => {
    const long =
      'The base cabinet scribe is short on the left return.\nAnd the filler behind the range has to be re-cut before the countertop template on Thursday.';
    visits.mockReturnValue({
      data: [visit({ captures: [{ ...visit().captures[0], transcript: long }] })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(
      screen.getByText('The base cabinet scribe is short on the left return.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    expect(screen.queryByText(/countertop template/)).not.toBeInTheDocument();
  });

  it('links a capture that filed a note to that note in the margin', () => {
    visits.mockReturnValue({
      data: [visit({ captures: [{ ...visit().captures[0], marginNoteId: 'note-1' }] })],
      isLoading: false,
    });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.getByRole('link', { name: 'Read it in the margin' })).toHaveAttribute(
      'href',
      '#margin-item-note-1',
    );
  });

  it('offers no link when nothing was filed — a photo-only capture', () => {
    visits.mockReturnValue({ data: [visit()], isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('signs every open visit’s thumbnails in one call, not one call per row', () => {
    visits.mockReturnValue({
      data: [
        visit({
          captures: [
            { ...visit().captures[0], id: 'c1', photoPaths: ['a.heic', 'b.heic'] },
            { ...visit().captures[0], id: 'c2', photoPaths: ['c.heic'] },
          ],
        }),
      ],
      isLoading: false,
    });
    signed.mockReturnValue({ data: { 'a.heic': 'https://signed/a' }, isLoading: false });
    render(<VisitsBlock projectId="project-1" />);
    fireEvent.click(screen.getByText('Tue Aug 25 · Living, Dining'));
    // One hook call per render pass, and its argument is every open row's lead
    // photo — never a per-row query key.
    const lastCall = signed.mock.calls[signed.mock.calls.length - 1][0];
    expect(lastCall).toEqual(['a.heic', 'c.heic']);
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/visits-block.test.tsx
```

Expected: FAIL with `Cannot find module '../visits-block'`.

- [ ] **Step 3: Write the block**

Create `apps/designer-portal/src/components/document/visits-block.tsx`:

```tsx
'use client';

/**
 * The Visits block (§11.3, FC-R3) — one line per visit on the project spread,
 * beside Room files. Read-only: every row in it is already filed, and this is
 * the record of a visit, not a queue. §16.1 refuses an inbox in the portal and
 * this block is how that refusal stays affordable — the margin carries only the
 * notes she promoted, and everything else lives here.
 *
 * Returns null when the project has no visits. That early return is what makes
 * the wave safe to ship unflagged (FC-R10): a field-less project renders
 * exactly as it did before.
 *
 * ⚠ Ruling 1 (2026-08-24): an in-visit voice note files itself into the margin
 * automatically, so this block and the margin rail carry the same material.
 * This block therefore renders a LEDE and a LINK — the first transcript line,
 * one thumbnail, and an anchor to the margin item — and NEVER the note body.
 * Widening it back to the full transcript is the duplication §11.4 warns about.
 *
 * Typography-first, zero shadows, local primitives — the document surfaces do
 * not reach into @patina/design-system for a heading and a list.
 */
import { useState } from 'react';
import {
  useCaptureMediaUrls,
  useProjectVisits,
  type ProjectVisit,
  type ProjectVisitCapture,
} from '@patina/supabase';

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function lede(v: ProjectVisit): string {
  const where = v.label ?? (v.rooms.length > 0 ? v.rooms.join(', ') : 'Whole house');
  return `${fmtDay(v.endedAt)} · ${where}`;
}

function tally(v: ProjectVisit): string {
  const parts: string[] = [];
  if (v.photoCount > 0) parts.push(`${v.photoCount} photo${v.photoCount === 1 ? '' : 's'}`);
  if (v.noteCount > 0) parts.push(`${v.noteCount} note${v.noteCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The first line of a transcript, clipped so a row stays a row. */
function firstLine(transcript: string | null): string | null {
  const line = (transcript ?? '').split('\n')[0].trim();
  if (line.length === 0) return null;
  return line.length > 96 ? `${line.slice(0, 95).trimEnd()}…` : line;
}

/**
 * The lead photo of every capture in the OPEN visit, in one array, so the whole
 * block signs once. One hook inside the row component would give each row its
 * own query key and its own createSignedUrls round-trip.
 */
function leadPhotoPaths(captures: readonly ProjectVisitCapture[]): string[] {
  return captures.map((c) => c.photoPaths[0]).filter((p): p is string => Boolean(p));
}

export function VisitsBlock({ projectId }: { projectId: string }) {
  const { data: visits } = useProjectVisits(projectId);
  const [open, setOpen] = useState<string | null>(null);

  const openVisit = visits?.find((v) => v.visitId === open) ?? null;
  const { data: signed } = useCaptureMediaUrls(
    openVisit ? leadPhotoPaths(openVisit.captures) : [],
  );

  if (!visits || visits.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: '1.25rem',
            lineHeight: 1.35,
          }}
        >
          Visits
        </h3>
        <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
          {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
        </span>
      </div>

      <ul className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        {visits.map((v) => (
          <li key={v.visitId} className="border-b" style={{ borderColor: 'var(--border-default)' }}>
            <button
              type="button"
              onClick={() => setOpen(open === v.visitId ? null : v.visitId)}
              aria-expanded={open === v.visitId}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 text-left"
            >
              <span className="text-[15px] text-[var(--text-primary)]">{lede(v)}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {tally(v)}
              </span>
            </button>

            {open === v.visitId ? (
              <ul className="pb-3 pl-3">
                {v.captures.map((c) => {
                  const lead = c.photoPaths[0];
                  const url = lead ? (signed?.[lead] ?? null) : null;
                  return (
                    <li key={c.id} className="flex items-baseline gap-3 py-1.5">
                      <span className="min-w-[64px] font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                        {c.roomName ?? 'Unplaced'}
                      </span>
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt=""
                          className="h-7 w-7 flex-shrink-0 self-center rounded-[3px] object-cover"
                        />
                      ) : null}
                      <span className="text-[12px] leading-[1.5] text-[var(--color-charcoal)]">
                        {firstLine(c.transcript) ?? 'Photo'}
                      </span>
                      {c.marginNoteId ? (
                        // The note itself lives in the margin and is rendered
                        // there once. This is a pointer, not a second copy.
                        <a
                          href={`#margin-item-${c.marginNoteId}`}
                          className="ml-auto flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
                        >
                          Read it in the margin
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Give a margin note a stable dom id, so the link has a target**

`MarginItem` already takes a `targetId` and puts it on its button (`margin-item.tsx:23`, `:30`, `:53`), but `margin-rail.tsx:443` passes one **only** for the pulse row. Widen that one line so a note row gets an anchorable id:

```tsx
        targetId={
          row.kind === 'pulse'
            ? 'document-pulse-control-desktop'
            : row.kind === 'note'
              ? `margin-item-${row.item_id}`
              : undefined
        }
```

⚠ **Say what this link does and does not do.** The margin `<aside>` is in the dom at every width, but below the 1440px full-rail breakpoint it is `inert` and translated off-canvas until the *Margin* trigger is tapped (`margin-rail.tsx:246-262`, `:221-234`). So the anchor lands cleanly in the full rail and is inert in the sheet. **This wave ships the anchor and nothing more** — a click handler that opens the sheet first is a margin-rail change with its own tests, and it is not this block's to make. Record it as an owed item in Task 18 rather than half-building it here.

- [ ] **Step 5: Mount it on the spread**

In `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`, add the import beside `ScheduleSpine`:

```tsx
import { VisitsBlock } from '@/components/document/visits-block';
```

and mount it inside the `spreadSection === 'project' && row.project_id` fragment, **after** `<ScheduleSpine …/>` (`page.tsx:1354`) and **before** `<FFESection …/>` (`:1360`) — verified as the right seam:

```tsx
                  <VisitsBlock projectId={row.project_id} />
```

⚠ §11.2 names this same seam for `RoomFilesSection`, but **Wave 1P did not mount it** — as of the 2026-08-24 review it is imported nowhere in `page.tsx`, and Wave 1P edited `room-file/capture-context-section.tsx` instead. So this block arrives alone; the sibling has not landed. Do not write a comment claiming the two field blocks sit together until Task 0.3 records that they do.

- [ ] **Step 6: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/components/document/__tests__/visits-block.test.tsx
pnpm jest src/components/document/margin-item.test.tsx
```

Expected: PASS, 13 tests in the new file; the existing `margin-item.test.tsx` still green — `targetId` was already a prop, so widening who receives one changes nothing it asserts.

- [ ] **Step 7: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm build --filter designer-portal
pnpm lint --filter designer-portal
git add apps/designer-portal/src/components/document/visits-block.tsx \
        apps/designer-portal/src/components/document/__tests__/visits-block.test.tsx \
        apps/designer-portal/src/components/document/margin-rail.tsx \
        'apps/designer-portal/src/app/(document)/doc/[id]/page.tsx'
git commit -m "feat(document): the Visits block — what a visit produced, on the project spread"
```

---

### Task 7 — The punch back-reference migration

**Model:** Sonnet.

**Files:**
- Create: `supabase/tests/field/project_task_field_capture_ref_test.sql`
- Copy (authored, complete): `docs/design/field-companion/plans/sql/005NN_project_task_field_capture_ref.sql` → `supabase/migrations/00<NN>_project_task_field_capture_ref.sql`

**Interfaces:**
- Consumes: `project_tasks` as `00169`/`00202`/`00215`/`00281`/`00479` leave it; `field_captures(id)`.
- Produces: `project_tasks.field_capture_id uuid REFERENCES field_captures(id) ON DELETE SET NULL` + `idx_project_tasks_field_capture`. Tasks 10, 12 and 13 all write or read it.
- **Deliberately does NOT produce:** any RPC, any policy, any ACL block, any `client_decisions` change. FC-R7 removed all four from the punch path.

**The landing this migration is half of, stated once so no later task re-derives it:**

| Fact | Where |
|---|---|
| `project_tasks.owner` admits `'gc'` | widened `00281:158-163` to `('designer','client','gc','vendor','sub','installer','receiver')` |
| `project_tasks.owner_party_id` → `project_parties(id)` | `00215:26-34` |
| `project_parties.party_kind` admits `'gc'` | `00212:27-44`, widened `00281:48-61` |
| An INSERT with a consented `owner_party_id` fires an SMS **from the database** | trigger `fc_task_assignment_dispatch`, `00284:207-210` → `fc_dispatch_task_assignment()` `00284:160-203`, which returns early unless `party_kind IN ('gc','sub','installer','receiver')` **and** `sms_consent_status = 'granted'`, then invokes `sms-dispatch` with `templateKey 'sms_court_assignment'` |
| The same open task re-appears in the GC's daily digest | `supabase/functions/field-daily/core.ts:177-181` selects `project_tasks` by `owner_party_id` where `status <> 'done'` |
| The device sends nothing | it writes a row; the trigger and the digest own the send, under `_shared/sms.ts`'s consent, quiet-hours and `sms_messages` logging (`sms.ts:328-360`) |
| A studio co-member's INSERT raises 42501 | `"Designers manage their project tasks" FOR ALL` (`00169:61-62`) has no explicit `WITH CHECK`, so Postgres reuses its `USING` — `projects.designer_id = auth.uid()`. The two `SELECT`-only policies never apply to an INSERT. ⚠ That policy also has **no `TO` clause** — it is unqualified, not `TO authenticated`, unlike the convention this plan states in Global Constraints. Pre-existing (00169), not this wave's to fix, and named here so the difference is not read as already-clean. |

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/field/project_task_field_capture_ref_test.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- project_tasks.field_capture_id + the Field punch item's landing
-- (the punch back-reference migration — 005NN_project_task_field_capture_ref.sql)
--
-- Ruling FC-R7: a Field punch item is a project_tasks row owned by the GC,
-- riding the party-anchored SMS rail — never a client_decisions row. This file
-- pins the six facts that landing rests on.
--
-- 1. THE PUNCH INSERT   → owner='gc' + owner_party_id + section_key='install'
--                         + status='todo' + field_capture_id, as a PLAIN INSERT
--                         with a client-minted id. No RPC, no DEFINER.
-- 2. NO DRAFT STATE     → project_tasks.status still admits exactly
--                         ('todo','done','blocked'). FC-R7's whole argument
--                         against client_decisions was that 'draft' lands in a
--                         collapsed "Drafts · N" fold nobody opens; a task has
--                         no such state to fall into.
-- 3. THE COURT EXISTS   → project_tasks.owner still admits 'gc' (widened by
--                         00281:158-163). If it ever stops, every Field punch
--                         item stops inserting.
-- 4. THE RAIL IS WIRED  → the AFTER INSERT OR UPDATE OF owner_party_id trigger
--                         fc_task_assignment_dispatch (00284:207-210) is still
--                         attached, and its function still gates on
--                         sms_consent_status = 'granted'. THAT is why no
--                         automated external send comes from the device: the
--                         device writes a row; the database's own consent gate
--                         decides whether a text goes out.
-- 5. EVIDENCE OUTLIVES  → deleting the capture nulls field_capture_id and
--    THE CAPTURE          leaves the task standing (ON DELETE SET NULL).
-- 6. NO JSONB CREPT IN  → project_tasks still carries zero jsonb columns, so
--                         the "nullable FK, not a routing_source bag" decision
--                         is still the shape of the table.
--
-- How to run:
--   scripts/run-sql-tests.sh -f project_task_field_capture_ref
-- and the FULL suite for the wave report (22 documented known failures).
--
-- ⚠ Runs as `postgres` (superuser), so RLS is BYPASSED. This file proves the
-- COLUMN, the CONSTRAINTS and the TRIGGER — it proves nothing about the 42501
-- a studio co-member gets from "Designers manage their project tasks"
-- (00169:61-62), which is FC-R8's degrade and is device-verified in Task 18.
--
-- ⚠ The fixture party is deliberately sms_consent_status='not_asked' so the
-- dispatch trigger returns early and no edge function is invoked from a test.
-- Case 4 reads the trigger's own source instead of firing it. Two consequences,
-- stated rather than discovered: this file proves NOTHING about the granted
-- path — that a consented GC really receives a text is the device pass's claim
-- (Task 18 step 4.3, verified against an sms_messages row) — and case 4's
-- assertions are STRING MATCHES on function source, so a refactor that keeps
-- the strings and breaks the logic still passes. They are a tripwire on
-- deletion, not a proof of behaviour.
--
-- Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbb00000-0000-4000-8000-000000000001', 'fbb-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbb00000-0000-4000-8000-000000000001', 'fbb-designer@test.invalid', 'FBB Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fbb00000-0000-4000-8000-0000000000a1', 'FBB Maple St',
        'fbb00000-0000-4000-8000-000000000001', 'fbb00000-0000-4000-8000-000000000001');

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('fbb00000-0000-4000-8000-0000000000b1', 'fbb00000-0000-4000-8000-0000000000a1',
        'gc', 'Delaney Build Co', '5551230000', 'not_asked');

INSERT INTO field_captures (
  id, client_capture_id, designer_id, status, destination, project_id,
  voice_transcript, photos, primary_photo_path)
VALUES (
  'fbb00000-0000-4000-8000-0000000000f1',
  'fbb00000-0000-4000-8000-0000000000c1',
  'fbb00000-0000-4000-8000-000000000001',
  'inbox', 'inbox', 'fbb00000-0000-4000-8000-0000000000a1',
  'the base cabinet scribe is short on the left return',
  '[{"path": "fbb/ct/photo-0.heic", "isPrimary": true}]'::jsonb,
  'fbb/ct/photo-0.heic');

DO $$
DECLARE
  v_task      RECORD;
  v_status_ck TEXT;
  v_owner_ck  TEXT;
  v_trigger   BOOLEAN;
  v_fn_src    TEXT;
  v_jsonb     INTEGER;
  v_after     UUID;
BEGIN
  -- 1 ---------------------------------------------------------------------
  INSERT INTO project_tasks (
    id, project_id, title, description, status, owner, owner_party_id,
    section_key, created_by, field_capture_id)
  VALUES (
    'fbb00000-0000-4000-8000-0000000000d1',
    'fbb00000-0000-4000-8000-0000000000a1',
    'Base cabinet scribe short on the left return',
    'the base cabinet scribe is short on the left return' || E'\n' || 'Kitchen',
    'todo', 'gc', 'fbb00000-0000-4000-8000-0000000000b1',
    'install',
    'fbb00000-0000-4000-8000-000000000001',
    'fbb00000-0000-4000-8000-0000000000f1');

  SELECT * INTO v_task FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d1';

  ASSERT v_task.owner = 'gc', 'FAIL 1a: owner must be gc, got ' || v_task.owner;
  ASSERT v_task.owner_party_id = 'fbb00000-0000-4000-8000-0000000000b1',
    'FAIL 1b: owner_party_id must carry the GC party';
  ASSERT v_task.section_key = 'install',
    'FAIL 1c: section_key must be install, got ' || COALESCE(v_task.section_key, 'NULL');
  ASSERT v_task.status = 'todo',
    'FAIL 1d: a punch item is born todo, got ' || v_task.status;
  ASSERT v_task.field_capture_id = 'fbb00000-0000-4000-8000-0000000000f1',
    'FAIL 1e: field_capture_id must carry the capture';

  -- 2 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_status_ck
    FROM pg_constraint
   WHERE conrelid = 'public.project_tasks'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%''blocked''%';
  ASSERT v_status_ck LIKE '%''todo''%' AND v_status_ck LIKE '%''done''%',
    'FAIL 2a: status CHECK lost a value: ' || COALESCE(v_status_ck, 'NULL');
  ASSERT v_status_ck NOT LIKE '%''draft''%',
    'FAIL 2b: a draft status appeared on project_tasks — FC-R7 exists to avoid one: ' || v_status_ck;

  -- 3 ---------------------------------------------------------------------
  -- By NAME first (00281:158-163 names it project_tasks_owner_check), with a
  -- content fallback. Matching any CHECK on the table that merely mentions
  -- 'gc' would pass on a constraint that has nothing to do with `owner`.
  SELECT pg_get_constraintdef(oid) INTO v_owner_ck
    FROM pg_constraint
   WHERE conrelid = 'public.project_tasks'::regclass
     AND contype = 'c'
     AND conname = 'project_tasks_owner_check';
  IF v_owner_ck IS NULL THEN
    SELECT pg_get_constraintdef(oid) INTO v_owner_ck
      FROM pg_constraint
     WHERE conrelid = 'public.project_tasks'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%(owner)%'
       AND pg_get_constraintdef(oid) LIKE '%''designer''%'
     LIMIT 1;
  END IF;
  ASSERT v_owner_ck IS NOT NULL,
    'FAIL 3a: the project_tasks owner CHECK is gone entirely';
  ASSERT v_owner_ck LIKE '%''gc''%',
    'FAIL 3b: project_tasks.owner no longer admits ''gc'' — FC-R7''s landing is gone: ' || v_owner_ck;

  -- 4 ---------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.project_tasks'::regclass
       AND tgname = 'fc_task_assignment_dispatch'
       AND NOT tgisinternal
  ) INTO v_trigger;
  ASSERT v_trigger,
    'FAIL 4a: fc_task_assignment_dispatch is gone — a punch item would reach no GC';

  SELECT pg_get_functiondef('public.fc_dispatch_task_assignment()'::regprocedure)
    INTO v_fn_src;
  ASSERT v_fn_src LIKE '%sms_consent_status%' AND v_fn_src LIKE '%granted%',
    'FAIL 4b: the dispatch trigger lost its consent gate — the device would be causing an unconsented send';
  ASSERT v_fn_src LIKE '%sms_court_assignment%',
    'FAIL 4c: the dispatch trigger no longer sends sms_court_assignment';
  -- The gate that actually decides the send is the party-kind allow-list. The
  -- trigger reads project_parties.party_kind and sms_consent_status and never
  -- reads project_tasks.owner at all — so `owner` is a label for the portal and
  -- `owner_party_id` is the routing. Pin the list, not just the consent word.
  ASSERT v_fn_src LIKE '%party_kind%',
    'FAIL 4d: the dispatch trigger no longer gates on party_kind — the allow-list is the send decision';

  -- 5 ---------------------------------------------------------------------
  DELETE FROM field_captures WHERE id = 'fbb00000-0000-4000-8000-0000000000f1';
  SELECT field_capture_id INTO v_after FROM project_tasks
   WHERE id = 'fbb00000-0000-4000-8000-0000000000d1';
  ASSERT v_after IS NULL,
    'FAIL 5a: deleting the capture must NULL field_capture_id, not cascade';
  ASSERT EXISTS (SELECT 1 FROM project_tasks WHERE id = 'fbb00000-0000-4000-8000-0000000000d1'),
    'FAIL 5b: the task must survive its capture';

  -- 6 ---------------------------------------------------------------------
  SELECT count(*) INTO v_jsonb FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'project_tasks'
     AND data_type IN ('jsonb', 'json');
  ASSERT v_jsonb = 0,
    'FAIL 6: project_tasks grew a jsonb column — re-open the FK-vs-routing_source decision, got ' || v_jsonb;

  RAISE NOTICE 'project_tasks field-capture back-reference: all 6 cases passed.';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged
scripts/run-sql-tests.sh -f project_task_field_capture_ref
```

Expected: **FAIL** with `ERROR: column "field_capture_id" of relation "project_tasks" does not exist`.

- [ ] **Step 3: Draw the number and place the migration**

Re-run the Task 0.1 census immediately before copying (C6), then:

```bash
NN=<the number you drew from 00530-00535>
cp docs/design/field-companion/plans/sql/005NN_project_task_field_capture_ref.sql \
   supabase/migrations/${NN}_project_task_field_capture_ref.sql
```

Edit `005NN` → the real number in the copied header. Add the ledger row. **Change no SQL.**

- [ ] **Step 4: Apply and run green**

```bash
cd /Users/kody/Code/patina-merged
pnpm supabase:reset
scripts/run-sql-tests.sh -f project_task_field_capture_ref
scripts/run-sql-tests.sh
```

Expected: PASS with `NOTICE: project_tasks field-capture back-reference: all 6 cases passed.`; full suite exits 0 with the 22 known failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00<NN>_project_task_field_capture_ref.sql \
        supabase/tests/field/project_task_field_capture_ref_test.sql \
        docs/engineering/migration-number-reservations.md
git commit -m "feat(db): a punch item points back at the photo it was taken from"
```

---

### Task 8 — The time-entry migration

**Model:** Haiku. One CHECK, one test, authored SQL.

**Files:**
- Create: `supabase/tests/field/time_entry_field_visit_source_test.sql`
- Copy (authored, complete): `docs/design/field-companion/plans/sql/005NN_time_entry_field_visit_source.sql` → `supabase/migrations/00<NN>_time_entry_field_visit_source.sql`

**Interfaces:**
- Consumes: `project_time_entries` as `00177`/`00198`/`00412` leave it.
- Produces: `project_time_entries_source_ck CHECK (source IN ('timer_auto','timer_manual','manual_entry','field_visit'))` — a **named** constraint replacing 00198's unnamed inline one, resolved from `pg_constraint` by content rather than by a guessed name. Task 16 writes `source='field_visit'`.
- Unchanged and relied upon: `activity` already admits `'site_visit'` (`00198:27-29`); `uniq_project_time_entries_running_timer` (`00177:39-41`) still forbids a second `duration_minutes IS NULL` row per user.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/field/time_entry_field_visit_source_test.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- project_time_entries.source gains 'field_visit'
-- (the time-entry migration — 005NN_time_entry_field_visit_source.sql, §9.5)
--
-- V4 (the visit review) offers, on one tap, a COMPLETED time entry for the
-- visit she just closed. §9.6 and Flow 7 both say the same thing twice:
-- NEVER a running timer.
--
-- 1. THE OFFER LANDS   → source='field_visit', activity='site_visit',
--                        duration_minutes > 0 inserts cleanly.
-- 2. THE OLD THREE     → timer_auto / timer_manual / manual_entry still insert.
--    STILL WORK           A widening that narrowed something else is a
--                         regression, not a widening.
-- 3. GARBAGE STILL     → an unknown source still raises. The CHECK was
--    RAISES               replaced, not dropped.
-- 4. ACTIVITY UNTOUCHED→ 'site_visit' was already admitted (00198:27-29) and
--                        nothing here widened activity.
-- 5. NEVER A RUNNING   → uniq_project_time_entries_running_timer (00177:39-41)
--    TIMER                still bites: a second duration_minutes IS NULL row
--                         for one user raises 23505. That index belongs to the
--                         portal's TimerButton and V4 must never take its slot.
--
-- How to run:
--   scripts/run-sql-tests.sh -f time_entry_field_visit_source
-- and the FULL suite for the wave report (22 documented known failures).
--
-- ⚠ Runs as `postgres` (superuser) — RLS bypassed. Nothing here is evidence
-- about the four "Team can …" policies or the studio-co-member set.
--
-- Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbc00000-0000-4000-8000-000000000001', 'fbc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbc00000-0000-4000-8000-000000000001', 'fbc-designer@test.invalid', 'FBC Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'FBC Maple St',
        'fbc00000-0000-4000-8000-000000000001', 'fbc00000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_row       RECORD;
  v_raised    BOOLEAN;
  v_activity  TEXT;
BEGIN
  -- 1 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    source, activity, billable, notes)
  VALUES (
    'fbc00000-0000-4000-8000-0000000000e1',
    'fbc00000-0000-4000-8000-0000000000a1',
    'fbc00000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '130 minutes', 130,
    'field_visit', 'site_visit', true, 'Maple St · Living, Dining');

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fbc00000-0000-4000-8000-0000000000e1';
  ASSERT v_row.source = 'field_visit',
    'FAIL 1a: source must be field_visit, got ' || v_row.source;
  ASSERT v_row.activity = 'site_visit',
    'FAIL 1b: activity must be site_visit, got ' || COALESCE(v_row.activity, 'NULL');
  ASSERT v_row.duration_minutes = 130,
    'FAIL 1c: a field_visit entry is COMPLETED — duration_minutes must be set';

  -- 2 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
  VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'timer_auto'),
         ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'timer_manual'),
         ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'manual_entry');

  -- 3 ---------------------------------------------------------------------
  v_raised := false;
  BEGIN
    INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
    VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'field_note');
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL 3: an unknown source no longer raises — the CHECK was dropped, not replaced';

  -- 4 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_activity
    FROM pg_constraint
   WHERE conrelid = 'public.project_time_entries'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%site_visit%';
  ASSERT v_activity LIKE '%''design''%' AND v_activity LIKE '%''admin''%',
    'FAIL 4: the activity CHECK changed — this migration must not touch it: ' ||
    COALESCE(v_activity, 'NULL');

  -- 5 ---------------------------------------------------------------------
  ASSERT to_regclass('public.uniq_project_time_entries_running_timer') IS NOT NULL,
    'FAIL 5a: the one-running-timer-per-user index is gone';

  INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
  VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', NULL, 'timer_manual');

  v_raised := false;
  BEGIN
    INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
    VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', NULL, 'field_visit');
  EXCEPTION WHEN unique_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL 5b: a second running timer inserted — V4 could steal the desk timer''s slot';

  RAISE NOTICE 'time_entry field_visit source: all 5 cases passed.';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged
scripts/run-sql-tests.sh -f time_entry_field_visit_source
```

Expected: **FAIL** with `ERROR: new row for relation "project_time_entries" violates check constraint "project_time_entries_source_check"` on the very first insert.

- [ ] **Step 3: Draw the number and place the migration**

Re-run the Task 0.1 census immediately before copying (C6), then:

```bash
NN=<the number you drew from 00530-00535>
cp docs/design/field-companion/plans/sql/005NN_time_entry_field_visit_source.sql \
   supabase/migrations/${NN}_time_entry_field_visit_source.sql
```

Edit `005NN` → the real number. Add the ledger row. **Change no SQL** — in particular, do not replace the catalog-resolving `DO $widen_source$` block with a hardcoded `DROP CONSTRAINT project_time_entries_source_check`. That name is Postgres-generated, appears in no migration in this repo, and has never been verified against the prod catalog.

- [ ] **Step 4: Apply and run green**

```bash
cd /Users/kody/Code/patina-merged
pnpm supabase:reset
scripts/run-sql-tests.sh -f time_entry_field_visit_source
scripts/run-sql-tests.sh
```

Expected: PASS with `NOTICE: time_entry field_visit source: all 5 cases passed.`; full suite exits 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00<NN>_time_entry_field_visit_source.sql \
        supabase/tests/field/time_entry_field_visit_source_test.sql \
        docs/engineering/migration-number-reservations.md
git commit -m "feat(db): a site visit can be logged as the hours it took"
```

---

### Task 9 — CaptureKit: the margin-note lane on the capture outbox

**Model:** Opus. This is the first half of FC-R4's divergence from the house pattern, and the idempotency has to be right the first time.

**Files:**
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift`
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/MarginNoteWrite.swift`
- Create: `apps/mobile/Capture/CaptureTests/MarginNoteWriteTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift` (five additive optional properties)
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift` (the lane's accessors, mirroring `// MARK: - Project placement`)
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift:443` (the outbox predicate)

**Interfaces:**
- Consumes: `Specimen.remoteId` (the committed `field_captures.id`), `Specimen.voiceTranscript` / `.voicePartialTranscript`, `Specimen.venue.projectId`, `CaptureStatus.committed`.
- Produces:

```swift
public enum FieldWriteState: String, Codable, Sendable {
    case pending, writing, written, failed, refused
}

public enum FieldWriteOutcome: Equatable, Sendable {
    case written
    case alreadyWritten          // 23505 on the client-minted id — a replay
    case deferred(String)        // no signal, no session — stay pending, no penalty
    case refused(String)         // 42501 — never retried; the caller degrades
    case failed(String)
}

public enum FieldWriteClassifier {
    public static func outcome(code: String?, message: String) -> FieldWriteOutcome
}

public struct MarginNoteWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let designerID: UUID
    public let body: String
    public let anchorKind: String      // always "letterhead"
    public let fieldCaptureID: UUID
}

public enum MarginNoteComposer {
    public static func request(noteID: UUID, projectID: UUID, designerID: UUID,
                               fieldCaptureID: UUID, transcript: String?) -> MarginNoteWriteRequest?
    /// FC-R8's degrade body (ruling 3) — title, context, then the plain reason.
    public static func refusedTaskBody(title: String, context: String?) -> String
}

public protocol MarginNoteGateway: Sendable {
    func existingMarginNote(id: UUID) async throws -> Bool
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws
}

public struct MarginNoteOrchestrator: Sendable {
    public init(gateway: any MarginNoteGateway)
    public func write(_ request: MarginNoteWriteRequest) async throws -> FieldWriteOutcome
}

// Specimen, additive:
public var marginNoteId: String?
public var marginNoteBodyRaw: String?     // set only by FC-R8's degrade
public var marginNoteStateRaw: String?
public var marginNoteLastError: String?
public var marginNoteRetryCount: Int?

// Specimen+Accessors, mirroring the placement lane exactly:
var marginNoteState: FieldWriteState? { get set }
var needsMarginNote: Bool { get }
func requestMarginNote(noteID: UUID, body: String? = nil)
func markMarginNotePending()
func markMarginNoteStarted()
func markMarginNoteWritten()
func markMarginNoteFailed(_ message: String)
func markMarginNoteRefused(_ message: String)
func clearMarginNote()
```

Task 10 reuses `FieldWriteState`, `FieldWriteOutcome` and `FieldWriteClassifier` verbatim. Task 11 calls `MarginNoteOrchestrator`. Task 12 calls `requestMarginNote`.

**Why a lane on `Specimen` and not a second queue.** FC-R4 says *"through the existing outbox, not a second queue."* The existing outbox **is** `Specimen` — `CaptureStore.outbox()` is a filtered fetch over it, and there is no `OutboxItem` type. `ProjectPlacementOrchestrator` already proves the shape for a second write that must happen *after* the capture commits and must survive a lost response: four `placement*` columns on `Specimen`, a state enum, a pure request/gateway/orchestrator triple in `CaptureKit/Sync/`, lookup-before-write, and a call from `performProjectPlacementIfNeeded` inside the drain. This is that, twice.

**The idempotency key is the note's own id.** `margin_notes.id` defaults to `gen_random_uuid()`, and the device supplies it instead — so a replay after a lost response is a primary-key collision (23505), which the orchestrator reads as *already written*. Lookup-before-write closes the same gap one round-trip earlier, exactly as `existingPlacement(for:)` does.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/MarginNoteWriteTests.swift`:

```swift
//  MarginNoteWriteTests.swift
//  CaptureTests
//
//  FC-R4 lets the phone write margin_notes directly, on the existing capture
//  outbox, with a client-minted id as the idempotency key. margin_notes.body
//  is NOT NULL (00196:25-41) and margin_notes_designer_all is
//  `for all to authenticated using (designer_id = auth.uid())` (00196:51-54),
//  so the two things that can go wrong are an empty body and someone else's
//  designer_id. Both are pinned here.

import Foundation
import Testing
@testable import CaptureKit

struct MarginNoteWriteTests {
    private let noteID = UUID(uuidString: "a1111111-1111-4111-8111-111111111111")!
    private let projectID = UUID(uuidString: "a2222222-2222-4222-8222-222222222222")!
    private let designerID = UUID(uuidString: "a3333333-3333-4333-8333-333333333333")!
    private let captureID = UUID(uuidString: "a4444444-4444-4444-8444-444444444444")!

    // MARK: - The wire shape

    @Test func requestEncodesTheExactMarginNotesColumnNames() throws {
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return"))

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["id"] as? String == noteID.uuidString)
        #expect(json["project_id"] as? String == projectID.uuidString)
        #expect(json["designer_id"] as? String == designerID.uuidString)
        #expect(json["field_capture_id"] as? String == captureID.uuidString)
        #expect(json["anchor_kind"] as? String == "letterhead")
        #expect(json["body"] as? String == "the base cabinet scribe is short on the left return")
        #expect(json.count == 6)
    }

    @Test func anchorKindIsAlwaysLetterheadBecauseTheCheckAdmitsNothingElse() throws {
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "anything"))
        #expect(request.anchorKind == "letterhead")
    }

    @Test func anEmptyTranscriptProducesNoRequestAtAll() {
        #expect(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: nil) == nil)
        #expect(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "   \n  ") == nil)
    }

    @Test func theBodyIsTrimmedButNeverTruncated() throws {
        let long = String(repeating: "the alcove reads forty-two and three quarters. ", count: 40)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "  \(long)  "))
        #expect(request.body == long.trimmingCharacters(in: .whitespacesAndNewlines))
        #expect(request.body.count > 80)
    }

    // MARK: - Failure classification

    @Test func rowLevelSecurityIsRefusedAndNeverRetried() {
        #expect(FieldWriteClassifier.outcome(code: "42501", message: "permission denied")
                == .refused("permission denied"))
        #expect(FieldWriteClassifier.outcome(
            code: nil,
            message: "new row violates row-level security policy for table \"project_tasks\"")
                == .refused("new row violates row-level security policy for table \"project_tasks\""))
    }

    @Test func aDuplicateKeyIsAReplayAndCountsAsWritten() {
        #expect(FieldWriteClassifier.outcome(code: "23505", message: "duplicate key")
                == .alreadyWritten)
    }

    @Test func offlineDefersWithoutSpendingARetry() {
        #expect(FieldWriteClassifier.outcome(code: nil, message: "The Internet connection appears to be offline.")
                == .deferred("The Internet connection appears to be offline."))
        #expect(FieldWriteClassifier.outcome(code: "PGRST301", message: "JWT expired")
                == .deferred("JWT expired"))
    }

    @Test func anythingElseIsAPlainFailure() {
        #expect(FieldWriteClassifier.outcome(code: "23503", message: "insert or update violates foreign key")
                == .failed("insert or update violates foreign key"))
    }

    // MARK: - Lookup before write

    @Test func aReplayFindsTheExistingNoteBeforeWritingAgain() async throws {
        let gateway = SpyMarginNoteGateway(exists: true)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "spoken"))

        let outcome = try await MarginNoteOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .alreadyWritten)
        #expect(gateway.insertCount == 0)
    }

    @Test func aFirstAttemptInsertsExactlyOnce() async throws {
        let gateway = SpyMarginNoteGateway(exists: false)
        let request = try #require(MarginNoteComposer.request(
            noteID: noteID, projectID: projectID, designerID: designerID,
            fieldCaptureID: captureID, transcript: "spoken"))

        let outcome = try await MarginNoteOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .written)
        #expect(gateway.insertCount == 1)
    }

    // MARK: - The lane on the outbox record

    @Test func aSpecimenWithNoNoteRequestNeedsNothing() {
        let specimen = Specimen()
        #expect(specimen.needsMarginNote == false)
    }

    @Test func requestingANoteOpensTheLaneAndClearsAnyPriorFailure() {
        let specimen = Specimen()
        specimen.markMarginNoteFailed("earlier")
        specimen.requestMarginNote(noteID: noteID)

        #expect(specimen.marginNoteId == noteID.uuidString)
        #expect(specimen.marginNoteState == .pending)
        #expect(specimen.marginNoteLastError == nil)
        #expect(specimen.marginNoteRetryCount == 0)
        #expect(specimen.needsMarginNote)
    }

    @Test func aWrittenNoteClosesTheLane() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteWritten()

        #expect(specimen.marginNoteState == .written)
        #expect(specimen.needsMarginNote == false)
    }

    @Test func aRefusedNoteClosesTheLaneToo_soTheDrainStopsInsteadOfLooping() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteRefused("permission denied")

        #expect(specimen.marginNoteState == .refused)
        #expect(specimen.marginNoteLastError == "permission denied")
        #expect(specimen.needsMarginNote == false)
    }

    @Test func aFailedNoteStaysInTheLaneAndCountsTheAttempt() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteFailed("boom")
        specimen.markMarginNoteFailed("boom again")

        #expect(specimen.marginNoteState == .failed)
        #expect(specimen.marginNoteRetryCount == 2)
        #expect(specimen.needsMarginNote)
    }

    // MARK: - The automatic lane (ruling 1) and the degrade's body (ruling 3)

    @Test func requestingAnOpenLaneTwiceKeepsTheFirstId() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.requestMarginNote(noteID: UUID())

        #expect(specimen.marginNoteId == noteID.uuidString)
    }

    @Test func aWrittenLaneIsFreeAgain_soTheDegradeCanStillFileItsWords() {
        let specimen = Specimen()
        specimen.requestMarginNote(noteID: noteID)
        specimen.markMarginNoteWritten()

        let second = UUID()
        specimen.requestMarginNote(noteID: second, body: "Scribe short\nCouldn't assign — you're not this project's owner.")

        #expect(specimen.marginNoteId == second.uuidString)
        #expect(specimen.marginNoteState == .pending)
        #expect(specimen.needsMarginNote)
    }

    @Test func aDegradeBodyCarriesTheTaskThenTheContextThenTheReason() {
        #expect(MarginNoteComposer.refusedTaskBody(
            title: "The base cabinet scribe is short.",
            context: "the base cabinet scribe is short on the left return\nKitchen")
            == """
            The base cabinet scribe is short.
            the base cabinet scribe is short on the left return
            Kitchen
            Couldn't assign — you're not this project's owner.
            """)
    }

    @Test func aDegradeBodyNeverRepeatsItselfAndAlwaysStatesTheReason() {
        #expect(MarginNoteComposer.refusedTaskBody(title: "Order the runner", context: "Order the runner")
                == "Order the runner\nCouldn't assign — you're not this project's owner.")
        #expect(MarginNoteComposer.refusedTaskBody(title: "Order the runner", context: nil)
                == "Order the runner\nCouldn't assign — you're not this project's owner.")
        #expect(MarginNoteComposer.refusedTaskBody(title: "", context: "   ")
                == "Couldn't assign — you're not this project's owner.")
    }

    @Test func aDegradeBodyIsPersistedOnTheLaneSoItSurvivesARelaunch() {
        let specimen = Specimen()
        let body = MarginNoteComposer.refusedTaskBody(title: "Scribe short", context: nil)
        specimen.requestMarginNote(noteID: noteID, body: body)

        #expect(specimen.marginNoteBodyRaw == body)
        #expect(specimen.needsMarginNote)
    }
}

private final class SpyMarginNoteGateway: MarginNoteGateway, @unchecked Sendable {
    private let exists: Bool
    private(set) var insertCount = 0

    init(exists: Bool) { self.exists = exists }

    func existingMarginNote(id: UUID) async throws -> Bool { exists }
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws { insertCount += 1 }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/MarginNoteWriteTests -quiet
```

Expected: **compile failure** — `cannot find 'MarginNoteComposer' in scope`, `cannot find 'FieldWriteClassifier' in scope`, `value of type 'Specimen' has no member 'needsMarginNote'`.

- [ ] **Step 3: Write the shared lane state**

Create `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift`:

```swift
//  FieldWriteState.swift
//  CaptureKit
//
//  Shared state for the post-commit write lanes FC-R4 opened: a margin note
//  and a project task, both written by the designer's own phone, both riding
//  the existing capture outbox rather than a second queue.
//
//  `refused` is the one state that matters and the one the placement lane has
//  no equivalent for. project_tasks' only INSERT-capable policy is
//  "Designers manage their project tasks" (00169:61-62), a FOR ALL policy with
//  no explicit WITH CHECK — so Postgres reuses its USING clause,
//  `projects.designer_id = auth.uid()`, and a studio co-member gets 42501.
//  FC-R8 rules that per-designer, so 42501 is a FACT about this designer and
//  this project, not a transient error: retrying it forever would be a lie.
//  The lane closes and the caller degrades honestly.

import Foundation

public enum FieldWriteState: String, Codable, Sendable {
    case pending
    case writing
    case written
    case failed
    case refused
}

public enum FieldWriteOutcome: Equatable, Sendable {
    case written
    case alreadyWritten
    case deferred(String)
    case refused(String)
    case failed(String)
}

public enum FieldWriteClassifier {
    /// PostgREST surfaces the SQLSTATE as `code`; the SDK sometimes only gives
    /// a message. Both paths must reach the same verdict.
    public static func outcome(code: String?, message: String) -> FieldWriteOutcome {
        let lowered = message.lowercased()

        if code == "42501" || lowered.contains("row-level security")
            || lowered.contains("permission denied") {
            return .refused(message)
        }
        if code == "23505" || lowered.contains("duplicate key") {
            return .alreadyWritten
        }
        if code == "PGRST301"
            || lowered.contains("offline")
            || lowered.contains("jwt")
            || lowered.contains("network connection was lost")
            || lowered.contains("could not connect") {
            return .deferred(message)
        }
        return .failed(message)
    }
}
```

- [ ] **Step 4: Write the margin-note contract**

Create `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/MarginNoteWrite.swift`:

```swift
//  MarginNoteWrite.swift
//  CaptureKit
//
//  Pure-Swift contract for promoting a field note into the Document's margin
//  (§9.4, FC-R4). The app-side Supabase gateway owns the SDK call; this file
//  owns the column names, the composition rule and the replay-safe orchestration.
//
//  A note spoken inside a PLACED visit files itself: §6 Flow 2 step 4 is
//  binding (orchestrator ruling, 2026-08-24), and §11.4's "only the notes she
//  promoted" alternative is overruled. There is no tap. A deliberate act is
//  required only for filing an UNPLACED note from Today (FC-R6) — and that case
//  is enforced here by construction, because `request` needs a projectID and an
//  unplaced capture has none.
//
//  Idempotency is the whole reason this is safe to do automatically: the id is
//  minted once on the phone and persisted, so a second drain finds it already
//  set, re-uses it, and the gateway's lookup-before-write turns the replay into
//  `.alreadyWritten`.

import Foundation

public struct MarginNoteWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let designerID: UUID
    public let body: String
    public let anchorKind: String
    public let fieldCaptureID: UUID

    public init(
        id: UUID,
        projectID: UUID,
        designerID: UUID,
        body: String,
        anchorKind: String = "letterhead",
        fieldCaptureID: UUID
    ) {
        self.id = id
        self.projectID = projectID
        self.designerID = designerID
        self.body = body
        self.anchorKind = anchorKind
        self.fieldCaptureID = fieldCaptureID
    }

    enum CodingKeys: String, CodingKey {
        case id
        case body
        case projectID = "project_id"
        case designerID = "designer_id"
        case anchorKind = "anchor_kind"
        case fieldCaptureID = "field_capture_id"
    }
}

public enum MarginNoteComposer {
    /// Returns nil when there are no words to file. `margin_notes.body` is
    /// NOT NULL (00196:30) and a blank note in the margin is worse than none.
    /// The body is trimmed and NEVER truncated — the whole point of §9.4 is
    /// that the Document stops receiving the first eighty characters.
    public static func request(
        noteID: UUID,
        projectID: UUID,
        designerID: UUID,
        fieldCaptureID: UUID,
        transcript: String?
    ) -> MarginNoteWriteRequest? {
        let body = (transcript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }

        return MarginNoteWriteRequest(
            id: noteID,
            projectID: projectID,
            designerID: designerID,
            body: body,
            fieldCaptureID: fieldCaptureID)
    }

    /// FC-R8's degrade, composed here so the drain has something real to write
    /// (orchestrator ruling 3, 2026-08-24). A studio co-member's punch/task
    /// INSERT takes 42501 and is terminal; the item becomes her own margin
    /// note — which margin_notes_designer_all DOES admit, because that policy
    /// keys on the note's designer_id, not the project's.
    ///
    /// The body is the task as she wrote it, then its context, then one plain
    /// line saying why it did not become a task. No mechanism talk, no code.
    public static func refusedTaskBody(title: String, context: String?) -> String {
        let head = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let ctx = (context ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        var lines: [String] = []
        if !head.isEmpty { lines.append(head) }
        if !ctx.isEmpty, ctx != head { lines.append(ctx) }
        lines.append("Couldn't assign — you're not this project's owner.")
        return lines.joined(separator: "\n")
    }
}

public protocol MarginNoteGateway: Sendable {
    /// True when a note with this client-minted id already landed. Closes the
    /// response-loss gap one round-trip before the primary key does.
    func existingMarginNote(id: UUID) async throws -> Bool
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws
}

public struct MarginNoteOrchestrator: Sendable {
    private let gateway: any MarginNoteGateway

    public init(gateway: any MarginNoteGateway) {
        self.gateway = gateway
    }

    public func write(_ request: MarginNoteWriteRequest) async throws -> FieldWriteOutcome {
        if try await gateway.existingMarginNote(id: request.id) {
            return .alreadyWritten
        }
        try await gateway.insertMarginNote(request)
        return .written
    }
}
```

- [ ] **Step 5: Add the lane to `Specimen` and the outbox**

In `Specimen.swift`, after the `placement*` block, add five additive optionals (additive optionals migrate lightweight; there is no `VersionedSchema` in Field and none is needed — Patina Field is not live and no backward compatibility is owed):

```swift
    // ── Margin-note lane (wave 4, FC-R4) — a post-commit write, exactly the
    //    shape of the placement lane above. marginNoteId is the client-minted
    //    margin_notes.id AND the idempotency key.
    //
    //    marginNoteBodyRaw is set ONLY by the FC-R8 degrade (ruling 3): the
    //    ordinary note's body is the transcript and is composed at drain time,
    //    but a refused task's body is the task's own words plus the reason, and
    //    that has to survive the relaunch between the refusal and the write.
    public var marginNoteId: String?
    public var marginNoteBodyRaw: String?
    public var marginNoteStateRaw: String?
    public var marginNoteLastError: String?
    public var marginNoteRetryCount: Int?
```

In `Specimen+Accessors.swift`, after `// MARK: - Project placement`, add:

```swift
    // MARK: - Margin-note lane (wave 4)

    var marginNoteState: FieldWriteState? {
        get { marginNoteStateRaw.flatMap(FieldWriteState.init(rawValue:)) }
        set { marginNoteStateRaw = newValue?.rawValue }
    }

    /// `.refused` closes the lane as firmly as `.written`: a 42501 is a fact
    /// about who owns this project, not a transient error (FC-R8).
    var needsMarginNote: Bool {
        guard marginNoteId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return marginNoteState != .written && marginNoteState != .refused
    }

    /// `body: nil` means "compose it from the transcript at drain time" — the
    /// ordinary case, including the automatic in-visit note (ruling 1). A body
    /// is passed only by FC-R8's degrade (ruling 3), which has words of its own.
    ///
    /// Re-requesting an OPEN lane is a no-op on the id: the id is the
    /// idempotency key, and re-minting it mid-flight would write the note
    /// twice. A lane whose note has already landed is FREE, and re-requesting
    /// it starts a second note — which is how FC-R8's degrade (ruling 3) still
    /// files its words on a capture that already auto-filed its transcript.
    /// The degrade passes a deterministic id (the refused task's own UUID), so
    /// that second note is replay-safe exactly like the first.
    func requestMarginNote(noteID: UUID, body: String? = nil) {
        guard marginNoteId == nil || marginNoteState == .written else { return }
        marginNoteId = noteID.uuidString
        marginNoteBodyRaw = body
        marginNoteState = .pending
        marginNoteLastError = nil
        marginNoteRetryCount = 0
        touch()
    }

    func markMarginNotePending() {
        guard marginNoteId != nil else { return }
        marginNoteState = .pending
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteStarted() {
        guard marginNoteId != nil else { return }
        marginNoteState = .writing
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteWritten() {
        guard marginNoteId != nil else { return }
        marginNoteState = .written
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteFailed(_ message: String) {
        marginNoteState = .failed
        marginNoteLastError = message
        marginNoteRetryCount = (marginNoteRetryCount ?? 0) + 1
        touch()
    }

    func markMarginNoteRefused(_ message: String) {
        marginNoteState = .refused
        marginNoteLastError = message
        touch()
    }

    func clearMarginNote() {
        marginNoteId = nil
        marginNoteBodyRaw = nil
        marginNoteState = nil
        marginNoteLastError = nil
        marginNoteRetryCount = nil
        touch()
    }
```

In `CaptureStore.swift`, inside `outbox()`'s `records.filter`, add one line beside the placement check so a committed specimen stays in the outbox while its note is still owed:

```swift
            if $0.needsProjectPlacement { return true }
            if $0.needsMarginNote { return true }
```

- [ ] **Step 6: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (the 20 new `MarginNoteWriteTests` cases among them), `✔ lint`. ⚠ `capture-gate.sh lint` exits 0 without swiftlint installed — the explicit `swiftlint --strict` above is the real lint signal, and both must be reported.

- [ ] **Step 7: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Sync/MarginNoteWrite.swift \
        apps/mobile/Capture/CaptureTests/MarginNoteWriteTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): a margin-note lane on the capture outbox, replay-safe by its own id"
```

---

### Task 10 — CaptureKit: the task lane, and which court a punch item lands in

**Model:** Opus. FC-R7's landing lives or dies on this file getting the party rule right.

**Files:**
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift`
- Create: `apps/mobile/Capture/CaptureTests/PunchTaskWriteTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift` (six additive optional properties for the punch lane)
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift:443` (one more line in the outbox predicate)

**Interfaces:**
- Consumes: `FieldWriteState`, `FieldWriteOutcome`, `FieldWriteClassifier` (Task 9).
- Produces:

```swift
public struct FieldPartyRef: Codable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let partyKind: String        // project_parties.party_kind
    public let smsConsentGranted: Bool
}

public enum PunchCourt: Equatable, Sendable {
    case reachable(FieldPartyRef)   // a GC with texting on → the DB texts him
    case noCourt                    // no such GC → it stays her task
}

public enum PunchCourtResolver {
    /// The trigger's own allow-list (00284:174), kept as documentation and
    /// pinned by a test — NOT as the resolver's filter. See below.
    public static let dispatchableKinds: Set<String> = ["gc", "sub", "installer", "receiver"]
    public static let punchCourtKind = "gc"
    public static func resolve(parties: [FieldPartyRef]) -> PunchCourt
}

public struct PunchTaskWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let title: String
    public let description: String
    public let status: String        // always "todo"
    public let owner: String         // "designer" | "gc"
    public let ownerPartyID: String?
    public let sectionKey: String?   // "install" for a punch, nil for a task
    public let createdBy: UUID
    public let fieldCaptureID: UUID
}

public enum PunchTaskComposer {
    public static func title(from transcript: String?) -> String
    public static func task(id: UUID, projectID: UUID, createdBy: UUID,
                            fieldCaptureID: UUID, transcript: String?,
                            roomName: String?) -> PunchTaskWriteRequest
    public static func punch(id: UUID, projectID: UUID, createdBy: UUID,
                             fieldCaptureID: UUID, transcript: String?,
                             roomName: String?, courtPartyID: String) -> PunchTaskWriteRequest
}

public protocol PunchTaskGateway: Sendable {
    func existingProjectTask(id: UUID) async throws -> Bool
    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws
}

public struct PunchTaskOrchestrator: Sendable {
    public init(gateway: any PunchTaskGateway)
    public func write(_ request: PunchTaskWriteRequest) async throws -> FieldWriteOutcome
}

// Specimen, additive:
public var punchTaskId: String?
public var punchTaskPartyId: String?
public var punchTaskOwnerRaw: String?
public var punchTaskStateRaw: String?
public var punchTaskLastError: String?
public var punchTaskRetryCount: Int?

// Specimen+Accessors:
var punchTaskState: FieldWriteState? { get set }
var needsPunchTask: Bool { get }
func requestPunchTask(taskID: UUID, owner: String, partyID: String?)
func markPunchTaskPending() / Started() / Written() / Failed(_:) / Refused(_:)
func clearPunchTask()
```

Task 11 calls `PunchTaskOrchestrator`. Task 12 calls `PunchCourtResolver.resolve` and `requestPunchTask`.

**⚠ The court rule, ruled rather than inferred (ruling 2, FC-R7's open `court_party_id` question).**
FC-R7's ratified wording is *"a `project_tasks` row **owned by the GC**"*, and this resolver is
narrowed to exactly that: **`party_kind == "gc"` AND `smsConsentGranted`**. Nothing else resolves.

- Filtering on the trigger's four dispatchable kinds and taking the first consented candidate in
  **array order** would text a plumber on a project that has both — an external send to a party she
  never named, decided by result ordering. That is the failure this narrowing exists to make
  impossible.
- With the filter narrowed, `owner: "gc"` on the wire is **exactly** true rather than approximately
  true, and `project_tasks.owner` (which the trigger never reads) stops disagreeing with
  `owner_party_id` (which it does).
- `dispatchableKinds` survives as the documented mirror of `00284:174` and as the thing a test pins,
  so the day someone widens the court they widen it deliberately.
- **`.noCourt` is not a GC-shaped orphan.** A row with `owner='gc'` and `owner_party_id = NULL` is
  invisible twice over — the trigger returns early (`00284:161`) and `field-daily/core.ts:177-181`
  filters `.eq("owner_party_id", party.id)`, so it reaches no digest either. So when there is no
  reachable GC the verb writes **her own task** (`PunchTaskComposer.task`, `owner='designer'`) and
  says so. That is why `punch(courtPartyID:)` takes a **non-optional** id: a punch with no party is
  not a punch.
- **No party picker this wave.** FC-R7 offered *"carry `court_party_id`, or state that a Field punch
  is court-level only"*; ruling 2 states it: **GC-court-only in v1, party attached at the desk. A
  picker for subs and installers is owed.**

**⚠ The room debt, restated so this file does not invent a column.** `project_tasks` has **no** room column and Task 7's migration deliberately does not add one. The room travels in `description`, on its own line under the transcript. Adding `room_id` would be a schema decision about the `project_rooms` / `public.rooms` split (FC-R5) taken under a wave-4 deadline.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/PunchTaskWriteTests.swift`:

```swift
//  PunchTaskWriteTests.swift
//  CaptureTests
//
//  FC-R7: a Field punch item is a project_tasks row owned by the GC, riding
//  the party-anchored SMS rail — never a client_decisions row. The device
//  writes the row and sends NOTHING; fc_dispatch_task_assignment
//  (00284:160-203, trigger 00284:207-210) decides whether a text goes out, and
//  it returns early unless the party's kind is one of
//  ('gc','sub','installer','receiver') AND its sms_consent_status is 'granted'.
//
//  PunchCourtResolver is NARROWER than that gate on purpose (ruling 2): GC with
//  texting on, or nobody. The trigger would happily text a consented plumber,
//  and picking one out of the four kinds by array order would send to a party
//  she never named. So the app promises a send only where FC-R7 says the punch
//  belongs, and files the item as her own task everywhere else.

import Foundation
import Testing
@testable import CaptureKit

struct PunchTaskWriteTests {
    private let taskID = UUID(uuidString: "b1111111-1111-4111-8111-111111111111")!
    private let projectID = UUID(uuidString: "b2222222-2222-4222-8222-222222222222")!
    private let designerID = UUID(uuidString: "b3333333-3333-4333-8333-333333333333")!
    private let captureID = UUID(uuidString: "b4444444-4444-4444-8444-444444444444")!

    private let consentedGC = FieldPartyRef(
        id: "party-gc", displayName: "Delaney Build Co",
        partyKind: "gc", smsConsentGranted: true)
    private let silentGC = FieldPartyRef(
        id: "party-gc2", displayName: "Halloran & Sons",
        partyKind: "gc", smsConsentGranted: false)
    private let client = FieldPartyRef(
        id: "party-client", displayName: "The Ellsworths",
        partyKind: "client_rep", smsConsentGranted: true)

    // MARK: - Which court

    @Test func noPartiesMeansNoCourt() {
        #expect(PunchCourtResolver.resolve(parties: []) == .noCourt)
    }

    @Test func aClientRepIsNeverACourtForAPunchItem() {
        #expect(PunchCourtResolver.resolve(parties: [client]) == .noCourt)
    }

    @Test func aConsentedGeneralContractorIsReachable() {
        #expect(PunchCourtResolver.resolve(parties: [consentedGC]) == .reachable(consentedGC))
    }

    @Test func aGeneralContractorWhoHasNotAgreedToTextsIsNoCourtAtAll() {
        // Ruling 2: a gc-owned row with a null owner_party_id reaches neither
        // the trigger nor the daily digest, so "filed for him" would be a lie.
        #expect(PunchCourtResolver.resolve(parties: [silentGC]) == .noCourt)
    }

    @Test func aConsentedGeneralContractorWinsOverASilentOne() {
        #expect(PunchCourtResolver.resolve(parties: [silentGC, consentedGC])
                == .reachable(consentedGC))
    }

    @Test func aConsentedSubIsNotACourt_becauseArrayOrderMustNotPickTheTrade() {
        let plumber = FieldPartyRef(
            id: "party-sub", displayName: "Chen Plumbing",
            partyKind: "sub", smsConsentGranted: true)
        // The plumber is FIRST and consented, and the trigger would happily
        // text him. FC-R7 says a Field punch is the GC's court, so he loses.
        #expect(PunchCourtResolver.resolve(parties: [plumber, consentedGC])
                == .reachable(consentedGC))
        #expect(PunchCourtResolver.resolve(parties: [plumber]) == .noCourt)
    }

    @Test func theDispatchableKindsStillMirrorTheTriggerExactly() {
        // Documentation of 00284:174, not the resolver's filter. If someone
        // widens the court later, this is the line they have to look at.
        #expect(PunchCourtResolver.dispatchableKinds == ["gc", "sub", "installer", "receiver"])
        #expect(PunchCourtResolver.punchCourtKind == "gc")
    }

    // MARK: - The wire shape

    @Test func aPunchEncodesTheExactProjectTasksColumnNames() throws {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return",
            roomName: "Kitchen",
            courtPartyID: consentedGC.id)

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["id"] as? String == taskID.uuidString)
        #expect(json["project_id"] as? String == projectID.uuidString)
        #expect(json["created_by"] as? String == designerID.uuidString)
        #expect(json["field_capture_id"] as? String == captureID.uuidString)
        #expect(json["status"] as? String == "todo")
        #expect(json["owner"] as? String == "gc")
        #expect(json["owner_party_id"] as? String == "party-gc")
        #expect(json["section_key"] as? String == "install")
        #expect(json["title"] as? String == "The base cabinet scribe is short on the left return")
        #expect(json.count == 10)
    }

    @Test func aPunchAlwaysCarriesAPartyBecauseAPartylessPunchIsInvisible() throws {
        // There is no `.noCourt` punch to compose: punch(courtPartyID:) takes a
        // non-optional id. With no reachable GC the verb calls task() instead
        // (ruling 2), which this test pins by shape.
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "scribe short",
            roomName: nil, courtPartyID: "party-gc")

        #expect(request.owner == "gc")
        #expect(request.ownerPartyID == "party-gc")
        #expect(request.sectionKey == "install")
        #expect(request.status == "todo")
    }

    @Test func aPlainTaskIsHersAndCarriesNoSectionOrParty() throws {
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "order the runner",
            roomName: "Living")

        #expect(request.owner == "designer")
        #expect(request.ownerPartyID == nil)
        #expect(request.sectionKey == nil)
        #expect(request.status == "todo")
    }

    @Test func theRoomTravelsInTheDescriptionBecauseThereIsNoRoomColumn() {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return",
            roomName: "Kitchen", courtPartyID: "party-gc")

        #expect(request.description ==
                "the base cabinet scribe is short on the left return\nKitchen")
    }

    @Test func aRoomlessPunchHasNoTrailingBlankLine() {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "scribe short",
            roomName: nil, courtPartyID: "party-gc")

        #expect(request.description == "scribe short")
    }

    // MARK: - The title

    @Test func theTitleIsTheFirstSentence_sentenceCased() {
        #expect(PunchTaskComposer.title(
            from: "the base cabinet scribe is short. the filler needs re-cutting.")
                == "The base cabinet scribe is short.")
    }

    @Test func aLongUnbrokenTitleIsClippedSoItReadsInAList() {
        let long = String(repeating: "scribe ", count: 40)
        let title = PunchTaskComposer.title(from: long)
        #expect(title.count <= 80)
        #expect(title.hasSuffix("…"))
    }

    @Test func aSpokenlessPunchStillGetsAName() {
        #expect(PunchTaskComposer.title(from: nil) == "From a site visit")
        #expect(PunchTaskComposer.title(from: "   ") == "From a site visit")
    }

    // MARK: - Lookup before write

    @Test func aReplayFindsTheExistingTaskBeforeWritingAgain() async throws {
        let gateway = SpyPunchTaskGateway(exists: true)
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "x", roomName: nil)

        let outcome = try await PunchTaskOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .alreadyWritten)
        #expect(gateway.insertCount == 0)
    }

    @Test func aFirstAttemptInsertsExactlyOnce() async throws {
        let gateway = SpyPunchTaskGateway(exists: false)
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "x", roomName: nil)

        let outcome = try await PunchTaskOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .written)
        #expect(gateway.insertCount == 1)
    }

    // MARK: - The lane

    @Test func aRefusedTaskClosesTheLaneSoItDegradesInsteadOfLooping() {
        let specimen = Specimen()
        specimen.requestPunchTask(taskID: taskID, owner: "gc", partyID: "party-gc")
        #expect(specimen.needsPunchTask)

        specimen.markPunchTaskRefused("new row violates row-level security policy")
        #expect(specimen.punchTaskState == .refused)
        #expect(specimen.needsPunchTask == false)
    }

    @Test func requestingATaskRecordsTheCourtItWasAimedAt() {
        let specimen = Specimen()
        specimen.requestPunchTask(taskID: taskID, owner: "gc", partyID: "party-gc")

        #expect(specimen.punchTaskId == taskID.uuidString)
        #expect(specimen.punchTaskOwnerRaw == "gc")
        #expect(specimen.punchTaskPartyId == "party-gc")
        #expect(specimen.punchTaskState == .pending)
        #expect(specimen.punchTaskRetryCount == 0)
    }
}

private final class SpyPunchTaskGateway: PunchTaskGateway, @unchecked Sendable {
    private let exists: Bool
    private(set) var insertCount = 0

    init(exists: Bool) { self.exists = exists }

    func existingProjectTask(id: UUID) async throws -> Bool { exists }
    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws { insertCount += 1 }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/PunchTaskWriteTests -quiet
```

Expected: **compile failure** — `cannot find 'PunchCourtResolver' in scope`.

- [ ] **Step 3: Write the contract**

Create `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift`:

```swift
//  PunchTaskWrite.swift
//  CaptureKit
//
//  FC-R7: a Field punch item is a project_tasks row owned by the GC, riding
//  the party-anchored SMS rail — never a client_decisions row.
//
//  Nothing here sends anything. The device writes a row; the AFTER INSERT
//  trigger fc_task_assignment_dispatch (00284:207-210) invokes sms-dispatch,
//  and only for a party whose kind is dispatchable AND whose
//  sms_consent_status is 'granted' (00284:172-179). field-daily then re-lists
//  the same open task in that party's digest (core.ts:177-181). Both hops run
//  under _shared/sms.ts's consent, quiet-hours and sms_messages logging.
//
//  PunchCourtResolver is a NARROWED mirror of that gate (ruling 2): a Field
//  punch goes to the GC with texting on, or it is not a punch at all. The
//  trigger admits four kinds; picking among them by array order would text
//  whichever trade came back first, and an app that names a party it did not
//  actually route to is exactly the lie §3.3 forbids.
//
//  ⚠ project_tasks has NO room column and wave 4 does not add one. The room
//  rides in `description`, on its own line. Adding room_id would be a ruling
//  about the project_rooms / public.rooms split (FC-R5) taken under deadline.

import Foundation

public struct FieldPartyRef: Codable, Hashable, Sendable {
    public let id: String
    public let displayName: String
    public let partyKind: String
    public let smsConsentGranted: Bool

    public init(id: String, displayName: String, partyKind: String, smsConsentGranted: Bool) {
        self.id = id
        self.displayName = displayName
        self.partyKind = partyKind
        self.smsConsentGranted = smsConsentGranted
    }
}

public enum PunchCourt: Equatable, Sendable {
    case reachable(FieldPartyRef)
    case noCourt

    public var party: FieldPartyRef? {
        switch self {
        case .reachable(let p): return p
        case .noCourt: return nil
        }
    }
}

public enum PunchCourtResolver {
    /// fc_dispatch_task_assignment will text any of these (00284:174). Kept as
    /// the documented mirror of the trigger — and pinned by a test — but NOT
    /// used as this resolver's filter.
    public static let dispatchableKinds: Set<String> = ["gc", "sub", "installer", "receiver"]

    /// FC-R7 ruled a FIELD punch is the GC's court, and ruling 2 (2026-08-24)
    /// closed the `court_party_id` question the same way: GC or nobody, no
    /// picker in v1. Taking the first consented candidate out of the four
    /// dispatchable kinds would text whichever trade the query happened to
    /// return first — a send to a party she never named, decided by array
    /// order. Consent is part of the filter because a GC with texting off is
    /// unreachable twice: the trigger returns early, and field-daily's digest
    /// filters on owner_party_id too.
    public static let punchCourtKind = "gc"

    public static func resolve(parties: [FieldPartyRef]) -> PunchCourt {
        guard let gc = parties.first(where: {
            $0.partyKind == punchCourtKind && $0.smsConsentGranted
        }) else { return .noCourt }
        return .reachable(gc)
    }
}

public struct PunchTaskWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let title: String
    public let description: String
    public let status: String
    public let owner: String
    public let ownerPartyID: String?
    public let sectionKey: String?
    public let createdBy: UUID
    public let fieldCaptureID: UUID

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, owner
        case projectID = "project_id"
        case ownerPartyID = "owner_party_id"
        case sectionKey = "section_key"
        case createdBy = "created_by"
        case fieldCaptureID = "field_capture_id"
    }
}

public enum PunchTaskComposer {
    private static let fallbackTitle = "From a site visit"
    private static let titleLimit = 80

    /// The first sentence, sentence-cased, clipped to something that reads in a
    /// list. The WHOLE transcript still travels in `description` — a title is a
    /// label, not the record.
    public static func title(from transcript: String?) -> String {
        let text = (transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return fallbackTitle }

        var candidate = text
        if let stop = text.firstIndex(where: { $0 == "." || $0 == "\n" }) {
            let head = String(text[text.startIndex...stop])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if head.count > 1 { candidate = head }
        }

        if candidate.count > titleLimit {
            let cut = candidate.index(candidate.startIndex, offsetBy: titleLimit - 1)
            candidate = String(candidate[candidate.startIndex..<cut])
                .trimmingCharacters(in: .whitespaces) + "…"
        }

        guard let first = candidate.first else { return fallbackTitle }
        return String(first).uppercased() + candidate.dropFirst()
    }

    private static func describe(transcript: String?, roomName: String?) -> String {
        let body = (transcript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let room = (roomName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty { return room }
        if room.isEmpty { return body }
        return "\(body)\n\(room)"
    }

    public static func task(
        id: UUID,
        projectID: UUID,
        createdBy: UUID,
        fieldCaptureID: UUID,
        transcript: String?,
        roomName: String?
    ) -> PunchTaskWriteRequest {
        PunchTaskWriteRequest(
            id: id,
            projectID: projectID,
            title: title(from: transcript),
            description: describe(transcript: transcript, roomName: roomName),
            status: "todo",
            owner: "designer",
            ownerPartyID: nil,
            sectionKey: nil,
            createdBy: createdBy,
            fieldCaptureID: fieldCaptureID)
    }

    /// `courtPartyID` is NON-optional on purpose (ruling 2). A gc-owned row with
    /// a null owner_party_id reaches no trigger (00284:161) and no daily digest
    /// (field-daily/core.ts:177-181) — it is a punch item nobody will ever see.
    /// With no reachable GC the caller writes `task(...)` instead.
    public static func punch(
        id: UUID,
        projectID: UUID,
        createdBy: UUID,
        fieldCaptureID: UUID,
        transcript: String?,
        roomName: String?,
        courtPartyID: String
    ) -> PunchTaskWriteRequest {
        PunchTaskWriteRequest(
            id: id,
            projectID: projectID,
            title: title(from: transcript),
            description: describe(transcript: transcript, roomName: roomName),
            status: "todo",
            owner: "gc",
            ownerPartyID: courtPartyID,
            sectionKey: "install",
            createdBy: createdBy,
            fieldCaptureID: fieldCaptureID)
    }
}

public protocol PunchTaskGateway: Sendable {
    func existingProjectTask(id: UUID) async throws -> Bool
    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws
}

public struct PunchTaskOrchestrator: Sendable {
    private let gateway: any PunchTaskGateway

    public init(gateway: any PunchTaskGateway) {
        self.gateway = gateway
    }

    public func write(_ request: PunchTaskWriteRequest) async throws -> FieldWriteOutcome {
        if try await gateway.existingProjectTask(id: request.id) {
            return .alreadyWritten
        }
        try await gateway.insertProjectTask(request)
        return .written
    }
}
```

- [ ] **Step 4: Add the lane to `Specimen` and the outbox**

In `Specimen.swift`, after the margin-note lane:

```swift
    // ── Task/punch lane (wave 4, FC-R7) — punchTaskId is the client-minted
    //    project_tasks.id AND the idempotency key. punchTaskOwnerRaw is
    //    'designer' for a task and 'gc' for a punch item.
    public var punchTaskId: String?
    public var punchTaskPartyId: String?
    public var punchTaskOwnerRaw: String?
    public var punchTaskStateRaw: String?
    public var punchTaskLastError: String?
    public var punchTaskRetryCount: Int?
```

In `Specimen+Accessors.swift`, after the margin-note lane:

```swift
    // MARK: - Task/punch lane (wave 4)

    var punchTaskState: FieldWriteState? {
        get { punchTaskStateRaw.flatMap(FieldWriteState.init(rawValue:)) }
        set { punchTaskStateRaw = newValue?.rawValue }
    }

    var needsPunchTask: Bool {
        guard punchTaskId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return punchTaskState != .written && punchTaskState != .refused
    }

    func requestPunchTask(taskID: UUID, owner: String, partyID: String?) {
        punchTaskId = taskID.uuidString
        punchTaskOwnerRaw = owner
        punchTaskPartyId = partyID
        punchTaskState = .pending
        punchTaskLastError = nil
        punchTaskRetryCount = 0
        touch()
    }

    func markPunchTaskPending() {
        guard punchTaskId != nil else { return }
        punchTaskState = .pending
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskStarted() {
        guard punchTaskId != nil else { return }
        punchTaskState = .writing
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskWritten() {
        guard punchTaskId != nil else { return }
        punchTaskState = .written
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskFailed(_ message: String) {
        punchTaskState = .failed
        punchTaskLastError = message
        punchTaskRetryCount = (punchTaskRetryCount ?? 0) + 1
        touch()
    }

    func markPunchTaskRefused(_ message: String) {
        punchTaskState = .refused
        punchTaskLastError = message
        touch()
    }

    func clearPunchTask() {
        punchTaskId = nil
        punchTaskPartyId = nil
        punchTaskOwnerRaw = nil
        punchTaskState = nil
        punchTaskLastError = nil
        punchTaskRetryCount = nil
        touch()
    }
```

In `CaptureStore.swift`'s `outbox()` filter, beside the other two:

```swift
            if $0.needsPunchTask { return true }
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (19 new `PunchTaskWriteTests` cases), `✔ lint` plus a clean explicit swiftlint run.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift \
        apps/mobile/Capture/CaptureTests/PunchTaskWriteTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): a punch item is a task in the GC's court, and the app never sends it"
```

---

### Task 11 — The app writes the two rows, on the drain that already exists

**Model:** Opus. Two Supabase inserts, one drain seam, and a failure ladder that must not retry a refusal forever.

**Files:**
- Create: `apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift`
- Create: `apps/mobile/Capture/CaptureTests/FieldWriteGateTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift` (add `FieldWriteGate`)
- Modify: `apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift` (two calls beside `performProjectPlacementIfNeeded`, at `:288` and `:487`)
- Modify: `apps/mobile/Capture/Capture/App/Composition/AppContainer.swift` (wire the gateway)

**Interfaces:**
- Consumes: `MarginNoteOrchestrator`, `PunchTaskOrchestrator`, `MarginNoteComposer`, `PunchTaskComposer`, `FieldWriteClassifier`, the two `Specimen` lanes (Tasks 9–10); `SupabaseClientProvider.makeClient()`; the drain's existing `hasConfirmedCaptureReceipt`.
- Produces:

```swift
// CaptureKit — the two guards the lanes need
public enum FieldWriteGate {
    public static func fieldCaptureID(for specimen: Specimen) -> UUID?
    /// Ruling 1's boundary, as a pure predicate so it is testable at all.
    /// `projectID` and `insideVisit` are passed in rather than read here: the
    /// wave-3 spelling of the visit id, and VenueStamp's own shape, are
    /// Task 0.4's to record, and this file must not guess either.
    public static func shouldAutoFileMarginNote(
        for specimen: Specimen, projectID: String?, insideVisit: Bool) -> Bool
}

// App-side
final class SupabaseFieldWriteGateway: MarginNoteGateway, PunchTaskGateway { … }

// LocalCaptureSyncService, private:
private func performFieldWritesIfNeeded(_ specimen: Specimen, owner: CaptureOwnerIdentity) async
private func writeMarginNoteIfNeeded(_ specimen: Specimen, owner: CaptureOwnerIdentity,
                                     captureID: UUID, writes: SupabaseFieldWriteGateway) async
```

**The rule this task exists to enforce.** `margin_notes.field_capture_id` and `project_tasks.field_capture_id` are both FKs to `field_captures(id)`, and that id does not exist until `commit_field_capture` returns a receipt. Both lanes are therefore **post-commit**, gated on `hasConfirmedCaptureReceipt` — exactly where `performProjectPlacementIfNeeded` already sits (`LocalCaptureSyncService.swift:191`, `:224-228`, `:288`, `:487`, `:509-546`).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/FieldWriteGateTests.swift`:

```swift
//  FieldWriteGateTests.swift
//  CaptureTests
//
//  Both wave-4 write lanes carry field_capture_id, an FK to field_captures(id).
//  That id does not exist until commit_field_capture returns a receipt, so a
//  lane that runs early inserts a row pointing at nothing and gets a 23503.
//  This is the guard, and it is the only part of the drain wiring that can be
//  unit-tested at all (constraint C1).

import Foundation
import Testing
@testable import CaptureKit

struct FieldWriteGateTests {
    @Test func aSpecimenWithNoReceiptOffersNoCaptureID() {
        let specimen = Specimen()
        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func aCommittedSpecimenWithARemoteIDOffersIt() {
        let id = UUID(uuidString: "c1111111-1111-4111-8111-111111111111")!
        let specimen = Specimen()
        specimen.remoteId = id.uuidString
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == id)
    }

    @Test func aRemoteIDWithoutACommittedStatusIsNotAReceipt() {
        let specimen = Specimen()
        specimen.remoteId = "c1111111-1111-4111-8111-111111111111"
        specimen.statusRaw = CaptureStatus.queued.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func aNonUUIDRemoteIDIsRefusedRatherThanForcedThrough() {
        let specimen = Specimen()
        specimen.remoteId = "not-a-uuid"
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    @Test func whitespaceIsNotAReceipt() {
        let specimen = Specimen()
        specimen.remoteId = "   "
        specimen.statusRaw = CaptureStatus.committed.rawValue

        #expect(FieldWriteGate.fieldCaptureID(for: specimen) == nil)
    }

    // MARK: - Ruling 1: which notes file themselves

    private func spoken(_ text: String?) -> Specimen {
        let specimen = Specimen()
        specimen.voiceTranscript = text
        return specimen
    }

    @Test func aSpokenNoteInsideAPlacedVisitFilesItself() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: "p1", insideVisit: true))
    }

    @Test func anUnplacedNoteNeverFilesItself_thatIsStillADeliberateAct() {
        // FC-R6: an unplaced note waits on Today. There is no project_id to
        // anchor a margin note to, so this is enforced, not merely intended.
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: nil, insideVisit: true) == false)
    }

    @Test func aPhotoWithNoWordsFilesNothing() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken(nil), projectID: "p1", insideVisit: true) == false)
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("   "), projectID: "p1", insideVisit: true) == false)
    }

    @Test func aNoteOutsideAVisitFilesNothing() {
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: spoken("the scribe is short"), projectID: "p1", insideVisit: false) == false)
    }

    @Test func aLaneAlreadyRequestedIsNeverReRequested() {
        let specimen = spoken("the scribe is short")
        specimen.requestMarginNote(noteID: UUID())
        #expect(FieldWriteGate.shouldAutoFileMarginNote(
            for: specimen, projectID: "p1", insideVisit: true) == false)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/FieldWriteGateTests -quiet
```

Expected: **compile failure** — `cannot find 'FieldWriteGate' in scope`.

- [ ] **Step 3: Add the gate**

Append to `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift`:

```swift
public enum FieldWriteGate {
    /// The server id both lanes hang off, or nil when it does not exist yet.
    /// `hasConfirmedCaptureReceipt` is the same predicate the placement lane
    /// waits on (Specimen+Accessors.swift).
    public static func fieldCaptureID(for specimen: Specimen) -> UUID? {
        guard specimen.hasConfirmedCaptureReceipt,
              let raw = specimen.remoteId?
                  .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty
        else { return nil }
        return UUID(uuidString: raw)
    }

    /// Ruling 1 (2026-08-24) / §6 Flow 2 step 4: a note spoken inside a PLACED
    /// visit files itself into the margin. Three conditions, all of them the
    /// ruling's own boundary and none of them a heuristic:
    ///   · the lane has never been requested — the id is the idempotency key
    ///   · the capture is on a project — FC-R6 keeps an unplaced note on Today
    ///   · there are words — a photo-only capture files nothing
    /// plus `insideVisit`, which the caller supplies because the wave-3 name
    /// for the visit id on Specimen is Task 0.4's to record.
    public static func shouldAutoFileMarginNote(
        for specimen: Specimen,
        projectID: String?,
        insideVisit: Bool
    ) -> Bool {
        guard insideVisit,
              specimen.marginNoteId == nil,
              specimen.marginNoteState == nil,
              (projectID?.isEmpty == false)
        else { return false }

        let spoken = (specimen.voiceTranscript ?? specimen.voicePartialTranscript)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return spoken?.isEmpty == false
    }
}
```

- [ ] **Step 4: Write the gateway**

Create `apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift`:

```swift
//  SupabaseFieldWriteGateway.swift
//  Capture
//
//  FC-R4's two direct writes. Plain table inserts, not RPCs:
//    · margin_notes  — margin_notes_designer_all is
//      `for all to authenticated using (designer_id = auth.uid())
//       with check (designer_id = auth.uid())` (00196:51-54). The author IS
//      the designer, so the policy already contemplates exactly this writer.
//    · project_tasks — "Designers manage their project tasks" (00169:61-62) is
//      a FOR ALL policy with no explicit WITH CHECK, so Postgres reuses its
//      USING clause: projects.designer_id = auth.uid(). A studio co-member
//      gets 42501 and the caller degrades (FC-R8).
//
//  Both inserts carry a client-minted id, which is the idempotency key: a
//  replay after a lost response collides on the primary key (23505) and the
//  orchestrator reads that as "already written". The `existing…` probes close
//  the same gap one round-trip earlier.

import Foundation
import CaptureKit
import Supabase

final class SupabaseFieldWriteGateway: MarginNoteGateway, PunchTaskGateway, @unchecked Sendable {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    // MARK: - MarginNoteGateway

    func existingMarginNote(id: UUID) async throws -> Bool {
        try await rowExists(table: "margin_notes", id: id)
    }

    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws {
        try await client.from("margin_notes").insert(request).execute()
    }

    // MARK: - PunchTaskGateway

    func existingProjectTask(id: UUID) async throws -> Bool {
        try await rowExists(table: "project_tasks", id: id)
    }

    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws {
        try await client.from("project_tasks").insert(request).execute()
    }

    // MARK: -

    private struct IDRow: Decodable { let id: UUID }

    private func rowExists(table: String, id: UUID) async throws -> Bool {
        let rows: [IDRow] = try await client
            .from(table)
            .select("id")
            .eq("id", value: id.uuidString)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }
}
```

- [ ] **Step 5: Run the lanes from the drain**

In `LocalCaptureSyncService.swift`, add the private method beside `performProjectPlacementIfNeeded` (which begins at `:509`):

```swift
    // ── field writes (wave 4, FC-R4) ────────────────────────────────────────
    /// Post-commit, exactly like the placement lane above: both rows carry
    /// field_capture_id, an FK to field_captures(id), which only exists once
    /// commit_field_capture has returned a receipt.
    ///
    /// A `.refused` outcome is TERMINAL. 42501 means this project's rows are
    /// the designer-of-record's (FC-R8, per-designer in v1) — retrying it on
    /// every drain forever would be the retry loop 00235's safe-harbour note
    /// warns about, with no path out.
    private func performFieldWritesIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity
    ) async {
        guard let captureID = FieldWriteGate.fieldCaptureID(for: specimen) else { return }
        guard let writes = fieldWrites else { return }

        // Ruling 1 (2026-08-24) / spec §6 Flow 2 step 4: a note spoken inside a
        // PLACED visit files itself. No tap. The id is minted once here and
        // persisted, so a second drain finds marginNoteId already set, re-uses
        // it, and the gateway's lookup-before-write turns the replay into
        // .alreadyWritten — exactly as idempotent as the deliberate path.
        //
        // The two guards that already exist keep the ruling's boundary honest:
        // MarginNoteComposer.request returns nil on an empty transcript (so a
        // photo-only capture files nothing), and a projectId is required (so an
        // unplaced note cannot auto-file, which is FC-R6). Filing an unplaced
        // note is still a deliberate act, on Today.
        //
        // ⚠ `specimen.visitID` is the wave-3 spelling THIS PLAN PREDICTS. Use the
        // one Task 0.4 recorded; the predicate itself takes a Bool precisely so
        // a wrong guess here is a one-line fix and not a CaptureKit change.
        if FieldWriteGate.shouldAutoFileMarginNote(
            for: specimen,
            projectID: specimen.venue?.projectId,
            insideVisit: specimen.visitID != nil) {
            specimen.requestMarginNote(noteID: UUID())
        }

        await writeMarginNoteIfNeeded(specimen, owner: owner, captureID: captureID, writes: writes)

        if specimen.needsPunchTask,
           let taskID = specimen.punchTaskId.flatMap(UUID.init(uuidString:)),
           let projectRaw = specimen.venue?.projectId,
           let projectID = UUID(uuidString: projectRaw),
           let designerID = owner.userID.flatMap(UUID.init(uuidString:)) {
            let transcript = specimen.voiceTranscript ?? specimen.voicePartialTranscript
            let room = specimen.venue?.room
            // The court was RESOLVED at tap time (Task 12); only the party id was
            // persisted, and punch(courtPartyID:) is all this needs. Nothing is
            // re-decided here, and whether a text goes out is the database's
            // call, not this call site's: fc_dispatch_task_assignment re-reads
            // the party's real sms_consent_status (00284:172-179).
            //
            // owner=='gc' with no persisted party cannot happen — ruling 2 makes
            // a partyless punch a plain task at tap time — but if a build ever
            // produced one, writing it as her own task is the honest landing:
            // an owner_party_id-less gc row reaches no trigger and no digest.
            let request: PunchTaskWriteRequest
            if specimen.punchTaskOwnerRaw == "gc", let partyID = specimen.punchTaskPartyId {
                request = PunchTaskComposer.punch(
                    id: taskID, projectID: projectID, createdBy: designerID,
                    fieldCaptureID: captureID, transcript: transcript, roomName: room,
                    courtPartyID: partyID)
            } else {
                request = PunchTaskComposer.task(
                    id: taskID, projectID: projectID, createdBy: designerID,
                    fieldCaptureID: captureID, transcript: transcript, roomName: room)
            }

            specimen.markPunchTaskStarted()
            do {
                let outcome = try await PunchTaskOrchestrator(gateway: writes).write(request)
                apply(outcome: outcome, toPunchTaskOn: specimen, request: request)
                analytics?.event("field.punch_task.ok", [
                    "capture_id": captureID.uuidString,
                    "owner": specimen.punchTaskOwnerRaw ?? "designer"
                ])
            } catch {
                apply(outcome: FieldWriteClassifier.outcome(
                          code: postgrestCode(from: error),
                          message: error.localizedDescription),
                      toPunchTaskOn: specimen, request: request)
            }
        }

        // Run the note lane a second time. FC-R8's degrade (ruling 3) opens it
        // from inside the punch branch above, which has already run past the
        // first pass — and a degrade that waits for the NEXT drain is a degrade
        // that may never happen on a phone about to go in a pocket.
        // requestMarginNote is id-guarded, so this is a no-op in every other
        // case, including the one where the note was written thirty lines ago.
        await writeMarginNoteIfNeeded(specimen, owner: owner, captureID: captureID, writes: writes)

        try? store.save()
    }

    private func writeMarginNoteIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity,
        captureID: UUID,
        writes: SupabaseFieldWriteGateway
    ) async {
        guard specimen.needsMarginNote,
              let noteID = specimen.marginNoteId.flatMap(UUID.init(uuidString:)),
              let projectRaw = specimen.venue?.projectId,
              let projectID = UUID(uuidString: projectRaw),
              let designerID = owner.userID.flatMap(UUID.init(uuidString:)),
              let request = MarginNoteComposer.request(
                  noteID: noteID,
                  projectID: projectID,
                  designerID: designerID,
                  fieldCaptureID: captureID,
                  // marginNoteBodyRaw is set only by FC-R8's degrade (ruling 3),
                  // which has words of its own; every other note is the transcript.
                  transcript: specimen.marginNoteBodyRaw
                      ?? specimen.voiceTranscript
                      ?? specimen.voicePartialTranscript)
        else { return }

        specimen.markMarginNoteStarted()
        do {
            let outcome = try await MarginNoteOrchestrator(gateway: writes).write(request)
            apply(outcome: outcome, toMarginNoteOn: specimen)
            analytics?.event("field.margin_note.ok", ["capture_id": captureID.uuidString])
        } catch {
            apply(outcome: FieldWriteClassifier.outcome(
                      code: postgrestCode(from: error),
                      message: error.localizedDescription),
                  toMarginNoteOn: specimen)
        }
    }

    private func apply(outcome: FieldWriteOutcome, toMarginNoteOn specimen: Specimen) {
        switch outcome {
        case .written, .alreadyWritten:  specimen.markMarginNoteWritten()
        case .deferred:                  specimen.markMarginNotePending()
        case .refused(let m):            specimen.markMarginNoteRefused(m)
        case .failed(let m):             specimen.markMarginNoteFailed(m)
        }
    }

    private func apply(
        outcome: FieldWriteOutcome,
        toPunchTaskOn specimen: Specimen,
        request: PunchTaskWriteRequest
    ) {
        switch outcome {
        case .written, .alreadyWritten:  specimen.markPunchTaskWritten()
        case .deferred:                  specimen.markPunchTaskPending()
        case .failed(let m):             specimen.markPunchTaskFailed(m)
        case .refused(let m):
            specimen.markPunchTaskRefused(m)
            // FC-R8 / ruling 3: 42501 is terminal on this lane, and the degrade
            // has to be a WRITE, HERE. This drain is background and
            // per-owner-serialized; the card that reports the refusal may never
            // be on screen, and the app may have been relaunched since. A
            // degrade that lives only in the UI silently loses her punch item,
            // which is what §3.3 forbids.
            //
            // The refused task's own UUID becomes the note id — same
            // client-minted id lineage, so a replayed drain re-uses it and
            // writes once. margin_notes_designer_all admits her own note
            // (00196:51-54) because it keys on the note's designer_id, not the
            // project's, so this write is the one that CAN land.
            specimen.requestMarginNote(
                noteID: UUID(uuidString: specimen.punchTaskId ?? "") ?? UUID(),
                body: MarginNoteComposer.refusedTaskBody(
                    title: request.title, context: request.description))
        }
    }
```

**⚠ Why the two `apply(outcome:)` calls now read the orchestrator's return value** rather than
discarding it (`_ = try await …`) and marking written unconditionally. Today
`MarginNoteOrchestrator.write` and `PunchTaskOrchestrator.write` return only `.written` /
`.alreadyWritten` and throw on everything else, so the old shape was **correct** — but it is correct
by accident. The day an orchestrator *returns* `.refused` instead of throwing, the old shape marks a
refusal as written and FC-R8's degrade never fires. Switching on the returned value costs nothing and
closes it.

Add a `postgrestCode(from:)` helper alongside, reading the SDK's `PostgrestError.code` when the error is one and returning `nil` otherwise. Add a `private let fieldWrites: SupabaseFieldWriteGateway?` stored property initialised from the composition root, beside the existing `remote` seam.

Then call it in **both** places `performProjectPlacementIfNeeded` is called — `:288` and `:487` — on the line immediately after:

```swift
                    try await performProjectPlacementIfNeeded(specimen, owner: owner)
                    await performFieldWritesIfNeeded(specimen, owner: owner)
```

Wire `SupabaseFieldWriteGateway(client: SupabaseClientProvider.makeClient())` into `AppContainer` where the other Supabase concretes are constructed, and pass it to `LocalCaptureSyncService`.

- [ ] **Step 6: Run the gate**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (10 new `FieldWriteGateTests` cases), clean explicit swiftlint. ⚠ Nothing in this task is proven by a green gate — the two inserts are app-target code with no test target (C1). They are proven by the device pass in Task 18.

- [ ] **Step 7: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift \
        apps/mobile/Capture/CaptureTests/FieldWriteGateTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldWriteState.swift \
        apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift \
        apps/mobile/Capture/Capture/App/Composition/AppContainer.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): drain the margin-note and task lanes after the capture commits"
```

---

### Task 12 — The three verbs on the card, and the truth about what was sent

**Model:** Opus. This is the whole designer-facing surface of FC-R7 and FC-R8, and every failure mode has to be legible.

**Files:**
- Create: `apps/mobile/Capture/CaptureTests/FieldVerbCopyTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift` (add `PunchCourtCopy`)
- Modify: `apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift` (the verb menu)
- Modify: `apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift:44` (select `party_kind`)

**Interfaces:**
- Consumes: `PunchCourtResolver`, `FieldPartyRef`, `Specimen.requestMarginNote` / `.requestPunchTask` (Tasks 9–10).
- Produces:

```swift
public enum PunchCourtCopy {
    /// What she reads BEFORE she taps Add — an intention, not a receipt.
    public static func intent(for court: PunchCourt) -> String
    /// What the card says AFTER the drain wrote the row.
    public static func filed(for court: PunchCourt) -> String
    public static let refusedTask: String
}
```

**⚠ Three repo facts to carry, all recorded during authoring:**
1. The C3 route is `CaptureSheet.smartGuessCard(UUID)` but the view is `SmartGuessSheet.swift`, whose header and accessibility id both say `n5SmartGuess`. **The route and the screen id disagree.** Do not add new UI keyed on "C3" by name — use the enum case and the existing accessibility id, and note the mismatch in the commit body.
2. There is **no overflow (`⋯`) menu anywhere in the app** — a repo-wide search for the `ellipsis` SF Symbol returns zero hits. This task builds the first one. It sits beside the existing `RecognitionActionBar` (`SmartGuessSheet.swift:50-55`), never replacing *Looks right*.
3. `SupabaseSiteRequestService.swift:44` selects `id,display_name,company_name,phone,phone_e164,trade,sms_consent_status` from `project_parties` — **`party_kind` is missing** and `PunchCourtResolver` needs it. Add it to that select; it is the only query change this wave makes.

**Copy** (brand voice; the one place this wave speaks to a designer about sending):

| Moment | Court | String |
|---|---|---|
| Under the confirm button, **before** Add | `.reachable(party)` | `Delaney Build Co will get a text.` |
| Under the confirm button, **before** Add | `.noCourt` | `No general contractor with texting on this project — this stays as your task.` |
| On the card, **after** the drain wrote the row | `.reachable(party)` | `Filed. Delaney Build Co was texted.` |
| On the card, **after** the drain wrote the row | `.noCourt` | `Filed as your task.` |
| 42501 on *Make it a task* or *Make it a punch item* | — | `Tasks on this project belong to its designer of record. Saved as a note in the Document instead.` |

**⚠ Why the tense changes between the two moments (F9).** She reads the line at **tap** time, from the
device's cached `sms_consent_status`; the row is written at **drain** time, which may be a tunnel and
a night later; and the send is decided later still, **server-side**, by
`fc_dispatch_task_assignment` re-reading the party's real consent (`00284:160-203`). Consent can flip
either way in between. So the pre-tap line is an **intention** (*"will get a text"*) and the card
states the **fact** only once `punchTaskState == .written`. A line that reports a send as done before
the row exists is the failure §3.3 forbids, and it was the plan's own copy until this pass.

**⚠ There is no `.filedOnly` line any more (ruling 2).** A GC who has not agreed to texts does not
become a court: a `project_tasks` row with `owner='gc'` and a null `owner_party_id` reaches neither
the dispatch trigger (`00284:161`) nor the daily digest (`field-daily/core.ts:177-181`), so *"filed
for Halloran & Sons"* would name a party who will never see it. The honest landing is her own task,
and the copy says exactly that.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/FieldVerbCopyTests.swift`:

```swift
//  FieldVerbCopyTests.swift
//  CaptureTests
//
//  The one place the app talks to a designer about whether a text went out.
//  fc_dispatch_task_assignment sends only to a consented, dispatchable party
//  (00284:172-179) and returns silently otherwise — so a line promising a send
//  that the database declines is a lie the designer cannot detect. These
//  strings are pinned in a test for the same reason the SQL constraints are.

import Foundation
import Testing
@testable import CaptureKit

struct FieldVerbCopyTests {
    private let consented = FieldPartyRef(
        id: "p1", displayName: "Delaney Build Co",
        partyKind: "gc", smsConsentGranted: true)

    @Test func aReachableCourtIsPromisedATextByName_inTheFutureTense() {
        #expect(PunchCourtCopy.intent(for: .reachable(consented))
                == "Delaney Build Co will get a text.")
    }

    @Test func noCourtSaysWhatWillHappenInstead() {
        #expect(PunchCourtCopy.intent(for: .noCourt)
                == "No general contractor with texting on this project — this stays as your task.")
    }

    @Test func theCardReportsTheSendOnlyOnceTheRowIsWritten() {
        #expect(PunchCourtCopy.filed(for: .reachable(consented))
                == "Filed. Delaney Build Co was texted.")
        #expect(PunchCourtCopy.filed(for: .noCourt) == "Filed as your task.")
    }

    @Test func aRefusedTaskNamesTheReasonAndTheFallback() {
        #expect(PunchCourtCopy.refusedTask
                == "Tasks on this project belong to its designer of record. Saved as a note in the Document instead.")
    }

    @Test func noPreTapLineEverReportsASendAsAlreadyDone() {
        // The row does not exist yet when this line is read. Past tense here
        // would be a receipt for something that has not happened.
        for court in [PunchCourt.reachable(consented), .noCourt] {
            let line = PunchCourtCopy.intent(for: court)
            #expect(line.lowercased().contains("was texted") == false)
            #expect(line.lowercased().contains("gets a text") == false)
        }
    }

    @Test func noLineEverClaimsASendOnAProjectWithNoCourt() {
        #expect(PunchCourtCopy.intent(for: .noCourt).lowercased().contains("text") )
        #expect(PunchCourtCopy.filed(for: .noCourt).lowercased().contains("text") == false)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/FieldVerbCopyTests -quiet
```

Expected: **compile failure** — `cannot find 'PunchCourtCopy' in scope`.

- [ ] **Step 3: Write the copy**

Append to `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift`:

```swift
public enum PunchCourtCopy {
    /// BEFORE she taps Add. The row does not exist yet and the send is the
    /// database's to make later, so this is an intention, not a receipt.
    public static func intent(for court: PunchCourt) -> String {
        switch court {
        case .reachable(let party):
            return "\(party.displayName) will get a text."
        case .noCourt:
            // Ruling 2: a gc-owned row with no party reaches no trigger and no
            // digest, so it is filed as hers rather than pretending at a court.
            return "No general contractor with texting on this project — this stays as your task."
        }
    }

    /// AFTER the drain reports punchTaskState == .written. Now the row exists
    /// and the trigger has had its say, so the past tense is earned.
    public static func filed(for court: PunchCourt) -> String {
        switch court {
        case .reachable(let party): return "Filed. \(party.displayName) was texted."
        case .noCourt:              return "Filed as your task."
        }
    }

    /// FC-R8, per-designer in v1: a studio co-member's insert into
    /// project_tasks raises 42501, and the honest fallback is the note lane —
    /// which margin_notes_designer_all DOES admit from her, because that policy
    /// keys on the note's own designer_id, not the project's. The drain itself
    /// performs that write (ruling 3); this line only reports it.
    public static let refusedTask =
        "Tasks on this project belong to its designer of record. Saved as a note in the Document instead."
}
```

- [ ] **Step 4: Build the verb menu**

In `SupabaseSiteRequestService.swift`, add `party_kind` to the `project_parties` select at `:44`:

```swift
    .select("id,display_name,company_name,phone,phone_e164,trade,party_kind,sms_consent_status")
```

and map each returned row into a `FieldPartyRef` alongside the existing `SiteRequestAssignee` mapping, exposed as a second array on the same service:

```swift
    /// Every project party, unfiltered. SiteRequestAssignee drops a party with
    /// no phone; PunchCourtResolver must see it anyway, because a GC with no
    /// phone number is still the reason a punch item is not somebody else's.
    func fieldParties(projectID: UUID) async throws -> [FieldPartyRef]
```

`SmartGuessSheet` loads it once when the sheet appears and holds it in `@State private var parties: [FieldPartyRef] = []`.

In `SmartGuessSheet.swift`, add an overflow `Menu` beside `RecognitionActionBar`:

```swift
Menu {
    // Ruling 1: inside a placed visit the note is ALREADY filed by the drain,
    // so the first row is state, not an action. Offering "Make it a note" on a
    // note that filed itself would either write a second one or do nothing —
    // and both of those teach her the menu lies.
    if specimen.marginNoteId != nil {
        Label("Filed in the Document.", systemImage: "checkmark")
            .labelStyle(.titleAndIcon)
    } else {
        Button("Make it a note in the Document") { promoteToNote() }
    }
    Button("Make it a task") { makeTask() }
    Button("Make it a punch item") { makePunchItem() }
} label: {
    Image(systemName: "ellipsis")
        .font(CaptureType.callout)
        .foregroundStyle(CaptureColor.inkSoft)
}
```

- `promoteToNote()` → `specimen.requestMarginNote(noteID: UUID())`, then `sync.enqueue(specimen.id)`. **This verb survives for exactly two cases** (ruling 1): a capture with **no visit** — the walk-and-talk and the market-run note — and **filing an unplaced note from Today** (FC-R6), which is the deliberate act the ruling preserves. Inside a placed visit it is never shown, because the drain already did it.
- `makeTask()` → `specimen.requestPunchTask(taskID: UUID(), owner: "designer", partyID: nil)`, then enqueue.
- `makePunchItem()` → `let court = PunchCourtResolver.resolve(parties: parties)`; show `PunchCourtCopy.intent(for: court)` under an **Add** button; on Add:
  - `.reachable(party)` → `specimen.requestPunchTask(taskID: UUID(), owner: "gc", partyID: party.id)`
  - `.noCourt` → `specimen.requestPunchTask(taskID: UUID(), owner: "designer", partyID: nil)` — *"this stays as your task"*, written as one (ruling 2)

  then enqueue. Once `punchTaskState == .written`, the card replaces the intent line with `PunchCourtCopy.filed(for: court)` — the fact, after the row exists.

The task and punch verbs are disabled with a plain line when `specimen.venue?.projectId` is nil — *"Put this on a project first."* — because both writes need a `project_id`. (The note verb on an unplaced capture is FC-R6's Today flow, not this card's.)

When the drain lands `punchTaskState == .refused`, the card shows `PunchCourtCopy.refusedTask`. **It only reports** — the degrade write already happened in `apply(outcome:toPunchTaskOn:request:)` (Task 11, ruling 3), because this card may never be on screen when the 42501 arrives.

- [ ] **Step 5: Run the gate**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (6 new `FieldVerbCopyTests` cases), clean explicit swiftlint.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/CaptureTests/FieldVerbCopyTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift \
        apps/mobile/Capture/Capture/Features/Recognition/SmartGuess/SmartGuessSheet.swift \
        apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): make it a note, a task, or a punch item — and say what was sent

The C3 route (CaptureSheet.smartGuessCard) and the screen id (n5SmartGuess)
still disagree; left as found, recorded here so a later wave rules on it."
```

---

### Task 13 — The punch photo, where the GC's work is listed

**Model:** Sonnet.

**Files:**
- Create: `apps/designer-portal/src/hooks/use-field-capture-photos.ts`
- Create: `apps/designer-portal/src/hooks/__tests__/use-field-capture-photos.test.ts`
- Create: `apps/designer-portal/src/components/document/__tests__/work-block-punch-photo.test.tsx`
- Modify: `apps/designer-portal/src/hooks/use-section-work.ts:83-97` (`useSectionTasks` — add one column)
- Modify: `apps/designer-portal/src/components/document/work-block.tsx` (a thumbnail on a task line)

**Interfaces:**
- Consumes: `project_tasks.field_capture_id` (Task 7); `useCaptureMediaUrls` (Wave 1P); `useSectionTasks` (`apps/designer-portal/src/hooks/use-section-work.ts:83`, which already selects `owner, owner_party_id`).
- Produces:

```ts
// apps/designer-portal/src/hooks/use-field-capture-photos.ts
export function photoPathsByCapture(
  rows: readonly { id: string; photos: unknown; primary_photo_path: string | null }[],
): Record<string, string[]>;

export function useFieldCapturePhotoPaths(
  captureIds: readonly string[],
): UseQueryResult<Record<string, string[]>>;
```

`SectionTask` gains `field_capture_id: string | null` — the only change to its shape.

**Why portal-local and not `@patina/supabase`.** §11.1 fixes the convention: shared Supabase reads go in `packages/supabase/src/hooks/` (that is where `useCaptureMediaUrls` and `useProjectVisits` live); the hooks that exist to serve one portal surface stay portal-local, beside `use-margin-notes.ts` and `use-section-work.ts`. This one serves the designer portal's Work block and nothing else.

**Why one batched read, and where it therefore has to live.** A trade walk produces several punch items at once. One `in`-filtered query plus one batched `createSignedUrls` beats one round-trip per row — the same reason `letterhead-instruments.tsx:123` batches a page of scan heroes. ⚠ **That means both hooks are called ONCE, in the Work block, over every task's `field_capture_id` — never inside the per-row component.** React Query dedupes identical keys, but a per-row hook gives each row a *distinct* key, so N punch items would make N capture queries and N signing calls: the exact shape this rationale rejects. `PunchPhoto` is therefore purely presentational — it takes a resolved `url` and renders it — which also makes it testable without mocking two hooks per row.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/hooks/__tests__/use-field-capture-photos.test.ts`:

```ts
/**
 * photoPathsByCapture — the reducer under the Work block's punch thumbnails.
 * field_captures.photos is a jsonb array of {path, publicUrl, isPrimary, …}
 * (00235:27) and primary_photo_path is the first isPrimary path (00235:126-128).
 * The strip wants storage KEYS, in capture order, with the primary first —
 * useCaptureMediaUrls signs them; this never mints a URL.
 */
import { photoPathsByCapture } from '../use-field-capture-photos';

describe('photoPathsByCapture', () => {
  it('returns an empty map for no captures', () => {
    expect(photoPathsByCapture([])).toEqual({});
  });

  it('keys the storage paths by capture id', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: [{ path: 'a.heic' }, { path: 'b.heic' }], primary_photo_path: null },
      ]),
    ).toEqual({ 'cap-1': ['a.heic', 'b.heic'] });
  });

  it('puts the primary photo first so the strip leads with what she framed', () => {
    expect(
      photoPathsByCapture([
        {
          id: 'cap-1',
          photos: [{ path: 'a.heic' }, { path: 'b.heic' }],
          primary_photo_path: 'b.heic',
        },
      ]),
    ).toEqual({ 'cap-1': ['b.heic', 'a.heic'] });
  });

  it('drops entries with no path rather than emitting a blank', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: [{ isPrimary: true }, { path: '' }, { path: 'a.heic' }], primary_photo_path: null },
      ]),
    ).toEqual({ 'cap-1': ['a.heic'] });
  });

  it('omits a capture whose photos are missing or malformed', () => {
    expect(
      photoPathsByCapture([
        { id: 'cap-1', photos: null, primary_photo_path: null },
        { id: 'cap-2', photos: 'not-an-array', primary_photo_path: null },
      ]),
    ).toEqual({});
  });
});
```

Create `apps/designer-portal/src/components/document/__tests__/work-block-punch-photo.test.tsx`:

```tsx
/**
 * A punch item raised from Field shows the photo it was taken from (FC-R15),
 * on the same line the GC's work is listed on. A task typed at the desk shows
 * nothing new — which is the "renders nothing on a field-less project" claim,
 * one surface further in.
 *
 * PunchPhoto takes a resolved url and no hooks at all: the query and the
 * signing are batched once in the Work block, over every task on the section.
 * leadPhotoUrls is the pure part of that batching and is tested here beside it.
 */
import { render, screen } from '@testing-library/react';
import { PunchPhoto, leadPhotoUrls } from '../work-block';

describe('PunchPhoto', () => {
  it('renders nothing for a task that came from no capture', () => {
    const { container } = render(<PunchPhoto url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the photo the punch item was taken from', () => {
    render(<PunchPhoto url="https://signed/a" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed/a');
  });
});

describe('leadPhotoUrls', () => {
  it('asks for one lead photo per punch item, and nothing for desk tasks', () => {
    expect(
      leadPhotoUrls(
        [
          { field_capture_id: 'cap-1' },
          { field_capture_id: null },
          { field_capture_id: 'cap-2' },
        ],
        { 'cap-1': ['a.heic', 'b.heic'], 'cap-2': ['c.heic'] },
        {},
      ).paths,
    ).toEqual(['a.heic', 'c.heic']);
  });

  it('resolves each task to its signed url, or to null while it is unsigned', () => {
    const { byTaskCapture } = leadPhotoUrls(
      [{ field_capture_id: 'cap-1' }, { field_capture_id: 'cap-2' }],
      { 'cap-1': ['a.heic'], 'cap-2': ['c.heic'] },
      { 'a.heic': 'https://signed/a' },
    );
    expect(byTaskCapture['cap-1']).toBe('https://signed/a');
    expect(byTaskCapture['cap-2']).toBeNull();
  });
});
```

- [ ] **Step 2: Run both and watch them fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/hooks/__tests__/use-field-capture-photos.test.ts
pnpm jest src/components/document/__tests__/work-block-punch-photo.test.tsx
```

Expected: `Cannot find module '../use-field-capture-photos'` and `PunchPhoto is not exported from '../work-block'`.

- [ ] **Step 3: Write the hook**

Create `apps/designer-portal/src/hooks/use-field-capture-photos.ts`:

```ts
'use client';

/**
 * The storage keys behind a Field-raised punch item's photo (FC-R15).
 * Portal-local by the §11.1 convention: shared Supabase reads live in
 * packages/supabase; hooks that serve one portal surface stay here, beside
 * use-margin-notes.ts and use-section-work.ts.
 *
 * One `in`-filtered read for a whole section's punch items, then ONE batched
 * signing call at the call site. field_captures RLS is owner-only outside the
 * shared inbox (00233:155-186), so a studio co-member simply gets fewer rows
 * back and the thumbnails do not render — FC-R8, per-designer in v1.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

const getSupabase = () => createBrowserClient();

interface CapturePhotoRow {
  id: string;
  photos: unknown;
  primary_photo_path: string | null;
}

export function photoPathsByCapture(
  rows: readonly CapturePhotoRow[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    if (!Array.isArray(row.photos)) continue;
    const paths = row.photos
      .map((p) =>
        p && typeof p === 'object' && typeof (p as { path?: unknown }).path === 'string'
          ? (p as { path: string }).path
          : '',
      )
      .filter((p) => p.length > 0);
    if (paths.length === 0) continue;

    const primary = row.primary_photo_path;
    out[row.id] =
      primary && paths.includes(primary)
        ? [primary, ...paths.filter((p) => p !== primary)]
        : paths;
  }
  return out;
}

export function useFieldCapturePhotoPaths(
  captureIds: readonly string[],
): UseQueryResult<Record<string, string[]>> {
  const ids = Array.from(new Set(captureIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['field-capture-photos', ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string[]>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_captures')
        .select('id, photos, primary_photo_path')
        .in('id', ids);
      if (error) throw error;
      return photoPathsByCapture((data ?? []) as CapturePhotoRow[]);
    },
  });
}
```

- [ ] **Step 4: Carry the column and render the thumbnail**

In `apps/designer-portal/src/hooks/use-section-work.ts`, add `field_capture_id` to `useSectionTasks`' select list and to the `SectionTask` interface:

```ts
        .select('id, project_id, section_key, title, status, due_date, starts_on, completed_at, estimate_minutes, sort_order, owner, owner_party_id, blocked_by_item_id, seq_after_task_id, field_capture_id')
```

In `apps/designer-portal/src/components/document/work-block.tsx`, export the pure resolver and a presentational component, and call the two hooks **once** in the block that owns the task list:

```tsx
/**
 * The lead photo of every Field-raised task on this section, resolved in one
 * pass. Both hooks are called once, above the rows: one query key and one
 * createSignedUrls for the whole trade walk, not one of each per punch item.
 */
export function leadPhotoUrls(
  tasks: readonly { field_capture_id: string | null }[],
  byCapture: Record<string, string[]> | undefined,
  signed: Record<string, string> | undefined,
): { paths: string[]; byTaskCapture: Record<string, string | null> } {
  const paths: string[] = [];
  const byTaskCapture: Record<string, string | null> = {};

  for (const task of tasks) {
    const captureId = task.field_capture_id;
    if (!captureId || captureId in byTaskCapture) continue;
    const lead = byCapture?.[captureId]?.[0];
    if (!lead) {
      byTaskCapture[captureId] = null;
      continue;
    }
    paths.push(lead);
    byTaskCapture[captureId] = signed?.[lead] ?? null;
  }
  return { paths, byTaskCapture };
}

export function PunchPhoto({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-8 w-8 flex-shrink-0 rounded-[3px] object-cover"
    />
  );
}
```

In the component that renders the task list, above the rows:

```tsx
  const captureIds = tasks.map((t) => t.field_capture_id).filter((id): id is string => Boolean(id));
  const { data: byCapture } = useFieldCapturePhotoPaths(captureIds);
  const { paths } = leadPhotoUrls(tasks, byCapture, undefined);
  const { data: signedUrls } = useCaptureMediaUrls(paths);
  const { byTaskCapture } = leadPhotoUrls(tasks, byCapture, signedUrls);
```

and render `<PunchPhoto url={task.field_capture_id ? byTaskCapture[task.field_capture_id] : null} />` at the head of each task line. ⚠ Both hooks are unconditional and both are `enabled`-gated on an empty input (`ids.length > 0` / `wanted.length > 0`), so a section with no Field tasks issues no query and the Rules of Hooks are not bent to achieve it.

- [ ] **Step 5: Run both and watch them pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/hooks/__tests__/use-field-capture-photos.test.ts
pnpm jest src/components/document/__tests__/work-block-punch-photo.test.tsx
```

Expected: PASS, 5 + 4 tests.

- [ ] **Step 6: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm lint --filter designer-portal
git add apps/designer-portal/src/hooks/use-field-capture-photos.ts \
        apps/designer-portal/src/hooks/__tests__/use-field-capture-photos.test.ts \
        apps/designer-portal/src/components/document/__tests__/work-block-punch-photo.test.tsx \
        apps/designer-portal/src/hooks/use-section-work.ts \
        apps/designer-portal/src/components/document/work-block.tsx
git commit -m "feat(document): a punch item shows the photo it was taken from"
```

---

### Task 14 — CaptureKit: what a visit produced, and a close that survives no signal

**Model:** Sonnet.

**Files:**
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift`
- Create: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift`
- Create: `apps/mobile/Capture/CaptureTests/VisitReviewTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift:40-46` (add the model to `CaptureStore.schema`)

**Interfaces:**
- Consumes: `Specimen` (mapped to rows by the caller — the composer takes value types, never the `@Model`).
- Produces:

```swift
public struct VisitReviewRow: Equatable, Sendable {
    public let specimenID: UUID
    public let hasPhoto: Bool
    public let hasTranscript: Bool
    public let roomName: String?
    public let isPlaced: Bool
    public let createdAt: Date
}

public struct VisitReviewSummary: Equatable, Sendable {
    public let photoCount: Int
    public let noteCount: Int
    public let unplacedCount: Int
    public let rooms: [String]
    public let elapsedMinutes: Int      // always >= 1 when anything was captured
}

public enum VisitReviewComposer {
    public static func summarize(rows: [VisitReviewRow], startedAt: Date, now: Date) -> VisitReviewSummary
    public static func doneCaption(unplacedCount: Int) -> String?
    public static func timeOffer(minutes: Int) -> String
}

@Model public final class FieldVisitCloseRecord {
    @Attribute(.unique) public var visitID: UUID
    public var timeEntryID: UUID          // client-minted; the idempotency key
    public var projectID: String
    public var ownerUserID: String
    public var startedAt: Date
    public var endedAt: Date
    public var durationMinutes: Int
    public var stateRaw: String           // FieldWriteState
    public var lastError: String?
    public var retryCount: Int
    public var nextAttemptAt: Date?

    public init(visitID: UUID, timeEntryID: UUID, projectID: String,
                ownerUserID: String, startedAt: Date, endedAt: Date,
                durationMinutes: Int)

    /// Byte-for-byte SiteRequestOutboxRecord.swift:127-129.
    public static func retryDelay(attempt: Int) -> TimeInterval
}
```

Task 15 renders the summary; Task 16 drains the record.

**Why a durable record rather than a fire-and-forget insert.** She closes a visit standing in a house with one bar of signal. `SiteRequestOutboxRecord` (`CaptureKit/CaptureKit/Domain/SiteRequestOutboxRecord.swift`) is the in-repo pattern for exactly this: a `@Attribute(.unique)` client-minted key, an explicit state, and `retryDelay(attempt:)` = `min(3_600, pow(2, attempt - 1) * 5)`. This mirrors it, including the backoff formula.

**⚠ Deviations from §7.9, both already declared above.** V4's grouped list is *Captures · Notes · Unplaced*, not *Captures · Notes · Scans · Unplaced* — a scan is not a `Specimen` and the device has no visit-keyed scan record. `elapsedMinutes` comes from `startedAt`→`now`, never from `visit_ended_at`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/VisitReviewTests.swift`:

```swift
//  VisitReviewTests.swift
//  CaptureTests
//
//  V4 is a receipt that produces something (§7.9, Flow 7): it writes the
//  Visits row on the project spread and offers ONE completed time entry.
//  Everything it says about the visit is derived here, so it is derived once
//  and tested once.

import Foundation
import Testing
@testable import CaptureKit

struct VisitReviewTests {
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func row(
        _ id: String,
        photo: Bool = false,
        transcript: Bool = false,
        room: String? = nil,
        placed: Bool = true,
        offset: TimeInterval = 0
    ) -> VisitReviewRow {
        VisitReviewRow(
            specimenID: UUID(uuidString: id)!,
            hasPhoto: photo,
            hasTranscript: transcript,
            roomName: room,
            isPlaced: placed,
            createdAt: start.addingTimeInterval(offset))
    }

    @Test func anEmptyVisitSummarisesToNothing() {
        let summary = VisitReviewComposer.summarize(
            rows: [], startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 0)
        #expect(summary.noteCount == 0)
        #expect(summary.unplacedCount == 0)
        #expect(summary.rooms.isEmpty)
    }

    @Test func aPhotoWithAVoiceNoteCountsAsAPhoto_notBoth() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d1111111-1111-4111-8111-111111111111", photo: true, transcript: true)],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 1)
        #expect(summary.noteCount == 0)
    }

    @Test func aVoiceOnlyCaptureIsANote() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d2222222-2222-4222-8222-222222222222", transcript: true)],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.photoCount == 0)
        #expect(summary.noteCount == 1)
    }

    @Test func roomsAreListedOnceEachInTheOrderSheeMetThem() {
        let summary = VisitReviewComposer.summarize(
            rows: [
                row("d3333333-3333-4333-8333-333333333331", photo: true, room: "Living", offset: 0),
                row("d3333333-3333-4333-8333-333333333332", photo: true, room: "Dining", offset: 60),
                row("d3333333-3333-4333-8333-333333333333", photo: true, room: "Living", offset: 120),
            ],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.rooms == ["Living", "Dining"])
    }

    @Test func unplacedCapturesAreCountedSoDoneCanSaySo() {
        let summary = VisitReviewComposer.summarize(
            rows: [
                row("d4444444-4444-4444-8444-444444444441", photo: true, placed: false),
                row("d4444444-4444-4444-8444-444444444442", photo: true, placed: false),
                row("d4444444-4444-4444-8444-444444444443", photo: true, placed: true),
            ],
            startedAt: start, now: start.addingTimeInterval(600))
        #expect(summary.unplacedCount == 2)
    }

    @Test func elapsedMinutesRoundToAWholeBillableMinute() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d5555555-5555-4555-8555-555555555555", photo: true)],
            startedAt: start, now: start.addingTimeInterval(130 * 60))
        #expect(summary.elapsedMinutes == 130)
    }

    @Test func aVisitShorterThanAMinuteStillOffersOne_becauseZeroCannotBeLogged() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d6666666-6666-4666-8666-666666666666", photo: true)],
            startedAt: start, now: start.addingTimeInterval(20))
        #expect(summary.elapsedMinutes == 1)
    }

    @Test func aClockThatWentBackwardsNeverProducesANegativeEntry() {
        let summary = VisitReviewComposer.summarize(
            rows: [row("d7777777-7777-4777-8777-777777777777", photo: true)],
            startedAt: start, now: start.addingTimeInterval(-600))
        #expect(summary.elapsedMinutes == 1)
    }

    @Test func doneSaysNothingWhenNothingIsWaiting() {
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 0) == nil)
    }

    @Test func doneNamesWhatIsWaitingAndWhereItWaits() {
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 3)
                == "3 captures still unplaced — they'll wait on Today.")
        #expect(VisitReviewComposer.doneCaption(unplacedCount: 1)
                == "1 capture still unplaced — it'll wait on Today.")
    }

    @Test func theTimeOfferReadsAsHoursAndMinutes() {
        #expect(VisitReviewComposer.timeOffer(minutes: 130) == "Log 2h 10m as a site visit")
        #expect(VisitReviewComposer.timeOffer(minutes: 45) == "Log 45m as a site visit")
        #expect(VisitReviewComposer.timeOffer(minutes: 120) == "Log 2h as a site visit")
    }

    @Test func theCloseRecordBacksOffTheSameWayTheSiteRequestOutboxDoes() {
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 1) == 5)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 2) == 10)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 3) == 20)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 99) == 3_600)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/VisitReviewTests -quiet
```

Expected: **compile failure** — `cannot find 'VisitReviewComposer' in scope`.

- [ ] **Step 3: Write the composer**

Create `apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift`:

```swift
//  VisitReview.swift
//  CaptureKit
//
//  V4 — the close as output (§7.9, Flow 7). Everything V4 asserts about a
//  visit is derived here, from value types, so the screen holds no arithmetic.
//
//  ⚠ V4 groups Captures · Notes · Unplaced. §7.9 also names Scans; a scan is
//  not a Specimen and the device keeps no visit-keyed scan record, so counting
//  them would mean guessing. Scans stay in the portal's Room files block and a
//  room_scans.visit_id column is owed.
//
//  ⚠ elapsedMinutes is startedAt → now and never visit_ended_at.
//  commit_field_capture's upsert skips a status='saved' row without touching
//  it (00235:187-199), so a capture routed to the Library is immutable the
//  moment it commits and no close can stamp it.

import Foundation

public struct VisitReviewRow: Equatable, Sendable {
    public let specimenID: UUID
    public let hasPhoto: Bool
    public let hasTranscript: Bool
    public let roomName: String?
    public let isPlaced: Bool
    public let createdAt: Date

    public init(
        specimenID: UUID,
        hasPhoto: Bool,
        hasTranscript: Bool,
        roomName: String?,
        isPlaced: Bool,
        createdAt: Date
    ) {
        self.specimenID = specimenID
        self.hasPhoto = hasPhoto
        self.hasTranscript = hasTranscript
        self.roomName = roomName
        self.isPlaced = isPlaced
        self.createdAt = createdAt
    }
}

public struct VisitReviewSummary: Equatable, Sendable {
    public let photoCount: Int
    public let noteCount: Int
    public let unplacedCount: Int
    public let rooms: [String]
    public let elapsedMinutes: Int
}

public enum VisitReviewComposer {
    public static func summarize(
        rows: [VisitReviewRow],
        startedAt: Date,
        now: Date
    ) -> VisitReviewSummary {
        let ordered = rows.sorted { $0.createdAt < $1.createdAt }

        var rooms: [String] = []
        for row in ordered {
            guard let name = row.roomName?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                  !name.isEmpty, !rooms.contains(name) else { continue }
            rooms.append(name)
        }

        // A capture with a photo counts once, as a photo, even when she spoke
        // over it — Flow 2's headline capture is one thing, not two.
        let photos = ordered.filter(\.hasPhoto).count
        let notes = ordered.filter { !$0.hasPhoto && $0.hasTranscript }.count

        // duration_minutes has CHECK (… > 0) (00177:20). A sub-minute visit
        // still cost her a trip, so the floor is one minute, never zero.
        let elapsed = max(1, Int((now.timeIntervalSince(startedAt) / 60).rounded()))

        return VisitReviewSummary(
            photoCount: photos,
            noteCount: notes,
            unplacedCount: ordered.filter { !$0.isPlaced }.count,
            rooms: rooms,
            elapsedMinutes: elapsed)
    }

    /// Honest and non-blocking: Done always works, and says what is waiting.
    public static func doneCaption(unplacedCount: Int) -> String? {
        guard unplacedCount > 0 else { return nil }
        return unplacedCount == 1
            ? "1 capture still unplaced — it'll wait on Today."
            : "\(unplacedCount) captures still unplaced — they'll wait on Today."
    }

    public static func timeOffer(minutes: Int) -> String {
        let hours = minutes / 60
        let mins = minutes % 60
        let span: String
        if hours == 0 { span = "\(mins)m" }
        else if mins == 0 { span = "\(hours)h" }
        else { span = "\(hours)h \(mins)m" }
        return "Log \(span) as a site visit"
    }
}
```

- [ ] **Step 4: Write the close record**

Create `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift`, modelled on `SiteRequestOutboxRecord.swift` — `@Attribute(.unique) visitID`, a client-minted `timeEntryID` that never regenerates, `stateRaw` holding a `FieldWriteState`, and:

```swift
    public static func retryDelay(attempt: Int) -> TimeInterval {
        min(3_600, pow(2, Double(max(0, attempt - 1))) * 5)
    }
```

Then add it to the schema in `CaptureStore.swift`:

```swift
    public static let schema = Schema([
        Specimen.self, CapturePhoto.self, CaptureMeasurement.self, CaptureProjectRef.self,
        ScanUploadRecord.self,  // item 8 — durable resumable upload state (additive)
        SiteRequestOutboxRecord.self,
        FieldVisitCloseRecord.self  // wave 4 — the visit close's time entry (additive)
    ])
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (12 new `VisitReviewTests` cases), clean explicit swiftlint.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift \
        apps/mobile/Capture/CaptureTests/VisitReviewTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): what a visit produced, and a close that survives no signal"
```

---

### Task 15 — V4 Visit review, the close as output

**Model:** Opus. It edits a frozen enum and it is the screen the whole visit spine ends on.

**Files:**
- Create: `apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift`
- Create: `apps/mobile/Capture/CaptureTests/VisitReviewRowMappingTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift` (add the `Specimen` mapper)
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift` (**one** case on the frozen `CaptureRoute`)
- Modify: `apps/mobile/Capture/Capture/Features/Session/V1SessionTrayScreen.swift:153-157` (`endVisit` routes to V4 instead of popping to root)

**Interfaces:**
- Consumes: `VisitReviewComposer`, `VisitReviewSummary`, `VisitReviewRow` (Task 14); `CaptureSessionContextStore.endVisit(identity:now:)`; `CaptureScreenID.v4VisitReview` (wave 2 package 2-1 — confirm the spelling Task 0.4 recorded).
- Produces:

```swift
// CaptureKit
public extension VisitReviewRow {
    init(specimen: Specimen)
}

// CaptureNavigation — ⚠ the enum's header (CaptureNavigation.swift:4-6) marks
// it FROZEN and foundation-owner-only. This is that edit, and it is one case.
case visitReview(visitID: UUID)   // V4
```

**⚠ `endVisit` currently ends nothing.** `CaptureSessionContext.swift:157-169` replaces the context with a fresh one at `now` — no `endedAt`, no closed state, no record. Wave 3 package 3-2 changes that contract. This task assumes wave 3 landed it; if Task 0.4 found `endedAt` absent, **stop and raise it** rather than re-implementing wave 3 here.

**Screen (§7.9, verbatim where the spec gives copy):**

| Element | Copy |
|---|---|
| Title | `Visit review` |
| Groups | `Captures` · `Notes` · `Unplaced` (**not** *Scans* — see the deviation above) |
| Row | thumbnail (or a mic glyph) · title or first transcript line · room · sync state |
| Row acts | *Change room* → S1 · *Place* (unplaced only) · *Play* |
| Footer primary | `Done` |
| Footer caption | `3 captures still unplaced — they'll wait on Today.` (from `doneCaption`) |
| Empty state | `Nothing captured on this visit.` + `End anyway` |

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/VisitReviewRowMappingTests.swift`:

```swift
//  VisitReviewRowMappingTests.swift
//  CaptureTests
//
//  V4 reads Specimens and speaks in VisitReviewRows. The mapping is the only
//  part of the screen that can be tested at all (constraint C1: CaptureTests
//  links CaptureKit alone), so it carries the judgement calls — what counts as
//  a photo, what counts as placed — and the SwiftUI above it carries none.

import Foundation
import Testing
@testable import CaptureKit

struct VisitReviewRowMappingTests {
    @Test func aSpecimenWithNoPhotosAndNoWordsIsNeitherAPhotoNorANote() {
        let row = VisitReviewRow(specimen: Specimen())
        #expect(row.hasPhoto == false)
        #expect(row.hasTranscript == false)
    }

    @Test func aSpokenNoteCarriesItsTranscript() {
        let specimen = Specimen()
        specimen.voiceTranscript = "the alcove reads about forty-two"
        #expect(VisitReviewRow(specimen: specimen).hasTranscript)
    }

    @Test func aPartialTranscriptStillCountsAsWords() {
        let specimen = Specimen()
        specimen.voicePartialTranscript = "the alcove reads"
        #expect(VisitReviewRow(specimen: specimen).hasTranscript)
    }

    @Test func blankWordsDoNotCountAsANote() {
        let specimen = Specimen()
        specimen.voiceTranscript = "   \n "
        #expect(VisitReviewRow(specimen: specimen).hasTranscript == false)
    }

    @Test func aCaptureIsPlacedWhenItHasAProject_becauseFiledMeansProjectIDIsNotNull() {
        let specimen = Specimen()
        #expect(VisitReviewRow(specimen: specimen).isPlaced == false)

        specimen.venue = VenueStamp(projectId: "b2222222-2222-4222-8222-222222222222")
        #expect(VisitReviewRow(specimen: specimen).isPlaced)
    }

    @Test func theRowKeepsTheSpecimenIDSoTheScreenCanActOnIt() {
        let specimen = Specimen()
        #expect(VisitReviewRow(specimen: specimen).specimenID == specimen.id)
    }
}
```

⚠ `VenueStamp`'s initialiser signature is whatever wave 3 left it as — use the real one Task 0.4 recorded; the assertion is about `isPlaced`, not about the initialiser.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/VisitReviewRowMappingTests -quiet
```

Expected: **compile failure** — `'VisitReviewRow' cannot be constructed from a Specimen`.

- [ ] **Step 3: Write the mapper**

Append to `apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift`:

```swift
public extension VisitReviewRow {
    /// "Filed" is project_id IS NOT NULL (§9.2) — there is deliberately no
    /// terminal field_captures.status for it, because introducing one would
    /// silently revoke studio read (field_captures_org_inbox_select keys on
    /// status='inbox', 00233:175-186).
    init(specimen: Specimen) {
        let words = (specimen.voiceTranscript ?? specimen.voicePartialTranscript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.init(
            specimenID: specimen.id,
            hasPhoto: !specimen.photos.isEmpty,
            hasTranscript: !words.isEmpty,
            roomName: specimen.venue?.room,
            isPlaced: specimen.venue?.projectId?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false,
            createdAt: specimen.createdAt)
    }
}
```

- [ ] **Step 4: Add the route and the screen**

In `CaptureNavigation.swift`, add **one** case to `CaptureRoute`, in the Phase-2 block, with a comment naming this wave as the foundation-owner edit:

```swift
    case visitReview(visitID: UUID)                            // V4 — wave 4
```

Create `V4VisitReviewScreen.swift` rendering the table above from
`VisitReviewComposer.summarize(rows:startedAt:now:)` over the visit's Specimens, with:
- the three groups, each omitted entirely when empty;
- *Change room* pushing `CaptureSheet.assignVenue(specimenID)`, *Place* the same, *Play* the existing playback path;
- `Done` calling `sessionContext.endVisit(identity:now:)` then `coordinator.popToRoot()`;
- `VisitReviewComposer.doneCaption(unplacedCount:)` under `Done`, rendered only when non-nil;
- the empty state `Nothing captured on this visit.` with `End anyway` doing exactly what `Done` does.

In `V1SessionTrayScreen.swift`, change `endVisit()` so the *End visit* button **navigates to V4** instead of ending immediately — V4's `Done` becomes the only thing that calls `sessionContext.endVisit`:

```swift
    private func endVisit() {
        coordinator.navigate(to: .visitReview(visitID: sessionContext.current.visitID))
    }
```

- [ ] **Step 5: Run the gate**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (6 new `VisitReviewRowMappingTests` cases; `CaptureScreenIDTests.everyScreenIDIsUnique` still green), clean explicit swiftlint.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift \
        apps/mobile/Capture/CaptureTests/VisitReviewRowMappingTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Session/VisitReview.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift \
        apps/mobile/Capture/Capture/Features/Session/V1SessionTrayScreen.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): V4 — ending a visit is a receipt that produces something

Adds one case to the frozen CaptureRoute enum (CaptureNavigation.swift:4-6);
foundation owner for this edit is the Field Companion wave-4 lane."
```

---

### Task 16 — One tap logs the visit as the hours it took

**Model:** Sonnet.

**Files:**
- Create: `apps/mobile/Capture/Capture/Features/Session/VisitCloseOutboxDrainer.swift`
- Create: `apps/mobile/Capture/CaptureTests/FieldVisitCloseRecordTests.swift`
- Modify: `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift` (the state helpers)
- Modify: `apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift` (one more insert)
- Modify: `apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift` (the offer)

**Interfaces:**
- Consumes: `FieldVisitCloseRecord`, `VisitReviewComposer.timeOffer(minutes:)` (Task 14); `FieldWriteState`, `FieldWriteClassifier` (Task 9); `project_time_entries.source = 'field_visit'` (Task 8).
- Produces:

```swift
// CaptureKit
public extension FieldVisitCloseRecord {
    var state: FieldWriteState { get set }
    func markDelivered()
    func markFailed(_ message: String, now: Date)
    func isDue(at now: Date) -> Bool
}

public struct TimeEntryWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let userID: UUID
    public let startedAt: Date
    public let durationMinutes: Int   // ALWAYS > 0 — never a running timer
    public let source: String         // always "field_visit"
    public let activity: String       // always "site_visit"
    public let notes: String?
}

public protocol TimeEntryGateway: Sendable {
    func existingTimeEntry(id: UUID) async throws -> Bool
    func insertTimeEntry(_ request: TimeEntryWriteRequest) async throws
}
```

**⚠ `durationMinutes` is non-optional and the composer floors it at 1.** `project_time_entries` has `CHECK (duration_minutes IS NULL OR duration_minutes > 0)` (`00177:20`) and `uniq_project_time_entries_running_timer` (`00177:39-41`) is a partial UNIQUE index on `(user_id) WHERE duration_minutes IS NULL`. A NULL from Field would either take her desk TimerButton's only slot or fail on that index. There is no code path in this wave that can produce a NULL — that is deliberate and it is why the type is not optional.

**FC-R3's relationship, made real.** One act writes both rows: the Visits row (derived from the captures, Task 5) and the Hours entry. *The Visits block is the record; the Hours entry is its billing shadow.* The `notes` field carries the visit's label so the two read as one event: `Maple St · Living, Dining`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/Capture/CaptureTests/FieldVisitCloseRecordTests.swift`:

```swift
//  FieldVisitCloseRecordTests.swift
//  CaptureTests
//
//  She closes a visit standing in a house with one bar. The close record is
//  durable, backs off, and its client-minted timeEntryID never regenerates —
//  the same three properties SiteRequestOutboxRecord ships.

import Foundation
import Testing
@testable import CaptureKit

struct FieldVisitCloseRecordTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func record() -> FieldVisitCloseRecord {
        FieldVisitCloseRecord(
            visitID: UUID(uuidString: "e1111111-1111-4111-8111-111111111111")!,
            timeEntryID: UUID(uuidString: "e2222222-2222-4222-8222-222222222222")!,
            projectID: "e3333333-3333-4333-8333-333333333333",
            ownerUserID: "e4444444-4444-4444-8444-444444444444",
            startedAt: now.addingTimeInterval(-130 * 60),
            endedAt: now,
            durationMinutes: 130)
    }

    @Test func aFreshRecordIsPendingAndDueImmediately() {
        let r = record()
        #expect(r.state == .pending)
        #expect(r.isDue(at: now))
    }

    @Test func aFailureSchedulesTheNextAttemptRatherThanSpinning() {
        let r = record()
        r.markFailed("offline", now: now)

        #expect(r.state == .failed)
        #expect(r.retryCount == 1)
        #expect(r.isDue(at: now) == false)
        #expect(r.isDue(at: now.addingTimeInterval(5)) == true)
    }

    @Test func backoffMatchesTheSiteRequestOutboxFormulaExactly() {
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 1) == 5)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 4) == 40)
        #expect(FieldVisitCloseRecord.retryDelay(attempt: 99) == 3_600)
    }

    @Test func deliveringClosesTheRecordForGood() {
        let r = record()
        r.markFailed("offline", now: now)
        r.markDelivered()

        #expect(r.state == .written)
        #expect(r.isDue(at: now.addingTimeInterval(86_400)) == false)
        #expect(r.lastError == nil)
    }

    @Test func theTimeEntryIDNeverRegenerates_soAReplayIsANoOp() {
        let r = record()
        let first = r.timeEntryID
        r.markFailed("offline", now: now)
        r.markFailed("offline again", now: now.addingTimeInterval(10))
        #expect(r.timeEntryID == first)
    }

    @Test func theRequestIsAlwaysACompletedEntry_neverARunningTimer() throws {
        let r = record()
        let request = TimeEntryWriteRequest(
            id: r.timeEntryID,
            projectID: UUID(uuidString: r.projectID)!,
            userID: UUID(uuidString: r.ownerUserID)!,
            startedAt: r.startedAt,
            durationMinutes: r.durationMinutes,
            source: "field_visit",
            activity: "site_visit",
            notes: "Maple St · Living, Dining")

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["source"] as? String == "field_visit")
        #expect(json["activity"] as? String == "site_visit")
        #expect((json["duration_minutes"] as? Int ?? 0) > 0)
        #expect(json["notes"] as? String == "Maple St · Living, Dining")
        #expect(json["project_id"] as? String == r.projectID.uppercased()
                || json["project_id"] as? String == r.projectID)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
  -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
  CODE_SIGNING_ALLOWED=NO -only-testing:CaptureTests/FieldVisitCloseRecordTests -quiet
```

Expected: **compile failure** — `value of type 'FieldVisitCloseRecord' has no member 'isDue'`, `cannot find 'TimeEntryWriteRequest' in scope`.

- [ ] **Step 3: Finish the record and the request**

Add to `FieldVisitCloseRecord.swift` the `state` accessor over `stateRaw`, `markDelivered()`, `markFailed(_:now:)` (increments `retryCount`, sets `nextAttemptAt = now + retryDelay(attempt: retryCount)`), and `isDue(at:)` (`state != .written && state != .refused && (nextAttemptAt == nil || nextAttemptAt! <= now)`), mirroring `SiteRequestOutboxRecord.swift:100-129`.

Add `TimeEntryWriteRequest` and `TimeEntryGateway` to the same file, with `CodingKeys` mapping to `id / project_id / user_id / started_at / duration_minutes / source / activity / notes`.

- [ ] **Step 4: Write the drainer and the offer**

Create `VisitCloseOutboxDrainer.swift` mirroring `SiteRequestOutboxDrainer.swift`: fetch every `FieldVisitCloseRecord` where `isDue(at: Date())`, insert through the gateway with lookup-before-write, then `markDelivered()`; on error, classify with `FieldWriteClassifier` and `markFailed` / leave pending / mark refused.

Add `TimeEntryGateway` conformance to `SupabaseFieldWriteGateway` (`existingTimeEntry` / `insertTimeEntry` over `project_time_entries`, the same `rowExists` helper).

In `V4VisitReviewScreen.swift`, put the offer above `Done`:

```swift
Button(VisitReviewComposer.timeOffer(minutes: summary.elapsedMinutes)) {
    offerAccepted = true
    store.insert(FieldVisitCloseRecord(
        visitID: visitID,
        timeEntryID: UUID(),
        projectID: projectID,
        ownerUserID: identity.userID ?? "",
        startedAt: context.startedAt,
        endedAt: Date(),
        durationMinutes: summary.elapsedMinutes))
}
```

One tap, one row, and after it the button reads `Logged.` and is disabled. The offer is hidden entirely when the visit has no project — `project_time_entries.project_id` is NOT NULL.

- [ ] **Step 5: Run the gate**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
scripts/capture-gate.sh all
swiftlint --strict
```

Expected: `✔ build`, `✔ tests` (6 new `FieldVisitCloseRecordTests` cases), clean explicit swiftlint.

- [ ] **Step 6: Commit**

```bash
cd /Users/kody/Code/patina-merged
git add apps/mobile/Capture/Capture/Features/Session/VisitCloseOutboxDrainer.swift \
        apps/mobile/Capture/CaptureTests/FieldVisitCloseRecordTests.swift \
        apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift \
        apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift \
        apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift \
        apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
git commit -m "feat(capture): the close offers the visit as logged hours, never as a running timer"
```

---

### Task 17 — The Library says where a piece came from

**Model:** Haiku. One chip, one column that already carries data.

**⚠ If Task 0.3 recorded that Wave 1P already shipped the provenance chip, do not rebuild it — but do NOT simply skip.** The program plan §1.4 moves package 4-12 into Wave 1P and the wave-4 scope list still names it, so building it twice is worse than either. **Read what shipped first**, because the two defects ruling 4 corrects are the ones any independent implementation would also have made: a `capture_provenance.venueLabel` read that can never resolve (there is no such key — see below), and a `created_at` date on a provenance chip. If Wave 1P's chip has either, this task becomes a **two-line fix** to that file plus the `useLayerProducts` widening, and Steps 1–2 become "add the failing cases to the existing suite".

**Files:**
- Create: `apps/designer-portal/src/lib/library/capture-provenance.ts`
- Create: `apps/designer-portal/src/lib/library/__tests__/capture-provenance.test.ts`
- Modify: `apps/designer-portal/src/components/document/rooms/library/library-card.tsx` (widen `LibraryItem`, render the chip)
- Modify: `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx:113-125` (pass the two columns through to `LibraryCard`)
- Modify: `packages/supabase/src/hooks/use-layer-products.ts:85-87` (widen the explicit select list and its `LayerProductRow` interface at `:37-53`)

**Interfaces:**
- Consumes: `products.capture_source` (migration `00232:20-23`; the CHECK at `00232:27-33` admits `('web_extension','portal','field_capture','manual','import')`, and `commit_field_capture` mints `'field_capture'`, the extension `'web_extension'` — `apps/extension/src/lib/payloads.ts:45`). **No portal surface reads it today.**

**⚠ The venue is not in `capture_provenance`, and never will be (ruling 4, review F2).** `commit_field_capture` copies `v_capture.provenance` **verbatim** into `products.capture_provenance` (`00235:236,241`), and `field_captures.provenance` is `COALESCE(v_payload->'provenance', '{}')` (`00235:132`) — i.e. `FieldCapturePayload.provenance`, i.e. `Specimen.provenanceRaw`, a `[String: String]` of `FieldKey.rawValue → ProvenanceSource.rawValue` (`Specimen.swift:89`, written at `Specimen+Accessors.swift:155`) plus `ContextCaptureProvenance`'s `siteScanContext.*` keys (`ContextCaptureProvenance.swift:66-75`). **There is no `venueLabel` key in either set.** The plan's original chip read one, so its headline copy could never have rendered. ⚠ `00232:54-55`'s comment calls `capture_provenance` a *"bundle copied from the originating capture (device, venue, guesses, etc.)"* — that comment is wrong about what 00235 does; do not plan from it.

**Where the venue actually is, and how this task reads it.** `field_captures.venue_label` (`00233:86`, written from `v_payload#>>'{venue,label}'` at `00235:137`), one FK hop away: `products.field_capture_id → field_captures(id)`, constraint `products_field_capture_id_fkey` (`00233:140-148`). So `useLayerProducts` embeds it rather than the chip inventing it. ⚠ **RLS makes that embed the owner's only.** `field_captures_owner_select` is `designer_id = auth.uid()` (`00233:155-157`) and the org policy requires `status = 'inbox'` (`00233:175-186`), while a Library capture is `'saved'` — so a studio peer reads `null` and the chip degrades to `Field · Mar 2026`. That is the honest degrade, not a bug, and the test pins it.

**⚠ `products.captured_at` exists and is the right date (review F3).** It is not a capture-era column at all — `00001_initial_schema.sql:41`, `TIMESTAMPTZ NOT NULL`, indexed at `:50` — and `commit_field_capture` populates it explicitly (`00235:235` column, `00235:240` value, resolved at `00235:83` from `venue.capturedAt`). Use it, **not `created_at`**: `created_at` is row-insert time, so a piece found at High Point in March and committed from a hotel in April renders `Field · Apr 2026` on a chip whose entire purpose is provenance.

- Produces:

```ts
export function captureProvenanceChip(product: {
  capture_source?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  field_capture?: { venue_label?: string | null } | null;
}): string | null;
```

`LibraryItem` (`library-card.tsx:31-41`) gains `capture_source?: string | null`, `captured_at?: string | null` and `field_capture?: { venue_label: string | null } | null` — the only change to its shape. The card's own docstring already states the rule this chip obeys: *"a card shows only what its row truthfully carries."*

Returns `null` for anything that is not a field capture — which is every product in the library today.

**Copy** (spec §6 Flow 6, verbatim): `Field · High Point, Mar 2026`. Venue then month then year; the venue is dropped when it is not readable, leaving `Field · Mar 2026`.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/lib/library/__tests__/capture-provenance.test.ts`:

```ts
/**
 * The Library provenance chip (§6 Flow 6). products.capture_source has carried
 * data since 00232 and no portal surface has ever read it.
 */
import { captureProvenanceChip } from '../capture-provenance';

describe('captureProvenanceChip', () => {
  it('says nothing about a product that was not captured in the field', () => {
    expect(captureProvenanceChip({})).toBeNull();
    expect(captureProvenanceChip({ capture_source: 'web_extension' })).toBeNull();
    expect(captureProvenanceChip({ capture_source: null })).toBeNull();
  });

  it('names the venue and the month she found it', () => {
    expect(
      captureProvenanceChip({
        capture_source: 'field_capture',
        field_capture: { venue_label: 'High Point' },
        captured_at: '2026-03-14T18:00:00Z',
      }),
    ).toBe('Field · High Point, Mar 2026');
  });

  it('reads the date she was there, not the date the row was inserted', () => {
    // She photographed it at High Point in March and committed it from a hotel
    // in April. created_at is April; the chip is about provenance.
    expect(
      captureProvenanceChip({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T18:00:00Z',
        created_at: '2026-04-02T09:00:00Z',
      }),
    ).toBe('Field · Mar 2026');
  });

  it('falls back to created_at only when there is no captured_at', () => {
    expect(
      captureProvenanceChip({
        capture_source: 'field_capture',
        created_at: '2026-04-02T09:00:00Z',
      }),
    ).toBe('Field · Apr 2026');
  });

  it('drops the venue rather than inventing one — the co-member case', () => {
    // field_captures_owner_select is designer_id = auth.uid(), so a studio peer
    // reads no capture at all and the embed comes back null.
    expect(
      captureProvenanceChip({
        capture_source: 'field_capture',
        field_capture: null,
        captured_at: '2026-03-14T18:00:00Z',
      }),
    ).toBe('Field · Mar 2026');
    expect(
      captureProvenanceChip({
        capture_source: 'field_capture',
        field_capture: { venue_label: null },
        captured_at: '2026-03-14T18:00:00Z',
      }),
    ).toBe('Field · Mar 2026');
  });

  it('still names the lane when it has no date either', () => {
    expect(captureProvenanceChip({ capture_source: 'field_capture' })).toBe('Field');
  });

  it('ignores a date it cannot parse', () => {
    expect(
      captureProvenanceChip({ capture_source: 'field_capture', captured_at: 'nonsense' }),
    ).toBe('Field');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/lib/library/__tests__/capture-provenance.test.ts
```

Expected: FAIL with `Cannot find module '../capture-provenance'`.

- [ ] **Step 3: Write it**

Create `apps/designer-portal/src/lib/library/capture-provenance.ts`:

```ts
/**
 * "Field · High Point, Mar 2026" — where a piece on the My Library shelf came
 * from (§6 Flow 6). products.capture_source has carried 'field_capture' since
 * 00232 and no portal surface has ever read it.
 *
 * ⚠ The venue is NOT in capture_provenance. That column is a verbatim copy of
 * field_captures.provenance (00235:241), which is Specimen.provenanceRaw — a
 * FieldKey → ProvenanceSource map. The venue lives on field_captures.venue_label
 * (00233:86) and arrives here through the embed useLayerProducts adds on
 * products_field_capture_id_fkey. When the caller is not the capture's owner
 * that embed is null (field_captures_owner_select, 00233:155-157) and the chip
 * simply says less — it never guesses a venue.
 *
 * ⚠ The date is captured_at (00001:41, populated 00235:240) — the moment she was
 * there — with created_at only as a fallback for a row that predates it.
 *
 * Dependency-free: no date library, no component import.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function captureProvenanceChip(product: {
  capture_source?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  field_capture?: { venue_label?: string | null } | null;
}): string | null {
  if (product.capture_source !== 'field_capture') return null;

  const label = product.field_capture?.venue_label;
  const venue = typeof label === 'string' && label.length > 0 ? label : null;

  let when: string | null = null;
  const stamp = product.captured_at ?? product.created_at;
  if (stamp) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) {
      when = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
  }

  const tail = [venue, when].filter(Boolean).join(', ');
  return tail ? `Field · ${tail}` : 'Field';
}
```

Widen `useLayerProducts` (`packages/supabase/src/hooks/use-layer-products.ts`) — the select at `:85-87` and the `LayerProductRow` interface at `:37-53`:

```ts
        .select(
          "id, name, brand, price_retail, price_trade, images, source_url, status, category, configuration_mode, configuration_summary, layer, owner_user_id, studio_id, created_at, " +
            // Field provenance (§6 Flow 6). The venue is not on products and is
            // not in capture_provenance either; it is one FK hop away, and the
            // embed resolves to null for anyone but the capture's owner.
            "capture_source, captured_at, field_capture:field_captures!products_field_capture_id_fkey(venue_label)",
        )
```

```ts
  created_at: string;
  capture_source: string | null;
  captured_at: string | null;
  field_capture: { venue_label: string | null } | null;
```

Render it in `LibraryCard` as a quiet mono chip under the piece's name, hidden when `null`:

```tsx
{captureProvenanceChip(item) ? (
  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
    {captureProvenanceChip(item)}
  </span>
) : null}
```

and widen `LibraryItem` plus the object literal `library-shelf.tsx:113-125` builds, so the three fields reach the card. ⚠ `useLayerProducts` is shared by the personal, studio and catalog shelves, so this widening touches all three reads; every added field is nullable and every existing consumer keys by name, so nothing else changes shape. Run `pnpm --filter @patina/supabase test` as well as the portal suite.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /Users/kody/Code/patina-merged/apps/designer-portal
pnpm jest src/lib/library/__tests__/capture-provenance.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Gate and commit**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm lint --filter designer-portal
git add apps/designer-portal/src/lib/library/capture-provenance.ts \
        apps/designer-portal/src/lib/library/__tests__/capture-provenance.test.ts \
        apps/designer-portal/src/components/document/rooms/library/library-card.tsx \
        apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx \
        packages/supabase/src/hooks/use-layer-products.ts
git commit -m "feat(library): a field find says where it was found"
```

---

### Task 18 — Wave gate: the browser proof, the device pass, and the report

**Model:** Sonnet for the runs; Kody holds the device.

**Files:**
- Create: `docs/design/field-companion/plans/wave-4-report.md`

**Interfaces:**
- Consumes: everything Tasks 1–17 produced.
- Produces: the wave report, and the four acceptance answers §4 of the program plan asks for.

**⚠ Nothing in this task may be answered from a green gate.** `capture-gate.sh build` is a Simulator compile gate with `CODE_SIGNING_ALLOWED=NO`, and `patina-ios-verification` forbids installing such a build for a walk. The SQL runner is superuser and proves no RLS. The two claims this wave rests on — *renders nothing on a field-less project* and *a punch item reaches the GC* — are browser and device claims.

- [ ] **Step 1: Run every gate and record both numbers where there are two**

```bash
cd /Users/kody/Code/patina-merged
pnpm type-check
pnpm build --filter designer-portal
pnpm lint --filter designer-portal
cd apps/designer-portal && pnpm jest src/lib/document src/components/document src/hooks src/lib/library && cd ../..
pnpm --filter @patina/supabase test
scripts/run-sql-tests.sh -f margin_items_note_field_capture
scripts/run-sql-tests.sh -f project_task_field_capture_ref
scripts/run-sql-tests.sh -f time_entry_field_visit_source
scripts/run-sql-tests.sh
cd apps/mobile/Capture && scripts/capture-gate.sh all && swiftlint --strict
```

Expected: every command exits 0; the **full** SQL suite exits 0 with exactly the **22** documented known failures from `supabase/tests/KNOWN_FAILURES.md` — record the count, and treat any 23rd as a real regression. Record `swiftlint --strict` separately from `capture-gate.sh lint`, which exits 0 without swiftlint installed (C2).

- [ ] **Step 2: The field-less browser proof (FC-R10, acceptance criterion 2)**

Open a designer-portal document for a project that has **never** had a Field capture, side by side with a screenshot taken before this wave:

```bash
cd /Users/kody/Code/patina-merged
grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local   # ⚠ confirm it is NOT Strata prod
pnpm dev:minimal
```

Then, at `/doc/<id>`:
1. The **Visits** block is absent — not empty, absent.
2. `RoomFilesSection` — record whether it is **mounted at all**. As of this plan's writing Wave 1P had **not** mounted it, so this is not a regression check on something that shipped; it is a statement of what is on the spread. If Wave 1P mounted it before this wave landed, confirm it renders nothing on a field-less project (its own criterion); if it did not, say so and carry the mount as still owed (§11.2).
3. A typed R14 margin note renders exactly as before: its lede, its author, its two escalation actions. No draft line, no play button, no photo strip.
4. The Work block's task lines carry no thumbnails.

Capture one screenshot per point. **This is criterion 2 and nothing else can stand in for it.**

- [ ] **Step 3: The fielded browser proof (acceptance criteria 1, 3, 4)**

On a project with field data:
1. A note spoken on site appears in the margin **with its full body rendered** and a working play button — play it, hear it. (criterion 1)
2. Its photo strip renders the photos it was taken with.
3. Click **→ Client decision** and confirm the decision's text is the whole note, not eighty characters.
4. The **Visits** block lists the visit with its day, its rooms and its tally, and expands to the captures — each capture showing its thumbnail and **the first line only** of its transcript, with *Read it in the margin* linking to the same note the rail carries. Confirm at ≥1440px that the link lands on the margin item. **Then look at the rail with six visits' worth of notes in it and say, in the report, whether it drowned** — that is the ruling-1 duplication question, and Task 18 is where it gets an answer.
5. A punch item raised from Field appears in the install section's Work block **with its photo**, owned by the GC. (criterion 3)
6. `RoomFilesSection` shows the designer's own scan and its row reaches a live Room File page — which requires the `room-file` flag to be **on for the pilot cohort** (FC-R10's named prerequisite). If it is still off, say so in the report as an unmet prerequisite; do not call the wave delivered around it. (criterion 4)

- [ ] **Step 4: The device pass (C5 — a signed build, never `capture-gate.sh build`)**

```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture
ruby scripts/generate_project.rb
xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug \
  -destination 'platform=iOS,id=<UDID>'
```

On a real iPhone, on a real project, walk this once:
1. Open a visit. Photograph something, hold the mic, speak a sentence longer than eighty characters. Save.
2. **Do nothing at all** (ruling 1). Confirm the margin note appears in the portal with the whole sentence **without any tap** — the drain filed it. Then confirm the ⋯ menu shows *"Filed in the Document."* rather than offering to file it again, and that exactly **one** `margin_notes` row exists for that capture.
3. **⋯ → Make it a punch item.** Read the line under the confirm button and check it against the party's real `sms_consent_status`. On a project with a consented GC it must read *"<name> will get a text."*, the text must arrive, and the card must switch to *"Filed. <name> was texted."* only after the row is written. On a project with **no** consented GC it must read *"No general contractor with texting on this project — this stays as your task."* — **and the row that lands must be `owner='designer'`, not a gc-owned orphan.** Verify sends against `sms_messages` (a row with `twilio_status`), never by assumption. ⚠ **On a project carrying a consented sub or installer as well as a GC, confirm the sub is never texted** — that is ruling 2's whole point and it is only observable here.
4. **⋯ → Make it a task.** Confirm a `project_tasks` row owned by `designer`.
5. **Airplane mode.** Repeat the note (walk out of the visit and back in on a fresh capture) and 3. Confirm the card says the work is queued, nothing is lost, and both rows land when signal returns — and that **neither is written twice**, which is the whole claim of the client-minted id. Force-quit and relaunch mid-queue at least once.
6. **End visit → V4.** Confirm the groups, the room lines, and the unplaced caption. Tap the time offer. Confirm one `project_time_entries` row with `source='field_visit'`, `activity='site_visit'`, `duration_minutes > 0` — and confirm the portal's TimerButton still starts and stops normally afterward (the running-timer index is shared).
7. **The FC-R8 degrade, twice** (ruling 3). Sign in as a studio co-member who is not the project's designer of record and tap *Make it a task*. Confirm she reads *"Tasks on this project belong to its designer of record. Saved as a note in the Document instead."* and that a `margin_notes` row actually lands, carrying the task's title, its context, and the line *"Couldn't assign — you're not this project's owner."* **Then do it again with the C3 card off screen** — background the app the instant after Add, so the drain takes the 42501 with no UI attached — and confirm the note lands anyway. That second run is the one the ruling exists for; the first only proves the card.

- [ ] **Step 5: Write the report**

Create `docs/design/field-companion/plans/wave-4-report.md` with:
- **What shipped**, one line per task, with the commit SHA.
- **The four acceptance answers** (§4 of the program plan), each with its evidence — a screenshot, a row id, or an `sms_messages` row. An answer with no evidence is an open item, not an answer.
- **Gate results**: every command from Step 1 with its exit code, the SQL known-failure count, and `swiftlint --strict` reported separately from `capture-gate.sh lint`.
- **What this wave does NOT do**, restated so it cannot be re-discovered: no project-general media table (FC-R15 defers it); no `room_scans.visit_id`, so the Visits row counts photos and notes only; no `project_tasks.room_id`, so a punch item's room rides in its description; no scan count in V4; **no party picker — a Field punch is GC-court-only in v1 (ruling 2), and a picker for subs and installers is owed**; **no per-visit fold in the margin rail (ruling 1)**; no G2 live camera (spec §16 non-goal 15 puts it in this wave, and the wave-4 scope this plan was written to does not include it — carry it as an open item, not as a silent omission).
- **The Agent-OS question, answered once so it is not re-litigated:** *the device sends nothing.* It writes a `project_tasks` row that a live, consent-gated database trigger may turn into a text. The designer names the party and confirms before the row is written; the database re-reads consent before the text goes out (`00284:160-203`). This is the same path the portal's own task assignment has taken since 00284, and it is human-initiated end to end — so AGENTS.md's *"no automated external sends"* rule is satisfied, not waived. Ruling 2 is what makes it true: the party she was told about is the only party that can be routed to.
- **Owed decisions this wave created or deferred**, each with what would settle it:
  - **The margin's volume (ruling 1).** Every in-visit note now files itself, so the rail carries every note on the project. Step 3 point 4 asks you to look at a six-visit project and say whether it drowned. If it did, §11.4's per-visit fold is the remedy and it is a wave-5 item.
  - **The Visits→margin link below 1440px.** The anchor lands in the full rail; in the sheet the panel is `inert` until the *Margin* trigger is tapped, so the link does nothing there. Opening the sheet from a link is a margin-rail change with its own tests.
  - **A party picker for a punch item** (FC-R7's `court_party_id`, answered *GC-only, v1*).
  - **`commit_field_capture` merging `venue_label` into `capture_provenance`**, which would let the Library chip read the venue without an embed — and would let a studio peer see it. It belongs to whichever lane next replaces that function (FC-R18's shared object), not to this wave.
- **Open prerequisites**: whether `room-file` was enabled for the pilot cohort and by whom; whether `room-file-copy.ts`'s ESCALATE-class strings got their brand-voice pass (§17.4 budgets it as a wave-4 line item beside the mount); whether `00530` reached `main` and Strata before Tasks 1 and 5 drew their numbers (Task 0.1's gate).

- [ ] **Step 6: Commit and merge the wave branch**

```bash
cd /Users/kody/Code/patina-merged
git add docs/design/field-companion/plans/wave-4-report.md
git commit -m "docs(field-companion): wave-4 report — it lands in the Document"
```

Then fast-forward `feat/field-companion-w4` into `main` at the wave gate, and retire the worktree.

**⚠ Prod push is the orchestrator's, never a lane agent's**, and only after an explicit request in the session: `supabase db push` (after re-checking `supabase migration list` against Strata one final time), then `./infra/deploy-portal.sh designer-portal` — which is **the only** portal deploy path; the raw OpenNext build path is forbidden by house rule and ships a stale workspace dist. Verify with `wrangler deployments list` (oldest-first — read the **bottom** row) plus a behaviour probe; `/version` returns static defaults and proves nothing. **Rollback:** revert the portal deploy; all three migrations are additive, and the view replace is reversed by re-applying `00282:606-909` verbatim.

---

## Appendix — what this plan could not plan, and why

| Spec item | Why it is not a task here |
|---|---|
| Package **4-1** (`useCaptureMediaUrls`), **4-5** (mount `RoomFilesSection` + the designer-scan union), **4-11 render half** (`receiving_inspections.photo_asset_ids`) | Wave 1P is delivering them now (program plan §1.4). Task 0.2/0.3 verifies what actually landed, and Tasks 3, 6 and 13 consume the hook rather than rebuilding it. |
| Package **4-7** (`designer_client_id` onto the `FieldProject` DTO) | **Dropped.** Its only consumer was `create_client_decision`, which FC-R7 removed from the punch path. Full reasoning in *Why package 4-7 is dropped* above. |
| Package **4-11**, the **G2 live camera** half | Outside the scope this plan was written to (which enumerates 4-2, 4-3, 4-4, 4-6, 4-7, 4-8, 4-9, 4-10, 4-12, 4-13). Spec §16 non-goal 15 does place it in wave 4 — *"wave 4 gives it a live camera, not a new pipeline"* — so it is carried as an open item in Task 18's report rather than silently dropped. It needs its own plan: the Receiving upload path is the NestJS media service, not `capture-media`, and non-goal 15 forbids unifying them. |
| §11.5 **The Desk** line (*"Maple St · visit open since Tuesday"*) | Spec assigns it to wave 5. |
| §11.3's **scan count** on a Visits row; §7.9's **Scans** group in V4 | No visit key exists on `room_scans` and none is drawn from the 00530–00535 band. Refused rather than guessed; declared in *Two contradictions* above and restated in the report. |
| §11.4's **per-visit fold in the margin rail** | Ruling 1 makes every in-visit note file itself, so the rail now carries every note on the project — the volume §11.4 warned about. The fold is §11.4's own remedy and it is a **deferred decision, not a dropped one**: Task 18 step 3 point 4 looks at a six-visit project and Task 18's report carries the answer. Building it blind, in this wave, would be a rail rewrite decided by nobody. |
| A **party picker** for a Field punch item (FC-R7's `court_party_id`) | Ruling 2 answers the ruling's question — *court-level, GC-only, v1; the party is attached at the desk* — and refuses the picker rather than shipping array-order routing. Owed, named, and in Task 18's report. |
| Merging `field_captures.venue_label` into `products.capture_provenance` | It would make §6 Flow 6's chip readable by a studio peer and drop Task 17's embed. It is a `CREATE OR REPLACE commit_field_capture`, i.e. the shared FC-R18 object, and belongs to whichever lane next replaces that function. Task 17 ships the embed and names this. |
| §14 **telemetry** | Not in the wave-4 scope this plan was written to. Tasks 11 and 12 emit `field.margin_note.ok` / `field.punch_task.ok` because the drain already had an analytics seam in hand; a telemetry pass is not planned here. |
| §17.4's **brand-voice pass on `room-file-copy.ts`** | It rides Wave 1P's mount, not this wave's code. Carried as an open prerequisite in Task 18's report with a named owner. |
| The **`room-file` flag** for the pilot cohort (FC-R10's named prerequisite) | A decision with an owner, not code. Task 18 Step 3 refuses to call criterion 4 met while it is off. |
