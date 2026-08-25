# SDD ledger — plan: docs/design/field-companion/field-companion-plan.md (§8, Tasks 1–18)

Conductor: Wave 1 (Field Companion). Worktree `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w1`,
branch `feat/field-companion-w1`, merge-base `a72d59f326064feef159148ef9ee174434222156` (origin/main).
Spec: `docs/design/field-companion/field-companion-package.md`. Rulings: `docs/design/field-companion/field-companion-rulings.md`.

## Setup facts

- `docs/design/field-companion/` is **untracked** in the main checkout — copied into the worktree (untracked there too, never committed).
- `Secrets.swift` (gitignored) copied from the main checkout into the worktree.
- swiftlint 0.63.2 present at /opt/homebrew/bin/swiftlint → `capture-gate.sh all` DOES run lint here; still run `swiftlint lint --quiet --strict` explicitly per C2.
- Simulator `iPhone 17` exists (capture-gate default).
- `.superpowers/` is gitignored (.gitignore:106).

## Preflight scan — cross-task table

| Shared file / interface | Producer | Consumer(s) | Finding |
|---|---|---|---|
| `CaptureMediaMime` (new, CaptureKit/Sync) | T4 | T5 test, T9.1 | Clean — plan order 4→5→9 satisfies it |
| `VoiceRecordingPolicy` (new, CaptureKit/Recognition) | T5 | T8.4 (`shouldRotate`, `shouldEnd`, `segmentFilename`) | Clean |
| `VoiceNoteResult.audioSegments/.onDevice` | T6.3 | T8.5, T14.2, T15.1 | Clean |
| `Specimen.voiceAudioSegmentsRaw / RemotePathsRaw / TranscriptSourceRaw / captureKindRaw` | T6.4 | T8.6, T9.2, T15.3, T16.1 | Clean |
| `CaptureStore.missingRequiredMedia` segment exemption | T6.6 | T9.2 (remote-path stamping), T16.1 (safe delete) | Clean |
| `SpeechVoiceNoteService.swift` | T8 (rewrite) | T17.1 (`voice.start`/`voice.finish`) | **P-1 CONFLICT** — both emit `voice.finish` with disjoint property sets. Ruling below. |
| `SpeechVoiceNoteService` analytics/surface | — | T8.4 + T17.1 both call `analytics.event(...)`, `surface` | **P-2 DEFECT** — the type has NO `analytics` property and no `surface`; init is `init(mediaDirectory: URL? = nil)`. Ruling below. |
| `VoiceNoteSheet.swift` | T8.6 | T15.1/15.2, T17.2 | Clean (sequential) |
| `SiteScanContextCapture.swift` | T8.6 | T14.2, T17.2/17.3 | Clean (sequential) |
| `V1SessionTrayScreen.swift` | T12.2 | T15.3 (play control on tray row) | Clean (12 before 15) |
| `ViewfinderModel.swift` | T7.4 | T11.3, T13.3, T17.3 | Clean (sequential) |
| `ViewfinderScreen.swift` | T11.3 | T13.3 | Clean |
| `LocalCaptureSyncService.swift` | T9 | T16.1 | Clean |
| `Capture.xcodeproj/project.pbxproj` | every task | every task | Clean — regenerated per task; dispatches are strictly sequential |
| `docs/engineering/migration-number-reservations.md` | T1 | T10.8 | T10 parked; T1 lands the doc alone |
| `field_capture_note_routing_test.sql` | T10.2 | T18.2 | T10 parked → T18.2 SQL gate not runnable; recorded as not-exercised |

## Preflight scan — per-task self-consistency

| Task | Tests vs code | Files created vs later touched | Finding |
|---|---|---|---|
| 1 | n/a (docs) | reservations doc only | Census re-run: matches plan **except** `grep -rl commit_field_capture supabase/migrations` returns `00235` only (plan expected `00233`+`00235`). 00233 creates the table/policies, not the function. Not a stop. |
| 2 | no unit test; gate = PostHog rows from an installed build | AppConfiguration + generate_project.rb + Secrets.example | 2.5/2.6 are device+PostHog steps → deferred to the T18 device pass |
| 3 | 2 tests match the protocol change | CaptureAnalytics.swift verified present, `identify` defaults present as described | Clean |
| 4 | `bucketAllowed.count == 10` vs 10 literals listed | new file | Clean |
| 5 | 4 tests; `segmentFilenamesCarryAnAllowedMime` needs T4 | new file | Clean given order |
| 6 | 10 tests; `Specimen()`, `CaptureStore.inMemory()` both verified to exist | 4 CaptureKit files | Clean |
| 7 | `CaptureRoutingMemory` init + `.empty` + `VenueStamp` init all verified byte-compatible with the test | extension placement note verified (`.empty` at :46, struct closes :47) | Clean |
| 8 | **no unit test by design (C1)** | needs analytics+surface it does not have | **P-2** |
| 9 | no unit test | return-type change `String?` → `[String]` ripples to the payload call site (9.3 covers it) | Clean |
| 10 | SQL test specified | **HELD** — no file under supabase/migrations | Parked by standing order |
| 11 | no unit test | `CaptureType.caption` warning already in plan | Clean |
| 12 | no unit test | Clean | Clean |
| 13 | no unit test | new FieldReachability.swift; `OfflineQueueBanner` verified at Capture/Features/Resilience/ | Clean |
| 14 | no unit test | depends on `result.audioSegments` (T6) | Clean given order |
| 15 | no unit test | new VoiceSegmentPlayer.swift | Clean |
| 16 | `MediaRetentionPolicyTests` boundary | **sweep implementation unspecified** | **P-3** — ruling below |
| 17 | no unit test | see P-1 | **P-1** |
| 18 | gate + device pass + report | 18.6 says `gh pr create` | **P-4** — ruling below |

## Rulings

Ruling: The rulings doc contains **no "Ratified by Kody — 2026-08-24" section** (grep for "Ratified" over `docs/design/field-companion/` returns nothing; the file is untracked and dated 2026-08-24 18:37). I treat the **Summary sheet's "Recommended default" column** (rulings §"Summary sheet") as the decided ruling set, together with the conductor's standing facts. — Because the doc's own summary is the only decided set present and every wave-1 default there is the conservative one (fail-closed flag seam, symbolic band, audio kept, `audio_retention='keep'`). — If wrong: a wave-1 package is built against a default Kody rejected; each is a small, revertible surface (the flag key, the band row, one column default).

Ruling: **No backward compatibility is owed in the app** (conductor standing fact 1 — Patina Field is not live anywhere). Legacy-decode paths, schema-version compat shims, "old builds keep committing" claims and any `capture.session-context.v1` migration test are skipped. The DB stays additive/idempotent with unchanged RPC signatures. — Because the app has no installed base to break. — If wrong: a pilot device with an old build would need a reinstall.

Ruling: **Task 10 is parked — `parked — held for 00516 merge`.** No file is created under `supabase/migrations/`, no `supabase db push`, no `supabase:reset`. The migration body is pre-authored as a DRAFT at `<workspace>/task-10-draft.sql`, layered on `00516`'s `commit_field_capture` body (read read-only from `origin/feat/capture-producer-idempotency`), calling `enqueue_capture_enrichment_for_producer(text, uuid, integer, text, text, jsonb)` and never the primitive. The SQL test file DOES land at `supabase/tests/field/field_capture_note_routing_test.sql` (a test applies nothing). — Conductor standing order. — If wrong: nothing; the draft is inert until Kody mints a number.

Ruling: **Task 18.6's `gh pr create` is NOT executed.** The branch is pushed to origin at each task completion; integration is the orchestrator's. — Opening a PR is a shared side effect this lane was not authorized to take. — If wrong: the orchestrator opens the PR itself, cost zero.

Ruling: **No explicit `-derivedDataPath`.** `capture-gate.sh` accepts no such flag, and Xcode derives DerivedData from the project's absolute path — the worktree's path differs from the main checkout's and from every sibling worktree's, so builds cannot collide. — If wrong: a slow first build, nothing worse.

Ruling (P-1): **`voice.finish` is emitted from exactly one helper.** Task 8 writes the cap-end emission as the plan specifies; Task 17 then refactors both the cap-end path and `finish()` into one private `emitFinish(reason:)` carrying `duration_s`, `segments`, `transcript_chars`, `on_device` plus `reason`. — Two emissions of one event name with disjoint properties would make acceptance criterion 7 ("voice.finish carrying segments and on_device") unverifiable. — If wrong: a cap-ended note carries one extra property.

Ruling (P-2): **Task 8 adds `analytics` and `surface` to `SpeechVoiceNoteService`.** The type today is `init(mediaDirectory: URL? = nil)` with no analytics of any kind, yet Task 8's own plan text calls `analytics.event(...)` four times and Task 17 says `surface` "is passed in at construction". Task 8 therefore extends the initializer to take `analytics: any CaptureAnalytics` and `surface: String`, both defaulted so nothing else breaks, and threads them at all three construction sites: `Capture/Features/Recognition/RecognitionScreens.swift:64` (`n4`), `Capture/Features/SiteScan/SiteScanHostScreen.swift:212` (`f2`), `Capture/Features/SiteScan/SiteScanContextCapture.swift:237` (`f2`). — The plan mandates the calls; the property does not exist. — If wrong: a surface string is mislabelled in telemetry.

Ruling (P-3): **Task 16's sweep is scoped explicitly.** `MediaRetentionPolicy` lands exactly as written; the sweep is a `CaptureStore` method that, when `MediaRetentionPolicy.overage(totalBytes:) > 0`, deletes oldest-first among media files whose owning specimen carries a durable remote path, and stops when the overage reaches zero. Nothing un-receipted is ever deleted. It is invoked after a successful drain. — The plan states the policy and the rule but not the sweep's body. — If wrong: the sweep runs at the wrong moment; the cap is a soft cap and nothing un-receipted can be lost.

Ruling (census drift): The plan expects `grep -rl 'commit_field_capture' supabase/migrations` → `00233` + `00235`; on `origin/main` it returns `00235` only. Every other census expectation matched exactly (last four `.sql` = 00513/00514/00515/00521; one `git log --all` row `ca2b0641b`; `grep -c 00521` in the reservations doc = 0; no `0053*` on any ref; `00516_capture_producer_idempotency.sql` present on `origin/feat/capture-producer-idempotency`). Not a stop — 00233 creates the table and its policies, not the function. — If wrong: the band assumption changes, which Task 10 re-censuses at landing anyway.

## Progress

### Conductor-run verifications (done centrally, so implementers need no PostHog or cross-worktree access)

- **Task 2.1 PREMISE CONFIRMED (2026-08-24, conductor).** PostHog project "Patina Website" (id 326191,
  org Middlewest Studio), HogQL over `events`, 180-day window:
  `surface='field-ios'` → **0 rows**. `surface='patina-ios'` → **6,017 rows**
  (first 2026-07-10T18:08:34Z, last 2026-08-19T11:45:38Z). The plan's premise holds exactly.
- **Task 2 PostHog key found in-repo — NOT blocked.** `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`,
  the same project key the client iOS app already ships
  (`apps/mobile/Patina/Patina/App/Configuration/Secrets.swift:30`) and the same literal in
  `apps/designer-portal/wrangler.jsonc:33`. It is the token of the active PostHog project above, so
  `field-ios` rows will land in the same project as `patina-ios`. Public `phc_` project key — safe in a
  client build, but it still must not be committed: Field's `Secrets.swift` is gitignored.
- **00516 reference body extracted read-only** to `<workspace>/00516-reference.sql` (681 lines) from
  `origin/feat/capture-producer-idempotency`. Confirms the ownership-checked wrapper
  `enqueue_capture_enrichment_for_producer` (SECURITY DEFINER) is the only thing `authenticated` gets
  EXECUTE on, and that `commit_field_capture` (SECURITY INVOKER) calls the **wrapper**, never the
  service-role-only primitive `enqueue_capture_enrichment`. Task 10's draft must preserve exactly that.

- **Device-pass targets located (conductor, blitz-iphone `list_devices`).** Two physical LiDAR iPhones
  are paired with Developer Mode ON: `00008110-001630212231801E` "iPhone" (iPhone 13 Pro, **USB**) and
  `00008150-00016C8A21DA401C` "Kody's Phone" (iPhone 17 Pro Max, **wifi**). Neither has WDA installed
  yet (`setup_device` costs 1–3 min). The USB iPhone 13 Pro is the Task 18 target; the wifi 17 Pro Max
  is the fallback. Bundle id for Patina Field is `cloud.patina.field`. Per patina-ios-verification,
  every blitz call carries an **explicit UDID** — never `booted` — because simulators are also paired.

Ruling (pipelining): **The review of task N may overlap the implementer of task N+1 when, and only when, the two touch disjoint file sets.** Reviewers are read-only on the checkout, so they cannot collide with an implementer; the rule that matters is never two IMPLEMENTERS in the worktree at once, and that is preserved. Applied first to Task 1 (docs only: `docs/engineering/migration-number-reservations.md`) against Task 2 (iOS config only). — 18 tasks strictly serialised through implement→review→fix would spend most of the wall clock idle. — If wrong: a task-N fix round has to queue behind the task-N+1 implementer, costing one dispatch of latency, and I fall back to strict serialisation for the rest of the wave.

Ruling (Task 2 split): **Task 2 steps 2.5 (signed device install) and 2.6 (PostHog proof) are deferred to Task 18's device pass**, and Task 2 therefore delivers compile-green only. Its own title claims "proof that events land"; that half is NOT delivered at Task 2 and must not be reported as if it were. — The implementer has neither a device nor PostHog access, and the wave already budgets exactly one device pass (constraint C5). — If wrong: nothing; the proof simply lands at Task 18 instead, where the signed build already has to exist.

Ruling (Task 2 xcconfig): **No CI pipeline is invented.** The brief says the `POSTHOG_API_KEY` build setting is "sourced from an .xcconfig that CI writes from a secret", but this repo has no iOS CI and no Fastfile. The requirement that actually matters is that the key reaches an INSTALLED build, so the implementation is: Info.plist key `POSTHOG_API_KEY = $(POSTHOG_API_KEY)` plus an app-target build setting defaulting to empty, satisfied by `xcodebuild … POSTHOG_API_KEY=phc_…`, with the unset case falling through to `Secrets.swift` exactly as today. — If wrong: a future CI lane adds an .xcconfig over the same build setting, which is additive.

- Task 1: implementer DONE (haiku), commit `5f46ede20` "docs(db): record the unregistered 00521 and reserve 00530-00535", 34 insertions / 2 deletions in `docs/engineering/migration-number-reservations.md`. Review dispatched (sonnet). ⚠ Diff contains one edit NOT in the brief — a pre-existing "00516–00520 remain free" sentence changed to "00517–00520 remain free" plus a reflow; flagged to the reviewer as a named risk.
- Task 2: implementer dispatched (sonnet), BASE `5f46ede20`.

### Task 1 review (sonnet) — ❌ spec, Needs fixes

All four brief-mandated insertions verified verbatim and correctly placed (`:82` 00521 row, `:107` 00516 row,
`:83` band row, `:131-159` new subsection); commit message verbatim; single explicit pathspec; no `0053*`
file minted. Two Important findings, both high confidence:

1. **Out-of-scope edit creates a three-way internal contradiction about whether 00516 is free.** `:128` was
   changed from "00516–00520 remain free" to "00517–00520 remain free", but the Phase 3 band row at `:79`
   still says "00516–00520 remain free for the rest of Phase 3" — while the new `:107` row records 00516 as
   TAKEN on a branch. The doc now disagrees with itself on the same fact in two places.
2. **The report claims the change was verbatim-only** and never discloses the `:128` edit.

Minor: (3) the `:128` reflow is a ~140-char line against the block's ~75–80-char wrap convention;
(4) no evidence in the report that census step 1.1 was run.

Ruling: **Keep the `:128` edit and fix `:79` to match, rather than reverting `:128`.** The reviewer offered
both exits. Reverting would restore a statement that is now demonstrably false — 00516 IS taken, which is
what Task 1 just recorded at `:107`. The doc's whole purpose (discipline rule 4) is to be the single source
of truth for band ownership, and a doc that contradicts itself about which numbers are free is the exact
failure this task exists to repair: the census failed this week precisely because this file was wrong. So
the fix is to make `:79` consistent, reflow `:128` to the file's wrap convention, and correct the report.
This deliberately exceeds the brief's "four verbatim insertions" scope. — If wrong: one extra sentence of
churn in a doc no build reads, trivially revertible.

Ruling: **Finding 4 is dismissed, not fixed.** The conductor ran census step 1.1 centrally and handed the
implementer the results in its dispatch, explicitly pre-satisfying that step — so its absence from the
implementer's report is expected, not a gap. The census output is recorded in this ledger above. — If wrong:
nothing; the census is re-run at Task 10's landing anyway (constraint C6).

Ruling (serialisation): **The Task 1 fix round waits for the Task 2 implementer to finish.** My pipelining
ruling above allows a read-only REVIEWER to overlap an implementer, but a fix round is an implementer, and
two concurrent `git commit` calls in one worktree race on `.git/index.lock`. Reviews overlap; writers never
do. — If wrong: one dispatch of latency.
- Task 2: implementer STALLED mid-work at 144k tokens / 43 tool uses / 12 min — ended its turn with
  "I'll wait for the monitor notification before continuing" having started a background build.
  Five files modified, nothing committed, no report. Resumed with an explicit instruction to run
  everything in the FOREGROUND and never wait on a notification. ⚠ It also modified
  `apps/mobile/Capture/Capture/Info.plist`, which is NOT in the brief's staging list — resume message
  requires it to account for that file explicitly rather than stage it silently.

Ruling (subagent waiting): **Implementer briefs for this wave forbid background jobs and notification
waits.** A subagent that backgrounds a build has nothing to wake it, so it burns its whole budget and
returns with the work half-done and uncommitted. Every gate command runs in the foreground even when it
takes minutes. — Observed directly on Task 2. — If wrong: a long build blocks one subagent turn, which
costs nothing since the subagent has no other work to do meanwhile.

### Task 2 SUPERSEDED by Wave 0.5 — merged, re-scoped

Ruling: **Wave 0.5's build-time PostHog mechanism replaces Task 2's, wholesale.** `origin/feat/field-companion-w05`
(head `26a333631`, branched off the same merge-base `a72d59f32`) already ships a better-proven version of
exactly what Task 2 was told to build. Actions taken by the conductor as workspace management, not
implementation: (1) Task 2's five uncommitted edits were **discarded** with `git checkout --` on explicit
pathspecs — it had NOT committed, so nothing was lost from history; (2) `origin/feat/field-companion-w05`
merged into `feat/field-companion-w1` as `6c1c519e1`, **clean, zero conflicts**; (3) the real key written to
the gitignored `apps/mobile/Capture/Capture/App/Configuration/Secrets.xcconfig` (confirmed ignored via
`git check-ignore` → `apps/mobile/Capture/.gitignore:6`). — The plan predates that branch; two mechanisms for
one key is a merge conflict waiting to happen, and w05's is proven by a real IPA. — If wrong: Task 2's
mechanism is recoverable from this ledger's description, but nothing depends on it.

w05's mechanism, for the record: `Capture/Info.plist` carries a literal `<key>POSTHOG_API_KEY</key>` /
`<string>$(POSTHOG_API_KEY)</string>`; the substitution resolves from the committed
`Capture/App/Configuration/BuildSettings.xcconfig` (defaults `POSTHOG_API_KEY =` empty so a fresh checkout
still builds), which `#include? "Secrets.xcconfig"` layers the real key on top of; `generate_project.rb`
sources the xcconfig into the app target's build configurations. w05 also adds `PrivacyInfo.xcprivacy`,
`scripts/archive-testflight.sh`, `scripts/ExportOptions.plist`, and a Release-compile guard in
`ResilienceScreens.swift`.
⚠ **`INFOPLIST_KEY_POSTHOG_API_KEY` does NOT work for custom keys** — `GENERATE_INFOPLIST_FILE` only
auto-emits `INFOPLIST_KEY_*` for Apple's own known key set. Verified by w05. Do not reintroduce it.

Ruling: **Coordinator item (3a), "`surface='field-ios'` on every event", needs NO code — it already ships.**
`Capture/Services/Analytics/PostHogCaptureAnalytics.swift:32` already calls
`PostHogSDK.shared.register(["surface": "field-ios"])` inside the run-once `isEnabled` setup, which registers
it as a PostHog **super property** — so it is attached to every `screen`, `event` and `identify` call
automatically. The 0-rows-in-180-days figure was never a missing-property problem; it was purely the missing
key. Writing a per-event `surface` property now would duplicate the super property on every payload. — If
wrong: events carry the property twice, harmless but noisy.

Task 2 therefore reduces to ONE deliverable: **prove at least one `surface='field-ios'` row actually lands.**

### Task 2 — PROVEN, by the conductor, on a simulator build

The remaining half of Task 2 was pure verification, so the conductor ran it directly rather than spending
another ~150k-token implementer on it.

**Build-time key proven in the build product.** `xcodebuild … -sdk iphonesimulator -derivedDataPath .build/derived`
then `PlistBuddy -c "Print:POSTHOG_API_KEY" Capture.app/Info.plist` →
`phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`. The `$(POSTHOG_API_KEY)` substitution really does resolve
from the gitignored `Secrets.xcconfig` into a real built binary's Info.plist. Build exit 0.

