# W1b — The Band: line 2 speaks with owners, one leader, the door fixed

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-standing-head-build` (branch `build/standing-head-2026-09-10`). Portal: `apps/designer-portal`. Deliver exactly what this brief asks — no unrequested features, refactors, or abstractions. Comments only for constraints the code cannot show. Use absolute paths; never `cd`. Do not run git. Another agent (W1c) is editing, in a separate worktree, the letterhead, the stage line, the region head and `desk-derivation.ts` — do not touch those files; your `page.tsx` edits stay inside the line ranges named here so the merge is clean.

Read first: `artifacts/phase-header-2026-09-10/build/PROGRAM.md`; the panel synthesis §2 "Direction 2 — The Band" and rulings R2/R5 (`git -C /Users/kody/Code/patina-merged show origin/design/phase-header-2026-09-10:artifacts/phase-header-2026-09-10/panel/synthesis.md` and `…:artifacts/phase-header-2026-09-10/rulings.md`).

## Files you own
`src/lib/document/document-guide.ts`, `src/lib/document/document-guide-inputs.ts`, `src/lib/document/lens-band-derivation.ts`, `src/lib/document/lens-ladder-derivation.ts`, `src/components/document/lens-band.tsx`, `src/components/document/standing-sheet.tsx`, `src/components/document/discovery/discovery-section.tsx`, and in `src/app/(document)/doc/[id]/page.tsx` ONLY: the guide block (~1544-1660: `guideInputs`, `deriveDocumentGuide`, `activateDestination`, `activateGuide`), the ladder facts (~1900-1970 `preworkStatus`/ladder facts), and the `bandModel` useMemo (~2140-2194). Plus their tests: `src/lib/document/__tests__/document-guide*.test.ts`, `lens-band-derivation.test.ts`, `lens-ladder-derivation.test.ts`, `src/components/document/__tests__/lens-band.test.tsx`, `standing-sheet` tests if any, `src/components/document/discovery/discovery-section.test.tsx` and `discovery/__tests__/*`, and the listed lines of `src/app/(document)/doc/[id]/page.test.tsx`.

## Changes

**1. R2 — the needs-input sentence names owners** (`document-guide.ts` `withInputs` ~364-391 and `stageCopy`).
When `model.state === 'needs_input'` and `inputFacts` is non-empty, the headline is built from the facts instead of the stage's static headline. Grammar (facts keep their order; labels lower-cased as they are in `DISCOVERY_INPUTS`; client first name = first token of `row.client_name`, fallback "the client"):
- all owner `Client`: `Waiting on {First}: {label}, {label}.`
- all owner `Designer`/`Studio`: `Yours to add: {label}, {label}.`
- mixed: `Yours to add: {designer labels}. Waiting on {First}: {client labels}.`
- `Project team` owner reads as designer-side.
The act stays `Add {firstInput.label}` (existing). `withInputs` needs `clientName` — thread it through `deriveDocumentGuide`'s input (`row.client_name` is on the row already passed in). Keep `stageCopy.discovery.headline` as the fallback when there are no facts but the state is still `needs_input` (e.g. reads pending). Update `document-guide.test.ts`, `document-guide-inputs.test.ts`, and `page.test.tsx:777, 864, 2275` — each becomes the owner sentence the fixture yields (compute it from the fixture's missing essentials; e.g. scope missing → `Yours to add: project type and named rooms.`).

**2. R5 — one leader; the band's rest act begins the Direction** (`document-guide.ts` ~749-791 rest branch, `page.tsx` `activateDestination` ~1637-1653, `discovery-section.tsx` ~435-492).
- Add a destination kind `{ kind: 'begin-direction' }` to the guide's destination union. `restAction` for `discovery` uses it (label stays `Begin the direction`).
- In `page.tsx`, `activateDestination` handles `begin-direction` by calling the same mutation and landing the readiness band uses today: read `discovery-section.tsx` `begin()` (~324-345: `useBeginDirection().mutateAsync`, the `landing` state, the `router.replace`/`push` to the new document) and lift that logic into page.tsx (a `useBeginDirection()` hook call above all early returns; a `beginDirectionLanding` state). While the mutation is pending, the band's act is disabled. On error, line 2 prints `Couldn't begin the Direction — {message}` with a `Retry` act that re-runs it (reuse the existing `retry` destination shape or add the minimal equivalent).
- In `discovery-section.tsx`: delete the readiness band (~435-470) and its inline error band (~474-492) — the `StrataMark`, the `Working with` eyebrow, the count sentence, and the `Begin the Direction` / `Open the Direction` act. Remove the now-unused `useBeginDirection`, `landing`, `begin`, `beginError` state, and the `fill` from `deriveDiscoveryReadiness` if unused. Keep `onEyebrow` reporting (`W1c` decides whether the region prints it). Keep `alreadySeeded`: when `alreadySeeded` is true and the document is still on the discovery spread, the band's rest act label is `Open the direction` and its destination is the existing `{kind:'anchor', section:'direction'}` — thread `alreadySeeded` (from `read?.row?.seeded_proposal_id`) into `deriveDocumentGuide` via page.tsx (page.tsx already runs `useDiscovery` at ~932).
- Tests: `discovery-section.test.tsx` "Begin the Direction (J1)" block moves to `page.test.tsx` next to the `rests a discovery document` test (~2278-2303): pressing `Begin the direction` on the band calls the mutation once; pending disables the act; an error prints the sentence with `Retry`. Mock `useBeginDirection` from `@patina/supabase` there.

**3. D1 — the door lists each input with its own act, and never the one the band names** (`page.tsx` ~2140-2194, `lens-band-derivation.ts` ~699-701, `standing-sheet.tsx`).
- Build `inputs` from `guideInputs.slice(1)` when the guide's act names `guideInputs[0]` (i.e. `guideModel.topInput` is set and the state is `needs_input`); otherwise from the full list. Each row's act: `{ key: 'input:'+fact.label, label: 'Add '+fact.label, onAct: () => activateDestination({ kind:'anchor', section: row.active_section, focusId: fact.focusId, activate: true }) }` when `fact.focusId` exists; `null` when it does not (direction gaps, signatures). `inputSignature` (~2124) must include `focusId` now.
- `withheld` stays `standingCount − (worst ? 1 : 0)` — with the named input removed from `inputs`, the arithmetic is now right. Update the N-02 comment (~170-200 in the derivation) to say the named input is excluded upstream. Fix any `lens-band-derivation.test.ts` case that asserted `+1 MORE` for a single named input: it now prints no door.
- `standing-sheet.tsx`: input rows' eyebrow uses `--color-clay-ink` (exception rows keep terracotta-ink). Rows with `act: null` render the sentence only.
- Tests: a `lens-band.test.tsx` or `page.test.tsx` case that opens the door with two missing essentials (scope named on the band; budget + lifestyle in the sheet) and asserts the sheet has two rows whose buttons read `Add Working budget` / `Add Lifestyle needs` (match the labels as `DISCOVERY_INPUTS` casing yields) and that pressing the second calls `activateDestination` with `focusId: 'discovery-facet-lifestyle'`.

**4. D6 — the discovery ladder register counts essentials** (`lens-ladder-derivation.ts` ~556-561, `page.tsx` ladder facts ~1900-1970).
`registerFor` for `discovery` returns `{ countLine: '${n} of 5 essentials' }` when the facts carry `essentialsDone` (add `essentialsDone?: number | null` to the ladder facts and pass `discoveryReadiness.essentialsDone` from page.tsx); `Nothing yet` only when it is null. `brief` and `direction` are unchanged. Update `lens-ladder-derivation.test.ts` and the `page.test.tsx` `prints NOTHING YET` test only if it touches discovery (it tests vision/proposal/scope/investment — leave those).

**5. D7 — the undo always says what it does** (`discovery-section.tsx` ~544-585).
The `<span id={RETURN_REASON_ID}>` always renders: `returnError ?? (returnRefused ? returnCheck.reason : 'Returns this to the lead queue; nothing here is lost.')`. `aria-describedby={RETURN_REASON_ID}` unconditionally. Update `discovery/__tests__/discovery-return-to-lead.test.tsx` to assert the consequence sentence in the allowed case.

## Gate
```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-standing-head-build --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-standing-head-build --filter @patina/designer-portal test -- src/lib/document src/components/document/discovery src/components/document/__tests__/lens-band.test.tsx "src/app/(document)/doc/\[id\]/page.test.tsx"
```
Both must be green. If type-check fails only on a symbol W1c owns (`DocumentStateRow.subject`, letterhead props), say so rather than editing that file.

Report: the exact sentences the fixtures now print, `git -C <worktree> diff --stat` (informational — do not stage), the type-check tail, the jest summary line per suite, and anything you could not do.
