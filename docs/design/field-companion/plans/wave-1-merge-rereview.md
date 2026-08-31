# Wave 1 — merge RE-review (the fix wave)

**Branch:** `feat/field-companion-w1`
**Worktree:** `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w1` — read-only; no file in it was touched, no git mutation, no build.
**Range re-reviewed:** `45086fe89..4a0f6d5fb` — `85edd4e95` (B1) · `94f4c9ea1` (B2) · `49a808389` (B3) · `f25586a48` (ladder rung + cap copy) · `c44c816b4` (docs) · `45d24c340` (isFinal-at-rotation) · `4a0f6d5fb` (ledger snapshot).
**Against:** `wave-1-merge-review.md` B1–B4 + the two attention items, plus the fixer-discovered isFinal-at-rotation defect.
**Reviewed:** 2026-08-25. Device pass still NOT run.

All line citations below are the branch head `4a0f6d5fb`. Unqualified Swift paths are relative to the worktree root.

---

## Verdict

# DO-NOT-MERGE — one blocker, ~3 lines from MERGE

Every finding the fix wave was sent to close is **genuinely closed**. B1, B2, B3, both ladder rungs and the isFinal-at-rotation defect are fixed in substance, not in comment. B4 is gone. The docs corrections land. The engineering standard of the round is high and the comments are load-bearing rather than decorative.

But the two newest commits interact, and the interaction defeats the rung `f25586a48` was written to build:

> **N1 — on the §15.4 "recognizer unavailable / denied" rung, any note longer than ~50 seconds is torn down at the first rotation with `voice.finish reason:"error"`.** `rotate()` builds a fresh `SFSpeechAudioBufferRecognitionRequest` and starts a recognition task **unconditionally**, including on a note that deliberately started with recognition off. The unauthorized/unavailable recognizer errors back on the **live** generation, so `45d24c340`'s new error door fires and `endAbandonedNote()` ends the note. The rung works for 50 seconds and then stops working — and the device-pass step written to prove it (step 37) speaks for **20 s**, so it cannot catch this.

The fix is three lines in `rotate()`. Nothing else in the round needs to move before merge.

| # | Finding | Sev | Conf | Disposition |
|---|---|---|---|---|
| **N1** | Rotation starts a recognition task on a note whose recognition was deliberately skipped → the ladder rung's note dies at ~50 s | **high** | 0.75 | **BLOCKER** |
| N2 | `rotate()` provokes the old request's terminal callback (728–729) **before** retiring its generation (736) — a terminal *error* landing in that window still reads as live and ends the note | medium | 0.6 | follow-up |
| N3 | A live request's mid-note recognition error ends the note (behaviour on a newly-reachable path). Ruled below: **wrong per §15.4/§8.2/R114.1**, but not a regression | medium | 0.8 | follow-up + ruling |
| N4 | `endAtCap()` yields `latestTranscript` read **outside** the identity guard — a note-2 transcript can be yielded into note-1's stream | low | 0.6 | follow-up |
| N5 | B2 residual: `finish()`'s early return can still hand back a segment list missing the final segment, in the window between `rotate()` clearing `noteIsActive` and `endAtCap()` running | low | 0.6 | follow-up |
| N6 | F2 never calls `requestAuthorization()`; `recognitionIsAvailable` now requires `.authorized`, so F2 on a fresh install reads the ladder rung permanently and has **no door to the prompt** | medium | 0.75 | follow-up |
| N7 | `migration-number-reservations.md` now asserts 00514/00515 are "NOT applied to staging or prod". **Prod holds both** (Strata ledger read) | medium | 0.95 | follow-up (docs) |
| N8 | 00531's filename in the doc (`00531_uuid_generate_v5_grant.sql`) is not the file on the hotfix branch (`00531_grant_uuid_generate_v5_authenticated.sql`) | low | 0.95 | follow-up (docs) |

---

## 1 · B1 — the three ARC-bearing fields — **ADDRESSED**

`apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift`

| Field | Now | Evidence |
|---|---|---|
| `latestTranscript` | lock-backed, **read-only** computed property; every write goes through the lock | `:110-126` (`TranscriptState` + `transcriptBox`), writes at `:463-471` (`foldResult`), `:481-488` (`beginTranscriptGeneration`), `:493-499` (`carryForwardAndAdvance`) |
| `audioSegments` | lock-backed computed property over `segmentsBox` | `:156-160` |
| `continuation` | lock-backed computed property over `continuationBox` | `:187-193` |

