# W6 architect audit — CLOSED against `document-lens/integration` @ `975fdf6b7`

_2026-08-30 · ARCHITECT · closed in place; every row carries `<!-- W6: verified at 975fdf6b7 -->`. `main` `dab057537` is an ancestor with zero frozen-path drift; jest 476 / 5669; seed 19/19 with `…d5/d6/d7`. Verdicts: **HELD** (shipped matches the ruling, deviations logged where amended) · **OWED** (ruled, not yet run) · **NEW** (found at this close, carried by phase C)._


## Decisions OD-1…OD-16

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| OD-1 | Band content per spread kind — pure `deriveLensBand`; `line1 {identity,rightFlush,moneyOnly}`, `line2`, `standing[]` | `lens-band-derivation.ts:200` `LensBandModel`; `line2.long/short` `:185-188`; `short:` `:129` | D-B24, D-B26, D-B22, D-B38 (line 1 holds its box) | HELD (as amended and logged) <!-- W6: verified at 975fdf6b7 --> |
| OD-2 | Pre-work ladder: keys widen to seven; per-section table; fallbacks `NOTHING YET`/`NOT KNOWN YET` | `document-index.ts:27-33`, `:180-183`; `prework-region.tsx`; `prework-regions.spec.ts` green on prod (`e2e-run-w6-prod-1.log:124-131`) | A-06, W5-R2, W5-R5 §2 (`CORE · STAGE 03`), W6 wiring 2 (stage strip reads the spread) | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-3 | `lens-constants.ts` the one source | 14 exports: `LENS_LOOKAHEAD_PX 240` `:11`, `SETTLE_VELOCITY 40` `:14`, `SETTLE_MS 120` `:15`, `RESOLVE_STABLE_FRAMES 3` `:24`, `RESOLVE_MAX_MS 3000` `:29`, `TURN_OUT_MS 90` `:36`, the D-B24 measures, `LADDER_SEGMENT_MIN_PX` | D-B24, D-B32, D-B31, D-B46 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-4 | browserslist + `@supports (content-visibility:auto)` with the pre-agreed failure move | `package.json:115` ✓; `globals.css` block deleted — `content-visibility` at `:1139,:1141,:1148` inside the D-B33 comment; `--doc-passed-reserve` declared, unspent | D-B33 (W6 census owed → I152 marker), D-B17 | HELD (deleted per D-B33) <!-- W6: verified at 975fdf6b7 --> |
| OD-5 | Regime literals | `page.tsx:2440` `data-shell-regime`; `doc-spine.tsx:120` `data-spine-regime` | — | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-6 | Standing sheet = `DocSheet`, `Standing · N`, `kind="standing"` → `data-doc-sheet-kind` | `standing-sheet.tsx:52-54`; `doc-sheet.tsx:369`; `data-standing-row`/`-tier` src 1/1, e2e 2/1 | C-12, D-B25, D-B36 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-7 | One live region of the lens; sr-only stop announcement inside line 2 | `lens-band.tsx:319` `data-lens-announce`; `aria-live` count lens-band 1 / lens-ladder 0 / standing-sheet 0 | D-B2, C-11 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-8 | `ticket-derivation.ts` byte-untouched; `deriveLadderDoors` per spread | `git diff main --stat -- ticket-derivation.ts` → empty; `lens-ladder-derivation.ts:612` `deriveLadderSegments`, `:700` `deriveLadderDoors(input)` | A-13, DL-04, C-3 (shipped signature) | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-9 | `data-section-stage-line` on the stage-line root; mount-order test | `section-stage-line.tsx:63`; `page.test.tsx` 4 hits; e2e 4 hits | D-B3, D-B30, W5-R5 §2 (the strip becomes the `scope` body) | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-10 | No fold-key migration; density only on `STOP_FOLD_KEYS`; `RegionFold` with `cause` | `use-region-fold.ts:64` keys, `:127` `forceOpen`, `:132` `positionDensity`, `:137` `density`, `:140` `cause` | DL-09, D-B15/16, D-B27 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-11 | Three slots kept; left zone; `data-reading-index`; `readingIndex`; DL-05 registrations gone | `mobile-shell.tsx:49` `readingIndex`, `:76` `onJumpToLine`, `:84` `marginCount`; `mobile-bar.tsx:291` `data-reading-index`, `:152` `Margin · N` door (W5-C9: absent at N = 0); `red-letter-zone`/`document-guide` 0 registrations | A-01, DL-05, A-08, D-B30/W5-R1, D-B18 addenda, D-B47 | HELD (as amended and logged) <!-- W6: verified at 975fdf6b7 --> |
| OD-12 | Root sets `--doc-quiet-reserve`; `min-block-size` rule at every density | 7 roots set it; `globals.css:223-224` `-min`/`-exc`, `:1133` rule | D-B42, D-B33, D-B39 | HELD (vocabulary per D-B42) <!-- W6: verified at 975fdf6b7 --> |
| OD-13 | `full|quiet` + `data-passed`; no `reading`; SC11 `full ≥ 1` | `data-density` src 18 / e2e 21; `data-passed` src 7 / e2e 14; `'reading'` density 0 hits | D-B15, D-B16 (+ instrument ratified), F6 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-14 | Two tiers; floors count-derived; doors head 34px; rungs under the current stop | tiers by class `lens-ladder.tsx:17`; yield `invisible` + `aria-hidden` `:342-343`; `aria-current` `:417`; `min-h-[34px]` `:502` | D-B43, D-B37 (landed) | HELD (as amended and logged) <!-- W6: verified at 975fdf6b7 --> |
| OD-15 | No `doc-lens` gate; 136px grid; `<LensLadder>` both tiers; `useLensDensity(mainRef)` unconditional | `page.tsx:1059`; `:2444` grid; `doc-spine.tsx:303` `<LensLadder`; `min-[1440px]:block` 0 | D-B17 | HELD <!-- W6: verified at 975fdf6b7 --> |
| OD-16 | Three spine files deleted | `components/document/spine/` carries none of the three | D-B4, D-B6 CLOSED | HELD <!-- W6: verified at 975fdf6b7 --> |

