# Field Companion · Program Plan

Issued 2026-08-24 · Spec: `docs/design/field-companion/field-companion-package.md` ·
Rulings: `docs/design/field-companion/field-companion-rulings.md`
**If this plan and the spec conflict, the spec wins for design and this plan wins for build order.**

---

## 0 · How to read this

- **Waves 1–6** are work packages: goal · files · interfaces · acceptance · tests · gates · device
  pass · flags · rollout/rollback · dependencies · owner model · estimate.
- **Wave 1 alone** carries a full bite-sized implementation plan (§8). **Every later wave gets its
  own bite-sized plan written at wave start**, not now — the repo moves, and a plan written six
  weeks early is a plan written against a repo that no longer exists.
- Sizes: **S ≈ ≤3 days · M ≈ 1–2 weeks · L ≈ 3+ weeks** of one engineer.
- Owner model per package: **Opus** (hardest multi-file, first attempt must be right) · **Sonnet**
  (default executor) · **Haiku** (mechanical). Adversarial review is always a **separate context**;
  the implementer never reviews its own work.

### 0.1 Standing constraints — every wave, no exceptions

| # | Constraint | Why |
|---|---|---|
| C1 | **`capture-gate.sh test` runs `-scheme CaptureKit` only.** `CaptureTests` links **CaptureKit alone** (`generate_project.rb:129, :149`: `tests.add_dependency(kit)`); every test file is `@testable import CaptureKit`. **App-target code — `ViewfinderModel`, `SpeechVoiceNoteService`, `LocalCaptureSyncService`, every screen — is NOT unit-testable today.** Therefore: **any logic that needs a test must live in CaptureKit as a pure type**, with the AVFoundation/SwiftUI/network glue app-side and verified by device pass. This shapes every task below. |
| C2 | **`capture-gate.sh lint` silently no-ops and still exits 0** without swiftlint (`:27-33`). A green `all` does not mean lint ran. |
| C3 | **There are no UI tests.** `CaptureUITests/` is an empty directory with no target-generation code. `generate_project.rb` creates **exactly four** targets. |
| C4 | **`generate_project.rb` must be re-run and `Capture.xcodeproj` re-committed** whenever a `.swift` file is added or removed. `capture-gate.sh` runs it for you; the pbxproj diff must be in the commit. |
| C5 | **Budget one device pass per wave and never let a green `capture-gate.sh` stand in for one.** Camera, mic, Speech, ARKit and Live Activity are all Simulator-fallback surfaces. ⚠ **`capture-gate.sh build` is a Simulator compile gate and nothing else** — it is `xcodebuild build -scheme Capture -sdk iphonesimulator -destination "platform=iOS Simulator…" CODE_SIGNING_ALLOWED=NO` (`capture-gate.sh:13-18`), and `patina-ios-verification` forbids installing a `CODE_SIGNING_ALLOWED=NO` build for a walk. **The device command is separate and explicit:** `xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug -destination 'platform=iOS,id=<UDID>'` with signing **on** (team `VP22LXHT7L`, automatic), or the `blitz-iphone` install path. Wherever a task below says "install on the device", it means that command, never `capture-gate.sh build`. |
| C6 | **Migration numbers are claimed at landing, not at authoring** (reservations doc, discipline rule 1), and `supabase migration list` against Strata must be re-checked immediately before every push (rule 2). ⚠ **The census must cover the filesystem, `git log --all --oneline -- 'supabase/migrations/*.sql'`, AND `git worktree list` — the reservations doc alone was not enough this week.** `00521` is already taken on `main` by `00521_svc_media_shape_reconciliation.sql` (`ca2b0641b`) and is **absent from the reservations doc**. This plan therefore names its migrations **symbolically** — *the W1 routing migration*, *the visit/suggestion migration*, *the margin migration*, *the time-entry migration*, *the punch back-reference migration* — and the numbers live in exactly one place, the reservations doc, claimed at landing. **The band is `00530–00535`**, confirmed 2026-08-24 with both live lanes (Phase 2 stays ≤ `00529`; Phase 3 holds `00514–00520`) — a **symbolic** reservation only, nothing minted until Kody approves the build, and **re-confirmed against the ledger file AND `supabase migration list` on Strata immediately before each push** (file-based push invariant, `docs/ops/strata-staging.md`). Where a file name is unavoidable, write **`005NN_<slug>.sql`**, with `NN` drawn from the reserved band at landing. |
| C12 | **`commit_field_capture` is a SHARED object with two live authors this week.** Phase 3's `00516_capture_producer_idempotency.sql` (branch `feat/capture-producer-idempotency`, committed in a sibling worktree) does `CREATE OR REPLACE FUNCTION commit_field_capture` from 00235's body plus an added `enqueue_capture_enrichment(...)` call. **Whichever migration lands second silently reverts the other** — no error, no failed migration. Before authoring, run `grep -rl 'commit_field_capture' supabase/migrations` **across all refs and worktrees**, and author from **00516's** body with 00516 declared a hard prerequisite. Gated on ruling **FC-R18**. |
| C7 | **Every new `public.` routine needs `REVOKE ALL … FROM PUBLIC, anon;` explicitly** (`00437:516-529`) or the ACL conformance gate trips. Prod default privileges auto-grant `anon` EXECUTE, and that has bitten twice. |
| C8 | **The SQL suite is a usable gate — the "71/108 red" figure is stale and must not be quoted.** `supabase/tests/KNOWN_FAILURES.md` records that the `pg_temp` permission-denied family (55 files) **is fixed**, leaving **22** documented known failures across **122** test files (one of the 23 was closed by 00510). `scripts/run-sql-tests.sh` treats those 22 as expected and **exits 0 if only they fail**. So: run `scripts/run-sql-tests.sh -f <name>` **and** the full suite, and report both — a new unexpected failure is a real regression. The standalone `psql` invocation stays as a debugging aid, not as the reported gate. ⚠ The runner connects as `postgres` (superuser, `:92`), so `auth.uid()`-shaped assertions run with **RLS bypassed** (`apply_field_effect_test.sql:25-27` documents this). **No wave report may claim "RLS verified" from them.** |
| C9 | **`git add` explicit pathspecs only. Never `git add -A`.** Concurrent agents get their own worktree. |
| C10 | **The husky `commit-msg` hook rejects `merge:` subjects.** Use `fix(db): merge …` if it comes up. |
| C11 | **`Secrets.swift` is gitignored**; `Secrets.example.swift` is the committed template. Never commit a real key. |

### 0.2 The four facts this plan is built on (all re-verified this session)

1. **No audio has ever left a Field device.** `SpeechVoiceNoteService.swift:22-23` declares
   `mediaDirectory` (never read) and `audioFilename` (only read, at `:107`); repo-wide
   `AVAudioFile|AVAudioRecorder` → **0 hits**. Its own header comment claims the opposite, which is
   why two discovery reports got it wrong.
2. **`commit_field_capture`'s inbox branch drops routing.** `00235:205-217` sets only `status`;
   `project_id`/`project_room_id`/`shelf` are written only in the library branch (`:255-264`).
   ⚠ And `00235:85-88` says the deferral is **deliberate** — *"deferred to the library branch so a bad
   route can be safe-harbored instead of hard-failing the whole sync"* — so the fix must carry its own
   `EXCEPTION WHEN OTHERS` safe harbor (Task 10.4).
3. **`CaptureRoutingMemory.projectRoomID` is write-only.** `ViewfinderModel.swift:345-350` copies
   four of five routing fields; `venue.projectRoomId` is assigned nowhere in that file.
4. **Migration numbering has moved twice, and the second move is the one the package missed.**
   `00514`/`00515` are taken (`a11268420`, Phase 3 capture enrichment) and the reservations doc
   reserves **00514–00520** to that lane — **and `00521` is also taken**, by
   `00521_svc_media_shape_reconciliation.sql` on `main` (`ca2b0641b`, 2026-08-24 15:05), which the
   reservations doc **does not record**. Phase 3's `00516` is authored on a branch and does
   `CREATE OR REPLACE commit_field_capture`. The band drawn in response — **`00530–00535`** — is
   pre-agreed with both live lanes and is symbolic until Kody approves the build. See C6 and C12;
   rulings **FC-R17** and **FC-R18**.

---

## 1 · Wave 1 — "The note survives"

> **The first shippable slice. ≈12 iOS engineer-days + ≈1.5 DB engineer-days, run in parallel —
> ≤2 engineer-weeks with two owners, ~1.5–2 weeks wall-clock.** No portal work *in this wave* (see
> **Wave 1P**, §1.4, which runs beside it). No IA change. One flag, and it gates one thing: the
> recorder. Device-walkable on its own, and worth having even if the wedge question comes back "no".

⚠ **The title was "…and it lands somewhere" and that half was not true.** *Lands* is a server-side
claim only: `packages/supabase/src/hooks/use-room-files.ts:385` is the **sole** `.from('field_captures')`
in the entire web tree, it is scan-scoped, and it sits inside the fail-closed `room-file` view. **After
wave 1, nothing she captured looks any different in the Document.** Portal visibility begins in Wave 1P
or wave 4. Of the wave's packages, exactly four are perceptible to a designer: audio survival (in
*two* surfaces, not one), playback, the offline banner + auto-drain, and the placement line.

### Goal
A voice note **keeps its audio** — so a note that transcribes to nothing on a noisy site is no longer
silently thrown away, on **either** voice surface — she can **play it back** to check, and a capture
**can be placed on a project and a room in three taps from the card, returning to the camera**, with
the project and room actually persisting server-side. Plus the truth fixes that make the rest of the
program measurable.

### What a designer feels
1. She holds the mic on a loud job site, the words don't come through, and **the recording is
   still there** with an honest line instead of the toast "Nothing recorded." **On both surfaces** —
   the in-scan context capture *and* N4, the specimen voice sheet, where most voice notes are actually
   taken and where today the *"Attach note"* button is simply **disabled** when there are no words.
2. She can **play the recording back**, on the sheet and in the tray — so *"the audio is here"* is
   something she can check rather than something the app asserts.
3. A note longer than a minute no longer silently truncates.
4. From the card after the shutter she taps **Not placed → project → room → Done**, and lands back on
   the camera; every capture in that session inherits **both** the project and the room — which it
   does not today.
5. When she is offline the camera says so, and when signal returns the queue drains by itself.

### Work packages

| # | Package | Size | Owner | Notes |
|---|---|---|---|---|
| **1-0** | **Record the missing svc-media `00521` in `docs/engineering/migration-number-reservations.md`**, then re-census (`ls` + `git log --all` + `git worktree list`) | S | Haiku | The doc is demonstrably incomplete — repairing it is worth more than the reservation, because the next lane's census fails the same way |
| **1-1** | Reserve the pre-agreed band **00530–00535**; record Phase 3's branch-authored `00516` at the same time | S | Haiku | Discipline rule 5: the edit lands **before or with** the migration. ⚠ **Gated on FC-R18** — if Phase 3 takes the routing fix, this program authors no `commit_field_capture` replacement at all. ⚠ Also gated on `00516`'s fixed `commit_field_capture` (the `enqueue_capture_enrichment_for_producer` wrapper) merging to main |
| **1-2** | Set `postHogAPIKey` **through a build-time path**, ship one build, **confirm `surface='field-ios'` rows appear** | S | Sonnet | 0 rows in 180 days vs 6,017 for `patina-ios`. ⚠ The `POSTHOG_API_KEY` env fallback is read at **runtime** and only an Xcode scheme's Run action injects it — never a device install, never TestFlight, never CI. A gitignored `Secrets.swift` makes the gate pass on one Mac |
| **1-3** | `isFeatureEnabled` on the `CaptureAnalytics` seam, fail-closed, **plus `reloadFeatureFlags()` after auth resolves** — and **gate the recorder behind it** | S | Sonnet | Field has **no** flag mechanism at all; the client app already uses `isFeatureEnabled`. Gating the recorder gives the seam a real first consumer and gives FC-R11's consent exposure an off-switch that needs no build |
| **1-4** | `CaptureMediaMime` in CaptureKit + the bucket drift guard | S | Sonnet | Moves the MIME map out of the app target so the audio contract is gate-testable (C1). This guard is what caught the M2 Storage 400 |
| **1-5** | `VoiceRecordingPolicy` in CaptureKit — rotation, cap, segment naming | S | Sonnet | Pure; the app-side recorder reads it |
| **1-6** | The audio wire: `VoiceNoteResult.audioSegments`/`.onDevice`, `Specimen.voiceAudioSegmentsRaw`/`.voiceAudioRemotePathsRaw`/`.captureKindRaw`, a segment-aware `CaptureStore.missingRequiredMedia` that **exempts an uploaded segment**, `FieldCapturePayload.Voice.audioSegments` + the top-level `captureKind`, and the `currentSchemaVersion` bump to 2 | M | Opus | Additive, SwiftData-lightweight, frozen-payload-contract change. ⚠ `captureKind` needs a **real wave-1 producer** or the migration's CHECK is a green test over behaviour that cannot happen. ⚠ The exemption is what stops one unreadable segment hard-failing a note that today syncs transcript-only |
| **1-7** | `CaptureRoutingMemory.stamped(onto:)` + `makeDraft` delegates — **the write-only `projectRoomID` bug** | S | Opus | Two-line behaviour change, one new pure type, one regression test |
| **1-8** | App-side recorder: write the `.m4a` from the existing tap **at the tap's own channel count**, rotate the recognizer at ~50 s **off the render thread**, restart the engine and open segment N+1 on interruption, **enforce** the 20-min cap, remove the observer **by token**, reset every per-note field per recording, and set **and record** `requiresOnDeviceRecognition` | M | **Opus** | The hardest package in the wave. Device-verified, not unit-tested (C1). ⚠ One service instance serves many notes (`SiteScanContextCapture.swift:237`, `SiteScanHostScreen.swift:212`), iOS **stops the engine** on an interruption, a hardcoded mono `AVAudioFile` **traps** on a route change (`try?` cannot catch an ObjC exception), and `addObserver(forName:…)` returns a **token**, not `self` |
| **1-9** | App-side upload: every segment uploads; payload paths upgraded; `mimeType` delegates to `CaptureMediaMime` | S | Opus | |
| **1-10** | The **W1 routing migration** (`005NN_field_capture_notes_and_routing.sql`) + a standalone SQL test | M | Sonnet | Runs in parallel with 1-5…1-9 |
| **1-11** | C3 placement line → the existing `.assignVenue(id)` sheet | S | Sonnet | The minimum project-landing affordance: no visit, no V0, no offline cache |
| **1-12** | **Tray footer honesty fix** — *"Route all N"* (`V1SessionTrayScreen.swift:126`) routes exactly one, so it is **renamed to "Place N"** and walks the unplaced records one at a time | S | Haiku | ⚠ This is **not** a `routeAll` wiring task: bulk-placing a tray to one project is a different, unasked-for act, and `sync.routeAll` keeps its one real caller (`V2CullDeckScreen.swift:238`). Spec §7.8 says the same |
| **1-13** | `NWPathMonitor` → drain + resume; render `OfflineQueueBanner` | S | Sonnet | Zero `NWPathMonitor` in the tree; the banner is preview-only dead code |
| **1-14** | The honesty repair on the scan-context screen + the failure-ladder copy + **both "added to Inbox" toasts** | S | Sonnet | `SiteScanContextCapture.swift:128` and the three ESCALATE strings it forces. ⚠ `:141` sets the success toast **unconditionally**, so the honest message never renders unless the toast is set once at the end |
| **1-16** | **The N4 honesty repair + playback.** Enable *"Keep the recording"* whenever `audioSegments` is non-empty; delete the segments on Discard; `AVAudioPlayer` on the N4 sheet and the tray row | M | Opus | ⚠ Without this, wave 1's headline defect is fixed only *inside a LiDAR scan session*, and N4 — where most voice notes are taken — still refuses a wordless note outright (`VoiceNoteSheet.swift:62-69`). Zero `AVAudioPlayer`/`AVPlayer` exist in the app today |
| **1-17** | **Emit the wave-1 voice telemetry.** `voice.start`, `voice.finish` (`duration_s`, `segments`, `transcript_chars`, `on_device`), `voice.segment_rotated`, `voice.interrupted`, `voice.audio_write_failed`, `voice.empty_transcript`, `capture.placed`, `capture.unplaced` | S | Sonnet | ⚠ No other task emits a single `voice.*` event, yet acceptance criterion 7 and Task 18.5 both ask PostHog for `voice.finish`. `on_device` requires **storing** the resolved `requiresOnDeviceRecognition`, not just setting it |
| **1-18** | **Device-side media retention** (FC-R19): delete a segment once its commit receipt lands, delete on Discard, size-capped sweep | S | Sonnet | Nothing prunes the App Group today — `removeItem` appears only in `SiteScanBundleHome.swift`. A 30-min walk-through is ~7 MB on top of accumulating photos |
| **1-15** | Gate + device pass + telemetry confirmation + wave report | S | Opus | |

**Deliberately NOT in wave 1:** `applySmartGuess` → the real service (wave 2 — the real service is
`async`, so it is a control-flow change, not a one-liner), the visit, V0, the offline project cache,
C6 voice mode, the inline mic on the card, any portal work, any flag.

### Interfaces neighbours rely on

```swift
// CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift
public protocol CaptureAnalytics: Sendable {
    /* existing */
    /// Remote flag. FAIL-CLOSED: the default returns false, so a seam that
    /// cannot reach PostHog never lights a gated surface.
    func isFeatureEnabled(_ key: String) -> Bool
}

// CaptureKit/CaptureKit/Sync/CaptureMediaMime.swift            (NEW)
public enum CaptureMediaMime {
    public static func forFilename(_ filename: String) -> String
    public static let bucketAllowed: Set<String>       // mirrors 00234:22-33
}

// CaptureKit/CaptureKit/Recognition/VoiceRecordingPolicy.swift (NEW)
public enum VoiceRecordingPolicy {
    public static let segmentRotationSeconds: TimeInterval   // 50
    public static let maxNoteSeconds: TimeInterval           // 1200
    public static let maxSegments: Int                       // 24
    public static func segmentFilename(noteID: UUID, index: Int) -> String
    public static func shouldRotate(elapsedInSegment: TimeInterval) -> Bool
    public static func shouldEnd(totalElapsed: TimeInterval, segmentCount: Int) -> Bool
}

// CaptureKit/CaptureKit/Recognition/RecognitionServices.swift  (MODIFIED)
public struct VoiceNoteResult: Sendable {
    public let transcript: String
    public let audioFilename: String?      // segment 0 — every existing reader keeps working
    public let audioSegments: [String]     // ordered; [] when no audio was written
    public let onDevice: Bool              // the RESOLVED requiresOnDeviceRecognition value
    public let durationSeconds: Double
    public init(transcript: String, audioFilename: String?,
                audioSegments: [String] = [], onDevice: Bool = false,
                durationSeconds: Double)
}

// CaptureKit/CaptureKit/Session/CaptureSessionContext.swift    (MODIFIED)
public extension CaptureRoutingMemory {
    func stamped(onto venue: VenueStamp) -> VenueStamp
}

// CaptureKit/CaptureKit/Domain/Specimen.swift                  (MODIFIED)
// All additive optionals → SwiftData migrates lightweight (there is no
// VersionedSchema anywhere in Field).
public var voiceAudioSegmentsRaw: [String]?    // ordered local segment filenames
public var voiceAudioRemotePathsRaw: [String]? // uploaded segments, so missingRequiredMedia
                                               // can exempt them the way it exempts photos
public var voiceTranscriptSourceRaw: String?   // 'device' | 'device_partial'
public var captureKindRaw: String?             // 'note' | 'context' | nil
// NOT in wave 1: voiceAudioSha256 — nothing hashes the audio in waves 1–5.

// CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift         (MODIFIED)
public struct Voice: Codable, Equatable, Sendable {
    public var audioPath: String?
    public var audioSegments: [String]?      // NEW wire key: voice.audioSegments
    public var transcriptSource: String?     // NEW wire key: voice.transcriptSource
    public var transcript: String?
    public var partialTranscript: String?
    public var durationSeconds: Double?
    // NOT in wave 1: audioSha256. Nothing hashes the audio in waves 1-5, so the
    // key and its column would both be dead. It lands with wave 6A, beside the
    // re-transcription no-op check that is its first real reader (spec §8.10).
}
public var captureKind: String?              // NEW top-level wire key: 'note' | 'context' | nil
/// Bumped to 2 alongside the W1 migration's four new payload reads, per this
/// file's own contract ("bumped only alongside a 00235-side reader change").
public static let currentSchemaVersion = 2
```

