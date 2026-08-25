# Wave 1 device pass — consolidated specification

**This supersedes the plan's original 11-step script.** It is assembled from every task review in the wave.
Each item is a concrete, checkable assertion — never "verify it works".

## Why this matters more than usual

Three facts make the device pass the ONLY correctness mechanism for the wave's core:

1. `capture-gate.sh test` runs the **CaptureKit** scheme, which does **not link** `SpeechVoiceNoteService.swift`,
   `LocalCaptureSyncService.swift`, `VoiceNoteSheet.swift`, `ViewfinderModel.swift`, or any screen. Every
   green gate on those files is **compile evidence only**.
2. The passing `VoiceRecordingPolicyTests` assert the policy's constants — **not** that the recorder honours
   them.
3. Task 8 went through **four fix rounds, three of which introduced a new defect in the lines they touched.**
   That is what app-target AVFoundation code looks like with no unit test and no device pass.

## Setup

Physical LiDAR iPhone, **signed Debug build**, signing ON, team `VP22LXHT7L`:
`xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug -destination 'platform=iOS,id=<UDID>'`
**Never `capture-gate.sh build`** — it is a Simulator gate with `CODE_SIGNING_ALLOWED=NO`, and
patina-ios-verification forbids installing such a build for a walk.
Every blitz-iphone call carries an **explicit UDID**, never `booted` — simulators are also paired.
⚠ **The attached iPhone must be UNLOCKED.** While passcode-locked it poisons gate runs (602 s vs ~27 s of
real tests) and blocks this pass entirely.

## THE headline check — do this first

**1. A normal 15 s note still keeps its audio.**
Publishing a segment filename is keyed on `frames > 0`. If the write path throws on device for ANY reason,
every segment takes the delete branch and **the recorder silently discards all audio while reporting
success** — indistinguishable from the pre-Task-8 bug. Assert:
- `voice-<uuid>-000.m4a` exists in the App Group media dir
- `afinfo` reports AAC-LC at the hardware sample rate, duration within ±1 s of 15 s
- **size > 20 KB** — a header-only file is ~1 KB, so a size floor distinguishes "wrote" from "opened"
- it is audibly intelligible on playback
- **PostHog shows NO `voice.audio_write_failed`** for this note

### `voice.audio_write_failed` is the diagnostic key
Its mere presence on a normal note means the recorder is broken — a silent room still writes frames.
| reason | buffers | meaning |
|---|---|---|
| `write` + `detail` | any | `AVAudioFile.write` threw. **The failure the telemetry exists to surface**; `detail` is the diagnosis |
| `open` | — | AAC settings rejected; no file ever existed |
| `empty` | `0` | instant tap-release — **benign, not a fault** |
| `empty` | `>0` | every buffer rejected by the channel/sample-rate guard — the expected AirPods signature |
| `resume` / `route` | — | interruption-resume or config-change reconfiguration threw |
⚠ `buffers` counts buffers that **reached the segment**, not writes attempted.

## Recorder (Task 8)

2. **Instant tap-release (<200 ms).** Assert `voiceAudioSegmentsRaw` is EMPTY, `voiceAudioFilename` nil, no
   orphan file, and **the note still syncs**. Then take a real note and assert it gets index `-000` — proving
   index reuse after a delete.
3. **3-minute note on F2 (toggle, not hold).** Exactly ONE `.m4a` of ~3 min (not four). Transcript contains
   words spoken in the **third minute** — proves rotation ran and the >60 s truncation is fixed.
   `voice.segment_rotated` appears ~3 times.
   ⚠ This is also THE check for the **isFinal-at-rotation** defect. `rotate()` calls `endAudio()` on the
   outgoing request, which is exactly what makes Speech deliver a **final** result for it — and the first
   request's callback finished the note's stream on `result.isFinal`, so the note ENDED at the first ~50 s
   rotation. Say the running time aloud at 0:20, 1:10 and 2:10 so each minute is greppable, then assert:
   - the transcript pane is **still growing at 1:30, 2:00 and 2:30** — not frozen at what it read at ~0:50;
   - the attached transcript contains the **third-minute** phrase ("two ten") **and** the first-minute one
     ("twenty") — the carry must survive every rotation, not only the last;
   - the word count keeps rising **across rotations 2 and 3**, proving rotation N+1 behaves like rotation 1
     (both are now built by the same `recognitionHandler`);
   - **no `voice.finish` fires before the toggle stops the note** — exactly one, `reason=manual`, at the end,
     and never `reason=cap` on a 3-minute note.
   ⚠ Pre-fix signature: a ~3 min `.m4a` under a transcript that stops at ~0:50, and a sheet that fell out of
   recording on its own.
