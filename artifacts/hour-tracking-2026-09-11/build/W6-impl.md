# W6 — Patina Field: an hour that is not a visit (lane C)

**Branch** `hour-tracking/ios` · worktree `.codex/worktrees/agent-ios` · pushed
**Commits** `f0d9203a1` (00616) · `d3427256f` (the sheet, the queue, the wire) · `2e9651baf` (HT-16)
**Base** merged `origin/hour-tracking/integration` clean, fast-forward, no conflicts.
**Claim level** **sim-verified** throughout (P-6). No device pass was run; the airplane-mode drain walk is Kody's.

---

## 1 · The migration

`supabase/migrations/00616_time_entry_activity_travel.sql` — HT-19.

The `activity` CHECK has admitted `design / sourcing / client / site_visit / admin`
since `00198:27-29` and nothing else, so a field worker's drive had to be logged
as one of those or not logged. 00198's CHECK is **inline and unnamed** — unlike
`source`, whose name `project_time_entries_source_ck` 00545:148 bought — so this
follows `00545:33-43`'s resolve-by-content precedent verbatim:

- `conkey`-pinned to the `activity` column, never a `LIKE '%(activity)%'` text
  match (Postgres canonicalizes `IN (…)` to `= ANY (ARRAY[…])`, so that pattern
  matches nothing and turns every apply into the "could not find" raise);
- **LOOPed, not `LIMIT 1`** (00545's F3 — a duplicated twin would survive and go
  on rejecting `travel` after the ADD appeared to succeed);
- then a deliberately **NAMED** `project_time_entries_activity_ck`, so the next
  widening is one line.

