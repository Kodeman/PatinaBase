# W1 · L1-D — notes out, fix round 3

Branch: `first-flight/w1-l1d`. Every note below is also appended to the target
lane's `build/waves/w1/l1-<lane>-notes.md` with the same text.

---

## To Fable — the residue ratification package (`RL1D-R3-02`, blocker)

`git diff --name-only main...HEAD -- apps/mobile` returns **113 paths** on this
branch. PROGRAM.md §3 names, by glob, ten of them plus two directories. The rest
fall into three groups, and the review is right that nothing has ratified them.
Here is each group with the exact diff shape, so the ruling is on a measured
thing.

### Group A — the C3 ledger sweep (≈95 files) · **the charter authorises this**

PROGRAM.md §3, L1-D's "Owned files (exact globs)" block ends:

> `# plus, by integration note, the exact colour/font literals inside files other`
> `# lanes own — the C3 ledger enumerates all 89 pearl sites, all 46 inline`
> `# .font(.custom(...)) sites, and the ~15 clay-filled selection controls.`

and the exit criteria are app-wide: "`pearl` has zero direct call sites outside
the token file; zero `.font(.custom(` in `Features/**`; one money format". Those
three sentences cannot both be true and confined to ten files. Every edit in this
group is a one-token substitution:

| from | to | why |
|---|---|---|
| `PatinaColors.pearl` | `PatinaColors.Border.hairline` / `.strong` | `C3-01` — 12.84:1 in dark |
| `PatinaColors.error` (as ink) | `PatinaColors.Text.error` | `A-73` — 3.03:1 light |
| `.font(.custom("…"))` | a `PatinaTypography` token | `C3-15` |
| `PatinaColors.clay` (as a fill under a light label) | `Interactive.active` + `Text.inverse` | `C3-05` — 2.18:1 |
| a hand-rolled `$…K` | `PatinaCurrency.formatWholeDollars` | `C5-14` |

No layout, no structure, no behaviour. `git diff main...HEAD -- <any group-A file>`
is a list of colour and font identifiers.

### Group B — four directories the residue table marks "No lane, no W1 work"

PROGRAM.md §3's residue table, last row:

> `Features/Purchase/**`, `Features/Orders/**`, `Features/Budget/**`,
> `Features/Conversation/**`, `Features/Collections/Views/**` beyond the schema
> side — **No lane, no W1 work.** `direct-orders` is off for round one (D1) and
> these carry no T0 row. — (W2/W3)

This branch touches eight files in them:

| file | what changed |
|---|---|
| `Features/Purchase/AskAboutPieceSheet.swift` | 1 `pearl` → `Border.hairline` |
| `Features/Purchase/AskDesignerSheet.swift` | 1 `pearl` → `Border.hairline`, 1 `error` → `Text.error` |
| `Features/Purchase/OrderSheet.swift` | 2 `pearl` → `Border.hairline`, 2 `error` → `Text.error` |
| `Features/Purchase/PurchaseActionBar.swift` | `C3-05`/`C-41`: the saved "Add to room" pill was `clay` + `Text.inverse`, identical to the Buy capsule beside it. Now an outline with accent ink. **This one is a visible change, not a substitution.** |
| `Features/Orders/Views/OrderDetailView.swift` | 2 `pearl` → `Border.hairline` |
| `Features/Orders/Views/OrderedListView.swift` | 1 `pearl` → `Border.hairline` |
| `Features/Budget/BudgetBlocks.swift` | 1 `pearl` → `Border.strong` |
| `Features/Collections/Views/CollectionsView.swift` | 1 `pearl` → `Border.hairline` |

**The tension, stated plainly.** `pearl` is 12.84:1 against the dark canvas.
Leaving these eight files alone means eight screens keep a border that is the
brightest thing on them in dark mode, and `C3-01`'s exit criterion ("zero direct
call sites") is false. Editing them means eight files changed in directories the
charter says have no W1 work. **The lane took the sweep** because the exit
criterion is written app-wide and a hairline is not a feature — but the call is
Fable's, and reverting group B costs one `git checkout main -- <paths>` plus a
line in `BorderTokenAdoptionTests` naming the eight as exempt.