**Events land — Field's first in 180 days.** Installed and launched on simulator `iPhone 17`
(`C8850509-C7DC-43C5-9226-9446404EE98A`) with `-CaptureForceReal` (required: `runsRealServices` is false on
the simulator without it, so the app would otherwise wire `MockCaptureAnalytics`). Drove O1 → O2 via
blitz-iphone with an explicit UDID. PostHog rows, verified by HogQL:

| timestamp | event | screen_name | surface | app_version |
|---|---|---|---|---|
| 2026-08-25T02:32:48.156Z | Application Opened | — | field-ios | 0.1 |
| 2026-08-25T02:32:48.209Z | $screen | screen.O2.connect | field-ios | 0.1 |
| 2026-08-25T02:32:48.226Z | $screen | screen.O1.welcome | field-ios | 0.1 |
| 2026-08-25T02:33:02.759Z | $screen | screen.O2.connect | field-ios | 0.1 |

⚠ **A first query at ~2 min returned empty; the rows appeared at ~5 min.** PostHog ingestion lag, not a
failure — do not conclude "no events" from a single early query.

**Claim level, stated honestly: sim-verified, NOT device-verified.** This proves the key mechanism and the
`surface='field-ios'` super property end-to-end from a real build product. It does NOT prove the device-install
or TestFlight path, which is exactly what acceptance criterion 7 asks for ("from a build installed the way a
pilot build is installed"). **Task 18's device pass still owes that**, and the wave report must not claim
criterion 7 from this evidence alone.

- Task 2: **complete (no new commits of its own — the mechanism arrived via merge `6c1c519e1`; `Secrets.xcconfig`
  is gitignored so there is nothing to commit; verification recorded above).**

- Task 1: fix round 1/5 (3 addressed, 0 open — 00516 contradiction reconciled at `:79`/`:107`/`:128-130`;
  report's false verbatim-only claim corrected; line-128 re-wrapped to ~68/73 chars matching the block's
  75–80 convention; commits `6c1c519e1`..`7775ced18`).
- Task 1: **complete** (commits `5f46ede20` + `7775ced18`, re-review clean, no new breakage).
- Task 3: implementer dispatched (sonnet), BASE `7775ced18`.
- Task 10 (parked): draft author dispatched (opus) — writes ONLY `task-10-draft.sql` in this gitignored
  workspace plus `supabase/tests/field/field_capture_note_routing_test.sql`; forbidden from any git command,
  any database command, and any file under `supabase/migrations/`. The test file will be committed by the
  conductor once the iOS lane frees up.
- Branch pushed to origin: `feat/field-companion-w1` (first push, tracking set).
- Task 3: implementer DONE_WITH_CONCERNS (sonnet), commit `72c0f2e15` "feat(ios): add a fail-closed
  feature-flag seam and gate the recorder on it". RED confirmed (compile error: no `isFeatureEnabled`
  member) → GREEN (`✔ build`, `✔ tests`, `✔ lint`; swiftlint --strict exit 0). **10 files committed, not
  the brief's literal 4** — AppContainer.swift, VoiceNoteSheet.swift, SiteScanContextCapture.swift,
  SiteScanHostScreen.swift plus 2 regenerated `.xcscheme` files. Implementer's argument: steps 3.5/3.6
  unavoidably touch them and omitting them would commit a seam nothing calls. Two further self-reported
  concerns: `reloadFeatureFlags()` called unconditionally (not gated on PostHog being configured), and no
  visual walk. All three handed to the reviewer to judge on the code rather than the framing.
  Review dispatched (sonnet).
- Task 4: implementer dispatched (haiku — the brief carries complete source for both files, so this is
  transcription plus TDD), BASE `72c0f2e15`.

### Task 10 UNPARKED + Wave 0.5 review fixes (coordinator instruction)

Ruling: **Task 10 is unparked and draws 00530.** Phase 3's `00516` merged to `main` at
`db2128934c9b21d0ae92e2554e521d1c39c0aaf5`. Census re-run and clear: last five `.sql` are
00511/00513/00514/00515/00521, `git log --all -- 'supabase/migrations/0053*.sql'` is **empty**.
File `supabase/migrations/00530_field_capture_notes_and_routing.sql`, header naming 00516 a hard
prerequisite, lineage 00235 → 00516 → 00530. ⚠ **00516 is on `main` but NOT yet applied to prod**
(Kody GO pending), so **00530 cannot be pushed to Strata before 00516 is.** This lane pushes nothing.

Ruling: **Fix the `routing.clear` cast — the plan's own SQL carries a live defect.** The draft author
found that `(v_payload #>> '{routing,clear}')::boolean` raises `22P02` on any non-boolean value,
**before the upsert and outside every exception block**. On the device that surfaces as a plain Error,
not a `LocalSyncError`, so `runAttempt` routes it to `recordFailure` → `.retryableFailure` and it retries
on EVERY drain forever — the precise failure mode the safe harbor exists to prevent. Replaced with the
total, non-throwing `v_clear_routing := ((v_payload #> '{routing,clear}') = 'true'::jsonb)`. A malformed
value now means "do not clear" instead of hard-failing the RPC; the device sends a JSON boolean so the
real path is unchanged. — If wrong: a caller who sent the string `"true"` expecting a clear would not get
one, which is strictly better than an unkillable retry loop.

Ruling: **Follow the SPEC on the ACL, not the brief.** Brief 10.4 writes
`REVOKE ALL … FROM PUBLIC, anon, service_role`; spec §9.2 says `FROM PUBLIC, anon`. The spec is the
binding authority and the brief's extra `service_role` could drop a real grant rather than restate one.
— If wrong: a service-role caller that does not exist today would need its grant restored.

Ruling: **The `pnpm supabase:reset` is authorized under the lock protocol.** The local stack is SHARED by
every worktree on this machine (`supabase_db_supabase`, up 3h) and a reset wipes it for everyone.
`/tmp/patina-local-supabase-db.lock` was **absent**, which the protocol treats as free-to-take; the
implementer must create it before resetting and remove it on completion **and on failure**. No
`apps/*/.env.local` exists in this worktree, so the prod-pointing trap does not apply here. — If wrong: a
sibling session loses its local seed data and re-runs `supabase:reset`, costing minutes, not data.

Ruling: **The stale reservations-doc line about 00516 is corrected in Task 10's commit.** The draft author
found `docs/engineering/migration-number-reservations.md:~107` still describes 00516 as granting the
primitive `enqueue_capture_enrichment` to `authenticated` — which 00516's own ACL fix reversed in favour of
the ownership-checked `_for_producer` wrapper. Left alone it would mislead the next lane about a
cross-tenant hole that is actually closed.

- **Wave 0.5 review fixes applied by the conductor** (small, precise, no implementer needed):
  commit `fd04958ee` "fix(field-capture): correct xcconfig comments + privacy reason (w05 review)".
  S2 — `BuildSettings.xcconfig` and `Secrets.xcconfig.example` both described the key as reaching
  Info.plist via `INFOPLIST_KEY_*`; corrected to the real mechanism (literal `$(POSTHOG_API_KEY)` in
  `Info.plist`) with an explicit warn-off comment, since `GENERATE_INFOPLIST_FILE` only auto-emits
  `INFOPLIST_KEY_*` for Xcode's own known keys. P1 — `PrivacyInfo.xcprivacy` FileTimestamp reason
  `C617.1` (display to user on request) → `3B52.1` (internal-only use); Field reads timestamps for its
  own media lifecycle and never shows them. `plutil -lint` OK.
- Task 4: implementer DONE (haiku), commit `ebfb056a9` "feat(ios): move the capture-media MIME map into
  CaptureKit". Gates ✔ build / ✔ tests / ✔ lint. One deviation: trailing comma removed from the
  `bucketAllowed` Set for swiftlint `--strict`. Review dispatched.
- Task 10: implementer dispatched (opus), unparked scope.

### Task 3 review (sonnet) — ✅ spec compliant, Approved

Reviewer split attention honestly: ~72% of the 1592-line diff was regenerated pbxproj, skimmed
mechanically (confirmed `FeatureFlagSeamTests.swift` wired into the CaptureTests target's file ref, group
and sources phase; diffed the full CaptureTests file list before/after — all 19 pre-existing test files
survive the whole-file UUID regen, one added, none dropped). Real attention on the 8 Swift/scheme files,
plus three out-of-diff checks run against the worktree.

Verified against ground truth, not the report's framing:
- `MockCaptureAnalytics` (`CaptureKitMocks.swift:144`) untouched with no `isFeatureEnabled` override →
  the protocol requirement really is additive and defaulted.
- `PostHogSDK` reference count inside `CaptureKit/` is **zero** — CaptureKit stays SDK-free.
- **Concern 2 resolved by reading the vendored SDK**: `PostHogSDK.reloadFeatureFlags(callback:)` →
  `if !isEnabled() { callback(); return }`, and `isEnabled()` returns false safely (hedgeLog warning, no
  crash, no network) when `setup()` was never called
  (`.build/derived/SourcePackages/checkouts/posthog-ios/PostHog/PostHogSDK.swift:2110-2124`, `:2449`).
  Further, `identifyRestoredSession` is only called in AppContainer's **real** branch (`:115`), never the
  mock branch — so mock / `-CaptureUseMocks` / UI-test paths never reach it.
- **Concern 1 resolved**: all six extra files are required consequences of steps 3.5/3.6, not scope creep.
  `SiteScanHostScreen.swift` was mechanically forced by `SiteScanContextModel`'s init gaining a parameter
  (exactly 3 construction sites, all threaded). The two `.xcscheme` files carry a `BlueprintIdentifier` for
  the CaptureTests target that the same generator run changed (`7A142001…` → `3386735B…`) — **leaving them
  unstaged would have committed schemes pointing at a nonexistent target UUID.** The brief's step-3.8 file
  list was simply stale relative to its own steps 3.5/3.6.

Deferred minors (do NOT enter the fix loop; carried to the final review):
- Task 3: minor (deferred): `VoiceNoteSheet.swift:44-51` — the mic gate flips `manualFallback` inside
  `.task`'s synchronous prefix rather than at view init, so there is a theoretical single-frame window
  where an inert view could flash. No permission prompt or audio capture can occur in that window (the
  same guard gates both). Inherited from a pre-existing pattern in the file. **Carry this to Task 15,
  which edits this exact file, and to the device pass.** Confidence medium, reasoned not observed.
- Task 3: minor (deferred): `AppContainer.swift:149` — `reloadFeatureFlags()` called directly on the
  singleton, bypassing the `CaptureAnalytics` seam. Verified functionally safe; **plan-mandated** (brief
  step 3.5 says exactly this), so the fault is the plan's, not the implementer's.
- Task 3: minor (deferred): no device/simulator visual walk confirming the two affordances render absent
  rather than merely logically absent. → **Task 18 device pass owes this** (acceptance criterion 9).

- Task 3: **complete** (commits `7775ced18`..`72c0f2e15`, review clean, 3 minors deferred).
- Task 5: implementer DONE (haiku), commit `8e1465b13` "feat(ios): add VoiceRecordingPolicy (rotation, cap,
  segment naming)". 4/4 tests; gates ✔ build / ✔ tests / ✔ lint; transcribed verbatim, no deviations.
- Task 5: minor (deferred): staged `project.pbxproj` but **left both `.xcscheme` files dirty**, so the
  committed schemes point at the previous regen's target UUIDs
  (`8F575E89…`/`9079A906…` → `C95EBA69…`/`C1A61CDD…`). Not breakage in this worktree — every gate run
  regenerates both on disk — but a fresh checkout would carry a scheme referencing a nonexistent target
  until someone runs the generator. **Systemic, not a Task 5 mistake**: `generate_project.rb` re-mints every
  target UUID on every run, and the brief's staging lists (inherited from the plan) name only the pbxproj.
  The Task 3 reviewer flagged the same mechanism. Rule now added to `worktree-rules.md` for Tasks 6→18;
  the dirty schemes will be absorbed by Task 6's commit, and Task 18 verifies the final committed state is
  self-consistent. Not worth a fix loop on its own.

### Task 4 review (haiku) — ✅ spec compliant, Approved

Verified against ground truth: all 10 MIME strings in `bucketAllowed` match migration `00234:22-33`
exactly. Confirmed the drift guard can genuinely fail (new switch case without a Set entry, removed entry,
count drift). Confirmed the pure move — switch verbatim from `LocalCaptureSyncService`, deliberate absence
of a `"json"` case preserved, and `LocalCaptureSyncService` itself untouched (Task 9 owns that). Clean TDD
evidence: RED `cannot find 'CaptureMediaMime' in scope` ×9 → GREEN ✔ build / ✔ tests / ✔ lint.

- Task 4: minor (deferred): `CaptureMediaMime.swift:46` — trailing comma removed from the `bucketAllowed`
  Set literal, a deviation from the brief's verbatim source. Reviewer confirmed it is **genuinely
  lint-forced**: swiftlint's `trailing_comma` rule is on by default and not disabled in `.swiftlint.yml`,
  so `--strict` errors on it. Purely syntactic; all ten entries unchanged; declared in the report.
  Accepted as a gate-compliance adjustment.
- Task 4: **complete** (commits `72c0f2e15`..`ebfb056a9`, review clean, 1 minor deferred).
- Task 5: review dispatched (haiku), with the known scheme-staging issue explicitly excluded from its
  scope so it does not re-litigate a systemic problem already ruled on.
- Task 6: implementer dispatched (opus — audio wire, per the model ladder: anything touching the
  voice/audio contract or concurrency goes to opus), BASE `8e1465b13`. Instructed to absorb the two dirty
  `.xcscheme` files into its commit per the new staging rule, and told explicitly that the standing
  "no backward compatibility owed" fact makes the brief's "old builds keep committing" clause moot.

### Task 5 review (haiku) — ✅ spec compliant, Approved, zero findings

Verified verbatim transcription by actual diff against the brief (character-for-character, both files).
All four tests present and exercising load-bearing behaviour: rotation boundary in both directions
(49.9 false / 50 true / 61 true), both cap arms (1200 s and 24 segments), exact filenames at indices 0 and
12, and the `CaptureMediaMime` dependency resolving (`.m4a` → `audio/x-m4a`, present in `bucketAllowed`).
Confirmed `%03d` is correct for every index the policy can reach (`maxSegments = 24` tops out at 23).
Both new files landed in the correct targets. TDD evidence clean, output pristine.

- Task 5: **complete** (commits `fd04958ee`..`8e1465b13`, review clean, 0 findings).

Ruling (iOS concurrency limit): **Only ONE iOS writer at a time, regardless of source-file disjointness.**
Tasks 6 and 7 touch different Swift files, but every task that runs the gate regenerates
`project.pbxproj` and both `.xcscheme` files with fresh target UUIDs — so any two concurrent iOS tasks
collide on those three build artifacts even when their real work does not overlap. A non-iOS writer
(Task 10, in `supabase/` and `packages/supabase/`) runs alongside safely because it never invokes the
generator. — If wrong: the iOS lane is serial, which costs wall-clock but avoids an artifact merge no
reviewer could sensibly read.

### Task 10 — implemented (opus), commit `a27e8dfb3`

`feat(db): persist routing on commit_field_capture's inbox branch (00530)`. Four files: the migration,
the SQL test, `packages/supabase/src/database.types.ts` (+18 lines), the reservations doc. **Nothing pushed.**

Results reported: standalone routing test PASS, 6 NOTICE lines, exit 0. Full suite **exit 0**, 123 files,
`expected-fail: 22`, `unexpected-fail: 0`. `pnpm type-check` exit 0, 30/30 (the worktree had no
`node_modules`; `pnpm install --frozen-lockfile` was run first). Merged 00516 body confirmed
**byte-identical** to the branch reference the draft was written against (`diff` exit 0); the enqueue call
carried byte-identical and never touching the primitive. All three conductor rulings applied.
⚠ Nothing here proves RLS — the runner connects as superuser.

🔴 **Branch-state defect found by the implementer: `00516` is on `origin/main` but NOT on this branch.**
`supabase/migrations/` here goes 00515 → 00530, so a plain `pnpm supabase:reset` on this branch builds a
`commit_field_capture` that calls a function which does not exist. The implementer correctly refused to
copy 00516 into `supabase/migrations/` (that would mint a second author for a number another lane owns)
and instead reproduced the real lineage on the local DB by hand — reset → apply 00516's merged body →
apply 00530 — running both test passes against that state.

Ruling: **merge `origin/main` into `feat/field-companion-w1` to close the gap**, once the iOS lane is free.
That brings 00516 in by its real commit rather than by a copy, making the branch self-consistent and the
SQL suite honest for every later run. It must wait for Task 6 to commit, because a merge cannot proceed
over its dirty tree. — If wrong: the merge pulls unrelated main churn into the branch, which the final
whole-branch review will see anyway.

⚠ **Push ordering constraint for the orchestrator: 00516 is on `main` but NOT yet applied to prod (Kody GO
pending). 00530 CANNOT be pushed to Strata before 00516 is.** This lane pushes nothing.

- Task 10: review dispatched (opus, adversarial — shared RPC on a live prod table), read-only and
  explicitly forbidden from touching any database.

Ruling (Task 10, defensive payload projection — from the Wave 3 plan review, which reproduced the failure
class): **A payload value that violates one of 00530's named CHECK constraints raises inside
`commit_field_capture` but OUTSIDE its safe-harbor block, so the RPC fails on BOTH destinations and an
offline-retrying device never syncs that capture at all.** Same class as the `routing.clear` cast already
fixed: a raise outside every handler, on a path the device retries forever. Triggers: `captureKind: 'foo'`,
`voice.transcriptSource: 'x'`, `voice.noteSetting: 'both'`, and a non-array `voice.audioSegments`.

The four new payload reads are therefore authored **defensively so they cannot trip a CHECK**:
whitelist via `CASE WHEN v IN (…) THEN v ELSE <default> END` for `capture_kind` (default `'specimen'`),
`transcript_source` (NULL) and `note_setting` (NULL), with the allowed-value lists read off 00530's own
named CHECK constraints so whitelist and constraint cannot drift; `voice_audio_segments` takes the payload
array only when `jsonb_typeof(...) = 'array'`, else `'[]'::jsonb`. Every dropped value is recorded in
`raw_payload -> 'projection_errors'` — a jsonb array of `{key, reason}` — **never a RAISE**. The named CHECK
constraints stay exactly as they are: belt-and-braces the function can no longer trip.

Two hazards called out to the implementer: the projection-errors merge and the safe harbor's `conflict`
merge both write `raw_payload` and must compose rather than clobber in either order; and a projection that
fires on a well-formed payload is as wrong as one that never fires, so the test asserts `projection_errors`
is absent/empty on good input.

The standalone SQL test gains the four malformed inputs, each asserting the row **still commits**, the
offending column carries its default, and the errors array names the key.

— If wrong: a genuinely bad `captureKind` is silently coerced to `'specimen'` instead of surfacing loudly.
That is the correct trade here: the alternative is a capture that can never sync from a device with no
operator present, and the dropped value is preserved verbatim in `projection_errors` for later inspection.

- Task 10: fix round 1 dispatched (resumed original opus implementer) — defensive projection + 4 new test
  cases. Runs alongside Task 6's iOS work safely (disjoint trees, no generator involvement).

### Task 10 adversarial review (opus) — ❌ spec, Needs fixes. Exceptionally good.

Verified the hard parts against ground truth: extracted 00516's function region from
`git show db2128934:…00516…sql` (lines 200-472) and `diff -u`'d it against committed 00530 (lines 186-504).
Nine hunks, all accounted for — the two sanctioned edits plus three cosmetic deltas. **Nothing of 00516's
vanished**: the enqueue call with all six named args, `p_content_revision => 1`, the sha256 content hash, the
upsert's `WHERE field_captures.status NOT IN ('saved','dismissed')` idempotency predicate, the
`IF NOT FOUND` early return, the whole library branch and its harbor, and all four `RETURN` shapes are
00516's verbatim. **The two-author revert hazard is genuinely closed.** All five policy predicates are
character-for-character `00233:155-188` with only `TO authenticated` added, and a repo-wide grep confirms no
intermediate author ever touched them. Ruling 1's replacement verified **total** across missing / null /
string / number / object / array. Ruling 2 verified safe — no service-role caller of
`commit_field_capture` exists; the only live caller is `SupabaseCaptureGateway.swift:56` over PostgREST as
`authenticated`. No false RLS claim anywhere.