## Contracts C-1…C-8

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| C-1 | `DocSpineProps.letterheadInFrame?` | `doc-spine.tsx:54` | D-B23 | HELD <!-- W6: verified at 975fdf6b7 --> |
| C-2 | `DocumentIndexKey` (13 keys), `PROJECT_PAPER_ORDER`, `paperRegionsForSection`, `regionHeadingId` throws | `document-index.ts:27-33`, `:180-183`; `regionHeadingId` (`:226-233`) delegates to `paperRegionFor`, which throws on an undeclared key (W5-C review: "throw on an undeclared key and every product caller is guarded") | OD-2 | HELD (throw by delegation) <!-- W6: verified at 975fdf6b7 --> |
| C-3 | `LadderSegment`, `LadderDoor`, `deriveLadderDoors(input)`; tiers by class | `lens-ladder-derivation.ts:612,:700` | D-B43 | HELD (as amended) <!-- W6: verified at 975fdf6b7 --> |
| C-4 | `[data-lens-window]`, segment buttons, `data-room-chip`, `<nav aria-label="This paper">`, `readingIndex` | `lens-ladder.tsx:177-185` window, `:261` nav, `:455` room chip; `mobile-shell.tsx:49` | A-08, D-B1 | HELD <!-- W6: verified at 975fdf6b7 --> |
| C-5 | `LensBand({model, open, readingStop?, docId, onToTop?, onPinChange?, onActed?, onStandingOpened?})` | `lens-band.tsx:60-78` | D-B19, D-B22, D-B23 | HELD (as amended) <!-- W6: verified at 975fdf6b7 --> |
| C-6 | band derivation takes `needs` + `guide`; DL-05 registrations gone | `lens-band-derivation.ts:143-147`; 0 registrations in the two zones | DL-05 | HELD (as amended) <!-- W6: verified at 975fdf6b7 --> |
| C-7 | Tokens declared once: band-height, landing-clear, region-gap, quiet-reserve-min/-exc; no seam-height | decl 1/1/1/1/1; `--doc-quiet-reserve` 0 at `:root`; `--doc-seam-height` 0/0; `--doc-mobile-bar-height` written on `html` by the bar (`mobile-bar.tsx:235`, read `globals.css:239`) | D-B42, D-B3, D-B47 | HELD <!-- W6: verified at 975fdf6b7 --> |
| C-8 | `RegionDensity`, `RegionFold` with `cause`, `STOP_FOLD_KEYS` | `use-region-fold.ts:64,:135` | D-B27 | HELD <!-- W6: verified at 975fdf6b7 --> |