⚠ **`CaptureSyncAttributes.ContentState` (wave 2's foundation commit) has a hand-written memberwise
`init` (`CaptureSyncAttributes.swift:17-20`).** `visitLabel` / `elapsedSeconds` / `captureCount` must
carry `= nil` defaults or the two existing call sites and `FieldCompanionPresentationTests` break —
and optionality is also what makes decoding an in-flight Activity across an app update safe.

```sql
-- supabase/migrations/005NN_field_capture_notes_and_routing.sql   (NN drawn at landing)
-- (signature unchanged; the ONLY behavioural change is the inbox branch + 5 new payload reads)
CREATE OR REPLACE FUNCTION public.commit_field_capture(
  p_client_capture_id UUID, p_destination TEXT, p_payload JSONB,
  p_project_id UUID DEFAULT NULL, p_project_room_id UUID DEFAULT NULL,
  p_shelf TEXT DEFAULT NULL, p_organization_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;
```

### Acceptance criteria
1. `VoiceNoteResult.audioFilename` is **non-nil** after a real hold-to-talk on a device, and the
   named file exists in the App Group media directory with a non-zero size.
2. A 3-minute note produces **one continuous audio file per segment** and ≥3 rotated recognition
   segments, with a transcript that is not truncated at ~60 s. **Two notes taken back to back on the
   same screen do not share audio** (the recorder resets its per-note state).
3. Killing the app mid-upload and relaunching resumes and completes; the `field_captures` row
   carries `voice_audio_path` (segment 0) and a `voice_audio_segments` array whose length matches
   the device's. **A segment whose local file has gone missing is dropped and the note still
   commits** — it never blocks the row.
4. A note whose transcript is empty **still commits**, with the audio, and the UI says
   *"We couldn't make out the words — the audio is here."* — never "Nothing recorded" — **on the
   scan-context screen AND on N4**, where the primary now reads *"Keep the recording"*. The success
   toast does not overwrite it.
5. **She can play the recording back** from the N4 sheet and from the tray row.
6. Placing a capture from the C3 card ends on a **"Done"** that persists routing and returns to the
   camera (not on S3 or a terminal screen), sets `venue.projectId` **and** `venue.projectRoomId`,
   every subsequent capture in the session inherits both, and the server row has `project_id` **and**
   `project_room_id` on the **inbox** path. Closing the sheet with ✕ either persists or says plainly
   that the placement was not kept.
7. `surface='field-ios'` rows are visible in PostHog **from a build installed the way a pilot build
   is installed** (not only under an Xcode scheme), with `voice.finish` carrying `segments` and
   `on_device`.
8. Airplane mode shows the offline banner on C1 **with the outbox depth, not the session count**;
   restoring signal drains the queue with no user act.
9. With the recorder's feature flag off (or unreachable), the voice affordances do not appear —
   fail-closed.
10. `scripts/capture-gate.sh all` green; `swiftlint --strict` actually run (C2) and green.
11. The SQL test passes standalone **and** `scripts/run-sql-tests.sh` exits 0 with only the 22
    documented known failures (C8).

### Test plan
- **Swift Testing / `CaptureTests`** — five new files (§8 Tasks 3, 4, 5, 6, 7, 16):
  `FeatureFlagSeamTests`: `featureFlagSeamIsFailClosedByDefault`,
  `featureFlagSeamReadsAConformersValue`.
  `CaptureMediaMimeTests`: `everyEmittableMimeIsAllowedByTheBucket`,
  `m4aMapsToTheAudioMimeTheBucketAllows`, `unknownExtensionsFallBackToOctetStream`,
  `theAllowListMirrorsTheBucketExactly`.
  `VoiceRecordingPolicyTests`: `rotationFiresAtFiftySecondsAndNotBefore`,
  `noteEndsAtTwentyMinutesOrTwentyFourSegments`, `segmentFilenameIsZeroPaddedLowercasedAndM4A`,
  `segmentFilenamesCarryAnAllowedMime`.
  `VoiceAudioWireTests`: `voiceNoteResultDerivesSegmentsFromTheLegacyFilename`,
  `voiceNoteResultKeepsAnExplicitSegmentList`, `voiceNoteResultWithNoAudioHasNoSegments`,
  `payloadCarriesEveryVoiceSegment`, `payloadOmitsVoiceWhenNothingWasRecorded`,
  `payloadCarriesTheCaptureKindTheServerChecks`,
  `payloadOmitsAnUnsetCaptureKindSoTheServerDefaultApplies`,
  `schemaVersionIsBumpedForTheNewReaderSideKeys`,
  `missingRequiredMediaChecksEverySegmentInOrder`,
  `anUploadedSegmentIsExemptedLikeAnUploadedPhoto`.
  `RoutingMemoryStampTests`: `routingMemoryStampsAllFiveFieldsIncludingTheProjectRoom`,
  `routingMemoryStampPreservesNonRoutingVenueFacts`,
  `anEmptyRoutingMemoryClearsPlacementWithoutTouchingGPS`.
  `MediaRetentionPolicyTests`: the soft-cap boundary in both directions.
  ⚠ **The recorder itself (Task 8) has no unit test** — it is app-target AVFoundation code and
  `CaptureTests` links CaptureKit only (C1). Its proof is device-pass steps 1–5.
- **SQL** (`supabase/tests/field/field_capture_note_routing_test.sql`): inbox-branch routing
  persists; `voice_audio_segments` and `capture_kind` round-trip; re-commit is idempotent; **a route
  the caller cannot own SAFE-HARBORS to `inbox` with the conflict stashed** rather than aborting the
  RPC; `{routing:{clear:true}}` un-places; all five policies are `TO authenticated`.
  Run it **and** the full suite (C8).
- **No jest / deno / vitest in this wave** — there is no portal or edge code in it. (Wave 1P, §1.4,
  carries `use-capture-media.test.ts`.)

### Gate commands
```bash
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
cd /Users/kody/Code/patina-merged/apps/mobile/Capture && swiftlint lint --quiet --strict   # C2
cd /Users/kody/Code/patina-merged && scripts/run-sql-tests.sh -f field_capture_note_routing
cd /Users/kody/Code/patina-merged && scripts/run-sql-tests.sh    # C8: exit 0, 22 expected-fail, 0 unexpected
cd /Users/kody/Code/patina-merged && pnpm type-check
```

### Device pass (required — C5)
Physical LiDAR iPhone via `blitz-iphone setup_device`, **signed Debug build** —
`xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug -destination
'platform=iOS,id=<UDID>'` with signing on. **Never `capture-gate.sh build`, which is a Simulator
compile gate with `CODE_SIGNING_ALLOWED=NO`.** Script:
1. Hold-to-talk 15 s in a quiet room → transcript + audio file present; **play it back**.
2. Hold-to-talk 3 min with a radio on → ≥3 rotated segments, one continuous file per segment, full
   transcript.
3. **Two notes back to back on the same screen** → note 2's audio is note 2's, and `finish()` returns
   only note 2's segments.
4. Hold-to-talk, then take an incoming call mid-note → *"Paused — your note is saved."*, and on resume
   the engine restarts and **segment N+1 actually opens** (this is the step that catches the
   `isRunning` guard bug).
5. **Connect and disconnect AirPods mid-note** → recording continues on the new route and the process
   does not trap on a channel-count mismatch.
6. **From N4, in a loud room**, record so recognition returns nothing → the primary is enabled, reads
   *"Keep the recording"*, and the note commits with its audio.
7. **Fill the device's storage, then record** → the note still lands; a missing segment is dropped,
   not fatal.
8. Airplane mode → banner appears **showing the outbox depth**; capture + note; restore signal →
   drains with no tap.
9. Deny Speech permission → **the audio still records**; the typed fallback appears.
10. From the card: **Not placed → project → room → Done** → back on the camera; take two more
    captures. (Server-side confirmation is step 11, after the walk.)
11. **Turn the recorder's flag off** and relaunch → the voice affordances are gone, nothing crashes.

**Post-walk verification (not mid-walk — these need a terminal, not a phone):**
```bash
docker exec -i supabase_db_supabase psql -U postgres -d postgres -c \
  "select client_capture_id, status, project_id, project_room_id,
          jsonb_array_length(voice_audio_segments) as segs, capture_kind
     from field_captures order by created_at desc limit 5;"
```
(against Strata, use the Supabase Studio table filter on `field_captures` ordered by `created_at`.)
Expected: all three captures from step 10 carry `project_id` **and** `project_room_id`.

### Flags / rollout / rollback
- **No flag.** The wave is bug-fixes plus one affordance; there is nothing to dark-launch.
- **Rollout:** merge to `main`; TestFlight if FC-R14 is yes (see Wave 0.5 below), otherwise a direct
  device install on Kody's phone.
- **Rollback:** the migration is purely additive plus one `CREATE OR REPLACE`. Rollback = re-apply
  00235's `commit_field_capture` body verbatim; the added columns are harmless if unread. The iOS
  change rolls back by shipping the prior build; **old builds keep working** because every new wire
  key is optional and every new column is defaulted.

### Dependencies
**FC-R18 blocks 1-1 and 1-10** — until it is ruled, nobody knows whose body the replacement is
authored from, or whether this program authors one at all. 1-0 blocks 1-1. 1-1 blocks 1-10.
1-4/1-5/1-6 block 1-8 and 1-9. 1-7 blocks 1-11's usefulness (without it the room is dropped on the
second capture). 1-8 blocks 1-16, 1-17 and 1-18. 1-2 blocks acceptance criterion 7; 1-17 blocks it too.
1-3 blocks acceptance criterion 9. **FC-R11 blocks shipping the recorder to anyone but Kody** — but not
building it, because 1-3's flag is the off-switch. Nothing else.

### Estimate
≈12 iOS engineer-days (1-3…1-9, 1-11…1-14, 1-16…1-18) + ≈1.5 DB engineer-days (1-0, 1-1, 1-10) + 1 day
device pass and report. **≤2 engineer-weeks with two owners in parallel** — the three added packages
(N4 + playback, telemetry, device retention) are ≈2.5 days and they are what makes the wave's own
acceptance criteria passable.

---

## 1.4 · Wave 1P — the portal work that runs *beside* wave 1

> ≈1 engineer-week, Sonnet, **in parallel with wave 1**. No Field build, no migration, no new flag.
> Reversible with a portal revert.

**Why it exists.** The program's own risk register says nothing reaches Leah (P-3), nothing is
measurable (P-2) and the wedge is unconfirmed (P-1) — and then schedules the only work that could
answer any of that ~10 weeks out, behind a distribution pipeline that does not exist. Four wave-4
packages need **no Field build at all** and act on data that is in production **now**. Running them
beside wave 1 is the cheapest available answer to *"does field material in the Document change how
she works?"*

| # | Piece | Why it can run today |
|---|---|---|
| 4-1 | `useCaptureMediaUrls` | Two in-repo precedents (`letterhead-instruments.tsx:123`, `use-party-sms.ts:164`). **Nothing downstream is anything but cosmetic without it** |
| 4-5 | Mount `RoomFilesSection` + the designer-scan union | Complete and tested; returns `null` with no scans (`:37-40`). `room_scans.project_id` has been Field-writable since 00265, so any existing scan renders |
| 4-11 (render half) | `receiving_inspections.photo_asset_ids` | **A live defect, not a feature** — iOS has been writing the column (`SupabaseReceivingService.swift:115`) into rows `log-inspection-drawer.tsx:151` hardcodes `[]` for |
| 4-12 | Library provenance chip | `products.capture_source` already carries data and no portal surface reads it |

**Two prerequisites, both decisions rather than code.**
1. **Enable the `room-file` flag for the pilot cohort**, with the flag-on walk as a completion
   criterion and a named owner (FC-R10). Without it, 4-5 ships a block of rows whose every
   destination is dark.
2. **The brand-voice pass on `room-file-copy.ts`**, whose own header calls every string in it
   ESCALATE-class provisional — mounting the section puts that copy on the project spread.

**Acceptance.** A project with **no** field data renders identically to today, verified in the
browser (the unflagged posture rests on it). A project **with** an existing scan shows the Room-files
block, its rows reach a live Room File page, and a receiving inspection with photos finally shows
them.
**Gates.** `pnpm type-check` · `pnpm build --filter designer-portal` ·
`pnpm lint --filter designer-portal` · jest `use-capture-media.test.ts`.
**Rollout.** `./infra/deploy-portal.sh designer-portal` — never the raw OpenNext build path. **Rollback:** revert the portal deploy
(`wrangler deployments list` reads oldest-first — read the bottom row).
**Dependencies.** None on wave 1. It does not block wave 1 and wave 1 does not block it.

---

## 1.5 · Wave 0.5 — Distribution, if FC-R14 is yes

Not a wave; a **dependency with an owner**, run alongside wave 1.

There is **no distribution pipeline for Patina Field at all**: no `Fastfile`, no CI archive step, no
`asc-*` skill library scoped to Field, and no confirmed App Store Connect record for
`cloud.patina.field`. Signing itself is pre-baked — `generate_project.rb` hardcodes
`DEVELOPMENT_TEAM = 'VP22LXHT7L'` and `CODE_SIGN_STYLE = 'Automatic'` on every target — so a device
build works out of any regen. What is missing is everything between "builds on Kody's Mac" and
"appears on Leah's phone."

**If field notes are meant to reach Leah and not only Kody, this is a hard dependency of wave 1, not
a wave-5 nicety** — otherwise the wedge question (`R-A16`) can never be answered and every number in
this plan stays unfalsifiable. Size **M**, owner Sonnet, gated on ruling **FC-R14**.

---

## 2 · Wave 2 — "Nothing the app says about a capture is a lie"

> ≈1 engineer-week. Still no IA change, still no portal work, still no flag.

### Goal
Remove the three remaining places where the app asserts something false, and pay the frozen-seam
debt in one commit while it is still free.

### Work packages

| # | Package | Size | Owner | Notes |
|---|---|---|---|---|
| 2-1 | **The foundation-seam commit**, once, one named owner: `CaptureSheet.visit`, `CameraMode.voice`, `CaptureScreenID` + `v0Visit`/`c6Voice`/`v4VisitReview` **and the `screen.F1.context` orphan**, `AppContainer` gains `smartGuess` + `featureFlags`, **`CaptureSyncAttributes.ContentState` gains `visitLabel`/`elapsedSeconds`/`captureCount`** | M | **Opus** | `CaptureNavigation.swift:4-6`, `AppContainer.swift:13` and `CaptureSyncAttributes` all carry explicit freeze comments. The Live-Activity shape change is **free only until a widget target exists** — do it now or never cheaply again |
| 2-2 | `applySmartGuess` → the real `HeuristicSmartGuessService` (async; the card updates when the guess lands), **and hold S3's recommendation at `.inbox` regardless of confidence** | M | Opus | `ViewfinderModel.swift:413-423` stamps *every* photo `seating`@0.72 / `"Oak / bouclé"`@0.6 into shipped provenance, and makes `hasUnconfirmedGuess` always true so **S3 recommends Inbox for every capture ever taken**. ⚠ Removing the lie **flips the default toward Library** — `S3DestinationScreen.swift:52-57` is `hasUnconfirmedGuess ? .inbox : .library`, so a confidently classified photo of a damaged baseboard would start recommending *mint a product*. Hold at `.inbox` until visit kinds exist (wave 3 gates Library on `kind == 'sourcing'`). Device pass: photograph a wall defect, confirm the recommendation is **not** Library (spec §6 Flow 6) |
| 2-3 | Delete `FieldPlaceholderScreen`; delete-or-wire `LowLightTorchOverlay` | S | Haiku | Both are zero-reference / preview-only |
| 2-4 | Stale-header cleanup in the five files §17.4 names, **including deleting `SpeechVoiceNoteService.swift:7`'s false claim** | S | Haiku | It is the reason two discovery reports got the audio wrong |
| 2-5 | `capture-shots.sh` sweep re-baselined after the `CaptureScreenID` additions | S | Sonnet | `screen.F1.context` has never appeared in a sweep |

### Acceptance
No capture ships a guess it did not compute. `hasUnconfirmedGuess` is false for a confidently
classified photo. A screenshot sweep includes the non-Pro context screen. Every frozen seam changed
exactly once, in one commit, with the owner named in the message body.

### Tests
`SmartGuessKeywordTests` (CaptureKit-side keyword table only — the Vision call is device-verified);
`CaptureScreenIDTests.everyScreenIDIsUnique` + `.contextScreenHasAnID`;
`FieldCompanionPresentationTests` extended for the new `CaptureSyncAttributes` shape.

### Gates / device pass / rollout
`capture-gate.sh all` + `swiftlint --strict`. Device pass: photograph four different real objects and
confirm four different categories. No flag. Rollback = prior build.

---

## 3 · Wave 3 — The visit spine

> ≈5 engineer-weeks. **The direction.** Gated on rulings **FC-R1, FC-R2, FC-R3, FC-R5, FC-R6**.

### Goal
She answers "where are you?" once at the door, and everything she captures for the next two hours
lands on the right project and room — **offline** — with the visit legible on every capture surface
(Invariant V).

### Work packages

| # | Package | Size | Owner | Notes |
|---|---|---|---|---|
| 3-1 | **Offline project + room cache.** *Extend* `CaptureProjectRef` with additive optional properties (`specRooms`, `rooms`, `lastRefreshedAt`, `lastFiledCoordinate`) — **do not add a new `@Model`.** There is no `VersionedSchema`/`SchemaMigrationPlan` anywhere in Field; additive optionals migrate lightweight, a new `@Model` must join `CaptureStore.schema` (`:41-45`) | **M** | **Opus** | **Sequence this first.** The storage is an M; the genuinely new work is refresh policy, eviction, owner scoping and honest staleness display. Failure copy is specified, not improvised: *"12 projects on this phone. Others need signal."* — never an empty list, a spinner or a disabled control |
| 3-2 | Visit model: extend `CaptureSessionContext` with `kind`/`kit`/`label`/`scanRoomID`/`projectsInMind`/`endedAt`; the >30 min confirm; the 12 h auto-end; never resume across a calendar day | M | Opus | ⚠ **`endVisit` is already wired** (`V1SessionTrayScreen.swift:61` → `:153-154`) and **does not end anything** — `CaptureSessionContext.swift:157-169` replaces the context with a fresh one at `now`. Changing its contract changes the `Codable` shape persisted under `capture.session-context.v1`, so a **legacy-decode path defaulting the new fields is mandatory** or the first launch after upgrade silently loses the open context |
| 3-3 | V0 visit sheet: two kinds, project step, merged room picker, kit chips, offline states | M | Opus | Merge-by-trimmed-name over `specRooms` + `rooms` from the one existing `projectDetail(id:)` call; stamp only the id legal per lane; **never cross-assign** |
| 3-4 | Today band on W1 + the launch table + the Companion visit banner | M | Sonnet | `RootView.handleCompanionAction` (`:218-226`) already switches on `action.id` with a `default:` no-op — two cases |
| 3-5 | Visit chip on C1/C3/C5; C3's placement line retargets from `.assignVenue` to `.visit`; the C3 **inline mic**; `saveFromCard` skips S3 inside a visit | M | Opus | The inline mic is what collapses Flow 2 from 7 taps to 2 |
| 3-6 | C6 voice mode (fifth `CameraMode`) + the solo/conversation affirmation | M | Opus | `ContextCaptureService` already proves a media-less specimen commits cleanly. ⚠ **Tap-to-start / tap-to-stop, never press-and-hold** — the design target is a 20-minute walk-through and a slipped finger would end the note. Copy the shipped toggle at `SiteScanContextCapture.swift:175-177`, and convert N4's hold (`VoiceNoteSheet.swift:114-129`) in the same wave (spec §7.4, FC-R9) |
| 3-7 | The tray: widen scope from `store.session(visitID:owner:)` to **unfiled**; visit header; footer primary → End visit | S | Sonnet | Graft from B. A drive-home thought is outside the 4 h window and has nowhere to appear today |
| 3-8 | The suggestion lane: `suggested_*` written on device from venue + learned centroid, rendered as a question with its basis **in words** | M | Opus | Never written to `project_id`. The learned centroid replaces `CLVisit` as the first suggestion source — no entitlement, no App Review conversation |
| 3-9 | F1 collapse + the `ownableProjects()` tiebreak (expand and say so, never silently start a scan that will 4xx) | S | Sonnet | |
| 3-10 | The **visit/suggestion migration** (`005NN_field_capture_visit_and_suggestion.sql`) — visit + suggestion columns, the visit index | S | Sonnet | ⚠ `suggestion_confidence` **orders the tray and is never rendered** (spec §9.3, Principle 4) |
| 3-11 | Copy: the three `SiteScanContextCapture` ESCALATE strings; **the word "Inbox" leaves Field's user-facing copy** | S | Sonnet | Brand-voice pass with Kody as a line item, not an afterthought |
| 3-12 | Tests: `VisitContextTests`, `ProjectCacheTests`, legacy-decode test for `capture.session-context.v1`, `FieldCapturePayloadTests` extended for the visit keys, `CaptureLifecycleTests` extended for inheritance | M | Opus | |

### Acceptance
Three taps and ≤8 s at the door, **in airplane mode**. Two taps and a hold per capture thereafter,
project and room attached. A capture taken with no visit open is born with a *suggestion*, never a
fact, and appears in the unfiled tray. Upgrading from a wave-2 build with an open context does not
lose it. Every capture surface shows the visit without a tap (Invariant V).

### Gates / device pass
`capture-gate.sh all` + `swiftlint --strict` + the SQL test standalone. **Device pass: a real
eight-minute walk at a real address, in airplane mode for at least half of it.**

### Flags / rollout / rollback
No flag; the gate is the build. Rollback = prior build; the visit/suggestion migration is additive
and inert without a Field build that writes it.

### Risk register for this wave
- **R3-1 (High): a wrong visit is a *systematic* error.** Yesterday's visit silently stamping today's
  twenty captures is worse than today's twenty unattached ones. Mitigations: the >30 min confirm, the
  12 h auto-end, never crossing a calendar day, Invariant V, and — the strongest of them — B's
  suggested/confirmed split, so anything not set at the door is a question.
- **R3-2 (High): the offline cache is the long pole and it is on the critical path.** Sequenced first,
  sized honestly, failure copy specified.
- **R3-3 (Med): the camera-first inversion** (FC-R1). Write the work so a "no" re-shapes the door
  without re-planning the wave.

---

## 4 · Wave 4 — It lands in the Document

> ≈3.5 engineer-weeks **(four packages moved into Wave 1P** — §1.4 takes 4-1, 4-5, 4-11's render
> half and 4-12 out of this wave — **plus the newly-priced 4-13)**. Gated on
> **FC-R4, FC-R7, FC-R8, FC-R10, FC-R15**.

### Goal
The material she captured is in the portal, in the surfaces she already reads, with **no card to
clear**.

### Work packages

| # | Package | Size | Owner | Notes |
|---|---|---|---|---|
| 4-1 | `packages/supabase/src/hooks/use-capture-media.ts` — `useCaptureMediaUrls(paths, ttl)` batched signed URLs | S | Sonnet | **Nothing downstream is anything but cosmetic without it.** Pattern exists twice: `createSignedUrls` in `letterhead-instruments.tsx:123`, `useFieldMediaUrl` in `use-party-sms.ts:164`. It goes in `packages/supabase` (a shared Supabase read); the escalation hooks stay portal-local at `apps/designer-portal/src/hooks/use-margin-notes.ts:64`/`:128` — spec §11.1 names which convention is which. **Runs in Wave 1P** (§1.4). Free side effect: `capture-context-section.tsx` starts rendering thumbnails |
| 4-2 | Device writes `margin_notes` **through the same outbox** (not a second queue), with `field_capture_id` | M | **Opus** | ⚠ Ruling **FC-R4**: this is a real divergence from the house pattern where field signal reaches business tables via `review_sms_message` → `apply_field_effect` (DEFINER, revoked from `authenticated`). RLS permits it — `margin_notes_designer_all` is `FOR ALL TO authenticated` on `designer_id = auth.uid()` — and the author really is the designer, not a third party's parsed claim. **±2 weeks either way** |
| 4-3 | The **margin migration** (`005NN_margin_notes_field_capture.sql`): `margin_notes.field_capture_id` + `CREATE OR REPLACE VIEW margin_items` recreating the prior body **verbatim** and changing only the `note` branch's payload | S | Sonnet | **No new margin kind.** Do not widen `anchor_kind`'s CHECK. ⚠ **The `note` branch must start carrying the FULL body** — today it emits `left(n.body, 80) as title` with `detail` hard-coded to `''` (`00282:829-830`), so a one-minute transcript reaches the Document as its first eighty characters. Carry it in `payload.body` (or widen `detail` for the `note` branch only). Spec §9.4 |
| 4-4 | Portal margin: **render the body**, play button, photo strip, and the italic draft line on the **existing** note case in `margin-bodies.tsx` | M | Sonnet | ⚠ `NoteBody` (`margin-bodies.tsx:814-880`) renders the author and the escalation actions and **never the body at all**, and `useEscalateNoteToDecision` forwards `body: row.title` (`:855-859`) — the truncated title. So *"escalation works on field notes for free"* is false for a transcript until 4-3's full body lands **and** the hooks are passed it. These are **portal-local** hooks, not `@patina/supabase` |
| 4-5 | Mount `RoomFilesSection`; union designer-owned scans into **both** client-only attach points | S | Sonnet | *A designer literally cannot attach her own site scan to her own project's document today.* ⚠ **Named prerequisite: enable the existing `room-file` flag for the pilot cohort**, with the flag-on walk as a completion criterion — every row links to `/room/${scan.id}/file`, which is `useFeatureFlag("room-file")` and fail-closed (`room-file-view.tsx:29`, `:63`), and the portal's only `field_captures` reader lives inside it (FC-R10). ⚠ Mounting it also ships `room-file-copy.ts`'s ESCALATE-class placeholder copy onto the project spread — a brand-voice line item beside the mount. ⚠ The union changes what a *client-provenance* instrument means: keep the provenance visible in the row (*"yours"* vs *"from your client"*). **Runs in Wave 1P** (§1.4) |
| 4-6 | The **Visits** block + `useProjectVisits(projectId)` | M | Sonnet | Read-only, grouped by `visit_id` in the hook |
| 4-7 | `designer_client_id` onto the projects SELECT + `FieldProject` DTO | S | Haiku | Required by `create_client_decision` and absent today |
| 4-8 | **Make it a punch item** / **Make it a task** on a note and on C3 | M | Opus | ⚠ Punch default **`'draft'`** (FC-R7). ⚠ *Make it a task* returns **42501** for a studio co-member (`00169:60-62`) — detect and degrade honestly to a margin note, or route through a DEFINER applier, in which case "no new RPC" no longer holds and the wave grows (FC-R8) |
| 4-9 | Punch photo: the item back-references the `field_captures` row; the portal signs `capture-media` | S | Sonnet | FC-R15. Preferred over `client_decision_options.image_url` — an option is a choice, not evidence. **A project-general media table is still owed and this does not pay it.** ⚠ Re-sized from M to S because the DDL half moved into its own package, **4-13** |
| 4-10 | V4 visit review = the **close as output**: writes the Visits row, offers a **completed** `project_time_entries` row (`activity='site_visit'`, `duration_minutes > 0`) | M | Sonnet | ⚠ **Never a running timer** — `00177:39-41` enforces one per user via a partial unique index owned by the portal TimerButton. The **time-entry migration** (`005NN_time_entry_field_visit_source.sql`) widens `source` to `'field_visit'`. ⚠ The close **cannot** stamp `visit_ended_at` on a `status='saved'` capture (`00235:187`), so the Visits block derives a visit's span from `min/max(created_at)` (spec §6 Flow 7) |
| 4-11 | Render `receiving_inspections.photo_asset_ids`; stop hardcoding `[]` at `log-inspection-drawer.tsx:151`; live camera in G2 | M | Sonnet | **A live defect** — iOS has been writing this column (`SupabaseReceivingService.swift:115` → CodingKeys `:250`) into rows no web surface has ever displayed. The *render* half needs no Field build and **runs in Wave 1P** (§1.4); the G2 live camera stays in wave 4 |
| 4-12 | Library provenance chip — `products.capture_source` is never read by the portal | S | Haiku | *"Field · High Point, Mar 2026"*. **Runs in Wave 1P** (§1.4) — the column already carries data |
| 4-13 | The **punch back-reference migration** (`005NN_client_decision_field_capture_ref.sql`): `client_decisions.field_capture_id`, the widened `create_client_decision` payload allow-list, and the `CREATE OR REPLACE` of that `SECURITY DEFINER` RPC | M | **Opus** | ⚠ **FC-R15 option (a) is not zero DDL, and 4-9 was sized as if it were.** `create_client_decision` allow-lists its payload keys and raises on anything else (`00413:1829-1838`) — there is no `field_capture_id` key and no such column. Restate the RPC's `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated` verbatim (`00413:2603-2608`). Money-adjacent DEFINER replacement: **adversarial review in a separate context is mandatory** |

### Acceptance
1. A note spoken on site appears in the margin of `/doc/[id]` **with its full body rendered** and a
   working play button — not its first eighty characters (4-3/4-4).
2. `RoomFilesSection` and the Visits block **render nothing** on a project with no field data —
   verified explicitly, in the browser, because the unflagged posture rests on it (FC-R10).
