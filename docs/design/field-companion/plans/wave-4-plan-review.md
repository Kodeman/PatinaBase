# Wave 4 — "It lands in the Document" · Adversarial plan review

**Reviewed:** `docs/design/field-companion/plans/wave-4-plan.md` (5,489 lines, 19 tasks) and its three SQL
companions under `docs/design/field-companion/plans/sql/`.
**Date:** 2026-08-24 · **Method:** read-only against `/Users/kody/Code/patina-merged` @ `main` `27fdaf130`, plus
live `git fetch` of the three wave branches, plus **execution of all three migrations and all three of their
SQL tests against the running local Postgres inside `BEGIN … ROLLBACK`** (env verified local:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `/tmp/patina-local-supabase-db.lock` absent). No git
mutations. No remote touched.

---

## Verdict: **READY-WITH-FIXES**

This is the strongest plan in the set. Its SQL is real and provably correct, its citations are overwhelmingly
accurate, its gates are the actual gates, and it refuses to guess in four separate places where guessing would
have been easier. Nineteen tasks, nineteen `**Model:**` / `**Files:**` / `**Interfaces:**` blocks, zero
placeholders.

It is not ready to dispatch because of **one ruling violation and four real defects**, all bounded and all with
exact edits below:

| # | Severity | What |
|---|---|---|
| **F1** | **Critical** | The plan decides the automatic-margin-note question **against** the orchestrator's binding 2026-08-24 ruling |
| **F2** | High | Task 17's provenance chip reads a key that does not exist — its headline copy can never render |
| **F3** | High | Task 17 asserts `products.captured_at` does not exist. It does, and it is the right column |
| **F4** | High | `PunchCourtResolver` can text the wrong trade, and FC-R7's `court_party_id` question is silently auto-answered |
| **F5** | Med-High | The FC-R8 degrade lives only in the UI; the drain that produces the 42501 has no fallback |

Everything below F5 is improvement, not blockage.

---

## Live verification: the three migrations and their tests are green