Postconditions probe the catalog, not the ledger (§0.2a): keyed on `activity`,
all six values asserted **by name** (a widening that narrowed something else is a
regression), `NULL` still admitted (HT-24's honest "activity not set"), **exactly
one** CHECK on the column, and the one-running-timer index still standing (§0.11).

`00617` left unused, as the plan reserves.

**No GRANT/REVOKE in the file** → the ACL seed is unchanged. Regenerated anyway
from the worktree's own copy (§0.20) — byte-identical, 2643 statements.
`pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts`
**clean**: a CHECK does not reach the generated types.

## 2 · The Swift

| File | What |
|---|---|
| `CaptureKit/…/Domain/FieldLogTime.swift` **new** | `FieldTimeActivity` (6 values = 00616's set, asserted), `FieldRateRole` (4 = 00600's set, asserted), `FieldLogTimeDraft` (pre-fill, clamped stepper, `record(entryID:ownerUserID:)`), `FieldLogTimePolicy` (role-chip + role-resolution) |
| `CaptureKit/…/Domain/TimeEntryOutboxRecord.swift` **new** | the queue. Sibling of `FieldVisitCloseRecord`: same `@Attribute(.unique)` client-minted key, byte-identical `retryDelay`, same ceiling, same terminal states. `TimeEntryOutboxOrchestrator` (drainable / apply / request) + `FieldTimeSource` |
| `CaptureKit/…/Domain/FieldHours.swift` **new** | `FieldHourRow`, `FieldHoursWeek` (Monday-first week, total, honest labels), `FieldHoursService` protocol |
| `CaptureKit/…/Domain/FieldVisitCloseRecord.swift` | **one additive column, `billable` (default true)**, and `TimeEntryWriteRequest` re-shaped to `log_time`'s argument list |
| `CaptureKit/…/Session/VisitReview.swift` | `activeMinutes` (+ `steppedMinutes`, `stepMinutes`); `elapsedMinutes` kept and unchanged |
| `CaptureKit/…/Companion/FieldCompanionPresentation.swift` | `FieldCompanionActionID.logTime = "time.log"` |
| `CaptureKit/…/Navigation/CaptureNavigation.swift`, `RouteRegistry.swift`, `Support/CaptureScreenID.swift` | `CaptureSheet.logTime`, its registry key, `screen.H1.log-time` |
| `CaptureKit/…/Persistence/CaptureStore.swift` | `TimeEntryOutboxRecord.self` in `schema` (7 → 8) + `timeEntryOutbox()` / `timeEntryOutbox(owner:)` |
| `Capture/Features/Time/LogTimeSheet.swift` **new** | H1. Thin renderer + `TimeScreens` registrar |
| `Capture/Features/Session/TimeEntryOutboxDrainer.swift` **new** | the sibling drainer (the visit-close one is left doing its one job — FS-44) |
| `Capture/Features/Session/VisitCloseOutboxDrainer.swift` | passes `record.billable`; emits `time_entry_logged` on landing |
| `Capture/Features/Session/V4VisitReviewScreen.swift` | HT-16 stepper + billable toggle, seeded from `activeMinutes` |
| `Capture/Features/Work/WorkDashboardScreen.swift` | the **7th** Browse tile + "My hours this week" |
| `Capture/Features/Root/RootView.swift` | `logTime` in `handleCompanionAction`, the expanded secondary action, the once-per-owner drain |
| `Capture/Services/Time/SupabaseFieldHoursService.swift` **new** | own-scope hours read + `myRateRoles` |
| `Capture/Services/Sync/SupabaseFieldWriteGateway.swift` | `client.rpc("log_time", …)` in place of the table insert |
| `Capture/App/Composition/AppContainer.swift`, `ScreenRegistry.swift`, `App/DeepLinking/CaptureDeepLink.swift` | wiring |
| `CaptureKitMocks/WorkMocks.swift` | `MockFieldHoursService` + `WorkFixtures.hours` |
| `scripts/capture-shots.sh` | `H1.log-time` joins the sweep matrix |

**Tests** (CaptureKit scheme): `TimeEntryOutboxRecordTests` (new, 13),
`LogTimeSheetTests` (new, 22), `CaptureStoreMigrationTests` (new, 3),
`VisitReviewTests` (extended 19 → 25), plus two existing suites updated for the
new shapes (`FieldVisitCloseRecordTests`, `FieldCompanionPresentationTests`).

## 3 · Gates, verbatim

```
supabase db reset --workdir …/agent-ios
  → "Finished supabase db reset on branch main." (clean)

scripts/run-sql-tests.sh -d …/agent-ios/supabase/tests/field -H 127.0.0.1 -p 54422
  total: 7 · green: 6 · unexpected-fail: 1
  PASS time_entry_activity_travel_test.sql        (new — 00616's proof)
  PASS time_entry_field_visit_source_test.sql     (existing, unchanged, still green)
  FAIL field_capture_note_routing_test.sql        ← PRE-EXISTING, see §5

ruby …/apps/mobile/Capture/scripts/generate_project.rb
  CaptureKit: 111 · CaptureKitMocks: 3 · Capture(app): 149
  referenced-path delta = exactly the 9 new files; Secrets.swift still referenced

…/apps/mobile/Capture/scripts/capture-gate.sh all
  ✔ build  ✔ tests  ✔ lint  ✔ fc-r3 sweep (inbox)  ✔ fc-r3 sweep (ai)
  ✔ principle-4 sweep

pnpm --dir …/agent-ios db:generate  → git diff --exit-code database.types.ts: CLEAN
python3 …/agent-ios/scripts/generate-legacy-grants.py → 2643 statements, no diff
```

### The behaviour probe the gate does not cover

`log_time` called against the isolated local stack (`127.0.0.1:54421`) with the
**exact body `TimeEntryWriteRequest` encodes**, as an authenticated field worker
(minted JWT, anon apikey) — this is what catches a renamed argument, which
PostgREST answers with a silent 404 rather than a type error:

| Probe | Result |
|---|---|
| the drive (`p_source=field_manual`, `p_activity=travel`, `p_billable=true`, 45m) | **HTTP 200**; `SELECT` → `field_manual / travel / t / 45`, `user_id` from `auth.uid()`, `hourly_rate_cents` NULL (server-owned), `rate_source='none'` |
| the SAME body replayed under the same client-minted id | **HTTP 200**, and still **one** row — 00608's `ON CONFLICT (id) DO NOTHING` + read-back |
| the visit-close body (`field_visit` / `site_visit`, `p_billable=false`) | **HTTP 200**, `billing_state='nonbillable'` |
| `p_rate_role='bookkeeper'` for a member who does not hold it | **400 / 23514** "rate_role bookkeeper is not a role this member holds" — which `FieldLogTimePolicy.resolvedRole` prevents from ever being sent |

Probe rows deleted afterwards.

Visual: `capture-shots.sh H1 W1` — the sheet renders at iPhone 17 width, every
act ≥ 44 pt, the primary reads "Log 30m" and is dimmed while no project is
picked.

## 4 · Decisions a reviewer should look at

1. **`FieldVisitCloseRecord` gained one column.** The plan says "leave that record
   alone"; I read that as *do not reshape it into a two-queue record* (its next
   line is "create a sibling"), and HT-16's billable toggle + HT-11's
   raise-on-NULL leave the answer nowhere else to live. It is additive with a
   declaration default — the thing that keeps the SwiftData open a lightweight
   migration — and `CaptureStoreMigrationTests` is the assertion that it stayed
   one. **Flagging it rather than burying it.**