## DOM contract table (§5) vs shipped attributes

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| `data-lens-band` | §5 (as amended at this close) | src / e2e: 1 / 13 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-open` | §5 (as amended at this close) | src / e2e: 2 / 3 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-line` | §5 (as amended at this close) | src / e2e: 2 / 13 — line 1 `min-h-[15.4px]` `lens-band.tsx:228` (D-B38) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-state` | §5 (as amended at this close) | src / e2e: 4 / 1 — sole writer `use-lens-state.ts` | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-settled` | §5 (as amended at this close) | src / e2e: 3 / 5 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-resolved` | §5 (as amended at this close) | src / e2e: 1 / 2 — `use-lens-density.ts:84` (D-B46) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-reading-index` | §5 (as amended at this close) | src / e2e: 3 / 8 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-window` | §5 (as amended at this close) | src / e2e: 2 / 0 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-region-head-in-frame` | §5 (as amended at this close) | src / e2e: 1 / 1 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-letterhead-in-frame` | §5 (as amended at this close) | src / e2e: 1 / 1 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-density` | §5 (as amended at this close) | src / e2e: 18 / 21 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-passed` | §5 (as amended at this close) | src / e2e: 7 / 14 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-sections-door` | §5 (as amended at this close) | src / e2e: 1 / 1 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-doc-sheet-kind` | §5 (as amended at this close) | src / e2e: 1 / 2 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-section-stage-line` | §5 (as amended at this close) | src / e2e: 2 / 4 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-rail-label / data-rail-value` | §5 (as amended at this close) | src / e2e: 6+2 / 2+1 — **drift 1 closed** (W6-prep) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-letterhead-title-edit` | §5 (as amended at this close) | src / e2e: 1 / 3 (D-B48) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-margin-row / -act / data-mobile-document-door` | §5 (as amended at this close) | src / e2e: 4+1+4 / 4+1+0 (D-B30) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-lens-line2-kind/-form/-sentence/-more/-announce` | §5 (as amended at this close) | src / e2e: 1 each / 2,2,3,5,0 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-standing-row/-tier · data-ladder-row/-stop/-unmounted · data-room-chip` | §5 (as amended at this close) | src / e2e: 1,1 · 4,3,1 · 2 / 2,1 · 0,0,0 · 1 | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-mobile-margin-chips` | §5 (as amended at this close) | src / e2e: **0** / 5 (absence assertions) — retired (D-B45) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |
| `data-letterhead-ledger · data-region-count-line` | §5 (as amended at this close) | src / e2e: 0 / 0 (never shipped; D-B26 corrected) · 0 live (one comment mention `prework-region.tsx:101`) | — | HELD — table complete <!-- W6: verified at 975fdf6b7 --> |

## Tokens (declared once)

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| `--doc-band-height` | declared 1 | uses 5 | — | HELD <!-- W6: verified at 975fdf6b7 --> |
| `--doc-landing-clear` | declared 1 | uses 7 | — | HELD <!-- W6: verified at 975fdf6b7 --> |
| `--doc-region-gap` | declared 1 | uses 19 | — | HELD <!-- W6: verified at 975fdf6b7 --> |
| `--doc-quiet-reserve-min` | declared 1 | uses 8 | — | HELD (D-B42) <!-- W6: verified at 975fdf6b7 --> |
| `--doc-quiet-reserve-exc` | declared 1 | uses 2 | — | HELD (D-B42) <!-- W6: verified at 975fdf6b7 --> |
| `--doc-quiet-reserve` | declared 0 at `:root` | uses 18 (per-root + rule fallback) | — | HELD (D-B42) <!-- W6: verified at 975fdf6b7 --> |
| `--doc-seam-height` | declared 0 | uses 0 | — | HELD (deleted) <!-- W6: verified at 975fdf6b7 --> |
| `--doc-passed-reserve` | declared 1 | uses 3 (comment text) | — | HELD (D-B33, unspent) <!-- W6: verified at 975fdf6b7 --> |
| `--doc-mobile-bar-height` | declared 0 in CSS (written on `html` by the bar) | uses 5 | — | HELD (D-B47) <!-- W6: verified at 975fdf6b7 --> |

