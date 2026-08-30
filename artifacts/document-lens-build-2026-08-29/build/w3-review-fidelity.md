# W3 fidelity review — Smart Lens, `document-lens/integration` @ `4915583c2`

Reviewer: W3 FIDELITY REVIEWER (adversarial, read-only). Scope: `git -C .codex/worktrees/agent-lens-integration diff e6da8bd76..4915583c2`.
Read in full before writing this: `proposal.md` §§0–9 (Wave 3), `mock/final/FINAL.md` §§1,8,9,11, `build/design/reconciliation.md` (all rulings incl. W3-L2/W3-R1–R4), `build/design/technical-design.md` (OD-1…OD-16, state machine, DOM contract, cross-lane contracts), `build/design/deviations.md` (D-B1…D-B23).

**Verdict: ship-after-fixes.** Gating ids: **FID-01, FID-02, FID-03**.

---

## Gating findings

### FID-01 · Line 2 / standing sheet still sort by kind-tier, not the ratified deadline order — BLOCKER, confidence: high

- **Design says** (`reconciliation.md` §"W3-L2 rulings", **W3-R1**, ratified 2026-08-29): *"`rankStanding` sorts by **deadline distance** — things past their day first, most days overdue first; then things with a deadline ahead, soonest first; then things with no deadline (a silence), longest-standing first — and only within equal distance does the desk's `TIE_BREAK_RANK` break the tie… **neither the shipped `NEED_TIER` nor the desk's `TIE_BREAK_RANK`** [governs]… the fix lane replaces the four-tier sort with the deadline sort and keeps the tiers only as eyebrow words."*
- **Code does** (`apps/designer-portal/src/lib/document/lens-band-derivation.ts`): `rankStanding()` still sorts primarily by a fixed `TIER_ORDER` (`overdue:0, decision-due:1, damage:2, po-silence:3`), then by day-count within a tier, then by `standingSince`. This is exactly the four-tier kind-based sort the ruling says must be replaced — the tiers are still load-bearing in the `.sort()`, not "kept only as eyebrow words."
- On the shipped specimen (`VANDERSTEEN_NEEDS` fixture) the wrong sort happens to produce the same *visible* order as the correct one (overdue-6d, overdue-3d, damage/"closes tomorrow", po-silence/14d) because `damage`(2) sorts before `po-silence`(3) here by coincidence. But the rule is provably wrong in general: a `decision-due` item (tier 1) with a deadline weeks out will always rank ahead of a `damage` item (tier 2) closing tomorrow, which the ruling explicitly forbids ("things with a deadline ahead, soonest first").
- `lens-band-derivation.test.ts`'s `rankStanding` suite ("orders the specimen overdue-by-days, decision, damage, then PO silence") locks in the tier-based behavior and contains no case that would distinguish a true deadline sort from the shipped tier sort — the gap is untested.
- **Smallest fix:** replace `TIER_ORDER`-first sorting with a "days-until-deadline" numeric comparator (overdue = negative/past, ahead = positive, silence = `null`/treated as "worst," longest-standing wins ties), falling back to the desk's tie-break only on exact equality, per W3-R1's own words.
- Classification: **defect** (an explicit ratified ruling, unimplemented).

### FID-02 · "CLOSED BY YOU" is computed but never rendered anywhere — BLOCKER, confidence: high

- **Design says:** proposal §3 table, row **L-7**: *"the seam **gains the printed words `CLOSED BY YOU`**."* `technical-design.md` OD-10: *"`FoldSeam` takes `cause` as a prop."* `use-region-fold.ts`'s new `RegionFold.cause: 'CLOSED BY YOU' | null` is exactly this signal.
- **Code does:** `apps/designer-portal/src/components/document/region/fold-seam.tsx` is **untouched** in this diff (not in the diff `--stat`) and has no `cause` prop, no fourth grid slot, nothing that could print "CLOSED BY YOU". `git grep -n "cause="` across the whole diff finds zero product call sites — the only places `cause` is read are the hook's own tests (`use-region-fold.test.tsx`'s synthetic `Probe` component) and `use-region-fold.ts` itself. None of the five region components that render `<FoldSeam>` in this diff (`care-band.tsx`, `commercial/money-region.tsx`, `schedule/schedule-rule-region.tsx`, `approvals/project-approval-document.tsx`) pass a `cause` prop, because there is no prop to pass it to.
- Net effect: a designer who explicitly folds any region today sees byte-identical seam markup to before R127. "CLOSED BY YOU" — the one piece of new *content* L-7 adds — does not exist in the shipped UI, in either motion register.
- **Smallest fix:** add `cause?: 'CLOSED BY YOU' | null` to `FoldSeamProps`, render it (e.g. a fourth column, or appended to the summary), and thread `fold.cause` through from each of the five call sites.
- Classification: **defect** (dead code where the design specifies a printed contract).

