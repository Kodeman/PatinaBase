# Field Companion · Adversarial review — REPO-CORRECTNESS lens

Issued 2026-08-24 · Read-only pass against `/Users/kody/Code/patina-merged` @ `d2ea0b3f3` (main)
Subject: `field-companion-package.md`, `field-companion-plan.md`, `field-companion-rulings.md`
Method: every concrete reference in the three documents checked against the working tree (files,
Swift symbols/signatures, SQL objects/line ranges, hooks, scripts, `git log --all`, sibling
worktrees). Findings are reported in full, unfiltered by severity — the orchestrator filters.

**Headline.** The package is unusually well-grounded: dozens of citations land exactly
(`present(.assignVenue` = 3 sites at the exact lines given; `<ScheduleSpine>` at `page.tsx:1354`
and `<FFESection>` at `:1360`; `00234`'s 10-entry MIME list; `WorkDashboardScreen.swift` = 669
lines; `pipeline.ts:574`'s `>= 0.8`; `00297:41/:54/:203-214`; `endVisit` at
`CaptureSessionContext.swift:157-169`; `CaptureScreenID`'s "51 entries" header over 71 cases).
The two live defects it names (voice audio never written; the inbox branch dropping routing) are
real and correctly evidenced.

But **the one section it labels "corrected, and load-bearing" — §9.1 migration numbering — is
itself wrong**, and the wave-1 SQL work sits on a direct collision with an in-flight sibling lane
that is doing the *same* `CREATE OR REPLACE FUNCTION commit_field_capture` this week. Two
CRITICAL findings, eight HIGH, eighteen MEDIUM, sixteen LOW.

---

## CRITICAL

### RC-01 · `00521` is already taken. FC-R17's band is wrong at its first number.
**Where:** package §9.1 / §18 FC-R17; plan §0.2 fact 4, C6, Task 1.1–1.5, Task 10.1; rulings FC-R17.
**Claim:** "PROPOSED: reserve `00521–00526` for the Field Companion program"; plan Task 1.1 states
the expected result of `git log --all --oneline -- 'supabase/migrations/0052*.sql'` is **empty**.
**Evidence:**
```
$ git log --all --oneline -- 'supabase/migrations/0052*.sql'
ca2b0641b feat(db): author svc_media shape reconciliation (00521) to unfreeze media deploy
$ git show --stat ca2b0641b | grep 00521
 supabase/migrations/00521_svc_media_shape_reconciliation.sql | 350 +++++
$ git branch -a --contains ca2b0641b
  feat/svc-media-shape-reconcile
  remotes/origin/feat/svc-media-shape-reconcile
$ git show -s --format='%ci %an' ca2b0641b
2026-08-24 15:05:39 -0500 Kodeman
```
`00521_svc_media_shape_reconciliation.sql` was committed **the same day this package was issued**,
is pushed to `origin`, and is absent from `docs/engineering/migration-number-reservations.md`
(that lane skipped discipline rule 4). The package checked the reservations doc and `main`'s
filesystem but not `git log --all` — the exact check its own plan prescribes.
**Fix:** re-run the census across all refs *and* sibling worktrees, reserve **00522–00527** (or the
next verified-free band), record the svc-media 00521 in the reservations doc as part of the same
edit, and coordinate with the `feat/svc-media-shape-reconcile` owner. Change plan Task 1.1's
"Expected: the git log is empty" to "Expected: exactly the svc-media 00521 row; anything else means
re-census."
**Severity: critical · Confidence: 0.97**

### RC-02 · Two concurrent lanes both `CREATE OR REPLACE commit_field_capture` "from 00235's body verbatim". Whichever lands second silently reverts the other.
**Where:** package §9.2(c); plan Task 10.4 ("copied verbatim from 00235 with exactly two edits"),
Task 1.3 ("`commit_field_capture`'s lineage becomes **00235 → 00521**").
**Evidence:** `.codex/worktrees/agent-ca2/supabase/migrations/00516_capture_producer_idempotency.sql`
(branch `feat/capture-producer-idempotency`, uncommitted-in-worktree, drawn from Phase 3's
00514–00520 band):
```
:89  -- commit_field_capture — CREATE OR REPLACE from its 00235 body verbatim,
:96  CREATE OR REPLACE FUNCTION commit_field_capture(
:257   PERFORM public.enqueue_capture_enrichment(
:258     p_target_type      => 'field_capture',
:263     p_provenance       => jsonb_build_object('producer', 'commit_field_capture', …)
:266   -- ─── Destination: inbox ───
:268   UPDATE field_captures SET status = 'inbox' …
```
It also changes 00515's ACL posture (`GRANT EXECUTE ON enqueue_capture_enrichment TO authenticated`,
required because `commit_field_capture` is `SECURITY INVOKER`) and adds
`proposal_captures.client_capture_id` + `commit_proposal_capture`. The header of
`00515_capture_enrichment_rpcs.sql` already names "field-capture commit" as an intended producer
(`:5-7`), so this was foreseeable from the shipped files on `main`.

Consequence: if Field Companion's 00521 is authored from 00235's body, applying it after 00516
**deletes the `enqueue_capture_enrichment` call** and Phase 3's enrichment producer stops firing,
with no error. Applying 00516 after 00521 deletes the inbox-routing fix and the five new payload
reads. Neither would fail a migration; both fail silently in production.
**Fix:** treat `commit_field_capture` as a **shared** object with a declared owner. Either (a) fold
the routing fix + payload reads into 00516 and drop it from the Field Companion band, or (b) author
the Field Companion replacement from **00516's** body and make 00516 a hard prerequisite recorded in
the reservations doc and in the migration header. Also make the plan's "re-check the head" step
(C6/Task 10.1) explicitly include `grep -rl 'commit_field_capture' supabase/migrations` across all
refs and worktrees, not just `supabase migration list`.
**Severity: critical · Confidence: 0.95**

---

## HIGH

### RC-03 · The inbox-branch routing fix reverses a documented safe-harbor and turns a silent no-op into a permanent device retry loop.
**Where:** package §9.2(c), §17.1 ("Kept, untouched: … the library safe-harbor"); plan Task 10.4,
SQL test case 5.
**Evidence:** `00235:85-88` states the deferral is deliberate:
> `-- organization_id is applied now (validated by the guard); project_id /`
> `-- project_room_id are deferred to the library branch so a bad route can be`
> `-- safe-harbored instead of hard-failing the whole sync.`

