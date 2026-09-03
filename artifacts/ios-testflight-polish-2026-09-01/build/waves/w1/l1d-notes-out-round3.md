# W1 · L1-D — integration notes out, round 3 (2026-09-02)

Written after the adversarial review of round two (`RL1D-01` … `RL1D-22`). Rounds one and two are
at `l1d-notes-out.md` and `l1d-notes-out-round2.md`.

**Round three sends almost nothing, for two opposite reasons.**

Round two routed ten call-site swaps to L1-C and three to L1-A and reported the findings closed on
the strength of them. Measured on `first-flight/w1-l1c`:

```
$ git grep -n 'OnDark\.\|Border.hairline\|Border.strong\|patinaChromeScrim\|stillChoosingPieces' \
    first-flight/w1-l1c -- 'apps/mobile/Patina/Patina/Features'
(no output)
```

L1-C merges **first** under D14 and applied none of `D→C-1` … `D→C-10`, so **L1-D applied them
itself**. And in the other direction: `first-flight/w1-l1a` turns out to have applied all three of
its notes already — `A-11`, `P-25` and `C3-06`'s auth half are closed on L1-A's branch, with
`PatinaTests/QuizIconographyTests.swift` pinning them. Round two's `D→A-1`/`-2`/`-3` are therefore
**withdrawn, not re-sent**; re-sending them would have been the same mistake in reverse.

What is left is one note about lines the siblings *add*, and one merge-resolution recipe.

---

## What L1-D took over, and why — read this before merge 2

PROGRAM.md §3 says a lane needing a change in another lane's file writes an integration note and
*the owner applies it as a numbered task in its own list*. For L1-C that did not happen, and nine of
this lane's eighteen findings were parked behind it.

Three things make taking the work over the right call rather than a land-grab:

1. **§5's routing rule**, which the charter uses to assign findings in the first place:
   *"the concern decides the lane, the folder is the tiebreaker"*, with
   *"colour, contrast, dark mode, typography, iconography, imagery, money formatting → **L1-D**"*.
2. **§3's merge-order rationale**, in its own words: *"L1-D second because its token changes are
   **the other whole-app sweep**."* The merge order was designed on the assumption that L1-D's
   branch touches the whole app.
3. **The exit criteria are unreachable otherwise.** "`pearl` has zero direct call sites outside the
   token file", "zero `.font(.custom(` in `Features/**`" and "one money format" are app-wide
   statements. A lane that owns eight files cannot make an app-wide statement true by writing notes.

The cost is measured below rather than asserted, and it is not free.

---

## `D→A-7` → **L1-A** · two new `pearl` strokes on the Welcome screen

L1-A's own edits **add** two `pearl` sites that did not exist on the base sha:

```
$ git diff $(git merge-base HEAD first-flight/w1-l1a) first-flight/w1-l1a -- apps/mobile \
    | grep '^+.*PatinaColors\.pearl'
+                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
+                    .stroke(PatinaColors.pearl, lineWidth: 1.5)
```

Both are in `Features/Authentication/Views/AuthScreenView.swift` (on L1-A's branch, around :252 and
:417 — re-grep rather than trusting the numbers), and both are the outline of a control a tester
taps on the app's **first screen**. `pearl` is 12.84:1 on the dark canvas: the outline is brighter
than the label inside it.

Final text for both:

```swift
.stroke(PatinaColors.Border.strong, lineWidth: 1.5)
```

`PatinaColors.Border.strong` is on the integration tip after merge 2; L1-A merges fifth, so this is
a rebase-time apply. **Please make it an explicit L1-A exit line** — `BorderTokenAdoptionTests`
`pearlHasNoCallSitesOutsideTheTokenFile` is a **bar at zero** on this branch, not a ratchet, so
merge 5 turns red on these two lines otherwise.

## `D→F-3` → **L1-F** · the fifth `pearl` divider, the one `C-13` adds

Replying to `L1F→D-2`, which is right on every point.

Four of the five are **applied on this branch** — `ThreadDetailView`'s composer rule,
`ThreadListView`'s row rule and its unread-chip outline (→ `Border.strong`, since that one is a rule
a tester is meant to see), and `NotificationFeedView`'s row rule. The fifth is the thread header's
bottom rule that `C-13` **adds**, confirmed on L1-F's branch:

```
$ git diff $(git merge-base HEAD first-flight/w1-l1f) first-flight/w1-l1f -- apps/mobile \
    | grep '^+.*PatinaColors\.pearl'
+            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
```

It does not exist here, so it stays exactly what L1-F called it — a rebase-time apply:

```swift
Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)
```

Same note as above: the pearl bar is zero, so merge 4 turns red on this one line otherwise.

## `D→C-12` → **L1-C** · `RoomTypePillRow`'s rewrite reintroduces both findings it sits on

L1-C rebuilds `RoomTypePillRow` for `C6-18` (a 44 pt floor) and `ViewThatFits` — good changes — and
carries the old chip body into the new `chip(raw:label:)` verbatim, including both of L1-D's
findings on that control:

```swift
.foregroundStyle(isSelected ? .white : PatinaColors.Text.secondary)
.background(Capsule().fill(isSelected ? PatinaColors.clay : PatinaColors.Background.secondary))
.overlay(Capsule().stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5))
```

`white` on `clay` is `C3-05`'s 2.18:1, and `pearl` is `C3-01`. Final text for the two lines:

```swift
.foregroundStyle(isSelected ? PatinaColors.offWhite : PatinaColors.Text.secondary)
.background(Capsule().fill(isSelected ? PatinaColors.clayInk : PatinaColors.Background.secondary))
.overlay(Capsule().stroke(isSelected ? PatinaColors.clayInk : PatinaColors.Border.strong, lineWidth: 1.5))
```

