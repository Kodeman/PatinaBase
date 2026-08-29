# VERIFICATION — close pass, 2026-08-29

All commands below were run read-only from `P` (`/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28`) as the final check before commit. The `build.mjs` run needed `dangerouslyDisableSandbox: true` (it shells out to `sips` for image processing, which writes a scratch file the sandbox blocks — see `research/00-env-and-ids.md` under "Commands run unsandboxed (close)").

## 1. Deck rebuild

```
SMOKE=1 node mock/deck-parts/build.mjs 2>&1 | tail -3
```
```
CSS         440 braces open / 440 close
ASCII       0 non-ascii bytes left (2 style/script blocks folded)
SIZE        3.23 MB  within budget
```
Full run also reported: PARTS 17 concatenated, FRAGMENTS 13 inlined, SHOTS 13 embedded (804px/q78, 1.36 MB raw JPEG), MARKUP section 76/76 figure 27/27, box-shadow 1 (sanctioned: `.doc-elevated var(--elevation-sheet)`), markers 0, non-ascii 0. `presentation.html` rewritten clean.

## 2. Deck QA (`qa-run.cjs`)

Ran across all four combinations (1440/390 × light/dark): `overflowers 0`, `mocks 13 (fitOverflow 0, pastVP 0)` at every combination — **mocksFit is now TRUE** (this was FALSE at Round 0; fixed in Round 1's `fitMocks()` change and confirmed here), `shadowed 0 (sanctioned 52)`, `idx rows 15/15`, `fonts 11`. Shell parity 1680/1440/1200/1024/820/600/390 all `ok`. Global: `consoleErrors 0 | pageErrors 0 | failedRequests 0 | externalRequests 0`.

## 3. `drop-shadow(` count in `presentation.html`

```
grep -cE 'drop-shadow\(' presentation.html
```
```
0
```

## 4. External URLs referenced in `presentation.html`

```
grep -oE 'https?://[^" )]+' presentation.html | sort -u
```
```
https://claude.ai/code/artifact/65b060ad-0c98-4163-afb5-37d4f7c2b2af
https://fonts.googleapis.com
https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@300;400;500&display=swap
https://fonts.gstatic.com
```
The `claude.ai` line is the colophon's text reference to the mockup Artifact URL (not a live request); the two `fonts.googleapis.com`/`fonts.gstatic.com` hosts are the allowlisted Google Fonts CDN. No other externals. Corroborated by the QA JSON below, which shows zero external requests actually fired.

## 5. Non-ASCII bytes in `presentation.html`

```
LC_ALL=C grep -c '[^ -~\t]' presentation.html
```
```
0
```

## 6. QA results JSON — request/error census

```
python3 -c "import json;d=json.load(open('mock/deck-qa/qa-results.json'));print({k:d.get(k) for k in ('externalRequests','pageErrors','consoleErrors')})"
```
```
{'externalRequests': [], 'pageErrors': [], 'consoleErrors': []}
```

## 7. Byte counts

```
wc -c presentation.html mock/final/index.html
```
```
 3386622 presentation.html
  603180 mock/final/index.html
 3989802 total
```
(3,386,622 bytes ≈ 3.23 MiB for the deck; 603,180 bytes ≈ 603 KB for the mockup — both match the figures quoted in RESUME.md.)

## 8. Non-ASCII bytes in `mock/final/index.html`

```
LC_ALL=C grep -c '[^ -~\t]' mock/final/index.html
```
```
0
```

## 9. `https://` occurrences in `mock/final/index.html`

```
grep -c 'https://' mock/final/index.html
```
```
0
```
The mockup is a fully self-contained single file with zero external references — consistent with its own QA history (0 external requests, first paint fixed via the assembler reorder).

## 10. Artifacts (published, not re-verified here — see prior QA in `mock/final/REVIEW.md`, `REVIEW-2.md`, and `research/60-deck-factcheck.md` / `61-deck-visualqa*.md`)

- **Deck Artifact** (favicon 🔍, title "The Smart Lens", label v1-proposal): https://claude.ai/code/artifact/932d66c0-4c9e-4ccc-b757-f498fa07d316 — 3.23 MB, 15 sections, 13 fragments + 13 shots, QA clean (0 external, 0 errors, 0 overflow, 13/13 mocks fit, 15 index rows, contrast 0 fails, shadows only the sanctioned `.doc-elevated` token).
- **Mockup Artifact** (favicon 🔭, title "The Vandersteen Lens", label v3-fast-first-paint): https://claude.ai/code/artifact/65b060ad-0c98-4163-afb5-37d4f7c2b2af — 603 KB single file, scroll-driven, three frames; probe 17/18 (item 12 narrowed — see `mock/final/REVIEW-2.md`), SC1 320px (today 1005), SC2 57px, SC3 319/56/56 stable, SC4 40.8% merged / 92.2% span, SC11/SC12 true; first paint 11.5 s → 1.7 s at 300 kbps after the assembler reorder (`mock/final/FINAL.md` §12).

## Summary

Everything above is clean and matches the figures already recorded in RESUME.md and `research/62-deck-revision-log.md`. Round 4's fix (`height:auto` on `.ev-fig__shot img` in `mock/deck-parts/00-head.html`, capped at `max-height:720px`, `object-fit:contain`) is confirmed present in the source and the rebuilt `presentation.html` passes QA clean with mocksFit TRUE. No regressions found in this close pass.
