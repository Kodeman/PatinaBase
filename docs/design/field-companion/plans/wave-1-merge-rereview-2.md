# Wave 1 — merge RE-review round 2 (tight scope)

**Branch:** `feat/field-companion-w1`
**Worktree:** `/Users/kody/Code/patina-merged/.claude/worktrees/field-companion-w1` — read-only; no file in it was touched, no git mutation, no build.
**Range reviewed:** `4a0f6d5fb..2d3a13ee6` — `350ebee52` (N1) · `6bad472d3` (N2) · `fce21a955` (N6) · `9a65a6209` (N7/N8 docs) · `2d3a13ee6` (ledger snapshot). 5 files, +126/−19.
**Against:** `wave-1-merge-rereview.md`'s N1, N2, N6, N7, N8, plus a hunt for new breakage in this diff only.
**Reviewed:** 2026-08-25. Device pass still NOT run.

All line citations below are the branch head `2d3a13ee6`. Swift paths are relative to the worktree root.

---

## Verdict

# MERGE — every targeted finding is genuinely closed; one new low-severity residual found and documented, not a blocker

N1, N2 and N6 are fixed correctly and completely, not narrowed. N7 and N8 are fixed and independently re-verified against the live Strata ledger (below) — the doc no longer disagrees with prod. Docs parse. One new, narrow, low-confidence cross-note race on the `transcribing` flag is introduced by N1's fix (first time that field is read off the main actor); it has no reachable trigger in the current call graph and is graded a follow-up, in line with the prior round's calibration for equally narrow findings (N4/N5).

| # | Finding | Status | Sev | Conf |
|---|---|---|---|---|
| N1 | `rotate()` recognition-off guard | **ADDRESSED** — `SpeechVoiceNoteService.swift:731-734`, placed after the cap branch | — | 0.95 |
| N2 | generation retired before `endAudio()`/`finish()` | **ADDRESSED, fully** (not just narrowed) — `:760-762` | — | 0.9 |
| N6 | F2 mic/speech authorization | **ADDRESSED** — `SiteScanContextCapture.swift:112-138`, latch is leak-proof | — | 0.9 |
| N7 | 00514/00515 prod state | **ADDRESSED, independently re-verified** — Strata ledger read below | — | 0.98 |
| N8 | 00531 filename | **ADDRESSED** | — | 0.95 |
| **N9 (new)** | `transcribing` now read cross-thread on `rotationQueue` with no per-note identity guard, unlike `noteIsActive`/generation | follow-up | low | 0.3 |
| **N10 (new, doc-only)** | `transcribing`'s field comment (`:172-178`) argues only "cannot be read torn," not "cannot belong to a different note" — the claim it actually needs for the new read site | follow-up (comment accuracy) | low | 0.5 |

---

## 1 · N1 — recognition-off rung survives rotation — ADDRESSED

`SpeechVoiceNoteService.swift`, `rotate()` (`:688-772`):

```
693  if VoiceRecordingPolicy.shouldEnd(totalElapsed: elapsed, segmentCount: audioSegments.count) {
694-717   ... noteIsActive = false; stoppedAt = Date(); segmentStartedAt = nil; endedAtCap = true;
          DispatchQueue.main.async { self?.endAtCap(...) }
718      return
719  }
...
731  guard transcribing else {
732      segmentStartedAt = Date()
733      return
734  }
```

**(c) Cap-before-guard ordering — CONFIRMED.** The `shouldEnd`/cap branch (`:693-719`) runs unconditionally, before the `guard transcribing` (`:731`). A recognition-off note that reaches `maxNoteSeconds` still takes the cap branch and gets torn down normally — the 20-minute cap is enforced identically for recognition-on and recognition-off notes. This is exactly the ordering the prior round's minimal-fix suggestion asked for ("the cap check ... must keep running either way").

**Guard body correctness.** For a note that started with `transcribing == false` (§15.4 rung), `rotate()` now does nothing but re-arm `segmentStartedAt = Date()` and return — no `SFSpeechAudioBufferRecognitionRequest` is built, no `recognitionTask` is started, `request`/`task` stay `nil` for the note's whole life (as set in `startLiveTranscription()`, `:294-296` per the prior round's citations). There is therefore no request left to error against `isLiveGeneration`, so `endAbandonedNote()` (`:454`/`:617-632`) can no longer fire from a rotation on this class of note. The blocker is closed at its root cause, not patched around the symptom.

**Device-pass coverage added.** `waves/wave-1/device-pass-spec.md:202-217` adds step **37b**: hold the mic for **70 s** (past the 50 s rotation boundary), asserting no `voice.finish` before release, no `voice.segment_rotated`, exactly one `voice.finish reason=manual` on release, and a single continuous `.m4a`. This is the exact gap the prior round called out ("step 37 speaks for only 20 s and cannot catch this").

