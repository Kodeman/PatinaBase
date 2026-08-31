# Field Companion · Wave 4 — fix ledger (adversarial review: MERGE-WITH-FIXES)

Branch `feat/field-companion-w4` · worktree `.claude/worktrees/field-companion-w4` · base `d4589eaa1`.

Every id below is the adversarial review's own. Two implementer streams ran concurrently on disjoint
trees (SQL + designer portal; `apps/mobile/Capture`); the conductor held `writer.lock.d` throughout and
made every commit, so neither stream raced the index.

## Must-fix

| # | Landed | What was done |
|---|---|---|
| **P-1** | ✅ | `00543` now carries `grant select on public.field_captures to authenticated`. **No migration in the repo had ever granted anything on that table** — `00233` created it under the pre-2026-05-30 creation-time defaults. Since `margin_items` is `security_invoker` and the note branch LEFT JOINs `field_captures`, an absent prod grant 42501s **every margin kind** for that designer, not just the note. Proven by a real falsifier, not an assertion: SQL case 8a revokes the grant inside the rolled-back transaction, asserts the whole `margin_items` read raises 42501 as `authenticated`, re-grants, and asserts the note comes back. |
| **P-2** | ✅ | `00545`'s `SAVEPOINT` → `INSERT INTO auth.users` → `ROLLBACK TO SAVEPOINT` block is gone. The postcondition now resolves `project_time_entries_source_ck` by **`conkey` pinned to the `source` column's `attnum`** — not a text match, because Postgres canonicalizes `source IN (…)` to `CHECK ((source = ANY (ARRAY[…])))` and the literal `(source)` never appears in the definition — and raises unless **all four** admitted values are present. That is strictly stronger than the removed block, which only ever proved one INSERT shape. `auth.users` now appears nowhere in the file but one explanatory comment; the behavioural INSERT moved to the test, where the transaction rolls back and fixtures are cheap. |
| **I-1** | ✅ | `CaptureStore` gains `visitCloseOutbox()` / `visitCloseOutbox(owner:)`, mirroring `outbox(owner:)`; `VisitCloseOutboxDrainer.due(at:)` resolves `CaptureOwnerProjectionPolicy` — the same policy its own `captures(for:)` uses — and fetches scoped. The record carries only a user id (it becomes `project_time_entries.user_id`, which has no workspace half), so the match is user-id only, normalised the way `CaptureOwnerIdentity` normalises. Test: a foreign owner's close is never handed to the drainer, and her own is still found through an upper-cased owner id — which a case-sensitive compare would have quarantined. |
| **I-2** | ✅ | `V4VisitReviewScreen` takes `visitCloseDrainer` from `container.visitCloseOutboxDrainer` and calls `resumeCloseOutbox()` after `logTheHours`, the `SiteRequestScreens.swift:1168` shape. It also refreshes `closeState` when the drain returns, so the button reflects what actually happened. **Untestable — see the coverage note below.** |
| **W-1** | ✅ | `fmtDay` tries the visit's zone and falls back to the reader's own on throw. The hazard is real and was confirmed, not assumed: `toLocaleDateString('en-US', { timeZone: 'Not/A_Real_Zone' })` raises `RangeError`, and the `/doc/[id]` route group has no error boundary — one device-supplied string took down the whole spread. Two tests (garbage zone, empty-string zone); W4-C11's behaviour for valid zones is untouched. |
| **W-3** | ✅ | `00543` emits `'body', case when n.field_capture_id is not null then n.body else null end`. **`margin-bodies.tsx` needed no change**: `readFieldNotePayload` already reads `str(p.body) ?? row.title`, so a null payload body makes `field.body === row.title` — byte-identical to the pre-wave `body: row.title` and `seed.description: row.title` (checked against `97f728f15`). W4-C8 is honoured: a typed desk note escalates and amends on its 80-char title exactly as before. Both branches pinned, in SQL (`FAIL 5g`) and in the existing jest suite (escalation body and amendment seed are the title; a negative assertion proves the full body is never forwarded). |
| **I-4** | ⛔ **GAP RECORDED — Kody's ruling owed** | Not wired. The spec is genuinely silent and the plan conflated two screens. Full evidence and the two candidate rulings are in `wave-4-ledger.md` under *"I-4 — the three verbs ship on a screen no shipping build can open"*. Headline: `CaptureSheet.smartGuessCard` has exactly one presenter, `CaptureDeepLink.swift:102`, behind `guard verificationHarnessAllowed` — which is `#if DEBUG true #else !AppConfiguration.runsRealServices #endif`, i.e. **`false` in a shipping build**. §7.5's "C3 quick-confirm card" is `CaptureCardOverlay`, not `SmartGuessSheet`; the package names `SmartGuessSheet` once, at `:531`, and names it as *"the N5 sheet the photo path never opens"*. No wave is given the job of opening it. Inventing a mount would be inventing UX on the app's hottest surface under a fix brief. |
| **I-14** | ✅ | `LocalCaptureSyncService.enqueue` only stamps `.queued` when `!specimen.hasConfirmedCaptureReceipt`, reusing the predicate `isFieldWriteLaneOnly` already keys on. No new state invented. Fixed even though I-4 keeps it latent, so whenever the mount lands it is not landing on top of this. **Untestable — see below.** |