🔴 **Finding 1 (Important) — the inbox safe harbor cannot catch the failure its own header says it exists
for.** Three parts, all verified from the trigger definition and statement ordering: (a) `project_id` /
`project_room_id` are `ON DELETE SET NULL` (`00233:92-93`), so "room deleted" **self-clears and never
raises** — that justification is false; (b) for the cases that DO raise (project transferred, room
re-parented) the stale value is already on the row, and `trg_field_captures_guard_update` is an
unconditional `BEFORE UPDATE FOR EACH ROW` (`00233:258-260`) re-validating `NEW.project_id` on **every**
update, so the `ON CONFLICT DO UPDATE` upsert — which runs **before** the destination branch and **outside
every exception block** — raises first and the RPC aborts before the harbor is entered; (c) even if
reached, the handler's own UPDATE re-fires the same guard with the same stale `project_id` and raises
**from inside the handler**, uncaught.
Why it is load-bearing: **00530 is the first code that ever writes `project_id` onto inbox rows.** Before
it this pre-existing unhandled abort had almost no population; after it, every routed note carries a
stale-able project reference, and any capture whose project later becomes invisible to that designer
becomes permanently un-syncable — plain `Error`, not `LocalSyncError`, retried on every drain forever.
Ruling: **fix all three parts** — null the routing in the handler's UPDATE so it cannot re-trip the guard,
protect the **upsert** with the same catch-and-retry-with-routing-nulled shape so stale stored routing
cannot abort before any harbor exists, and correct the header's reachability list. Same standing rule as
the projection defect: **a capture must never become un-syncable from a device with no operator present.**
— If wrong: a stale route is silently dropped and recorded as a conflict instead of surfacing as an error
nobody is present to read.

**Finding 2 (Important, plan-mandated)** — three CHECK-constrained columns fed raw client payload from
outside every harbor. **Independently corroborates the defensive-projection ruling already in flight.**

**Finding 3 (Important, process)** — reviewer saw the in-flight EDIT 3 as unreviewed working-tree drift.
Ruling: **EDIT 3 is in scope and sanctioned** — it is the conductor's ruling, dispatched before the review
landed, and it will be tested and re-reviewed explicitly. It does mean 00530 now carries **three**
behavioural edits vs 00516's body, not two; the header and report must say so.

**Finding 4 (Important)** — 00516 absent from this branch; the committed test is NOT in
`KNOWN_FAILURES.md`, so it turns the suite's `unexpected-fail: 0` invariant red for anyone resetting from
this branch, **including nightly `integration.yml`**. Already ruled: merge `origin/main`. Reviewer judged
the manual-overlay test results **credible** for function logic, with the residual gap being that nobody
has run the test against a clean single-pass replay of the true lineage — which the merge closes.

Minors folded into the same fix round: **6** — the comment cites an "ACL conformance gate" that does not
exist anywhere in `scripts/` or `.github/workflows/`; **5** — "this changes nothing" understates the anon
half, since prod default privileges auto-grant `anon` EXECUTE and `00235:303`'s `REVOKE … FROM PUBLIC`
does not remove an explicit `anon` grant; **7** — `supabase/seed/00-legacy-grants.sql` not regenerated, so
every local reset re-grants `anon` EXECUTE and 00530's revoke is never replayed (local-only, seeds never
run on prod); **8** — the test's "second commit is a no-op" comment is false: status `'inbox'` is not in
`('saved','dismissed')`, so the upsert DOES fire and overwrites every content column, resetting
`capture_kind` to `'specimen'` and `voice_audio_segments` to `'[]'` while asserting only `project_id`;
**9** — **the behaviours this task was ruled on are untested**: no case sends a non-boolean `routing.clear`
(ruling 1 entirely untested), none exercises stale *stored* routing (finding 1), none sends a
CHECK-violating value (EDIT 3 covers this); **10** — `voice_audio_segments` accepts jsonb `null`
(EDIT 3's `jsonb_typeof` check closes it); **12** — brief step 10.3's RED run missing from the report.

Parked with rulings (real, not load-bearing): **11** — `ADD COLUMN IF NOT EXISTS … CONSTRAINT … CHECK`
silently skips the constraint on a partial re-apply; correct for the clean forward apply that matters, and
already documented by the implementer. **13** — `CREATE INDEX` inside the transaction rather than
`CONCURRENTLY`, taking a SHARE lock on a live prod table; `field_captures` is small enough that impact is
negligible.

- Task 10: fix round 1/5 in flight (defensive projection + findings 1, 5, 6, 7, 8, 9, 12).

### Pending `origin/main` merge — conflict surface mapped (read-only, before merging)

`git merge-base HEAD origin/main` = `a72d59f326064feef159148ef9ee174434222156`; main brings **17 commits**.
Files main touches that this branch also touches — exactly **two**:
- `docs/engineering/migration-number-reservations.md` — main records the Phase 3 lane's own landings; this
  branch records 00521, the 00530–00535 band and 00530. Resolution = union of both row sets.
- `packages/supabase/src/database.types.ts` — main carries 00516's type surface; this branch carries
  00530's new `field_captures` columns. Resolution = **regenerate after the merge**, never hand-merge a
  generated file.

Ruling: **Task 10 must NOT regenerate `supabase/seed/00-legacy-grants.sql` (review finding 7).** Main
already modifies that file — the Phase 3 lane regenerated it for 00516. Regenerating it now, on a branch
that lacks 00516, derives it from the wrong baseline and creates a **third** conflict on a generated file.
The conductor regenerates it after the merge, from a baseline containing both 00516 and 00530. — If wrong:
the seed is momentarily stale on this branch, which is local-only (seeds never run on prod) and is fixed by
the post-merge regeneration anyway.

Merge sequencing: it must wait for Task 6 to commit, because a merge cannot proceed over its dirty tree
(7 modified files + 1 untracked test under `apps/mobile/Capture/`).

- Task 10: fix round 1 commit `9a5b3d875` "fix(db): project 00530's new payload reads so they cannot trip a
  CHECK" — the defensive projection. Remaining findings still in flight in the same round.

### Task 10 fix rounds complete — coordinator rulings ledgered

Commits on `feat/field-companion-w1`: `a27e8dfb3` (original), `9a5b3d875` (defensive projection),
`ce480b94f` (upsert safe harbor for stale stored routing). 15 SQL cases green standalone; full runner
exit 0 (123 files, expected-fail 22, unexpected-fail 0). Report §F/§G.

Ruling (a) — **the residual org-scope escape is PARKED as pre-existing.** A second upsert failure can
re-raise via the `organization_id` guard branch. `Ruling: pre-existing, not widened in W1; carried to the
wave report as owed for the FC-R18 owner.` Do **not** null the organization and do **not** widen the harbor
further. — The routing escape was worth fixing because 00530 *created* its population (it is the first code
to write `project_id` onto inbox rows); the org escape has the same population before and after this wave,
so fixing it here would be scope creep into another owner's object. — If wrong: a capture whose
organization becomes invalid stays un-syncable, exactly as it is on `main` today.

Ruling (b) — **`supabase/seed/00-legacy-grants.sql` stays untouched** (as already amended mid-round: main
regenerates it for 00516, so regenerating on a branch lacking 00516 derives it from the wrong baseline).
The conductor regenerates it after the `origin/main` merge.

Ruling (c) — **nothing pushes to Strata from this lane, and 00516 must apply to prod before 00530.**
00516 is on `main` but not yet applied to prod (Kody GO pending).

⚠ Communication note: the Task 10 implementer reported it never received the "finding 12" (missing RED
run) text. The report greps 26 hits for RED/step-10.3 material, so it appears covered; the scoped
re-review will confirm rather than my asserting it.

- Task 10: scoped re-review dispatched (opus), FIX_BASE `a27e8dfb3` → HEAD `ce480b94f`.

### Task 6 — NEEDS_CONTEXT, ruled, unblocked

The implementer held at the commit step rather than break an instruction, which was the right call.
It found that **two of my instructions were mathematically irreconcilable**: brief 6.5 mandates
`currentSchemaVersion == 2`, while my "the shipped `FieldCapturePayloadTests` still passes **unchanged**"
guard-rail requires `dict["schemaVersion"] as? Int == 1` at `FieldCapturePayloadTests.swift:70` and `:147`.
`init(specimen:device:)` assigns `self.schemaVersion = Self.currentSchemaVersion`, so those literals are a
**mirror of the constant, not an independent contract**. Both cannot hold.

Ruling: **change `1` → `2` on those two lines and nothing else in that file.** My guard-rail was aimed at
an *additive* regression — a new key breaking an existing shape or absent-key assertion, which would prove
the wire is not as additive as the plan claims. The implementer verified line-by-line that this did not
happen: `fullSpecimenMapsEveryKeyToTheRightPath()` asserts the voice dict only via `audioPath` /
`transcript` / `partialTranscript` / `durationSeconds` with **no whole-dict shape or count assertion**, and
`emptySpecimenEmitsMinimalPayload()`'s fixed absent-key list does **not** contain `captureKind` (nil →
omitted regardless). Every other assertion in both tests still passes; only the version mirror fails.
Updating a literal that mirrors a deliberately-changed constant is the test tracking a contract change, not
editing an inconvenient test away. — If wrong: the payload emits a version the server stores but never
branches on.

Independently justified, and this is what makes it safe rather than merely convenient:
`FieldCapturePayload.swift:42` contracts that the version bumps only alongside a 00235-side reader change,
and **that reader change is already on this branch** — `00530` reads `captureKind` (`:305`),
`voice.transcriptSource` (`:314`) and `voice.audioSegments` (`:335`). **Nothing server-side branches on
`schemaVersion`** — it is stored, not switched on (`00530:446`, identical to `00235:144`) — so emitting `2`
is safe on prod today. Repo-wide grep confirms the only other pins on the constant are those two test
literals (`00514:159` is `CaptureEnrichmentMessageV1`, a different envelope; the `FieldScanManifest` hits
are the on-disk manifest format).

⚠ **Environmental hazard for the rest of the wave, found by Task 6:** a **passcode-protected physical
iPhone is attached to this Mac** and poisons the iOS gate. One `capture-gate.sh test` run spent **602 s** in
`IDETestOperationsObserverDebug: Failure collecting diagnostics from simulator: Timed out after 600.0
seconds`, preceded by `DTDKRemoteDeviceConnection … "The device is passcode protected."` — the tests
themselves run in ~27 s. Not caused by any code change. It will make every remaining Wave 1 iOS gate run
unpredictably slow until the device is unlocked or unplugged. **It also blocks the Task 18 device pass,
which needs that phone unlocked.** → carried to the wave report as owed by Kody.
⚠ `swiftlint` and a bare `xcodebuild` need the sandbox disabled here (`permissionDenied`);
`scripts/capture-gate.sh` itself runs fine sandboxed. Environmental, not code.

- Task 6: minor (deferred): **`voice.noteSetting` has no Wave 1 producer.** 00530 validates it defensively
  and defaults it to NULL, so the dead read is harmless — recorded as owed rather than inventing a producer
  in Wave 1. Task 17 emits `note_setting` as an *analytics* property, which is a different thing.
- Task 6: expected-and-correct: `voiceAudioRemotePathsRaw` has no writer until Task 9's upload leg. That is
  precisely the dead-waiting-wire this task exists to complete.

### Task 6 — complete; `origin/main` MERGED; 00516 gap closed

- Task 6: implementer DONE (opus), commit `5112460ae` "feat(ios): carry voice audio segments and capture
  kind through the wire" (9 files, +311/-156). Ten new `VoiceAudioWireTests` pass; gates ✔ build ✔ tests
  ✔ lint; `swiftlint --strict` exit 0. Review dispatched (opus).
- **`origin/main` merged** as `4cc535f14` — 17 commits, exactly the two predicted conflicts:
  - `docs/engineering/migration-number-reservations.md` — resolved as a union. ⚠ **Main's own 00516 row and
    prose were STALE**: they still described 00516 as widening `enqueue_capture_enrichment`'s grant to
    `authenticated`, which is precisely the cross-tenant hole 00516's adversarial review removed. Corrected
    in the merge resolution (same reasoning as Task 1's ruling: a doc that is the single source of truth may
    not carry a claim its own lane has reversed).
  - `packages/supabase/src/database.types.ts` — took main's side, then **regenerated** from the merged
    baseline rather than hand-merging a generated file. All six new `field_captures` columns present.
- 🟢 **The residual gap the reviewer named is now CLOSED.** On a clean `pnpm supabase:reset` in true ledger
  order (00516 then 00530 — no hand-built overlay), under the shared-stack lock:
  - standalone `field_capture_note_routing` → **PASS**
  - full suite → **exit 0, 126 files, 104 green, 22 expected-fail, 0 unexpected-fail**
  Lock created before the reset and removed after. 00530 has now been proven to apply through
  `supabase:reset` in ledger order, which had never been done.
- `supabase/seed/00-legacy-grants.sql` **regenerated post-merge** and committed as `50b7f2228` — deferred on
  purpose until the baseline contained both 00516 and 00530 (+30 statements; 16 `commit_field_capture`
  references).
- Task 10: fix round 2 dispatched — finding 9 sub-part 4 (policy **predicates**, not just the count) plus a
  comment sweep (3 freshly-false comments, the same defect class finding 8 raised) and two forensic closes
  (`detached_shelf`; the inbox `conflict` clobbering an upsert-stage `conflict`).
- Task 7: implementer dispatched (sonnet), BASE `50b7f2228`.
⚠ `git push` failed once with an SSH access error immediately after the merge; earlier pushes on this branch
succeeded, so treating it as transient and retrying at the next task boundary.
- Task 7: implementer DONE (sonnet), commit `213f773f9` "fix(ios): stop dropping the FF&E room when a
  capture inherits routing". 3/3 `RoutingMemoryStampTests` pass; gates ✔ build ✔ tests ✔ lint;
  swiftlint --strict clean. Correctly left the concurrent SQL lane's files untouched.
⚠ **`git push` to origin is now FAILING and it worked earlier in this session.** Sandboxed it returns
"Please make sure you have the correct access rights and the repository exists"; unsandboxed it HANGS
(3-min timeout), which reads like a blocked SSH key/agent prompt rather than a permissions error. Last
successful push was `fd04958ee`. Everything since — `8e1465b13`, `a27e8dfb3`, `9a5b3d875`, `ce480b94f`,
`5112460ae`, `4cc535f14` (the main merge), `50b7f2228`, `213f773f9` — is **committed locally but NOT on
origin**. This does not gate the wave (the orchestrator merges from this worktree) but it is owed by Kody:
the SSH credential this session was using appears to have expired or been locked mid-run. Retried at each
task boundary.

### Task 6 review (opus) — ✅ spec compliant, Approved

Attention split honestly: ~10% pbxproj (set-difference of every `.swift` basename across `-`/`+` lines to
prove nothing was dropped — **zero dropped, one added**, all 22 pre-existing test files intact), ~90% on the
five Swift files plus four read-only greps to settle claims the diff cannot.

Both conductor rulings verified exactly: `FieldCapturePayloadTests.swift` contains **precisely two changed
lines**, both `== 1` → `== 2`; the absent-key list and every other assertion byte-identical. `@Test @MainActor`
on exactly the two store tests. No forbidden seam touched; zero `sha256` occurrences; none of the five
off-limits source files edited.

All four named risks check out clean: **determinism** (`voiceNames` is order-preserving throughout; the
normal `voiceAudioFilename == segments[0]` duplicate collapses via `seen`, which test 9 would catch);
**exemption matching** (every edge traced — trailing slash, empty string, `"///"`, bare filename — and two
segments sharing a basename is unreachable in one flat App Group dir); **`buildVoice`'s widened guard**
(cannot emit an all-null `Voice`); **absent-key discipline** (no custom `CodingKeys`/`encode(to:)`, so
synthesized `encodeIfPresent` omits all three).

Notably the reviewer verified the exemption's *rationale* rather than assuming it: `CaptureMediaAvailabilityError`
is `LocalizedError` (`CaptureStore.swift:12`) while `LocalCaptureSyncService.swift:207`/`:534` catch
`let error as LocalSyncError where error.isDeferrable` — so without the exemption one unreadable segment
really would hard-fail a note that syncs transcript-only today. And the pre-existing
`CaptureLifecycleTests.missingCaptureMediaThrowsExplicitReviewError` (`:899`) — which asserts the exact
ordered legacy array — still held.

Ruling: **`onDevice` is NOT a dead property; the reviewer lacked forward visibility.** Finding 1 (Important,
plan-mandated) argues `onDevice` meets the same test that got `voiceAudioSha256` excluded — declared, never
written, never read. That is true *on this commit* but not across the wave: **Task 8 (in flight now) is its
producer** (brief step 8.5 returns `onDevice: onDeviceRecognition` from `finish()`), and **Task 17 is its
reader** (`voice.finish`'s `on_device` property, which acceptance criterion 7 requires). The `sha256`
exclusion was categorically different — *nothing in waves 1–5 hashes the audio at all*, so its producer was
four waves away. The property's doc comment reads as a forward statement and becomes true within this wave.
Parked, with a Task 18 verification: **confirm `on_device` actually appears on a `voice.finish` event** — if
it does not, the finding revives. — If wrong: one unread `Bool` ships.

Carried into **Task 9's** dispatch rather than a Task 6 fix round, since Task 9 owns the writer these
describe (avoids a fix loop for three one-line CaptureKit edits):
- Task 6: minor (deferred → Task 9): `CaptureStore.swift:524-525` does **not** trim remote-path basenames,
  though local names are trimmed at `:529` and the photo rule above trims at `:513`. A trailing space after
  the filename makes the exemption silently miss and hard-fails the note — the exact failure the exemption
  exists to prevent.
- Task 6: minor (deferred → Task 9): `Specimen.swift:91`'s doc comment promises `voiceAudioRemotePathsRaw`
  is "in the same order", but the reader matches by trailing path component and ignores index — which is
  *more* robust and is what makes test 10 work. `[String]?` cannot express a sparse positional array, so the
  comment points Task 9's writer at a design the reader neither needs nor supports.
- Task 6: minor (deferred → Task 9): `FieldCapturePayload.swift:238` filters empty segments **without**
  trimming while `CaptureStore` trims, so a whitespace-only name reaches the wire and 00530 while being
  dropped from the local-media requirement.

Parked (no action): tautological `schemaVersionIsBumpedForTheNewReaderSideKeys`; `captureKindRaw` filed under
the Voice section header (brief-directed placement); test 9's `Set`-regression detection being probabilistic
rather than deterministic (it still catches the de-dup half deterministically); JSON-layer absent-key
assertions (behaviour verified correct, coverage gap only).

- Task 6: **complete** (commits `ce480b94f`..`5112460ae`, review clean, 1 Important parked with a Task 18
  verification, 3 minors carried to Task 9, 4 minors parked).

### Task 7 review (sonnet) — ✅ spec compliant, Approved, zero Critical/Important

Attention split ~91% pbxproj (skimmed) / ~9% the three Swift files (line-by-line), plus independent reads
of the live worktree source to verify struct shapes rather than trusting the diff hunks.

The trap was avoided and **independently verified**: `CaptureRoutingMemory` closes at `:47`
(`static let empty` at `:46`), and the new `public extension` sits at `:187–201` — after
`CaptureSessionContext` (`:49–69`), `CaptureSessionContextPolicy` (`:71–104`) and `CaptureSessionContextStore`
(`:107–179`). Genuinely top-level, not nested.

Verified the mapper **assigns rather than coalesces** — real overwrite-and-clear semantics, so
`anEmptyRoutingMemoryClearsPlacementWithoutTouchingGPS` passes for the right reason. Confirmed against
`VenueStamp`'s full field list that it touches exactly the five routing fields and never
`latitude` / `longitude` / `accuracyMeters` / `placemarkName` / `placeId` / `capturedAt` /
`timezoneIdentifier`. The call-site one-liner preserves `draft.venue ?? VenueStamp()` nil-safety and leaves
the neighbouring `draft.category` / `draft.destination` lines alone. All 23 pre-existing test file
references survive the pbxproj regen plus exactly one new one; `S1AssignVenueScreen.swift` (Task 11's),
`Secrets.swift` and `supabase/` appear only as unchanged context rows.

Test discriminating power confirmed by trace: **both** the all-five-fields test and the empty-routing test
would fail if `projectRoomId` were dropped from the mapper — real teeth against the exact regression.

- Task 7: minor (deferred): ⚠️ the TDD RED/GREEN evidence rests on the implementer's own pasted terminal
  output, not independently reproduced (the reviewer was instructed not to re-run, since the passcode-locked
  iPhone makes a gate run cost up to 602 s). Internally consistent and plausible. This caveat applies to
  **every** iOS task in this wave, not just Task 7 — recorded once here and carried to the wave report.
- Task 7: **complete** (commits `50b7f2228`..`213f773f9`, review clean, 0 Critical/Important).

### Task 8 — implemented (opus), commit `2b5fd5f8d`, COMPILE-GREEN ONLY

`feat(ios): actually record the voice note's audio` (6 files, +239/−9). Gates ✔ build ✔ tests ✔ lint,
swiftlint --strict exit 0. Both needed the sandbox disabled (CoreSimulatorService `permissionDenied`); the
602 s hang did not occur this run. `project.pbxproj` and both `.xcscheme` were clean after the gate, so
correctly not staged (no new `.swift` file).

🔴 **Step 8.8 was NOT performed and the implementer said so without hedging.** No behaviour in this commit
has run on hardware. Unproven: that the `.m4a` is ever created at all, rotation at 50 s, two notes back to
back on one screen, interruption-resume opening segment N+1, and the AirPods route change not trapping.
This is the wave's highest-value change and its proof is entirely deferred to Task 18.

Implementer's own concerns, carried to the review and to Task 18:
- **C1** — the cap path finishes the stream but nothing stops the engine; unverified whether any caller
  invokes `finish()` afterwards. If not, the engine keeps running and the tap keeps firing after a capped
  note.
- **C4** — the format guard prevents the trap but **a route change can silently stop audio mid-segment**
  (the guard skips writes rather than reopening at the new format). Device-pass step 5 must therefore
  **compare `.m4a` duration against note duration, not merely check "no crash"**. This is a genuine
  improvement to the plan's device script and is carried into Task 18's brief.
- **C2/C3** — accepted `@unchecked Sendable` races between `rotate` and `finish()`.
Declared deviations: the continuation is stored (the brief's 2-arg `installTap` requires it); a trailing
comma removed for swiftlint `--strict`; `deinit` created (the type had none).

- Task 8: review dispatched (opus, adversarial) — asked for hazard-by-hazard verdicts and, since there is
  neither a unit test nor a device pass, **a concrete list of what the device pass must observe** rather
  than "verify it works".
- Task 9: implementer dispatched (opus), BASE `2b5fd5f8d`. Carries Task 6's three deferred minors (remote
  basename trimming, the misleading same-order doc comment, and the untrimmed payload segment filter) so
  they land in the commit of the writer they describe instead of costing a fix loop.

### Push: RESOLVED as an environment fact — "push owed"

Ruling: **`git push` failures from this session are the sandbox's HTTP proxy ("This proxy requires
authentication"), not GitHub, not credentials, and not the branch.** Stop retrying (one attempt max) and do
not treat it as BLOCKED. Everything from `8e1465b13` onward is committed locally and **push is owed** — the
coordinator pushes the branch from outside the sandbox at wave end. My earlier ledger note guessing at an
expired SSH key was wrong; corrected here.

### Task 8 adversarial review (opus) — ❌ Needs fixes. 2 Critical, 7 Important.

**All five hazards verified CLOSED** at the mechanism level, both conductor rulings applied, every scope
boundary respected, every spec step faithful, and the new values verified valid against 00530's CHECKs.
The reviewer enumerated every stored property to prove the per-note reset is complete, and confirmed
`grep isRunning` returns only `finish()`'s guard — no dead `.ended` guard.

🔴 **Critical 1 — the cap path is an unlatched loop.** `rotate()` takes the `shouldEnd` branch and returns
**without advancing `segmentStartedAt`**; `defer { rotationInFlight = false }` then clears the latch, so the
next tap buffer (~21 ms) re-triggers it forever. Traced to the callers: both consumers' `for try await`
exit **normally** on `continuation.finish()`, so neither `catch` runs and both leave `isRecording` true.
Result after the 20-minute cap: tap keeps firing, file grows past the cap, recognizer never rotates again so
the transcript freezes ~60 s later while audio continues, UI still says RECORDING, and PostHog receives tens
of thousands of `voice.finish` events. Reachable today on the F2 toggle path.
🔴 **Critical 2 — `request` is swapped on `rotationQueue` while the render thread dereferences it every
buffer.** Non-atomic class-reference store racing a load can over-release and crash, **at every 50-second
rotation of every note** — far wider than the `finish()`-boundary race the implementer described.
Ruling: **fix it despite being plan-mandated.** The plan's authorship does not grade its own work, and a
probable crash mid-recording defeats the task's entire purpose. `OSAllocatedUnfairLock` box, read once per
buffer (iOS 18 floor; uncontended unfair lock is nanoseconds). — If wrong: a few ns per buffer.

Important, all ruled FIX: **#3** a failed `openSegment` silently kills rotation for the whole note
(`segmentStartedAt` set only in the success branch) — recreating the >60 s truncation the policy exists to
prevent, while the header calls a failed open "non-fatal"; **#4** no `AVAudioEngineConfigurationChange`
observer, which is C4's real fix — a route change raising no interruption silently stops audio while
recognition continues; **#5** hot-mic/privacy — an engine-start failure leaves the observer armed, so a
later `.ended` restarts a mic with no UI; **#6** a zero-byte segment hard-fails sync (not deferrable) and
defeats F2's "Nothing recorded" guard; **#7** manual typed notes ship as `device_partial` though the schema
has `'designer'` (plan-mandated, ruled fixed); **#8** `deinit` leaves the session hot; **#9** two doc
comments assert behaviour the code does not deliver — held to a high bar because a false comment on this
file's load-bearing claim is what produced this task.

Parked minors: `voice.segment_rotated`'s index reports the audio-file count not the rotation count (Task 17
owns the event); `startedAt`/`noteStartedAt` duplication; `onDevice`'s capability-vs-evidence wording;
`MockCaptureAnalytics()` default; orphaned `.m4a` sweeping (Task 16); `rotationInFlight`'s unsynchronised
`Bool`.

🟢 **The reviewer produced a 13-item device-pass specification** — concrete assertions, not "verify it
works" (e.g. compare `afinfo` duration against wall-clock across a route change; assert **one**
`voice.finish reason:cap` not a burst; probe an instant tap-release to settle whether a 0-byte file
hard-fails sync). **This supersedes the plan's 11-step script for Task 18** and is the most valuable
artifact of this review.