**(a) Is `segmentStartedAt` a locked/main-only field, and can the re-arm on `rotationQueue` race the tap's `shouldRotate` read?**

No, and this is pre-existing, not introduced by N1. `segmentStartedAt` (`:161`, `private var segmentStartedAt: Date?`) carries **no** lock and **no** thread-safety doc comment — unlike every other cross-thread field in this file (`request`/`task`/`audioSegments`/`continuation`/`transcriptBox` are all lock-backed computed properties; `noteIsActive` and `transcribing` each carry an explicit "single byte, cannot be read torn" comment). It is written from three different execution contexts unsynchronized:

- MainActor: `startLiveTranscription()` (`nil` at note start), `openSegment()` (`:551`, `Date()`)
- `rotationQueue`: `rotate()`'s cap branch (`:702`, `nil`) and both continuing branches (`:732` new, `:767` pre-existing)
- render thread (tap): read-only, via `requestRotationIfNeeded`'s `guard ... let startedAt = segmentStartedAt ...`

This is a real, formally-a-data-race field, but **N1 does not add a new crossing**: the re-arm at `:732` writes the exact same field, from the exact same queue (`rotationQueue`, inside `rotate()`), that already wrote it unconditionally at `:767` on every rotation before this fix. It relocates one of two pre-existing writes earlier in the function on a path that previously reached `:767` anyway (via the request/task-build detour). The `rotationInFlight` latch (set `true` on the render thread before posting, cleared via `defer { rotationInFlight = false }` at `rotate()`'s very first line, which covers the new guard's early return too) prevents the render thread from re-entering `requestRotationIfNeeded`'s `segmentStartedAt` read while a rotation is in flight — `!rotationInFlight` is evaluated before `segmentStartedAt` in the guard's comma-list, so a concurrent read never happens while a write is pending. The residual hazard (no compiler-enforced memory barrier tying `rotationInFlight`'s flip back to `false` to visibility of the `segmentStartedAt` write beneath it) is symmetric with the pre-existing `:767` write and was not introduced here. Not a new finding; carried-forward pre-existing gap, worth a doc comment someday but out of this diff's scope.

---

## 2 · N2 — generation retired before the provocation — ADDRESSED, fully

`:757-762`:

```
760  let generation = carryForwardAndAdvance()
761  request?.endAudio()
762  task?.finish()
```

**(d) Reorder keeps B1's lock discipline, and the old request's error can no longer read as live — CONFIRMED.** `carryForwardAndAdvance()` (`:497-503`) is unchanged: one `transcriptBox.withLockUnchecked` closure doing `carried = latest; generation &+= 1; return generation` — still one atomic step, so B1's "admission and fold are one atomic step" property is untouched. What changed is only *when* it runs relative to `endAudio()`/`task.finish()`.

Because `OSAllocatedUnfairLock` provides a real memory barrier, once `carryForwardAndAdvance()` returns (at `:760`, still synchronously on `rotationQueue`, strictly before `:761`), any *subsequent* lock acquisition against `transcriptBox` — including `isLiveGeneration` (`:477-479`) called later from the old request's terminal callback on the Speech-callback thread — is guaranteed to observe the new generation. `endAudio()`/`task.finish()` are what *provoke* that callback (`:761-762`), and they run strictly after the generation bump. So by construction, the old request's callback (however soon it fires) can never observe itself as live: `isLiveGeneration(oldGeneration)` is false the instant it's checked, whether the callback delivers a result or an error. This closes N2's window outright rather than narrowing it — the prior round's own fix recipe ("mark the outgoing generation ineligible for errors before `:728`") is achieved here by a different, equally sound mechanism (advance the *whole* generation before the provocation, rather than adding a second field).

**Disclosed, bounded cost — confirmed as designed, not a defect.** The new comment (`:748-755`) is accurate: any partial the old request reports in the few nanoseconds between `:760` and `:761/:762` folds nowhere (`foldResult` at `:467-475` rejects on generation mismatch) and is lost. This is a few-word boundary loss, not the up-to-50-second loss N2 originally risked, and is explicitly justified against §8.2 ("the audio is the record"). Consistent with the ruling the prior round already reached for N3.

No lock-ordering hazard introduced: `carryForwardAndAdvance()` still only touches `transcriptBox`, taken and released before the (unrelated) `requestBox`/`taskBox` locks are touched by `request?.endAudio()`/`task?.finish()` immediately after.

---

## 3 · N6 — F2's door to the speech prompt — ADDRESSED

`SiteScanContextCapture.swift:112-141`:

```swift
guard !voiceAuthInFlight else { return }
voiceAuthInFlight = true
Task { [weak self] in
    guard let self else { return }
    let micGranted = await self.voice.requestAuthorization()
    self.voiceAuthInFlight = false
    guard !Task.isCancelled, !self.isRecordingVoice, self.ownerScopeProvider() == scope else { return }
    guard micGranted else { self.toast = "Microphone unavailable"; return }
    self.beginVoice(scope: scope)
}
```

**(e) Latch cannot be left set on throw/false, and a scope change during the await is handled — CONFIRMED, more thoroughly than asked.**

- `requestAuthorization()` **cannot throw** — its signature is `func requestAuthorization() async -> Bool` on the protocol (`CaptureKit/CaptureKit/Recognition/RecognitionServices.swift:96`) and both conformances (`SpeechVoiceNoteService.swift:243`, `CaptureKitMocks.swift:72`); the call site has no `try`. So the "left set on throw" failure mode cannot occur by construction, not merely by discipline.
- `voiceAuthInFlight = false` (`:127`) runs **unconditionally** immediately after the `await` resolves, before any of the later guards — it cannot be skipped by a `false` return, a scope change, or cancellation.
- The class is `@MainActor` (`SiteScanContextCapture.swift:14`) and the `Task { }` is non-detached, so it inherits MainActor isolation; there is no further `await` between `voiceAuthInFlight = false` and `beginVoice(scope:)`, so this stretch runs as one atomic unit of MainActor work — a second tap cannot interleave between the reset and the guards that follow it.
- Scope change during the await is explicitly handled: `self.ownerScopeProvider() == scope` re-reads current scope and compares to the value captured at call time; a changed scope (owner left the room / backgrounded) bails without starting a note, exactly as the new comment (`:130-131`) states. `!self.isRecordingVoice` additionally guards against a race where recording was started through some other path in the interim.
- Re-entrancy: `guard !voiceAuthInFlight else { return }` (`:122`) makes a second tap on **Note** during the modal prompt a no-op, closing the exact gap N6 named ("a second tap on Note during the prompt starts a second one").

`voiceAuthInFlight` (`:40`) has exactly the three references above — no other write site exists anywhere in the file (grepped), so there is no path that leaves it stuck `true`.

---

## 4 · N7/N8 — docs, independently re-verified against prod

`docs/engineering/migration-number-reservations.md` diff corrects both rows. Re-ran `list_migrations` against Strata (`bkvcixdmuyejfzcijpdg`) directly rather than trusting the prior round's citation:

```
... "00513","invoice_numbering_studio_uniqueness"
"00514","capture_enrichment_ledger"
"00515","capture_enrichment_rpcs"
"00516","capture_producer_idempotency"
"00521","svc_media_shape_reconciliation"   ← prod head
```

**N7 — CONFIRMED fixed and CONFIRMED correct.** 00514, 00515 and 00516 are all present on prod. The new row text ("APPLIED TO PROD 2026-08-25 (~09:30Z) by the Phase 3 lane, together with 00515/00514/00516... Staging still owes 00514/00515/00516") matches the ledger exactly, and 00530/00531 are correctly absent from the ledger (not yet applied), matching the doc's "local replay only" / "drawn" language.

**N8 — CONFIRMED.** The doc now names `00531_grant_uuid_generate_v5_authenticated.sql`, and a note (`⚠ Filename corrected 2026-08-25`) records the prior error rather than silently overwriting it — consistent with this doc's own convention elsewhere (e.g. the 00516 row's earlier correction note).

