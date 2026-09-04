# W1 · L1-D — fix-round-3 self-check ledger

Clone: `FF762E1A-F261-4C23-AFB9-CDDEE9B82B8D` (`ff-w1-l1d`), iOS 26.5.
Build: Debug, `-DeploymentTarget local`, no `-PatinaFlags` (house-first is default-on).
Branch tip at capture: `first-flight/w1-l1d`.

## What this is, and what it is not

**HID reaches the device; the app does not act on it.** `xcrun simctl io …
screenshot` works. `device_action tap` reports success, the coordinates land, and
`describe_screen` returns a live AX tree (13 elements on Welcome, correct labels
and identifiers). But three taps on `auth.welcome.guestButton` and one on
`auth.welcome.passwordButton` — with and without a relaunch, with and without a
tap duration — left the app on the Welcome screen every time. Shot `02` is the
screen after the third tap and is identical to shot `01`.

So **this is not a walk**, and nothing here is claimed as one. Rows 10–14 are the
components the fix round changed, rasterised on this simulator at 3× through the
same `ImageRenderer` path `HouseRecordRowInkTests` measures with, in both
appearances. The renderer's own calibration
(`HouseRecordRowInkTests.groundIsTheToken`) asserts that a semantic token
rasterises to the value it resolves to in the requested appearance, so these are
the shipped tokens rather than an approximation of them. Every image is also
asserted non-blank — a component that rasterises to one flat tone fails
`ChangedSurfaceShotTests`.

The "before" side is arithmetic rather than a second image: this branch cannot
build two versions of a view at once, and the numbers each shot replaces are the
findings' own, listed per row.

## Shots

| file | what it shows | before |
|---|---|---|
| `01-today-dark-after.png` | `simctl` screenshot, dark. Welcome on the local stack. Present for two reasons: the Apple button renders white-on-dark (`C3-03`/`P-35`, and `D-L1A-6`'s local-stack exception is working), and it is the baseline shot `02` is compared against. | `P-35`: the CTA was pure black on a near-black ground |
| `02-after-guest-tap.png` | `simctl` screenshot after three taps on "Look around first". Byte-for-byte the same screen. **This is the evidence for the HID claim, not evidence of a fix.** | — |
| `10-record-rows-{dark,light}.png` | `C-20`. Two `HouseRecordRowView`s on the card: the top one has a route, the bottom one does not. Their ink is now identical — the quiet row reads exactly as brightly as the tappable one. | the route-less row rendered at **4.27:1** dark and **2.92:1** light, its meta at 3.01 and 1.86, because `.disabled()` halved the ink |
| `11-status-badges-{dark,light}.png` | `A-73`. All four `PatinaStatusBadge` states. "DECLINED" is now `Text.error` — dark red, readable on its wash. **Look at "PENDING" beside it**: that is the 1.90:1 warning ink this round did not fix, and it is the reason the gap is reported rather than left unnamed. | error ink was `PatinaColors.error`, **2.65:1** on its own wash |
| `12-companion-orb-{dark,light}.png` | `C-01`. `CompanionMarkView(.disc)` on `Background.primary`. In dark the disc now has a visible `Border.onDark` edge (3.18:1) against the page; the fill behind it is the same 1.93:1 it was. | the disc was a static charcoal at **1.15:1** — it had no edge and no body |
| `13-hero-chrome-{dark,light}.png` | `C-27`. Piece detail's four floating controls, Back / Help / Share / Save, on `Scrim.chrome` with `OnDark.primary` ink — 12.42:1 whatever the photograph does. | `Circle().fill(.ultraThinMaterial)` with `Text.primary`, **2.01:1** over a light tile |
| `14-empty-states-{dark,light}.png` | `A3-01` + `RL1D-R3-11`. The two browse sentences: the empty-catalogue one, and the new empty-category one that no longer tells a tester her designer has not started when she has simply tapped "Lighting". | one sentence, shown for both cases |

## What a walk still owes

These are not observable without HID and belong on Kody's device pass:

1. The Record's rows **in place** on Today, signed in, dark and light.
2. The Companion **panel** (`CompanionHearthView`) — the shell's edge and the
   status line's `OnDark` ink. `12` shows the disc only.
3. Piece detail's chrome over a **real photograph**, which is the case C-27 was
   measured on.
4. The Move-or-copy sheet and the design-request chips (`C3-05`).
5. `RevealView`'s **status bar** on a light system appearance — the
   `colorScheme` override does not reach it (`RL1D-R3-18`).
