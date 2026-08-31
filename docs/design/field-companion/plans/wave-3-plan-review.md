# Adversarial review — `plans/wave-3-plan.md` (Wave 3, "the visit spine")

**Reviewed:** `docs/design/field-companion/plans/wave-3-plan.md` (6,743 lines, 34 tasks),
`plans/sql/005NN_field_capture_visit_and_suggestion.sql` (160 lines),
`plans/sql/field_capture_visit_test.sql` (272 lines).
**Reviewed against, in authority order:** `field-companion-rulings.md` ("Ratified by Kody — 2026-08-24") →
`field-companion-package.md` §5/§6/§7/§9.3/§9.7/§9.8/§13–§15/§17 → `field-companion-plan.md` §3, §0.1 →
`plans/wave-2-plan.md` + `plans/wave-2-plan-review.md` + branch `feat/field-companion-w1` → the plan itself.
**Method:** ~90 file:line citations checked against the working tree and the three
`feat/field-companion-*` branches; the migration and both SQL files **executed against the
local Supabase Postgres (17.6) inside `BEGIN … ROLLBACK`**, plus six adversarial payload probes.
Read-only; no repo mutation.

---

## Verdict

## **READY-WITH-FIXES**

The architecture is right and the load-bearing SQL claim is **proven, not asserted**. One
finding (C1) is a production data-availability bug that I reproduced six different ways; five
more (H1–H5) would each turn a task red on its first run. None of them touches the plan's
shape. Apply §8's edits and this is ready.

---

## 1. What I verified as correct (stated first, because it is most of the plan)

