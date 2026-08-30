# W1 review — CORRECTNESS

Reviewer: W1 CORRECTNESS (separate context; wrote none of this).
Method: read-only. `git diff 690337f1a...document-lens/{w1-l1,w1-l2,w1-l3,w1-l4}`, `git show <ref>:<path>`, `git grep <ref>`. No checkout, no product edits, no test runs.
Base: `document-lens/integration@690337f1a` ("merge(document-lens): wave 0 fixes").
Binding inputs read in full: `build/design/technical-design.md` (OD-5, OD-11, OD-15, OD-16, §5 seam table C-1, §6 test strategy, §7 C-1…C-8), `build/design/reconciliation.md` (§4 D-6, §8 RF-03, §10 arc ruling (d), §13, print contracts), `build/test-impact.md`.

---

```
┌──────────────────────────────────────────────────────────────────────┐
│  VERDICT:  SHIP AFTER FIXES                                          │
│                                                                      │
│  The four lanes are individually coherent and the ruled mechanics    │
│  land. But the W1 tree DOES NOT MERGE GREEN: two jest suites cannot  │
│  resolve `../spine-timer` once L1's deletion meets L3/L4's surviving │
│  references. Beyond that, two rulings were over-applied — the        │
│  letterhead lost the WRITE path along with the print (D-6 ruled the  │
│  print only), and RF-03's two-line cap was applied to the shared     │
│  MarginNote primitive, clipping focusable controls on the Desk and   │
│  in People out of view while they stay in the tab order.             │
│                                                                      │
│  Four of the five blockers are a one-line edit or a one-line ruling. │
│  C-03 needs the architect or the design lead to speak.               │
│                                                                      │
│  Blocking: C-01 C-02 C-03 C-04 C-05                                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Severity counts** — high 5 · medium 12 · low 11 · total 28.
Nothing filtered. Every finding carries confidence; the synthesiser filters, not me.

---

## Gate evidence

| Gate | Command | Status | Evidence |
|---|---|---|---|
| jest (designer-portal) | `pnpm --filter designer-portal test` | **NOT RUN** — read-only review, no checkout; no lane log on disk under `build/` (only `w1-walk/`, no `w1-*.log`, no `w1-fix-log.md`) | — |
| type-check | `pnpm --filter designer-portal type-check` | **NOT RUN / NOT RECORDED** | — |
| lint | `pnpm --filter designer-portal lint` | **NOT RUN / NOT RECORDED** | — |
| e2e | `pnpm --filter designer-portal e2e` | **NOT RUN / NOT RECORDED** | — |
| jest arithmetic (test-impact "Jest arithmetic": 458 / 5173 after W0; a wave whose suite count moves without a written reconciliation does not merge) | — | **UNRECONCILED** | No W1 suite/test delta is written anywhere. Static reading says the merged tree LOSES 2 suites to module-resolution errors (C-01, C-02), which is a suite-count move with no reconciliation. |
| Static reading of the four diffs | this review | **DONE** | Below. |

> The wave has no recorded gate evidence at all. Whatever the merge verdict, `build/` should carry a W1 gate log before integration signs.

---

## Findings

`id · severity · confidence · file:line · finding · failure scenario`

### High

**C-01 · high · 0.98 · `apps/designer-portal/src/components/document/mobile/mobile-timer-sheet.test.tsx:11`**
`import { CompactSpineTimerDoorway } from '../spine-timer';` survives on **every** lane (verified by `git grep` on w1-l1, w1-l2, w1-l3, w1-l4), with render sites at `:429`, `:476`, `:511`, `:590`. W1-L1 deletes `spine-timer.tsx` outright. W1-L3 rewrote exactly one test in this file (`:238-254`) and left the import and four other usages standing.
*Failure scenario:* on the merged W1 branch, `jest` reports `Cannot find module '../spine-timer' from 'src/components/document/mobile/mobile-timer-sheet.test.tsx'` and the whole suite errors before a single test runs — losing the mobile timer sheet's focus-containment, scroll-lock and responsive-handoff coverage as well as the one rewritten case. Suite count moves; test-impact's merge rule trips.
*Fix:* delete the import and re-point `:429/:476/:511/:590` at `MobileTimerFallbackDoorway` (already defined locally at `:187`).

**C-02 · high · 0.85 · `apps/designer-portal/src/components/document/__tests__/responsive-document-shell.test.tsx:83-90`**
`jest.mock('../spine-timer', () => ({ SpineTimer: …, CompactSpineTimerDoorway: … }))` — a **non-virtual** factory mock — survives on w1-l4 even though that lane rewrote `:211-220` from "the timer's classes are correct" to "the timer is absent". A `jest.mock` factory still resolves the module path unless `{ virtual: true }` is passed.
*Failure scenario:* merged tree, `Cannot find module '../spine-timer'` at module-registration time; the entire `quiet responsive document shell` suite errors, taking the OD-5 regime rewrite, the margin-sheet keyboard containment tests and the surviving `:197-211` / `:308-320` cases with it.
*Fix:* delete `:83-90` outright (nothing else in the file references the testids after the L4 rewrite).
*Confidence note:* 0.85 rather than 0.98 because I could not execute jest to confirm the resolution throw; the `virtual: true` escape hatch exists precisely for this case, which is the basis for the call.

**C-03 · high · 0.85 · `apps/designer-portal/src/components/document/letterhead-vitals.tsx:280-347`**
D-6 ruled *what prints*: "the vitals row prints only fields that carry a value … 0px when a document has none of the three". The lane implemented that by gating the **editors**, not the printings. `VitalDate` now renders only when `startDate` / `targetDate` is already truthy (`:303`, `:311`), the band renders only when `bandSet` (`:320`), and `if (!phaseWord && !startDate && !targetDate && !bandSet && !totalSet) return null` (`:294`) removes the row entirely. The deleted `Set a budget band` ghost affordance was the *only* way to open the band. `needsSetup` (`page.tsx:1584-1593`) raises exactly one kind (`schedule_unconfigured`), so no remedy chip covers these.
*Failure scenario (a):* a designer opens a freshly created project document. The letterhead prints the title, the household chip and nothing else. There is no control anywhere on the paper to record a start date, a target date or a budget band. (`budget_min` retains a second editor in `discovery/editors.tsx`; `start_date` does not.)
*Failure scenario (b), one-way door:* on a project that HAS a start date, pressing `×` ("Clear start", `letterhead-vitals.tsx:176`) calls `save({ start_date: null })`. The server echo lands, `startDate` goes null, `VitalDate` unmounts — the field, and the ability to re-enter one, are gone for good, and focus falls to `<body>` because the button she just pressed no longer exists.
*Fix (my read):* keep the fields mounted and unconditionally editable; render the *empty* state as no printed characters (no `Start —`, no `Band $ – $`) rather than as no element — i.e. print nothing, keep the door. This satisfies D-6's ships-line ("0px when a document has none of the three") without deleting the write path. Needs the design lead to confirm the reading.

**C-04 · high · 0.85 · `apps/designer-portal/src/components/document/margin-note.tsx:174-181`**
RF-03 ships "first-touch note capped at two lines". The lane put `line-clamp-2` on the shared `MarginNote` primitive, so it applies at all five call sites. Three of them pass JSX children containing **focusable controls** inside the clamped span: `desk/page.tsx:337` (the "start the walkthrough" `<button>`), `people/views/directory-view.tsx:398` (the rolodex seed-review `<button>`), and by extension any future note with an inline act. Tailwind's `line-clamp-2` sets `display:-webkit-box; overflow:hidden`, and a `-webkit-box` will not scroll a clipped child into view.
*Failure scenario:* at the note's `max-w-[34ch]` the desk-walkthrough copy fills two lines before its inline button; the button is painted outside the clamp, remains in the tab order, and receives focus with no visible focus ring anywhere on screen — WCAG 2.2 SC 2.4.11 (Focus Not Obscured) and 2.4.7 (Focus Visible). Same shape on the People rolodex note.
*Fix:* scope the cap to the caller — a `clamp` prop, or a class on the margin's first-touch instance only.

**C-05 · high · 0.8 · `apps/designer-portal/src/components/document/margin-note.tsx:169`**
The recovery for clipped text is `title={typeof children === 'string' ? children : undefined}`. Of the five call sites only `margin-rail.tsx:568` (the margin first-touch note) passes a bare JSXText child. `margin-rail.tsx:575` (`{change.actorName} changed {change.fileName}.`), `desk/page.tsx:318`, `desk/page.tsx:337` and `directory-view.tsx:398` all compile to arrays → **no title, no recovery**. The lane's own test `margin-note.test.tsx:118-127` ("claims no title when the body is not plain text") canonises the gap as intended behaviour.
*Answering the brief's a11y question directly:*
- **Screen reader: reachable.** `line-clamp` is visual only; the full text stays in the DOM and in the accessibility tree, so an SR reads every word. No regression.
- **Sighted keyboard-only: NOT reachable.** `title` fires on pointer hover; the `<span>` carrying it is not focusable and has no `tabindex`, so a keyboard user has no way to reveal it. On four of five call sites there is nothing to reveal in the first place.
*Fix:* if the cap stands, the clipped notes need an expand affordance (a focusable "more" control), not a `title`.

### Medium

**M-01 · medium · 0.65 · `apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts:200-205`**
The 390 step asserts `mobileBar.getByText(/In hand|Today/)`. `mobile-bar.tsx:270-300` renders that block only in the `else` of `primaryAction && primaryShared`. On the seeded project the lifecycle registrants named in OD-11 (`proposal-watch.tsx:157/:409`, `proposal-instruments.tsx:286`, `letterhead-instruments.tsx:303`) supply a primary act at priority 10, so the fallback timer block is not rendered.
*Failure scenario:* the replacement spec fails at 390 on `SEEDED_PROJECT_ID`, or passes only by accident of which lifecycle acts the seed happens to trigger — a flake keyed to seed data.

**M-02 · medium · 0.9 · `apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts:169-206` — "does it prove *sole timer doorway*, or only presence?"**
**Only presence, plus one attribute's absence.** It proves (a) the drawer/bar prints one of two timer strings, and (b) `[data-spine-timer-regime]` count 0 at 1440/1280/390. It never counts doorways. It never asserts `[data-full-spine-timer]` count 0 or `[data-compact-spine-timer-doorway]` count 0 — both selectors are still live strings in the product at `mobile-sheets.tsx:134-135` (see L-01). A second document-scoped timer doorway that simply omitted the regime attribute would pass this test unchanged.
*Fix:* add `toHaveCount(0)` for the two doorway markers, and count the elements that open the timer sheet.

**M-03 · medium · 0.85 · `apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts` (deleted `:169-299`)**
Coverage deleted beyond what test-impact authorised. Test-impact #11 authorises replacing the *spine-timer* contract. The deleted block also carried, for surfaces that still ship: body-scroll-lock set **and restore-to-original** symmetry around the timer sheet; Escape restores focus to the opener; the 1439→1440 crossing not stranding focus on a now-hidden element; the 1179→1180 crossing returning a mobile-opened timer to its doorway; and the `More studio actions → Time in hand` open path. None of it is replaced anywhere. The trailing `/desk` navigation that "put the seeded project back so a later spec does not inherit its one-running-timer row" also went — harmless here (the new test starts no timer) but the describe's serial-timer note at `:166` now has one fewer guard.

**M-04 · medium · 0.8 · `apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts:191`**
`drawer.getByText(/In hand today|Hands free/)` matches both the held and the un-held state (`studio-drawer.tsx:488` / `:498`). The assertion cannot fail for the reason the test exists — it asserts only that the drawer's right zone prints one of two strings.

**M-05 · medium · 0.75 · `apps/designer-portal/src/app/globals.css:220-234` vs `mobile-bar.tsx:227` — "does the paper's bottom inset still clear the bar at 390?"**
**No, by 8px, in the no-safe-area case.** The bar's floor moved `min-h-[64px]` → `min-h-[72px]`; `--doc-shell-bottom-inset` is unchanged at `max(64px, calc(52px + env(safe-area-inset-bottom)))`. With `env(safe-area-inset-bottom) = 0` (Android, a desktop browser emulating 390) the token says 64 while the bar is 72. With a 34px inset both land at ~86 and the shortfall closes.
*Live impact today: none.* The only consumer is `--doc-shell-floating-bottom = inset + 1.5rem` = 88px, which still clears 72; the paper itself takes no padding from this token (verified by `git grep` — six consumers, all `bottom-[var(--doc-shell-floating-bottom)]`). But the token's own comment declares it as "one persistent viewport edge … so [floating actions] clear the active chrome", and that sentence is now false by 8px for the next consumer that reads it.
*Fix:* `max(72px, calc(60px + env(safe-area-inset-bottom)))`, in the same lane that raised the bar.

**M-06 · medium · 0.85 · `apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:225`**
`data-reading-index={readingIndex ?? ''}` writes an **empty attribute**, not an absent one. The C-1 seam table (technical-design §5) declares the value as "a `DocumentIndexKey` or **absent** (never `"null"`)", and falsifiable sentence (e) in §6 is written against absence. `''` makes `[data-reading-index]` match on every document at every offset, which will read as "a stop is held" to any selector-based probe. `mobile-bar.test.tsx:283` codifies the wrong form (`toHaveAttribute('data-reading-index', '')`).
*Fix:* `readingIndex ?? undefined`, and flip the test to `not.toHaveAttribute('data-reading-index')`. Worth settling now so the rail and the shell publish the same form in W2/W3.

**M-07 · medium · 0.7 · `apps/designer-portal/src/components/document/margin-rail.tsx:104-115`**
`worstMarginKind` reads `row.state` alone. R12's float rank (`margin-derivation.ts:110-115`) is a `kind`+`state` pair: rank 0 is `decision`+`overdue`, rank 1 is `field_sms`+`needs_review`, rank 2 is `note`+`due`. The JSDoc asserts "ranked as R12 ranks the float"; the code does not implement that ranking.
*Failure scenario:* a project with one overdue **money** row and one `field_sms` needing review prints `MARGIN · N · 1 OVERDUE` on the tab while the rail's top card is the field text — the tab names a "worst" the margin does not rank as worst.
*Secondary:* the `N NEEDS REVIEW` and `N DUE` strings are not in reconciliation §8's tab contract (`MARGIN · 7 · 1 OVERDUE`) — invented vocabulary on a printed surface.

**M-08 · medium · 0.8 · `apps/designer-portal/src/components/document/mobile/mobile-timer-sheet.test.tsx:238-254`**
The rewrite substitutes a **test-local stub** (`MobileTimerFallbackDoorway`, defined at `:187`, a bare `<nav data-mobile-edge-owner="document-bar"><button aria-label="More studio actions">`) for the real bar. So the new title ("… from the mobile bar doorway") and test-impact #7's "mobile bar owns the timer doorway" are asserted by nothing — the stub only reproduces two attributes. The assertions deleted in the rewrite (the regime attribute, the `hidden / min-[1180px]:flex / min-[1440px]:hidden / min-h-11` class contract, the `1h05` elapsed text) have no replacement anywhere. The enclosing `describe` is still named `'compact-spine timer doorway'`, naming a thing that no longer exists.
*Note:* §6's rule — "a rewrite states which assertion became which" — is not met here.

**M-09 · medium · 0.7 · `apps/designer-portal/src/components/document/margin-rail.tsx:594`**
`In the margin` becomes `hidden … min-[1440px]:block`, but it is the first child of a `flex items-baseline justify-between` row whose second child is the `DocumentActionGroup` capture row (`NOTE PHOTO VOICE`). `display:none` removes it from the flex line entirely, so below 1440 the capture row moves from right-aligned to left-aligned. RF-03 asked only that the duplicate heading go; the alignment change is unruled and unasserted.
*Fix:* keep the `<p>` in flow with `invisible`/`sr-only`, or set the row to `justify-end` below 1440.

**M-10 · medium · 0.55 · `apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx:98,114` vs the W1-L3 commit subject "chips at 44px"**
`py-[0.32rem]` (5.12px) → `py-1.5` (6px) adds ~1.76px of total height. With `text-[11px]` content, a chip lands near 30px, not 44. Nothing else in the diff touches the chip's box.
*Failure scenario:* the wave records "chips at 44px" as shipped; the 2.5.5/2.5.8 target-size claim is unfounded and unmeasured — jsdom cannot prove it and no e2e cell measures a chip.

**M-11 · medium · 0.6 · `apps/designer-portal/src/components/document/doc-spine.tsx:79-81`, asserted at `doc-spine.test.tsx:78`**
The head reserve is `min-h-[84px]` at 1180–1439 / `min-[1440px]:min-h-[100px]`. Reconciliation §10's arc ruling (d) — "Logged for the ARCHITECT as a 1280-only head reserve" — computes the 1280 head at **~116px** (name 18 + wrapped arc 48 + two-line stage phrase 32 + count 16). `min-h` is a floor, so the block will simply grow past 84 once the integration lane lands the arc wrap; nothing clips. But the file's own comment ("Its height is RESERVED, never measured") and the test that pins `min-h-[84px]` then name a number the rail does not hold at 1280.
*Ask:* the integration lane should raise the narrow-tier floor to the ruled ~116px in the same commit as the arc wrap, and move the test with it.

**M-12 · medium · 0.6 · `apps/designer-portal/src/components/document/letterhead-vitals.tsx:174` (`VitalDate`'s `—` branch)**
Corollary of C-03. After `clear()`, local `value` is `''` and the trigger prints `—` until the server echo lands, at which point the parent unmounts the field. The `—` branch is now a transient-only state that can never be a resting state, and the transition is a visible field disappearing from under the pointer with focus falling to `<body>`. The three Folio echo tests (`letterhead-vitals.test.tsx:154`, `:186`, `:196`) were all re-pointed from `start_date: null` to `'2026-01-15'` precisely because the empty case is no longer reachable — a forced change, but it means the empty-trigger echo path now has no coverage at all.

### Low

**L-01 · low · 0.9 · `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:134-135`**
`SHEET_RETURN_FALLBACKS.timer` still names `[data-compact-spine-timer-doorway]` and `[data-full-spine-timer] [data-action-key="open-manual-time-entry"]`, neither of which can ever match after OD-16. `querySelectorAll` on a non-matching selector returns empty and `restoreSheetFocus` degrades to the next candidate, so **no crash and no focus loss** — but these are the last live product references to the deleted module, and OD-16 puts the consumer cleanup in W1. Leaving them means the "sole doorway" claim is contradicted in the source that the e2e (M-02) declines to check.

**L-02 · low · 0.95 · `apps/designer-portal/src/components/document/doc-spine.tsx:24`**
`others: string[]` stays a **required** member of `DocSpineProps` while the presence line is deleted; it is no longer destructured (`:47-54`) or read anywhere in the component. Every caller and every test must still pass a value that goes nowhere. TS and ESLint are both silent on this shape.

**L-03 · low · 0.8 · `apps/designer-portal/src/components/document/doc-spine.tsx:14-17` (file header) and `:170-180` (deleted presence block)**
The lane's header cites "R127 §4 / OD-16" for evicting **both** the timer and the presence line. OD-16 authorises deleting `spine-timer.tsx` and the two Wave-2 files; the presence line (`Just you · visible to the studio` / `You and …`) lived in `doc-spine.tsx` itself and I find no ruling for its deletion in `technical-design.md` or `reconciliation.md`. It is now asserted gone by `doc-spine.test.tsx:89-90`.
*Ask:* the architect confirms the citation, or the line comes back.

**L-04 · low · 0.85 · `apps/designer-portal/src/components/document/doc-spine.test.tsx:22-26`**
The surviving case keeps its title — "prints the active section label and 'Put down' from 1180, not only from 1440" — but the label half of the assertion was deleted (test-impact sanctions `:26-28` dying, so the deletion is authorised; the title is not). What remains asserts only the `Put down` class. The new head test asserts the phrase renders, with no tier condition, so nothing now proves the stage phrase prints from 1180.

**L-05 · low · 0.9 · `apps/designer-portal/src/components/document/margin-item.tsx:34-38` — "DOCUMENT_INDEX_LABELS single source"**
The single source **holds**: `document-index.ts:88-92` derives `DOCUMENT_INDEX_LABELS` from `PROJECT_PAPER_ORDER`, and `mobile-bar.tsx:123` consumes it correctly. But `marginRegionName` re-derives the same label with its own `PROJECT_PAPER_ORDER.find(...)?.label ?? key`. Two accessors over one array, and the `?? key` fallback would print a raw key (`ffe`) where `regionHeadingId` deliberately throws.
*Fix:* `DOCUMENT_INDEX_LABELS[key].toUpperCase()`.

**L-06 · low · 0.7 · `apps/designer-portal/src/components/document/margin-rail.tsx:594`**
The ≥1440 column heading prints `In the margin` with **no count**. Reconciliation §8's print contract and its walker-sees line both read `IN THE MARGIN · 7`. The count now exists only on the 1180–1439 tab. Fidelity's call, noted here because the summary that would supply it is already computed one component away.

**L-07 · low · 0.85 · `apps/designer-portal/src/components/document/margin-rail.tsx:258`**
`min-[1180px]:w-[min(360px,calc(100vw-56px))]` still encodes the retired 56px rail after OD-15 moves it to 136px. Inert in practice (360 wins at any viewport ≥ 416px, and the panel is `hidden` below 1180), but a stale literal in the one file the reader will check when the sheet and the rail disagree.

**L-08 · low · 0.7 · `apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:232-234`**
With no reading stop the sections doorway's `aria-label` becomes the bare `'Open sections'`. Previously it was `Open sections, current section ${context}`. OD-11 rules the `Open sections, at ${stopLabel}` form; it does not rule the null case. Until the integration lane supplies `readingIndex`, every document's sections doorway loses its context from the accessible name — a strict a11y regression in the interim state, codified by `mobile-bar.test.tsx:277-287`.
*Fix:* fall back to the section (`Open sections, current section ${context}`) rather than to nothing.

**L-09 · low · 0.8 · `apps/designer-portal/src/components/document/margin-rail.tsx:157-165` + `:456-459`**
`summary` initialises to `{count: 0, worst: null}` and is corrected from a child's `useEffect`, so the 1180–1439 tab's first paint reads `Margin` and swaps to `Margin · 7 · 1 OVERDUE`. Unavoidable — the count is React-Query data that cannot exist at first paint — but it is an effect-corrected text change on persistent chrome. Naming it so W4's CLS gate expects it rather than flags it. (No infinite loop: `publishSummary` is a stable `useCallback` with an identity bail-out, and the effect's deps are `[publishSummary, raised.length, worst]`.)

**L-10 · low · 0.6 · `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:360-365` (forward-looking)**
`resolveRailFiles()` resolves to exactly **5** files on w1-l1 — `doc-spine.test.tsx`, `doc-spine.tsx`, `spine-running-index.tsx`, `spine-shelved-blocks.tsx`, `margin-rail.tsx` — against `toBeGreaterThanOrEqual(5)`. W1 passes with zero headroom. W2's OD-16 deletion of the two remaining `spine-*` files drops the count to 3 unless `components/document/spine/` lands with ≥2 files in the same lane.
*Ask:* W2-L1 must land `spine/lens-ladder.tsx` (and one sibling) in the same commit as the deletions, or move the floor with a written reconciliation.

**L-11 · low · 0.75 · `apps/designer-portal/src/components/document/doc-spine.tsx:59-70` vs `:78`**
The `Put down` `<Link>` sits **outside** `[data-spine-head]`; reconciliation §7's walker-sees lists `← PUT DOWN` as the head's first line. Visual order is unchanged, but the "reserved head" block and the ruled head are not the same box, so the 84/100px reserve does not account for the link's height. Definitional; matters if anything later measures `[data-spine-head]` against the ruled reserve (see M-11).

---

## Checks that PASS — stated, with evidence

**Hydration safety of the new head — PASS (0.9).** `doc-spine.tsx`'s head is pure CSS-tier: `min-h-[84px] min-[1440px]:min-h-[100px]`, the arc's `sm`/`xs` marks swapped by `min-[1440px]:hidden` / `hidden min-[1440px]:block`. No `matchMedia`, no `useSyncExternalStore`, no `useState`+`useEffect` tier correction, no effect-corrected first paint. Server and client render identical markup. `mobile-bar.tsx` is likewise CSS-gated (`min-[1180px]:hidden`) and takes `readingIndex` from React context, not a subscription. The only effect-corrected paint introduced in W1 is L-09, and it is data-driven rather than tier-driven.

**Every hook above the early returns — PASS (0.95).** `MarginRail`: the four new hooks (`useMemo` anchorGroups, `useContext`, `useMemo` worst, `useEffect` publish) sit inside the leading hook block at `:424-460` with no `return` before them (verified by reading `:395-475`). `ResponsiveMarginRail`: new `useState`/`useCallback` at `:157-165`, above every effect and the single `return`. `LetterheadVitals`: hook count went from three (`useProjectV2` + two `useState`) to one, and the two early returns (`:280`, `:294`) both follow it — strictly safer than before. `MobileBar`: no hooks added; `household`/`readingIndex`/`stopLabel` are plain derivations.

**Deleted `spine-timer.tsx` leaves no dead imports/tests — FAIL, see C-01/C-02/L-01.** `git grep` on each branch found: 2 hard breakages (C-01, C-02), 2 dead product selector strings (L-01), 1 stale comment (`contrast.test.ts:300`, harmless), 1 stale screenshot filename (`scripts/the-document-slice5-shots.mjs:104`, harmless).

**Margin grouping stability — TESTED (0.85).** `anchorGroups` (`margin-rail.tsx:426-455`) depends only on `raised`; `currentStop` reaches nothing but `data-beside-current` and a colour class (`:743-763`). Order is `PROJECT_PAPER_ORDER` then whole-job-last, stable by construction. **The test exists**: `__tests__/margin-rail-stage2.test.tsx:176-217` ("lifts the count to charcoal for the stop she is standing in — and moves no card") rerenders with `currentStop="ffe"` and asserts `order()` and `titles()` are byte-identical across the change. That proves DOM stability in jsdom; geometric CLS is W4's `lens-cls.spec.ts`, as it must be (§6: jsdom does no layout).

**`marginTabLabel` zero handling — PASS (0.95).** `margin-rail.tsx:123-127`: `count === 0` returns the bare `'Margin'` before `worst` is consulted. `worst` is null whenever `raised` is empty (`worstMarginKind` returns null on an empty list), so `Margin · 0` is unreachable from both directions. Asserted at `margin-rail-stage2.test.tsx:250-267` via `getByRole('button', { name: 'Margin' })`. The five surviving `getByRole('button', { name: 'Margin' })` sites in `responsive-document-shell.test.tsx` also stay green: that file renders `ResponsiveMarginRail` with a stub child, never `MarginRail`, so nothing publishes a summary.

**`--color-clay` on charcoal in the mobile bar — PASS (0.9).** `contrast.test.ts:140-158` ("leaves the base pigments legible on charcoal, where the inks are not") asserts `--color-clay` ≥ 4.5:1 on `#2C2926` (6.21) and `--color-clay-ink` < 4.5:1 (2.41), and its comment names "the mobile bar" as one of the four dark grounds the ruling covers. So the lane's choice at `mobile-bar.tsx:250` is the *correct* one and the guard would catch a well-meant sweep to `-ink`. **Caveat:** the exemption is token-level, not file-level — `pigmentOffenders` is only run over `resolveRailFiles()` (spine files + `margin-rail.tsx`) and, once it exists, `lens-band.tsx`. `mobile-bar.tsx` is under `mobile/` and is scanned by nothing, so no per-file guard binds it either way.

