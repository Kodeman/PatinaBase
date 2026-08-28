# W3 · lane N3 — the Companion in the bar, and the tour rewrite · task list

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w3-n3`, branch
`daily-return/w3-n3`, base `daily-return/w3-n1` @ `b101f5009` (**not** main — this lane consumes N1's
frozen interfaces). Simulator `2B7C2D64-2367-427E-B511-826E824E70CD` (`dr-w3-n3`, iPhone 17 Pro /
iOS 26.5, created fresh — `simctl clone` refuses a booted source and every existing device was
booted). Written before any code.

---

## 0. What this lane is answering

Two amendments, and both are *retirements* rather than new surfaces.

**B-2** — "the collapsed Companion stops being a centered floating orb over content and becomes the
tab bar's trailing slot — same Strata mark, same coaching phases, same ≤6 rows, same panel; it
expands to a sheet from the bar."

**B-8** — the three-step first-launch tour is **rewritten, not re-anchored**: step 1's copy becomes
*"This is Today — what moved in your house, and what is waiting on you."*, step 3 re-points at the
Studio destination with *"Your studio — projects, proposals, invoices and files"*, and
`FirstLaunchTourTests`' pinned strings move with them.

Plus the thing neither amendment names and the steward found (§7·E): **step 2 has been dead since W2**.
Its anchor `.addToRoom` mounts in no production view (`DailyProductCard` was retired), so the
shipped tour is two steps, verified in four separate research walks
(`research/2x-panel-u1.json`, `-u2`, `-d2`, `-h1`).

---

## 1. The bar's slot becomes the Companion's door (B-2)

N1 left the trailing slot as a mark and **not a control**, on purpose: `toggleCompanion()` flips
`isCompanionExpanded`, nothing observed it, and `HouseFirstRoot`'s
`.accessibilityHidden(coordinator.isCompanionExpanded)` meant a tap took all four stacks out of the
VoiceOver tree while presenting nothing (`n1-notes.md` §2a, §4d). The overlay observes the flag
first, then the slot becomes a button — **step 1 before step 3, always**.

Failing test first: `PatinaTests/CompanionBarSlotTests.swift`.

- the overlay observes `coordinator.isCompanionExpanded` and expands/collapses on it
- the resting dock is `.hidden` on the flag-on root and unchanged on the flag-off root
- the bar's slot is a `Button` on `toggleCompanion()` carrying `.accessibilityLabel("Companion")` —
  M1 §6's fifth VoiceOver name
- the expanded panel clears the bar rather than sitting under it
- `SourcePin`: `handleIntent` / `handleIntentWithResponse` are byte-identical to the base sha (C8)
- `SourcePin`: `CompanionActionRows`' composition is untouched — the ≤6-row menus are W1b's

Then implement, in this order:

1. `CompanionOverlay.swift` — `.onChange(of: coordinator.isCompanionExpanded)` → `expandToPanel()` /
   `collapseToButton()`, guarded on `state.isExpanded` so the overlay's own writes cannot re-enter.
2. `CompanionOverlay.swift`, `displayMode` — `if coordinator.isHouseFirstRoot, !state.isExpanded
   { return .hidden }`, placed after the `.expanded` return so expansion still resolves.
3. `CompanionOverlay.swift` — the expanded panel's bottom lift gains `PatinaTabBar.itemHeight` on the
   flag-on root, so the panel rises *from* the bar instead of under it.
4. `CompanionOverlay.swift:141` — `yieldsToPinnedFooter(for:houseFirst:)` takes the root (N1 §2b).
5. `HouseFirstRoot.swift` — N1's own pre-written three lines (`n1-notes.md` §2a step 3), applied
   verbatim. This is a cross-lane edit into N1's file; it is the patch N1 wrote out and asked for,
   and `HouseFirstRootTests.theCompanionSlotOpensThePanelOrIsNotAControl` is written to permit
   exactly it.

Commit `feat(ios): the Companion moves into the bar's trailing slot`.

## 2. The tour, rewritten (B-8 + steward §7·E)

Failing test first: the existing `PatinaTests/FirstLaunchTourTests.swift` pins, updated.