### FID-03 · Standing sheet is missing W3-R2's `INPUT NEEDED · N` section — MAJOR, confidence: high

- **Design says** (`reconciliation.md`, **W3-R2**, ratified 2026-08-29): *"the sheet prints `Standing · N` (**N = exceptions + open inputs**) with the exception rows first…, then a rule and a second heading **`INPUT NEEDED · N`** whose rows print `label · owner · blocks <stage>`… The fix lane makes `standing-sheet.tsx` take `inputs: LensInputItem[]` beside `items`."*
- **Code does:** `apps/designer-portal/src/components/document/standing-sheet.tsx` takes only `items: readonly LensStandingItem[]`, titles `` `Standing · ${items.length}` `` (exceptions only, no `+ open inputs`), and renders one `<ul>` with no second heading, no `inputs` prop, no `INPUT NEEDED` section anywhere.
- This also means the guide's leftover "inputs" data (e.g. `Client signature · Client · blocks Project activation`) has **no destination at all** post-Wave-3 — W3-R2's stated reason for keeping them ("(b) The inputs … must survive — in the standing sheet, as their own section") is unmet.
- **Smallest fix:** widen `StandingSheet`'s props with `inputs: LensInputItem[]`, render the exception `<ul>`, then (when `inputs.length > 0`) a rule + `INPUT NEEDED · {inputs.length}` heading + a second `<ul>` of input rows; update the title's count to `items.length + inputs.length`.
- Classification: **defect** (explicit ratified ruling, unimplemented).

---

## Non-gating findings

### FID-04 · The band's pin/yield trigger is not the sentinel the design specifies, and the substitution is unlogged — MAJOR, confidence: medium

