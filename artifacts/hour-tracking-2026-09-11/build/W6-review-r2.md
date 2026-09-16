# W6 adversarial review — round 2 (lane C, Patina Field)

**clean = false** — 0 blocker, 2 major, 8 minor, 11 notes.

Reviewer context separate from the implementer and from round 1. Branch
`hour-tracking/ios` @ `55abcb2d0`, **four** commits over `origin/hour-tracking/integration`
(`66d22ff9`, which is also the merge-base — the branch is exactly up to date with the
integration tip; local == `origin/hour-tracking/ios`; working tree clean). Every gate
below was re-run by me in the lane worktree, not copied from `W6-impl.md` or
`W6-fix-r1.md`. Claim level **sim-verified** throughout (P-6); no device pass.

Round 1's four majors (W6-R1-01…04) are **all confirmed fixed and re-measured by me**.
Round 1's six minors and seven notes are **all still standing** (none was in the fix
round's scope); they are re-listed below with fresh evidence rather than by reference.
One round-1 refutation-table claim was **measured false** and is this round's first major.

---

## 0 · Gates I ran, verbatim

```
$ supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-ios
  Resetting local database...
  Recreating database...
  Initialising schema...
  …
  Seeding data from supabase/seed/99-local-edge-settings.sql...
  Restarting containers...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}      ← CLEAN (exit 0)

$ /Users/kody/Code/patina-merged/scripts/run-sql-tests.sh \
    -d …/agent-ios/supabase/tests/field -H 127.0.0.1 -p 54422
  running 7 SQL test file(s) against postgresql://postgres:postgres@127.0.0.1:54422/postgres
  PASS  apply_field_effect_test.sql
  FAIL (exit 3) field_capture_note_routing_test.sql
        ERROR: FAIL 7f: field_captures should carry exactly five policies, got 9
  PASS  field_capture_visit_test.sql
  PASS  field_links_test.sql
  PASS  project_task_field_capture_ref_test.sql
  PASS  time_entry_activity_travel_test.sql        ← 00616's proof, new
  PASS  time_entry_field_visit_source_test.sql     ← existing, still green
  total: 7 · green: 6 · expected-fail: 0 · unexpected-fail: 1

$ …/scripts/run-sql-tests.sh -d …/agent-ios/supabase/tests/billing -H 127.0.0.1 -p 54422
  total: 9 · green: 9 · unexpected-fail: 0        (the plan's §7 gate block names this
  directory too; 00616 regresses nothing in it)

$ ruby …/apps/mobile/Capture/scripts/generate_project.rb
  Generated …/Capture.xcodeproj
    CaptureKit: 111 files · CaptureKitMocks: 3 · Capture(app): 149
  $ git status --porcelain apps/mobile/Capture/Capture.xcodeproj
    (empty — the committed pbxproj matches a fresh generation byte for byte)

$ …/apps/mobile/Capture/scripts/capture-gate.sh all      (sandbox off)
  ✔ build
  ✔ tests
  ✔ lint
  ✔ fc-r3 sweep (inbox)
  ✔ fc-r3 sweep (ai)
  ✔ principle-4 sweep
  [exited with code 0]

$ xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
    -destination "platform=iOS Simulator,name=iPhone 17 Pro" CODE_SIGNING_ALLOWED=NO
  ✔ Suite FieldVisitCloseRecordTests passed after 0.441 seconds.
  ✔ Suite VisitReviewTests passed after 0.407 seconds.
  ✔ Suite FieldCompanionPresentationTests passed after 0.562 seconds.
  ✔ Suite CaptureStoreMigrationTests passed after 6.409 seconds.
  ✔ Suite LogTimeSheetTests passed after 6.406 seconds.
  ✔ Suite TimeEntryOutboxRecordTests passed after 6.405 seconds.
  ✔ Test run with 808 tests in 75 suites passed after 6.457 seconds.
  ** TEST SUCCEEDED **        (all four suites the plan names, plus the two it updates)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres \
    pnpm --dir …/agent-ios db:generate
  $ git diff --exit-code packages/supabase/src/database.types.ts  → TYPES CLEAN

$ grep -nE '^\s*(GRANT|REVOKE)' supabase/migrations/00616_time_entry_activity_travel.sql
  (no match — §0.20's grep says no seed regeneration is owed)
$ python3 ./scripts/generate-legacy-grants.py      (the WORKTREE's own copy, §0.20)
  wrote …/agent-ios/supabase/seed/00-legacy-grants.sql — baseline + 2643 replayed statements
  $ git status --porcelain supabase/seed/00-legacy-grants.sql   → clean

$ grep -rn "CaptureWidgets\|CaptureShareExtension" apps/mobile/Capture
  (nothing — the plan's Done-when grep is satisfied)

$ git log --all --name-only --oneline -- 'supabase/migrations/0061*'
  00610…00616 only. 00616 unique across every ref; 00617 correctly unused.
```