These are affirmative findings, each backed by an executed probe or a read citation.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| ✔1 | `commit_field_capture` stores `raw_payload` **verbatim on both the INSERT and the `ON CONFLICT DO UPDATE` path**, so the projection fires on replay | **TRUE** | `00235_commit_field_capture_rpc.sql:100,140` (insert), `:184` `raw_payload = EXCLUDED.raw_payload`. Test group 5 of the plan's own test proves the replay re-projection, and it **passes** (executed). |
| ✔2 | The same is true of the in-flight 00516 body | **TRUE** | `origin/feat/capture-producer-idempotency:supabase/migrations/00516_capture_producer_idempotency.sql` — column list and `raw_payload = EXCLUDED.raw_payload` both present, `SECURITY INVOKER` retained, conflict `WHERE` clause unchanged. Header says "from its 00235 body verbatim". **The projection is safe against either lineage.** |
| ✔3 | Trigger order: the routing guard fires **before** the projection | **TRUE, measured** | Observed order on the live table: `trg_field_captures_guard_insert → trg_field_captures_guard_update → trg_field_captures_updated_at → trg_field_captures_visit_projection`. The SQL's comment (`005NN…:150-153`) is accurate. |
| ✔4 | **A `suggested_project_id` pointing at a project the designer does not own can never RAISE** | **TRUE, measured** | Designer A committed a capture whose `suggestion.projectId` named designer B's project: **no exception**, and `suggested_project_id` came back `NULL` — the `EXISTS` probe runs under the caller's RLS (`commit_field_capture` is `SECURITY INVOKER`, `00235:61`) and `field_captures_guard_routing` never reads a `suggested_*` column (`00233:195-253` reads only `project_id`, `project_room_id`, `organization_id`). Suggestions are structurally incapable of failing a sync. |
| ✔5 | FKs on `suggested_*` are `ON DELETE SET NULL`, and the projection cannot resurrect a SET-NULL'd value | **TRUE** | `005NN…:73-74`. On the RI cascade the trigger re-runs, the `EXISTS` probe now fails, and the NULL sticks. |
| ✔6 | `suggestion_confidence` is a number the UI never renders (Principle 4) | **TRUE and enforced** | `numeric(3,2) CHECK BETWEEN 0 AND 1` (`005NN…:80-83`); Task 31 keeps it out of every telemetry property and tests that (`:6497-6509`); Task 32's wave gate greps `suggestionConfidence` under `Capture/` and expects nothing (`:6634`). Three independent barriers. Correct. |
| ✔7 | RLS unchanged; every policy stays as 00233 left it | **TRUE** | The migration adds columns, an index, a function and a trigger. No `CREATE POLICY`, no `ALTER POLICY`, no `ALTER TABLE … ENABLE/DISABLE ROW LEVEL SECURITY`. |
| ✔8 | Explicit `REVOKE ALL … FROM PUBLIC, anon` on the new routine | **PRESENT and correct** | `005NN…:145`. Its stated rationale (Postgres checks trigger-function EXECUTE at `CREATE TRIGGER` time, not at fire time) is right, so no compensating GRANT is needed. Task 10's assertion 11 verifies it, and `has_function_privilege('public', …)` **does** work — I confirmed on PG 17.6 that Postgres special-cases the `public` pseudo-role. |
| ✔9 | Idempotent `IF NOT EXISTS` throughout, applies clean | **TRUE, executed** | `ADD COLUMN IF NOT EXISTS` ×10, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`. Applied against the local DB: `ALTER TABLE / CREATE INDEX / CREATE FUNCTION / REVOKE / DROP TRIGGER / CREATE TRIGGER`, no error. |
| ✔10 | The standalone test passes as authored | **TRUE, executed** | Migration + `field_capture_visit_test.sql` in one transaction → `NOTICE: All field_captures visit/suggestion assertions passed.` All nine groups green. |
| ✔11 | Every `@Test` in the plan targets CaptureKit types only | **TRUE** | `CaptureTests` links `CaptureKit` alone — `generate_project.rb:148,153` adds exactly one dependency and one linked product, and `capture-gate.sh` runs `xcodebuild test -scheme CaptureKit`. I traced all 34 tasks: the app-target types the plan touches (`ViewfinderModel`, `RootView`, `V1SessionTrayScreen`, `WorkDashboardScreen/Model`, `V0VisitSheet`, `C6VoiceScreen`, `SiteScanSetupScreen`) are **never** referenced from a test. Task 13 makes the constraint explicit and tests the store contract instead (`:2890-2893`). **No defect here.** |
| ✔12 | SwiftData lightweight migration holds | **TRUE** | All 7 new `CaptureProjectRef` properties (`:181-190`), all 10 new `Specimen` properties (`:1660-1674`) and Task 27's 11th (`suggestionReasonRaw`) are optionals on existing `@Model`s. `CaptureStore.schema` (`CaptureStore.swift:40-44`) gains no member; no `VersionedSchema`. |
| ✔13 | FC-R5 room lanes never cross | **TRUE** | `FieldVisitRoomOption` carries `projectRoomID` and `scanRoomID` as separate `String?` (`:963-965`); `merge` only ever writes `projectRoomID` from `specRooms` and `scanRoomID` from `rooms` (`:1014-1037`); `CaptureVisitDraft` keeps both (`:1352-1355`); `stamped(onto:)` writes only `projectRoomID → VenueStamp.projectRoomId` (`:1742`); `scanRoomID` lives on `CaptureSessionContext`, not `routing`, and reaches only `ContextCaptureProvenance(projectRoomId:)` in C6 (`:4818`). `ContextCaptureProvenance.swift:21`'s refusal is a doc comment (`siteScanContext.projectRoomId = SiteScan rooms.id (NOT project_rooms — see note)`); nothing in the plan contradicts it. Tests at `:911-931` and `:2380-2385` pin it. Clean. |
| ✔14 | The device-pass task carries the exercised/not-exercised template | **TRUE and unusually good** | `:6683-6712` — 25 rows, and rows 23–25 (12-hour auto-end, calendar-day rule, 20-min cap) are **pre-marked "not exercised"** with the reason, plus an explicit instruction that any other "no" is a named bug (`:6716`). This is the right shape. |
| ✔15 | Gates verbatim; the "22 known failures" figure | **CORRECT** | `capture-gate.sh all` + `swiftlint --strict` match `scripts/capture-gate.sh:19-40`. `supabase/tests/KNOWN_FAILURES.md:17-22` says "leaving **22**". The superuser caveat is stated three times (`:20`, `:2072`, `field_capture_visit_test.sql:30-33`) — correct and load-bearing. |
| ✔16 | SwiftLint budget | **NO PROBLEM** | `.swiftlint.yml` `included:` is `[Capture, CaptureKit, CaptureKitMocks]` — **`CaptureTests` is never linted**, so the `try!` in `VisitRoomMergeTests` (`:912-913`) and the `!` force-unwraps in the stubs are safe. `type_body_length`, `file_length` and `line_length` are all disabled, so `V0VisitSheet`'s length is fine. The only live budget is `function_body_length: warning: 60`, promoted to an error by `--strict`. |

### Is the trigger preferable to editing `commit_field_capture` under FC-R18?

**Yes — unambiguously, and the plan should keep it.** FC-R18 rules that W1's `commit_field_capture`
replacement "is authored from the MERGED, post-fix `00516` body … and lands AFTER 00516 merges to
main", and that **"the migration is HELD until the Phase 3 lane confirms the merge SHA."**
`docs/engineering/migration-number-reservations.md:155-159` records the lineage
`00235 → 00516 → 005NN` and the silent-revert hazard. A wave-3 `CREATE OR REPLACE` would
enlist this wave in that hold and that queue for no benefit.

The trigger buys out of it entirely, and I verified the two properties that make the buy-out
sound: `raw_payload` is stored verbatim on both write paths in **both** the 00235 and 00516
bodies (✔1, ✔2), and the guard runs first so a routing violation is still rejected before any
projection work (✔3). The projection is exact, idempotent on replay, and cannot collide with
either live lane. Keep it. (The plan already says to raise it with the FC-R18 owner before the
push — `:2044-2050` — which is the right hedge.)

---

## 2. Critical

### C1 — A malformed or unknown-vocabulary `visit`/`suggestion` key **hard-fails `commit_field_capture` on both destinations**, permanently wedging an offline client

**Severity: critical · Confidence: 1.0 (reproduced six ways against the real migration)**

The trigger casts payload strings directly and lets the new CHECK constraints do the validating
(`005NN_field_capture_visit_and_suggestion.sql:105-142`). Every one of those casts and checks
raises out of the `BEGIN … INSERT … ON CONFLICT` statement, and that statement sits **outside**
`commit_field_capture`'s safe-harbor block, which only wraps the library branch
(`00235_commit_field_capture_rpc.sql:223-299`). So the exception escapes the RPC.

Measured, applying the migration to the local DB and inserting through the trigger:

| Payload | Result |
|---|---|
| `visit.startedAt = "last tuesday"` | `22007 invalid input syntax for type timestamp with time zone` |
| `visit.kit = "punch_walk"` (a widened kit, or a newer build) | `23514 violates check constraint "field_captures_visit_kit_ck"` |
| `suggestion.confidence = 1.4` | `23514 violates check constraint "field_captures_suggestion_confidence_ck"` |
| `suggestion.confidence = 12.5` | `22003 numeric field overflow` (`numeric(3,2)` caps at 9.99) |
| `visit.id = "not-a-uuid"` | `22P02 invalid input syntax for type uuid` |
| `suggestion.basis = "vibes"` | `23514 violates check constraint "field_captures_suggestion_basis_ck"` |
| well-formed control | no error |

And through the RPC, on the **library** path — the one with the safe harbor:

```
Q3 malformed on library path RAISED 23514 / violates check constraint "field_captures_visit_kit_ck"
```

The safe harbor does not catch it, because the upsert precedes the `BEGIN` block. On the
`inbox` path there is no harbor at all. Both destinations wedge.

Why this matters more than a normal validation bug: Patina Field is **offline-first and
retries**. `LocalCaptureSyncService` re-drains the outbox; a capture whose payload trips any
of these six raises the same error forever. The capture never syncs, never appears in the
studio, and — because it stays in the outbox — the queue behind it may not drain either. The
plan's own R3-1 mitigation (`005NN…:127-129`, "a stale suggestion must never hard-fail a
sync") is implemented for exactly one case (an unresolvable FK) and left open for six others.

It also directly contradicts the design's own tolerance posture: `commit_field_capture` was
written so that *"any failure on the library path safe-harbors to the inbox rather than
erroring (offline clients must always converge)"* (`00235:11-13`). This migration puts six new
non-converging failure modes upstream of that promise.

**Fix (§8, F-C1).** Make the projection total: catch per-field rather than trusting the
constraint. Cast inside a sub-block that falls back to NULL, and map unrecognised
kind/kit/basis strings to NULL rather than letting the CHECK bite. The CHECKs then remain as
a schema-level invariant for anything writing the columns *directly* (portal, backfill), which
is what they are for — they were never meant to be the device's input validator.

---

## 3. High

### H1 — Wave 3 hard-depends on eight Wave 1 symbols that do not exist on `feat/field-companion-w1` today, and Task 0 names a fallback for only two

**Severity: high · Confidence: 0.95**

Task 0 (`:70-72`) lists the Wave 1 consumables and Step 2 expects "one hit per grep". I checked
`main` (`27fdaf130`) and `feat/field-companion-w1` (`ebfb056a9`) with two spellings each:

| Symbol | On `main`? | On `feat/field-companion-w1`? | Task 0 fallback? |
|---|---|---|---|
| `CaptureRoutingMemory.stamped(onto:)` | no | **no** | yes — Task 7 creates it (`:113`) |
| `FieldCapturePayload.Voice.noteSetting` | no | no | yes — Task 8 adds it (`:114`) |
| `CaptureMediaMime` | no | yes (`Sync/CaptureMediaMime.swift:18`) | — |
| `CaptureAnalytics.isFeatureEnabled(_:)` | no | yes (`Analytics/CaptureAnalytics.swift:18`) | — |
| **`VoiceRecordingPolicy`** | **no** | **no** | **none** |
| **`VoiceNoteResult.audioSegments` / `.onDevice`** | **no** (`RecognitionServices.swift:66-74` has only `transcript`, `audioFilename`, `durationSeconds`) | **no** | **none** |
| **`Specimen.voiceAudioSegmentsRaw` / `.captureKindRaw` / `.voiceTranscriptSourceRaw`** | **no** | **no** | **none** |
| **`FieldCapturePayload.currentSchemaVersion == 2`** | **no — it is `1`** (`FieldCapturePayload.swift:43`) | **no — still `1`**; W1 does not touch the file at all | **none** |

The four rows in bold are consumed hard: Task 22 builds its whole state machine on
`VoiceRecordingPolicy.maxNoteSeconds` / `.maxSegments` / `.shouldEnd(totalElapsed:segmentCount:)`
(`:4741-4760`), and Tasks 20 and 23 write `result.audioSegments`, `result.onDevice`,
`specimen.voiceAudioSegmentsRaw`, `specimen.voiceTranscriptSourceRaw`,
`created.captureKindRaw` (`:4460-4470`, `:4835-4845`). Task 24's `discard()` fix reads
`specimen.voiceAudioSegmentsRaw` (`:5395-5400`).

Task 0 Step 4 (`:130-137`) gives a per-symbol action for four names and a blanket "STOP" for the
frozen seam. For these four it gives nothing — a lane agent reaching Task 20 with them absent
has no instruction. This is the same failure `wave-2-plan-review.md`'s **F-C1** flagged
(Wave 2's Task 0 also had no fallback beyond "stop and report").

**Fix (§8, F-H1).** Extend Task 0 Step 4's table to cover all eight, each with a named action.
For the voice family the honest action is **STOP** — Wave 3 must not re-author Wave 1's
recording policy — but it has to be *written down* so the stop is a decision, not a stall.

### H2 — `currentSchemaVersion` is `1`, not `2`: "bump 2 → 3" silently skips a version

**Severity: high · Confidence: 0.9**

`FieldCapturePayload.swift:43` reads `public static let currentSchemaVersion = 1` on `main`,
and `git diff main feat/field-companion-w1 -- .../FieldCapturePayload.swift` is **empty** —
Wave 1 has not bumped it. The plan asserts `== 2` in Task 0 (`:72`, `:99`) and Task 8 comments
"Bumped 2 → 3" (`:2210`). Three outcomes:

- Wave 1 later bumps to 2 → the plan is right and nothing is wrong.
- Wave 1 does not bump → Wave 3 writes `3` over `1`, and version 2 never exists on the wire.
- Wave 1 bumps to 2 *after* Wave 3 lands → collision.

Nothing server-side catches any of these: `commit_field_capture` stores
`capture_schema_version` with `COALESCE(…, 1)` (`00235:144`) and no reader gates on it. The
plan's SQL test hardcodes `'schemaVersion', 3` in every fixture
(`field_capture_visit_test.sql:104,132,148,172,191`) but never asserts the column, so a
mismatch is invisible on both sides.

**Fix (§8, F-H2).** Task 0 Step 4 gains: *"`currentSchemaVersion` is not 2 → Task 8 sets it to
`(found value) + 1` and records the number in the wave report; do not hardcode 3."* Then make
Task 8's test read the constant rather than the literal, and add one assertion to the SQL test
that `capture_schema_version` matches whatever the payload carried.

### H3 — The unplaced tray and Today's "N captures not placed yet" empty on **sync**, not on placement — contradicting FC-R6

**Severity: high · Confidence: 0.8**

Task 15 defines the tray's scope (`:3358-3372`):

```swift
return all.filter { $0.isUnplaced && $0.status != .committed }
```

`CaptureStatus` is `draft, ready, queued, uploading, committed, failed`
(`CaptureEnums.swift:45`) — `.committed` is the **normal successful end state** of the sync
drain, not a terminal disposal. So the moment a capture commits, it drops out of
`unfiled()`, and therefore out of:

- `FieldTodayBand.unplacedCount` → the *"N captures not placed yet"* line (`:3159-3167`),
- the tray's `Not placed yet` section (`:5442-5447`),
- the tray's empty state, which then reads *"Nothing waiting. Everything you've captured is placed."* (`:5478`) — **while the capture is still unplaced**.

FC-R6 is explicit: *"An unplaced note waits on Today as a `field_captures` row with a
suggestion; nothing is ever lost."* Waiting on Today is the whole mechanism. §7.8 widens the
scope precisely so a drive-home thought has somewhere to appear. As written, it appears until
signal arrives and then vanishes.

Two smaller things in the same code: the doc comment says *"Terminal (dismissed) records are
excluded"* (`:3358-3360`) but **`CaptureStatus` has no `.dismissed` case** — I searched two
spellings, zero hits repo-wide; and the accompanying claim that placement *"rides its EXISTING
outbox entry"* (`:5919-5921`) is unproven for a record whose outbox entry has already drained.
The server already has the right verb for this — `route_field_capture(p_capture_id, p_project_id,
p_project_room_id, p_shelf)` (`00235:309-343`) — and the plan never reaches for it.

**Fix (§8, F-H3).** Either (a) keep `.committed` unplaced captures in the tray and route their
placement through `route_field_capture`, or (b) state explicitly in Task 15 that wave 3's
unplaced tray is *pre-sync only* and record the FC-R6 gap in "What this wave does NOT do".
Option (a) is what the ruling asks for. Either way, fix the `.dismissed` comment.

### H4 — Task 6's first test can never pass: two `visit(…)` calls mint two different `visitID`s

**Severity: high · Confidence: 0.95**

`:1319-1324`:

```swift
@Test func aFreshVisitIsActive() {
    let state = CaptureSessionContextPolicy.visitState(
        for: visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-60)),
        now: now, calendar: .current)
    #expect(state == .active(visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-60))))
}
```

The helper (`:1310-1315`) constructs `CaptureSessionContext(identity:startedAt:lastActivityAt:kind:label:endedAt:)`,
and `visitID` defaults to `UUID()` (`:1215`, matching the shipped
`CaptureSessionContext.swift:57`). Two calls produce two different UUIDs; `CaptureSessionContext`
is `Equatable` over all stored properties including `visitID`; `CaptureVisitState.active(_)`
compares its payload. The assertion is **always false**. Task 6's Step 4 "Expected: PASS" is
unreachable, which makes the whole task's red→green signal unreadable.

**Fix (§8, F-H4).** Bind the context once:
```swift
let context = visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-60))
#expect(CaptureSessionContextPolicy.visitState(for: context, now: now, calendar: .current) == .active(context))
```

### H5 — FC-R11's affirmation is a tappable gate on C6 but inert `Text` on C3

**Severity: high · Confidence: 0.85**

FC-R11 (rulings, 2026-08-24): *"Kit-defaulted consent (`solo`/`conversation`), **affirmation
chip on a conversation note**, unmissable recording chrome, never ambient."* §15.2 item 2:
*"A conversation note shows a one-line 'Everyone here knows this is being recorded'
affirmation **she taps**."* The plan restates it correctly in its own Global Constraints
(`:24`).

C6 implements it properly — a `Button` chip that sets `affirmed` and **gates the record
control** (`:4870-4884`, `.disabled(model.noteSetting == .conversation && !affirmed && !model.isRecording)`).

C3 does not. Task 20 renders it as a plain `Text` with no gesture, no state, and no gate on
the mic (`:4500-4504`):

```swift
if let noteSettingLine {
    Text(noteSettingLine)
        .font(CaptureType.footnote)
        .foregroundStyle(CaptureColor.goldenHour)
}
```

The only test is that the string exists (`:4402-4406`). C3 is the two-taps-and-a-hold path —
the one she uses most inside a walk-through, which is exactly the kit whose default is
`conversation`. This is the surface FC-R11 is most about, and it is the one where the
affirmation is not an affirmation.

**Fix (§8, F-H5).** Give C3 the same shape: an `@State private var affirmed`, the chip as a
`Button`, and `onMicPressChanged` refusing to start while `noteSetting == .conversation &&
!affirmed`. Add the gate to the test.

---

## 4. Medium

**M1 — A stale-window test is timezone-dependent and fails west of ~UTC-8.** Confidence 0.85.
`pastThirtyMinutesTheVisitGoesStaleNotAway` (`:1326-1334`) uses `calendar: .current` with
`now = 1_800_000_000` = **2027-01-15T08:00:00Z**. Its `lastActivityAt` is `now − 30 m − 60 s` =
07:29 Z. In `America/Chicago` both land on Jan 15 and the test passes; in US Pacific (UTC−8)
`now` is 00:00 local Jan 15 and `lastActivityAt` is 23:29 local **Jan 14** — the
never-across-a-calendar-day rule (`:1607`) fires first and the state is `.none`, not `.stale`.
Fix: pin the calendar exactly as `aVisitNeverResumesAcrossACalendarDay` already does
(`:1341-1343`).

**M2 — `FieldLaunchPolicy.todayIsHome` is mutated by one test while a sibling reads it.**
Confidence 0.8. It is `public nonisolated(unsafe) static var` (`:3694`).
`flippingFCR1BackToCameraFirstNeedsOneFlag` (`:3648-3658`) flips it with a `defer` restore,
while `theLaunchTableIsExactlyTheFourRowsInTheSpec` (`:3628-3642`) reads it. Both live in the
non-`@MainActor` `struct VisitContextTests`, and **Swift Testing runs tests in parallel by
default**. Flaky by construction. Fix: make `destination(…)` take `todayIsHome: Bool = Self.todayIsHome`
and have the tests pass it explicitly, or mark the suite `.serialized`.

**M3 — The cache evicts rows another feature owns, and hides locally-created projects.**
Confidence 0.75. `CaptureProjectRef` is not a cache-only model: `S2CreateProjectScreen.swift:148`
creates rows and `S1AssignVenueScreen.swift:248-265` fetches them for the venue picker.
Task 3's `evict()` (`:706-713`) calls `store.context.delete(ref)` on anything past
`evictAfter` (60 days) or beyond `maxCachedProjects` (60) — collateral deletion of the
designer's local project list, unmentioned. Separately, `refs(owner:)` filters
`$0.remoteId?.isEmpty == false` (`:684-687`), so a project she created **offline** (no
`remoteId` until sync) is invisible to `snapshots()` and therefore to the door — on the one
screen the plan insists must work in airplane mode (`:2117`). Fix: scope eviction to
rows the cache itself created (`lastRefreshedAt != nil`), and include `remoteId == nil` rows
in `snapshots()` as unsyncable-but-selectable entries.

**M4 — Task 28's ownable-projects guard is vacuous as instructed.** Confidence 0.8.
The whole point of the tiebreak is that `ownableProjects()` (a strict subset mirroring
`room_scans`' insert guard, `SupabaseSiteScanService.swift:220`) is narrower than the full
list. Task 28 says *"set `ownableProjectIDs = allProjects.map(\.id)` at the end of `load()`"*
(`:6068`) — the full list. `f1ExpandsAndSaysSoWhenTheProjectFailsTheUploadGuard` (`:6012-6018`)
would then never fire in production, only in the unit test where the array is hand-built.
Fix: `ownableProjectIDs = (try? await scanService.ownableProjects())?.map(\.id) ?? []`.

**M5 — Four tasks assert screenshot-sweep output that `capture-shots.sh` cannot produce.**
Confidence 0.85. Tasks 13 (`:3018`), 23 (`:5192`), 30 (`:6270`) and 32 (`:6631`) expect
`screen.V0.visit`, `screen.C6.voice` and `screen.F1.context` shots. `scripts/capture-shots.sh:24-41`
holds a hardcoded 71-entry `ALL_SCREENS` array; it contains `F1.scan-setup` but **not**
`V0.visit`, `C6.voice` or `F1.context`, and **no task in this plan edits the script.** Beyond
the array, V0 is a *sheet* and C6 is a *camera mode* — both need the `-CaptureScreen <suffix>`
harness to be able to reach them, which is an unstated dependency on Wave 2's Task 5
re-baseline. Fix: add a step to Task 13/23/30 adding the suffix to `ALL_SCREENS`, and state
the harness dependency; or drop the shot expectation and rely on the device pass.

**M6 — C6 can never hit the 24-segment cap.** Confidence 0.9. The ticker calls
`FieldVoiceModeMachine.next(self.state, elapsed: elapsed, segments: 0)` — literal zero
(`:4790-4791`). `VoiceRecordingPolicy.shouldEnd(totalElapsed:segmentCount:)` therefore only
ever sees the duration arm. Task 22's `theMachineCapsOnDurationAndOnSegmentCount` (`:4795-4802`)
tests a branch the shipped path cannot reach, and the device-pass row 25 ("20-minute /
24-segment cap") can only ever be half-true. Fix: track the segment count in `C6VoiceModel`
(the rotation is `VoiceRecordingPolicy.segmentRotationSeconds`) and pass it.

**M7 — Task 10's assertion 10b is a tautology.** Confidence 1.0. `:2085-2086`:
`ASSERT 'trg_field_captures_guard_insert' < 'trg_field_captures_visit_projection'` compares two
string **literals**. It is true regardless of the database, and proves neither that the guard
trigger exists nor that it is named that. (The property it is trying to prove *is* true — I
measured it, ✔3 — which makes the fake proof worse, not better.) Fix: select both `tgname`s
from `pg_trigger` and assert the ordering on the retrieved values.

**M8 — The test suite misses the two properties the design actually turns on.** Confidence 0.9.
Nine assertion groups, and neither of these is among them: (a) **a suggestion naming a project
that exists but belongs to another designer** — group 4 (`field_capture_visit_test.sql:167-184`)
uses a *nonexistent* uuid, which exercises the FK arm, not the RLS-visibility arm that the
"suggestions are not facts" claim rests on; (b) **any malformed-payload class** (C1). Both are
cheap. Fix: add a second designer + project fixture and assert no-RAISE with
`suggested_project_id IS NULL`; add one commit per C1 error class asserting the commit succeeds.

**M9 — The "File Structure" table is incomplete and several types land in files whose stated
responsibility does not cover them.** Confidence 0.95. The table (`:38-56`) omits
`Work/FieldVisitDoorModel.swift` (Task 11), `Recognition/FieldVoiceModeState.swift` (Task 22),
`Analytics/FieldVisitTelemetry.swift` (Task 31), `Support/FieldCopyAudit.swift` (Task 30),
`Domain/Specimen+Accessors.swift` (Tasks 7, 27), and the test files `VisitDoorTests.swift`,
`VoiceModeTests.swift`, `FieldExperienceTests.swift`. It also mis-locates: `FieldDestinationPolicy`
goes into `CaptureVisitPolicy.swift` (`:4652`), `FieldTrayScope` into `FieldTodayBand.swift`
(`:5417`), `FieldScanSetupPolicy` into `FieldVisitRoomMerge.swift` (`:6027`), `FieldPlacementLine`
into `FieldVisitChip.swift` (`:4205`). This table is the index Wave 4's Task 0 will read.

**M10 — Task 13 registers the sheet against the wrong seam.** Confidence 0.8. `:2998-3000`
writes `RouteRegistry.shared.registerSheet("visit") { _ in … }`. The real file uses a passed-in
registry and the enum's key: `r.registerSheet(CaptureSheet.inboxTerminal(UUID()).registryKey) { sheet in … }`
(`RouteSessionScreens.swift:69-73`), reached from `ScreenRegistry.swift:17` as
`RouteSessionScreens.register(into: r, …)`. Both compile against
`registerSheet(_ key: String, _ build: @escaping (CaptureSheet) -> AnyView)`
(`RouteRegistry.swift:22`), but the literal `"visit"` bypasses the `registryKey` contract the
plan itself calls load-bearing (`:71`). Fix: `r.registerSheet(CaptureSheet.visit.registryKey) { _ in … }`.

**M11 — Wave 2's plan, which supplies four Task-0 preconditions, is itself NOT-READY.**
Confidence 0.9. `wave-2-plan-review.md:9` returns *"NOT-READY as written"* with one critical
and four high findings. Wave 3 consumes `CaptureFeatureFlags` + `AppContainer.featureFlags`
(Tasks 20, 23), `CameraMode.viewfinderSelectable` (Task 23), the four `CaptureScreenID` cases
and `CaptureSheet.visit` from it. Two knock-ons worth naming: wave-2's F-M3 records that
wave-3-plan's consumption list *"doesn't know about"* `CaptureScreenID.sweepSuffix`,
`SmartGuess.fieldsWorthRecording`, `Specimen.confidence(for:)` and
`CaptureCoordinator.siteScanContextRequested` — Task 0 Step 3 greps for none of them; and
wave-2's F-M1 flags `SmartGuessConfidence.confirmedFloor = 0.6` as an unauthorized product
decision that **Task 21 makes load-bearing** — `FieldDestinationPolicy.recommendation(…)`
gates the Library recommendation on `hasUnconfirmedGuess` (`:4640-4645`), which is
confidence-aware only because of that unratified floor. Fix: note the dependency in Task 0 and
add the four names to Step 3.

**M12 — `visit.end` fires at three call sites; Task 31 knows about two.** Confidence 0.85.
The door's footer (`:2938`), the tray's footer (`:5464-5470`) and **RootView's
`"visit.end"` companion action** (`:3841-3845`). Task 31 says *"add `visit.end` at both
end-visit call sites"* (`:6540`) and its Files list (`:6390-6392`) omits `RootView.swift`. The
companion path will emit no `visit.end`, so §14's duration/count metric silently under-counts.

---

## 5. Low

- **L1** `supabase/migrations/00233_field_captures.sql` (`:2027`) — the file is
  `00233_field_captures_inbox.sql`. A literal `Read` fails.
- **L2** Line-citation drift, all content-correct, all off by a few:
  `00233:175-188` → policy is `:175-186`; `00233:190-195` → `:189-194`;
  `00235:187-199` → conflict `WHERE` is `:190`, NOT-FOUND branch `:193-202`;
  `Specimen.swift:222-249` (`:174`) → `CaptureProjectRef` is `:224-250`;
  `RootView.swift:278-284` (`:3596`) → `requestOwnerReady()` is `:279-285`;
  `WorkDashboardScreen.swift:60` for `.navigationTitle("Work")` (`:3309`) → it is `:64`;
  `ViewfinderControls.swift:34-55`/`:60-81` (`:3939`) → `:36-57`/`:63-84`;
  `ViewfinderModel.swift:318-347` (`:1631`) → `makeDraft()` is `:318-346`.
- **L3** `ViewfinderModel.makeDraft()` has **four** hand-copied `venue.*` assignments, not the
  "five" the plan states (`:1751`).
- **L4** `SiteScanContextCapture.swift:175-177` is cited (`:4374`) as the shipped tap-to-start/stop
  control — correct — but Task 30 also cites `:190-196` for "the two hardcoded
  `"screen.F1.context"` strings"; the actual `Inbox` copy sits at `:86`, `:141`, `:267`.
- **L5** Interfaces-block drift vs. the implementations they describe: `static let staleConfirmWindow`
  vs. the computed `static var` (`:1360` vs `:1533`); `maxProjectsInMind` declared in an extension
  (`:1224`) but implemented inside the struct (`:1303`); `FieldTodayBandBuilder.build`,
  `FieldPlacementLine.text/isUnplaced` and `FieldTraySuggestionOrder.ordered` are `@MainActor`
  in the code but not in the Interfaces block (`:3078`, `:4190`, `:5762`). Harmless at call
  sites; the Interfaces blocks are what Wave 4 reads.
- **L6** Task 27 adds an 11th `Specimen` column (`suggestionReasonRaw`, `:5794`) that Task 7's
  Interfaces block presents as the complete set (`:1657-1666`).
- **L7** Task 1's test writes `CaptureOwnerIdentity(userID:workspaceID:)` without `!` (`:246`)
  while Tasks 3/11/12 write it with `!`. Both compile — the init is failable
  (`Specimen.swift:21`) and `CaptureProjectRef.init(owner:)` takes an Optional — but the
  inconsistency will read as a bug to whoever executes it.
- **L8** `idx_field_captures_visit` is `WHERE project_id IS NOT NULL` (`005NN…:87-89`), so it
  cannot serve any `project_id IS NULL` scan. That is **correct** — it is aimed at Wave 4's
  `useProjectVisits` (`wave-4-plan.md:1334`), not at anything Wave 3 queries (the unplaced
  tray is device-side SwiftData). The plan never says which query it serves; one line would
  prevent a future reader "fixing" it.
- **L9** The "Fourteen, not ten" headline (`:6175`) counts across waves; the replacement table
  (`:6182-6193`) edits **11** strings (Wave 1 owns the other 3). §17.3 of the package says
  *"Ten strings, not one — and the count is the decision"*, so the divergence is worth
  a sentence, not a silent correction. The four extra `S5InboxTerminalScreen` strings
  (`:36`, `:46`, `:52`, `:62`) are real — I confirmed all eleven cited lines contain the word.
- **L10** `CaptureVisitState` returning `.none` when `now < context.lastActivityAt`
  (`:1541`) silently destroys an open visit on a backwards clock adjustment. Inherited from
  `CaptureSessionContextPolicy.resolve` (`CaptureSessionContext.swift:82`), so consistent —
  worth one line of comment given R3-1's "a wrong visit is a systematic error" framing.
- **L11** The Global Constraints state the store may be reset (`:16`), but Tasks 1 and 7 —
  the two that change the SwiftData schema and are where a developer would actually hit a
  store-open failure — do not repeat it. One line in each would save a confused hour.
- **L12** Task 23 edits `CaptureEnums.swift` (`viewfinderSelectable`) and Wave 2's
  `CameraModeSeamTests` (`:5187-5191`) while Task 0 Step 4 says Wave 3 "must not edit
  `CaptureNavigation.swift` / `CaptureEnums.swift` on its own" (`:132`). The two are
  reconcilable — the STOP is about *adding a case*, not about flipping a computed property —
  but the plan should say so where it does it. Its test also pins the exact array **order**
  (`:5165`), which wave-2-plan never fixes.
- **L13** Task 9's Step 1 copies the test file that Task 10 is nominally responsible for
  creating; the file already exists in-repo, so this works, but the dependency reads backwards.

---

## 6. Answers to the specific questions asked

1. **Does `commit_field_capture` (00235, and 00516) store `raw_payload` verbatim on both paths?**
   Yes, both bodies, both paths — see ✔1/✔2. The projection fires on replay and the plan's own
   test group 5 proves it (executed, green).
2. **Can a `suggested_project_id` pointing at an unowned project RAISE?**
   No. Measured — see ✔4. The guard reads only `project_id`/`project_room_id`/`organization_id`;
   the projection's `EXISTS` runs under caller RLS and silently drops what she cannot see.
   This property is correct and **untested** (M8).
3. **Are the `suggested_*` FKs right? Is `suggestion_confidence` never rendered?**
   Yes and yes — ✔5, ✔6.
4. **RLS unchanged and `TO authenticated`? Explicit `REVOKE` on the new function? Idempotent?**
   Yes to all — ✔7, ✔8, ✔9.
5. **Does the standalone test prove projection-on-replay and the no-RAISE property?**
   Projection-on-replay: **yes** (group 5). No-RAISE: **only the FK arm** — the RLS-visibility
   arm and every malformed-payload class are untested (M8, C1).
6. **Is the trigger preferable to editing `commit_field_capture` under FC-R18?**
   **Yes.** See §1's closing note.
7. **Do all cited Swift symbols exist or get created earlier in the plan?**
   Everything cited on `main` exists and the citations are content-accurate (a handful of
   line numbers drift — L2). The gap is entirely on the Wave 1 side: eight names, four with no
   fallback (H1), plus the schema-version value (H2). Every Wave 2 name matches what
   `wave-2-plan.md` promises to build, though that plan is NOT-READY (M11).
8. **Tests under `CaptureTests` (CaptureKit only)?**
   Fully respected — ✔11. No test in the plan touches app-target code.
9. **SwiftData lightweight migration?**
   Holds — ✔12. The reset allowance is stated in Global Constraints but not where it bites (L11).
10. **FC-R5 lane separation?**
    Holds end to end — ✔13.
11. **Invariant V, the launch table, the stale prompt, 12 h, calendar day, tray scope,
    suggestion-as-question, C6 tap-to-start/stop, consent, the "Inbox" strings, register?**
    All present and correctly specified. Invariant V lands on C1 (Task 18), C3/C5 (Task 19),
    F1 (Task 28) and every non-camera screen via the Companion strip (Task 17). The launch
    table's four rows match §5.3 exactly, including `field://capture` → `viewfinderUnplaced`
    (`:3628-3642`). The stale prompt copy is verbatim §7.1 (`:3133-3137`). 12 h / calendar-day
    trace to `field-companion-plan.md:447`, **not** to the package — the plan cites §5/§7 for
    them (`:11`), which slightly over-claims the source, though the rule is properly
    authorized by the program plan. C6 is tap-to-start/tap-to-stop with press-and-hold
    surviving only on C3, exactly as §7.4 requires (`:4409-4432`). The copy is in register:
    no "AI", no "algorithm", no exclamation, and three guard tests plus a wave-gate grep keep
    "Inbox" out (`:3156`, `:3992`, `:4811`, `:6634`). The two defects here are the tray's
    scope emptying on sync (H3) and the C3 affirmation (H5).
