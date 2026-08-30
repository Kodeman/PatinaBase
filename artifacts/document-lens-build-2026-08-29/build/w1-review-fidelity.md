# W1 fidelity review — the rail earns its column

Reviewer: Sonnet, fidelity seat, W1. Read-only: `git diff 690337f1a...document-lens/w1-l{1..4}`, no checkout, no product edits. Compared against `program-plan.md` Wave 1, `technical-design.md` (OD-5, OD-9, OD-11, OD-15, OD-16, C-1), `reconciliation.md` (D-6, RF-02, RF-03, §10's 1280-head/arc ruling), `proposal.md` §4 "The spine"/"The margin", and `test-impact.md` rows 3/4/6/7/8/10/11. Every finding below is reported regardless of severity — none filtered.

## Verdict

```
┌─────────────────────────────────────────────────────────────────┐
│  VERDICT: SHIP-AFTER-FIXES                                       │
│                                                                   │
│  2 blocking findings (F-1, F-2) break the wave's own premise —   │
│  a "reserved, never measured" rail head that in fact overflows   │
│  at 1180–1439, and a rail head whose signature feature (the      │
│  household name) is never wired to the live page. Everything     │
│  else inspected (ownership, survivors, tokens, commits, the      │
│  margin RF-03 rules, OD-11 mobile bar, OD-5 regime literals) is  │
│  faithful to the design docs.                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Evidence table

| Area | Asked (doc) | Shipped | Verdict |
|---|---|---|---|
| Ownership, L1 | `doc-spine.tsx` + `studio-drawer.tsx` (matrix-allowed exception) | `doc-spine.tsx`, `doc-spine.test.tsx`, `spine-timer.tsx` (deleted), `studio-drawer.tsx` | ✅ within matrix |
| Ownership, L2 | `doc-letterhead.tsx`, `letterhead-vitals.tsx`, `margin-rail.tsx`, `margin-note.tsx` (program-plan prose) | + `margin-item.tsx`, `margin-item.test.tsx`, `margin-rail-stage2.test.tsx`, plus the 3 named files' `.test.tsx` companions | ⚠️ see F-8 (in-spirit, not in the literal list) |
| Ownership, L3 | `mobile-bar.tsx:230-231`, `mobile-margin-chips.tsx:98/:114`, `mobile-timer-sheet.test.tsx:250-257` | `mobile-bar.tsx`, `mobile-bar.test.tsx`, `mobile-margin-chips.tsx`, `mobile-shell.tsx`, `mobile-timer-sheet.test.tsx` | ✅ `mobile-shell.tsx` addition is the A-08 `readingIndex` type, correctly scoped |
| Ownership, L4 | `page.tsx:1763-1764`, `responsive-document-shell.test.tsx`, `quiet-responsive-shell.spec.ts`, `quiet-release-contracts.spec.ts`, `rail-stock.test.ts` (prose), `doc-spine.test.tsx:5` (prose) | `page.tsx` (1 hunk only), the 2 e2e specs, `responsive-document-shell.test.tsx` | ⚠️ see F-7 (plan-doc inconsistency, not a lane fault) |
| No cross-lane file collisions | "a file appears in exactly one lane per wave" | Verified — 0 overlap across the four `--name-only` sets | ✅ |
| No program-folder commits | — | `git diff --name-only` for all 4 lanes vs `artifacts/document-lens-build-2026-08-29/**` | ✅ clean |
| Commit form | Conventional Commits + co-author | All 4 lanes' commits (`feat(document): W1 — …`, one `style(document):` fixup) carry `Co-Authored-By: Claude Fable 5` | ✅ |
| Freeze list | `components/document/**` etc. frozen except program work; `use-document-running-index.ts`, `globals.css` untouched this wave | Confirmed 0 hits in all 4 diffs | ✅ |
| OD-5 regime literals | `page.tsx:1763` / `doc-spine.tsx:41` → `…-narrow-to-1439-…`, "compact" retired | Both literals match verbatim; test renamed "compact tier" → "narrow tier" | ✅ |
| Survivor: `doc-spine.test.tsx:14-19` | survives | Byte-identical | ✅ |
| Survivor: `doc-spine.test.tsx:25` vs `:26-28` | `:25` survives, `:26-28` dies | Exactly that | ✅ |
| Survivor: `responsive-document-shell.test.tsx:197-211`, `:308-320` | survive | Byte-identical (full-file diff confirms only 185-195/213-221 touched) | ✅ |
| Survivor: `quiet-release-contracts.spec.ts:152-158`, `:348-400` | survive | Byte-identical (full-file diff confirms only 115-117/169-298 touched) | ✅ |
| Non-Wave-1 files stay untouched | rows 6, 8 (`use-region-fold.test.tsx`, `stage2-approval-cutover-contract.test.ts`) belong to W3/W0 | Neither appears in any W1 lane's file list | ✅ |
| `rail-stock.test.ts` | prose says W1-L4 re-points it; test-impact.md assigns it to W2-L5 | Untouched by any W1 lane | ⚠️ F-7, consistent with test-impact.md, inconsistent with program-plan prose |
| OD-16 deletions | `spine-timer.tsx` deleted in W1 | Deleted, 210 lines removed, confirmed via `git diff --stat` | ✅ |
| C-1 signature | `DocSpineProps` gains `roomInHand?`, `onReleaseRoom?` | Both added exactly as typed | ✅ (type only — see F-2 for wiring) |
| Rail head reserved height | 100px "at every offset" (technical-design fixed numbers); reconciliation §10 later derives ~116px at 1280 given the wrapped arc | `min-h-[84px]` (1180–1439) / `min-[1440px]:min-h-[100px]` (≥1440) | ❌ F-1: neither number is honored and the box isn't tall enough for the unwrapped arc actually rendered (see F-1) |
| Arc at 1180–1439 | reconciliation §10 ruling (d): `flex-wrap`, 4+3 rows, `xs` marks, `min-h-6` per `li`, arc costs 48px | `<ul>` keeps baseline `flex-col` (vertical stack), `sm` marks, `min-h-11` per `<li>` — unchanged from `main` | ❌ F-1 |
| Household in the rail head | proposal §4 "2 · The rail head": prints `Vandersteen` at every offset; D-6 walker: "the rail head is mark · 40px title · household chip + stage plate" | `DocSpine` prints `household` when passed, but `page.tsx:1776-1781` never passes it (`row.client_name` available at that call site) | ❌ F-2 |
| Room-in-hand in the rail | C-1: `roomInHand`/`onReleaseRoom` on `DocSpine` | Same as above — never wired from `page.tsx` | ⚠️ noted in F-2, lower severity (expected pending Wave 2's `useRoomLens()`) |
| Timer eviction | evicted to `studio-drawer.tsx`, which "already prints `IN HAND TODAY`" | Confirmed pre-existing at baseline (`studio-drawer.tsx:490` `In hand today`); no new code needed, none added | ✅ |
| Presence eviction | proposal §4 verdict: "evicted to the drawer's account line (F137)" | Deleted from `doc-spine.tsx` outright; no account/presence line added anywhere in `studio-drawer.tsx`'s diff; `others` prop stays required-but-unread on `DocSpineProps` | ❌ F-3 |
| F03 fix | drawer's `Find anything` words overprint at 1280 | `studio-drawer.tsx`: `Find anything` → `hidden min-[1440px]:inline` | ✅ |
| D-6 vitals suppression | empty fields print nothing; row itself renders nothing if all three(+) are empty; `PHASES ▸` deleted | All implemented; `if (!phaseWord && !startDate && !targetDate && !bandSet && !totalSet) return null` | ✅ |
| D-6 letterhead `pb-5`→`pb-4` | "−4 → 18", cited as load-bearing for SC1's 148px subtotal | `doc-letterhead.tsx:52` still reads `pb-5` | ❌ F-4 |
| D-6 "Ships" vitals string | `OPENED 2026-03-02 · PHASE 4 OF 6 · STUDIO MIDDLEWEST, MADISON` | Vitals prints `phaseWord · Start · Target · Band · Total` — no "Opened" label, no "N OF 6" figure, no studio/city field exists anywhere in the component or its query | ⚠️ F-5, likely a reconciliation.md documentation artifact, not a lane defect |
| RF-03 group order | mockup/reconciliation: stable paper order, `THE WHOLE JOB` last, cards never re-sort; proposal's "current stop's group first" is explicitly overridden | `anchorGroups` iterates `PROJECT_PAPER_ORDER` then appends the null-key ("whole job") bucket last — a fixed order independent of `currentStop` | ✅ reconciliation wins, confirmed in code |
| RF-03 headings | `BESIDE <STOP> · N` / `THE WHOLE JOB · N`, count → charcoal when standing there | `BESIDE ${marginRegionName(key)}` / `THE WHOLE JOB`, count span toggles `text-primary`/`text-muted` off `data-beside-current` | ✅ |
| RF-03 per-item anchor line | card prints `BESIDE PIECES` / `ABOUT THE WHOLE JOB`; reconciliation's own "Ships"/"Walker sees" text shows it joined with the kind (`TIME · BESIDE PIECES`) | `marginAnchorLine()` prints only the anchor phrase, on its own `<span>`, below the pre-existing separate kind line | ⚠️ F-6, low severity |
| RF-03 empty line dropped | proposal's `NOTHING BESIDE PIECES YET` deleted per reconciliation | No such string appears; a group with 0 members is simply absent from `anchorGroups` | ✅ |
| RF-03 duplicate `IN THE MARGIN` heading | delete the duplicate (F18) | Sheet header (`margin-rail.tsx:328`) prints it once; the in-rail column heading (`:598`) now `hidden … min-[1440px]:block`, so exactly one prints at any tier | ✅ |
| RF-03 1180-1439 tab | `MARGIN · 7 · 1 OVERDUE`, bare `Margin` at zero | `marginTabLabel()` matches exactly, including the zero-case bare word | ✅ |
| RF-03 first-touch note | capped at 2 lines | `line-clamp-2` + `title` fallback for full text | ✅ |
| OD-11 mobile bar left zone | `IN THIS DOCUMENT` / household / `AT <STOP>`, `data-reading-index`, `aria-label` "Open sections, at {stop}" | All four present exactly, in `mobile-bar.tsx:216-252` | ✅ (stop stays null until Wave 2 wires `readingIndex` — expected, not a Wave-1 gap, see note) |
| OD-11 `--color-clay` vs `--color-clay-ink` | task-flagged as allowed | `mobile-bar.tsx` uses `--color-clay` for the stop line, with an inline comment citing the AA failure of `--color-clay-ink` on charcoal | ✅ allowed, correctly justified |
| OD-11 72px bar height | task-flagged as allowed if 3 lines need it | `min-h-[64px]` → `min-h-[72px]`, comment cites the 3rd line | ✅ allowed |
| `mobile-margin-chips.tsx` padding | `:98/:114` → `py-1.5` | Both sites changed from `py-[0.32rem]` to `py-1.5` | ✅ |
| `mobile-timer-sheet.test.tsx` | row 7: `:247-257` → bar owns the doorway, no `[data-spine-timer-regime]` | Rewritten accordingly | ✅ |
| e2e row 10 (`quiet-responsive-shell.spec.ts`) | `:223-228` → 135–137 | Exactly that | ✅ |
| e2e row 11 (`quiet-release-contracts.spec.ts`) | `:105-118` → 136; `:169-299` delete → "sole timer doorway at every width" | Both done; survivors intact | ✅ |

## Findings

| ID | Severity | Confidence | file:line | What was asked | What shipped |
|---|---|---|---|---|---|
| F-1 | **Blocking** | 0.9 | `doc-spine.tsx:76-78` (head), `:93` (arc `<ul>`), `:125` (`<li>`) | `reconciliation.md` §10 (arc ruling, dated 2026-08-29, "W1-L1 measurement"): at 1180–1439 the arc must `flex-wrap` into 4+3 rows of `xs` marks at `min-h-6` (24px) each, costing 48px, so the whole reserved head can hold it. `technical-design.md`'s fixed numbers declare a 100px head "at every offset"; reconciliation later derives ~116px specifically for 1280 given the wrap. | The `<ul>` is untouched from `main`: `flex flex-col … min-[1440px]:flex-row`, each `<li>` still `min-h-11` and full-width below 1440. At 1180–1439 the 7 marks stack **vertically** at 44px each ≈ **308px**, inside a head declared `min-h-[84px]`. The "reserved, never measured" head — the load-bearing premise the whole rail-head redesign and Wave 3's CLS-zero guarantee build on — overflows by roughly 3.5×. This also means the head reserve constants (`84px`/`100px`) match neither the technical-design's uniform 100px nor reconciliation's derived ~116px for 1280. |
| F-2 | **Blocking** | 0.95 | `page.tsx:1776-1781`; `doc-spine.tsx:69-72` (new props); `doc-letterhead.tsx:39-42` (comment) | C-1 / proposal §4 "2 · The rail head": the household name (`Vandersteen`) prints in the rail head at every offset. `page.tsx` already has `row.client_name` in scope at the exact call site (used at lines 1808, 1814, 1868, 1877, 1888, 1898, 1990, 1999, 2033 for the same purpose). | `<DocSpine sections={sections} others={others} onJump={jumpToSection} shelved={shelvedSpine} />` — unchanged from `main`. `household`, `roomInHand`, `onReleaseRoom` are never passed, so the entire rail-head household print (and the "Put down the room" door) is unreachable in the live app; it only renders in `doc-spine.test.tsx`'s direct-prop unit tests. L2's own comment in `doc-letterhead.tsx` states this explicitly ("Both props stay on the signature — and unread — until W1-L4 rewires page.tsx onto DocSpine"), confirming the gap was anticipated and not closed. No test in this wave would catch it (`page.test.tsx` isn't a W1 file); only a walk against the live app would show a blank household line in the rail head at 1440/s0. |
| F-3 | High | 0.6 | `doc-spine.tsx` (deleted block, was `:145-155` on `main`); `studio-drawer.tsx` (no change) | proposal §4 tenant table: the presence line ("this minute … other people, this session") is "evicted to the drawer's account line (F137)," not deleted outright. | The presence line (`Just you · visible to the studio` / `You and {others}`) is deleted with no replacement anywhere; `studio-drawer.tsx`'s only change this wave is the unrelated F03 fix. `DocSpineProps.others: string[]` stays a required, unused field, consistent with a dropped relocation rather than an intentional removal-of-need. Program-plan's terse Wave-1 prose only explicitly says "clock moves to `studio-drawer.tsx`" (silent on presence), which is why confidence is medium rather than high — but the proposal's own verdict table is unambiguous that presence should have landed somewhere, and it landed nowhere. |
| F-4 | Medium | 0.9 | `doc-letterhead.tsx:52` | `reconciliation.md` D-6 "Ships": "Letterhead `pb-5` → `pb-4`." `proposal.md` §4 header table: "Letterhead `pb-5` → `pb-4` + `doc-rule-mid` | −4 | 18." D-6's own basis line cites this as load-bearing for "SC1's 148px letterhead subtotal." | `<header id="document-project-status" … className="doc-rule-mid mb-4 pb-5 pt-3.5 …">` — `pb-5` is untouched. |
| F-5 | Low | 0.35 | `letterhead-vitals.tsx` (whole component) vs `reconciliation.md:37` | D-6 "Ships": vitals row = `OPENED 2026-03-02 · PHASE 4 OF 6 · STUDIO MIDDLEWEST, MADISON`. | Implemented vitals content is `phaseWord · Start <date> · Target <date> · Band $x–$y · $total` (unchanged field set from `main`, only empties suppressed). No "Opened" label, no "N OF 6" phase-count figure, and no studio-name/city field exists in this component or its `useProjectV2` data at all — "STUDIO MIDDLEWEST, MADISON" resembles nothing in the codebase. The literal ruling text ("prints only fields that carry a value," "no PHASES word," "no clock") is correctly implemented; only the illustrative "Ships" string doesn't match any real field. Read as more likely a reconciliation.md drafting artifact (conflating the rail head's `4 OF 6` stage phrase with the vitals row) than an implementation miss — flagged for the architect/design lead to reconcile rather than as a lane defect. |
| F-6 | Low | 0.4 | `margin-item.tsx:29-31` (new `marginAnchorLine`), rendered at `:97-102` | `reconciliation.md` RF-03 "Ships"/"Walker sees": per-card anchor line reads `TIME · BESIDE PIECES` / `MONEY · ABOUT THE WHOLE JOB` (kind joined with anchor). `proposal.md` §4 item 3 asks only for `BESIDE PIECES` / `ABOUT THE WHOLE JOB`, with no kind prefix. | `marginAnchorLine()` prints only `BESIDE PIECES` / `ABOUT THE WHOLE JOB` on its own `<span>`, below the pre-existing, unrelated `deriveKindLine` output (`TIME`/`MONEY`) rendered by `MItemContent` on the line above. The two facts are both present but on two lines, not joined into the reconciliation's single string — ambiguous given the proposal itself doesn't call for a join; low severity either way. |
| F-7 | Info | 0.85 | `program-plan.md` Wave-1 prose vs `test-impact.md` rows 4/18 | Program-plan's Wave-1 narrative assigns "remove the dead `jest.mock('./spine-timer')` in `doc-spine.test.tsx:5`" and "`rail-stock.test.ts` re-pointed" to **L4**. `test-impact.md` row 4 assigns the mock removal to **W1-L1**; row 18 assigns `rail-stock.test.ts` to **W2-L5**, not Wave 1 at all. | L1 removed the mock (matches `test-impact.md`, not the prose); no W1 lane touched `rail-stock.test.ts` (also matches `test-impact.md`, not the prose). This is a documentation inconsistency between the two planning artifacts, not a lane execution fault — the actual outcome is correct by the more granular, purpose-built table. Flagging so the architect can reconcile the two docs; no functional gap results. |
| F-8 | Info | 0.7 | `margin-item.tsx`, `margin-item.test.tsx`, `margin-rail-stage2.test.tsx` (L2) | Program-plan's Wave-1 prose names only `doc-letterhead.tsx`, `letterhead-vitals.tsx`, `margin-rail.tsx`, `margin-note.tsx` for L2. | L2 additionally touched `margin-item.tsx`/`.test.tsx` (to implement RF-03's per-item anchor line, unambiguously part of "the margin" work) and added a new `margin-rail-stage2.test.tsx` companion. No other lane claims these files, so there's no cross-lane collision, and the work is squarely within L2's conceptual remit — flagged only because the literal file list in the program-plan's Wave-1 sentence undercounts what RF-03 actually required. |

## Confirmed compliant (explicitly checked per the brief, no deviation)

- L2's group-order decision: `margin-rail.tsx`'s `anchorGroups` iterates the stable `PROJECT_PAPER_ORDER` and appends the whole-job bucket last, independent of `currentStop` — the reconciliation's "cards never move" ruling wins over the proposal's "current stop's group first," and the code proves it.
- The bare `Margin` word at zero (`marginTabLabel`).
- `--color-clay` in place of `--color-clay-ink` on the mobile bar's charcoal ground, with an in-code justification citing the AA failure — task-confirmed allowed.
- The 72px mobile-bar height (up from the design's 64px) to fit the third line — task-confirmed allowed.
- No program-folder files committed in any of the four lanes.
- Conventional Commits with the co-author line, on every commit across all four lanes.
- OD-16 deletion of `spine-timer.tsx` (210 lines, whole file).
- OD-5's exact regime-literal strings at both sites.
- All four named survivor ranges (`doc-spine.test.tsx:14-19`, `responsive-document-shell.test.tsx:197-211`/`:308-320`, `quiet-release-contracts.spec.ts:152-158`/`:348-400`) verified byte-identical via full-file diff, not just visual inspection of the hunks.
- Rows 6 and 8 of `test-impact.md` (Wave 3/Wave 0 files) confirmed untouched by any Wave-1 lane.

## Fixes required (blocking — must land before Wave 1 merges)

1. **F-1** — Implement the reconciliation §10 arc ruling at 1180–1439: `flex-wrap` on the arc `<ul>` (or an equivalent 1180-only rule), `xs` marks, `min-h-6` per `<li>`, 4-then-3 row split — and re-measure/re-declare the head's `min-h` for that tier so it actually reserves what it renders (reconciliation's derived ~116px, not the current 84px).
2. **F-2** — Wire `household={row.client_name ?? undefined}` (and, once available, `roomInHand`/`onReleaseRoom`) into the `<DocSpine>` call at `page.tsx:1776`. This is a one-line addition using data already in scope; without it Wave 1's headline deliverable does not exist on the live page.

## Should fix (non-blocking, but named so they don't get lost)

3. **F-3** — Give the presence line ("who else is viewing") a home in `studio-drawer.tsx`'s account line, or explicitly re-rule that it is dropped (not just relocated) and update the proposal/plan to say so.
4. **F-4** — `doc-letterhead.tsx:52`: `pb-5` → `pb-4`, per D-6 and the proposal's own header-budget arithmetic.
5. **F-5** — Reconcile `reconciliation.md`'s D-6 "Ships" vitals string against what the component actually has data for; either the doc or the component is wrong, and right now neither party can tell which.
6. **F-7 / F-8** — Reconcile `program-plan.md`'s Wave-1 prose against `test-impact.md`'s per-file disposition table (they disagree on who owns the `spine-timer.tsx` mock removal and whether `rail-stock.test.ts` is in scope this wave) so a future wave's lane assignment doesn't inherit the same ambiguity.

## Not checked (out of scope for a diff-only review)

Gate execution (jest/type-check/lint/e2e pass/fail) is the correctness reviewer's remit; this review is diff-content-only and made no claim about whether the four lanes' code actually type-checks, lints clean, or passes the Wave-1 e2e basket (`quiet-responsive-shell` · `quiet-release-contracts` · `workflow-stage-responsive` · `margin-handoffs`).
