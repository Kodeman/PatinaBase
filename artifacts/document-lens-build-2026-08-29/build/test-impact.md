# Test impact — The Smart Lens build

Disposition of every test file touched by the program, by wave/lane. Verbatim from the ratified proposal's test-impact review; not re-derived.

## Named by the proposal

| # | File | Disposition | Wave-Lane |
|---|---|---|---|
| 1 | `src/components/document/__tests__/job-ticket.test.tsx` | DELETE whole (541 lines) | W3-L2 |
| 2 | `src/app/(document)/doc/[id]/page.test.tsx` | REWRITE: `:1225-1234` mounted list → six keys (W2-L5 verifies, W3-L2 owns); `:1243-1411` ticket describe → band (`:1351-1358`, `:1361-1382` survive as rename to `[data-lens-band]`); `:1458/:1488/:1534` → band line-2 region; `:1583-1605` → `deriveTicket`. EXTEND with the W0 mount-order test | W0-L1 / W3-L2 / W5-L2 |
| 3 | `src/components/document/__tests__/responsive-document-shell.test.tsx` | REWRITE `:185-195`, `:213-221` (W1-L4); `:655-690`, `:692-750` (W3-L5); SURVIVE `:197-211`, `:308-320` | W1-L4 / W3-L5 |
| 4 | `src/components/document/doc-spine.test.tsx` | `:26-28` dies, `:25` survives, `:14-19` survives (W1-L1); `:31-47` rewrite (W2-L1); delete the dead `jest.mock('./spine-timer')` at `:5` (W1-L1) | W1-L1 / W2-L1 |
| 5 | `src/components/document/__tests__/shelved-spine.test.tsx` | `:82-98`, `:217-236`, `:238-262` (W2-L1); `:155-197` six/four now, `:178-186` pre-work `[]` (W5-L2); `:188-196` survives | W2-L1 / W5-L2 |
| 6 | `src/components/document/region/__tests__/use-region-fold.test.tsx` | `:38-41` → `'open'` + density (W3-L3); `:43-70` survives; EXTEND scroll-never-writes / explicit-outranks / range `{quiet,full}` (W4-L1) | W3-L3 / W4-L1 |
| 7 | `src/components/document/mobile/mobile-timer-sheet.test.tsx` | `:247-257` → mobile bar owns the timer doorway; no `[data-spine-timer-regime]` | W1-L3 |
| 8 | `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts` | `:19` DELETE; `:25-27` widen to `{0,1200}`; `:15-17`, `:21-23`, `:24` survive; replacement mount-order test in page.test | W0-L1 |
| 9 | `src/lib/document/__tests__/contrast.test.ts` | `RAIL_FILES :327-333` → glob (+ ≥5 files assertion), offender grep `:334-338` widened; `lens-band.tsx` scanned against paper grounds in a second list | W0-L1 |
| 10 | `e2e/document/quiet-responsive-shell.spec.ts` | `+landing case` (W0-L1); `:223-228` 55–57→135–137 (W1-L4); `:165` (W2-L5); `:173-176`, `:183-186`, `:190-196` (W3-L5); find-in-page @s3 chromium+webkit (W4-L4); SURVIVE `:200-215`, `:230-243`, `:251-253` | W0-L1 / W1-L4 / W2-L5 / W3-L5 / W4-L4 |
| 11 | `e2e/document/quiet-release-contracts.spec.ts` | `:105-118` → 136; `:169-299` DELETE whole → one test "drawer is the sole timer doorway at 1440/1280/390, `[data-spine-timer-regime]` count 0"; SURVIVE `:152-158`, `:348-400`; note `:15` `SEEDED_PROJECT_ID`=d1 | W1-L4 |

## Unnamed (blast radius)

| # | File | Disposition | Wave-Lane |
|---|---|---|---|
| 12 | `src/components/document/worktable/__tests__/table-composition.test.tsx` | all 8 `[data-job-ticket]` sites incl. the local stub `:48` → `data-lens-band` | W3-L5 |
| 13 | `worktable-speccing.test.tsx` | `:553/:559` | W3-L5 |
| 14 | `worktable-delivery.test.tsx` | `:350-360` | W3-L5 |
| 15 | `worktable-finalize.test.tsx` | `:577-581/:617`; `:575` survives | W3-L5 |
| 16 | `paper-order.test.tsx` | `:298-306` + `:310` `lastRegion` → `record` (W2-L5); `:288-297`, `:308-317` self-referential survive | W2-L5 |
| 17 | `worktable.test.tsx` | `:316-323` lastRegion → `record` | W2-L5 |
| 18 | `__tests__/rail-stock.test.ts` | survive; EXTEND scan `spine/lens-ladder.tsx` | W2-L5 |
| 19 | `src/hooks/__tests__/use-document-running-index.test.tsx` | survive; EXTEND late-mount attach | W2-L2 |
| 20 | `commercial/money-region-seam.test.tsx` | `:98-125` survive; EXTEND identity across quiet→full + `SEAM_CLEARANCE` → `--doc-landing-clear` | W3-L3 / W4-L2 |
| 21 | `schedule/__tests__/ffe-region-head.test.tsx` | `:190-195` survive; EXTEND quiet head | W4-L2 |
| 22 | `ffe-install-care-head.test.tsx` | `:193-219` SURVIVE (verify W2) | W2 (verify) |
| 23 | `__tests__/section-stage-line-mount.test.tsx` | SURVIVE | — |
| 24 | `lib/document/__tests__/section-stage-line.test.ts` | SURVIVE | — |
| 25 | `lib/document/__tests__/shadow-gate.test.ts` | SURVIVE, run every wave | every wave |