3. A punch item raised from Field appears in the GC court with its photo.
4. A designer can attach her own scan to her own document.

### Tests / gates
- jest: `use-capture-media.test.ts`, `use-project-visits.test.ts`, `margin-bodies.field-note.test.tsx`.
- Playwright: the flag-on-equivalent walk is not needed (no flag); a field-less project must render
  identically to today — that is the test.
- SQL: `supabase/tests/document/margin_items_note_field_capture_test.sql` and
  `supabase/tests/document/client_decision_field_capture_ref_test.sql` (4-13's DEFINER replacement —
  assert the widened allow-list accepts `field_capture_id`, that an unknown key still raises, and
  that the post-replace ACL is `authenticated` only).
- Gates: `pnpm type-check` · `pnpm build --filter designer-portal` · `pnpm lint --filter designer-portal`
  (only designer-portal has a working ESLint config) ·
  `scripts/run-sql-tests.sh -f margin_items_note_field_capture` ·
  `scripts/run-sql-tests.sh -f client_decision_field_capture_ref` · the **full**
  `scripts/run-sql-tests.sh` (C8: exits 0 with 22 documented known failures) · `capture-gate.sh all`.

### Rollout / rollback
Portal via `./infra/deploy-portal.sh designer-portal` — **never** `opennextjs-cloudflare build`
directly. Migrations via `supabase db push` after re-checking `supabase migration list` (C6).
⚠ `apps/*/.env.local` has pointed at Strata **prod** before — check `NEXT_PUBLIC_SUPABASE_URL`
before any destructive local action, and remember portal deploys have needed a wrangler-vars export.
**Rollback:** revert the portal deploy (`wrangler deployments list` reads oldest-first — read the
bottom row); the migrations are additive and the view replace is reversible by re-applying the prior
body verbatim.

---

## 5 · Wave 5 — Hands full

> ≈3.5 engineer-weeks. Gated on **FC-R9**.

| # | Package | Size | Owner | Notes |
|---|---|---|---|---|
| 5-1 | `StartVisitIntent` + `CaptureVoiceNoteIntent` + `AppShortcutsProvider`, **in the app target** | M | Opus | No new target needed for Siri + Shortcuts + Spotlight + **Action Button** at the 18.0 floor. The app already fires `settings.action_button_rebind` and its O4 onboarding *teaches* a button that does not exist |
| 5-2 | **New Ruby in `generate_project.rb`** for a `CaptureWidgets` WidgetKit target | M | Opus | `CaptureWidgets/` is an empty directory with **zero** target-generation code. No Swift file matters until the Ruby exists |
| 5-3 | Control Center control + Lock Screen widget + **the Live Activity renderer that has never existed** | M | Opus | Pays three debts with one target. `CaptureSyncAttributes` + `CaptureLiveActivityController` are built and driven and cannot display |
| 5-4 | Desk: the open-visit need-line inside `FieldDesk`'s existing soft lines | S | Haiku | **No new population, no new `NeedKind`, no `document_state` column** |
| 5-5 | *(gated)* `EventKit` + `CLVisit` as **suggestions that pre-fill the door** | M | Sonnet | Needs `NSCalendarsUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`, absent from **both** `Info.plist` and the `INFOPLIST_KEY_*` settings. Always-location is a real App Review conversation. **Do 3-8's learned centroid first and see whether this is needed at all** |
| 5-6 | *(gated on FC-R9)* Background audio (`UIBackgroundModes: [audio]`) | M | Sonnet | iOS forbids *starting* a recording from the background regardless, so a Control-Center entry must foreground the app for a moment either way |

**Acceptance:** the Action Button starts a visit with the screen locked; the Lock Screen shows the
open visit and its queue depth; a long upload is visible without opening the app.
**Device pass is the only meaningful gate here** — none of this renders in the Simulator.

---

## 6 · Wave 6 — Designer-Taught Intelligence · **evidence-gated, NOT scheduled**

> ≈3 engineer-weeks when and if it is ruled in. Design is complete in the spec (§8.6–8.9); this is
> the build order only.

### Wave 6 is two halves, and they are **not** gated together

⚠ **6A (server transcription) is not evidence-gated; 6B (structuring) is.** Transcription is
deterministic, costs **$1.15/mo** at pilot volume (spec §8.9), has an exact in-repo precedent
(`derive-scan-photo-media`), is Kody's brief's literal ask — *"voice notes with transcription"* — and
is what makes a one-minute transcript readable in the margin at all (§4-3's 80-character caveat).
Gating it on *"is the device transcript good enough?"* is circular, because spec §8.2 **specifies**
the device transcript as lossy at every 50-second rotation boundary by design. **6A is schedulable
with or immediately after wave 4.** Spec §8.6.

⚠ **Both halves are shape-blocked on FC-R18.** Phase 3 capture enrichment already ships a ledger, a
transactional outbox, an atomic claim and a Cloudflare-Queue consumer whose `target_type` CHECK is
`('proposal_capture','field_capture')` (`00514:41-43`) — for these same rows — and AGENTS.md's
standing rule is *"Never a parallel queue."* If that ledger wins, **6-2 through 6-4 collapse into a
transcript-shaped suggestion key plus a consumer branch**, and the two edge functions, the new
`agent_tasks` kind and the two crons below do not exist. Do not brief 6-2/6-3/6-4 before FC-R18.

### The gate for **6B** — two numbers, from waves 1–4's own telemetry
1. **Device-transcript quality** measured on a real corpus (`voice.empty_transcript` rate,
   `voice.segment_rotated` boundary loss, designer edit rate).
2. **The measured tap-cost of wave 4's manual verbs** (`note.made_task` / `note.made_punch` volume
   and abandonment).

If the notes are already good enough and she rarely uses the verbs, **do not build 6B.** If she uses
them constantly and the transcripts need repair, build it — behind the *same two verbs*, so the UI
does not change when the model arrives.

| # | Package | Size | Owner |
|---|---|---|---|
| 6-1 | **6A** — the **server-transcript migration** (`005NN_field_capture_server_transcript.sql`, the band's sixth and last number): `server_transcript`, `transcript_state`, `transcribe_attempts`, `transcribe_error`, `transcribed_sha256`, **`voice_audio_sha256`, `transcript_edited_at`** (both deferred out of wave 1 — nothing hashed the audio and nothing read the edit stamp), the sweep's partial index, and the `audio_retention` default flip from `'keep'` to `'90_days'` **in the same migration that ships the purge** | S | Sonnet |
| 6-2 | **6A** — `supabase/functions/transcribe-field-note/` + `cron transcribe-field-notes` (`*/2`). ⚠ Only if FC-R18 rules voice a separate lane; otherwise this is a consumer branch on Phase 3's Queue | M | Opus |
| 6-3 | `supabase/functions/_shared/field-note-extract.ts` + the five mechanical rules in `normalize()` | M | Opus |
| 6-4 | `supabase/functions/structure-field-note/` claiming `field_note.structure` via `claim_agent_tasks`, completing `awaiting_review` | M | Opus |
| 6-5 | **6B** — the **note-drafts migration** (`field_note_drafts` + `confirm_field_note_draft` / `dismiss_field_note_draft` + the DEFINER applier `_apply_field_note_draft`, **revoked from `authenticated` entirely**). ⚠ Its number is drawn **at its own landing, outside the 00530–00535 band** — 6B is unscheduled and an unscheduled wave does not hold a number hostage | M | Opus |
| 6-6 | **6A** — `cron field-note-media-maintenance` (daily audio purge per `audio_retention`), landing **with** 6-1's default flip | S | Sonnet |
| 6-7 | The confirm sheet on both surfaces — **pre-filling the verbs wave 4 already shipped** | M | Sonnet |

**Non-negotiables carried from the spec:** nothing auto-applies at any confidence (FC-R12); every
item cites a verbatim transcript substring or is dropped; the model never emits a uuid; every
measurement is `needs_confirmation`; a spoken measurement never touches `room_file_measurements` or
`tolerance_class` (FC-R16); `voice_transcript` is never overwritten and an edited transcript is never
clobbered (R114.1).
**Deno tests** for `field-note-extract.ts` with an injected `fetchImpl` (no network), mirroring
`_shared/field-parse.ts`'s existing test shape. A `_shared/*` edit requires redeploying **every**
importing function.

---

## 7 · Program-level risks

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| P-1 | **The wedge is unconfirmed.** Leah Session 05 (prepped 2026-08-18) has not run; its findings template is blank; it ranks "capture/memory" against three other MVP candidates. There is no confirmation Leah has *ever* held Patina Field on a real site (M4's gate deferred at R113). | High | Waves 1–2 are overwhelmingly bug-fixes and wiring — a cheap, reversible bet worth making regardless. **Hold wave 6 for the session's answer.** |
| P-2 | **Nothing is measurable today.** Zero PostHog events from Field in 180 days; no feature-flag mechanism at all. | High | Wave 1 packages 1-2 and 1-3, with acceptance criterion 6 as a named gate. |
| P-3 | **Nothing reaches Leah today.** No fastlane, no CI archive, no confirmed ASC record. | High | FC-R14 + Wave 0.5. |
| P-4 | **A wrong visit is systematic.** | High | §3's R3-1 mitigations, chiefly the suggested/confirmed split. |
| P-5 | **The RLS family disagrees** (`field_captures` / `margin_notes` / `project_tasks` / `capture-media`). | Med-High | **FC-R8, ruled once for the whole family, before any schema work.** If per-studio: budget the `supabase_storage_admin`-owned **platform-admin phase migration** as its own item. |
| P-6 | **Consent has no policy anywhere under `docs/`.** All-party-consent states make surreptitious client recording criminal; Wisconsin is one-party, Leah's clients are not guaranteed to be. | Med-High | FC-R11 + a lawyer's read before any non-Kody designer records a client. Not an engineering decision, but an engineering blocker. |
| P-7 | **Migration numbering.** 00514/00515 are taken, **and `00521` was taken on `main` hours before this package was issued and is absent from the reservations doc**; 00512 is reserved-parked on a branch that carries a known live defect, so if it ever lands it applies out of order; three other bands are live. | Med | C6 + FC-R17: repair the doc first, then reserve **00530–00535** (pre-agreed with both live lanes), symbolically, re-confirmed against the ledger **and** `supabase migration list` before every push. Coordinate with the 00512 and `feat/svc-media-shape-reconcile` owners. |
| P-8 | **The SQL suite cannot certify RLS**, because `scripts/run-sql-tests.sh` connects as `postgres` (superuser, `:92`) — `auth.uid()`-shaped assertions run with **RLS bypassed** (`apply_field_effect_test.sql:25-27` documents exactly this). ⚠ The old *"71/108 red"* figure is **stale** and must not be quoted: the `pg_temp` family is fixed, leaving **22** documented known failures across **122** files, and the runner **exits 0 if only those fail**. | Med | C8: run the standalone test **and** the full suite, report both, and never claim *"RLS verified"* from either. Real RLS proof is a signed-in walk. |
| P-9 | **Frozen-seam churn** across four seams. | Med | One commit, one named owner, at the top of wave 2 — including the `CaptureSyncAttributes` shape change, which is free only until a widget target exists. |
| P-10 | **Copy debt is inside the blast radius.** Nine files of ESCALATE-class placeholder strings sit on exactly the SiteScan surfaces the site kit uses, and `SiteScanContextCapture.swift:267` ("these land in your Inbox") becomes a **lie** under a spine with no inbox. | Med | A brand-voice pass with Kody, budgeted as line items 2-4 and 3-11. |
| P-11 | **No UI tests, no confirmed-blocking CI.** The iOS jobs live in `policy-quality.yml` (not `ai-quality-gate.yml` as the root docs claim), are named "(advisory)" and set no `continue-on-error`, so whether they block is not determinable from the repo. | Med | Device walks are the real gate (C5). Ask Kody to confirm branch protection. |
| P-12 | **`create_client_decision` is narrower than it looks.** | Med | FC-R7; `'draft'` is the only status that always works. |

---

## 8 · WAVE 1 — bite-sized implementation plan

**Goal**
A voice note keeps its audio (segments, rotation, interruptions, honest failure copy) **on both voice
surfaces**, she can **play it back**, and a capture can be placed on a project + room from the C3
card in three taps **that return her to the camera**, with the routing persisting server-side on the
inbox path.

**Architecture**
All testable logic lands in **CaptureKit** as pure types (constraint C1: `CaptureTests` links
CaptureKit only). The AVFoundation recorder, the upload path and the SwiftUI surfaces stay app-side
and are verified by the device pass. One additive Postgres migration replaces
`commit_field_capture`'s body with the same signature.

**Tech stack**
Swift 5 / SwiftUI / SwiftData / AVFoundation / Speech, iOS 18.0 floor · Swift Testing
(`import Testing`, `@Test`, `#expect`) · Postgres 15 (Supabase) · plain-psql SQL tests with
`ASSERT` inside a `DO $$ … $$` block, transaction-wrapped and rolled back.

**Spec path** `docs/design/field-companion/field-companion-package.md`

**Global constraints**
- Work in a dedicated worktree; never `git add -A`; explicit pathspecs only.
- `scripts/capture-gate.sh` re-runs `generate_project.rb`; **commit the `Capture.xcodeproj` diff**
  whenever a `.swift` file is added.
- `capture-gate.sh build` is a **Simulator compile gate** (`CODE_SIGNING_ALLOWED=NO`). Wherever a
  task says *install on the device*, it means the signed command in C5 — never `capture-gate.sh
  build`.
- **Migration addresses are claimed at landing.** This wave's migration is written as
  `005NN_field_capture_notes_and_routing.sql`, with `NN` drawn from the reserved band
  **00530–00535** at landing (C6). Re-check the ledger file **and** `supabase migration list`
  against Strata immediately before the push.
- Every **new** `public.` routine gets `REVOKE ALL … FROM PUBLIC, anon;`. ⚠ `CREATE OR REPLACE`
  **preserves** the existing ACL (see Task 10.4) — restate it belt-and-braces, but do not justify
  the restatement with the default-privilege trap, which applies to *new* routines only.
- Conventional Commits. The husky `commit-msg` hook rejects `merge:` subjects.
- All paths below are relative to `/Users/kody/Code/patina-merged`.

**Task order.** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → (10 in parallel from Task 1) → 11 → 12 → 13 →
14 → 15 → 16 → 17 → 18. Tasks 8, 15, 16 and 17 all touch the recorder's output, so they are
sequential; everything else can be re-ordered freely.

---

### Task 1 — Repair the reservations doc, then reserve the pre-agreed band

> ⚠ **Two gates before a byte of SQL.** Ruling **FC-R18** decides whether this program authors a
> `commit_field_capture` replacement **at all** (Phase 3's branch-authored `00516` does the same
> `CREATE OR REPLACE`). Ruling **FC-R17** is the band. Task 1 lands the doc edit; Task 10 does not
> start until FC-R18 is ruled.

- [ ] **1.1 Census — the filesystem, every ref, and every worktree.** The reservations doc alone was
  not enough this week; run all four.
  ```bash
  cd /Users/kody/Code/patina-merged
  ls supabase/migrations/*.sql | tail -4
  git log --all --oneline -- 'supabase/migrations/0052*.sql' 'supabase/migrations/0053*.sql'
  grep -c '00521' docs/engineering/migration-number-reservations.md
  git worktree list
  grep -rl 'commit_field_capture' supabase/migrations
  ```
  Expected, today: the last four `.sql` files are `00513…`, `00514_capture_enrichment_ledger.sql`,
  `00515_capture_enrichment_rpcs.sql`, `00521_svc_media_shape_reconciliation.sql`
  (⚠ **`ls | tail -6` is wrong** — `supabase/migrations/` contains a `_pending/` directory, so a bare
  `ls` ends with `_pending`); the git log shows **exactly one** row, `ca2b0641b … (00521) …`, and
  **nothing** in `0053*`; the grep returns **`0`** — the svc-media migration is on `main` and absent
  from the doc; `grep -rl commit_field_capture` returns `00233`/`00235` on `main`, **plus
  `00516_capture_producer_idempotency.sql` in the `agent-ca2` worktree**.
  **Anything else — any `0053*` hit, any second `commit_field_capture` author — means stop and
  re-census; the band is no longer what this plan assumes.**

- [ ] **1.2 Repair the doc first.** In `docs/engineering/migration-number-reservations.md`, add to
  the **Reservations** table, after the `00514–00520` row:
  ```markdown
  | 00521       | **TAKEN, recorded retroactively** — `00521_svc_media_shape_reconciliation.sql` (branch `feat/svc-media-shape-reconcile`, `ca2b0641b`, 2026-08-24 15:05, pushed to `origin`). Unfreezes the media deploy against prod's Prisma-shaped `svc_media`. This row was added by the Field Companion census: the lane landed the number without an accompanying reservation edit (discipline rule 5), and the next lane's census failed because of it. |
  ```
  **This edit is worth more than the reservation** — the doc is the declared single source of truth
  for band ownership (rule 4), and it was demonstrably incomplete.

- [ ] **1.3 Record Phase 3's branch-authored `00516`** in the existing
  `### Drawn from 00514–00520 (Phase 3 capture enrichment, C-A1)` table, so the next census sees it
  without walking worktrees:
  ```markdown
  | 00516  | `00516_capture_producer_idempotency.sql` | branch `feat/capture-producer-idempotency` (sibling worktree); **`CREATE OR REPLACE FUNCTION commit_field_capture` from its 00235 body plus an `enqueue_capture_enrichment(...)` call**, and `GRANT EXECUTE ON enqueue_capture_enrichment TO authenticated`. NOT applied to staging or prod. ⚠ Shared object — see the Field Companion band below |
  ```

- [ ] **1.4 Add the Field Companion band row.** After the `00521` row:
  ```markdown
  | 00530–00535 | Field Companion (`docs/design/field-companion/`). **Confirmed clear 2026-08-24 by both live lanes** — cloudflare-phases Phase 2 stays at or below `00529`, and Phase 3 holds `00514–00520`. **SYMBOLIC RESERVATION ONLY: nothing is minted until Kody approves the build**, and each address is claimed at that file's landing after re-checking this file AND `supabase migration list` against Strata (rules 1–2, and the file-based push invariant in `docs/ops/strata-staging.md`). Six scheduled migrations: the W1 routing migration (wave 1), the visit/suggestion migration (wave 3), the margin migration + the time-entry migration + the punch back-reference migration (wave 4), and wave 6A's server-transcript migration. Wave 6B's `field_note_drafts` migration draws its number at its own landing, OUTSIDE this band, because 6B is unscheduled. |
  ```

- [ ] **1.5 Add the "Drawn from" subsection**, after the existing
  `### Drawn from 00514–00520 (Phase 3 capture enrichment, C-A1)` block:
  ```markdown
  ### Drawn from 00530–00535 (Field Companion)

  | Number | File | Landed state |
  | ------ | ---- | ------------ |
  | —      | `005NN_field_capture_notes_and_routing.sql` | **NOT YET DRAWN.** Wave 1; branch `feat/field-companion-w1` when it lands |

  Nothing in this band has been minted. The band is reserved symbolically so the
  two neighbouring lanes can plan around it; every address is claimed at the
  landing of the file that needs it, after re-checking this file and
  `supabase migration list`.

  The wave-1 migration adds the note/audio lane to `field_captures`
  (`capture_kind`, `voice_audio_segments`, `voice_audio_purged_at`,
  `audio_retention`, `transcript_source`, `note_setting`), the provenance GIN
  index carried unbuilt since R112/R113, restates all five 00233 policies
  `TO authenticated` (they default to PUBLIC today), and replaces
  `commit_field_capture` so its **inbox** branch persists
  `project_id`/`project_room_id`/`shelf` — today only the library branch does
  (`00235:205-217` vs `:255-264`), so every note-shaped capture arrives with no
  project column. It introduces **no new `status` value**:
  `field_captures_org_inbox_select` keys on `status = 'inbox'`
  (`00233:175-188`), so a terminal status would silently revoke studio read.

  ⚠ **`commit_field_capture` is a SHARED object with two live authors.**
  Phase 3's branch-authored `00516` replaces the same function. Whichever
  migration lands second **silently reverts the other** — no error, no failed
  migration. Per ruling FC-R18 the wave-1 replacement is authored from
  **00516's** body, with 00516 a hard prerequisite named in the migration
  header. Lineage: **00235 → 00516 → 005NN**.
  ```

- [ ] **1.6 Verify the edit reads correctly.**
  ```bash
  cd /Users/kody/Code/patina-merged
  grep -n '00521\|00516\|00530' docs/engineering/migration-number-reservations.md
  ```
  Expected: the retroactive `00521` row, the `00516` row in Phase 3's table, the `00530–00535` band
  row, and the new subsection heading — and **no `005NN` file on disk**
  (`ls supabase/migrations/0053*` must still say *no matches*).

- [ ] **1.7 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add docs/engineering/migration-number-reservations.md
  git commit -m "docs(db): record the unregistered 00521 and reserve 00530-00535

00521_svc_media_shape_reconciliation.sql landed on main without a reservation
edit, so the doc that is the single source of truth for band ownership was
incomplete and the next census read a free number that was not free. Records
it retroactively, records Phase 3's branch-authored 00516 (which does its own
CREATE OR REPLACE commit_field_capture), and reserves 00530-00535 for Field
Companion - confirmed clear by both live lanes, symbolic only, addresses
claimed at landing per discipline rules 1, 2 and 5."
  ```

---

### Task 2 — A **build-time** PostHog key, and proof that events land

> ⚠ Field has emitted **zero** analytics events in 180 days. The obvious fix — set the key in the
> gitignored `Secrets.swift` — makes this task's gate pass on **exactly one Mac** and fail silently
> on every device install, every TestFlight build and every CI archive, because
> `AppConfiguration.postHogAPIKey` falls back to `ProcessInfo.processInfo.environment` and on iOS
> that carries only what an Xcode scheme's **Run** action injects (`AppConfiguration.swift:130-132`).
> The archive Wave 0.5 exists to produce would be blind.

- [ ] **2.1 Confirm the channel is dead before changing anything.**
  Run, via the PostHog tooling, against the org's ingesting project:
  ```sql
  SELECT count() FROM events
  WHERE timestamp > now() - INTERVAL 180 DAY
    AND properties.surface = 'field-ios'
  ```
  Expected: **0**. (The same query with `'patina-ios'` returns thousands. If `field-ios` is already
  non-zero, stop and re-scope this task — the premise has changed.)

- [ ] **2.2 Set the local key — do NOT copy the template over it.**
  ⚠ `apps/mobile/Capture/Capture/App/Configuration/Secrets.swift` **already exists** (gitignored per
  `apps/mobile/Capture/.gitignore:2`) and holds the **real Supabase anon key** for Strata. Copying
  `Secrets.example.swift` over it destroys that key and breaks auth and the build.
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture/Capture/App/Configuration
  test -f Secrets.swift && echo "EXISTS — edit in place" || cp Secrets.example.swift Secrets.swift
  ```
  If it exists, edit **only** line 17 (`static let postHogAPIKey: String? = nil`) to the real project
  key. Leave `supabaseAnonKey` untouched.

- [ ] **2.3 Add the build-time path**, so the key survives a device install, TestFlight and CI.
  In `apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift`, replace the
  `postHogAPIKey` accessor with a resolution order that reads the **bundle** first:
  ```swift
      /// PostHog project key. Resolution order:
      ///   1. Info.plist `POSTHOG_API_KEY` (set from an .xcconfig build setting) —
      ///      the ONLY source that survives a device install, TestFlight and CI.
      ///   2. Secrets.swift (gitignored) — a developer's local convenience.
      ///   3. The POSTHOG_API_KEY env var — Xcode scheme RUN actions only. On iOS
      ///      ProcessInfo.environment carries nothing else, which is why Field
      ///      emitted zero events for 180 days while this looked configured.
      public static var postHogAPIKey: String {
          if let plist = Bundle.main.object(forInfoDictionaryKey: "POSTHOG_API_KEY") as? String,
             !plist.isEmpty, plist != "$(POSTHOG_API_KEY)" {
              return plist
          }
          if let secret = Secrets.postHogAPIKey, !secret.isEmpty { return secret }
          return ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""
      }
  ```
  In `apps/mobile/Capture/scripts/generate_project.rb`, add `POSTHOG_API_KEY` to the app target's
  `INFOPLIST_KEY_*`-adjacent Info.plist dictionary as `$(POSTHOG_API_KEY)`, and declare
  `POSTHOG_API_KEY` as a build setting sourced from an `.xcconfig` that CI writes from a secret.
  Add the honest startup line where analytics is constructed:
  ```swift
      if AppConfiguration.postHogAPIKey.isEmpty {
          Logger(subsystem: "cloud.patina.field", category: "analytics")
              .info("analytics disabled — no key")
      }
  ```

- [ ] **2.4 Make the template say where the key really comes from.** In `Secrets.example.swift`,
  replace `    static let postHogAPIKey: String? = nil` with:
  ```swift
      /// PostHog project key. Field emitted ZERO analytics events for 180 days
      /// because this stayed nil in every build — a full event taxonomy firing
      /// into nothing. Set it here for local Xcode runs, or add POSTHOG_API_KEY
      /// to the Capture scheme's Run → Environment Variables (debug runs ONLY:
      /// on iOS ProcessInfo.environment carries nothing on an installed build).
      /// A distributed build MUST get it from the Info.plist build setting —
      /// see AppConfiguration.postHogAPIKey.
      static let postHogAPIKey: String? = nil
  ```

- [ ] **2.5 Build and install a signed Debug build on the device** (C5 — never
  `capture-gate.sh build`, which is a Simulator gate with `CODE_SIGNING_ALLOWED=NO`), launch it,
  sign in, and take one capture.
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture
  xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug \
    -destination 'platform=iOS,id=<UDID>' -allowProvisioningUpdates
  ```
  (team `VP22LXHT7L`, automatic signing — or the `blitz-iphone` install path.)

- [ ] **2.6 Prove events land.** Re-run the query from 2.1.
  Expected: **> 0**, with at least one `screen` event and one `capture.*` event, **from the installed
  build, not from an Xcode scheme run.**
  **This is a gate, not a checkbox — do not proceed to Task 18's report without it.**

- [ ] **2.7 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/App/Configuration/Secrets.example.swift \
          apps/mobile/Capture/Capture/App/Configuration/AppConfiguration.swift \
          apps/mobile/Capture/scripts/generate_project.rb \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "fix(ios): resolve Field's PostHog key at build time

Field emitted zero analytics events in 180 days (0 rows for
surface='field-ios' vs 6,017 for patina-ios) while a 64-event taxonomy fired
into nothing. The env-var fallback only works under an Xcode scheme's Run
action, so a device install, a TestFlight build and a CI archive were all
blind. Reads an Info.plist key fed from a build setting first, falls back to
the gitignored Secrets.swift, and logs 'analytics disabled - no key' when
nothing resolves."
  ```

---

### Task 3 — `isFeatureEnabled` on the analytics seam, fail-closed

- [ ] **3.1 Write the failing test.** Create
  `apps/mobile/Capture/CaptureTests/FeatureFlagSeamTests.swift`:
  ```swift
  //  FeatureFlagSeamTests.swift
  //  CaptureTests
  //
  //  Field has no feature-flag mechanism at all: CaptureAnalytics exposed only
  //  screen/event/identify while the client app already used isFeatureEnabled.
  //  The seam is FAIL-CLOSED — a conformer that cannot reach PostHog must never
  //  light a gated surface. Wave 1's first consumer is the voice recorder, which
  //  is what gives FC-R11's consent exposure an off-switch that needs no build.

  import Foundation
  import Testing
  @testable import CaptureKit

  private struct SilentAnalytics: CaptureAnalytics {
      func screen(_ name: String, _ properties: [String: String]) {}
      func event(_ name: String, _ properties: [String: String]) {}
  }

  private struct FlaggedAnalytics: CaptureAnalytics {
      let enabled: Set<String>
      func screen(_ name: String, _ properties: [String: String]) {}
      func event(_ name: String, _ properties: [String: String]) {}
      func isFeatureEnabled(_ key: String) -> Bool { enabled.contains(key) }
  }

  struct FeatureFlagSeamTests {
      @Test func featureFlagSeamIsFailClosedByDefault() {
          let analytics: any CaptureAnalytics = SilentAnalytics()
          #expect(analytics.isFeatureEnabled("field-companion-voice") == false)
          #expect(analytics.isFeatureEnabled("") == false)
      }

      @Test func featureFlagSeamReadsAConformersValue() {
          let analytics: any CaptureAnalytics = FlaggedAnalytics(enabled: ["field-companion-voice"])
          #expect(analytics.isFeatureEnabled("field-companion-voice"))
          #expect(analytics.isFeatureEnabled("something-else") == false)
      }
  }
  ```

- [ ] **3.2 Run it and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test
  ```
  Expected failure: `value of type 'any CaptureAnalytics' has no member 'isFeatureEnabled'` —
  compilation error in `FeatureFlagSeamTests.swift`.

- [ ] **3.3 Add the requirement and its fail-closed default.** In
  `apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift`, add to the protocol
  after `func identify(_ userID: String, properties: [String: String])`:
  ```swift
      /// Remote feature flag. FAIL-CLOSED by default (see the extension) so a
      /// seam that cannot reach PostHog never lights a gated surface.
      func isFeatureEnabled(_ key: String) -> Bool
  ```
  and to the extension, after the two `identify` defaults:
  ```swift
      /// Additive (Field Companion W1): existing conformers keep compiling, and
      /// anything that cannot answer answers `false`.
      func isFeatureEnabled(_ key: String) -> Bool { false }
  ```

- [ ] **3.4 Implement it for real in the PostHog conformer.** In
  `apps/mobile/Capture/Capture/Services/Analytics/PostHogCaptureAnalytics.swift`, add — matching the
  file's existing style, which is a **non-public** `final class` whose methods all guard on the
  **instance** property `enabled` (`:38`), not the static `isEnabled` (`:23`):
  ```swift
      func isFeatureEnabled(_ key: String) -> Bool {
          guard enabled, !key.isEmpty else { return false }
          return PostHogSDK.shared.isFeatureEnabled(key)
      }
  ```
  ⚠ `guard isEnabled` would not compile — *"static member cannot be used on instance of type"* — and
  `public func` would be inconsistent with every sibling method.

- [ ] **3.5 Reload flags once auth resolves.** PostHog's flag cache is populated **after**
  `setup`/`identify`/`reloadFeatureFlags`, so a cold launch answers `false` for every key until the
  first fetch. That is correct fail-closed behaviour, and it is also why the kill switch reads
  *"off"* for the first seconds of every launch unless the app asks. Wherever `identify` is called
  after sign-in, follow it with:
  ```swift
      PostHogSDK.shared.reloadFeatureFlags()
  ```

- [ ] **3.6 Gate the recorder behind it.** In the two places a recording can start —
  `VoiceNoteSheet`'s mic and `SiteScanContextModel.toggleVoice()` — hide the affordance when
  `analytics.isFeatureEnabled("field-companion-voice")` is false. Fail-closed means the voice
  affordances are **absent**, not disabled-with-a-spinner.

- [ ] **3.7 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests` — both new tests pass.

- [ ] **3.8 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Analytics/CaptureAnalytics.swift \
          apps/mobile/Capture/Capture/Services/Analytics/PostHogCaptureAnalytics.swift \
          apps/mobile/Capture/CaptureTests/FeatureFlagSeamTests.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): add a fail-closed feature-flag seam and gate the recorder on it

