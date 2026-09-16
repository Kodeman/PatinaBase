# Review 01d — Deck, Technical

Reviewer: adversarial reviewer (d), fresh context. Scope: `deck/index.html` (built), `deck/src/index.html`, `deck/build.mjs`. Frame contract: `specimens/SPEC.md` §9.

## 1. Rebuild

```
node artifacts/agreement-room-2026-09-10/deck/build.mjs
```

Raw output:

```
[2026-09-10 12:35:26] complete: D - the galley (57887 bytes)
[2026-09-10 12:35:26] complete: A - the paper is the page (47373 bytes)
[2026-09-10 12:35:26] complete: B - builder as overlay (50771 bytes)
[2026-09-10 12:35:26] {{SPECIMEN_D}} -> 3 slot(s)
[2026-09-10 12:35:26] {{SPECIMEN_A}} -> 3 slot(s)
[2026-09-10 12:35:26] {{SPECIMEN_B}} -> 3 slot(s)
[2026-09-10 12:35:26] wrote /Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/deck/index.html
[2026-09-10 12:35:26] built size: 840286 bytes (820.6 KB)
[2026-09-10 12:35:26] srcdoc payloads: 544467 bytes (531.7 KB)
[2026-09-10 12:35:26] deck without payloads: 295819 bytes (288.9 KB)
```

Finished in seconds (sentinels already present, no polling wait). All three specimen tokens resolved to 3 slots each (9 iframe instances total: 3 states × 3 directions), no `[PENDING PLACEHOLDER]`, exit code 0.

**Byte-equality check** — for each of the 3 specimens, extracted all srcdoc payload occurrences from the built deck by attribute match, HTML-unescaped them, and compared to the current `specimens/direction-{1,2,3}.html` verbatim:

```
D (direction-1): found 3 occurrences in built deck, all byte-equal to specimen after unescape: true
A (direction-2): found 3 occurrences in built deck, all byte-equal to specimen after unescape: true
B (direction-3): found 3 occurrences in built deck, all byte-equal to specimen after unescape: true
```

All 9 srcdoc payloads are byte-identical to the current specimen files. Confirmed.

## 2. Structure

- `<title>The Paper, Under the Pencil</title>` present in the first 8 KB. Confirmed (`head -c 8000 | grep -o '<title>...'`).
- No `<!DOCTYPE`, `<html`, `<head`, `<body` tags anywhere in the file (grep returned zero matches).
- Exactly one `<style` tag.
- `body {` block exists at `deck/src/index.html:96` with an explicit `background` (inherited from `:root` tokens).
- Dark tokens: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` at `deck/src/index.html:57-58`, AND `:root[data-theme="dark"] { ... }` at `deck/src/index.html:76`. Both guards present as required.
- `box-shadow`: zero occurrences in the deck chrome (`deck/src/index.html`) and zero in the built deck.
- External resources — every `http` URL in the file (3 total, all Google Fonts, all in the deck chrome, before the srcdoc payloads which are sandboxed and separately scoped):
  - `https://fonts.googleapis.com` — `<link rel="preconnect">`
  - `https://fonts.gstatic.com` — `<link rel="preconnect" crossorigin>`
  - `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap` — the actual `<link rel="stylesheet">`
  - See DT-02 below — this is 3 `<link>` elements, not "exactly one," though only one is a loaded resource.
- `18` `<section class="slide">` elements, ids `sheet-1` through `sheet-18` confirmed present and in order.
- `{{ARTIFACT_D}}`, `{{ARTIFACT_A}}`, `{{ARTIFACT_B}}` all present (one line, in the register block). Zero `{{SPECIMEN_*}}` tokens remain in the built deck (`grep -c` = 0).

## 3. Render (Playwright, Chromium)

Script loaded the built deck wrapped in the standard minimal shell (`<!doctype html><html><head><meta charset=utf-8><meta name=viewport ...></head><body>…</body></html>`) as a `file://` URL, at 1440 and 390, light and dark (`colorScheme`). Chromium required `dangerouslyDisableSandbox: true` (mach-port rendezvous `Permission denied` under the default sandbox) — noted, not a deck defect.

- **Console errors**: 12 total across all 4 viewport/theme combinations (3 per pageload × 4). All 12 matched `/autofocus/i` — these are the specimens' known autofocus-in-sandbox errors (`sandbox="allow-scripts"` blocks autofocus; each specimen's own script or markup produces one warning). **Deck-side (non-autofocus) console errors: 0.**
- **No horizontal page scroll** at either width: `document.documentElement.scrollWidth <= clientWidth` true in all 4 combos —
  - 1440-light: `scrollWidth 1440 == clientWidth 1440`
  - 1440-dark: same
  - 390-light: `scrollWidth 390 == clientWidth 390`
  - 390-dark: same
- **All 9 specimen frames loaded**: `frame.contentWindow` truthy for all 9 `iframe.spec-frame` elements at every viewport/theme. Confirmed each frame's document `data-state` matches its sheet's pinned preset on load, in order: `resting, clause, money` × 3 (once per direction, sheets 5-7 / 8-10 / 11-13).
- **Width toggle**: clicking the `1024` chip on the first `figure.spec` changed the iframe's own `width` from `1440px` → `1024px`; clicking `390` → `390px`; clicking `1440` → back to `1440px`. Exactly the "resize the iframe, not a CSS transform" behavior the contract calls for.
- **State toggle**: clicking `data-s="clause"` posted the message and the frame's `data-state` flipped `resting → clause`; clicking `data-s="money"` flipped `clause → money`. Confirmed via `frame.evaluate` on the actual srcdoc frame (not the deck DOM).
- **Font-size floor**: smallest rendered `font-size` across all leaf text nodes in all 9 frames = **11px**, at both the 1440-wide and 390-wide deck viewport (1083 leaf elements sampled each pass). Exactly at the floor, never below it.