- Task 8: fix round 1 dispatched (2 Critical + 7 Important + 2 minors; 6 minors parked).
- Task 9: implementer DONE (opus), commit `3367e7a95`, 4 files. Gates ✔ build ✔ tests ✔ lint; swiftlint
  --strict exit 0; 306 tests / 43 suites green. Review dispatched (sonnet).

Ruling (Task 9 concern 1 — HIGH, self-flagged, and I am ruling it FIXED): **the task's headline behaviour
is defeated upstream on the attempt that matters.** `uploadMedia:366` opens with
`try store.validateRequiredMedia(for: specimen)`, which throws for any required-and-unreadable file — and a
voice segment stays *required* until it carries a stamped remote path. So on the **first** attempt at a
genuinely lost segment the pre-check throws and the per-segment drop never runs. The drop works on retry
(already-stamped segments are exempt) but not for the full-disk or post-reinstall case the task exists for.

This is the fourth instance of the same failure class in this wave — `routing.clear`'s cast, the CHECK-
violating payload reads, the safe harbor's unreachability, and now this — and the standing rule holds:
**a capture must never become un-syncable from a device with no operator present.**

Fix: add a photos-only validation variant in `CaptureStore` and use it for `uploadMedia`'s pre-check, so the
voice loop's per-segment drop is actually reachable. **Photo behaviour must not change** — a photo capture
with no photo is meaningless and hard-failing there is correct, pre-existing, and out of scope. The
implementer was right to flag rather than reach into a shared CaptureKit file unbidden. — If wrong: a note
whose *every* segment is missing syncs as transcript-only instead of erroring, which is precisely the
degradation the task asks for.

⚠ Sequencing: this fix waits for Task 8's fix round. Two concurrent `capture-gate.sh` runs would both invoke
`generate_project.rb` against the same `project.pbxproj` — **one iOS writer at a time**, per the standing
ruling. Task 9's review runs now (read-only) so its findings can be folded into a single fix round.

### Task 9 review (sonnet) — ❌ Needs fixes. 1 Critical, and it is WORSE than self-reported.

Everything mechanical verified correct: 9.1's MIME delegation is a byte-identical move; 9.3's payload
plurality with no stale `uploadedVoicePath` anywhere; all three carried Task 6 fixes landed at the right
lines doing the right thing (`CaptureStore.swift:524-526` trims remote basenames,
`Specimen.swift:87-93`'s comment now says append-only/order-independent, `FieldCapturePayload.swift:236-240`
trims before filtering); the double-append guard verified sound under a retried drain; the
`uploadVoiceSegment` extraction verified behaviour-preserving and genuinely forced (`.swiftlint.yml:51`
`function_body_length: 60` + `--strict`); `analytics?.event` verified as the only compiling form.
Partial-network-failure resume traced end to end: no duplication, no skipping.

🔴 **Critical — confirmed, and materially worse than the implementer's own HIGH flag.** My earlier ruling
called it "defeated on the first attempt". The reviewer traced further: `CaptureMediaAvailabilityError` is
classified `.rejected` by `shouldReject` (`LocalCaptureSyncService.swift:239-241`), and `drainOwned`
(`:139-147`) **excludes `phase == .rejected` from the auto-drain query**. So a note with one lost segment is
not blocked once — it is **permanently rejected and orphaned from the sync queue**, never retried
automatically. That is **strictly worse than the pre-Task-9 status quo**, where a single voice file could
fail; now any one of N segments can do it. And the per-segment drop logic added by this task protects only
a narrow TOCTOU window (a file that passes `resourceValues` then fails `Data(contentsOf:)` moments later) —
**not** the full-disk or post-reinstall cases the brief names. The new code is effectively dead for its own
stated triggers.

My ruling stands and is reinforced: **fix it.** Photos-only validation variant in `CaptureStore` used for
`uploadMedia`'s pre-check, so the voice loop's drop is reachable. Photo behaviour unchanged.

Minors (deferred, no fix loop): the report **overstates** test coverage of the three carried fixes — neither
`VoiceAudioWireTests` nor `FieldCapturePayloadTests` contains a whitespace/trailing-space case, so those
fixes are unverified by test (not a code defect, but the report overclaims); voice segments re-upload on
every deferred drain where photos filter on `remotePath` (harmless under upsert, wasteful on cellular);
`store.save()` once after both loops is pre-existing, now amplified across N segments;
`payload.voice.audioPath` is the first *surviving* segment rather than literally index 0 once a drop occurs
— sound, but the commit message's "keeps segment 0" is imprecise.

⚠️ Cannot verify from diff, flagged for Task 18: whether `commit_field_capture` handles a **non-contiguous**
`audioSegments` array (a hole where a dropped segment would have been) the same as a full one.

Sequencing: Task 9's fix waits for Task 8's fix round — one iOS writer at a time.

### Wire contract ruling — dropped segments are OMITTED, and the loss is declared