### Behaviour probes the gates do not cover (run by me this round)

Authenticated as the seeded designer `a0000000-…-0004` (locally minted HS256 JWT, anon
apikey) against the isolated stack `http://127.0.0.1:54421`. The bodies are the **exact
key sets** `TimeEntryWriteRequest.CodingKeys` encodes. Probe row deleted afterwards
(`DELETE 1`).

| Probe | Result |
|---|---|
| `POST /rest/v1/rpc/log_time` with `{p_entry_id, p_project_id, p_started_at, p_duration_minutes, p_activity:"travel", p_billable:true, p_notes, p_source:"field_manual", p_rate_role:null}` | **HTTP 200** |
| the **same body replayed** under the same client-minted id | **HTTP 200**, identical `created_at` returned |
| `SELECT … WHERE id = <the minted id>` | **exactly 1 row**: `source=field_manual`, `activity=travel`, `billable=t`, `rate_source='none'`, **`hourly_rate_cents` NULL**, `user_id` from `auth.uid()`, `billing_state='pending_authorization'` |
| `GET project_time_entries?select=id, started_at, duration_minutes, activity, billable, billing_state, rate_source, project:projects(name)&user_id=eq.…&started_at=gte.…&duration_minutes=gte.1&order=started_at.desc&limit=60` — the exact string `SupabaseFieldHoursService.myHours` builds | **HTTP 200**, embed resolves: `"project":{"name":"Aspen Loft Refresh"}` |
| `GET projects?select=designer_id&id=eq.…&limit=1` and `GET project_team_members?select=role&project_id=eq.…&user_id=eq.…&removed_at=is.null` — `myRateRoles` | **HTTP 200** both |

So: **the RPC matches 00608's signature exactly, sends no rate, and the outbox record is
client-minted and replay-safe** — confirmed against the live stack, not inferred.

### Measured at 390 (iPhone 17e simulator, explicit UDID `2AB2290B-9505-4E33-8843-18B7DD1DF92B`, never `"booted"`)

`capture-run.sh H1.log-time` + a driven walk (`describe_screen` / `scan_ui` /
`device_action`). AXFrame heights, verbatim:

| Control | r1 measured | **r2 measured (390 pt)** |
|---|---|---|
| `Change` (back to the project picker) | 48 × 16 | **64 × 44** ✔ |
| Activity chips (Drive/Site visit/Sourcing/Client/Design/Admin) | 34–35 tall | **44 tall** ✔ |
| Role chips (Lead designer / Vendor) | 35 tall | **44 tall** ✔ |
| Day row | 34 tall | **350 × 44** ✔ (now our own button disclosing a graphical picker) |
| Project rows | 43.67 | **44** (318 × 44; the two-line one 63) ✔ |
| Steppers | 45 × 45 | **45 × 45** ✔ |
| Primary `Log 30m` | — | 350 × 52, **`enabled: false`** with no project ✔ (CR-1) |
| Notes field | not measured | **350 × 20** ✖ — see W6-R2-03 |

