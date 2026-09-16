# Review 03 — Re-review, deck technical

Reviewer: adversarial reviewer (d), continued from 01d. Scope: current `deck/index.html` (rebuilt), `deck/src/index.html`, `deck/build.mjs`, against `review/02-fix-log-deck.md`.

## Rebuild

```
node deck/build.mjs
```

```
complete: D - the galley (64349 bytes)
complete: A - the paper is the page (55685 bytes)
complete: B - builder as overlay (53536 bytes)
{{SPECIMEN_D}} -> 3 slot(s)  {{SPECIMEN_A}} -> 3 slot(s)  {{SPECIMEN_B}} -> 3 slot(s)
built size: 904196 bytes (883.0 KB)
srcdoc payloads: 604029 bytes (589.9 KB)
deck without payloads: 300167 bytes (293.1 KB)
```

`wc -c deck/index.html` = **904196** — exact match to the build log. All 9 srcdoc occurrences (3 per specimen) re-verified byte-equal after HTML-unescape to the current `specimens/direction-{1,2,3}.html`.

## Structure (unchanged, re-checked)

`<title>The Paper, Under the Pencil</title>` in the first 8 KB · zero `<!DOCTYPE/html/head/body` tags · 1 `<style>` · 0 `box-shadow` · dark tokens under both `:root:not([data-theme="light"])` (in the dark media query) and `:root[data-theme="dark"]` · 18 `section.slide` ids `sheet-1`…`sheet-18` · 3 `{{ARTIFACT_*}}` present, 0 `{{SPECIMEN_*}}` left · 3 `http` URLs, all Google Fonts (2 preconnect + 1 stylesheet, unchanged).

## Render (Playwright, Chromium, `file://`, 1440 & 390 × light & dark)

- **Console errors**: 0 total, all 4 combos. (Previously 12 autofocus-in-sandbox warnings; the specimen fix passes appear to have resolved them — bonus, not filed.)
- **No page horizontal scroll**: `scrollWidth == clientWidth` at 1440 (1440/1440) and 390 (390/390), both themes.
- **9/9 specimen frames loaded**, `data-state` preset confirmed in order `resting, clause, money` × 3.
- **Width toggle**: `1440px → 1024px → 390px → 1440px` on the iframe's own width, confirmed.
- **State toggle**: `resting → clause → money` via postMessage, confirmed on the live srcdoc frame.
- **Frame text floor**: smallest rendered font in the 9 specimen frames = **11px** at both 1440 and 390 (1083 leaf nodes sampled).
- **Wire diagrams** (5 total: sheet-2's, sheet-4's four): at 1440, sheet-2's does not overflow its column (no cue, effective min label 20.9px); sheet-4's four all overflow (~500px column vs 660px floor), all show `.narrow-cue.on` ("Scrolls sideways →", `display: block`), effective min label 11.0px. At 390 all five overflow (350px column), all five cues show, effective min labels 13.5 / 11.0 / 11.0 / 11.0 / 11.0px. Matches fix log §4 exactly. Visually confirmed on `sheet-2` and `sheet-4` screenshots at both widths/themes — labels fully legible via the now-visible scroll cue, nothing silently truncated.

## Sizes

Built 904,196 bytes (883.0 KB, `wc -c`-verified) · payloads 604,029 bytes (589.9 KB, byte-accurate) · deck excluding payloads 300,167 bytes (293.1 KB, under 600 KB) · total under 16 MB.

## Findings disposition

| ID | Status | Note |
|---|---|---|
| DT-01 | **CLOSED** | Verified independently: `min-width:660px` kept (11px floor requires it), `.scroller.wires` now `overflow-x:auto` at every width (the 760px rule that cleared it is scoped `.scroller:not(.wires)`), visible "Scrolls sideways →" cue toggles correctly with actual overflow state at both 1440 and 390, both themes. No truncation without a cue anywhere. |
| DT-02 | **DECLINED-ACCEPTED** | Preconnect hints intentionally kept; matches this reviewer's own "otherwise no action" fallback. No correctness risk. |
| DT-03 | **CLOSED** | `build.mjs` now logs `Buffer.byteLength(x,'utf8')`; rebuild's logged size (904196) exactly equals `wc -c` on the written file. |

Spot-checked sheets most touched by the content fix pass (1, 2, 3, 4, 13, 14, 17, 18) across both widths/themes for layout regressions from the new/lengthened copy (DC-01, DC-03, DC-06 etc.) — all render cleanly, no clipping, no overflow, dark-mode contrast intact.

**No new findings (DT-1xx).**

## Verdict: **PASS**

All technical findings from round 1 closed or accepted-as-declined. No P1s, no new issues.