Named survivor, untouched: `lib/document/__tests__/ticket-derivation.test.ts`.

| 26 | `e2e/document/margin-handoffs.spec.ts` | `:156` REWRITE → the lens (band line 2 `data-lens-line2-kind="standing"`, then the standing sheet row `data-standing-tier="overdue"` + act `Chase the approval`; pins `#document-next-up` = 0 and `section[aria-label="Needs attention"]` = 0). `:176` stays `test.fixme`, selector re-pointed to `[data-standing-row] [data-action-key]`. Second supersession — see D-B25. | **W3-fix** (owner) |

## New files

| Wave | File |
|---|---|
| W2 | `src/components/document/spine/__tests__/lens-ladder.test.tsx` |
| W3 | `src/components/document/__tests__/lens-band.test.tsx` |
| W3 | `e2e/document/lens-band-height.spec.ts` |
| W4 | `src/hooks/__tests__/use-lens-density.test.tsx` |
| W4 | `e2e/document/lens-density.spec.ts` |
| W4 | `lens-cls.spec.ts` |
| W4 | `lens-reduced-motion.spec.ts` |
| W4 | `lens-a11y.spec.ts` |
| W4 | `lens-contrast.spec.ts` |
| W4 | `lens-rail-budget.spec.ts` |
| W4 | `e2e/helpers/lens.ts` |
| W4 | `e2e/document/lens-fixtures.ts` |

## Browser ruling

- New lens specs run chromium + webkit.
- `lens-cls`, `lens-contrast`, `lens-rail-budget` run chromium only.
- Firefox: `test.skip` with a stated reason, following the idiom at `e2e/header/global-header.spec.ts:28-32`.

## Jest pitfalls

- `jest.mock` path-alias no-op: `@patina/help-system` is missing from `moduleNameMapper` — mock the relative importer instead.
- `@portabletext/react` is ESM — mock the leaf.
- jsdom has no `:has()`.
- jsdom does no layout — never assert geometry in jest.
- The global IntersectionObserver mock never fires (`jest.setup.js:48-56`) — use a capturing mock.
- `MutationObserver` is async — await a flush.
- `matchMedia` is false-by-default; `useSyncExternalStore` fakes at `responsive-document-shell.test.tsx:139-171/:523-540` are keyed on `'1440px'`.
- Use a fresh `QueryClient` per render.
- Density attributes are written imperatively — flush rAF then read the DOM.
- `fs.readFileSync` source contracts are green-until-they-aren't.
- `LensBand` latches line 2 through a `LENS_TURN_OUT_MS` (90ms) timeout
  (`lens-band.tsx:33/:78`) — the old line stays mounted while the new one turns
  in. A synchronous read after a model change still sees the previous text;
  read line 2 with `waitFor` (or advance fake timers past 90ms) before
  asserting.
- `care-band.tsx` has **FIVE** index-root branches, not four: W2 added the
  `!isProjectOwner` branch (`:254`, `:282`, `:303`, `:319`, `:374`, all
  spreading one `indexRootAttrs`). A contract asserted on the care root has to
  be asserted five times.

## Jest arithmetic

### The authoritative table — re-derived at W6 (audit drift 2, CLOSED)

