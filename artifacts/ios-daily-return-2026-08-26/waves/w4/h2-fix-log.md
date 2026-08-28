# W4 · lane H2 — fix round

Against `waves/w4/h2-review.md`. Branch `daily-return/w4-h2`, worktree
`.codex/worktrees/agent-dr-w4-h2`. Every blocking and major finding is answered below: changed,
or rebutted with evidence. Not pushed.

**Headline: the harness condition in `h2-notes.md` §5 was not a keychain trap — it was the gate's
own build flag, and it is gone.** `ios-gate.sh build` passes `CODE_SIGNING_ALLOWED=NO`
(`scripts/ios-gate.sh:54`), so the `.app` the first walk installed carried **no entitlements at
all** (`codesign -d --entitlements -` returns an empty dict) and the Supabase SDK's keychain
session store never persisted. That is the recorded trap
`feedback_ios_sim_walk_harness` ("NEVER install `CODE_SIGNING_ALLOWED=NO` builds for walks"),
hit in full. Building the same tree **without** that flag
(`xcodebuild build … -derivedDataPath .build/dd`) produces an app whose session survives
sign-in, relaunch and reinstall. **Every server-side claim in this lane is now sim-verified**, and
three of the findings below (M3, M4, and the timeline itself) were shot on a live account instead
of argued.

---

## BLOCKING

### B1 — a pulled saved row printed today's date · **FIXED**

`CollectionsViewModel.reconcileWithRemote` built `savedAt:` from a bare `ISO8601DateFormatter()`,
which rejects the fractional seconds `saved_items.created_at` (`timestamptz DEFAULT NOW()`,
00055:34) always carries. The `?? Date()` behind it stamped every pulled row with the sync.

The reconcile's row-building is now one testable function,
`CollectionsViewModel.localRow(from:roomIdByRemoteId:)`, and it parses with
`ISO8601DateParsing.dateOrDay` — the helper whose own comment names this trap.

Proven, not asserted (`SavedItemReconcileTests`):

- `fractionalSecondsSurvive` — `2026-06-14T18:22:07.418293+00:00` lands on **June 14**, and
  `abs(savedAt.timeIntervalSinceNow) > 86_400` fails on the old code by construction.
- `plainTimestampSurvives` — the whole-second form still parses.
- `anUnparseableDateStillYieldsARow` — a garbage string still yields the piece; the fallback
  drops nothing.

## MAJOR

### M1 — the room half never reached a server-reconciled row · **FIXED**

`TableItemModel(...)` was built without `roomId:`. The reconcile now carries a
`[remoteId: localUUID]` map built from the rooms it already fetched, and `localRow` resolves
`row.room_id` through it. Tests: `theRoomCrosses` (the line ends `· Living Room`),
`anUnknownRoomIsNoRoom` (a server room this device does not hold, and a null `room_id`, both
resolve to *no room* — never the wrong one), `noProductNoRow`.

⚠ **A second gate on this path, found on the live walk and not in the review**: the reconcile
returns early unless the *local* SwiftData store already holds rooms carrying a `remoteId`
(`CollectionsViewModel:64`). On a signed-in account whose rooms exist only server-side (Profile
reads `Rooms: 0` while Today draws two), no pull happens at all. That is pre-existing and outside
this lane; recorded in `h2-notes.md` §4 for H1/the steward.

### M2 — the seat and the Next Move could still name different projects · **FIXED, structurally**

The review is right and the original report was wrong: the two candidate sets differed
(`designer != nil` on one side only), so a designer-less urgent project split them.

There is now **one picker**, `DesignerSeat.activeProject(projects:record:decisions:proposals:invoices:)`,
called by both `DesignerSeat.make` and `DailyRoomView.liveProject`. It filters archived only, and
resolves the urgent row against that set. Where the picked project carries no designer the seat
falls through to the lead — it never names a *second* project, and `Message` never opens a thread
on one the screen is not about.

Tests: `onePickForBoth` (a `"designer": null` urgent project — the picker takes it and the seat
declines to draw), `theLeadCarriesTheSeatInstead` (same fixture with a live lead: the seat draws
the lead, `projectId == nil`), `anArchivedUrgentProjectIsSkipped`.

Live: shot `w4-h2-10` — the seat reads **Leah Hartwell · Aspen Loft Refresh**, the project the
first NEEDS YOU row (the invoice) belongs to, while `updated_at.desc` puts **Birch Hollow** first.
That is the W2 walk defect, on screen, fixed.