The library branch is wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN … status='inbox' …`
(`00235:223-299`). The proposed inbox branch has **no** handler, so a `field_captures_guard_routing`
`RAISE EXCEPTION` (`00233:206/212/224/230/240`) now aborts the whole RPC. On the device that surfaces
as a plain `Error`, not a `LocalSyncError`, so `runAttempt`'s `catch` falls to `recordFailure`
(`LocalCaptureSyncService.swift:219-235`) → `.retryableFailure`, retried on every drain forever.
Reachable whenever a stamped project/room goes stale (project transferred, room deleted, room
belonging to a different project once `projectRoomID` starts flowing per Task 7). The plan's SQL
test case 5 *asserts* the hard failure as correct.
**Fix:** wrap the inbox-branch UPDATE in its own `BEGIN … EXCEPTION WHEN OTHERS THEN` that retries
with routing NULL, stamps `raw_payload.conflict` exactly as `00235:278-291` does, and returns
`status='inbox'`. Change SQL test case 5 to assert *safe-harbor with a conflict stash*, not a raise.
**Severity: high · Confidence: 0.9**

### RC-04 · The recorder's segment state is per-service-instance, but one service instance records many notes → note N inherits note N-1's audio.
**Where:** plan Task 8.2 (`private let noteID = UUID()`, `audioSegments: [String] = []`), 8.3
(`startLiveTranscription` inserts only `openSegment/requiresOnDevice/observeInterruptions`), 8.5.
**Evidence:** `SpeechVoiceNoteService` is constructed once per screen, not per note:
`SiteScanContextCapture.swift:237` hands one instance to `SiteScanContextModel` (`private let voice:
any VoiceNoteService`, `:27`), whose `toggleVoice()` starts/stops arbitrarily many notes;
`SiteScanHostScreen.swift:212` does the same for the F2 in-scan overlay. `startLiveTranscription()`
(`:46-48`) resets only `latestTranscript` and `startedAt`. With Task 8's state, the second note's
`openSegment` names the file at `index: audioSegments.count` (so `-001`), `audioFilename` stays the
**first** note's `-000` file, and `finish()` returns note 1's full segment list on note 2.
**Fix:** mint `noteID` per recording and reset `audioFile/audioFilename/audioSegments/
segmentStartedAt/interrupted` at the top of `startLiveTranscription()`. Add a CaptureKit-side pure
test for the reset contract if any of that logic can be lifted (it is state, not policy — the
device pass must cover "two notes on one screen").
**Severity: high · Confidence: 0.9**

### RC-05 · `AVAudioFile.write(from:)` with a hardcoded mono AAC setting against the tap's format can raise an uncatchable ObjC exception (crash), and `try?` cannot catch it.
**Where:** plan Task 8.4 `openSegment(format:)` — `AVNumberOfChannelsKey: 1` with
`AVSampleRateKey: format.sampleRate`; Task 8.3 `try? self.audioFile?.write(from: buffer)`.
**Evidence:** `format` is `inputNode.outputFormat(forBus: 0)`
(`SpeechVoiceNoteService.swift:63`), whose channel count is hardware/route-dependent (a connected
USB/BT interface or certain route changes yield ≠1). `AVAudioFile.write(from:)` asserts
`_outputFormat.channelCount == buffer.format.channelCount` and raises an
`NSInvalidArgumentException`, which is not a Swift `Error` — `try?` does not catch it, the process
traps. The package's own §8.2 promises "A failed `AVAudioFile` open is non-fatal"; a failed *write*
is not covered.
**Fix:** derive `AVNumberOfChannelsKey` from `format.channelCount` (or install the tap with an
explicit mono `AVAudioFormat`), and guard every write with
`guard let f = audioFile, buffer.format == f.processingFormat else { … }` before calling `write`.
Add a route-change device-pass step (AirPods connect/disconnect mid-note).
**Severity: high · Confidence: 0.85**

### RC-06 · The interruption handler can never open segment N+1 — its own guard is false after an interruption, and the engine is never restarted.
**Where:** plan Task 8.4 `observeInterruptions()`; package §8.3 table; wave-1 device-pass step 3;
acceptance criterion implied by §7.4's *"Interrupted"* state.
**Evidence:** on `.began`, iOS stops the `AVAudioEngine`; the handler sets `audioFile = nil` and
`interrupted = true` but does not stop/restart anything. On `.ended` the handler does
`guard self.audioEngine.isRunning else { return }` — `isRunning` is `false`, so it returns and
`openSegment` never runs. Nothing calls `audioEngine.start()`, reactivates the `AVAudioSession`
(deactivated implicitly by the interruption), or reinstalls the tap.
**Fix:** on `.ended` with `.shouldResume`: reactivate the session, `audioEngine.prepare()/start()`,
reinstall the tap, then `openSegment`. Keep the segment-N+1 rule. This is app-target AVFoundation
code with no unit test (C1), so make it an explicit numbered device-pass step with a pass/fail line.
**Severity: high · Confidence: 0.88**

### RC-07 · Wave 1's acceptance criterion 4 cannot pass as written — the honest toast is overwritten two lines later.
**Where:** plan Task 14.2; wave-1 acceptance criterion 4; package §15.4.
**Evidence:** `SiteScanContextCapture.swift:117-142`. Task 14.2 sets
`toast = "We couldn't make out the words — the audio is here."` before the enqueue; the untouched
line `:141` then runs unconditionally:
```swift
self.toast = "Voice note added to Inbox"
```
So the failure copy never renders. That line is also the exact string §17.3 says must leave Field's
user-facing copy ("The word 'Inbox' in Field's user-facing copy").
**Fix:** make the success toast conditional on `!transcript.isEmpty`, or hold the message in a local
and set `toast` once at the end. Reword `:141` in the same commit.
**Severity: high · Confidence: 0.95**

### RC-08 · No wave-1 task emits any `voice.*` telemetry, yet acceptance criterion 6 and gate step 15.5 require `voice.finish` with `segments` and `on_device`.
**Where:** package §14 (13 new events); plan wave-1 acceptance 6, Task 15.5, work-package table.
**Evidence:** the only analytics added anywhere in §8's fifteen tasks are
`analytics.event("capture.place_tapped", …)` (Task 11.3) and
`analytics.event("sync.reconnect_drain")` (Task 13.3). `voice.start`, `voice.finish`,
`voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed`,
`voice.empty_transcript`, `capture.placed`, `capture.unplaced` have no implementation step.
Task 15.5's query `event IN ('voice.finish','capture.place_tapped','sync.reconnect_drain')`
expects all three present.
**Fix:** add an explicit task ("emit the wave-1 voice telemetry") covering at minimum
`voice.start`, `voice.finish` (`duration_s`, `segments`, `transcript_chars`, `on_device`),
`voice.empty_transcript`, `voice.audio_write_failed`, and `capture.placed`/`capture.unplaced` —
or strike criterion 6 and 15.5's second query. `on_device` also requires recording the resolved
`requiresOnDeviceRecognition` value, which Task 8 sets but never stores.
**Severity: high · Confidence: 0.93**

### RC-09 · FC-R15's "zero new media tables" punch-photo back-reference is not zero-DDL — `create_client_decision` rejects unknown payload keys and `client_decisions` has no capture column.
**Where:** package §6 Flow 5, §18 FC-R15, §9.5 (00524 is the only other wave-4 migration);
plan 4-9; rulings FC-R15 option (a).
**Evidence:** `00413:1829-1838` allow-lists the payload keys and raises on anything else:
```sql
v_unknown := p_payload - ARRAY[
  'designer_client_id','project_id','title','context','due_date','linked_phase','phase_id',
  'room_id','section_key','decision_type','decision_kind','coordination_kind',
  'blocking_status','blocks_kind','blocks_milestone_id','court','court_party_id','status'];
