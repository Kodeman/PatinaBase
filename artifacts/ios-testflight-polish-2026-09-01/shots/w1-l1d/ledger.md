# W1 · L1-D — self-check shot ledger

Clone `ff-w1-l1d` **`FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D`**, iPhone 17 Pro, iOS 26.
Every launch: `xcrun simctl launch <udid> cloud.patina.app -DeploymentTarget local` — **no
`-PatinaFlags`** (D1a), so the four-tab root is what the shots show. Signed in as
`client@patina.dev` on the local stack. Every image is `xcrun simctl io <udid> screenshot`.

**BEFORE** = base `ba83aa67f`, produced by checking the seventeen changed sources back out of the
base sha, rebuilding and reinstalling. **AFTER** = this lane's tip `af27eab83`. Both are signed
Simulator builds (no `CODE_SIGNING_ALLOWED=NO`), same device, same status-bar override, same account.

| shot | screen | what it evidences |
|---|---|---|
| `before-01-welcome-light.png` | Welcome, light | `P-35` / `C3-03` control: the Apple button is `.black` on the light canvas, which is correct and must not change |
| `after-01-welcome-light.png` | Welcome, light | unchanged, as intended — the fix is scheme-conditional |
| `before-02-welcome-dark.png` | Welcome, dark, **cold launch** | `P-35` / `C3-03`: the app's first tap target is filled pure black on the warm near-black ground and reads as a hole, while the two outlined buttons beneath it are the most visible things on the screen |
| `after-02-welcome-dark.png` | Welcome, dark, **cold launch** | the Apple button is `.white`. Also visible: the outlined buttons' edges now come from `Border.strong` rather than `pearl` |
| `before-03-pieces-dark.png` | Pieces tab, dark | `A-36` / `C-27`: "Oak Reading Chair" is a flat tan slab carrying a heart, a ⋯ and a "70% match" pill over nothing. `C3-01`: the tab bar's top hairline is a bright near-white line across the screen |
| `after-03-pieces-dark.png` | Pieces tab, dark | **unchanged, and that is the honest result.** `RecommendationsView.swift` and `PatinaTabBar.swift` are L1-C's files; the component and the tokens they need are on this branch and the call-site swaps are notes `D→C-3` and `D→C-6`. The one tile that *does* route through `PatinaAsyncImage` ("Fixture Oak Dining Table") shows the branded mark and "Tap to retry" instead of a bare fill |
| `after-05-pieces-light.png` | Pieces tab, light | **after only** — no matching before was taken. Included because it shows the same tiles on the light canvas, where nothing regressed |
| `before-04-today-dark.png` | Today, dark | `C-20` and `C3-01`, both measured below |
| `after-04-today-dark.png` | Today, dark | the meta tier clears the 3:1 bar; the body tier does not, and the reason is not a token — see below |

## The measurement, and what it settles

Sampled from the two Today shots with a WCAG calculation over the brightest stroke pixel against the
card ground `(44,41,38)` — the same method the `C` lane used to score the finding.

| row | before | after |
|---|---|---|
| "Leah Hartwell sent you a message." — a row **with** a route | 12.42:1 | 12.42:1 |
| "Meadow Linen Sectional shipped." — a row **with** a route | 12.42:1 | 12.42:1 |
| **"A new story from the workshop." — a row with NO route** | **4.27:1** | **4.27:1** |
| `SEP 2` meta, on a routed row | 5.94:1 | **7.48:1** |
| **`SEP 1` meta, on the unrouted row** | **2.60:1** | **3.01:1** |
| the card's hairlines | 11.19:1 | 11.19:1 |

Three things fall out of it, and the first is new:

1. **`C-20`'s "body 4.27:1" is not an ink problem.** The routed rows on the same card, in the same
   token, at the same size, measure 12.42:1. The dim row is dim because
   `HouseRecordCard.swift:375` applies `.disabled(row.route == nil)` to the row's `Button`, and
   SwiftUI dims a disabled button's label — roughly half alpha. The finding's own numbers reproduce
   exactly (4.27:1 body, 2.60:1 vs the reported 2.66:1 meta), so this is the mechanism it measured.
   No token change can fix it: the row would have to stop being a disabled control. That is
   `HouseRecordCard.swift`, which is **L1-C's** file, and it goes there as note `D→C-8`.
2. **`C-20`'s meta half is closed by the token raise**: 2.60 → **3.01:1** on the *dimmed* row, and
   5.94 → **7.48:1** everywhere else. The finding's bar for meta is ≥ 3:1.
3. **`C3-01` is untouched on this screen and was always going to be** — the hairlines are
   `PatinaColors.pearl` in `HouseRecordCard.swift` and `PatinaTabBar.swift`, both L1-C's. 11.19:1
   against the card, in dark mode, on the app's home screen.

## What this self-check did not reach

- **`GAP4-16` / `C3-15`'s Reveal screen.** The quiz path ends at `StyleResultView`, not `RevealView`;
  the Reveal sits on the Style *Conversation* branch, which this account's onboarding did not enter.
  Both fixes are compile-verified and pinned by `TypographyAdoptionTests`, not sim-verified.
- **`C-01` / `C-02`'s Companion.** On the four-tab root the floating Companion retires entirely
  (`CompanionOverlay.swift`), so neither the orb nor the panel is reachable on the shipping root
  without a flags-on launch, which D1a forbids this wave. The token change is pinned by
  `CompanionOrbAppearanceTests` in both appearances.
- **`A-90` / `C-41`'s "Pay $4,250.00".** Invoice detail is three navigations inside Studio; the button
  is `PatinaButton(style: .clay)` and the style change is pinned by `PrimaryButtonStyleTests`.
- **Anything on a device.** Every claim here is *sim-verified*.