**No remaining unlocked cross-thread ARC-bearing access.** I enumerated every stored property. The three still-unsynchronized reference-holders are `audioFilename` (`:146`), `interruptionObserver`/`configChangeObserver` (`:179-180`) and `tapFormat` (`:200`), and every one is written and read on the main actor only:

- `audioFilename` is written at `:606` inside `closeCurrentSegment()`, whose only callers are `stopEngineAndCloseSegment()` (`:634`) and `reopenEngineAndSegment()` (`:852`); those in turn are reached from `finish()` (`:357`, MainActor), `endAbandonedNote()` (`:622`, reached from `:323` on MainActor and `:454` via `DispatchQueue.main.async`), `endAtCap()` (`:763`, main hop), the interruption observer registered `queue: .main` (`:798`, `:805`), and `deinit` (`:230`). `deinit` is the only non-main door, and at that point the refcount is zero — no concurrent reader exists.
- `tapFormat` is written in `installTap` (`:504`) — called from the `AsyncThrowingStream` builder closure, which runs synchronously on the MainActor caller (`:317`), and from `reopenEngineAndSegment` (`:854`, main) — and read in the config-change observer (`:832`, `queue: .main`).

`rotate()` reads `audioSegments.count` at `:690` and `:735` on `rotationQueue`; both now go through `segmentsBox`. The get-modify-set at `:605` is the only mutation site and it is main-actor-only, which is exactly the soundness argument the review asked for and which the code states at `:148-155`.

**`rotate()` ends the old request before taking the carry — CONFIRMED.** `:728` `request?.endAudio()` → `:729` `task?.finish()` → `:736` `carryForwardAndAdvance()`. Ordering is as specified. (The *error*-guard consequence of that same ordering is N2 below.)

**No lock-ordering hazard introduced.** `transcriptBox`, `segmentsBox`, `openSegmentBox`, `requestBox`, `continuationBox` are never nested — `emitFinish` (`:389-399`) takes `segmentsBox` and `transcriptBox` sequentially, and the tap block (`:505-535`) takes `requestBox`, then `openSegmentBox`, then `continuationBox`, each released before the next.

---

## 2 · B2 — the capped note's last segment — **ADDRESSED**

`endAtCap(_:continuation:)` at `:754-781` now runs, in order:

1. `:763` `stopEngineAndCloseSegment()` → `closeCurrentSegment()` → `:605` `audioSegments.append(closed.name)`
2. `:775` `emitFinish(reason: "cap")`
3. `:779-780` `continuation.yield(isFinal: true)` then `continuation.finish()`

The final segment is published before anything the consumer can observe. `rotate()`'s cap branch (`:689-713`) now publishes **nothing** — no yield, no finish, no `emitFinish` — it only latches `noteIsActive = false`, `stoppedAt`, `endedAtCap` and posts the hop.

**Exactly one `voice.finish reason:"cap"` — CONFIRMED by grep.** `emitFinish` is called from three sites only: `:367` (`"manual"`), `:631` (`"error"`), `:775` (`"cap"`). The `"cap"` call is inside the `cappedNoteID == noteID` guard, so a note superseded in the hop emits nothing; and `finish()`'s `guard wasActive` early return (`:341-350`) means the consumer's own `finish()` cannot double-emit.

**Is finishing the stream outside the identity guard safe when a second note started in the same runloop turn?** Yes for the finish itself, with one residual on the yield:

- The `continuation` is a **parameter**, threaded from the tap's read of `self.continuation` (`:533`) through `requestRotationIfNeeded` → `rotate()` → `endAtCap`. It is note-1's continuation whatever `self.continuation` now holds, so `continuation.finish()` at `:780` can only ever end note 1's stream. Finishing it outside the guard is not merely safe, it is **required** — a consumer left awaiting a dead mic is the worse failure, and the comment at `:777-778` says so correctly.
- The teardown *is* gated (`:762`), so a new note's session, request, task and observers are untouched. Correct.
- **N4 (follow-up, low / 0.6):** `:779` reads `latestTranscript` **outside** the guard. `transcriptBox` was reset by note 2's `beginTranscriptGeneration()` (`:267`), so if a second note really did start in the hop, note 1's stream receives note 2's words as its final chunk — and both sheets assign `chunk.text` straight to their transcript (`VoiceNoteSheet.swift:292`, `SiteScanContextCapture.swift:125`). Neither surface can reach that today (N4 needs a finger lift + re-press, F2 needs a tap), so it is latent. Capture the transcript inside the guard, or yield nothing when the identity does not match.
- **N5 (follow-up, low / 0.6):** the B2 window is narrowed, not eliminated. `rotate()` clears `noteIsActive` on `rotationQueue` at `:695`; `endAtCap` closes the segment on a later main hop. A consumer that calls `finish()` *in that window* — N4's `end()` on a finger lift at exactly the cap (`VoiceNoteSheet.swift:325-341`), or `discard()` (`:343-364`) — takes the `guard wasActive` early return at `:341` and gets `audioSegments` as they stand, still missing the final segment. It now requires a coincident user action rather than being the ordinary path, which is why it is a follow-up. Closing it properly means closing the segment on the `rotationQueue` side of the latch, or having `finish()`'s early return await the pending cap teardown.

---

## 3 · B3 — `attach()` nulling a live pointer to server audio — **ADDRESSED**

**`VoiceAttachPolicy.merge(existing:new:)`** — `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/VoiceAttachPolicy.swift:68-96`.

- `:70-77` — replace **only** when `new?.audioSegments` is non-empty. All four fields come from the new take on that branch.
- `:79` — otherwise `var kept = existing`; `audioFilename` and `audioSegments` are **never** touched again on any path below. Filename, segment list and (unless the specimen never had audio) duration are preserved verbatim.
- `:80-86` — words with no file correct the source to `"device"` and re-time **only** a specimen with no audio (`:86`), so a take cannot mis-time an earlier recording.
- `:87-90` — nothing spoken and no audio ever → `"designer"`, duration nil.
- `:92-94` — audio present, words typed over it → source left exactly as it stands. Correct: relabelling `"designer"` would deny a recording that exists.
- `hasAudio` (`:51-54`) correctly treats a legacy filename-only note as having audio, so the pre-segments shape is protected too.

**`attach()` routes all four fields through it — CONFIRMED.** `VoiceNoteSheet.swift:379-388`: one `merge` call, then `voiceAudioFilename`, `voiceAudioSegmentsRaw`, `voiceTranscriptSourceRaw`, `voiceDurationSeconds` are each assigned from `merged`. No surviving unconditional write. The old `:325-327` / `:347-350` shape is gone.

**The 9 tests are non-vacuous.** `apps/mobile/Capture/CaptureTests/VoiceAttachPolicyTests.swift`. The literal regression is `typedReattachKeepsTheSyncedTakesAudioKeys` (`:27-35`): under the pre-fix behaviour (`specimen.voiceAudioSegmentsRaw = result?.audioSegments` with `result == nil`) `merged.audioSegments` is `nil`, and `#expect(merged.audioSegments == ["voice-a-000.m4a", "voice-a-001.m4a"])` fails. `aTakeThatPublishedNothingCannotClearAudio` (`:37-42`) covers the same hole from the empty-`VoiceNoteResult` side; `aLegacySingleFileNoteWithNoSegmentListIsAlsoProtected` (`:44-53`) covers the pre-segments shape. The replacement direction is still pinned (`:57-77`) so the fix cannot degrade into "never replace". I did not execute the file (a `swift test` run writes into the worktree); the assertions are literal value comparisons against a pure function, so reading is sufficient here.

**Target membership verified.** `project.pbxproj` `:1335` puts `VoiceAttachPolicyTests.swift` in the `CaptureTests` sources phase (`BAC14B78…`, `:1309`), and `CaptureKit.xcscheme` names `CaptureTests` as its test target — so `capture-gate.sh test` does run these 9. `VoiceAttachPolicy.swift` and `VoiceNoteCopy.swift` are in the CaptureKit phase (`:1370-1371`).

