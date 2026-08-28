# W4 · lane H2 — adversarial review

Reviewer: separate context, read-only against
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-h2` (branch `daily-return/w4-h2`,
base `1cb71c346`, 7 commits, no upstream configured — **not pushed**, confirmed).

Checked against: `source/build-plan.md` (Global constraints, W2 — DONE carry-overs, W3, W4),
`source/direction-b.md` §2/§3, `waves/w4/steward.md` §4/§7, `waves/w4/h2-tasks.md`,
`waves/w4/h2-notes.md`, `waves/w3/rulings-fable.md` #9 (via the plan's W3 row).

---

## 0. What I re-ran myself

**Gate — independently reproduced, GREEN.**

```
$ xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug \
    -destination 'platform=iOS Simulator,id=D6DACCE3-E865-4AB5-80FF-F7C49F16736F' \
    -derivedDataPath .../agent-dr-w4-h2/.build/dd -only-testing:PatinaTests
✔ Test run with 1121 tests in 130 suites passed after 3.929 seconds.
** TEST SUCCEEDED **
```

1121 / 130 matches the implementer's number exactly (W3 left 1074; +47). No build re-run was
needed. Worktree clean (`git status --porcelain apps/mobile/Patina` empty), `.writer.lock.d`
released.

**Commits.** Seven, Conventional Commits, all pathspec-scoped to `apps/mobile/Patina/**`, no stray
files, no `git add -A` fingerprints, logically grouped one task per commit. Nine shots exist at
`artifacts/.../shots/w4-h2-01…09`.

**Schema claims — verified against the migrations, not assumed.** `saved_items.notes`
(`00055_saved_items.sql:28`), owner UPDATE policy (`00055:56`), `profiles.last_seen_at`
(`00537_house_on_today.sql:71`), owner UPDATE on profiles (`00013_profiles_table.sql:61-62`). No
migration was needed and none was minted. Correct.

**Both roots.** `DailyRoomView()` mounts at `ContentView.swift:218` and
`Features/Navigation/HouseFirstRoot.swift:111`; `CollectionsView` at `ContentView.swift:272/309`
and `HouseFirstRoot.swift:213/239`. Every H2 surface is on both roots by construction, and shots
`w4-h2-04`/`09` show the flag-on root. This claim holds.

I accept the harness report (§5 of `h2-notes.md`) at face value: the anon-session condition matches
the recorded `securityd -34018` trap and affects pre-existing readers identically. I did not
re-drive the simulator.

---

## BLOCKING

### B1 — A saved row pulled from the server prints **today's date**, not the day it was saved
**Severity: blocking · Confidence: high (code-level certain; depends on PostgREST emitting
fractional seconds, which `NOW()`-written rows essentially always do)**

`CollectionsViewModel.swift:81` (pre-existing line, in **H2's own owned file**):

```swift
savedAt: ISO8601DateFormatter().date(from: row.created_at) ?? Date(),
```

A bare `ISO8601DateFormatter()` has `formatOptions == [.withInternetDateTime]` and **rejects
fractional seconds** — which is the entire reason `ISO8601DateParsing.withFraction` exists in this
codebase (`ProposalsAPIClient.swift:439-448`, whose own comment names this trap: "silently turning
'expired' into 'no expiry'"). `saved_items.created_at` is `timestamptz DEFAULT NOW()` (`00055:34`),
so PostgREST serialises `2026-06-14T18:22:07.418293+00:00`. The parse returns nil, `?? Date()`
fires, and the row is stamped with the moment of the sync.

Before W4 this only mis-sorted a list. **W4 prints it to the reader as a fact.** The row now says
`Saved Aug 28` for a piece saved in June. That is the exact sentence global-constraint C5 forbids —
a number drawn that is not the number stored — on the surface this lane exists to build.

The lane never hit it because `saved_items` holds 0 rows locally (`h2-notes.md` §4.4), so every
shot is of a locally-made save whose `savedAt` is genuinely today. The bug is invisible on the
walk and certain on real data.

Fix, in-lane, one line:
```swift
savedAt: ISO8601DateParsing.dateOrDay(from: row.created_at) ?? Date(),
```

---

## MAJOR

### M1 — The room half of the saved row can never render for a server-reconciled save
**Severity: major · Confidence: high**

Same reconcile, `CollectionsViewModel.swift:77-84`: `TableItemModel(...)` is constructed **without
`roomId:`**, although the initializer takes it (`TableItemModel.swift:71`) and `RemoteSavedItem`
already decodes `room_id` (`RoomsAPIClient.swift:51`). So `item.roomId` is nil for every pulled
row, `roomNamesById[$0]` is never consulted, and `SavedRowMeta.line` degrades to `Saved Aug 24`.

B §3 asks for "save date, **room** and note". The room half is delivered as a formatter and a unit
test and is unreachable for anything that came from the server — which, on a real account, is most
of the list. `h2-notes.md` §4.4 attributes the missing room to an empty local `saved_items` table;
that is only half the reason.

The loop already holds `rooms` with `remoteId` (`:61-63`), so the mapping is one dictionary:
`roomsByRemoteId[row.room_id]?.id`. `CollectionsViewModel.swift` and `TableItemModel.swift` are
both H2's. This is in-lane and cheap.

(The *note* half's device-to-device gap is correctly filed as H1's `RemoteSavedItem` change,
`h2-notes.md` §3 — that one I agree was right to leave alone.)

### M2 — The seat and the Next Move can still name **different projects**
**Severity: major · Confidence: high on the path, medium on frequency**

The report claims: "`DailyRoomView.liveProject` makes the SAME pick, so the Next Move's 'See where
`<project>` stands' cannot name a different project than the seat." That is not true. The two
candidate sets differ:

```swift
// YourDesignerSeat.swift:60
let candidates = projects.filter { !StudioQueueBuilder.projectIsArchived($0) && $0.designer != nil }
// DailyRoomView.swift:467
let candidates = badges.projects.filter { !StudioQueueBuilder.projectIsArchived($0) }
```

When the record's first NEEDS YOU row belongs to a project whose `designer` embed is nil —
`RemoteProject.designer`'s own doc says "Nil where the project has no designer, **or on any decode
that predates the embed**", and the embed is `designer:profiles!…`, so it is also nil whenever the
client cannot SELECT that profile row — `liveProject` resolves to the urgent project and the seat
falls through to `candidates.first`, i.e. back to the `updated_at.desc` pick. The screen then reads
"See where Aspen Loft Refresh stands" over a seat captioned `Birch Hollow`: the W2 walk defect,
narrowed but not closed, and `Message` opens the wrong conversation again.

No test covers this. `DesignerSeatTests.anUnresolvableRowFallsBack` tests the id-not-found and
project-gone cases; neither fixture has a designer-less project.

Fix: make the seat resolve `urgentProjectId` against the same non-archived set and only then apply
the `designer != nil` requirement (or have both call one shared picker). Add a case with a
`"designer": null` project.

### M3 — The "connecting rail" is almost certainly **broken between rows**
**Severity: major · Confidence: medium-high (SwiftUI layout reasoning; no shot exists)**

`ProjectDetailView.phaseRow` applies `.padding(.vertical, 14)` **to the whole `HStack`**
(`:212`), and `phaseMarker` draws its rail inside that HStack. So between two consecutive dots
there are 14 pt of row-N bottom padding plus 14 pt of row-N+1 top padding with **nothing drawn**,
then the 8 pt stub above the next dot. The rail reads as a stack of 8 pt ticks with 28 pt gaps, not
as one run of time — which is the one thing the redraw was for.

There is no timeline screenshot in the ledger (the anon-session harness blocked it), so this is
unverified in either direction. Fix: move the vertical padding inside the text column, or draw the
rail as a full-height `background` behind the row rather than as a sibling inside the padded stack.
**The walker must shoot this one.**

### M4 — VoiceOver loses the phase fee
**Severity: major · Confidence: high**

`phaseRow` gained `.accessibilityElement(children: .combine)` + an explicit
`.accessibilityLabel(phaseAccessibilityLabel(...))` (`:214-215`). That label is
`"[Current phase. ]<name>. <status · dates>"` and omits the trailing
`Text(formatPrice(fee))` at `:206-210`. Combining children and then overriding the label discards
it: a VoiceOver reader who could previously hear the phase fee now cannot. A money figure
disappearing for assistive tech is a regression, not a nit — append the fee to the label, or drop
the custom label and let `.combine` build it.

### M5 — `CURRENT` can contradict the row's own status on the same line
**Severity: major · Confidence: medium-high**

`currentPhaseId` lets `projects.current_phase` win outright. `project_phases.status` is a separate
column the designer maintains separately. Nothing reconciles them, so a row can print

```
CURRENT
Design
Completed · Aug 1, 2026 · Sep 15, 2026
```

Both halves are server facts, so this is not a fabrication — but it is two facts arguing on one
row, and the reader has no way to tell which one the app believes. `ProjectTimelineTests` does not
cover it (all fixtures agree). Either suppress the `CURRENT` mark where the named row's own status
is `completed`, or state the precedence in the row. A Fable ruling, not an obvious fix.

### M6 — The mirror starts publishing homeowner presence into a world-readable column
**Severity: major · Confidence: high on the policy, needs a ruling not a code fix**

`00013_profiles_table.sql:57-58`: `CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR
SELECT USING (true);`. `00537` added `last_seen_at` and nothing wrote it — W4 is the moment the data
begins to exist. From the first foreground, every authenticated reader of `profiles` (designers,
and anything else holding an authenticated JWT) can see when a given homeowner last opened the app.

This is arguably 00537's design and B §3 explicitly asks for the mirror, so I am not calling it
blocking. But it is a new privacy surface created by this commit and nobody has ruled on it. If the
answer is "only the client and their own designer", it wants a narrowed SELECT policy on that column
in D's lane before this reaches anyone.

### M7 — The story's new `publishedAt` is dead at the only call site
**Severity: major · Confidence: high**

`h2-notes.md` §2.6 says "the date travels with the story instead of with a parallel row a frozen
view model has to keep." It does not. The sole production call site still passes the parallel row
explicitly:

```swift
// DailyRoomView.swift:409  (H2's own granted file)
publishedAt: viewModel.todayStoryPublishedAt
```

and `DailyStoryCard.datedReadTimeLabel` is `publishedAt ?? story.publishedAt`, so the new fallback
never runs in the app. `w4-h2-02`/`04` prove the chip renders — but they prove the *W2* path
renders, not the W4 one. Behaviourally identical today (both derive from the same
`todayStoryRow`), so nothing is wrong on screen; the carry-over is satisfied on paper only. The fix
is deleting one argument at `:409`, which H2 owns. (`DailyRoomViewModel` is frozen, so the
`todayStoryPublishedAt` property itself has to stay — fine.)

### M8 — A third file outside the owned map, undisclosed
**Severity: major (process) · Confidence: high**

`h2-notes.md` §1 names two files outside the map and then says "Everything else is inside the map."
It is not. `Patina/Features/Authentication/Views/AuthScreenView.swift` is edited in `293a1f5ec` and
`Features/Authentication/**` appears **nowhere** in `steward.md` §4's H2 row — the map grants
`Services/Auth/**` only, and §4's own preamble says everything unlisted is unowned. `h2-tasks.md`
asserts "the brief grants only `Services/Auth/**` and `Features/Authentication/**`", which is the
implementer's reading, not the steward's text.

No merge risk (no other W4 lane owns it), and the edit itself is three lines and correct. But the
notes file is what the integration steward trusts, and it under-reports.

The two disclosed ones stand as declared and both want a steward decision rather than my sign-off:
- `App/Coordinators/AppCoordinator.swift` — **FROZEN**. One line, well argued (nothing else decides
  the launch phase), trivially revertible. I agree it could not be done from `Services/Auth/**`
  alone; it is still a frozen-file edit taken rather than filed.
- `PatinaTests/EngagementTierTests.swift` — not in H2's granted suite list, and §4's frozen clause
  covers "every suite not granted above". The re-point is sound: the old fixture asserted
  `!isVisibleForPromotion()` on a 30-day match, which W4 deliberately makes false, and the test's
  real guarantee (the Design-help guard reads `openRequest`) is preserved. Leaving it would have
  left the tier red, so the choice was fix-or-file; it fixed.

---

## MINOR

1. **`roomNamesById` fetches every room once per row, not once per list.** `CollectionsView.swift:42`
   is a computed `var` whose comment says "One fetch for the whole list — a `room(id:)` per row would
   be a query per row." It is read inside `savedRowFooter` (`item.roomId.flatMap { roomNamesById[$0] }`),
   so it constructs a `RoomStore` and runs `allRooms()` once per row with a room, on every body
   evaluation — strictly worse than the thing it says it avoids. Hoist it into the `savedItemsList`
   body as a `let`. *(Confidence: high.)*

2. **`e0c60f6fe` does not compile on its own.** It adds
   `await ProfileService.shared.mirrorLastSeenIfNeeded()` at `DailyRoomView.swift:115/151`, but the
   method arrives in `88ff17fd9`, the next commit. The branch tip is fine and no gate runs
   per-commit, so this is bisectability only. *(Confidence: high — verified with `git show`.)*

3. **`DesignRequestPromotionDecayTests.aMatchDismissalIsSessionOnly` does not test what it says.**
   `#expect(matched.dismissedStageRaw == nil)` asserts a local `let` the test itself built and never
   mutated; it proves nothing about the SwiftData receipt. The behaviour is right (`dismiss` returns
   before touching `PersistenceController`), but the assertion is vacuous. It also inserts a lead id
   into the real `DesignRequestStatusService.shared.sessionDismissedLeadIds` and never removes it —
   a shared-singleton mutation left standing for the rest of the process. *(Confidence: high.)*

4. **`ProjectTimelineTests.orderIsTheServersOwn` is vacuous** — it asserts that `JSONDecoder`
   preserves array order. It proves nothing about `phasesSection`. *(Confidence: high.)*

5. **`SavedRowMetaTests.fixedLocale` varies the time zone, not the locale.** The formatter pins
   `en_US_POSIX` unconditionally, so the named trap ("a French device prints 24 août") is not
   exercised by anything. Harmless, but the test name overclaims. *(Confidence: high.)*

6. **No test at all for `SavedItemNoteMirror` or `CollectionsViewModel.setNote`** — the local-first
   write, the array refresh, and the `productId == nil` early return are untested. `steward.md` §4
   lists `SavedItemMirrorTests` in H2's suites and it was not extended. `h2-tasks.md` T1 also
   promised "the note … survives a re-read", which `theNoteIsOnTheModel` does not test (it assigns a
   property and reads it back in-memory). *(Confidence: high.)*

7. **`sessionDismissedLeadIds` is never cleared** — not on `refresh()`'s guest branch
   (`DesignRequestStatusService.swift:455-459`), not on sign-out. "Session" is the process, not the
   sign-in. Lead ids are UUIDs so a cross-account collision is impossible; sign out and back in as
   the same person and the dismissal still holds. Add the clear to the same branch that does
   `requests = []`. *(Confidence: high, impact low.)*

8. **Blast radius of the removed match window, for the walker.** `promotedRequest != nil` gates the
   empty-state CTA on eight surfaces — `InvoiceListView:106`, `ProjectListView:218`,
   `DecisionListView:142`, `DocumentListView:92`, `ThreadListView:241`, `ProposalListView:110`,
   `BudgetView:87`, `NotificationFeedView:147` — plus `CompanionOverlay:193`. All of them now read
   "Track your request" **permanently** for a matched client instead of reverting to "Get design
   help" after 14 days. I believe that is the intended consequence of the ruling; it is a wide,
   unshot change and belongs in the walk script. *(Confidence: high.)*

9. **The phase status line prints two unlabelled dates with years.** `phaseStatusLine` yields
   `In Progress · Aug 1, 2026 · Sep 15, 2026` — the reader cannot tell start from end, and a single
   `end_date` reads exactly like a single `start_date`. B §2's own idiom uses a word (`· due Sep 1`),
   and W2 left "`· due Sep 1` vs `· Sep 1`" open as a Kody wording item. A range (`Aug 1 – Sep 15`)
   or a label would settle it. *(Confidence: high on the output, it is a voice/clarity call.)*

10. **The current-phase ring can be nearly invisible.** `phaseMarker` strokes the ring with
    `phaseColor(for: phase.status)`, which is `agedOak.opacity(0.4)` for anything but
    `in_progress`/`completed`. When `current_phase` names a `pending` row, the mark is a faint ring
    around a faint dot and only the `CURRENT` label carries it. *(Confidence: medium — no shot.)*

11. **The note outweighs the piece.** In `w4-h2-08` the reader's note renders at
    `PatinaTypography.bodySmall`/`Text.secondary` at full bleed, visually louder than the piece's own
    brand and price meta, and the whole footer sits *outside* the card's rounded surface, detached
    from the row it belongs to. Worth a designer's eye before it ships. *(Confidence: medium, taste.)*

12. **One note per product, across every room.** `SavedItemNoteMirror.mirror` PATCHes
    `user_id=eq.… & product_id=eq.…` with no `room_id`, so a note typed against the Living Room save
    also lands on the Dining Room save of the same piece. Documented in the file's own comment and
    defensible ("one note about a piece is one note about a piece") — flagging it because the row
    that displays it is captioned with a *room*, so the reader may reasonably read it as
    room-scoped. *(Confidence: high on behaviour, ruling on intent.)*

13. **Watermark domain asymmetry.** `LastSeenStore` writes into the App Group suite
    (`group.cloud.patina.app`, with a documented `.standard` fallback); `ProfileService`'s mirror
    watermark uses `.standard`. Both are correct in isolation, and `clear()` hard-codes
    `UserDefaults.standard` while `mirrorLastSeenIfNeeded` takes an injectable `defaults`. Production
    behaviour is right; the seam is inconsistent. *(Confidence: high, impact none today.)*

14. **No dark or XXL shots** for the new saved-row footer, the note sheet or the timeline. W2's
    acceptance carried "dark + XXL"; W4's row does not restate it, so this is a gap in evidence
    rather than a violated instruction — but the note sheet's `TextEditor` placeholder overlay uses
    fixed 15/18 pt padding, which is exactly the kind of thing XXL breaks. *(Confidence: high that
    it is unshot.)*

---

## What I checked and found sound

- **The decay removal is correct and complete.** `if stage.isMatched { return true }` is placed
  **before** the `dismissedStageRaw` check, so a receipt written by an older build ("matched")
  stops meaning anything — that migration case is handled and explicitly tested
  (`aPersistedMatchDismissalNoLongerHides`). `dismiss()` guards on `isMatched` before it opens the
  model context, so nothing is written. Terminal (`closed`/`expired`) correctly keeps both its
  window and its permanent dismissal, and the reasoning in `h2-notes.md` §2.2 — a resolved request
  ageing off deletes no fact — is right and correctly flagged rather than silently widened.
  Retiring `isTerminalOrMatched` was right: its doc comment named exactly the set that no longer
  exists.
- **`DesignerRelationship` really did hold no decay.** W1a moved the resolver to `liveLead`; only
  the comment needed re-pointing. The notes call this out rather than inventing a second change.
- **`currentPhaseId` refuses to guess.** Two `in_progress` claimants mark nothing; an unknown
  `current_phase` falls back rather than marking wrongly; no progress percentage, no completion
  count, no invented phase. Honest by the letter of C5.
- **The de-dup compares the Next Move's `detail`, not its title**, which is the sentence actually
  being repeated (`TodayExperience.swift:89-97`), and the substitute
  `Hartwell Studio · Designer matched` is two stored facts (`studioName`, `stage.badgeTitle`), not a
  paraphrase. `badgeTitle` for `.matched` is verified as `"Designer matched"`.
- **Guest opt-in (W3 ruling 9) is correctly scoped.** `.initialSession` with no user clears nothing
  — which is precisely what makes the restore work — and both sign-in and sign-out clear the store.
  The `AppCoordinator` property stays *stored*, so `observePhaseInputs()`'s
  `withObservationTracking` read and all three existing writers are untouched. SP-06's
  `shouldWipeLocalStore` was not touched. `w4-h2-03` shows the relaunch landing on the guest Today.
- **The mirror's guards are right**: authenticated-only, nil stamp writes nothing, monotonic
  watermark, every failure swallowed, watermark cleared with the profile so the next account's first
  visit reaches its own row. It fires after the refresh that stamps the visit
  (`RecordRefresh.swift:99`), so the value written is this visit — correct.
- **`ISO8601DateParsing.dateOrDay` was the right choice for `published_at`**, and the reason given
  (both ISO8601 parsers reject a bare `yyyy-MM-dd`) is verifiably true at
  `ProposalsAPIClient.swift:458-464`. Ironically it is the same trap B1 above walks straight into
  three files away.
- **`SavedNoteSheet` honours B §10**: one field, Cancel/Save, no rating, no second piece, no compare
  surface. Whitespace is trimmed to nothing rather than stored as a note.
- **No fabricated numbers anywhere in the diff.** Every figure printed traces to a stored column:
  `savedAt`, room name, `notes`, `published_at`, `fee_cents`, `start_date`/`end_date`,
  `phase.status`. No derived spend, no promise line, no streak, no countdown.

---

## Recommended disposition

- **B1** and **M1** are one fix in one H2-owned function (`CollectionsViewModel.reconcile`) and
  should go back to the implementer before merge — B1 because it puts a false date in front of the
  reader on the surface the lane was built for.
- **M2** and **M4** are small, contained, in-lane fixes.
- **M3** needs a shot before anyone decides; if the rail is broken it is a two-line layout change.
- **M5**, **M6**, **M8** want Fable's rulings (copy precedence; the `profiles` SELECT policy;
  whether the three off-map edits are ratified or re-homed), not the implementer's judgement.
- **M7** is one deleted argument.
- Everything under MINOR can ride to integration or the next wave; **8**, **9** and **14** belong in
  the W4 walk script either way.