### M3 — the connecting rail broke between rows · **CONFIRMED, FIXED, AND SHOT**

The review's layout reasoning was correct. `.padding(.vertical, 14)` sat on the whole `HStack`, so
the marker could not draw through it.

The padding moved onto the content (the text column and the fee); the marker now spans the full
row height, and its top stub is 14 pt — the content's own top inset — so the dot lands beside the
phase name and the rail meets the row above with no gap.

Shot `w4-h2-11` (flag off) and `w4-h2-13` (flag on): five phases, one continuous rail.

### M4 — VoiceOver lost the phase fee · **FIXED**

The label builder moved to `ProjectDetailCopy.phaseVoiceLabel(name:statusLine:isCurrent:fee:)` so
it is testable, and it now appends the formatted fee. Tests
`theVoiceLabelCarriesTheFee` / `theVoiceLabelInventsNoFee` (no fee → no `$`).

Live, from the device's own accessibility tree:
`"Design Development. In Progress · Aug 14, 2026 · Sep 11, 2026 $0."`

### M5 — `CURRENT` could contradict the row's own status · **CHANGED (a ruling Fable can overturn)**

`ProjectDetailCopy.currentPhaseId` no longer marks a `current_phase` whose own row reads
`completed`; it falls through to the unambiguous `in_progress` row, or marks nothing.

Reasoning, offered for overruling rather than assumed: both halves are server facts, the app has
no way to know which the designer meant, and the function's existing doctrine is already "refuse
to guess". Suppressing the mark loses no fact — the row still prints `Completed · <dates>` — while
printing both puts a contradiction in front of the reader (C5). Tests
`aContradictionMarksNothing`, `aContradictionFallsThroughToTheRunningRow`.

If Fable prefers stated precedence in copy instead, it is a two-line revert plus a label.

### M6 — the mirror publishes presence into a world-readable column · **NOT CHANGED; ESCALATED**

Confirmed: `00013_profiles_table.sql:57-58` is `FOR SELECT USING (true)`, and this lane is the
first writer of `last_seen_at`. No code change — B §3 asks for the mirror and 00537 designed the
column — but the privacy surface is real and unruled. Written up for Fable and D in
`h2-notes.md` §4 with the concrete narrowing (a policy that admits the owner and their project's
designer) if the answer is "not everyone".

### M7 — the story's `publishedAt` was dead at the call site · **FIXED, and the override removed**

`DailyRoomView.swift:409` no longer passes `publishedAt:`. Rather than leave a parameter with no
caller, `DailyStoryCard.publishedAt` is **deleted**: the card reads `story.publishedAt` and
nothing else, so no caller can hand it a date the story does not carry. `DailyRoomViewModel`
(frozen) keeps `todayStoryPublishedAt`, now unused.

Live: the chip reads `AUG 27 · 4 MIN READ` on both roots (`w4-h2-10`, `w4-h2-12`).

### M8 — a third off-map file, undisclosed · **ACCEPTED; DISCLOSED**

