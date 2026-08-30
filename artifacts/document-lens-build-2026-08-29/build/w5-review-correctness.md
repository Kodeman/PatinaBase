# W5 — CORRECTNESS REVIEW (adversarial)

**Reviewed:** `document-lens/w5` @ `be8d1eaf0` in `.codex/worktrees/agent-lens-w5-int`
(`4f5291a63` + the `w4` tip merge `be8d1eaf0`), against
`git diff 4f803118b..HEAD`, restricted to Wave 5's own changes.

**Read first, as briefed:** `technical-design.md` OD-2 / C-2 / C-8 / OD-11 / OD-6 / §5 (the DOM table);
`reconciliation.md` W5-R1, W5-R2, W5-R3, W4-R1; `deviations.md` D-B30, D-B39, D-B27;
`program-plan.md` Wave 5; `test-impact.md`; `build/e2e-run-w5.log`, `e2e-run-w5-l2-r2.log`,
`e2e-run-w5-l3-r1.log`.

**Verdict: SHIP-AFTER-FIXES.**
Gating ids: **W5-C1, W5-C2, W5-C3, W5-C4, W5-C6, W5-C7** (+ **W5-C5**, gated on a measurement).

Wave 5's structural work is sound. The `only` split of `ProposalBlocksReadOnly` loses nothing and
doubles nothing; the Offer stays below every block; the `declared` change in `deriveLadderSegments`
still derives a project paper from `PROJECT_PAPER_ORDER` alone; `paperRegionFor`/`regionHeadingId`
throw on an undeclared key and every product caller is guarded; hook order is safe at every site
(`useMarginSheet` and `useLensDensity` both sit above `page.tsx`'s three early returns at `:2042`,
`:2052`, `:2074`; `PreworkRegion`'s single hook is unconditional); `marginCount` rides
`useMobileActiveDoc`'s `stateSig`, so the W4 `visibility` fix holds; the inline
`SectionLoadingLine` nests validly (a `<span role="status">` inside `RegionHead`'s status `<p>`);
`proposalInvestment` is currency-safe and spread-gated. What follows is everything else.

---

## BLOCKERS

### W5-C1 · `PreworkRegion`'s quiet form re-prints the count line and re-introduces the two strings W4-R1 deleted — BLOCKER · confidence high

**File:** `apps/designer-portal/src/components/document/prework/prework-region.tsx:87-96`

```tsx
{quiet ? (
  <>
    <p data-region-count-line className="mt-1 font-mono text-[11px] uppercase …">
      {status.toUpperCase()}
    </p>
    <p className="sr-only">Quiet — opens as you read</p>
  </>
) : (
  children
)}
```

`RegionHead` already prints `status` as the head's own line (`region-head.tsx:172`,
`<p className="text-[12.5px] text-[var(--color-mocha)]">{status}</p>`), and `PreworkRegion` passes
the same string into it at `:80`. At `quiet` the stop therefore prints its state **twice** — once
in 12.5px mocha serif, once again in 11px uppercase mono directly beneath it.

Both halves are exactly what W4-R1 deleted by name (`reconciliation.md:286`, fidelity F1–F3):
*"Everything W4-L2/L3 added beside the head — the invented uppercase count paragraph, the generic
`Quiet — opens as you read` string, the full act ledger — is deleted."* `technical-design.md` §5's
F5 note says the same of the attribute: *"W4-L2/L3's `data-region-count-line` … went with it under
W4-R1: the count line IS `RegionHead`'s status line, so there is no second element to name."*

The six project regions took that deletion in the `w4` tip that this branch merged, and their
suites now assert it:

| suite | asserts |
|---|---|
| `previous-work.test.tsx:162`, `:233`, `:262` | 0 `[data-region-count-line]`; no `Quiet — opens as you read` |
| `care-band.test.tsx:501`, `:554`, `:578` | same |
| `commercial/money-region.test.tsx:568`, `:652`, `:686` | same |
| `schedule/__tests__/ffe-region-head.test.tsx:391`, `:546` | same |
| `schedule/__tests__/schedule-region-head.test.tsx:464`, `:545`, `:589`, `:612` | same |
| `approvals/approvals-region-head.test.tsx:260` | same |

`prework-region.tsx:90` and `:95` are the **only two** remaining occurrences of either in the whole
tree (`grep` over `apps/designer-portal/src` + `e2e`).

It also **omits** W4-R1's ruled sr-only line — `<first segment> · not yet on the paper · press
<Name> on the index to open` — which every other quiet stop renders through
`quietStateSentence()` (`lib/document/lens-quiet-status.ts:185`, e.g.
`schedule-spine.tsx` quiet branch).

**Why nothing caught it.** Under jest the quiet branch is never rendered: jsdom returns all-zero
`getBoundingClientRect()`s, so `useLensDensity`'s layout-effect first pass (the "root already at or
above the lookahead line" path, `hooks/use-lens-density.ts`) promotes **every** root on mount, and
`useLensDensityStore` answers `'full'` for all of them. The e2e reads only the head's own line
(`prework-regions.spec.ts:70-76`, `[data-region-head] h2 + p`), so the extra paragraph is invisible
to it too.

**Failure scenario.** On `/doc/…d6` (and every brief/discovery/direction spread), each pre-work stop
below the 240px lookahead prints its status twice and announces a retired sentence to a screen
reader — while a `data-region-count-line` node that the DOM contract says does not exist re-enters
the paper.

**Smallest fix** — one hunk, mirroring the six:

```tsx
{quiet ? (
  <p className="sr-only">{quietStateSentence(status, name)}</p>
) : (
  children
)}
```

and add the `[data-region-count-line]` / `Quiet — opens as you read` absence pair to a new
`prework-region` jest case that drives the density store (`__setDensityForTest(null)`) so the quiet
branch is actually rendered.

---

### W5-C2 · the Margin sheet's "one inline act" performs no act — a button named `Send a nudge` opens a dialog — BLOCKER · confidence high

**File:** `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx`, the `'margin'`
branch (the `data-margin-row-act` button) and `marginRowActLabel` at `:352-374`

Each row renders two controls with **identical** handlers:

```tsx
<button onClick={() => openRow(row)} className="min-w-0 flex-1 …">   {/* body */}
<button data-margin-row-act onClick={() => openRow(row)}>{marginRowActLabel(row)}</button>
```

`marginRowActLabel` returns `Send a nudge` / `Nudge again` / `Reply` / `Review & send invoice` /
`File the claim`-class verbs. Pressing any of them opens the `margin-item` sheet.

D-B30's shipped contract (`deviations.md:64`) is explicit: *"each item row prints the mockup's form
— stamp, title, owner, and **one inline act button** (`data-margin-row-act`) **that is the item's
first act**, taken from the same act table the `'margin-item'` sheet renders … — with the row body
still opening the item sheet."* W5-R1 restates it ("each row's … own act"). The lane's own inline
comment argues for the change, but **no deviation id was minted and neither ruling was amended**.

Beyond the contract this is an accessibility defect on its face: a control's accessible name must
describe what it does, and here two controls in one row carry different names and the same
behaviour. `mobile-margin-sheet.spec.ts:131` only asserts the button *exists*;
`mobile-sheets.test.tsx` only asserts its *label text*.

**Smallest fix (one line + one paragraph):** rename the second control to what it does — `Open` —
and log a deviation amending D-B30's "one inline act" with the lane's own reasoning (the real act
needs the item's fetched detail). If the act is wanted for real, that is a larger hunk and belongs
in I152, not here.

---

### W5-C3 · the wave's own e2e list is not green: `lens-band-height.spec.ts` is RED at the integration HEAD and took 17 cases with it — including D-B30's own falsifier — BLOCKER · confidence high

**Evidence:** `build/e2e-run-w5.log` (ROUND 2, `be8d1eaf0`, the w4 tip merged)

```
  ✘   59 [chromium] › lens-band-height.spec.ts:156:11 › … is exactly 56px on the long paper at 390, at every offset (8.5s)
  -   60 … 56px on the pre-work paper at 1440 / 1280 / 390
  -   63 … D-B38 — line 2 holds its y across the pin at 1440 / 1280 / 390
  -   66 … SC1 — the first region head stands at or above 405px at rest, at 1440
  -   67 … SC2 — the band’s bottom edge is at or above 108px at scrollY 400
  -   68 … D-B30 — at 390 no margin-chips block prints and the first region head stands at or above 435px gross
  -   69 … 76  (the letterhead grid, the 44px act, both line-2 forms, W3-R7's three budget gates)
```

Seventeen cases "did not run". Among them is **`lens-band-height.spec.ts:272` — the falsifier
D-B30 itself names as W5-L3's acceptance** ("W5-L3's falsifier is that line's deletion"), the
three pre-work band-56 cases the program plan lists for W5, and W3-R7's three engine budgets.

The failing case was **green in Wave 4** at both engines — `e2e-run-w4-prod.log:64`,
`e2e-run-w4.log:62` (chromium) and `e2e-run-w4.log:227` (webkit) — so under risk R-F
("a newly-red spec is the wave's until triage proves otherwise") it is Wave 5's until triaged. The
likeliest cause is not W5's own hunks but the un-e2e'd `w4` tip commit `5beeb0568`
("a root above the reader keeps its box; the pre-work band is 56"), which is the only band change
in this diff range and post-dates `48758d597`, the sha the W4 logs were taken at.

The same log also carries **no `WEBKIT` section and no run summary** — the round-2 basket appears to
have stopped at chromium test 99. The wave's webkit half is unrecorded.

**Smallest fix:** triage case 59 at `be8d1eaf0` (bisect `5beeb0568` vs the W5 hunks), fix or ratify,
then re-run `lens-band-height.spec.ts` whole in chromium **and** webkit and paste the summary. Cases
60–76 must be *run*, not inferred: D-B30 has no other proof that the chips block is gone and the
first head cleared 435px gross.

---

## MAJOR

### W5-C4 · the only e2e proof that the line chips retired can never fail — MAJOR · confidence high

**Files:** `e2e/document/mobile-margin-sheet.spec.ts:85-87` ·
`src/components/document/mobile/mobile-margin-chips.tsx:178`

```ts
await expect(page.locator('[data-mobile-margin-chips="line"]')).toHaveCount(0);
```

`LineMarginChips` writes the attribute **bare** — `<div data-mobile-margin-chips …>` at `:178`,
i.e. value `""`. Only the letterhead branch carries a value (`:86`,
`data-mobile-margin-chips="letterhead"`). The selector matches nothing whether the chips print or
not, so the assertion is vacuous — and it is the sole falsifier for W5-R1's *"the line-anchored
chips retire at 390"*.

**Smallest fix:** give the line branch `data-mobile-margin-chips="line"` (one word at `:178`) and
keep the assertion; verify the change against `lens-band-height.spec.ts`'s
`[data-mobile-margin-chips]` selectors before landing it.

### W5-C5 · the head's eyebrow arrives after the fetch, above the reader — D-B39's own failure class, in a head — MAJOR · confidence medium-high (reasoned, not measured)

**Files:** `page.tsx` (`preworkEyebrow`, ~`:2172`; `briefEyebrow`/`discoveryEyebrow`, ~`:1831-1838`)
· `brief-section.tsx:52-58` · `discovery/discovery-section.tsx:271-274` ·
`region/region-head.tsx:160-164`

`RegionHead` renders the eyebrow as a *conditional* `<p>`:

```tsx
{eyebrow && (<p className="font-mono text-[11px] …">{eyebrow}</p>)}
```

Three feeds all arrive **after** first paint:

1. `preworkEyebrow` = `v{liveProposal.version} · {section.sub}` — undefined while `useProposal` is
   in flight, defined after. On `direction`/`proposal` this is the **first region on the paper**,
   directly under the letterhead and squarely in the reader's frame.
2. `briefEyebrow` — set from `BriefSection`'s `useEffect`, which cannot run until the `brief` region
   is promoted and `useLead` resolves.
3. `discoveryEyebrow` — same shape.

Each arrival inserts an 11px mono line box **above** the `<h2>`, pushing the name, the status line
and the whole paper below it down. That is H5's forbidden shift, and it is the same class D-B39
measured for `SectionLoadingLine` and W5-R3 has just ruled out — *inside the head this wave built*.

`lens-cls.spec.ts` cannot see it: the scroll case takes its baseline at the settled+quiet s0
(D-B39's own ruled precondition), by which point the query has resolved. The ungated initial-load
number in this very run is non-zero — `e2e-run-w5.log:100` `0.05411…`, `:104` `0.04835…`.

**Smallest fix:** reserve the line. Either render the eyebrow `<p>` unconditionally with a
`min-h-[15.4px]` (the same literal D-B38 uses on band line 1) whenever the region can carry one, or
gate the whole head on `prework.settled` — which the derivation already computes
(`lens-ladder-derivation.ts` `LadderPreworkFacts.settled`) — so head and eyebrow commit together.
Then measure: the initial-load CLS on `…d6` must not carry an entry attributable to the eyebrow.

### W5-C6 · `scope`'s rail value is `4 ROOMS`, not W5-R2 §2's ratified `4 ROOMS IN SCOPE` — MAJOR · confidence high

**File:** `src/lib/document/lens-ladder-derivation.ts`, `scopeRegister`

```ts
value: cap(`${facts.scopeRooms} ${word}`, LENS_VALUE_MAX_CHARS),
narrowValue: cap(`${facts.scopeRooms} ${word}`, LENS_VALUE_MAX_CHARS),
countLine: cap(`${facts.scopeRooms} ${word.toLowerCase()} in scope`, …),
```

W5-R2 §2 (already ruled, flagged here as a **contradiction** per the brief):
*"`Scope & engagement` prints **`4 rooms in scope`** (ladder value **`4 ROOMS IN SCOPE`**, 16 chars
≤ 30)."* The count line is right; the rail's value drops "IN SCOPE", so the rail and the paper state
the stop two ways — the exact thing `preworkStatus`'s one-derivation design exists to prevent.

**Smallest fix:** `` cap(`${n} ${word} IN SCOPE`, LENS_VALUE_MAX_CHARS) `` for both `value` and
`narrowValue`. Re-check the OD-14 floor (`floorFor`): 16 chars is one line at the 23-char full
measure, two at the 15-char narrow measure — so `narrowFloorPx` moves 36 → ~39, inside the track.

### W5-C7 · `MobileMarginChips` is unreachable in both branches, and the contract that names it now proves nothing — MAJOR · confidence high

**Files:** `mobile-margin-chips.tsx` · `ffe-section.tsx:519` ·
`lib/document/__tests__/handoffs-in-margin-contract.test.ts:96-105`

- **letterhead branch.** Its only product call site was deleted from `page.tsx` this wave. The
  component's root also carries `min-[980px]:hidden` (`:87`), so even the hypothetical ≥980 caller
  the file's own comment claims it is "kept for" (`:9-12`) would see nothing. It is dead.
- **line branch.** Still mounted per FF&E line at `ffe-section.tsx:519`. Below 980 `useBelow980()`
  returns `null` (`:171`); at ≥980 the same `min-[980px]:hidden` (`:179`) hides it. It cannot print
  at any width — while still running `useMarginItems` + `useCoordinationItems` +
  `classifyMarginItems` **once per FF&E line** (62 lines on `…d5`) at 390.
- **the contract.** `handoffs-in-margin-contract.test.ts` used to read
  `expect(spine).toContain('raised.length + handoffGates.length')`. It now reads:

  ```ts
  expect(chips).toContain('useLetterheadMargin');      // ← dead component
  expect(spine).toContain('useMarginSheet');
  expect(marginSheetHook).toContain('useHandoffGates');
  expect(marginSheetHook).toContain('gates.length');   // ← satisfied by `count:` alone
  ```

  The test's own sentence is "counts **and lists** them". `gates.length` in `use-margin-sheet.ts`
  is satisfied by `count: allItems.length + gates.length` with no listing anywhere; the actual
  listing (`gates.map` in `mobile-sheets.tsx`'s `'margin'` branch) is no longer asserted by any
  source-text contract.

**Smallest fix:** delete `LetterheadMarginChips` + `useLetterheadMargin` + the `ffe-section.tsx:519`
mount (and `mobile-margin-chips.test.tsx`'s letterhead cases with them), and re-point the contract's
"lists them" half at `mobile-sheets.tsx` (`expect(spine).toContain('gates.map')`). If the component
is to be kept, drop `min-[980px]:hidden` from the letterhead branch and say in the comment which
caller it serves.

---

## MINOR

### W5-C8 · `AccountBand`'s loading branch fabricates a full title row W5-R3 did not rule — MINOR · confidence high
`account-band.tsx:218-237`. The block `SectionLoadingLine` is replaced by a hand-built skeleton
printing the literal words *"The accounts · this project"* and *"Studio eyes only"* before any data
exists, in a `<div>` where the loaded band renders a `<button>`. The box **does** match the loaded
row (same wrapper classes, grid, padding, type sizes), so the CLS intent holds. But W5-R3's ruled
form is "the same pearl bar … as the last inline child of the head's count line (or … the nearest
printed line above it)"; here there was no line above, so the lane invented one. Either log it for
the design lead's countersign, or fall back to the block form on this one site — W5-R3's own "the
block form stays where the line stands in for a body that does not exist yet" arguably covers it.

### W5-C9 · `Margin · 0` prints, and the door's label churns on load — MINOR · confidence high
`mobile-bar.tsx:137` prints the door whenever `marginCount !== null`; `page.tsx` always publishes a
number (`useMarginSheet().count`, 0 while `useMarginItems` is in flight). So More leads with
`Margin · 0` on any document with an empty margin — opening a sheet that reads "The margin —
decisions, messages, and money gather here." — and the label flips `Margin · 0` → `Margin · 7` when
the query lands. D-B30 rules no zero-suppression, so this is a judgement call, not a violation.
Fix if wanted: `marginCount ? […] : []`.

### W5-C10 · `Not written yet` / `Not sent yet` sit outside OD-2's two-string vocabulary — MINOR · confidence high
`lens-ladder-derivation.ts` `registerFor` returns `empty('Not written yet')` for `vision` and
`proposalRegister` returns `empty('Not sent yet')` for an unsent proposal.
OD-2: *"A stop with no number prints its name over `NOTHING YET` (exists, empty) or `NOT KNOWN YET`
(unknowable on this spread) — sentences, never a dash."* W4-R1's missing-fact rule names the same
two. `prework-regions.spec.ts:51-54` then ratifies **three** sentences in the spec rather than in a
ruling. The rail's fallback is still the `empty()` default `NOTHING YET`, so only the paper's count
line carries the new strings, and W5-R2 §1's interim text did use "Not written yet". Wants a
one-line ruling in `reconciliation.md` or a collapse to the two.

### W5-C11 · `overdueCount` has no kind filter; "money is never counted" is the DB view's invariant, not the code's — MINOR · confidence high
`use-margin-sheet.ts:239-244` counts `row.state === 'overdue'` across every kind, while `:151-152`
documents *"Overdue DECISIONS only — money is never counted (W5-R1)"*. It happens to hold because
`margin_items` (`supabase/migrations/00219_coordination_read_models.sql:107-111`) writes `'overdue'`
only in the decision branch; the invoice branch passes `inv.status` through, whose CHECK
(`00178_invoices_v1.sql:36`) is `draft|sent|partially_paid|paid|void`. The jest case named
*"counts an overdue decision regardless of anchor kind, and never counts money"*
(`use-margin-sheet.test.ts:225`) proves the second half with an invoice in state `'sent'` — which
any implementation would exclude, so it cannot fail. Fix:
`allItems.filter(r => r.kind === 'decision' && r.state === 'overdue')`, and change that fixture to
`state: 'overdue'` so the assertion has teeth.

### W5-C12 · the margin row prints no overdue stamp, and the test title claims one — MINOR · confidence high
D-B30's measurement of `#sheet-margin-390` names per row *"a stamp (`OVERDUE 6 DAYS`, `CLOSES
TOMORROW`, `14 DAYS NO ACK`), the title, `OWNER …`, and one inline act"*. The shipped row prints
`deriveKindLine(row)`, title, owner, optional line label, act — no stamp; `overdueStampLabel` is
imported in `mobile-sheets.tsx` but unused there. `mobile-sheets.test.tsx`'s case is titled *"lists
every item the hook yields, each with a **stamp**, title, owner, and one inline act"* and asserts no
stamp. Either add `overdueStampLabel(row)` as the row's first line, or drop "stamp" from the title
and log the simplification.

### W5-C13 · `marginRowOwner` prints `Client / Vendor / You / Field`; D-B30's row form names `OWNER CLIENT/DESIGNER/MAKER` — MINOR · confidence medium
`mobile-sheets.tsx:322-343`. No test pins the vocabulary. Fidelity, for the design lead.

### W5-C14 · the line-anchored jump is best-effort, and its e2e proof is a race — MINOR · confidence high
`mobile-sheets.tsx`'s `openRow` scrolls `#ffe-selection-<anchor_id>` with optional chaining. That
element does not exist while the `ffe` region is quiet or its query is loading, and the jump does
not take the L-10 lock (`lens.forceFullThrough('ffe')`) the rail's own jump takes — so the scroll can
silently no-op and the item sheet opens over an unmoved paper.
`mobile-margin-sheet.spec.ts:150-159` proves it with
`expect(scrollYAfter).not.toBe(scrollYBefore)` read immediately after a `behavior: 'smooth'` scroll:
a timing race, and a sentence that proves the page moved rather than that it moved to the line.
Fix: route through `requestRegionUnfold('ffe')` + `forceFullThrough('ffe')` first, and assert the
target's `getBoundingClientRect().top`.

### W5-C15 · `useBelow980` writes state from an effect on every mount — MINOR · confidence high
`mobile-margin-chips.tsx:42-48` calls `setBelow(mq.matches)` unconditionally inside the effect, so
every `LineMarginChips` commits twice on mount — 62 extra commits on `…d5`. Harmless (the
initializer already read the same value). On SSR/hydration the design is safe only because
`page.tsx` early-returns on `!hydrated` (`:2042`), so this component never renders on the server;
the initializer reads `window.matchMedia` on the client's first render and *would* mismatch a
server-rendered block. Worth the comment, since the guard lives two files away.

### W5-C16 · `deriveLadderSegments`'s `declared` path lost the old normalisation — MINOR · confidence high
`lens-ladder-derivation.ts`: `PROJECT_PAPER_ORDER.filter(...)` → `input.ticket.paperRegions.map(paperRegionFor)`.
The brief's question answers cleanly: **a project paper still derives from `PROJECT_PAPER_ORDER`
only** — `ticket-derivation.ts:244` builds `paperRegions` from `paperRegionsForSection`, whose
`project` row *is* `PROJECT_PAPER_ORDER` and whose `install`/`care` rows are filtered through it
(`document-index.ts:163-168`). What the change gives up is the free de-dup/re-order: a repeated key
now yields two segments with the same `key` (duplicate React keys, two `aria-current` candidates),
and an unknown key now throws out of the derivation and takes the page down rather than being
dropped. No caller can produce either today — a hardening note, not a live defect.
Fix if wanted: `Array.from(new Set(input.ticket.paperRegions)).map(paperRegionFor)`.

### W5-C17 · `scope` prints `Reading…` for a number it already has — MINOR · confidence high
`prework.settled` (`page.tsx`) is `!proposalId || liveProposal !== undefined || proposalIsError` —
a fact about the **proposal** query. `scopeRegister` gates on it, but `scopeRooms` comes from
`ticketInput.rooms.list`, not from `liveProposal`. So while the proposal read is in flight the
`scope` head prints `Reading…` and then swaps to `4 rooms in scope` — a count-line text change,
which W5-R3 rules against for the loading register (the box is one line either way, so no shift).
Fix: gate `scopeRegister` on nothing, or on a `roomsSettled` fact of its own.

### W5-C18 · the proposal spread's lifecycle instruments now live inside a region that unmounts its children at quiet — MINOR · confidence medium
`PreworkRegion` renders `children` only when `density !== 'quiet'`. The `proposal` region now holds
`FinalizeHead` + `ProposalInstruments` + `ProposalFolioStrip`, and `investment` holds `OfferFacets`.
`ProposalInstruments` is one of OD-11's priority-10 `useMobilePrimaryAction` registrants
(`proposal-instruments.tsx:286`), so a proposal spread whose first region has not been promoted
registers no lifecycle act and the bar shows its timer fallback. In practice `proposal` is the first
region on the paper and is promoted in the density hook's layout-effect first pass before paint, so
the window is one commit — but `action-visibility.spec.ts:213-262` now rests on a promotion rather
than on a mount. Worth naming in the W6 audit; no change asked here.

### W5-C19 · page-level suites mock `use-margin-items` to `[]` — MINOR · confidence high
`page.test.tsx`, `paper-order.test.tsx`, `worktable*.test.tsx` all add
`jest.mock('@/hooks/use-margin-items', () => ({ useMarginItems: () => ({ data: [] }) }))`. Every one
of them therefore renders `Margin · 0` and an empty sheet. The real path *is* covered
(`use-margin-sheet.test.ts`, `mobile-sheets.test.tsx`, the 390 e2e), so nothing otherwise-unproven
is hidden — but no page-level suite would notice if `page.tsx` stopped publishing `marginCount`.
`useCoordinationItems` / `useProjectFFEItems` are present in all seven suites' `@patina/supabase`
factories (checked), so no suite calls an undefined export.

### W5-C20 · `stage2-approval-cutover-contract`'s new anchor is thinner than the one it replaced — MINOR · confidence high
`<MobileMarginChips` → `<FolioLetterhead` (`stage2-approval-cutover-contract.test.ts:20-24`). The
regex reads source order only, so it holds — but `<FolioLetterhead` is rendered under
`{row.project_id && …}` while the deleted marker was unconditional, so the anchor is now an element
the page does not always mount. The stated intent ("the approval mount leads at the letterhead")
survives; the guarantee is weaker.

### W5-C21 · `only`-filtered commercial experiences land the whole body under `Design vision` — MINOR · confidence medium
`proposal-blocks-readonly.tsx:97-118`: for `design_services` / `commercial_readonly`, any `only`
other than `'vision'` returns `null`. On the proposal spread this puts a service agreement's whole
narrative under **Design vision**, while `scope` and `investment` still print heads — and
`investment`'s head prints a real figure (`liveProposal.total_amount`) over an empty body. Not
wrong per W5-R2 §1 (which is written for the legacy shape), but a shape the ruling did not consider.

### W5-C22 · trivia
- `DOCUMENT_INDEX_KEYS` (`document-index.ts:202`) now has no product consumer — tests only.
- `paperRegionsForSection`'s `?? []` (`:198`) is unreachable: `SECTION_PAPER_REGIONS` is a total
  `Record<SectionKey, …>`.
- `page.test.tsx`'s "prints NOTHING YET on a stop with no number" comments say
  *"`mockProposalData` is undefined here"* two lines after setting it. Comment rot.
- `useMarginSheet` runs twice per document (page + `MobileSheets`); both instances share every query
  key, and `useProjectFFEItems(projectId ?? '')` is `enabled: !!projectId`
  (`packages/supabase/src/hooks/use-project-v2.ts:213`) with the same key `margin-rail.tsx:415`
  already uses — so **no N+1 and no new fetch**: on a pre-work spread it is disabled, on a project
  spread it is already in cache. Clean.

---

## Checked and clean (no finding)

- **Hook-order safety.** `PreworkRegion` calls `useLensDensityStore(region) ?? 'quiet'` once, at the
  top, in every branch; the component is rendered conditionally by `page.tsx`, which is a mount, not
  a conditional hook. `useMarginSheet` sits at `page.tsx` ~`:1772`, above all three early returns;
  `BriefSection`/`DiscoverySection`'s `onEyebrow` effects sit above their own `isLoading` returns.
- **`data-density` / `--doc-quiet-reserve` on the pre-work roots.** `prework-region.tsx:68-71` writes
  `data-index-region`, `data-density`, and `--doc-quiet-reserve: var(--doc-quiet-reserve-min)`; the
  token is declared once at `globals.css:223`, and the floor rule at `:1127` is paper-scoped.
- **`regionHeadingId` / `paperRegionFor` throw on an unknown key** and every caller is guarded:
  `use-document-running-index.ts:288` and `prework-region.tsx:78` pass `DocumentIndexKey`s from the
  index's own arrays; `document-index.test.ts` pins both throws.
- **`paperRegionsForSection` consumers agree on the pre-work order.** `page.tsx:560/723/1594/1597/1666`,
  `use-document-running-index`, `lens-ladder-derivation.ts:577-578`, `mobile-sheets.tsx:539` and
  `page.test.tsx`'s containment case all resolve through the same table; `workflow-stage-responsive`
  proves the paper and the rail print the same five keys at 1440/1280 and the same five *labels* in
  the 390 Sections sheet.
- **`runningIndexRegions` widening.** The new ternary answers `[]` for a project engagement with no
  project id (heading ids need it) and the section's rows for the four pre-work sections;
  `mountedKeys` stays DOM truth (`use-document-running-index.ts:80-90`), and `ladderMountedKeys`
  keeps C-04's "unknown is not absent" rule intact. The L-10 lock (`forceFullThrough`) is untouched.
- **`onJumpRegion` unchanged** — `mobile-sheets.tsx:569` still calls `activeDoc?.onJumpRegion(region.key)`.
- **`proposalInvestment`.** `bandInvestment` is `money(total_amount)` only when `> 0`; null and 0
  both yield `null`; `liveProposal` is `any` so no TS narrowing issue and the guard short-circuits
  before the property read. `rightSlot()` gates it on `spreadKind === 'proposal'`
  (`lens-band-derivation.ts:590-602`), so brief/discovery/direction still print nothing.
  `worktable-finalize.test.tsx`'s re-point is honest: `total_amount: 500000` is the only source of
  `$5,000` in that suite.
- **The `only` split.** Nothing lost (description → `vision`; Investment ledger → `investment`;
  per-room budgets, payments, phases/key-dates, exclusions → `scope`), nothing doubled (one `show*`
  gate per block), and the Offer stays below every block because `page.tsx` mounts `proposalOffer`
  as the last child of `investment`, the last block-bearing region — W5-R2's ruled DOM order
  `proposal → scope → vision → investment → Offer`. `page.test.tsx`'s "mounts no block under a stop
  it was not re-parented to" is a real falsifier.
- **`onEyebrow` loops / stale closures / SSR.** `setBriefEyebrow`/`setDiscoveryEyebrow` are stable
  `useState` setters and the values are primitives, so React bails out — no setState-in-effect loop.
  No SSR path (the page early-returns on `!hydrated`). The one gap is the *timing*, W5-C5.
- **`SectionLoadingLine` `inline`.** `<span role="status">` inside `RegionHead`'s status `<p>` is
  valid nesting (no block in inline); the bar is `aria-hidden`, the label `sr-only`; the eight block
  sites keep the default and `section-loading-line.test.tsx` pins the default is `P` with `w-24`.
  The two `Reading the schedule` sites in `ffe-section.tsx` (`~:1300` and `~:1386`) are the two arms
  of D-B27's `mode === 'install' || selecting` ternary — mutually exclusive, one printing.
  `schedule-spine.tsx`'s head renders above `scheduleBody`, so the register is above the body it
  describes, and prints at quiet and full alike.
- **`marginCount` through `MobileActiveDoc`.** Folded into `stateSig`
  (`mobile-shell.tsx:344`), so the publish effect fires only on a real change — the W4 `visibility`
  re-render fix holds.
- **The Margin sheet's a11y.** `SHEET_ARIA_LABEL.margin = 'The margin'` (the mockup's own label),
  `SHEET_RETURN_FALLBACKS.margin` targets `[data-mobile-document-door="margin"]` which
  `mobile-bar.tsx:383/394` actually writes, and both jest and e2e prove Escape lands focus on the
  More button.
- **`useMarginSheet` vs `useLetterheadMargin` dedupe, the `time` filter, memoisation, query keys.**
  Both filter `kind !== 'time'`; every derivation is memoised on real deps; `handoffNow` is a stable
  `useMemo(() => new Date(), [])`; both hooks share `useMarginItems`/`useCoordinationItems` keys.
- **`document-index.test.ts`** is the strongest new suite in the wave: it pins the union↔arrays
  bijection, both throws, and the seven ruled pre-work names.

---
---

# Sign-off — `document-lens/w5-fix` @ `625e61f74`

**Read:** `git diff 25d2d04ba..625e61f74` in `.codex/worktrees/agent-lens-w5-fix` (52 files,
+1758 / −892) · `build/w5-fix-log.md` · D-B44, D-B45, D-B48, W5-R4, W5-R5. Read-only; no git, no
servers.

**SIGN-OFF: NOT SIGNED.** Gating: **W5F-05 (blocker), W5F-02, W5F-04, W5F-06.**

The lane's work on the seven majors is genuinely good — every one of W5-C1…C7 is closed at the
code, with falsifiers that would catch a regression rather than restatements of the fix. What
stops the signature is not those: it is that **W5-R5's own two rulings (N2, N3) each shipped
half-finished**, and that the last commit's spec edit contradicts the component two commits
earlier, so the recorded green basket cannot be a green basket at this HEAD.

## W5-C1…C7

| id | ruling | evidence |
|---|---|---|
| **W5-C1** | **CLOSED** | `prework-region.tsx:97-108` — quiet is now the head plus one `<p className="sr-only">{quietStateSentence(status, name)}</p>`; the uppercase `<p data-region-count-line>` and `Quiet — opens as you read` are gone (`grep` over `src` + `e2e`: 0 hits). Falsifier: `prework-region.test.tsx:55-67` asserts 0 `[data-region-count-line]`, absence of the stock string, and the ruled sentence carrying `.sr-only` — driven at real quiet through `__setDensityForTest(null)` (`:29-31`), which is the point I raised: the jsdom zero-rect promotion had made the branch unreachable. `:107-131` also pins `regionBoxSignature` identical across quiet → full. |
| **W5-C2** | **CLOSED** | `mobile-sheets.tsx:385-406` `marginRowAct` returns `{label, perform}`; `:818-831` `runRowAct` runs `decisionReminder.mutate({decisionId})` (`useSendDecisionReminder`, the same mutation `margin-bodies.tsx` runs) or `openInvoiceFolio(row.item_id)`, and every act that needs the item's own detail is named `Open`. Falsifiers **both ways**: `mobile-sheets.test.tsx:264-281` — the nudge calls the mutation and the margin dialog is still up; `:282-297` — the row body opens the item sheet and `mockSendReminder` was not called. Stacking checked: `PaperFolioSheet` is `z-[60]` against the mobile `Sheet`'s `z-[58]`, so the folio press is not a dead press under the sheet. |
| **W5-C3** | **CLOSED, and at the measurement** | `lens-band-height.spec.ts:189-193` polls `bandBox(band).transforms` to `'none'` before each read, inside the offset loop — **not** in `settle()` or any shared helper (`grep transform` over `e2e/document` + `e2e/helpers`: this file only). `:174-188` records the diagnosis (`doc-raise`, `scale(0.986)`, 56 × 0.99974 = 55.98544) and why the global precondition was rejected (8.3m → 11.2m, and it moved D-B37's baseline into the data-arrival window). The failure message at `:197-201` now tells a future reader that `offsetHeight`+`css` at 56 with only `rect` short means a scaled read, not a broken box. |
| **W5-C4** | **MOOT (correctly)** | The vacuous selector's subject no longer exists. |
| **W5-C5** | **CLOSED** | `region-head.tsx:165-181` — `reserveEyebrow` renders the `<p>` unconditionally with `min-h-[15.4px]` (D-B38's literal); `prework-region.tsx:90` passes it. Correctly scoped: heads whose eyebrow is a constant reserve nothing. |
| **W5-C6** | **CLOSED (superseded)** | `4 ROOMS IN SCOPE` landed and was then retired by W5-R5 §2 in favour of `CORE · STAGE 03 · N ROOMS` (`lens-ladder-derivation.ts:522-556`). A later ruling overriding W5-R2 §2 is legitimate; the contradiction I raised is discharged either way. See **W5F-04** for what §2's *implementation* left open. |
| **W5-C7** | **CLOSED** | `mobile-margin-chips.tsx` and `.test.tsx` deleted; `useLetterheadMargin` deleted (`use-margin-sheet.ts` diff, −86 lines); the `ffe-section.tsx` mount and 15 `jest.mock` stubs gone. `grep -rn MobileMarginChips src e2e` → comments only. The contract is now the deletion itself: `handoffs-in-margin-contract.test.ts:114-123` `expect(existsSync(CHIPS_PATH)).toBe(false)`, and `:107-113` splits "counts" (`marginSheetHook` `gates.length`) from **"LISTS"** (`spine` `gates.map`) — the half `gates.length` alone could never prove, which was my objection. No dead derivation left. |

## The 15 minors

| id | ruling | note |
|---|---|---|
| W5-C8 | **ACCEPTED (dispute upheld)** | Both strings are the loaded row's own literals and the two data cells are placeholders; `<div>` vs `<button>` is right — nothing to press yet. Re-verified against `account-band.tsx:267-289`: same wrapper, grid, padding and type sizes, so the box is preserved, which is what W5-R3 protects. |
| W5-C9 | **CLOSED** | `mobile-bar.tsx:146` — `marginCount ? […] : []`. No door at 0, no `Margin · 0 → · 7` churn. |
| W5-C10 | **ACCEPTED (kept, ruling named)** | W5-R2 §1 / W5-R4 F3 rule the two sentences; OD-2's pair governs the rail's caps fallback, which `empty()`'s default still takes. Named at the derivation, which is what I asked for. |
| W5-C11 | **CLOSED** | `use-margin-sheet.ts:158-` filters on **kind** as well as state, and the fixture is `state: 'overdue'` now, so the assertion can fail. |
| W5-C12 | **CLOSED, with a better answer than I proposed** | The row prints `[data-margin-row-stamp]` from the fact the row **holds**, not `overdueStampLabel` — whose `Overdue · 6 days` needs an `OverdueCondition` with a due date that `MarginItemRow` does not carry. A day count here would have been invented. Falsifier: `mobile-sheets.test.tsx:250-253` — present on the overdue row, `toBeNull()` on the other. |
| W5-C13 | **ACCEPTED (dispute upheld) — owner DESIGN LEAD** | A vocabulary question, unpinned by any test either way; already on the fix log's "Left for a ruling". |
| W5-C14 | **CLOSED** | `mobile-sheets.tsx:793-812` takes L-10's order first (`activeDoc?.onJumpRegion('ffe')` — unfold → `forceFullThrough` → the lock, which is what mounts the line), then refines two rAFs later. The e2e's `scrollY !== before` race is gone. |
| W5-C15 | **MOOT** | With D-B45. |
| W5-C16 | **CLOSED** | `lens-ladder-derivation.ts:625` `Array.from(new Set(input.ticket.paperRegions)).map(paperRegionFor)`. |
| W5-C17 | **CLOSED** | `scopeRegister` no longer reads `facts.settled` (`:524-530`, with the reason recorded). |
| W5-C18 | **ACCEPTED** | A W6-audit note, as I framed it. It now has a sibling with teeth — **W5F-04** is the same mechanism with a measurable consequence; W6 should take them together. |
| W5-C19 | **ACCEPTED** | Correct: the real path is covered three ways. |
| W5-C20 | **ACCEPTED, with a note** | Re-verified: `page.indexOf('<SectionStageLineMount')` resolves to the free-standing mount at `page.tsx:2568`, still after `<ProjectApprovalDocumentMount`, so the contract still means what it meant. It is now **blind to the second mount** at `:2661` — worth one line in the test. |
| W5-C21 | **ACCEPTED** | W6 note. |
| W5-C22 | **ACCEPTED** | Trivia. |

## Specific checks the coordinator named

- **Composer re-hosted, not forked — CONFIRMED.** Both `margin-rail.tsx:515` and the sheet import `useCreateMarginNote` from `@/hooks/use-margin-notes`; identical payload shape and the same `T17:00:00` convention (`margin-rail.tsx:532-540` vs `mobile-sheets.tsx:1007-1017`).
- **`anchor_id` — the shipped answer is better than the brief's, and the log is stale.** The brief (and `w5-fix-log.md`'s "Two findings" #1 and "Left for a ruling" #1) say the composer writes `anchor_kind: 'section'` with `anchor_id: null` and prints `BESIDE <STOP>`. The code writes **`anchorKind: 'letterhead'`, `anchorId: null`** and prints **`About the whole job`** (`mobile-sheets.tsx:1010-1014`, `:1038-1041`), under an amended D-B44 comment at `:997-1005`. That is the more honest of the two — a section anchor with no section is a record that states something it cannot support — and it matches the rail's own no-line fallback. **The consequence, stated plainly: which stop the note was taken beside is not recorded anywhere.** A note captured while reading Pieces and one captured at the letterhead are indistinguishable in `margin_notes`; recovering it needs a column the table has not got. The architect's ruling is still owed, and **the fix log must be corrected** — it currently describes a form that is not what shipped.
- **`psqlRun` cleanup — present and correctly scoped** (`mobile-margin-sheet.spec.ts:201-207`, `afterAll`, keyed on the exact body, with the reason: every other case in the file reads `Margin · 7`).
- **D-B48 — CLOSED.** `<h1>` never changes element type (`letterhead-vitals.tsx`); the visible name **is** the control (`<button aria-label="Rename the project" data-letterhead-title-edit>`, `cursor-text break-words`, no second glyph); one shared `TYPE` class string so the rect does not move on the swap; focus returns to the button via rAF; **`Escape` restores** (`focused.current = false; setValue(serverTitle)`) where it used to blur-and-therefore-save; blank never saves (`commit()`'s `next === '' → setValue(serverTitle); return`). The read-only path (`doc-letterhead.tsx:76-81`, no `projectId`) is a plain `<h1>` with the same `break-words` and type — no button, no input, correct. The `flex-wrap` note is right: the flex items are the name and the SaveDot, and the name wraps inside its own box.
- **Line-count gate selection — sound.** One number per measured line count rather than one number stretched to cover both; the old D-B30 case is gated the same way rather than against a bare 435, which is honest about why it moved.
- **`seed-verify.sql`'s `kind <> 'time'` — does NOT hide real drift.** A `time` row can only come from `project_time_entries`, which the seed never writes and the margin never prints; the three counts stay exact equalities (`= 3`, `= 4`, `= 7`) over the non-time set. The filter matches the product's own (`use-margin-sheet.ts`). `…d4` is idempotent by construction (EXISTS → UPDATE, else INSERT) and never deleted, for `…d5`'s 00390/00399 reason.
- **N2's strip move — see W5F-02/W5F-04.** **N3 — see W5F-06.**

## New findings

### W5F-05 · the note-composer e2e asserts a string the component stopped printing two commits earlier — BLOCKER · confidence high
`e2e/document/mobile-margin-sheet.spec.ts:243-245` and `:275-279` assert
`[data-margin-note-anchor]` reads `'Beside Client approvals'` and then `'Beside Pieces'`.
`mobile-sheets.tsx:1038-1041` renders the literal `About the whole job`, unconditionally — the only
`data-margin-note-anchor` in the file, with no `Beside` anywhere in the branch.

The order is the problem:

```
e27705aaa  component → "About the whole job"; jest updated (mobile-sheets.test.tsx:502, :526-527,
                       :541 — and :527 asserts `not.toHaveTextContent('Beside')`)
12b054e33  (LATER)   e2e → introduces "Beside Client approvals" / "Beside Pieces"
```

(`git log -S` on each string confirms both.) So at `625e61f74` the jest suite and the e2e assert
**opposite** strings for the same element, and the "note composer" case cannot pass. The fix log's
**"chromium — 67 passed, 0 failed, 0 not-run"** therefore cannot describe this file at this HEAD —
it describes a run taken before `12b054e33`'s spec edit. This is the same class as W5-C3: a gate
reported green that was not run in the form it now has.

**Smallest fix:** re-point the two e2e assertions to `About the whole job` (matching the jest twin
and the shipped D-B44 amendment), delete the two now-false comments at `:234-238` and `:259-260`
that describe the anchor as following the reading stop, and **re-run `mobile-margin-sheet.spec.ts`
in chromium and webkit**, pasting the summary.

### W5F-02 · after N2, the stage-line strip prints on NO pre-work spread but `proposal` — MAJOR · confidence high
`page.tsx:2567` gates the free-standing mount on `!isPreWorkSection(row.active_section)` — true for
all four pre-work sections — and the re-hosted mount at `:2661` lives inside
`<PreworkRegion region="scope">`, which only `spreadSection === 'proposal'` renders. So on
**brief, discovery and direction** the strip is suppressed and never re-hosted.

It did print there before: `SectionStageLineMount` handles the projectless case explicitly
(`section-stage-line-mount.tsx:76-79`, `deriveSectionWorkflowStageDocument(activeSection)`), which
exists for exactly those spreads. W5-R5 §2 rules the strip into `scope`; it does not rule it off
the three spreads that have no `scope` stop.

**Smallest fix:** gate `:2567` on `spreadSection !== 'proposal'` rather than on
`isPreWorkSection(...)` — the strip then keeps its free-standing place everywhere it is not
re-hosted, and is re-hosted exactly where `scope` exists.

### W5F-04 · `scope` states a fact sourced from a body that unmounts at quiet — MAJOR · confidence medium-high
`scopeRegister` (`lens-ladder-derivation.ts:533-550`) reads `facts.stageLine`, which is
`page.tsx`'s `preworkStageLine` state, which is written only by the strip's `onStageLine`
(`section-stage-line-mount.tsx:86-89`) — and that strip is now a **child of `PreworkRegion`**, which
renders no children at `quiet` (`prework-region.tsx:97-108`, pinned by `prework-region.test.tsx:69`).

So while `scope` is quiet its own head and its rail segment print `Nothing yet` (or rooms alone),
and the moment the lens promotes it the strip mounts, reports up, and **both the head's status line
and the rail's value change** to `Core · stage 03 · 4 rooms`. Three consequences:

1. a count-line text change under the reader — the thing W5-R3 rules out, and the thing the lane's
   own W5-C17 comment (`:524-530`) cites as the reason not to gate on `settled`;
2. a **rail value change on a step whose reading index need not have changed** — D-B37's gate
   (`lens-rail-budget.spec.ts`) measures exactly that, but runs on `…d5`, which has no `scope` stop,
   so it cannot see this;
3. it is circular: the quiet form exists so a stop can state its fact *before* it opens, and this
   stop cannot.

On `…d6` `scope` is the second region and is promoted at s0, which is why the lane's e2e sees the
strip — the defect needs a proposal long enough for `scope` to start quiet.

**Smallest fix:** source the stage line where it does not depend on the body — mount
`SectionStageLineMount` as a sibling inside the region root but outside the `quiet` gate, or derive
the sub-label on the page from the same hook and pass it down. Then extend D-B37's scroll gate (or
`prework-regions.spec.ts`) to a paper where `scope` begins quiet.

### W5F-06 · N3 is half-discharged: the rail and the sheet still do not share a derivation, and they diverge on `time` rows — MAJOR · confidence high
`margin-rail.tsx:431-476` and `use-margin-sheet.ts` build **two** groupers, each with its own
`marginAnchorRegion` + `PROJECT_PAPER_ORDER` walk. They now agree on `raised + settled`, which is
N3's ruling — but by construction, not by sharing, and nothing pins the agreement.

Worse, they already disagree: `useMarginSheet` filters `kind !== 'time'` before grouping; the rail
does **not** (`margin-rail.tsx:405` `visibleItems = classifiedMargin.items`, straight into
`partitionMargin` at `:425`). On any stack where the studio timer has run, the rail's heading counts
a time row the sheet's does not — one margin, two numbers, which is the defect N3 was raised to
fix. The lane demonstrated this on its own stack: `seed-verify.sql`'s new filter exists because
"the two rows were e2e timer residue".

**Smallest fix:** filter `kind !== 'time'` in the rail's grouper (one line, matching the product's
own rule), and add a jest twin asserting the rail's group counts equal `useMarginSheet`'s on one
fixture — the contract N3 needs and does not yet have.

### W5F-03 · the two stage-strip mounts read different sections, so a pinned worktable can print it twice or not at all — MINOR · confidence high
`:2567` gates on `row.active_section`; `:2661` renders under `spreadSection`
(`= table ? table.section : row.active_section`, `:2135`), and the table pin deliberately holds a
composition while the live row moves. In that window: row `proposal → project` with the pin still
on `proposal` renders **both** mounts (two `[data-section-stage-line]`, both writing
`setPreworkStageLine`); row `project → brief` with the pin on `project` renders **neither**.
`stage2-approval-cutover-contract` uses `indexOf`, so it passes either way. Folds into W5F-02's fix:
gate both on `spreadSection`.

### W5F-01 · `PREWORK_SECTIONS` is declared twice — MINOR · confidence high
`document-index.ts:204` (behind `isPreWorkSection`) and `page.tsx:825`, and `runningIndexRegions`
at `page.tsx:1597` still uses the page-local copy while `:2390`/`:2567` use the exported predicate.
Two declarations of one four-key list is the drift `document-index.ts`'s own docstring exists to
prevent. Fix: delete `page.tsx:825`, call `isPreWorkSection(row.active_section)` at `:1597`.

### W5F-07 · `…d4` carries no `project_phases`, which the letterhead does read — MINOR · confidence medium
The seed block inserts the project and its lineage proposal but no phases, so `…d4`'s letterhead
prints no stage ordinal where `…d5` prints one. The stated narrowing is "it does not carry `…d5`'s
62 FF&E lines, POs, decisions or margin, none of which the letterhead's own height depends on" —
phases are not in that list, and the vitals row is. The one-line/two-line gates were measured on
this seed so the numbers are self-consistent; the risk is that `…d4` is not the control it is
described as. Either seed the five phases as `…d5` has them, or widen the stated narrowing to name
phases.

## Verdict

**NOT SIGNED — W5F-05 (blocker), W5F-02, W5F-04, W5F-06.**

W5-C1…C7 and thirteen of the fifteen minors are properly closed, and the five disputes are upheld.
The gate is the second half of W5-R5: **N2** re-hosted the strip without keeping it on the three
spreads that cannot host it (W5F-02) and sourced a quiet stop's fact from a body that only exists
when the stop is open (W5F-04); **N3** made two derivations agree without making them one, and they
already disagree on `time` (W5F-06). And the basket cannot be re-declared green until
`mobile-margin-sheet.spec.ts` stops asserting a string the component stopped printing (W5F-05).
Re-run the whole eight-file basket in both engines after those four; W5F-01, W5F-03 and W5F-07 can
ride the same pass.

---
---

# Sign-off 2 — `document-lens/w5-fix` @ `8073bf464`

**Read:** `git diff 625e61f74..8073bf464` (20 files, +827 / −192), and — this time — every claim
about the *previous* HEAD re-read through `git show 625e61f74:<path>` rather than off the checkout.
Read-only; no git, no servers.

**SIGN-OFF: SIGNED.** No gating ids. Three non-gating findings (W5F2-01…03) and one narrowed
residual (W5F-03) carry to the W6 audit.

## Two corrections I owe first

**1 · W5F-05 was a FALSE BLOCKER. I withdraw it, and the aspersion that came with it.**
I reported that `mobile-margin-sheet.spec.ts` asserted `Beside Client approvals` while the
component printed the literal `About the whole job`, and concluded that the fix log's
"chromium — 67 passed, 0 failed" could not describe that file. Read at the commit I was asked to
review, `git show 625e61f74:…/mobile-sheets.tsx:998-1001` is

```ts
const anchorStop = activeDoc?.readingIndex ?? null;
const anchorLabel = anchorStop ? `Beside ${DOCUMENT_INDEX_LABELS[anchorStop]}` : 'About the whole job';
```

rendered at `:1048` as `{anchorLabel}`, with `anchorKind: anchorStop ? 'section' : 'letterhead'` at
`:1022`; and `git show 625e61f74:…/mobile-sheets.test.tsx:503/:523` asserts
`About the whole job` for the null-stop case and `Beside Pieces` for the with-stop case.
**Component, jest and e2e all agreed.** There was no contradiction and no stale gate.

The error was mine and it was procedural: I greped the worktree file instead of the named commit,
and the checkout had already advanced past `625e61f74` toward this HEAD. My `git log -S` "evidence"
compounded it — `-S "About the whole job"` matched `e27705aaa` because that commit introduced the
string as the *fallback branch*, not as an unconditional literal, and I read the match as the
latter. When a task names a sha, I should read that sha. The fix log's green-basket claim stands
unimpugned by me.

The substance is nonetheless now ruled and shipped: **W5-R6** (`reconciliation.md:358-362`) rules the
print `ABOUT THE WHOLE JOB` always, with the ARCHITECT's note fixing the payload as
`anchor_kind: 'letterhead'`, `anchor_id: null` per D-B44(a) — because a `'section'` kind with a null
id claims an anchor the row cannot keep. `mobile-sheets.tsx:1018-1021` writes exactly that, and
`:1044-1048` prints the literal. Correct on both halves.

**2 · My "…d4 is idempotent by construction" ruling in Sign-off 1 was wrong, and the lane caught
what I missed.** `…d4` was never free: `supabase/seed/schedule-extremes.sql:63` already owns
`b0000000-…-d4` as `Marrow & Vale Residence`, the seven-phase schedule fixture. D-B48 named it
unused; it is not. At `625e61f74` the seed's `IF EXISTS → UPDATE public.projects SET name = 'Aspen
Loft', …` branch would have **renamed that fixture and rewritten its money figures, phase and
dates** on every run — silently, and my sign-off called the block idempotent without checking the id
was free. The lane found it and moved the paper to `…d7` (`the-document-lens-seed.sql:81-89`, with
the collision recorded in the comment). A better catch than the finding it was answering.

## W5F-01…07

| id | ruling | evidence |
|---|---|---|
| **W5F-01** | **CLOSED** | `page.tsx`'s local `PREWORK_SECTIONS` deleted (diff `−822..−830`); `:1596` now calls `isPreWorkSection(row.active_section)`. One declaration, in `document-index.ts:204-213`. |
| **W5F-02** | **CLOSED** | `page.tsx:2591` gates the free-standing mount on `!stageStripInScope` where `stageStripInScope = stageStripSpread === 'proposal'` (`:1704`) — so brief, discovery and direction keep the strip and only the proposal spread re-hosts it. Falsifier: `page.test.tsx:2059-2083`, `it.each(SPREADS)` — exactly **one** `[data-section-stage-line]` on every one of the four spreads, and `[data-index-region="scope"] [data-section-stage-line]` non-null on `proposal` alone, null on the other three. It fails at zero and at two. |
| **W5F-03** | **CLOSED for the shipped path; OPEN, narrowed, for the pinned one** | Both *strip* gates now read one value (`stageStripSpread`, `page.tsx:1700`), so they cannot disagree — the double-print is gone and `page.test.tsx` pins one strip per spread. What remains: that value is `row.active_section`, while the `scope` region that hosts one of them is gated on `spreadSection` (`:2687`, `= table ? table.section : row.active_section`). The table pin deliberately holds a stale composition, so in that window `active_section: 'proposal'` with a pinned `section: 'project'` suppresses the free-standing strip and never mounts `scope` — **zero strips**. Narrower than what I reported (the double-print case is closed), and one line to close: compute `stageStripInScope` from `spreadSection` at `:2135`+ instead of from `row.active_section` at `:1700` — both use sites (`:2591`, `:2695`) are below `:2135`. |
| **W5F-04** | **CLOSED** | `page.tsx:1673-1695` — `preworkStageLine` is a `useMemo` over `deriveSectionStageLine(deriveSectionWorkflowStageDocument(row.active_section), {activePhaseId: null, reason: 'none'}, null, null)`, and `onStageLine` is deleted from `SectionStageLineMount` entirely (`section-stage-line-mount.tsx`, the `useEffect` gone). The value cannot depend on the strip's mount state. Falsifier that matters: `prework-regions.spec.ts:239-282` reads `scope`'s head status, its `[data-ladder-segment]` text and its `data-density` at rest, walks to it, asserts `density === 'full'` (*"scope never promoted — the walk proved nothing"*) and then byte-equality on both strings. (The jest twin is weaker — see W5F2-02.) |
| **W5F-05** | **WITHDRAWN — my error.** See correction 1. | The shipped form is nonetheless ruled and correct: payload `'letterhead'`/`null` per D-B44(a), print per W5-R6, and the e2e re-pointed to `About the whole job` at **both** stops (`mobile-margin-sheet.spec.ts:244`, `:279`) with a **reload** case (`:292-322`): the note stands in `THE WHOLE JOB · 5`, `BESIDE PIECES · 3` is unchanged, and `[data-margin-group="ffe"]` contains the body `0` times. That last assertion is the one that would catch a regression to a section anchor. |
| **W5F-06** | **CLOSED** | New `lib/document/margin-groups.ts` — `marginListable` (`kind !== 'time'`) and `groupMarginRows({order, decorate})`. Both callers use it: `use-margin-sheet.ts:108` + `:128-147` (`'whole-job-first'`), `margin-rail.tsx:409-415` + `:449-469` (`'regions-first'`). The `time` divergence is gone — the rail filters through the same function now. `margin-groups.test.ts` (106 lines) is the shared contract. |
| **W5F-07** | **CLOSED, and better** | `…d7` carries the same five-phase main lane as `…d5` (`the-document-lens-seed.sql:875-925`, fixed ids, `DELETE` + `INSERT` so it is idempotent), and the id moved off the collision in correction 2. `seed-verify.sql` is **19 checks**, including `one-line paper d7 carries the 5-phase main lane … = 5`. The lens specs are consistent: `lens-fixtures.ts:31` `ONE_LINE_PAPER_ID = …d7`, `lens-band-height.spec.ts:757` `the one-line name (…d7)`; no `…d4` left in `e2e/document`. |

## The design lead's 1b, and the hosted strip

- **Escape in the title input — SOUND, and belt-and-braces in the right order.** Two independent
  guards: (a) `page.tsx:1205` `if (isEditableTarget(e.target)) return;` — target-based, so it holds
  in either event phase; (b) `letterhead-vitals.tsx:540-546` `stopPropagation` + **`e.nativeEvent.
  stopImmediatePropagation()`** + `preventDefault`. (b) is necessary and sufficient on its own here
  because the shell registers on `document` in the **bubble** phase (`page.tsx:1211`,
  no capture flag) while React's root listener sits at the root container inside it — so the native
  event is stopped before `document` sees it. Had the shell used capture, (b) would arrive too late
  and (a) would be the only thing standing; having both is right. Falsifiers: `letterhead-vitals.
  test.tsx:352-377` attaches a real `document` keydown spy and asserts `expect(shell).not.
  toHaveBeenCalled()` plus focus back on the button with the name restored; `page.test.tsx:2339-2388`
  proves the shell guard **alone** by firing at a bare `<input>` appended to `document.body`,
  outside React's tree — "the guard has to hold on its own, not because the field stopped the
  event". That is the correct shape for this pair.
- **`isEditableTarget` — one selector, cannot drift.** `use-lens-state.ts:81-87` exports it and
  `isEditable` is now `isEditableTarget(node) && Boolean(node.closest(PAPER_SELECTOR))` (`:85-87`) —
  the paper requirement is the only difference, which is exactly right: D-B19's `editing` is about
  the paper not moving under a hand, the shell's Put-down is about any field anywhere.
  `EDITABLE_SELECTOR` (`:49-56`) matches `input:not([type=checkbox])…`, so the title input is in.
- **The `hosted` strip — correct, and free-standing is byte-identical.**
  `section-stage-line.tsx:52-73`: `Frame = hosted ? 'div' : 'section'`; `aria-labelledby` is spread
  in **only** when not hosted, and the `<h3 id={headingId}>Workflow stage</h3>` is dropped by the
  same condition — attribute and target leave together, so there is **no dangling
  `aria-labelledby`**. `!hosted && model.subLabel` drops the label line. Free-standing renders the
  same `<section aria-labelledby>` + `<h3>` + subLabel it always did. The mount's waiting and error
  lines take the same treatment through `StageFrame` (`section-stage-line-mount.tsx:28-51`) — plain
  `div` hosted, `<section aria-label="Workflow stage">` free-standing. Falsifiers:
  `section-stage-line.test.tsx:196-221` (hosted drops both, keeps `[data-workflow-track='core']` and
  `Core · 06`, and `container.querySelector("section")` is null) and `:222-228` (free-standing keeps
  both).

## New findings — none gating

### W5F2-01 · the hosted strip can derive its stage in project mode while the head and rail derive it in section mode — MINOR · confidence medium
`page.tsx:1675-1687` always builds `preworkStageLine` from
`deriveSectionWorkflowStageDocument(row.active_section)` — the pure section-mode lookup
(`workflow-stage-derivation.ts:418-450`, `proposal → scope_engagement/core → Core · stage 03`).
The hosted strip at `:2698-2706` is handed
`projectId={row.engagement_kind === 'project' ? row.project_id : null}`, and with a non-null
`projectId` `SectionStageLineMount` takes the **project** branch instead
(`deriveWorkflowStageDocument(workflow.data)` plus selection, fidelity and position). On a project
engagement whose `active_section` is still `'proposal'` — which `runningIndexRegions`
(`page.tsx:1593-1596`) explicitly supports — the `scope` head and its rail segment print
`Core · stage 03` while the body beneath prints the project's real workflow stage. That is the
one-fact-two-derivations shape N2 exists to close, reintroduced through the branch rather than
through the mount. Not reachable on `…d6` (a proposal engagement), so no test sees it.
**Smallest fix:** `projectId={null}` on the hosted mount — N2 rules `scope`'s fact to be the
section's, and the head already states it that way.

### W5F2-02 · the jest twin for W5F-04 is a tautology — MINOR · confidence high
`lens-ladder-derivation.test.ts:449-464` calls the pure `prework()` helper twice with identical
arguments and asserts the two results match. A pure function returning the same output for the same
input proves nothing about the defect, which was that the *input* changed when the strip mounted.
The only load-bearing line is `expect(quiet.scope.value).toBe('CORE · STAGE 03 · 4 ROOMS')`. The
real proof is the e2e (`prework-regions.spec.ts:239-282`), which walks the promotion. Either rename
the jest case to what it checks (the string), or give it teeth by deriving once with a `stageLine`
present and once with it absent and asserting the value is unchanged.

### W5F2-03 · fix-log and docstring drift — MINOR · confidence high
- Two unreconciled jest totals in one document: the Gates block says `476 suites · 5639 tests · 0
  failing (after the follow-ups)`, the reconciliation table below it says `475 / 5625`. The delta is
  derivable (`margin-groups.test.ts` is the +1 suite) but the program plan's rule is that a wave
  whose suite count moves **without a written reconciliation** does not merge. One line.
- "Left for a ruling" #4 still reads "the **`…d4`** seed's deliberate narrowing" after the move to
  `…d7`, and the narrowing itself is now smaller than stated (phases are seeded).
- `margin-groups.ts:44-45` documents an `extra` parameter ("contributes rows that count toward a
  group's heading without appearing in `rows` — the rail's settled fold") that the signature at
  `:47-56` does not have; the rail does the split itself at `margin-rail.tsx:461-468`.

### Two observations, no action
- `margin-rail.tsx:459-468` splits raised from settled with `new Set(settled)` and
  `isSettled.has(row)` — **object identity** over rows that `partitionMargin` returns by reference.
  Correct today; if that function ever maps or clones, every row silently reads as raised. A
  `Set` of `item_id` would be free.
- `section-stage-line.tsx:55` still calls `useId()` for `headingId` when hosted, where it is unused.
  Harmless.

## Verdict

**SIGNED — no gating ids.**

W5F-01, -02, -04, -06 and -07 are closed at the code with falsifiers that would each catch their own
regression — `page.test.tsx`'s one-strip-per-spread case and `prework-regions.spec.ts`'s
promote-then-compare are the two that carry the wave. W5F-05 was mine and is withdrawn. W5F-03 is
closed on the shipped path and narrowed to a pin-window hole worth one line. The design lead's 1b is
sound in both belts and shares one selector, and the hosted strip drops its label and its landmark
together with no dangling reference.

Carry to W6: **W5F-03** (one line), **W5F2-01** (one line), **W5F2-02**, **W5F2-03**, and the four
items already on the fix log's own "Left for a ruling" — of which #1 is now ruled for this wave by
W5-R6/D-B44(a), leaving only the `margin_notes` stop-column migration open.