- `defaultSteps.map(\.anchor)` is `[.homeGreeting, .todayRecord, .profileMonogram]`
- the three fallback bodies are B-8's, verbatim
- the anchor raw values `home-greeting` / `add-to-room` / `profile-monogram` are **unchanged**
  (steward §7·F: renaming breaks the pinned test and the Sanity surface key), plus the new
  `today-record`
- every drop-path / renumbering test moves from `.addToRoom` to `.todayRecord` as the anchor whose
  absence is being exercised — the behaviour under test is the drop, not the case name
- `SourcePin`: exactly one production view mounts each of the three step anchors

Then implement:

- `FirstLaunchTour.swift` — add `case todayRecord = "today-record"`; rewrite `defaultSteps`' three
  fallbacks; keep `.addToRoom` in the enum (public API, and the `#if DEBUG` preview mounts it).
- `DailyRoomView.swift` — `.firstLaunchTourAnchor(.todayRecord)` on `HouseRecordCard`.

Commit `feat(ios): the first-launch tour speaks about Today, the record and the studio`.

### The two rulings this task takes

**Step 2 anchors on the record card, not the Saved row on Pieces.** The brief offered both. The
Saved row is disqualified three times over: the tour's model is owned by `FirstLaunchTour` inside
`DailyRoomView` and reaches its anchors through the `\.firstLaunchTourModel` **environment**, so an
anchor on the Pieces tab is not in its subtree and would never receive the popover; reaching it
would move the tour across a tab switch on first launch; and the Pieces tab does not exist on the
flag-off root at all, so step 2 would drop there — trading one dead step for another. The record is
on Today, inside the tour's own subtree, on both roots, and it is the block step 1 has just named.

**The rewrite is unconditional, not flag-branched.** B-8 says the tour "is gated by the same
`house-first` flag as the root it describes". Taken literally that means two step lists and two
mount sites. It is not worth it and it is not honest: step 1's old copy names the **Daily Room**,
which B-7(c) retires from canon on *both* roots; step 2's anchor is dead on *both* roots; and step 3
sits on the header's Studio control on *both* roots today. A flag-branched tour would leave the
flag-off root telling every new user about a screen that no longer has that name. The flag still
gates the root; the copy is true on either.

### Step 3's anchor — what is delivered, and what is not

B-8 re-points step 3 "at the Studio tab". Delivered: the **copy**, and the anchor kept on the app's
Studio door. Not delivered: the popover physically hanging off `PatinaTabBar`'s Studio item. The
tour model is created in `FirstLaunchTour`'s `@State` inside `DailyRoomView` and published down its
own subtree; the bar is a **sibling** of that subtree, mounted by `HouseFirstRoot`. Putting a step
on the bar means hoisting the tour above the four stacks (`HouseFirstRoot.swift`) and tagging the
item (`PatinaTabBar.swift`) — two of N1's files, one of them explicitly closed to this lane
(`n1-notes.md` §2c), and a structural change to the root whose byte-for-byte flag-off obligation is
W3's acceptance line. The anchor keeps its raw value `profile-monogram` per steward §7·F and stays
on `DailyGreetingHeader.studioControl`, which is the Studio door on both roots today. The exact
patch for whoever owns those files goes in `n3-notes.md`.

## 3. Sanity copy hand-off

The three surface keys (`ios-app/first-launch-tour/step-{1-home,2-saved,3-profile}`) keep their
identity — they are Sanity document keys, and renaming them orphans the documents. Only the bodies
change. The three new headings + bodies go to
`waves/w3/n3-sanity-copy.md` for Kody to paste into the studio; the app ships them as fallbacks so
it is correct before anyone touches the CMS.

## 4. Gate, sim check, notes

`ios-gate.sh build` from the worktree (twice if the Git-SHA phase fails without an `error:` line),
then `xcodebuild test -only-testing:PatinaTests -destination id=2B7C2D64-…` — the whole tier green.
Signed `.app`, no `CODE_SIGNING_ALLOWED=NO`. Sim check on the lane's own clone:
`-DeploymentTarget local -PatinaFlags house-first` (mark in the bar, expands, six rows, phases
intact, fresh-install tour shows the three new steps) and once **without** the flag (orb and Hearth
exactly as before). Shots `shots/w3-n3-NN-*.png`, ledger rows under `## w3-n3`,
`waves/w3/n3-notes.md` for the cross-lane items.