**pbxproj regen is clean.** 622/610 lines is the usual UUID re-mint. Source memberships went 252 → 255 and the symmetric diff of every `… in Sources` name is a **pure addition** of exactly the three new files — nothing dropped. `Secrets.swift` still carries its 4 references (the known fresh-worktree regen trap did **not** bite). Both schemes' `BlueprintIdentifier`s were updated to match. *Merge-ordering note (low):* a regenerated pbxproj conflicts with any other lane that touches it, for the same reason B4 did — land this branch before, not after, another Capture-target lane.

---

## 4 · Ladder rung + cap copy — **ADDRESSED**, with one blocker in the interaction (N1) and one gap (N6)

**Recognizer unavailable / speech denied → audio session + engine + `openSegment` still run.** `startLiveTranscription()` `:262-327`:

- `:263` `let available = recognitionIsAvailable`, where `recognitionIsAvailable` (`:254-257`) = `authorizationStatus() == .authorized && recognizer?.isAvailable == true`.
- `:290-292` session category + activate — **before** any recognition decision. The old `guard … else { throw .recognizerUnavailable }` that sat here is gone.
- `:294-296` request is `available ? SFSpeechAudioBufferRecognitionRequest() : nil`.
- `:302-303` `noteIsActive = true`; `openSegment(format:)`.
- `:308-311` the task is started only `if let recognizer, let request`. `:312-315` is an explicit "no else" with a correct reason: a chunk here would *be* her transcript.

**Honest copy from §15.4, verbatim, on both surfaces.** `apps/mobile/Capture/CaptureKit/CaptureKit/Recognition/VoiceNoteCopy.swift:18` and `:23-24` hold the two strings, character-for-character against the package's §15.4 table.

| Surface | Unavailable rung | Cap copy |
|---|---|---|
| N4 | `VoiceNoteSheet.swift:124-128` (transcript-pane placeholder) and `:256-261` (typed-editor line, first branch) | `:95` (live) and `:233` (typed), both `VoiceNoteCopy.capReached`, fed by `capNotice = r.endedAtCap` at `:334` |
| F2 | `SiteScanContextCapture.swift:119-120` (said at the *start*) and `:198-201` (closing toast) | `:194-195`, and it correctly **outranks** the other messages |

`VoiceNoteSheet.swift:92` and `:230` suppress "We couldn't make out the words" on the unavailable rung — right, since that line claims an attempt that never happened.

**`requestAuthorization()` no longer fails on a speech denial but still fails on a mic denial — CONFIRMED.** `:239-250`: the speech prompt is still *raised* (so N4 primes it) and its result discarded at `:240`; the return value is the mic grant alone (`:245-249`). Pre-fix, `:161-172` of the old file had `guard speechOK else { return false }`. `VoiceNoteSheet.swift:74-78` maps that to `manualFallback` only on a mic denial, and `begin()`'s `guard authorized != false` (`:266`) makes a note without a mic impossible.

**`MockVoiceNoteService` untouched via the protocol-extension default — CONFIRMED.** `RecognitionServices.swift` adds `@MainActor var isTranscribing: Bool { get }` to the protocol and a `public extension VoiceNoteService { @MainActor var isTranscribing: Bool { true } }` default in the same module. `CaptureKitMocks/CaptureKitMocks.swift` declares no `isTranscribing` and needed no edit.

### N1 — **BLOCKER** · high / 0.75 · the rung is defeated at the first rotation

`rotate()` (`:684-740`) has **no recognition guard**. On a note that started with `available == false` (`transcribing = false`, `:283`), the rotation machinery still runs end to end:

- the tap's post at `:532-534` guards on `self.recognizer` (non-nil — `SFSpeechRecognizer(locale:)` returns an instance regardless of authorization) and `self.continuation` (set), so `requestRotationIfNeeded` fires;
- `requestRotationIfNeeded` (`:664-677`) passes: `noteIsActive` true, `segmentStartedAt` set by `openSegment` (`:547`), and `shouldRotate` at `VoiceRecordingPolicy.segmentRotationSeconds == 50`;
- `rotate()` `:728-729` are no-ops (both nil), then `:730-733` **create a new request**, and `:737-739` **start a recognition task on the unavailable/unauthorized recognizer**, with the generation minted at `:736`.

That task's handler is `recognitionHandler(generation:continuation:)`. The error it delivers matches the **live** generation, so `:446` passes, `:447` `continuation.finish(throwing: error)` runs and `:454` posts `endAbandonedNote()` — which stops the engine, closes the file, deactivates the session and emits `voice.finish reason:"error"` (`:617-632`).

