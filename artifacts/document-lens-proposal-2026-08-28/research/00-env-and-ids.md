# 00 — Environment and ids

Program: The Smart Lens proposal (`artifacts/document-lens-proposal-2026-08-28/`). Scaffold phase
(W0), written by A0 — sandboxed, no dev server booted, no product code touched.

- Repo: `/Users/kody/Code/patina-merged`
- `main` HEAD at scaffold time: `543030d9f`
- Rich specimen (fixed seed id): Aspen Loft, doc id `b0000000-0000-0000-0000-0000000000d1`
- Pre-work specimen: not yet resolved — must be looked up via `psql` against `document_state`
  (see `research/02-steward-boot.md`) once the steward boots the local stack in W1.

## Commands run unsandboxed

*(none yet — this section is filled in by whichever later agent first runs a command with
`dangerouslyDisableSandbox: true` for this program: steward boot/kill, `capture-shots.mjs`,
`contrast-check.mjs` against a real spec once one exists, `shoot-final.mjs`/`host-sim.mjs`,
`qa-run.cjs`, or the deck `build.mjs`'s `sips` calls. Append one line per command with the agent
name, the command, and why it needed the sandbox off.)*

## Commands run unsandboxed (PR1)

- `cd apps/designer-portal && node ../../artifacts/document-lens-proposal-2026-08-28/probe/interactive-probe.mjs` — Playwright drives a real Chromium against the already-running local dev server (localhost:3000) and needs unsandboxed network/process access; run with `dangerouslyDisableSandbox: true`.

## Commands run unsandboxed (M1)

- `cd /Users/kody/Code/patina-merged/apps/designer-portal && node ../../artifacts/document-lens-proposal-2026-08-28/research/measure-layout.mjs` — Playwright launches a real Chromium (`chromium.launch()`) to sign in as `designer@patina.dev` and measure `#document-project-status`, `[data-job-ticket]`, `[data-document-spine]`, `[data-margin-panel]`, `[data-region-head]`, and frame-budget rects across 3 viewports × 2 docs × 4 scroll states against the already-running local dev server (localhost:3000); Chromium needs a real mach port to launch, so this needed `dangerouslyDisableSandbox: true`. Wrote `research/12-layout-measurements.json` and, by hand from its output, `research/12-layout-measurements.md`.

## Commands run unsandboxed (C1)

Evidence capture against the already-running local dev server (localhost:3000). Every command below
launches a real Chromium (`chromium.launch()`), which needs a real mach port — all run with
`dangerouslyDisableSandbox: true`. Setup: before any of these, symlinked
`research/node_modules -> apps/designer-portal/node_modules` (plain `ln -s`, no sandbox override
needed) — Node's ESM resolver walks up from the *importing file's own path*, not `process.cwd()`, so
`node $P/research/capture-shots.mjs` run from `apps/designer-portal` still could not resolve
`@playwright/test` without it; this is the same workaround already present (untracked) in
`artifacts/document-wayfinding-directions-2026-08-25/research/node_modules`.