The W6 architect audit found the per-wave deltas below did not sum to the measured steps ("W4 lists
+56 but the tip moved 5357→5474 = +117; W5 lists +75 but moved +129 — the difference is the fix
lanes' tests, unattributed") and owed W6 a re-derivation from `npx jest src --ci --json` **on each
merged sha of `document-lens/integration`'s own first-parent history**, so Σ = final − 5170.

Every row below was measured that way, in one worktree
(`.codex/worktrees/agent-lens-w6-base`, checked out detached at each sha and bootstrapped with
`npx turbo build --filter=@patina/designer-portal^...` before each run, so no api-routes-dist
artefact is in any figure). The `main` baseline **reproduces 458 / 5170 exactly**.

| step | merge sha | suites | tests | Δ suites | Δ tests |
|---|---|---|---|---|---|
| `main` baseline | `dab057537` | 458 | **5170** | — | — |
| W0 — docs, tripwires, seed, e2e baseline | `690337f1a` | 458 | **5173** | +0 | **+3** |
| W1 — the rail earns its column | `7c8b33e39` | 458 | **5201** | +0 | **+28** |
| W2 — the ladder | `e6da8bd76` | 461 | **5283** | +3 | **+82** |
| W3 — the lens line | `4915583c2` | 464 | **5357** | +3 | **+74** |
| W3 fix lane | `0a03b4af9` | 465 | **5418** | +1 | **+61** |
| W4 — density, one direction | `eee60fcb0` | 470 | **5531** | +5 | **+113** |
| W5 — the pre-work spreads | `99cc6d135` | 475 | **5613** | +5 | **+82** |
| W4 fix-3 lane | `d2110d1bd` | 475 | **5634** | +0 | **+21** |
| W6 prep (ship-bar config, rail attrs) | `07132237f` | 475 | **5635** | +0 | **+1** |
| W6 wiring 1 (the owed W4 minors) | `8f2d243dd` | 475 | **5643** | +0 | **+8** |
| W5 fix lane | `f933ba207` | 476 | **5669** | +1 | **+26** |
| W6 wiring 2 (the owed W5 carries) | `975fdf6b7` | 476 | **5669** | +0 | **+0** |

**Σ = +499 tests (5669 − 5170) and +18 suites (476 − 458).** Both close exactly.

Three notes the table would otherwise hide:

- **The fix lanes are now their own rows** — that is the whole of the audit's finding. W3's fix
  lane is **+61** (its largest: `lens-band-derivation.test.ts` +32 and `lens-band.test.tsx` +10,
  plus `letterhead-instruments.test.tsx` as a new 6-test suite and `table-composition.test.tsx`
  **−4**); W4's fix-3 lane **+21**; W5's fix lane **+26** (`mobile-sheets.test.tsx` +9,
  `letterhead-vitals.test.tsx` +7, `page.test.tsx` +6, new `prework-region.test.tsx` +6 and
  `margin-groups.test.ts` +4, against `mobile-margin-chips.test.tsx` **−6 and −1 suite** — D-B45
  deletes suite and component together — and `use-margin-sheet.test.ts` **−5**).
- **The earlier prose under-counted W4 and W5** because it priced only what the lanes declared.
  Measured on integration's own shas, W4 is **+113** (not +56) and W5 is **+82** (not +75); the
  W4 figure absorbs the L2/L3 quiet-body suites and the integration lane's own `use-lens-state`.
- **A SIGSEGV, not a red.** The first `--json` run at `eee60fcb0` reported `1 failed` —
  `project-mood-boards.test.tsx`, `0` assertions, "A jest worker process was terminated … signal=
  SIGSEGV". A clean re-run of the same sha reads 470 / 5531, all green, and that is the figure in
  the table. Worth recording so the next person reading a one-off red at a merged sha checks the
  message before triaging code.

### Per-wave detail (as the lanes declared it, kept for its per-suite attribution)

- Baseline: 458 suites / 5170 tests.
- W0: **+3 tests**, 0 suites — measured 458 / 5173 on the merged wave (was
  declared +1; reconciled 2026-08-29 by W0-fix, per correctness X-1 /
  fidelity L1-8). The three:
  1. `src/app/(document)/doc/[id]/page.test.tsx` — "nests
     `[data-section-stage-line]` inside `[data-active-section]`" (the OD-9
     mount-order replacement, the one that was declared).
  2. `src/lib/document/__tests__/contrast.test.ts` — "resolves the rail file
     glob to at least the floor the ladder leaves standing".
  3. `src/lib/document/__tests__/contrast.test.ts` — "scans the paper-ground
     files (once they exist) against `--doc-paper`, not rail stock".
  W0-fix itself adds no test: it edits the two `contrast.test.ts` additions in
  place (glob exclusion + floor), so 5173 still holds.
