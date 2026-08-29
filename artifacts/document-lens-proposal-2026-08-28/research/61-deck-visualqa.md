# 61 — Deck visual QA (W5, The Smart Lens)

Reviewer: fresh-context visual QA pass. Method: opened every PNG in `mock/deck-qa/` with the Read tool (80 files: 15 sections × {1440,390} × {light,dark} = 60, plus 5 as-read viewport captures — ask, build, spine, today, walkthrough — × {1440,390} × {light,dark} = 20), cross-checked against `mock/deck-qa/qa-results.json` (overflowers, mock-fit, contrast samples, shellParity, toggleTest), and pixel-cropped several regions at native resolution with PIL where the downscaled thumbnail wasn't legible enough to confirm a finding.

## Counts

- BLOCKING: 2
- SHOULD: 2
- NOTE: 2

## Findings

| # | Section | View | Class | What I see | Fix |
|---|---------|------|-------|-----------|-----|
| 1 | header | all widths (1440, 1200, 1024, 600, 390 — both themes) | BLOCKING | Real horizontal page overflow, confirmed by `qa-results.json` `shellParity`: a DIV in the header section's "A letterhead, and one line" mock area sits at `left:828/818/811/...`, width 726–730px, and is never allowed to shrink (`cssMinWidth:auto`), pushing `scrollWidth` past `clientWidth` at every tested breakpoint — 114px over at 1440, up to 513px over at 1024, and at 390 a `CODE` element inside it also overflows by ~149–360px. This is a genuine horizontal scrollbar on the page, not just a tight mock. | Give the offending mock/code block in the header section `max-width:100%`, let it wrap or shrink with its column, or move it into its own `overflow-x:auto` frame instead of a fixed 726–730px box. |
| 2 | mobile | 390-light | BLOCKING | The second device photograph in "At 390, one column, and the ladder moves into the sheet she already opens" — captioned `M390-RICH-S1 · PAST THE LETTERHEAD, 390PX` — renders as a solid black rectangle with no image content in the **light** theme. The identical mock renders correctly (visible phone screenshot) in the **dark** theme at the same viewport. Confirmed by cropping both PNGs at the same pixel offset (y 7100–7692) — light is 100% black, dark shows the phone photo. | Check whatever swaps/masks this specific asset by theme (opacity, mix-blend-mode, a conditional `src`, or a dark-only image with no light counterpart) — the light-mode source is missing or fully occluded. |
| 3 | multiple: header, walkthrough, motion, body | 1440 and 390, both themes | SHOULD | `qa-results.json` mock-fit data reports several embedded mockup crops rendering ~2px wider than their parent column at every viewport: walkthrough i=10/11/12 (757px in a 755px column at 1440, 352px in a 350px column at 390), motion i=7/8 and body i=6 similarly 352-in-350. Not visible to the eye at normal viewing (no visible clipping in any PNG), but it's a real, reproducible sub-pixel overflow on the mock frames. | Add `max-width:100%; box-sizing:border-box` (or trim ~2px of border/padding) on the `.dk-mock-viewport` frames so rendered width never exceeds the parent measured width. |
| 4 | The Ask / The Document Spine / The Portal Today (as-read, sticky nav) | 1440, light and dark | SHOULD | The sticky nav's "more sections" kebab icon (⋮, three vertical dots) renders as a clean glyph on "What It Takes to Build" and "Walkthrough" as-read captures, but renders as a garbled/malformed glyph (looks like a stray "3" or tofu character) at the identical nav position on "The Ask", "The Document Spine" and "The Portal Today" as-read captures, in both themes. Confirmed by pixel-cropping and comparing the two renderings side by side — they are visibly different shapes, not just anti-aliasing. | Investigate whether the kebab icon element re-renders differently depending on which section is active (e.g. an icon-font glyph that hasn't loaded yet on first paint for early sections, or a stacking/transform bug specific to those three sections' nav state). |
| 5 | today, found | 1440/390, "light" vs "dark" toggle | NOTE | These two sections mount their photographic/dark-register content panels at a fixed dark background regardless of the page-level light/dark toggle — the "-1440-light" and "-1440-dark" PNGs for `today` and `found` are pixel-identical. This reads as an intentional editorial "darkroom" mount (consistent with the canon's ink-pool/dark-mount language, and confirmed sensible since `qa-results.json`'s contrast samples for these sections are all well above AA), but flagging for confirmation it isn't a toggle-wiring bug. | None needed if intentional; otherwise wire these panels to the theme toggle like the rest of the page. |
| 6 | build | 390, both themes | NOTE | The "build" section is extremely long in the single 390px column (28,948px vs 12,429px at 1440) because of very dense nested bullet lists (Files/Mechanism/Tests/Gate/Rollback per wave × 6 waves). Legible once cropped to native resolution — no clipping or breakage found — just a long, text-dense scroll on mobile. | Consider whether this density is acceptable for a deck read on a phone, or whether some of the Files/Mechanism detail could collapse behind a disclosure at 390. |