## 4. Sizes (byte-accurate, not the build script's own log — see DT-03)

- Built file on disk: **844,105 bytes (824.3 KB)**.
- Sum of all 9 srcdoc payload occurrences (entity-escaped, UTF-8 bytes): **548,286 bytes (535.4 KB)**.
- Deck excluding payloads: **295,819 bytes (288.9 KB)** — under the 600 KB budget.
- Sheet-2's embedded JPEG (`data:image/jpeg;base64,...`, the "resting room" screenshot): base64 payload length **207,544 characters** (~155.7 KB decoded; source JPEG is 1185×1600px). One JPEG data URI in the whole file, located inside `#sheet-2`.
- Total file size 824.3 KB is well under the 16 MB cap.

## 5. Visual sweep — all 18 sheets × 2 widths × 2 themes

**Methodology note (read before the findings):** the first full pass, captured at a fixed 1000px-tall viewport with Playwright's `elementHandle.screenshot()`, produced a false positive — sheet-2's annotation block and wire diagram appeared to render as blank space. Root cause: `.slide { min-height: 100dvh }` combined with the deck's `scroll-snap-type: y` container caused an incorrect capture when the element (1708px tall) far exceeded the capture viewport. Re-verified with `getBoundingClientRect()` (elements present, visible, opacity 1, correct color) and by re-capturing with a per-sheet dynamic viewport sized to each sheet's natural content height (measured after resetting to a small baseline viewport each time, since `100dvh` otherwise inflates monotonically across a loop) — content rendered correctly. **All screenshots below are from the corrected, dynamic-viewport pass.** This was a test-harness artifact, not a deck defect, and is not filed as a finding.

With that pass, all 18 sheets were inspected at 1440/390 × light/dark (72 images plus 4 full-page renders). Findings:

| ID | Severity | Confidence | Sheet | Width/Theme | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|---|
| DT-01 | P2 | High | sheet-2, sheet-4 | 390, light & dark | The deck's five `svg.wire` diagrams (the "1176 BAND" diagram on sheet-2, and the four A/B/C/D diagrams on sheet-4) have `min-width: 660px` (`deck/src/index.html:226`). At 390px frame width this exceeds the visible column, and the wrapping `.scroller` (`overflow-x: auto`) has no visible scrollbar or affordance, so labels truncate at the frame edge with no cue that more content exists off-screen. | Screenshots `sheet-4_390_light.png` / `_dark.png`: "PAPER 720 — THE EDITOR TAKES THE PART'S PLACE" reads as "PAPER 720 — TH…", "STILL VISIBLE, STILL UPDATING" reads "STILL V…". Screenshot `sheet-2_390_light.png`: the "PAPER 320" box is scrolled fully out of view — only "RAIL 260" and a sliver of "EDITOR 52…" are visible at all. Page-level `scrollWidth==clientWidth` still holds (390==390), so this is compliant with the letter of "no page-level horizontal scroll," but the content is not legible at 390 without a swipe the reader isn't cued to make. | Drop or lower `svg.wire`'s `min-width` so the `viewBox` scales fully into a 390px column (labels will need a smaller font-size or to wrap to two lines), or add a visible scroll affordance to `.scroller` at narrow widths, or stack the four sheet-4 diagrams vertically below ~480px instead of `.cols-2`. |
| DT-02 | P3 | High | n/a (deck chrome, applies to all sheets) | both | Three `<link>` elements reference external hosts, not "exactly one Google Fonts `<link>`": two `rel="preconnect"` (`fonts.googleapis.com`, `fonts.gstatic.com`) plus the one `rel="stylesheet"` that actually loads the font CSS. Only one is a loaded resource — preconnect hints are standard, low-risk Google Fonts practice — but the literal "exactly one `<link>`" bar isn't met by element count. | `deck/src/index.html:2-4`: `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`, `<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">`. | If the letter of the check matters, drop the two preconnect hints (minor perf cost, no correctness risk). Otherwise no action — flagging for the record per the brief's "list every http URL" instruction. |
| DT-03 | P3 | High | n/a (build.mjs) | n/a | `build.mjs`'s own logged sizes ("built size," "deck without payloads") are computed from JS string `.length` (UTF-16 code units), not actual UTF-8 byte size on disk, so the log understates the real file size. | Script logged "built size: 840286 bytes" (`build.mjs:129`); actual file on disk is **844,105 bytes** — a 3,819-byte gap from ~1,980 multi-byte typographic characters (curly quotes, em/en dashes, middot) in the source. Doesn't affect the build's correctness, only the log's honesty about "bytes." | In `build.mjs`, use `Buffer.byteLength(out, 'utf8')` (and same for the payload/no-payload deltas) instead of `.length` when logging sizes. |

No other defects found across the 72 screenshots: no clipped tables, no overlapping frames, all interactive controls (width/state chips, "Edit this part," "Move up/down," etc.) have visible text labels, dark-mode contrast reads cleanly throughout (ink-on-paper and ink-on-charcoal both legible at both widths), and the one JPEG (sheet-2) and all `svg.wire` diagrams other than the min-width truncation above render correctly in both themes. The large feasibility table (sheet-16, 7 columns) and the send/return table (sheet-15, 3 columns) both reflow cleanly to label/value stacks at 390 with no page-level horizontal scroll.

## Verdict

**FIX** — one P2 (DT-01), plus two P3/informational items (DT-02, DT-03). No P1s. The deck otherwise builds cleanly, embeds byte-identical specimens, satisfies every structural check in the brief, and renders/interacts correctly (frames, toggles, state sync, font floor, no page-level horizontal scroll) at both breakpoints and both themes.

**P1 ids: none.**