- W3: **+3 suites net, +74 tests** — measured 464 / 5357 on the merged wave
  against W2's 461 / 5283 (reconciled 2026-08-29 by W3-int; the declared
  arithmetic was "−1 +1 = 0 suites", which counted only the two suites the
  proposal named and none of the three the lanes actually wrote).

  Suites (+4 new, −1 deleted):

  | Suite | Δ | Lane |
  |---|---|---|
  | `components/document/__tests__/lens-band.test.tsx` | NEW | W3-L1 |
  | `components/document/__tests__/standing-sheet.test.tsx` | NEW | W3-L1 |
  | `lib/document/__tests__/lens-band-derivation.test.ts` | NEW | W3-L1 |
  | `hooks/__tests__/use-lens-frame.test.tsx` | NEW | W3-L2 |
  | `components/document/__tests__/job-ticket.test.tsx` | DELETED | W3-L2 |

  Tests, delta by delta (every row measured from a `jest --json` run on
  `document-lens/integration@e6da8bd76` and on `document-lens/w3`):

  | Suite | Before | After | Δ | Lane |
  |---|---|---|---|---|
  | `lib/document/__tests__/lens-band-derivation.test.ts` | — | 33 | **+33** | L1 |
  | `components/document/__tests__/lens-band.test.tsx` | — | 22 | **+22** | L1 |
  | `components/document/__tests__/standing-sheet.test.tsx` | — | 6 | **+6** | L1 |
  | `components/document/document-guide.test.tsx` | 7 | 9 | +2 | L1 |
  | `hooks/__tests__/use-lens-frame.test.tsx` | — | 9 | **+9** | L2 |
  | `components/document/__tests__/job-ticket.test.tsx` | 21 | — | **−21** | L2 |
  | `app/(document)/doc/[id]/page.test.tsx` | 64 | 68 | +4 | L2 |
  | `components/document/__tests__/call-sheet-doorways.test.tsx` | 19 | 16 | **−3** | L2 |
  | `components/document/doc-letterhead.test.tsx` | 4 | 6 | +2 | L2 |
  | `components/document/region/__tests__/use-region-fold.test.tsx` | 12 | 18 | +6 | L3 |
  | `components/document/__tests__/ffe-section-life.test.tsx` | 21 | 24 | +3 | L4 |
  | `components/document/care-band.test.tsx` | 17 | 18 | +1 | L4 |
  | `components/document/previous-work.test.tsx` | 7 | 8 | +1 | L4 |
  | `components/document/region/__tests__/region-head.test.tsx` | 13 | 14 | +1 | L4 |
  | `components/document/schedule/__tests__/schedule-rule-region.test.tsx` | 7 | 8 | +1 | L4 |
  | `components/document/schedule/__tests__/schedule-spine-add-line.test.tsx` | 3 | 4 | +1 | L4 |
  | `components/document/approvals/project-approval-document.test.tsx` | 29 | 30 | +1 | L4 |
  | `components/document/__tests__/responsive-document-shell.test.tsx` | 15 | 16 | +1 | L5 |
  | `components/document/approvals/approvals-region-head.test.tsx` | 3 | 4 | +1 | L5 |
  | `components/document/commercial/money-region.test.tsx` | 20 | 21 | +1 | L5 |
  | `components/document/schedule/__tests__/ffe-region-head.test.tsx` | 13 | 14 | +1 | L5 |
  | `components/document/schedule/__tests__/schedule-region-head.test.tsx` | 7 | 8 | +1 | L5 |
  | **Total** | | | **+74** | |

  Not in the table, and deliberately so: `commercial/money-region-seam.test.tsx`
  gained the W3-int token-only-margin assertions inside two existing `it`s, so
  its count is unchanged (11 both sides).

  ⚠ **Baseline caveat.** A `jest --json` run in the
  `.codex/worktrees/agent-lens-integration` worktree reports **5277**, not
  5283: `@patina/api-routes` has no built dist in that worktree, so
  `api/media/boards/__tests__/background-removal-routes.test.ts` (5 tests) and
  `api/media/duplicates/__tests__/retained-proxy.test.ts` (1 test) fail to
  RESOLVE there and contribute 0. That is an environment artefact of the
  worktree, not a code delta; the +6 is added back to reach the true 5283, and
  both suites pass in the W3 worktree, which was bootstrapped with
  `pnpm turbo build --filter=@patina/designer-portal^...`.
- W4: **+2 suites, +56 tests** — measured 467 / 5474 on the merged wave against
  the W3 fix lane's 465 / 5418 (`document-lens/w3-fix@b6330afd4`, both runs
  `npx jest src --ci --json` in a worktree bootstrapped with
  `pnpm turbo build --filter=@patina/designer-portal^...`, so no
  api-routes-dist artefact is in either figure). The declared arithmetic was
  "+1 suite (`use-lens-density.test`)"; the second suite is the integration
  lane's own `use-lens-state.test`, which D-B19 priced to this lane after the
  plan was written.

  Suites (+2 new, 0 deleted):

  | Suite | Δ | Lane |
  |---|---|---|
  | `hooks/__tests__/use-lens-density.test.tsx` | NEW | W4-L1 |
  | `hooks/__tests__/use-lens-state.test.tsx` | NEW | W4-int |

  Tests, delta by delta:

  | Suite | Before | After | Δ | Lane |
  |---|---|---|---|---|
  | `hooks/__tests__/use-lens-density.test.tsx` | — | 15 | **+15** | L1 |
  | `hooks/__tests__/use-lens-state.test.tsx` | — | 9 | **+9** | W4-int |
  | `components/document/schedule/__tests__/ffe-region-head.test.tsx` | 14 | 21 | +7 | L2 |
  | `components/document/commercial/money-region.test.tsx` | 21 | 27 | +6 | L2 |
  | `components/document/approvals/approvals-region-head.test.tsx` | 4 | 9 | +5 | L2 |
  | `components/document/care-band.test.tsx` | 18 | 22 | +4 | L3 |
  | `components/document/schedule/__tests__/schedule-region-head.test.tsx` | 8 | 12 | +4 | L3 |
  | `components/document/previous-work.test.tsx` | 8 | 11 | +3 | L3 |
  | `components/document/region/__tests__/use-region-fold.test.tsx` | 18 | 21 | +3 | L1 |
  | **Total** | | | **+56** | |

  Not in the table, and deliberately so: the four suites that gained a
  per-suite `jest.mock('@/hooks/use-lens-density', …)` in the wiring commit —
  `shelves/__tests__/spec-book-leaf.test.tsx`,
  `__tests__/ffe-section-spec-details-link.test.tsx`,
  `schedule/__tests__/ffe-release-lift.test.tsx`,
  `schedule/__tests__/ffe-section-trade-lines.test.tsx`. Each mounts a region
  with no page to attach the lens, so every stop rendered its quiet form and
  the bodies those cases assert were absent; the mock is the lens saying
  `full`, and none of them gained or lost a case. `page.test.tsx` recovered on
  its own the moment `page.tsx` attached the hook — jsdom's rects are all 0, so
  discovery's `rect.top <= innerHeight + 240` promotes every root in the
  layout effect (D-B15/D-B16) — and is unchanged at 68.