`PurchaseActionBar.swift` is the one that should be ruled separately: it is a
design change (two filled buttons became one filled + one outline), it is in a
`direct-orders` surface that D1 turned OFF for round one, and it is pinned by
`SelectedStateTests.thePurchaseBarHasOneFilledButton`. If group B is reverted,
that test goes with it.

### Group C — `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj` · **L0.1's file**

One change: a `PatinaDesignKit` product dependency on the **PatinaTests** target.
Without it `@testable import Patina` cannot see the kit's public symbols and
`ContrastTests`, `DynamicTokenTests`, `SelectedStateTests`, `ImagePlaceholderTests`
and `CompanionOrbAppearanceTests` do not compile. It cannot be reverted without
deleting five suites. Flagging it so L0.1 sees it rather than meets it.

---

## To the steward — the conflict table, re-measured at the branch tip (`RL1D-R3-02`)

Measured with
`git merge-tree --write-tree --messages HEAD first-flight/w1-<lane>` at
`first-flight/w1-l1d`'s tip, this round. **Fifteen conflicts, not eleven.** The
four the previous notes had no row for are marked ✱ — two of them are where
`C-01`'s and `C-02`'s fixes live, so a "take theirs" silently reverts a finding.

| # | lane | file | resolution |
|---|---|---|---|
| 1 | l1a | `Features/Authentication/Views/AuthScreenView.swift` | Take **L1-A's** structure. Then apply `D→A-2`'s two rows: both `.stroke(PatinaColors.pearl, lineWidth: 1.5)` → `PatinaColors.Border.strong`. |
| 2 | l1a | `Features/StyleConversation/Views/InvestmentPerspectiveView.swift` | Take **L1-A's** structure; re-apply `.fill(PatinaColors.pearl)` → `.fill(PatinaColors.Border.hairline)` at the divider. |
| 3 | l1a | `Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift` | Take **L1-A's** structure; re-apply the `.font(.custom(` → `PatinaTypography` promotions (`C3-15`). |
| 4 | l1b | `Features/RoomScan/Views/ScanFallbackEntryView.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 5 | l1b | `Features/Rooms/Components/RoomBudgetBar.swift` | Take **L1-B's** structure; re-apply BOTH — `Background.dark` for the bar and `PatinaCurrency.formatWholeDollars` for the two figures (`C5-14`). The compact `$2.4K` renders from here; `CurrencyFormattingTests` fails if it comes back. |
| 6 | l1b | `Features/Rooms/Components/RoomGalleryCard.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 7 | l1b | `Features/Rooms/Components/WholeHomeCrossRoomBar.swift` | Take **L1-B's** structure; re-apply `Background.dark` + `clayInk`. |
| 8 | l1b | `Features/Rooms/Views/CrossRoomView.swift` | Take **L1-B's** structure; re-apply `pearl` → `Border.hairline`. |
| 9 ✱ | l1b | `PatinaTests/RoomBudgetTests.swift` | **Union, not either side.** L1-D added assertions that the bar's two figures are `PatinaCurrency` output; L1-B's edits are about the bar's data. Both sets of `@Test`s must survive — a "take theirs" drops `C5-14`'s pin on the one surface that rendered `$2.4K` live. |
| 10 ✱ | l1c | `Features/Companion/Components/CompanionHearthView.swift` | **Union.** L1-C changes the panel's layout/inset; L1-D changes (a) `Text.inverse` → `OnDark.*` on the status line — that is `C-02`, 1.11:1 — and (b) adds the `Border.onDark` hairline on the shell — that is `C-01`. Taking L1-C's side reverts both. `CompanionOrbAppearanceTests.thePanelSubtitleUsesOnDarkInk` and `.theCompanionSurfacesDrawTheirEdge` fail if it happens. |
| 11 ✱ | l1c | `Features/Companion/Views/CompanionOverlay.swift` | **Union.** L1-C changes the overlay's bottom inset; L1-D changes the State-5 pill's tint off a hard-coded `charcoal.opacity` (`C-01`) and the suggested-action tile off raw `clay` (`C3-05`). `everyCompanionDiscIsAdaptive` fails if L1-C's side wins. |
| 12 | l1c | `Features/Home/Views/DailyGreetingHeader.swift` | Take **L1-C's** structure; re-apply `clayInk` on the two capsules. |
| 13 | l1c | `Features/ProductDetail/Views/ProductDetailView.swift` | Take **L1-C's** structure; re-apply `PatinaAsyncImage` (`A-36`). The `floatingCircleButton` scrim (`C-27`) lives in `ProductDetailBlocks.swift`, which does **not** conflict. |
| 14 | l1c | `Features/Rooms/Components/RoomTypePillRow.swift` | Take **L1-C's** structure — L1-C merges first and rewrote it for `C6-18`. Then apply `D→C-6` and `D→C-7`: selected fill `Interactive.active` + label `Text.inverse`; unselected stroke `Border.strong`. `SelectedStateTests` carries a deferred allowance of 1 for this file and it must go to 0 here. |
| 15 ✱ | l1c | `Features/Home/Views/HouseRecordCard.swift` | **Union, and read it.** New at this tip: L1-D restructured `HouseRecordRowView` so a route-less row is not a disabled `Button` — that is `C-20`'s rendered 4.27:1, and it is a *structural* change, not a token swap, so none of the three greps would notice it going missing. L1-C's side is the card's layout. `HouseRecordRowInkTests` (a rasterised assertion) and `theCardDoesNotDisableItsRows` both fail if `.disabled(row.route == nil)` comes back. |

