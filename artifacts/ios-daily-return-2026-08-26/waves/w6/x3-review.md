# W6 · X3 — adversarial review

Reviewer, 2026-08-28. Separate context, read-only. Branch `daily-return/w6-x3`
(`196d69f26`, `280242677`, `3992e65dd`), worktree `.codex/worktrees/agent-dr-w6-x3`,
merge-base `main` `4b35e0a94`. Every number below is from a command run in this session.
No git write, no commit, no push, nothing staged.

**Verdict: no blocking findings. Merge is safe on correctness; five items need Fable's ruling
before or immediately after, three of them about behaviour this lane added beyond the
session-isolation brief.**

---

## 0. What I re-ran rather than took on trust

| Check | Result |
|---|---|
| `apps/mobile/Patina/scripts/ios-gate.sh build` (worktree's own copy) | `** BUILD SUCCEEDED **` — **first run, no `GitCommit.swift` retry needed** |
| `xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug -destination id=63E0BC31-… -only-testing:PatinaTests` | `Test run with **1433 tests in 157 suites** passed` · `** TEST SUCCEEDED **` |
| W5 floor | 1413 → **+20**, exactly as reported |
| `git status --porcelain` in the worktree | empty |
| `.writer.lock.d` | released |
| `Secrets.swift` | present, `git check-ignore` → `.gitignore:53`, **not in any commit** |
| Commits | Conventional Commits, pathspec-scoped, no artefacts, no `add -A` residue |

The lane's gate claim is **true as stated**. The build number is better than reported (green on
the first run here, because DerivedData was already warm from this lane's own earlier pass).

**Merge shape — the report's claim is correct, verified:** `git diff --name-only 4b35e0a94
daily-return/integration` and the lane's own file list share **no file**. Integration touches
`DailyRoomView.swift`; this lane touches `DailyRoomViewModel.swift`. `PatinaApp.swift`,
`AuthService.swift`, `DesignerRelationship.swift` and `RecordIdentityTests.swift` are untouched by
X1/X2. `main` has moved on since the base (`543030d9f`, the designer-portal Life Review) but every
one of those commits is `apps/designer-portal/**` — **no iOS file**, so no conflict either way.
New Swift files need no `project.pbxproj` edit: the project uses `PBXFileSystemSynchronizedRootGroup`
(5 occurrences).

---

## 1. Findings

### MAJOR

**MJ-1 · The reset fires only from the auth-state listener, but eight other sites move the session
first.** *Severity major · Confidence high on the code fact, medium on the impact.*

`AuthService.swift` assigns `self.session` directly at **lines 288** (password sign-in), **352**
(Apple / Google id-token), **422** (OTP verify), **467** (`session = nil` on sign-out), **607**
(`setSession`, the QR rail), **619** (`session(from: url)` — the `patina://auth/callback` deep link,
which is *exactly* the in-process A→B path the blocked walk was trying to drive), **648** and **661**.
None of them touches `settledUserId` and none calls `SessionScope.reset()`.

So on an in-process A→B sign-in the order is: `self.session = B` (line 288) → `currentUserId`
answers **B** immediately, on the main actor, with every `SessionScope` participant still holding
**A's rows** → the view navigates → *then* GoTrue delivers `.signedIn` on `authStateChanges` and the
reset runs. The window is a task hop, not a leak (RLS still refuses the write), and it is far
narrower than the persistent staleness W5's walk hit — but it is the same shape, and it is the one
thing the brief asked me to check ("no window where B's screens read A's rows"). In that window
`DesignerThreadOpener` is safe on the record (`RecordIdentity.decide(stampedOwner: A, session: B)`
→ `.discard` → `admittedRecord()` returns nil, correctly) but **not** on `badges.projects`, which
still resolve A's project.

Remedy, one place: give `AuthService` a private `applySession(_ session: Session?)` that does the
`settledUserId` compare + `SessionScope.reset()` + assignment, and route all nine sites through it.
The listener's ordering pin still holds.

**MJ-2 · Every foreground now runs the fetches twice; only the rebuild coalesces.**
*Severity major · Confidence high.*

`RecordForeground.onForeground()` (called from `PatinaApp`'s `.active`) runs
`BadgeCountService.refresh()`, `DesignRequestStatusService.refresh()`, `todaysStoryRow()` and — via
`rebuild` — `OrdersService.refresh()` plus the saved-items products read. `DailyRoomView`'s own
`.onChange(of: scenePhase)` (lines 158-169) **still** runs `badges.refresh()` and
`requestStatus.refresh()` before `refreshRecord()`. `BadgeCountService.refresh()` has **no in-flight
dedupe** — it fans out six PostgREST reads every call. So a foreground onto Today is now
**12 badge reads + 2 request reads + 2 story fetches + 2 orders refreshes** where it was 6/1/1/1.
`coalesce` dedupes the `RecordRefresh.run` only; it does nothing about the fetches, and the notes'
"the two coalesce so a foreground onto Today rebuilds once" reads as if it covered the cost.

`SessionScope.refresh()` adds another badges + requests pair on the `nil → A` event at **every cold
launch with a restored session**, on top of `DailyRoomView`'s `.task`. The lane explicitly declined
to re-fetch `OrdersService`/`StudioHubViewModel` "to save a Today-path cost this wave was not asked
to spend" — this is the same cost, spent twice over, on a hotter path.

Remedy: either drop the two refreshes from Today's `scenePhase` hook (the root now owns them), or
give `onForeground()` an in-flight guard shared with them. Either is a few lines.

**MJ-3 · The root's rebuild stamps the visit on an open where the record was never painted.**
*Severity major · Confidence high on mechanism, medium on how often it bites.*

`RecordRefresh.run` always ends with `lastSeen.markSeen(now:)` (step 4, `RecordRefresh.swift`). Until
this commit that only happened when Today was mounted — i.e. when the person was actually looking at
the record. The root now runs it on **every** foreground, with `paint` defaulted to `{ _ in }`, so
"when you last saw the Record" moves forward on opens where nothing was shown.

Mitigated, and I checked it rather than assuming: `HouseRecord.build`'s six-hour suppression reuses
`previous.lastSeenAt` as the anchor, so if the person reaches Today within six hours of the root's
rebuild the `isNew` ticks survive. The exposure is the other case — app suspended on Studio/Spaces
overnight, foregrounded there, and Today not reached for another six hours: the second rebuild
anchors on the stamp nobody's eyes earned, and the ticks for everything that landed before the
un-seen foreground come off. Post-merge this also carries into the widget, whose `sinceDate` is
`record.window.start` = `min(rolling, anchor)`.

Remedy: a `stampVisit: Bool = true` parameter on `RecordRefresh.run`, passed `false` from the root's
pass (which paints nothing), so the root saves the snapshot and reloads the widget without claiming
a visit. That preserves Q8's "refreshed on foreground" and C5 both.

**MJ-4 · The report to Fable omits the blocked account-switch walk.**
*Severity major (C5 applies to reports) · Confidence high.*

`x3-notes.md` §7 is exemplary: it says plainly that the A→B sign-out/sign-in leg could not be driven
(blitz taps stopped registering, then `System Events` `-609`), that the last attempt died on the
`Open in "Patina"?` alert, and that **"the session-isolation seam is compile-green + unit-verified …
not sim-verified. That is the honest claim level."** `x3-tasks.md` T14 says the same.

The report handed to the orchestrator does not. Its `notes` carry a "SIM PROVED" block of three
items and an "HONEST LIMITS on that sim evidence" block — and neither mentions that T9, the lane's
central acceptance criterion and the literal reproduction of the W5 walk failure, was **not run**.
A reader of the report alone would merge this believing the isolation fix had been walked. The
claim level for commit `196d69f26` is compile-green + unit-verified; that belongs in the report,
not only in the notes.

**MJ-5 · `StyleProfileStore`'s exclusion reason is provably false, and the guard test passes anyway.**
*Severity major · Confidence high.*

`SessionIsolationTests.excludedFiles` files `StyleProfileStore.swift` under *"on disk, owner-keyed or
device-scoped — LocalStoreReset's boundary"*. It is neither owner-keyed nor covered:
`patina.style_profile_response.v1` and `patina.style_profile_completed.v1` sit in
`UserDefaults.standard` with no account in the key, and `LocalStoreReset.wipeUserScopedData()`
(read in full) deletes the `StylePreferenceModel` **rows** and never touches those two keys. A second
account on the same phone inherits the first account's taste portrait and its
`hasCompletedProfile` — and `CompanionOverlay.swift:241` reads
`StyleProfileStore.shared.hasCompletedProfile` straight into the Companion's context.

The lane found this itself (`x3-notes.md` §1, "the one gap this lane found and did not close") and
declined it as `LocalStoreReset`'s business, which is shared. That reasoning does not hold for the
containment it chose: `StyleProfileStore.swift` is owned by neither X1 nor X2, it **already has a
`reset()`** that clears the key, and making it a twelfth `SessionScope` participant is a two-line
extension in the lane's own new file. Instead the leak was written into the exclusion table as a
non-leak, which is the one place a future reader will look and be told it is handled.

I audited the neighbouring exclusions in the same category and they hold up: `ContextMemoryStore`
keys every snapshot by `ownerIDProvider()`, `ConversationStorageService` refuses a cache whose
`userId` differs, `LastSeenStore` is single-keyed but `LocalStoreReset` clears it beside
`RecordSnapshotStore.remove()` and `RecordOwnerStamp.clear()`. `StyleProfileStore` is the only one
in that group whose reason is wrong.

### MINOR

**MN-1 · The tree-walking guard matches a trailing space, so one declaration style escapes it
silently.** *Minor · Confidence high.* `theListIsTheWholeList` filters on
`source.contains("static let shared ")`. `static let shared: Foo = Foo()` — a perfectly ordinary
spelling — contains no such substring and never reaches the ruling. I re-ran the grep myself: at
today's tip the two forms agree (72 hits either way; the only extra matches are
`SessionScope.swift`'s own comment and `sharedRoomCaptureConfigLabel`, both correctly inert), so
nothing is escaping **now**. A regex (`static +(let|var) +shared\b`) would keep it that way, and
would also catch `static var shared`.

**MN-2 · `theResetBodyNamesEveryField` pins the field's *name*, not its assignment.** *Minor ·
Confidence high.* The test asserts `body.contains(field)`. A reset that merely *reads* `hasLoaded`,
or mentions it in a comment, satisfies it. It is still the right shape of pin (it catches the
forgotten-property case, which is the real risk) — worth knowing it is weaker than it reads.

**MN-3 · T7 was not delivered.** *Minor · Confidence high.* The task list promised
"`SessionIsolationTests`: A's rows in **every** participant → `SessionScope.reset()` → each reads
empty → apply B's rows → `DesignerThreadOpener`'s inputs resolve B's project." The suite contains
`badgeCountsAreCleared` (one participant, behaviourally) plus source-text pins for the other four
in-file resets. The six extension conformances (`ProfileService`, `RoomSelectionStore`,
`NotificationManager`, `RoomSyncCoordinator`, `CompanionService`, `PieceActChannel`) have **no
behavioural test at all** — I read each clearing method by hand instead and they are all correct
(`ProfileService.clear()` also drops the `lastSeenMirrorKey` watermark, which is the right call).
With T9 blocked as well, nothing exercises the full A→B path in either tier.

**MN-4 · `coalesce`'s stated justification is overstated.** *Minor · Confidence high.* The comment,
the commit message and `RecordForegroundTests`' header all say a second rebuild "would build against
the visit stamp the first had just written and take every row's `isNew` tick off". It would not:
`HouseRecord.build` computes `suppressing` from `previous.window.end`, which for a rebuild seconds
later is unambiguously inside the six-hour window, so `anchor = previous.lastSeenAt` — the *old*
anchor — and the ticks survive. The coalescing is sound defence in depth; it is not the safety
property the docs claim, and MJ-3 is the real one the same mechanism does not cover.

**MN-5 · A third ask can strand the joiner.** *Minor · Confidence high on the code, low on
reachability.* In `coalesce`, the joiner does `await existing.value` then reads `lastOutcome`.
Between the owner task's `inFlight = nil` and the joiner's resume, a *third* `coalesce` can start and
set `lastOutcome = nil`; the joiner then returns `(nil, false)` and `run` never calls its `paint`.
Two asks per foreground means this is unreachable today. Handing the outcome to the awaiter
directly (a `Task<Outcome?, Never>` awaited for its value) removes the shared slot entirely.

**MN-6 · The joiner's paint path is untested.** *Minor · Confidence high.*
`overlappingAsksCoalesce` returns `nil` from both closures, so `if let outcome, !ranTheRebuild {
paint(outcome.record) }` — the line that puts the root's record on Today's screen when Today joined
— never executes in any test. One closure returning a real `Outcome` would cover it.

**MN-7 · `currentRelationship` now does uncached disk I/O inside four SwiftUI bodies.** *Minor ·
Confidence high on the mechanism, low on the cost.* `admittedRecord()` calls
`RecordSnapshotStore.shared.load()`, which is `Data(contentsOf:)` + `JSONDecoder` under an `NSLock`,
with no cache. `currentRelationship` is evaluated in `ProductDetailView` (:55, deliberately in
`body`), `ThreadListView` (:199 via `emptyCTATitle`), `NotificationFeedView` (:146) and
`AskDesignerSheet` (:183). At ~1.8 KB the per-evaluation cost is small, and the lane's reason for
not caching (a cache is one more thing surviving an account change) is right — but this is
main-thread file I/O in a view body, and the record read registers no observation dependency, so the
picked project can lag the drawn one until something *else* invalidates the view.

**MN-8 · Comment says "Six", the code says five.** *Nit · Confidence high.* `SessionScope.swift`
twice says six participants declare the reset in their own file; five do
(`BadgeCountService`, `DesignRequestStatusService`, `OrdersService`, `StudioHubViewModel`,
`SettingsService`). `PieceActChannel` conforms via the extension (`publish(nil)`), not in its own
file — the plan's T3 listed six and the code correctly did five. `x3-tasks.md` T3 carries the same
stale six.

**MN-9 · The seat and the thread can still name two projects — deliberately.** *Minor · Confidence
high; wants Fable's ratification.* `DesignerSeat.activeProject` applies `urgentProjectId` over all
non-archived projects; `DesignerRelationshipResolver.activeProject` applies it **inside** the
`designer_id != nil` set. So when the urgent project has no designer, the seat names none (or speaks
for the lead) while the resolver falls through to `candidates.first` and the thread opens on a
*different* project. The lane documents this at length, argues it correctly (`.none` draws Buy, and
R3's pre-emption must not come off), and pins it with
`theUrgentProjectWithoutADesignerDoesNotUnsetTheRelationship`. It is still the same class of split
the lane exists to close, in one narrow case — worth a ruling rather than leaving it in a doc
comment.

**MN-10 · "Device deleted" is half true.** *Nit.* `dr-w6-x3r` (`7AB6C26E-…`) is gone, as reported.
The **original** `dr-w6-x3` clone (`63E0BC31-AD63-40CC-A609-1FCA5CA9C631`) is still on disk and
**Booted** — I used it for the test run above. Retirement is the orchestrator's call
(`integration.md` §7), but the report should not read as if this lane's simulators are all cleared.

**MN-11 · The lane's own evidence is uncommitted.** *Minor.* `x3-notes.md`, `x3-tasks.md`, the six
`shots/w6-x3-*.png` and the ledger section live in the **main checkout's working tree**, tracked by
nothing. I verified the lane's reason is sound: `git ls-tree main -- .../waves/w6/` returns **zero
files**, so committing them from this branch really would collide with the main checkout's dirty
copies. But they are the only record that the acceptance walk was blocked (MJ-4) — whoever merges
must commit them in the same push, or that fact leaves no trace.

**MN-12 · Environmental, not this lane's.** The in-build SwiftLint phase logs
`The file ".swiftlint.yml" couldn't be opened because you don't have permission` → falls back to the
default config → `Error: No lintable files found at paths: 'Patina'`. Build-time lint is a no-op in
this worktree (it was for X1/X2 too). The steward's `ios-gate.sh lint-delta` on integration is the
gate that actually counts.

---

## 2. The brief's checklist, answered

**Does the reset cover every account-caching singleton?** I ran the grep independently: 72
`static let shared` declarations under `Patina/`, and the participant set ∪ exclusion set is exactly
that 72 — the test's own two-way subset assertion is real and it passes. Eleven participants, and I
read every clearing method rather than trusting the table; all eleven clear what they claim to.
**One exclusion is wrong on its facts (MJ-5, `StyleProfileStore`), and one declaration style escapes
the walker (MN-1).** Two non-singleton account-scoped holders sit outside the pin's reach and are
worth knowing about: the `@AppStorage` cellular-scan-upload toggle (`SettingsService.swift` header
says so itself) and `LastSeenStore`'s single un-scoped key, which is covered — but only by
`LocalStoreReset`, and only on the different-real-account arm.

**Ordering — clear before the new account's first fetch?** Yes, at the seam it chose.
`SessionScope.reset()` sits after `self.session = session` and **before** `Self.settleLocalStore`
(which kicks `RoomSyncCoordinator.reconcileSharedStore`) and before the profile-hydration block,
with no `await` between the assignment and the reset, so nothing can interleave on the main actor.
`theResetPrecedesTheFirstFetch` pins all three orderings at the source. Clearing `ProfileService`
first also makes the hydration block's `currentProfile == nil` gate fire, which is the right
direction. **The hole is not the ordering inside the listener but the eight sites that bypass it
(MJ-1).**

**Does the project rule match W4's seat rule?** Yes, and by calling
`DesignerSeat.urgentProjectId(record:decisions:proposals:invoices:)` rather than copying it, which is
the right containment. `theSeatAndTheThreadAgree` asserts both functions against one fixture. The
one deliberate divergence is MN-9. The two other `resolve(…)` call sites
(`DecisionsViewModel.messageRoute`, `CompanionOverlay`) compile on the defaulted parameters and are
**behaviourally identical to before** — with `record: nil` the new `activeProject` reduces to
`candidates.first`, which is character-for-character the old `projects.first { !archived &&
designer_id != nil }`. I checked their consumers: the first reads only `designerId`, the second only
`isLive` (`CompanionAreaBuilders.swift:31` is the sole reader).

**Does the root hook call the same `RecordRefresh` entry, and not double-run on Today?** Yes to the
first — there is exactly one `RecordRefresh.run` call site left in the app, in `RecordForeground`,
and `todayGoesThroughTheSameEntryPoint` pins that no second one returns to the view model. Yes to
the second for the *rebuild*; **no for the fetches (MJ-2)**, and the rebuild's dedupe carries a
side effect nobody asked for (MJ-3). `DailyRoomView` keeps all three `refreshRecord()` calls;
`HomeCompositionTests:230-232` still passes (it requires ≥2).

**Unrelated change?** None. Sixteen files, all traceable to the three stated jobs. The third commit
is outside the lane's declared owned-file list (`PatinaApp.swift`,
`Features/Home/ViewModels/**`) but is the orchestrator's assignment from `integration.md` §6.2, and
putting the hook in `PatinaApp` rather than `ContentView` is **better** than integration.md proposed
— it is above both roots, so it covers the `house-first` tab bar and the W2 orb equally.

**Tests real, and failing without the change?** Yes for the ones that matter.
`theRecordPicksTheProject` returns `birchHollow` under the old `projects.first` and asserts
`aspenLoft` — it cannot pass without commit 2. `overlappingAsksCoalesce` and `aLaterAskRunsAgain`
are genuine behavioural tests of new code. `theSeamOnlyFiresOnARealChange` exercises a pure function
that did not exist. The rest of the new surface is `SourcePin` string assertions — the program's
established idiom, brittle by design, and honest about being pins rather than proofs. Weaknesses at
MN-2, MN-3, MN-6. `RecordIdentityTests.thePaintPathIsScoped` was **updated, not weakened**: it now
reads both files and asserts both facts.

**Commits.** Three, Conventional Commits with real bodies, pathspec-scoped, no `Secrets.swift`, no
artefacts, no push, no git write in the main checkout. Clean.

---

## 3. What I'd ask for before this merges

1. **MJ-4** — the report to Fable gets the blocked walk and the claim level added, so the merge
   decision is made on `x3-notes.md` §7's facts and not the report's summary.
2. **MJ-5** — one two-line extension makes `StyleProfileStore` a participant and the exclusion table
   true again; or the entry's reason is rewritten to say the leak is open and carried.
3. **MJ-2** — pick one owner for the foreground fetches. The current state doubles the app's hottest
   request path and it is a few lines either way.
4. **MJ-3** — Fable's call. A `stampVisit: false` from the root's pass is the small fix; the
   alternative is to accept that "refreshed on foreground" also means "counted as seen".
5. **MJ-1** — can follow the merge, but should not be lost: the seam is one function away from
   covering all nine session assignments instead of one.

MN-1, MN-9 and MN-11 are cheap and worth doing in the same pass. The rest are notes for whoever
reads this code next.
