# W3-fix2 — closing the review's majors (role F2, 2026-08-28)

Branch `daily-return/integration` in `.codex/worktrees/agent-dr-w3-integration`,
`a3fd05af9` → `28597eaa7`, two commits, no push. Six files, all under
`apps/mobile/Patina`; `ContentView.swift` untouched, so `legacyMainContent` is
still byte-for-byte W2's.

| Finding | Disposition |
|---|---|
| **V-1** step 3's popover covers the Studio tab | **FIXED** — `c25c758bf`, re-proved on glass |
| **V-2** the Studio tab offers itself to a signed-in reader | **FIXED** — `28597eaa7`, pinned for every route |
| V-3 `ProfileView`'s 120 pt tail | rebutted below — W4, with the other three tab roots |
| V-4 `.profile` stopped being a tab root | no change owed; noted for the walk |
| V-5 the QR row moved off the Studio menu | no change owed; the door is live in Settings |
| V-6 the wave record's baseline number | **CORRECTED** below |
| V-7 the W3-fix record is on no branch | Fable's ff-merge; this round adds two shots + this file |
| V-8 two written contracts contradict what ships | **AMENDED** — both sentences, main checkout |
| V-9 / V-10 informational | acknowledged; V-10's consequence written into B-8 |

---

## V-1 — the arrow edge now follows the anchor

`.popover(arrowEdge:)` names the edge of the **anchor** the arrow leaves from:
`.top` hangs the card below the anchor (caret up), `.bottom` sits it above
(caret down). The modifier hard-coded `.top`, which is right for the greeting at
the top of Today and impossible once R1 moved step 3's anchor onto the bottom
bar — with no room below, UIKit repositioned the card over the bar, dropped the
caret, and covered the labels.

A per-anchor constant could not have fixed it: `.profileMonogram` mounts on the
**header pill** on the flag-off root and on the **bar** on the flag-on one, so
the same anchor value needs opposite edges on the two roots. The edge is
therefore measured, not declared:

- `FirstLaunchTour` names a coordinate space on its content
  (`FirstLaunchTourPopoverPlacement.rootCoordinateSpace`);
- each anchor reports its `midY` and the space's height through
  `onGeometryChange`;
- `arrowEdge(for:)` returns `.bottom` for an anchor in the lower half of that
  root, `.top` otherwise — and `.top` for an unmeasured anchor, which is what a
  preview outside a tour host gets, so previews are unchanged.

New file `Patina/Features/Help/FirstLaunchTourPopoverPlacement.swift` (44 lines,
`nonisolated` — `onGeometryChange` needs a `Sendable` measurement type and the
app's default actor isolation would otherwise pin the `Equatable` conformance to
the main actor; that was the one compile error this round).

**Pinned** by two `@Test`s in `StudioDoorTests`:
`theTourCardSitsAboveAnAnchorOnTheBarAndBelowOneInTheHeader` (bar geometry →
`.bottom`, header geometry → `.top`, unmeasured → `.top`) and
`theAnchorModifierDoesNotHardCodeItsArrowEdge` (the source carries neither
`arrowEdge: .top` nor `arrowEdge: .bottom`, and the host names the space).

**On glass**, fresh install, guest, `-PatinaFlags house-first`:
`shots/w3-fix2-01-step3-above-bar.png` — the card spans y 638–773, the bar row
is 791–840, and `Today · Spaces · Pieces · Studio` all read clearly with the
caret pointing down at `Studio`. Compare `w3-fix-03`, where the card covered
x 75–402 / y 680–843 with no caret.

**The flag-off root is unmoved.** Same build, no flag, fresh install:
`shots/w3-fix2-02-flagoff-step2-below-pill.png` — step 2's card is at y 180–315,
below the header's `Studio` pill, exactly the placement it had before this
change. The measurement returns `.top` there because the pill is in the top half
of the root.

## V-2 — `} else if screen != .profile && screen != .studio {`

Taken as written. The tail's exclusion exists so a screen does not offer itself;
R2 minted a second route over the same composition and the exclusion still named
only one of them.

Rather than pin the two routes, the new invariant pins the **rule**:
`CompanionActionMatrixTests.noMenuOffersTheScreenItIsAlreadyOn` walks
`everyCombination` — all 33 routes × signed-in/guest × room count × active
request × designer — and asserts no row routes to the screen it is on, treating
`.profile` and `.studio` as the one composition they both draw. It passes for
every route, so the invariant is real and not a special case.