**`DOCUMENT_INDEX_LABELS` single source — PASS (0.95), one duplicate accessor.** `document-index.ts:88-92` derives it from `PROJECT_PAPER_ORDER`; `mobile-bar.tsx:123` and `worktable/future-seam.tsx:44-49` consume it. Only `margin-item.tsx:34-38` re-derives (L-05).

**`page.tsx` grid literal vs `responsive-document-shell.test.tsx`'s matchMedia fakes — PASS (0.9).** The shell test asserts DocSpine's classes and `data-spine-regime`; it never asserts `page.tsx`'s `grid-template-columns`. `installMatchMedia` (`:139-171`, `:523-540`) is keyed on `'1440px'` and is untouched by a `min-[1180px]:` literal. The only bindings to the 56px number are `quiet-responsive-shell.spec.ts:223-228` (55/57 → 135/137) and `quiet-release-contracts.spec.ts:115-117` (56 → 136), and both moved in the same lane. The L4 test also correctly picked up L1's `px-1.5 → px-3` (`:194`).

**Prettier drift claims — PASS (0.95), nothing pre-existing.** The only style commit is `2ac6487eb`, and it reformats **four lines of L4's own new code** written in `1335f2e2d` (two `toHaveCount(0)` calls). No lane claims pre-existing Prettier drift and none is asserted anywhere in W1.