- `cd apps/designer-portal && SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node $P/research/capture-shots.mjs` — first attempt, before the symlink: failed with `ERR_MODULE_NOT_FOUND` for `@playwright/test`.
- Same command, after the symlink — ran; `rich-s2` and `prework-s2` failed for real reasons (see script-fixes in the ledger).
- Ad hoc `node <tmp-debug-script>.mjs` (several, from inside `apps/designer-portal`, each deleted after use) — signed in and measured live DOM state (`--doc-seam-height` placement, `[data-index-region="ffe"]` vs `[data-region-head="ffe"]`, `[data-job-ticket]`'s `data-unfolded`/`data-pinned` attributes and bounding box, `#doc-ticket-sentinel` position, `MobileMarginChips`' real rendered markup, and whether a repeat `page.goto` to the same URL resets `scrollY`) to diagnose four real bugs in `capture-shots.mjs` before patching it (see `01-shot-ledger.md`).
- `cd apps/designer-portal && SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node $P/research/capture-shots.mjs` — re-run after the `scrollFfeHeadToTop` fix; `rich-s2` now passed.
- `cd apps/designer-portal && SHOT_W=1280 SHOT_H=900 SHOT_PREFIX=w1280- node $P/research/capture-shots.mjs` — ran (prework-s2 still hit the old 15s-timeout error path, fixed next).
- `cd apps/designer-portal && SHOT_W=390 SHOT_H=844 SHOT_PREFIX=m390- node $P/research/capture-shots.mjs` — ran; `mobile-margin-chips` failed (`[data-margin-chip]` does not exist in the app).
- `cd apps/designer-portal && SHOT_W=390 SHOT_H=844 SHOT_PREFIX=m390- node $P/research/capture-shots.mjs` — re-run after the mobile-margin-chips selector fix and the prework-s2 fast-skip fix; all passed.
- `cd apps/designer-portal && SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node $P/research/capture-shots.mjs` — re-run after the ticket-seam sentinel-scroll fix; failed on `page.waitForSelector('#doc-ticket-sentinel')` (default `state: 'visible'` never resolves for a zero-area `aria-hidden` sentinel div).
- `cd apps/designer-portal && SHOT_W=1440 SHOT_H=900 SHOT_PREFIX=w1440- node $P/research/capture-shots.mjs` — re-run after switching that wait to `state: 'attached'`; all 18 shots reported success, but visual review (Read tool) showed `ticket-unfolded` and `ticket-seam` both captured the SAME (folded) content — led to the `gotoDoc`-scroll-reset root-cause finding.
- `cd apps/designer-portal && SHOT_W=1440 ... `, then `SHOT_W=1280 ...`, then `SHOT_W=390 ...` (all `node $P/research/capture-shots.mjs`) — final re-runs after adding `window.scrollTo(0, 0)` to `gotoDoc()`; all three passes green, all 38 shots subsequently verified by reading every PNG.

## 2026-08-28 STEWARD boot check
- `lsof -i :3000 -t` → PID 64461 already listening
- `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/desk` → 307
- No boot needed; server was already up. LEFT RUNNING for refuters.

## Commands run unsandboxed (V2 verify:REPRO)

- No new Chromium/Playwright launches — reused the complete, already-verified live evidence
  from earlier agents in this program (`shots/*.png` from `research/capture-shots.mjs`,
  `probe/03-interactive-probe.md` from `probe/interactive-probe.mjs`, both run with
  `dangerouslyDisableSandbox: true` against the same running localhost:3000 server, logged
  above under "Commands run unsandboxed (C1)" and "(PR1)").
- Sandboxed `grep`/`sed` reads against `apps/designer-portal/src/**` (read-only, no override
  needed) to re-verify every code-level finding's cited file:line against the live checked-out
  source, rather than trusting the collated citation. Found two findings (F37, F61) whose
  claimed CSS mechanism (`@property` registration, `content-visibility: auto`) does not exist
  anywhere in the current source — verdicts: not-reproduced.
- Local `python3` (no sandbox override needed) to independently recompute WCAG contrast ratios
  for F74 (#65594E on #E8E3DB = 5.317:1) and F76 (#65594E on #FCFAF6 = 6.514:1) from the live
  CSS custom-property values in `globals.css`.
- Wrote `probe/34-verify-repro.md` and `probe/34-verify-repro.json` (164 rows, one per
  collated finding) plus 87 `probe/repro-F*.png` copies of the relevant pre-existing shot for
  every visually-reproduced finding.

## 2026-08-28 — dev-server steward: teardown

Commands run (unsandboxed):
```
lsof -i :3000 -t   # -> 64461
lsof -i :3014 -t   # -> 64658
lsof -i :3015 -t   # -> 64603
lsof -i :3016 -t   # -> 64633
kill 64461
kill 64658
kill 64603
kill 64633
sleep 5
lsof -i :3000 -t   # -> (empty)
lsof -i :3014 -t   # -> (empty)
lsof -i :3015 -t   # -> (empty)
lsof -i :3016 -t   # -> (empty)
```

Final state: 3000 free, 3014 free, 3015 free, 3016 free. No kill -9 escalation needed — all four PIDs exited on SIGTERM within 5s.

## Commands run unsandboxed (MB -- the builder, W4)

All of these launch headless Chromium via `@playwright/test`, which cannot claim
a mach port inside the sandbox; every other command MB ran stayed sandboxed.
All were run from
`/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final`,
which resolves `@playwright/test` through the `node_modules` symlink into
`apps/designer-portal/node_modules`.

- `node self-check.mjs` -- MB's own build check (boot, external requests, page
  errors, fonts, SC1/SC2/SC3, density map, reading index, shadow census,
  overflow, reduced-motion parity, dev-bar reversibility, navigator landings,
  oscillation, CLS, unnamed focusables). Launches Chromium; sandbox off.
