# W6 adversarial review — round 1 (lane C, Patina Field)

**clean = false** — 4 major, 0 blocker, 6 minor, 7 notes.

Reviewer context separate from the implementer. Branch `hour-tracking/ios` @ `2e9651baf`,
three commits over `origin/hour-tracking/integration` (up to date with the integration tip;
pushed, local == remote). Every gate below was re-run by me in the lane worktree, not
copied from `W6-impl.md`. Claim level **sim-verified** throughout (P-6); no device pass.

---

## 0 · Gates I ran, verbatim

```
$ supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-ios
  …
  Restarting containers...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}        ← CLEAN

$ /Users/kody/Code/patina-merged/scripts/run-sql-tests.sh \
    -d …/agent-ios/supabase/tests/field -H 127.0.0.1 -p 54422
  running 7 SQL test file(s) against postgresql://postgres:postgres@127.0.0.1:54422/postgres
  PASS   apply_field_effect_test.sql
  FAIL   field_capture_note_routing_test.sql   ← PRE-EXISTING, see W6-R1-11
           ERROR: FAIL 7f: field_captures should carry exactly five policies, got 9
  PASS   field_capture_visit_test.sql
  PASS   field_links_test.sql
  PASS   project_task_field_capture_ref_test.sql
  PASS   time_entry_activity_travel_test.sql          ← 00616's proof, new
  PASS   time_entry_field_visit_source_test.sql       ← existing, still green
  total: 7 · green: 6 · expected-fail: 0 · unexpected-fail: 1

$ ruby …/apps/mobile/Capture/scripts/generate_project.rb
  Generated …/Capture.xcodeproj
    CaptureKit: 111 files · CaptureKitMocks: 3 · Capture(app): 149
  $ git status --porcelain apps/mobile/Capture/Capture.xcodeproj
    (empty — the committed pbxproj matches a fresh generation byte for byte)

$ …/apps/mobile/Capture/scripts/capture-gate.sh all          (sandbox off)
  ✔ build
  ✔ tests
  ✔ lint
  ✔ fc-r3 sweep (inbox)
  ✔ fc-r3 sweep (ai)
  ✔ principle-4 sweep

$ xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
    -destination "platform=iOS Simulator,name=iPhone 17 Pro" CODE_SIGNING_ALLOWED=NO
  ✔ Suite LogTimeSheetTests passed
  ✔ Suite TimeEntryOutboxRecordTests passed
  ✔ Suite CaptureStoreMigrationTests passed
  ✔ Suite VisitReviewTests passed            (the four the plan names)
  ✔ Test run with 806 tests in 75 suites passed after 4.078 seconds.

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres \
    pnpm --dir …/agent-ios db:generate
  $ git diff --stat packages/supabase/src/database.types.ts      → clean
$ python3 ./scripts/generate-legacy-grants.py      (invoked from the WORKTREE, §0.20)
  wrote …/agent-ios/supabase/seed/00-legacy-grants.sql — baseline + 2643 replayed statements
  $ git status --porcelain supabase/seed/00-legacy-grants.sql    → clean
  (00616 carries no GRANT/REVOKE — grep -nE '^\s*(GRANT|REVOKE)' returns nothing — so
   the seed being unchanged is the expected result, not a missed regeneration.)

$ grep -rn "CaptureWidgets\|CaptureShareExtension" apps/mobile/Capture
  (nothing — the plan's Done-when grep is satisfied)

$ git log --all --name-only --oneline -- 'supabase/migrations/0061*'
  00610…00616 only. 00616 is unique across every ref; 00617 correctly unused.
```

### The behaviour probes the gates do not cover (I ran these myself)

Authenticated as the seeded designer `a0000000-…-0004` (locally minted HS256 JWT,
anon apikey) against the isolated stack `http://127.0.0.1:54421`. Probe rows deleted
afterwards (`DELETE 2`).