- **Design says:** `technical-design.md` §2 state machine: `rest → reading` is triggered by *"`#doc-ticket-sentinel` leaves the viewport (IO, `threshold: 0`)"*, written as *"React state **in `lens-band.tsx`** (`pinned`)"*. §5 DOM contract: `data-lens-open` is written by *"React (`pinned` state from the sentinel IO)"*.
- **Code does:** `LensBand` takes `open` as an **external prop**, computed by `useLensFrame()` in `page.tsx` from an `IntersectionObserver` on `#document-project-status` — the whole letterhead `<header>`, a different element with different geometry than the one-pixel sentinel. `#doc-ticket-sentinel` is rendered (as the band's immediate previous sibling, for the DOM-order test) but is never the target of any `IntersectionObserver` in the diff (confirmed by grep across the full diff) — its only functional consumer is the `sentinel!.nextElementSibling === band()` assertion in `page.test.tsx` / `lens-band.test.tsx`.
- Practically the two thresholds are close (the sentinel sits ~16px below the letterhead's own bottom edge, the `mb-4` margin on the header), so the visible discrepancy is small, but it is a real, unlogged substitution of the mechanism the spec names — not present in `deviations.md`'s D-B list.
- Separately, `data-lens-state` is written on the band's own `<section>` (values `rest|reading` only) rather than on `[data-document-shell]` as the DOM contract table specifies (`rest|reading|editing|mobile`). This is very likely deliberate staging — `use-lens-state.ts`, the "sole writer" of the shell attribute per **D-B19**, is explicitly a Wave-4 (`W4-L1`) deliverable — so I read this half as informational, not a defect.
- Classification: **candidate deviation needing a ruling** (the geometry substitution) — smallest fix is either to log it in `deviations.md` with the measured offset, or to give `LensBand` its own sentinel-based observer as originally specified.

### FID-05 · L-1's reduced-motion form has a real ~90ms blank gap — MINOR, confidence: high

- **Design says:** proposal §3, row **L-1**, reduced-motion column: *"the new sentence is **printed instantly in place** — same words, same terracotta, **no crossfade**."*
- **Code does:** `lens-band.tsx`'s sentence-turn state machine (`turning` + `window.setTimeout(…, LENS_TURN_OUT_MS /* 90 */)`) runs unconditionally — there is no `matchMedia('(prefers-reduced-motion: reduce)')` check anywhere in the file. `motion-reduce:transition-none` removes the CSS *easing*, but the JS still sets the outgoing sentence's opacity to 0 immediately and holds the *old* DOM node invisible for the full 90ms before swapping in the new text. Under reduced motion the line still goes blank for ~90ms rather than swapping "instantly in place" with no gap.
- The automated instrument (technical-design §6, sentence (d): comparing the visible-word set between `reduce`/`no-preference` "at each state") samples steady states, so this transient gap likely isn't caught by CI.
- **Smallest fix:** branch on `prefers-reduced-motion` in the effect and, when reduced, `setPrinted`/clear `turning` synchronously (no `setTimeout`).

### FID-06 · The rail head's "4 OF 6" never turns `--text-primary` — MINOR, confidence: high

- **Design says:** `reconciliation.md` §7, **RF-02**: *"at s0 the rail head yields the stage phrase only; `Vandersteen` (13px) and `4 OF 6` **stay printed and turn `--text-muted`** while the letterhead is in frame, **returning to `--text-primary` when it leaves**."* (Also DL-10/A-10, countersigned.)
- **Code does:** `doc-spine.tsx` correctly toggles the household `<p>` between `text-[var(--text-muted)]`/`text-[var(--text-primary)]` based on `letterheadInFrame`. But `stagePhrase.bottom` ("4 OF 6") is a plain `<span>` with no color class of its own; it inherits color from the parent `<p data-spine-stage-phrase>`, whose class (`text-[var(--text-muted)]`) is **static and unconditional**, unchanged by this diff. "4 OF 6" is therefore always muted — it never becomes `--text-primary` at s1+, contrary to the ruling. (`stagePhrase.top`, the actual stage name, correctly fades to `opacity-0` on yield, which is the more visually significant half of L-6 and is implemented correctly.)
- **Smallest fix:** move `stagePhrase.bottom`'s color out of the parent `<p>` into its own span with the same `letterheadInFrame`-driven muted/primary ternary the household `<p>` uses.

### FID-07 · Approvals' open-state region lost its internal `py-6`, apparently unintentionally — MINOR/MEDIUM, confidence: medium

- `approvals/project-approval-document.tsx`'s open-state root changed from `className="mt-6 min-w-0 border-y border-[var(--border-subtle)] py-6"` to `className="mt-[var(--doc-region-gap)] min-w-0 border-y border-[var(--border-subtle)]"` — `py-6` (24px top+bottom internal padding, keeping the region's own content clear of its `border-y` rules) was dropped entirely, not merely replaced. `RegionRule` and `FoldSeam` add no margin of their own (confirmed: `region-rule.tsx` is border-only, no margin), so the region's head/content now sits flush against its own top and bottom borders.
- Nothing in `proposal.md`, `reconciliation.md` or `technical-design.md` calls for removing this internal padding — the `--doc-region-gap` token is specified as the gap *between* region roots, not a region's own internal breathing room. This reads as an unintended side effect of the `mt-6 … py-6` → `mt-[var(--doc-region-gap)]` string replacement rather than a ruled simplification.
- **Smallest fix:** restore `py-6` (or an equivalent) alongside the new `mt-[var(--doc-region-gap)]`.

### FID-08 · `--doc-landing-clear`'s literal formula silently diverges from spec, unlogged — NIT, confidence: medium

- **Design says** (proposal §4, `technical-design.md` "Fixed numbers"): `--doc-landing-clear: calc(var(--doc-band-height) + 1rem)` = 72px.
- **Code does:** `globals.css` declares `--doc-landing-clear: calc(var(--doc-band-height) + 16px)`, with a comment explaining that this route's root font-size is 18px, so a literal `1rem` would compute to 74px, not 72px. The fix is arguably *more* correct than the literal spec text (it hits the intended 72px number the falsifiable sentences and SC1/SC2 depend on), but the substitution isn't recorded in `deviations.md`, so a future reader diffing the CSS against `technical-design.md` will see an unexplained mismatch.
- **Smallest fix:** add a one-line `deviations.md` row noting the 18px-root correction.

### FID-09 · `deriveRedLetterModel` is dead code — NIT, confidence: medium

- `red-letter-zone.tsx` exports `deriveRedLetterModel()` (the "model provider" OD-8/C-6 calls for) and it's unit-tested, but `page.tsx` never imports or calls it — `bandNeeds` is fed directly from raw `redLetterRows`. Functionally equivalent today (the model mostly passes rows through unchanged), but the `primary` field the model computes is entirely unused, and the model-provider pattern the design describes isn't actually the code path in production.

### FID-10 · "add the schedule content block's reserved height" — not identifiable in the diff — INFO / not statically verifiable, confidence: low

- Proposal §9 Wave 3's `globals.css` bullet list includes "add the schedule content block's reserved height" alongside the declared tokens and clearance rules. The `--doc-quiet-reserve-min`/`-exc` tokens (68px/112px, OD-12) ARE declared in this diff, but nothing consumes them yet — no `min-block-size` rule, no `data-density` selector anywhere in the CSS or component diffs. Since Wave 4 owns the actual density/quiet-rendering machinery (confirmed: no component in this diff branches on `fold.density` at all — `grep` for `.density`/`density ===` outside the hook/tests returns nothing), this is very likely a deliberate stub rather than a Wave 3 regression. Flagging because the bullet is explicitly listed under Wave 3 in the proposal and I could not confirm it shipped.

---

## Item-by-item pass (per the review brief)

1. **Line 1 content per spread kind** — MET for `project`/`install`/`care`/`brief`/`discovery`/`direction` per OD-1's table (identity·stage·rightFlush/moneyOnly, absent-never-placeholder confirmed via `rightSlot()`'s `default:` branch returning `{null,null}`). `proposal` spread's `proposalInvestment: null` matches W3-R4's explicit acceptance ("acceptable... prints nothing, never a placeholder"). Yield-to-money-stop (`INSTALL SEP 15` alone while Money is the reading stop) confirmed in `rightSlot()`.
2. **Line 2 — worst standing exception + act, `+N MORE`, guide sentence, s0 form** — content/structure MET; **ranking order is a BLOCKER (FID-01)**. Truncation order (act shortens, then qualifier, never digits/room/`+N MORE`) MET per `truncateLine`/`shortenAct`/`trailingQualifier`.
3. **Standing sheet — title, row form, 390 form, focus return** — title format MET but count wrong (**FID-03**); row form (eyebrow/sentence/act) MET; 390 form MET (same `DocSheet`, `fixed inset-0`); focus return via `fallbackFocusRef` MET.
4. **Typography** — line 2 at 15px MET; line 1 11px mono MET; mono eyebrows (standing sheet, ladder) MET; band paper ground (`bg-[var(--doc-paper)]`) and rule (`doc-rule-mid`, inside box-border) MET; letterhead 40px title kept MET (unchanged in diff).
5. **56px declared height, `--doc-landing-clear` 72** — MET; both are declared constants, `[data-lens-band]` uses `h-[var(--doc-band-height,56px)]` `box-border`, no `ResizeObserver` anywhere in the diff. `--doc-landing-clear`'s literal formula diverges from spec text but resolves to the correct 72px (**FID-08**, nit). `lens-band-height.spec.ts` correctly exercises all 18 cells + SC1(≤405) + SC2(≤108).
6. **`--doc-region-gap` 24px on every stop root, nowhere else; folded rule = mid; `CLOSED BY YOU`** — region-gap application MET across approvals/schedule/schedule-rule/ffe/money/care/record, with the FF&E room-head exception correctly at 12px and colophon correctly untouched (`mt-14` not in diff). Fold-rule-mid MET at all three call sites (money-region, schedule-rule-region, project-approval-document). **`CLOSED BY YOU` is a BLOCKER (FID-02)** — computed, never printed.
7. **Letterhead: `pb-4`, instruments ledger at ≥1180 and 390 (D-B20), 40px title kept** — MET. `doc-letterhead.tsx`'s `pb-5→pb-4` confirmed; `grid-cols-1 → min-[1180px]:grid-cols-[1fr_auto]` correctly stacks (not hides) the ledger below 1180, matching D-B20's ratified correction; title/StrataMark unchanged.
8. **L-1…L-6 reduced-motion forms** — L-2/L-4/L-5/L-9/L-10/L-11 are out of this diff's scope (ladder/density/press mechanics live elsewhere or in Wave 4) or already correctly deferred. L-1 has a real gap (**FID-05**, minor). L-3 (ladder segment yield) isn't in this diff at all (lives in `lens-ladder.tsx`, untouched) — not verifiable here. L-6 is mostly correct but incomplete (**FID-06**, minor, the "4 OF 6" color). L-7's new content is entirely unwired (**FID-02**, blocker) — its reduced-motion form (already covered by the existing no-preference-gated keyframes, per D-B21's note) is therefore moot since the base state never prints.
9. **`lens-band-height.spec.ts` vs §9's 18 cells + SC1 + SC2** — MET exactly: 2 papers × 3 widths × 3 offsets = 18 cells, separate SC1 (≤405, printed) and SC2 (≤108, printed) tests, chromium+webkit only (Firefox skipped with reason), token-vs-box double assertion.
10. **§9 Wave 3 acceptance bullets** — see the table below.