4. **Two notes back to back on one screen.** Two distinct UUID prefixes; note 2's audio is note 2's only;
   note 1's file complete and playable; specimen 2's `voiceAudioSegmentsRaw` holds only note 2's names.
5. **Incoming call mid-note.** `voice.interrupted reason:began` fires; `-001.m4a` appears after; both segments
   play; two entries in `voiceAudioSegmentsRaw`. **Then keep talking 90 s more and confirm the transcript
   still updates** — if `openSegment` failed on resume, rotation is dead and the transcript freezes.
6. **THE CRASH SEQUENCE.** Start a note → take a call → **stop the note DURING the call** → start a second
   note. Assert no `nullptr == Tap()` crash **and that note 2's first segment is non-empty** — proving the
   second `installTap` delivers buffers rather than merely not trapping.
7. **Decline the call** (`.ended` without `.shouldResume`). Record what the note contains and confirm the mic
   indicator is out. Today `noteIsActive` stays true, engine stopped, no rotation, no cap, and **no analytics
   marks it**.
8. **AirPods connect mid-note, then disconnect.** Beyond "no crash": `afinfo` the `.m4a` and **compare its
   duration to wall-clock**. Count segments before/after — one connect should yield exactly ONE new segment.
   Assert `voice.audio_write_failed reason=route` count is 0.
9. **WIRED headset mid-note** — commonly the same 1ch/48 kHz as the built-in mic, so the format-delta guard
   may skip the reopen. Assert audio runs to the end and the transcript is **not** truncated at ~60 s.
   *(This is the deferred finding; measure before deciding whether to harden.)*
10. **Cap probe** — lower `maxNoteSeconds` in a Debug build or hold 20 min. Assert **exactly one**
    `voice.finish reason=cap` (not a burst), engine stopped, `.m4a` stops growing within 1 s, the **orange mic
    dot goes out at the cap** (not when the button is released), and no later `voice.segment_rotated`.
10b. **The full-length note at the REAL cap (20 min), unlowered.** The one run that prices rotation at
    scale and proves the isFinal-at-rotation fix holds at rotation 23, not just rotation 1. Start a note and
    do not touch Stop. Say the minute aloud at 0:30, 10:30 and 19:30. Assert:
    - **~23 `voice.segment_rotated`** events — 1200 s / 50 s is 24 requests, hence 23 rotations. Not 1, not 0;
    - the stream ends **only at the cap**: exactly one `voice.finish`, `reason=cap`, at ~20:00, with **no**
      earlier finish at ~0:50, ~1:40 or any other rotation boundary;
    - the transcript carries the **first-, tenth- and twentieth-minute** phrases — grep all three out of
      `voiceTranscriptRaw`; a transcript holding only the last minute means the carry is being clobbered by
      a stale request rather than joined;
    - `voiceDurationSeconds` reads ~1200, not ~50;
    - the `.m4a` durations by `afinfo` sum to ~20 min and `voiceAudioSegmentsRaw` names every file (step 41's
      last-segment assertion applies here too);
    - `endedAtCap` is reported and the cap line renders (step 40).
    ⚠ Pre-fix signature: `voice.finish reason=manual` at ~50 s with one minute of words.
11. **Hot-mic probe.** Make `startLiveTranscription` fail after the observers arm, let the sheet fall to manual
    entry, then take and end a call. Assert the orange dot does **not** light and no new `voice-*.m4a` appears.
12. **Recognition-error door.** Force a recognition failure mid-note. Assert the sheet flips to manual entry,
    the mic indicator goes out, and the note attaches with `voiceAudioSegmentsRaw` populated and
    `voiceTranscriptSourceRaw = "device"` — **not** `"designer"`.
13. **The mirror case.** Engine-start failure with **nothing** recorded, then type by hand → must attach as
    `"designer"` with no duration. (Round 3 broke this; round 4 fixed it.)
14. **Abandon mid-recording.** Swipe the N4 sheet away while recording. Mic indicator clears, other-app audio
    resumes, no file keeps growing.
15. **Rotation soak.** Three consecutive 3-min notes on one screen (~10 rotations) under ASan/Zombies — the
    only way to price the parked render-thread races.
16. **Bitrate sanity.** Record a speaker 2 m away with HVAC noise; listen back. 32 kbps at 48 kHz is
    aggressive for a field note, and this is the last chance to change it before it becomes the record.

## N4 sheet and playback (Task 15)