IF v_unknown <> '{}'::jsonb THEN RAISE EXCEPTION 'unsupported decision payload keys: %' …
```
There is no `field_capture_id` key and no such column on `client_decisions`. Carrying the
back-reference therefore needs a column, a widened allow-list, and a `CREATE OR REPLACE` of a
`SECURITY DEFINER` money-adjacent RPC — none of it budgeted in §9.5 or the wave-4 package list.
**Fix:** add a wave-4 migration line (e.g. `client_decisions.field_capture_id` + allow-list
widening + the `create_client_decision` replacement, with its `REVOKE … FROM PUBLIC, anon,
service_role; GRANT … TO authenticated` restated) and re-size 4-9 accordingly. Note in FC-R15 that
option (a) costs one DEFINER-function replacement, not zero DDL.
**Severity: high · Confidence: 0.92**

### RC-10 · Wave 6's structuring mechanism duplicates the purpose-built Phase 3 capture-enrichment pipeline that already targets `field_capture`.
**Where:** package §8.7, §10 (new `agent_tasks` kind `field_note.structure`, new
`structure-field-note` edge function, new cron); plan 6-3/6-4.
**Evidence:** `00514_capture_enrichment_ledger.sql` + `00515_capture_enrichment_rpcs.sql` (on
`main`) ship an execution ledger and transactional outbox whose `target_type` CHECK is
`('proposal_capture','field_capture')` (`00514:42-43`), an atomic claim
(`claim_capture_enrichment_run`), and a never-overwrite result recorder that writes allow-listed
`field_captures` columns (`00515:275-296`, `WHERE %1$I IS NULL OR %1$I = ''`). Phase 3's in-flight
00516 wires `commit_field_capture` into it. The package never mentions this lane.
**Fix:** before wave 6 is scheduled, rule explicitly on one mechanism. If the Phase 3 ledger wins,
wave 6 becomes "add a transcript-shaped suggestion key + a Queue consumer", not two edge functions,
a new `agent_tasks` kind, a cron pair and `field_note_drafts`. If `agent_tasks` wins, say why the
purpose-built ledger is being bypassed.
**Severity: high · Confidence: 0.85**

---

## MEDIUM

### RC-11 · Task 2.4's build command contradicts constraint C5.
`capture-gate.sh build` is `xcodebuild build -scheme Capture -sdk iphonesimulator -destination
"platform=iOS Simulator…" CODE_SIGNING_ALLOWED=NO` (`capture-gate.sh:13-18`). Task 2.4 says
"Build and install a **signed Debug build on the device**" and then gives that command; C5 and
`patina-ios-verification` forbid installing a `CODE_SIGNING_ALLOWED=NO` build for a walk.
**Fix:** give the real device command (`xcodebuild -scheme Capture -destination
'platform=iOS,id=<UDID>' -configuration Debug` with signing on, or the `blitz-iphone` install path)
and keep `capture-gate.sh build` as the *compile* gate only. Same problem in Tasks 8.8, 13.5, 14.5.
**Severity: medium · Confidence: 0.9**

### RC-12 · `cp Secrets.example.swift Secrets.swift` destroys the real Supabase anon key.
`apps/mobile/Capture/Capture/App/Configuration/Secrets.swift` **already exists** (18 lines,
gitignored per `apps/mobile/Capture/.gitignore:2`), contains a real
`supabaseAnonKey` (0 occurrences of `REPLACE_WITH_SUPABASE_ANON_KEY`), and has
`postHogAPIKey: String? = nil` at line 17. Task 2.2's `cp` overwrites it with the placeholder and
breaks auth/build.
**Fix:** "If `Secrets.swift` does not exist, copy the template. Otherwise edit line 17 in place."
**Severity: medium · Confidence: 0.95**

### RC-13 · The type-regeneration command and the generated-types path are both wrong.
Task 10.6 runs `pnpm --filter @patina/supabase run generate:types`; `packages/supabase/package.json`
has **`generate`**, not `generate:types`, and it requires `$SUPABASE_DB_URL`
(`supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts`). Task 10.7
stages `packages/supabase/src/types/database.types.ts`; the real path is
`packages/supabase/src/database.types.ts` and no `src/types/` directory exists.
**Fix:** `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter
@patina/supabase run generate`, staging `packages/supabase/src/database.types.ts`.
**Severity: medium · Confidence: 0.97**

### RC-14 · The SQL test fixture uses an invalid UUID and errors before the first assertion.
Task 10.2: `INSERT INTO project_rooms (id, …) VALUES ('fc000000-0000-4000-8000-0000000000r1', …)`.
`r` is not a hex digit; the cast fails immediately. Same literal is used for the
`p_project_room_id` argument and both assertions. (`…-0000000000a1/a2/c1/c2` are valid.)
**Fix:** use `…-0000000000d1` (or any hex) for the room id, consistently in all four places.
**Severity: medium · Confidence: 0.98**

### RC-15 · `CaptureType.caption` does not exist — the C3 placement line and the visit-chip spec will not compile.
`CaptureKit/CaptureKit/Design/CaptureType.swift:22-35` defines exactly: `display, title, title2,
body, bodyEmph, callout, footnote, eyebrow, monoSmall, monoBody`. Plan Task 11.2 uses
`.font(CaptureType.caption)` on the chevron; package §7.2's visit-chip table specifies
`CaptureType.caption` for the room line.
**Fix:** `CaptureType.monoSmall` (12 pt mono) or `CaptureType.eyebrow`. Sweep both documents.
**Severity: medium · Confidence: 0.95**

### RC-16 · Two constructors in the Task 6 test file do not exist as written.
`try CaptureStore(inMemory: true)` — `CaptureStore`'s initializer is `init(container:
ModelContainer)` (`CaptureStore.swift:49`); the in-memory factory is `CaptureStore.inMemory()`
(`:65`). `FieldCapturePayload(specimen: specimen, device: nil)` — the initializer is
`init(specimen s: Specimen, device: Device)` (`FieldCapturePayload.swift:133`), non-optional.
(`Specimen()` **does** compile — every parameter is defaulted, `:121-130`.)
**Fix:** `let store = try CaptureStore.inMemory()`; `FieldCapturePayload(specimen: specimen,
device: FieldCapturePayload.Device())`. The plan's hedge note ("mirror the shipped fixtures")
should be replaced with the verified calls.
**Severity: medium · Confidence: 0.95**

### RC-17 · Task 3.4's `guard isEnabled` will not compile.
`PostHogCaptureAnalytics` has `private static let isEnabled: Bool` (`:23`) and an instance
`private let enabled: Bool` (`:38`); every other method guards on `enabled`. An unqualified
`isEnabled` inside an instance method is a "static member cannot be used on instance" error.
**Fix:** `guard enabled, !key.isEmpty else { return false }`.
Also: the type is an internal `final class`; Task 3.4 writes `public func isFeatureEnabled` while
its siblings are non-public — legal but inconsistent. Drop `public`.
**Severity: medium · Confidence: 0.93**

### RC-18 · `try? await sync.drain()` — `drain()` does not throw.
`CaptureSyncService.drain()` is `func drain() async` (`CaptureSyncService.swift:36`). Task 13.3's
`try? await sync.drain()` emits "no calls to throwing functions occur within 'try'". Harmless
today, but the wave's own gate asks for `swiftlint --strict` and a clean build.
**Fix:** `await sync.drain()`.
**Severity: medium · Confidence: 0.95**

### RC-19 · "71/108 SQL tests are red" is stale — the pg_temp family was repaired a week ago.
Package §9.1 and plan C8/P-8 both assert it and use it to justify never reporting a suite result.
`supabase/tests/KNOWN_FAILURES.md` (header) says the opposite:
> "None of these are the `pg_temp` permission-denied family — that family (55 files, ~84 files
> touch `pg_temp` at all) **is fixed**. The 23 residuals … One … was subsequently closed by
> `00510` … leaving **22**."

`find supabase/tests -name '*.sql' | wc -l` = **122**; `run-sql-tests.sh` treats the 22 listed files
as expected-fail and exits 0 if only they fail. So the suite is a usable gate.
**Fix:** replace C8 with "run `scripts/run-sql-tests.sh -f field_capture_note_routing` **and** the
full suite; the suite exits 0 with 22 documented known failures — a new unexpected failure is a
real regression." Keep the standalone `psql` invocation as a debugging aid, not the reported gate.
**Severity: medium · Confidence: 0.92**

### RC-20 · 00521 reads two wire keys that nothing in the plan ever produces, and the SQL test asserts one of them.
§9.2's replacement reads `captureKind` (top level) and `{voice,noteSetting}`. Task 6's payload work
adds only `audioSegments`, `audioSha256`, `transcriptSource` to `FieldCapturePayload.Voice`; there
is no `captureKind` property anywhere in `FieldCapturePayload` and no task adds one. Test case 3
asserts `capture_kind = 'note'` from a hand-written payload, so the test passes while the app can
never set it.
**Fix:** either add `public var captureKind: String?` to `FieldCapturePayload` and set it (`'note'`
for the voice-only path, `'context'` for `ContextCaptureService`), or drop the `captureKind` read
and the CHECK from 00521 until the producer lands. Do the same for `noteSetting` (a wave-3 concept).
**Severity: medium · Confidence: 0.9**

### RC-21 · Task 14.2's replacement drops the shipped `partialTranscript` fallback.
The live code is:
```swift
let transcript = result.transcript.isEmpty ? self.partialTranscript : result.transcript
guard !transcript.isEmpty || result.audioFilename != nil else { … }
```
(`SiteScanContextCapture.swift:127-131`). Task 14.2 replaces the guard with
`guard !result.transcript.isEmpty || hasAudio`, which no longer consults `partialTranscript`, and
its snippet leaves the subsequent `service.enqueueVoice(transcript: transcript, …)` untouched — so
the two now disagree about what "has text" means.
**Fix:** keep the local: `guard !transcript.isEmpty || hasAudio else { … }`; base the "couldn't make
out the words" branch on `transcript.isEmpty`, not `result.transcript.isEmpty`.
**Severity: medium · Confidence: 0.9**

### RC-22 · FC-R6 and §9.4 mis-state `chk_margin_notes_engagement`; a third anchor already exists.
Both say "`margin_notes` requires `project_id` **XOR** `proposal_id`". The original constraint was an
**OR** (`00196:39-41`), and `00224:100-102` dropped and redefined it:
```sql
alter table margin_notes drop constraint if exists chk_margin_notes_engagement;
alter table margin_notes add constraint chk_margin_notes_engagement
  check (project_id is not null or proposal_id is not null or designer_client_id is not null);
