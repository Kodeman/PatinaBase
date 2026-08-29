# W6 · X3 — fix round

Implementer (fix round), 2026-08-28. Worktree `.codex/worktrees/agent-dr-w6-x3`, branch
`daily-return/w6-x3`, base `main` `4b35e0a94`. Reviewed at `3992e65dd` (`x3-review.md`).
Fresh device **`dr-w6-x3f` `D19A967A-85BD-40BF-B164-7991E4D469D5`** (iPhone 17 Pro / iOS 26.5),
created for this round and deleted at its end. Every number below is from a command run in this
session. Nothing pushed; no git write in the main checkout.

**Blocking findings: none were raised.** All five MAJOR findings are addressed by a change; none is
rebutted outright, though **MJ-5's prescribed remedy is rebutted and a different one applied** (the
review's own fix would have wiped the account's taste portrait on every cold launch — §MJ-5).
Three cheap MINORs the review asked for in the same pass (MN-1, MN-4, MN-8) are also done.

---

## Gate

| Gate | Command | Result |
|---|---|---|
| build | `apps/mobile/Patina/scripts/ios-gate.sh build` (worktree's own copy) | `** BUILD SUCCEEDED **` — **first run**, no `GitCommit.swift` retry needed |
| unit tier | `xcodebuild test -project Patina.xcodeproj -scheme Patina -configuration Debug -destination id=D19A967A-… -derivedDataPath .build/dd -only-testing:PatinaTests` | `✔ Test run with **1439 tests in 157 suites** passed` · `** TEST SUCCEEDED **` |
| floor | W5 = 1413; review's tip = 1433 | **+6** this round, +26 on the lane |
| signed `.app` | same `-derivedDataPath .build/dd` build, **no** `CODE_SIGNING_ALLOWED=NO` | `codesign -dv` → `Signature=adhoc`, installed with `simctl install` |
| both roots | `-PatinaFlags house-first` and `-PatinaFlags none` | both render the Record (shots 05, 06) |

One intermediate red is worth recording rather than hiding: MN-1's regex first matched
`SessionScope.swift`'s own header comment (which writes *about* `static let shared`), so
`theListIsTheWholeList` failed once. The walker now skips comment lines. That is the corrected
version above.

---

## MJ-1 — the session moves in one place · **FIXED**

`AuthService` gained a private `applySession(_:) -> Bool` doing the compare +
`SessionScope.reset()` + assignment, and **all nine** assignment sites route through it: the
listener plus password sign-in, Apple/Google id-token, sign-up, sign-out, the QR `setSession`, the
`patina://auth/callback` deep link, `refreshSession` (both arms) and `getSession`. `self.session =`
now appears exactly once in the file.

The listener's ordering pin still holds and got stronger: `theResetPrecedesTheFirstFetch` now
asserts `self.applySession(session)` precedes `Self.settleLocalStore(for:`, the hydration and
`SessionScope.refresh()`, **and** that `applySession`'s own body is where `SessionScope.reset()`
and the `settledUserId` update live — so the reset cannot drift back out of the seam.

New pin `theSessionMovesInOnePlace` counts assignment lines in `AuthService.swift` and requires
exactly one. A tenth entry point that assigns `session` directly reddens it rather than silently
reopening the window.

## MJ-2 — one fetch per foreground · **FIXED, at the services rather than at Today**

The review offered two remedies: drop the two refreshes from `DailyRoomView`'s `scenePhase` hook,
or give them a shared in-flight guard. **The guard, and it is in the services** —
`BadgeCountService.refresh()` and `DesignRequestStatusService.refresh()` now join the ask already
in flight instead of starting a second one. Reasons, stated so the choice can be overruled:

- `DailyRoomView.swift` is **integration's** file this wave (`ef6020494`, the widget's house-line
  call site). Editing it from this branch is the one place the lane could have produced a merge
  conflict, and it does not need to.
- The doubling was never Today's alone. `SessionScope.refresh()` asks both services on the
  `nil → A` event at **every cold launch with a restored session**, on top of Today's own `.task`.
  A guard at Today fixes one caller; a guard in the service fixes every caller, present and future.
- `BadgeCountService.refresh()` fans out six PostgREST reads per call and had no dedupe of any
  kind, which is the actual defect the finding names.

The story read was the third doubled fetch (the root's `todaysStoryRow()` and Today's
`refreshTodaysStory()`), so `RecordForeground.todaysStoryRow()` joins its own in-flight read too.
SP-18's pick is deterministic over the candidates, so the joiner's answer is the same answer.

**Partly rebutted:** the review counted "2 orders refreshes". `OrdersService.refresh()` is inside
`rebuild`, which is behind `coalesce`, so it already ran once per foreground and still does. The
count for a foreground onto Today goes 12 badge reads + 2 request reads + 2 story reads + 1 orders
refresh → **6 + 1 + 1 + 1**.