12. **Placeholder scan, type-name drift, Wave 4 Interfaces, `currentSchemaVersion`?**
    No placeholder types — every `Field*` / `Capture*` name the plan introduces is defined in
    the same plan, and Wave 2's `FieldPlaceholderScreen` deletion (`wave-2-plan.md:1231`) is
    never referenced. Type names are consistent across all 34 tasks; the drift is `let`/`var`
    and `@MainActor` (L5), not names. Wave 4's dependency surface is narrow and **fully
    satisfied**: `field_captures.visit_id`/`.visit_label`/`.visit_kind` (produced,
    `005NN…:63-70`), `CaptureSessionContext.kind/kit/label/endedAt` (Task 5), a real
    `endVisit(identity:now:)` that stamps `endedAt` instead of replacing the context
    (Task 6 — wave-4-plan.md:4833 explicitly depends on this change and says to stop if it is
    absent), and `VenueStamp` unchanged in shape. `currentSchemaVersion` is H2.
13. **Task granularity, ordering, gates, device pass?**
    Ordering is correct and deliberately so: 3-1 (cache) is sequenced first as the critical
    path per R3-2, and every dependency I traced is respected — Task 1's value types before
    Task 2's policy before Task 3's cache before Task 11's door; Tasks 5–6 before every
    consumer of `CaptureVisitState`; Task 7's `inherit` before Task 8's payload; Task 18's chip
    before Task 19's placement line. Gates are verbatim and correct (✔15). The device-pass
    template is right (✔14). Task 9/10's SQL ordering reads backwards (L13) but works.