```
`margin_notes.designer_client_id` (00224) anchors a note to a pre-project Discovery relationship.
So an "unplaced" note that belongs to a *client* but not yet a project **is already expressible as a
margin note today, with zero schema change** — an option FC-R6 does not list.
**Fix:** correct the constraint statement in §9.4 and FC-R6, and add option (d): anchor an unplaced
note to `designer_client_id` when the designer knows the client but not the project.
**Severity: medium · Confidence: 0.93**

### RC-23 · Wave 4's `has_audio` will read false for studio co-members, silently.
§9.4 puts `field_capture_id` and `has_audio` in the `margin_items` `note` branch. `margin_items` is
`with (security_invoker = true)` (`00282:606-607`), so the `field_captures` join runs under the
reader's RLS. A studio co-member can read the *note* (`margin_notes_studio_read`, 00205) but not the
*capture* (owner-only unless `status='inbox'` **and** same organization, `00233:155-188`). She gets a
note with no play button and no explanation — a violation of §3.3's "degrade honestly; never
silently drop", and the FC-R8 asymmetry surfacing in a view rather than a policy.
**Fix:** make it explicit in wave 4 — either render an honest line ("the recording is the author's"),
or fold this case into FC-R8's ruling before the view is written.
**Severity: medium · Confidence: 0.85**

### RC-24 · The interruption observer is never removed; the removal call in Task 8.5 is a no-op.
`NotificationCenter.default.addObserver(forName:object:queue:using:)` returns an opaque token; the
observer is *not* `self`. Task 8.5's
`NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification,
object: nil)` removes nothing, so every recording adds another block observer on a long-lived
service (see RC-04 for the lifetime).
**Fix:** store the returned `NSObjectProtocol` and `removeObserver(token)` in `finish()` / `deinit`.
**Severity: medium · Confidence: 0.92**

### RC-25 · The 20-minute / 24-segment cap is specified and unit-tested but never called.
`VoiceRecordingPolicy.shouldEnd` is created in Task 5, asserted in
`noteEndsAtTwentyMinutesOrTwentyFourSegments`, and referenced nowhere in Task 8's implementation.
Package §8.2 ("Cap at 20 minutes / 24 segments, ending visibly") and §7.4's *Cap reached* state are
therefore unimplemented in wave 1, while the test suite reports green.
**Fix:** call `shouldEnd(totalElapsed:segmentCount:)` from the rotation check and finish the note
with the visible "note ended at 20:00" line, or move the cap to wave 3 with C6 and delete the
assertion from wave 1 so the green does not over-claim.
**Severity: medium · Confidence: 0.92**

### RC-26 · The offline banner will report the wrong number.
Task 13.3 renders `OfflineQueueBanner(queuedCount: model.sessionCount)`. `sessionCount` is the count
of specimens in the current visit (`ViewfinderModel.swift:47, 133-137` via
`store.session(visitID:owner:)`), not the outbox depth. The banner's copy is "No signal · saving on
device" with `queuedCount` presented as *queued*
(`OfflineQueueBanner.swift:13-14`). A designer with 12 already-synced captures and nothing queued
sees "12 queued".
**Fix:** use the outbox count (`store.outbox()`-derived, the same source `LocalCaptureSyncService`
feeds to `CaptureSyncAttributes.queued`), not `sessionCount`.
**Severity: medium · Confidence: 0.85**

### RC-27 · Task 8.6's `ContextCaptureService` signature change is never threaded into its only caller.
Task 8.6 extends `ContextCaptureService.enqueueVoice` with `audioSegments: [String] = []`
(`ContextCaptureService.swift:51-61`), but the only caller —
`SiteScanContextCapture.swift:132-137` — is edited by Task 14, which does not pass the array. The
default keeps it compiling and the SiteScan voice path silently keeps only segment 0, so an
interrupted in-scan note loses segments 1+ (and `missingRequiredMedia` never guards them).
**Fix:** pass `audioSegments: result.audioSegments` at `:132-137` as part of Task 8.6, and add it to
the Task 14 diff's staged files.
**Severity: medium · Confidence: 0.9**

### RC-28 · The tap block mutates recorder state from the real-time audio thread.
Task 8.3 calls `self.rotateIfNeeded(…)` from inside `installTap`'s callback, which runs on
AVAudioEngine's render thread. `rotateIfNeeded` mutates `request`, `task`, `segmentStartedAt` and
reads `latestTranscript` (written from the recognition callback) with no synchronisation, and calls
`recognizer.recognitionTask(with:)` — an XPC round-trip — from the audio thread. `@unchecked
Sendable` (`SpeechVoiceNoteService.swift:14`) silences the compiler but not the race; the practical
symptom is audio glitching and occasional torn state at rotation boundaries.
**Fix:** have the tap only `append` + `write` and post a rotation *request* (an actor hop or a
serial queue) that performs the recognizer swap off the render thread.
**Severity: medium · Confidence: 0.8**

### RC-29 · Spec/plan divergence: §7.8 says fix "Route all N"; the plan renames it instead.
Package §7.8 wave 1 = "fix `Route all N`, which routes exactly one record", and §17.2 lists it under
re-homed behaviour. Plan Task 12 never calls `sync.routeAll` (which exists —
`CaptureSyncService.swift:114`, tested at `CaptureLifecycleTests.swift:557`, called by
`V2CullDeckScreen.swift:238`); it relabels the button "Place N" and walks records one at a time.
The plan's choice is defensible and arguably more honest, but the wave-1 table row is still titled
"`routeAll` tray fix", so the wave report will read as if bulk routing shipped.
**Fix:** align the wording in both documents to what Task 12 actually does.
**Severity: medium · Confidence: 0.9**

### RC-30 · `POSTHOG_API_KEY` as an env fallback does not work for an installed iOS build — and the plan asks for that claim to be committed into the template.
`AppConfiguration.swift:130-132`:
`Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""`.
On iOS, `ProcessInfo.environment` only carries variables injected by an Xcode scheme *run* action;
an `export` before `xcodebuild` does not reach the installed app. Task 2.3 has the engineer write
"Set it here, or export POSTHOG_API_KEY before the build" into the committed
`Secrets.example.swift`.
**Fix:** reword to "Set it here, or add `POSTHOG_API_KEY` to the Capture scheme's Run →
Environment Variables (debug runs only). A distributed build must have it in `Secrets.swift`."
**Severity: medium · Confidence: 0.85**

### RC-31 · `application/json` is a behaviour change in the MIME map, and the drift test's fixture list overstates what the app can emit.
`LocalCaptureSyncService.mimeType` (`:656-668`) has **no** `json` case — `.json` falls to
`application/octet-stream`. `CaptureMediaMime.forFilename` (Task 4.3) adds
`case "json": return "application/json"`. Both are in `00234`'s allow-list
(`:31-32`) so nothing 400s, but this is a silent semantic change presented as a pure move. The test
fixture also asserts over `"manifest.json"` and `"blob.bin"`, neither of which any code path
uploads to `capture-media` today.
**Fix:** either preserve today's behaviour (no `json` case) or call the change out in the commit
message. Trim `emittable` to what the uploader actually produces (`.heic`, `.m4a`), or document why
the extras are aspirational.
**Severity: medium · Confidence: 0.85**

### RC-32 · `FieldCapturePayload.currentSchemaVersion` is not bumped even though the 00235-side reader changes.
The file's own contract (`FieldCapturePayload.swift:41-43`):
> `/// Bumped only alongside a 00235-side reader change.`
> `public static let currentSchemaVersion = 1`