**A hazard the guard would have introduced, closed in the same change:** a joined refresh that left
for account A must not land its rows after `SessionScope.reset()` cleared the service. Both services
now stamp the in-flight refresh with a `refreshToken` that `resetForSessionChange()` bumps, and the
fetch discards its own answer if the token moved. `resetForSessionChange()` also drops the in-flight
task so the next ask fetches for the new account rather than joining the old one's read.
`theResetBodyNamesEveryField` gained `inFlightRefresh` and `refreshToken` for both services, so a
future author cannot forget them.

Claim level: compile-green + unit-verified (source pins on both services' `refresh()` bodies and on
the token check). Not measured against a request log.

## MJ-3 — a rebuild nobody saw is not a visit · **FIXED**

`RecordRefresh.run` takes `stampVisit: Bool = true`; when false it saves, attributes and reloads the
widget as before but does not call `lastSeen.markSeen` and does not record `.stamped`.
`RecordForeground.onForeground()` — the root's pass, whose `paint` is `{ _ in }` — passes `false`.

The review's remedy stops there; it needed one more piece. Foregrounding **onto Today** means
Today's ask joins the root's pass, so the record *does* reach the screen while the pass that built
it claimed no visit. `RecordForeground.Outcome` now carries `stampedVisit`, and `run` stamps after
the coalesce when the caller wanted a visit and the pass did not take one. So: reached Today →
stamped; never reached Today → not stamped. Neither direction invents or destroys an `isNew` tick.

Tests: `aPassThatShowsNothingDoesNotStampTheVisit` is behavioural over injected stores — steps are
`[.paintedSnapshot, .built, .saved, .attributed]`, the visit stamp is unchanged, and the snapshot on
disk is the fresh record. `theRootDoesNotClaimAVisit` pins `stampVisit: false` inside
`onForeground` and the joiner's stamp in `run`. The joiner's stamp itself reads
`LastSeenStore.shared`, which is not injectable there — that half is a source pin, not a proof.

## MJ-4 — the report omitted the blocked walk · **FIXED, and the walk was then driven**

The claim level is stated at the top of this log and repeated in the report. And the leg that was
blocked is no longer blocked: on the fresh device `dr-w6-x3f`, with blitz delivering every tap, the
in-process A→B switch ran end to end.

**What the simulator showed, in order** (all frames `xcrun simctl io … screenshot`; no desktop
capture at any point):

1. `w6-x3f-01` / `w6-x3f-02` — signed in `client@patina.dev`, flag-on root. Today draws
   NEEDS YOU ×3 (invoice `$4,250.00` due Sep 2 · Leah's proposal by Sep 11 · the Dining chairs
   decision), MOVED ×2, `See all`, and Leah Hartwell's seat on **Aspen Loft Refresh**. Profile: 1
   room, style **Warm Modern**. Studio: *5 things need your eye*.
2. Settings → Sign Out → confirm (`w6-x3f-03`). The record file and the owner stamp survive, which
   is correct — a sign-out is not a wipe.
3. Signed in `james.okafor@example.com` **in the same process**, from the same screen
   (`w6-x3f-04`). The screen it returned to reads **James Okafor · Awaiting you 0 · "Nothing needs
   a decision." · In progress 0 · "Nothing needs your attention right now."** Under W5's failure
   this is exactly where `StudioHubViewModel.snapshot` and `BadgeCountService` would still have been
   printing A's five items and A's `$4,250`. They are gone.
4. `w6-x3f-05` — James's profile: **0 ROOMS · 0 SAVED**, style chip **Style Explorer**, not A's
   Warm Modern.
5. `house-record.json` in the App Group container rebuilt at 21:52, 1.8 KB → 675 B:
   `needsYou: []`, `moved: ['Leah Hartwell picked up your request.', 'A new story from the
   workshop.']` — B's rows, none of A's.
6. `w6-x3f-06` — relaunched with `-PatinaFlags none`: the W2 root (no tab bar, floating orb,
   `Studio` pill) draws the same B record. **Both roots render.**

**Honest limits on that evidence.** This is sim-verified, never device-verified. It shows the end
state is B's on every surface read; it does not observe the sub-task-hop window MJ-1 closes, which
remains compile-green + unit-verified. The `Ask Leah to source this` send from T9 was not repeated —
James's seeded account has no NEEDS YOU rows and no project to open a thread on, and the project
rule it was there to prove was already walked at `3992e65dd` (`x3-notes.md` §7.1) and is pinned by
`DesignerProjectRuleTests`.

## MJ-5 — `StyleProfileStore` · **the finding is upheld; its prescribed remedy is rebutted**

The leak is real and the exclusion reason was false, exactly as written. But the review's fix —
"a two-line extension makes `StyleProfileStore` a twelfth `SessionScope` participant" — **would
have destroyed the account's own taste portrait on every cold launch.** `settledUserId` starts nil,
so `.initialSession` with a restored session is `nil → A`, which `isAccountChange` calls true, which
runs `SessionScope.reset()`. That costs the other eleven participants nothing (they are empty at
launch); on a disk store it is a wipe, every launch, for the person's own data.