- `node host-sim.mjs` -- the Artifact host simulation (content inserted into a
  live body after load, scripts re-executed). Launches Chromium; sandbox off.
- `node shots-mb.mjs` -- MB's screenshots, including the JavaScript-disabled
  rest state. Launches Chromium; sandbox off.
- `node diag.mjs` / `node diag2.mjs` / `node diag3.mjs` / `node diag4.mjs` --
  throwaway overflow and layout-shift diagnostics, deleted after use. Launched
  Chromium; sandbox off.

## Commands run unsandboxed (shooter, W4)

All of these launch headless Chromium via `@playwright/test`, which cannot
claim a mach port inside the sandbox; run from
`/Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final`.

- `node shoot-final.mjs` -- the eight dev-bar/scroll states (rest, condensed,
  region-in-focus, foot, 1280, 390, reduced, slow-mid-transition) plus the
  external-request, box-shadow census, and page-error probes. Launches
  Chromium; sandbox off.

## Commands run unsandboxed (MR — the prober, W4 mockup review)

- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review-clickthrough.mjs` — run four times (2026-08-29, initial run plus three after hardening items 7, 11, 12 and 15). The sandbox had to be off because the script launches headless Chromium through `@playwright/test`, and Chromium cannot claim a mach port inside the sandbox.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && sips -Z 900 review-shots/16-sc-0.png --out review-shots/_view-sc0.png` — downscale one evidence PNG for reading. The sandbox had to be off because `sips` is a CoreGraphics client and needs the window-server mach port.
- Note: `node host-sim.mjs` is not run separately; `review-clickthrough.mjs` spawns it with `execFileSync` inside that same unsandboxed run (C.8 item 3), and its stdout is saved to `mock/final/review-shots/host-sim-out.txt`.

## Commands run unsandboxed (MB2, the builder v2, W4b fix pass)

Every command below launches headless Chromium through `@playwright/test` (resolved via the
`mock/final/node_modules` symlink into `apps/designer-portal/node_modules`). Headless Chromium
cannot claim a mach port inside the sandbox, so each one was run with the sandbox off; no other
command in this seat was.

- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node measure-rail.mjs ./index.html` -- rail geometry before and after the RF-05 ladder change (spine clientHeight/scrollHeight, ladder extent, slot heights, the 390 band-2 text box). Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node probe-act.mjs` -- isolated test of whether `overflow:clip`, `overflow-clip-margin:0` or `contain:paint` stops an act's ink pool contributing to `scrollWidth` (R-02). Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node probe-ovf.mjs` -- the 390/1280/1440 `scrollWidth > clientWidth` census, before and after each R-02 candidate. Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node probe-bracket.mjs` -- the reading bracket's height across a whole 0-to-foot read, to prove R-07 fixed. Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node shots-mb.mjs` -- MB's own screenshots, including the JavaScript-disabled rest state. Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node host-sim.mjs` -- the Artifact host's insert-after-load simulation, repointed at this mockup's ids (R-04). Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review-clickthrough.mjs` -- MR's eighteen-item C.8 probe, re-run against the fixed file. Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node probe-doors.mjs ../../build/index-v1.html` and `... node probe-doors.mjs ./index.html` -- checking whether the 1280 rail's two-line `FILED WITH THIS JOB` heading is a regression of the fix pass (it is not: identical in both). Chromium.

