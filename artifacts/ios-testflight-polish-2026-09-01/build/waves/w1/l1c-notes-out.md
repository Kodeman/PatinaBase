# W1 · L1-C — notes out

Written by L1-C on 2026-09-02, on branch `first-flight/w1-l1c`. L1-C merges **first**, so every note
below describes something already on the integration tip when the target lane rebases, or a change
the target lane owns and L1-C did not make.

Each block is appended verbatim to the target's `build/waves/w1/<target>-notes.md`.

---

## 1 → L1-D · `GAP4-16` — the two lines L1-C changed inside `RevealView.swift`

`RevealView.swift` is **L1-D's file by name** (PROGRAM.md §3 · L1-D globs: *"…
`Features/StyleReveal/Views/RevealView.swift` (C3-15, GAP4-16)"*), but `GAP4-16` is a **T1/blocker in
L1-C's W1 table** and the fix needs one line in that file. L1-C made the smallest change that closes
it and is telling L1-D exactly where, so the `C3-15` edit at `:85` / `:127` (the
`PlayfairDisplay-Light` face that is not shipped) rebases without a conflict.

**What changed, in full:**

`Features/StyleConversation/Shared/Components/StyleContinueButton.swift` (no lane owns it;
`GAP4-16` carries `alsoTouches: ["L1-D"]`) gains a ground variant, **defaulted so the four other call
sites are untouched**:

```swift
    enum Ground {
        case app
        case charcoal
    }
    …
    init(title: String = "Continue", isEnabled: Bool, ground: Ground = .app, action: @escaping () -> Void)
    …
    private var fillColor: Color {
        switch ground {
        case .app:      return PatinaColors.Interactive.active
        case .charcoal: return PatinaColors.offWhite
        }
    }

    private var labelColor: Color {
        switch ground {
        case .app:      return PatinaColors.Text.inverse
        case .charcoal: return PatinaColors.charcoal
        }
    }
```

`Features/StyleReveal/Views/RevealView.swift:54-59` — **one added argument, nothing else**:

```swift
                    StyleContinueButton(
                        title: profile.aestheticName.isEmpty ? "See What Fits Your Space" : primaryTitle,
                        isEnabled: true,
                        ground: .charcoal,
                        action: onPrimaryAction
                    )
```