`clayInk` (#82612F) is 5.31:1 under `offWhite`; `clay` is 2.18:1 and `clayDeep` is 3.54:1, so
neither of those can carry the label. L1-C merges **first**, so in practice this is one of the
eleven conflicts below and the steward resolves it at merge 2 — the text above is what to land.

---

## The eleven merge conflicts, and the one rule that resolves all of them

Measured, not guessed:

```
$ for b in l1a l1b l1c l1e l1f; do git merge-tree --write-tree --messages HEAD first-flight/w1-$b; done
```

| against | conflicted files |
|---|---|
| `w1-l1c` (merge 1) | `DailyGreetingHeader.swift`, `ProductDetailView.swift`, `RoomTypePillRow.swift` |
| `w1-l1b` (merge 3) | `ScanFallbackEntryView.swift`, `RoomBudgetBar.swift`, `RoomGalleryCard.swift`, `WholeHomeCrossRoomBar.swift`, `CrossRoomView.swift` |
| `w1-l1a` (merge 5) | `AuthScreenView.swift`, `InvestmentPerspectiveView.swift`, `ScanFloorPlanPreviewView.swift` |
| `w1-l1e`, `w1-l1f` | **clean** |

**Every one of L1-D's sides is a token or formatter substitution inside a hunk the other lane
restructured.** So the resolution rule is the same eleven times:

> **Take the other lane's structure. Then re-apply L1-D's substitution inside it.**

There is no case where the two changes disagree about behaviour. The exact substitutions:

| file | take theirs, then re-apply |
|---|---|
| `DailyGreetingHeader.swift` | both count badges: `Capsule().fill(PatinaColors.clayInk)` (was `clay` / `clayDeep` under an `offWhite` label) |
| `ProductDetailView.swift` | hero → `PatinaAsyncImage(url: product.imageURL.flatMap(URL.init(string:)), caption: product.name)`, no `placeholderGradient` arm; the 0.5 pt action-bar divider → `Border.hairline` |
| `RoomTypePillRow.swift` | the three lines in `D→C-12` above |
| `ScanFallbackEntryView.swift` | 3 × `pearl` → `Border.strong`; `Inter-Regular 15` → `PatinaTypography.bodySmall`; `DMMono-Regular 14` → `PatinaTypography.monoLarge` |
| `RoomBudgetBar.swift` | `pearl` ink → `OnDark.secondary`; `PlayfairDisplay-Medium 22` → `PatinaTypography.h4Medium`; `money(_:)` body → `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `RoomGalleryCard.swift` | divider → `Border.hairline`; `budgetString` body → `PatinaCurrency.formatWholeDollars(cents: cents)` |
| `WholeHomeCrossRoomBar.swift` | tile fill → `clayInk`; summary ink → `OnDark.secondary`; `dollarString` → `PatinaCurrency.formatWholeDollars(cents: totalCents)` |
| `CrossRoomView.swift` | 2 × rule → `Border.hairline` (one keeps `.opacity(0.5)`); the no-type room swatch → `Border.strong`; `summary` → `PatinaCurrency.formatWholeDollars(cents: totalCents)` over the un-divided cents |
| `AuthScreenView.swift` | `pearl` → `Border.strong` (and `D→A-7`'s two new ones) |
| `InvestmentPerspectiveView.swift` | the conditional face → `.font(isDiscussRow ? PatinaTypography.patinaVoice : PatinaTypography.h5Regular)`; `DMMono-Regular 11` → `monoLabel`; the row rule → `Border.hairline` |
| `ScanFloorPlanPreviewView.swift` | both `DMMono-Regular 11` (no `relativeTo:` at all) → `PatinaTypography.monoLabel` |

**The three bars verify the resolution for you.** They are bars, not ratchets, so a missed
re-application fails the gate rather than drifting:

- `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` → 0
- `TypographyAdoptionTests.zeroInlineFontCustom` → 0
- `CurrencyFormattingTests` `compactFormatterCeiling` → 0

Run `ios-gate.sh unit` after each merge and the three of them will name any line that got lost.

---

## For the steward, at merge 2

- The tip after merge 2 carries `PatinaColors.Border.hairline` / `.strong` / `.onDark`,
  `PatinaColors.OnDark.*`, `PatinaColors.Scrim.chrome`, `PatinaColors.Text.error`,
  `PatinaColors.clayInk` (now with call sites), and the typography members `display2Regular`,
  `h4Medium`, `h5Regular`, `captionRegular`, `captionSerif`. Lanes 3–6 can use all of them.
### A pre-existing flake, so merge 2 does not meet it cold

**`ios-gate.sh unit` is RED on this branch, and not for anything this lane did.** Three full-tier
runs, same commit, same clone:

| run | result | failing suites |
|---|---|---|
| 1 | 1606 tests, 12 issues | `OrderHandoffTests` ×6 · `RoomBudgetTests` ×3 · `MoneyAndStudioCopyTests` ×2 · `SelectedStateTests` ×1 |
| 2 | 1606 tests, **2** issues | `OrderHandoffTests` only, 2 tests |
| 3 | 1606 tests, **6** issues | `OrderHandoffTests` only, **4** tests |

Runs 2 and 3 are the same code. The nine non-`OrderHandoff` issues in run 1 were real and are fixed
(three suites were pinning the behaviour `C5-14` and `A-73` exist to change; one was this lane's own
source pin false-positiving on a progress bar). `OrderHandoffTests` is the residue, and it is a
flake:

```
$ xcodebuild test … -only-testing:PatinaTests/OrderHandoffTests
✔ Test run with 15 tests in 1 suite passed after 0.090 seconds.
** TEST SUCCEEDED **
```

**0.090 s alone; a 3 s timeout expires under the 180-suite parallel tier.** The helper is
`waitFor(timeout: .seconds(3))` polling a `@MainActor` condition every 5 ms
(`OrderHandoffTests.swift:337-347`); under load the cooperative pool starves both the poll and the
code under test.

It is not this lane's doing, measured rather than asserted:

```
$ git diff --name-only main...HEAD -- \
    apps/mobile/Patina/PatinaTests/OrderHandoffTests.swift \
    apps/mobile/Patina/Patina/Features/Purchase/OrderHandoff.swift \
    apps/mobile/Patina/Patina/Services/Analytics
(no output)
```

This lane's only edits anywhere near it are two colour literals and a button outline in
`Features/Purchase/**`.

**L1-D is deliberately not fixing it.** `Features/Purchase/**` is "no lane, no W1 work" in §3's
residue table, and a lane widening another area's timeout to turn its own gate green is the sort of
thing that should be a decision rather than a side effect. The one-line change, if the steward wants
the wave's gate green, is `OrderHandoffTests.swift:338`:

```swift
        timeout: Duration = .seconds(10),
```

The assertion still fails if the condition never becomes true — only the patience changes.
- **`C-01` and `C-02` are fixed but not reachable by a round-one tester on the default root.** On
  the four-tab root that D1 makes the shipped product, the floating Companion retires. The fixes are
  correct and they matter on the kill-switch fallback root; nobody should count them as a
  tester-visible win in the What-to-Test.