| Probe | Result |
|---|---|
| `POST /rest/v1/rpc/log_time` with the **exact** body `TimeEntryWriteRequest` encodes (`p_entry_id, p_project_id, p_started_at, p_duration_minutes, p_activity=travel, p_billable=true, p_notes, p_source=field_manual, p_rate_role=null`) | **HTTP 200**. Row: `source=field_manual`, `activity=travel`, `billable=t`, `duration_minutes=45`, `user_id` from `auth.uid()`, **`hourly_rate_cents` NULL**, `rate_source='none'` |
| the same body replayed under the same client-minted id | **HTTP 200**, and `count(*) = 1` — 00608's `ON CONFLICT (id) DO NOTHING` + read-back holds; the request is genuinely replay-safe |
| `GET /rest/v1/project_time_entries?select=id, started_at, duration_minutes, activity, billable, billing_state, rate_source, project:projects(name)&user_id=eq.…&duration_minutes=gte.1` — the exact string in `SupabaseFieldHoursService.myHours` | **HTTP 200**, embed resolves: `"project":{"name":"Aspen Loft Refresh"}` |
| `GET /rest/v1/projects?select=designer_id…` and `GET /rest/v1/project_team_members?select=role&removed_at=is.null…` — `myRateRoles` | **HTTP 200** both |
| `ISO8601DateFormatter` round-trip of PostgREST's real output (`…T14:00:00+00:00`, `…T18:25:42.654638+00:00` — 6 fractional digits) through `FieldHoursWireDate.parse` (compiled and run) | all five shapes parse; no silent empty list |

So the RPC call **matches 00608's signature exactly**, **sends no rate**, and the
outbox record **is client-minted and replay-safe**. Confirmed, not inferred.

### Visual pass at 390 (iPhone 17 simulator, 402 pt logical)

`capture-shots.sh H1 W1` plus a driven walk (blitz-iphone, **explicit UDID
`C8850509-C7DC-43C5-9226-9446404EE98A`**, never `"booted"`). H1 renders; the 7th Browse
tile ("Hours · Log an hour") and "My hours this week" (total `2h 45m` **above** its three
rows — HT-30 held) render on W1; the role chip row ("Lead designer" / "Vendor") appears
only after the multi-role project is picked and is absent before (HT-41 held); the primary
reads "Log 30m", is dimmed and disabled with no project and enabled after one (CR-1 held).
Two layout findings fell out of the AX measurements — W6-R1-02 and W6-R1-04.

There is no 1440 width in this lane; Patina Field is phone-only.

---

## 1 · Findings

### MAJOR

#### W6-R1-01 · A **stale** open visit pre-fills a wall-clock multi-hour billable duration — and the code's own contract says it does not

`CaptureKit/CaptureKit/Domain/FieldLogTime.swift:114-135`, reached from
`Capture/Features/Time/LogTimeSheet.swift:356-358`.

`FieldLogTimeDraft.init(visit:now:)` gates on `visit.isVisit` (`kind != nil && endedAt == nil`)
and then pre-fills `durationMinutes = now − visit.startedAt`, i.e. **pure wall clock**,
bounded only by the 12-hour clamp. The call site passes
`contextStore.visitState(identity:).context`, and `CaptureVisitState.context`
(`CaptureVisitPolicy.swift:21-26`) is **non-nil for `.stale` as well as `.active`** —
`.stale` being idle > 30 min, idle ≤ 12 h, same calendar day
(`CaptureVisitPolicy.swift:74-94`).

The file's own comment at `:118-119` asserts the opposite — *"A STALE or absent visit
contributes neither: her drive is not the eleven hours since she forgot to end Tuesday's
walk-through"* — and `LogTimeSheet.swift:354-355` repeats it. Only the **ended** case is
handled, and only the ended case is tested
(`LogTimeSheetTests.swift:98-104 anEndedVisitContributesNothing`). Cross-day is handled
too, by `visitState`'s calendar-day rule. **Same-day stale is not.**

Failure walk: visit opened 08:00, last touched 09:00, she taps Hours at 14:00. The sheet
opens **"Log 6h"**, Billable on, activity Drive. One tap files a six-hour billable travel
entry. This is precisely the D10/HT-16 breach the *same wave* fixes on
`V4VisitReviewScreen` — the wall clock proposed as billable time — reintroduced on the
other new duration surface. `aPreFillLongerThanTheBoundIsClamped`
(`LogTimeSheetTests.swift:123-127`) actually *pins* the bad behaviour: a 40-hour open
visit is asserted to offer the 12-hour maximum.

