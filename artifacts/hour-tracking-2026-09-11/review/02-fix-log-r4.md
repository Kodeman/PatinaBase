# Round 4 fix log (round-5 fixer)

Inputs: `review/03-rereview-content-r4.md` (R4-1 … R4-26) and
`review/03-rereview-technical-r4.md` (T4-1 … T4-17), read in full including
minors and notes. Standing dispositions from `02-fix-log-r3.md` were read and
are not re-litigated.

Two exceptions to prior rounds' deck-only constraint were granted for this round:

1. **`architecture.md` may be amended at exactly the lines named by R4-8 and
   R4-9** (the deck's arithmetic is right, the source is wrong). Nothing else in
   `architecture.md`; nothing at all in `synthesis.md`.
2. **Claims the reviewer says are not derivable from source** (R4-2, R4-3, R4-4,
   R4-5, R4-6, R4-7) were **re-verified in the repo by this fixer** before the
   replacement text was written. Every one of the reviewer's replacements held;
   none required a `—` cell. Verification evidence is recorded per row.

Line numbers below are **post-fix** unless marked "(pre-fix)". The file grew from
1,555 to 1,560 lines (the `<main>` landmark, T4-12).

---

## 1 · Technical findings

| ID | Sev | Disposition | Where |
|---|---|---|---|
| **T4-1** | blocker | **fixed** | `index.html:223` — `.mq` now carries `white-space: normal` (plus `display:block`, see T4-10), so it no longer inherits `nowrap` from `td.mark`. Measured after: `documentElement.scrollWidth` 390 at a 390 viewport (was 836) |
| **T4-2** | major | **fixed** — dissolves with T4-1 | Measured after: sheet 02's single `.scroller` is `scrollWidth 1092 / clientWidth 1092`, delta **0**, at 1440; **zero** `.scroller` anywhere in the deck overflows at 1440 |
| **T4-3** | major | **fixed** | `index.html:144` — `position: static` added to `.gutter` inside the existing `@media (max-width: 1000px)` block. Measured: `getComputedStyle(.gutter).position` = `static` at 900, `sticky` at 1440, so B-R3-12's desktop cue survives |
| **T4-4** | major | **fixed** — dissolves with T4-1 | Measured after: `scrollIntoView` on sheet 02's `.mq` at 390 leaves `window.scrollX = 0` and `docSW = 390` (was a permanent `scrollX 33`) |
| **T4-5** | minor | **fixed** — dissolves with T4-1 | The colophon's "no truncation" claim (`:1426`) is now true: nothing is clipped at 390 |
| **T4-6** | minor | **fixed** (deviations option) | `index.html:1426` — the three off-scale meta sizes (`td.src` and `.legend span` at 11.5px, `td.num` at 13px) are now named in the colophon's known-deviations entry. Took the "declare" branch, not the "move to 11/12px" branch, because re-scaling `td.src`/`td.num` changes every sheet-table's column widths and would have invalidated the render check this round exists to run |
| **T4-7** | minor | **fixed** | `index.html:305-307` — `.measure` (58ch) applied to all three cover verdict `.t-body` spans. They are grid items of `.verdicts > li`, so they are blockified and the `max-width` takes effect |
| **T4-8** | minor | **fixed** | `index.html:188` — `td.src { overflow-wrap: anywhere }` → `break-word` |
| **T4-9** | minor | **fixed** | `index.html:1525` and `:1527` — `resetPending();` added to both the `Home` and the `End` branch |
| **T4-10** | minor | **fixed** | `index.html:223` — `.mq` given `display: block; text-align: left; margin: 2px 0 0` (was `margin-left: 6px`). Took the report's **first** option so the dial itself stays centred and each mark column keeps one alignment; only the note text is left-aligned |
| **T4-11** | minor | **fixed** — dissolves with T4-1 | Measured after: `all_scrollers_1440 = []` (no scroller overflows), so sheet 02's scroller is no longer a tab stop and no longer announces itself. `scrollerCanScroll`'s 1px tolerance left as-is, per the report's primary fix |
| **T4-12** | note | **fixed** | One `<main>` opened at `index.html:280` and closed at `:1435`, wrapping all 16 `<section>`s. The skip link and the visually-hidden shortcut sentence stay outside it. No CSS selector references `body >` or `main`, so layout is unchanged |
| **T4-13** | note | **fixed** | `index.html:113` — `em { … color: var(--ink) }` (was `--ink-muted`). Weight 500 and the no-italic house choice kept; emphasis is no longer painted as de-emphasis |
| **T4-14** | note | **no action** | Report's own fix is "None" — hairlines are decoration and the one meaning-bearing rule (the ≤860px card divider) is already `--ink-faint` |
| **T4-15** | note | **no action** | Report's own fix is "None" — Playfair Display 400 upright requested and unused is house-sheet conformance, carried unchanged from B-R3-16 |
| **T4-16** | note | **accepted** | The ≤860px `display:block` card mode is the standard trade-off and the `::before` labels are real text. Preserving table semantics needs a markup pass across all 15 tables — restructuring, out of this round's remit |
| **T4-17** | note | **closed** | B-R3-13 confirmed non-reproducible and now moot: measured `all_scrollers_1440 = []` after T4-1 |

## 2 · Content findings

| ID | Sev | Disposition | Where / verification |
|---|---|---|---|
| **R4-1** | major | **fixed** | `index.html:330` → "Zero taps inside an open document; **eight off one**; impossible on the phone with nothing held and in Patina Field for anything but a just-closed visit." The `.mq` at `:329`, the prose cell at `:330`, sheet 03's ◐+"8" and sheet 04's 8→5 now all say eight. Authority: `synthesis.md:87` — "Web desk — nothing in hand … Today **8** … **8 adopted**" |
| **R4-2** | major | **fixed**, reviewer verified correct | **Verified**: `00177:136` is `CREATE POLICY "Designers manage their project time entries" … FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid()))` — no `user_id` test. `grep "ON public.project_time_entries"` across all migrations returns nine CREATE POLICY statements; the only `DROP POLICY` for this one is `00177:135`, immediately before its own CREATE, so it is live at head. `index.html:523` restated to the reviewer's wording; `:518` (Designer desktop) changed ○ → ◐ with the note "the project's own designer only" |
| **R4-3** | major | **fixed**, reviewer verified correct | **Verified by grep at head**: nine policies — `00177:136` (FOR ALL, via `projects p`), `00177:140,144,148,152` (via `is_project_team_member`), `00316:237,242,248,257` (all four via `projects p`) = **9; 5 via `projects p`, 4 via `is_project_team_member`**. `index.html:1298` restated. The mitigation cell's "four new policies" is **left alone** — that is W4's *new* policy count from `architecture.md:892`, a different quantity from the nine existing ones; re-checking it against the ninth is the orchestrator ask R4-3 raises, and it lands in `architecture.md`, outside this round's permitted edits |
| **R4-4** | major | **fixed**, reviewer verified correct | **Verified**: in `00578_design_build_kind.sql`, `CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority()` is at **2599**, `AS $$` at 2604, `BEGIN` at **2619**, `END;` at **2819**, `$$;` at **2820**. `index.html:675` and `:683` → `00578:2599-2820`. **Owed, outside remit:** `synthesis.md:143`, `architecture.md:20`, `:172`, `:891` still carry `2599-2805`, and `architecture.md:172` makes that span W1's implementation instruction |
| **R4-5** | major | **fixed**, reviewer verified correct | **Verified**: 2820 − 2599 + 1 = **222** statement lines; 2819 − 2619 + 1 = **201** from `BEGIN` to `END`. Neither is 207. `index.html:875` → "222 lines (00578:2599-2820), 201 between `BEGIN` and `END`"; `:1297` → same figures inline. **Owed:** `synthesis.md:141`, `architecture.md:241`, `:891` |
| **R4-6** | major | **fixed**, reviewer verified correct | **Verified**: `architecture.md:633` reads "one row per entry, every row naming a person and a day; the amounts sum to the ledger's total" — "every column populated" appears nowhere in it; `architecture.md:618` requires the W5 CSV test to assert "an internal row's empty project cell". `index.html:1135` restated to the source's own words |
| **R4-7** | major | **fixed**, reviewer verified correct | **Verified**: `field-companion-package.md:319-321` defines Invariant V as "On every screen where a capture can be created, the visit's project and room are legible without a tap, and changing them is exactly one tap away" — nothing about the collapsed strip. `FieldCompanionPresentation.swift:51-54` is `FieldCompanionActionID` with exactly `openVisit` / `endVisit`; `:56-64` is `FieldCompanionCollapsedPresentation` with one optional `action`. "(Invariant V)" dropped at `index.html:639` (now cites `FieldCompanionPresentation.swift:56-64`), `:1026` (bare citation) and `:1346` (HT-18 now reads "the collapsed strip's one-action contract holds", with the Swift citation). Mislabel origin `memo-ux-mobile.md:21` and `synthesis.md:93` are **owed**, outside remit |
| **R4-8** | major | **fixed in `architecture.md`** | Deck unchanged (already correct). `architecture.md:8`, `:835`, `:880` amended 17–25 → **15–25**. ⚠ **See §4 — `architecture.md:837` also carries "(17–25)" and was left untouched per the exact-lines instruction; it now contradicts the line above it.** |
| **R4-9** | major | **fixed in `architecture.md`** | Deck unchanged (already correct). `architecture.md:894` amended "four concurrent worktrees" → **"three concurrent worktrees"**, matching the stage table's peak (`:857`) and the 2–3 tile (`:879`) |
| **R4-10** | minor | **skipped** | `head+12` double-booking. The fix is to free a migration number for the INVOKER rollup and correct `architecture.md:301-302, :951`; both deck passages are faithful to their source. Outside the two permitted `architecture.md` exceptions. Third round skipped for the same reason (A-R3-11, R3-11) |
| **R4-11** | minor | **skipped** | HT-24's Touches. The deck's `new` is the defensible label and is already in place; the amendment owed is `synthesis.md:195`, and synthesis.md is explicitly out of bounds this round |
| **R4-12** | minor | **skipped** | Hole 4's mechanism. Deck is right (`00412:2672` is `WITH (security_invoker = true) AS`); `synthesis.md:37` is the unamended side and is out of bounds |
| **R4-13** | minor | **skipped** | Risk 5's severity. Deck is right (low); `architecture.md:69` and `:895` are the unamended side, and neither line is inside the R4-8/R4-9 exception |
| **R4-14** | minor | **fixed** | **Verified**: `00545_time_entry_field_visit_source.sql` is **232 lines total**; the name-discovery passage is the comment block at **`00545:33-43`** (the reviewer's `:35-40` is the middle of it — `:33` opens "00198 added `source` with an INLINE, UNNAMED check" and `:43` closes the resolve-by-content rationale). `index.html:1301` → "the precedent is 00545, a 232-line migration whose name-discovery block is 00545:33-43". Span widened from the reviewer's citation to the block's real boundaries |
| **R4-15** | minor | **fixed** | **Verified**: `synthesis.md:156` enumerates "BIL §5, VET-16, CR-26, LEAH-13, FS-40, OPS-13, draft — 7 seats" — six seats and the architecture draft. `index.html:905` → "6 seats + the draft" (cell given `.num.wrap` so it does not sit on the nowrap floor) |
| **R4-16** | minor | **fixed** | **Verified in the memos**: `memo-critic.md` §3 row 2 = "Adjust that entry before it becomes money — **4** (minutes field, type, activity select ×2, Log)"; `memo-feasibility.md` §3's matching row = "Log with activity recorded — **3** (activity open + pick + Log)", with no minutes nudge. `index.html:590` → "4 (CR §3, minutes + activity + Log); FS §3's 3 omits the minutes nudge." |
| **R4-17** | minor | **fixed** | **Verified**: `memo-critic.md` §3's "Log time by hand from the phone, via a document" row proposes **2–4**, not 3; the 3 is `synthesis.md:89`'s reconciliation. `index.html:611` → "Today ≥6 from CR §3 … ; v1 = 3 per synthesis §3's reconciliation (CR proposed 2–4)" |
| **R4-18** | minor | **fixed** | **Verified against the deck's own sheets**: sheet 03 `:500` marks "See a project's hours" ◐ "wrong answer" (`?projectId=`, `hours-ledger.tsx:95-97`) and sheet 06 `:740` calls it "the lens that already exists". `index.html:305` → "of the four views one works, one answers the wrong question, and two exist in the database and in no click path" |
| **R4-19** | minor | **fixed** | **Verified**: `DECISIONS.md:2555` is R69's head and `:2561` is "**Scope.** Spine timer + mobile bar only." A lock-screen surface is outside that scope, so "reverses" overreached. `index.html:1066` → "breaches R69's principle — its stated scope is spine timer + mobile bar only (DECISIONS.md:2561). 3 seats against, 0 for."; `:1359` (HT-31) → "Affirm R69's principle — its stated scope is spine timer + mobile bar only (DECISIONS.md:2561) — and strike the Live Activity." |
| **R4-20** | minor | **fixed** | **Verified in source**: `hours-ledger.tsx:545` is `{/* Batch add … */}`, `:594` closes the `Add` `DocumentAction`, `:595` closes the block's `<div>`. All four cells (`index.html:415`, `:442`, `:986`, `:994`) → `hours-ledger.tsx:545-595` |
| **R4-21** | minor | **fixed** (compression branch) | `index.html:671` and `:679` — sheet 05's two "What it is" cells compressed from three sentences each to **one sentence carrying a citation**; no cited fact dropped (the $0 landing, the NULL-authority chain and the "Principal designer" label all survive). `:825` — sheet 06's "Open question" compressed from two sentences plus a pointer to **one sentence**. The deviation that remains — these are single *reference sentences*, not short clauses, and the colophon's own "Findings count" / "Typeset to" pair still exceeds one line — is **recorded once** at `:1426` so it stops being re-found |
| **R4-22** | note | **skipped** | No DECK CONTRACT file exists (re-confirmed by the reviewer this round). No deck-only action is available; supplying the contract or ruling the 1 + 14 + 1 shape is the orchestrator's. Fourth round, same reason |
| **R4-23** | note | **accepted** | Crux labels i–vii absent from the running heads. The report's own alternative is "or accept". Taken, because the mapping is many-to-many (crux i → sheets 03/04/09; sheet 06 → cruxes iii *and* vi), so a single letter in a `.chapter` gutter label would be ambiguous on at least four sheets, and re-labelling 14 running heads is restructuring |
| **R4-24** | note | **accepted** | "Hours on the paper's margin" has no refusal row. The report's own alternative is "or accept". Taken, because sheet 12's "Twenty-three dispositions" was machine-verified this round as 1:1 with `architecture.md:926-952`; inserting a row breaks that verified count, and the item is already named twice (cover epigraph `:294`, colophon "Title from" `:1427`) |
| **R4-25** | note | **no action** | Report's own fix is "None" — the inference disclosures are correct and honest. Logged so round 6 need not re-derive |
| **R4-26** | note | **skipped** | `synthesis.md:138` still says Wave 0 ships the one-off re-rate; the plan puts it in W1 and the deck's sheet 07 annotation already flags the divergence. The amendment is to `synthesis.md`, out of bounds |

---

## 3 · Render check — one run, after the edits

Wrapper `review/shots/_r5wrapped.html` (page content in the Artifact publish
shell, identical construction to `_rv4wrapped.html`). Script
`review/shots/r5-check.cjs`, run as
`cd /Users/kody/Code/patina-merged/apps/designer-portal && node review/shots/r5-check.cjs`,
Chromium resolved from the designer-portal workspace via `createRequire`.
Nothing was installed. Chromium again refused to launch inside the command
sandbox (`mach_port_rendezvous_mac.cc:155 … Permission denied (1100)`), so the
run was repeated with the sandbox off for that command only — same condition the
round-4 reviewer recorded.

**A1 — 390 × 844, `document.documentElement.scrollWidth <= window.innerWidth`:
PASS.** `scrollWidth: 390`, `innerWidth: 390`. (Round 4 measured 836 / 390.)

**A2 — 390 × 844, sheet 02's `.mq` fully within the viewport: PASS.**
`text: "0 taps in a document, 8 off one, impossible on the phone with nothing
held and in Field beyond a just-closed visit"`, `left: 16`, `right: 374`,
`iw: 390`, `clientWidth: 358`, `scrollWidth: 358`, `clientHeight: 50`,
`scrollHeight: 50`, `scrollX: 0`. No clipping in either axis. (Round 4: 803px
wide, 49% visible.)

**A3 — 1440 × 900, every `#sheet-2 .scroller`: `scrollWidth <= clientWidth + 3`:
PASS.** One scroller, `scrollWidth: 1092`, `clientWidth: 1092`, `delta: 0`.
(Round 4: 3px over at 1440, 301 at 1024.)

Collateral measurements from the same run:

- `all_scrollers_1440: []` — **no** `.scroller` in the deck overflows at 1440 (T4-2, T4-11, T4-17).
- `displacement_after_scrollIntoView_on_mq: { scrollX: 0, docSW: 390 }` at 390 — T4-4 gone.
- `gutter_position_1440: "sticky"`, `gutter_position_900: "static"` — T4-3 fixed without losing B-R3-12's desktop cue.

Screenshots: `review/shots/r5-390-sheet02.png` · `r5-1440-sheet02.png` ·
`r5-900-gutter.png`.

---

## 4 · ⚠ Residue introduced by this round's `architecture.md` amendment

The brief authorised **exactly** `architecture.md:8`, `:835`, `:880` (R4-8) and
`:894` (R4-9). A fourth line carries the same figure and was **not** amended,
because it was not named:

```
architecture.md:837   is the same length (17–25) and runs beside it, so the program has two co-critical
```

With `:835` now reading **15–25**, line 837 asserts that the second co-critical
path "is the same length (17–25)" as a path stated two lines above as 15–25.
This is a new internal contradiction inside one paragraph, and a round-6
reviewer will find it. The one-line fix is `(17–25)` → `(15–25)` at
`architecture.md:837`; it needs the orchestrator's word, not the fixer's.

## 5 · Still owed outside this round's remit

- `synthesis.md:143` + `architecture.md:20`, `:172`, `:891` → `00578:2599-2820` (R4-4). `architecture.md:172` is a W1 implementation instruction; a brief copying `2599-2805` drops the ceiling branch.
- `synthesis.md:141` + `architecture.md:241`, `:891` → 222 lines / 201 in the body (R4-5).
- `architecture.md:512-513`, `:892` + `synthesis.md:186` → nine policies, five via `projects p`; and W4's "four new RLS policies" re-checked against the ninth (R4-3).
- `synthesis.md:49`, `:193` + `architecture.md:280` → the admin gap is "an admin who is not the project's designer", not all admins (R4-2).
- `architecture.md:837` → 15–25 (§4 above).
- `architecture.md:69`, `:895` → the `source` constraint **is** named, by `00545:147-148`; risk 5 is low (R4-13).
- `synthesis.md:37` (R4-12), `:138` (R4-26), `:195` (R4-11).
- `memo-ux-mobile.md:21` + `synthesis.md:93` → drop the Invariant V label (R4-7).
- `architecture.md:913` → "Seven seats." is six seats plus the draft (R4-15).
- A migration number freed for the INVOKER rollup, then `architecture.md:301-302`, `:951` and the deck (R4-10).
- The DECK CONTRACT itself (R4-22), unresolved for four rounds.

## Round-5 source amendments

Six targeted source-side edits, applied against the standing disposition above
(deck untouched throughout).

1. **Residue named in §4** — `architecture.md:837` (now `:842` after R4-10's
   insertion).
   - Before: `is the same length (17–25) and runs beside it, so the program has two co-critical`
   - After: `is the same length (15–25) and runs beside it, so the program has two co-critical`

2. **R4-10** — `head+12` double-booked between HT-10 (RLS narrowing) and HT-37's
   contingent INVOKER rollup RPC. Risk 8 (`architecture.md:903`, née `:898`)
   asserts `head+12` is *"the only change in that migration"*, which the
   `:951` (née `:319`) mention of an INVOKER RPC also landing in `head+12`
   contradicted. The dependency table's ranges were kept as the anchor and
   widened by one slot rather than overwritten, since the two rulings (HT-10,
   HT-37) are independent and both could fire. W2 widened to `head+10…+13`
   (new slot `head+13` reserved for the INVOKER RPC contingency), and W3–W7
   shifted down by one migration each to stay contiguous:
   - W3 `head+13…+14` → `head+14…+15`
   - W4 `head+15…+19` → `head+16…+20`
   - W5 reserved `head+20` → `head+21`
   - W6 `head+21…+22` → `head+22…+23`
   - W7 `head+23…+25` → `head+24…+26`

   Before (dependency table, W2–W7 migrations column):
   `head+10 … +12` / `head+13 … +14` / `head+15 … +19` / `(none; head+20 reserved)` / `head+21 … +22` / `head+23 … +25`
   After:
   `head+10 … +13` / `head+14 … +15` / `head+16 … +20` / `(none; head+21 reserved)` / `head+22 … +23` / `head+24 … +26`

   Every wave-block header and every `head+n` bullet in §2–§8 renumbered to
   match (log_time/start_timer now `head+14`; the DROP NOT NULL/trigger/RLS/
   classifier/margin_items sequence now `head+16…+19`; the `activity` CHECK
   widening now `head+22`; the rate-card/countersign/HT-39 sequence now
   `head+24…+26`). Risk 8 (`head+12`, unchanged — still HT-10's alone) was
   left as-is since it was already correct.

   New bullet inserted after the `head+12` block (W2, DB section):
   `` `head+13` — reserved, and the home for the INVOKER rollup RPC **if** Kody rules HT-37 (`useStudioTimeReport`) deleted rather than wired; see Portal section below. This is a separate reserved slot from `head+12` — the two rulings (HT-10, HT-37) are independent and either or both may fire, so they cannot share one migration. If HT-37 is ruled wired (this plan's default), this migration is not written. ``

   `architecture.md` W2 Portal section (née `:319`):
   - Before: `delete:* the replacement is an INVOKER rollup RPC in `head+12` and the wave moves`
   - After: `delete:* the replacement is an INVOKER rollup RPC in `head+13` and the wave moves`

   `architecture.md` §13 row 22 (née `:951`):
   - Before: `If Kody rules delete, the INVOKER replacement lands in `head+12` and W2 moves to the low end of L`
   - After: `If Kody rules delete, the INVOKER replacement lands in `head+13` and W2 moves to the low end of L`

   ⚠ **Residual, out of this task's remit:** the deck itself carries two
   further `head+12` mentions that mirror the pre-fix state —
   `index.html:1365` (HT-37: "the INVOKER replacement lands in head+12") is
   now stale against this amendment; `index.html:1304` (risk 8) and `:1399`
   (HT-10 disposition, "W2's head+12") remain correct, since HT-10 still owns
   `head+12`. The deck was not touched per this task's constraint — a future
   round should update `:1365` to `head+13`.

3. **R4-11** — `synthesis.md:195` (HT-24 Touches column), to match the deck's
   already-correct label.
   - Before: `| **HT-24** | **D10** (second amendment) | Is `activity` recorded rather than defaulted`
   - After: `| **HT-24** | new | Is `activity` recorded rather than defaulted`

4. **R4-12** — `synthesis.md:37` (defect #4's mechanism), to match the deck's
   verified `security_invoker = true` explanation (`00412:2672`) rather than
   the refuted "vendor/bookkeeper not an org member" story (`user_id` is
   `NOT NULL REFERENCES profiles`, `00177:18`).
   - Before: `` `project_unbilled_time` INNER JOINs `profiles` — the row-dropping hazard `00555:3024` documents in its own comment — so an entry logged by a `project_team_members` vendor or bookkeeper who is not an org member vanishes from the balance. ``
   - After: `` `project_unbilled_time` INNER JOINs `profiles`, and the view is declared `security_invoker = true` (`00412:2672`) — the row-dropping hazard `00555:3024` documents in its own comment — so the caller's own `profiles` RLS applies to that join, and an entry whose author the caller cannot see vanishes from the balance. ``

5. **R4-13** — `architecture.md:69` and `:895` (née `:900` after R4-10's
   insertion), to match the deck's verified figures: `source` is already
   named at `00545:147-148`, and risk 5 prices **low**, not medium.
   - Before (`:69`, in context): `Follow the 00545 precedent for the constraint name, which **appears in no migration** — that archaeology is the cost here (`00545:37`, 232 lines).`
   - After: `The constraint is already named `project_time_entries_source_ck`, dropped and re-added by name at `00545:147-148` — no archaeology needed here (00545 is 232 lines).`
   - Before (`:895`, risk 5 row): `| 5 | **The `source` / `activity` CHECK constraint names appear in no migration.** The 00545 precedent cost 232 lines of archaeology. | medium | Both widenings are bought once and early (W0 `source`, W6 `activity`), using 00545's name-discovery form rather than a guessed constraint name. |`
   - After: `| 5 | **The `activity` CHECK constraint name appears in no migration** (`source`'s name is already known: `project_time_entries_source_ck`, `00545:147-148`). | low | The `activity` widening (W6) uses 00545's name-discovery form (`00545:33-43`); `source` (W0) simply reuses its known name — no archaeology needed. |`

6. **R4-26** — `synthesis.md:138`, to match the deck's own flagged divergence
   (sheet 07: "synthesis said W0 — the plan moves it behind the resolver").
   - Before: `FS-8's stranded rows are never promoted by a later agreement, so Wave 0 ships a one-off re-rate (an UPDATE of a classifier-watched column re-fires it) plus a pre-flight count of rows whose rate would change (FS-124).`
   - After: `FS-8's stranded rows are never promoted by a later agreement, so Wave 1 ships a one-off re-rate (an UPDATE of a classifier-watched column re-fires it) plus a pre-flight count of rows whose rate would change (FS-124).`

Nothing else in either file was touched. `synthesis.md:141`/`:143` and
`architecture.md:20`/`:172`/`:512-513`/`:892`/`:186`/`:913` (R4-3, R4-4, R4-5,
R4-15) remain owed — out of scope for this round.
