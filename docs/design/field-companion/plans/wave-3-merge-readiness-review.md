# Wave 3 — independent merge-readiness review

**Reviewer:** independent (did not author any of wave 3).
**Branch:** `feat/field-companion-w3` @ `0da5424dc` · merge-base with `main` `695addb5f` · `origin/main` (`51fdd61b7`) merged in at `4d56aeb65`.
**Worktree:** `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w3` (read-only throughout; no commit, checkout, stash, or edit).
**Date:** 2026-08-26.
**Scope:** 148 commits, 644 files, +72,829 / −3,304.

---

## 1. Gate — re-run independently

Run in the worktree, foreground, against an isolated DerivedData path
(`…/scratchpad/DerivedData-review`, injected via a PATH shim so the collision risk with
the conductor's build was zero and `scripts/capture-gate.sh` itself was executed unmodified):

```
cd apps/mobile/Capture && scripts/capture-gate.sh all
✔ build
✔ tests
✔ lint
✔ fc-r3 sweep (inbox)
✔ fc-r3 sweep (ai)
✔ principle-4 sweep
EXIT=0
```

Exact test numbers, read from the xcresult bundle rather than from stdout
(`xcrun xcresulttool get test-results summary`):

| | |
|---|---|
| totalTestCount | **559** |
| passedTests | **559** |
| failedTests | **0** |
| skippedTests | 0 |
| expectedFailures | 0 |
| result | **Passed** |
| device | iPhone 17 · iOS Simulator 26.5 (23F77) · arm64 |
| environment | CaptureKit · built with macOS 26.5.2 |

`swiftlint lint --quiet --strict` clean. All three sweep arms green.
**The conductor's 559/559/0 claim is confirmed exactly.**

Note: `xcresulttool` also reports a per-configuration `passedTests: 561` alongside
`totalTestCount: 559` — the difference is the two parameterised tests that run 4 times
across 2 declarations (`"2 tests ran with dynamic parameters" / "4 test runs"`), not two
extra tests. 559 is the correct headline number.

### SQL tests

Local DB lock taken atomically (`mkdir /tmp/patina-local-supabase-db.lock.d`), released
with `rmdir` after. Local stack confirmed local (`postgresql://postgres:postgres@127.0.0.1:54322`)
before anything ran. `00532` was already applied to the local ledger; I re-applied the file
verbatim first to prove idempotence (clean, all `IF NOT EXISTS` skips, exit 0), then ran
`scripts/run-sql-tests.sh` **from the worktree root**:

```
total:             128
green:             106
expected-fail:      22  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:     0
effective-green:   128 / 128
EXIT=0
```

`supabase/tests/field/field_capture_visit_test.sql` → **PASS**.
**The conductor's 128 / 0-unexpected claim is confirmed exactly.**

---

## 2. Migration 00532 — review

`supabase/migrations/00532_field_capture_visit_and_suggestion.sql` (352 lines).

### Prod ledger check (read-only)

`supabase migration list` against the linked Strata project:

- Remote head is **`00531`**.
- **`00530` applied** ✓ · **`00531` applied** ✓ · **`00532` NOT applied** ✓ (as intended — this
  wave is unmerged and unpushed).
- Gaps below the head are pre-existing and expected (`00512` parked, `00342–00349`,
  `00355–00357`, `00359`, `00365–00369`, `00459`, `00487–00488`, `00496–00497`,
  `00502–00509`, `00517–00520`, `00522–00529`).

### Collision check

- `git ls-tree main` and `git ls-tree origin/main` over `supabase/migrations/`: only
  `00530` and `00531` in the `0053x` band — **no collision**.
- Sweep of every local branch and remote-tracking ref: `00530`, `00531`, `00532` only.
  `00532` exists on this branch alone.
- `docs/engineering/migration-number-reservations.md` was updated in the same wave to record
  `00532` as drawn (`docs/engineering/migration-number-reservations.md:83,155`) — discipline
  rule 5 honoured, unlike the 00521 lapse the file itself records.

### Generated types

```
git diff 695addb5f..HEAD --stat -- supabase/ packages/supabase/src/types/ packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts            |  51 ++
 supabase/migrations/00532_...sql                   | 352 +++
 supabase/seed/00-legacy-grants.sql                 |   6 ++
 supabase/tests/field/field_capture_visit_test.sql  | 656 +++
```

`database.types.ts` is **+51 / −0**, and every added line is one of the ten new columns in
Row/Insert/Update plus three `foreignKeyName` entries for the two new FKs. **No stray reformat**
— the W1 31k-line-reformat failure mode did not recur. Types are in sync with 00532.

`supabase/seed/00-legacy-grants.sql` correctly carries the regenerated 00532 block
(`supabase/seed/00-legacy-grants.sql:11717-11721`), so a fresh `supabase:reset` reconstructs
the REVOKE. The skill's "regenerate the ACL seed after any GRANT/REVOKE" rule is met.

### Against the `patina-db-migrations` quality bar

| Rule | Verdict |
|---|---|
| `NNNNN_slug.sql`, hand-numbered, > head | ✓ |
| Banner header with intent + hazards + lineage reasoning | ✓ — unusually good; it explains *why* it stays off `commit_field_capture` |
| Idempotency | ✓ — **proven by re-apply**, not asserted |
| No table added → no RLS clause owed | ✓ (additive columns on an RLS-enabled table) |
| `SECURITY INVOKER` (trigger default) claim | ✓ **and load-bearing** — verified `commit_field_capture` is itself `SECURITY INVOKER` (`supabase/migrations/00235_commit_field_capture_rpc.sql:61`), so the caller's RLS really does apply inside the trigger. Had 00235 been `SECURITY DEFINER`, the "a project she cannot see is treated as absent" claim at `00532:129-131` would have been false. It is true. |
| `search_path` pinned | ✓ `SET search_path = public, pg_temp` (`00532:150`) |
| Explicit REVOKE from `PUBLIC, anon` on a new public routine | ✓ (`00532:342`) — the prod auto-grant-anon trap is closed |
| No `GRANT` needed in return | ✓ — correct reasoning: EXECUTE on a trigger function is checked at `CREATE TRIGGER`, not at fire time |
| Extension functions schema-qualified | n/a — none used |
| Enum values in isolation | n/a — no enum touched; controlled vocabularies are `text` + named CHECK |
| Money in integer cents | n/a |
| `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` | ✓ (`00532:347-350`) |
| Named CHECK constraints (droppable by name for a later widening) | ✓ |

### The never-raising projection trigger

The design is sound and the reasoning in the header is correct: the upsert (and therefore this
`BEFORE` trigger) runs *before* `commit_field_capture`'s own safe-harbor `BEGIN` block
(00235:223-299), so an exception here escapes the RPC with no harbor at all on the inbox path —
which, against an offline-first client that re-drains its outbox forever, would wedge the queue
permanently.

I traced every path from a payload value to a possible `RAISE`:

- `visit.id`, `visit.startedAt`, `visit.endedAt`, `suggestion.projectId`,
  `suggestion.projectRoomId`, `suggestion.confidence` — each cast sits in its own
  `BEGIN … EXCEPTION WHEN OTHERS` sub-block.
- `visit.kind`, `visit.kit`, `suggestion.basis` — checked in SQL (`IN (…)`) before assignment,
  so the CHECK never bites.
- `suggestion.confidence` in-range → `round(v_num, 2)`, exact for `numeric(3,2)`, cannot overflow.
- The `raw_payload` error-append at `:322-329` guards `jsonb_typeof(NEW.raw_payload) = 'object'`
  before `||`, so a scalar/array payload cannot raise `22023`.

I could not construct a payload that raises. The SQL test suite independently exercises six
malformed classes (22007, 23514 ×3, 22003, 22P02) plus three unresolved-FK classes, each asserting
the commit *succeeds*. This is the strongest-tested part of the wave.

### Migration findings

**M-1 · Low · High confidence** — `supabase/migrations/00532_field_capture_visit_and_suggestion.sql:129`
cites `00233_field_captures_inbox.sql:189-194` for `field_captures_guard_routing`; the function is
actually declared at `00233:195` (189-194 is its comment block). Cosmetic citation drift only; the
substantive claim (that guard is `SECURITY INVOKER`) is correct.

**M-2 · Low · High confidence** — `00532:84-113` uses `ADD COLUMN IF NOT EXISTS <col> CONSTRAINT
<name> CHECK (…)`. When the column already exists the whole clause is skipped, so the named CHECK
is skipped with it. Idempotent (proven), but it means the constraints are *not* self-healing: if a
column ever pre-exists without its CHECK, no re-run of this file will add it. Harmless as written
(the columns and constraints land together on a fresh apply, which is the only path prod will take);
worth knowing before anyone treats a re-run as a repair.

**M-3 · Low · Medium confidence** — Once a row carries `raw_payload->'visit_projection_errors'`,
the stored payload differs from what the device sent, so the TG_OP short-circuit at `00532:171`
(`NEW.raw_payload IS NOT DISTINCT FROM OLD.raw_payload`) can no longer fire for that row on a
re-commit of the *same* device payload — it re-projects and re-appends every time. Behaviourally
correct and self-consistent (the array is idempotent in content), but the documented cost saving
does not apply to error-carrying rows.

**M-4 · Note · High confidence** — `CREATE INDEX` (not `CONCURRENTLY`) inside the migration's
transaction takes a lock on `field_captures` for its duration. Table is small today, and
`CONCURRENTLY` cannot run inside a transaction block anyway, so this is the right call — recorded
only so nobody is surprised if `field_captures` is large by the time this pushes.

**M-5 · Note · High confidence** — `docs/design/field-companion/waves/wave-3/wave-3-conductor-check.md`
records "7" visit+suggestion columns. There are **10** (`visit_label`, `visit_started_at`,
`visit_ended_at` are missing from its list; I counted all ten in `information_schema.columns`
locally). The check's *conclusions* are all correct — this is a transcription slip in one code
block of the evidence file.

---

## 3. Diff review

### (a) FC-R11 consent — the Critical fix and its guard

**Verified fixed.** `C6VoiceModel` no longer freezes the visit:

- `apps/mobile/Capture/Capture/Features/Capture/C6VoiceScreen.swift:61-64` — `liveVisit` reads
  `CaptureSessionContextStore.shared.visitState(identity:)` **at the moment of use**.
- `:93` — `noteSetting` is derived from `liveVisit` live, so the affirmation chip renders for a
  walk-through started from the chip while already in VOICE mode.
- `:112-123` — `start()` pins `takeVisit` and `takeNoteSetting` **before** `voice.setNoteSetting(…)`
  at `:129`, so FC-R11's only audit row is written from the same visit the words were spoken in.
- `:204-233` — `commit()` reads `takeVisit`/`takeNoteSetting` only, never `liveVisit`, so a visit
  changed mid-recording cannot restamp a finished note. One take, one visit.
- `:100-107` and `:358-359` — the gate (`FieldAffirmationPolicy.recordingIsBlocked`) is applied
  both in the model's `toggle(affirmed:)` and on the button's `.disabled`, so neither an
  accessibility action nor a race can start an unaffirmed conversation note.

The gate is a real `Button` (`Capture/Features/Capture/FieldAffirmationChip.swift:18`), not inert
`Text` — Ruling 4 satisfied. C3's parallel path is equally gated
(`Capture/Features/Capture/ViewfinderModel.swift:471-476`, `CaptureCardOverlay.swift:178-179`).

**F-1 · High · High confidence — the Critical fix ships with no test.**
`git show 129638ff6 --stat` touches **seven files, none of them under `CaptureTests/`**. The test
count is 559 before and after the fix. The regression this closed was, by the conductor's own
description, FC-R11's consent step being skipped outright on a walk-through — and nothing now
guards it. I accept that `C6VoiceModel` is app-target and `CaptureTests` has no app host, so a
direct test is impossible; but the wave *already established the honest workaround for exactly this
shape* at R263 (lift the contract into CaptureKit so a rename breaks the build, and pin the
CaptureKit half in a test). That route was not taken here. The specific pinnable facts are: "the
note setting handed to the recorder is computed from the visit as of `start()`" and "`commit()`
uses the pinned visit". Both could live in a small CaptureKit value type (e.g. a
`FieldVoiceTake { visit; noteSetting }` minted by a pure factory) that `C6VoiceModel` is forced
through. **This is my single strongest merge concern.**

