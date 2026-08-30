# W2 review — FIDELITY (Sonnet, read-only)

Reviewed 2026-08-29. Read-only: `git diff`/`git show` with explicit refs only; no checkout; no product edits. I wrote none of this.

```
┌─────────────────────────────────────────────────────────────────────┐
│ VERDICT:  SHIP-AFTER-FIXES                                          │
│                                                                       │
│ The ladder's own logic (derivation, floors, doors-per-spread,       │
│ document-index contract, care/record roots) is a faithful, well-    │
│ reasoned implementation of OD-2/OD-3/OD-8/OD-14/C-2/C-3/C-4/RF-02/   │
│ RF-05. But a ratified numeric contract (the rail head reserve) was  │
│ silently changed against an explicit W1 deferral to the design      │
│ lead, four other contract shapes were shipped without the required  │
│ deviations.md entries, and none of the four lane branches actually  │
│ started from the stated base — a process failure that this time     │
│ happened to reconcile cleanly downstream, but should not be trusted │
│ to do so by luck again.                                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Method note — the base mismatch (read this before the evidence table)

I was asked to diff `document-lens/w2-l1`, `w2-l2`, `w2-l3`, `w2-l4` against `document-lens/integration@7c8b33e39`. **None of the four lanes actually branch from `7c8b33e39`:**

| Lane | Actual branch point | Missing from that point to `7c8b33e39` |
|---|---|---|
| `w2-l2` | `690337f1a` (`merge(document-lens): wave 0 fixes`) | **all of Wave 1** — 11 commits, "the rail earns its column" |
| `w2-l3` | `690337f1a` (same) | **all of Wave 1** |
| `w2-l1` | 3-way merge of `de82db0e5` (Wave-1 rail merge) + `w2-l2` + `w2-l3` | `5313b6f95` (W1 review fixes) + the final `7c8b33e39` merge |
| `w2-l4` | `de82db0e5` + merge of `w2-l2` | `5313b6f95` + `7c8b33e39` |

Consequence: a naive `git diff 7c8b33e39 document-lens/w2-l2` (etc.) shows dozens of hunks in `letterhead-vitals.tsx`, `studio-drawer.tsx`, `margin-note.tsx`, `margin-item.tsx`, `mobile-bar.tsx`, `mobile-sheets.tsx`, `mobile-shell.tsx`, `doc-letterhead.tsx`, `globals.css`, `quiet-release-contracts.spec.ts`, `quiet-responsive-shell.spec.ts`, `margin-rail-stage2.test.tsx` and `mobile-timer-sheet.test.tsx` that look like the lane *reverted* Wave 1 — it did not; the lane simply never had that content. To review real lane content I used each lane's own authored commit instead: `b303b3675` (L2), `cebec4d85` (L3), `c8644c499` (L1), `536d60552` (L4). Ownership and content findings below are against those commits. **F-01** below is the base-mismatch finding itself; I verified separately that `document-lens/w2` (the actual Wave-2 integration branch, built by merging all four lanes) *does* correctly re-absorb `5313b6f95`'s content (checked for the D-B7 "Set dates" act, the presence line in the drawer, the clamp's `aria-expanded`/`aria-controls`, and `--doc-shell-bottom-inset`'s safe-area form — all present), so nothing shipped missing. That is a lucky non-conflicting merge, not evidence the practice is safe.

## Evidence table

| Doc | Requirement checked | Lane(s) | Result |
|---|---|---|---|
| technical-design.md C-2 | `DocumentIndexKey`, `PROJECT_PAPER_ORDER`, `paperRegionsForSection`, `regionHeadingId` (still throws) | L2 | **Match** — `document-index.ts` |
| technical-design.md C-3 | `LadderSegment`/`LadderDoor` shape, `deriveLadderSegments`/`deriveLadderDoors`, `LensLadder` props incl. `tier` | L1 | **Partial** — segment/door value math matches; `tier` prop absent (F-03), `deriveLadderDoors` signature differs (F-04), `LadderDoor.href` is new (F-05) |
| technical-design.md C-4 | `data-lens-window`, segment `<button data-index-region aria-current>`, rung `<button data-room-chip aria-pressed>`, `<nav aria-label="This paper">` roving tabstop | L1 | **Match** |
| OD-2 / DL-02 | pre-work ladder: `[]` before Wave 5, "Nothing on this paper yet" track line | L1, L2 | **Match** |
| OD-3 | `LENS_LOOKAHEAD_PX`, settle/dedupe/char-cap constants, once | L1 | **Match** — `lens-constants.ts` |
| OD-8 / DL-04 | doors per spread: four project doors only when `ticket.project`; `clientcopy` only when `ticket.clientCopy`; `release-room` while held | L1 | **Match** |
| OD-14 / DL-07 | rungs never print below 1440; narrow value splice `N LINES · N ROOMS · N DAMAGED` ≤30 chars, damage date dropped first; doors head reserves 34px; floors `max(36, lines×15.4+8)` at 23/15 cpl | L1 | **Match** — exact formula, exact 34px |
| technical-design.md "Fixed numbers" / reconciliation §10 | rail head reserve 100px (≥1440) / 116px (1180–1439), declared once | L1 | **Deviation** — shipped 117/126 (F-02) |
| reconciliation §7 RF-02 | yielded segment prints its **name**, not blank | L1 | Wired (`headInFrame` prop honors this); the observer that drives it is Wave 3's, so untestable live yet — **as-designed for this wave** |
| reconciliation §9 RF-05 | ladder distributes across rail height, `pb-24`→24px | L1 | **Match** — `flex-basis`/`flex-grow` on floor+extent; `pb-6` |
| §13 sections sheet | `Put down` top, ≤40-char value lines, `aria-current`, `FILED WITH THIS JOB` doors, name "Sections of this document" | L4 | **Match** |
| proposal §4 | room sub-rung 28px; four doors 32px | L1 | **Deviation** — both shipped at `min-h-11` (44px) (F-06) |
| test-impact.md row 4 | `doc-spine.test.tsx` `:31-47` rewrite | L1 | **Match** (content), but the rewritten assertion itself encodes F-02 |
| test-impact.md row 5 | `shelved-spine.test.tsx` `:82-98`/`:217-262` rewrite; `:188-196` survives | L1 | Rewrite done; survivor **relocated**, not left in place (F-08) |
| test-impact.md row 9 | `contrast.test.ts` untouched in W2 (W0-L1 owns it) | all | **Match** — none of the four lanes' own commits touch it |
| test-impact.md row 16/17 | `paper-order.test.tsx`/`worktable.test.tsx` → `record` (W2-L5) | — | Correctly **not present** in any L1–L4 own commit (L5's job) |
| test-impact.md row 18 | `rail-stock.test.ts` extended to scan `spine/lens-ladder.tsx` | L1 | **Match** — `it.each` over both files |
| test-impact.md row 19 | `use-document-running-index.test.tsx` survive + extend late-mount | L2 | Late-mount **added**; one pre-existing assertion also **changed** beyond the stated scope (F-10); the named survivor range (:47–60, "asks a region to unfold…") is untouched |
| test-impact.md row 20/21 | `money-region-seam.test.tsx`, `ffe-region-head.test.tsx` = W3/W4 work | — | Correctly **not present** (L4 only *adds* a new describe block to `ffe-region-head.test.tsx`, doesn't touch its named line — see F-11) |
| test-impact.md row 22 | `ffe-install-care-head.test.tsx` — survive, verify in W2 | all | **Verified untouched** in all four lanes |
| Ownership matrix | file appears in exactly one lane | L2 | **Violation** — `spine-shelved-blocks.tsx` touched by both L2 (+5, type fix) and L1 (deleted whole) (F-09) |
| Commit hygiene | Conventional Commits + co-author; no program-folder commits | all | **Match** — all four own commits are `feat(document): W2 — …` with `Co-Authored-By: Claude Fable 5`; zero touches under `artifacts/document-lens-build-2026-08-29/` |

## Severity counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 1 |
| Medium | 3 |
| Low | 6 |
| Info (no action / documentation only) | 2 |
| **Total findings** | **13** |

## Findings

**F-01 · critical · confidence 0.95 · (process, no single file:line)**
What was asked: program-plan.md §"Census" — "Lane branches base on the previous wave branch," and the review brief's own base is `document-lens/integration@7c8b33e39`.
What shipped: `w2-l2`/`w2-l3` branch from `690337f1a` (Wave-0-fixes merge), omitting all 11 Wave-1 commits at creation time; `w2-l1`/`w2-l4` branch from `de82db0e5` (Wave-1 rail merge), recovering Wave 1's main content via merge but still omitting `5313b6f95` ("W1 review fixes") and the closing `7c8b33e39` merge. Verified `document-lens/w2` (built by merging all four lanes) does correctly carry `5313b6f95`'s content forward — D-B7's "Set dates" act (`letterhead-vitals.tsx`), the drawer's presence line (`studio-drawer.tsx:138-141`), the clamp's `aria-expanded`/`aria-controls` (`margin-note.tsx:199-200`), and `--doc-shell-bottom-inset`'s safe-area form (`globals.css:224-233`) are all present there — so nothing shipped missing this time. This is a lane-discipline failure, not (this time) a functional regression; it is exactly the kind of thing that stops being lucky the moment two lanes' hunks actually collide in the missing commit's territory.

**F-02 · high · confidence 0.9 · `apps/designer-portal/src/components/document/doc-spine.tsx:112`, `doc-spine.test.tsx:83`**
What was asked: technical-design.md's "Fixed numbers, declared once" line states `rail head 100px`; reconciliation.md §10 derives 1280's reserve at "≈116px (the 1440 head stays 100)." Both are countersigned, unconditional numbers.
What shipped: `min-h-[126px]` base, `min-[1440px]:min-h-[117px]` — with a code comment citing "W1 e2e: 126 / 117" as justification. That citation is real (`build/e2e-baseline.md`'s "Measurement note — the 1280 head reserve is 10px short"), but that note explicitly says W1 "**Shipped as ruled** (`min-h-[116px]`, `min-h-6`) **and flagged, not silently adjusted**… The design lead's options: raise the 1280 reserve to 126 (and 1440 to 117), or pin the cells…" — i.e., Wave 1 deliberately left the ratified 100/116 in place and handed the choice to the DESIGN LEAD. No such ruling exists in `reconciliation.md`'s cross-review log or `deviations.md`. W2-L1 made the choice itself and shipped it, silently, exactly the outcome W1 avoided. `doc-spine.test.tsx:83`'s assertion was rewritten to match the new (unruled) numbers, so a reviewer trusting green tests would not catch this.

**F-03 · medium · confidence 0.85 · `apps/designer-portal/src/components/document/spine/lens-ladder.tsx:41`**
What was asked: technical-design.md C-3 — `LensLadder(props: { …; tier: 'full'|'narrow'; … })`; OD-14 — "`LensLadder` takes `tier: 'full' | 'narrow'` (from the same `useMediaMatch('(min-width: 1440px)')` pattern as `job-ticket.tsx:116-134`)."
What shipped: `LensLadderProps` has no `tier` field at all. The two tiers are expressed with Tailwind breakpoint classes baked directly into the JSX (`min-[1440px]:hidden`, `hidden min-[1440px]:block`, etc.), with no `useMediaMatch` call anywhere in the file. This is plausibly a *better* choice — it avoids the hydration-mismatch risk a JS media-query read carries on first paint — but it is a different contract than the one the ARCHITECT wrote and countersigned, and it has no `deviations.md` entry. Judged against the plan's own "render once, class-based" instinct (the point of OD-15.3's "no `min-[1440px]:block`" rule for the *ladder's mount*), this choice is in the spirit of the rule but is not the specific contract that was ratified, and the gap was never logged.

**F-04 · low · confidence 0.8 · `apps/designer-portal/src/lib/document/lens-ladder-derivation.ts:524`**
What was asked: C-3 — `deriveLadderDoors(rows: readonly TicketRow[], input: TicketInput, held: boolean): LadderDoor[]`.
What shipped: `deriveLadderDoors(input: LadderDoorsInput): LadderDoor[]`, a single object bundling `ticket`, `held`, `routes`, and three `onOpen*` callbacks. Functionally equivalent and arguably cleaner; undocumented against the written contract.

**F-05 · low-medium · confidence 0.75 · `apps/designer-portal/src/lib/document/lens-ladder-derivation.ts:83`**
What was asked: C-3's `LadderDoor` = `{ key; label; onOpen }`.
What shipped: `LadderDoor` gains `href: string | null`, and `LensLadder` renders a door as a `next/link` `<Link href>` when set, a `<button onClick>` otherwise. This looks like a real functional necessity (the "page a leaf has of its own below 1440" the proposal itself describes for the room chip), but it is a contract field the ARCHITECT did not write and no deviation records it.

**F-06 · medium · confidence 0.7 · `apps/designer-portal/src/components/document/spine/lens-ladder.tsx:273`, `:300`**
What was asked: proposal.md §4 — "each room prints an indented **28px** sub-rung"; "`FILED WITH THIS JOB` … four **32px** doors."
What shipped: both room-rung buttons and door buttons use `min-h-11` (44px at this portal's 18px root, i.e. 49.5px per the same portal's own arithmetic quoted in `e2e-baseline.md`). Neither the six main segment rows (which correctly use `py-1` + a data-derived flex-basis, not a fixed row height) nor this pair match the ratified numbers. Plausibly a deliberate touch-target upgrade (44px is the app's common interactive-row convention, and 2.5.8's *pointer* floor is only 24px, so 44px is not wrong on accessibility grounds), but it is an unlogged deviation from the ratified geometry, and it changes the rail-ink arithmetic the proposal computed against 28px/32px.

**F-07 · low · confidence 0.7 · `apps/designer-portal/src/components/document/previous-work.tsx:56`**
What was asked: reconciliation.md's "Quiet regions" print table — `empty | Nothing yet (no count) …`.
What shipped: `status={hasHistory ? … : 'Nothing settled yet'}` — an extra word not in the ratified string. Low severity (it's a single-word paraphrase, not a wrong fact), but the whole design's discipline is exact-string fidelity, and this one isn't exact.

**F-08 · low · confidence 0.75 · `apps/designer-portal/src/components/document/__tests__/shelved-spine.test.tsx` (deleted content) / `apps/designer-portal/src/lib/document/__tests__/document-index.test.ts:77-83`**
What was asked: test-impact.md row 5 — `shelved-spine.test.tsx:188-196` **survives**.
What shipped: that exact test ("can never state an order the canonical paper order does not print") was deleted from `shelved-spine.test.tsx` (the whole describe block it lived in is gone — L1 gutted the file down to the room-lens tests) and an equivalent assertion ("never states an order the project spread does not print") was written fresh into the new `document-index.test.ts` by L2. The invariant is preserved and the new file's docstring says so explicitly ("The paper-order cases this file used to carry moved with the declaration they read"), so this is defensible engineering, but it is a relocation, not a survival, and the disposition table doesn't say to move it.

**F-09 · low · confidence 0.85 · `apps/designer-portal/src/components/document/spine-shelved-blocks.tsx:98-99`**
What was asked: program-plan.md's Census — "A file appears in exactly one lane per wave." L2's Wave-2 file list is `document-index.ts`, `use-document-running-index.ts` + its test.
What shipped: L2's own commit (`b303b3675`) also edits `spine-shelved-blocks.tsx` (+5 lines: `care: ''`, `record: ''` added to a `Record<DocumentIndexKey,string>` literal, to keep the type checker satisfied after widening `DocumentIndexKey`). L1's own commit (`c8644c499`) deletes the whole file per OD-16. Confirmed as flagged by the brief; recorded with the concrete diff. Mitigated by necessity (L2's own union-widening would not type-check otherwise) and by the file's wholesale deletion in the same wave, but it is a real ownership-rule violation.

**F-10 · low · confidence 0.6 · `apps/designer-portal/src/hooks/__tests__/use-document-running-index.test.tsx` ("commits the reading line to the jump target rather than walking there")**
What was asked: test-impact.md row 19 — `use-document-running-index.test.tsx` "survive; **EXTEND** late-mount attach."
What shipped: four new tests were added (late-mount, drops-an-unmounted-root, jump-lock), which matches "extend." But L2 also **changed** this pre-existing test's final assertion from `'money'` to `'record'` (and its comment) — not an extension, an edit to a survivor. The change is a plausible, likely-necessary consequence of `record` becoming an always-mounted index root for the first time in this wave (previously the last-region-wins behavior had no `record` root to land on), but it exceeds the disposition's stated scope and isn't called out anywhere as such.

**F-11 · info · confidence 0.9 · `program-plan.md` Wave 2 §L4 vs. `test-impact.md` rows 21/22**
Not a lane defect — a planning-document inconsistency. program-plan.md's Wave-2 narrative assigns "re-point `ffe-region-head.test.tsx:193`" to W2-L4, while test-impact.md (the "ratified" ledger, "not re-derived") assigns that file to **W4-L2** ("EXTEND quiet head") and marks `ffe-install-care-head.test.tsx` **SURVIVE (verify W2)**. L4's own commit (`536d60552`) follows test-impact.md: it adds a new describe block to `ffe-region-head.test.tsx` without touching line 193, and leaves `ffe-install-care-head.test.tsx` completely untouched (verified byte-identical against base in all four lanes). Flagging for the scribe/architect to reconcile the two documents; L4's behavior is correct against the more specific source.

**F-12 · info (confirmed non-issue) · confidence 0.9 · `spine/lens-ladder.tsx` `PROJECT_DOORS`, `mobile-sheets.tsx` sections sheet**
Both organs print "Mood boards" verbatim. Per the brief, this is expected pending the orchestrator's F62 rename to "Boards" at integration — not counted as a defect.

**F-13 · medium · confidence 0.6 · `apps/designer-portal/src/lib/document/lens-ladder-derivation.ts:538` vs. `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:331,581`**
What was asked: proposal §4 / OD-8 treat "four doors, every project spread" (now amended by OD-8 to "per spread") as one invariant the whole document states the same way, independent of width.
What shipped: `deriveLadderDoors` (L1, desktop ladder) pushes the `callsheet` door unconditionally whenever `input.ticket.project` is true — no feature-flag check. `mobile-sheets.tsx`'s sections sheet (L4) wraps its "Call sheet" row in `{callSheetOn && (…)}`, gating it on the pre-existing (lens-unrelated) `call-sheet` product flag. Since neither lane wires `page.tsx` yet (that's Wave-2 integration/L5's job, per the plan), it's possible L5 will filter the desktop door list by the same flag before it reaches `LensLadder` — but as shipped in these two branches, the two organs disagree on the door's default visibility rule. Flagging now per "report every deviation, never filter"; likely but not confirmed to reconcile at integration.

## Fixes required (before this wave can be called done)

1. **F-02** — Get the design lead to actually rule on the 126/117 vs. 100/116 head-reserve question (the choice `e2e-baseline.md` explicitly deferred), and either revert to the ratified 100/116, or record the 126/117 adoption as a numbered deviation in `build/design/deviations.md` with the W1 measurement cited as its basis. Either way, `technical-design.md`'s "Fixed numbers, declared once" line needs to say the true number.
2. **F-01** — Before Wave 3 starts, confirm (not assume) that `document-lens/w2`'s tree is a faithful superset of `7c8b33e39` — the reconciliation this time happened to be conflict-free; it should not be treated as validated merge discipline. Rebase future wave lanes onto the actual prior wave's integration tip, not onto a private ancestor.
3. **F-03, F-04, F-05, F-06** — Either bring the shipped code back in line with the written C-3 contract (add `tier`, revert the doors-input signature, drop `href`, use the ratified 28px/32px), or log all four as deviations in `build/design/deviations.md` with the ARCHITECT's sign-off, per the program's own rule that "every deviation [is] logged … and carried into I152."

## Should fix

- **F-07** — swap "Nothing settled yet" for "Nothing yet" to match the ratified string.
- **F-08** — note the `shelved-spine.test.tsx` → `document-index.test.ts` relocation in `test-impact.md` so the ledger stays accurate.
- **F-09** — nothing to change in code (the touched file is deleted anyway), but the wave's file-ownership table should note the cross-lane touch so it isn't repeated.
- **F-10** — call out the `'money'`→`'record'` assertion change explicitly in the wave's fix/commit log so a future reader doesn't mistake it for scope creep.
- **F-11** — reconcile program-plan.md's Wave-2 narrative with test-impact.md's row 21/22 dispositions for `ffe-region-head.test.tsx` / `ffe-install-care-head.test.tsx`.
- **F-13** — confirm at integration whether the desktop ladder's Call sheet door should also respect the `call-sheet` flag, and wire it the same way in both organs.