- **W4-L3's stop root — a plan error, corrected.** The program plan names
  `schedule-rule-region.tsx` in W4-L2/L3's "six quiet bodies". It is not a stop:
  it carries no `[data-index-region]` root (its fold key `schedule-rule` is one
  of OD-10's three non-stop keys, always `full`). The schedule stop's root is
  `schedule/schedule-spine.tsx`, which is what W4-L3 gave the quiet form, and
  `schedule-rule-region.tsx` keeps only the fix lane's `cause={fold.cause}`.

- **D-B27 · the FF&E region forces `full` on install/care and during the
  release ceremony.** `useRegionFold({ …, forceOpen: mode !== 'project' ||
  selecting })` on the `ffe` key, because those postures render no `RegionHead`
  and so have no `exceptions` to derive a quiet form or its reserve from. No
  behaviour changes; covered by `ffe-region-head.test.tsx`.

- W5: **+5 suites, +82 tests** — measured **475 / 5610** on the merged wave
  against the W4 tip's **470 / 5528** (`document-lens/w4@4f803118b`; both runs
  `npx jest src --ci --json` in `.codex/worktrees/agent-lens-w5-int`,
  bootstrapped with `pnpm turbo build --filter=@patina/designer-portal^...`, so
  no api-routes-dist artefact is in either figure). The three lanes declared no
  arithmetic between them; this is it.

  Suites (+5 new, 0 deleted):

  | Suite | Δ | Lane |
  |---|---|---|
  | `components/document/brief-section.test.tsx` | NEW | W5-L2 |
  | `components/document/proposal-blocks-readonly.test.tsx` | NEW | W5-L2 |
  | `components/document/mobile/mobile-sheets.test.tsx` | NEW | W5-L3 |
  | `components/document/mobile/mobile-margin-chips.test.tsx` | NEW | W5-L3 |
  | `hooks/__tests__/use-margin-sheet.test.ts` | NEW | W5-L3 |

  Tests, delta by delta:

  | Suite | Before | After | Δ | Lane |
  |---|---|---|---|---|
  | `app/(document)/doc/[id]/page.test.tsx` | 72 | 87 | **+15** | L1 +10 · L2 +5 |
  | `components/document/mobile/mobile-sheets.test.tsx` | — | 13 | **+13** | L3 |
  | `hooks/__tests__/use-margin-sheet.test.ts` | — | 11 | **+11** | L3 |
  | `components/document/proposal-blocks-readonly.test.tsx` | — | 9 | **+9** | L2 |
  | `components/document/mobile/mobile-margin-chips.test.tsx` | — | 6 | **+6** | L3 |
  | `lib/document/__tests__/lens-ladder-derivation.test.ts` | 22 | 28 | +6 | L1 |
  | `components/document/brief-section.test.tsx` | — | 5 | **+5** | L2 |
  | `components/document/mobile/mobile-bar.test.tsx` | 24 | 28 | +4 | L3 |
  | `components/document/discovery/discovery-section.test.tsx` | 3 | 6 | +3 | L2 |
  | `lib/document/__tests__/document-index.test.ts` | 14 | 16 | +2 | L1 |
  | `components/document/spine/__tests__/lens-ladder.test.tsx` | 31 | 32 | +1 | L1 |
  | `components/document/section-loading-line.test.tsx` | 5 | 10 | +5 | L2-fu |
  | `components/document/commercial/authorizations-ledger.test.tsx` | 11 | 12 | +1 | L2-fu |
  | `components/document/schedule/__tests__/ffe-region-head.test.tsx` (D-B39) | 22 | 23 | +1 | L2-fu |
  | **Total** | | | **+82** | |

  The last three rows are **W5-L2's follow-up** (`b66c5cb0b`, D-B39/W5-R3 —
  `SectionLoadingLine`'s `inline` variant at six sites, so the readiness
  skeleton's exit changes no box), merged as `4f5291a63`: +7 tests, 0 suites
  (`section-loading-line.test.tsx` already existed at the W4 tip and was
  extended, not created). Measured 475 / 5610 against 475 / 5603.

  `page.test.tsx`'s +15 splits L1 +10 (four `.each` "mounts exactly the stops
  the index declares" cases, four `.each` "every stop prints a region head"
  cases, `NOTHING YET`, and the stage-stop names) and L2 +5 (the four
  re-parenting cases of W5-R2 item 1 plus the direction spread's unfiltered
  case).

  Not in the table, and deliberately so: `worktable-finalize.test.tsx` was
  edited by both L1 and L3 and `paper-order` / `worktable` /
  `worktable-delivery` / `worktable-finalize-once` / `worktable-speccing` by
  L3 — every one of them gained only a `jest.mock('@/hooks/use-margin-sheet')`
  or a re-pointed mount assertion inside an existing `it`, so none moved a
  count. `stage2-approval-cutover-contract.test.ts` and
  `handoffs-in-margin-contract.test.ts` likewise re-point their source regexes
  (`<MobileMarginChips` → `<FolioLetterhead`; `useHandoffGates` on
  `mobile-margin-chips.tsx`/`mobile-sheets.tsx` → on `use-margin-sheet.ts`)
  without changing case counts.