2. **`TimeEntryWriteRequest`'s wire keys moved to `p_*`.** Forced by the plan's own
   `client.rpc("log_time")` row. Two assertions in `FieldVisitCloseRecordTests`
   moved with them; nothing else in that file changed.
3. **`userID` is no longer on the wire.** `log_time` takes the author from
   `auth.uid()`. The property stays because the drainer's "can this ever land"
   guard is what it expresses.
4. **`CaptureStoreMigrationTests` cannot simulate the property half of FS-45.** Two
   `@Model` types with one SwiftData entity name is the only way to express two
   versions of a table in one build, and SwiftData resolves entities by name
   process-wide — so such a pair passes or fails on test *order*
   (`CaptureStoreLadderTests` already documents this and guards the property case
   with `everyMandatoryAttributeCarriesADefault`). What the new suite proves is
   the **entity** half, against the real ladder: a store written by the previous
   7-model schema opens under the 8-model one with
   `didResetIncompatibleStore == false`, keeps its standing close, and reads
   `billable == true`.
5. **Collateral, all inside files I was already editing, all to stay under
   swiftlint `--strict`:** `makeSyncAndDrainer` → `makeWriteLanes` returning a
   struct (a 4-tuple trips `large_tuple`); the mock-seam assignments folded onto
   `;` lines the real branch already uses (`function_body_length`); and
   `CaptureDeepLink`'s four onboarding cases moved into a helper (same).
6. **`CaptureSheet` / `CaptureScreenID` / `CaptureRoute` are declared frozen
   foundation-owner seams.** Wave 4 added `.visit` the same way; this adds
   `.logTime` and `screen.H1.log-time` with the same kind of comment.
7. **"My hours this week" is scoped `.eq("user_id", me)` on purpose** (MOB-8), and
   the code says so in both the service header and the section comment. RLS would
   permit a studio co-member to read more; the surface chooses not to.

## 5 · The one red, and it is not this wave's

`supabase/tests/field/field_capture_note_routing_test.sql` — **FAIL 7f:
"field_captures should carry exactly five policies, got 9"**. It reads
`pg_policies` for `field_captures`; nothing in W6 touches that table, and the
file is untouched on this branch. It is a pre-existing drift from the earlier
studio-RLS sweeps and is **not** in that directory's `KNOWN_FAILURES.md`, so it
reports as unexpected. Not repaired here (out of W6's scope); worth a line in the
program's own ledger.

## 6 · Owed / not done here

- **The device pass** — P-6 puts it with Kody. The airplane-mode drain walk (log a
  drive → kill the app → reconnect → `SELECT` the row) is **unverified** until he
  runs it. Say so in the ship note.
- `CaptureWidgets` / `CaptureShareExtension`: already absent from this worktree
  and from `project.pbxproj` (empty directories are not tracked), so the plan's
  `grep` Done-when is already true and there was nothing to delete.
- `00620` (the one-off legacy studio stamp) arrived on the integration branch with
  W2 and is not W6's.