## Commands run unsandboxed (HOST-SIM)
- `cd .../mock/final && node host-sim.mjs` — launches headless Chromium via Playwright, which needs a real mach port unavailable inside the sandbox.

## Commands run unsandboxed (shooter, W4b fix-pass re-shoot)
- `node shoot-final.mjs` (run from mock/final/ with dangerouslyDisableSandbox:true) — headless Chromium needs a real mach port, which the sandbox denies.

## Commands run unsandboxed (MR2 — the prober, second pass)

Each of these launches headless Chromium via `@playwright/test`; headless Chromium cannot claim a
mach port inside the sandbox, so the sandbox had to be off for these and only these.

- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review-clickthrough.mjs` — the C.8 instrument, re-run unchanged; launches Chromium and spawns `host-sim.mjs`, which launches a second Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review2-claims.mjs` — MR2's own claims probe (crops, rail names, margin groups, mobile bar, Rest/motion, reading bracket, dev-bar census, tokens, JS-disabled static paint); launches Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review2-visual.mjs` — MR2's second claims probe (rail segment text, margin group order, hover-only census, screenshots); launches Chromium.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node -e '...'` (three inline one-off scripts: locating the five real crops, screenshotting the crops at scrollTop 2115, and the `.rh-quiet` / SC11 readable-text census) — each launches Chromium.

## Commands run unsandboxed (FC — the fragment cutter, W4b)

Each of these launches headless Chromium via `@playwright/test` (through the `mock/final/node_modules`
symlink, confirmed already present), or runs `sips`, which writes a scratch file into the system
temp dir; both need the sandbox off.

- `ln -sf /Users/kody/Code/patina-merged/apps/designer-portal/node_modules /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final/node_modules` — confirmed the existing symlink target (sandboxed; listed here for completeness, not itself a Chromium/sips call).
- `sips -g pixelWidth -g pixelHeight shots/w1440-rich-s0.png shots/w1440-spine-full.png shots/w1440-ticket-seam.png shots/w1440-letterhead-vitals-phases-open.png` — read literal today-geometry crop dimensions (rail 248px-cropped, paper-column 948px-cropped shots) off disk.
- `cd mock/final && node measure-geo.mjs index.html` — read the live mockup's real rail/paper/frame widths and heights (rail 200px, paper-measure 910px at 1440) for the *-after fragments' literal wrapper dimensions.
- `cd mock/final && node inspect-structure.mjs` — read `.paper-measure`'s real child order and offsets (sentinel/band/region tops and heights) to design the scroll-crop reconstruction.
- `cd mock/final && node inspect-ffe.mjs` — read the dev bar's actual `ffe` jump-target scrollTop (933px) and `data-lens-state`.
- `sips -c 360 248 shots/w1440-spine-full.png --out mock/final/shots-crop/spine-before-crop.png` — one exploratory centered crop, superseded by a PIL top-aligned crop; kept sandboxed thereafter via Python's PIL, not sips.
- `cd mock/final && node cut-fragments.mjs` (run three times, iterating the scroll-crop reconstruction) — the fragment cutter itself: drives `index.html`, clicks dev-bar states, settles, mutates the live DOM in place for the scrolled crops, and serializes the twelve named fragments' DOM subtrees to `mock/fragments/*.html`.
- `cd mock/final && node preview-fragments.mjs <names...>` (run twice, before and after the sticky-band/z-index fix) — renders each written fragment standalone against `kit.css`+`lens.css` and screenshots it, to verify the cut before handing it to the deck build.
- `cd mock/final && node debug-frag.mjs lens-s1-1440` — one geometry probe (`getBoundingClientRect`/`getComputedStyle` on the band and the translated wrap) that found the stacking-order bug the clip-box fix answers.
- `SMOKE=1 node mock/deck-parts/build.mjs` (run once, to produce the reportable build result) — the deck assembly gate itself; launches no browser but calls `sips` internally for any `<!-- shot:*.png -->` it resolves.

## Commands run unsandboxed (1280 fix)

Each of these launches headless Chromium via `@playwright/test` (through the existing `mock/final/node_modules`
symlink); Chromium needs a real mach port, so the sandbox is off for all of them. Run from `mock/final`.

- `node .diag1280.mjs` (temp, deleted after use) — clicked the `1280` dev-bar button, read `getBoundingClientRect()` for `#rail-1280`'s ladder, all six seg-slots, all four room rungs, `.doors-head` and all four doors, to locate the clip against the real 800px frame.
- `node .diag1280b.mjs` / `.diag1280c.mjs` / `.diag1280d.mjs` / `.diag1280e.mjs` (temp, deleted after use) — follow-on probes: the Pieces `.seg`/`.seg-value`/`.seg-name`/`.rungs` natural (unconstrained) content heights, `.doors-head`'s `scrollHeight` vs its declared 20px box (found the 2-line wrap that overprinted the first door), and each room rung's computed `min-height`/`block-size` (found `.rung`'s 28px floor overriding `.lens-nav-room-rung`'s intended 0px collapse).
- `node build-index.mjs` — regenerated `index.html` from `gen/css.mjs` + `gen/paper.mjs` after porting the fix into the generator; diffed byte-identical against the hand-edited `index.html` it replaced.
- `node .verify-1280-fix.mjs` (temp, deleted after use, run twice — before and after the generator regen) — the acceptance check: every `#rail-1280` text element's rect inside its nearest `overflow` ancestor (excluding the four room rows deliberately collapsed by Override 2), and `.doors-head`'s rect against all four `.door` rects for intersection.
- `node .shot-check.mjs` (temp, deleted after use) — one `#rail-1280`-only screenshot to eyeball the fix before trusting the numeric assertions.
- `node shoot-final.mjs` — full re-shoot (`shots/1280.png` and the other seven state shots) plus the external-request/box-shadow/page-error/byte-size census.
- `node host-sim.mjs` — re-ran the static-paint + `__mockReady`/`__lensSettled` + zero-console-error host simulation.

## Commands run unsandboxed (deck)
- `node mock/deck-parts/build.mjs` — exit 0 — builds presentation.html from the 17 deck-parts; shells out to `sips` which writes a scratch file into the system temp directory, blocked by the sandbox.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/qa-run.cjs` — exit 0 — runs the headless-Chromium QA sweep over presentation.html across viewports/themes; Chromium cannot claim its mach port inside the sandbox.

round 2
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/build.mjs` — exit 0 — rebuilds presentation.html after the round-2 fixer edits; same sips/temp-file need.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/qa-run.cjs` — exit 0 — re-runs the headless-Chromium QA sweep over the rebuilt presentation.html; same mach-port need.

## Commands run unsandboxed (perf)

Every one of these launches headless Chromium through `@playwright/test` (via the existing
`mock/final/node_modules` symlink to `apps/designer-portal/node_modules`); Chromium needs a real
mach port, so the sandbox is off for all of them. Run from `mock/final`.

- `node perf-host.mjs [file] [label]` (new, kept) — host-sim's insertion model with
  `Emulation.setCPUThrottlingRate {rate:4}` (`CPU_RATE`/`RUNS` env, 3 runs, median reported).
  Times insertion to first paint / `document.fonts.ready` / `window.__mockReady` /
  `__lensSettled()`; also reports node count, `<style>` bytes and rule count, `@font-face`
  count, data-URI bytes, `longtask` entries, and CDP `Performance.getMetrics`
  LayoutCount/RecalcStyleCount deltas across init. It rewrites an **in-memory** copy of the file
  to add `performance.now()` deltas per init module (`fit`, `lens.<key>`, `focus.<key>`,
  `settle.<key>`, `fullHeight`, `syncBar`, `ink`) — `index.html` on disk is never touched.
  Run against `index.html`, against the pre-fix copy, and against the Life Review control
  (`../../../document-life-directions-2026-08-28/mock/final/index.html`).
- `node perf-stream.mjs [file] [label]` (new, kept) — the model host-sim cannot express: the
  file served from a throttled local HTTP server (`KBPS`, default 500) and **navigated to**, so
  the parser sees it arrive byte by byte. `Network.emulateNetworkConditions` +
  `Emulation.setCPUThrottlingRate {rate:4}`. Reports browser FCP, the first laid-out
  `.region .rh-name` box, `__mockReady`, `fonts.ready`, `__lensSettled()`, DCL/load and node
  count. Run at 300 / 500 / 1500 kbps for the pre-fix copy, `index.html`, and the control.
  Two measurement traps found and fixed inside it: `page.screenshot()` cannot be the
  first-paint probe (it blocks on the same pending stylesheet it is trying to time, so its own
  baseline shot lands after the stall), and `waitForFunction` must use `polling: 50` rather
  than its default rAF polling (a pending `<style>` blocks the rendering steps, so an rAF poll
  cannot observe a flag the script has already set).
- `node build-index.mjs` — regenerated `index.html` after the document-order fix in the
  generator.
- `node review-clickthrough.mjs` — the 18-item gate, run before and after the fix; identical
  profile (17 PASS / 1 FAIL, item 12) and identical SC numbers.
- `node host-sim.mjs` — static-paint + `__mockReady` + zero-error re-check after the fix.
- `node shoot-final.mjs` — re-shoot plus the external-request / box-shadow / page-error /
  byte-size census after the fix.

round 1
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/build.mjs` — exit 0 — build.mjs shells out to sips (image processing) which writes a scratch file into the system temp directory, unreachable inside the sandbox.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/qa-run.cjs` — exit 0 — qa-run.cjs launches headless Chromium, which cannot claim its mach port inside the sandbox.

round 3
- `node mock/deck-parts/build.mjs` — exit 0 — shells out to sips, which writes a scratch file into the system temp directory; sandbox blocks that write.
- `cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28 && node mock/deck-parts/qa-run.cjs` — exit 0 — launches headless Chromium, which cannot claim its mach port inside the sandbox.

Commands run unsandboxed (deck r4)
- `node mock/deck-parts/build.mjs` — exit 0, run 3x (baseline, after the `height:auto` fix, after the padding trim) — shells out to sips, which writes a scratch file into the system temp directory; sandbox blocks that write.
- `node build/measure-ev.mjs` (new script, run from `mock/deck-parts/../../build` with `node_modules` symlinked to `apps/designer-portal/node_modules`) — exit 0, run 3x (baseline, post-fix, post-padding-trim) — launches headless Chromium via `@playwright/test`, which cannot claim its mach port inside the sandbox.
- `node build/debug-shot.mjs` (scratch, deleted after use) — exit 1 then 0 — same Chromium mach-port requirement; first run crashed on an out-of-bounds `clip` region (script bug, not sandbox), rewritten and rerun clean.
- `node build/probe.mjs` against `build/probe.html` (scratch, both deleted after use) — exit 0, run 2x (5-variant then 6-variant with the `height:auto` fix) — isolated repro of the flex/grid/block sizing bug outside the deck, same Chromium requirement.
- `sips -c … --cropOffset … mock/deck-qa/today-1440-light.png --out crop*.png` (scratch crops under the session scratchpad, for visual inspection) — run 5x successfully unsandboxed after the first attempt failed sandboxed with "Cannot write to file /var/folders/…" (sips' own scratch temp file).
- `node mock/deck-parts/qa-run.cjs` — exit 0, run 2x (pre-final-tweak and final) — launches headless Chromium, which cannot claim its mach port inside the sandbox.

## Commands run unsandboxed (close)
- `SMOKE=1 node mock/deck-parts/build.mjs` — exit 0 — shells out to `sips` (image processing), which writes a scratch file into the system temp directory; unreachable inside the sandbox.
- `node mock/deck-parts/qa-run.cjs` — exit 0 — launches headless Chromium, which cannot claim its mach port inside the sandbox.

## Commands run unsandboxed (ask fix)
- `node mock/deck-parts/build.mjs` — exit 0 — shells out to `sips` (image processing), which writes a scratch file into the system temp directory; unreachable inside the sandbox.
- `node mock/deck-parts/qa-run.cjs` — exit 0 — launches headless Chromium, which cannot claim its mach port inside the sandbox.