| Bullet | Status |
|---|---|
| New `lens-band.tsx`: two lines, yields, declared height, one `aria-live`, sentinel, nowrap+ellipsis | Met, with FID-05 (reduced-motion gap) as a caveat |
| `job-ticket.tsx` deleted (sentinel/observer/pin effect/seam publication) | Met |
| `ticket-derivation.ts` unchanged | Met (not in diff) |
| `page.tsx`: ticket mount/composition gone; `LensBand` takes position; guide/red-letter ternary deleted → model providers; instruments move into letterhead ≥1180 and print at 390; `FolioLetterhead` stays; `MobileMarginChips` doesn't move | Met |
| `red-letter-zone.tsx`/`document-guide.tsx` become model providers, component names stay | Met structurally; `deriveRedLetterModel` is dead code in practice (FID-09, nit) |
| `overlays/doc-sheet.tsx`: standing sheet as new `kind` | Met (`kind` prop, `data-doc-sheet-kind`) |
| `doc-letterhead.tsx`: instruments ledger, `pb-4`, arc/title kept | Met |
| `use-region-fold.ts`: `latchedDefault` → initial density, this wave | Met (matches Wave-3-only scope; Wave-4's D-B15 amendment correctly not yet applied) |
| `globals.css`: region-gap/band-height/landing-clear declared; `:1026/:1034/:1037` repointed; focusable clearance + `scroll-padding-bottom: 60px` added | Met |
| `globals.css`: "add the schedule content block's reserved height" | Not verifiable / possibly missing (FID-10, info) |
| `money-region.tsx:48` `SEAM_CLEARANCE` reads `--doc-landing-clear` | Met |
| Region wrappers take `--doc-region-gap`; FF&E room head exception 12px; colophon untouched | Met |
| Folded rule step at 3 call sites; `region-rule.tsx` untouched | Met |
| Tests: `job-ticket.test.tsx` deleted; page.test.tsx ticket describe rewritten with sentinel/selector-rename survivors; responsive-document-shell room-in-hand rewritten; new `lens-band-height.spec.ts` | Met (spot-checked; a dedicated correctness pass should verify every assertion migrated 1:1) |

---

## Files referenced

- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/lib/document/lens-band-derivation.ts`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/lens-band.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/standing-sheet.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/region/fold-seam.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/region/use-region-fold.ts`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/doc-spine.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/doc-letterhead.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/hooks/use-lens-frame.ts`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/components/document/red-letter-zone.tsx`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/src/app/globals.css`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/e2e/document/lens-band-height.spec.ts`
- `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-integration/apps/designer-portal/e2e/helpers/lens.ts`

---

## Sign-off — fix lane `document-lens/w3-fix` @ `3fb009c4b` over `integration@4915583c2`

Reviewed read-only in `.codex/worktrees/agent-lens-w3-fix`; scope `git diff 4915583c2..3fb009c4b` (49 files). New rulings consumed: `deviations.md` D-B24 (two forms, one trigger), D-B25 (margin-handoffs re-point), D-B26 (letterhead grid, dedupe), D-B27 (FF&E forceOpen); `reconciliation.md` W3-R1 (deadline sort, ratified), W3-R2 (INPUT NEEDED section, ratified), W3-R3 (390 ledger, ratified), W3-R4 (letterhead at 390, amended in place). Cross-checked against `build/w3-fix-log.md`'s own per-id ledger rather than trusting it — every "Closed" row below was independently re-derived from the diff.

**Verdict: SIGNED.** No ids gate.

### Per-id disposition

| id | status | evidence |
|---|---|---|
| FID-01 (deadline order) | **CLOSED** | `lens-band-derivation.ts:446-465` — `rankStanding` now sorts by `sense` (past/ahead/none) → `distance` → (silences only) `standingSince` → `needTieBreakRank` → input order; `TIER_ORDER` deleted, tiers kept only as eyebrow words. Falsified by `lens-band-derivation.test.ts`'s "puts a window closing tomorrow above a decision due weeks out" and `page.test.tsx:1561` ("leads line 2 by deadline distance, and files the rest" — asserts a 1-day-ahead damage window beats a 21-day-ahead decision, which is exactly the cross-tier failure mode FID-01 named). `D-B26` dedupe (`namesMoney` → `rightSlot()` drops the money half) verified in the same file and covered by three jest cases on the `…d5` shape. |
| FID-02 (CLOSED BY YOU unwired) | **CLOSED** | `fold-seam.tsx:29-34` (`FoldSeamProps.cause`), `:82` (`<span data-fold-cause>` printed inline beside the truncated summary, inside the existing 3-column grid — no fourth column, so the 44px one-line control survives). `git diff` shows exactly 7 call sites now pass `cause={fold.cause}` (`care-band.tsx`, `commercial/money-region.tsx` ×2 branches, `schedule/schedule-rule-region.tsx`, `approvals/project-approval-document.tsx`, `ffe-section.tsx`, `schedule/schedule-spine.tsx`). Falsified by `use-region-fold.test.tsx`'s "prints CLOSED BY YOU only once the designer has folded it herself" and the updated `fold-seam.test.tsx`. |
| FID-03 (standing sheet missing INPUT NEEDED) | **CLOSED** | `standing-sheet.tsx:37` (title = `` `Standing · ${items.length + inputs.length}` ``), `:91-107` (`[data-standing-input-heading]` "INPUT NEEDED · N" under a rule, `[data-standing-input-row]` rows below the exceptions). `page.tsx:1822-1829` builds `LensInputItem[]` from `guideInputs`: `eyebrow` = the label's last word (`"Client signature"` → `SIGNATURE`), `sentence` = `` `${label} · ${owner} · blocks ${blocks}` ``, `act` = the guide's act — matches W3-R2 verbatim. |
| FID-04 (pin mechanism substituted, unlogged) | **CLOSED** | `lens-band.tsx:76-95` — the band now owns its own `IntersectionObserver` on its own `#doc-ticket-sentinel` (`sentinelRef`), computing `open` internally and reporting it up via `onPinChange` (new prop). `page.tsx` no longer passes `open`/`letterheadInFrame` into `LensBand` — confirmed by grep: `letterheadInFrame` now has exactly one consumer, `DocSpine` at `page.tsx:2173` (the rail head's L-6 yield only). This is the exact mechanism the original technical-design specified. `data-lens-state` on the band is gone (C-01), matched by a jest case asserting its absence in both states. |
| FID-05 (L-1 reduced-motion blank gap) | **CLOSED** | `lens-band.tsx:46-49` (`prefersReducedMotion()`, SSR-safe), `:107-111` (swaps `printed`/`turning` synchronously, no `setTimeout`, when reduced motion is active). Falsified by `lens-band.test.tsx:317`, "swaps instantly under reduced motion — no blank window at all (FID-05)" — drives a reduce-matching `matchMedia` and asserts the new words are on the page immediately with no timer run. |
| FID-06 ("4 OF 6" never returns to primary ink) | **CLOSED** | `doc-spine.tsx:247-259` — `stagePhrase.bottom` now renders in its own `<span data-spine-stage-count>` with its own `letterheadInFrame`-driven muted/primary ternary, independent of the parent `<p>`'s unconditional muted class. |
| FID-07 (approvals lost `py-6`) | **STILL OPEN — disagree it is "not a defect."** | Confirmed still present: `project-approval-document.tsx`'s open-state root is still `mt-[var(--doc-region-gap)] min-w-0 border-y border-[var(--border-subtle)]`, no `py-6`, no compensating margin anywhere in `RegionRule`/`FoldSeam`. The fix lane's own log names this explicitly and correctly declines to touch it ("NOT implemented, per the brief" — deleting/restoring an unrelated class wasn't in this lane's brief). I agree the fix lane was right not to touch it opportunistically. I do **not** agree it stops being a defect: it is a real, Wave-3-introduced visual regression (content now sits flush against the region's own top/bottom rules) that still needs a one-line fix and a home in some lane's brief. Non-gating for this sign-off; owed a ruling or a pickup. |
| FID-08 (`--doc-landing-clear` calc unlogged) | **NO-CHANGE ACCEPTED** | Genuinely a `deviations.md` bookkeeping gap, not code — the fix lane correctly leaves it (its own log: "the artefact is the design lead's file, not this lane's"). Agree. |
| FID-09 (`deriveRedLetterModel` dead code) | **NO-CHANGE ACCEPTED** | Still unreferenced in `page.tsx`; the fix lane correctly declines to delete an exported symbol outside its brief. Agree; nit, no functional impact. |
| FID-10 ("schedule content block's reserved height" / OD-12 stub) | **NO-CHANGE ACCEPTED — agree it is not a Wave-3 defect.** | Confirmed still just declared tokens (`--doc-quiet-reserve-min/-exc`), no consumer, no `data-density`-keyed CSS, no component branching on `fold.density` anywhere in this diff either. OD-12's actual consumer is a named Wave-4 (`W4-L1`) deliverable per the technical design and per this diff's own D-B27 (which explicitly reasons about `ffe-section.tsx`'s `RegionHead`-less branches in Wave-4 density terms). This is Wave-4 territory, not a Wave-3 gap. |

### New deltas found in this pass

- **NF-01 (medium confidence, medium severity — test-coverage gap, not a proven product defect).** `deviations.md`'s D-B24 explicitly commits, as part of "what ships," to a dedicated Playwright case in `lens-band-height.spec.ts`: mark the `…d5` seed's $17,500 invoice paid via `psqlRun` so the 76-character invoice sentence ranks worst, then assert at 390/s0 `data-lens-line2-form="short"`, `[data-lens-sentence]` text matching `/^OVERDUE \d+D · INV-2026-114$/`, no ellipsis (`scrollWidth <= clientWidth`), the `REMIND`-labeled act visible, `+N MORE` visible — and the *same* fixture printing `data-lens-line2-form="long"` at 1440. I grepped the whole `e2e/` tree and `lens-band-height.spec.ts` in full (381 lines, all `test(...)` titles listed): this specific case does not exist. What *does* exist is a jest-level twin in `lens-band-derivation.test.ts` (all 8 seeded items' short/long forms fit their measures) and a jsdom assertion of the `data-lens-line2-form` attribute in `lens-band.test.tsx` with a synthetic fixture. The underlying derivation is correct and unit-tested (I traced `shortSubject()`/`shortState()`/the budget arithmetic by hand against the mockup's own examples and they match), so I have high confidence the mechanism itself works — but the real-DOM, real-seed, no-ellipsis-and-correct-hit-target proof D-B24 calls for against the actual served page is missing. This is not in the fix lane's own "Closed" table under D-B24 (only the jest twin is claimed there), so it reads as a quiet, undisclosed scope-narrowing of a ratified deviation's own test plan rather than a deferred/ruled item. **Classification: candidate gap against a ratified ruling's stated test plan — recommend adding the e2e case before this specific claim ("the short form renders and is hit-testable in a real browser at 390") is treated as proven, but not gating this sign-off given the mechanism is otherwise verified.**
- **NF-02 (low confidence, nit).** `doc-letterhead.tsx`'s title now switches 32px→40px at Tailwind's generic `sm:` breakpoint (640px), not at the shell's real 1180px breakpoint that every other tier-sensitive element in this diff uses (`SharingTierInstrument`'s `WIDE_TIER = '(min-width: 1180px)'`, `useLensTier`'s `narrow`/`full` split). For the three ratified/tested widths (390, 1280, 1440) this is behaviorally identical to a 1180px boundary, so nothing in scope is affected — but a hypothetical width between 640–1179px (untested, and arguably "mobile" by every other measure in this codebase) would get the 40px title instead of 32px. Cosmetic, unlikely to matter given this app's real breakpoints, not gating.

### Overall

All three originally-gating findings (FID-01, FID-02, FID-03) are closed with direct code evidence and a falsifying test each. FID-04, FID-05 and FID-06 (non-gating majors/minors from the first pass) are also closed, and closed *correctly* — FID-04 in particular now matches the original technical-design's sentinel-owned-by-the-band mechanism exactly, which is a better outcome than merely suppressing the symptom. Nothing in the fix diff introduces a new blocker. FID-07 remains a genuine, open, non-gating defect outside this lane's brief; NF-01 is a test-plan gap worth closing but does not by itself cast doubt on the shipped mechanism.