W1 at max scroll (390): last row subtitle `Activity not set · Not billable` **y 638.67 →
670**; `fieldCompanion.bubble` **y 710 → 774** — **40 pt clearance**, W6-R1-04 fixed.
Total `2h 45m` at y 431 sits **above** its three rows (y 503+) — HT-30 held. `Rate
pending` and `Activity not set` both print — HT-26 / HT-24 held. The Hours tile carries
no count (`"Hours"`, where siblings read `"Decisions, 2"`) — no badge. The role chips
appear only after the two-role project is picked — HT-41 held.

There is no 1440 width in this lane; Patina Field is phone-only and there is no
Playwright surface in this wave (the diff touches no portal file). 1440 is stood in for
by the widest Field target; `W6-fix-r1.md` records 440 pt (iPhone 17 Pro Max, UDID
`EDF8B28E-…`) and I did not re-run it.

---

## 1 · Findings

### MAJOR

#### W6-R2-01 · `TimeEntrySource` was never widened with `'field_manual'` — the plan assigns that to THIS wave, and round 1's refutation table said it was already done

`packages/supabase/src/hooks/use-time-tracking.ts:396-401`, verbatim at `55abcb2d0`:

```ts
export type TimeEntrySource =
  | 'timer_auto'
  | 'timer_manual'
  | 'manual_entry'
  | 'command_bar';
```

and the file's own doc comment two lines above (`:393-395`) promises the missing half:

```
 * surface lands — `command_bar` is W3's ⌘K verb. (W4 adds `internal`, W6 adds
 * `field_manual`.)
```