**Fix.** Take the pre-fill from `.active` only (`if case .active(let ctx) = state`), or
bound it by `lastActivityAt` the way `VisitReviewComposer.activeMinutes` bounds by the last
capture — the value and the reasoning already exist in this wave. Add a `.stale` case to
`LogTimeSheetTests`. If the intended answer is instead "a stale visit still hands over its
project but not its duration", that is a **ruling owed**, not a code choice.

#### W6-R1-02 · New acts are **under 44 pt** at 390 — house sheet §A ("acts ≥ 44px")

Measured from the live accessibility tree (`describe_screen` / `scan_ui`, iPhone 17, 402 pt):

| Control | File | Measured AXFrame |
|---|---|---|
| **"Change"** (swap the pre-filled project) | `LogTimeSheet.swift:95-98` | **48 × 16 pt** |
| activity chips (Drive / Site visit / Sourcing / Client / Design) | `LogTimeSheet.swift:400-414` | 34–35 pt tall |
| role chips (Lead designer / Vendor) | same component | 35 pt tall |
| Day picker | `LogTimeSheet.swift:198-205` | 34 pt tall |
| project rows | `LogTimeSheet.swift:133-155` | 43.67 pt tall |

The cause is uniform and mechanical: `.frame(minHeight: 44)` is applied **outside** the
`Button`, after `.buttonStyle(.plain)`. That expands the layout frame but not the hit
region, which for a plain button is the label's own rendered content. The wave's own
`stepButton` (`LogTimeSheet.swift:180-194`) puts `.frame(width: 44, height: 44)` **inside**
the label and measures 45 × 45 pt — that is the pattern that works; the other five sites
use the one that does not. "Change" at 16 pt is the worst: it is the only way back to the
project picker once a project is pre-filled.

#### W6-R1-03 · The primary act blocks on the network on exactly the one-bar case the queue exists for

`LogTimeSheet.swift:305-331`. `log()` inserts + saves the durable record (good), then:

```swift
Task { @MainActor in
    await container.timeEntryOutboxDrainer?.resume(trigger: .userInitiated)
    isLogging = false
    coordinator.dismissSheet()
}
```