Net: **on the exact door §15.4 built this rung for — speech denied, or a server-locale recognizer on a site with no signal — the note records 50 seconds and then ends itself.** N4 throws into `begin()`'s catch (`VoiceNoteSheet.swift:299-316`) and flips to the typed editor; F2 takes `stopVoice(reason: .failed)` (`:140`). The audio to that point survives, so this is not data loss — it is the rung not holding.

The device pass cannot catch it as written: step 37 (`waves/wave-1/device-pass-spec.md:187-201`) says *"speak 20 s"*, and step 38 sets no duration at all. Both sit under the 50 s rotation.

**Minimal fix (blocker):** in `rotate()`, do the recognizer swap only when the note is transcribing — the cap check at `:689-713` must keep running either way, since it is what enforces `maxNoteSeconds`:

```swift
guard transcribing else { segmentStartedAt = Date(); return }   // after the shouldEnd branch
```

**Owed with it:** extend device-pass step 37 (and 38) past a rotation boundary — a 2-minute note on the denied recognizer, asserting no `voice.finish` before release and a single continuous `.m4a`.

### N6 — follow-up · medium / 0.75 · F2 has no door to the speech prompt

`requestAuthorization()` is called from **exactly one place** in the app: `VoiceNoteSheet.swift:75`. `SiteScanContextModel.startVoice()` (`SiteScanContextCapture.swift:105-146`) never calls it. Since `recognitionIsAvailable` now demands `authorizationStatus() == .authorized`, a fresh install whose designer reaches F2 before N4 gets `.notDetermined` → `available == false` → the honest line, permanently, and **is never asked**.

Whether this is strictly *new* depends on how `SFSpeechRecognizer.isAvailable` reports `.notDetermined` under the old `:194-196` guard, which I cannot settle from the code. What is certain from the code: the F2 surface can now sit on the unavailable rung forever with no path to the prompt. Fix: `await voice.requestAuthorization()` in `startVoice()` (or prime speech at Field launch alongside the camera/mic priming). Device pass 38 should be run on a **cold install that has never opened N4**.

---

## 5 · isFinal-at-rotation — **ADDRESSED**, with one ordering residual (N2) and one ruling owed (N3)