Row counts on `.studio` after the fix: guest 6 (4 + HOME + SIGN-IN, unchanged —
which is why `w3-fix-07` looked right), signed-in 5 (4 + HOME). Both inside C8's
cap; `CompanionAreaBuilders`' comment now says so.

## V-6 — the baseline was 1074, not 1077

Confirmed. `git grep -c '@Test'` over `PatinaTests/`: **1074** at `ccf1031f7`,
**1080** at `a3fd05af9`, **1083** at `28597eaa7`. The W3-fix report's "was
1077/123" is wrong; its delta (+6) was right. This round is **+3**: two in
`StudioDoorTests`, one in `CompanionActionMatrixTests`. Suite count unchanged —
no new test file.

## V-8 — both contracts amended (main checkout, uncommitted, as R7's digest was)

- `source/direction-b.md` B-8's *Rollback* clause: struck and replaced. The tour
  is **not** flag-gated — R4 put the rewrite on both roots, so rolling
  `house-first` off restores the W2 root with the rewritten two-step tour over
  it; reverting the tour means reverting R4's commit. The same sentence now
  carries **V-10's consequence**: both roots read the same three Sanity surface
  keys, so publishing `n3-sanity-copy.md` changes the flag-off tour's copy too
  and cannot be staged behind the flag.
- `source/build-plan.md` W3's acceptance line: "flag off restores the W2 **root**
  byte-for-byte — amended W3-fix (R4): the first-launch tour is the one
  exception."

## Rebuttals — what I did not change

**V-3 (`ProfileView`'s 120 pt tail).** Left alone, deliberately. The review's own
evidence is that this is a wave-wide pattern, not an R2 defect:
`YourSpacesView:97` and `RecommendationsView:278` reserve the same 120 pt, so
three of the four tab roots do. Fixing one of the four would leave the Studio tab
scrolling to a different bottom than Spaces and Pieces — a visible inconsistency
traded for invisible dead space that clips nothing. It belongs to one owner in
W4, as the review says.

**V-4 / V-5.** No code owed. `DailyRoomView:231`'s *"See all"* → `.profile` now
pushes a titled-nothing `ProfileView` onto Today; that is C23's push rule
behaving as written, and re-pointing it at `.studio` would change a ruled
navigation contract on my own authority. Named here so Kody's walk can rule it.
The QR door is live at `SettingsView:71`; only its route changed.

**V-7.** Not mine to close — the wave record lives in the main checkout and only
Fable's ff-merge can carry it. This round adds `shots/w3-fix2-01…`,
`shots/w3-fix2-02…` and this file to the same untracked set.

---

## Gate — re-run exactly as F ran it

| Tier | Result |
|---|---|
| `./apps/mobile/Patina/scripts/ios-gate.sh build` | `** BUILD SUCCEEDED **` (one earlier failure was a real `error:`, the `Sendable` conformance; fixed, not retried away) |
| `xcodebuild test -only-testing:PatinaTests -destination id=A71FDDF2-…` | `** TEST SUCCEEDED **` — **passed 1083, failed 0, skipped 0**, device `dr-w3-int`, iPhone 17 Pro / iOS 26.5 (`Test-Patina-2026.08.28_05-07-50--0500.xcresult`) |
| `./apps/mobile/Patina/scripts/ios-gate.sh lint-delta main` | `✓ lint-delta: no new warnings in touched files` |
| Signed rebuild (no `CODE_SIGNING_ALLOWED=NO`) | `** BUILD SUCCEEDED **`; `codesign -dv` → `Identifier=cloud.patina.app`, `Signature=adhoc`; installed on `A71FDDF2-…` |

`app_path`:
`/Users/kody/Library/Developer/Xcode/DerivedData/Patina-fqrqjvpfaowactdbiglvkpeuvzpz/Build/Products/Debug-iphonesimulator/Patina.app`

## Commits

| SHA | Subject |
|---|---|
| `c25c758bf` | `fix(ios): the tour's card sits on the side of its anchor that has room` |
| `28597eaa7` | `fix(ios): the Studio tab no longer offers the screen it already is` |

## Still owed to Kody's signed-in walk

The Studio tab's Companion menu signed in: five rows, and **no "Your profile"**.
That is the frame V-2 was invisible in, and the guest walk cannot produce it.