Field had no flag mechanism at all while the client app already used
PostHogService.isFeatureEnabled. Additive protocol requirement with a
false-returning default, so every existing conformer keeps compiling and
anything that cannot reach PostHog cannot light a gated surface. The voice
recorder is its first consumer: third-party audio starts leaving the phone in
this wave and FC-R11 is unruled, so the exposure needs an off-switch that
costs no build and no App Store round-trip."
  ```

---

### Task 4 — `CaptureMediaMime` in CaptureKit, with the bucket drift guard

- [ ] **4.1 Write the failing test.** Create
  `apps/mobile/Capture/CaptureTests/CaptureMediaMimeTests.swift`:
  ```swift
  //  CaptureMediaMimeTests.swift
  //  CaptureTests
  //
  //  The capture-media bucket (00234) enforces an allowed_mime_types list, and a
  //  MIME the uploader can emit but the bucket rejects is a Storage 400 at the
  //  worst possible moment — which is exactly what bit M2. The map lived in the
  //  app target, where the CaptureKit test scheme cannot see it; it lives in
  //  CaptureKit now so this guard runs on every gate.

  import Foundation
  import Testing
  @testable import CaptureKit

  struct CaptureMediaMimeTests {
      /// Exactly what the uploader can put in the bucket today: HEIC/JPEG photos
      /// from the camera path, and .m4a voice segments. Nothing else is emitted
      /// by any code path, so nothing else is asserted here — an aspirational
      /// fixture list would make this guard read stronger than it is.
      private let emittable = ["a.heic", "a.HEIF", "a.jpg", "a.jpeg",
                               "voice-3f2504e0-000.m4a", "VOICE-3F2504E0-001.M4A"]

      @Test func everyEmittableMimeIsAllowedByTheBucket() {
          for name in emittable {
              let mime = CaptureMediaMime.forFilename(name)
              #expect(CaptureMediaMime.bucketAllowed.contains(mime),
                      "\(name) → \(mime) is not in the capture-media allow-list")
          }
      }

      @Test func m4aMapsToTheAudioMimeTheBucketAllows() {
          #expect(CaptureMediaMime.forFilename("voice-abc-000.m4a") == "audio/x-m4a")
          #expect(CaptureMediaMime.forFilename("VOICE-ABC-001.M4A") == "audio/x-m4a")
      }

      @Test func unknownExtensionsFallBackToOctetStream() {
          #expect(CaptureMediaMime.forFilename("a.usdz") == "application/octet-stream")
          #expect(CaptureMediaMime.forFilename("manifest.json") == "application/octet-stream")
          #expect(CaptureMediaMime.forFilename("noextension") == "application/octet-stream")
      }

      @Test func theAllowListMirrorsTheBucketExactly() {
          #expect(CaptureMediaMime.bucketAllowed.count == 10)
          #expect(CaptureMediaMime.bucketAllowed.contains("application/json"))
      }
  }
  ```

- [ ] **4.2 Run it and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test
  ```
  Expected failure: `cannot find 'CaptureMediaMime' in scope`.

- [ ] **4.3 Create the type — a *pure move*, byte-for-byte.** New file
  `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/CaptureMediaMime.swift`:
  ```swift
  //  CaptureMediaMime.swift
  //  CaptureKit
  //
  //  The one place a capture-media object's Content-Type is decided. It lives
  //  beside CaptureMediaPath because the two together are the whole upload wire
  //  contract, and because `bucketAllowed` must be kept byte-identical to
  //  `allowed_mime_types` on the bucket (migration 00234:22-33) — the drift
  //  guard in CaptureMediaMimeTests is what makes that checkable on every gate.
  //
  //  The switch is LocalCaptureSyncService.mimeType (:656-668) moved verbatim.
  //  Note there is deliberately NO "json" case even though the bucket allows
  //  application/json: today .json falls to application/octet-stream, nothing
  //  uploads a .json to this bucket, and a silent Content-Type change smuggled
  //  into a "pure move" is exactly the kind of drift this file exists to stop.

  import Foundation

  public enum CaptureMediaMime {
      public static func forFilename(_ filename: String) -> String {
          switch (filename as NSString).pathExtension.lowercased() {
          case "heic", "heif": return "image/heic"
          case "jpg", "jpeg":  return "image/jpeg"
          case "png":          return "image/png"
          case "webp":         return "image/webp"
          case "m4a":          return "audio/x-m4a"
          case "mp4":          return "audio/mp4"
          case "aac":          return "audio/aac"
          case "wav":          return "audio/wav"
          default:             return "application/octet-stream"
          }
      }

      /// Mirrors `allowed_mime_types` on the `capture-media` bucket (00234:22-33),
      /// all ten entries, in the bucket's own order. Adding a case above without
      /// adding it here is a Storage 400 in the field.
      public static let bucketAllowed: Set<String> = [
          "image/heic",
          "image/jpeg",
          "image/png",
          "image/webp",
          "audio/mp4",
          "audio/x-m4a",
          "audio/aac",
          "audio/wav",
          "application/json",
          "application/octet-stream",
      ]
  }
  ```

- [ ] **4.4 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **4.5 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Sync/CaptureMediaMime.swift \
          apps/mobile/Capture/CaptureTests/CaptureMediaMimeTests.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): move the capture-media MIME map into CaptureKit

The map lived in LocalCaptureSyncService (app target), where the CaptureKit
test scheme cannot reach it, so the bucket-allow-list drift guard that caught
the M2 Storage 400 could never run in CI. CaptureMediaMime carries the switch
verbatim - no behaviour change, including .json still falling to
application/octet-stream - plus a copy of 00234's allowed_mime_types; the new
test asserts the two agree."
  ```

---

### Task 5 — `VoiceRecordingPolicy`

- [ ] **5.1 Write the failing test.** Create
  `apps/mobile/Capture/CaptureTests/VoiceRecordingPolicyTests.swift`:
  ```swift
  //  VoiceRecordingPolicyTests.swift
  //  CaptureTests
  //
  //  SFSpeechRecognizer caps at roughly one minute of audio per request, and the
  //  shipped code installed ONE request for a whole session — so any note over a
  //  minute silently truncated. The policy rotates the RECOGNIZER, never the
  //  audio file: the audio is the record, the transcript is a reading of it.
  //
  //  shouldEnd is not decoration: Task 8 CALLS it from the rotation check and
  //  ends the note visibly. A policy type that is asserted here and never
  //  invoked would report green over behaviour that cannot happen.

  import Foundation
  import Testing
  @testable import CaptureKit

  struct VoiceRecordingPolicyTests {
      private let note = UUID(uuidString: "3F2504E0-4F89-41D3-9A0C-0305E82C3301")!

      @Test func rotationFiresAtFiftySecondsAndNotBefore() {
          #expect(VoiceRecordingPolicy.segmentRotationSeconds == 50)
          #expect(!VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 49.9))
          #expect(VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 50))
          #expect(VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 61))
      }

      @Test func noteEndsAtTwentyMinutesOrTwentyFourSegments() {
          #expect(!VoiceRecordingPolicy.shouldEnd(totalElapsed: 1199, segmentCount: 3))
          #expect(VoiceRecordingPolicy.shouldEnd(totalElapsed: 1200, segmentCount: 3))
          #expect(VoiceRecordingPolicy.shouldEnd(totalElapsed: 30, segmentCount: 24))
      }

      @Test func segmentFilenameIsZeroPaddedLowercasedAndM4A() {
          #expect(VoiceRecordingPolicy.segmentFilename(noteID: note, index: 0)
                  == "voice-3f2504e0-4f89-41d3-9a0c-0305e82c3301-000.m4a")
          #expect(VoiceRecordingPolicy.segmentFilename(noteID: note, index: 12)
                  == "voice-3f2504e0-4f89-41d3-9a0c-0305e82c3301-012.m4a")
      }

      @Test func segmentFilenamesCarryAnAllowedMime() {
          let name = VoiceRecordingPolicy.segmentFilename(noteID: note, index: 0)
          #expect(CaptureMediaMime.bucketAllowed.contains(CaptureMediaMime.forFilename(name)))
      }
  }
  ```

- [ ] **5.2 Run it and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test
  ```
  Expected failure: `cannot find 'VoiceRecordingPolicy' in scope`.

- [ ] **5.3 Create the type.** New file
  `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/VoiceRecordingPolicy.swift`:
  ```swift
  //  VoiceRecordingPolicy.swift
  //  CaptureKit
  //
  //  Rotate the recognizer, never the file. SFSpeechRecognizer caps at ~1 minute
  //  of audio per request; the AVAudioFile stays continuous for a segment, and a
  //  new segment opens only when an interruption forces one. Boundary word-loss
  //  in the on-device draft is acceptable because the audio is the record
  //  (R114.1 two-tier trust).

  import Foundation

  public enum VoiceRecordingPolicy {
      /// Below SFSpeechRecognizer's ~60 s per-request cap, with margin.
      public static let segmentRotationSeconds: TimeInterval = 50
      /// A note ends visibly at this length — never silently.
      public static let maxNoteSeconds: TimeInterval = 20 * 60
      public static let maxSegments: Int = 24

      public static func shouldRotate(elapsedInSegment: TimeInterval) -> Bool {
          elapsedInSegment >= segmentRotationSeconds
      }

      public static func shouldEnd(totalElapsed: TimeInterval, segmentCount: Int) -> Bool {
          totalElapsed >= maxNoteSeconds || segmentCount >= maxSegments
      }

      /// `voice-<noteID>-NNN.m4a`, lowercased to match CaptureMediaPath's rule
      /// that every path segment renders the way Postgres renders a uuid.
      public static func segmentFilename(noteID: UUID, index: Int) -> String {
          let ordinal = String(format: "%03d", index)
          return "voice-\(noteID.uuidString.lowercased())-\(ordinal).m4a"
      }
  }
  ```

- [ ] **5.4 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **5.5 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/VoiceRecordingPolicy.swift \
          apps/mobile/Capture/CaptureTests/VoiceRecordingPolicyTests.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): add VoiceRecordingPolicy (rotation, cap, segment naming)

SFSpeechRecognizer caps at ~1 minute per request and the shipped recorder
installed one request per session, so any note over a minute truncated
silently. The policy is pure and CaptureKit-side so the boundaries are
testable; the recorder that reads it - and that calls shouldEnd, so the cap is
enforced rather than merely defined - lands next."
  ```

---

### Task 6 — The audio wire: segments, capture kind, and the schema-version bump

- [ ] **6.1 Write the failing tests.** Create
  `apps/mobile/Capture/CaptureTests/VoiceAudioWireTests.swift`:
  ```swift
  //  VoiceAudioWireTests.swift
  //  CaptureTests
  //
  //  No audio has ever left a Field device: SpeechVoiceNoteService declared
  //  mediaDirectory (never read) and audioFilename (never assigned), while its
  //  own header claimed the raw audio was always kept. Everything downstream —
  //  the payload key, the four audio MIME branches, 00234's allow-list, 00235's
  //  reader, CaptureStore.missingRequiredMedia — was built and dead-waiting.
  //  These tests pin the wire so it stays alive.

  import Foundation
  import Testing
  @testable import CaptureKit

  struct VoiceAudioWireTests {

      @Test func voiceNoteResultDerivesSegmentsFromTheLegacyFilename() {
          let result = VoiceNoteResult(transcript: "hello",
                                       audioFilename: "voice-a-000.m4a",
                                       durationSeconds: 12)
          #expect(result.audioSegments == ["voice-a-000.m4a"])
      }

      @Test func voiceNoteResultKeepsAnExplicitSegmentList() {
          let result = VoiceNoteResult(transcript: "hello",
                                       audioFilename: "voice-a-000.m4a",
                                       audioSegments: ["voice-a-000.m4a", "voice-a-001.m4a"],
                                       durationSeconds: 90)
          #expect(result.audioSegments.count == 2)
          #expect(result.audioSegments.first == result.audioFilename)
      }

      @Test func voiceNoteResultWithNoAudioHasNoSegments() {
          let result = VoiceNoteResult(transcript: "hello",
                                       audioFilename: nil,
                                       durationSeconds: 3)
          #expect(result.audioSegments.isEmpty)
      }

      @Test func payloadCarriesEveryVoiceSegment() {
          let specimen = Specimen()
          specimen.voiceTranscript = "the alcove is about forty-two and three quarters"
          specimen.voiceAudioFilename = "voice-a-000.m4a"
          specimen.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
          specimen.voiceDurationSeconds = 91
          let payload = FieldCapturePayload(specimen: specimen,
                                            device: FieldCapturePayload.Device())
          #expect(payload.voice?.audioPath == "voice-a-000.m4a")
          #expect(payload.voice?.audioSegments == ["voice-a-000.m4a", "voice-a-001.m4a"])
      }

      @Test func payloadOmitsVoiceWhenNothingWasRecorded() {
          let specimen = Specimen()
          let payload = FieldCapturePayload(specimen: specimen,
                                            device: FieldCapturePayload.Device())
          #expect(payload.voice == nil)
      }

      @Test func payloadCarriesTheCaptureKindTheServerChecks() {
          let specimen = Specimen()
          specimen.captureKindRaw = "note"
          let payload = FieldCapturePayload(specimen: specimen,
                                            device: FieldCapturePayload.Device())
          #expect(payload.captureKind == "note")
      }

      @Test func payloadOmitsAnUnsetCaptureKindSoTheServerDefaultApplies() {
          let payload = FieldCapturePayload(specimen: Specimen(),
                                            device: FieldCapturePayload.Device())
          #expect(payload.captureKind == nil)
      }

      @Test func schemaVersionIsBumpedForTheNewReaderSideKeys() {
          #expect(FieldCapturePayload.currentSchemaVersion == 2)
      }

      @Test func missingRequiredMediaChecksEverySegmentInOrder() throws {
          let store = try CaptureStore.inMemory()
          let specimen = Specimen()
          specimen.voiceAudioFilename = "voice-a-000.m4a"
          specimen.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
          let missing = store.missingRequiredMedia(for: specimen)
          #expect(missing == ["voice-a-000.m4a", "voice-a-001.m4a"])
      }

      @Test func anUploadedSegmentIsExemptedLikeAnUploadedPhoto() throws {
          let store = try CaptureStore.inMemory()
          let specimen = Specimen()
          specimen.voiceAudioFilename = "voice-a-000.m4a"
          specimen.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
          specimen.voiceAudioRemotePathsRaw = ["uid/tok/voice-a-000.m4a"]
          let missing = store.missingRequiredMedia(for: specimen)
          #expect(missing == ["voice-a-001.m4a"])
      }
  }
  ```

- [ ] **6.2 Run and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test
  ```
  Expected failure: `value of type 'VoiceNoteResult' has no member 'audioSegments'` and
  `value of type 'Specimen' has no member 'voiceAudioSegmentsRaw'`.

- [ ] **6.3 Extend `VoiceNoteResult`.** In
  `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift`, replace the
  `VoiceNoteResult` struct with:
  ```swift
  public struct VoiceNoteResult: Sendable {
      public let transcript: String
      /// Segment 0. Every shipped reader (payload, store, sync) keeps using this.
      public let audioFilename: String?
      /// Ordered audio segments. Later segments exist only when an interruption
      /// split the note; empty when no audio was written at all.
      public let audioSegments: [String]
      /// Whether recognition actually ran on-device. Recorded, not merely set:
      /// voice.finish reports it, and the shipped permission string promises it.
      public let onDevice: Bool
      public let durationSeconds: Double
      public init(transcript: String, audioFilename: String?,
                  audioSegments: [String] = [], onDevice: Bool = false,
                  durationSeconds: Double) {
          self.transcript = transcript
          self.audioFilename = audioFilename
          self.audioSegments = audioSegments.isEmpty
              ? (audioFilename.map { [$0] } ?? [])
              : audioSegments
          self.onDevice = onDevice
          self.durationSeconds = durationSeconds
      }
  }
  ```

- [ ] **6.4 Extend `Specimen`.** In
  `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift`, immediately after
  `public var voiceAudioFilename: String?`, add:
  ```swift
      /// Ordered voice-audio segments in the App Group media dir. Additive and
      /// OPTIONAL so SwiftData migrates lightweight — there is no VersionedSchema
      /// in this app. `voiceAudioFilename` stays segment 0 for every reader that
      /// predates segmentation.
      public var voiceAudioSegmentsRaw: [String]?
      /// Remote object paths for segments that have uploaded, in the same order.
      /// This is what lets missingRequiredMedia exempt an uploaded segment the
      /// way it already exempts an uploaded photo — without it a voice file is
      /// required-LOCAL forever and one unreadable segment blocks a whole note.
      public var voiceAudioRemotePathsRaw: [String]?
      /// 'device' | 'device_partial' — which reading produced voiceTranscript.
      public var voiceTranscriptSourceRaw: String?
      /// 'note' | 'context' | nil. Wave 1's producer for the server's
      /// capture_kind CHECK; nil means the server default 'specimen' applies.
      public var captureKindRaw: String?
  ```
  ⚠ **No `voiceAudioSha256`.** Nothing in waves 1–5 hashes the audio, so the property, the
  `voice.audioSha256` wire key and the `voice_audio_sha256` column would all be dead — they land
  together in wave 6A beside the re-transcription no-op check that is their first real reader
  (spec §8.10, §9.2).

- [ ] **6.5 Extend the payload.** In
  `apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift`, add to
  `struct Voice`, after `public var audioPath: String?`:
  ```swift
          /// Ordered segment filenames; the app upgrades each to its full
          /// `<uid>/<clientToken>/<file>` object path at upload time, exactly as
          /// it already does for `audioPath`.
          public var audioSegments: [String]?
          /// 'device' | 'device_partial' — which reading produced `transcript`.
          public var transcriptSource: String?
  ```
  add the top-level key beside the other envelope fields:
  ```swift
      /// 'note' | 'context' | nil. Read by the W1 migration into
      /// field_captures.capture_kind, which CHECKs ('specimen','note','context').
      public var captureKind: String?
  ```
  bump the version, per this file's own contract at `:41-43` (*"Bumped only alongside a 00235-side
  reader change"*) — the W1 migration adds four payload reads, which is one:
  ```swift
      public static let currentSchemaVersion = 2
  ```
  and replace `buildVoice`, plus set the kind in `init(specimen:device:)`:
  ```swift
      private static func buildVoice(_ s: Specimen) -> Voice? {
          let transcript = s.voiceTranscript?.nonEmpty
          let partial = s.voicePartialTranscript?.nonEmpty
          let audioPath = s.voiceAudioFilename?.nonEmpty
          let segments = (s.voiceAudioSegmentsRaw ?? []).filter { !$0.isEmpty }
          let duration = s.voiceDurationSeconds
          guard transcript != nil || partial != nil || audioPath != nil
                  || !segments.isEmpty || duration != nil else { return nil }
          return Voice(audioPath: audioPath,
                       audioSegments: segments.isEmpty ? nil : segments,
                       transcriptSource: s.voiceTranscriptSourceRaw?.nonEmpty,
                       transcript: transcript,
                       partialTranscript: partial,
                       durationSeconds: duration)
      }
  ```
  ```swift
      // in init(specimen s: Specimen, device: Device)
      self.captureKind = s.captureKindRaw?.nonEmpty
  ```