**Docs tables still parse (f).** Both edited tables (`migration-number-reservations.md`'s two 3-column tables) keep exactly 3 columns per row (leading/trailing pipes plus 2 internal separators) in every edited row; no stray literal `|` was introduced into any cell's prose. `device-pass-spec.md` and `progress.md`'s additions are prose/list-only — no tables touched there. All parse correctly.

---

## 5 · New breakage hunted for in this diff

### N9 (new) — `transcribing` is now read cross-thread with no per-note identity guard — follow-up, low/0.3

This is the one genuinely new thing this diff does: `:731`'s `guard transcribing else` is the **first** read of `transcribing` from `rotationQueue` in the file's history — every prior read was `@MainActor` (`isTranscribing`, `:263`). The field's doc comment (`:172-178`) argues this is safe because it "cannot be read torn" (single byte, written once before the note starts). That argument is correct for **torn reads within one note's lifetime** — `transcribing = available` (`:287`) runs strictly before `noteIsActive = true` (`:306`), which is itself a hard precondition for `requestRotationIfNeeded` ever reaching `rotate()` (`:673`, `guard noteIsActive, ...`), so within a single note there is no window where `rotate()` can read a `transcribing` value that hasn't yet been set for that note.

What the comment does **not** address, and what "single byte, cannot be read torn" does not by itself rule out, is a **cross-note** read: `finish()`/`discard()` do not drain `rotationQueue` before returning (no `rotationQueue.sync {}` barrier anywhere in the teardown path), so if a rotation for note N is still in flight on `rotationQueue` at the exact moment `startLiveTranscription()` for note N+1 overwrites `transcribing` on MainActor (`:287`), the in-flight `rotate()` call could read note N+1's value while acting on note N's request/task. Unlike `noteIsActive` (single byte, but every `rotate()` call is already scoped by the `noteID`-carrying continuation parameter for its terminal effects) and the transcript generation (explicit `&+=` identity check via `isLiveGeneration`), `transcribing` carries no per-note identity — a stale read is indistinguishable from a live one.

**Why this stays a follow-up, not a blocker:** the actual window is far narrower than it sounds. `rotate()`'s in-flight duration on `rotationQueue` is a handful of synchronous statements (`recognizer.recognitionTask(with:)` returns a task handle immediately; it does not block on XPC/network) — realistically sub-millisecond, not bounded by recognition latency. Reaching this window requires a new note to begin within that sub-millisecond gap after the previous one's rotation was dispatched. Nothing in the current call graph does this: the only path to a new note is a human re-tap of **Note**/the mic pill after `await voice.finish()` returns, and no code path here auto-restarts a note immediately after a capped or failed one (`stopVoice(reason: .capped)` in `SiteScanContextCapture.swift` just calls `stopVoice()`, no re-arm). This makes N9 narrower than the prior round's own N4/N5 (which needed only "a finger lift + re-press" or "a coincident user action" within a runloop turn, not a sub-millisecond one), and I'm grading it accordingly below the low/0.6 bar those carried.

**N10 (new, doc-only) — the field comment's safety argument is incomplete for its own new use.** `:172-178`'s comment justifies the `rotationQueue` read only against torn-read risk. Since this round adds the first cross-thread read of this field, the comment should also state the reason cross-*note* staleness doesn't matter (namely: the practical unreachability argued above, or better, an explicit identity guard if one is ever added). Low severity — it's a comment, and the underlying risk is real but not currently reachable — but worth closing before this pattern is copied elsewhere in a context where it *would* be reachable (e.g. any future auto-restart flow).

**No other new breakage found.** Verified specifically and found clean:
- No new lock-ordering issue: N2's reorder only moves an existing `transcriptBox` acquisition earlier; no new lock is introduced or nested.
- No regression to B2's cap-teardown ordering: the cap branch (`:693-719`) is untouched by this diff.
- No regression to B1's computed-property discipline: `request`, `task`, `audioSegments`, `continuation` are all still accessed exclusively through their lock-backed properties in the touched code.
- `voiceAuthInFlight`'s addition doesn't shadow or collide with any existing state in `SiteScanContextModel` (grepped for the exact name, only the 4 references cited above exist).
- `beginVoice(scope:)`'s extraction is a pure lift of the old `startVoice()` body with no logic change — `try voice.startLiveTranscription()` and the `voiceTask` construction that follows it are byte-for-byte what they were before, just now called from one site (the async continuation) instead of inline.

---

## 6 · Residuals, sorted

### Blocker — none

### Follow-up — merge without, but docket them

- **N9** — `transcribing`'s cross-thread read on `rotationQueue` has no per-note identity guard; theoretically reachable only via a sub-millisecond note-restart race that no current caller can trigger. Low priority; revisit if an auto-restart flow is ever added.
- **N10** — extend `transcribing`'s field comment (`:172-178`) to state why the new `rotationQueue` read is safe against cross-note staleness, not just torn reads.
- Everything already carried in `wave-1-merge-rereview.md` §7 that this round did not touch: **N3** (ruled — a live request's recognition error should retire recognition, not the note; needs a mid-note not-transcribing surface state, wave 2), **N4** (`endAtCap` reads `latestTranscript` outside the identity guard), **N5** (`finish()`'s early return can miss the final segment in the cap-hop window), the `SpeechVoiceNoteService.swift:425-426`-region comment that still names `finish()` as a stream-finishing door (unchanged by this diff — worth re-checking its exact current line number before landing, since this diff shifted line numbers below it), the merge-ordering note on the regenerated `project.pbxproj`, and everything carried forward from the original review (§1.5–§1.9 etc., the untested X1 fix, the `surface` super-property collision, the SQL test's uncovered `FOUND`/`v_upserted` regression, leaked re-take audio, `PrivacyInfo.xcprivacy`).
- **The device pass itself remains unrun** — 44 + 6 + 1 (37b) assertions, none executed. `waves/wave-1/README.md`'s own caveat stands: `capture-gate.sh test` does not link `SpeechVoiceNoteService`, so the device pass is the only correctness mechanism for everything reviewed in §1–§3 above.