`l1e` and `l1f` conflict with nothing at this tip. Re-measured at the final tip
after the fix round's commits; `HouseRecordCard.swift` is new since round three.

**The three bars are not enough on their own.** `pearl = 0`, `Font.custom = 0`
outside the token file, and `compact money = 0` catch a lost substitution. They do
**not** catch a lost `Border.onDark` edge, a lost `OnDark` status line, or a lost
`Interactive.active` fill — those are additions, not removals. Rows 9, 10, 11, 14 and 15 need reading, not greping —
and row 15 is a control-flow change no grep can see at all.

---

## To the steward — `D→X-2`: one of L1-D's four gate lines cannot run (`RL1D-R3-07`)

PROGRAM.md §3 gives this lane four gate lines. The third is:

```bash
swift test --package-path apps/mobile/PatinaDesignKit
```

Run at the branch tip:

```
apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift:8:8:
  error: no such module 'UIKit'
error: fatalError
(exit 1)
```

Pre-existing: `git show main:apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Support/HapticManager.swift`
has the same `import UIKit`, and `ls apps/mobile/PatinaDesignKit` shows only
`Package.swift` and `Sources/` — **there has never been a Tests target**. So
PROGRAM.md's two `PatinaDesignKitTests/*.swift` entries had nowhere to go;
`ContrastTests.swift` and `DynamicTokenTests.swift` are in `PatinaTests/` and run
under `ios-gate.sh unit`. Neither fact was written down before this note.

**Do not read this line as a signal at any merge.** It is red on `main` and red on
every lane branch.

---

## To the steward — `D→X-3`: two suites are a pre-existing timing flake (`RL1D-R3-15`)

`ios-gate.sh unit` on this branch has failed with 2, 6, 7 and 12 issues on
identical code. The failures are confined to:

- `PatinaTests/OrderHandoffTests` — `waitFor(timeout: .seconds(3))` at
  `OrderHandoffTests.swift:337-347`
- `PatinaTests/CompanionCoachingModelTests` — `introGate_freshUser_pollsUntilTourResolves`

Re-run alone on the same clone, both pass:

```
xcodebuild test … -only-testing:PatinaTests/OrderHandoffTests \
                  -only-testing:PatinaTests/CompanionCoachingModelTests
✔ ** TEST SUCCEEDED **
```

`git diff --name-only main...HEAD` touches neither suite nor
`Features/Purchase/OrderHandoff.swift` nor `Services/Analytics`.
`Features/Purchase/**` is residue (group B above), so this lane did not take the
one-line fix. **D14 runs a gate between every merge**, so the steward meets this
five more times tonight. Either take `timeout: Duration = .seconds(10)` on
`OrderHandoffTests.swift:338` as an explicit decision, or put both suites on a
named known-flake list the steward reads before calling a merge red.

