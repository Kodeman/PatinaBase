# RC-4b repair B6b (SQ-2336): browser evidence

Fixture: F01 job `/doc/f0180000-0000-4000-8000-000000000010` and `/desk`, live local Supabase (127.0.0.1). Round-8 Playwright config, projects `chromium` (Desktop Chrome, resized) and `webkit-iphone` (iPhone 14, resized). Spec: `apps/designer-portal/e2e/round8/rc4b-presentation.spec.ts`. Final run: 11 passed, 1 skipped (the desktop-only ghost-width test is skipped on webkit).

## F3: lens band height (declared `--doc-band-height` = 56px)

| Build | Width | Chromium band / line 1 / line 2 (px) | WebKit band / line 1 / line 2 (px) |
|---|---|---|---|
| base `e894a180e` (short rung "TASK DUE · TASK") | 390 | 56.7 / – / – | 56.0 / – / – |
| base | 320 | 90.3 / – / – | 71.7 / – / – |
| SQ-2332 `b6a3b21f8` (N2 unclamped) | 390 | **82.3** / 16.8 / 45.1 | **80.7** / 16 / 44 |
| SQ-2332 `b6a3b21f8` | 320 | 86.4 / 50.4 / 15.6 | **115.7** / 32 / 63 |
| B6b candidate | 390 | 56.7 / 16.8 / 19.5 | 56.0 / 16 / 19 |
| B6b candidate | 320 | 90.3 / 50.4 / 19.5 | 71.7 / 32 / 19 |

- N2 unclamped wrapped line 2 to two or three rows (F3 confirmed), so the band grew to 81–116px.
- In B6b, line 2 is one row at every width and the band is back to the base heights. The compact rung prints the task's name ("F01 review living-room selections"), clamped to one row (`truncate`). The visible name is `aria-hidden`; an sr-only span in the live line carries the whole sentence ("Task due — F01 review living-room selections"). F01's name fits at 320 without an ellipsis.
- The 320 band is over 56px on base too. The eyebrow (line 1, "PROJECT · F01 FICTIONAL FULL-SERVICE HOUSE") wraps, as US-28 S7 requires (never ellipsised). This is pre-existing and out of scope here.
- Schedule glance: F01 has no project dates, so `section[aria-label="Schedule rule"]` does not mount. The pinned-glance check is recorded as "absent". The spec asserts it wherever a dated job mounts one.

Shots: `visual-rc4b/b6b-band-{390,320}-{chromium,webkit}.jpg`, before: `visual-rc4b/b6a-band-{390,320}-chromium.jpg`.

## N3 / F4: schedule phases

- At 320 (Schedule dates unfolded), the right edges of all five phase "···" menus and of the ghost "Name a phase" input are at 302 ≤ 320, in both engines. Shots: `visual-rc4b/b6b-phases-320-{chromium,webkit}.jpg`.
- At 1440 the ghost input keeps its intrinsic 280px against a 1027px column (F4: `width:100%` now applies only below 600px). Shot: `visual-rc4b/b6b-ghost-1440-chromium.jpg`.

## Current Studio room (F3 moss, carried from SQ-2332)

On `/desk` at 390 and 320 in both engines, `[data-studio-door][aria-current="page"]` computes to `color: rgb(62, 81, 69)` (forest) and `font-weight: 600`. Shots: `visual-rc4b/b6b-desk-current-{390,320}-{chromium,webkit}.jpg`.