**F-2 · Medium · High confidence — FC-R11's affirmation reaches two of the four recording surfaces.**
`FieldAffirmationPolicy.recordingIsBlocked` has exactly three call sites — `C6VoiceScreen.swift:103`
and `:358`, `ViewfinderModel.swift:471`, `CaptureCardOverlay.swift:178`. **N4** (`VoiceNoteSheet`)
and **F2** (`SiteScanContextCapture`'s recorder) have no chip and no gate.
`CaptureKit/CaptureKit/Domain/FieldVisit.swift:82-84` even narrows the rule in a comment: *"BOTH
surfaces that record — the C3 card and C6"*. FC-R11 says the opposite: *"both wave-1-reachable voice
surfaces record other people by construction: N4 (a rep at a showroom) and the in-scan context
capture"* (`docs/design/field-companion/field-companion-rulings.md:444-447`).
**Not a wave-3 plan violation** — `wave-3-plan.md:27` scopes Ruling 4 explicitly to C6 and the C3
inline mic, and wave 3 does not regress N4/F2 (they were ungated before). But the ruling's own two
named surfaces remain ungated after the wave whose job was the consent posture, and the CaptureKit
comment now asserts the narrower rule as if it were FC-R11. At minimum the comment should stop
claiming completeness; the substantive gap is Kody's to schedule.

**F-3 · Medium · High confidence — R279 confirmed, and it is C6-only.**
`C6VoiceScreen.swift:312-314` resets `affirmed` only when recording stops. C3 does better:
`ViewfinderScreen.swift:110` resets on `model.cardSpecimen?.id` change, so a fresh card is a fresh
consent — which covers C3's common case. C6 has no per-note identity to key on, so an affirmation
tapped for walk-through A and not spent survives into walk-through B, and `setNoteSetting(.conversation)`
writes an "affirmed" row into FC-R11's only audit trail for a room B nobody affirmed. My own view is
in **§5**.

**F-4 · Low · Medium confidence — `.interrupted`'s copy promises resumption the model cannot deliver.**
`C6VoiceScreen.swift:236-241`: `interrupt()` calls `stop()`, which **commits the note**, then sets
`.interrupted`, whose line reads *"Paused — your note is saved. Tap to keep going."*
(`CaptureKit/CaptureKit/Recognition/FieldVoiceModeState.swift:36`). Tapping calls `start()` and mints
a **second** note. The note is genuinely saved, so the first half is honest; "Tap to keep going" is
not — and it produces exactly the several-notes-from-one-walk-through outcome the `.background`
vs `.inactive` choice at `:299-307` was chosen to avoid.

**F-5 · Low · Medium confidence — a signed-out owner loses a finished take silently.**
`C6VoiceScreen.swift:197`: `guard let owner else { return }` after `voice.finish()` has already
returned a real transcript and audio. The recording is discarded with no analytics event and no
user-visible line. (Pre-existing shape, carried into C6.)

### (b) FC-R12 — a suggestion never becomes the fact

**Clean.** Verified end to end:

- `suggestionConfidence` has **zero** references in the app target. Confirmed by my own grep and
  by the gate's new `p4` arm (`apps/mobile/Capture/scripts/capture-gate.sh:129-150`). The only
  readers are `FieldTraySuggestionOrder.ordered` (`Specimen+Accessors.swift:410-411`), the payload
  encoder (`FieldCapturePayload.swift:315`) and the Specimen accessor (`:301`).
- `FieldVisitTelemetry` carries **no** confidence property on any event
  (`CaptureKit/CaptureKit/Analytics/FieldVisitTelemetry.swift:8-10, 17-58`), and the file says so
  explicitly. The `suggestionAccepted(basis:)` overload exists precisely so the view-layer call
  site (`V1SessionTrayScreen.swift:218`) never builds a `CaptureSuggestion` to reach `.basis`.
- `suggestionReasonRaw` is **device-only**: `buildSuggestion` (`FieldCapturePayload.swift:305-316`)
  sends `projectId`, `projectRoomId`, `basis`, `confidence` and **not** `reason`. 00532 has no
  `suggestion_reason` column. Correct on both sides.
- `apply(_:)` (`Specimen+Accessors.swift:297-303`) writes only `suggested_*`; `place(…)`
  (`:379-387`) writes only `venue.projectId/projectRoomId`. The two never touch each other, and
  `applyingNilClearsTheSuggestionWithoutTouchingTheFact` pins it.
- Nothing auto-applies. The tray's suggestion is a `Button` reading *"…. Place it here?"*
  (`V1SessionTrayScreen.swift:186-207`) and only `accept()` (`:212-225`) writes the fact.
- 00532 stores `suggested_*` in columns distinct from `project_id`/`project_room_id`, and nothing
  in the migration copies one to the other.

**F-6 · Note · High confidence** — the `p4` sweep greps a **token**, not a capability: a view could
still construct a `CaptureSuggestion` and read `.confidence` off it without the literal
`suggestionConfidence` appearing. The gate script's own comment says exactly this and records that
a real violation of this shape occurred this wave and was caught by hand-grep, not by the test. The
sweep is a genuine improvement; it is not a proof.

### (c) FC-R5 — merge by trimmed name, never cross-assign

**Clean.** `CaptureKit/CaptureKit/Work/FieldVisitRoomMerge.swift:47-73` keys on
`normalized(name)` = trimmed + lowercased, and each pass writes **only its own lane**, carrying the
other lane forward via `byKey[key]?.<otherLane>`. A room in one list leaves the other lane `nil`.
`FieldVisitRoomOption` (`:13-24`) types the two ids apart with comments naming which column each may
reach. `FieldVisitDoorModel.draft()` (`:169-192`) stamps `projectRoomID: room?.projectRoomID` and
`scanRoomID: room?.scanRoomID` — no crossing. `C6VoiceModel.commit()` puts `takeVisit.context?.scanRoomID`
in provenance and lets `routing.stamped(onto:)` carry the capture lane
(`C6VoiceScreen.swift:213-219`), with a comment explaining why. FC-R5's degradation caption ships
(`FieldVisitRoomMerge.swift:79-83`) and F1 says the same thing out loud
(`FieldScanSetupPolicy.state`, `:109-111`).

**F-7 · Low · High confidence — two same-named rooms in ONE lane silently collapse to the last id.**
`FieldVisitRoomMerge.merge` keys the accumulator on the normalized name, so `project_rooms`
containing both "Bath" and " bath " yields **one** option carrying only the second id. The behaviour
is *pinned as intended* by `duplicateNamesWithinOneListCollapseToTheLastIDSeen`
(`CaptureTests/VisitRoomMergeTests.swift:107-118`), so it is a deliberate choice, not a bug — but
FC-R5's stated failure mode ("two rooms that are the same room in the world and different rows in
the database") has a mirror here: two rooms that are *different* rooms in the world and
same-named rows in the database, one of which becomes unpickable with no caption. Not raised
anywhere in the record I read.

### (d) FC-R6 + spec §7.8 tray ordering, §7.1 copy

**Clean on the ordering contract.** `V1SessionTrayScreen.reload()` (`:353-382`):

1. `items` = the visit's own captures (`store.session(visitID:owner:)`), ordered newest-first by
   `ordered(_:)` (`:44-46`) — deliberately **not** confidence-ordered, because `place(…)` leaves
   `suggested_*` standing and a stale question must not reorder answered work.
2. `unplaced` = `store.unfiled(owner:)` **minus** anything already visible under the visit
   (`FieldTrayUnplacedFilter.excluding`, `CaptureKit/CaptureKit/Work/FieldTrayScope.swift:54-58`),
   confidence-ordered by `FieldTraySuggestionOrder` (`:56-66`).
3. The "Not placed yet" heading renders only when it trails a visit section (`:123-127`) —
   otherwise `scope.title` is already "Not placed yet" (`FieldTrayScope.swift:18`).
4. `placedJustNow` → *"placed · syncing"* (`:171-180`), self-clearing on `reload()` when the record
   completes (`:378-381`).

**F-14 · Low · Medium confidence — the tray's `accept()` takes the exact footgun `place(…)` documents.**
`Specimen.place(projectID:projectRoomID:room:)` warns in its own doc comment
(`CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift:375-378`) that *"`room: nil` means KEEP THE
EXISTING LABEL, not clear it… Callers that mean 'no room' must pass the replacement label
themselves."* `V1SessionTrayScreen.accept()` (`:213-215`) calls
`place(projectID:, projectRoomID: specimen.suggestedProjectRoomID, room: nil)` — and wave 3's
engine **always** produces `projectRoomID: nil` (`CaptureKit/CaptureKit/Work/CaptureSuggestionEngine.swift:55, 68`).
So accepting a suggestion always writes `projectRoomId = nil` while leaving any pre-existing
`venue.room` label standing, now beside a project that label may not belong to. That label is
rendered (`CaptureKit/CaptureKit/Capture/FieldVisitChip.swift:79`,
`Capture/Features/Route/S4SavedTerminalScreen.swift:175`). Requires an unplaced capture that already
carries a room label — reachable via S1 Assign venue (`S1AssignVenueScreen.swift:395`) — so the
window is narrow, which is why I rate it Low. Passing `room: ""`-normalised-to-nil, or the merged
option's name, would close it.

Matches §7.8's order exactly. FC-R6's "nothing is ever lost" holds: `CaptureStore.unfiled()`
(`CaptureKit/CaptureKit/Persistence/CaptureStore.swift:709-718`) applies **no status filter**, so
the tray empties on *placement*, never on sync — and `isUnplaced`
(`Specimen+Accessors.swift:327-330`) is the single predicate Today's count and the tray's list both
read, so R98's "they agree" holds by construction.

**F-8 · Low · High confidence — §7.1's Syncing copy is deliberately not what the spec says.**
Spec §7.1 specifies *"`n queued` on the card's second line"*. The implementation ships
*"`n` still on this phone"* (`CaptureKit/CaptureKit/Work/FieldTodayBand.swift:60`), with a comment
at `:49-50` saying "Never the word 'queued' (mechanism vocabulary)". I think the implementation is
right and the spec line is the stale one — but it is an unrecorded spec deviation, and §7.1's other
strings ("Showing what's on this phone.", "Still at Maple St?", "started 9:14am", "Start a visit")
all ship verbatim, so this is the one line where the two disagree.

### (e) FC-R3 — vocabulary and the sweep

**The sweep works and is a real improvement.** I re-ran its grep by hand across `Capture/` and
`CaptureKit/` and got exactly the six protected lines the script allows, with no unlisted match:

| Line | Kind |
|---|---|
| `Capture/Services/Sync/LocalCaptureSyncService.swift:361` `destination = "inbox"` | wire contract |
| `Capture/Services/Sync/LocalCaptureSyncService.swift:698` `status == "inbox"` | wire contract |
| `Capture/Features/Route/S5InboxTerminalScreen.swift:86` `["destination": "inbox"]` | §14 taxonomy |
| `CaptureKit/CaptureKit/Navigation/CaptureNavigation.swift:80` `case .inboxTerminal` | route key |
| `CaptureKit/CaptureKit/Navigation/RouteRegistry.swift:56` `case .inbox: return "inbox"` | registry key |
| `CaptureKit/CaptureKit/Support/FieldCopyAudit.swift:17` `forbiddenWords` | the declaration |

(The brief's "3 allowed wire literals" undercounts what the script actually allows — six, of which
two are wire, one is taxonomy, two are route/registry keys and one is the declaration. The script's
own header enumerates all six correctly.)

Extending the sweep roots to `CaptureKit/` was necessary and is the right call — this wave moved a
large share of designer-facing copy there. The added whole-word `ai` arm is correct
(`\bai\b` does not trip "maintain"/"available").

**F-9 · Medium · High confidence — three bypasses in the sweep, all reachable.**
`apps/mobile/Capture/scripts/capture-gate.sh:69-71`:
1. `sweep_filter` drops any line containing `// ` **anywhere**, so
   `Text("Parked in your inbox")  // TODO` passes the gate.
2. The regex `"[^"]*\bword\b[^"]*"` cannot see multi-line `"""` literals.
3. Lines containing `analytics.event` are dropped wholesale, so
   `analytics.event("x", ["msg": "…inbox…"])` passes.
Additionally, `CaptureKitMocks/` is not a sweep root though it links unguarded into the app target.
The conductor recorded items 1–3 and the mocks gap at R280 and deferred them to wave 4; I agree they
are not merge blockers, and I record them here because the gate is the *only* thing standing between
reintroduced copy and green.

### (f) FC-R4 — direct device writes and owner scoping

**Clean, and better disciplined than I expected.** Every store read that touches visit fields goes
through one shared policy rather than an ad-hoc guard:

- `CaptureOwnerProjectionPolicy.resolve` (`CaptureKit/CaptureKit/Session/CaptureOwnerProjection.swift:19-32`)
  **fails closed**: real services + a missing `userID`/`workspaceID` → `.unavailable` (empty lists),
  never a global read. The unscoped `unfiled()` / `session(visitID:)` overloads are reachable only
  through `.globalFixtures`, which requires `runsRealServices == false`.
- All four call sites use it: `V1SessionTrayScreen.swift:366-375`,
  `WorkDashboardModel.swift:121-131`, `RootView.swift:510-526` (`FieldVisitEndCounts.compute`),
  and `CaptureOwnerProjectionPolicy.specimen(…)`.
- `CaptureStore.unfiled(owner:)` (`CaptureStore.swift:720-727`) filters on
  `owner.matches(userID:workspaceID:)`, and `CaptureLifecycleTests.swift:966-967` proves stripping
  that filter reddens.
- `CaptureProjectCache` is owner-scoped on every read/write path
  (`CaptureKit/CaptureKit/Work/CaptureProjectCache.swift:148-274`).
- 00532 adds no new RPC and no new grant surface; the device still writes only through
  `commit_field_capture` (`SECURITY INVOKER`, so RLS applies).

**F-10 · Note · Medium confidence** — `CaptureProjectCache.referencedProjectIDs()`
(`CaptureProjectCache.swift:296-310`) deliberately reads **all** owners' `Specimen` and
`ScanUploadRecord` rows to decide eviction. The comment justifies it ("sparing one row too many
costs a little disk, deleting one costs her work") and nothing read there is ever displayed, so
there is no leak — but on a shared phone designer B's records keep designer A's cache rows from
being evicted. Recorded, not a defect.

### (g) Principle 4 sweep

Covered under **(b)** and **F-6**. The arm is correctly scoped (app target only; CaptureKit's
ordering read stays legal) and its failure message explains the right fix.

### (h) The AppContainer store-ladder lift (`d34758c55`)

**Both halves hold.**

- The in-memory rung is **loud in three places**: `CaptureStore.walk` emits `log.fault(…)`
  (`CaptureStore.swift:194-197`); `AppContainer.reportStoreOpen` emits `store.in_memory_fallback`
  with the failure chain (`AppContainer.swift:180-193`); and `SyncStatusScreen` prints
  `Self.inMemoryWarning` in `CaptureColor.error` next to the outbox depth
  (`Capture/Features/SystemEntry/SyncStatusScreen.swift:103-111, 120-126`). The warning is
  **deliberately flag-independent** ("an off switch on the truth would put the designer back where
  this bug found her") and never tells her to relaunch — which would be the one action that
  destroys everything the run is holding. This is right.
- `CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault`
  (`CaptureTests/CaptureStoreLadderTests.swift:33-46`) iterates the **real** `CaptureStore.schema`
  and fails on any non-optional attribute with no default. Not tautological — it would catch a
  future mandatory column anywhere in the schema. Note that it filters `where !attribute.isOptional`,
  and wave 3's new stored properties are all optional, so it does not *currently* constrain them —
  which is correct (an optional column needs no default) and which the conductor corrected in its own
  record at R270 after initially overstating it.
- The lift itself is behaviour-preserving: `makeResilientStore` is a straight extraction plus the
  `isProtectedDataAvailable` closure (needed because iOS relaunches Field in the background for the
  scan upload session, before first unlock). Ordering change is real and documented:
  `projectCache` must be built after `work.projects` and before `sync`.

### (i) W1/W2 behaviour already on prod / TestFlight build 2

Everything below I verified directly against the diff:

- **Wire compatibility is safe.** `FieldCapturePayload.currentSchemaVersion` goes 2 → 3
  (`FieldCapturePayload.swift:52`), and both server readers **coalesce rather than assert** it
  (`00235:144` and `00530:448`: `COALESCE(NULLIF(v_payload->>'schemaVersion','')::int, 1)`), so a
  build-2 phone sending version 2 and a wave-3 phone sending version 3 both commit. The new
  `visit`/`suggestion` envelopes are additive and read key-by-key. `voice.noteSetting` is additive.
- **A build-2 phone loses nothing.** 00532 projects only keys a build-2 payload does not carry, and
  the trigger leaves a column alone when its key is absent.
- **Copy changes on shipped surfaces** (all improvements, all FC-R3-motivated):
  `LocalCaptureSyncService.swift:38` "Choose Library or Inbox before sending this capture." →
  "Choose where this belongs before sending it."; `:606` "…moved to the inbox…" → "…held for
  later…"; `VoiceNoteSheet.swift:155` "HOLD TO TALK" → `statusLine(…)`;
  `SiteScanContextCapture.swift:390-396` three header lines → `FieldContextCaptureCopy`. The full
  set spans ~28 strings across 11 shipped screens — every "inbox"/"Parked in your inbox"/"Send to
  inbox" becomes "held"/"Held for you"/"Hold for later", "Work" becomes "Today", and
  `SiteScanContextCapture`'s *"This iPhone can't measure a room."* becomes the plain section label
  *"Photos & notes"*. All trace to FC-R3 via `FieldCopyAudit`, all are copy-only, and **none touches
  a persisted value, an identifier, or the wire contract** — `CaptureDestination.inbox`, the screen
  ids and the analytics keys are all deliberately untouched, which the gate's own allowlist proves.
  The one I'd flag for a human read is the `SiteScanContextCapture` eyebrow: the old line explained
  *why* there is no scan (device limitation); the new one is only a label.
- **N4's gesture changed on a shipped surface**: `VoiceNoteSheet` went from hold-to-talk
  (`DragGesture`) to tap-to-start/tap-to-stop (`VoiceNoteSheet.swift:185-246`), with the
  `gestureHeld` latch removed. This is a deliberate §7.4 alignment and the new caption says "Note"/
  "Stop" under the dial, but it is muscle-memory churn for anyone already on build 2.
- **N4's Discard now deletes prior-session audio** (`VoiceNoteSheet.swift:408-430`). Correct per
  FC-R19 (nothing else ever deleted those files), but it is a **destructive** behaviour change on a
  shipped surface: discarding a re-opened note now removes audio a previous `attach()` had kept.
**F-15 · Low · High confidence (mechanism) / Medium (impact) — a build-2 phone silently drops its
stored routing memory on first launch of wave 3.**
`CaptureSessionContext` is `Codable` with **synthesized** conformance and is persisted to
`UserDefaults` under an **unchanged** key (`capture.session-context.v1`,
`CaptureKit/CaptureKit/Session/CaptureSessionContext.swift:166`). Wave 3 adds six fields to it
(`:56-66`). Five are `Optional`, so the synthesized decoder emits `decodeIfPresent` and tolerates
their absence. The sixth — `public var projectsInMind: [String]` (`:65`) — is **non-optional with no
declaration default** (the `= []` lives only in the memberwise `init`, which the synthesized
`init(from:)` does not use), so the decoder emits `decode([String].self, forKey:)` and **throws
`keyNotFound`** against a blob written by build 2. Both read sites swallow it —
`try? decoder.decode(…)` at `:176-178` and `:210-212` — so `resolve(existing: nil, …)` mints a fresh
context and the stored destination / project / room recall is gone.

No capture is lost and no visit is lost (build 2 has no visits), and
`CaptureSessionContextPolicy.resolve`'s 4-hour window means the memory is often stale on upgrade
anyway — which is why I rate the impact Low. But it is silent, and the fix is one character:
`public var projectsInMind: [String] = []`, which makes Swift synthesize a tolerant decode.
Worth doing before the TestFlight build, since it costs nothing.

- **`CameraMode` gained no raw value** — `.voice` was already a reserved case in the frozen enum and
  wave 3 only appended it to `viewfinderSelectable`
  (`CaptureKit/CaptureKit/Domain/CaptureEnums.swift:29`). No persisted or wire value changed.
**F-16 · High · High confidence — the store's new auto-reset rests on a standing ruling whose
premise expired the day after it was written.**
`CaptureStore.openRung` (`CaptureKit/CaptureKit/Persistence/CaptureStore.swift:259-285`) no longer
just falls through to the next rung on an open failure: it calls `setStoreFilesAside(at:)`, renaming
the SQLite trio aside, and retries with a fresh empty store. Its own comment states the
justification: *"Field is not live (Kody ruling 2026-08-24), so an unreadable store is reset rather
than allowed to cost the designer every future capture."* The ruling it cites is
`docs/design/field-companion/waves/wave-3/wave-3-worker-contract.md:86-88` — *"**Patina Field is not
live anywhere.** No in-app backward compatibility is owed… A fresh install may reset the local
store."*, dated 2026-08-24.

**TestFlight build 2 went to pilots on 2026-08-25**, with a confirmed first on-device voice note and
the `field-companion-voice` flag live. The premise "not live anywhere" was true when the rule was
written and is not true now. Three specifics compound it:

1. **The trigger is broader than the ruling's wording.** The ruling licenses a reset on *a fresh
   install*; the code resets on **any** open failure on **any** launch, and — as its own comment
   honestly concedes — *"there is nothing to branch on: SwiftData collapses every load failure into
   the same opaque `SwiftDataError.loadIssueModelContainer`."* It cannot tell an incompatible store
   from a transiently unreadable one.
2. **It is wired into real mode**, not just tests: `AppContainer.makeResilientStore`
   (`Capture/App/Composition/AppContainer.swift:88-92`) passes the live
   `UIApplication.shared.isProtectedDataAvailable`.
3. **The old behaviour was strictly less destructive** — degrade to in-memory, leave the disk store
   untouched for a future successful open.

Mitigations are real and were clearly thought about: it **renames rather than deletes**; it
**refuses to run while the device is locked** (`:281-285`), because a locked store is
indistinguishable from an incompatible one and is perfectly good; the set-aside files are only
removed after a later clean first-try open (`:270-272`); and wave 3 separately fixes the actual
cause of the 2026-08-24 incident (the missing `@Model` defaults, below), so the failure is much less
likely to arise at all. Nothing in the app ever offers the renamed store back to the designer,
though.

**This is not a code defect — the code does what it was told. It is an authorization that needs
re-confirming against a state that changed.** I would put this in front of Kody before the
TestFlight build, not before the merge.

**F-17 · High · High confidence — `capture.placed` / `capture.unplaced` now means two different
things depending on which route emitted it.**
The two emitters use **different predicates**:

- `Capture/Features/Capture/ViewfinderModel.swift:413-418` → `if specimen.isUnplaced`, and
  `isUnplaced` returns **false** for any `.library` capture regardless of project
  (`Specimen+Accessors.swift:311-316`: *"an un-chipped market find filed to the Library shelf is
  DONE"*). So a Library capture with no project emits **`capture.placed`**.
- `Capture/Features/Route/S3DestinationScreen.swift:188-195` → `if let venue = specimen.venue,
  venue.projectId != nil`. The same Library-with-no-project capture emits **`capture.unplaced`**.

Same logical capture, opposite events, decided by which of the two commit routes handled it — and
no event name or property distinguishes them. On top of that, the `isUnplaced` side is a *semantic
shift* against waves 1–2, where a plain Library save recorded `capture.unplaced`.

This lands on the **same metric pair** as R269, which the conductor already routed to Kody. My view:
**R269 and this should be ruled together**, because §14's placed/unplaced pair is now unreliable in
three independent ways at once — late tray filings never emit at all (R269), Library semantics
flipped, and the two emitters disagree. Any one is survivable; all three mean the headline metric
cannot be read. Unlike R269, though, **this half needs no new contract** — it is one line, making S3
use `specimen.isUnplaced` like its sibling. I would fix the divergence now and leave the *semantics*
question to the R269 ruling.

**F-18 · Medium · High confidence — sticky-Library routing memory is dropped for every existing
user, visit or no visit.**
`FieldDestinationPolicy.stamp(remembered:for:)`
(`CaptureKit/CaptureKit/Session/CaptureVisitPolicy.swift:161-165`) returns `destination(for: state)`
whenever `remembered == .library`, and `destination(for: .none)` is `.undecided` (`:135`). A user
with no open visit — i.e. every pilot on build 2 — whose routing memory held `.library` now gets
`.undecided`, so `saveFromCard` re-surfaces the S3 destination prompt where it previously auto-filed
to Library. The policy's doc comment argues the case well (a remembered `.library` can outlive the
sourcing visit that earned it, and would otherwise walk around `saveFromCard`'s `== .undecided`
test), and I think it is the right rule — but it is **not gated behind visit adoption**, which makes
it one of the few wave-3 changes a pilot feels without opting into anything.

**F-19 · Medium · High confidence — with no visit open, the tray stops showing session captures it
used to show.**
`V1SessionTrayScreen.reload()` (`:357`) now calls the read-only `visitState(identity:)` where it
previously called `current(identity:)`, which always minted a rolling ~4h session context. So
`items` is `visitState.context.map { … } ?? []` — permanently `[]` for anyone who has not started a
visit. The tray is then `unplaced` only, which by definition **excludes every `.library`-destination
capture** (`destinationRequiresProject`, `Specimen+Accessors.swift:311-316`). A sourcing capture
taken twenty minutes ago no longer appears in the tray at all.
This is **spec'd** — §7.8 wave 3 says *"the query scope widens from `store.session(visitID:owner:)`
to unfiled"* — and the header honestly renames itself "Not placed yet" rather than lying. So it is
intended, and the word "widens" is the only part I'd quarrel with: for a Library capture the scope
narrows. Recording it because it is a visible change to a screen every pilot has used, and because
the empty state now reads *"Nothing waiting / Everything you've captured is placed."*, which is a
stronger claim than the old *"Captures from this visit gather here."*

**F-20 · Medium · High confidence — scan setup now shows a permanent warning-coloured line to every
user without a site visit.**
`Capture/Features/SiteScan/SiteScanSetupScreen.swift:159-167` renders `model.setupState`'s
`.expanded(reason:)` in `CaptureColor.warning` above the project picker. For anyone without an open
`.site` visit — every existing pilot — `FieldScanSetupPolicy.state` returns
`.expanded(reason: "Choose a project for this scan.")`
(`CaptureKit/CaptureKit/Work/FieldVisitRoomMerge.swift:99-103`). Under waves 1–2 the picker rendered
plainly with no header. So a yellow warning now sits permanently above a form in its normal, correct
state, naming nothing that is wrong. The *other* two `.expanded` reasons are genuine warnings; this
one is an instruction wearing a warning's colour. A `.inkSoft` instruction style for the
no-visit-yet arm would fix it.

**F-21 · Note · High confidence — FC-R1's Today-is-home inversion is the largest pilot-visible change
in the wave, and it is correctly ruled and guarded.**
`RootView.applyLaunchDestination()` (`:330-354`) resets the coordinator to `.work` on every
launch/foreground-to-ready for any user without an *active* visit — which is every existing pilot,
since visits are new. `FieldLaunchPolicy.swift:32` (`todayIsHome = true`) is the single switch.
This is **FC-R1, ratified** (`docs/design/field-companion/field-companion-rulings.md:35, 242-264`:
*"Today is home, with the launch table"*), the launch table is pinned by
`theLaunchTableIsExactlyTheFourRowsInTheSpec` (`CaptureTests/VisitContextTests.swift:361`), and
`flippingFCR1BackToCameraFirstNeedsOneFlag` (`:387`) proves the reversal is one token. A
`field://capture` deep link still lands on the viewfinder. **No action** — recorded only so that
whoever writes the TestFlight release note knows this is the first thing every pilot will notice.

- **The @Model / local-store migration question is answered, and it is an improvement.** Every
  wave-3 addition to `Specimen` is **optional** (`Specimen.swift:158-175`:
  `visitKindRaw`, `visitKitRaw`, `visitLabel`, `visitStartedAt`, `visitEndedAt`, `noteSettingRaw`,
  `suggestedProjectID`, `suggestedProjectRoomID`, `suggestionBasisRaw`, `suggestionConfidence`,
  `suggestionReasonRaw`, `placementReplayPending`), so none needs a default. Separately, the branch
  **retrofits inline defaults onto every previously-mandatory property** of `ScanUploadRecord` and
  `SiteRequestOutboxRecord` (`bundlePath`, `scanID`, `roomID`, `name`, `scanSchemaVersion`,
  `artifacts`, `statusRaw`, `retryCount`, `createdAt`, `updatedAt`; and `clientDeliveryID`,
  `requestID`, `itemID`, `itemVersionID`, `payloadPath`, `mediaPaths`, `checksumSHA256`, `stateRaw`,
  `retryCount`, `createdAt`, `updatedAt`). That is the direct fix for the
  `NSCocoaErrorDomain 134110` container-open failure a build-2 phone would otherwise hit, and it is
  now enforced schema-wide by `everyMandatoryAttributeCarriesADefault`. **A build-2 store opens
  under wave 3's schema, and that is now guarded rather than hoped for.**

### (j) The merge commit `4d56aeb65` — conflict resolution

**Clean. No dropped lines from either side.** Parents confirmed: `540aedb75` (branch) and
`51fdd61b7` (main). The three conflicted files were checked structurally rather than by line-diff,
because `project.pbxproj` is machine-regenerated with fresh UUIDs and a raw diff is noise:

- **`project.pbxproj`** — set-diff of every `/* Name */` reference (file refs, target names,
  build-phase names) and of every unique `KEY = VALUE;` build-setting line, against **each** parent:
  **zero** names and **zero** settings present in a parent and missing from the merge result. All
  four targets (`Capture`, `CaptureKit`, `CaptureTests`, `CaptureKitMocks`) present as
  `PBXNativeTarget` in all three revisions. The result is a structural superset of both parents.
- **`generate_project.rb`** did change in the range, but the change (`fffe4908c`, adding
  `INFOPLIST_KEY_UIRequiresFullScreen = 'YES'` for ITMS-90474 iPad compliance) is an **ancestor of
  main**, not branch-original — and its output appears correctly in the merged pbxproj at both build
  configurations. The resolution absorbed the main-side script's downstream effect rather than
  regenerating over it.
- **`Capture.xcscheme` / `CaptureKit.xcscheme`** — byte-identical across all three revisions except
  for `BlueprintIdentifier` UUIDs. Each UUID in the merge result was resolved against the merged
  pbxproj: `Capture.app` and `CaptureKit.framework` kept their branch-side target ids (both verified
  against `PBXNativeTarget` entries, cross-checked via `remoteGlobalIDString`), and
  `CaptureTests.xctest` points at the merged pbxproj's unit-test target. Neither parent contained
  `EnvironmentVariables`, `CommandLineArguments`, `LaunchArguments`, or `codeCoverageEnabled`
  blocks, so there was nothing of that class to lose. Test actions, testable references and
  build-action entries are structurally identical across all three.
- **No main-side revert.** `git diff 51fdd61b7 0da5424dc --numstat -- apps/designer-portal
  supabase/migrations packages/` shows exactly two differing files —
  `packages/supabase/src/database.types.ts` (+51/−0) and `00532_…sql` (+352/−0) — **both pure
  additions, zero deletions**. `apps/designer-portal` has **zero** diff against main. The branch is
  a strict superset in every area origin/main touched.

### (k) Secrets

**Clean.** No `Secrets.swift` or `Secrets.xcconfig` is tracked anywhere; the only `secret`-matching
tracked files are three committed `.example` templates. `git log --all --diff-filter=A` over the
range confirms neither file was ever added. `.gitignore` coverage is intact and verified live:
`apps/mobile/Capture/.gitignore` covers both Capture secrets files by path, and
`git status --porcelain --ignored` shows the real on-disk files as `!!`, not tracked.

A line-accurate scan of **every added line** in the 148-commit diff for
`phc_|sbp_|sk_live|sk_test|pk_live|eyJ|BEGIN (RSA|EC|OPENSSH|PRIVATE)` produced three hits, all
benign: the allowed public PostHog `phc_` key; a redacted `phc_...` placeholder in the Capture
README; and, in an unrelated `artifacts/` research file, the well-known public anon key the Supabase
CLI ships with every local stack (documented as such in-line). A broader
`secret|password|token|api[-_ ]?key|bearer ` sweep produced 201 further hits, every one triaged to
a test fixture (`v_token1..5`, `'test-enqueue-secret'`, `TEST_KEY = "test-anon-key"`,
`'password123'` in Playwright fixtures), a CSS **design token**, a filename in `project.pbxproj`,
or the wave ledger's own prose about having run this same check. **No real credential is added
anywhere in the diff.**

**F-13 · Note · High confidence — the PostHog key's default changed on a shipped build path.**
`apps/mobile/Capture/Capture/App/Configuration/BuildSettings.xcconfig:26` now commits the real
public `phc_` key where it previously defaulted to **empty** (analytics off unless a local
`Secrets.xcconfig` supplied one). The key itself is correct and is already committed verbatim in
three portals' `wrangler.jsonc`, and the in-file comment justifies the change (a fresh checkout
archived straight from the repo should ship with analytics on). Recorded only because it means a
build from a clean checkout now sends telemetry where it previously did not —
`Secrets.xcconfig.example` was correspondingly downgraded from required to optional.

---

## 4. Tests as tests — sample of 14

| # | Test | Guards its named subject? |
|---|---|---|
| 1 | `CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault` (`CaptureStoreLadderTests.swift:33`) | **Yes.** Iterates the real `CaptureStore.schema`; a future mandatory column with no default reddens it. |
| 2 | `CaptureStoreLadderTests.opensAStoreWrittenBeforeAnEntityExisted` (`:62`) | **Yes.** Writes a real store under an older `Schema`, reopens under the current one, asserts the row survived. Genuine migration proof. |
| 3 | `SuggestionEngineTests.aSuggestionNeverBecomesTheFact` (`SuggestionEngineTests.swift:94`) | **Yes.** `apply(…)` then asserts `venue?.projectId == nil` and `isUnplaced`. Making `apply` write the fact reddens it. FC-R12's load-bearing test. |
| 4 | `SuggestionEngineTests.applyingNilClearsTheSuggestionWithoutTouchingTheFact` (`:113`) | **Yes.** Seeds a fact, applies then clears a suggestion, asserts the fact survives. |
| 5 | `SuggestionEngineTests.theTrayOrdersByConfidenceAndRendersNoNumber` (`:126`) | **Partly.** The ordering half is real. The "renders no number" half asserts `!reason.contains("0.")` — that pins the *reason string*, not rendering, and would pass a view that displayed `suggestionConfidence` directly. The name overclaims; the `p4` gate arm is what actually covers rendering. |
| 6 | `VisitContextTests.aConversationNoteCannotStartUntilSheTapsTheAffirmation` (`VisitContextTests.swift:471`) | **Yes, for the policy.** All four arms of `recordingIsBlocked` are pinned; inverting the predicate reddens. It does **not** reach any call site (see F-1). |
| 7 | `VisitContextTests.theWalkThroughKitIsWhatMakesTheCardGated` (`:485`) | **Yes.** Builds a real walk-through context, `inherit`s it into a real draft, asserts the gate fires. Changing `defaultNoteSetting` reddens. |
| 8 | `VisitContextTests.aCardNoteInheritsTheVisitsConsentPosture` (`:441`) | **Yes.** Two kits, two drafts, opposite expectations. |
| 9 | `VisitContextTests.theAffirmationLineOnlyAppearsOnAConversationNote` (`:461`) | **Yes**, though it is a copy pin — five assertions across `affirmation` and `chipTitle`, including the `nil` case. |
| 10 | `VisitRoomMergeTests.theTwoLanesSurviveASameShapedListWithoutTransposing` (`VisitRoomMergeTests.swift:60`) | **Yes.** Constructs same-shaped lists so a lane transposition would be invisible to a weaker test, and asserts each id landed in its own lane. The best test in the file. |
| 11 | `VisitRoomMergeTests.aBlankNameIsNotAPickableRoom` (`:119`) | **Yes.** Whitespace-only and empty names both excluded. |
| 12 | `VoiceModeTests.theToggleLabelsMatchTheShippedScanContextControl` (`VoiceModeTests.swift:164`) | **No — R262 pattern.** It asserts `FieldVoiceModeCopy.toggleLabel/Glyph` against literals and never touches `SiteScanContextCapture`, which **hardcodes** `model.isRecordingVoice ? "Stop" : "Note"` at `Capture/Features/SiteScan/SiteScanContextCapture.swift:297` rather than calling the helper. Changing the scan-context literal reddens nothing; the test's named subject is unguarded. |
| 13 | `VoiceModeTests.noVoiceModeCopyEverSaysInbox` (`:112`) | **Yes, narrowly.** Eight real copy strings checked. It guards `FieldVoiceModeCopy` only — the gate's sweep is what covers everything else, correctly. |
| 14 | `VoiceModeTests.theSegmentCountIsDerivedFromElapsedAndTheTwoCapsCoincide` (`:83`) | **Yes.** Pins the exact arithmetic identity (24 × 50 s = 1200 s) that makes both cap arms trip together. This is the test that would have caught the "literal 0 segment count" bug the model comment describes. |

**F-11 · Medium · High confidence** — item 12 is a live instance of the R262 pattern *after* the
conductor named and closed two others. It is one line to fix (have
`SiteScanContextCapture.swift:297` call `FieldVoiceModeCopy.toggleLabel(isRecording:)`), which
would make the existing test true rather than aspirational.

**F-12 · Low · Medium confidence** — item 5's name promises a rendering guarantee its assertion
does not provide. Renaming it (or asserting on `FieldVisitTelemetry`'s property bags, which *is*
checkable in CaptureKit) would close the claim.

Overall the test suite is materially better than the wave average I'd expect: the SQL file
(`supabase/tests/field/field_capture_visit_test.sql`, 656 lines, 13 groups) carries its own honest
caveat that a superuser connection proves logic and **not RLS**, and says no wave report may claim
otherwise. That caveat is the kind of thing most suites omit.

---

## 5. The conductor's open items — my own view

### R279 — `affirmed` does not reset on a visit change (C6)

**Confirmed real. My view: fix it before merge; it is one line and it is a consent control.**

The conductor is right that this is a consent question rather than an engineering one, and right not
to decide it at the end of a wave. But I do not think the *engineering* posture is neutral between
the two answers, for three reasons:

1. **C3 already resets per note** (`ViewfinderScreen.swift:110`, on `cardSpecimen?.id`). So the two
   surfaces that share `FieldAffirmationChip` and are meant to share "one rule and one test"
   (`FieldVisit.swift:82-83`) currently have **different** consent lifetimes. Whatever the ruling,
   they should not disagree.
2. **The chip's text is about the room, not the session** — *"Everyone here knows this is being
   recorded"*. "Here" is a place. Carrying a tap taken in place A into place B makes the sentence
   false at the moment `setNoteSetting(.conversation)` writes it into the audit trail.
3. **The fix is strictly conservative.** `.onChange(of: visit.context?.visitID) { affirmed = false }`
   can only ever *add* a consent step; it cannot block a note she has affirmed for the visit she is
   in. The failure mode of the fix is one extra tap; the failure mode of leaving it is an unaffirmed
   recording of a third party carrying an affirmed audit row.

**Does it block merge? No** — but it should be the last commit before the merge, not a wave-4 item.
Session-scoped consent is a defensible ruling; shipping *C3-scoped consent on C3 and session-scoped
consent on C6* is not a ruling, it is an accident.

### R269 — missing `capture.placed` on later tray filing; missing `visit.end` on auto-end / rollover / Change

**Both confirmed independently.**

- **`capture.placed` on late filing.** `V1SessionTrayScreen.accept()` (`:212-225`) emits
  `suggestion.accepted` and nothing else. The two sites that do emit `capture.placed` —
  `ViewfinderModel.swift:416` and `S3DestinationScreen.swift:190` — are both on the *at-capture*
  path and both gate on `placementEventEmitted`, which `accept()` neither reads nor sets. So a
  capture born unplaced and filed later from the tray never emits `capture.placed`. The conductor's
  framing is exactly right and worth repeating: **the placed/unplaced ratio is biased against the
  precise flow the visit spine exists to enable.** A dashboard reading this will conclude the
  feature is not working.
- **`visit.end` on untapped ends.** `CaptureVisitPolicy.visitState`
  (`CaptureKit/CaptureKit/Session/CaptureVisitPolicy.swift:74-94`) returns `.none` on three
  conditions — backwards clock (`:83`), 12-hour idle (`:91`), calendar rollover (`:92`) — all of
  which are *computed*, write nothing, and emit nothing. Separately, **`V0VisitSheet.start()`
  (`:328-341`) does not emit `visit.end` before `contextStore.startVisit(…)` overwrites an open
  visit**, so the Change path is a third silent end. The four tapped sites (`V0VisitSheet.swift:352`,
  `V1SessionTrayScreen.swift:396`, `RootView.swift:261`, `WorkDashboardScreen.swift:74`) are
  correct, share `FieldVisitEndCounts.compute`, and all read counts *before* closing the context —
  that part is well done.

**My view on both: they do not block merge, and the conductor was right to route rather than fix.**
The reasoning that convinces me is the one the conductor gave — §14 is pinned as *"exactly these
names and properties, no others"*, and both fixes need new contract (a `trigger` property on
`capture.placed`, or a distinct `visit.expired`; and a decision about whether an auto-ended visit's
`duration_min` means wall time or idle-adjusted time). Inventing that at the end of a wave is how a
dashboard silently means two things, and this dashboard does not exist yet, so nothing is currently
being misread.

The one thing I would add: **the gap should be written into the spec, not only into the ledger.**
`docs/design/field-companion/field-companion-package.md` §14 currently reads as if `visit.start` and
`visit.end` pair up. Until R269 is ruled, anyone building the dashboard from §14 will compute a
completion rate that is wrong in the common case. A three-line "known gap" note under §14 costs
nothing and is the difference between a deferred decision and a trap.

---

## 6. Findings — full list

| # | Severity | Confidence | Finding | Location |
|---|---|---|---|---|
| F-1 | **High** | High | The Critical FC-R11 fix (`129638ff6`) ships with **no test**; test count unchanged at 559. R263's established workaround (lift the contract into CaptureKit so a rename breaks the build) was not applied. | `Capture/Features/Capture/C6VoiceScreen.swift:61-129` |
| F-2 | Medium | High | FC-R11's affirmation gates 2 of the 4 recording surfaces; N4 and F2 — the two the ruling names by construction — are ungated, and a CaptureKit comment asserts the narrower rule as if it were FC-R11. In wave-3 plan scope; not a regression. | `CaptureKit/CaptureKit/Domain/FieldVisit.swift:82-84`; `Capture/Features/Recognition/Voice/VoiceNoteSheet.swift:185-246`; `Capture/Features/SiteScan/SiteScanContextCapture.swift:297` |
| F-3 | Medium | High | R279 confirmed: `affirmed` survives a visit change on C6, while C3 resets per card. Two surfaces sharing one chip have different consent lifetimes. | `Capture/Features/Capture/C6VoiceScreen.swift:312-314` vs `Capture/Features/Capture/ViewfinderScreen.swift:110` |
| F-4 | Low | Medium | `.interrupted`'s copy — "Tap to keep going" — promises resumption; tapping mints a second note. | `CaptureKit/CaptureKit/Recognition/FieldVoiceModeState.swift:36`; `Capture/Features/Capture/C6VoiceScreen.swift:236-241` |
| F-5 | Low | Medium | A nil owner discards a finished take after `voice.finish()` with no event and no user-visible line. | `Capture/Features/Capture/C6VoiceScreen.swift:197` |
| F-6 | Note | High | The Principle-4 sweep greps a token, not a capability; a view constructing a `CaptureSuggestion` to read `.confidence` still passes. Acknowledged in the script. | `apps/mobile/Capture/scripts/capture-gate.sh:129-150` |
| F-7 | Low | High | Two same-named rooms within one lane collapse to the last id; one real room becomes unpickable with no caption. Pinned as intended by a test. | `CaptureKit/CaptureKit/Work/FieldVisitRoomMerge.swift:47-73`; `CaptureTests/VisitRoomMergeTests.swift:107-118` |
| F-8 | Low | High | §7.1's Syncing copy deviates from the spec (`n queued` → `n still on this phone`), unrecorded. Implementation is arguably right; the spec line is the one to fix. | `CaptureKit/CaptureKit/Work/FieldTodayBand.swift:49-60` |
| F-9 | Medium | High | Three reachable bypasses in the FC-R3 sweep (trailing `// ` on a copy line; `"""` literals; `analytics.event` lines) plus `CaptureKitMocks/` not being a sweep root. Recorded by the conductor at R280 and deferred. | `apps/mobile/Capture/scripts/capture-gate.sh:69-71` |
| F-10 | Note | Medium | Cache eviction reads all owners' records deliberately; no leak (nothing displayed), but cross-owner retention on a shared phone. | `CaptureKit/CaptureKit/Work/CaptureProjectCache.swift:296-310` |
| F-11 | Medium | High | `theToggleLabelsMatchTheShippedScanContextControl` guards nothing about the scan-context control, which hardcodes its own literals. Live R262 instance. One-line fix. | `CaptureTests/VoiceModeTests.swift:164-169`; `Capture/Features/SiteScan/SiteScanContextCapture.swift:297` |
| F-12 | Low | Medium | `theTrayOrdersByConfidenceAndRendersNoNumber`'s "renders no number" half asserts on the reason string, not on rendering. | `CaptureTests/SuggestionEngineTests.swift:126-143` |
| M-1 | Low | High | 00532 cites `00233:189-194` for a function declared at `00233:195`. Cosmetic. | `supabase/migrations/00532_field_capture_visit_and_suggestion.sql:129` |
| M-2 | Low | High | `ADD COLUMN IF NOT EXISTS … CONSTRAINT … CHECK` skips the CHECK when the column pre-exists; the constraints are not self-healing on a re-run. | `supabase/migrations/00532_…sql:84-113` |
| M-3 | Low | Medium | Once `visit_projection_errors` is written, the TG_OP payload short-circuit can no longer fire for that row. | `supabase/migrations/00532_…sql:171, 322-329` |
| M-4 | Note | High | `CREATE INDEX` (not CONCURRENTLY, correctly, since it is in a transaction) locks `field_captures` for its duration. | `supabase/migrations/00532_…sql:121-123` |
| M-5 | Note | High | `wave-3-conductor-check.md` says 7 visit+suggestion columns; there are 10. Conclusions unaffected. | `docs/design/field-companion/waves/wave-3/wave-3-conductor-check.md` |
| F-16 | **High** | High | The store's new auto-reset-on-open-failure is authorized by a ruling that says "Patina Field is not live anywhere" (2026-08-24) — TestFlight build 2 reached pilots 2026-08-25. Trigger is broader than the ruling's wording (any failure, any launch), and SwiftData gives nothing to branch on. Renames rather than deletes; refuses while locked. Needs re-confirming, not re-coding. | `CaptureKit/CaptureKit/Persistence/CaptureStore.swift:259-285`; `Capture/App/Composition/AppContainer.swift:88-92`; `docs/design/field-companion/waves/wave-3/wave-3-worker-contract.md:86-88` |
| F-17 | **High** | High | `capture.placed`/`capture.unplaced` use different predicates in the two emitters (`isUnplaced` vs `venue.projectId != nil`); a Library capture with no project emits opposite events depending on route. Compounds R269. The divergence half is a one-line fix. | `Capture/Features/Capture/ViewfinderModel.swift:413-418` vs `Capture/Features/Route/S3DestinationScreen.swift:188-195` |
| F-18 | Medium | High | Sticky-Library routing memory is downgraded to `.undecided` for every user with no open visit, re-surfacing the S3 prompt where Library was previously auto-filed. Deliberate and well-argued, but ungated by visit adoption. | `CaptureKit/CaptureKit/Session/CaptureVisitPolicy.swift:135, 161-165` |
| F-19 | Medium | High | With no visit open the tray's `items` is permanently empty and the list is `unplaced`-only, which excludes every `.library` capture — a recent sourcing capture vanishes from the tray. Spec'd by §7.8, but "widens" understates it. | `Capture/Features/Session/V1SessionTrayScreen.swift:357-375` |
| F-20 | Medium | High | Scan setup renders a permanent `CaptureColor.warning` line ("Choose a project for this scan.") for every user without a site visit, where waves 1–2 showed no header. An instruction in a warning's colour. | `Capture/Features/SiteScan/SiteScanSetupScreen.swift:159-167`; `CaptureKit/CaptureKit/Work/FieldVisitRoomMerge.swift:99-103` |
| F-21 | Note | High | FC-R1's Today-is-home launch inversion — ruled, pinned by two tests, one-token reversible. No action; the loudest thing a pilot will notice. | `CaptureKit/CaptureKit/Navigation/FieldLaunchPolicy.swift:32`; `Capture/Features/Root/RootView.swift:330-354` |
| F-15 | Low | High (mechanism) / Medium (impact) | `CaptureSessionContext.projectsInMind` is non-optional with no declaration default, so the synthesized `Codable` decode throws `keyNotFound` against a build-2 blob under the unchanged UserDefaults key; both read sites `try?` it away, silently discarding stored routing memory on upgrade. One-character fix (`= []`). | `CaptureKit/CaptureKit/Session/CaptureSessionContext.swift:65, 176-178, 210-212` |
| F-14 | Low | Medium | The tray's `accept()` passes `room: nil`, which `place(…)` documents as "keep the existing label"; combined with the engine always suggesting `projectRoomID: nil`, an accepted suggestion can leave a stale, rendered room label beside a new project. | `Capture/Features/Session/V1SessionTrayScreen.swift:213-215`; `CaptureKit/CaptureKit/Domain/Specimen+Accessors.swift:375-387`; `CaptureKit/CaptureKit/Work/CaptureSuggestionEngine.swift:55,68` |
| F-13 | Note | High | The committed PostHog `phc_` key replaced an empty default in `BuildSettings.xcconfig`, so a clean-checkout build now sends telemetry where it previously did not. Key itself is public and already committed in three portals. | `apps/mobile/Capture/Capture/App/Configuration/BuildSettings.xcconfig:26` |
| D-1 | Note | High | The three authorities this review was judged against — `field-companion-package.md`, `field-companion-rulings.md`, `plans/wave-3-plan.md` — are **untracked** in the main checkout and absent from the branch. Merging wave 3 does not version the spec, the rulings, or the plan it was built to. Every other wave artefact (`waves/wave-3/*`) is tracked. | `docs/design/field-companion/` |

**Count by severity:** Critical **0** · High **3** · Medium **7** · Low **10** · Note **7** — 27 findings.

Coverage note: the diff was reviewed area by area as briefed. The W1/W2 regression surface (item (i))
was swept exhaustively across all 41 modified files under `Capture/` and `CaptureKit/` with a
parallel pass; every finding it produced that appears above I re-verified against the source myself
before recording it, and I downgraded three it had rated Critical (FC-R1's launch inversion, the
tray scope change, and the store reset) because two are ratified rulings and the third is an
authorization question rather than a code defect.

---

## 7. Verdict

**READY-WITH-FIXES.**

**One-line reason:** the gate reproduces exactly (559/559/0, lint clean, three sweep arms green,
SQL 128/0-unexpected), 00532 is a well-built, idempotence-proven, correctly-revoked additive
migration that does not collide with prod's `00531` head, and FC-R3/R4/R5/R6/R12 and Principle 4
hold under independent checking — but the wave's own Critical FC-R11 regression was fixed **without
a test**, the `capture.placed` metric now means two different things depending on route, and the
store's auto-reset ships under a "Field is not live anywhere" ruling that TestFlight build 2
retired the day after it was written.

### What I would land before merging (all small)

1. **F-1** — give the C6 visit-pinning fix a guard. `C6VoiceModel` is untestable by construction,
   so take R263's route: move "the take's visit and note setting are pinned at `start()`" into a
   CaptureKit value the model is forced through, and pin *that*. If that proves too large for a
   merge-gating change, the honest minimum is a comment at `C6VoiceScreen.swift:61` recording that
   this invariant has no test.
2. **F-3 / R279** — one line, `.onChange(of: visit.context?.visitID) { affirmed = false }`, so the
   two surfaces sharing `FieldAffirmationChip` share a consent lifetime. Strictly conservative: its
   worst case is one extra tap.
3. **F-17 (the divergence half only)** — make `S3DestinationScreen.swift:190` use
   `specimen.isUnplaced` like its sibling, so the two emitters of the same event pair stop
   disagreeing. One line, needs no new §14 contract, and leaves the *semantics* question to R269.
4. **F-15** — one character, `projectsInMind: [String] = []`, so a build-2 phone does not silently
   discard its routing memory on upgrade. Lower stakes than the others, but it is free and this
   is the last moment before a TestFlight build reaches pilots.

### What needs a ruling before the TestFlight build (not before the merge)

- **F-16** — re-confirm the auto-reset. The rule it cites ("Patina Field is not live anywhere") was
  true on 2026-08-24 and was retired by build 2 on 2026-08-25. The code is doing exactly what it was
  authorized to do; the authorization is what changed. If the answer is "still fine", nothing needs
  editing. If it is not, the narrower behaviour is: reset only when the *first* rung fails and the
  set-aside file is older than the current install, or surface the renamed store to the designer
  instead of silently keeping it.
- **F-17 (the semantics half)** and **R269** — rule them together. §14's placed/unplaced pair is
  currently unreadable in three independent ways.

### What I would not block on

- **R269** (both halves) — real, correctly diagnosed, correctly routed to Kody. Add a three-line
  "known gap" note under spec §14 so nobody builds a dashboard on the assumption that
  `visit.start`/`visit.end` pair up.
- **F-2** — a residual FC-R11 gap on N4/F2, but wave 3 does not regress them and the plan scoped
  them out. Fix the CaptureKit comment that overstates coverage; schedule the gap.
- **F-18 / F-19 / F-21** — all three are ruled or spec'd behaviour changes that pilots will feel
  (Today is home, the tray narrows, sticky-Library is dropped). They belong in the TestFlight
  release note, not in a fix list.
- **F-20** — a one-token style change (`warning` → `inkSoft` on the no-visit-yet arm), worth doing
  but not worth holding a merge for.
- **F-9 / F-6** — the gate is materially stronger than it was and its remaining holes are recorded.
- Everything at Low/Note.

### Deploy shape (for whoever ships this)

Nothing in `packages/` or any portal reads the new columns yet — I grepped `visit_id`,
`visit_kind`, `suggested_project_id` and `suggestion_basis` across `packages/`,
`apps/designer-portal/src`, `apps/admin-portal/src` and `apps/client-portal/src` and got **zero**
hits outside `database.types.ts`. Wave 4 is the consumer. So merging wave 3 needs
**`supabase db push` (00532) + a TestFlight build**, and **no portal deploy**. The migration is
additive and the trigger is a no-op for any payload without the new keys, so a build-2 phone
continues to work unchanged against a database that has 00532 — which means the migration can land
ahead of the build with no coordination.

### What is genuinely good, and worth saying

- The **SQL test file** carries its own caveat that a superuser connection proves logic and not RLS,
  and forbids any wave report from claiming otherwise. That is the single most honest artefact in
  the wave.
- The **projection trigger** is total by construction and I could not find a payload that raises it.
- The **owner-scoping policy** fails closed and is centralised rather than repeated.
- The **conductor's ledger** independently found and recorded almost every issue I found on my own
  (R262, R269, R279, R280) — including two it corrected *against itself* (R270). The record and the
  code agree, which is not the usual outcome.