- [ ] **6.6 Extend `missingRequiredMedia` — deterministically, and with the photo rule.** In
  `apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift`, replace the voice
  block inside `missingRequiredMedia(for:)` with:
  ```swift
          // Mirror the photo rule directly above: a segment that carries a durable
          // remote path no longer depends on its local copy. Without this a voice
          // file is required-LOCAL forever (uploadMedia never stamped one), and
          // CaptureMediaAvailabilityError is not a LocalSyncError, so isDeferrable
          // does not apply — one unreadable segment would HARD-fail a note that
          // today syncs transcript-only.
          let uploaded = Set((specimen.voiceAudioRemotePathsRaw ?? [])
              .compactMap { $0.split(separator: "/").last.map(String.init) })
          var seen = Set<String>()
          let voiceNames = ([specimen.voiceAudioFilename]
                            + (specimen.voiceAudioSegmentsRaw ?? []).map { Optional($0) })
              .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
              .filter { !$0.isEmpty && !uploaded.contains($0) }
          for name in voiceNames where seen.insert(name).inserted {
              required.append(name)
          }
  ```
  ⚠ **Order-preserving de-duplication, not `Set(voiceNames)`.** A `Set` iterates unordered, so the
  array — and the `CaptureMediaAvailabilityError.missingLocalMedia([...])` message it feeds — would
  vary run to run. The shipped function is deterministic and must stay so.

- [ ] **6.7 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests` — all ten new tests pass, and the shipped
  `FieldCapturePayloadTests` still passes unchanged (the wire is additive).

- [ ] **6.8 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/RecognitionServices.swift \
          apps/mobile/Capture/CaptureKit/CaptureKit/Domain/Specimen.swift \
          apps/mobile/Capture/CaptureKit/CaptureKit/Sync/FieldCapturePayload.swift \
          apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/CaptureStore.swift \
          apps/mobile/Capture/CaptureTests/VoiceAudioWireTests.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): carry voice audio segments and capture kind through the wire

Adds VoiceNoteResult.audioSegments/onDevice, Specimen.voiceAudioSegmentsRaw /
voiceAudioRemotePathsRaw / voiceTranscriptSourceRaw / captureKindRaw, the
voice.audioSegments / voice.transcriptSource / captureKind payload keys, and a
segment-aware missingRequiredMedia that exempts an uploaded segment the way it
already exempts an uploaded photo - so one unreadable segment can no longer
hard-fail a note that used to sync transcript-only. Bumps
currentSchemaVersion to 2 per the file's own contract, since the server-side
reader gains four payload reads. All additive and optional: SwiftData migrates
lightweight, old builds keep committing, and segment 0 stays in
voiceAudioFilename so every shipped reader is untouched."
  ```

---

### Task 7 — The write-only `projectRoomID`

- [ ] **7.1 Write the failing test.** Create
  `apps/mobile/Capture/CaptureTests/RoutingMemoryStampTests.swift`:
  ```swift
  //  RoutingMemoryStampTests.swift
  //  CaptureTests
  //
  //  S1AssignVenueScreen.persistRouting() writes projectRoomID into visit routing
  //  memory, and ViewfinderModel.makeDraft() read four of the five fields back —
  //  venue.projectRoomId was assigned nowhere in that file, so
  //  CaptureRoutingMemory.projectRoomID was WRITE-ONLY and every capture after
  //  the first silently lost the FF&E room. One pure mapper, one regression test.

  import Foundation
  import Testing
  @testable import CaptureKit

  struct RoutingMemoryStampTests {

      @Test func routingMemoryStampsAllFiveFieldsIncludingTheProjectRoom() {
          let routing = CaptureRoutingMemory(destination: .inbox,
                                             projectID: "p-1",
                                             projectName: "Maple St",
                                             projectRoomID: "pr-9",
                                             room: "Living",
                                             shelf: "Seating · maybe")
          let stamped = routing.stamped(onto: VenueStamp())
          #expect(stamped.projectId == "p-1")
          #expect(stamped.projectName == "Maple St")
          #expect(stamped.projectRoomId == "pr-9")   // the regression this exists for
          #expect(stamped.room == "Living")
          #expect(stamped.shelf == "Seating · maybe")
      }

      @Test func routingMemoryStampPreservesNonRoutingVenueFacts() {
          var venue = VenueStamp(latitude: 43.07, longitude: -89.40,
                                 placemarkName: "Maple St")
          venue.placeId = "place-1"
          let stamped = CaptureRoutingMemory(projectID: "p-1").stamped(onto: venue)
          #expect(stamped.latitude == 43.07)
          #expect(stamped.longitude == -89.40)
          #expect(stamped.placemarkName == "Maple St")
          #expect(stamped.placeId == "place-1")
          #expect(stamped.projectId == "p-1")
      }

      @Test func anEmptyRoutingMemoryClearsPlacementWithoutTouchingGPS() {
          var venue = VenueStamp(latitude: 43.07, longitude: -89.40)
          venue.projectId = "stale"
          venue.projectRoomId = "stale-room"
          let stamped = CaptureRoutingMemory.empty.stamped(onto: venue)
          #expect(stamped.projectId == nil)
          #expect(stamped.projectRoomId == nil)
          #expect(stamped.latitude == 43.07)
      }
  }
  ```

- [ ] **7.2 Run and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh test
  ```
  Expected failure: `value of type 'CaptureRoutingMemory' has no member 'stamped'`.

- [ ] **7.3 Add the mapper** at the **end of the file**
  `apps/mobile/Capture/CaptureKit/CaptureKit/Session/CaptureSessionContext.swift` — after the
  `CaptureSessionContext` / `CaptureSessionContextPolicy` declarations, at top level.
  ⚠ Not *"after `CaptureRoutingMemory.empty`"*: `static let empty` is at `:46`, **inside** the
  struct whose closing brace is `:47`, so a literal reading would nest the extension in the struct
  body.
  ```swift
  public extension CaptureRoutingMemory {
      /// The single place visit routing crosses onto a capture. Added because
      /// ViewfinderModel.makeDraft() copied four of the five fields and dropped
      /// projectRoomID, so a capture inherited the project and lost the room.
      /// GPS and the human venue label are capture facts and are never touched.
      func stamped(onto venue: VenueStamp) -> VenueStamp {
          var stamped = venue
          stamped.projectId = projectID
          stamped.projectName = projectName
          stamped.projectRoomId = projectRoomID
          stamped.room = room
          stamped.shelf = shelf
          return stamped
      }
  }
  ```

- [ ] **7.4 Use it.** In `apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift`,
  replace the five-line block inside `makeDraft` (`:345-350`, currently
  `var venue = draft.venue ?? VenueStamp()` … `draft.venue = venue`) with:
  ```swift
          draft.venue = context.routing.stamped(onto: draft.venue ?? VenueStamp())
  ```

- [ ] **7.5 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **7.6 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Session/CaptureSessionContext.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
          apps/mobile/Capture/CaptureTests/RoutingMemoryStampTests.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "fix(ios): stop dropping the FF&E room when a capture inherits routing

S1 wrote projectRoomID into visit routing memory and makeDraft read back four
of the five fields, so CaptureRoutingMemory.projectRoomID was write-only and
every capture after the first lost its room even inside a session where the
designer had already answered. One pure mapper in CaptureKit, one regression
test, one call site."
  ```

---

### Task 8 — The recorder writes the audio

> The single highest-value change in the wave, and the only one with **no unit test**: it is
> app-target AVFoundation code and `CaptureTests` links CaptureKit only (constraint C1). Its
> boundaries are already pinned by Tasks 5 and 6; its behaviour is pinned by the device pass.
>
> ⚠ **Five real-world hazards this task must not reintroduce**, each with a numbered device-pass step
> in §1: (a) one service instance serves **many** notes, (b) the tap block runs on the **render
> thread**, (c) the tap's channel count is **route-dependent** and a mismatched
> `AVAudioFile.write(from:)` raises an ObjC exception `try?` cannot catch, (d) iOS **stops the
> engine** on an interruption, so nothing resumes unless this code restarts it, (e)
> `addObserver(forName:…)` returns a **token** — the observer is not `self`.

- [ ] **8.1 Pin the behaviour in the header before changing code.** In
  `apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift`, replace line 7
  (`//  transcript-entry fallback. The raw audio file is always kept alongside the text.`) with:
  ```swift
  //  transcript-entry fallback. The audio IS the record and the transcript is a
  //  reading of it (R114.1): the .m4a is written from the same engine tap that
  //  feeds recognition, the recognition request rotates at
  //  VoiceRecordingPolicy.segmentRotationSeconds while the file stays
  //  continuous, and an interruption opens segment N+1. A failed AVAudioFile
  //  open OR write is non-fatal — the note ships transcript-only rather than
  //  blocking. One instance serves many notes, so every per-note field is reset
  //  in startLiveTranscription().
  ```

- [ ] **8.2 Add the recording state.** Replace the `private var audioFilename: String?` declaration
  with:
  ```swift
      /// Minted PER NOTE in startLiveTranscription(), never at init: this service
      /// is constructed once per SCREEN (SiteScanContextCapture.swift:237,
      /// SiteScanHostScreen.swift:212) and toggleVoice() starts arbitrarily many
      /// notes on it. A let-at-init noteID made note 2 inherit note 1's audio.
      private var noteID = UUID()
      private var audioFile: AVAudioFile?
      private var audioFilename: String?          // segment 0, for every legacy reader
      private var audioSegments: [String] = []
      private var segmentStartedAt: Date?
      private var noteStartedAt: Date?
      private var interrupted = false
      private var onDeviceRecognition = false
      private var interruptionObserver: NSObjectProtocol?
      /// The tap runs on the render thread and may do exactly two things. Every
      /// recognizer swap is POSTED here instead of performed inline.
      private let rotationQueue = DispatchQueue(label: "cloud.patina.field.voice.rotation")
      private var rotationInFlight = false
  ```

- [ ] **8.3 Reset per-note state, open the file, and keep the tap to two jobs.** At the very top of
  `startLiveTranscription()`, replace the existing two-line reset
  (`latestTranscript = ""` / `startedAt = Date()`) with the full one:
  ```swift
          latestTranscript = ""
          startedAt = Date()
          // Every per-note field, because one instance records many notes.
          noteID = UUID()
          audioFile = nil
          audioFilename = nil
          audioSegments = []
          segmentStartedAt = nil
          noteStartedAt = Date()
          interrupted = false
          rotationInFlight = false
  ```
  After `let format = inputNode.outputFormat(forBus: 0)`, insert:
  ```swift
          onDeviceRecognition = recognizer.supportsOnDeviceRecognition
          request.requiresOnDeviceRecognition = onDeviceRecognition
          openSegment(format: format)
          observeInterruptions()
  ```
  and change the tap block from `self?.request?.append(buffer)` to:
  ```swift
              inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                  guard let self else { return }
                  // RENDER THREAD. Two jobs only: feed recognition, write bytes.
                  self.request?.append(buffer)
                  if let file = self.audioFile,
                     buffer.format.channelCount == file.processingFormat.channelCount,
                     buffer.format.sampleRate == file.processingFormat.sampleRate {
                      try? file.write(from: buffer)
                  }
                  // Everything else is POSTED off the render thread.
                  self.requestRotationIfNeeded(recognizer: recognizer, continuation: continuation)
              }
  ```
  ⚠ The `buffer.format == file.processingFormat` guard is not defensive decoration.
  `AVAudioFile.write(from:)` asserts the channel counts match and raises an
  `NSInvalidArgumentException`, which is **not** a Swift `Error` — `try?` does not catch it and the
  process **traps**. A route change (AirPods in or out) is enough to trigger it.

- [ ] **8.4 Add the segment helpers** at the end of the class, before `public enum VoiceNoteError`:
  ```swift
      /// A failed open is deliberately non-fatal: recognition continues and the
      /// note ships transcript-only. Never block a capture (R108.5).
      /// The channel count comes from the TAP's format — hardcoding 1 against a
      /// two-channel USB or Bluetooth input is the write-crash in 8.3.
      private func openSegment(format: AVAudioFormat) {
          guard let mediaDirectory else { return }
          let name = VoiceRecordingPolicy.segmentFilename(noteID: noteID,
                                                          index: audioSegments.count)
          let url = mediaDirectory.appendingPathComponent(name)
          do {
              audioFile = try AVAudioFile(forWriting: url, settings: [
                  AVFormatIDKey: kAudioFormatMPEG4AAC,
                  AVSampleRateKey: format.sampleRate,
                  AVNumberOfChannelsKey: format.channelCount,
                  AVEncoderBitRateKey: 32_000,
              ])
              audioSegments.append(name)
              if audioFilename == nil { audioFilename = name }
              segmentStartedAt = Date()
          } catch {
              audioFile = nil
              analytics.event("voice.audio_write_failed", ["reason": "open"])
          }
      }

      /// Called FROM the render thread; does no work there. Hops to a serial
      /// queue for the recognizer swap, which mutates request/task and performs
      /// an XPC round-trip. @unchecked Sendable silences the compiler, not the
      /// race; the symptom of doing this inline is audio glitching and torn
      /// state at every rotation boundary.
      private func requestRotationIfNeeded(
          recognizer: SFSpeechRecognizer,
          continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation
      ) {
          guard !rotationInFlight,
                let startedAt = segmentStartedAt,
                VoiceRecordingPolicy.shouldRotate(
                    elapsedInSegment: Date().timeIntervalSince(startedAt)) else { return }
          rotationInFlight = true
          rotationQueue.async { [weak self] in
              self?.rotate(recognizer: recognizer, continuation: continuation)
          }
      }

      /// Rotate the RECOGNIZER, never the file. SFSpeechRecognizer caps at ~60 s
      /// per request; the .m4a for this segment stays one continuous file.
      /// ENFORCES the cap — a policy that is unit-tested and never invoked
      /// reports green over behaviour that cannot happen.
      private func rotate(recognizer: SFSpeechRecognizer,
                          continuation: AsyncThrowingStream<TranscriptChunk, Error>.Continuation) {
          defer { rotationInFlight = false }

          let elapsed = noteStartedAt.map { Date().timeIntervalSince($0) } ?? 0
          if VoiceRecordingPolicy.shouldEnd(totalElapsed: elapsed,
                                            segmentCount: audioSegments.count) {
              continuation.yield(TranscriptChunk(
                  text: latestTranscript, isFinal: true))
              continuation.finish()
              analytics.event("voice.finish", ["reason": "cap"])
              return
          }

          let carried = latestTranscript
          request?.endAudio()
          task?.finish()
          let next = SFSpeechAudioBufferRecognitionRequest()
          next.shouldReportPartialResults = true
          next.requiresOnDeviceRecognition = onDeviceRecognition
          request = next
          segmentStartedAt = Date()
          analytics.event("voice.segment_rotated", ["index": String(audioSegments.count)])
          task = recognizer.recognitionTask(with: next) { [weak self] result, _ in
              guard let self, let result else { return }
              let joined = [carried, result.bestTranscription.formattedString]
                  .filter { !$0.isEmpty }.joined(separator: " ")
              self.latestTranscript = joined
              continuation.yield(TranscriptChunk(text: joined, isFinal: false))
          }
      }

      /// Nothing in the app observed audio interruptions before this.
      /// `.began`: iOS has ALREADY stopped the engine and torn down the session.
      /// `.ended` with .shouldResume: reactivate the session, restart the engine,
      /// reinstall the tap, THEN open segment N+1. A `guard audioEngine.isRunning`
      /// at `.ended` can never be true and would make the resume path dead code.
      private func observeInterruptions() {
          if let interruptionObserver {
              NotificationCenter.default.removeObserver(interruptionObserver)
          }
          interruptionObserver = NotificationCenter.default.addObserver(
              forName: AVAudioSession.interruptionNotification,
              object: AVAudioSession.sharedInstance(),
              queue: .main
          ) { [weak self] note in
              guard let self,
                    let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                    let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
              switch type {
              case .began:
                  self.audioFile = nil
                  self.segmentStartedAt = nil
                  self.interrupted = true
                  self.analytics.event("voice.interrupted", ["reason": "began"])
              case .ended:
                  let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                  guard AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
                      .contains(.shouldResume) else { return }
                  do {
                      let session = AVAudioSession.sharedInstance()
                      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
                      try session.setActive(true, options: .notifyOthersOnDeactivation)
                      let input = self.audioEngine.inputNode
                      let format = input.outputFormat(forBus: 0)
                      input.removeTap(onBus: 0)
                      self.installTap(on: input, format: format)
                      self.audioEngine.prepare()
                      try self.audioEngine.start()
                      self.openSegment(format: format)
                      self.interrupted = false
                  } catch {
                      self.analytics.event("voice.audio_write_failed", ["reason": "resume"])
                  }
              @unknown default:
                  break
              }
          }
      }
  ```
  Factor the tap installation from 8.3 into `installTap(on:format:)` so the resume path and the start
  path install **the same** tap rather than two copies that can drift.

- [ ] **8.5 Return the segments and remove the observer by its token.** In `finish()`, replace the
  returned `VoiceNoteResult(...)` with:
  ```swift
          audioFile = nil
          if let interruptionObserver {
              // addObserver(forName:object:queue:using:) returns an opaque TOKEN.
              // The observer is not `self`, so removeObserver(self, name:…) removes
              // nothing and every recording leaks another block onto a service that
              // lives as long as the screen.
              NotificationCenter.default.removeObserver(interruptionObserver)
              self.interruptionObserver = nil
          }
          return VoiceNoteResult(
              transcript: latestTranscript,
              audioFilename: audioFilename,
              audioSegments: audioSegments,
              onDevice: onDeviceRecognition,
              durationSeconds: duration
          )
  ```
  and add the same token removal to `deinit`.

- [ ] **8.6 Persist the segments at every consumer.** Three call sites, not one.
  In `apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift`, immediately after
  `specimen.voiceAudioFilename = result?.audioFilename` (`:205`):
  ```swift
          specimen.voiceAudioSegmentsRaw = result?.audioSegments
          specimen.voiceTranscriptSourceRaw = (result?.transcript.isEmpty == false)
              ? "device" : "device_partial"
          specimen.captureKindRaw = "note"
  ```
  In `apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ContextCaptureService.swift`, extend
  `enqueueVoice`'s signature with `audioSegments: [String] = []` and
  `transcriptSource: String? = nil`, and assign them beside `draft.voiceAudioFilename`, along with
  `draft.captureKindRaw = "context"`.
  ⚠ **And thread them at the only caller**, `SiteScanContextCapture.swift:132-137` — the defaulted
  argument keeps it compiling while silently keeping only segment 0, so an interrupted in-scan note
  would lose segments 1+ and `missingRequiredMedia` would never guard them:
  ```swift
              let created = service.enqueueVoice(
                  transcript: transcript,
                  audioFilename: result.audioFilename,
                  audioSegments: result.audioSegments,
                  transcriptSource: transcript.isEmpty ? "device_partial" : "device",
                  durationSeconds: result.durationSeconds,
                  provenance: self.provenance(pose: nil))
  ```

- [ ] **8.7 Build.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests` (the CaptureKit suite is unaffected; this task's proof is 8.8).

- [ ] **8.8 Prove it on a device** (the Simulator's mic is unreliable and proves nothing). Install a
  **signed Debug build** per C5 — never `capture-gate.sh build` — then run device-pass steps 1–5
  from §1: 15 s note, 3-minute note, **two notes back to back on one screen**, an incoming call
  mid-note, and **AirPods connected and disconnected mid-note**. Confirm
  `voice-<uuid>-000.m4a` exists with a non-zero size, that note 2's audio is note 2's, that segment
  N+1 opens after the call ends, and that the process does not trap on the route change.

- [ ] **8.9 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift \
          apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift \
          apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ContextCaptureService.swift \
          apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): actually record the voice note's audio

mediaDirectory was stored and never read and audioFilename was read and never
assigned, so no audio has ever left a Field device and the file's own header
said the opposite. Writes AAC-LC m4a from the existing engine tap at the tap's
own channel count, rotates the recognition request off the render thread at
50s against SFSpeechRecognizer's ~60s cap while the file stays continuous,
restarts the engine and reinstalls the tap on interruption-ended before
opening segment N+1, enforces the 20-minute cap through
VoiceRecordingPolicy.shouldEnd, removes its interruption observer by token,
resets every per-note field per recording, and records whether recognition
actually ran on-device to match the shipped permission string's promise."
  ```

---

### Task 9 — Upload every segment, and never let one block the note

- [ ] **9.1 Delegate the MIME map.** In
  `apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift`, replace the body of
  `private static func mimeType(for filename: String) -> String` with:
  ```swift
      private static func mimeType(for filename: String) -> String {
          CaptureMediaMime.forFilename(filename)
      }
  ```

- [ ] **9.2 Upload the whole segment list — dropping what has gone missing.** In
  `uploadMedia(for:owner:remote:userID:)`, replace the single-`voiceFilename` derivation and the
  single-file upload block with:
  ```swift
          let voiceFilenames: [String] = {
              let raw = (specimen.voiceAudioSegmentsRaw?.isEmpty == false)
                  ? specimen.voiceAudioSegmentsRaw!
                  : [specimen.voiceAudioFilename].compactMap { $0 }
              return raw
                  .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                  .filter { !$0.isEmpty }
          }()
          let total = photos.count + voiceFilenames.count
  ```
  ```swift
          var voicePaths: [String] = []
          var lostSegments = 0
          for filename in voiceFilenames {
              try requireActiveOwner(owner)
              let url = store.mediaURL(for: filename)
              guard let data = try? Data(contentsOf: url), !data.isEmpty else {
                  // DROP, do not throw. A note that transcribes fine must not be
                  // permanently stuck because one segment failed to flush on a
                  // full disk or was lost across a reinstall.
                  // CaptureMediaAvailabilityError is not a LocalSyncError, so
                  // isDeferrable does not apply — throwing here is a HARD failure.
                  lostSegments += 1
                  uploaded += 1
                  bumpProgress(specimen, uploaded: uploaded, total: total)
                  continue
              }
              let path = "\(folder)/\(filename)"
              try await remote.upload(data, to: path,
                                      contentType: Self.mimeType(for: filename))
              voicePaths.append(path)
              // Stamp the durable path so missingRequiredMedia exempts this
              // segment from now on, exactly as it exempts an uploaded photo.
              specimen.voiceAudioRemotePathsRaw =
                  (specimen.voiceAudioRemotePathsRaw ?? []) + [path]
              uploaded += 1
              bumpProgress(specimen, uploaded: uploaded, total: total)
          }
          if lostSegments > 0 {
              analytics.event("voice.audio_write_failed",
                              ["reason": "missing_local", "count": String(lostSegments)])
          }
  ```
  Change the function's return type from `String?` to `[String]` and return `voicePaths`.

- [ ] **9.3 Upgrade the payload paths.** At the call site that today does
  `if let uploadedVoicePath { payload.voice?.audioPath = uploadedVoicePath }`, replace with:
  ```swift
          if !uploadedVoicePaths.isEmpty {
              payload.voice?.audioPath = uploadedVoicePaths.first
              payload.voice?.audioSegments = uploadedVoicePaths
          }
  ```

- [ ] **9.4 Build and run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **9.5 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): upload every voice-audio segment, and never block on one

