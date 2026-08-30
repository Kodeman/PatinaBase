### I152 · The Smart Lens — waves W0–W6, deviations, debts (build note; deploy recorded separately at I152-deploy)

Implements R127 (`docs/design/the-document/DECISIONS.md`, this entry's companion). Program folder
`artifacts/document-lens-build-2026-08-29/`; branches `document-lens/w<N>-l<n>` → `document-lens/w<N>`
→ `document-lens/integration` (`--no-ff` per wave) → one PR to `main`. No feature flag; GA at every
wave merge. Final walk verdict: **SHIP** (`build/w6-walk.md`). Architect close verdict: **60 rows, drift
empty** (`build/w6-architect-audit.md`).

**Integration shas, first-parent history of `document-lens/integration`** (re-derived at Wave 6 to
close the jest-arithmetic drift — `build/test-impact.md`):

| Step | Sha |
|---|---|
| `main` baseline | `dab057537` |
| W0 — docs, tripwires, seed, e2e baseline | `690337f1a` |
| W1 — the rail earns its column | `7c8b33e39` |
| W2 — the ladder | `e6da8bd76` |
| W3 — the lens line | `4915583c2` |
| W3 fix lane | `0a03b4af9` |
| W4 — density, one direction | `eee60fcb0` |
| W5 — the pre-work spreads | `99cc6d135` |
| W4 fix-3 lane | `d2110d1bd` |
| W6 prep (ship-bar config, rail attrs) | `07132237f` |
| W6 wiring 1 (the owed W4 minors) | `8f2d243dd` |
| W5 fix lane | `f933ba207` |
| W6 wiring 2 (the owed W5 carries) — **tip** | `975fdf6b7` |
| D-B49 — a region's data hooks live at its root (+2 tests / 0 suites) | `71414219e` |
| W6-R1 §1 / F1 — the short form's subject is the need's object (+7 tests / 0 suites) | `6a4702bfe` |
| PR, `document-lens/integration` → `main`, `--no-ff` | https://github.com/Kodeman/PatinaBase/pull/40 |

**The walked sha is `975fdf6b7`, not the tip.** The DESIGN LEAD's final walk (`build/w6-walk.md`,
verdict **SHIP**) was taken there, and two commits followed it. Neither invalidates the walk:
**`71414219e` (D-B49) is print-neutral** — it moves three query-hook call sites from region bodies
to region roots and passes the same values down as props; no printed string, box or density
changes, and the full basket re-run after it is green. **`6a4702bfe` (F1) is the one print change
the walk itself ordered**, and it is confined to the short form's subject on a `schedule_conflict` /
`schedule_proposal` need — on the seeded papers that is `…d7` at 390 alone (`…d5` and `…d6` carry no
conflict need). Every other L-1…L-11 cell the walk recorded is untouched.

---

## File map

**New files.** `components/document/spine/lens-ladder.tsx` (the ladder — W2); `lib/document/lens-ladder-derivation.ts`, `document-index.ts` widened to 13 keys (W2, W5); `components/document/lens-band.tsx` (the 56px band — W3); `lib/document/lens-band-derivation.ts`, `lib/document/lens-constants.ts` (14 exports, the one source for every lens number), `components/document/standing-sheet.tsx` (W3); `hooks/use-lens-frame.ts` (W3); `hooks/use-lens-density.ts` (`LensDensityApi`; the resolution gate, D-B46), `hooks/use-lens-state.ts` (W4); `prework/prework-region.tsx` (W5); `hooks/use-margin-sheet.ts`'s `'margin'` sheet branch + the note composer (W5); e2e: the eight `lens-*.spec.ts` files, `e2e/document/prework-regions.spec.ts`, `e2e/document/mobile-margin-sheet.spec.ts`, `e2e/helpers/lens.ts`, `e2e/document/lens-fixtures.ts` (W4/W5); `playwright.ship-bar.config.ts`, `build/tls/Caddyfile` (W6, D-B41); `e2e/census/lens-cost-census.spec.ts` (W6, D-B33); `scripts/the-document-lens-seed.sql` + `build/seed/seed-verify.sql` (W0, extended through W5 to 19 checks).

