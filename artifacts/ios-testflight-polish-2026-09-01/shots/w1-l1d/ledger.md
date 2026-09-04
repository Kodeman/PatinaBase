# W1 · L1-D — self-check shot ledger

Clone `ff-w1-l1d` **`FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D`**, iPhone 17 Pro, iOS 26.
Every launch: `xcrun simctl launch <udid> cloud.patina.app -DeploymentTarget local` — **no
`-PatinaFlags`** (D1a), so the four-tab root is what the shots show. Signed in as
`client@patina.dev` on the local stack. Every image is `xcrun simctl io <udid> screenshot`.

---

# Round two (2026-09-02) — the `r2-*` shots

Round one's conclusion was that the token work was correct and **none of the call sites had moved**,
because they lived in other lanes' files and had been routed as integration notes. The lane that
merges first applied none of those notes, so round two applied them here. These shots are the
evidence that the screens changed.

**The round-two baseline is round one's own `after-*` images** — same branch, same device, same
account, same appearance. No new "before" was shot, because round one's "after" *is* the before.

| shot | screen | what it evidences |
|---|---|---|
| `r2-after-01-today-dark.png` | Today, dark | `C3-01` on its loudest site: the four-tab bar's top rule, and the Record card's five internal separators |
| `r2-after-02-pieces-dark.png` | Pieces, dark | `C-27`: the match pill, the heart and the ⋯ on an opaque scrim over both a dark and a white photograph |
| `r2-after-03-pieces-dark-placeholder.png` | Pieces, dark, scrolled | `A-36` / `B-18`: a piece whose image will not load renders the brand mark and "Tap to retry", not a bare colour slab |
| `r2-after-04-pieces-light.png` | Pieces, light | nothing regressed in light; the chrome scrim is the same disc in both appearances |
| `r2-after-05-pieces-light-placeholder.png` | Pieces, light, scrolled | the same placeholder on the light canvas, with the maker line under it |

## The measurements

WCAG ratios computed over the real pixels of the images named, not from hex literals.

**A note on resolution, so the numbers can be reproduced.** The round-two shots were captured at the
device's native 3x (1206 x 2622) and then downscaled to 644 x 1400 before committing, to match round
one's convention and keep the artifact tree small. Downscaling blends a 1 pt rule with its
neighbours, so re-measuring the **committed** file gives a slightly different number than the native
capture did. Both are given below where they differ; neither changes a conclusion.

### `C3-01` — the tab bar's top rule, dark mode

Sampled at **y = 791 pt**, the rule's own row, across the middle half of the screen, against the tab
bar ground immediately below it.

| | rule rgb | ground rgb | ratio |
|---|---|---|---|
| round one — `after-04-today-dark.png` (as committed) | **(239, 236, 231)** | (33, 30, 27) | **14.08:1** |
| round two — native 3x capture | (50, 46, 41) | (33, 30, 27) | **1.23:1** |
| round two — `r2-after-01-today-dark.png` (as committed) | **(68, 64, 61)** | (33, 30, 27) | **1.62:1** |

The finding scored `pearl` at 12.84:1 in dark mode. A hairline's job is to be the 1.21:1 whisper it
is on the light canvas; 1.23:1 is that whisper, in the dark. `DynamicTokenTests.hairlineStaysQuiet`
holds the same bar in code.

### `C-27` — chrome floating over a photograph

The finding measured the heart and ⋯ at **2.01:1** and the match pill's text at **1.86:1** over a
blank cream tile. Sampled here over the *lightest* photo on screen — the white-background succulent
in round one, the pale rug in round two — which is the case a material handles worst.

| | ground under the chrome | ink | ratio |
|---|---|---|---|
| round one — match pill | (166, 167, 166) — the material, washed out by the photo | (224, 210, 192) | **1.63:1** |
| round one — heart / ⋯ | (156, 159, 156) | (255, 255, 255) | **2.67:1** |
| round two — match pill | **(51, 47, 43)** — `Scrim.chrome`, opaque | (250, 247, 242) | **12.42:1** |
| round two — heart / ⋯ | **(51, 47, 43)** | (250, 247, 242) | **12.42:1** |

Round two's two rows were measured on the **native 3x capture**, where the scrim reads as a flat
(51, 47, 43) across its whole area — byte-exact `Scrim.chrome`. On the committed 644-wide file the
chrome's antialiased edge pulls the sampled extremes further apart, which flatters the fix rather
than the reverse, so the native number is the one quoted.