## Also checked, no issues found

- `qa-results.json`: `consoleErrors`, `pageErrors`, `failedRequests` all empty; `toggleTest` shows the theme toggle correctly stamps `bodyBg`/`h1` colors through Match system → Light → Dark → Match system; all sampled contrast ratios (paper and dark registers) are 5.2–15.91, well above AA at every size sampled.
- Cover, Thesis, Roads Not Taken, Limits, Colophon: clean at all four views, no overflow, no clipping, no contrast issues, headings never covered by the sticky index bar.
- Body, Motion and State: structurally intact at 1440 and 390 in both themes; the ~2px mock-fit variance noted in finding #3 is not visually detectable.
- Spine: dark-mounted "What the rail actually looks like now" panel (PUT DOWN / segmented rail / Project ACTIVE mock) is consistent across light/dark page toggle (same pattern as finding #5), not a defect.
- Walkthrough as-read and Today as-read: section heading always fully clear of the sticky nav bar at both viewports.

## PNGs opened (80/80)

All files in `mock/deck-qa/` except `qa-results.json` were opened and reviewed:

ask-1440-dark, ask-1440-light, ask-390-dark, ask-390-light,
asread-ask-1440-dark, asread-ask-1440-light, asread-ask-390-dark, asread-ask-390-light,
asread-build-1440-dark, asread-build-1440-light, asread-build-390-dark, asread-build-390-light,
asread-spine-1440-dark, asread-spine-1440-light, asread-spine-390-dark, asread-spine-390-light,
asread-today-1440-dark, asread-today-1440-light, asread-today-390-dark, asread-today-390-light,
asread-walkthrough-1440-dark, asread-walkthrough-1440-light, asread-walkthrough-390-dark, asread-walkthrough-390-light,
body-1440-dark, body-1440-light, body-390-dark, body-390-light,
build-1440-dark, build-1440-light, build-390-dark, build-390-light,
colophon-1440-dark, colophon-1440-light, colophon-390-dark, colophon-390-light,
cover-1440-dark, cover-1440-light, cover-390-dark, cover-390-light,
found-1440-dark, found-1440-light, found-390-dark, found-390-light,
header-1440-dark, header-1440-light, header-390-dark, header-390-light,
limits-1440-dark, limits-1440-light, limits-390-dark, limits-390-light,
mobile-1440-dark, mobile-1440-light, mobile-390-dark, mobile-390-light,
motion-1440-dark, motion-1440-light, motion-390-dark, motion-390-light,
roads-1440-dark, roads-1440-light, roads-390-dark, roads-390-light,
spine-1440-dark, spine-1440-light, spine-390-dark, spine-390-light,
thesis-1440-dark, thesis-1440-light, thesis-390-dark, thesis-390-light,
today-1440-dark, today-1440-light, today-390-dark, today-390-light,
walkthrough-1440-dark, walkthrough-1440-light, walkthrough-390-dark, walkthrough-390-light.

None could not be opened — all 80 read successfully. `qa-results.json` was read separately (not a PNG) for the machine-measured cross-check.