---

## 7. Required edits

| id | Task | Edit |
|---|---|---|
| **F-C1** | 9 (the migration) | Make the projection total. Replace each bare cast with a NULL-on-failure sub-block, and coerce unrecognised `kind`/`kit`/`basis` strings and out-of-range/over-precision `confidence` values to NULL instead of letting the CHECK raise. Sketch: wrap the body's assignments in `BEGIN … EXCEPTION WHEN OTHERS THEN NULL; END;` per field, or add a small `SET search_path`-pinned `public.field_capture_safe_*` cast helper set (each also needing the `REVOKE ALL … FROM PUBLIC, anon` idiom). Keep the CHECKs — they still guard direct writers. |
| **F-C1b** | 10 (the SQL test) | Add an assertion group: one `commit_field_capture` per C1 class (bad timestamptz, unknown kit, unknown basis, confidence 1.4, confidence 12.5, non-uuid `visit.id`) asserting the commit **succeeds** and the offending column lands NULL. |
| **F-H1** | 0 | Extend Step 4's fallback table to all eight Wave 1 names. For `VoiceRecordingPolicy`, `VoiceNoteResult.audioSegments`/`.onDevice` and the three `Specimen` voice `*Raw` properties the action is **STOP and escalate to the Wave 1 owner** — Wave 3 must not re-author them. Say it explicitly. |
| **F-H2** | 0, 8, 10 | Replace "expect `currentSchemaVersion = 2`" with "record the found value; Task 8 sets found+1 and reports the number". Task 8's test reads the constant, not the literal `3`. SQL test asserts `capture_schema_version` round-trips whatever the fixture carried. |
| **F-H3** | 15, 25 | Decide FC-R6 explicitly. Preferred: keep `.committed` unplaced captures in `unfiled()` and place them through `route_field_capture` (`00235:309`). Otherwise scope wave 3's tray to pre-sync captures **in the task text** and add the gap to "What this wave does NOT do". Either way delete the `.dismissed` reference from the doc comment — `CaptureStatus` has no such case. |
| **F-H4** | 6 | Bind the context to a `let` before comparing (see §3 H4). |
| **F-H5** | 20 | Make C3's affirmation a `Button` backed by `@State private var affirmed`, and gate `onMicPressChanged(true)` on it for a `conversation` note. Extend the test past the string. |
| **F-M1** | 6 | `pastThirtyMinutesTheVisitGoesStaleNotAway` pins an explicit `Calendar`/`TimeZone`, matching `aVisitNeverResumesAcrossACalendarDay`. |
| **F-M2** | 16 | `destination(visitState:deepLinkedToCapture:todayIsHome:)` with a defaulted parameter; the tests pass it. No global mutation. |
| **F-M3** | 3 | Scope `evict()` to cache-created rows; include `remoteId == nil` refs in `snapshots()`. |
| **F-M4** | 28 | `ownableProjectIDs` comes from `ownableProjects()`, not the full list. |
| **F-M5** | 13, 23, 30 | Add each new `CaptureScreenID` suffix to `scripts/capture-shots.sh`'s `ALL_SCREENS`, or drop the shot expectation from Step 4 and Task 32. |
| **F-M6** | 23 | Track and pass the real segment count to `FieldVoiceModeMachine.next`. |
| **F-M7** | 10 | Assertion 10b reads both `tgname`s from `pg_trigger` and compares those. |
| **F-M8** | 10 | Add the cross-designer-suggestion no-RAISE group (second designer + project fixture, assert commit succeeds and `suggested_project_id IS NULL`). |
| **F-M9** | header | Complete the File Structure table; add the five missing source files and three test files, and correct the four mis-located responsibilities. |
| **F-M10** | 13 | `r.registerSheet(CaptureSheet.visit.registryKey) { _ in … }`. |
| **F-M11** | 0 | Note that `wave-2-plan.md` is NOT-READY; add `CaptureScreenID.sweepSuffix`, `SmartGuess.fieldsWorthRecording`, `Specimen.confidence(for:)`, `CaptureCoordinator.siteScanContextRequested` to Step 3's greps; and flag that Task 21 makes wave-2's unratified `confirmedFloor = 0.6` load-bearing. |
| **F-M12** | 31 | Add `RootView.swift` to the Files list and emit `visit.end` at the companion-action call site too. |
| **F-L1–L13** | various | Correct the cited filename and the eight line ranges; "four" not "five" `venue.*` assignments; align the Interfaces blocks with the implementations; add `suggestionReasonRaw` to Task 7's list; make the `CaptureOwnerIdentity` construction consistent; one line on what `idx_field_captures_visit` is for; one line reconciling the "fourteen/ten" counts; one line on the backwards-clock branch; repeat the store-reset allowance in Tasks 1 and 7; a sentence in Task 23 reconciling its `CaptureEnums.swift` edit with Task 0's STOP. |

---

## 8. Closing note

The plan is unusually well-evidenced for its size — I checked roughly ninety citations and
found **zero fabricated symbols**, eight line ranges off by a few, and one wrong filename.
Its central architectural bet (project the columns from `raw_payload` in a trigger rather than
re-entering the `commit_field_capture` queue) is correct under FC-R18 and I proved both
properties it rests on. Its two structural disciplines — CaptureKit-only testability and the
FC-R5 lane separation — hold across all 34 tasks without a single lapse.

The findings that matter are not about shape. C1 is a real production bug in the SQL as
written, and it is the one thing here that would reach a designer's phone and stay there.
H1–H3 are places where the plan's picture of the world (Wave 1's landed symbols, the meaning
of `.committed`) is ahead of the world. Fix those, and the rest is copy-editing.