---

## `D→E-3` → **L1-E** · a second empty-state sentence on browse (`RL1D-R3-11`)

Browse's category chip goes to the RPC as `p_category` (SP-02), so an empty
*category* returns zero rows through the same branch as an empty *catalogue* —
and the tester who taps "Lighting" is told "Your designer is still choosing pieces
for you" over a catalogue that is fine.

The **condition** is L1-D's and has shipped:
`RecommendationsView.swift` now branches on `viewModel.activeFilter == "All"`.
The **wording** is L1-E's row. What shipped, pending your ruling:

```swift
static let noPiecesInThisCategory = PatinaEmptyStateContent(
    icon: "line.3.horizontal.decrease",
    title: "Nothing in this one",
    message: "There is nothing here yet. Try another kind of piece."
)
```

in `PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaEmptyState.swift`,
beside `stillChoosingPieces`. Constraints it was written against: it must not
claim anything about the catalogue as a whole, must not blame the reader, and
must not offer a door — `PatinaEmptyState` renders no CTA when `ctaTitle` is nil,
and this one has none. If you want different words, they land in the same
constant and no other file changes.

---

## `D→A-8` → **L1-A** · two `pearl` strokes (renumbered; `RL1D-R3-08`)

**This note was previously appended to `l1-a-notes.md` as `D→A-7`, which was
already taken.** `D→A-7` in that file means "AuthButton is kept, deliberately".
This is `D→A-8`; nothing about the content changed.

Two `pearl` strokes in files L1-A owns, which merge 5 turns red on otherwise:

| file:line | today | final |
|---|---|---|
| `Features/StyleConversation/Shared/Components/StylePillButton.swift:36` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |
| `Features/StyleConversation/Views/PriorityView.swift:71` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.pearl,` | `isSelected ? PatinaColors.Interactive.active : PatinaColors.Border.strong,` |

**Withdrawn, do not act on:** the rows previously sent as `D→A-4` (P-25's
`"000000"` placeholder) and `D→A-5` (the quiz's thirteen emoji). Both are closed
on `first-flight/w1-l1a` — verified here:
`AuthenticationView+Panels.swift:127-139` is `TextField("", …, prompt:)` with
`accessibilityLabel("Sign-in code")` and a digit-counting value;
`StyleQuizView+Questions.swift:73` is `Image(systemName: icon)`. `l1d-tasks.md` §4
still listed them and was wrong (`RL1D-R3-10`).

**Also for L1-A's information (no action):** `SelectedStateTests` on this branch
carries a deferred allowance of **2** for `StyleQuizView.swift` (`:243`, `:335` on
`main`) and **1** for `AuthenticationView.swift`. Both are your files, both are
closed on your branch, and all three counts must reach zero on the tip after
merge 5. If your rebase leaves a light label on a raw `clay` fill in either file,
that test names it.

---

## `D→C-13` → **L1-C** · the two Companion files are a UNION merge (`RL1D-R3-02`)

`CompanionHearthView.swift` and `CompanionOverlay.swift` conflict between our
branches and neither previous note gave them a resolution row. Both carry
`C-01`/`C-02` fixes on L1-D's side that a "take L1-C's structure" would silently
revert:

| file | L1-D's side, which must survive | pinned by |
|---|---|---|
| `CompanionHearthView.swift` | the panel's status line off `Text.inverse` and on `OnDark.*` (`C-02`, 1.11:1); the shell's `Border.onDark` hairline (`C-01`) | `thePanelSubtitleUsesOnDarkInk`, `theCompanionSurfacesDrawTheirEdge` |
| `CompanionOverlay.swift` | the State-5 pill's tint off `PatinaColors.charcoal.opacity` (`C-01`); the suggested-action tile off raw `clay` and on `clayInk` (`C3-05`) | `everyCompanionDiscIsAdaptive`, `noLightLabelRidesOnTheRawAccent` |

`CompanionMarkView.swift` does **not** conflict; its `Border.onDark` edge lands
cleanly.

`D→C-6` and `D→C-7` (RoomTypePillRow) stand exactly as sent. L1-C merges first,
so those are applied at merge 2 on the integration tip, not by L1-C.