**One handler for the first and every rotated request — CONFIRMED.** `recognitionHandler(generation:continuation:)` at `:432-456` is built once and used by both `startRecognition` (`:405-414`, the note's first request) and `rotate()` (`:737-739`). The old rotated-request closure — which ignored errors entirely — is gone; so is `if result.isFinal { continuation.finish() }`. Every chunk published from a callback now carries `isFinal: false` (`:444`), correctly, because a rotation is not the end of the note.

**`foldResult` guards on generation — CONFIRMED.** `:463-471`, `guard state.generation == generation else { return nil }` at `:465`, inside a single `transcriptBox.withLockUnchecked`. Admission and fold are one atomic step, which is the property that matters.

**`carryForwardAndAdvance()` is one lock acquisition — CONFIRMED.** `:493-499`: `carried = latest` and `generation &+= 1` inside one `withLockUnchecked`. `beginTranscriptGeneration()` (`:481-488`) increments rather than resets, so a callback in flight from the previous note cannot be admitted into this one — the comment at `:477-480` states the reason and the code matches it.

**A stale request can neither rewrite the carry nor end the live note — CONFIRMED, with the N2 window.** After `:736`, a retired request's result folds nowhere (`:465`) and its error is dropped (`:446` `isLiveGeneration`). `&+=` overflow-wraps, so no trap.

**The only doors to `continuation.finish()` — grepped.** `grep -n "continuation\.finish"` over the file returns exactly three live sites (a fourth hit is prose inside the doc comment at `:422`):

| Line | Site | Note |
|---|---|---|
| `:324` | inside `startLiveTranscription`'s stream builder, engine-start `catch`, paired with `endAbandonedNote()` at `:323` | the engine-start door |
| `:447` | `recognitionHandler`, gated `isLiveGeneration`, paired with `endAbandonedNote()` at `:454` | the recognition-error door |
| `:780` | `endAtCap` | the cap door |

A repo-wide grep across `apps/mobile/Capture/` finds no other continuation finish on this stream. So the brief's claim needs one correction of phrasing: the doors are `endAbandonedNote()`'s two callers and `endAtCap()`. **`finish()` never calls `continuation.finish()`** — it nils the continuation at `:362` and relies on the consumer to have stopped awaiting (`VoiceNoteSheet.end():329` cancels `streamTask`; `SiteScanContextModel.stopVoice():161` cancels `voiceTask`). That is fine as built, but it means the manual-stop path terminates the loop by **cancellation**, not by finishing the stream — worth stating accurately in the file's own comment at `:425-426`, which currently claims `finish()` is one of the three.

### N2 — follow-up · medium / 0.6 · the error guard is retired one step too late

`rotate()` calls `request?.endAudio()` (`:728`) and `task?.finish()` (`:729`) — the two calls that **provoke** the outgoing request's terminal callback — and only retires that request's generation at `:736`. Between those points `isLiveGeneration(oldGeneration)` still returns **true**. A terminal *error* from the just-ended request landing in that window therefore takes `:447` and `:454`, and the note is ended at a routine rotation — the exact class of bug `45d24c340` is named for, re-entering through the error door instead of the isFinal door.

The transcript side is immune (a final fold followed by `carried = latest` is idempotent, as `:461-462` explains); only the error side is exposed. The window is the `:730-736` straight line, which includes the `voice.segment_rotated` analytics call at `:735` — small, but it recurs at every one of the ~23 rotations of a 20-minute note, on every note.

Reordering is not the fix — the carry genuinely must be taken after `endAudio()` or late partials are lost. The fix is to separate the two authorities: mark the outgoing generation *ineligible for errors* before `:728` while leaving it eligible for folds until `:736` (a second field in `TranscriptState`, or checking the handler's request against `self.request`).

**If device-pass step 10b (a 20-minute note, exactly one `voice.finish reason=cap`) ever fails intermittently, this is the first suspect.**

### N3 — RULING: a mid-note recognition error should NOT end the note

**The behaviour change is real.** Pre-`45d24c340` the rotated-request closure was `{ [weak self] result, _ in … }` — it discarded errors. Post-fix, an error from any live request finishes the stream and tears the note down.

**But it is not a regression in practice**, because before this commit the note never survived its first rotation at all: the old first-request handler finished the stream on `result.isFinal`, and `endAudio()` is exactly what produces one. There was no working "rotation N ≥ 1" behaviour to regress from. This is new behaviour on a newly-reachable path.

**The ruling: it is wrong, and the spec is unambiguous about why.**

- §15.4's own rung: *"Recognizer unavailable / denied → **recording still starts**."* An error mid-note is the same condition arriving later; the spec's answer to that condition is "cost the words, not the note".
- §8.1/R114.1: *"The audio is the record. The transcript is a reading of it."*
- §8.2: *"A failed `AVAudioFile` open is non-fatal… Never block a capture."* The file — the actual record — is treated as non-fatal; treating recognition, the *reading*, as fatal inverts the hierarchy the whole wave is built on.
- The service's own header, `:15-17`: *"Recognition is a BONUS ON TOP of the recording, never a precondition (§15.4): an unavailable or unauthorized recognizer costs the words, not the note."* The error door contradicts the file's own stated law.

The realistic triggers are ordinary field conditions, not exotic ones: `kAFAssistantErrorDomain` no-speech/retry errors on a live request during a quiet 50 s stretch, a network blip on a server-backed locale, and the per-device request throttling the package itself names (*"~1,000 requests/device/hour"*) — which a 20-minute note spends 24 of.

**Correct behaviour:** an error retires *recognition* (drop the words, flip the note to the not-transcribing state, show `VoiceNoteCopy.recognitionUnavailable`), and the engine, the file and the cap keep running. The **only** door that should end a note is the engine/session failing — `:323-324`.

**Disposition: follow-up, not a blocker.** Nothing is silently lost today: F2 enqueues the take with its audio (`SiteScanContextCapture.swift:140` → `:167-216`) and N4 falls to the typed editor still holding the recording (`VoiceNoteSheet.swift:299-316`). And the change needs a mid-note "recognition stopped" surface state, which is a build, not an edit. Fixing N3 properly would subsume N1 and N2 — but N1's three-line guard is the right thing to land *now*, because it stops the ladder rung failing at 50 s without waiting on that design.

---

## 6 · Docs — mostly right; one factual error against the prod ledger

**`docs/engineering/migration-number-reservations.md` (`c44c816b4`)**

| Claim | Status |
|---|---|
| 00516 **applied to prod 2026-08-25** by the Phase 3 lane | ✅ **VERIFIED** — Strata (`bkvcixdmuyejfzcijpdg`) ledger carries `00516 capture_producer_idempotency`. Prod head is `00521`. |
| **staging still owes 00516**, so 00530's staging push stays gated | ✅ consistent; not independently checkable from this worktree, and the doc now states the prod/staging distinction rather than collapsing it — which was the point of the correction |
| 00530 not on prod | ✅ absent from the ledger |
| **00514/00515 "NOT applied to staging or prod"** | ❌ **WRONG for prod.** The Strata ledger carries `00514 capture_enrichment_ledger` and `00515 capture_enrichment_rpcs`. This is **N7**: the commit went out of its way to mark those two as "the rows in that band that really are unapplied", so the correction propagated a new error while fixing an old one. Confidence 0.95 (direct ledger read). |
| 00531 drawn on `hotfix/uuid-generate-v5-grant`, 00532–00535 reserved | ✅ branch exists (`c6831a163`) and carries the migration — but **N8**: the doc names the file `00531_uuid_generate_v5_grant.sql`; the file on that branch is `00531_grant_uuid_generate_v5_authenticated.sql`. |

**`waves/wave-1/` snapshots present** — ✅ `README.md`, `progress.md` (2231 lines), `rulings-index.txt`, `device-pass-spec.md` (256 lines), all added by `4a0f6d5fb`, pure additions. The README's own caveat is the most valuable line in the set and is accurate: *"`capture-gate.sh test` runs the CaptureKit scheme, which does not link it"* — `SpeechVoiceNoteService` lives in the app target and **no automated test in this repo touches it**. Every finding in §1, §2 and §5 above is proven by reading only, and the device pass remains the sole correctness mechanism for that file.

**B4 — RESOLVED (out of this range, recorded for completeness).** `git diff origin/main...HEAD -- packages/supabase/src/database.types.ts` is **+18 / −0**: exactly the six new `field_captures` columns (`audio_retention`, `capture_kind`, `note_setting`, `transcript_source`, `voice_audio_purged_at`, `voice_audio_segments`) across `Row`/`Insert`/`Update`. The 63,537-line whole-file reformat is gone. `progress.md`'s closing note says B4 "is NOT this round's" — correct, and it has in fact already been dealt with.

---

## 7 · Residuals, sorted

### Blocker — fix before merge

- **N1** — `rotate()` must not build a recognition request/task for a note that started with recognition off. Three lines, plus a device-pass step-37 duration that clears a rotation boundary.

### Follow-up — merge without, but docket them

- **N2** — retire the outgoing generation's *error* eligibility before `endAudio()`. First suspect if step 10b flakes.
- **N3** — ruled: a live request's recognition error should retire recognition, not the note. Needs a mid-note not-transcribing state on both surfaces; wave 2.
- **N4** — read `latestTranscript` inside `endAtCap`'s identity guard, or yield nothing when the identity does not match.
- **N5** — `finish()`'s early return can still miss the final segment in the cap hop window.
- **N6** — F2 needs a door to the speech-authorization prompt; cold-install device pass owed.
- **N7** — correct 00514/00515's prod state in `migration-number-reservations.md` (prod holds both).
- **N8** — correct 00531's filename in the same table.
- Fix the comment at `SpeechVoiceNoteService.swift:425-426`: `finish()` does not finish the stream; it nils the continuation and relies on consumer cancellation.
- Merge-ordering: the regenerated `project.pbxproj` will conflict with any other Capture-target lane.

### Carried forward unchanged from the first review

Everything in its §1.5–§1.9, §2.5–§2.9, §3.5–§3.7, §4.2–§4.6, §5.4–§5.5 and §7 that this round did not touch — notably the untested X1 fix (§1.7), the `surface` super-property collision (§4.6), the SQL test's uncovered `FOUND`/`v_upserted` regression (§2.6), the leaked re-take audio (§1.5), and `PrivacyInfo.xcprivacy` (§7). **And the device pass itself: 44 + 6 assertions, none executed.**
