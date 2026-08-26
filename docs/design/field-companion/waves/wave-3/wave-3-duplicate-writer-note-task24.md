# Task 24 — duplicate-writer note (stood down)

**Author:** a second Task 24 implementer, dispatched while another writer was live in the
same worktree.
**Outcome:** stood down without committing. Task 24 was already delivered by the other
writer, and the worktree has since moved several tasks past it.

## What happened

I was briefed to implement Task 24 on `field-companion-w3` at HEAD `3dc2613e5`, with the
usual first step: check `git log --oneline -3` (saw only `3dc2613e5` at HEAD, no Task 24
commit) and `mkdir .superpowers/sdd/wave-3-plan/writer.lock.d` (succeeded). Both checks read
as "clear to proceed." That reading was wrong — another writer was live in this same
worktree and picked up Task 24 either just before or just after my checks, in a window my
checks didn't catch.

I did the full implementation independently: read `VoiceNoteSheet.swift`, confirmed the same
three plan defects the brief warned about (stale line numbers, no `model.toggleVoice()`, the
FC-R19 premise being false), wrote my own toggle-button implementation, added
`FieldVoiceModeCopy.toggleLabel`/`toggleGlyph`, wrote the same two plan-specified tests,
implemented the FC-R19 gap (deleting a specimen's already-persisted
`voiceAudioSegmentsRaw`/`voiceAudioFilename` on Discard, alongside — not instead of — the
existing in-flight-take deletion), ran the red-step check, restored it, and ran a full
`xcodebuild build` for the app target. Partway through that build I checked `git log` again
(prompted by a system note that the files I'd edited had "changed on disk" to content I
didn't recognize) and found the branch had moved to `cb89e20a5`, five commits ahead of my
starting point, including a commit that already does exactly this task.

Their commit:

| sha | time | subject |
|---|---|---|
| `57999d6a4` | 22:09:20 | feat(field): N4's hold becomes the same toggle, and Discard deletes what it abandons |

Diff stat: `VoiceNoteSheet.swift` +95/-28, `FieldVoiceModeState.swift` +10, `VoiceModeTests.swift`
+15 — the same three files my brief named. The commit message names the same three defects I
had independently found: the toggle replaces the hold gesture; `FieldVoiceModeCopy` gets the
new label/glyph statics; and FC-R19's real gap is "the audio already persisted on the
specimen... this sheet is re-openable on a note that carries audio" — not the in-flight take,
which the existing race-safe `discard()` logic already handled. That is the same narrower
diagnosis my brief's Defect C pointed at, reached independently by the other writer.

The worktree kept moving after that commit, all still ahead of anything I touched:

| sha | time | subject |
|---|---|---|
| `2abf9cbca` | 22:50:19 | feat(field): the tray says what it holds — the visit by name, or the unplaced |
| `4e174ea35` | 22:58:41 | fix(field): make the gesture contract load-bearing, and stop offering to end a visit that isn't open |
| `cb89e20a5` | 23:05:16 | feat(field): the suggestion lane — a question with its basis in words |

`4e174ea35` touches `VoiceNoteSheet.swift` again ("make the gesture contract load-bearing") —
worth flagging to whoever reviews this wave that Task 24's real final state is as of
`4e174ea35`, not `57999d6a4` alone; I did not read that diff (stop-immediately took priority
over further investigation once the collision was confirmed).

`writer.lock.d` itself flickered between existing and not-existing across my last few checks
in the same few minutes — direct evidence the other writer is (or very recently was) actively
cycling it for tasks past 24, not merely a stale leftover. I am **not** touching the lock
(neither creating nor removing it) so as not to race a live process's own mutex.

## Interference I caused — disclosed, not hidden

I did not know another writer was live, and my activity overlapped theirs:

1. **I edited the same three files independently.** My `Edit` calls to `VoiceNoteSheet.swift`,
   `FieldVoiceModeState.swift`, and `CaptureTests/VoiceModeTests.swift` ran across a session
   that (going by file mtimes I observed: 22:54–22:58) overlapped the other writer's own
   edits to the same files, including whatever produced their `4e174ea35` fix at 22:58:41.
   Some of that fix commit may be them re-establishing content my writes clobbered — I can't
   rule it out.
2. **I ran `xcrun simctl shutdown all`** directly once, plus once more implicitly inside
   `scripts/capture-gate.sh test` during my red-step check. This SIGTERMs any in-flight
   `xcodebuild test`. If the other writer had a test run going in that window, I killed it.
3. **I ran a full `xcodebuild build`** for the `Capture` scheme with
   `-derivedDataPath .build/gate-derived-t24` (a path scoped to my task, so unlikely to
   collide with their derived data directly) — but it shares the same simulator device and
   `CoreSimulatorService`, so it could have contended with any build/test they had running.
4. **I temporarily commented out** the `FieldVoiceModeCopy.toggleLabel`/`toggleGlyph`
   extension in `FieldVoiceModeState.swift` for a red-step check, then restored it from a
   backup. If their process read or compiled that file during that window, they would have
   seen a spurious "no member 'toggleLabel'" failure unrelated to their own work.

Nothing of mine is committed. Nothing of mine remains on disk — `git diff` against the
current HEAD (`cb89e20a5`) is empty for every file I touched; my edits were fully superseded
by the other writer's subsequent commits.

## State I left behind

- `HEAD` = `cb89e20a5`. I committed nothing.
- Working tree clean for the three files I touched (`git diff -- apps/mobile/Capture` is
  empty).
- No stray files: my red-step backup lived at `/tmp/claude/FieldVoiceModeState.swift.bak`,
  outside the repo, and my gate/derived-data output lived under
  `apps/mobile/Capture/.build/gate-derived-t24` and `/tmp/claude/t24-*.log`, also outside
  anything the other writer's commits would touch.
- `writer.lock.d`: left exactly as found (not created or removed by me at the end — it was
  flickering under what looks like the other writer's own active use).

## The lesson for the conductor

Same lesson as Task 22's duplicate-writer note: the liveness check I was given (`git log`
showing no prior commit for this task, plus a successful `mkdir` on the lock) is not
sufficient when the other writer's own commit-then-continue loop can land a commit and
re-acquire the lock in the gap between my two checks. A worktree-level lock held for the
*entire* dispatch (not released between the log check and the mkdir, and re-checked
immediately before every gate run rather than only once at the start) would have caught this
sooner — ideally before I did a full implementation pass instead of just the initial checks.