00521 *is* a reader change (five new payload reads) and Task 6 adds three wire keys, yet no task
touches `currentSchemaVersion`. `capture_schema_version` on the row therefore cannot distinguish a
pre-wave-1 payload from a post-wave-1 one, which matters for any later backfill.
**Fix:** bump to 2 in Task 6 (additive; the reader coalesces missing keys, so old builds keep
working) or amend the contract comment deliberately.
**Severity: medium · Confidence: 0.8**

### RC-33 · §8.10's "audio integrity" hop has no wave-1 producer, and conflates two different mechanisms.
The table maps `voice_audio_sha256 → merge_capture_artifact_sha256 (00235:382-395)`. That RPC exists
and is correctly cited, but it merges into the **`artifacts_sha256` JSONB** column, not into the new
scalar `voice_audio_sha256` that 00521 adds and reads from `{voice,audioSha256}`. Nothing in Tasks
5–9 computes a SHA-256 of the audio, so both the column and the wire key are dead in wave 1 (the SQL
test passes a literal `'deadbeef'`).
**Fix:** either drop `voice_audio_sha256`/`audioSha256` from 00521 and Task 6 until a producer
exists, or add a hashing step to Task 9's upload loop and pick one mechanism (the scalar column
*or* `merge_capture_artifact_sha256`) rather than describing them as the same hop.
**Severity: medium · Confidence: 0.85**