Ruling (coordinator, settling the question Task 9's review forwarded): **a dropped voice segment is OMITTED
from `voice.audioSegments`. The array is always the ordered list of segments that exist — never a hole,
never a null.** Separately, **the device sets `voice.audioLost = true` in the payload whenever anything was
dropped**, so the server can tell "this note had two segments" from "this note had three and lost one".
**00530 stores the array as-is** — jsonb, no contiguity check, no reordering, no renumbering.

Consequence: `voice.audioSegments` can legitimately arrive **non-contiguous by filename** — a 2-element
array ending `-000` and `-002` because `-001` was lost to a full disk. That is a *legal* payload, not a
malformed one, and the defensive projection must not mistake sparseness for corruption.

Routed to three places:
- **Task 10 (SQL, in flight):** a test case committing a 2-element `-000`/`-002` array, asserting the row
  commits, `voice_audio_segments` round-trips **exactly** (same elements, same order, still 2), and
  `raw_payload -> 'projection_errors'` is **absent or empty**. That last assertion is the load-bearing one.
- **Task 9 (queued behind Task 8's fix):** add `audioLost: Bool?` to `FieldCapturePayload.Voice` and set it
  `true` when `lostSegments > 0`. This is a wire-contract addition, so it belongs with the segment-drop
  logic that produces the condition.
- **Task 18:** verify a real non-contiguous commit end to end, and that `voice.audioLost` reaches the row.

This also **answers the ⚠️ the Task 9 reviewer could not settle from its diff** ("does `commit_field_capture`
handle a non-contiguous array the same as a full one?"). It does, and now there is a test proving it.
— If wrong: the server cannot distinguish a short note from a lossy one, which is exactly what `audioLost`
exists to prevent.

### Task 8 fix round 1 — COMPLETE at `6ca9003b9` (all nine findings)

`fix(ios): end the voice note at the cap and stop the mic when the note does` — 2 files, +175/−59.
`capture-gate.sh all` ✔, `swiftlint --strict` clean. Scoped re-review dispatched (opus).

Three departures from my fix instructions, all ACCEPTED (coordinator rulings, ledgered):
1. **A `noteIsActive` one-byte latch guarding `requestRotationIfNeeded`**, rather than relying on a racy
   `Optional<Date>` read — ACCEPTED. That read is exactly the tearing class already parked, so replacing it
   with a single-byte latch is strictly safer than what I asked for.
2. **The `#3` `segmentStartedAt` assignment placed inside `openSegment` above the `mediaDirectory` guard**
   rather than in the two call sites — ACCEPTED; same effect, one site instead of two.
3. **Empty-segment drop in `finish()` keyed on two independent signals** (`frames == 0` **and**
   `size <= 1024`) — ACCEPTED **with a constraint**: the drop must never delete a segment name already
   stamped on a `Specimen` that has been enqueued. The re-reviewer is required to trace
   `finish()` → `VoiceNoteResult` → the consumer's `attach()`/`enqueueVoice` stamping and state plainly
   whether a dropped name can already be on a persisted or enqueued specimen. **If it can, that is a
   Critical data-integrity finding**, because it would delete a file the outbox still requires.

Two Task 18 risks raised by the implementer, carried to the device-pass table:
- **Configuration-change fan-out** — an AirPods reconnect can fire `AVAudioEngineConfigurationChange`
  repeatedly and open a segment per event, potentially burning through `maxSegments = 24` and spamming the
  App Group media dir. Wants debouncing; measure it on hardware first.
- **`endAtCap()`'s main-thread hop racing a next-note start** — teardown is async, so a designer who taps
  straight into a new note after a capped one could have the teardown land on the new note.

- Task 9: fix round 1 dispatched — the Critical (photos-only validation variant so the drop is reachable;
  photo behaviour unchanged) plus the new `voice.audioLost` wire key, plus a report correction. Three
  minors parked.

## ⚠ AGENT ADDRESS REGISTRY — check this before every SendMessage

`general-purpose` is the **agent TYPE, not an address.** Address a child by the `agentId` returned at
dispatch. Record every id here at dispatch time.

| Task | Role | agentId |
| --- | --- | --- |
| 1 | implementer (haiku) | `a7fa5d27b1fef3688` |
| 1 | reviewer (sonnet) | `a2e21d5e672e5afd0` |
| 2 | implementer (sonnet, superseded) | `a1f328425fca2798a` |
| 3 | implementer (sonnet) | `a53535220ed0a9088` |
| 3 | reviewer (sonnet) | `a48cda6ab7dbbaebe` |
| 4 | implementer (haiku) | `a7c1da5c8a27eb130` |
| 4 | reviewer (haiku) | `a6303bcd7465add2e` |
| 5 | implementer (haiku) | `a143f20e7261eeebd` |
| 5 | reviewer (haiku) | `aa4a6b7d4e8a46ac2` |
| 6 | implementer (opus) | `a7a0c159d24ed9ae3` |
| 6 | reviewer (opus) | `af0d62ad36bb1d5f0` |
| 7 | implementer (sonnet) | `a93636b95409c416a` |
| 7 | reviewer (sonnet) | `ab6e25046e2a5407b` |
| 8 | implementer (opus) | `a358ccfb3bf160042` |
| 8 | reviewer (opus) | `a28a032cfe7fd1637` |
| 8 | re-reviewer (opus) | `a0743f05831201050` |
| 9 | implementer (opus) | `ad96309cef665d9cd` |
| 9 | reviewer (sonnet) | `a5cb58a90a59daef7` |
| 10 | draft author (opus) | `aeec7adda5ec70865` |
| 10 | implementer (opus) | `af8b7b043e1c38c85` |
| 10 | reviewer (opus) | `a4bf7bd1caf1db65d` |

🔴 **Routing fault, recorded:** Task 9's fix round was sent to `a28a032cfe7fd1637` — the **Task 8 reviewer**
— because I confused it with the Task 9 implementer (`ad96309cef665d9cd`). No harm done: the reviewer read
it and raised three substantive points, all now ruled on below. Re-sent to the correct address.

### Rulings on the misrouted message's three points (coordinator)

Ruling (1) — **Task 8 owns the empty-segment case, and it is re-rated Critical.** Task 8's Important #6 was
"a zero-byte segment can hard-fail sync"; the correct fix is **not** downstream tolerance but never
producing the name at all. `openSegment` must latch `audioFilename` / `audioSegments[i]` **only after the
first successful `AVAudioFile.write`** — or, if that would require work on the render thread, latch on the
first non-empty buffer count observed under the lock at `finish()`/rotation, pruning never-written names
before returning the result. An instant tap-release, an `audioEngine.start()` throw, or a segment whose
every write was skipped by the format guard must yield **NO filename**, so nothing downstream ever marks it
missing. → **re-rated Critical, added to Task 8 fix round 2.** — If wrong: a genuinely-written segment is
pruned; guarded against by keying on an actual write, not on file size alone.

Ruling (2) — **Task 9 owns true losses only.** A "loss" is a file that **existed and is gone** — full disk,
reinstall, retention sweep. Task 9's scope is the photos-only pre-check plus the per-segment drop, and
**`voice.audioLost = true` is set ONLY when a previously-written segment cannot be read at upload time.**
This cleanly separates the two: Task 8 prevents phantom names, Task 9 reports real losses. Without the
split, an instant tap-release would have reported `audioLost` for audio that never existed.

Ruling (3) — **`endAtCap()` must guarantee the segment is CLOSED**, with finish semantics, not merely stop
rotation. A capped note's final `.m4a` must be a complete, playable file. → added to Task 8 fix round 2.

### Task 8 round-1 re-review (opus) — all 9 findings + 2 minors ADDRESSED; 5 new issues in rewritten lines

Departure-3 constraint **verified unconditionally safe** by a 7-step trace: every drop happens inside
`closeCurrentSegment()`, which within `finish()` runs *before* the `VoiceNoteResult` is constructed with **no
suspension point** between them (`@MainActor`, straight-line), and both consumers stamp strictly downstream.
The cap path is safe in either interleaving. Middle-of-list drops are impossible by construction —
`closeCurrentSegment` only removes `audioSegments.last`. **A dropped name can never precede a stamp.**
Critical 2 verified properly: exactly one uncontended lock acquisition per buffer, `append` called after
release, no recursive or nested acquisition, `os_unfair_lock` priority donation bounds the render thread.

New issues found in lines round 1 rewrote → dispatched as round 2: **N1** the recognition-error door to the
same hot mic round 1 closed on the engine-start door (the code's own comment names it); **N2** the tap is
removed only inside `if audioEngine.isRunning`, so after an interruption `.began` it survives and the next
`installTap` raises `nullptr == Tap()` — **the most likely crash in the change**, reachable by start note →
take call → stop note during call → start second note; **N3** no re-entrancy latch on the new
configuration-change observer, which can also burn `maxSegments = 24` and silently end a note early;
**N4** session lifecycle asymmetric both ways (`deinit` deactivates unconditionally even for a service that
never recorded — cross-feature risk in an app running ARKit/RoomPlan; the engine-start `catch` leaves it
active and ducking); **N5** `endAtCap()` then `finish()` calls the call-once `endAudio()` twice.

### Task 8 fix round 2 — COMPLETE at `399d420bc`

`fix(ios): publish a voice segment's filename only once a write has landed`. `OpenSegment` behind one
`OSAllocatedUnfairLock`; tap writes + frame increment under the lock; `closeCurrentSegment` publishes a
filename **only when `frames > 0`** and deletes otherwise; round 1's `size <= 1024` heuristic removed
(R1 closed); `endAtCap` keyed to the note id (R3 closed). Gates ✔✔✔, swiftlint --strict clean.

Ruling: **the tap holding the lock across `AVAudioFile.write` is ACCEPTED for Wave 1.** — Any risk is
latency on the render thread, and the alternative (unlocked write racing a close) is the over-release class
we just spent two rounds eliminating. — If wrong: audio glitching under contention, observable on device.

Ruling: **N3 / configuration-change fan-out (R2) stays a DEVICE-PASS item, not a code fix.** Mitigating it
blind risks suppressing a legitimate reopen; measure the real fan-out on hardware first. — If wrong: an
AirPods reconnect burns segment ordinals and can end a long note early; observable, and the note keeps the
audio it already has.

🔴 **The single most important device check in the wave**, per the implementer's own round-2 ask:
**"a normal 15 s note still keeps its audio."** Because publishing is now keyed on `frames > 0`, if the
write path throws on device for any reason, **every** segment takes the delete branch and the recorder
silently discards all audio while reporting success. That failure is invisible to every gate we have.

### Task 9 fix round 1 — DONE at `c2b023cac`; two rulings

`fix(ios): stop one lost voice segment from orphaning a note from sync`. Photos-required / voice-reported
split in `CaptureStore`; `uploadMedia` gates on photos alone so the per-segment drop is reachable;
`voice.audioLost: Bool?` set only for a previously-written segment that cannot be read. Gates ✔✔✔,
swiftlint --strict clean, 306 tests / 43 suites. Report carries an 8-point device-pass checklist.

Ruling: **when EVERY segment is lost, `audioSegments` must be `[]`, never a fallback to bare local
filenames** — a bare filename tells the server a file sits at a path where nothing was uploaded. Paired with
`audioLost: true`, which is exactly what distinguishes "no audio" from "had audio, all gone". → round 2.

Ruling: **`currentSchemaVersion` does NOT move again in Wave 1.** `audioLost` and `audioSegments` are
optional keys 00530 already reads defensively; nothing server-side branches on `schemaVersion` (stored, not
switched on). Wave 3 does a single N→N+1 bump covering Waves 1–3. Task 6's earlier 1→2 bump stands, being
justified by 00530's genuinely new reader-side reads. — If wrong: a version signal arrives one wave late
for readers that do not exist.

- Task 8: re-review of rounds 1+2 dispatched (opus), agentId `a0b4a4ed7fcf754d2`, on a **path-scoped** diff
  (`review-task8-fixrounds-1and2.diff`) that excludes Task 9's interleaved commit `c2b023cac` by pathspec.
- Task 9: fix round 2 dispatched — empty-array fix, N6 doc drift in `Specimen.swift:95` /
  `FieldCapturePayload.swift:89` (both still say `'device' | 'device_partial'` while the app writes
  `'designer'` and 00530 admits four values), and confirmation the schema version is unchanged.

### Task 8 round-2 addendum — COMPLETE at `8faadf781`

`fix(ios): remove the tap unconditionally and close the recognition-error door`. **N2** `removeTap` lifted
outside the `isRunning` guard (the most likely crash in the change); **N1** one idempotent
`endAbandonedNote()` wired to **both** doors — the engine-start throw and the recognition-error path;
**N3** configuration-change fan-out broken by comparing the re-read `outputFormat` against `tapFormat`
(channel count + sample rate) **in addition to** the latch; **N4** `deinit` guard; **N5** already fixed.
Gates ✔✔✔, swiftlint clean.

Ruling: **the format comparison is ACCEPTED as the correct cycle-breaker for N3.** A latch alone only
serialises the reopens; comparing the re-read format against the tap's actual format is what makes a
self-posted notification a no-op, because a reopen the engine caused produces the same format it already
has. That converts the earlier "device-pass item" into a real code fix, which is better — but the
device-pass observation stays, to confirm a *genuine* route change is not wedged by a coincidental format
match. — If wrong: a real route change to an identically-shaped format is skipped, and audio continues on
the old tap.

Task 8 final range = original `2b5fd5f8d` + `6ca9003b9` + `399d420bc` + `8faadf781`.

⚠ **Re-review range corrected mid-flight.** I had dispatched Task 8's re-review against
`3367e7a95..399d420bc`, which predates the addendum — it would have reported N1–N4 as NOT ADDRESSED when
they were fixed in the excluded commit. Rebuilt the path-scoped diff through `8faadf781`
(`review-task8-fixrounds-all.diff`, 3 commits, 660 lines) and redirected the running reviewer to it.
**Lesson for the rest of the wave: a re-review dispatched while its implementer is still resumable can go
stale under it — rebuild and redirect rather than letting a misleading verdict land.**

### Task 9 fix round 2 — DONE at `fa74e3f79`; ACCEPTED

`fix(ios): name nothing when every voice segment is lost`. Total loss → `audioSegments: []`
(**present-and-empty, not nil**) + `audioLost: true` + `audioPath` cleared; four wire states distinct;
`currentSchemaVersion` unchanged at 2; N6 doc drift fixed citing `00530:53-55`. Gates ✔✔✔, swiftlint clean,
306 tests / 43 suites. Device-pass item 5 split into **5a partial loss / 5b total loss** — 5b must observe
present-and-empty, not an omitted key.

Task 9 final range = `3367e7a95` + `c2b023cac` + `fa74e3f79`.

- Task 9: scoped re-review dispatched (sonnet), agentId `ace64067551c31376`, on
  `review-task9-fixrounds-1and2.diff` (path-scoped, 287 lines, Task 8's commits excluded).
- Task 11: implementer dispatched (sonnet), agentId `a6b09772d48f96198`.

### Task 9 re-review (sonnet) — ALL findings addressed, no new Critical/Important. COMPLETE.

Critical verified genuinely fixed: `uploadMedia:384` now calls `validateRequiredPhotos`;
`CaptureStore.swift:510-511` composes `missingRequiredMedia` from `missingRequiredPhotos + missingVoiceSegments`
and the reviewer proved the split is **behaviour-preserving** (`unreadable(_:)` is a pure per-element filter,
so filtering each half then concatenating equals filtering the combined list). Photo hard-fail preserved at
`:407-413`. `validateRequiredMedia`/`missingRequiredMedia` unmodified and still used by
`CaptureLifecycleTests:922-933` and `VoiceAudioWireTests:77-92` — genuinely additive.

The reviewer traced the risk I most wanted checked: **does an empty `audioSegments` survive `buildVoice`'s
guard, or does the `voice` object get dropped and the `audioLost` signal lost?** It does survive — the guard
passes whenever the specimen ever had a voice filename or segments-raw entry, and those fields are never
cleared by the upload loop (only `voiceAudioRemotePathsRaw` is touched). Synthesized `Codable` uses
`encodeIfPresent` on `[String]?`, so `[]` really is emitted as a **present** key, distinct from omission.

Four wire states confirmed distinct:

| state | `voice` | `audioPath` | `audioSegments` | `audioLost` |
|---|---|---|---|---|
| no audio ever | absent | — | — | — |
| audio intact | present | first uploaded path | ordered full object paths | absent |
| partial loss | present | first **surviving** path | surviving paths, short by N | `true` |
| total loss | present | `nil` | `[]` present-and-empty | `true` |

⚠ **Cross-lane dependency, carried to the final whole-branch review:** Task 9's wire-contract correctness is
**not self-contained**. `audioLost` never firing for a phantom name depends entirely on Task 8's guarantee
that a never-written segment yields no filename. A regression in Task 8's lane reopens this **without
touching any of Task 9's four files**. Both the code comments and the report name the dependency, which is
the right handling — but the final review must check it as a pair, not as two tasks.

- Task 9: minor (deferred): the round-1 overclaim about test coverage was corrected **in prose only** — the
  underlying gap stands: no whitespace/trailing-space case exists in `VoiceAudioWireTests` or
  `FieldCapturePayloadTests`, so **no test would fail if the three carried Task 6 fixes were reverted**. The
  reviewer named a cheap CaptureKit-side closure (assert `buildVoice` trims a trailing-space segment name,
  and that `missingVoiceSegments`' `uploaded` set still exempts a remote path ending in a space). Carried to
  the final review to triage — not worth a fix loop mid-wave.
- Task 9: minor (deferred): no device-pass item verifies the `voiceAudioRemotePathsRaw` de-dupe guard
  survives a multi-drain replay without growing unbounded → **added as device-pass item 9**.
- Task 9: minor (deferred): voice segments still re-upload on every deferred drain (no `remotePath` filter
  as photos have) — pre-existing, harmless under upsert, wasteful on cellular.
- Task 9: **complete** (commits `3367e7a95`, `c2b023cac`, `fa74e3f79`; re-review clean; 3 minors deferred).

Reviewer hygiene note worth keeping: it verified the gate outputs were **real re-runs, not copy-paste**, by
checking the timings differ across the three report sections (2.4 s → 1.176 s → 1.214 s → 1.073 s). That is
a good cheap check against fabricated evidence and I will ask for it again.

### Task 8 re-review of rounds 1+2+addendum (opus) — all 7 ADDRESSED, 9 new issues in fixed lines

N1, N2, N3, N4, N5, R1, R3 each verified closed **against the final source**, not the report's prose. N2's
`nullptr == Tap()` crash traced dead across all six teardown callers. R1 verified: `openSegment` no longer
touches `audioSegments`/`audioFilename`, the frame count advances only after a returned `write` under the
same lock, and index reuse after a delete is safe because the file is always removed before the reopen.
R3 verified in **both** race orders (finish-then-endAtCap and endAtCap-then-finish are each a no-op on the
second pass), and the `noteID` key genuinely holds across the main hop.

Rulings on the nine new issues:

**FIX NOW (round 3):**
- **#4 (Important) — the tap's `catch {}` is empty.** If `AVAudioFile.write` throws on device, every segment
  ends `frames == 0`, every file is deleted, and every note ships transcript-only with `audioFilename == nil`
  — **indistinguishable from pre-Task-8 broken behaviour, with zero telemetry.** That is exactly the failure
  the wave's headline device check targets, and the device pass would have nothing to read but absent files.
  Emit `voice.audio_write_failed reason:"write"` from the zero-frames branch. **A failure we cannot diagnose
  is worse than one we can.** — If wrong: one extra analytics event per failed segment.
- **#1 (Important) — the sheet half of N1.** `endAbandonedNote()` publishes the segment but nothing reads it:
  the recognition-error catch never calls `finish()`, so a real 40-second recording sits in the media dir
  **with no referrer** (never deleted — `frames > 0` took the publish branch) while `attach()` labels the note
  `"designer"`, i.e. hand-typed. One line in `begin()`'s catch.
- **#8 (Low)** — `endAbandonedNote` nils `request`/`task` without `endAudio()`/`cancel()`, leaving an
  `SFSpeechRecognitionTask` in flight ~a minute holding the XPC session. Mirror `finish()`.
- **#3 (Low, comment honesty)** — the `reopenInFlight` latch cannot work as its comment claims: the
  notification drains on a **later** runloop turn (posted from an internal thread, observer on `.main`), by
  which time `defer` has cleared the flag. The format guard carries all the protection. Correct the comment
  — this wave has been strict about exactly this class.

**DEFERRED TO DEVICE PASS:**
- **#2 (Important) — the format-delta guard may skip a legitimate same-format route change.** Apple's
  contract invalidates taps after a config change *regardless* of format equality, and built-in mic → wired
  headset is commonly the same 1ch/48 kHz. If the node then stops delivering buffers the failure is total and
  silent: no writes, and — because rotation is driven only from the tap — no rotation either, so the
  recognizer dies at its ~60 s cap. **But** whether the node actually stops is unknown without hardware, and
  hardening blind risks suppressing a legitimate reopen or reintroducing the fan-out just closed. → explicit
  device-pass step: **wired** headset mid-note, assert audio runs to the end and the transcript is not
  truncated at ~60 s.

**ROUTED TO TASK 15** (its surface): **#6** `attach()` can fire before `result` lands — `end()` clears
`isRecording` synchronously while `result` is assigned in a detached `Task`, so a fast tap attaches with
`result == nil` and the new `?? "designer"` labels a genuine voice note as hand-typed with a nil filename;
**#7** the sheet still reads RECORDING after the cap (`continuation.finish()` exits `for try await` normally).

**PARKED:** **#5 (Important)** the unsynchronised `audioSegments` / `segmentStartedAt` / `latestTranscript`
triple — real, same hazard class the `requestBox`/`taskBox` locks closed, but it wants one coherent change
putting all per-note mutable state behind a single lock; a design pass, not a patch, and not a Wave 1
blocker. **#9 (Low)** `shouldEnd` is now fed a count of only segments that took audio, so the 24-segment arm
weakened; 24 × 50 s ≈ 20 min makes the arms near-redundant, but the unit-tested policy's semantics changed
without its test changing.

⚠ Reviewer note carried to Task 18: `✔ tests` runs the **CaptureKit** scheme, which does **not link**
`SpeechVoiceNoteService.swift`. It is compile evidence only. The green `VoiceRecordingPolicyTests` assert the
policy constants, **not** that this file honours them.

Device-pass additions from this review (ranked): a 15 s note's `.m4a` must be **> 20 KB** — a header-only
file is ~1 KB, so a size floor distinguishes "wrote" from merely "opened"; N2's crash sequence must also
assert note 2's first segment is **non-empty**, proving the second `installTap` delivers buffers rather than
merely not trapping; interruption `.ended` **without** `.shouldResume` (leaves `noteIsActive` true, engine
stopped, no rotation, no cap, sheet still RECORDING, and **no analytics marks it**); instant tap-release must
also assert a subsequent real note still gets index `-000` and syncs, proving index reuse after a delete.

- Task 11: implementer DONE (sonnet), commit `3e6022e87`. Review dispatched, agentId `a6974a6b7eca382ec`.
- Task 12: implementer dispatched (haiku), agentId `a3d8087bb84f4e22e`.
- Task 8: fix round 3 dispatched (#4, #1, #8, #3).

- Task 12: implementer DONE (haiku), commit `d69e9e596` "fix(ios): stop promising bulk routing the tray
  never did" — one file, +12/−2. Gates ✔ build ✔ tests ✔ lint; swiftlint zero violations. Confirmed
  `sync.routeAll` NOT wired and its only caller is still `V2CullDeckScreen.swift:238`. Review dispatched
  (haiku), agentId `a6d252a9d045427f4`, with that claim named as the one check it must verify itself.
- Task 14: implementer dispatched (sonnet), agentId `a1ae0a0e95accd038`.

Ruling (lane scheduling): **Task 14 was dispatched ahead of Task 13** even though the plan orders 13 → 14.
Task 13 adds a NEW file (`FieldReachability.swift`), which makes `generate_project.rb` re-mint every target
UUID and rewrite both schemes. Task 8's fix round 3 is still running its own gate, and two concurrent
generator runs against one `project.pbxproj` is the one collision this wave cannot cheaply recover from.
Task 14 adds no file, so its generator run is a no-op on the pbxproj and it can safely overlap. Task 13 goes
next, alone in the iOS lane. — The plan's own §8 note says every task except 8/15/16/17 can be re-ordered
freely. — If wrong: nothing; 13 and 14 are independent of each other.

### Task 11 review (sonnet) — ✅ Approved

Verified the whole four-file scope, no forbidden symbols, no `routeAll`, no pbxproj churn. Two findings I
want on record because they are *good* observations rather than defects:

- The reviewer proved `placeFromCard()` deliberately not clearing `cardSpecimen` is **coherent, not lucky**:
  `Specimen` is a SwiftData `@Model` fetched through the same `store.context` in both the card and S1, so
  `specimen.venue = venue` inside `persistRouting()` reflects back onto the object the card overlay holds —
  which is what makes "3 taps, back to the camera with the line updated" actually work.
- It cleared the two-`.primary`-buttons smell properly: `kind: .primary` maps to `PatinaButtonStyle.clay`,
  a plain full-width capsule with **no** default-action trait or layout assumption, so a second one breaks
  nothing structurally or for VoiceOver.

- Task 11: minor (deferred): the report's claim that the new `@AppStorage("capture.routingSource")` handle
  "mirrors the existing `routingSpecimenId` S1↔S2 handle" is **false**. `routingSpecimenId` is never cleared
  by its reader — safety comes from S1 unconditionally *overwriting* it on every load
  (`S1AssignVenueScreen.swift:173,263`), a producer-refreshes-before-every-read pattern. The new handle is
  genuinely consume-and-clear **by the reader** (`:267-268`), written once from a different file that never
  rewrites it. A legitimate and arguably cleaner design — but the rationale leaned on a precedent that does
  not hold.
- Task 11: minor (deferred): the report carries **no timings at all** for build/tests/lint, so it cannot be
  positively cleared of copy-paste risk — only noted as unfalsifiable. Ask for durations in future briefs.

Ruling: **the swipe-to-dismiss gap on S1 is PARKED and routed to the device pass, not fixed now.** The
reviewer found no `.interactiveDismissDisabled` anywhere on this path, so a user can drag S1 away without
hitting ✕ or Done — and `persistRouting()` never runs, which is *the very bug this task exists to fix*,
surviving through a third exit the brief never mentions. I am not fixing it here because the only sheet
presenter is the **root `.sheet(item:)` over every `CaptureSheet` case**, so disabling interactive dismissal
would either affect every sheet in the app or require touching the frozen navigation registrar that was
explicitly out of scope. The device pass will also tell us whether the gesture is even reachable on this
`.presentationDetents([.large])` sheet. → device-pass step: **swipe-dismiss S1 and observe whether the
placement survives.** — If wrong: one more exit silently drops a placement, exactly as today; no regression.

- Task 11: **complete** (commit `3e6022e87`, review Approved, 2 minors deferred, 1 parked with a ruling).

### Task 12 review (haiku) — ✅ Approved, zero findings

Independently verified the one constraint that mattered: `sync.routeAll` exists at
`CaptureSyncService.swift:114`, is covered by `CaptureLifecycleTests.swift:557`, and its **only** UI caller
is still `V2CullDeckScreen.swift:238`. Zero new calls. Also confirmed the count and the selection use the
**identical** predicate (`venue?.projectId == nil`), so the button cannot say "Place 3" and then open a
record that is already placed.

- Task 12: **complete** (commit `d69e9e596`, review Approved, 0 findings).

### Task 8 fix round 3 — COMPLETE at `8b6d34014`

`fix(ios): say why a voice segment took no audio, and give an errored note a referrer`. Final re-review
dispatched.

Task 8 round-3 detail (coordinator-confirmed): `voice.audio_write_failed` now carries
`reason: "write"` (buffers + a 120-char detail) or `reason: "empty"` (buffers; **0 = instant release,
>0 = the format guard rejected every buffer** — two very different failures, now distinguishable).
Sheet stream-error path awaits `finish()`; `endAbandonedNote` ends audio and cancels the task;
`reopenInFlight` comment corrected; a `large_tuple` lint became a private `ClosedSegment` struct.

Ruling: **always emitting on empty is ACCEPTED**, rather than only on a thrown write. — Absence of an event
never needs interpreting: with always-emit, Task 18 reads a *present* event and knows which failure it has;
without it, a silent recorder and a silent room look identical in PostHog. — If wrong: one event per
genuinely-empty note, which is the cheap direction to be wrong in.

→ **Task 18 device step 2 now checks PostHog for `voice.audio_write_failed reason=write` on a normal 15 s
note.** That single query is what separates "the recorder is broken" from "the room was silent" — the
distinction no gate in this wave can make.

### 🔴 STALE SHARED-DB LOCK — detected and released by the conductor

The Task 10 implementer stalled mid fix round 3 **while holding the shared local-Supabase lock**.
`/tmp/patina-local-supabase-db.lock` read `field-companion-w1 task-10-fix3 2026-08-25T03:26:51Z pid=19082`;
`ps -p 19082` returned nothing — **the PID was dead** — and the lock had sat for ~53 minutes while the stack
(13 containers) stayed up. Its two files were modified and uncommitted, untouched for the same 53 minutes.

Ruling: **released the stale lock.** The lock protocol exists to arbitrate a shared resource between
sessions; a lock held by a dead process is not arbitration, it is a denial of service against every other
worktree on this machine. Verified dead-by-PID before removing, rather than trusting the age alone. — If
wrong: a live process loses its claim mid-reset, which would show up as a failed migration replay, not data
loss (the stack is local and disposable).

Lesson, and this is the second time this failure mode has cost the wave time: **a subagent that backgrounds
work or waits on a notification simply stops, and if it is holding a resource, the resource stops with it.**
Task 2 lost 12 minutes this way; Task 10 lost ~53 and blocked a shared stack. Every brief already forbids
background jobs — for any future lane that takes a lock I will also **check liveness by PID whenever a lock
is older than a few minutes**, rather than assuming the holder is working.

The Task 10 implementer has been nudged with the open items enumerated, and told not to assume it still
holds the lock.

- Task 14: implementer DONE (sonnet), commit `b29b4e245`. Review dispatched, agentId `aef325df52e378ab9`.
- Task 13: implementer dispatched (sonnet), agentId `a8a2f132cb3646e32` — alone in the iOS lane because it
  adds `FieldReachability.swift` and therefore re-mints every target UUID.
- Task 8: final re-review of round 3 dispatched (opus), agentId `a37e0e3c930b76fab`.

### Task 14 review (sonnet) — ✅ Approved, no Critical/Important

The toast trap is genuinely closed: the reviewer grepped the **whole file**, not just the diff hunks, and
confirmed `self.toast` is assigned exactly twice in `stopVoice` — `:149` (early-return failure) and `:168`
(success, after every `await`) — on **mutually exclusive branches**, never twice on one path. That was the
one way this task could have silently failed, and it was checked the right way.

Also verified independently: guard (`:138`) and copy (`:155`) key off the **same** `transcript` local, so
they cannot disagree about what "has text" means; the has-audio test reads `result.audioSegments.isEmpty`,
not `audioFilename`; and the three ESCALATE `Text` lines' `.font`/`.foregroundStyle` chains are
**byte-identical** to the pre-diff source with only the string literals changed — the specific way a literal
replacement would have silently dropped styling.

Copy verified honest: no "AI", neither withdrawn framing ("Maple St", "stay with this scan session"), and
"the audio is here" / "Note saved to this room" match what the code actually does — it enqueues through the
outbox to `field_captures`, readable in the Room File.

- Task 14: minor (deferred): the report's gate transcript is **elided with `...`** around each checkmark and
  carries no timestamps or durations, so a genuine run cannot be distinguished from a reconstructed summary.
  Low risk here (literal-only Swift changes plus one easily-eyeballed control-flow restructure), but this is
  the second report to arrive without timings. **Every remaining brief now asks for durations explicitly.**
- Task 14: **complete** (commit `b29b4e245`, review Approved, 1 minor deferred).

Device-pass additions from this review: force a genuinely empty `result.transcript` **and** empty
`partialTranscript` while `audioSegments` is non-empty — the exact real-world condition, unforceable in the
Simulator; assert the toast reads exactly "We couldn't make out the words — the audio is here." **and is
still on screen a moment later**; separately assert the "Nothing was recorded — try holding the mic a moment
longer." branch still fires when transcript *and* audio are both empty, so the else-branch is proven not to
have regressed.

### Task 8 round-3 re-review (opus) — all 4 ADDRESSED; 1 new Important introduced BY MY OWN FIX

#4, #1, #8, #3 each verified properly. The write-failure telemetry is genuinely off the render thread: the
tap does one integer increment and, only on a throw, retains the **first** `Error` unformatted — no
formatting, no analytics, no allocation on the tap — converted under the lock at close time and emitted
outside it, once per segment (enforced by `segment = nil` inside the same `withLock`). The reviewer audited
**every** caller of `closeCurrentSegment` to prove none runs on the render thread. `finish()`'s idempotency
against `endAbandonedNote()` verified in **both** orders. The corrected `reopenInFlight` comment verified
clause by clause and is now true.

🔴 **New Important — introduced by my own fix #1.** `AsyncThrowingStream`'s builder closure runs
**synchronously**, so an `audioEngine.start()` failure finishes the stream *before*
`startLiveTranscription()` returns. The sheet's catch fires and `:184` now sets `result` to a real-but-empty
`VoiceNoteResult`. The user then types the note by hand and `attach()` evaluates to **`device_partial`**
with a non-nil duration — precisely what the comment three lines above forbids: *"Labelling it
device_partial would claim speech and imply audio."* Before this round `result` stayed nil and the note was
correctly `designer`. Nothing is orphaned; only the provenance label lies. Also reachable by any recognition
error arriving before the first partial — which the device pass's own airplane-mode check provokes directly.

Ruling: **fix it, one line, round 4** — fall through to `designer` when the result carries neither
transcript nor segments, while keeping a genuine partial recording labelled `device_partial`. **Both halves
matter**: round 3's whole point was that a real 40-second recording behind a recognition error must attach
as `device` with its segments, so over-correcting into `designer` would undo it. — If wrong: a hand-typed
note is attributed to the device, which is the lie this wave exists to stop.

Lesson worth keeping: **this is the third time a fix in this task introduced a new defect in the lines it
touched** (round 1 → N1–N5, round 2 → nine, round 3 → this). The re-review loop is earning its cost on this
file specifically, and that is a fact for the wave report — Task 8 is app-target AVFoundation code with
**no unit test and no device pass**, so adversarial reading is the only correctness mechanism it has.

Parked from this round: no note-identity guard on the sheet's late `finish()` (destructive half pre-exists;
`manualFallback` makes a same-sheet restart impossible); `analytics.event` can now fire from `deinit`;
`buffers` is counted **before** the format guard, so on `reason: "write"` it means "buffers that reached the
segment", not "writes attempted" — carried to Task 18 so nobody misreads it.

🟢 **Gate evidence verified genuine, and this is the standard I want.** Five `capture-gate.sh all` runs
quoted with distinct timestamps (22:35:42 → 23:15:34), distinct xcodebuild PIDs (28042, 44506, 53058, 56859,
69986) and distinct elapsed values (2.496 / 2.480 / 2.489 / 2.509 / 2.694 s) — consistent with real separate
runs, not copy-paste. The report also **discloses an intermediate FAILING run** (`✘ swiftlint`,
`large_tuple`, which is why `ClosedSegment` is a struct) rather than hiding it.

**The `voice.audio_write_failed` reason taxonomy is now Task 18's diagnostic key** — its mere presence on a
normal 15 s note means the recorder is broken, because a silent room still writes frames and publishes a
filename: `reason=write` + `detail` = the write threw (**the failure this round exists to surface**);
`reason=open` = the AAC settings were rejected, no file ever existed; `reason=empty` + `buffers=0` = instant
tap-release, benign; `reason=empty` + `buffers>0` = every buffer rejected by the channel/sample-rate guard,
the expected AirPods signature; `reason=resume` / `reason=route` = the interruption-resume or
configuration-change reconfiguration threw.

- Task 8: fix round 4 dispatched (one line). Instructed to stage **only** `VoiceNoteSheet.swift` — another
  lane is adding a new `.swift` file, so a dirty pbxproj here is that lane's generator output and committing
  it would capture a project referencing an uncommitted file.

- Task 13: implementer DONE (sonnet), commit `ab09ea50d` "feat(ios): render the offline banner and drain on
  reconnect". Gates ✔ build ✔ tests ✔ lint (~33 s); swiftlint clean (~0.15 s). New file
  `Capture/Services/Resilience/FieldReachability.swift`. Review dispatched, agentId `ac4cb7dba0f6ad627`.
  Declared: the brief's `outboxDepth` snippet referenced an `activeOwner` that **does not exist** on
  `ViewfinderModel`, so a private computed property was added claiming to mirror
  `LocalCaptureSyncService.swift:714` — the reviewer must verify that precedent is real and the mirror
  faithful, since an owner-scoping mismatch would make the banner count the wrong set. Also: no explicit
  `.animation()` on the banner transition (brief omitted it) → device pass; `CaptureKit.xcscheme` came back
  clean so it was left unstaged → reviewer confirms it genuinely had no diff rather than being dropped.
- Task 16: implementer dispatched (sonnet), agentId `ab2b900731ec24772`.

Ruling (Task 16 safety framing carried into the brief): **deleting a segment after its commit receipt is
only safe because Task 6 landed the `missingRequiredMedia` exemption and Task 9 landed the writer that
stamps `voiceAudioRemotePathsRaw`.** So the deletion predicate is "the remote path is actually stamped" —
**the stamp is the receipt** — not "the upload appeared to succeed". If a file cannot be proven receipted, it
stays. Without that, deleting a local file would make the note permanently un-syncable: the exact failure
class this wave has now fixed four separate times. — If wrong: media accumulates on the phone, which is the
harmless direction.

⚠ Task 15 is BLOCKED behind Task 8's fix round 4 — both own `VoiceNoteSheet.swift`. Task 17 is blocked
behind both. Task 16 was dispatched now because it touches neither.

### Task 10 — original implementer confirmed DEAD; fresh implementer dispatched to finish

The nudge did not wake it. Files untouched for **~1 hour** (22:26 / 22:29 → 23:23). I inspected the
uncommitted work rather than discarding it, and almost all of the fix round is already done:

| Item | State |
| --- | --- |
| `detached_shelf` on both conflict objects | present (2 occurrences) |
| `projection_errors` machinery | present (13 occurrences) |
| Policy **predicate** assertions replacing the count-only check (finding 9 sub-part 4) | present (11 `qual`/`with_check` hits) |
| 51 `ASSERT`s in the test file | present |
| **Non-contiguous `-000`/`-002` segment case** | **ABSENT** — zero `-002` hits |

Ruling: **finish the work rather than re-run the round.** ~200 lines of correct SQL sit in the tree; a fresh
implementer adding one test case, verifying and committing is far cheaper and lower-risk than discarding and
re-deriving it. The new implementer is told to **verify my summary rather than trust it** — if the tree does
not match, it reports before proceeding. — If wrong: the tree contains something half-finished I misread,
which the full-suite run and the scoped re-review both catch.

It also carries the lock protocol with an explicit **staleness check by PID** — the exact failure that cost
this lane an hour — plus the standing constraints: nothing pushed to Strata (00516 is on `main` but not yet
applied to prod, so 00530 cannot precede it), and nothing in that suite proves RLS because the runner is
superuser.

- Task 8: fix round 4 DONE, commit `ed338d649` "fix(ios): a note with neither words nor audio is the
  designer's, not the device's". Closes the `device_partial` mislabel my own round-3 fix introduced.
- Task 10: fresh implementer dispatched (sonnet), agentId `a2f9bb6d306edd211`.

⚠ Task 15 remains blocked: it adds `VoiceSegmentPlayer.swift` and Task 16 is mid-flight adding two new
files — two concurrent generator runs re-minting the same `project.pbxproj` is the one collision this wave
cannot cheaply recover from. Task 15 goes next, alone. Task 17 follows it.

### Consolidated device-pass specification written

`<workspace>/device-pass-spec.md` — 36 numbered, concrete assertions assembled from every review in the wave.
**It supersedes the plan's original 11-step script** and is what Task 18 will execute.

Ruling: **the plan's device script was not sufficient and is replaced.** Three of its steps said "verify it
works" where the real failure is silent — e.g. the AirPods step said "does not trap", but the actual risk is
that audio stops mid-segment while recognition continues, which only an `afinfo` duration-vs-wall-clock
comparison catches. Every item in the replacement names what to measure and what value proves it. — The plan
itself is the argument, the spec is the authority, and reviewers found failure modes the plan predates. — If
wrong: the pass takes longer than budgeted, which is the right direction to err for the only correctness
mechanism the wave's core has.

Its opening section states plainly **why** it carries this weight: `capture-gate.sh test` runs the CaptureKit
scheme, which does **not link** `SpeechVoiceNoteService`, `LocalCaptureSyncService`, `VoiceNoteSheet`,
`ViewfinderModel` or any screen — so every green gate on the wave's core files is compile evidence only; the
passing `VoiceRecordingPolicyTests` assert the policy's constants, not that the recorder honours them; and
Task 8 needed four fix rounds, three of which introduced a fresh defect in the lines they touched.

### Task 13 review (sonnet) — ❌ Needs fixes. 1 Critical, 1 Important. Both inherited from MY brief.

Verified correct: `outboxDepth` genuinely traces to `CaptureStore.outbox()` (`:426`), which excludes
fully-synced `.committed` rows — **the central "12 synced captures must read 0, not 12" case is right**,
independent of owner scoping. `activeOwner` is a faithful mirror of `LocalCaptureSyncService.swift:714-717`.
`restored = online && !isOnline` ordering traced through cold-online-launch and a real transition: no
spurious first-launch drain, exactly one `onRestore` per restore. `onRestore` always runs inside
`Task { @MainActor in }`, never on the background queue. `[weak self]` avoids the monitor retain cycle.
pbxproj set-difference: exactly one `.swift` addition, zero removals; `Capture.xcscheme`'s new
`BlueprintIdentifier` matches the regenerated target UUID **exactly**, so staging it was right, and
`CaptureKit.xcscheme` genuinely has zero diff. Task 11's `onPlace:`/`placeFromCard()` untouched.

🔴 **Critical — `FieldReachability.start()` has no re-entrancy guard, and `.task` re-fires on ordinary
navigation.** `NWPathMonitor.start(queue:)` is **call-once** per Apple's contract; a second call yields a
"set queue after starting" failure and the monitor cannot be restarted, only replaced. SwiftUI's `.task`
cancels and re-runs on every view **reappearance**. The reviewer proved this screen really does cycle, using
the neighbouring code as evidence: `ViewfinderModel.start()` (`:85-103`) is *deliberately written to be
re-callable* — re-deriving `visitID`, re-cancelling `frameTask`, re-checking `Task.isCancelled` after an
`await` because `stop()` may have run meanwhile — and `openSessionTray()` **pushes** via
`coordinator.navigate(to: .session)`. So swipe up to the tray and back and it fires again. This is the
everyday "check the queue, go back to shooting" loop the banner exists to serve.

🔴 **Important — the owner-unresolved fallback is fail-OPEN where its precedent is fail-CLOSED.**
`outboxDepth` falls back to the **unscoped device-wide** `store.outbox().count` whenever `activeOwner` is
nil, regardless of sync mode. `scopedOutbox` (`:718-724`) falls back only when `remote == nil` (mock);
with a real backend and owner resolution failing it returns `[]`. `CaptureOwnerIdentity.init?` is failable
on empty `userID`/`workspaceID`, so nil-owner-with-live-session is reachable during session hydration — and
the banner would then report **every specimen ever captured on the device, including another designer's
queued work on a shared phone**. Same class as the sessionCount lie, reached through owner resolution.

⚠ **Both defects are in the brief's own snippet — which I wrote — not implementer deviations.** Recorded
because a wave that has been this strict about false claims should be equally exact about attribution.

Ruling: **fix both.** The Critical is a plausible crash in the most ordinary interaction on the screen; the
Important is the banner lying about whose work is queued, which is precisely what this task exists to
prevent. — If wrong on the Critical: an idempotency guard costs one Bool. — If wrong on the Important: a
correctly-scoped banner reads 0 during hydration instead of a device-wide count, which is the honest
direction.

Parked: no `.animation()` bound to `isOnline` (banner may pop rather than slide — a judgement best made by
eye, → device pass); `FieldReachability` declared `public` in an app target where siblings are internal
(inert, style only). Both also inherited from the brief.

- Task 13: fix round 1 dispatched. Told not to stage pbxproj/schemes — it adds no file, so any dirt there is
  the concurrent Task 16 lane's generator output.

### 🔴 SECOND ROUTING FAULT — registry corrected, and the root cause named

Task 13's fix round went to `a8a2f132cb3646e32`, which is the **Task 14 REVIEWER**, not the Task 13
implementer. It correctly refused the work ("this is not my task — I was launched as the read-only reviewer
for Task 14"), tried to decline, and could not, because it had no `ListAgents` tool and `general-purpose`
is a type label, not an address.

**Root cause, and it is the same one both times:** when I dispatch two agents in **one message**, the two
returned agentIds map to the two tool calls **in the order they appear**. I recorded that pair swapped. The
first call in that message was the Task 14 review, so:

| Task | Role | agentId | (previously mis-recorded as) |
| --- | --- | --- | --- |
| 13 | implementer (sonnet) | **`aef325df52e378ab9`** | ~~a8a2f132cb3646e32~~ |
| 13 | reviewer (sonnet) | `ac4cb7dba0f6ad627` | — |
| 14 | implementer (sonnet) | `a1ae0a0e95accd038` | — |
| 14 | reviewer (sonnet) | **`a8a2f132cb3646e32`** | ~~aef325df52e378ab9~~ |
| 16 | implementer (sonnet) | `ab2b900731ec24772` | — |
| 10 | finisher (sonnet) | `a2f9bb6d306edd211` | — |
| 8 | implementer (opus) | `a358ccfb3bf160042` | — |

**New rule for the rest of the wave:** after a multi-agent dispatch, write the ids down by pairing the Nth
result to the Nth tool call **before doing anything else** — and when resuming, state the task name in the
message's first line so a mis-addressed recipient can refuse fast, as this one did. The refusal cost ~12
minutes of a reviewer's budget; it cost no code, because the recipient checked its own identity rather than
attempting unfamiliar work. That is the behaviour that made this cheap.

No harm done: the Task 14 review stands as delivered (Approved), and no Task 13 file was touched by the
wrong agent.

- Task 16: implementer DONE (sonnet), commit `303a5f079` "feat(ios): give capture media a lifecycle on the
  phone". **315/315 CaptureKit tests** (9 new: 5 `MediaRetentionPolicyTests` boundary + 4
  `CaptureStoreMediaRetentionSweepTests`); RED reproduced genuinely as a compile error before restoring;
  GREEN `capture-gate.sh all` 25.0 s, `swiftlint --strict` 0.15 s, both sandbox-disabled per the known
  hazard. Review dispatched (sonnet), agentId `a844c4b49a0c3658b`.

Ruling: **the implementer's deviation from the brief's literal 16.1 snippet is ACCEPTED and is the better
reading.** It filtered deletion to only filenames actually stamped in `voiceAudioRemotePathsRaw`, because
the brief's unconditional version had **no textual proof-of-receipt for lost segments** — i.e. my own snippet
would have deleted a file the outbox might still require. That is exactly the safety property I named in the
brief's prose ("the stamp IS the receipt"), and the implementer noticed the snippet contradicted the prose.
Sent to the reviewer as a named risk to judge on the code rather than on the rationale. — If wrong: media
accumulates on the phone, the harmless direction. — Third time in this wave a defect has been found in the
brief's own code rather than the implementer's work (Task 13's double-start, Task 13's fail-open fallback,
this).

### Task 13 fix round 1 — DONE at `d68bb0b60`

`fix(ios): guard reachability double-start and fail-closed the outbox fallback`. Two files, +16/−1.
Gates clean on first attempt: `capture-gate.sh all` 23:32:07, 14.810 s, ✔✔✔; `swiftlint --strict` 23:32:26,
0.150 s, clean. pbxproj/schemes stayed clean (no `.swift` added/removed), and the concurrent lane's three
files were correctly untouched.

- **Double-start:** chose the idempotency `started` flag over hoisting to `AppContainer` — smaller, and it
  keeps the defect's fix in the two files that already own it. `self.onRestore = onRestore` still runs on
  **every** call; only `monitor.start(queue:)` and `pathUpdateHandler` are guarded. That is the coherent
  choice: a later `.task` re-fire refreshes the callback (which may close over fresh state) without
  re-starting a monitor Apple says cannot be restarted.
- **Fail-closed fallback:** `outboxDepth`'s nil-owner branch now returns
  `AppConfiguration.runsRealServices ? 0 : store.outbox().count` — mirroring `scopedOutbox`'s
  mock-fallback / real-fail-closed split via the model's existing real-vs-mock gate. Scoped re-review
  dispatched (sonnet), agentId `a80bb816ad055ee29`.

⚠ Third instance of the same messaging failure: the implementer tried to reply to `from="general-purpose"`
and got `No agent named 'general-purpose' is reachable`, with no `ListAgents` tool to resolve it. **Subagents
in this setup cannot address me back by name** — they report through their completion, which works. Nothing
to fix; recorded so the pattern is not mistaken for a stuck agent.

- Task 15: implementer dispatched (opus), agentId `abb657447dfcf7edb`. Carries three findings routed from
  other tasks' reviews, all in `VoiceNoteSheet.swift`: `attach()` firing before `result` lands (labels a
  genuine voice note `"designer"` with a nil filename); the sheet still reading RECORDING after the cap
  (`continuation.finish()` exits `for try await` **normally**, so the catch never runs); and `finish()`'s
  duration measured from `startedAt`, over-reporting for a note released after the cap.

### Task 13 re-review (sonnet) — all findings addressed, no new breakage. COMPLETE.

**Critical ADDRESSED.** The `started` guard returns before `monitor.start(queue:)` and before reassigning
`pathUpdateHandler`. The reviewer verified the guard is genuinely exercised rather than theoretically
correct: single call site (`ViewfinderScreen.swift:79`, inside the sole `.task` at `:77`), and `reachability`
is **`@State`-held so the instance persists across `.task` re-fires** — which is precisely what makes a
second `start()` reachable. It also confirmed the unconditional `onRestore` reassignment is coherent, not an
oversight: the `pathUpdateHandler` closure reads `self.onRestore` **dynamically at fire time**, so a later
callback takes effect immediately without restarting the monitor.

**Important ADDRESSED, and the mirror claim was traced rather than trusted.** `outboxDepth`'s nil-owner
branch is now `AppConfiguration.runsRealServices ? 0 : store.outbox().count`. The reviewer proved the two
signals are genuinely equivalent instead of merely similar: `scopedOutbox` gates on `remote != nil`; `remote`
is a `SupabaseCaptureGateway?` injected **only** by `AppContainer.init()` inside the `if real` branch where
`real = AppConfiguration.runsRealServices`, and left nil otherwise; and `runsRealServices` is a
**process-lifetime-stable** computed property driven by launch flags and simulator detection, not session
state. So `remote != nil` and `runsRealServices` are 1:1 for the life of the process.

Behaviour now, stated honestly for the wave report: during the narrow real-mode window before
`session.userID`/`workspaceID` resolve, a designer who loses signal sees "No signal · saving on device" with
**0 queued** — an honest under-report that never leaks another owner's queue, replacing an over-report of
every specimen ever captured on the device. Mock/Simulator mode is unaffected and keeps the unscoped
fallback, which is right: there is no per-owner data to leak there.

Gate evidence verified genuine — distinct wall-clock durations across runs (gate 14.810 s vs the original
33.085 s; lint 0.150 s vs 0.149 s) with real timestamps, consistent with a sequential re-run.

- Task 13: **complete** (commits `ab09ea50d` + `d68bb0b60`, re-review clean, 1 minor parked: no
  `.animation()` bound to `isOnline`, so the banner may pop rather than slide → device pass).

### Scheme/pbxproj consistency — VERIFIED at `d68bb0b60`

The systemic risk I flagged after Task 5 (the generator re-mints every target UUID, and the two shared
schemes embed them as `BlueprintIdentifier`, so staging the pbxproj alone commits schemes pointing at
targets that no longer exist) is **resolved in the committed state**. Checked the committed HEAD directly:

| Scheme | BlueprintIdentifiers | Present in committed pbxproj? |
| --- | --- | --- |
| `Capture.xcscheme` | `4F391845…`, `A676D05C…` | ✅ both |
| `CaptureKit.xcscheme` | `4F391845…`, `A4813490…` | ✅ both |

Committed native target UUIDs: `2C852F69…`, `4F391845…`, `A4813490…`, `A676D05C…` — all four scheme
references resolve. A fresh checkout of this branch gets working schemes.

⚠ **This must be re-verified at Task 18**, because Task 15 adds `VoiceSegmentPlayer.swift` and will re-mint
every UUID again. The check is cheap and belongs in the wave gate:
`git show HEAD:…/Capture.xcscheme | grep -o 'BlueprintIdentifier = "[A-F0-9]*"'` against
`git show HEAD:…/project.pbxproj | grep -B1 "isa = PBXNativeTarget"`.

### Task 16 review (sonnet) — ✅ Approved, no Critical/Important

**The deviation is confirmed correct and SAFER than my brief's literal snippet.** `applyCommitResult`'s
`receiptedSegments` set uses the identical `split(separator: "/").last` basename convention as the
pre-existing `missingVoiceSegments` (`CaptureStore.swift:534-536`), so "the stamp is the receipt" is applied
**consistently across the codebase** rather than diverging into a bespoke check.

Sweep traced end to end (`CaptureStore.swift:598-613`): initial `guard overage > 0 else { return 0 }`,
per-candidate `guard overage > 0 else { break }`, `overage -= candidate.size` only on confirmed deletion.
The reviewer **manually replayed all three sweep tests against the logic** — 2 deletions of 3 candidates
when a 150-byte overage clears after 200 bytes freed; the unreceipted file is structurally unreachable
because it never enters the candidate list. Ordering key is real filesystem mtime
(`.contentModificationDateKey`), not array order, and the test pins mtimes explicitly to prove it.
Boundary test genuinely bidirectional: `softCapBytes - 1` → 0 and `softCapBytes + 1` → 1, so a broken
`>=`/`>` would fail at least one.

🟢 **Strongest anti-fabrication check of the wave:** the reviewer verified the RED transcript by checking the
cited error location (`MediaRetentionPolicyTests.swift:93:29`) against the **actual current file** — line 93
really is `let deleted = store.sweepMediaRetention(totalBytes: 100)`. And the 9 reported test names exactly
match the 9 `@Test func` declarations present. **Adopt this as standard: verify a cited line number resolves
to the code it claims.**

- Task 16: minor (deferred): **orphaned media files are permanently unreclaimable.** `receiptedMediaFiles()`
  builds candidates purely from `Specimen.photos` / `voiceAudioSegmentsRaw`, so a file with no owning
  specimen counts toward `totalBytes` (inflating the measured overage) but can never be deleted — it could
  keep the app perpetually "over cap" while the sweep does nothing. **Not live today**: the reviewer grepped
  every `CaptureStore.delete(_:)` call site and found only `ViewfinderModel.swift:442` (discard-a-draft); no
  path deletes a specimen after a successful commit. Worth a one-line doc comment. → device pass.
- Task 16: minor (deferred): the basename-matching expression is triplicated near-verbatim
  (`missingVoiceSegments` pre-existing, `receiptedMediaFiles` new, `applyCommitResult` new). Internally
  consistent with no divergence found, but a shared helper would remove the copy-paste.
- Task 16: minor (deferred): the sweep runs on **every** completed drain — including one where `items` was
  empty on the first iteration — so a whole-store `FetchDescriptor<Specimen>` plus a directory listing runs
  on `@MainActor` on essentially every sync tick, not just ticks that freed receipts. Harmless (no-op under
  cap) and matches "invoked after a successful drain" literally; unmeasured. → device pass timing check.
- Task 16: **complete** (commit `303a5f079`, review Approved, 3 minors deferred).

⚠ Device-pass additions: 16.1's deletion path lives in the **app target**, so `CaptureTests` cannot exercise
it at all — record a multi-segment note, let it commit, confirm receipted segments vanish and the note still
plays back. And `sweepMediaRetention()`'s **no-arg** overload (the real filesystem walk) is exercised by
**zero** automated tests — only the `totalBytes:`-injected one is.

### Branch accounting (for the wave report)

⚠ **The merge-base has MOVED.** It is now `8bda5a188671fc1c81442e4900c824dfb899c5c9`, not the
`a72d59f32` this branch was cut from — because `origin/main` absorbed both the 00516 lane and the w05 lane,
which this branch had already merged. Reporting the original base would badly overstate the branch's size.

Honest numbers at `d68bb0b60`:
- **31 commits** that this branch adds over current `origin/main` (`git rev-list --count origin/main..HEAD`)
- **2 commits behind** `origin/main` — main has moved again since the merge
- 48 commits in `a72d59f32..HEAD`, but that count includes everything the two merges brought in and is
  **not** this wave's work

Ruling: **do not chase `origin/main` again.** The one merge this wave performed was necessary — it closed the
00516 lineage gap that made 00530 un-replayable. A second merge now would add churn to a branch about to be
reviewed as a whole, for no correctness gain, and the two new commits are unrelated to Field. The
orchestrator merges at integration time and will take main's current head then. — If wrong: the orchestrator
resolves a small merge, which is its job anyway.

Of the 31, three are inherited rather than authored by this wave (`0a9bd935f`, `26a333631` from w05, and the
`6c1c519e1`/`4cc535f14` merges). **The wave's own work is 27 commits.**

### Task 15 — DONE at `475369a8e`; the report set a new bar

`fix(ios): let N4 keep a wordless note, and let her hear it`. 5 files: `VoiceNoteSheet`, new
`VoiceSegmentPlayer`, `V1SessionTrayScreen`, pbxproj, `Capture.xcscheme`. `CaptureKit.xcscheme` came back
clean — and it **verified both that scheme's `BlueprintIdentifier`s still resolve in the regenerated
pbxproj** before leaving it unstaged, which is exactly the check I added to the wave gate.

🟢 **It distrusted its own green gate.** `✔ tests` returned in 10.142 s, which it judged too fast to be a
real suite run, so it re-ran the test leg directly: swift-testing (not XCTest) reported
`✔ Test run with 315 tests in 45 suites passed after 1.183 seconds`. It also disclosed an intermediate
**failing** run (CoreSimulator `permissionDenied`, re-run unsandboxed). That is the standard.

Findings routed to it from other reviews: **#1** fixed with an `isFinishing` latch (chose disable-until-landed
over await-in-attach) and **extended to the manual-fallback bar**, which has the identical race — disclosed
as a scope stretch for the reviewer to judge; **#2** fixed by falling through the stream loop to `end()`,
which self-guards on the release path.

Ruling: **#3 (duration measured from `startedAt`) correctly NOT fixed here — routed to Task 17.** The
implementer's reasoning holds and I am adopting it: the one-line fix lives in `SpeechVoiceNoteService.swift`,
outside Task 15's fence, and a **sheet-side clamp would make the specimen and the `voice.finish` event
disagree while leaving the F2 surface still wrong**. Task 17 owns that file under P-1 and fixes it at the
source, where both readers get the same number. — Refusing to reach across a fence into a file another lane
owned, and saying why, is the behaviour that has kept this wave's concurrent lanes from colliding. — If
wrong: a capped note over-reports its duration for one more task's duration.

- Task 15: review dispatched (opus), agentId `a87303b030045c583`.
- Task 17: implementer dispatched (sonnet), agentId `a230e762f07c23a64` — carries the P-1 `emitFinish(reason:)`
  unification, the duration fix routed from Task 15, and the warning that **Task 6's parked "onDevice is a
  dead property" finding REVIVES if `on_device` does not actually appear on a `voice.finish` event.**
  Task 17 is that property's only reader; if it fails to read it, the reviewer was right and I was wrong.

### Task 17 — DONE at `35000744b`; the `onDevice` override is VINDICATED

`feat(ios): emit wave 1's voice and placement telemetry`. Gates green; `✔ tests` 315/45 suites **confirmed
via a direct re-run** (the standard Task 15 set); one trailing-comma lint violation fixed en route.

🟢 **Conductor-verified directly, because a parked finding hung on it.** Task 6's reviewer called `onDevice`
a dead property — declared, never written, never read — the same test that excluded `voiceAudioSha256` from
this wave. I overrode it on the grounds that Task 8 produces the value and Task 17 is its only reader. It is:
`SpeechVoiceNoteService.swift:208` stores `onDeviceRecognition = recognizer.supportsOnDeviceRecognition`,
`:270` passes it into the `VoiceNoteResult`, and `emitFinish` at `:286-293` emits
`"on_device": String(onDeviceRecognition)` — **the stored resolved value, not a capability re-read**.
P-1's unification landed too: the two disjoint emissions are gone, replaced by `emitFinish(reason:)` called
from `:265` (`"manual"`) and `:496` (`"cap"`). **The parked finding does NOT revive.**

Ruling: **the duration fix landed at the source, as Task 15 argued it should.** `:276` documents that the
`VoiceNoteResult` and `emitFinish()` report the same number "so the two can never disagree" — which is
exactly the reason Task 15 refused to clamp it sheet-side. The routing decision was right.

Three implementer concerns, sent to the reviewer to judge:
- `reason: "manual"` is its own naming choice, not plan-specified → Task 18 confirms the literal.
- **`capture.placed`/`capture.unplaced` fire only from `ViewfinderModel.saveFromCard()`'s successful-route
  branch**; the S3/undecided-destination commit path was outside its four-file fence and is uninstrumented.
  The plan calls these "the program's headline metric and the size of the roving hole" — if the unplaced
  path is instrumented on only one of several commit routes, **the metric under-counts in a way Task 18 must
  know about.** Flagged to the reviewer as the finding most worth judging.
- No device pass; none of the four files is linked by `CaptureTests`.

- Task 17: review dispatched (sonnet), agentId `a786f455cfddfaca9`, asked to produce **a table of every event
  name and property key** as the artifact Task 18 queries PostHog against.

### Task 15 fix round 1 — DONE at `0173f9d08`; my own suggested fix was WRONG

`fix(ios): make N4's Discard actually delete, and stop the player lying`. All 7 items actioned; 5 parked
items untouched. Gates foreground, no intermediate failure: `capture-gate.sh all` 23:52:59→23:53:13,
**14.285 s**, ✔✔✔; `swiftlint --strict` **0.135 s** exit 0; test leg re-verified
`315 tests in 45 suites … 1.170 s`. Staged the three sources only — no pbxproj/schemes, verified clean.

🔴 **My suggested fix for #5 was wrong and the implementer caught it.** I proposed gating `.onChanged` on
`!isFinishing && result == nil`. But `result` is **non-nil after any completed take**, so that gate would
have blocked re-recording entirely — turning a mid-hold-restart bug into a can-never-record-twice bug. It
used a `gestureHeld` latch instead. **Fourth defect this wave found in my own instructions rather than an
implementer's work.**

Ruling: **`always await voice.finish()` ACCEPTED over the conditional I offered.** The implementer's
reasoning is better than mine: the conditional `(isRecording || isFinishing || result == nil)` *enumerates*
the ways `result` is untrustworthy, and **this task has twice been bitten by an unenumerated member of that
set** — the finish-window race and the cancel-ordering race. Unconditional is safe because `audioSegments`
accumulates and resets only in `startLiveTranscription()`, so a second `finish()` returns the identical
list and a never-recorded note returns empty. — Preferring a total rule over an enumerated one, in a
function whose *only* job is deletion, is the right instinct. — If wrong: one redundant `await` on discard.

It also confirmed my ordering analysis: `cancel()` really does resume the loop into `end()` ahead of
discard's Task, so the cap fix really had turned the live branch into dead code.

Other choices: `begin()` now resets `result = nil` + `player.stop()`; session activation hoisted into
`play()` behind a guard (which also closes most of parked #7 — a session failure was indistinguishable from
an unreadable file); `stop()` deactivates with `.notifyOthersOnDeactivation`; `.onDisappear` at both render
sites; #9's single source is the `transcript` local; #6 took the own-Button option, keeping the trailing
block a real button for VoiceOver at the cost of two announced elements per row.

⚠ **Device-pass note that only the implementer could have known:** the broken Discard was **invisible in the
UI** — the sheet dismissed identically before and after. So the pass must tap Discard *inside the finish
window* and then **list the App Group media directory**. A visual walk would have passed a completely broken
deletion. Added to the device-pass spec.

- Task 15: scoped re-review dispatched (opus), agentId `a5d16f25698d02921`, on a path-scoped diff excluding
  Task 17's interleaved commit.

### 🔴 SECOND stale lock on the SQL lane — and the conductor finished Task 10 itself

The replacement finisher **also died**, holding the lock again: `task-10-finish … pid=81434`, taken 23:26,
dead by 23:56. ⚠ **A `grep -c` for the process counted its own command line and read as "alive" —** the
honest check is `ps -p <pid> > /dev/null && echo ALIVE || echo DEAD`, plus `pgrep -fl`. Both said DEAD.
Lock released (second time).

Inspecting the surviving tree showed the work was **complete**: the non-contiguous `-002` case present,
assertions up 51 → 55. The agent died during verification, not authoring.

Ruling: **the conductor finished Task 10 itself** — took the lock, reset, ran both suites, committed. Two
agents had already died on this lane and the remaining work was verification plus a commit, which is
conductor work I had already done twice this wave (Task 2's proof, the main merge, the seed regen).
Spending a third implementer on it would have risked a third stale lock. — If wrong: a commit authored by
the conductor rather than an implementer, which the scoped re-review still gates exactly as usual.

⚠ **`pnpm supabase:reset` failed once with `LegacyDbSetupError: error running container: exit 1`, then
succeeded unchanged on retry.** Containers had restarted mid-run. Transient — do not treat a single reset
failure as a broken migration.

Results on the clean lineage (00516 then 00530, no overlay): standalone **PASS**; full suite **exit 0 —
126 files, 104 green, 22 expected-fail, 0 unexpected-fail**. Lock released after.
Committed as `73517449d` "fix(db): harden 00530's projection, harbor and policy assertions" (+240/−50).

**Confirmed for the coordinator: `73517449d` is this lane's own Task 10 work, not another lane's.**

### Both telemetry reviews converged on ONE root cause

Task 17's review found a **Critical**: every capped note double-emits `voice.finish` — once truthfully
`reason:"cap"` from `rotate()`, once falsely `reason:"manual"` from the consumer's subsequent `finish()`.
The cap ends the stream with `continuation.finish()` (no error), so `for try await` completes **normally**
and falls through to `end()`, whose `guard isRecording` passes because `isRecording` is sheet-local `@State`
the cap never touches.

Independently, Task 15's re-review found that round 1's (correct) always-`await finish()` makes the **same**
unguarded `finish()` double-emit on every Discard, and emit for notes that never recorded — one
`voice.finish` with `duration_s: 0` and **no matching `voice.start`**. It also deactivates the shared session
on sheets that never activated it, reaching around the guard `deinit` documents at `:149-153` as protecting
ARKit/RoomPlan.

Ruling: **one fix closes all of it — guard `finish()`'s emission and teardown on the note having been
active**, exactly as `deinit` and `endAbandonedNote()` already do. Routed to Task 17, which owns that file
under P-1. `finish()` must be safe to call speculatively, because Task 15 now calls it that way deliberately
and correctly. — Two reviewers reaching the same unguarded function from opposite directions is the
strongest signal in this wave that the guard belongs there.

Ruling: **Task 17's fence extended to a fifth file, `S3DestinationScreen.swift`.** Its header claims "This is
the single place that calls sync.route()" — **stale**. `S3Content.choose()` calls `sync.route()` with zero
telemetry, and `saveFromCard()` only reaches the instrumented branch when `destination != .undecided`. So
every capture routed through the explicit "Where should this go?" screen — the first capture of a session,
and any deliberate revisit — emits neither `capture.placed` nor `capture.unplaced`. The plan calls these
"the program's headline metric and the size of the roving hole", and **a metric instrumented on one of two
commit routes is worse than none, because it looks complete.** — If wrong: two extra analytics lines.

### Task 15 fix round 2 — DONE at `c288c7290`

`stop()` guarded on `player != nil || isPlaying` (the `||` deliberate, covering the all-segments-fail path
where `isPlaying` is true and `player` nil); `gestureHeld` reset in `begin()`'s failure exits and
`.onDisappear`; `.accessibilityLabel("Open capture")` on the trailing tray button. Gates ✔✔✔, 315/45.
**Parked by ruling: the drag-cancel-while-the-sheet-stays residual** — on that path `end()` is never called
either, so the pre-existing "recording never stops" bug already dominates.
Scoped re-review dispatched (sonnet), agentId `a794d362fa7455fe7`.

- Task 10: final scoped re-review dispatched (opus), agentId `adf321d328cc50952`.
- Task 8: **consolidated** scoped re-review dispatched (opus), agentId `a1dfc8710ce59fb68`, covering all five
  fix commits at once and asked three things beyond verdicts: whether the final state is **internally
  coherent** after four rounds of patching one file, whether **all six teardown paths** leave the same
  invariants, and what the device pass must observe.

### Task 17 fix round 1 — DONE at `a695cd7eb`

`fix(ios): stop finish() double-emitting, label the error door, cover S3's route`. `finish()` guards on
`wasActive`; `endAbandonedNote()` emits `voice.finish reason:"error"`; `capture.placed`/`capture.unplaced`
wired into `S3Content.choose()` with `analytics` threaded in. Gates ✔✔✔, 315/45.
Scoped re-review dispatched (sonnet), agentId `a57a156612609f7ec`, asked to produce the **final event table**
(including S3) as the artifact Task 18 queries PostHog against.

⚠ **Cross-lane fence worked as designed, twice over.** Task 17 could not fix the mirror-image stale comment
in `VoiceNoteSheet.swift` because that file is fenced to the Task 15 lane — so it reported the gap instead of
reaching across. Routed to Task 15's implementer as a one-line comment-only change. **This is the third time
this wave an implementer declined to cross a fence and named the gap instead** (Task 15 → Task 17 on the
duration; Task 9 → conductor on `CaptureStore`; now Task 17 → Task 15). It is the single practice that kept
four concurrent iOS lanes from colliding.

⚠ Still true and worth carrying to the report: **children cannot resolve me by the `general-purpose` type
tag.** They report through completion, which works; two of my own routing faults had the same root cause.

### 🟢 SHARED LOCAL DB VERIFIED HEALTHY — no wipe occurred

The coordinator warned the shared stack at `127.0.0.1:54322` might have been wiped by a raced lock plus two
failed resets. **It was not.** Verified directly:

- `select count(*) from supabase_migrations.schema_migrations` → **485**
- head 5 versions → `00530`, `00521`, `00516`, `00515`, `00514`
- `commit_field_capture` present in `pg_proc` → 1

My `pnpm supabase:reset` (the one that failed once with `LegacyDbSetupError` then succeeded unchanged on
retry) left the stack **complete and correct**. Other sessions can use it.

### Lock made ATOMIC

Replaced check-then-write with `mkdir /tmp/patina-local-supabase-db.lock.d`, which is atomic on POSIX —
`mkdir` fails if the directory exists, so two racers cannot both believe they hold it. Owner recorded in
`…lock.d/owner`. The old `…lock` **file** is gone.

Ruling: **the check-then-write lock I used was the actual defect behind the race.** `[ -f lock ] || echo > lock`
has a window between the test and the write in which a second holder can take it, and that is exactly what
let my `task-10-finish` lock overwrite an implementer's mid-run. Two agents also died holding it, which made
the window wider and more likely to be hit. `mkdir` has no such window. — If wrong: a stale directory needs
`rmdir` instead of `rm`, and a crashed holder leaves it until someone checks the owner's PID for liveness.

### Full SQL suite re-run CLEANLY after the hardening — real numbers

Post-`73517449d`, on the verified-healthy stack, holding the atomic lock:

- **Full suite: 126 files — 104 green, 22 expected-fail, 0 unexpected-fail. Exit 0.**
- **Standalone `field_capture_note_routing`: 1/1 PASS, 0 unexpected.**

These are the numbers that include hardening cases 16–17; they happen to match the earlier run's totals
because the new cases live inside the existing file rather than adding files. ⚠ Nothing here proves RLS —
the runner connects as `postgres` (superuser).

### Task 15 fix round 2 re-review (sonnet) — all addressed, COMPLETE

The `||` guard was checked properly rather than agreed with: `play()` sets `isPlaying = true` **before**
`advance()`, so if every URL fails to open, `advance()` recurses to an empty queue and calls `stop()` with
`player == nil` and `isPlaying == true`. **With `&&` the guard would have skipped the body and left the
session claimed forever — a regression, not a fix.** `||` is the only shape that both no-ops for the five
never-played callers and still releases a claimed-but-silent session. The legitimate-stop path was confirmed
intact. All cited line numbers resolve.

- Task 15: minor (deferred): `.accessibilityLabel("Open capture")` **replaces** SwiftUI's composed label
  rather than merging, so VoiceOver now announces every row identically and drops the status chip's wording
  ("Not routed" / "Routed to your studio"), which is left carried visually only. In scope as asked, flagged
  as an accepted trade-off.
- Task 15: **complete** (`475369a8e`, `0173f9d08`, `c288c7290`; both fix rounds re-reviewed clean; 1 minor
  deferred, plus a one-line stale-comment fix in flight).

### Device pass — WDA build SUCCEEDED

`xcodebuild build-for-testing` for WebDriverAgent completed **exit 0** (team `VP22LXHT7L`). Install/launch
started against the USB-then-wifi iPhone 13 Pro `00008110-001630212231801E`. Both LiDAR phones now show
`connectionType: wifi` and `wdaInstalled: false`. **The phone must be unlocked for the install to land** —
that is the one step no agent can perform.

### 🔴 CORRECTION: the Task 10 finisher was ALIVE, not dead — my PID check was invalid

It has now reported: it ran **5 hours**, its working tree was byte-identical to HEAD for both files, and it
made no duplicate commit. `73517449d` is the single commit.

**My "DEAD" verdict was wrong, and the reason matters.** The PID written into the lock is the **shell PID of
the command that wrote it** — a subshell that exits immediately. It has nothing to do with the agent's
lifetime. So `ps -p <that pid>` returns DEAD within seconds of any lock being taken, *always*, for a
perfectly healthy holder. I used that signal twice to declare lanes dead, and the second time I was wrong
and **took a lock out from under a live agent** — which is exactly the race the coordinator flagged.

Ruling: **PID-liveness on that lock is meaningless and I should not have used it.** The atomic `mkdir` lock
now in place is the real fix: it cannot be taken while held, so the question never arises. If a stale
directory must ever be broken, the honest evidence is the **file mtimes of the work** plus the absence of
`run-sql-tests`/`psql`/`supabase` processes — never the recorded PID. — If wrong: a genuinely crashed holder
blocks the stack until a human clears it, which is far cheaper than what I did.

⚠ Also recorded: my `grep -c` liveness check earlier **counted its own command line** and read as "alive".
Use `pgrep -fl` or `ps -p … > /dev/null && echo ALIVE || echo DEAD`.

### Task 10 final re-review (opus) — all findings addressed, no Critical/Important

Verified with real rigour: the projection proven **total** across absent / JSON-null / string / number /
object / array for all four paths, including that `#>`/`#>>` return NULL rather than raising on a scalar
intermediate, so `{"voice":"hi"}` cannot raise. Every whitelist confirmed **byte-identical to the named CHECK
it mirrors**. The five policy predicates checked against `00233:155-188` and confirmed **discriminating** — a
one-character `USING` change alters `pg_policies.qual` and fails. Case 17's non-contiguous array asserts exact
round-trip. And it caught the subtle one: an integer `FOR` loop sets `FOUND` itself at `END LOOP`, which the
implementers had already handled by capturing the upsert's own `FOUND` into `v_upserted` immediately.

Six Minor findings; **two are freshly-false comments written during that round**, and one of those is
`COMMENT ON FUNCTION` — **durable documentation stored inside the production database**. Dispatched as a
comment-only fix (agentId `abf9384be3624e60a`): (1) the function comment claims *both* branches detach the
offending routing; the library branch detaches nothing, deliberately, being 00516's body verbatim.
(2) `:708`'s justification "project_id is still NULL here" is stale — the row can now carry stored routing;
the true reason is that the upsert already validated that tuple through the same guard.
The other four Minors are parked: `WHEN OTHERS` on the upsert harbor could detach valid routing on a
transient error (bounded — recorded in `conflict`, re-routable); a stale *room* costs the still-valid
*project*; a non-object payload loses its body in the harbor (unreachable from the real client); a savepoint
per call on the hot path.

⚠ **Finding 12 is addressed by disclosure, not by the run** — the implementer states plainly it never
captured step 10.3's RED output and substitutes two verbatim red runs against the prior function. Accepted:
an honest gap beats a fabricated transcript, and the assertions demonstrably cannot pass without the
migration. ⚠ Its report is one round behind — cases 16/17's passing run exists only in this ledger.

### Task 15 fix round 3 — DONE at `5c8af4f3a`

Comment-only in `VoiceNoteSheet.swift`: the stream-catch comment now explains the `wasActive` guard instead
of asserting idempotence, `discard()`'s comment corrected, and the file header no longer under-describes
Discard's deletion. **This closes the mirror-image stale comment Task 17 could not touch because the file was
fenced to this lane** — the cross-lane routing worked end to end.

### Wave gate (Task 18, gate half) — GREEN

`scripts/capture-gate.sh all` → **`✔ build` `✔ tests` `✔ lint`** (04:30:11–04:30:27).
`swiftlint lint --quiet --strict` → **exit 0, no output**.
Full SQL suite → **126 files, 104 green, 22 expected-fail, 0 unexpected-fail, exit 0.**
Standalone `field_capture_note_routing` → **1/1 PASS**.
⚠ `✔ tests` is the **CaptureKit** scheme; it does not link the app-target files this wave changed most.

### 🔴 DEVICE PASS — BLOCKED

WDA **built** successfully (`xcodebuild build-for-testing`, exit 0, team `VP22LXHT7L`). Install then failed:

```
xcodebuild: error: Timed out waiting for all destinations matching the provided destination specifier
{ platform:iOS, arch:arm64, id:00008110-001630212231801E, name:iPhone,
  error:The developer disk image could not be mounted on this device. }
```

Both LiDAR phones now report `connectionType: wifi` and `wdaInstalled: false`; the iPhone 13 Pro was USB
earlier in the session and is not any more. The developer disk image cannot mount on a **locked** device, and
a wifi-only connection makes it worse. **This is the human-hand step: unlock the phone and reconnect it by
USB.** No agent can do it. Every device-gated acceptance criterion is therefore NOT exercised — enumerated
in the wave report.

### Task 8 consolidated re-review (opus) — FINAL STATE: SOUND

All **nineteen** findings across four rounds closed, and it confirmed no later round reopened an earlier
one. Verdict on coherence: *"the file reads as one design, not four patches"* — the rounds converged on a
single spine (`noteIsActive` as the one arming bit, `stopEngineAndCloseSegment()` the one stop primitive,
`closeCurrentSegment()` the only place a name is published, `removeObservers()` the only place tokens die),
which is why patching one file four times did not end in contradictory guards. It produced a **teardown
equivalence table** across all six paths and found the divergences deliberate except one.

Eleven open items, all triaged non-blocking: **N-A** `rotate()` lacks a `noteIsActive` re-check after its
queue hop (a rotation posted just before teardown resurrects `request`/`segmentStartedAt` and leaks a Speech
XPC task; one line, and `endAtCap` already has the analogous guard — that asymmetry is what makes it worth
naming); **N-B** the reopen `catch` is the only path equivalent to no other — note dead, `noteIsActive` still
true, observers armed, session possibly left active and ducking, no retry, no UI signal; **N-C** a long
interruption may trip the recognition-error door before `.ended` arrives (device-pass decides — the
interaction between N1's fix and the `.began`/`.ended` design that no single round examined together);
**N-D** `continuation` is the third cross-thread reference property and the only one still unlocked — a
**memory-safety** class, not the staleness class its park names; **N-E/F/G/H/K** teardown asymmetries, an
orphan `.m4a` on `deinit`, and telemetry overloading (`voice.audio_write_failed` now carries five distinct
meanings, and `voice.segment_rotated`'s `index` no longer changes across rotations — a 3-minute note logs
`index=0` three times, so the device pass must **count occurrences**, not read the field); **N-J** on the
recognition-error door an audio-only note may still be unattachable, because Task 15 added "Keep the
recording" to the **liveRecorder** branch only, not `manualEntry` — needs checking against the live file.

⚠ Two notes *inside* parked items that make the parks heavier than their framing: (a) `rotate` reads
`audioSegments.count` on `rotationQueue` while main-thread paths `append` — a concurrent Array read during a
CoW mutation is a **crash** class, not staleness; (b) `shouldEnd`'s segment count now only advances on
interruption/route change, so `maxSegments = 24` is effectively unreachable and the 20-minute wall clock is
the sole cap.

### `cee0b523a` — two false SQL comments corrected

`docs(db): correct two false claims in 00530's comments` (+6/−3, comment-only, verified by `git diff` to
touch no SQL logic). The `COMMENT ON FUNCTION` fix matters disproportionately: that text is **durable
documentation stored inside the production database**. Both new sentences were traced against
`field_captures_guard_routing()` (`00233:195-253`) and the upsert's guard-retry block.

⚠ It landed **after** the final-review package was built, so the final reviewer was notified of the exact
delta rather than left to flag an already-fixed claim. **Second time a review range went stale under its
own subject** — same lesson as Task 8's: rebuild and redirect rather than let a misleading verdict land.

### Integration: MERGED, not rebased

Ruling: **merged `origin/main` (`cde7c7628`) rather than rebasing onto it.** The branch contains **two merge
commits** (`6c1c519e1` w05, `4cc535f14` main), so a rebase would either flatten them or need
`--rebase-merges`, and it would invalidate **every SHA** recorded in this ledger, in nine task reports, and
in the wave report. The merge surface was verified clean beforehand — **zero overlapping files** between what
main changed and what this branch changed — and the merge came through with no conflicts as `703073fd1`.
— A rebase buys linear history; it costs the entire audit trail of a wave whose value is largely in that
trail. — If wrong: the orchestrator rebases at integration, with the ledger intact to map SHAs.

Post-merge re-verification, all green:
- `capture-gate.sh all` → `✔ build` `✔ tests` `✔ lint`; `swiftlint --strict` exit 0.
- Scheme/pbxproj consistency **re-checked at HEAD**: `Capture.xcscheme` → `4F391845…`, `DCD726F3…`;
  `CaptureKit.xcscheme` → `4F391845…`, `A4813490…`; committed native targets `2C852F69…`, `4F391845…`,
  `A4813490…`, `DCD726F3…`. **All four resolve** — a fresh checkout gets working schemes.

- Task 17: **complete** (`35000744b`, `a695cd7eb`; re-review clean — `voice.start`/`voice.finish` verified
  **1:1 across all seven paths**, and the S3 instrumentation confirmed byte-identical in shape to
  `saveFromCard()`'s).
- Task 15: **complete** (`475369a8e`, `0173f9d08`, `c288c7290`, `5c8af4f3a`).
- Task 8: **complete** (`2b5fd5f8d` + four fix rounds; consolidated verdict **Sound**).
- Task 10: **complete** (`a27e8dfb3`, `9a5b3d875`, `ce480b94f`, `73517449d`, `cee0b523a`).
- Final whole-branch review dispatched (opus), agentId `a17431d8892d14d29`.

### FINAL WHOLE-BRANCH REVIEW (opus) — "Ready with named follow-ups"

The pass that justified itself. It found **X1**, a High-severity cross-task defect **no fenced review could
have seen**, because its three parts sit in three different task fences:

🔴 **X1 — a re-commit erases the server's pointer to audio it already has.** `applyCommitResult` deletes
receipted local segments (`LocalCaptureSyncService.swift:663-667`); `uploadMedia` builds its voice list from
`voiceAudioSegmentsRaw` with **no remote-path exemption** (`:401-408`) where the photo list three lines above
*does* filter on `remotePath` (`:394-400`); so a second commit fails every `Data(contentsOf:)`, counts all
segments lost, and writes `audioPath: nil` / `audioSegments: []`, which `00530:473,477` apply as `EXCLUDED`.
The row loses its reference to audio sitting in Storage, intact.
**Reachable, not theoretical:** `confirmedReceipt` returns nil for **every inbox capture** (`committedProductId`
comes only from `result.productID`, and the inbox branch returns `product_id: NULL`), and the specimen stays
in the outbox because `needsProjectPlacement` never clears for an inbox capture. So: project + line/slot in
S1, Inbox in S3, record a note → the pointer is wiped on the next drain and every drain after.
**The loop pre-existed and was harmless until Task 16 added the deleter.** That is the exact shape of defect a
per-task review cannot reach.

Other cross-task findings: **X2** the tray's Play control survives the deletion of the audio it plays (silence,
no message); **X3** F2 handles neither the cap nor the error door — at the 20-minute cap the stream finishes
*normally*, the loop exits, nothing calls `stopVoice()`, and **up to 20 minutes of recorded audio produces no
capture at all**; **X4** at the cap the final segment's inclusion depends on unenforced main-queue ordering;
**X5** `database.types.ts` was regenerated with a different generator, reformatting 31,740 lines around a
12-line semantic delta; **X6** `missingRequiredMedia` is now unreachable from app code while three doc comments
still call it the live mechanism; **X7** `reloadFeatureFlags()` fires only on a restored session.

**N-J confirmed live and promoted to must-fix:** `VoiceNoteSheet.swift:199-200` — the `manualEntry` branch has
no `hasAudio` term, an unconditional "Attach note" title, no ladder line and no playback. The recognition-error
door routes there **with real audio in hand**, so Task 15's headline defect is still live on that path.

**Honesty audit found two shipped false declarations**: `PrivacyInfo.xcprivacy` declares
`NSPrivacyCollectedDataTypes` **empty** while the app identifies users and sends event properties to PostHog;
and the permission string promises on-device transcription while the code sets
`requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition`, so on unsupported hardware audio goes
to Apple's servers under a string promising otherwise. It also confirmed `cee0b523a`'s two comment fixes read
true against the live code, and that **the recorder's original false header — the one that misled two
discovery reports — is genuinely repaired**.

Acceptance criteria: **4, 9, 10, 11 met in code**; **1, 2, 3, 5, 6, 8 device-gated**; **7 not met** (no ASC
record, no TestFlight build, no observed row — the criterion asks for rows, not code). ⚠ `pnpm type-check` is
in the plan's own gate list and had **not** been run on this branch.

⚠ **Deploy order is load-bearing and belongs in the wave report:** `00530` cannot be pushed before `00516`
(lineage 00235 → 00516 → 00530). `00516` is merged to main but applied to **neither staging nor prod**.
Whichever lands second **silently reverts the other** — no error, no ledger signal.

- Final fix wave dispatched (opus), agentId `ad7d30c73bb24fa65`: X1, N-J, X3, X2, the two false declarations,
  plus the stale ESCALATE markers and the README's wrong FileTimestamp reason — and `pnpm type-check`.
  Per SDD this is **one** fix dispatch followed by **one** scoped re-review; residuals get adjudicated, not a
  second wave.

### FINAL FIX WAVE — complete, 5 commits, tree clean

`8751e6a79` X1 · `65737f4ce` N-J · `2b049664e` X3 · `ae8b7b98e` X2 · `4ecc29611` privacy manifest +
speech string + README.

Gates: `capture-gate.sh all` ✔build ✔tests ✔lint (14.741 s); `swiftlint --strict` exit 0 (0.135 s);
**`pnpm type-check` 30/30 (17.472 s)** — in the plan's own gate list and **never previously run on this
branch**. Two earlier runs disclosed rather than hidden: one sandbox `permissionDenied`, and one **real
swiftlint failure** (its first cut pushed `uploadMedia` past the 60-line body limit; fixed by extracting
`stampedVoicePaths(for:)`).

**X1's fix verified by full trace:** stamped segments are now *answered in place*, preserving order —
`Data(contentsOf:)` is never reached, `lost == 0`, and the `audioSegments = []` branch is never entered.
And it closed the second half of the question I asked: **`audioLost` is now honest**, because the retention
sweep only deletes stamped files, which can no longer reach the lost counter. Without that, the fix would
have traded a wiped pointer for a false "audio lost" claim.

Ruling: **5(b) reworded the permission string rather than forcing on-device recognition — ACCEPTED, and it
is the better call.** Forcing `requiresOnDeviceRecognition = true` would cost unsupported iPhones
transcription **entirely**, and would make this wave's own `on_device` telemetry a constant — a field
recorded precisely because both paths exist. Rewording makes the sentence true in both cases at no
capability cost. — If wrong: the string is vaguer than a promise Kody might have preferred to keep.

Two disclosed extras beyond the literal brief, both accepted: it also removed file-header prose in
`SiteScanContextCapture.swift` carrying the **same** false ESCALATE-placeholder claim as the three markers
(the brief named the markers only — finding the fourth instance is the behaviour this wave has rewarded
throughout); and it placed F2's `onDisappear` on `SiteScanContextControls`, the one view both hosts render,
so a **chrome or step switch mid-note also ends and enqueues** the note rather than orphaning it. Correct
outcome, broader trigger than "leaving the screen" — carried to the device pass.

⚠ `project.pbxproj` was dirty after the gate (new usage string + config-UUID churn) and **is** staged; both
schemes came back clean and correctly are not.

- Single scoped re-review of the fix wave dispatched (opus), agentId `a87e6a3e768072384`. Per SDD this is
  the last review; residuals get **adjudicated**, not a second fix wave.

### FINAL SCOPED RE-REVIEW (opus) — All findings addressed, no new Critical/Important. WAVE CLOSED.

All eight closed at the claimed lines. The four risks I named check out: X1's exemption **does** prevent the
wipe (second-drain traced — `voicePaths` holds both real paths, `lostSegments == 0`, the wipe branch never
entered) **and `audioLost` keeps its meaning** (the retention sweep also gates on a stamp, so a sweep-deleted
file is always answered from its stamp and can never reach the lost counter); N-J covers the ladder line and
playback, not just the button; **X3 does not double-enqueue** (both extra doors run inside the `@MainActor`
`voiceTask`, and `isRecordingVoice` is cleared synchronously before yielding, so the trailing
`stopVoice(.capped)`/`.failed` is guarded out); X2's gate is per-row, not per-frame.

Adjudication of the six residuals — **no second fix wave**, per SDD:

1. 🔴 **The privacy manifest is NARROWED, not correct — carry, do not close.** It now declares what PostHog
   sends, but the app itself uploads **precise coordinates, capture photos, voice-note audio bytes,
   transcript text, and the user's email at sign-in**. None of `PreciseLocation`, `PhotosorVideos`,
   `AudioData`, `OtherUserContent` or `EmailAddress` is declared. Strictly more accurate than the empty array
   it replaced, and it blocks nothing on this branch — but it is a shipped statement of exactly the class
   this wave exists to eliminate. **Must not be logged as "privacy manifest done."** Settle it with the App
   Store nutrition labels the README defers. — If wrong: a submission is rejected, or worse, ships a false
   declaration.
2. **Follow-up:** `SiteScanContextCapture.swift:156`'s enqueue `Task { [weak self] … }` resolves `self` when
   the job runs, so on the leave-the-route path the note could silently not enqueue — the exact orphan the
   fix targets. A strong capture removes the doubt. Device-provable only (device step 5b).
3–5. **Notes, no action:** a per-render filesystem stat in the tray (cheap, deterministic, no flicker); a
   legacy single-file note gets no Play button (pre-existing, unchanged); `requireActiveOwner`'s window moved
   a few lines later but `commitCapture` still re-checks.
6. **Reporting accuracy, no code impact:** the fix report's `LocalCaptureSyncService` citations run 15–31
   lines short — computed before its own helper was inserted. **The reviewer re-verified every claim against
   the real code and all held.** Recorded because this wave has treated citation accuracy as load-bearing.

Ruling: **the SDD workspace is NOT deleted.** The skill says to delete it once the final review is clean,
because "the git history is the record now" — but here it is not: the 68-ruling ledger, the 44-item
device-pass spec, the Task 10 draft SQL and every task report are **gitignored** and exist nowhere else. The
orchestrator merges after its own review and needs them. — If wrong: a stale scratch directory in a worktree
that is itself scheduled for retirement.

**WAVE 1 COMPLETE.** 18 tasks, 45 commits over `origin/main`, every task reviewed and every review closed or
adjudicated. Device pass BLOCKED on a locked phone.

## Merge-review fix round (2026-08-25)

Ruling: 00-legacy-grants.sql WAS changed in 50b7f2228 (+30 local-only lines) — change stays; earlier 'untouched' ruling corrected

Ruling: recognizer-unavailable ladder rung + cap copy built in the merge-review fix round

Closed from `docs/design/field-companion/plans/wave-1-merge-review.md`: **B1** (three ARC-bearing
recorder fields now lock-backed), **B2** (the capped note's final segment is published before the
stream is finished; exactly one `voice.finish reason:cap`, emitted from `endAtCap()` after the close),
**B3** (`VoiceAttachPolicy.merge` — a re-attach replaces audio only on a take that published a
segment), and the orchestrator's ladder ruling (§15.4: recognizer unavailable → the note still
records; the 20-minute cap copy on both surfaces). Six new assertions (37–42) added to
`device-pass-spec.md`. **B4** (the `database.types.ts` whole-file reformat) is NOT this round's.

## Merge RE-review fix round 3 (2026-08-25)

Closed from `docs/design/field-companion/plans/wave-1-merge-rereview.md`: **N1** (blocker — `rotate()`
no longer builds a recognition request or starts a task on a note that began with recognition off, so
the §15.4 unavailable rung survives past the 50 s rotation boundary instead of ending the note with
`voice.finish reason=error`; device-pass step **37b** added to prove it past 70 s), **N2** (the
outgoing request's generation is retired by `carryForwardAndAdvance()` BEFORE `endAudio()`/`finish()`
provoke its terminal callback, closing the window in which a rotation-time error read as live —
boundary word-loss accepted per §8.2, "the audio is the record"), **N6** (F2's `startVoice()` now calls
the same `requestAuthorization()` N4's sheet uses, so a cold install reaching F2 first has a door to
the prompt; mic required, speech optional per the rung), **N7** and **N8** (docs — see below).

Ruling: N3 (rotated request's error ending the note) = follow-up, not a Wave 1 blocker — needs a mid-note "recognition stopped" surface state; N4/N5 = follow-ups

`docs/engineering/migration-number-reservations.md`: **00514 and 00515 ARE applied on prod (Strata) as
of 2026-08-25 ~09:30Z, together with 00516** — the rows that said "NOT applied to staging or prod" are
corrected, and the staging distinction is kept (**staging still owes 00514–00516**, so 00530's staging
push stays gated). 00531's filename now matches the file on `hotfix/uuid-generate-v5-grant`:
`supabase/migrations/00531_grant_uuid_generate_v5_authenticated.sql`.

Still open, carried to wave 2: **N3** (a live request's recognition error should retire recognition,
not the note), **N4** (`endAtCap` reads `latestTranscript` outside the identity guard), **N5**
(`finish()`'s early return can miss the final segment in the cap-hop window), the
`SpeechVoiceNoteService.swift` comment that still names `finish()` as a stream-finishing door, and the
merge-ordering note on the regenerated `project.pbxproj`. **The device pass remains unrun** — no
automated test in this repo links `SpeechVoiceNoteService`, so every finding in this round is proven by
reading only.