`Features/Authentication/Views/AuthScreenView.swift` is not in `steward.md` §4's H2 row — the map
grants `Services/Auth/**` only, and the brief's own wording ("Services/Auth/** and
Features/Authentication/** are yours for this item") is the *brief's*, not the steward's. The
review is right that `h2-notes.md` §1 under-reported. It is now named there with the other
off-map edits, and the count is four, not two — see the next entry.

---

## Also changed in this round — a fourth off-map file, named up front

**`Patina/Core/Network/ProjectsAPIClient.swift` — `RemoteProjectPhase`, two fields.** Not granted
to H2 by `steward.md` §4 (though `ProjectsAPIClientTests` is). **No other W4 lane owns it.**
Taken because deliverable (3) — the timeline — could not render at all without it, which is why
no shot of it existed:

1. `phase_key` was declared **non-optional** while the column is nullable and is null on most
   seeded rows. One null failed the decode of the *whole array*, `listPhases` threw, and every
   project reported "Your designer is still putting the phases together" with five rows sitting on
   the wire. Verified on the live account before the fix (shot path: Birch Hollow's detail showed
   the empty state while `select count(*) from project_phases` returned 3).
2. `end_date` **does not exist** on `project_phases`; the column is `target_end_date`. The old
   name decoded nil on every row, so the second date could never print.

Call sites are all H2's (`ProjectDetailView.phaseTitle`, `phaseStatusLine`, `ProjectDetailCopy`).
Tests `aNullPhaseKeyDoesNotLoseTheList`, `theEndDateIsTargetEndDate`. **This wants the steward's
ratification like the other three; it is a two-line revert.**

---

## MINOR — what was taken, and what rides

Taken (all in files this lane already owns):

1. **#1 `roomNamesById` ran a fetch per row.** Read once for the list and threaded into
   `savedRow(_:roomNames:)` / `savedRowFooter(_:roomNames:)`.
2. **#3 the vacuous assertion.** `#expect(matched.dismissedStageRaw == nil)` is gone — it tested a
   local `let`. The test now also hands the shared singleton back: it calls `refresh()` on an
   unauthenticated session and asserts `sessionDismissedLeadIds` is empty, which is minor 7's
   behaviour as well as the cleanup.
3. **#6 no test for the note write.** `SavedItemNoteWriteTests` covers `setNote` against an
   in-memory `ModelContainer`: the note lands on the piece and on the array the screen reads, it
   survives a re-read of the store, clearing it clears it, and a piece with no `productId` is
   still noted locally (the mirror's early return).
4. **#7 `sessionDismissedLeadIds` was never cleared.** `refresh()`'s guest branch now clears it,
   beside `requests = []`.

Riding to integration, unchanged: **#2** (bisectability of `e0c60f6fe`), **#4**, **#5**
(both vacuous-but-harmless test names), **#8** (the removed match window's eight empty-state
surfaces — belongs in the walk script), **#9** (`· due Sep 1` wording — Kody's open item),
**#10**, **#11** (the note's weight — a designer's eye), **#12** (one note per product across
rooms), **#13** (watermark suite asymmetry), **#14** (dark/XXL shots).

---

## Gate

```
$ ./apps/mobile/Patina/scripts/ios-gate.sh build
** BUILD SUCCEEDED **

$ xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina \
    -configuration Debug -destination 'platform=iOS Simulator,id=D6DACCE3-…-F7C49F16736F' \
    -derivedDataPath .../agent-dr-w4-h2/.build/dd -only-testing:PatinaTests
✔ Test run with 1140 tests in 132 suites passed
** TEST SUCCEEDED **
```

(W3 left 1074; the first H2 pass took it to 1121 in 130 suites; this round adds 19 tests and two
suites — `SavedItemReconcileTests`, `SavedItemNoteWriteTests`.)

## Sim check — signed build, live session, both roots

`dr-w4-h2` (`D6DACCE3-E865-4AB5-80FF-F7C49F16736F`), every launch `-DeploymentTarget local`,
app from `.build/dd/Build/Products/Debug-iphonesimulator/Patina.app` (**signed** — see the
headline). Signed in as `client@patina.dev`.

| Shot | Root | What it proves |
|---|---|---|
| `w4-h2-10-fix-seat-follows-record.png` | flag off | The seat reads `Leah Hartwell · Aspen Loft Refresh` — the project of the first NEEDS YOU row — while `updated_at.desc` puts Birch Hollow first. The W2 walk defect, closed. Story chip `AUG 27 · 4 MIN READ` |
| `w4-h2-11-fix-phase-timeline.png` | flag off | The timeline: five phases, **one continuous rail**, status + both dates + fee per row. Nothing is marked CURRENT — `current_phase` is null and two rows claim `in_progress`, so the app refuses to guess, on screen |
| `w4-h2-12-fix-flagon-seat.png` | **flag on** | The same seat under the four-tab bar |
| `w4-h2-13-fix-flagon-timeline.png` | **flag on** | The same timeline on the house-first root |

Server-side, on the local stack:

- **`profiles.last_seen_at` was written by the app**, not by a probe:
  `2026-08-28 12:06:05+00` for `a0000000-…-005`, one minute after that launch. Reset to NULL
  afterwards so the database is as it was found.
- One `saved_items` row was inserted with a June `created_at` and a `room_id` to try the reconcile
  live; it could not be reached (see M1's ⚠ — the reconcile needs local rooms) and was
  **deleted**. `select count(*) from saved_items` → 0, as before.

No `ios-gate.sh all`, no `lint-delta`.
