# W6 adversarial review — round 3 (lane C, Patina Field)

**clean = true** — 0 blocker, 0 major, 11 minor, 14 notes.

Reviewer context separate from the implementer and from rounds 1 and 2. Branch
`hour-tracking/ios` @ `293b0c4e6`, **five** commits over `origin/hour-tracking/integration`
(`66d22ff96`, which is also the merge-base — the branch is exactly up to date with the
integration tip; `hour-tracking/ios` == `origin/hour-tracking/ios`; working tree clean).
Every gate below was re-run by me in the lane worktree, not copied from `W6-impl.md`,
`W6-review-r2.md` or `W6-fix-r2.md`. Claim level **sim-verified** throughout (P-6); no
device pass.

**Round 2's two majors are both confirmed fixed and re-measured by me** (W6-R2-01 the TS
union, W6-R2-02 the six activity chips at 390). Round 2's eight minors and eleven notes
were out of the fix round's declared scope and are **all still standing**; they are
re-listed below under new ids with fresh evidence rather than by reference. Three
findings are new this round (W6-R3-09, W6-R3-10, W6-R3-11's KNOWN_FAILURES half).

---

## 0 · Gates I ran, verbatim

```
$ supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-ios
  …
  Seeding data from supabase/seed/99-local-edge-settings.sql...
  Restarting containers...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}
  [exited with code 0]                                              ← CLEAN

$ /Users/kody/Code/patina-merged/scripts/run-sql-tests.sh \
    -d …/agent-ios/supabase/tests/field -H 127.0.0.1 -p 54422
  PASS  apply_field_effect_test.sql
  FAIL (exit 3) field_capture_note_routing_test.sql
        ERROR: FAIL 7f: field_captures should carry exactly five policies, got 9
  PASS  field_capture_visit_test.sql
  PASS  field_links_test.sql
  PASS  project_task_field_capture_ref_test.sql
  PASS  time_entry_activity_travel_test.sql        ← 00616's proof, new
  PASS  time_entry_field_visit_source_test.sql     ← existing, still green
  total: 7 · green: 6 · expected-fail: 0 · unexpected-fail: 1     (see W6-R3-11)

$ …/run-sql-tests.sh -d …/agent-ios/supabase/tests/billing -H 127.0.0.1 -p 54422
  PASS legacy_project_studio_stamp_test.sql · studio_invoice_test.sql
  PASS time_claim_atomicity_test.sql · time_entry_ledger_test.sql
  PASS time_log_rpc_test.sql · time_rate_resolution_test.sql
  PASS time_unbilled_view_repair_test.sql  (+2)
  total: 9 · green: 9 · unexpected-fail: 0

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

# capture-gate.sh runs xcodebuild -quiet, which prints no suite names. Re-run
# verbose so the plan's four named suites are actually seen to run:
$ xcodebuild test -project Capture.xcodeproj -scheme CaptureKit \
    -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" \
    CODE_SIGNING_ALLOWED=NO
  ✔ Suite VisitReviewTests passed after 0.642 seconds.
  ✔ Suite FieldVisitCloseRecordTests passed after 0.643 seconds.
  ✔ Suite FieldCompanionPresentationTests passed after 0.743 seconds.
  ✔ Suite CaptureStoreMigrationTests passed after 1.846 seconds.
  ✔ Suite TimeEntryOutboxRecordTests passed after 1.827 seconds.
  ✔ Suite LogTimeSheetTests passed after 1.846 seconds.
  ✔ Test run with 808 tests in 75 suites passed after 1.867 seconds.
  ** TEST SUCCEEDED **

# The packages/* edit the r2 fix round introduced — §0.24's mandatory pair:
$ pnpm --filter @patina/supabase type-check        → tsc --noEmit, no output, exit 0
$ pnpm --filter @patina/admin-portal build         → full route table printed,
                                                     .next/BUILD_ID on disk, exit 0
  (both needed `pnpm --filter "@patina/admin-portal^..." build` first in a fresh
   worktree, exactly as W6-fix-r2.md warns; a bare exit 0 is not by itself proof —
   I checked for the route table and BUILD_ID.)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres \
    pnpm --dir …/agent-ios db:generate
  $ git diff --exit-code packages/supabase/src/database.types.ts  → TYPES CLEAN

$ grep -nE '^\s*(GRANT|REVOKE)' supabase/migrations/00616_time_entry_activity_travel.sql
  (no match — §0.20's grep says no seed regeneration is owed)
$ python3 ./scripts/generate-legacy-grants.py          (the WORKTREE's own copy, §0.20)
  wrote …/agent-ios/supabase/seed/00-legacy-grants.sql — baseline + 2643 statements
  $ git status --porcelain supabase/seed/00-legacy-grants.sql   → clean

$ grep -rn "CaptureWidgets\|CaptureShareExtension" apps/mobile/Capture
  (nothing — the plan's Done-when grep is satisfied; the directories do not exist)

$ git log --all --name-only --oneline -- 'supabase/migrations/0061[67]*'
  supabase/migrations/00616_time_entry_activity_travel.sql   ← unique across every ref
  (00617 exists on no ref — correctly unused)

$ git status --porcelain            (worktree)  → clean
$ git ls-files -v supabase/config.toml          → S   (still skip-worktree'd, uncommitted)
```

> ⚠ **For the next lane.** `pnpm db:generate` run **inside the Bash sandbox** fails on a
> Docker prerequisite check — and because the script is `supabase gen types … > src/database.types.ts`,
> the shell redirect **truncates `database.types.ts` to zero bytes before the failure**.
> I hit this, restored with `git checkout --`, and re-ran with the sandbox off (clean).
> Run it `dangerouslyDisableSandbox: true` or you will silently empty a 37k-line generated file.

### Behaviour probes the gates do not cover (run by me this round)

Authenticated as the seeded designer `a0000000-…-0004` (locally minted HS256 JWT, anon
apikey) against the isolated stack `http://127.0.0.1:54421`. Bodies are the **exact key
set** `TimeEntryWriteRequest.CodingKeys` encodes. Probe rows deleted afterwards.

| Probe | Result |
|---|---|
| `pg_get_function_arguments('log_time')` | `p_entry_id, p_project_id, p_started_at, p_duration_minutes, p_activity, p_billable, p_notes, p_phase_key, p_task_id, p_source, p_rate_role, p_studio_id` — **every key the Swift CodingKeys emits is a real argument name; the three the phone omits all carry DEFAULTs** |
| `POST rpc/log_time` `{p_entry_id,p_project_id,p_started_at,p_duration_minutes:45,p_activity:"travel",p_billable:true,p_notes,p_source:"field_manual",p_rate_role:null}` | **HTTP 200**; returned row: `source=field_manual`, `activity=travel`, `billable=t`, **`hourly_rate_cents` NULL**, `rate_source='none'`, `billing_state='pending_authorization'`, `user_id` from `auth.uid()` |
| the **same body replayed** under the same client-minted id | **HTTP 200**, byte-identical row incl. the original `created_at`; `SELECT count(*)` → **1** |
| `p_duration_minutes: null` (HT-7) | **400 / P0001** `log_time: p_duration_minutes must be a positive number of minutes` |
| `p_billable` omitted (HT-11) | **400 / P0001** `log_time: p_billable must be stated (HT-11) — there is no default` |
| the exact `SupabaseFieldHoursService.myHours` GET (select list, `user_id=eq`, `started_at=gte`, `duration_minutes=gte.1`, `order`, `limit=60`) | **HTTP 200**, embed resolves: `"project":{"name":"Aspen Loft Refresh"}`; **no `notes` column in the payload** (HT-36) |
| the two `myRateRoles` GETs (`projects.designer_id`, `project_team_members.role` w/ `removed_at=is.null`) | **HTTP 200** both |

So, measured rather than inferred: **the RPC matches 00608's signature exactly, sends no
rate, the outbox record is client-minted and replay-safe, and nothing in Field can express
the running slot.**

### Measured at 390 (iPhone 17e, explicit UDID `2AB2290B-9505-4E33-8843-18B7DD1DF92B`, never `"booted"`)

`capture-run.sh H1.log-time` + a driven walk (`describe_screen` / `scan_ui` / `device_action`).
AXFrames verbatim.

**H1 · Log an hour — the activity row, the r2 major, re-measured:**

| Chip | x → right edge | height |
|---|---|---|
| Drive | 20 → 80.3 | 44 |
| Site visit | 88.3 → 168 | 44 |
| Sourcing | 176 → 259 | 44 |
| Client | 267 → 330.3 | 44 |
| **Design** | **20 → 90.7 (row 2)** | 44 |
| **Admin** | **98.7 → 166 (row 2)** | 44 |

All six on screen at rest, two rows, nothing past the 370pt content edge. **W6-R2-02 fixed.**

| Control | 390 measured |
|---|---|
| Project rows | 318 × 44 (the two-line one 63) ✔ |
| `Change` (after a project is picked) | 64 × 44 ✔ |
| Steppers ±15m | 45 × 45 ✔ |
| Day row (own button → graphical picker) | 350 × 44, `AXLabel "Day Sun, Sep 13"`, hint present ✔ |
| Billable toggle | 350 × 53.3, `AXValue "1"` ✔ |
| Primary `Log 30m` | 350 × 52 — **`enabled: false`** with no project, **`enabled: true`** after one is picked ✔ (CR-1) |
| Note field | **350 × 20**, `AXLabel: null` ✖ — W6-R3-01 |
| Role chips | **absent** with one roster role ✔ (HT-41) |

**Dynamic Type, `content_size accessibility-extra-large` at 390** (not measured in any
prior round): every chip still 44 tall and the widest ("Sourcing" 150.3, "Site visit"
143.3) stays inside the 350pt content width — the new `LogTimeChipFlow` re-flows to more
rows rather than clipping. Close button grows to 48.3 × 44.3. No overflow found.

**W1 · Work, at max scroll (390):** 7th Browse tile `"Hours"` 169 × 120, `help: "Opens hours"`,
**no count** where its siblings read `"Decisions, 2"` / `"Receiving, 2"` — no badge.
`MY HOURS THIS WEEK` heading carries no count. Total **`2h 45m` at y 424 sits above** its
three rows (y 496+) — **HT-30 held**. `Rate pending` and `Activity not set` both print —
**HT-26 / HT-24 held**. Last row subtitle y 633.7 → 665; `fieldCompanion.bubble`
y 710 → 774 — **45pt clearance**, W6-R1-04's fix holds.

**440pt (iPhone 17 Pro Max, UDID `EDF8B28E-32F2-4DD1-944E-25E3C8538770`), re-measured this
round rather than accepted:** the chip row re-flows to five on line one (Design right edge
409, inside the 420pt content edge) and Admin alone on line two; Day row 400 × 44; primary
400 × 52 and disabled with no project. Nothing clipped.

> **There is no 1440 in this lane.** Patina Field is phone-only, the diff touches no portal
> route, page or component, and the single portal-package edit is a type union with no
> rendered surface — so no Playwright run applies. The wide end is stood in for by the
> 440pt phone above, measured this round.

---

## 1 · Findings

### BLOCKER

None.

### MAJOR

None. Both round-2 majors are fixed and re-measured (see §0 and §2).

### MINOR

#### W6-R3-01 · (was W6-R2-03, unchanged) The note field is a 20pt target at 390 and its only accessible name is the placeholder
`LogTimeSheet.swift:306-313`. Re-measured at 390 twice this round: AXFrame `{{20, 841.67}, {350, 20}}`
at rest and `{{20, 666}, {350, 20}}` after scroll — height **20pt** against house sheet §A's 44.
`AXLabel` is **null**; the tree carries only `AXValue: "Maple St → High Point"`, the *placeholder*,
so VoiceOver announces a worked example as if it were the field's name. The `NOTE (OPTIONAL)`
eyebrow is a separate `StaticText` and is not associated with the field.
Two reasons this stays minor on my rubric: it is an **input**, not an act (§A says "acts ≥ 44px",
and every control r1 raised was a button); and it is the repo's existing `RouteFieldShell { TextField }`
shape (`S2CreateProjectScreen.swift:44-49`), where `RouteSessionUI.swift:106-124` hangs the 10pt
padding on the enclosing `VStack` and never on the field's hit region. **If Fable reads §A as
covering every tap target, this is a major** — it is a NEW field on a NEW screen, unlike the
shared Close button (W6-R3-13). Fix: `.frame(minHeight: 44)` + `.contentShape(Rectangle())` on
the field, plus `.accessibilityLabel("Note")`.
**Confidence: high.**

#### W6-R3-02 · (was W6-R2-04, unchanged) `log()` swallows a failed `store.save()` and dismisses anyway, under copy that promises durability
`LogTimeSheet.swift:356-371` — `container.store.context.insert(record)` / `try? container.store.save()`
/ `isLogging = false` / `coordinator.dismissSheet()`. The r1 fix correctly moved the dismiss off the
network round trip, but the sheet now closes on a `try?` whose error is discarded. A save that throws
(disk pressure, a store the ladder set aside) loses the hour while the caption still reads *"It's kept
on this phone and sent when there's signal."* (`:334`). The sibling is honest about it:
`V4VisitReviewScreen.logTheHours` also writes `try?`, then **re-reads** `closeState = standingClose()?.state`
(`:424`) so `offerLabel` can say *"These hours didn't log."* Mirror that — re-fetch the record after the
save and hold the sheet with a plain line if it is not there.
**Confidence: medium** (the failure is rare; the silence is the defect).

#### W6-R3-03 · (was W6-R2-05, unchanged) An `.active` visit can still pre-fill up to 12h of wall clock as Billable
`FieldLogTime.swift:136-148`. The r1 fix closed the `.stale` band correctly; `.active` still takes
`now − visit.startedAt` whole, clamped only at `maximumMinutes = 12 * 60`. `visitState` bounds `.active`
at "touched within 30 min **and** opened on today's calendar date", so a 06:00 install day tapped at
20:00 opens the sheet on **`Log 12h`** with Billable on — pinned as intended by
`LogTimeSheetTests.anActivePreFillLongerThanTheBoundIsClamped` (`:179-187`). HT-7 sanctions the shape in
so many words ("elapsed-since-arrival pre-fill feels like a timer without owning the slot"), so this is
**not** a ruling contradiction. It is recorded because it is the one place on H1 where a wall clock is
still proposed as billable, and the fix round's reasoning ("the hour this sheet logs is the un-captured
tail") does not cover twelve hours — nobody drives for twelve hours. A soft cap on the *pre-fill* (not
the stepper's ceiling) would close it.
**Confidence: high on the behaviour, low on whether anything is owed.**

#### W6-R3-04 · (was W6-R2-06, unchanged) `CaptureStoreMigrationTests`' "previous schema" is the current class, so one assertion is vacuous
`CaptureStoreMigrationTests.swift:32-37` builds `previousSchema` from `FieldVisitCloseRecord.self` — the
**current** class, which already declares `billable: Bool = true`. The store on disk is therefore written
*with* the new column. The suite genuinely proves the **entity** half of FS-45 (7 models → 8 opens with
`didResetIncompatibleStore == false`, the standing close survives, `openReport.failures.isEmpty`), and
nothing about a newly-added mandatory attribute — but the comment at `:74-76` and
`#expect(store.visitCloseOutbox().first?.billable == true)` at `:77` read as if it does. `W6-impl.md` §4.4
states the limitation honestly; the defect is that the **test file** claims stronger coverage than it has.
Delete `:74-77` or rewrite the comment with a cross-reference to
`CaptureStoreLadderTests.everyMandatoryAttributeCarriesADefault`, which is the real guard.
**Confidence: high.**

#### W6-R3-05 · (was W6-R2-07, unchanged) The live read path has no automated coverage and the Simulator mock is the only environment the gate exercises
`AppContainer.swift:199` puts `MockFieldHoursService()` in the mock branch — the Simulator default and the
only environment `capture-gate.sh` runs. The real `SupabaseFieldHoursService`, both hand-written PostgREST
queries, the `project:projects(name)` embed and `FieldHoursWireDate` are reached by no test and no gate; a
renamed column or a broken embed ships green. This is the iOS analogue of §0.24's `DATA_MODE=live` trap.
I closed it **for this round** by hand (§0 probes: all three selects HTTP 200 against the live stack, embed
resolved to `{"name":"Aspen Loft Refresh"}`); nothing pins it going forward. Related: `myRateRoles`
(`SupabaseFieldHoursService.swift:59-84`) is a hand-rolled second copy of `useMyRateRoles`
(`use-time-tracking.ts:1090-1120`) — they agree today, and the header comment promises "the two surfaces
cannot disagree", which nothing enforces.
**Confidence: high.**

#### W6-R3-06 · (was W6-R2-08) `worthLabel` prints "Billable" when `rate_source` IS NULL — and I can now show the NULL is reachable in prod
`FieldHours.swift:96-101` keys "Rate pending" on the literal `'none'`. New evidence this round, from the
freshly reset catalog: `project_time_entries.rate_source` is **`is_nullable = YES` with no column default**,
and **P-4 forbids backfill**, so every row written before W1's 00600 keeps `rate_source IS NULL` forever —
and those rows fall straight through to `"Billable"`. HT-26 is not breached (nothing goes blank), but a row
whose rate is genuinely unknown reads as priced, on a phone, to the person whose pay it is. One line:
`if row.rateSource == nil || row.rateSource == "none"`.
**Confidence: high.** (A case can be made for major on "user-visible defect"; r2 graded it minor and I keep
that grade because the wrong label only reaches legacy rows, not anything this wave writes.)

#### W6-R3-07 · (was W6-R2-09, unchanged) `started_at` is never moved when the duration is stepped, and nothing server-side rejects the result
With no open visit the draft anchors at `now − 30 min` (`FieldLogTime.swift:141`). Stepping to 3h files an
entry whose span runs 2.5h into the future. I probed the server this round: `log_time` accepts a
`p_started_at` / `p_duration_minutes` pair that ends in the future (HTTP 200), and no CHECK cares. The desk
ledger will show it, and the Day picker's own `in: ...Date()` bound (`LogTimeSheet.swift:232`) says the
surface does mean to keep hours in the past. Either anchor the entry to its *end* or slide `startedAt` with
the stepper.
**Confidence: high.**

#### W6-R3-08 · (was W6-R2-10, unchanged) `myHours` caps at 60 rows and the total sums only what was fetched
`SupabaseFieldHoursService.swift:48`. HT-30's letter holds — the total is of the rows printed beneath it —
but a heavy week silently understates and never says so.
**Confidence: high.**

#### W6-R3-09 · **NEW** — both `time_entry_logged` call sites omit `rate_source`, and the visit-close one hard-codes `rate_role: "unset"`, though `log_time` RETURNS both
Lane D's canonical list (`apps/designer-portal/src/lib/analytics/document-events.ts:29-36`) declares
`time_entry_logged — surface, source, activity, billable, **rate_source**, rate_role, duration_minutes,
latency_ms`, and says outright that "posthog-ios call sites read the name from here, not from a guess".
What actually ships:

- `TimeEntryOutboxDrainer.swift:113-123` emits `surface, source, activity, billable, rate_role,
  duration_minutes, latency_ms` — **no `rate_source`**.
- `VisitCloseOutboxDrainer.swift:107-118` emits the same seven and hard-codes **`"rate_role": "unset"`**.

Neither is unknowable. `log_time` (00608) **returns the inserted/standing row**, and my §0 probe shows that
row carrying `rate_source:"none"` and `rate_role:"lead_designer"` — the server resolved a real role where
the event says "unset". The gateway throws the response away:
`SupabaseFieldWriteGateway.insertTimeEntry` is `try await client.rpc("log_time", params: request).execute()`
with no decode. HT-27 exists so the widget/intent decision rests on this data, and `rate_source` is the
property the rate-truth half of the program is measured by (`time_rate_unresolved` keys on the same value).
Fix: decode the RPC's returned row (or one field of it) and pass `rate_source` / the resolved `rate_role`
into both emits.
**Confidence: high on the omission, medium on the severity** — it is instrumentation, not behaviour, and no
dashboard consumes it yet.

#### W6-R3-10 · **NEW** — V4's stepper and billable toggle have never been measured at 390 in any of the three rounds, and the harness cannot reach them
`V4VisitReviewScreen.swift:316-330`'s whole `timeOffer` block is gated on
`if let projectID, !projectID.isEmpty, let ownerUserID`. I drove the deep link this round
(`-CaptureScreen V4.visit-review`, UDID `2AB2290B-…`, which **is** wired at
`CaptureDeepLink.swift:91-93`, contrary to `capture-shots.sh:49`'s "Not swept … the screen behind it is
wave 4" comment) and the screen rendered — but the sample visit the harness picks carries no project
routing, so the stepper, the billable toggle and the offer button were **absent from the AX tree**. The
screen is also excluded from `capture-shots.sh`'s matrix. So two controls this wave's own plan names
(HT-16's stepper, HT-11's toggle) are **compile- and unit-verified only** after three rounds. I have no
evidence they are wrong: `stepButton` there is `.frame(width: 44, height: 44)` inside the label, structurally
identical to H1's, which I measured at 45 × 45; and `Toggle("Billable").frame(minHeight: 44)` is structurally
identical to H1's `billableStep`, which I measured at 350 × 53.3. Closing it needs a fixture visit with a
`projectID`, or `V4.visit-review` joining the shots matrix with one.
**Confidence: high on the gap, low on there being a defect behind it.**

#### W6-R3-11 · **NEW half** — the `supabase/tests/field` directory has no `KNOWN_FAILURES.md` at all, so W6's own Done-when gate reports an unexpected red on every run
The red itself is **not W6's** and I reproduced its provenance: `field_capture_note_routing_test.sql`
FAIL 7f ("exactly five policies, got 9"); `select policyname from pg_policies where tablename='field_captures'`
returns nine, the four extra being `field_captures_studio_{select,insert,update,delete}`, and
`grep -rln field_captures_studio_select supabase/migrations/` points at exactly one file,
`00584_studio_comember_rls_sweep.sql` — on `main`, predating this program. W6 touches neither the table nor
the test (`git log -1 -- …note_routing_test.sql` → `73517449d`, not one of this branch's five commits).
**New this round:** `supabase/tests/field/KNOWN_FAILURES.md` **does not exist** (the `billing` directory has
one; `field` does not), so `run-sql-tests.sh` can never class this as expected and the plan's gate block will
report `unexpected-fail: 1` on every future run of this wave and every later one. Owed: a `KNOWN_FAILURES.md`
in that directory, or a program-ledger line, before the ship note is written.
**Confidence: high.**

---

### NOTES

- **W6-R3-12 — the new SQL test exercises a direct table INSERT, not `log_time`.**
  `time_entry_activity_travel_test.sql` case 6 writes through the table under
  `SET LOCAL ROLE authenticated`. The shipped Field path is the RPC. The `travel` CHECK is proven either
  way, so 00616's proof is not gapped; the wire the app actually uses is covered only by my §0 probes and
  the prior rounds', never by a committed test.

- **W6-R3-13 — `RouteSheetHeader`'s Close button measures 28.67 × 26.67 at 390** (and 48.33 × 44.33 at
  accessibility-XL, so it does grow with Dynamic Type). Pre-existing shared component, out of W6's scope,
  but it now sits on another new sheet. Recorded so it is not confused with W6-R3-01.

- **W6-R3-14 — the extra `field.log_time_queued` event is still emitted.** `LogTimeSheet.swift:359-363`,
  in addition to the canonical `time_entry_logged` which both drainers correctly emit **on landing**
  (`surface='field_sheet'` / `'field_visit'`, both skipped on the `existingTimeEntry` short-circuit so a
  replay does not double-count). Queued-vs-landed is a real distinction HT-27 might want, but the name is
  not on lane D's canonical list. **Ruling owed** — confirm or drop.

- **W6-R3-15 — V4's stepper still does not disable at its bounds.** `V4VisitReviewScreen.swift:336-349`
  clamps silently through `VisitReviewComposer.steppedMinutes`; `LogTimeSheet.stepButton` (`:189-203`) dims
  and disables. Cosmetic inconsistency between the wave's two new steppers.

- **W6-R3-16 — `FieldVisitCloseRecord` gained a column, which §7 said to leave alone.** Plan §7:
  *"`FieldVisitCloseRecord` is load-bearing and covered by ~30 tests — leave it alone"*. The implementer
  added `billable: Bool = true` and flagged it (`W6-impl.md` §4.1). I independently reach rounds 1 and 2's
  conclusion: the plan's next line is "create a **sibling**", the prohibition is against generalising the
  record into a two-queue shape, and HT-11 plus `log_time`'s raise-on-NULL-billable (which I probed live:
  `400 P0001 "p_billable must be stated (HT-11)"`) leave the close's answer nowhere else to live. Additive
  with a declaration default; `FieldVisitCloseRecordTests` was updated, not weakened.
  **Ratification still owed from the orchestrator, not a defect.**

- **W6-R3-17 — `VisitCloseOutboxDrainer` gained an `analytics` dependency.** A constructor change to the
  ~49-test proven visit-close class (`init` at `:27-34`). Additive, every call site is in
  `AppContainer.makeWriteLanes`, suites green; recorded only because §7's FS-44 language asks that the
  proven path be left alone.

- **W6-R3-18 — HT-13's "backdated mark" has no Field expression, and future days are barred.** The Field
  day picker (`LogTimeSheet.swift:230-236`) is bounded `in: ...Date()` and carries no mark at any age.
  Plan §7 asks for neither and the mark reads as the desk add row's job (W3), so this is scoped out rather
  than missing — recorded so nobody later reads Field's silence as the ruling being met.

- **W6-R3-19 — an unrecognised server `activity` renders as "Activity not set".**
  `SupabaseFieldHoursService.swift:134` does `activity.flatMap(FieldTimeActivity.init(rawValue:))`, so a
  value the enum does not know becomes the same honest-empty label HT-24 reserves for a genuinely unset
  one. All six 00616 values map today (`LogTimeSheetTests.everyActivityIsOneTheConstraintAdmits` pins the
  set against the CHECK), so this only bites if a future migration widens the CHECK without the enum.

- **W6-R3-20 — `myRateRoles` compares uuids as raw Swift Strings.** `SupabaseFieldHoursService.swift:71`:
  `if owners.first?.designerID == userID { return [.leadDesigner] }`. `CaptureOwnerIdentity`
  (`Specimen.swift:23-45`) lowercases on construction and PostgREST returns lowercase uuid text, so the
  designer short-circuit fires correctly today — but `SessionProviding.userID` returns the raw
  `user.id.uuidString` (UPPERCASE) in the `.needsWorkspace` branch, and only `open()`'s
  `ownerIdentity`-nil early return keeps that state away from this call. A case-folded compare (or a `UUID`
  compare) would remove the dependence. Not reachable today.

- **W6-R3-21 — `isLogging` is set true and false synchronously, so the primary's guard is one run loop
  wide.** `LogTimeSheet.swift:353-371` sets `isLogging = true`, writes, then sets `isLogging = false`
  *before* `coordinator.dismissSheet()`. The spinner therefore never renders, and a second tap landing
  during the sheet's dismissal animation would mint a **second** `entryID` and queue a **second** hour —
  `ON CONFLICT (id)` cannot dedupe two different ids. Leaving `isLogging = true` through the dismiss (it is
  torn down with the view) would close it. Rare, and this shape arrived with the r1 fix that correctly
  moved the dismiss off the network trip.
  **Confidence: medium** on the double-queue being reachable in practice.

- **W6-R3-22 — `HourRow.field` maps a NULL `billable` to `false` → "Not billable".**
  `SupabaseFieldHoursService.swift:135`. Unreachable today: the column is `is_nullable = NO DEFAULT true`
  (checked against the reset catalog). Recorded only because the sibling guards on the same line are
  written as "a shape change is an absence, not a lie", and this one is a lie rather than an absence.

- **W6-R3-23 — `LogTimeChipFlow.sizeThatFits` returns an unbounded width under an `.infinity` proposal.**
  `LogTimeSheet.swift:482-492`: `maxWidth = proposal.width ?? .infinity`, so an ideal-size query puts every
  chip on one row. Harmless in the observed hierarchy (a `VStack(alignment: .leading)` inside a
  `ScrollView` proposes a concrete width — measured correct at 390, 440 and accessibility-XL), and the
  layout is file-local by design ("a shared flow layout is a design-system decision, not this wave's").

- **W6-R3-24 — 00616's `ADD CONSTRAINT … CHECK` takes ACCESS EXCLUSIVE and full-scans `project_time_entries`
  on Strata.** The migration banner says so itself and correctly notes the new CHECK is strictly more
  permissive, so no row can fail it; the cost is the scan. Recorded for the deploy note, not as a defect.

- **W6-R3-25 — commit hygiene is clean.** Five commits, Conventional Commits only: `feat(time):` ×3 and
  `fix(time):` ×2, each with a body naming its rulings. `git show --stat` re-read for all five: every path
  is under `apps/mobile/Capture/**`, `supabase/migrations/00616_time_entry_activity_travel.sql`,
  `supabase/tests/field/time_entry_activity_travel_test.sql`, or — in the r2 fix commit alone —
  `packages/supabase/src/hooks/use-time-tracking.ts`. **No `supabase/config.toml` (still skip-worktree'd,
  `git ls-files -v` shows `S`), no `.env`, no `database.types.ts`, no seed file.** The regenerated
  `Capture.xcodeproj/project.pbxproj` (2888 lines of churn) and the two `.xcscheme` files (blueprint-id
  churn only) are committed and match a fresh `generate_project.rb` byte for byte.

---

## 2 · What I tried to refute and could not

| Claim under test | Verdict |
|---|---|
| **every W6 plan item present as specified** | ✔ **all present.** 00616 ✔ (catalog-resolving `DO` block, `conkey`-pinned not `LIKE '%(activity)%'`, LOOPed not `LIMIT 1`, named `project_time_entries_activity_ck`, six values + NULL + one-CHECK + running-timer-index postconditions); 00617 unused ✔; `LogTimeSheet` with project/stepper/activity/billable/day/role-chip ✔; `FieldCompanionActionID.logTime = "time.log"` ✔; 7th Browse tile ✔ (measured on screen); "My hours this week", own scope ✔; HT-16 stepper + billable toggle on V4 ✔ (present in source, unmeasured — W6-R3-10); `TimeEntryOutboxRecord` sibling ✔; `TimeEntryOutboxDrainer` sibling ✔; `log_time` RPC ✔; `TimeEntryWriteRequest` gains `billable` + settable `activity` + `rateRole`, no rate ✔; `CaptureStore.schema` 7→8 ✔; Widgets/ShareExtension grep ✔; **TS `field_manual` ✔ (r2's major, now fixed and gated)**. One ratified deviation (W6-R3-16). |
| **no flag** (P-5) | ✔ `grep -niE "featureFlag\|ComingSoon\|isFeatureEnabled"` over all 31 changed `.swift`/`.ts`/`.sql` files returns only pre-existing `AppContainer` infrastructure lines (wave 2's `CaptureFeatureFlags`), none added or consulted by W6 — the `AppContainer` diff adds no flag read. |
| **no dashboard / tab / badge / red-green / R69** | ✔ "My hours this week" is plain text; `grep -E "Color\.(red\|green)\|CaptureColor\.(red\|green\|danger\|success)"` over the changed set → **no match**; the Hours tile is `accessory: .none` and the live tree shows `"Hours"` with no count where siblings read `"Decisions, 2"`; the section heading passes `count: nil`. `grep -E "Timer\.\|TimelineView\|repeatForever\|scheduledTimer"` → **no match** — the pre-fill is one snapshot read and V4's `closedAt` is stamped once in `load()`, so `elapsedMinutes` cannot tick while she reads (R69). |
| **HT-26 — never a blank where a rate is pending** | ✔ for `rate_source='none'`: "Rate pending", pinned by `anUnresolvedRateSaysSoRatherThanGoingBlank` and seen on screen at 390. One honest-but-wrong case at NULL — W6-R3-06. |
| **HT-36 — notes never in any rollup** | ✔ W6 has no rollup, and I ran `myHours`'s exact select against the live stack: the returned payload carries **no `notes` key**. |
| **HT-11 — billable explicit at every capture surface** | ✔ both Field write paths state it: the sheet's toggle (`LogTimeSheet.swift:265-280`) and V4's new toggle (`:322-327`); `TimeEntryWriteRequest.billable` has no default; `log_time` raises on a NULL — **probed live: `400 P0001 "p_billable must be stated (HT-11) — there is no default"`**. `insertTimeEntry` has exactly two callers, both drainers, both passing an explicit answer. |
| **HT-41 — role chip only for multi-role members** | ✔ `FieldLogTimePolicy.showsRoleChip(roles.count > 1)`; `resolvedRole` drops an unheld pick; the designer short-circuits to one role. Measured at 390: **no `WHICH SEAT` section and no chips** on a single-role project, before or after picking. |
| **HT-7 — nothing in Field can hold the running slot** | ✔ `durationMinutes` is non-Optional in draft, record and request; floored to 1 in three places; **probed live: `p_duration_minutes: null` → `400 P0001 "must be a positive number of minutes"`**; 00616 re-asserts `uniq_project_time_entries_running_timer` as a postcondition and that assert ran on my reset; `myHours` filters `duration_minutes=gte.1`. |
| **the RPC sends no rate and matches 00608's signature** | ✔ `pg_get_function_arguments` read from the reset catalog matches `CodingKeys` name-for-name; `hourly_rate_cents` came back NULL and `rate_source='none'` server-side; `TimeEntryOutboxRecordTests.theRequestIsTheLogTimeArgumentList` asserts `p_user_id`, `user_id`, `p_hourly_rate_cents` and `hourly_rate_cents` are all absent from the encoded JSON. |
| **the outbox record is client-minted and replay-safe** | ✔ `@Attribute(.unique) entryID`, never regenerated, carried into every request; the pre-write `existingTimeEntry` probe closes the response-loss gap one round trip before `ON CONFLICT` does; **a live replay under the same id returned the identical row with the original `created_at` and `SELECT count(*)` = 1**. |
| **the stepper default equals visit start → last Specimen** | ✔ `VisitReview.swift:89-97` reads `ordered.last?.createdAt` off the array `summarize` sorts ascending (`VisitReviewRow` **is** a Specimen — keyed on `specimenID`), clamped `[1, elapsed]`. `elapsedMinutes` kept, all 19 pre-existing assertions untouched; six new `VisitReviewTests` cover the 3h/20min case (`activeMinutes == 20`, `elapsedMinutes == 180`), the no-capture case and both clamp directions. `offeredMinutes` is seeded once in `load()` *after* `refreshRows()` and never re-seeded. |
| **the collapsed companion strip keeps its one slot** (MOB-11 / Invariant V) | ✔ `logTime` is offered only as `.communicate`'s `secondaryAction` (`RootView.swift:239`, a slot that was previously nil — `grep secondaryAction` shows no displaced user), and `.communicate` maps to `.expanded` (`FieldCompanionPresentation.swift:260-261`, read directly). Pinned by the new `loggingAnHourNeverTakesTheCollapsedStripsOneSlot`, which walks all three band states. |
| **data access through the right seam** | ✔ for iOS conventions: writes through `TimeEntryGateway`, reads through the new `FieldHoursService` protocol with a mock conformer; no ad-hoc client in a view. (The `@patina/supabase` hook rule is a portal rule and this wave renders no portal surface — which is also why the `DATA_MODE=live` check has no target here; its iOS analogue is W6-R3-05.) |
| **the mock fallback cannot mask a broken query** | ✖ not satisfiable in this lane by a gate — W6-R3-05. Closed by hand this round with live probes of all three queries. |
| **every new/changed control reachable at 390 and 1440** | ✔ at 390 and at the 440pt wide end for every H1 and W1 control (table in §0), including a Dynamic-Type pass no prior round ran. 1440 does not exist on this surface. **Two V4 controls remain unmeasured** — W6-R3-10. |
| **accessibility basics** | Mostly ✔ — every act carries an `accessibilityLabel` or a readable label, selected chips carry `.isSelected`, the Day row carries a label and a hint, the duration reads "Duration 30m", the toggle exposes `AXValue`. One gap: the note field's null `AXLabel` (W6-R3-01). |
| **`capture-gate.sh all` green** | ✔ tail pasted in §0; exit 0. The six suites the plan names were re-run verbosely and all passed (808 tests / 75 suites). |
| **commit hygiene per `git show --stat`** | ✔ W6-R3-25. |

## 3 · What I did NOT verify

- **No device pass.** P-6 puts it with Kody; every claim above is **sim-verified**. The airplane-mode drain
  walk (log a drive → kill the app → reconnect → `SELECT` the row) is **unverified** and must be said so in
  the ship note. The Simulator runs `AppConfiguration.runsRealServices == false`, so the walk I drove
  exercised the durable local write and a mock drain; the PostgREST leg was proved separately by the §0
  probes, never end-to-end from the app.
- **V4VisitReviewScreen's new stepper and billable toggle were not measured** — see W6-R3-10 for why the
  harness could not raise them.
- **Prod was not touched.** 00616's behaviour on Strata's catalog (whether exactly one CHECK is keyed on
  `activity` there) is asserted by the migration's own postcondition, not by me.
- **The portal, the edge functions, and every other lane's migrations.** I ran the `field` and `billing` SQL
  directories only.
- **`capture-gate.sh`'s `lint` tier** is swiftlint `--strict` on this tree; I did not audit which rules
  resolve. Per `patina-verification`, lint outside designer-portal is not a signal I would report as clean.
- **No root `pnpm` turbo sweep.** I ran the two named package gates directly
  (`@patina/supabase type-check`, `@patina/admin-portal build`) rather than a sweep that silently skips.
- **PostHog itself.** I read the emit call sites; no event was observed landing in PostHog.