uploadMedia handled one voice file because a note could only ever have one. An
interrupted note now carries an ordered segment array; each uploads to the
same capture-media folder with upsert-idempotent replay and stamps a durable
remote path so it stops being required-local. A segment whose local file has
gone missing is DROPPED rather than thrown - CaptureMediaAvailabilityError is
not a LocalSyncError, so throwing was a hard failure that would have stuck a
note today's code commits transcript-only. payload voice.audioPath keeps
segment 0 so 00235's reader is unchanged, and mimeType delegates to
CaptureKit's CaptureMediaMime so the bucket drift guard covers it."
  ```

---

### Task 10 — The W1 routing migration

> ⚠ **Blocked on ruling FC-R18.** `commit_field_capture` has two live authors this week: Phase 3's
> branch-authored `00516` does `CREATE OR REPLACE` from 00235's body plus an
> `enqueue_capture_enrichment(...)` call. **Whichever lands second silently reverts the other** — no
> error, no failed migration. Under FC-R18(a) this migration is authored from **00516's** body and
> names 00516 a hard prerequisite; under (b) the routing fix folds into 00516 and **this task does
> not exist**. Do not start until Kody rules.

- **Precondition (2026-08-24).** Un-startable until FC-R18 is ruled **and** `00516`'s fixed
  `commit_field_capture` is merged to main (the Phase 3 lane pings at merge); the replacement is
  authored from that merged body; any enrichment enqueue uses
  `enqueue_capture_enrichment_for_producer(...)`.

- [ ] **10.1 Re-check the live ledger and every author before writing a byte** (constraints C6, C12):
  ```bash
  cd /Users/kody/Code/patina-merged
  supabase migration list
  ls supabase/migrations/*.sql | tail -4
  git log --all --oneline -- 'supabase/migrations/0053*.sql'
  grep -rl 'commit_field_capture' supabase/migrations
  git worktree list
  ```
  Expected: the highest applied version on Strata is confirmed; no `0053*` file exists on any ref;
  `commit_field_capture` is authored by `00233`/`00235` on `main` **plus Phase 3's `00516` in a
  sibling worktree** and nothing else. **Draw `NN` from 00530–00535 now**, at landing — and if
  anything has moved into the band, re-census and update the reservations doc in the same commit.

- [ ] **10.2 Write the failing SQL test.** Create
  `supabase/tests/field/field_capture_note_routing_test.sql`:
  ```sql
  -- ═══════════════════════════════════════════════════════════════════════════
  -- commit_field_capture inbox-branch routing + the note/audio lane
  -- (the W1 routing migration — 005NN_field_capture_notes_and_routing.sql)
  --
  -- 1. INBOX ROUTING       → project_id / project_room_id persist on the inbox
  --                          path. Before this migration only the library branch
  --                          wrote them (00235:205-217 vs :255-264), so every
  --                          note-shaped capture arrived with no project.
  -- 2. AUDIO SEGMENTS      → voice.audioSegments round-trips.
  -- 3. CAPTURE KIND        → payload captureKind lands, defaulting to specimen.
  -- 4. IDEMPOTENCY         → a second commit with the same client_capture_id is
  --                          a no-op that does not clear routing.
  -- 5. SAFE HARBOR         → a project the caller does not own does NOT abort the
  --                          RPC. 00235:85-88 documents the routing deferral as
  --                          DELIBERATE ("so a bad route can be safe-harbored
  --                          instead of hard-failing the whole sync") and wraps
  --                          the library branch in EXCEPTION WHEN OTHERS. The
  --                          inbox branch now carries the same harbor: the row
  --                          parks at status='inbox' with routing untouched and
  --                          the conflict stashed in raw_payload. An unwrapped
  --                          RAISE would surface on the device as a plain Error,
  --                          not a LocalSyncError, so runAttempt's catch would
  --                          reach recordFailure → .retryableFailure and retry
  --                          on EVERY drain forever.
  -- 6. ROUTING CLEAR       → payload {routing:{clear:true}} un-places a capture.
  --                          COALESCE alone cannot tell "not supplied" from
  --                          "explicitly cleared", and a defaulted 8th argument
  --                          would create a SECOND OVERLOAD that makes every
  --                          existing 7-argument call ambiguous.
  -- 7. POLICY SHAPE        → all five field_captures policies are TO authenticated.
  --                          ⚠ The count is 5 TODAY (00233:155/159/163/168/175).
  --                          FC-R8 ruling per-studio would add a sixth; this
  --                          assertion is meant to fail loudly if it does.
  --
  -- How to run:
  --   scripts/run-sql-tests.sh -f field_capture_note_routing
  -- and, for the wave report, the FULL suite as well — it exits 0 with the 22
  -- documented known failures in supabase/tests/KNOWN_FAILURES.md, so a new
  -- unexpected failure is a real regression.
  --
  -- ⚠ The runner connects as `postgres` (superuser, run-sql-tests.sh:92), so the
  -- auth.uid()-shaped cases below exercise the RPC's LOGIC with RLS BYPASSED.
  -- apply_field_effect_test.sql:25-27 documents the same caveat. Nothing here
  -- proves RLS; do not report it as such.
  --
  -- Transaction-wrapped + ROLLBACK. commit_field_capture is SECURITY INVOKER and
  -- reads auth.uid(), so every call sets request.jwt.claims first.
  -- ═══════════════════════════════════════════════════════════════════════════

  BEGIN;

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
  VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  INSERT INTO profiles (id, email, full_name, created_at, updated_at)
  VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', 'FC Designer', NOW(), NOW()),
         ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    'FC Other',    NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO projects (id, name, designer_id, created_by)
  VALUES ('fc000000-0000-4000-8000-0000000000a1', 'FC Maple St', 'fc000000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000001'),
         ('fc000000-0000-4000-8000-0000000000a2', 'FC Not Mine', 'fc000000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000002');

  -- ⚠ 'd1', not 'r1': `r` is not a hex digit and the uuid cast fails before the
  --   first assertion runs.
  INSERT INTO project_rooms (id, project_id, name)
  VALUES ('fc000000-0000-4000-8000-0000000000d1', 'fc000000-0000-4000-8000-0000000000a1', 'Living');

  DO $$
  DECLARE
    v_res       JSONB;
    v_project   UUID;
    v_room      UUID;
    v_segments  JSONB;
    v_kind      TEXT;
    v_status    TEXT;
    v_conflict  JSONB;
    v_count     INTEGER;
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', 'fc000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

    -- 1 + 2 + 3 -------------------------------------------------------------
    v_res := public.commit_field_capture(
      'fc000000-0000-4000-8000-0000000000c1',
      'inbox',
      jsonb_build_object(
        'captureKind', 'note',
        'voice', jsonb_build_object(
          'audioPath',        'fc/ct/voice-a-000.m4a',
          'audioSegments',    jsonb_build_array('fc/ct/voice-a-000.m4a', 'fc/ct/voice-a-001.m4a'),
          'transcriptSource', 'device',
          'transcript',       'the alcove reads about forty-two and three quarters')),
      'fc000000-0000-4000-8000-0000000000a1',
      'fc000000-0000-4000-8000-0000000000d1');

    SELECT project_id, project_room_id, voice_audio_segments, capture_kind, status
      INTO v_project, v_room, v_segments, v_kind, v_status
      FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';

    ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
      'FAIL 1a: inbox branch must persist project_id, got ' || COALESCE(v_project::text, 'NULL');
    ASSERT v_room = 'fc000000-0000-4000-8000-0000000000d1',
      'FAIL 1b: inbox branch must persist project_room_id, got ' || COALESCE(v_room::text, 'NULL');
    ASSERT v_status = 'inbox', 'FAIL 1c: status should be inbox, got ' || v_status;
    ASSERT jsonb_array_length(v_segments) = 2,
      'FAIL 2: voice_audio_segments should carry 2 entries, got ' || COALESCE(v_segments::text, 'NULL');
    ASSERT v_kind = 'note', 'FAIL 3: capture_kind should be note, got ' || v_kind;
    RAISE NOTICE 'field_capture routing: cases 1-3 passed.';

    -- 4 ---------------------------------------------------------------------
    v_res := public.commit_field_capture(
      'fc000000-0000-4000-8000-0000000000c1', 'inbox', '{}'::jsonb);
    SELECT project_id INTO v_project
      FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
    ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
      'FAIL 4: a re-commit with no routing must not clear the stored routing';
    RAISE NOTICE 'field_capture routing: case 4 passed.';

    -- 5 — SAFE HARBOR, not a raise -------------------------------------------
    v_res := public.commit_field_capture(
      'fc000000-0000-4000-8000-0000000000c2', 'inbox', '{}'::jsonb,
      'fc000000-0000-4000-8000-0000000000a2');
    SELECT status, project_id, raw_payload -> 'conflict'
      INTO v_status, v_project, v_conflict
      FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c2';
    ASSERT v_status = 'inbox',
      'FAIL 5a: a bad route must safe-harbor to inbox, not abort the RPC; got ' || COALESCE(v_status, 'NULL');
    ASSERT v_project IS NULL,
      'FAIL 5b: a refused route must leave project_id NULL, got ' || COALESCE(v_project::text, 'NULL');
    ASSERT v_conflict IS NOT NULL,
      'FAIL 5c: the refused route must be stashed in raw_payload.conflict so she can re-route by hand';
    RAISE NOTICE 'field_capture routing: case 5 passed (safe harbor).';

    -- 6 — explicit un-placing ------------------------------------------------
    v_res := public.commit_field_capture(
      'fc000000-0000-4000-8000-0000000000c1', 'inbox',
      jsonb_build_object('routing', jsonb_build_object('clear', true)));
    SELECT project_id, project_room_id INTO v_project, v_room
      FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
    ASSERT v_project IS NULL AND v_room IS NULL,
      'FAIL 6: {routing:{clear:true}} must un-place a capture from the device';
    RAISE NOTICE 'field_capture routing: case 6 passed.';

    -- 7 ---------------------------------------------------------------------
    SELECT count(*) INTO v_count FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'field_captures'
       AND roles = '{authenticated}';
    ASSERT v_count = 5,
      'FAIL 7: all five field_captures policies must be TO authenticated, got ' || v_count
      || ' (if FC-R8 ruled per-studio and added a sixth, update this count deliberately)';
    RAISE NOTICE 'field_capture routing: case 7 passed.';

    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE NOTICE 'All field_capture note-routing assertions passed.';
  END
  $$;

  ROLLBACK;
  ```

- [ ] **10.3 Run it and watch it fail.**
  ```bash
  cd /Users/kody/Code/patina-merged
  scripts/run-sql-tests.sh -f field_capture_note_routing
  ```
  Expected failure: `ERROR: column "voice_audio_segments" does not exist` (and, once that is added,
  `FAIL 1a: inbox branch must persist project_id, got NULL`).

- [ ] **10.4 Write the migration.** Create
  `supabase/migrations/005NN_field_capture_notes_and_routing.sql` (`NN` from 10.1) with:
  - a header naming **00516 as a hard prerequisite** and the lineage **00235 → 00516 → 005NN**;
  - the `ALTER TABLE` from spec §9.2(a) — **named** CHECK constraints, `audio_retention` defaulted
    to **`'keep'`** (not `'90_days'`: nothing purges anything until wave 6A, and a default asserting
    an unimplemented retention policy is the exact unverifiable claim §15 forbids), and **no**
    `voice_audio_sha256` and **no** `transcript_edited_at` (no wave-1 producer, no wave-1 reader —
    both land with 6A);
  - the provenance GIN index;
  - the five `DROP POLICY` / `CREATE POLICY … TO authenticated` restatements with **byte-identical
    predicates** to `00233:155-188`;
  - a `CREATE OR REPLACE FUNCTION public.commit_field_capture(...)` **copied from 00516's body**
    (FC-R18) — preserving its `enqueue_capture_enrichment(...)` call — with exactly two edits.

  **Edit one — the inbox branch, with its own safe harbor:**
  ```sql
    IF p_destination = 'inbox' THEN
      BEGIN
        UPDATE field_captures
           SET status          = 'inbox',
               project_id      = CASE WHEN v_clear_routing THEN NULL
                                      ELSE COALESCE(p_project_id, project_id) END,
               project_room_id = CASE WHEN v_clear_routing THEN NULL
                                      ELSE COALESCE(p_project_room_id, project_room_id) END,
               shelf           = CASE WHEN v_clear_routing THEN NULL
                                      ELSE COALESCE(p_shelf, shelf) END
         WHERE id = v_capture.id
        RETURNING * INTO v_capture;
      EXCEPTION WHEN OTHERS THEN
        -- Byte-for-byte the shape of 00235:278-291. 00235:85-88 records the
        -- routing deferral as deliberate precisely so a bad route can be
        -- safe-harbored instead of hard-failing the whole sync; the inbox
        -- branch must not turn that into an abort.
        UPDATE field_captures
           SET status      = 'inbox',
               raw_payload = COALESCE(raw_payload, '{}'::jsonb)
                             || jsonb_build_object('conflict', jsonb_build_object(
                                  'error', SQLERRM, 'sqlstate', SQLSTATE, 'at', NOW(),
                                  'attempted_project_id', p_project_id))
         WHERE id = v_capture.id
        RETURNING * INTO v_capture;
      END;
  ```

  **Edit two — five payload reads**, in the INSERT column list and the matching
  `ON CONFLICT DO UPDATE SET` lines, beside the existing `voice_*` lines at `00235:168-171`:
  ```sql
    v_clear_routing := COALESCE((v_payload #>> '{routing,clear}')::boolean, false);
    -- voice_audio_segments = COALESCE(v_payload #> '{voice,audioSegments}', '[]'::jsonb)
    -- capture_kind         = COALESCE(NULLIF(v_payload #>> '{captureKind}', ''), 'specimen')
    -- transcript_source    = v_payload #>> '{voice,transcriptSource}'
    -- note_setting         = v_payload #>> '{voice,noteSetting}'
  ```

  Close with the ACL restatement:
  ```sql
  REVOKE ALL ON FUNCTION public.commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID)
    FROM PUBLIC, anon, service_role;
  GRANT EXECUTE ON FUNCTION public.commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID)
    TO authenticated;
  ```
  ⚠ **Why the restatement, honestly.** `CREATE OR REPLACE` **preserves** the existing ACL — Postgres
  applies default privileges only at *creation* — and `commit_field_capture` already carries
  `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated` (`00235:303-304`). C7's
  default-privilege trap is real for **new** routines and does not apply here. Restate it belt-and-
  braces, matching the fuller canonical idiom (`00437:516-529`, `00413:2603-2605`) so the ACL
  conformance gate recognises the shape — but do not write "required by C7" in the header.

- [ ] **10.5 Replay locally and re-run the test.**
  ```bash
  cd /Users/kody/Code/patina-merged
  pnpm supabase:reset
  scripts/run-sql-tests.sh -f field_capture_note_routing
  ```
  Expected: seven `NOTICE` lines ending `All field_capture note-routing assertions passed.` and
  `ROLLBACK`.
  ⚠ **Confirm `NEXT_PUBLIC_SUPABASE_URL` points at localhost before `supabase:reset`** —
  `apps/*/.env.local` has pointed at Strata **prod** before.

- [ ] **10.6 Run the full suite too** (C8 — the "71/108 red" figure is stale and must not be quoted):
  ```bash
  cd /Users/kody/Code/patina-merged && scripts/run-sql-tests.sh
  ```
  Expected: **exit 0**, with `expected-fail: 22` and `unexpected-fail: 0` across 122 files. Any
  unexpected failure is a real regression introduced by this migration.

- [ ] **10.7 Regenerate types.**
  ```bash
  cd /Users/kody/Code/patina-merged
  SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --filter @patina/supabase run generate
  pnpm type-check
  ```
  ⚠ The script is **`generate`**, not `generate:types`, and it requires `$SUPABASE_DB_URL`
  (`packages/supabase/package.json:15`). Expected: `field_captures` gains the six new columns in
  `packages/supabase/src/database.types.ts`; type-check green.

- [ ] **10.8 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add supabase/migrations/005NN_field_capture_notes_and_routing.sql \
          supabase/tests/field/field_capture_note_routing_test.sql \
          packages/supabase/src/database.types.ts \
          docs/engineering/migration-number-reservations.md
  git commit -m "feat(db): persist routing on commit_field_capture's inbox branch

The inbox branch set only status, so every note-shaped capture reached the
server with no project column while only the library branch wrote routing. The
new branch carries its own EXCEPTION WHEN OTHERS safe harbor, because
00235:85-88 records the deferral as deliberate: a bad route parks the row at
inbox with the conflict stashed in raw_payload instead of aborting the RPC,
which on the device would surface as a plain Error and retry on every drain
forever. A {routing:{clear:true}} payload key un-places a capture, since
COALESCE cannot tell 'not supplied' from 'explicitly cleared' and a defaulted
8th argument would create an ambiguous second overload.

Also adds the note/audio lane (capture_kind, voice_audio_segments,
audio_retention defaulted to 'keep' until a purge exists, transcript_source,
note_setting, voice_audio_purged_at), the provenance GIN index carried unbuilt
since R112/R113, and restates all five 00233 policies TO authenticated (they
defaulted to PUBLIC). No new status value: the org-inbox policy keys on
status='inbox', so a terminal status would silently revoke studio read.

Authored from 00516's body, not 00235's: Phase 3's branch-authored 00516
replaces the same function, and whichever landed second would have silently
reverted the other. 00516 is a hard prerequisite. Lineage: 00235 -> 00516 ->
this migration. The address is drawn from the reserved 00530-00535 band."
  ```

---

### Task 11 — A placement line on the C3 card, and an S1 that can end

> ⚠ **The card line alone makes the flow *worse*.** S1's single primary is *"Choose destination"* →
> `advance()` = `persistRouting(); coordinator.present(.destination(specimen.id))`
> (`S1AssignVenueScreen.swift:100-107`, `:359-362`), so routing persists **only** on the path deeper
> into S3 → S4/S5, which *commits* the capture; and `onClose` dismisses **without** calling
> `persistRouting()` (`:78`), so ✕ throws away the project she just picked. `.assignVenue` and
> `.destination` are both `CaptureSheet` cases over one root `.sheet(item:)`, so S3 *replaces* S1 and
> nothing returns to the card, which is one-shot anyway (`ViewfinderModel.swift:281-284`). End to end
> that is **5–6 taps**. Wave 1's acceptance criterion 6 cannot pass without 11.4.

- [ ] **11.1 Confirm the card cannot reach a project picker today.**
  ```bash
  cd /Users/kody/Code/patina-merged
  grep -rn "present(.assignVenue" apps/mobile/Capture --include="*.swift"
  ```
  Expected: exactly three hits — `CaptureDeepLink.swift:96`, `S2CreateProjectScreen.swift:172`,
  `V1SessionTrayScreen.swift:126`. **None of them is C3 or C5.**

- [ ] **11.2 Add the row to the card.** In
  `apps/mobile/Capture/Capture/Features/Capture/CaptureCardOverlay.swift`, add a parameter
  `let onPlace: () -> Void` beside the existing closures, and insert between the guess rows and the
  action row:
  ```swift
              Button(action: onPlace) {
                  HStack(spacing: 6) {
                      Text(placementLabel)
                          .font(CaptureType.footnote)
                          .foregroundStyle(specimen.venue?.projectId == nil
                                           ? CaptureColor.terracotta : CaptureColor.ink)
                      Image(systemName: "chevron.down")
                          .font(CaptureType.monoSmall)
                          .foregroundStyle(CaptureColor.line2)
                      Spacer()
                  }
                  .contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("card.placement")
  ```
  ⚠ **`CaptureType.caption` does not exist.** The enum is exactly `display, title, title2, body,
  bodyEmph, callout, footnote, eyebrow, monoSmall, monoBody` (`CaptureType.swift:22-35`); `.caption`
  will not compile. `.monoSmall` (12 pt mono) is the right weight for a chevron.

  And the label, honest in both states:
  ```swift
      private var placementLabel: String {
          guard let venue = specimen.venue, let name = venue.projectName, !name.isEmpty else {
              return "Not placed — tap to place"
          }
          guard let room = venue.room, !room.isEmpty else { return name }
          return "\(name) · \(room)"
      }
  ```

- [ ] **11.3 Wire it.** In `apps/mobile/Capture/Capture/Features/Capture/ViewfinderScreen.swift`,
  pass `onPlace: { model.placeFromCard() }` to `CaptureCardOverlay`, and add to
  `ViewfinderModel.swift`:
  ```swift
      /// The C3 card's one tap to the only project picker in the app. S1 is
      /// reachable from three places today and none of them is the capture path,
      /// so a capture taken from the shutter could never inherit a project.
      func placeFromCard() {
          guard let id = cardSpecimen?.id else { return }
          analytics.event("capture.place_tapped", ["surface": "c3"])
          coordinator.present(.assignVenue(id))
      }
  ```

- [ ] **11.4 Give S1 a persist-and-return primary.** In
  `apps/mobile/Capture/Capture/Features/Route/S1AssignVenueScreen.swift`, add a presentation source
  so the sheet knows it came from the capture path, and beside the existing
  `RouteActionButton("Choose destination")` (`:100-107`) add, **when the source is the card**:
  ```swift
              RouteActionButton("Done", systemImage: "checkmark", kind: .primary) {
                  persistRouting()
                  coordinator.dismissSheet()
              }
  ```
  and make ✕ honest at `:78` — either persist, or say plainly that the placement was not kept:
  ```swift
              onClose: {
                  // ✕ used to drop the project she had just picked, silently.
                  persistRouting()
                  coordinator.dismissSheet()
              }
  ```
  With that, the honest count from the shutter is **placement line → project → room → Done = 3 taps**,
  returning to the camera — not five or six ending on a terminal screen.

- [ ] **11.5 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **11.6 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Features/Capture/CaptureCardOverlay.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderScreen.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
          apps/mobile/Capture/Capture/Features/Route/S1AssignVenueScreen.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): put a placement line on the card, and let S1 end there

S1 is the only screen that can set a project or an FF&E room, and its three
presenters are the deep-link harness, S2 and the session tray - the capture
path could not reach it at all. The card now says where the capture is going,
in terracotta when it is going nowhere, and one tap opens the picker.

S1 also gains a Done primary that persists and returns: its only primary was
'Choose destination', which persisted routing solely on the path deeper into
S3 and committed the capture, and its close button dismissed without
persisting at all - so the affordance would have cost more taps than today and
thrown the placement away on a cancel. With the routing-memory fix, the rest
of the session inherits both fields."
  ```

---

### Task 12 — "Route all N" tells the truth

> ⚠ This task deliberately does **not** wire `sync.routeAll`. Bulk-placing a whole tray to one
> project is a different, unasked-for act; `sync.routeAll` keeps its one real caller,
> `V2CullDeckScreen.swift:238` (bulk cull-to-inbox). Spec §7.8 says the same, and the wave report
> must not read as if bulk routing shipped.

- [ ] **12.1 Confirm the contract already exists and is tested.**
  ```bash
  cd /Users/kody/Code/patina-merged
  grep -rn "func routeAll" apps/mobile/Capture/CaptureKit
  grep -rn "routeAll" apps/mobile/Capture/CaptureTests apps/mobile/Capture/Capture
  ```
  Expected: the service method exists in CaptureKit (`CaptureSyncService.swift:114`),
  `CaptureLifecycleTests.swift:557` covers the per-record route contract, and the only UI caller is
  `V2CullDeckScreen.swift:238`.

- [ ] **12.2 Make the footer honest.** In
  `apps/mobile/Capture/Capture/Features/Session/V1SessionTrayScreen.swift`, replace
  ```swift
              RouteActionButton("Route all \(items.count)", systemImage: "arrow.up.forward", kind: .primary) {
                  if let first = items.first { coordinator.present(.assignVenue(first.id)) }
              }
  ```
  with
  ```swift
              // "Route all N" presented the picker for exactly ONE record. Until the
              // visit spine lands, say what the button actually does: it places the
              // next unplaced capture, one at a time.
              RouteActionButton(placeButtonTitle, systemImage: "arrow.up.forward", kind: .primary) {
                  if let next = items.first(where: { $0.venue?.projectId == nil }) ?? items.first {
                      coordinator.present(.assignVenue(next.id))
                  }
              }
  ```
  and add:
  ```swift
      private var placeButtonTitle: String {
          let unplaced = items.filter { $0.venue?.projectId == nil }.count
          return unplaced > 0 ? "Place \(unplaced)" : "Review placement"
      }
  ```

- [ ] **12.3 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **12.4 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Features/Session/V1SessionTrayScreen.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "fix(ios): stop promising bulk routing the tray never did

The footer read 'Route all N' and presented the picker for items.first only.
The button now names the real act - 'Place N' - and walks the unplaced records
one at a time. sync.routeAll is deliberately NOT wired here: bulk-placing a
tray to one project is a different act nobody asked for, and routeAll keeps
its one real caller in the cull deck."
  ```

---

### Task 13 — Tell her she is offline, and drain when she is not

- [ ] **13.1 Confirm both gaps.**
  ```bash
  cd /Users/kody/Code/patina-merged
  grep -rn "NWPathMonitor" apps/mobile/Capture --include="*.swift"
  grep -rn "OfflineQueueBanner" apps/mobile/Capture --include="*.swift"
  ```
  Expected: zero `NWPathMonitor` hits anywhere; `OfflineQueueBanner` referenced **only** inside its
  own `#Preview` (`OfflineQueueBanner.swift:83-84`).