### RC-34 · FC-R5's merged room picker silently degrades to `project_rooms`-only on exactly the projects FC-R7 is about.
`FieldProjectDetail.rooms` is fetched by `fetchClientRooms(clientID: row.clientID)`
(`SupabaseProjectsService.swift:102`), and that file's own comment (`:189`) says: *"no client → no
rooms to list — return [] without a query."* So on any project whose `designer_clients` row has no
registered `client_id` — the same population where `create_client_decision('pending')` raises —
the `public.rooms` lane is empty and a site scan started from V0 has no room to attach to.
**Fix:** price this in FC-R5's "cost of being wrong" and in Flow 4's `ownableProjects()` tiebreak:
the honest expansion must also cover "this project has no client rooms yet".
**Severity: medium · Confidence: 0.85**

### RC-35 · `CaptureSyncAttributes.ContentState`'s explicit memberwise init means the §5.5 shape change needs defaults.
`CaptureSyncAttributes.swift:16-20` has a hand-written
`public init(queued:uploading:failed:lastSpecimenTitle:)`. Adding `visitLabel`, `elapsedSeconds`,
`captureCount` without defaults breaks the two existing call sites in
`LocalCaptureSyncController`/`CaptureLiveActivityController` and the
`FieldCompanionPresentationTests` the plan proposes to extend (2-1's tests).
**Fix:** give all three `= nil` defaults in the init, and say so in the 2-1 task text; also note
that `ActivityAttributes.ContentState` decode of an in-flight activity across an app update is only
safe because the new fields are optional.
**Severity: medium · Confidence: 0.8**

### RC-36 · Task 10.4's `REVOKE`/`GRANT` block is unnecessary and the C7 rationale does not apply to a replacement.
`CREATE OR REPLACE FUNCTION` preserves the existing ACL; Postgres default privileges are applied only
when a function is **created**. `commit_field_capture` already carries
`REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated` (`00235:303-304`). Restating it is
harmless but the plan presents it as required by C7 ("prod default privileges auto-grant `anon`
EXECUTE, and that has bitten twice"), which is true for *new* routines only. Note also that the
canonical idiom cited (`00437:516-529`) revokes from `PUBLIC, anon, authenticated, service_role` and
`00413:2603-2605` from `PUBLIC, anon, service_role`; the plan's `PUBLIC, anon` matches neither.
**Fix:** keep the restatement (belt and braces) but correct the rationale, and match the fuller idiom
if the ACL conformance gate is expected to notice.
**Severity: medium · Confidence: 0.85**

### RC-37 · `useEscalateNoteToDecision` / `ToScopeChange` are portal-local hooks, not `@patina/supabase`.
Package §2.1 and §11.4 promise they "work on field notes for free"; they do, but they live at
`apps/designer-portal/src/hooks/use-margin-notes.ts:64` and `:128` (imported by
`margin-bodies.tsx:37`), not in the shared data package. §11.1 meanwhile proposes the new
`useCaptureMediaUrls` in `packages/supabase/src/hooks/`. Both placements exist in the repo, but the
package should say which convention wave 4 follows so the implementer does not split the field-note
data layer across two packages.
**Severity: medium · Confidence: 0.9**

### RC-38 · `Set(voiceNames)` makes `missingRequiredMedia`'s output order nondeterministic.
Task 6.6's `for name in Set(voiceNames) { required.append(name) }` iterates an unordered `Set`, so
the array (and the `CaptureMediaAvailabilityError.missingLocalMedia([...])` message it feeds) varies
run to run. The shipped function is deterministic (photos sorted by `order`, then the single voice
file). Cosmetic today; it will make a flaky assertion the moment anyone tests the message.
**Fix:** de-duplicate order-preservingly (`var seen = Set<String>(); for n in voiceNames where
seen.insert(n).inserted { required.append(n) }`).
**Severity: medium · Confidence: 0.8**

---

## LOW

### RC-39 · "Designer-Taught Intelligence" is not in the brand-voice skill.
Package §3.8 and §15.4 cite *"PRD §13, `.agents/skills/patina-brand-voice/SKILL.md`"*.
`grep -rin "designer.taught" .agents/skills/patina-brand-voice/` returns nothing. The rule lives at
`docs/design/the-document/DECISIONS.md:1554` ("Always the Engine / Designer-Taught Intelligence in
copy — never 'AI.'"). The skill file carries the adjacent rules only (`:23` "NEVER lead with AI,
algorithm, engine"; `:36` avoid-list includes "AI-powered").
**Fix:** cite `DECISIONS.md:1554`.
**Severity: low · Confidence: 0.9**

### RC-40 · `DECISIONS.md` is at `docs/design/the-document/DECISIONS.md`, not the repo root.
Package/rulings refer to it unqualified. Minor, but the rulings file prescribes an
`append_entry.py`/`workstream_state.py` flow (both exist at `scripts/`) that operates on that path.
**Severity: low · Confidence: 0.95**

### RC-41 · Line-citation drift (all content verified correct; ranges are off by 1–11).
Not defects, but a reader following them lands slightly wrong:

| Citation | Actual |
|---|---|
| `ViewfinderModel.swift:341-344` (makeDraft routing copy) | `:345-350` |
| `ViewfinderModel.swift:409-419` (applySmartGuess) | `:413-423` |
| `ViewfinderModel.swift:290-294` (saveFromCard catch) | `:297-300` |
| `ProjectsService.swift:106-140` (`projectDetail` + both room lists) | struct `:117-140`, method `:146` |
| `ViewfinderControls.swift:43` (`ViewfinderVenueChip`) | `:36` |
| `AppContainer.swift:111-112` (camera wiring) | `:105-110` |
| `SiteScanContextCapture.swift:129` (the discard guard) | `:128` |
| `00233:154-188` / `:174-188` / `:196-256` | `:155-188` / `:175-188` / `:199-260` |
| `00234:26-29` (audio MIMEs) | `:27-30`; policies `:39-69` not `:41-67` |
| `00235:95-146` (the INSERT) | `:89-146` |
| `00196:51-54` (`margin_notes_designer_all`) | `:52-55` |
| `00177:37-39` (running-timer index) | `:39-41` |
| `00413:1866-1875` (the three gates) | `:1829-1861` |
| `generate_project.rb:87` / `:129,147` | `:88` / `:129, :149` |
| `use-room-files.ts:378` | `:385` (fn at `:370`) |
| `letterhead-instruments.tsx:118-130` | `createSignedUrls` at `:123` |

**Severity: low · Confidence: 0.95**

### RC-42 · Task 1.1's expected `ls | tail -6` output is wrong.
`supabase/migrations/` contains a `_pending/` directory (holding
`00106_drop_client_messages.sql`), so `ls | tail -6` ends with `_pending`, not
`00515_capture_enrichment_rpcs.sql`.
**Fix:** `ls supabase/migrations/*.sql | tail -4`.
**Severity: low · Confidence: 0.95**

### RC-43 · `transcript_edited_at` lands in wave 1 with no writer until wave 6.
§9.2(a) adds it; §8.6's `COALESCE(server_transcript, voice_transcript) unless transcript_edited_at
IS NOT NULL` is the only consumer and is wave 6. Harmless, but it is a column shipped ahead of both
its writer and its reader, which the package elsewhere argues against.
**Severity: low · Confidence: 0.85**

### RC-44 · Deleting `FieldPlaceholderScreen` removes a `public` symbol from the CaptureKit framework.
`CaptureKit/CaptureKit/Design/FieldPlaceholderScreen.swift:12` is `public struct`. Zero in-repo
references confirmed, so the deletion (2-3) is safe — but the package treats CaptureKit's surface as
a frozen contract elsewhere (§5.5), and this is a contract removal not listed among the
foundation-seam edits.
**Severity: low · Confidence: 0.8**

### RC-45 · Package and plan disagree on the F1-context replacement copy.
§7.11 PROPOSES *"This iPhone can't measure a room. These photos and notes go to Maple St · Living."*
Plan Task 14.3 writes *"Photos and notes you take here stay with this scan session. / They'll reach
the studio as soon as you have signal."* The plan's version is correct for wave 1 (no visit exists
yet), but the divergence is unflagged, and §5's own rule is "the spec wins for design".
**Severity: low · Confidence: 0.9**

### RC-46 · Task 14.3's snippet drops the `.font`/`.foregroundStyle` modifiers on all three strings.
The live block (`SiteScanContextCapture.swift:261-269`) chains `CaptureType.eyebrow` /
`CaptureType.title2` / `CaptureType.footnote` and three `CaptureColor` tokens. The replacement shows
bare `Text(...)`. Illustrative rather than literal, but a literal application would silently drop
the styling.
**Severity: low · Confidence: 0.9**

### RC-47 · Task 7.3's insertion point is self-contradictory.
"At the **end of** `CaptureSessionContext.swift`, **after** the `CaptureRoutingMemory` struct's
`static let empty`" — `static let empty` is at `:46`, inside the struct, whose closing brace is
`:47`; the file continues with `CaptureSessionContext` at `:49`. Both readings produce working code
(the extension is top-level), but a literal "after `empty`" places it inside the struct body.
**Fix:** "at the end of the file, after the `CaptureSessionContext`/`CaptureSessionContextPolicy`
declarations."
**Severity: low · Confidence: 0.9**

### RC-48 · The `capture-media` path convention differs between 00234's comment and the shipped code.
`00234:11` documents `capture-media/<auth.uid()>/<client_capture_id>/<artifact>`;
`CaptureMediaPath.folder(userID:clientToken:)` builds `<uid>/<clientToken>`
(`CaptureMediaPath.swift:21-23`). They coincide only because the device passes `clientToken` as
`p_client_capture_id`. §8.4 repeats the `<clientToken>` form (correct); worth noting so nobody
"fixes" one to match the other.
**Severity: low · Confidence: 0.85**

### RC-49 · PostHog feature flags load asynchronously; the "fail-closed seam" needs a reload story.
`PostHogSDK.shared.isFeatureEnabled(_:)` (posthog-ios ≥3.48, `PostHogSDK.swift:2224`) reads a cached
flag set populated after `setup`/`identify`/`reloadFeatureFlags`. A cold launch before the first
fetch answers `false` for every key — correct per the fail-closed intent, but the kill switch will
also read `false` on the first seconds of every launch, which is the opposite of a kill switch's
useful failure mode. Not a wave-1 blocker (nothing is gated yet).
**Fix:** note it in 1-3, and call `reloadFeatureFlags()` after auth resolves.
**Severity: low · Confidence: 0.75**

### RC-50 · `README.md`'s stale claims are correctly identified; one more is worth adding.
§17.4's list is accurate. Also stale and inside the blast radius:
`CaptureScreenID.swift:4` ("51 entries" → 71, 74 after §5.5) is listed;
`AppContainer.swift:88-90` is listed; add `Capture/Features/Resilience/ResilienceScreens.swift:9`,
whose header describes `LowLightTorchOverlay / OfflineQueueBanner` as things "the C1 viewfinder /
session tray drop in", which has never been true.
**Severity: low · Confidence: 0.85**

### RC-51 · Unnamed CHECK constraints in 00521.
`ADD COLUMN … CHECK (…)` creates system-named table constraints
(`field_captures_capture_kind_check`, etc.). Every neighbouring migration in this family does the
same (`00233:36-37`), so this is consistent — but wave 6 will want to widen `transcript_source`
(`'server'` is already in the CHECK, so that one is fine) and `audio_retention`, and named
constraints are cheaper to `DROP`.
**Severity: low · Confidence: 0.7**

### RC-52 · `docs/engineering/migration-number-reservations.md` anchors for Task 1.2/1.3 are correct.
Verified: the Reservations table row for Phase 3 is at `:79`
(`~~00503–00509~~ 00514–00520 | Phase 3 (capture enrichment)…`), and the subsection heading
`### Drawn from 00514–00520 (Phase 3 capture enrichment, C-A1)` is at `:99`. The discipline rules
(1–5) quoted by C6/FC-R17 are at `:215-234` and are quoted accurately. No defect — recorded so the
implementer does not re-verify.
**Severity: low · Confidence: 0.95**

### RC-53 · `run-sql-tests.sh` connects as `postgres` (superuser), so RLS-shaped assertions do not prove RLS.
`PGURL="${PGURL:-postgresql://postgres:postgres@…}"` (`:92`); the plan's `docker exec … -U postgres`
is the same. Test case 6 (policy `roles = '{authenticated}'` over `pg_policies`) is a catalog
assertion and is fine; test cases 1–5 exercise `auth.uid()` via `set_config('request.jwt.claims')`
but with RLS bypassed. The existing `apply_field_effect_test.sql:25-27` documents exactly this
caveat. Not a defect — but the wave report must not claim "RLS verified".
**Severity: low · Confidence: 0.9**

### RC-54 · `field_captures` has exactly five policies today, so test case 6's `= 5` is currently safe.
Verified: `grep -rn "CREATE POLICY.*field_captures" supabase/migrations/*.sql` returns only
`00233:155/159/163/168/175`. The assertion will break the moment FC-R8 rules per-studio and adds a
sixth — flag it in the test's own comment so the failure reads as intentional.
**Severity: low · Confidence: 0.9**

---

## What checked out exactly (recorded so it is not re-verified)

- `present(.assignVenue` → exactly three sites, at `CaptureDeepLink.swift:96`,
  `S2CreateProjectScreen.swift:172`, `V1SessionTrayScreen.swift:126`. None is C3 or C5.
- `V1SessionTrayScreen.swift:125-127` is verbatim what Task 12.2 proposes to replace;
  `endVisit` toolbar button at `:61`, function at `:151-155`, `reload()` scope at `:139-147`.
- `SpeechVoiceNoteService.swift`: `mediaDirectory` `:22` stored-never-read, `audioFilename` `:23`
  read-only at `:107`, header lie at `:7`. Zero `AVAudioFile|AVAudioRecorder` in the tree.
  All three construction sites pass `container.store.mediaDirectory()`.
- `commit_field_capture`: inbox branch `00235:205-217` sets only `status`; library branch
  `:255-264` persists routing; safe-harbor `:273-298`; `merge_capture_artifact_sha256` `:382-395`.
- `00234` allowed MIME list is byte-identical to Task 4.3's `bucketAllowed` (10 entries).
- `LocalCaptureSyncService.mimeType` `:656-668`; `uploadMedia` returns `String?` `:365`; the
  `payload.voice?.audioPath` assignment is at `:313`.
- `CaptureRoutingMemory` `:22-47` with `.empty`; `VenueStamp` init `:25-49` — Task 7's test compiles
  against both.
- `CaptureAnalytics` protocol `:8-16` + extension `:18-25` — Task 3.3's insertion points are exact,
  and `analytics.event("name")` (one arg) resolves via `:20`.
- `CaptureKit` scheme includes `CaptureTests` (`generate_project.rb:255-258`); `CaptureTests` links
  CaptureKit only (`:149, :152`) — constraint C1 confirmed.
- `capture-gate.sh` lint no-ops without swiftlint and exits 0 (`:27-34`) — C2 confirmed.
- `CaptureShareExtension/`, `CaptureWidgets/`, `CaptureUITests/` hold zero files; only four targets
  are generated (`:28-30, :129`).
- `Info.plist` declares only the `field://` scheme; no `UIBackgroundModes`,
  `NSCalendarsUsageDescription` or `NSLocationAlways*` in the plist or the `INFOPLIST_KEY_*` block.
  Zero `import AppIntents`. `settings.action_button_rebind` fires at `SettingsScreen.swift:196`.
- `Secrets.example.swift:16` is `static let postHogAPIKey: String? = nil`; the local (gitignored)
  `Secrets.swift:17` is also nil.
- `00297`: `task_type` "deliberately no CHECK" `:41`; `idempotency_key text UNIQUE` `:54`;
  admin-domain-only SELECT `:202-214`; `claim_agent_tasks` `:320`; `'awaiting_review'` in the status
  CHECK `:42-43`.
- `_shared/field-parse.ts`: `DEFAULT_MODEL = "claude-haiku-4-5"` `:50`, injectable
  `fetchImpl`/`getEnv`/`model` `:45-47`, direct `api.anthropic.com` fetch `:166`.
  `sms-inbound/pipeline.ts:574` is `parsed.confidence >= 0.8`.
- `derive-scan-photo-media`, `dispatch-scan-modal`, `sms-inbound` all exist; `00340`, `00375`,
  `supabase/tests/edge_api/public_acl_exception_registry.sql` all exist.
- Portal: `RoomFilesSection` has exactly zero importers and returns `null` twice (`:37, :40`);
  `<ScheduleSpine>` `page.tsx:1354` / `<FFESection>` `:1360`; `photoAssetIds: string[] = []` at
  `log-inspection-drawer.tsx:151`; `SupabaseReceivingService.swift:114` writes it and `:250` maps
  it; zero `capture-media` references in any portal or package `src/`; `useFieldMediaUrl` at
  `use-party-sms.ts:164`; `products.capture_source` appears only in `database.types.ts`.
- `project_tasks` FOR ALL policy on `projects.designer_id = auth.uid()` `00169:60-62`;
  running-timer partial unique index `00177:39-41`; `activity IN (… 'site_visit' …)` `00198:27-29`;
  `source IN ('timer_auto','timer_manual','manual_entry')` `00198:25-26`.
- `margin_items` recreate discipline `00282:600-607`; `field_sms` branch `:871-905`.
- `create_client_decision` grants `00413:2603-2608`; `'pending'` raise `:1858-1861`;
  `_can_author_proposal` `:1854`; payload keys `coordination_kind`, `court`, `room_id`,
  `section_key`, `status` all allow-listed.
- `WorkDashboardScreen.swift` = 669 lines. `CaptureScreenID` header says 51, has 71 cases.
  `screen.F1.context` is set at `SiteScanContextCapture.swift:222/224` and is not an enum case.
- `OfflineQueueBanner` referenced only in its own `#Preview` (`:83-84`); `LowLightTorchOverlay`
  only at `:122`; `FieldPlaceholderScreen` zero references; zero `NWPathMonitor` in the tree.
- `CaptureSyncAttributes` FROZEN header `:6`; `CaptureLiveActivityController` exists app-side.
- `handleCompanionAction` switches on `action.id` with a `default:` at `RootView.swift:218+`.
- `ProjectPlacementOrchestrator`'s lookup-before-write on
  `routing_source->>captureId` (`SupabaseCaptureGateway.swift:82`).

---

*Read-only review. The only file created is this report.*