**Deleted files.** `job-ticket.tsx` + its 541-line test (W3) — the eight-row table, its sentinel, its `IntersectionObserver`, its pin effect and its `--doc-seam-height` publication all go with the component; `ticket-derivation.ts` is byte-untouched. `spine-timer.tsx` (W1), `spine-running-index.tsx` + `spine-shelved-blocks.tsx` (W2) — OD-16, confirmed absent at the Wave 6 audit. `mobile/mobile-margin-chips.tsx` + its test, both branches (W5, D-B45) — the component printed at no width even before this program (`min-[980px]:hidden`, the desktop rail already owned the margin there); `useLetterheadMargin` deleted with it. `document_guide_shown`/`document_guide_selected` telemetry events retire (D-B22) — replaced by three `document_lens_*` events fired from `page.tsx`.

**Contracts C-1…C-8, final state** (`build/w6-architect-audit.md`; all HELD — 4 as ruled, 4 as amended and logged):

| Contract | Verdict | What it names |
|---|---|---|
| C-1 | HELD | `DocSpineProps.letterheadInFrame?` |
| C-2 | HELD (throw by delegation) | `DocumentIndexKey` (13 keys), `PROJECT_PAPER_ORDER`, `paperRegionsForSection`, `regionHeadingId` throws via `paperRegionFor` |
| C-3 | HELD (as amended) | `LadderSegment`, `LadderDoor`, `deriveLadderDoors(input)`; tiers ship as CSS classes, not a `tier` prop (D-B43) |
| C-4 | HELD | `[data-lens-window]`, segment buttons, `data-room-chip`, `<nav aria-label="This paper">`, `MobileActiveDoc.readingIndex` |
| C-5 | HELD (as amended) | `LensBand` props — the band owns its own sentinel `IntersectionObserver` (FID-04's mechanism, stronger than the original page-fed `open` prop) |
| C-6 | HELD (as amended) | `red-letter-zone.tsx`/`document-guide.tsx` model providers; 0 `useMobilePrimaryAction` registrations left in either |
| C-7 | HELD | Tokens declared once: `--doc-band-height`, `--doc-landing-clear`, `--doc-region-gap`, `--doc-quiet-reserve-min/-exc`; `--doc-seam-height` 0 uses |
| C-8 | HELD | `RegionDensity`, `RegionFold` with `cause`, `STOP_FOLD_KEYS` |

**Decisions OD-1…OD-16, final state** — all 16 **HELD**; 11 as originally ruled (OD-2, 3, 5, 6, 7, 8, 9, 10, 13, 15, 16), 5 as amended and logged (**OD-1** — the two-form line-2 trigger, D-B24/D-B26; **OD-4** — `content-visibility` deleted outright rather than kept behind `@supports`, D-B33; **OD-11** — the mobile bar's primary-act slot stays (A-01), the left zone carries household + current stop; **OD-12** — the quiet-reserve token vocabulary as shipped, D-B42; **OD-14** — tiers ship as classes, floors are count-derived per segment). Full table with shipped file:line evidence in `build/w6-architect-audit.md`.

---

## Deviations from R127 — D-B1…D-B50 (52 rows, contiguous, closed)

| id | What | Ruled by |
|---|---|---|
| D-B1 | L-2's window moves by `translateY` in a rAF, not by re-laying the track (CLS) | DESIGN LEAD |
| D-B2 | The L-9 stop announcement is a hidden span inside line 2's own live region, not a second one | ARCHITECT |
| D-B3 | Landing-clearance spec targeted `--doc-seam-height` until W3 minted `--doc-landing-clear` | ARCHITECT |
| D-B4 | Contrast rail-file floor is `≥3`, not `≥5`, after OD-16's deletions | ARCHITECT |
| D-B5 | `estimated_hours`' editor unreachable after the `PHASES` fold's deletion — **still owed** | ORCHESTRATOR |
| D-B6 / D-B6 CLOSED | Duplicate running-index observer for one wave; retired when W2 deletes `spine-shelved-blocks.tsx` | ARCHITECT |
| D-B7 | An unset vital prints one scored-ink act, not nothing | ORCHESTRATOR |
| D-B8 | The third door prints `Boards`, not `Mood boards` — one name for one thing | ORCHESTRATOR |
| D-B9 / D-B9 CLOSED (care) | Care's `N of M` and the Pieces damage date needed fallbacks, then both were closed (`onCloseoutReady` widened; the claim's `created_at` sources the date) | ORCHESTRATOR |
| D-B10 | Rail head reserves 126/117px, not 116/100 (this portal's `min-h-6` computes 27px, not 24) | ORCHESTRATOR |
| D-B11 | Room sub-rungs/doors at 44px, amended to 27px rungs after the W2 walk clipped the ladder track | ORCHESTRATOR |
| D-B12 | Lanes W2-L2/L3 branched pre-W1 deliberately, on disjoint file sets — no defect | ORCHESTRATOR |
| D-B13 | The Pieces damage date is the claim's `created_at` (no carrier-window column exists) | ORCHESTRATOR |
| D-B14 | The rail reserves the studio drawer at its foot (87px) | ORCHESTRATOR |
| D-B15 | The lens speaks `full` or is silent; initial density for an unpromoted stop is `quiet` | ARCHITECT |
| D-B16 | Passing never promotes; discovery does (the invariant the fling/density specs assert) | ARCHITECT |
| D-B17 | `enabled: false` is a test/kill seam, never passed by product code | ARCHITECT |
| D-B18 | `forceFullThrough` promotes from the top and `flushSync`s before the scroll begins | ARCHITECT |
| D-B19 | The editing freeze: `freeze(boolean)`; `data-lens-state` owned by one page-level hook | ARCHITECT |
| D-B20 | The instruments ledger prints at 390 under the vitals, stacked — not hidden | ORCHESTRATOR |
| D-B21 | The reduce block kills transitions/animations only, never opacity/visibility/display | ARCHITECT |
| D-B22 | The guide's telemetry re-homes as three `document_lens_*` events | ARCHITECT |
| D-B23 | `router.push` for `href` guide destinations; in-frame attributes React-written from `useLensFrame` | ARCHITECT |
| D-B24 | Line 2 has two forms (long/short) and one pixel-budget trigger, never a qualifier ladder or ellipsis | ARCHITECT + DESIGN LEAD |
| D-B25 | `margin-handoffs.spec.ts:156` re-pointed at the lens | ARCHITECT, owner W3-fix |
| D-B26 | The letterhead grid: title spans both columns; ledger in a bounded right column; labels shortened | ARCHITECT, countersigned DESIGN LEAD; superseded in place by W3-R4/R5/R6 |
| D-B27 | FF&E forces `full` on install/care spreads and during the release ceremony | ARCHITECT |
| D-B28 | The readiness RPC fan-out is the initial load's tail, not a lens fetch — **logged, not owned** | ARCHITECT |
| D-B29 | The CLS instrument observes from the settled origin only, gate exactly 0 | ARCHITECT |
| D-B30 | At 390 the letterhead's margin chips yield to a Margin sheet — superseded by D-B45's deletion | ARCHITECT |
| D-B31 | R4's fling gate: paper above the first region is not blank paper; `LENS_LOOKAHEAD_PX = 240` stands | ARCHITECT |
| D-B32 | The settle gate restated: settled ⇔ no frame ≥40px in the trailing 120ms; a single scroll now settles | ARCHITECT |
| D-B33 | `content-visibility: auto` on passed regions **deleted** — it was 99.9% of the CLS the gate measures; render-cost census taken instead of assumed | ARCHITECT, RATIFIED |
| D-B34 | The CLS gate is scoped to the paper; the rail's/band's own reflow is measured and printed by cause, not by an alpha tolerance | ARCHITECT, AMENDED |
| D-B35 | `getBoundingClientRect()`, not `boundingBox()`, is the instrument — a sticky element's compositor quads are non-deterministic | ARCHITECT, RATIFIED |
| D-B36 | A `DocSheet` field never enters `editing`; ratified as correct (the paper is not under the hand that's on a sheet) | ARCHITECT, RATIFIED |
| D-B37 | A yielded ladder value goes invisible **in place**, never out of the DOM — the track never resizes on a yield | ARCHITECT |
| D-B38 | The band's line 1 holds its box while empty (`min-h-[15.4px]`) so line 2 sits at one y at every state | ARCHITECT |
| D-B39 | A −24px shift at `lens-density:163` was the FF&E readiness skeleton unmounting, not the lens | ARCHITECT |
| D-B40 | A sub-pixel `boundingBox()` read on the pre-work paper did not reproduce; the box is a declared 56 | ARCHITECT |
| D-B41 | The W6 ship-bar rehearsal runs the production standalone behind local TLS (`https://localhost:3443`); the CSP directive is never stripped for the rehearsal | ARCHITECT |
| D-B42 | The quiet-reserve token vocabulary as shipped: `--doc-quiet-reserve-min` (68px)/`-exc` (112px) | ARCHITECT |
| D-B43 | OD-14's two ladder tiers ship as CSS classes on one mount, not a `tier` prop | ARCHITECT |
| D-B44 | The Margin sheet's `CAPTURE A NOTE` composer ships **text-only** (amended from an earlier "omit" ruling once the architect found the portal already writes `margin_notes` via the desktop rail); the per-stop anchor is deferred to a post-I152 schema change (`margin_notes.anchor_key`) | DESIGN LEAD, amended by ARCHITECT |
| D-B45 | `MobileMarginChips` deleted whole — both branches printed at no width even pre-W5 | ARCHITECT |
| D-B46 | First-paint promotion waits for the paper to RESOLVE (no fetching + stable `scrollHeight` for 3 frames, or a 3000ms fallback) | ARCHITECT |
| D-B47 | The 390 paper inset reads the bar's own measured height (`--doc-mobile-bar-height`, min 72px) | ARCHITECT |
| D-B48 | The project title wraps and never clips; the `<input>` appears only in edit mode, in the same box; two-line 390 gates are 300/470 gross, chosen by measured line count | ARCHITECT |
| D-B49 | A region's data hooks live at its root, never in a body a promotion mounts — closes `lens-contrast.spec.ts:183`'s newly-exposed finding; fully specified, cost measured (+2 tests/0 suites), **not yet committed** (see the sha marker above) | ARCHITECT |
| D-B50 | `Fold ↑` prints beside the one leader at a quiet stop — signed deviation, not a defect: the fold is L-7's own voice, not one of the region's acts | DESIGN LEAD |

---

## Test arithmetic — the authoritative first-parent table (`build/test-impact.md`, re-derived at Wave 6 to close a drift the wave-by-wave prose had under-counted)

| Step | Sha | Suites | Tests | Δ suites | Δ tests |
|---|---|---|---|---|---|
| `main` baseline | `dab057537` | 458 | 5170 | — | — |
| W0 | `690337f1a` | 458 | 5173 | +0 | +3 |
| W1 | `7c8b33e39` | 458 | 5201 | +0 | +28 |
| W2 | `e6da8bd76` | 461 | 5283 | +3 | +82 |
| W3 | `4915583c2` | 464 | 5357 | +3 | +74 |
| W3 fix lane | `0a03b4af9` | 465 | 5418 | +1 | +61 |
| W4 | `eee60fcb0` | 470 | 5531 | +5 | +113 |
| W5 | `99cc6d135` | 475 | 5613 | +5 | +82 |
| W4 fix-3 lane | `d2110d1bd` | 475 | 5634 | +0 | +21 |
| W6 prep | `07132237f` | 475 | 5635 | +0 | +1 |
| W6 wiring 1 | `8f2d243dd` | 475 | 5643 | +0 | +8 |
| W5 fix lane | `f933ba207` | 476 | 5669 | +1 | +26 |
| W6 wiring 2 — **tip** | `975fdf6b7` | **476** | **5669** | +0 | +0 |

| D-B49 — hooks to the roots | `71414219e` | 476 | 5671 | +0 | **+2** |
| W6-R1 §1 / F1 — the subject by kind | `6a4702bfe` | **476** | **5678** | +0 | **+7** |

**Σ = +508 tests / +18 suites, closing exactly (5678 − 5170 / 476 − 458).** The `main` baseline
reproduces **458 / 5170** on re-measurement, so the table closes at both ends. D-B49's hoist cost
**+2 tests, 0 suites** — eleven suites needed their mocks extended for the three hoisted hooks, and
`work-block.test.tsx` now drives its subject through props rather than a hook mock, which is what
the hoist rule asks a body to do. F1 cost **+7 tests, 0 suites**, one per need kind plus the
fall-through and the falsifier that the walked sentence still reads `TWO` when the kind is withheld.

**Final gate line, `6a4702bfe`:** `type-check` **0** · `lint` **exactly the two known pre-existing
errors** (`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`) · `jest`
**476 suites / 5678 tests, 0 failing** · `shadow-gate` + `contrast` + `lens-css-scope` 3 suites /
64 tests · `seed-verify.sql` **19/19** · `deploy-lens.sh` dry-run phases 1–2 **DRY RUN OK** with all
four source tripwires clean.

`main` reproduces the 458/5170 baseline exactly on re-check. lint: 2 known pre-existing errors throughout (`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`), untouched. Tripwires (`shadow-gate.test.ts`, `contrast.test.ts`, `lens-css-scope.test.ts`) last recorded output: 3 suites / 64 tests, PASS (`w5-fix-log.md`); phase C re-runs and pastes the tip's own output, not this recollection.

---

## The e2e basket, final

**Eight lens specs** (`e2e/document/lens-{a11y,band-height,cls,contrast,density,fling,rail-budget,reduced-motion}.spec.ts`) + `prework-regions.spec.ts` + `mobile-margin-sheet.spec.ts`, run against the **production standalone** behind `playwright.ship-bar.config.ts` (D-B41) — the ship-bar config drops the base config's `webServer` block, so every spec importing `e2e/helpers/supabase-admin.ts` needs the five local Supabase values exported inline on the command, never written to `.env.local`.

**Chromium, run 1 — `document-lens/integration@975fdf6b7`, production standalone: 149 passed · 3 failed · 1 did not run (10.3m).**

1. **`lens-contrast.spec.ts:183` — real, ruled, phase C carries it.** Exactly one Supabase-origin request (`project_time_entries`) fires during a pure settled scroll — not a lens fetch but a lens-*driven* one: promoting `ffe` mounts `WorkBlock`, whose own query hook fires on mount. D-B46 exposed this for the first time (before it, every root promoted at first paint off the loading skeleton, so the query had already flushed). Ruled: **D-B49**, hoisting the offending hooks to their region roots. Re-run result: **green on the production build with the allowlist untouched** — as a single case
(38.0s) and again inside the full 25-file basket on the reset database, `git diff` on
`lens-contrast.spec.ts` empty. The hoisted sites: `work-block.tsx`'s `useSectionTasks` /
`useSectionGates` / `useSectionLoggedMinutes` → the `ffe` root (`ffe-section.tsx`);
`coordination/coordination-work.tsx`'s `useSectionTasks` / `useProjectParties` → the `schedule` root
(`schedule-spine.tsx`, which already read both); `schedule/revision-ledger.tsx`'s
`useScheduleRevisions` → the same root. Bodies take props; mutation hooks stay where they are, since
a mutation issues no request until it is called. Two sites are deliberately left and named in
`test-impact.md`: `coordination-band.tsx` (never mounted anywhere) and `folio-strip.tsx` (mounts at
several anchors, not only inside a region body, and fired no request in the measured walk).
2. **`mobile-margin-sheet.spec.ts:140`** — a spec bug (`scrollYBefore` used before its declaration, lost in a merge resolution). **Fixed.**
3. **`quiet-release-contracts.spec.ts:172`** — a basket-order artefact (a shared seeded-designer timer row); passes in isolation on the same server and build. Not a product defect.

**Chromium, run 2 — `71414219e`, production standalone rebuilt, after `pnpm supabase:reset` + a
fresh lens seed (`seed-verify.sql` 19/19): 153 passed · 5 skipped · 0 failed (10.3m).** This is the
run that proves no spec depends on run order or leftover state: the same 25 files that produced
three failures on round 1 produce none against a database dropped and rebuilt from migrations and
seeds. `lens-contrast.spec.ts:183` is green here **inside the full basket**, not only in isolation.

**WebKit — 73 passed · 3 skipped · 0 failed**, sharded ≤2 spec files per invocation against a freshly
booted `next dev` on :3010, chromium-warmed first (`lens-band-height.spec.ts` on dev/chromium, 23
passed) per the standing note that a cold or hot-recompiled dev server produces reproducible-looking
WebKit failures that are not defects. Shards: `lens-band-height` + `lens-density` **36 passed / 1
skipped**; `quiet-responsive-shell` + `lens-a11y` **15 / 2 skipped**; `lens-reduced-motion` +
`prework-regions` **16**; `mobile-margin-sheet` + `lens-fling` **6**. **OD-4's find-in-page runs and
passes on WebKit** (`quiet-responsive-shell.spec.ts:461`, 6.0s) — the one behaviour
`content-visibility: auto` would have put at risk, and so the gate D-B33's deletion most needed.

**The TLS-fronted WebKit ship-bar run is still OWED (D-B41).** The standalone's CSP
`upgrade-insecure-requests` directive and its `Secure` session cookie both make plain
`http://localhost` unusable for WebKit sign-in, so the rehearsal must run behind local TLS
(`https://localhost:3443`, `mkcert` + `caddy`, `build/tls/Caddyfile`, committed). Measured at phase
B: `mkcert -CAROOT` names `~/Library/Application Support/mkcert`, **which does not exist**, and
`~/.patina/tls/` does not exist either. **Kody's one-time `mkcert -install`** (writes the login
keychain — not an agent action) is the last precondition. Until it is done, WebKit has been
exercised against `next dev` only, never against the build that actually ships.

**Firefox** stays `test.skip`'d across the whole basket, stated reason, per the `global-header.spec.ts:28-32` idiom.

---

## The D-B33 long-paper render-cost census — PRINTED, UNGATED (`e2e/census/lens-cost-census.spec.ts`, `build/e2e-baseline.md` "W6 ship-bar")

Measured on `…d5` at 1440×900 on the production standalone, settled + network-quiet origin, over the same 30-step walk `lens-cls.spec.ts` uses (pre-D-B49-hoist; the hoist moves three query hooks up a level and does not add or remove DOM, so this figure is not expected to move materially, but phase C re-confirms it):

| | |
|---|---|
| DOM nodes | 1,550 |
| Region roots / full / passed | 6 / 6 / 6 |
| `scrollHeight` | 10,750px |
| Frame samples (rAF→rAF) | 802 |
| p50 / **p95** / p99 / max frame | 8.3 / **10.2** / 11.7 / 22.6 ms |
| Main-thread blocking (LoAF/longtask >50ms) | 0ms across 0 events |
| JS heap used / limit | 28.0 MB / 3,585.8 MB |
| Supabase requests during the census scroll | 0 |

**p95 = 10.2ms, under the 16.7ms line. The `content-visibility` deletion (D-B33) stands on evidence, not a guess** — the OD-4 candidate (a per-root `contain-intrinsic-size: auto <measured px>`, or `content-visibility: hidden` with a hand-rolled reserve — the latter disallowed outright) reopens only if a re-measure exceeds 16.7ms. Final, ledger-official figure for this build: **DOM 1,550 nodes · `scrollHeight` 10,750px · 802
sampled frames · p50 8.3ms / p95 10.2ms / p99 11.7ms / max 22.6ms · 0ms main-thread blocking across
0 long-frame events · JS heap 28.0 MB of a 3,585.8 MB limit · 0 Supabase requests during the
census** (`…d5` at 1440×900, production standalone, settled + network-quiet origin, the same 30-step
walk `lens-cls.spec.ts` uses; instrument `e2e/census/lens-cost-census.spec.ts`, outside the
`e2e/document` basket by design and asserting nothing about the product).

⚠ The instrument's first draft counted only `long-animation-frame` / `longtask` entries, which fire
at 50ms; it reported `frameSamples: 0` and therefore `p95: 0`, which reads as "instant" and is worth
nothing against a 16.7ms line. It now samples every rAF-to-rAF delta and asserts `frameSamples > 30`,
so a census that measured nothing fails loudly instead of printing a flattering zero.

---

## Debts carried into the next lane

- **D-B41 — the TLS WebKit ship-bar run.** OWED. Kody's one-time `mkcert -install`, then the two-engine ship-bar run above.
- **D-B44 — the per-stop margin-note anchor.** A note captured while reading a stop cannot record that stop today (`margin_notes.anchor_id` is a `uuid`; no column can carry a `DocumentIndexKey`); every note files under `THE WHOLE JOB` and prints `ABOUT THE WHOLE JOB` (W5-R6, never `BESIDE <STOP>`, which would claim an anchor the row cannot keep). **Owed, post-I152, the program's first schema change:** `margin_notes.anchor_key text` (checked against `DocumentIndexKey`) plus the `margin_items` view branch and `use-margin-sheet.ts`'s grouping.
- **D-B33's render-cost claim.** RATIFIED on evidence (p95 10.2ms, well under 16.7ms) — not reopened. The census above is pre-D-B49-hoist; phase C's job is to confirm the number holds, not to re-litigate the ruling.
- **The `/desk` `welcome-modal-overlay` defect** — a real, reproducible pointer-event-eating `aria-hidden="true"` overlay on the direct `/desk → click` path (help-system's first-signin tour); pre-existing, unrelated to any lens file, still unfixed.
- **D-B5 — `estimated_hours`' editor unreachable** since the `PHASES` fold's Wave-1 deletion; still open, owed a re-home in the schedule region.
- **The readiness RPC fan-out** (D-B28) — one `get_project_ffe_readiness` round-trip per FF&E line at concurrency 8; confirmed pre-existing, logged not owned. Distinct from D-B49's `project_time_entries` finding, which **is** owned and specified.
- **Review nits, three passes deep, none gating.** W3-fix pass-2: **N2-01…06** (the damage-window carrier date can't rank; a client-side nav mislabels the 390 telemetry tier; `sense`/`tier` can disagree on a due-today deadline; the short form's day-count grammar doesn't distinguish past/ahead; two stale comments; a rare announcement pre-empt window). W4 correctness, first pass: **W4-N-01…13** (mostly closed in the fix-3 lane; two dead-symbol nits, one CSS-scope-gate glob nit, a `boundingBox()` site D-B35's fix missed, a real narrow-reachability disclosure bug in `previous-work.tsx`). W4 correctness, third pass (**W4F3**, after the D-B46 resolution-gate rewrite): 18 findings, 16 closed with real falsifiers; **W4F3-05** (the resolution cascade isn't freeze-aware) and **W4F3-08** (no per-root guard above the frame top) remain open, both bounded (neither can move a pixel above the frame). W4 fix-3's own new findings: **P2-01…08**, of which **P2-01** (an `aria-busy` region that never clears may suppress its own sr-only announcement) is the one worth taking soon. W5 correctness, second pass: **W5F2-01…03** (a stage-derivation mode mismatch between the hosted strip and the head/rail; a tautological jest twin; fix-log/docstring drift), plus the narrowed residual **W5F-03**. All are named here so none is rediscovered as new.
- **Kody's signed-in prod walk** — owed after the real deploy (ruling 7); no session before ship.
- **The one unattributed 403 resource** on `…d5` at 1440/1280 (not 390) — named by the W6 lane at phase C; not attributable to any lens file by the evidence gathered so far.


*Entries add: I152 · last id = I152*