`isLogging` gates the primary's loading state and `.disabled`, and the sheet does not
dismiss until the drain's `await` returns — i.e. until the PostgREST round trip completes
or times out. On a weak connection (the stated scenario: *"standing on gravel with one
bar"*) that is a spinner held for up to the URLSession timeout, under copy that promises
the opposite: *"It's kept on this phone and sent when there's signal."* (`:295`).

The sibling path does it correctly: `V4VisitReviewScreen.resumeCloseOutbox()`
(`:441-444`) fires the identical `.userInitiated` drain in a detached `Task` and returns
immediately, letting `closeState` narrate. Mirror that: dismiss as soon as `store.save()`
succeeds, and let the drainer run unobserved.

#### W6-R1-04 · "My hours this week"'s last row is occluded by the companion FAB at 390

`WorkDashboardScreen.swift:113-117` — the scroll content carries `.padding(.bottom, 40)`,
which is not enough clearance for the floating companion strip. Screenshot at max scroll:
the final row's subtitle (`Activity not set · Not billable`) is bisected by the FAB and the
"2 items need you" pill. The occluded text is exactly the HT-24/HT-26 answer the section
exists to print.

Confidence **medium** and partly inherited — the 40 pt inset predates W6 and the old last
element (the Browse grid) sat under the same overlay. W6 is what turns the bottom-most
element into *text a reader has to read* rather than a tile. Bump the bottom inset to clear
the companion.

---

### MINOR

#### W6-R1-05 · `CaptureStoreMigrationTests` does not prove the property half of FS-45, and one assertion is vacuous

`CaptureTests/CaptureStoreMigrationTests.swift:32-37` builds `previousSchema` from
`FieldVisitCloseRecord.self` — the **current** class, which already declares `billable`. So
the "previous-schema" store on disk is written *with* the new column. The suite therefore
proves the **entity** half of FS-45 (7 models → 8 opens without
`didResetIncompatibleStore`) and nothing about a newly-added mandatory attribute. The
comment at `:74-76` and the `#expect(store.visitCloseOutbox().first?.billable == true)` at
`:77` claim it does: *"The added column arrives with its declaration default rather than as
a missing mandatory value — the 134110 failure mode…"*. It cannot; the same class wrote it.

`W6-impl.md` §4.4 states the limitation honestly and explains why SwiftData's
process-wide entity-name resolution makes the two-version pair untestable in one build.
The defect is only that the test file itself reads as stronger coverage than it is. Either
delete `:74-77` or rewrite the comment to say what it actually pins, and cross-reference
`CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault`, which is the real guard.

#### W6-R1-06 · The live read path has no automated coverage, and the Simulator mock masks it

`AppContainer.swift:196-199`: in mock mode (the Simulator default, and the *only*
environment `capture-gate.sh` exercises) `hours` is `MockFieldHoursService`. The real
`SupabaseFieldHoursService` — both of its hand-written PostgREST queries, the
`project:projects(name)` embed, and `FieldHoursWireDate` — is reached by no test and no
gate. A renamed column or a broken embed ships green. This is the iOS analogue of the
`DATA_MODE=live` trap.

I closed the gap **for this round** by hand (§0 probes: both selects HTTP 200, embed
resolves, all five timestamp shapes parse). Nothing pins it going forward.

Related and worth recording: `myRateRoles` (`SupabaseFieldHoursService.swift:59-84`) is a
hand-rolled re-implementation of `useMyRateRoles`
(`packages/supabase/src/hooks/use-time-tracking.ts:1090-1120`). I diffed them —
designer short-circuit, `removed_at is null`, the same four-role filter — and they agree
today. Two copies of one rule will drift; the header comment already promises "the two
surfaces cannot disagree", which nothing enforces.

#### W6-R1-07 · `worthLabel` prints "Billable" when `rate_source` is NULL

`CaptureKit/CaptureKit/Domain/FieldHours.swift:96-101` keys "Rate pending" on the literal
`'none'`. Rows written before 00600 carry `rate_source IS NULL` and fall through to
"Billable". HT-26 is not breached (nothing goes blank), but a row whose rate is genuinely
unknown reads as priced. Treat NULL as unresolved.

#### W6-R1-08 · Two of six activity values are off-screen at 390 with no affordance but a clipped chip

Measured: Drive, Site visit, Sourcing, Client fit; **Design** is clipped (right edge 409.5
pt > 402); **Admin** — one of the five original 00198 values — is entirely off-screen. The
row is a horizontal `ScrollView` with `showsIndicators: false`
(`LogTimeSheet.swift:398`). The clipped chip is the only hint that it scrolls. Consider
wrapping to two rows, or leaving the indicator on.

#### W6-R1-09 · `started_at` is never adjusted when the duration is stepped

With no open visit the draft starts at `now − 30 min` (`FieldLogTime.swift:131`). Stepping
to 3 h files an entry whose span runs 2.5 h into the future. Nothing rejects it and no
CHECK cares, but the desk ledger will show it. Either anchor the entry to its *end* or
slide `startedAt` with the stepper.

#### W6-R1-10 · `myHours` caps at 60 rows and the total sums only what was fetched

`SupabaseFieldHoursService.swift:48`. HT-30's letter holds — the total is of the rows
printed beneath it — but a heavy week silently understates and never says so.

---

### NOTES

- **W6-R1-11 — the field SQL directory is red, and it is not W6's.**
  `field_capture_note_routing_test.sql` FAIL 7f ("exactly five policies, got 9"). I traced
  it: the four extra policies (`field_captures_studio_{select,insert,update,delete}`) come
  from `00584_studio_comember_rls_sweep.sql:176-192`, which is on `main` and predates this
  program. W6 touches neither the table nor the test. `W6-impl.md` §5 reports it
  accurately. It is **not** in `supabase/tests/field/KNOWN_FAILURES.md`, so W6's own
  Done-when gate reports an unexpected red every run — worth either a KNOWN_FAILURES entry
  or a program-ledger line before the ship note is written.

- **W6-R1-12 — the new SQL test exercises a direct table INSERT, not `log_time`.**
  `time_entry_activity_travel_test.sql:163-171` (case 6) writes through the table under
  `SET LOCAL ROLE authenticated`. The shipped Field path is the RPC. The `travel` CHECK is
  proven either way, so this is not a gap in 00616's proof; it just means the wire the app
  actually uses is covered only by my §0 probe, not by a committed test.

- **W6-R1-13 — `RouteSheetHeader`'s Close button measures 28.7 × 26.7 pt.** Pre-existing
  shared component, out of W6's scope, but it now sits on another new sheet. Recording it
  so it is not mistaken for W6-R1-02's fault.

- **W6-R1-14 — an extra analytics event fires at tap.** `LogTimeSheet.swift:320-324` emits
  `field.log_time_queued` in addition to the plan's canonical `time_entry_logged`, which
  the drainers emit on landing (`TimeEntryOutboxDrainer.swift:113-123` with
  `surface='field_sheet'`, `VisitCloseOutboxDrainer` with `surface='field_visit'` — both
  exactly as §7 specifies, both correctly skipped on the `existingTimeEntry` short-circuit
  so a replay does not double-count). The extra event is additive and defensible
  (queued-vs-landed is a real distinction HT-27 might want), but it is not on lane D's
  canonical list — confirm or drop.

- **W6-R1-15 — V4's stepper does not disable at its bounds.** `V4VisitReviewScreen.swift:339-357`
  clamps silently; `LogTimeSheet`'s equivalent dims (`:191-192`). Cosmetic inconsistency
  between the two new steppers.

- **W6-R1-16 — `FieldVisitCloseRecord` gained a column, which §7 said to leave alone.**
  Plan §7: *"`FieldVisitCloseRecord` is load-bearing and covered by ~30 tests — leave it
  alone"*. The implementer added `billable: Bool = true` and flagged it (`W6-impl.md`
  §4.1). I judge the reading defensible: the plan's next line is "create a **sibling**", the
  prohibition is against generalising the record into a two-queue shape, and HT-11 plus
  `log_time`'s raise-on-NULL-billable (`00608:87-89`) leave the close's answer nowhere else
  to live. It is additive with a declaration default, `FieldVisitCloseRecordTests` was
  updated rather than weakened, and `theCloseCarriesTheBillableAnswerSheGave` pins it.
  **Ratification owed from the orchestrator, not a defect.**