`StyleProfileStore` is cleared in **`LocalStoreReset.wipeUserScopedData()`** instead — the seam the
exclusion table already named, which runs only when a *different real account* takes the store
(`shouldWipeLocalStore`), beside the `StylePreferenceModel` rows that are the same portrait's other
home. The exclusion entry now reads `"on disk — cleared by LocalStoreReset.wipeUserScopedData"`,
which is true. `theTastePortraitIsClearedOnAnAccountChange` pins both halves: that
`wipeUserScopedData` names `StylePreferenceModel` **and** `StyleProfileStore.shared.reset()`, and
that `reset()` really removes both keys rather than only the response.

`LocalStoreReset.swift` is listed in `steward.md` §8 as shared. It is touched deliberately: X1 and
X2 are merged and idle, no lane owns it, and the alternative the review offered was to leave the
leak open with a rewritten reason. Flagged here for the orchestrator rather than done quietly.

**Proven on the simulator, on the file rather than in the code.** The two keys were seeded to the
exact state a completed StyleConversation leaves (the 5-question quiz writes SwiftData, not these
keys, and the conversation flow needs a room scan the simulator cannot run), then the A→B switch
above was driven. `Library/Preferences/cloud.patina.app.plist` afterwards:

```
"local_store_owner_user_id" => "F25F5E06-5E7E-4D17-8C63-84EA37E01551"   ← James, not A
```

and **neither `patina.style_profile_response.v1` nor `patina.style_profile_completed.v1` is in the
file.** Before the switch both were present with A's owner id beside them. `CompanionOverlay
.swift:241` therefore reads B's own `hasCompletedProfile`, not A's.

⚠ Two notes for whoever repeats this. `xcrun simctl spawn <udid> defaults read` kept serving the
pre-switch values from a stale cfprefsd cache after an external `defaults write` — the plist file
is the honest read, and the two disagree. And the `defaults write` used to seed the keys
**replaced the app's whole preferences domain**, taking `local_store_owner_user_id` with it; it was
restored to A's id before the switch, or the wipe would not have fired at all and the run would
have proved nothing.

**Not changed, and named rather than fixed:** `wipeGuestWork` (the SP-06 "start fresh" arm) deletes
`StylePreferenceModel` and does not clear these keys either. That is a different boundary from the
one MJ-5 names and no finding covers it.

---

## The MINORs done in this pass

- **MN-1** — the tree walker matched `"static let shared "` with a trailing space, so
  `static let shared: Foo = Foo()` and `static var shared` escaped the ruling. It is now the regex
  `static +(let|var) +shared\b`, applied per line with comment lines skipped. Same 72 files found;
  the coverage assertion is two-way and still passes both directions.
- **MN-4** — the coalesce's stated justification was false and said so in three places (the file
  header, the commit body and `RecordForegroundTests`' header): a second rebuild seconds later
  reuses the OLD anchor via `previous.window.end`, so the ticks survive either way. Rewritten as
  what it is — a cost fix — with the pointer to `stampVisit`, which is the real tick hazard.
- **MN-8** — `SessionScope.swift` said "Six" declare the reset in their own file, twice; five do.

## The MINORs deliberately left

MN-2 (the field pin matches a name, not an assignment), MN-3 (T7 partly delivered), MN-5 (a third
concurrent ask could strand the joiner — unreachable at two asks per foreground), MN-6 (the joiner's
paint path is untested), MN-7 (`currentRelationship` reads the snapshot from four view bodies),
MN-9 (the seat/thread divergence, which the review itself sends to Fable for ratification),
MN-11 (this lane's evidence is uncommitted — it lives in the main checkout, which this agent may
only read), MN-12 (build-time SwiftLint can't open `.swiftlint.yml` in a worktree — environmental,
and `lint-delta` on integration is the gate that counts). None is a correctness defect and each
would widen a fix round past what it was asked to close.

MN-10 is answered by this round rather than argued: `dr-w6-x3` and `dr-w6-x3r` were the earlier
runs' devices. This round used **`dr-w6-x3f`** and deleted it at the end. `dr-w6-x3`
(`63E0BC31-…`) is still booted and is the steward's to retire.

---

## Merge shape

Ten files, all iOS. `git diff --name-only 4b35e0a94 daily-return/integration -- apps/mobile/`
shares **no file** with this branch's list — integration touches `DailyRoomView.swift`, this lane
touches `DailyRoomViewModel.swift`; `RecordRefresh.swift`, `LocalStoreReset.swift`,
`AuthService.swift` and both services are untouched by X1/X2. `main` has moved to `543030d9f`, all
of it `apps/designer-portal/**`. No conflict in either direction.