Both round-two grounds are exactly `PatinaColors.Scrim.chrome` (#332F2B). That is the point of the
fix: a material's contrast is a function of the photograph behind it, and a scrim's is not — the
ratio is now the same number over the white succulent, the dark sectional and the pale rug.

### `A-36` / `B-18` — a piece with no usable photograph

- Round one, `after-03-pieces-dark.png`: "Oak Reading Chair" is a flat tan slab, sampled at
  **rgb(151, 129, 98)** mid-tile — a bare `placeholderGradient` carrying a heart, a ⋯ and a
  "70% match" pill over nothing. No mark, no caption, and nothing to distinguish it from a photo
  that simply had not arrived.
- Round two, `r2-after-03-pieces-dark-placeholder.png` and `-05-`: the same slot renders the Strata
  mark on the card ground with **"Tap to retry"** under it — the *failed* state, which
  `PatinaAsyncImage` distinguishes from *loading* (shimmer, no sentence) and from *missing* (mark
  plus the piece's name, no retry). VoiceOver reads it as "Image failed to load … Double tap to
  retry loading the image".

### `C5-14` — one money format, read off the running app

From the signed-in accessibility tree, not from a screenshot:

| surface | round one | round two |
|---|---|---|
| Today → Your House → Living Room | `$2.4K of $9.0K committed` | **`$2,400 of $9,000 committed`** |
| Today → Your House → Guest Bedroom | `180 sq ft · budget $9.0K` | **`180 sq ft · budget $9,000`** |

`CurrencyFormattingTests` now holds `compactFormatterCeiling = 0` app-wide.

### `C3-05` — a light label on the brand accent

Visible in `r2-after-01-today-dark.png`: the bell's unread count badge is `clayInk` (#82612F,
5.31:1 under `offWhite`) rather than `clayDeep` (3.54:1). Eight more sites moved the same way; the
one remaining is the auth form's submit button, which is L1-A's file and which **L1-A has already
fixed on its own branch**.

## What this self-check did not reach

- **`Text.error` on a real overdue row.** The seeded invoice is due Sep 7 and the seeded decision
  Sep 7 — neither is past due today, so "Overdue" never renders. The token is pinned by
  `ContrastTests.bodyTextClearsAA` in both appearances; it is **not** sim-verified.
- **`C-01` / `C-02`'s Companion.** Unchanged from round one, and worth repeating: on the four-tab
  root the floating Companion retires, so neither the orb nor the panel is reachable on the shipping
  root. Both fixes are real and both are pinned by `CompanionOrbAppearanceTests` — including, now,
  the two **call sites** round one left untouched — but a round-one tester will not see either.
- **`GAP4-16` / `C3-15`'s Reveal screen.** Still not sim-reached: the Reveal sits on the Style
  Conversation branch, which this account's onboarding does not enter. The Dynamic Type floor added
  this round (`minimumScaleFactor`) and the Regular-weight display token are compile-verified and
  pinned by `TypographyAdoptionTests`, **not** sim-verified at any text size.
- **Anything on a device.** Every claim here is *sim-verified*.

---

# Round one (2026-09-02) — the `before-*` / `after-*` shots

**BEFORE** = base `ba83aa67f`, produced by checking the seventeen changed sources back out of the
base sha, rebuilding and reinstalling. **AFTER** = round one's tip `af27eab83`. Both are signed
Simulator builds (no `CODE_SIGNING_ALLOWED=NO`), same device, same status-bar override, same account.

| shot | screen | what it evidences |
|---|---|---|
| `before-01-welcome-light.png` | Welcome, light | `P-35` / `C3-03` control: the Apple button is `.black` on the light canvas, which is correct and must not change |
| `after-01-welcome-light.png` | Welcome, light | unchanged, as intended — the fix is scheme-conditional |
| `before-02-welcome-dark.png` | Welcome, dark, **cold launch** | `P-35` / `C3-03`: the app's first tap target is filled pure black on the warm near-black ground and reads as a hole, while the two outlined buttons beneath it are the most visible things on the screen |
| `after-02-welcome-dark.png` | Welcome, dark, **cold launch** | the Apple button is `.white`. Also visible: the outlined buttons' edges now come from `Border.strong` rather than `pearl` |
| `before-03-pieces-dark.png` | Pieces tab, dark | `A-36` / `C-27`: "Oak Reading Chair" is a flat tan slab carrying a heart, a ⋯ and a "70% match" pill over nothing. `C3-01`: the tab bar's top hairline is a bright near-white line across the screen |
| `after-03-pieces-dark.png` | Pieces tab, dark | **unchanged in round one, and that was the honest result** — the call sites were notes to other lanes. Round two's `r2-*` shots are what changed it. |
| `after-05-pieces-light.png` | Pieces tab, light | after only — no matching before was taken |
| `before-04-today-dark.png` | Today, dark | `C-20` and `C3-01` |
| `after-04-today-dark.png` | Today, dark | the meta tier clears the 3:1 bar; the body tier does not, and the reason is not a token — see below |

## Round one's `C-20` measurement, which still stands

Sampled from the two Today shots against the card ground `(44,41,38)`.

| row | before | after |
|---|---|---|
| "Leah Hartwell sent you a message." — a row **with** a route | 12.42:1 | 12.42:1 |
| **"A new story from the workshop." — a row with NO route** | **4.27:1** | **4.27:1** |
| `SEP 2` meta, on a routed row | 5.94:1 | **7.48:1** |
| **`SEP 1` meta, on the unrouted row** | **2.60:1** | **3.01:1** |

1. **`C-20`'s "body 4.27:1" is not an ink problem.** The routed rows on the same card, in the same
   token, at the same size, measure 12.42:1. The dim row is dim because
   `HouseRecordCard.swift:375` applies `.disabled(row.route == nil)` to the row's `Button`, and
   SwiftUI dims a disabled button's label. No token change can fix it: the row would have to stop
   being a disabled control. That is a **layout/behaviour** change in L1-C's file, sent as `D→C-8`,
   and it is still open.
2. **`C-20`'s meta half is closed by the token raise**: 2.60 → **3.01:1** on the dimmed row, and
   5.94 → **7.48:1** everywhere else. The finding's bar for meta is ≥ 3:1.
3. **`C3-01` was untouched on this screen in round one.** It is closed in round two — see the
   14.08:1 → 1.23:1 measurement above.