---

## Fixes required before ship

1. **C-01** — `mobile-timer-sheet.test.tsx`: delete the `../spine-timer` import at `:11` and re-point `:429`, `:476`, `:511`, `:590` at the file-local `MobileTimerFallbackDoorway`. *(one edit, W1-L3's lane)*
2. **C-02** — `responsive-document-shell.test.tsx`: delete the non-virtual `jest.mock('../spine-timer', …)` at `:83-90`. *(one edit, W1-L4's lane)*
3. **C-03** — Rule and then fix the letterhead vitals: keep `VitalDate` and the band mounted and editable; make the *printing* empty, not the *element*. Until ruled, W1 ships a project document whose start date and target can never be recorded, and a `×` press that permanently removes the field. Needs the ARCHITECT or DESIGN LEAD.
4. **C-04** — Scope `line-clamp-2` to the margin's first-touch note. A shared primitive that clips focusable controls out of view while they stay in the tab order fails SC 2.4.11 on the Desk and in People, neither of which this program touches.
5. **C-05** — If the cap stands anywhere with non-string children, give it a focusable expand affordance; `title` on a non-focusable `<span>` is a mouse-only recovery and is absent on four of five call sites.
6. **M-01 / M-02** — The replacement e2e must (a) not depend on the fallback timer block rendering at 390 (it does not when a lifecycle act is registered), and (b) assert `toHaveCount(0)` on `[data-full-spine-timer]` and `[data-compact-spine-timer-doorway]` if it is going to claim "sole".
7. **Gate evidence** — run and record jest / type-check / lint / e2e for the merged W1 tree, and write the suite/test delta against test-impact's 458 / 5173. Test-impact's own rule: a wave whose suite count moves without a written reconciliation does not merge.

## Should fix, not gating

- **M-03** — restore the timer sheet's scroll-lock-restore, Escape-restore and breakpoint-crossing coverage somewhere; those surfaces still ship.
- **M-04** — tighten `In hand today|Hands free` to the state the test intends.
- **M-05** — move `--doc-shell-bottom-inset` to 72px in the lane that moved the bar.
- **M-06** — `readingIndex ?? undefined`, and flip the test; settle the form before the rail and the shell publish it in W2/W3.
- **M-07** — rank `worstMarginKind` by `kind`+`state` as R12 does, or change the JSDoc to say what it actually does; and confirm the `NEEDS REVIEW` / `DUE` tab strings against the print contract.
- **M-08** — rename the stale `describe`, and state in the rewrite which assertion became which (§6 requires it).
- **M-09** — keep the ≥1440 heading in flow (or `justify-end` below 1440) so the capture row does not jump left.
- **M-10** — either measure the chip and correct the "44px" claim, or make the change that reaches 44px.
- **M-11** — raise the narrow-tier head floor to reconciliation §10's ~116px alongside the arc wrap.
- **M-12** — corollary of C-03; resolves with it.
- **L-01** — prune the two dead timer selectors from `SHEET_RETURN_FALLBACKS.timer`.
- **L-02** — drop `others` from `DocSpineProps` (and from every caller and test) rather than leaving a required prop nothing reads.
- **L-03** — confirm the ruling for the presence line, or restore it.
- **L-04** — retitle the surviving `doc-spine` case to match what it now asserts.
- **L-05** — `marginRegionName` → `DOCUMENT_INDEX_LABELS[key].toUpperCase()`.
- **L-06** — the `· 7` on the ≥1440 heading, per the print contract.
- **L-07** — retire the `calc(100vw-56px)` literal.
- **L-08** — fall back to the section name in the sections doorway's `aria-label` when no stop is held.
- **L-09** — expect the tab's first-paint swap in W4's CLS gate rather than flagging it.
- **L-10** — W2-L1 must land `spine/` before or with the two deletions, or move the contrast floor with a written reconciliation.
- **L-11** — decide whether `Put down` belongs inside `[data-spine-head]`.

## Expected at integration — NOT reported as missing

Per the review brief, the W1 integration lane is concurrently wiring these; the lanes are correct to leave them:

- `page.tsx` → `DocSpine` props: `household`, `roomInHand`, `onReleaseRoom` (C-1). Until then the room in hand prints **nowhere** — `doc-letterhead.tsx` stopped printing it and `DocSpine` is not yet fed. `doc-letterhead.tsx` keeps `inHandRoomName` / `onReleaseRoom` on its signature, unread, exactly as its header comment says.
- The studio drawer's timer doorway wiring below 1440 (F03 landed; the doorway itself is integration's).
- The arc wrap at 1180–1439 per reconciliation §10 ruling (d) — four marks over three, `min-h-6` per `li`, arc costs 48px. W1-L1 leaves the pre-existing `flex-col` at that tier. **Note for that lane:** the head's `min-h-[84px]` (M-11) should move to the ruled ~116px in the same commit.
- The room-in-hand test re-point.
- `page.tsx` → `MarginRail currentStop` (the prop and its grouping behaviour are in; nothing feeds it yet, so `data-beside-current` never fires in product this wave).
- `page.tsx` → `MobileActiveDoc.readingIndex` (A-08). Until then `stopLabel` is always null, so the bar prints two lines, `data-reading-index` is always `''` (M-06), and the doorway's `aria-label` is the bare `'Open sections'` (L-08).