Run against `127.0.0.1:54322`, each inside an explicit transaction that was **rolled back**. (One caveat: my
first pass of the margin file ran under `psql -1`, whose outer transaction the file's own `COMMIT` closed, so it
committed to the local dev DB. I restored it immediately — re-applied `00282:606-909` verbatim and dropped the
added column and index — and verified restoration: `pg_get_viewdef(margin_items) LIKE '%field_capture_id%'` →
`f`, `margin_notes.field_capture_id` column count → `0`. **Anyone re-running these files locally must strip the
file's own `BEGIN;`/`COMMIT;` first**; a bare `psql -1 -f` will commit them.)

| File | Result |
|---|---|
| `005NN_margin_notes_field_capture.sql` | Applies clean. Its test — the one Task 1 authors — passes: *"margin_items note/field-capture: all 7 cases passed."* |
| `005NN_project_task_field_capture_ref.sql` | Applies clean; **idempotent** on a second run in the same txn. Test: *"all 6 cases passed."* FK `confdeltype = 'n'` — **ON DELETE SET NULL confirmed** |
| `005NN_time_entry_field_visit_source.sql` | Applies clean; **idempotent**. Test: *"all 5 cases passed."* A live `INSERT … source='field_visit', activity='site_visit', duration_minutes=45` succeeds |

**Why this worked, and the trap inside it.** The local DB already carries the wave-1 columns
(`capture_kind`, `voice_audio_segments`, `transcript_source`, `note_setting`, `audio_retention`,
`voice_audio_purged_at`) and a `supabase_migrations.schema_migrations` row `00530 |
field_capture_notes_and_routing`. That migration is committed in the **untracked-from-`main`** worktree
`.claude/worktrees/field-companion-w1/supabase/migrations/00530_field_capture_notes_and_routing.sql`, on the
local `feat/field-companion-w1` branch, **unpushed**. So the plan's claim that the three files were
"syntax-validated against a live local Postgres" is true — but only because that worktree's work is applied
locally. It will not hold after `pnpm supabase:reset` from `main`.

**On the ON DELETE question the brief raises:** yes, `SET NULL` is right for both back-references. A punch item
is a commitment to a trade; a margin note is the designer's own words. Neither should vanish because the
evidence photo was purged. Task 7's test case 5 proves exactly this (`FAIL 5b: the task must survive its
capture`). Correct call, correctly tested.

---

## F1 — CRITICAL: the plan decides the automatic-margin-note question the wrong way

**Confidence: certain.**

The plan's framing section resolves the spec's self-contradiction against the ruling:

> `wave-4-plan.md:84-91` — *"**Resolved: a margin note is written on a deliberate act, never automatically.**
> The C3 card's overflow gains three verbs … and only the first writes `margin_notes`."*

And it bakes that into shipped source, in the header comment Task 9 writes into CaptureKit:

> `wave-4-plan.md:2772-2775` — *"A margin note is written on a DELIBERATE act, never on every transcript.
> §11.4 fixes the split…"*

**The orchestrator's 2026-08-24 ruling says the opposite, and it outranks the plan:** a voice note captured
inside a placed visit writes its `margin_notes` row **automatically** via the outbox — `field-companion-package.md:418-420`
(§6 Flow 2 step 4) is binding, and §11.4's "made before the wave, not during it" is hereby decided. A deliberate
act is required **only when filing an unplaced note from Today**.

The plan's engineering objection is real and the orchestrator should hold it: `margin-rail.tsx:436-439` renders
a flat list with no visit dimension (verified — `grep -i visit` across `margin-rail.tsx`, `margin-derivation.ts`,
`margin-bodies.tsx`, `margin-item.tsx` returns **zero** hits), and §11.4's "forty transcripts across six visits
would drown it" is not rhetoric. But the ruling is the ruling, and the volume consequence is now the
orchestrator's to absorb, not the plan's to route around.

### Exact edits

1. **`wave-4-plan.md:84-93`** — replace the "Resolved" paragraph of contradiction 1 with the ruling: *"Resolved
   by orchestrator ruling 2026-08-24: §6 Flow 2 step 4 is binding. A voice note captured inside a **placed**
   visit writes its `margin_notes` row automatically, through the outbox, with no tap. §11.4's alternative is
   overruled. A deliberate act is required only for **filing an unplaced note from Today** (FC-R6)."*
2. **`wave-4-plan.md:2772-2775`** — rewrite the `MarginNoteWrite.swift` header comment to match. It is shipped
   source; a comment that contradicts a ruling is worse than no comment.
3. **Task 11, `performFieldWritesIfNeeded` (`wave-4-plan.md:3839-3846`)** — the lane must be *requested*
   automatically. Before the `specimen.needsMarginNote` branch, add the auto-request, guarded so the
   client-minted id is minted exactly once and never re-minted on a later drain:

   ```swift
   // Orchestrator ruling 2026-08-24 / spec §6 Flow 2 step 4: a note spoken inside
   // a PLACED visit files itself. The id is minted once and persisted; a second
   // drain finds marginNoteId already set and re-uses it, so the write stays
   // idempotent on replay exactly as the deliberate path is.
   if specimen.marginNoteId == nil,
      specimen.marginNoteState == nil,
      specimen.venue?.projectId != nil,
      specimen.visitID != nil,                       // ⚠ confirm the wave-3 spelling in Task 0.4
      ((specimen.voiceTranscript ?? specimen.voicePartialTranscript)?
          .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false) {
       specimen.requestMarginNote(noteID: UUID())
   }
   ```

   The two guards that already exist keep the ruling's boundary honest: `MarginNoteComposer.request` returns
   `nil` on an empty transcript (so a photo-only capture writes nothing), and the composer requires a
   `projectID` (so an unplaced note cannot auto-file, which is exactly FC-R6).
4. **Task 12 (`wave-4-plan.md:4116`)** — *"Make it a note in the Document"* must be re-scoped. Inside a placed
   visit the note is already filed, so the verb is either absent or reads *"Filed in the Document."* as state.
   It survives as an **action** in two places only: (a) filing an unplaced note from Today, and (b) the FC-R8
   degrade (F5). Say which, in the plan.
5. **Task 5 / Task 6 / the Appendix** — the plan's line *"Every capture still lands in the Visits block whether
   she promotes it or not, so nothing is lost by not promoting"* (`:88-89`) is no longer the argument. Replace
   it with the consequence the orchestrator now owns: **every in-visit voice note appears in both the Visits
   block and the margin rail.** §11.4 names that duplication as the failure mode, and it offers the remedy —
   *"field notes grouped under one expandable row per visit in the margin"*. That is now an **open decision for
   the orchestrator**, and Task 18's report must carry it as an owed item rather than discovering it on a
   six-visit project.

---

## F2 — HIGH: Task 17's chip reads a key that does not exist

**Confidence: certain. Evidence traced end to end.**

`wave-4-plan.md:5320-5322` reads the venue from `capture_provenance.venueLabel`:

```ts
const venue = typeof bag.venueLabel === 'string' && bag.venueLabel.length > 0 ? bag.venueLabel : null;
```

The chain says that key is never there:

- `supabase/migrations/00235_commit_field_capture_rpc.sql:241` copies `v_capture.provenance` **verbatim** into
  `products.capture_provenance`. No venue is merged in.
- `field_captures.provenance` is `FieldCapturePayload.provenance`, which is
  `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift:159` → `s.provenanceRaw`.
- `Specimen.provenanceRaw` is `[String: String]` (`Specimen.swift:89`) and is written **only** as
  `FieldKey → ProvenanceSource` pairs (`Specimen+Accessors.swift:155`; e.g. `note → voice` at
  `SpecimenSheetScreen.swift:365`) plus the namespaced `siteScanContext.*` keys
  (`ContextCaptureProvenance.swift:56-62`: `source`, `scanId`, `projectId`, `projectRoomId`, `cameraPose`,
  `capturedAt`).
- The venue lives in **`field_captures.venue_label` / `.venue_place_id`** — separate columns (verified in the
  live catalog), which `commit_field_capture` never copies to `products`.

**So `Field · High Point, Mar 2026` — spec §6 Flow 6's copy, quoted verbatim in the task's own Copy table and
the reason the task exists — can never render.** The chip will always be `Field · Mar 2026`.

### Exact edit

Ship the honest half and name the debt. In Task 17's Interfaces block, replace the `venueLabel` claim with:

> ⚠ **There is no venue on `products`.** `capture_provenance` is a verbatim copy of `field_captures.provenance`
> (`00235:241`), which carries only `FieldKey → ProvenanceSource` pairs and `siteScanContext.*` keys. The venue
> is `field_captures.venue_label`, a column `commit_field_capture` does not copy. **This wave ships
> `Field · Mar 2026`**; §6 Flow 6's `Field · High Point, Mar 2026` needs `commit_field_capture` to merge
> `venue_label` into `capture_provenance` — which is the shared FC-R18 object and belongs to whichever lane
> next replaces it. Named, refused, owed.

Then delete the `venue` branch from `captureProvenanceChip` and drop the venue case from its test, or keep the
branch as dead-but-forward-compatible and add a test asserting today's real shape returns `Field · Mar 2026`.
Do not ship a test that passes on a fixture the database cannot produce.

---

## F3 — HIGH: `products.captured_at` exists, and it is the column the chip wants

**Confidence: certain.**

`wave-4-plan.md:5226-5228`:

> *"⚠ `products` has **no `captured_at`** — 00232 adds only those two plus `field_capture_id` — so the date comes
> from `created_at`."*

False on both halves. `products.captured_at` **exists** (verified in the live local catalog alongside
`created_at`, `capture_source`, `capture_provenance`, `field_capture_id`), and
`supabase/migrations/00235_commit_field_capture_rpc.sql:234,240` populates it explicitly:

```sql
INSERT INTO products (
  name, layer, owner_user_id, captured_by, captured_at, status,
  capture_source, field_capture_id, capture_provenance, …
VALUES (
  v_name, 'personal', v_uid, v_uid, v_capture.captured_at, 'draft', …
```

The reasoning error is that 00232 was read as the only source of capture columns; `captured_at` predates it.

**Why it matters:** `created_at` is the row-insert time. A capture taken at High Point in March and committed
from a hotel with signal in April renders `Field · Apr 2026` — a date the designer will read as wrong, on a chip
whose whole purpose is provenance. `captured_at` is the on-site time.

### Exact edit

- `captureProvenanceChip` takes `captured_at?: string | null` and prefers it, falling back to `created_at`.
- `useLayerProducts`' select (`packages/supabase/src/hooks/use-layer-products.ts:85-87` — cite verified) adds
  `captured_at` alongside `capture_source, capture_provenance`.
- `LibraryItem` (`library-card.tsx:31-41` — verified) and the object literal at `library-shelf.tsx:113-125`
  (verified) carry it.
- Add a test case: a product whose `captured_at` is March and `created_at` is April renders `Field · Mar 2026`.

---

## F4 — HIGH: the punch verb can text the wrong trade, and FC-R7's `court_party_id` question is auto-answered

**Confidence: high.**

`PunchCourtResolver.resolve` (`wave-4-plan.md:3371-3387`) filters to
`dispatchableKinds = {gc, sub, installer, receiver}` and then returns **the first consented candidate in array
order**. Task 12's `makePunchItem()` (`:4126`) calls it with **no `preferring` argument and no picker**.

On a project carrying a GC plus a consented plumber, *"Make it a punch item"* resolves to whichever dispatchable
party happens to be first, prints `"Chen Plumbing gets a text."`, and sends one. That is an external send to the
wrong party, decided by array order.

**And the ruling asked for this to be decided, explicitly.** FC-R7's body:

> *"⚠ **And decide `court_party_id` here too.** … a picker is one tap over an existing query. **Carry it, or
> state that a Field punch is court-level only and the party is attached at the desk.**"*

The plan does neither — it auto-picks and never mentions the question.

**Compounding it:** `PunchTaskComposer.punch` (`:3480-3489`) hardcodes `owner: "gc"` regardless of which kind the
resolver returned. `project_tasks_owner_check` admits all four (`00281:158-163`, verified verbatim), and
`useSectionTasks` already selects `owner` (`use-section-work.ts:90`, verified) — so a punch item routed to a
plumber is stored and rendered as the GC's.

### Exact edit — the ruling-faithful one

FC-R7's ratified wording is *"a `project_tasks` row **owned by the GC**"*. Narrow the resolver to match it:

```swift
public enum PunchCourtResolver {
    /// fc_dispatch_task_assignment will send to any of these (00284:174), but
    /// FC-R7 rules a FIELD punch is the GC's court. Attaching a sub or an
    /// installer is a picker this wave does not build, and array-order routing
    /// would text whoever happens to be first. GC or nobody.
    public static let dispatchableKinds: Set<String> = ["gc", "sub", "installer", "receiver"]
    public static let punchCourtKind = "gc"

    public static func resolve(parties: [FieldPartyRef], preferring partyID: String?) -> PunchCourt {
        let candidates = parties.filter { $0.partyKind == punchCourtKind }
        …
    }
}
```

This makes three other things correct for free: `owner: "gc"` becomes accurate; `.noCourt`'s copy
(*"No general contractor on this project yet."*) becomes exactly true rather than approximately true; and the
`dispatchableKinds` set stays as the documented mirror of `00284:174` for the test that pins it
(`wave-4-plan.md:3145`).

Then add one line to the plan's rulings table: **"FC-R7's `court_party_id` question: a Field punch is
GC-court-only in v1. A party picker for subs and installers is owed."**

---

## F5 — MED-HIGH: the FC-R8 degrade is a sentence, not a write

**Confidence: high.**

Task 12 (`wave-4-plan.md:4131`):

> *"When the drain lands `punchTaskState == .refused`, the card shows `PunchCourtCopy.refusedTask` **and** opens
> the note lane on the same specimen (`requestMarginNote`), so the degrade is a real write and not just a
> sentence."*

But that is a **UI observer**, and the drain that produces the 42501 is Task 11's
`performFieldWritesIfNeeded` — background, per-owner-serialized, and perfectly capable of running while the C3
card is off screen or after an app relaunch. Task 11's own
`apply(outcome:toPunchTaskOn:)` (`:3941-3944`) does only:

```swift
case .refused(let m):            specimen.markPunchTaskRefused(m)
```

No note lane. So a studio co-member's punch item can be refused and **silently lost** — which is precisely what
FC-R8's "detect-and-degrade honestly" and §3.3 forbid.

The RLS facts underneath are all confirmed and the plan reads them right: `"Designers manage their project
tasks"` is `FOR ALL … USING (projects.designer_id = auth.uid())` with **no `WITH CHECK`**, so Postgres reuses
`USING` for INSERT and a co-member gets 42501; the only other `project_tasks` policies are SELECT-only
(`00169:63-66`, plus `00484:772-775` re-creating the team-view one `TO authenticated`); no studio/co-member
write path exists anywhere. And `margin_notes_designer_all` keys on the note's own `designer_id`, so her note
**does** land. The degrade is sound — it just needs to happen in the drain.

### Exact edit

In `apply(outcome:toPunchTaskOn:)`:

```swift
case .refused(let m):
    specimen.markPunchTaskRefused(m)
    // FC-R8, per-designer in v1: 42501 is terminal on this lane. The degrade
    // has to be a WRITE, here, because the card that reports it may never be
    // on screen. margin_notes_designer_all admits her own note.
    if specimen.marginNoteId == nil, specimen.marginNoteState == nil {
        specimen.requestMarginNote(noteID: UUID())
    }
```

Task 12's card then only **reports** what already happened, which is what its copy claims.

---

## F6 — MEDIUM: Task 13's implementation defeats the batching its own Interfaces block argues for

**Confidence: certain.**

Interfaces (`wave-4-plan.md:4188-4189`):

> *"**Why one batched read.** A trade walk produces several punch items at once. One `in`-filtered query plus one
> batched `createSignedUrls` beats one round-trip per row."*

Step 4 (`:4394-4405`) then puts **both** hooks inside a per-row component:

```tsx
export function PunchPhoto({ fieldCaptureId }: { fieldCaptureId: string | null }) {
  const { data: byCapture } = useFieldCapturePhotoPaths(fieldCaptureId ? [fieldCaptureId] : []);
  …
  const { data: signed } = useCaptureMediaUrls(paths.slice(0, 1));
```

Each row gets its own query key, so N punch items produce N capture queries and N signing calls — exactly what
the rationale rejects. (React Query dedupes identical keys; these are all distinct.)

**Edit:** hoist both hooks into the Work block. One `useFieldCapturePhotoPaths(allFieldCaptureIds)`, one
`useCaptureMediaUrls(allFirstPaths)`, and pass a resolved `url: string | null` down to a purely presentational
`PunchPhoto`. That also makes the component trivially testable without mocking two hooks per row.

---

## F7 — MEDIUM: Task 0's premise is stale, and two of its three "Expected" lines are now wrong

**Confidence: certain (verified by `git fetch --all` + `git show`).**

`wave-4-plan.md:148`:

> *"This plan was written on 2026-08-24, when `feat/field-companion-w1`, `-w1p` and `-w05` all pointed at
> `a72d59f32` — a scan-pipeline commit with **zero** Field Companion work on it."*

That is no longer true, and the plan's own Task 0 is the right instinct — but its **Expected:** lines will now
mislead a literal agent.

**What is actually on the branches today:**

| Branch | Head | Field Companion content |
|---|---|---|
| `origin/feat/field-companion-w1p` | `95ef8f52f` | **`packages/supabase/src/hooks/use-capture-media.ts` (`useCaptureMediaUrls`) is LANDED**, with its Vitest suite, the barrel export, `capture-context-section.tsx` + tests, and `wave-1p-plan.md` |
| `origin/feat/field-companion-w1` | `fd04958ee` | `CaptureMediaMime` + tests, a fail-closed feature-flag seam + tests, `migration-number-reservations.md` edits (records 00521, reserves 00530–00535). **Local branch is ahead of origin** and carries `00530_field_capture_notes_and_routing.sql` in worktree `.claude/worktrees/field-companion-w1` |
| `origin/feat/field-companion-w05` | `26a333631` | Archive/TestFlight scripts, xcconfig, PrivacyInfo |

**Task 0.2 — essentially right.** The real signature is wider than predicted, which is compatible with all three
call sites:

```ts
export function useCaptureMediaUrls(
  paths: readonly (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = CAPTURE_MEDIA_TTL_SECONDS,   // 3600
): UseQueryResult<Record<string, string>>
```

Path-`→`-signedUrl map; unsignable paths are **absent** rather than broken; `enabled: wanted.length > 0`; keyed
order-insensitively. Tasks 3, 6 and 13's usage (`data?.[path] ?? null`) matches it exactly. Also exported from
`packages/supabase/src/hooks/index.ts:1854-1857`, and `packages/supabase/src/index.ts:10` is `export * from
"./hooks"` — so `import { useCaptureMediaUrls } from '@patina/supabase'` resolves. ✔

**Task 0.3 — wrong on two of three.** Verified against every branch:
- `RoomFilesSection` is **not** mounted in `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` — it is
  not imported anywhere in that file. Wave 1P modified `room-file/capture-context-section.tsx` instead. The
  `spreadSection === 'project'` block (`page.tsx:1339-1397`) renders `ReleaseLift`, `ScheduleSpine` (`:1354`),
  `FFESection` (`:1360`), `MoneyRegion`, `CareBand`.
- `log-inspection-drawer.tsx:151` is still exactly `const photoAssetIds: string[] = [];`.
- `capture_source` still has **zero** portal readers (only the generated `database.types.ts`).

**Edits:**
1. Rewrite `:148` to the branch state above, dated, so the task's *reason to exist* is accurate rather than
   accidentally right.
2. Replace Task 0.3's "Expected:" with "Record which of these are true — **as of this review, none of them
   are**", so a literal agent cannot record three false *confirmed as planned* verdicts.
3. Task 6's mount instruction (`:1959-1965`) is **correct as written** — after `<ScheduleSpine>`, before
   `<FFESection>`, inside the `spreadSection === 'project' && row.project_id` fragment. Verified. But since
   Wave 1P did **not** put `RoomFilesSection` there, drop the "the same seam §11.2 puts `RoomFilesSection` in,
   so the two field blocks sit together" justification or note that the sibling has not arrived.
4. Task 18 Step 2 point 2 (*"`RoomFilesSection` is absent … re-confirm it did not regress"*) currently reads as
   a regression check on something that was never mounted. Restate it.

---

## F8 — MEDIUM: the plan never names FC-R18 or `00516`, which is a hard hold on its own prerequisite

**Confidence: certain.**

FC-R18 is ratified and is the **first** ruling in the stated order:

> *"W1's `commit_field_capture` replacement is authored from the MERGED, post-fix `00516` body … **The migration
> is HELD until the Phase 3 lane confirms the merge SHA.**"*

`00516_capture_producer_idempotency.sql` is **not** on `main` — `supabase/migrations/` runs `… 00514, 00515,
00521`. It lives on `feat/capture-producer-idempotency` in `.codex/worktrees/agent-ca2`. So the hold is live.

Wave 4's Tasks 1 and 5 both read wave-1 columns. `grep -n '00516\|FC-R18'` across the whole 5,489-line plan
returns **zero hits**. Task 0.1's stop-condition catches the *symptom* (absent `voice_audio_segments`) but names
neither the cause nor the owner.

**Edit:** add to Global Constraints, next to the FC-R17 bullet:

> **⚠ Wave 1's migration is HELD by FC-R18** until the Phase 3 lane confirms `00516`'s merge SHA to `main`
> (`00516` is not on `main` today — the ledger runs 00514, 00515, 00521). Wave 4 reads wave-1 columns, so this
> wave inherits that hold. If Task 0.1 finds `voice_audio_segments` absent, the escalation is to the Phase 3
> lane about `00516`, not a re-implementation here.

---

## F9 — MEDIUM: the punch confirmation is a promise made at tap time about a send decided at drain time

**Confidence: high.**

`PunchCourtCopy.confirmation(.reachable(party))` returns `"Delaney Build Co gets a text."`, rendered under the
Add button (Task 12 Step 4) from the **device's cached** `sms_consent_status`. The row is written later, on the
drain. And the send is decided later still, server-side — verified in full:

```sql
-- 00284:160-203, trigger at 00284:207-210 (both citations exact)
IF NEW.owner_party_id IS NULL OR NEW.status = 'done' THEN RETURN NEW; END IF;
SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.owner_party_id;
IF NOT FOUND
   OR v_party.party_kind NOT IN ('gc','sub','installer','receiver')
   OR v_party.sms_consent_status <> 'granted' THEN RETURN NEW; END IF;
PERFORM public.invoke_edge_function('sms-dispatch', … 'templateKey','sms_court_assignment' …);
```

Between tap and drain — a walk, a tunnel, airplane mode overnight — consent can flip either way, and nothing
corrects the line she read. Task 11's own comment gets the mechanism exactly right (*"Whether a text goes out is
the database's call, not this struct's"*), but the copy does not.

**Second half, unstated:** `.noCourt` writes `owner='gc'` with `owner_party_id = NULL`. The trigger returns
early, **and** `supabase/functions/field-daily/core.ts:177-181` filters `.eq("owner_party_id", party.id)` — so
the item never reaches any daily digest either. The copy says where it was filed; it does not say it is
invisible to the rail entirely.

**Edits:** phrase the pre-tap line as intent — `"Delaney Build Co will get a text."` — and have the card report
the post-drain truth once `punchTaskState == .written`. Extend the `.noCourt` line to
`"Filed on the install list. No general contractor on this project yet — nothing goes out until one is added."`

---

## F10 — MEDIUM: `create or replace view margin_items` is unqualified while everything around it is not

**Confidence: certain.**

`005NN_margin_notes_field_capture.sql`:

```sql
create or replace view margin_items with (security_invoker = true) as   -- unqualified
…
grant select on margin_items to authenticated;                          -- unqualified
grant select on margin_items to service_role;                           -- unqualified
```

The same file uses `public.margin_notes`, `public.field_captures`, and `pg_get_viewdef('public.margin_items'::regclass)`.
And the file's own `time` branch carries this comment:

> *"Schema-qualified (unlike the 00219 original): the prod push session's `search_path` does not include
> `extensions`, so the bare name fails there."*

The program therefore already knows prod pushes run under a non-default `search_path`. If `public` is not first
on it, an unqualified `create or replace view` targets the wrong schema.

**Mitigating:** the `DO $postcondition$` resolves `'public.margin_items'::regclass` and asserts the definition
contains `field_capture_id`, so this fails **loudly inside the transaction** rather than silently. That is good
design and it is why this is MEDIUM, not HIGH.

**Edit:** qualify the `create or replace view` and both grants as `public.margin_items`, and add one line to the
file header declaring it a **deliberate** departure from the byte-for-byte discipline, with the same reasoning
the `extensions.uuid_generate_v5` line already carries. A reviewer diffing against `00282:606-909` must be able
to see that the departure was chosen.

---

## F11 — MED-LOW: the census grep for the view returns zero, and 00530 is already drawn

**Confidence: certain.**

**The view.** The plan's claim is **correct and I verified it exhaustively**: `00282_sms_core.sql:606-909` is the
latest definition; the seven definitions in history are `00194:24`, `00197:26`, `00200:307`, `00202:393`,
`00206:24`, `00219:92`, `00282:606`; and **nothing between 00283 and 00521 touches `margin_items`** (checked
file-by-file). Eleven columns, eight UNION arms. No dependent view selects from it, no edge function references
it, no standalone later grant. The `CREATE OR REPLACE` is column-compatible.

But every migration in this repo writes it **lowercase and unqualified**, so a case-sensitive qualified grep
(`CREATE OR REPLACE VIEW public.margin_items`) matches **nothing** — an agent re-running the census that way
would conclude the view does not exist. Task 0/1 should hand over the grep that works:
`grep -rn 'create or replace view margin_items' supabase/migrations/`.

**The band.** `docs/engineering/migration-number-reservations.md:83` still records the wave-1 migration as
**"NOT YET DRAWN"** — but `00530_field_capture_notes_and_routing.sql` is committed on the local
`feat/field-companion-w1` branch and **applied to the local DB** (`supabase_migrations.schema_migrations` row
`00530 | field_capture_notes_and_routing`). Task 0.1's census (`ls` + `git log --all` + `git worktree list` +
the doc) *will* surface it via `git log --all`, so the plan is safe — but the doc it also reads is stale, and
the applied ledger is a signal it never checks.

**Also worth stating:** the band is **fully subscribed with zero slack** — six numbers, six scheduled migrations
(W1 routing, W3 visit/suggestion, W4 ×3, W6A server-transcript). Anything unanticipated draws above the head.

**Edit:** add to Task 0.1 —
`psql "$LOCAL" -c "select version, name from supabase_migrations.schema_migrations where version >= '00520' order by version;"`
— and treat a locally-applied-but-unfiled number as taken. Note in the step that the reservations doc's
"NOT YET DRAWN" row for wave 1 is expected to be stale and should be repaired at landing.

---

## The Agent-OS question: does a task INSERT that fires an SMS count as a device-initiated external send?

**Answer: no — and the plan's architecture is why. Two conditions must hold, and one of them currently doesn't.**

AGENTS.md's rule is *"No automated external sends — drafts land `awaiting_review`."* It governs **agent-authored
outbound communication**: a model composing a message to a third party without a human in the loop. That is not
what this is.

What this is, verified end to end:

1. The device **never** contacts Twilio or `sms-dispatch`. Task 11's `SupabaseFieldWriteGateway` inserts rows and
   nothing else. The sender is `fc_dispatch_task_assignment`, a live, consent-gated database trigger that has
   been firing on portal task assignments since `00284`.
2. The send is **human-initiated**: a designer taps *Make it a punch item*, reads a line naming the party, and
   taps Add. It is functionally identical to assigning a task to a party in the portal — the same trigger, the
   same template (`sms_court_assignment`), the same consent gate.
3. Consent is **re-read server-side at send time**, never trusted from the device cache. Task 11's stand-in
   `FieldPartyRef` carries `smsConsentGranted: false` and `PunchTaskComposer.punch` reads nothing but
   `court.party?.id` — so the device structurally cannot assert consent it does not have. This is the single
   best-designed thing in the wave and it should be preserved exactly.

So the rule is satisfied — **provided the send goes where the designer was told it would go**. That is F4: today
the resolver can pick a party she never named, from array order, and print its name as fact. **Fix F4 and this
question closes cleanly.** F9 tightens the tense of what she was promised.

One line the plan should add to Task 18's report, so this is not re-litigated: *"The device sends nothing. It
writes a `project_tasks` row that a live, consent-gated database trigger may turn into a text. The designer names
the party and confirms before the row is written; the database re-reads consent before the text goes out. This is
the same path the portal's own task assignment takes."*

---

## Lower-severity findings

**F12 — LOW-MED, certain. Dropping package 4-7 contradicts a literal sentence in FC-R7 that the plan never
quotes.** FC-R7's body: *"**Regardless of the answer**: `designer_client_id` must be added to Field's projects
SELECT and DTO."* The ratification table records only the landing. **I agree with the plan's call on the merits**
— option (d) dissolves the only consumer (`create_client_decision`, whose `NOT FOUND` branch raises
*"relation not found or access denied"*), `project_tasks` has no client anchor, and FC-R6 keeps unplaced notes on
`field_captures`. But the plan's *"Why package 4-7 is dropped"* section (`:57-70`) never quotes the "regardless"
sentence, so at review time the drop reads as an omission rather than a decision. Add one sentence: *"FC-R7's
'regardless of the answer' was written under the (a)/(b)/(c) framing, all three of which routed through
`create_client_decision`. Option (d) removes that RPC, and with it the only reader."*

**F13 — LOW, certain. Citation drift.** The plan trades on precision, so these should be exact. Wrong:
- `00169:60-62` → the policy is **`00169:61-62`**; line 60 is a comment. Also worth stating: that policy has
  **no `TO` clause** (unqualified, not `TO authenticated`), which sits oddly beside the plan's own convention
  line. It is pre-existing and not this wave's to fix — but say so rather than implying it is already clean.
- `00284:160-205` (`:2011`) → the function body is **`00284:160-203`**.
- `margin-item.tsx:60` "renders `title`" → line 60 is the `<MItemContent` opening tag; **`title={row.title}` is
  line 63**. `detail={row.detail}` **is** line 64 — the citation the entire *"`detail` stays `''`"* argument
  rests on is **exactly right**.
- `margin-derivation.ts:11-33` → `MarginItemRow` is **`21-33`**; 11-19 are the `MarginKind` /
  `MarginAnchorKind` unions.
- `margin_notes_designer_all` appears as `00196:51-54` and `:52-55` in different places → **`00196:51-53`**.
- `margin_notes_studio_read` `00316:306-333` → **`00316:309-330`**.
- `margin_notes.anchor_kind` default `00196:31-32` → **`00196:29-30`**.
- `NoteBody` appears as `814-880`, `814-895` and `814-900` in three places → **`814-895`** (Task 2's Files line
  is the correct one).

Verified **correct**, and worth recording because several are load-bearing: `00281:158-163` (verbatim),
`00284:207-210` (verbatim), `00215:26-34`, `00177:39-41` and `00177:20`, `00198:22-24`/`:25-26`/`:27-29`,
`00282:606-909`, `00282:828-829`, `field-daily/core.ts:177-181`, `use-section-work.ts:83`/`:90`,
`log-inspection-drawer.tsx:151`, `CaptureNavigation.swift:4-6` (*"FROZEN … foundation-owner-only"*, verbatim),
`use-layer-products.ts:85-87`, `library-card.tsx:31-41`, `library-shelf.tsx:113-125`,
`letterhead-instruments.tsx:121-123`, `use-party-sms.ts:164`, `ProjectPlacement.swift:90-118`,
`run-sql-tests.sh:92` (superuser), `capture-gate.sh` lint-no-op and `CODE_SIGNING_ALLOWED=NO`, and
**KNOWN_FAILURES 22 across 122 files — exact**.

**F14 — LOW, certain. Task 1's test case 5 can pass vacuously.** `SELECT * INTO v_typed FROM margin_items WHERE
…` leaves `v_typed` NULL if the row is missing, and assertion **5a** (`… IS NULL`) then passes on nothing. 5b
still fails (plpgsql `ASSERT` raises on NULL as well as false), so the file goes red — but 5a is not evidence.
Add `ASSERT v_typed IS NOT NULL` and `ASSERT v_field IS NOT NULL` before the case blocks.

**F15 — LOW, certain. Task 7's consent-gate assertions are string matches on function source.** Cases 4b/4c are
`pg_get_functiondef(…) LIKE '%sms_consent_status%' / '%granted%' / '%sms_court_assignment%'`. A refactor that
keeps the strings and breaks the logic passes. More importantly they never assert the **party-kind allow-list**,
which is the gate that actually decides the send — verified: the trigger reads `project_parties.party_kind` and
`sms_consent_status`, and **never reads `project_tasks.owner` at all**. Add `ASSERT v_fn_src LIKE '%party_kind%'`.
Also state in the header what the fixture's `sms_consent_status='not_asked'` buys: it is a **deliberate** choice
that keeps `invoke_edge_function` unreached, and it means this file proves nothing about the granted path. Good
call; name it.

**F16 — LOW, certain. The time-entry migration's early return leaves a redundant path.** `DO $widen_source$`
returns when *any* CHECK mentions `field_visit`, then the unconditional
`ALTER TABLE … DROP CONSTRAINT IF EXISTS project_time_entries_source_ck, ADD CONSTRAINT …` runs regardless. I
proved it idempotent in practice (two runs in one transaction, clean). But if a widening ever landed under a
different name, the early return preserves it and the ADD creates a second, duplicate CHECK. One-line fix: key
the guard on `conname = 'project_time_entries_source_ck'` rather than on any constraint mentioning `field_visit`.

**F17 — LOW, certain. The punch migration's `'gc'` postcondition is loose.** It matches
`pg_get_constraintdef(oid) LIKE '%''gc''%'` across **all** check constraints on `project_tasks` without ever
asserting the constraint is the one on `owner`. Resolve by `conname = 'project_tasks_owner_check'` with a
content fallback. Same note applies to Task 7's test case 3.

**F18 — LOW, informational. Task 11 discards the orchestrator's return value** (`_ = try await …write(request)`)
and then unconditionally marks written. **Verified safe**: `MarginNoteOrchestrator.write` and
`PunchTaskOrchestrator.write` return only `.written` / `.alreadyWritten` and throw on everything else, so
`apply(outcome:)` is reachable only from `catch`. Not a defect. Flagged because the shape invites one — a future
edit that makes an orchestrator *return* `.refused` instead of throwing would silently mark refusals as written.
A `switch` on the returned outcome costs nothing and closes it.

---

## What the plan gets right, and should not be talked out of

Recording these so a fix pass does not undo them:

- **Dropping the scan count.** `room_scans` carries **no `visit_id`** — verified: `grep -rn "visit_id"
  supabase/migrations/*.sql` returns **zero matches repo-wide**. Wave 3 puts `visit_id` on `field_captures`
  only, and there is no `field_visits` table by design (*"an abandoned visit must leave no server rows"*).
  Attributing a scan to a visit by timestamp overlap would render a guess as a fact. **Agree completely** — and
  the same refusal correctly propagates to V4's grouped list (`Captures · Notes · Unplaced`, not `… · Scans ·
  …`). Both are declared, not hidden.
- **`detail` stays `''`.** `margin-item.tsx:64` feeds `row.detail` to the collapsed preview for **every** kind
  (`MarginItem`'s own docstring: *"one component for all five kinds"*). Widening it dumps a transcript into the
  rail. **Agree** — the body travelling in the payload while `title` stays `left(body, 80)` is exactly right, and
  Task 1's test pins all three (cases 1, 2, 3).
- **`min/max(created_at)` over `visit_ended_at`** for the visit span, with the reason stated
  (`commit_field_capture`'s upsert ends `WHERE status NOT IN ('saved','dismissed')`, so a saved capture is
  immutable and can never be stamped at close).
- **The FK-not-jsonb choice**, argued from what `project_tasks` already carries — verified: **zero** jsonb
  columns, four nullable FKs (`created_by`, `owner_party_id`, `blocked_by_item_id`, `seq_after_task_id`), and
  00169/00202/00215/00281/00479 are indeed the only ALTERs. Task 7 case 6 pins the absence of jsonb.
- **Naming the debts instead of paying them under deadline**: no project-general media table (FC-R15), no
  `project_tasks.room_id` (FC-R5), no `room_scans.visit_id`, G2 live camera carried as an open item rather than
  silently dropped.
- **Task 18 refuses to answer any acceptance criterion from a green gate** — it names the SQL runner's superuser
  caveat, `capture-gate.sh build`'s `CODE_SIGNING_ALLOWED=NO`, and `capture-gate.sh lint`'s silent no-op, and it
  requires `swiftlint --strict` reported **separately**. It refuses to call criterion 4 met while `room-file` is
  off, which is FC-R10's named prerequisite and a Kody decision — **stated, correctly, as a decision with an
  owner rather than as code**.
- **Zero name drift across the wave set.** All 22 cross-wave names check out: `visit_id` / `visit_label` /
  `visit_kind` / `visit_kit` / `visit_started_at` / `visit_ended_at` (wave-3 companion), `capture_kind` /
  `voice_audio_segments` / `transcript_source` (wave-1 `00530`), `CaptureSheet.visit`,
  `CaptureScreenID.v4VisitReview`, `CaptureSessionContext.kind/kit/label/endedAt/projectsInMind`,
  `FieldCapturePayload.captureKind` + `voice.audioSegments`, `Specimen.placementProjectId` /
  `needsProjectPlacement`. `CaptureRoute.visitReview` is correctly predicted **absent**. No collisions on any of
  the 32 net-new type names, and no wave-2/3 portal surface to collide with (wave 3: *"No portal surface. The
  Visits block, the margin row, the time entry and the punch verb are all wave 4."*).
- **Gate commands are verbatim-correct.** `run-sql-tests.sh -f/--filter` exists (`:26`, `:65-66`);
  `capture-gate.sh all` exists (`:40`, `all) build; test_; lint`); `packages/supabase` is
  `"test": "vitest run"` with a `vitest.config.ts` — **the plan is right that the program plan's "jest" line is
  wrong**; `pnpm build --filter designer-portal` appears in Task 18 Step 1 and in Task 6's per-task gate.
- **FC-R10's "renders nothing on a field-less project" is a browser-verified acceptance criterion** with four
  enumerated points and a screenshot each, not a footnote — exactly as the ruling asks.
- **Zero placeholders.** No TBD, no FIXME, no unfinished code fence. The only `TODO` matches are the literal
  task status `'todo'`.

---

## Fix list, in dispatch order

**Before any lane agent starts:**

1. **F1** — rewrite `:84-93`, `:2772-2775`, Task 11's auto-request, Task 12's verb scope, and the Task 5/6/Appendix
   consequence. Decide, or explicitly defer to Task 18's report, whether the margin rail needs a per-visit fold.
2. **F4** — narrow `PunchCourtResolver` to `partyKind == "gc"`; record the `court_party_id` answer in the rulings
   table.
3. **F7** — correct Task 0's premise and its two wrong "Expected:" lines.
4. **F8** — add the FC-R18 / `00516` hold to Global Constraints.
5. **F11** — add the applied-ledger census command and the working view grep to Task 0.1.

**Inside their tasks:**

6. **F2 + F3** (Task 17) — drop the unreachable venue key, switch to `products.captured_at`, add the widened
   select and the March/April test.
7. **F5** (Task 11) — open the note lane from `apply(outcome:toPunchTaskOn:)` on `.refused`.
8. **F6** (Task 13) — hoist both hooks out of `PunchPhoto`.
9. **F9** (Task 12) — intent tense, post-drain truth, extended `.noCourt` line.
10. **F10** (margin SQL) — qualify `public.margin_items` in the CREATE and both grants; declare the departure.
11. **F12–F18** — the citation pass, the two test-hardening edits, and the two postcondition tightenings.

With those in, this plan is ready to build.