- **The one merge artefact, fixed in the wiring commit.** W4's own
  `components/document/__tests__/mobile-sheets.test.tsx` (the D-B18 press-order
  suite, 2 cases) mocks `@patina/supabase` with an explicit factory. W5-L3's
  `useMarginSheet` — now called from `mobile-sheets.tsx` — reads
  `useProjectFFEItems` from that package to name a line-anchored row's own
  line, and the factory did not export it, so both cases threw
  `TypeError: (0 , _supabase.useProjectFFEItems) is not a function`. The
  factory gains `useProjectFFEItems: () => ({ data: [] })`. No case count
  moves; nothing else in the basket was red.

- **D-B39's three merge conflicts, and how they were resolved.** W5-L2's
  follow-up branches from `a13acb16c` (the w4-l4 merge), not from W4's tip, so
  it collided with the W4 close commits in three files. All three kept both
  sides:
  - `ffe-section.tsx:1381` and `schedule/schedule-spine.tsx:1147` — W4-R1's
    quiet-status ternary (`ffeQuiet ? ffeQuietStatus : ffeStatus`,
    `density === 'quiet' ? scheduleQuietLine : scheduleStatus`) versus the
    follow-up's fragment carrying the inline `SectionLoadingLine`. Resolved by
    wrapping the ternary INSIDE the fragment: W4-R1 still governs which line
    prints, D-B39 still governs how the pulse rides it (inline, inside the
    same `<p>`, so its exit moves no box), and both hold at either density.
    This matters: the D-B39 case in `ffe-region-head.test.tsx` runs under
    `__setDensityForTest(null)` — i.e. at QUIET — so attaching the pulse only
    to the full arm would have failed it.
  - `ffe-region-head.test.tsx:370` — the follow-up's `mockLensDensity = null`
    is the pre-W4-close mocking regime and that variable no longer exists;
    W4's `act(() => __setDensityForTest(null))` is kept, with the follow-up's
    new `mockReadinessLoading = false` beside it.

- **D-B30 in its W5-R1 form (`design/deviations.md:60`,
  `design/reconciliation.md:270`).** The letterhead `MobileMarginChips` mount
  is deleted from `page.tsx` and the line-anchored branch prints nothing below
  980 (`useBelow980` in `mobile-margin-chips.tsx`); the Margin sheet carries
  the whole margin, grouped `THE WHOLE JOB` above `BESIDE PIECES`. The W3-fix
  allowance comment (`// D-B30: net of MobileMarginChips until W5-L3`) is
  **deleted** from `e2e/document/lens-band-height.spec.ts` at this integration
  and every 390 first-head assertion in that file is now **gross** against
  W3-R7's ≤435, with `[data-mobile-margin-chips]` count 0 asserted as the
  retirement's falsifier in all three cases that touch 390. The W5 e2e basket
  gains `mobile-margin-sheet.spec.ts` (L3), `prework-regions.spec.ts` (L2) and
  the pre-work cases in `workflow-stage-responsive.spec.ts` (L2).

## Carried nits (ledger rows, no code) — W3 review pass 2

- **N2-01** — the `damage` tier ranks as a silence: `damage_claim` is not one of
  the six desk kinds that set `dueOn` and its template states no date, so a
  carrier window can never rank on when it closes. `lens-band-derivation`'s
  "puts a window closing tomorrow above a decision due weeks out" case supplies
  a `dueOn` the desk does not emit — the sort it exercises is right, the input
  is aspirational. Not a defect of any lane: no source field holds a claim
  window's close date. Into I152.
- **N2-03** — `deadlineOf` derives `sense` from the sign of the distance, so an
  `overdue`-tier need due TODAY returns `{ sense: 'ahead', distance: 0 }` and
  `shortState` drops the `OVERDUE` word. Unreachable today (the desk's overdue
  predicates are strictly past), reachable the first time a rule is written
  with `<=` or a timezone puts the boundary a few hours out.
- **N2-04** — `short.days = Math.abs(distance)`, so a window closing in one day
  prints `CLAIM OPEN 1D` in the same grammar as `OVERDUE 7D`. The mockup's word
  for the ahead case is `CLOSES TOMORROW`. The design lead's call; unreachable
  today for N2-01's reason.
- **N2-06** — C-11's clear keys on `printedWords`, so when a stop change and a
  genuine line-2 change coincide the `Now at …` text stands for about one turn
  before it is wiped. Rare (line 2 is derived independently of the reading
  stop) and the atomic re-read still speaks the sentence.

## W6 integration, phase A — the two merges and the wiring commit (2026-08-30)

Measured with `npx jest src --ci --json` in four worktrees, each bootstrapped with
`npx turbo build --filter=@patina/designer-portal^...` so no api-routes-dist artefact
is in any figure. Suites: **475 at every step** — nothing added or deleted a suite.

| step | sha | suites / tests | Δ tests |
|---|---|---|---|
| integration, before the merges | `99cc6d135` | 475 / **5613** | — |
| + `document-lens/w4-fix3` | `a364817e3` | 475 / **5634** | **+21** |
| + `document-lens/w6-prep` | `28d0cc828` | 475 / **5614** (measured on its own base) | **+1** |
| + the W6 wiring commit | integration tip | 475 / **5643** | **+8** |

5613 + 21 + 1 + 8 = **5643**. Delta by delta, per suite:

| Suite | Before | After | Δ | Lane |
|---|---|---|---|---|
| `hooks/__tests__/use-lens-density.test.tsx` | 27 | 39 | **+12** | w4-fix3 |
| `components/document/mobile/mobile-bar.test.tsx` | 28 | 32 | **+4** | w4-fix3 |
| `components/document/section-loading-line.test.tsx` | 10 | 14 | **+4** | w4-fix3 |
| `components/document/mobile/mobile-sheets.test.tsx` | 13 | 14 | **+1** | w4-fix3 |
| `components/document/spine/__tests__/lens-ladder.test.tsx` | 34 | 35 | **+1** | w6-prep (the `data-rail-label`/`-value` stamps) |
| `hooks/__tests__/use-lens-density.test.tsx` | 39 | 41 | **+2** | W6 wiring (the resolution store) |
| `app/(document)/doc/[id]/page.test.tsx` | 87 | 89 | **+2** | W6 wiring (P2-07, `landOnFfeAnchor`) |
| `components/document/previous-work.test.tsx` | 12 | 14 | **+2** | W6 wiring (D-B46's React half) |
| `components/document/section-loading-line.test.tsx` | 14 | 16 | **+2** | W6 wiring (P2-01) |
| **Total** | | | **+30** | |

### D-B49 · the query-hook census under every `[data-index-region]` body (W6)

The ARCHITECT's rule: **a region's data hooks live at its ROOT** (mounted at every density);
bodies read props or cache. `staleTime` alone was rejected — it hides the mount rather than moving
it, and the next hook added would reintroduce the defect silently.

Method: every `use[A-Z]…(` call in each region-root file and in the components that mount **only**
inside a promoted body, intersected with the 988 exported hook names under
`packages/supabase/src/hooks` + `apps/designer-portal/src/hooks`. Mutations are listed but are not
offenders — a mutation hook issues no request until it is called.

**Region roots — correct by construction** (the root renders at quiet and at full, so its reads
happen once, before any promotion):

| root | file | read hooks |
|---|---|---|
| `ffe` | `ffe-section.tsx` | `useProjectFFEItems`, `useProjectInstruments`, `useProjectFfeReadiness`, `useDocumentRooms`, `useProjectOwnedBoards`, `useFfeInvoiceCoverage`, `useProjectBillingAuthority`, `useTradeScopes` **+ the three hoisted here** |
| `schedule` | `schedule/schedule-spine.tsx` | `useDesignerClientForClientUser`, `useCoordinationItems`, `useProjectParties`, `useSectionTasks`, `useProjectFFEItems`, `useResolvedSchedule`, `useProjects`, `useProjectPhaseCounts`, `useScheduleProposals` **+ `useScheduleRevisions` hoisted here** |
| `approvals` | `approvals/project-approval-document.tsx` | `useProjectApprovals`, `useProjectApprovalArtifactCandidates`, `useProjectDecisionAuthority` |
| `money` | `commercial/money-region.tsx` | `useMoneyLadder`, `useAccountPage` |
| `care` | `care-band.tsx` | `useProjectPhases`, `useCoordinationItems`, `useScopeChangeRequests`, `useProjectFFEItems`, `useFfeInvoiceCoverage`, `useProjectPaymentMilestones`, `useProjectInvoices` |
| `record` | `previous-work.tsx` | none (`useLensDensityStore`/`useLensResolved` only) |
| pre-work | `prework/prework-region.tsx` | none |

**Body-only components — the offenders, and what was done:**

| file | read hooks | verdict |
|---|---|---|
| `work-block.tsx` (FF&E body) | `useSectionTasks`, `useSectionGates`, `useSectionLoggedMinutes` | **HOISTED** to `ffe-section.tsx`; props. `useSectionLoggedMinutes` is the one the gate actually caught — it is the only read of the three with no other observer anywhere on the page, so it was the only one that produced a request. |
| `coordination/coordination-work.tsx` (schedule body) | `useSectionTasks`, `useProjectParties` | **HOISTED** — both were already read at the schedule root (`:190`, `:191`); the body now takes them as props, so its mount adds no observer. |
| `schedule/revision-ledger.tsx` (schedule body) | `useScheduleRevisions` | **HOISTED** to the schedule root. |
| `coordination/coordination-band.tsx` | `useCourtSummary`, `useDesignerClientForClientUser`, `useCoordinationItems`, `useProjectParties`, `useSectionTasks`, `useProjectFFEItems`, `useProjectPhases` | **NOT an offender — the component is never mounted.** `grep -rn '<CoordinationBand'` returns nothing outside its own file. Left as-is and recorded; deleting an unmounted component is not this lane's call (the FID-09 precedent). |
| `folio-strip.tsx` (FF&E body, and elsewhere) | `useFolioFiles`, `useProposalFolioFiles` | **LEFT, deliberately.** `FolioStrip` mounts at several anchors, not only inside a region body, so hoisting would change call sites outside the lens's scope — and empirically it fired **no** request in the measured 30-step walk. Named here so the next lane inherits the fact rather than rediscovering it. Owner: whichever lane next touches the folio. |

Test cost of the hoist: **+2 tests, 0 suites** (5669 → 5671). Eleven suites needed their mocks
extended — eight mount a region root with no `QueryClientProvider` (every other data hook is
already mocked, so the newly-hoisted three had to be too — the same idiom W4 used for
`use-lens-density`), two mock `@patina/supabase` partially and needed `useScheduleRevisions`, and
`work-block.test.tsx` now drives the block through props instead of through a hook mock, which is
precisely what the rule asks a body to do.

### Carried nits (ledger rows, no code) — W5 fix review pass 2

- **W5F2-02** — `lens-ladder-derivation.test.ts`'s twin for W5F-04 calls the pure `prework()`
  helper twice with identical arguments and asserts the two results match. A pure function
  returning the same output for the same input proves nothing about the defect, which was that the
  *input* changed when the strip mounted. The one load-bearing line is
  `expect(quiet.scope.value).toBe('CORE · STAGE 03 · 4 ROOMS')`, and the real proof is the e2e
  (`prework-regions.spec.ts:239-282`, which walks the promotion). Left as written rather than
  renamed mid-integration; the case is not false, only weaker than its name. Into I152.
- **Two observations from the same pass, no action.** `margin-rail.tsx` splits raised from settled
  by **object identity** over rows `partitionMargin` returns by reference — correct today, silently
  wrong the day that function maps or clones (a `Set` of `item_id` would be free).
  `section-stage-line.tsx:55` still calls `useId()` for a `headingId` that is unused when hosted.

### Carried nits (ledger rows, no code) — W4 fix-3 review pass 2

- **P2-02** — the `aria-busy` ratchet in `section-loading-line.test.tsx` is a FILE-level source
  grep: any file containing `aria-busy` anywhere satisfies it, so a new unguarded `animate-pulse`
  in `ffe-section`, `schedule-spine`, `mobile-bar` or `phase-advance-control` passes; it scans only
  `src/components/document`, not `src/app/(document)` or the packages the paper renders; and it
  pressures a *decorative* pulse toward adding `aria-busy`, which is the failure it exists to
  prevent. The element-level form (each register renders a node matching `LOADING_SELECTOR`) is
  already asserted separately, so the ratchet's only job is catching a NEW file — which is exactly
  the case it is weakest at. Left as a ratchet; into I152.
- **P2-05** — `use-lens-density.ts`'s `MAX_SYNC_DEPTH` cap ends the sampler chain rather than
  yielding, so in a synchronous-rAF environment a paper that is not stable within five frames
  leaves the lens permanently unresolved (until a 3,000ms timer fake timers may never advance) and
  a suite could assert quiet-everything and pass for the wrong reason. Unreached by any suite on
  this branch. Smallest fix if it is ever reached: schedule the next sample from
  `setTimeout(…, 0)` instead of returning.
- **P2-08** — `held` accepts `height === lastHeight` at `0`, so a paper that were boxless for three
  frames with no fetch and no register would resolve and the cascade would measure all-zero rects
  (`top: 0 ≤ innerHeight + 240`) and promote everything. Unreachable today — `<main>` carries
  `pt-8 pb-32` and is never `display:none` now that D-B33 removed `content-visibility` — but the
  guard that made it unreachable is gone, and this row is what records that.

## W6 owed — the webkit basket's boot and shape

- **Sharding rule (standing).** The webkit `e2e/document` basket runs **≤2 spec files per
  `npx playwright test … --project=webkit --workers=1` invocation**, after a CHROMIUM spec has
  opened the same papers (a `curl` of `/doc/<id>` returns 307 without compiling the authenticated
  page, so it warms nothing). Necessary, and NOT sufficient — see `e2e-baseline.md` "CLOSE run 4":
  a two-file shard that passed 25/25 as the first webkit invocation failed as the fourth.
- **Production-build run — DONE AT W4** (`e2e-baseline.md` "W4-int PROD run"), and it split the two
  disputed cells:
  - `quiet-responsive-shell.spec.ts:214` — **artefact, closed.** Green on prod/chromium (4.1s),
    green on dev/chromium, green on dev/webkit alone and in a 2-file group; red only in a
    dev/webkit basket. OD-4 green on prod/chromium too.
  - `lens-density.spec.ts:163` — **REAL DEFECT, owed to a fix lane.** `money` offsetTop moves −24px
    (7739 → 7715 on prod/chromium; 7735 → 7711 on dev/webkit): it reproduces across engine, server
    and build mode, so it is not a harness artefact. A root ABOVE the reader changes height on a
    scroll down-and-back-up, which is the H5 invariant D-B16 exists to protect.
  - **New, production-only:** `lens-band-height.spec.ts:109` — the band on the PRE-WORK paper at
    390 measures 55.9754638671875 against the declared 56 (long paper and other widths pass; the
    D-B35 layout-box instrument is already in use, so this is not the compositor read).
- **Serving a production build here (standing).** `next.config.js:627` is `output: 'standalone'`,
  so `next start` is wrong and says so; the standalone bundle ships without `.next/static` and
  `public`. Copy both into `.next/standalone/apps/designer-portal/` and run
  `node .next/standalone/apps/designer-portal/server.js`, then verify a real
  `/_next/static/chunks/*.js` returns 200 before trusting any run.
- **WebKit cannot sign in against the production build** (owed, W6): all 8 specs failed at their
  first test with `Authentication failed after 3 attempts` on the sign-in page's email button,
  ~48s each, while chromium authenticated 103 times against the same server. Until that is fixed
  the production build is not a usable webkit gate either.

A wave whose suite count moves without a written reconciliation does not merge.