- [ ] **13.2 Add the monitor.** New file
  `apps/mobile/Capture/Capture/Services/Resilience/FieldReachability.swift`:
  ```swift
  //  FieldReachability.swift
  //  Capture
  //
  //  The outbox was already excellent and completely invisible: nothing on the
  //  camera surface said she was offline, and regained connectivity never
  //  triggered a drain — drains fired only on enqueue, on launch reconciliation,
  //  and on a manual "Retry all". One monitor closes both.

  import Foundation
  import Network

  @MainActor
  @Observable
  public final class FieldReachability {
      public private(set) var isOnline = true
      private let monitor = NWPathMonitor()
      private let queue = DispatchQueue(label: "cloud.patina.field.reachability")
      private var onRestore: (() -> Void)?

      public init() {}

      public func start(onRestore: @escaping () -> Void) {
          self.onRestore = onRestore
          monitor.pathUpdateHandler = { [weak self] path in
              Task { @MainActor in
                  guard let self else { return }
                  let online = path.status == .satisfied
                  let restored = online && !self.isOnline
                  self.isOnline = online
                  if restored { self.onRestore?() }
              }
          }
          monitor.start(queue: queue)
      }

      deinit { monitor.cancel() }
  }
  ```

- [ ] **13.3 Render the banner with the *outbox* depth, and wire the drain.** In
  `apps/mobile/Capture/Capture/Features/Capture/ViewfinderScreen.swift`, hold a
  `@State private var reachability = FieldReachability()`, render
  ```swift
              if !reachability.isOnline {
                  OfflineQueueBanner(queuedCount: model.outboxDepth)
                      .transition(.move(edge: .top).combined(with: .opacity))
              }
  ```
  directly beneath the top bar, and in `.task`:
  ```swift
              reachability.start {
                  Task { @MainActor in
                      await model.drainOnReconnect()
                  }
              }
  ```
  Add to `ViewfinderModel.swift`:
  ```swift
      /// The banner's copy is "No signal · saving on device" with queuedCount
      /// presented as QUEUED, so it must be the outbox depth — the same source
      /// LocalCaptureSyncService feeds to CaptureSyncAttributes.queued — not
      /// sessionCount, which counts specimens in the current visit (:47, :133-137).
      /// A designer with 12 already-synced captures and nothing queued must not
      /// be told "12 queued".
      var outboxDepth: Int {
          guard let owner = activeOwner else { return store.outbox().count }
          return store.outbox(owner: owner).count
      }

      /// Regained connectivity never auto-drained before this; a day's captures
      /// could sit in the outbox until she happened to open the tray.
      func drainOnReconnect() async {
          analytics.event("sync.reconnect_drain")
          await sync.drain()
      }
  ```
  ⚠ `try? await sync.drain()` would emit *"no calls to throwing functions occur within 'try'"* —
  `CaptureSyncService.drain()` is `func drain() async` (`:36`), non-throwing — and this wave's gate
  asks for `swiftlint --strict`.
  `OfflineQueueBanner`'s initializer is `(queuedCount:venueLabel:onTap:)` with the last two
  defaulted (`:13-18`).

- [ ] **13.4 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **13.5 Verify on a device** (signed Debug build per C5): airplane mode → the banner appears
  within a second **showing the outbox depth**; take a photo and a note; leave airplane mode → the
  queue drains with no tap and the banner disappears.

- [ ] **13.6 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Services/Resilience/FieldReachability.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderScreen.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): render the offline banner and drain on reconnect

OfflineQueueBanner was preview-only dead code and there was no NWPathMonitor
anywhere in the app, so nothing told her she was queuing and regained signal
never drained the outbox. One monitor renders the banner on C1 and calls
sync.drain() on the offline-to-online transition. The count is the OUTBOX
depth, not the session count - the banner's own copy presents it as 'queued',
and a designer with a dozen already-synced captures must not be told they are
waiting."
  ```

---

### Task 14 — The honesty repair on the scan-context screen

- [ ] **14.1 Read the gate that discards a note.**
  ```bash
  cd /Users/kody/Code/patina-merged
  sed -n '117,145p' apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift
  ```
  Expected: a local `let transcript = result.transcript.isEmpty ? self.partialTranscript :
  result.transcript` (`:128`), a guard of the shape `!transcript.isEmpty || result.audioFilename !=
  nil` (`:129`) with a *"Nothing recorded"* toast on the else branch, and — **unconditionally** at
  `:141` — `self.toast = "Voice note added to Inbox"`.

- [ ] **14.2 Make the gate about the audio, and set the toast exactly once.** Replace the guard, the
  else branch and the trailing toast with:
  ```swift
          // The audio is the record. A note that transcribes to nothing on a noisy
          // site used to be discarded with "Nothing recorded" — she spoke and
          // nothing was kept. Keep anything we actually captured, and say plainly
          // when the words did not come through.
          //
          // `transcript` is the LOCAL above, which already falls back to
          // partialTranscript — key the copy off the same local the guard uses, or
          // the two disagree about what "has text" means.
          let hasAudio = !result.audioSegments.isEmpty
          guard !transcript.isEmpty || hasAudio else {
              self.toast = "Nothing was recorded — try holding the mic a moment longer."
              return
          }
          // Held in a local and assigned ONCE at the end: the shipped code set the
          // success toast unconditionally two lines later, so an honest failure
          // message set earlier never rendered at all.
          let message = transcript.isEmpty
              ? "We couldn't make out the words — the audio is here."
              : "Note saved to this room."
  ```
  and, at the former `:141`:
  ```swift
              self.toast = message
  ```
  ⚠ The old string *"Voice note added to Inbox"* is also one of §17.3's ten `Inbox` strings. Reword
  the photo toast at `:86` in the same commit: *"Photo added to Inbox"* → **"Photo saved to this
  room."**

- [ ] **14.3 Reword the three ESCALATE strings** at `:261`, `:264`, `:267`, to the wave-1-safe text
  the spec settles at §7.11. Two earlier proposals are withdrawn: *"…go to Maple St · Living"* cannot
  ship in wave 1 (there is no visit to name) and *"stay with this scan session"* is **untrue** —
  `:135-142` enqueues these through the outbox to `field_captures`, pinned to the scan by provenance
  and readable in the Room File.
  ⚠ **Preserve the shipped `.font` / `.foregroundStyle` chains** — the live block chains
  `CaptureType.eyebrow` / `.title2` / `.footnote` and three `CaptureColor` tokens at `:261-269`, and
  a literal replacement of the bare `Text(...)` lines would silently drop the styling. Change only
  the string literals:
  ```swift
                  Text("This iPhone can't measure a room.")
                      .font(CaptureType.eyebrow)      // …existing modifiers unchanged
                  Text("Photos & notes for this room.")
                      .font(CaptureType.title2)       // …existing modifiers unchanged
                  Text("These reach the studio as soon as you have signal — they're notes, not a scan.")
                      .font(CaptureType.footnote)     // …existing modifiers unchanged
  ```

- [ ] **14.4 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **14.5 Verify on a device** (signed Debug build per C5): hold the mic in a loud room so
  recognition returns nothing; confirm the capture commits, the audio file exists, and the copy reads
  *"We couldn't make out the words — the audio is here."* — **and is still on screen**, not
  overwritten a moment later.

- [ ] **14.6 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "fix(ios): stop discarding a voice note that fails to transcribe

stopVoice gated on '!transcript.isEmpty || audioFilename != nil' while
audioFilename was permanently nil, so a note that transcribed to nothing on a
noisy site was thrown away with the toast 'Nothing recorded'. With the audio
writer landed the gate is about the recording, and the copy says what actually
happened - held in a local and assigned once, because the success toast used
to overwrite it unconditionally two lines later. Also retires the three
placeholder strings that named an Inbox, and the two 'added to Inbox' toasts
on the same screen."
  ```

---

### Task 15 — The N4 honesty repair, and something she can play back

> ⚠ **Without this, wave 1's headline defect is fixed only inside a LiDAR scan session.** The repair
> in Task 14 lives on `SiteScanContextModel.stopVoice`, reachable only from the F2 in-scan overlay
> and the non-Pro reference screen. **N4 — the specimen voice sheet, where most voice notes are
> actually taken — fails differently and Task 8 edits that very file without touching it**:
> *"Attach note"* is `primaryEnabled: !transcript.isEmpty && !isRecording`
> (`VoiceNoteSheet.swift:62-69`), so a note with audio and no words **cannot be kept at all**, and
> `discard()` (`:194-199`) dismisses without writing the specimen and leaves the `.m4a` orphaned.
> And *"the audio is here"* is not checkable by anyone:
> `grep -rn "AVAudioPlayer\|AVPlayer" apps/mobile/Capture --include="*.swift"` returns **zero hits**.

- [ ] **15.1 Enable the primary on audio, and label it honestly.** In
  `apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift`, replace the
  `RecognitionActionBar` configuration at `:62-69`:
  ```swift
              RecognitionActionBar(
                  secondaryTitle: "Discard",
                  primaryTitle: (result?.transcript.isEmpty ?? true) && hasAudio
                      ? "Keep the recording"
                      : "Attach note",
                  primaryEnabled: (!transcript.isEmpty || hasAudio) && !isRecording,
                  secondaryRole: .destructive,
                  onSecondary: { discard() },
                  onPrimary: { attach() }
              )
  ```
  with
  ```swift
      private var hasAudio: Bool { !(result?.audioSegments.isEmpty ?? true) }
  ```
  and add the ladder line beneath the transcript card when `hasAudio && transcript.isEmpty`:
  ```swift
                  Text("We couldn't make out the words — the audio is here.")
                      .font(CaptureType.footnote)
                      .foregroundStyle(CaptureColor.inkSoft)
  ```

- [ ] **15.2 Delete the segments on Discard.** Replace `discard()` (`:194-199`):
  ```swift
      private func discard() {
          streamTask?.cancel()
          Task {
              // finish() is what returns the segment list; without awaiting it the
              // .m4a files stay on disk referenced by nothing, forever.
              let abandoned = isRecording ? await voice.finish() : result
              for name in abandoned?.audioSegments ?? [] {
                  try? FileManager.default.removeItem(at: store.mediaURL(for: name))
              }
              await MainActor.run { coordinator?.dismissSheet() }
          }
      }
  ```

- [ ] **15.3 Add playback.** New file
  `apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceSegmentPlayer.swift`:
  ```swift
  //  VoiceSegmentPlayer.swift
  //  Capture
  //
  //  "The audio is here" was, until this file, an assertion she could not check:
  //  there is no AVAudioPlayer or AVPlayer anywhere in Patina Field, and portal
  //  playback is wave 4 behind a fail-closed flag. The files are already in the
  //  App Group; this plays them back in order.

  import Foundation
  import AVFoundation

  @MainActor
  @Observable
  public final class VoiceSegmentPlayer: NSObject, AVAudioPlayerDelegate {
      public private(set) var isPlaying = false
      private var player: AVAudioPlayer?
      private var queue: [URL] = []

      public func play(_ urls: [URL]) {
          queue = urls
          isPlaying = true
          advance()
      }

      public func stop() {
          player?.stop()
          player = nil
          queue = []
          isPlaying = false
      }

      private func advance() {
          guard !queue.isEmpty else { isPlaying = false; return }
          let url = queue.removeFirst()
          do {
              try AVAudioSession.sharedInstance().setCategory(.playback)
              try AVAudioSession.sharedInstance().setActive(true)
              let next = try AVAudioPlayer(contentsOf: url)
              next.delegate = self
              player = next
              next.play()
          } catch {
              advance()   // a missing or unreadable segment is skipped, never fatal
          }
      }

      nonisolated public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer,
                                                          successfully flag: Bool) {
          Task { @MainActor in self.advance() }
      }
  }
  ```
  Render a play control on the N4 sheet and on the tray row (`V1SessionTrayScreen`) whenever a
  specimen carries `voiceAudioSegmentsRaw`, mapping each name through `store.mediaURL(for:)`.

- [ ] **15.4 Run the gate.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  ```
  Expected: `✔ build`, `✔ tests`.

- [ ] **15.5 Verify on a device** (device-pass step 6): **from N4**, in a loud room, record so
  recognition returns nothing → the primary is **enabled** and reads *"Keep the recording"*, the note
  commits with its audio, and the play control plays it back. Then record again and tap **Discard** →
  the segment files are gone from the App Group media directory.

- [ ] **15.6 Commit.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift \
          apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceSegmentPlayer.swift \
          apps/mobile/Capture/Capture/Features/Session/V1SessionTrayScreen.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "fix(ios): let N4 keep a wordless note, and let her hear it

The scan-context repair reached only notes taken inside a LiDAR scan session.
On N4 - where most voice notes are actually taken - 'Attach note' was disabled
whenever the transcript was empty, so a recording with no words could not be
kept at all and its .m4a was orphaned on disk by a Discard that wrote nothing.
The primary is now enabled whenever audio exists, reads 'Keep the recording',
carries the failure-ladder line, and Discard deletes the segments.

Adds the first audio playback in Patina Field - there was no AVAudioPlayer or
AVPlayer anywhere in the app - so 'the audio is here' is something she can
check rather than something the app asserts."
  ```

---

### Task 16 — What the phone does with its own media (FC-R19)

> ⚠ There is **no local media lifecycle at all** today: `grep -rn "removeItem" apps/mobile/Capture
> --include="*.swift"` finds deletions only in `SiteScanBundleHome.swift` (scan bundles).
> `uploadMedia` does not clear local files after a successful commit. At 240 KB/min a single
> 30-minute walk-through is ~7 MB, on top of photos that already accumulate. Wave 1 is the writer
> that creates the problem, so wave 1 carries the rule.

- [ ] **16.1 Delete a segment once its receipt lands.** In
  `apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift`, where
  `applyCommitResult` records the receipt and the transfer reaches
  `CaptureTransferPhase.complete`, remove the local files whose remote paths are stamped:
  ```swift
          // The receipt is the proof the server has the bytes. Until this landed,
          // every segment and every photo stayed on the phone forever.
          for name in (specimen.voiceAudioSegmentsRaw ?? []) {
              try? FileManager.default.removeItem(at: store.mediaURL(for: name))
          }
  ```
  ⚠ Only after the receipt, and only for segments that carry a remote path — Task 6.6's
  `missingRequiredMedia` exemption is what makes deleting them safe.

- [ ] **16.2 Add a size-capped sweep.** In `CaptureStore`, add a CaptureKit-side pure policy plus the
  sweep that reads it:
  ```swift
  // CaptureKit/CaptureKit/Persistence/MediaRetentionPolicy.swift  (NEW)
  public enum MediaRetentionPolicy {
      /// Above this, the sweep deletes oldest-first among files that are already
      /// receipted. Nothing un-receipted is ever deleted.
      public static let softCapBytes: Int64 = 512 * 1024 * 1024
      public static func overage(totalBytes: Int64) -> Int64 {
          max(0, totalBytes - softCapBytes)
      }
  }
  ```
  with `MediaRetentionPolicyTests` asserting the boundary in both directions.

- [ ] **16.3 Run the gate, then commit.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/CaptureKit/CaptureKit/Persistence/MediaRetentionPolicy.swift \
          apps/mobile/Capture/CaptureTests/MediaRetentionPolicyTests.swift \
          apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): give capture media a lifecycle on the phone

Nothing pruned the App Group: uploadMedia never cleared a local file after a
successful commit and the only removeItem in the app was for scan bundles, so
a 30-minute walk-through added ~7MB that stayed forever on top of accumulating
photos. Deletes a segment once its commit receipt lands - safe because an
uploaded segment is now exempt from missingRequiredMedia - and adds a
size-capped oldest-first sweep over receipted files only. FC-R19."
  ```

---

### Task 17 — Emit the wave-1 voice telemetry

> ⚠ **Nothing else in this wave emits a single `voice.*` event**, yet acceptance criterion 7 and
> Task 18.5 both ask PostHog for `voice.finish` carrying `segments` and `on_device`. Tasks 8 and 9
> already emit `voice.segment_rotated`, `voice.interrupted` and `voice.audio_write_failed` as part of
> their own control flow; this task adds the rest and makes the properties real.

- [ ] **17.1 Emit `voice.start` and `voice.finish`** from `SpeechVoiceNoteService`, at the top of
  `startLiveTranscription()` and in `finish()`:
  ```swift
      analytics.event("voice.start", ["surface": surface, "note_setting": "solo"])
  ```
  ```swift
      analytics.event("voice.finish", [
          "duration_s":       String(Int(duration)),
          "segments":         String(audioSegments.count),
          "transcript_chars": String(latestTranscript.count),
          // The RESOLVED value, stored in 8.3 — not recomputed here, and not the
          // recognizer's capability. This is the number that says whether the
          // shipped permission string ("Transcribes your voice notes on-device")
          // is telling the truth.
          "on_device":        String(onDeviceRecognition),
      ])
  ```
  `surface` is passed in at construction (`c3` / `c6` / `f2` / `n4`) so one taxonomy covers all four.

- [ ] **17.2 Emit `voice.empty_transcript`** — the honesty repair's own metric — wherever a note
  commits with no words, in **both** Task 14's and Task 15's paths:
  ```swift
      analytics.event("voice.empty_transcript", ["had_audio": String(hasAudio)])
  ```

- [ ] **17.3 Emit `capture.placed` / `capture.unplaced`.** In `ViewfinderModel` after
  `S1AssignVenueScreen` returns a persisted routing, and when a capture commits with
  `venue.projectId == nil`:
  ```swift
      analytics.event("capture.placed", ["basis": "manual",
                                         "has_room": String(venue.projectRoomId != nil)])
  ```
  ```swift
      analytics.event("capture.unplaced", [:])
  ```

- [ ] **17.4 Run the gate, then commit.**
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture && scripts/capture-gate.sh all
  cd /Users/kody/Code/patina-merged
  git add apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift \
          apps/mobile/Capture/Capture/Features/Capture/ViewfinderModel.swift \
          apps/mobile/Capture/Capture/Features/SiteScan/SiteScanContextCapture.swift \
          apps/mobile/Capture/Capture/Features/Recognition/Voice/VoiceNoteSheet.swift \
          apps/mobile/Capture/Capture.xcodeproj/project.pbxproj
  git commit -m "feat(ios): emit wave 1's voice and placement telemetry

The wave's own acceptance criterion asks PostHog for voice.finish with
segments and on_device, and no task emitted a single voice.* event. Adds
voice.start, voice.finish (duration_s, segments, transcript_chars, on_device
from the RESOLVED requiresOnDeviceRecognition value), voice.empty_transcript
on both repaired surfaces, and capture.placed / capture.unplaced - the
program's headline metric and the size of the roving hole."
  ```

---

### Task 18 — Wave gate, device pass, and the report

- [ ] **18.1 Full gate, lint included** (constraint C2 — `capture-gate.sh lint` exits 0 without
  swiftlint, so run it explicitly):
  ```bash
  cd /Users/kody/Code/patina-merged/apps/mobile/Capture
  scripts/capture-gate.sh all
  swiftlint lint --quiet --strict
  ```
  Expected: `✔ build`, `✔ tests`, and swiftlint silent (strict).

- [ ] **18.2 SQL — the standalone test *and* the full suite** (constraint C8):
  ```bash
  cd /Users/kody/Code/patina-merged
  scripts/run-sql-tests.sh -f field_capture_note_routing
  scripts/run-sql-tests.sh
  ```
  Expected: the standalone run prints seven `NOTICE` lines and exits 0; the full run exits **0** with
  `expected-fail: 22` and `unexpected-fail: 0` over 122 files.
  ⚠ Report **both**, and report neither as proof of RLS — the runner connects as `postgres`
  (superuser, `:92`), so `auth.uid()`-shaped assertions run with RLS bypassed.

- [ ] **18.3 Monorepo type-check** (the regenerated `database.types.ts` touches the portals):
  ```bash
  cd /Users/kody/Code/patina-merged && pnpm type-check
  ```
  Expected: green.

- [ ] **18.4 Run the eleven-step device pass** from §1's "Device pass" block on a physical LiDAR
  iPhone with a **signed Debug** build (C5 — never `capture-gate.sh build`). Record a pass/fail line
  per step with a screenshot or a log excerpt, then run §1's **post-walk verification** block from a
  terminal.

- [ ] **18.5 Confirm telemetry landed.** Re-run Task 2's PostHog query and additionally:
  ```sql
  SELECT event, count() FROM events
  WHERE timestamp > now() - INTERVAL 1 DAY
    AND properties.surface = 'field-ios'
    AND event IN ('voice.finish', 'capture.place_tapped', 'sync.reconnect_drain')
  GROUP BY event
  ```
  Expected: all three present, with `voice.finish` carrying `segments` and `on_device` — **from the
  installed build, not an Xcode scheme run**.

- [ ] **18.6 Push the branch and open the PR.**
  ```bash
  cd /Users/kody/Code/patina-merged
  git push -u origin feat/field-companion-w1
  gh pr create --title "feat(field): wave 1 — the note survives" \
    --body "$(cat <<'EOF'
## What

Field Companion wave 1, per `docs/design/field-companion/field-companion-plan.md` §8.

- Voice notes finally **keep their audio** (AAC-LC m4a from the existing engine tap at the tap's own
  channel count, 50 s recognizer rotation off the render thread against SFSpeechRecognizer's ~60 s
  cap, engine restart + segment N+1 on interruption, the 20-minute cap actually enforced,
  `requiresOnDeviceRecognition` set **and recorded**).
- A note that transcribes to nothing is **no longer silently discarded — on either voice surface**.
  N4 previously disabled "Attach note" outright for a wordless note; it now reads "Keep the
  recording".
- **She can play a recording back.** There was no `AVAudioPlayer` or `AVPlayer` anywhere in Patina
  Field.
- `commit_field_capture`'s **inbox branch now persists routing**, with its own safe harbor — before
  this, every note-shaped capture reached the server with no project column.
- `CaptureRoutingMemory.projectRoomID` **stops being write-only**, so a session inherits the room.
- The post-shutter card has a **placement line**, and S1 gained a **Done** primary that persists and
  returns — the capture path could not reach a project picker at all before, and S1 could not end
  anywhere but a terminal screen.
- The offline banner is rendered (with the **outbox** depth) and regained signal drains the outbox.
- Capture media finally has a **lifecycle on the phone** (FC-R19).
- Field emits PostHog events **for the first time** (0 rows in the prior 180 days), from a
  build-time key that survives a device install.

## Verification

- `scripts/capture-gate.sh all` green; `swiftlint --strict` run explicitly and green.
- `supabase/tests/field/field_capture_note_routing_test.sql` passes, **and** the full
  `scripts/run-sql-tests.sh` exits 0 with the 22 documented known failures in
  `supabase/tests/KNOWN_FAILURES.md` and 0 unexpected — so a new failure here would be a real
  regression. ⚠ The runner connects as `postgres`, so **nothing here proves RLS**.
- `pnpm type-check` green after regenerating `database.types.ts`.
- **Eleven-step device pass** on a physical iPhone (see the PR comment for the per-step log), plus
  the post-walk server-side check that all three placed captures carry `project_id` **and**
  `project_room_id`.

## What this wave does NOT do

Nothing in the portal changes. `packages/supabase/src/hooks/use-room-files.ts:385` is the only
`.from('field_captures')` in the web tree, it is scan-scoped, and it sits inside the fail-closed
`room-file` view — so after this wave **nothing she captured looks any different in the Document**.
Portal visibility begins in Wave 1P (§1.4) or wave 4.

## Rollback

The migration is additive plus one `CREATE OR REPLACE`; rollback re-applies **00516's**
`commit_field_capture` body verbatim (not 00235's — 00516 is a hard prerequisite) and leaves the new
columns unread. Old app builds keep committing — every new wire key is optional and every new column
is defaulted.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  ```

- [ ] **18.7 Write the wave report** into the PR body's first comment: the gate outputs, the
  eleven-step device pass table, the telemetry counts, and — plainly — which of Wave 1's **eleven**
  acceptance criteria are met and which are not. **Do not claim a criterion the device pass did not
  exercise**, and do not claim "RLS verified" from the SQL suite.

---

## Revision log

Applied 2026-08-24 against `research/40-review-repo-correctness.md` (RC-01…RC-54) and
`research/40-review-product-ux.md` (F1…F42, plus its rulings-review table). One line per finding.
`already-applied` = the earlier revision pass had landed it in at least one of the three files before
this pass began; `applied` = landed or completed in this pass.

### Band correction