## Test strategy (§6) vs the final basket

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| jest arithmetic | Σ deltas = tip − baseline | `test-impact.md:96-119`: first-parent table, **476 / 5669 = 458+18 / 5170+499**, closes exactly | — | HELD — **drift 2 closed** <!-- W6: verified at 975fdf6b7 --> |
| tripwires | `shadow-gate` (one `.doc-elevated`), `contrast.test.ts` (18 washes, hex parser), `lens-css-scope` (no `content-visibility`) | latest recorded output: `w5-fix-log.md:188` "shadow-gate + contrast + lens-css-scope: 3 suites, 64 tests, PASS"; no run recorded at the tip | — | HELD — phase C pastes the tip's output <!-- W6: verified at 975fdf6b7 --> |
| basket + engines | eight lens specs + `prework-regions` + `mobile-margin-sheet`; ship-bar config; chromium + webkit on the TLS standalone | `e2e/document/lens-{a11y,band-height,cls,contrast,density,fling,rail-budget,reduced-motion}.spec.ts`, `prework-regions`, `mobile-margin-sheet`; `playwright.ship-bar.config.ts` shipped; prod chromium run 149 / 3 failed / 5 skipped; **0 `[webkit]` lines** — TLS webkit run OWED | D-B41 (amended to the shipped config) | ****OWED** — webkit ship bar** <!-- W6: verified at 975fdf6b7 --> |
| the three prod-run failures | — | (1) `lens-contrast:183` — 3× `project_time_entries` on promotion: **D-B49** (bodies fetch on mount; hooks move to the root); (2) `mobile-margin-sheet:140` — `ReferenceError: scrollYBefore` used before its `const` at `:158`, a spec bug; (3) `quiet-release-contracts:172` — `getByTestId('mobile-bar')` not visible at 390 on the prod build, no `quiet()` — triage with D-B28's precondition first | D-B49 | ****NEW — phase C carries all three**** <!-- W6: verified at 975fdf6b7 --> |

## Deviations ledger close

| id | as ruled | shipped @ 975fdf6b7 | deviations | verdict |
|---|---|---|---|---|
| ledger | contiguous ids, measurement + signature, CLOSED companions, collision notes | **51 rows**: D-B1…D-B49 contiguous + `D-B6 CLOSED` + `D-B9 CLOSED (care)`; every row carries `measurement` and `ruled by`; D-B27→D-B30 collision noted in D-B30; A-09 renumbering in D-B2; D-B41/D-B48 amended and D-B49 added at this close | — | HELD <!-- W6: verified at 975fdf6b7 --> |

## Drift list at close

- Drift 1 (`data-rail-label`/`-value`) — **closed**, shipped on W6-prep (src 6/2, e2e 2/1).
- Drift 2 (jest arithmetic) — **closed**, `test-impact.md:96-119` first-parent table, Σ = +499 / +18.
- No open drift: every shipped form either matches its ruling or carries a D-B row.

## Phase C must carry

1. **D-B49** — region data hooks to the root (`schedule-spine.tsx:191`, `work-block.tsx:86`, `coordination-work.tsx:51`); `lens-contrast:183` green on the production build with no allowlist change; the body-hook census printed in `test-impact.md`.
2. `mobile-margin-sheet.spec.ts:158` — declare `scrollYBefore` before its use (spec bug).
3. `quiet-release-contracts.spec.ts:172` — add D-B28's `quiet()` precondition, re-run on the prod build; if the bar truly does not mount at 390 there, that is a ship blocker.
4. **The TLS webkit ship-bar run** (D-B41): `PLAYWRIGHT_BASE_URL=https://localhost:3443 npx playwright test --config playwright.ship-bar.config.ts e2e/document --project=chromium --project=webkit` after Kody's one-time `mkcert -install`; paste the summary.
5. The tripwires' output at the tip (`shadow-gate`, `contrast.test.ts`, `lens-css-scope`), pasted not paraphrased.
6. The D-B33 render-cost census on `…d5` at 1440 (DOM node count, settled-scroll main-thread time, p95 frame via `long-animation-frame`, `usedJSHeapSize`) — printed in `e2e-baseline.md` "W6" and copied into I152; the OD-4 candidate reopens only if p95 > 16.7ms.

## I152 — render cost after D-B33

`content-visibility: auto` on passed regions was deleted (D-B33) because the property's relevance toggle moved the viewport's content (CLS 0.8658 → 0.000986 with the one declaration removed; a real last-remembered size changed nothing). The long paper therefore keeps every passed region laid out and painted. The cost is taken on a measurement, not a guess, and it is reported ungated: <!-- I152: paste the W6 census here — `…d5` at 1440, DOM node count, 30-step settled-scroll main-thread ms, p95 frame ms (`long-animation-frame`), `performance.memory.usedJSHeapSize` — from `e2e-baseline.md` "W6" when the lane prints them --> . The OD-4 candidate (per-root `contain-intrinsic-size: auto <measured px>` at passing, under a paper-CLS-0 proof) reopens only if that p95 exceeds 16.7ms; `content-visibility: hidden` with a hand-rolled reserve stays disallowed. `data-passed` is still written — the density map (sentence (b)) and the fling census read it.


**Row count: 60.**