## Hygiene

| # | Landed | What was done |
|---|---|---|
| **W-5** | ✅ | Clean local reset against `postgresql://…@127.0.0.1:54322/postgres`, `linked_project: null`. **No stray tables** — 379 public tables pre and post, `comm` diff empty both directions. Types regenerated from the local stack: **+20 lines, exactly** `margin_notes.field_capture_id`, `project_tasks.field_capture_id` and their two FK entries. All three casts removed. One substantive discovery: `VISIT_CAPTURE_SELECT` was a **runtime concatenation**, which widens to `string`, and supabase-js then types the read as `GenericStringError[]` — so the cast could not come off until it became a single literal (byte-identical value; the exported-string tripwire test still passes). ⚠ The `use-section-work.ts` removal is **cosmetic**: `getSupabase = () => createBrowserClient() as any` at `:32` is pre-existing and file-wide, so `data` is still `any` there. Genuinely typing that hook means removing the module-level cast, which touches every hook in the file — out of scope, not done. |
| **W-6** | ✅ | Seed regenerated (1981 → 1982 statements). **The first regeneration was a no-op, and the reason is a latent bug worth carrying:** `generate-legacy-grants.py`'s `clean()` strips dollar-quoted bodies *before* comments, and `00543`'s header **prose** contained a literal `$postcondition$` token. It paired with the real block 400 lines below and swallowed the entire view definition — which is why `00543`'s two pre-existing `margin_items` grants had never reached the seed either. Prose token reworded. **Second finding: the script's `STMT` regex has no `re.IGNORECASE`, so a lowercase `grant`/`revoke` is invisible to it.** The new grant is written uppercase for that reason. **Owed to Kody: both are script bugs, not wave bugs.** |
| **W-4** | ✅ | All three tests now switch role, using the `pg_temp.assume_user` + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` idiom from `extension_execute_authenticated_test.sql`. Every pre-existing case untouched and green. Margin case 8 is the P-1 falsifier above, plus full-body-survives-RLS and `capture_visible`; punch case 7 has the designer insert and read back her own item, join the capture through `field_capture_id`, and a second designer read zero rows; time-entry case 6 has the designer insert a `field_visit` entry, a garbage source still raise `check_violation` under RLS, and a second designer read zero rows. |
| **W-2** | ✅ | `meta: { errorSurface: 'silent' }` on both hooks, matching the `queryMeta` Register at `react-query.ts:21-34` and the existing shape at `use-clients.ts:226`. |
| **I-8** | ✅ | `reset()` no longer removes `pendingEndsKey`; the open context still goes. Each notice carries its own identity and `takePendingVisitEnds` hands back only the caller's, so a close reaped seconds before a sign-out survives to be emitted. Test: context gone, notice still drainable with its original `visitID`. |
| **I-7** | ✅ | Two bugs, two fixes. (a) `prefix(8)` → `suffix(8)`: keeping the oldest meant that once eight closes queued, **every close after them was dropped for good** — the queue froze on the first eight and no later visit could reach a dashboard. The comment that justified keeping the oldest is replaced with the reason it was wrong. (b) `pendingVisitEnds()` decodes through a file-private `LenientVisitEndNotice` wrapper (`try?` per element) and `compactMap`s, so one malformed neighbour no longer strands the other seven. Both tests fail against the old code. |
| **I-10** | ✅ | New `FieldWriteClassifier.cancellationOutcome(for:)` returns `.deferred` for `CancellationError` and `URLError.cancelled`, nil otherwise; the drainer's catch tries it before the code/message classifier. `.deferred` → `.pending`, `nextAttemptAt = nil`, no `retryCount` bump. Tests include a **falsifier** pinning that the old classifier alone reached `.failed`, plus `retryCeiling + 1` cancellations leaving the record `.pending` at `retryCount == 0` and still due. |
| **I-12** | ✅ | New `VisitReviewComposer.timeOfferEnabled(closeState:)`: live for nil / `.pending` / `.failed`; dead for `.writing` (in flight) and `.written` / `.refused` / `.unwritable` (terminal), consistent with I-10's semantics. A tap on a standing retryable record now kicks the drainer, so "retry" actually retries. Copy unchanged. The third test asserts the button against the record's own `isDue` rather than a second hand-written list, so the two cannot drift (`.writing` is the one declared divergence). |
| **I-11** | ✅ | All three lanes re-check `activeOwner == owner` after the network await in **both** the success and catch arms and mark the lane `.pending` rather than applying the outcome; each lane's entry guard re-checks too, so a switch during the note's await cannot send the punch item on the new account's JWT (the lanes run in sequence). This is the file's own convention — `commit`, `route`, `drainOwned`, `requireActiveOwner`. **Untestable — see below.** |
| **I-5** | ✅ | Behaviour unchanged — the deliberate, ruled, tested re-open stands. `PunchCourtCopy.punchFiledMenuRow = "Punch item filed — file another?"` added in CaptureKit beside the menu's other pinned strings; the verb menu renders it as `Label(…, systemImage: "checkmark").labelStyle(.titleAndIcon)` — the note branch's exact shape at `:82` — above the still-present punch Button, gated on `punchTaskState == .written`. The **existing** test was extended rather than a parallel one added. |
| **I-13** | ✅ | `paired` is `@State`, computed once in `load()` (it fed four computed properties, each re-evaluated per body pass). `playableSegments` — the per-row `resourceValues` filesystem stat — is likewise cached at load. Thumbnails moved to a per-row `.task(id:)` decoding on `Task.detached(priority: .utility)` into a `[UUID: UIImage]` cache; the body only reads the dictionary. No local-file async-image idiom existed (`AsyncImage` is remote-only), so this follows the `.task(id:)` pattern already in `SyncStatusScreen`/`RootView`. Rendering unchanged. |
| **Keyword wart** | ✅ | `SmartGuessKeywords.category(forVisionLabel:)` no longer returns the first matching row. Every row is matched and the winner is the one reaching **furthest into the label** — the head of an English compound noun is its last word — ties broken by longer keyword run, then table order. `containsWholeWordMatch` became `lastWholeWordMatchEnd(for:) -> Int?`; whole-token matching, the s/es plural rule and the single-word compound rows are untouched. The assertion that called `"table lamp" == .table` correct is rewritten to demand `.lighting` for `"table lamp"` **and** `"desk lamp"`, *and* to assert that `table` still sits above `lamp` in the table — so the test is made against the very row order that used to decide it. `bookshelf` → `.storage` and `spotlight` → `.lighting` (the W3 restorations) still pass. |

## ⚠ Four fixes ship with no test, and the reason is structural

**I-2, I-11, I-13, I-14 have no test because the app target has no test host.** `CaptureTests` is a
`unit_test_bundle` that declares `tests.add_dependency(kit)` and links **CaptureKit alone**
(`scripts/generate_project.rb:161-186`); every file in it is `@testable import CaptureKit`. Nothing
under `Capture/` — `LocalCaptureSyncService`, `VisitCloseOutboxDrainer`, `V4VisitReviewScreen`,
`SmartGuessSheet` — is reachable from a test at all. This is the ledger's own **C1** finding, and it
is why a 719/719 suite is not evidence that a row lands.

Where a decision could honestly be lifted into CaptureKit it was, rather than left unproven: **I-1**
(store scoping), **I-10** (classifier + orchestrator), **I-12** (composer rule) and **I-5** (copy
constant) are all covered. What remains app-side is wiring, one guard clause, three owner re-checks
and a view-performance change — and for those **the wave's device pass is still the only evidence.**

## Gates

| Gate | Result |
|---|---|
| `capture-gate.sh build` | ✔ build · exit **0** |
| `capture-gate.sh test` | ✔ tests — **719 tests in 70 suites, all passed**, `** TEST SUCCEEDED **` · exit **0** |
| `capture-gate.sh lint` | ✔ lint · exit **0** |
| `capture-gate.sh fcr3` | ✔ fc-r3 sweep (inbox) + (ai) · exit **0** |
| `capture-gate.sh p4` | ✔ principle-4 sweep · exit **0** |
| `swiftlint --strict` | **0 violations, 0 serious, 255 files** · exit **0** |
| `pnpm type-check` | **30 successful / 30 total** |
| `pnpm --filter @patina/supabase test` | **77 files · 908 passed / 12 skipped (920)** |
| Targeted designer-portal jest (7 touched suites) | **7 suites / 71 tests passed** |
| Wider jest (`components/document`, `hooks`, `lib/document`) | **375 suites / 4556 tests passed** |
| `scripts/run-sql-tests.sh` (full, after clean reset) | **142 total / 120 green / 22 expected-fail / 0 unexpected** — `127.0.0.1:54322`, no `--linked` anywhere |
| `pnpm --filter ./apps/designer-portal lint` | 2 errors / 200 warnings — both errors the documented baseline; warnings **−1** |

The SQL count matches the wave's documented baseline exactly, so the three new role-switched cases and
the P-1 falsifier landed without disturbing anything.

## New process findings

- **`xcodebuild` and `swiftlint` both need the sandbox disabled here.** The sandbox blocks the
  `CoreSimulatorService` XPC connection and SwiftLint's plist cache write. Run sandboxed,
  `capture-gate.sh lint` exits 1 with a permissions error that is **not a lint failure** — the same
  false-signal shape as the ledger's `pnpm lint --filter designer-portal` finding. Worth recording
  beside the existing tool-cap note.
- **`generate-legacy-grants.py` has two bugs** (see W-6): dollar-quote stripping runs before comment
  stripping, so a dollar-quoted token in *prose* swallows everything to the next matching token; and
  the statement regex is case-sensitive. Owed to Kody.