`RevealView.swift:33` (`PatinaColors.charcoal.ignoresSafeArea()`) is **untouched** — the raw constant
stays, because the screen is a deliberate fixed-charcoal field and the fix is to tell the CTA so, not
to re-token the ground. If L1-D would rather paint the Reveal with semantic inverse-surface tokens
(the finding's first option), that supersedes this and `ground: .charcoal` can go with it.

Pinned by `PatinaTests/SheetChromeTests.theRevealCTAIsVisibleInLight`.

---

## 2 → L1-D · `GAP1B-07` — the global `.ghost` floor is still open

`GAP1B-07` measured `PatinaButton(style: .ghost)` at **17.6 pt** (consent Cancel y=681.8 h=17.6;
defer Cancel y=787.7 h=17.6). The finding's own `codeNote` says: *"The fix lands in PatinaDesignKit
PatinaButton, which L1-D owns — coordinate via an integration note."*

**L1-C closed the two measured call sites without touching your file**: both decision-sheet Cancels
now use `style: .secondary`, which is the same component at full width and 52 pt, and they sit in a
pinned bottom `safeAreaInset` beside their Approve / Send. `PatinaTests/TapTargetTests` pins that
neither decision sheet carries `style: .ghost` any more.

**What is still open, and is yours:** `.ghost` itself. In `PatinaButton.swift` the ghost style is

```swift
            .frame(maxWidth: style == .ghost ? nil : .infinity)
            .frame(height: 52)
```

— the 52 pt frame is there, but with `backgroundColor == .clear` and no `.contentShape`, the
accessibility frame collapses to the text's own bounds, which is the 17.6 pt that was measured. The
one-line answer:

```swift
            .background(backgroundColor)
            .clipShape(Capsule())
            .contentShape(Capsule())
```

(`.contentShape` after the clip, so the hit region is the 52 pt capsule for every style, not just
the filled ones.) There are other `.ghost` call sites in the app this would fix at the same time;
L1-C did not survey them, because the finding is scoped to the two decision sheets.

---

## 3 → L1-A · `GAP1B-08` — 44 pt on the six auth text links

`GAP1B-08` is in **L1-C's** W1 table with a `⇢L1-A` cross-reference, and its `codeNote` says *"Files
are L1-A-owned; the skeleton assigns the tap-target work to L1-C, so this needs an integration
note."* `Features/Authentication/**` is L1-A's glob and **L1-C did not edit it.**

Measured, via `idb ui describe-all` on the Welcome and Sign In screens:

| control | measured height |
|---|---|
| "Have a password? Sign in" | 14.67 pt |
| "Terms of Service" | 14.67 pt |
| "Privacy Policy" | 14.67 pt |
| "Forgot password?" | 17.0 pt |
| "Use magic link" | 17.0 pt |
| "Sign Up" | 17.0 pt |

All six against Apple's 44 pt floor, and they are the **first controls a TestFlight tester meets**.

**Exact final text** — on each of the six, applied to the `Button` (not to the `Text` inside its
label, which does not extend the button's hit region):

```swift
        .frame(minHeight: 44)
        .contentShape(Rectangle())
```

A `Button` whose label is bare `Text` hit-tests the glyph bounds; `.contentShape(Rectangle())` after
a `minHeight` frame is what makes the whole 44 pt row tappable. Two of the six sit side by side in
the legal line — give each its own frame rather than the row, so the two links stay separately
targetable.

Suggested pin, in L1-A's own suite:

```swift
    @Test("every auth text link reaches the 44 pt floor")
    func authLinksAre44Points() throws {
        for file in ["Patina/Features/Authentication/Views/AuthenticationView.swift",
                     "Patina/Features/Authentication/Views/AuthScreenView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            let links = code.components(separatedBy: "Button(").count - 1
            let framed = code.components(separatedBy: "frame(minHeight: 44)").count - 1
            #expect(framed >= links, "\((file as NSString).lastPathComponent): a link is under 44 pt (GAP1B-08)")
        }
    }
```

(L1-A knows the real file names; the two above are the ones the finding's evidence points at.)

---

## 4 → L1-A · `P-34` — the Welcome screen at accessibility text sizes

`P-34` is in **L1-C's** W1 table with `⇢L1-A`, and the screen is `Features/Authentication/**` —
L1-A's. **L1-C did not edit it.**

At `content_size accessibility-extra-extra-extra-large`
(`shots/P/40-welcome-ax3xl.png`) every button label truncates — "Start with a piece…", "Continue
with…" (Google), "Continue wit…" (email), "Look around f…", "Have a password? S…", "By continuing,
y…", "Term… and Priva…" — "Have a password? S…" and "Welcome home" run edge to edge with no left
gutter, and the screen does not scroll, so the legal links cannot be read at all. This is the first
screen in the app.

**The four changes, in the order they matter:**

1. **A `ScrollView` fallback above `.accessibility1`.** The screen is a fixed `VStack` today. Wrap
   the body so it can scroll when it no longer fits:

   ```swift
       @Environment(\.dynamicTypeSize) private var dynamicTypeSize

       var body: some View {
           Group {
               if dynamicTypeSize.isAccessibilitySize {
                   ScrollView(showsIndicators: false) { welcomeContent }
               } else {
                   welcomeContent
               }
           }
       }
   ```

2. **Multi-line button labels instead of truncation.** On each CTA's label:

   ```swift
       .lineLimit(2)
       .multilineTextAlignment(.center)
       .minimumScaleFactor(0.8)
       .fixedSize(horizontal: false, vertical: true)
   ```

3. **Stacked legal links.** "Terms of Service" and "Privacy Policy" share a row that truncates both.
   Use the same `ViewThatFits` shape L1-C used on the room-type chips:

   ```swift
       ViewThatFits(in: .horizontal) {
           legalRow          // the HStack it is today
           VStack(alignment: .leading, spacing: 8) { legalLinks }
       }
   ```

4. **Let the Apple button scale.** `SignInWithAppleButton` is `Features/Authentication/Views/
   SignInWithAppleButton.swift`, which PROGRAM.md §3 carves out to **L1-D** by name (`C3-03`,
   `P-35`) — so this fourth item is L1-D's, not L1-A's, and it is repeated in L1-D's notes above
   only by reference. Its fixed height is what truncates "Continue with…" first.

`GAP1B-08`'s 44 pt frames (note 3) land on the same screen; do both in one pass.

---

## 5 → L1-B · `C9-04` — four one-line swaps in files L1-B owns

`C9-04` ("twenty hard-coded bottom clearances, none derived from `CompanionHearthMetrics`") is
L1-C's, and it is closed **centrally**: one modifier, `.companionBottomClearance()`, defined in
`Design/Components/CompanionSafeArea.swift` (L1-C's file). It reads `isHouseFirstRoot` from the
coordinator in the environment and applies
`CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` — the same seam
`MoneyScreenMetrics.bottomClearance` already uses, so there is no second constant.

Applying it means one line changes in each container that hosted a literal. **Four of them are in
L1-B's globs, and L1-C made the change** (a `Spacer().frame(height: N)` or a
`.padding(.bottom, N)` becomes `.companionBottomClearance()`):

| file | was |
|---|---|
| `Features/Rooms/Views/CrossRoomView.swift:48` | `Spacer().frame(height: 120)` |
| `Features/Rooms/Views/RoomProjectView.swift:117` | `Spacer().frame(height: 100)` |
| `Features/Documents/DocumentListView.swift:22` | `.padding(.bottom, 120)` |
| `Features/Projects/Views/ProjectListView.swift:46` | `.padding(.bottom, 120)` |

Nothing else in those four files changed. `PatinaTests/CompanionInsetTests` scans all of
`Patina/Features/**` and fails on any `.padding(.bottom, N)` or `Spacer().frame(height: N)` with
`N >= 90` — so if a rebase reintroduces one, that suite names the file.

**`Features/RoomScan/**` is excluded from the scan on purpose**: `reservesRootHearth(for: .scanFlow)`
is `false`, so its 110 / 120 / 180 / 190 pt paddings clear the Whisper Bar and the shutter, not the
Companion. They are untouched and must stay untouched.

**Not moved into `patinaScreen`.** The obvious central seam was the pushed-screen scaffold, and
L1-C did not use it, for two reasons L1-B will care about: `ThreadDetailView` applies
`.patinaScreen` and **L1-F is adding its own `pinnedFooterClearance` padding there for `L07-02`**,
and the ten money screens carry `MoneyScreenMetrics.bottomClearance(houseFirst:)`, which
`MoneyAndStudioCopyTests.moneyScreensShareOneChromeSource` pins by name. A scaffold-level inset
would double with both.

Also in files L1-B owns, from L1-C's own findings — flagged so a rebase is not a surprise:

- `Features/Rooms/Views/YourSpacesView.swift` — steward ruling **S-1** moved this file to L1-C.
  `B-L04-1` (the `?` door), `C-05` (the `+` control's sibling help icon, and distinct
  `accessibilityLabel:` values on the two survivors), `C9-04` and L1-B's own `.refreshable` note are
  all applied there.
- `Features/Rooms/Views/NewRoomSheet.swift` — `B-60`, a T0 in L1-C's table: one ground filling the
  detent, and SF Symbols in place of the `◎` glyph and the 📐 emoji. No W1 L1-B row touches this
  file (`C7-10` and `C3-23` are both W2).
- `Features/Rooms/Components/RoomTypePillRow.swift` — `C6-18`, carved to L1-C by name in §3.

---

## 6 → L1-F · `C9-04` — one line in `ThreadListView.swift`, and `ThreadDetailView` untouched

`Features/Messaging/Views/ThreadListView.swift:44` was `.padding(.bottom, 120)` and is now
`.companionBottomClearance()` — the shared modifier described in note 5. That is the only change
L1-C made in `Features/Messaging/**`.

**`ThreadDetailView.swift` is untouched.** `L07-02` (the composer drawn under the tab bar, a W1
blocker) is L1-F's, and steward ruling **S-4** already records that `C9-05` left W1 in the D1
re-tier, so L1-F sends L1-C no `CompanionSafeArea.swift` note this wave and L1-C sends L1-F no
composer change. Two things worth knowing while you write that fix:

- `CompanionHearthMetrics.pinnedFooterClearance(houseFirst:)` is unchanged. L1-C added
  `CompanionBottomClearance.height(houseFirst:)` next to it, which returns exactly that value — use
  whichever reads better inside `ThreadDetailView`; they are the same number and
  `CompanionInsetTests` pins them equal.
- If you would rather take the modifier, `.companionBottomClearance()` reads `isHouseFirstRoot`
  from `@Environment(\.appCoordinator)` itself, so the call site needs no flag argument.

---

## 7 → L1-E · what L1-C changed that the copy deck may want to revisit

`build/waves/w1/l1-e-copy-deck.md` **did not exist** when L1-C ran, so no deck row was applied. Three
strings changed as a side effect of layout work, and L1-E should either bless them or replace them:

| where | string | why it changed |
|---|---|---|
| `Features/Rooms/Views/YourSpacesView.swift` | `HelpInfoIcon(accessibilityLabel: "About Your Spaces")` | `C-05`: three icons shared the label "More information". VoiceOver-only; not drawn. |
| `Features/Rooms/Views/YourSpacesView.swift` | `HelpInfoIcon(accessibilityLabel: "About Whole Home")` | same |
| `Features/Home/Views/DailyGreetingHeader.swift` | `HelpInfoIcon(accessibilityLabel: "About Today")` | same — and after `C-L04-1` this is Today's only help affordance |

And one **removal** L1-E should know about: the Settings → **Help Center** row is gone (`C5-05`;
`https://patina.cloud/help` is a live 404 that silently serves the marketing homepage). The Support
group now has two rows, "Contact Us" and "Terms & Privacy". If the deck carries a rewrite for the
Help Center row, it has nothing to land on until W2.

`C5-06` (the greeting strings) is **not applied** — its fix is in
`PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift`, which is L1-D's glob, and L1-C had
no deck row authorising the words.

> **Written before `l1-e-copy-deck.md` existed; superseded in part.** The deck landed at 18:06 while
> this lane was mid-flight. All six rows in `l1-c-notes.md` **and** the four `C5-10` casing rows in
> the deck's own "L1-C applies" table are applied. The full record, including the one thing the deck
> does not cover (the "Sign out" row now opens a "Sign Out" alert), is in `l1-e-notes.md`.

---

## 8 — for the steward: three things the lane found that are not findings

1. **`RevealView` was not reachable on the self-check path.** Completing the style quiz signed in
   lands on `StyleResultView` (the taste-portrait result), not the charcoal `RevealView` that
   `GAP4-16` is about. The fix is source-pinned
   (`SheetChromeTests.theRevealCTAIsVisibleInLight`) and the diff is two lines, but **no shot
   proves it**, and the wave should know the screen has a reachability question of its own before
   W2 schedules `C3-15` on the same file.

2. **`ProductDetailRoomSaveTests` and `CompanionSheetDriverTests` both pinned `presented = .help`**,
   the line L0.4's Tasks C-L04-2/C-L04-3 remove. L0.4's note says those two tests depend only on
   `HelpPanelSheet(`. They do not. Both are re-pinned on the arm, the sheet and the surface key —
   the three things that must survive round one — in `b836e20b2`. **Any other lane hiding a `?`
   door should expect the same shape of pin.**

3. **`lint-delta` counts warnings, so making a file smaller can fail it.** Moving the Companion
   coach mark out of an inline `.overlay` dropped `CompanionOverlay`'s body from 502 lines to 497 —
   across `type_body_length`'s *error* threshold (500) into its *warning* band (300), which the
   gate counts, while the error it replaced was invisible to the gate. Region-scoped disable with
   the reason in `18fe1297f`. Worth knowing before another lane spends a round on the same
   surprise.

---

# Fix round — notes that should have gone out with the first pass (2026-09-02)

Written after the adversarial review; rows `RL1C-10`, `RL1C-11`, `RL1C-17` and `RL1C-01`. Each block
below is **also appended verbatim** to its target's own inbox.

---

## 9 → L1-A · `StyleContinueButton` gained a defaulted `ground:` parameter

`Features/StyleConversation/Shared/Components/StyleContinueButton.swift` is inside **L1-A's** glob
(`Features/StyleConversation/**`, PROGRAM.md §3). L1-C edited it for `GAP4-16` and told L1-D but not
L1-A — `l1c-notes-out.md` §1 asserted the file had "no lane", which was wrong.

**What changed, so the rebase is not a surprise:**

```swift
enum Ground {
    /// The app's own canvas — the four quiz screens, unchanged.
    case app
    /// A permanently-charcoal surface (the Reveal). The capsule fills
    /// `offWhite` and the label is `charcoal`, instead of the semantic
    /// interactive fill that resolves to charcoal-on-charcoal there.
    case charcoal
}

var ground: Ground = .app
```

It is **defaulted**, so the four other call sites (the quiz screens) are byte-identical and need no
edit. The only caller passing it is `RevealView.swift:54-59`, which is L1-D's file by name.

**Nothing is asked of L1-A** beyond knowing it is there. If L1-A is touching this file for `P-34` or
`C3-03`, the `Ground` enum and the `ground` parameter are the two additions to keep.

**One consequence worth knowing:** L1-D took `GAP4-16`'s *first* option as well — `RevealView`'s body
is wrapped in `.environment(\.colorScheme, .dark)` on `first-flight/w1-l1d` — and the two compose
(D→C-9: "take both"; if only one can survive, take L1-D's). `ground: .charcoal` then reduces to a
no-op rather than a regression.

---

## 10 → L1-D · two `C3` sites survive L1-C's `C6-18` rewrite of the room-type chip

`Features/Rooms/Components/RoomTypePillRow.swift` is **L1-C's** by name (PROGRAM.md §3), and L1-C
merges **first**, so L1-D cannot reach into it — but the file is now a `C3-05` and a `C3-01` site and
L1-D's own ledgers enumerate both. L1-C rewrote the whole chip for `C6-18` (44 pt floor, `.isSelected`,
a wrapped arm) and deliberately did **not** move the colours, because the tokens are not on this
lane's base.

| line (after this lane) | today | what L1-D's sweep wants |
|---|---|---|
| the selected chip's fill | `PatinaColors.clay` under a `PatinaColors.offWhite` label — **2.18:1**, the exact `C3-05` shape | fill `PatinaColors.Interactive.active`, label `PatinaColors.Text.inverse` |
| the unselected chip's stroke | `PatinaColors.pearl`, `lineWidth: 1.5` | `PatinaColors.Border.strong` (this is an unselected chip edge — the rule a tester is meant to see, not a hairline) |

Both are in `private func chip(raw:label:)`. The `.white` → `.offWhite` change L1-C made does not move
the ratio; it was a token-hygiene edit, not a contrast one.

`D→C-7`'s own table already names `RoomTypePillRow.swift:32, 37` for `C3-05` and `D→C-6` names `:41`
for `Border.strong` — the line numbers have moved (the wrapped arm added lines above them), the sites
have not.

---

## 11 — for the steward · three `C9-04` swaps in files with no lane

`l1c-notes-out.md` §5 lists four `C9-04` one-line swaps sent to L1-B and §6 one sent to L1-F. Three
more were made and named in no note (`RL1C-11`). All three are the same single-line change —
a hard-coded bottom padding replaced by `.companionBottomClearance()` — and all three files are named
in `C9-04`'s own `where`:

| file | line | owner |
|---|---|---|
| `Features/Collections/Views/CollectionsView.swift` | `:188`, `:291` | **no lane** — PROGRAM.md §3's residue table says "No lane, no W1 work" |
| `Features/DesignServices/DesignRequestStatusView.swift` | `:126` | unassigned (`Features/DesignServices/**` beyond `DesignerConsultationView.swift`) |
| `Features/DesignServices/MatchIntroductionView.swift` | `:70` | unassigned |

Nothing is asked of anyone; this is so the steward knows which files moved and why, and so a lane that
later claims one of these globs is not surprised by a diff it did not make.

---

## 12 — for the steward · the fifteen notes L1-C could not apply, and who owns each after merge

Full table with the absent symbol and the grep that verified it: `l1c-tasks.md` §3, "Declined this
wave". Summary, because L1-C merges **first** and owns every one of these files, so no later lane can
reach them without being told:

| note | finding | owner after merge |
|---|---|---|
| `L1F→C-1` | `C2-07` — the bell's one count, `DailyRoomView.swift` | **L1-F** |
| `C-L1B-1` (third half) | `R-03` — the staleness sentence on Today | **L1-B** |
| `C-L1B-3` | `C4-03` — Your Spaces' failed-fetch state | **L1-B** |
| `C-L1B-4` | `R-02` / `A-81` — `unreadCountIsKnown` on the bell | **L1-B** |
| `D→C-1` | `C-02` — the Companion status line in dark mode | **L1-D** |
| `D→C-2` | `C-01` — the orb's optional hairline (take only if the shot says so) | **L1-D** |
| `D→C-3` | `A-36` / `C-27` / `B-18` — missing image + chrome scrim | **L1-D** |
| `D→C-4` | `A3-01` — the honest empty state | **L1-D** |
| `D→C-5` | `A3-17` — the story card with no hero | **L1-D** |
| `D→C-6` | `C3-01` — the `pearl` hairline sites in L1-C's files | **L1-D** |
| `D→C-7` | `C3-15` / `C3-05` — inline fonts and clay fills | **L1-D** |

Each needs a `PatinaDesignKit` symbol (`OnDark.*`, `Border.*`, `Scrim.chrome`, `clayInk`,
`PatinaEmptyState`, `PatinaAsyncImage(caption:)`, `patinaChromeScrim`, `voiceSmall`) or an L1-B/L1-F
view-model property that does not exist on `ba83aa67f` and therefore cannot compile on this branch.
`D→C-8` (`C-20`'s body half) was the one exception — pure layout, no kit symbol — and **is applied**.
`D→C-9` and `D→C-10` are records, not edits.

---

# Fix round 2 (2026-09-03)

## 13 → L1-B · `O11` is applied, on `matchScore > 0` rather than `hasMatchScore`

`A-34` / `C-11` are closed on `first-flight/w1-l1c`. Both call sites your note names, plus a third it
asks about, are guarded:

| file | what changed |
|---|---|
| `Features/ProductDetail/Views/ProductDetailView.swift` | the whole `HelpTooltip` + success-coloured pill is wrapped in `if product.matchScore > 0 { … }` |
| `Features/Recommendations/Views/RecommendationsView.swift` | the neutral match badge is wrapped in the same guard |
| `Features/Recommendations/Views/RecommendationsView.swift` · `cardAccessibilityLabel` | `let match = product.matchScore > 0 ? ", \(product.matchLabel)" : ""`, interpolated in place of the old unconditional `, \(product.matchLabel)` |

**The deviation, and the one line you need to change at merge 3.** Your final text guards on
`Product.hasMatchScore`. That property is yours and does not exist on this lane's base —
`grep -rn hasMatchScore Patina` returns 0 hits here. Rather than leave `A-34` open across five
merges, the guard is written as the predicate `hasMatchScore` is *defined* as (`matchScore > 0`,
`ProductModel.swift:212` on your branch). Identical behaviour.

**At merge 3, please re-point all three to `hasMatchScore`** — a pure rename. The pin that will tell
you if one is missed is `UnscoredMatchPillTests` (this lane's new suite); it asserts the literal
string `"if product.matchScore > 0"`, so it goes red on the rename and the three `#expect` strings
change with it. `MatchScoreResolverTests` keeps pinning the arithmetic on your side.

Your third question — "`RecommendationsView.swift:338` … check whether it is inside a scored-feed
branch already" — the answer is **no**: on this lane's tip that line is `cardAccessibilityLabel`
(`:347`), not a branch. Your own note's body is what decided it ("spoken as a card's headline
attribute is the same claim"), so it is guarded rather than left.

## 14 → L1-D · `RoomTypePillRow` moved again; `D→C-12`'s three lines are at new offsets

`D→C-12` and `D→C-13` are taken as written: the three token substitutions are **merge-2 work on the
integration tip**, not L1-C's, because `clayInk` and `Border.strong` do not exist on this lane's
base. Nothing is owed from you before then.

One correction to the line numbers in `D→C-12`, because this lane rewrote the file **again** in its
first fix round (`RL1C-05`: raising each chip to the 44 pt floor pushed the single row's ideal width
past the screen, so `ViewThatFits` was picking a hidden horizontal scroll at the **default** text
size and putting "Other" off-screen; a `wrappedChips` arm now sits between the one-row and scroll
arms). The chip body is unchanged in substance and now lives in `chip(raw:label:)`:

| what | line on `first-flight/w1-l1c` today | your substitution |
|---|---|---|
| label ink | `:75` `.foregroundStyle(isSelected ? PatinaColors.offWhite : PatinaColors.Text.secondary)` | `Text.inverse` / unchanged |
| fill | `:82` `.fill(isSelected ? PatinaColors.clay : PatinaColors.Background.secondary)` | `clayInk` |
| stroke | `:86` `.stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)` | `clayInk` / `Border.strong` |

`.white` → `.offWhite` was applied here in round one, which does **not** move the ratio (2.18:1
either way) — flagged so you do not read the file as already treated. The `SelectedStateTests`
deferred allowance of 1 for this file must still go to 0 at merge 2.

## 15 → L1-E · the five apostrophe rows are applied; your known issues can come off

`E3-L1C-1`, `E4-L1C-1`, `E4-L1C-2` and `E5-L1C-1` are all on `first-flight/w1-l1c` (commit
`da4068eb5`), spelled U+2019:

| file:line | final, as landed |
|---|---|
| `Features/Home/Views/HomeStoryRetryRow.swift:24` | `Text("Today’s story couldn’t load")` — both apostrophes |
| `Features/Home/Views/HomeStoryRetryRow.swift:31` | `Text("Let’s try that again")` |
| `Features/Companion/Services/CompanionActionRows.swift:38` | `: "See what’s on Patina"` |
| `Features/Companion/Services/CompanionActionRows.swift:73` | `"What’s been billed"` |
| `Features/Companion/Services/CompanionActionRows.swift:88` | `"What’s due"` |
| `Features/DesignServices/DesignerConsultationView.swift:25` | `They’ll reach out to help bring your space to life` |

`E4-L1C-2`'s note cites `:67` and `:82` for the two money hints; on this tip they are `:73` and
`:88` — this lane's own edits moved them. Same two strings, same one-character change.

`BrandVoiceLintTests.homeStoryRetryRowApostrophesAreCurly`,
`.companionActionRowsApostrophesAreCurly` and `.designerConsultationApostrophesAreCurly` can all be
unwrapped from `withKnownIssue` at merge 6. This lane also carries its own pin,
`PatinaTests/CurlyApostropheTests.swift` — three cases, both codepoints written as `\u{...}` escapes
— because L1-C merges first and L1-E merges last, so nothing on the integration tip held these bytes
for five merges. Duplicating your assertion is deliberate; delete this suite at merge 6 if you would
rather have one home for the rule, and nothing is lost.

**`E3-L1C-3` / `E4-L1C-3` — the greeting wrap: this lane accepts the wrap.** Both rounds say that is
a legitimate answer and neither gives final text. The reason is this lane's charter:
`DailyGreetingHeader.stacksControls(at:)` already puts the greeting on its own row above
`.accessibility1` (`GAP1B-03`), so at the size `r3-09-today-dark-axxxl.png` photographs it has the
full width of the screen and breaks **between words** — the outcome `C-06` asks for. Forcing one
line would mean shrinking the app's signature serif on its first screen or truncating a four-word
greeting. `C5-06`'s strings stay as ruled.

## 16 → L1-F · both your notes are owed at merge 4, not declined

Neither `L1F→C-1`/`L1F→C-2` (`C2-07`) nor `L1F→C-3` (`RecordRefresh.run`) can compile on this lane's
base, and both were verified absent again today:

- `grep -rn unreadNotificationCount Patina` → **0 hits**. `BadgeCountService` exists
  (`Services/Badges/BadgeCountService.swift:29`); the property is yours.
- `Core/Persistence/RecordSnapshotStore.swift:98` is `func save(_ record: HouseRecord, houseLine: String? = nil, now: Date = Date())` — there is no `owner:` to pass.

So the two one-line edits land **on the integration tip at merge 4**, with your branch:

| file | line on `first-flight/w1-l1c` today | becomes |
|---|---|---|
| `Features/Home/Views/DailyRoomView.swift` | `:282` `unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,` | `unreadCount: BadgeCountService.shared.unreadNotificationCount,` (plus your comment block) |
| `Features/Home/ViewModels/RecordRefresh.swift` | `snapshots.save(record)` | `snapshots.save(record, owner: sessionUserId)` |

Both are recorded in `l1c-tasks.md` § "Fix round 2 · declined this wave" and in `steward.md` under
this lane's merge-routing block, so the steward carries them if you do not. Your
`BadgeFreshnessTests.thereIsNoSecondCount` known issue and
`WidgetSnapshotOwnershipTests.theRebuildNamesItsSession` stay owed until then, exactly as your notes
predict.

## 17 — for the steward · six rows that must be routed at merge, or they are lost

L1-C merges **first** and owns every file below. None of the six can compile on this lane's base.

| at merge | lane | file | the edit |
|---|---|---|---|
| 2 | L1-D | `Features/Rooms/Components/RoomTypePillRow.swift` | `D→C-12`'s three token lines (offsets in §14 above) |
| 2 | L1-D | `Features/Companion/{Components/CompanionHearthView,Views/CompanionOverlay}.swift` | `D→C-13` — **union** merge, not "take L1-C's structure" |
| 3 | L1-B | `Features/Profile/Views/StudioHubView.swift` | `O12` — render `viewModel.stalenessLine` |
| 3 | L1-B | `Features/Home/Views/DailyRoomView.swift` | `O14` — the `LocalRoomSignal` observer (L1-C has said "stays in S6", as the note invites) |
| 3 | L1-B | `ProductDetailView.swift`, `RecommendationsView.swift` | re-point three `matchScore > 0` guards at `hasMatchScore` (§13) |
| 4 | L1-F | `DailyRoomView.swift`, `RecordRefresh.swift` | the two one-line edits in §16 |