plan-v2 §7 carries this as a named wave item under **"TS vocabulary (W0-9)"**:
*"`CreateTimeEntryInput.source` … is still `'timer_auto' | 'timer_manual' |
'manual_entry'`. **This wave widens it with `'field_manual'`** … `00595` bought the DB
value already, so a TS error there is a missing widening, not a server problem."*

`W6-review-r1.md` §2 asserts the opposite — *"`CreateTimeEntryInput.source` widened with
`'field_manual'` … the TS union is W3/W4's file and already carries it on integration"*.
Measured false. `grep -rn "field_manual"` across `packages/` and the portals finds the
value only in two **comments** (`use-time-tracking.ts:395`,
`designer-portal/src/lib/analytics/document-events.ts:34`); it is in no TS union
anywhere. `W6-impl.md`'s file table does not list `use-time-tracking.ts`, and its §6
"Owed / not done here" does not mention it — so it is an unflagged omission, not a
declared deviation.

**Blast radius today is nil** — no TypeScript caller writes a Field row (the Field app is
Swift and goes through `log_time` directly), so nothing is broken at runtime and nothing
fails to type-check. That is the whole argument for a lower severity. Against it: it is a
plan item for this wave, explicitly worded, left undone and unreported, and the next
desk-side surface that wants to name a Field row will hit it.

**Fix.** One line in `packages/supabase/src/hooks/use-time-tracking.ts`
(`| 'field_manual'`), then `pnpm --filter @patina/supabase type-check` and
`pnpm --filter @patina/admin-portal build` (§0.24: admin's build is the mandatory gate
after any `packages/*` edit).
**Confidence: high.**

#### W6-R2-02 · Two of the six activity values are off-screen at 390, one of them `Admin` — the value this wave's own goal sentence names

Measured on the live tree at 390, at rest, before any scroll
(`LogTimeSheet.swift:248-261`, chips at `:443-466`):

| Chip | AXFrame x → right edge (screen is 390) |
|---|---|
| Drive | 20 → 80.3 |
| Site visit | 88.3 → 168 |
| Sourcing | 176 → 259 |
| Client | 267 → 330.3 |
| **Design** | 338.3 → **409** — clipped |
| **Admin** | (not in the tree at rest) — **entirely off-screen** |

After one horizontal swipe the row scrolls and `Admin` lands at x 302 → 369, so it **is**
reachable. The row is `ScrollView(.horizontal, showsIndicators: false)` — the only hint
that it scrolls is the half-clipped `Design` capsule, and a chip row that looks like a
complete set of choices is read as one.

This is round 1's W6-R1-08, graded **minor** there and not fixed. I am grading it
**major** on this round's rubric ("a control off-screen at 390 is a major") and on one
substantive ground r1 did not press: the wave's own goal sentence in plan-v2 §7 is *"The
field worker logs a drive, a call, a **sourcing run or admin time** from a phone with one
bar"* — `Admin` is a first-class use case of the surface and it is invisible at rest on
the only width this app ships at. A worker who cannot see it files admin time as
`Client` or `Design`, and the wrong `activity` is money in the wrong column.

**Mitigation the orchestrator should weigh before ordering a fix round:** the value is
reachable by a gesture, so this is discoverability, not unreachability; and the cheapest
fix is one word (`showsIndicators: true`) or a two-row wrap. If Fable reads
"off-screen" as "unreachable", downgrade this to minor and leave it with the other
carried-forward minors.
**Confidence: high on the measurement, medium on the severity.**

---

### MINOR

#### W6-R2-03 · The note field is a 20 pt tap target at 390 and announces no accessibility label

`LogTimeSheet.swift:306-313`. Measured AXFrame `{{20, 789.67}, {350, 20}}` — height
**20 pt** against house sheet §A's 44. Its `AXLabel` is **null**; the tree carries only
`AXValue: "Maple St → High Point"`, which is the *placeholder*, so VoiceOver reads a
worked example as if it were the field's name. The `NOTE (OPTIONAL)` eyebrow is a
separate `StaticText` and is not associated with the field.

Two reasons I grade this minor rather than joining it to W6-R1-02's majors: (a) it is an
**input**, not an act — house sheet §A says "acts ≥ 44px", and every control r1 listed
was a button; (b) it is the repo's existing pattern, not a W6 invention —
`S2CreateProjectScreen.swift:44-49` is the identical `RouteFieldShell { TextField … }`
shape, and `RouteFieldShell` (`RouteSessionUI.swift:106-124`) hangs its 10 pt padding on
the enclosing `VStack`, never on the field's hit region. **If the orchestrator reads §A
as covering every tap target, this is a major** and the fix is `.frame(minHeight: 44)` +
`.contentShape(Rectangle())` on the field plus an `.accessibilityLabel("Note")`.
**Confidence: high.**

#### W6-R2-04 · `log()` swallows a failed `store.save()` and dismisses anyway, under copy that promises durability

`LogTimeSheet.swift:344-375`:

```swift
container.store.context.insert(record)
try? container.store.save()
…
isLogging = false
coordinator.dismissSheet()
```

The round-1 fix correctly moved the dismiss off the network round trip — but it now
dismisses on a `try?` whose error is discarded. A save that throws (disk pressure, a
store the ladder set aside) loses the hour with the sheet closing on "Log 45m" and the
caption still reading *"It's kept on this phone and sent when there's signal."* (`:334`).
The sibling does it honestly: `V4VisitReviewScreen.logTheHours` also writes `try?`, then
**re-reads** `closeState = standingClose()?.state` (`:424`) so `offerLabel` can say
*"These hours didn't log."* Mirror that: re-fetch the record after the save and hold the
sheet with a plain line if it is not there.
**Confidence: medium** (the failure is rare; the silence is the defect).

#### W6-R2-05 · An `.active` visit can still pre-fill up to 12 h of wall clock on the sheet

`FieldLogTime.swift:136-148`. The round-1 fix closed the `.stale` band correctly; the
`.active` band still takes `now − visit.startedAt` whole. `visitState` bounds `.active`
at "touched within 30 min **and** opened on today's calendar date", so a 06:00 install
day tapped at 20:00 opens the sheet on **`Log 12h`** with Billable on — pinned, as
intended behaviour, by `LogTimeSheetTests.anActivePreFillLongerThanTheBoundIsClamped`
(`:179-187`).

`W6-fix-r1.md` names this residual openly and argues it, and **HT-7 sanctions the shape**
in so many words — *"elapsed-since-arrival pre-fill feels like a timer without owning the
slot"* — so this is **not** a ruling contradiction and I am not calling it a major. It is
recorded because it is the one place on H1 where a wall clock is still proposed as
billable time, and because the fix round's own reasoning ("the hour this sheet logs is
the un-captured tail") does not cover the 12-hour case: nobody drives for twelve hours.
A soft cap on the *pre-fill* (not the stepper's ceiling) would close it.
**Confidence: high on the behaviour, low on whether anything is owed.**

#### W6-R2-06 · (was W6-R1-05, unchanged) `CaptureStoreMigrationTests`' "previous schema" is the current class, so one assertion is vacuous

`CaptureStoreMigrationTests.swift:32-37` builds `previousSchema` from
`FieldVisitCloseRecord.self` — the **current** class, which already declares
`billable: Bool = true`. The store on disk is therefore written *with* the new column.
The suite genuinely proves the **entity** half of FS-45 (7 models → 8 opens with
`didResetIncompatibleStore == false`, and the standing close survives), and nothing about
a newly-added mandatory attribute — but the comment at `:74-76` and the
`#expect(store.visitCloseOutbox().first?.billable == true)` at `:77` claim it does
(*"The added column arrives with its declaration default rather than as a missing
mandatory value — the 134110 failure mode…"*). `W6-impl.md` §4.4 states the limitation
honestly; the defect is that the **test file** reads as stronger coverage than it is.
Delete `:74-77` or rewrite the comment and cross-reference
`CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault`, which is the real guard.
**Confidence: high.**

#### W6-R2-07 · (was W6-R1-06, unchanged) The live read path has no automated coverage and the Simulator mock masks it

`AppContainer.swift:199` puts `MockFieldHoursService()` in the mock branch — the
Simulator default and the *only* environment `capture-gate.sh` exercises. The real
`SupabaseFieldHoursService`, both of its hand-written PostgREST queries, the
`project:projects(name)` embed and `FieldHoursWireDate` are reached by no test and no
gate. A renamed column or a broken embed ships green. This is the iOS analogue of the
`DATA_MODE=live` trap in §0.24. I closed the gap **for this round** by hand (§0 probes:
all three selects HTTP 200, embed resolves); nothing pins it going forward.

Related: `myRateRoles` (`SupabaseFieldHoursService.swift:59-84`) remains a hand-rolled
second copy of `useMyRateRoles` (`use-time-tracking.ts:1090-1120`). They agree today
(designer short-circuit, `removed_at is null`, the same four-role filter); the header
comment promises "the two surfaces cannot disagree", which nothing enforces.
**Confidence: high.**

#### W6-R2-08 · (was W6-R1-07, unchanged) `worthLabel` prints "Billable" when `rate_source` is NULL

`FieldHours.swift:96-101` keys "Rate pending" on the literal `'none'`. A row written
before 00600 carries `rate_source IS NULL` and falls through to "Billable". HT-26 is not
breached (nothing goes blank), but a row whose rate is genuinely unknown reads as priced.
Treat NULL as unresolved: `if row.rateSource == nil || row.rateSource == "none"`.
**Confidence: high.**

#### W6-R2-09 · (was W6-R1-09, unchanged) `started_at` is never moved when the duration is stepped

With no open visit the draft anchors at `now − 30 min` (`FieldLogTime.swift:141`).
Stepping to 3 h files an entry whose span runs 2.5 h into the future. Nothing rejects it
and no CHECK cares, but the desk ledger will show it, and the Day picker's own
`in: ...Date()` bound (`LogTimeSheet.swift:232`) says the surface does mean to keep hours
in the past. Either anchor the entry to its *end* or slide `startedAt` with the stepper.
**Confidence: high.**

#### W6-R2-10 · (was W6-R1-10, unchanged) `myHours` caps at 60 rows and the total sums only what was fetched

`SupabaseFieldHoursService.swift:48`. HT-30's letter holds — the total is of the rows
printed beneath it — but a heavy week silently understates and never says so.
**Confidence: high.**

---

### NOTES

- **W6-R2-11 — the field SQL directory is red, and it is not W6's. Reproduced by me.**
  `field_capture_note_routing_test.sql` FAIL 7f ("exactly five policies, got 9"). I
  confirmed the cause against the freshly reset catalog:
  `select policyname from pg_policies where tablename='field_captures'` returns nine, the
  four extra being `field_captures_studio_{select,insert,update,delete}`, and
  `grep -rln field_captures_studio_select supabase/migrations/` points at exactly one
  file, `00584_studio_comember_rls_sweep.sql` — on `main`, predating this program. W6
  touches neither the table nor the test. It is **not** in
  `supabase/tests/field/KNOWN_FAILURES.md`, so W6's own Done-when gate reports an
  unexpected red on every run. Owed: a `KNOWN_FAILURES.md` entry or a program-ledger
  line before the ship note is written.

- **W6-R2-12 — the new SQL test exercises a direct table INSERT, not `log_time`.**
  `time_entry_activity_travel_test.sql` case 6 writes through the table under
  `SET LOCAL ROLE authenticated`. The shipped Field path is the RPC. The `travel` CHECK
  is proven either way, so 00616's proof is not gapped; the wire the app actually uses is
  covered only by my §0 probe and round 1's, never by a committed test.

- **W6-R2-13 — `RouteSheetHeader`'s Close button measures 28.67 × 26.67 pt at 390.**
  Re-measured this round. Pre-existing shared component, out of W6's scope, but it now
  sits on another new sheet. Recorded so it is not mistaken for W6-R1-02's fault.

- **W6-R2-14 — the extra `field.log_time_queued` event is still emitted.**
  `LogTimeSheet.swift:359-363`, in addition to the plan's canonical `time_entry_logged`,
  which both drainers correctly emit **on landing** (`TimeEntryOutboxDrainer.swift:113-123`
  with `surface='field_sheet'`; `VisitCloseOutboxDrainer` with `surface='field_visit'`,
  both skipped on the `existingTimeEntry` short-circuit so a replay does not
  double-count). Queued-vs-landed is a real distinction HT-27 might want, but the name is
  not on lane D's canonical list. **Ruling owed** — confirm or drop.

- **W6-R2-15 — V4's stepper still does not disable at its bounds.**
  `V4VisitReviewScreen.swift:336-349` clamps silently through
  `VisitReviewComposer.steppedMinutes`; `LogTimeSheet.stepButton` (`:189-203`) dims and
  disables. Cosmetic inconsistency between the wave's two new steppers.

- **W6-R2-16 — `FieldVisitCloseRecord` gained a column, which §7 said to leave alone.**
  Plan §7: *"`FieldVisitCloseRecord` is load-bearing and covered by ~30 tests — leave it
  alone"*. The implementer added `billable: Bool = true` and flagged it (`W6-impl.md`
  §4.1). I independently reach round 1's conclusion: the plan's next line is "create a
  **sibling**", the prohibition is against generalising the record into a two-queue
  shape, and HT-11 plus `log_time`'s raise-on-NULL-billable (`00608:86-89`, which I read
  directly) leave the close's answer nowhere else to live. Additive with a declaration
  default; `FieldVisitCloseRecordTests` was updated rather than weakened.
  **Ratification still owed from the orchestrator, not a defect.**

- **W6-R2-17 — the wire keys moved to `p_*` and `userID` left the wire, correctly.**
  `FieldVisitCloseRecord.swift:200-213`'s `CodingKeys` omits `userID` entirely (it is kept
  as a property only so the drainer can refuse an unparseable owner), and
  `TimeEntryOutboxRecordTests.theRequestIsTheLogTimeArgumentList` asserts `p_user_id`,
  `user_id`, `p_hourly_rate_cents` and `hourly_rate_cents` are all absent from the encoded
  JSON. That is the assertion that keeps HT-1 from regressing off a phone. My live probe
  confirmed the server stores `hourly_rate_cents` NULL and `rate_source='none'`.

- **W6-R2-18 — HT-13's "backdated mark" has no Field expression, and future days are
  barred.** The ruled text is *"Any date, until the entry is invoiced; entries older than
  30 days carry a quiet 'backdated' mark."* The Field day picker
  (`LogTimeSheet.swift:230-236`) is bounded `in: ...Date()` and carries no mark at any
  age. Plan §7 asks for neither, and the mark reads as the desk add row's job (W3), so
  this is scoped out rather than missing — recorded so nobody later reads Field's silence
  as the ruling being met.

- **W6-R2-19 — an unrecognised server `activity` renders as "Activity not set".**
  `SupabaseFieldHoursService.swift:134` does `activity.flatMap(FieldTimeActivity.init(rawValue:))`,
  so a value the enum does not know becomes the same honest-empty label HT-24 reserves for
  a genuinely unset one. All six 00616 values map today
  (`LogTimeSheetTests.everyActivityIsOneTheConstraintAdmits` pins the set against the
  CHECK), so this only bites if a future migration widens the CHECK without the enum.

- **W6-R2-20 — `VisitCloseOutboxDrainer` gained an `analytics` dependency.** A
  constructor change to the ~49-test proven visit-close class (`init` at `:27-34`). It is
  additive, every call site is in `AppContainer.makeWriteLanes`, and the suites are green;
  recorded only because §7's FS-44 language asks that the proven path be left alone.

- **W6-R2-21 — commit hygiene is clean.** Four commits, Conventional Commits only:
  `feat(time):` ×3 and `fix(time):` ×1, each with a body that names its rulings.
  `git show --stat` re-read for all four: every path is under `apps/mobile/Capture/**`,
  `supabase/migrations/00616_time_entry_activity_travel.sql`, or
  `supabase/tests/field/time_entry_activity_travel_test.sql`. **No `supabase/config.toml`
  (still skip-worktree'd, `git ls-files -v` shows `S`), no `.env`, no
  `database.types.ts`, no seed file.** The regenerated `Capture.xcodeproj/project.pbxproj`
  and the two `.xcscheme` files are committed and match a fresh `generate_project.rb`.

---

## 2 · What I tried to refute and could not

| Claim under test | Verdict |
|---|---|
| every W6 plan item present as specified | **No — one is missing.** The TS-vocabulary item is absent (W6-R2-01). Everything else is present: 00616 ✔ (catalog-resolving `DO` block, `conkey`-pinned, LOOPed not `LIMIT 1`, named `project_time_entries_activity_ck`, six values + NULL asserted by name, one-CHECK postcondition, running-timer-index postcondition); 00617 unused ✔; `LogTimeSheet` ✔; `FieldCompanionActionID.logTime = "time.log"` ✔; 7th Browse tile ✔ (measured on screen); "My hours this week" ✔; HT-16 stepper + billable toggle on V4 ✔; `TimeEntryOutboxRecord` sibling ✔; `TimeEntryOutboxDrainer` sibling ✔; `log_time` RPC ✔; `CaptureStore.schema` 7→8 ✔; Widgets/ShareExtension grep ✔. One ratified deviation (W6-R2-16). |
| **no flag** (P-5) | ✔ `grep -rni "featureflag\|useFeatureFlag"` over every new/changed W6 file returns nothing. |
| **no dashboard / tab / badge / red-green / R69** | ✔ "My hours this week" is plain text; no colour keyed to state (only `verdigris`/`ink`/`inkSoft`/`line`/`paper`); the Hours tile is `accessory: .none` and the live tree shows `"Hours"` with no count where siblings read `"Decisions, 2"`; the section heading passes `count: nil`. `grep "Timer\.\|TimelineView\|repeatForever"` over the new files returns nothing — the pre-fill is one snapshot read (R69). |
| **HT-26 — never a blank where a rate is pending** | ✔ for `rate_source='none'` ("Rate pending"), pinned by `anUnresolvedRateSaysSoRatherThanGoingBlank` and seen on screen. One honest-but-wrong case at NULL — W6-R2-08. |
| **HT-36 — notes never in any rollup** | ✔ W6 has no rollup, and `myHours`'s select list carries no `notes` column (verified against the live query). |
| **HT-11 — billable explicit at every capture surface** | ✔ both Field write paths state it: the sheet's toggle (`LogTimeSheet.swift:265-280`) and V4's new toggle (`:322-327`); `TimeEntryWriteRequest.billable` has no default; `log_time` raises on NULL (`00608:86-89`, read directly). `insertTimeEntry` has exactly two callers, both drainers, both passing an explicit answer. |
| **HT-41 — role chip only for multi-role members** | ✔ `FieldLogTimePolicy.showsRoleChip(roles.count > 1)`; `resolvedRole` drops an unheld pick (which 00601 would raise on); designer short-circuits to one role. Measured: no chip before a project is picked, two 44 pt chips after. |
| **HT-7 — nothing in Field can hold the running slot** | ✔ `durationMinutes` is non-Optional in the draft, the record and the request; floored to 1 in three places; `log_time` raises on NULL/non-positive; 00616 re-asserts `uniq_project_time_entries_running_timer` as a postcondition (and the assert is live — it ran on my reset). |
| **the RPC sends no rate and matches 00608's signature** | ✔ probed live: HTTP 200 on the exact encoded key set, `hourly_rate_cents` NULL server-side, `rate_source='none'`. |
| **the outbox record is client-minted and replay-safe** | ✔ `@Attribute(.unique) entryID`, never regenerated, carried into every request; the pre-write `existingTimeEntry` probe closes the response-loss gap one round trip before `ON CONFLICT` does; a live replay under the same id produced **one** row with the original `created_at`. |
| **the stepper default equals visit start → last Specimen** | ✔ `VisitReview.swift:89-97` reads `ordered.last?.createdAt` off the array `summarize` sorts ascending (`VisitReviewRow` **is** a Specimen — it is keyed on `specimenID`), clamped `[1, elapsed]`. `elapsedMinutes` is kept and all 19 pre-existing assertions about it are untouched; six new `VisitReviewTests` cover the 3 h / 20 min case, the no-capture case and both clamp directions. `offeredMinutes` is seeded once in `load()` and never re-seeded in `refreshRows()`. |
| **the collapsed companion strip keeps its one slot** (MOB-11 / Invariant V) | ✔ `logTime` is offered only as `.communicate`'s `secondaryAction`, and `.communicate` maps to `.expanded` (`FieldCompanionPresentation.swift:260-261`). Pinned by the new `loggingAnHourNeverTakesTheCollapsedStripsOneSlot`, which walks all three band states. |
| **data access through the right seam** | ✔ for iOS conventions: writes through `TimeEntryGateway`, reads through the new `FieldHoursService` protocol with a mock conformer; no ad-hoc client in a view. (The `@patina/supabase` hook rule is a portal rule and this wave touches no portal file — which is also why the `DATA_MODE=live` check has no surface here; its iOS analogue is W6-R2-07.) |
| **the mock fallback cannot mask a broken query** | ✖ not satisfiable in this lane by a gate — see W6-R2-07. Closed by hand this round. |
| **`capture-gate.sh all` green** | ✔ tail pasted in §0; exit code 0. |

## 3 · What I did NOT verify

- **No device pass.** P-6 puts it with Kody; every claim above is **sim-verified**. The
  airplane-mode drain walk (log a drive → kill the app → reconnect → `SELECT` the row) is
  **unverified** and must be said so in the ship note. The Simulator runs
  `AppConfiguration.runsRealServices == false`, so the walk I drove exercised the durable
  local write and a mock drain — the PostgREST leg was proved separately by the §0 probes,
  not end-to-end from the app.
- **V4VisitReviewScreen was not walked visually.** It is excluded from
  `capture-shots.sh` (no harness route), so its new stepper and billable toggle are
  compile- and unit-verified only, never measured at 390.
- **440 pt was not re-measured** this round; I accepted `W6-fix-r1.md`'s figures for the
  wide end.
- **I did not re-run 1440** — there is no such width in this lane and no portal file in
  the diff.
- The portal, the edge functions, and every other lane's migrations. I ran the `field`
  and `billing` SQL directories only.
- `capture-gate.sh`'s `lint` tier is swiftlint `--strict` on this tree; I did not audit
  which rules it actually resolves.
- Per `patina-verification`, I did **not** run any root `pnpm` turbo sweep, so nothing
  here speaks for `@patina/supabase`'s or `admin-portal`'s gates — which is exactly what
  W6-R2-01's fix will need.