- **W6-R1-17 — `TimeEntryWriteRequest`'s wire keys moved to `p_*` and `userID` left the
  wire.** Forced by the plan's own `client.rpc("log_time")` row. Pinned by
  `TimeEntryOutboxRecordTests.theRequestIsTheLogTimeArgumentList:156-160`, which asserts
  `p_user_id`, `user_id`, `p_hourly_rate_cents` and `hourly_rate_cents` are all absent.
  Good — that is the assertion that keeps HT-1 from regressing off a phone.

---

## 2 · What I tried to refute and could not

| Claim under test | Verdict |
|---|---|
| every W6 plan item present as specified | **Yes**, with one deviation (W6-R1-16, ratification owed). 00616 ✔ (catalog-resolving DO block, `conkey`-pinned, LOOPed not LIMIT 1, named `project_time_entries_activity_ck`, six values + NULL asserted, one-CHECK postcondition, running-timer index postcondition). 00617 unused ✔. `LogTimeSheet` ✔. `FieldCompanionActionID.logTime` ✔. 7th Browse tile ✔ (measured on screen). "My hours this week" ✔. HT-16 stepper + billable on V4 ✔. `TimeEntryOutboxRecord` sibling ✔. `TimeEntryOutboxDrainer` sibling ✔. `log_time` RPC ✔. `CaptureStore.schema` 7→8 ✔. Widgets/ShareExtension grep ✔. `CreateTimeEntryInput.source` widened with `'field_manual'` — carried by `FieldTimeSource.fieldManual` on the Swift side; the TS union is W3/W4's file and already carries it on integration. |
| **no flag** (P-5) | ✔ `grep -rni featureflag` finds only the pre-existing `field-companion-voice`; nothing W6 added is gated. |
| **no dashboard / tab / badge / red-green / R69** | ✔ "My hours this week" is plain text, no colour keyed to state, no count badge on the Hours tile (`accessory: .none`), no ticking clock — the pre-fill is a single snapshot read. |
| **HT-26 — never a blank where a rate is pending** | ✔ for `rate_source='none'` ("Rate pending"), pinned by `anUnresolvedRateSaysSoRatherThanGoingBlank`. One honest-but-wrong case at NULL — W6-R1-07. |
| **HT-36 — notes never in any rollup** | ✔ W6 has no rollup, and `myHours`'s select list carries no `notes` column. |
| **HT-11 — billable explicit at every capture surface** | ✔ both Field write paths state it: the sheet's toggle and V4's new toggle; `log_time` raises on NULL (verified against 00608:87-89). `insertTimeEntry` has exactly two callers, both drainers. |
| **HT-41 — role chip only for multi-role members** | ✔ `FieldLogTimePolicy.showsRoleChip(roles.count > 1)`, `resolvedRole` drops an unheld pick, designer short-circuits to a single role. Verified on screen: no chip before a project is picked, chip after the two-role one. |
| **HT-7 — nothing in Field can hold the running slot** | ✔ `durationMinutes` non-Optional in both the draft and the record, floored to 1 in three places, `grep "durationMinutes: Int?"` finds only the decode-side read model. `log_time` raises on NULL/non-positive. 00616 re-asserts `uniq_project_time_entries_running_timer` as a postcondition. |
| **the RPC sends no rate and matches 00608's signature** | ✔ probed live, HTTP 200, `hourly_rate_cents` NULL server-side. |
| **the outbox record is client-minted and replay-safe** | ✔ `@Attribute(.unique) entryID`, never regenerated (`theEntryIDNeverRegenerates_soAReplayIsANoOp`), carried into every request, and a live replay produced one row. `.writing` stays due after a kill, and the pre-write `existingTimeEntry` probe closes the response-loss gap. |
| **the stepper default equals visit start → last Specimen** | ✔ `VisitReview.swift:89-97` reads `ordered.last?.createdAt` off the already-ascending array, clamped `[1, elapsed]`; six new `VisitReviewTests` cover the 3h/20m case, the no-capture case, and both clamp directions. All 19 pre-existing `elapsedMinutes` assertions untouched. `offeredMinutes` seeded once in `load()`, never re-seeded in `refreshRows()` — correct; I checked the @State read-after-write ordering is synchronous and safe. |
| **data access through the right seam** | ✔ for iOS conventions: writes through `TimeEntryGateway`, reads through the new `FieldHoursService` protocol with a mock conformer. (The portal hook rule is not this lane's.) |
| **commit hygiene** | ✔ three commits, Conventional Commits `feat(time):`, explicit pathspecs only — `apps/mobile/Capture/**`, `supabase/migrations/00616…`, `supabase/tests/field/…`. No `supabase/config.toml`, no `.env`, no `database.types.ts`, no seed file. `git show --stat` re-read for all three. |

## 3 · What I did NOT verify

- **No device pass.** P-6 puts it with Kody; every claim above is sim-verified. The
  airplane-mode drain walk (log → kill → reconnect → `SELECT`) is **unverified** and must
  be said so in the ship note.
- **V4VisitReviewScreen was not walked visually.** It is deliberately excluded from
  `capture-shots.sh` (no harness route), so its new stepper and billable toggle are
  compile- and unit-verified only — not measured at 390 the way H1 and W1 were.
- The portal, edge functions, and every other lane's migrations. I ran only the `field`
  SQL directory, as the brief scoped.
- `capture-gate.sh`'s `lint` tier is swiftlint `--strict` on this tree; I did not audit
  which rules it actually resolves.