**`00521–00526` → `00530–00535`, symbolic.** Every hard-coded `00521`…`00526` reference to *this
program's* migrations was removed from all three files (34 in the plan, 7 in the package, 1 in the
rulings) and replaced with FC-R17's symbolic names — *the W1 routing migration*, *the visit/suggestion
migration*, *the margin migration*, *the time-entry migration*, *the punch back-reference migration*,
plus wave 6A's *server-transcript migration* — and, where a file name is unavoidable (Task 1's
reservation rows, Task 10's migration, the PR body, six commit messages, the SQL test header), with
`005NN_<slug>.sql`, `NN` explained **once** (package §9.0) as *drawn from the reserved band
00530–00535 at landing*. The band is recorded as **confirmed 2026-08-24 by both concurrent lanes** —
cloudflare-phases Phase 2 stays ≤ `00529`, Phase 3 holds `00514–00520` — as a **symbolic reservation
only**, to be written into `docs/engineering/migration-number-reservations.md` and **re-confirmed
against the ledger file *and* `supabase migration list` on Strata immediately before each push**
(file-based push invariant, `docs/ops/strata-staging.md`). **Nothing is minted until Kody approves the
build.** FC-R17's recommended default remains *(a) repair the reservations doc first, then reserve*,
now with the note that the band is pre-agreed, which turns (a) from a negotiation into a doc edit.
Six numbers cover six *scheduled* migrations; **wave 6B's `field_note_drafts` migration draws its
number outside the band at its own landing**, because 6B is unscheduled.
Other lanes' real addresses are untouched: the svc-media `00521`, Phase 3's `00514`/`00515`/`00516`
and its `00517–00520` hold, `00510`, `00511–00513`, `00494–00502`, and the historical `00169`,
`00177`, `00196`, `00198`, `00205`, `00224`, `00233`, `00234`, `00235`, `00265`, `00274`, `00281`,
`00282`, `00297`, `00340`, `00375`, `00399`, `00413`, `00437`, `00466`.

### Contradiction sweep

- **"71/108 SQL tests red" — verified stale and removed as a claim.** Checked directly:
  `supabase/tests/KNOWN_FAILURES.md` states the `pg_temp` permission-denied family (55 files) **is
  fixed**, leaving 23 residuals of which one was closed by `00510` → **22**; `find supabase/tests
  -name '*.sql' | wc -l` = **122**; `scripts/run-sql-tests.sh` parses that file, treats listed files
  as expected-fail and **exits 0** when only they fail (`:34-35`, `:209`, `:251`). The figure had
  survived in four plan locations after the earlier pass — **P-8**, the SQL test file's own header
  comment, Task 15.2's *"never report the shared suite"*, and the **PR body's Verification block** —
  each of which used it to justify never reporting a suite result. All four now say the suite is a
  usable gate, run the standalone test **and** the full suite, and report both. The one surviving
  caveat is the true one: the runner connects as `postgres` (superuser, `:92`), so `auth.uid()`-shaped
  assertions run with **RLS bypassed** and no wave report may claim *"RLS verified"* from them.
- **`commit_field_capture`'s body.** The package and C12 said *author from 00516's body* (FC-R18)
  while plan Task 10.4 still said *"copied verbatim from 00235 with exactly two edits"*. Task 10 now
  authors from 00516's, names it a hard prerequisite, and records the lineage **00235 → 00516 → 005NN**
  in the migration header, the reservations-doc subsection and the commit message.
- **The inbox branch's safe harbor.** Package §9.2(c) carried the `EXCEPTION WHEN OTHERS` harbor and
  the `routing.clear` key; plan Task 10.4's SQL was the unwrapped `COALESCE`-only version and its SQL
  test case 5 *asserted the hard failure as correct*. Task 10.4 now carries the harbor and the clear
  flag; test case 5 asserts **safe-harbor with a conflict stash**, and a new case 6 asserts
  un-placing.
- **`voice_audio_sha256` / `voice.audioSha256`.** Package §8.10 and §9.2 deferred both to wave 6A for
  want of a producer; plan Task 6.5 still added the property and the wire key, Task 10.2's test
  asserted `audioSha256`, and Task 10.4 listed the column. All three removed; wave 6-1 now carries
  them (with `transcript_edited_at`) explicitly.
- **`captureKind`.** The plan's interface block declared the wire key but no task produced it, while
  the migration CHECKs it and the SQL test asserts `capture_kind = 'note'` — a green test over
  behaviour the app could never perform. Task 6 now adds `Specimen.captureKindRaw` and the payload
  key; Task 8.6 sets `'note'` on the N4 path and `'context'` in `ContextCaptureService`.
- **`requiresOnDeviceRecognition`.** Package §14 required `on_device` to be *stored*, not merely set;
  no plan task stored it and no task emitted any `voice.*` event at all. `VoiceNoteResult.onDevice`
  now carries the resolved value and the new Task 17 emits it.
- **The tray button.** Package §7.8 says wave 1 **renames** *"Route all N"* to *"Place N"* and
  explicitly does **not** wire `sync.routeAll`; the plan's work-package row was still titled
  *"`routeAll` tray fix"*, so the wave report would have read as if bulk routing shipped. Row and task
  re-titled, with the refusal stated.
- **Wave 1P.** Plan §1 pointed at *"Wave 1P, §1.4"* and no §1.4 existed. Written, with its four
  packages, its two prerequisites (`room-file` flag, `room-file-copy.ts` brand-voice pass),
  acceptance, gates and rollback — and wave 4's estimate re-stated net of it.
- **Wave 6's gate.** Package §8.6 splits 6A (deterministic, $1.15/mo, schedulable with wave 4) from
  6B (evidence-gated); the plan still gated both on one pair of numbers. §6 now carries the split and
  the FC-R18 shape-block on 6-2/6-3/6-4.
- **Acceptance-criteria count.** §1 lists **eleven** criteria; Task 15.7 asked the report to cover
  *"nine"*, and §8's device-pass step said *"six-step"* over an eleven-step block. Both corrected.
- **Test names.** §1's Test plan listed names that §8's task bodies did not create
  (`VoiceCaptureContractTests`, `rotationFiresAtFiftySeconds`,
  `segmentFilenameIsZeroPaddedAndLowercased`, `missingRequiredMediaChecksEverySegment`). The Test plan
  now enumerates the five real files and every real test name, and says plainly that the recorder
  itself has no unit test (C1) and is proved by device-pass steps 1–5.
- **Interfaces block.** `VoiceNoteResult` gained `onDevice`; `Specimen` gained
  `voiceAudioRemotePathsRaw`, `voiceTranscriptSourceRaw`, `captureKindRaw` and lost
  `voiceAudioSha256`; `currentSchemaVersion` bump to 2 is stated in the block and executed in Task 6.
- **Estimate arithmetic.** Package §1 claimed *"≈12 engineer-weeks"* over a list summing to 13. Now
  ≈12.5, itemised, net of Wave 1P and the newly-priced punch back-reference DDL.
- **Line citations corrected this pass** (all content had been verified correct; only the ranges were
  off): `ViewfinderControls.swift:43` → `:36` (package §5.4);
  `00413:1866-1875` → `:1829-1861` (rulings FC-R7); `00177:37-39` → `:39-41` (plan 4-10);
  `letterhead-instruments.tsx:118-130` → `createSignedUrls` at `:123` (plan 4-1);
  `00169:61-62` → `:60-62` (plan 4-8); `ViewfinderModel.swift:409-419` → `:413-423` (plan 2-2);
  `CaptureSessionContext.swift:157-167` → `:157-169` (both files, re-verified against the file);
  `00233:154-188` → `:155-188` and `00235:204-208` → `:205-217` (plan Task 1/Task 10);
  `use-room-files.ts:378` → `:385` (already corrected, re-checked). `DECISIONS.md` and the
  `append_entry.py`/`workstream_state.py` scripts are now fully path-qualified.

### `research/40-review-repo-correctness.md`

- **RC-01** — applied. Band re-drawn; Task 1 rewritten (census over filesystem + all refs + worktrees
  + `grep -rl commit_field_capture`); its stated expectations corrected from *"the git log is empty"*
  to *"exactly the svc-media 00521 row"*. The finding's own proposed `00522–00527` is superseded by
  the lanes' confirmed `00530–00535`.
- **RC-02** — applied. C12 and FC-R18 were already-applied; Task 10.4 now authors from 00516's body,
  Task 1.5 records 00516 and the lineage, and Task 10.1's re-check includes
  `grep -rl 'commit_field_capture' supabase/migrations` across refs and worktrees.
- **RC-03** — applied. Inbox-branch `BEGIN … EXCEPTION WHEN OTHERS` with the `00235:278-291` conflict
  stash in Task 10.4; SQL test case 5 now asserts safe-harbor, not a raise.
- **RC-04** — applied. `noteID` is a `var` minted per note; every per-note field reset at the top of
  `startLiveTranscription()` (Task 8.2/8.3); device-pass step 3 covers two notes on one screen.
- **RC-05** — applied. `AVNumberOfChannelsKey: format.channelCount`, plus a
  `buffer.format == file.processingFormat` guard before every write; AirPods route-change device step.
- **RC-06** — applied. `.ended` + `.shouldResume` reactivates the session, restarts the engine,
  reinstalls the tap, **then** opens segment N+1; the dead `guard isRunning` is gone.
- **RC-07** — applied. Task 14.2 holds the message in a local and assigns `toast` once; `:141` and
  `:86` reworded in the same commit.
- **RC-08** — applied. New **Task 17** emits `voice.start`, `voice.finish`, `voice.empty_transcript`,
  `capture.placed`/`capture.unplaced`; Tasks 8 and 9 emit `voice.segment_rotated`,
  `voice.interrupted`, `voice.audio_write_failed` in their own control flow.
- **RC-09** — applied. Package §9.5 was already-applied; the plan gains **4-13**, the punch
  back-reference migration (column + widened allow-list + DEFINER `CREATE OR REPLACE`), 4-9 re-sized
  M→S, and a wave-4 SQL test for it.
- **RC-10** — applied. Package §8.6/§8.7/§10 were already-applied; plan §6 now states the FC-R18
  shape-block and that 6-2/6-3/6-4 collapse into a suggestion key plus a consumer branch if the Phase
  3 ledger wins.
- **RC-11** — applied. C5 was already-applied; Tasks 2.5, 8.8, 13.5, 14.5, 15.5 and 18.4 now name the
  signed device command and say *never `capture-gate.sh build`*.
- **RC-12** — applied. Task 2.2 tests for the file and edits line 17 in place; the real
  `supabaseAnonKey` is called out as what a `cp` would destroy.
- **RC-13** — applied. Task 10.7 runs `SUPABASE_DB_URL=… pnpm --filter @patina/supabase run generate`
  and stages `packages/supabase/src/database.types.ts`.
- **RC-14** — applied. `…-0000000000d1` replaces the invalid `…r1` in all four places.
- **RC-15** — applied. Package §7.2 was already-applied; plan Task 11.2 now uses
  `CaptureType.monoSmall` with the enum's real case list quoted.
- **RC-16** — applied. `CaptureStore.inMemory()` and
  `FieldCapturePayload(specimen:device: FieldCapturePayload.Device())`; the "mirror the shipped
  fixtures" hedge is deleted.
- **RC-17** — applied. `guard enabled, !key.isEmpty`, non-`public`, with the static-vs-instance trap
  named.
- **RC-18** — applied. `await sync.drain()`.
- **RC-19** — applied. See the contradiction sweep above.
- **RC-20** — applied. `captureKind` gains a real wave-1 producer; `noteSetting` stays forward-declared
  with its wave-3 writer named.
- **RC-21** — applied. Task 14.2 keeps the `partialTranscript` local and keys both the guard and the
  copy off it.
- **RC-22** — already-applied (package §9.4, rulings FC-R6 option (d)).
- **RC-23** — already-applied (package §9.4's `security_invoker` warning, rulings FC-R8).
- **RC-24** — applied. The observer token is stored and removed in `finish()` and `deinit`.
- **RC-25** — applied. `rotate()` calls `VoiceRecordingPolicy.shouldEnd` and ends the note visibly.
- **RC-26** — applied. `model.outboxDepth` from `store.outbox(owner:)` replaces `sessionCount`.
- **RC-27** — applied. Task 8.6 threads `audioSegments` (and `transcriptSource`) at
  `SiteScanContextCapture.swift:132-137` and stages that file.
- **RC-28** — applied. The tap block appends and writes only; rotation is posted to a serial queue.
- **RC-29** — applied. See the contradiction sweep.
- **RC-30** — applied. Task 2.4's template comment now says scheme **Run** actions only, and points a
  distributed build at the Info.plist path.
- **RC-31** — applied (option a). No `json` case — today's behaviour preserved byte-for-byte, said so
  in the file header and the commit message — and `emittable` trimmed to what the uploader actually
  produces (`.heic`/`.heif`/`.jpg`/`.jpeg`, `.m4a`).
- **RC-32** — applied. `currentSchemaVersion = 2`, in the interfaces block, Task 6.5 and its test.
- **RC-33** — applied (option a). Dropped from wave 1 entirely; lands in 6-1.
- **RC-34** — already-applied (rulings FC-R5, package §9.7).
- **RC-35** — already-applied (package §5.5, plan §1's ⚠ block, plan 2-1).
- **RC-36** — applied. Task 10.4 states that `CREATE OR REPLACE` preserves the ACL, that C7's trap is
  for **new** routines, and matches the fuller `PUBLIC, anon, service_role` idiom.
- **RC-37** — already-applied (package §11.1 names which hooks are shared and which portal-local).
- **RC-38** — applied. Order-preserving de-duplication with `seen.insert(_:).inserted`.
- **RC-39** — already-applied (`DECISIONS.md:1554` cited in package §3.8 and §15.4).
- **RC-40** — applied. `docs/design/the-document/DECISIONS.md` and `scripts/append_entry.py` /
  `scripts/workstream_state.py` are now fully path-qualified in both files.
- **RC-41** — applied. See the citation list in the contradiction sweep; the remainder were
  already-applied.
- **RC-42** — applied. `ls supabase/migrations/*.sql | tail -4`, with `_pending/` named as the reason.
- **RC-43** — applied. `transcript_edited_at` is out of wave 1 (package already-applied) and named in
  plan 6-1 as landing with its only consumer.
- **RC-44** — already-applied (package §5.5 records the `public` symbol removal as a named seam edit).
- **RC-45** — applied. Task 14.3 now ships §7.11's settled wave-1 strings; the two withdrawn proposals
  are named and why.
- **RC-46** — applied. Task 14.3 says change the string literals only and preserve the
  `.font`/`.foregroundStyle` chains.
- **RC-47** — applied. Task 7.3 says *at the end of the file, after the
  `CaptureSessionContext`/`CaptureSessionContextPolicy` declarations*, with the nesting trap named.
- **RC-48** — already-applied (package §17.1's *do not "fix" either one*).
- **RC-49** — applied. Package §11.6 was already-applied; Task 3.5 adds `reloadFeatureFlags()` after
  auth resolves.
- **RC-50** — already-applied (`ResilienceScreens.swift:9` is in package §17.4's list).
- **RC-51** — already-applied (package §9.2 names every CHECK constraint).
- **RC-52** — already-applied — no defect. The reservations-doc anchors were re-verified this pass and
  Task 1 targets them directly.
- **RC-53** — applied. C8 and package §9.1 were already-applied; the SQL test header and Tasks 10.6 /
  18.2 now carry the superuser caveat and the *never claim RLS verified* rule.
- **RC-54** — applied. Test case 7 carries a comment saying the count is 5 **today** and that an
  FC-R8 per-studio ruling adding a sixth must update it deliberately.

### `research/40-review-product-ux.md`

- **F1** — applied (with RC-01).
- **F2** — already-applied. FC-R18 exists, sequences first, and is cited from package §9.0, §3.7,
  §8.6, §8.7, §10, plan C12 and the rulings summary sheet.
- **F3** — applied. Task 11.4 gives S1 a **Done** primary (`persistRouting(); dismissSheet()`) and
  makes ✕ persist; acceptance criterion 6 and §7.5's tap count already named the return surface.
- **F4** — already-applied (Flow 5's correction box, FC-R7 re-opened with the Drafts fold).
- **F5** — already-applied (FC-R7's publish-raises and client-notification facts).
- **F6** — applied. New **Task 15** enables the N4 primary on audio, labels it *"Keep the recording"*,
  applies the ladder line and deletes segments on Discard.
- **F7** — applied. Task 6.6 exempts an uploaded segment (mirroring the photo rule) and Task 9.2
  **drops** a missing segment and commits rather than throwing a non-deferrable error; the
  fill-the-disk device step is step 7.
- **F8** — applied. Package §7.4 and FC-R9 were already-applied; plan 3-6 now carries tap-to-start /
  tap-to-stop and the N4 conversion.
- **F9** — already-applied (FC-R11 re-scoped to block wave 1; `audio_retention` defaults `'keep'`).
- **F10** — applied. Package §11.2/§11.6 and FC-R10 were already-applied; plan 4-5 and Wave 1P now
  carry the `room-file` prerequisite with the flag-on walk as a completion criterion.
- **F11** — applied. Plan **§1.4 Wave 1P** written.
- **F12** — applied. Package §2.1/§9.4/§11.4 were already-applied; plan 4-3 and 4-4 now require the
  full body, `NoteBody` to render it, and the escalation hooks to receive it, and wave-4 acceptance
  criterion 1 says *not its first eighty characters*.
- **F13** — applied. Plan 2-2 holds S3's recommendation at `.inbox` regardless of confidence, with the
  wall-defect device step.
- **F14** — already-applied (package §2.1, §16.1 and §17.3's ten strings; wave 1 rewrites three).
- **F15** — applied. Package Flow 7 and §11.3 were already-applied; plan 4-10 now carries the
  immutability of a saved capture and the `min/max(created_at)` span rule.
- **F16** — applied. Task 15.3 adds `VoiceSegmentPlayer` and play controls on the N4 sheet and the
  tray row — the first audio playback in Patina Field.
- **F17** — applied. Task 2.3 delivers the Info.plist-from-build-setting path, the startup log line
  and the CI/archive story; work package 1-2 and package §14 were already-applied.
- **F18** — already-applied (FC-R2 discloses the designer judge's three-kind recommendation and
  collapses the duplicated vocabulary).
- **F19** — already-applied (kit chooser deferred to wave 4; wave 3 ships only the consent posture).
- **F20** — already-applied (FC-R6's missing mechanism; package §16.16 names it as an accepted
  limitation in the brief's own words).
- **F21** — already-applied (package §11.3/§11.4: the Visits block is the record, the margin carries
  promoted notes).
- **F22** — applied. Package §11.2/§17.4 were already-applied; plan 4-5 and Wave 1P carry the
  `room-file-copy.ts` brand-voice line item.
- **F23** — applied. Task 14.3's copy now matches §7.11 exactly, and both toasts are reworded in the
  same commit.
- **F24** — already-applied (package §6's best-case/real-case rule, with the real case as the target).
- **F25** — applied. Package §9.2's `routing.clear` key was already-applied; Task 10.4 implements
  `v_clear_routing` and test case 6 asserts un-placing.
- **F26** — already-applied (*"seg 3"* deleted from §7.4's chrome, the cap copy rewritten, §7.6 is
  *"Where this belongs."*).
- **F27** — already-applied (package §15.4's ⚠ that the ladder applies to every voice surface).
- **F28** — applied. FC-R19 was already-applied; new **Task 16** implements delete-on-receipt,
  delete-on-Discard (in Task 15.2) and the size-capped sweep with a CaptureKit-side policy + test.
- **F29** — already-applied (package §16.17 and §16.18 refuse the plan/spec viewer, the Field→
  `discovery` path and finish-as-first-class-object, in writing).
- **F30** — applied. Package §8.6's 6A/6B split was already-applied; plan §6 now carries it, and 6-1 /
  6-2 / 6-6 are labelled by half.
- **F31** — already-applied (inclusive OR with a third arm, corrected in package §9.4 and FC-R6).
- **F32** — applied. Package §1's total re-stated as ≈12.5 and itemised.
- **F33** — already-applied (`cameraRealmButton` in §5.2's band and FC-R1's default).
- **F34** — already-applied (FC-R3 names the Visits ↔ Site-visit relationship).
- **F35** — applied. Package §11.6 was already-applied; Task 3.6 gates the recorder behind the seam,
  giving the kill switch a real circuit, and device-pass step 11 exercises it.
- **F36** — already-applied (package §5.5 states what the freeze covers and exempts additive optional
  wire keys).
- **F37** — already-applied (Flow 5's ⚠ and FC-R7's *decide `court_party_id` here too*).
- **F38** — applied. Rulings FC-R10 was already-applied; plan 4-5 and Wave 1P now say to keep the
  provenance visible (*"yours"* vs *"from your client"*).
- **F39** — applied. Package §1 and plan §1 were already retitled *"The note survives"*; the **PR
  title and body** in Task 18.6 now match, with an explicit *"What this wave does NOT do"* section.
- **F40** — applied. §1's post-walk verification block was already-applied; Task 18.4 now routes the
  walker to it explicitly instead of asking for a server check mid-walk.
- **F41** — applied. Package §9.3's *orders suggestions and is never rendered* was already-applied;
  plan 3-10 now repeats it where the migration is briefed.
- **F42** — already-applied (`audio_retention` defaults `'keep'`; the forward-declared columns are
  listed with their writers and readers named).
- **Rulings review table (FC-R1…FC-R17) and "Two rulings that are missing"** — already-applied. Every
  verdict is reflected in `field-companion-rulings.md`: FC-R18 and FC-R19 exist and are sequenced
  first; FC-R7 is re-opened; FC-R11 re-scoped to wave 1; FC-R12 escalated to *rule the family*;
  FC-R13 split into server and phone; FC-R10 carries the existing-flag decision; FC-R4 carries the
  80-character caveat; FC-R2 discloses the judge override; FC-R17 carries the band above.

### Rejected

None. Every finding in both reviews was either already reflected in the text or applied in this pass.
Three were applied in a form the finding itself offered as an alternative, and the choice is recorded
in the line above: **RC-25** (call `shouldEnd` rather than move the cap to wave 3), **RC-31**
(preserve today's `json → application/octet-stream` behaviour rather than document a silent change),
and **RC-33** (drop the SHA-256 lane from wave 1 rather than add a hashing step to Task 9). **RC-01**'s
specific proposed band (`00522–00527`) is superseded by the `00530–00535` the two live lanes confirmed
on 2026-08-24; the finding's substance — re-census, repair the doc, coordinate with the
`feat/svc-media-shape-reconcile` owner — is applied in full.

### Still owed by Kody, not by this document

**FC-R18** (whose lane owns `field_captures` enrichment) blocks the wave-1 migration outright — it
decides whose body `commit_field_capture` is authored from, and whether this program authors one at
all. **FC-R17** blocks every migration. **FC-R11** blocks the recorder reaching anyone but Kody.
**FC-R19** blocks the recorder's local lifecycle. **FC-R14** decides whether wave 1 ends at Kody's
device or Leah's. Nothing in the band is minted, and no SQL is authored, until FC-R18 and FC-R17 are
ruled.

### Post-review update — Phase 3 00516 fix (2026-08-24)

Phase 3's fix lane (cross-tenant `enqueue_capture_enrichment` over-grant, wrapped by the new
`SECURITY DEFINER enqueue_capture_enrichment_for_producer(...)`) added a precondition to Task 10 and
its 1-1/1-10 work-package rows, amended FC-R18's recommended default to *author from the merged,
post-fix 00516 body*, and added the same fix note to package §1's neighbour-lanes callout and §9.2.

### Post-presentation consistency fixes (2026-08-24)

The HTML presentation built from these three files surfaced five internal contradictions, resolved
here to match the resolution the presentation already used. One line per fix.

- **Outcome count.** Package §1's executive summary said *"six of the nine"* outcomes fail with none
  passing; `research/10-gap-analysis.md`'s own grid scores 8 FAIL + 1 PARTIAL + 0 PASS. Corrected to
  *"Eight of the nine … fail outright, one is partial; none passes"* (package §1).
- **Flow 3's gesture.** Package §6 Flow 3 said the voice note was started with *"(hold) the big mic,
  speak, release"*, contradicting §7.4 C6 and FC-R9's ruled tap-to-start / tap-to-stop toggle. Flow
  3's target line and step 2 rewritten to the tap toggle; hold retained only as the C3 card's
  shortcut (package §6).
- **C6 chrome.** Package §7.4's *Recording* state listed a *"segment counter"* the same section's
  own correction says the chrome no longer shows. Removed; the state now reads elapsed time only
  (package §7.4). §14 telemetry and plan Task 17 already treated the segment count as
  telemetry-only, with no visible-counter claim.
- **FC-R2 wording.** Rulings FC-R2's heading and option (a) said *"four kits"*, contradicting its own
  correction and the Summary sheet, both of which count three kits (walk-through · trade walk ·
  install; site is a kind, not a kit). Heading and option (a) corrected to *"three kits"* (rulings
  FC-R2); no `"four kits"` echo existed in the package.
- **Wave 4 size.** Plan §4's header said *"≈4 engineer-weeks minus whatever Wave 1P already landed"*,
  disagreeing with package §1's arithmetic, which uses ≈3.5 for wave 4 so the ≈12.5 total sums.
  Plan §4's header corrected to *"≈3.5 engineer-weeks (four packages moved into Wave 1P …)"*; no
  disagreeing totals line exists in plan §7.

---

*Read-only planning pass. The only repository files created are this plan, the package and the
rulings register, all under `docs/design/field-companion/`.*