16b. **Discard actually deletes — and the UI cannot tell you.** The broken version dismissed the sheet
    *identically* to the working one, so a visual walk would have passed a completely broken deletion.
    Record a note, **tap Discard inside the finish window** (immediately on releasing the mic, before the
    result lands), then **list the App Group media directory** and assert the segment files are gone.
    Repeat tapping Discard while still recording. Both paths must leave no `.m4a`.
16c. **Playback.** Play a multi-segment note from the N4 sheet and from the tray row; assert every segment
    plays in order and a deliberately-deleted middle segment is skipped rather than ending playback.
16d. **Player does not clobber a recording.** Start a second take on the same sheet: assert the ladder line
    and the Play control do **not** render over the live take (they showed take 1's state before the fix).
16e. **Session teardown.** Tap Play in the tray, navigate away mid-playback: audio must stop and the user's
    music must resume. Before the fix it played on with no visible control.
16f. **Mid-hold cap restart.** With the cap lowered, hold past the cap and keep the finger down, wiggling:
    assert a brand-new note does **not** start. Then release and hold again: a second take **must** start.
16g. **Tray row affordances.** The chevron and the status chip must both be tappable, and VoiceOver must
    announce the row coherently (two elements per row is expected).

## Upload / sync (Task 9)

17. **Multi-segment note, all present.** All N objects land in `<uid>/<clientToken>/`; `voiceAudioRemotePathsRaw`
    stamped with all N; a second drain does **not** duplicate entries.
18. **Force a lost segment before the FIRST drain** (delete one local file). Assert the note **commits**
    transcript-plus-surviving-audio and is **NOT** `.rejected` — pre-fix it was permanently orphaned from the
    auto-drain query.
19. **5a partial loss** → `audioSegments` short by N, `audioLost: true`.
    **5b total loss** → `audioSegments` is **present and empty `[]`** (not an omitted key), `audioPath` nil,
    `audioLost: true`.
20. **Non-contiguous array.** A commit whose `voice.audioSegments` ends `-000` and `-002` must round-trip
    exactly, with `projection_errors` absent/empty.
21. **Mid-drain network failure** on segment 2 of 4 (airplane toggle). Note re-queues (not rejected); next
    drain uploads the rest without re-appending stamped ones.
22. **Multi-drain replay** — drain through 2+ deferred commits; assert `voiceAudioRemotePathsRaw` has no
    duplicates.

## Placement (Tasks 7, 11, 12)

23. **Shutter → card → placement line → project → room → Done.** Count the taps honestly. Assert it lands back
    on the **live camera with the card still visible**, now showing the placed name — not S4/S5, not a bare
    viewfinder.
24. The card's label updates **without a manual refresh** after Done.
25. **Swipe-dismiss S1** (drag down, not ✕/Done) — does the placement survive? *(Parked finding; no
    `.interactiveDismissDisabled` exists on this path.)*
26. ✕ with a project chosen but **no room** → persists the project alone; the next capture inherits it.
27. **The next capture in the session** shows a non-terracotta label on ITS card without a second trip through
    S1 — proving `stamped(onto:)` reaches the render path, not just the persisted specimen.
28. Open S1 from the **deep-link harness, S2, and the tray** — none writes `capture.routingSource`, so none
    may show the "Done" primary.
29. **Tray footer** reads "Place N" with unplaced records and "Review placement" with none; tapping opens
    exactly ONE record. **Bulk routing must NOT have shipped.**

## Offline (Task 13)

30. **Airplane mode** → banner appears within a second showing the **OUTBOX depth**, not the session count.
    Verify with 12 already-synced captures and nothing queued: it must **not** say "12".
31. Capture a photo and a note offline → restore signal → **queue drains with no tap**, banner disappears.

## Honesty copy (Task 14)

32. **In a genuinely loud room**, record so recognition returns nothing while audio is captured. Toast reads
    exactly *"We couldn't make out the words — the audio is here."* **and is still on screen a moment later** —
    the original bug was a success toast overwriting it two lines down.
33. With transcript **and** audio both empty → *"Nothing was recorded — try holding the mic a moment longer."*
    (proves the else-branch did not regress).

## The §15.4 ladder rungs built in the merge-review fix round

37. **Recognizer unavailable → the note still records (N4).** Force it one of two ways: Settings →
    Privacy → Speech Recognition → **deny** for Patina Field, or put the phone in airplane mode with a
    locale whose recognizer needs the server. Hold the mic on the N4 sheet and speak 20 s. Assert:
    - recording actually starts — the orange mic dot lights, the elapsed counter runs;
    - the transcript pane reads **exactly** *"We'll write this up when it lands."* and never
      *"Your words appear here as you speak…"*;
    - `voice.start` carries `transcribing=false`;
    - on release the sheet falls to the **typed editor**, whose explanatory line is the same
      *"We'll write this up when it lands."* — not *"Voice capture isn't available here."*;
    - Play is offered and the recording is **audible**;
    - `voice-<uuid>-000.m4a` exists with size > 20 KB and no `voice.audio_write_failed`;
    - the primary reads **"Keep the recording"**, and attaching writes
      `voiceAudioSegmentsRaw` with the segment and `voiceTranscriptSourceRaw = "device_partial"`.
    Pre-fix this door recorded **nothing at all** — `startLiveTranscription()` threw before the audio
    session was configured.
38. **Recognizer unavailable → the note still records (F2).** Same denial, from the in-scan overlay:
    tapping **Note** must start recording and toast *"We'll write this up when it lands."* immediately —
    **not** *"Microphone unavailable"*, which is now reserved for a genuine session/engine failure.
    On Stop, the capture enqueues with its segments and the same line as the closing toast, and
    `voice.empty_transcript` carries `had_audio=true`.
39. **Speech denied but the microphone granted still reaches the recorder.** With Speech Recognition
    denied and Microphone allowed, open N4 cold: the sheet must present the **live recorder**, not the
    typed editor. (`requestAuthorization()` no longer returns false on a speech denial — the mic is the
    only permission a voice note requires.) With the **microphone** denied, the typed editor is still
    correct and nothing records.
40. **The cap says so, on both surfaces.** With `maxNoteSeconds` lowered in a Debug build, run past the
    cap from N4 and from F2. Assert the line is **exactly**
    *"This note reached twenty minutes and stopped. Start another when you're ready."* — on N4 as a line
    under the transcript pane (and still readable after the sheet falls to the typed editor), on F2 as
    the closing toast, where it **outranks** both "Note saved to this room." and the no-words rung.
    Never *"note ended at 20:00"*, which was withdrawn for parsing as a clock time.
41. **The capped note keeps its LAST segment.** Same lowered cap, on a note that has already rotated at
    least once. Assert `voiceAudioSegmentsRaw` names **every** segment including the final one, that
    each named `.m4a` exists on disk, and that the media directory holds **no** `voice-<thisNoteID>-*`
    file the specimen does not name. Then let it sync and assert the same count in
    `voice_audio_segments` server-side. Pre-fix the consumer's `finish()` could win the main-queue race
    against `endAtCap()` and hand back a result missing the last segment — up to 50 s, orphaned forever
    because the retention sweep only ever considers receipted files.
    Assert alongside it: **exactly one** `voice.finish reason=cap` (see step 10), now emitted from
    `endAtCap()` after the close rather than from `rotate()` before it, so its `segments` property
    counts the final segment.
42. **A typed re-attach cannot erase synced audio.** Record and attach a note on a specimen, let it
    sync (confirm `voiceAudioRemotePathsRaw` is stamped and the local `.m4a` files are gone), then
    **re-open the N4 sheet on that same specimen**, edit the text, and Attach again. Assert
    `voiceAudioSegmentsRaw` and `voiceAudioFilename` are **unchanged**, `voiceDurationSeconds` still
    reports the recording, and after the next drain the server still holds the same
    `voice_audio_path` / `voice_audio_segments` — not `NULL` / `'[]'`. Repeat with the
    `field-companion-voice` flag **off**, which is the two-tap route into that editor.

## Server-side confirmation (terminal, not phone)

34. Against the target DB, for the captures from step 23:
    `select client_capture_id, status, project_id, project_room_id,
            jsonb_array_length(voice_audio_segments) as segs, capture_kind, transcript_source
       from field_captures order by created_at desc limit 10;`
    Expect all three placed captures to carry `project_id` **AND** `project_room_id` on the **inbox** path.
⚠ **Nothing in the SQL suite proves RLS** — the runner connects as superuser. Do not report RLS as verified.

## Telemetry confirmation

35. PostHog, `surface='field-ios'`, from **the installed build** (not an Xcode scheme run):
    `voice.finish` present carrying **`segments` and `on_device`** (acceptance criterion 7);
    `capture.place_tapped`; `sync.reconnect_drain`.
36. **`on_device` must actually appear** — if it does not, the parked "onDevice is a dead property" finding
    from Task 6's review revives.

## What CANNOT be claimed without this pass

Acceptance criteria 1–9 are all device-gated. Criterion 7 additionally requires the events to come from a
**pilot-style install**, not a scheme run — the simulator proof already obtained does not satisfy it.
