# Lane D6 — Concept render upload UI (PP-7) — re-review

Re-reviewer context: separate session from both the implementer and the first reviewer. Did not
trust either report; re-inspected the pushed branch `origin/portal-polish/d6` (`90c75b7ae` on top of
`2cb4c242c` on top of `f6f660a88`, cut from `origin/main` @ `1059f5275`) and the worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d6` (confirmed `HEAD` == `origin/portal-polish/d6`
== `90c75b7ae`, working tree clean). Re-ran every gate independently rather than accepting either
report's numbers.

## Pathspec discipline

```
$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/d6 --stat
 .../__tests__/concept-render-upload.test.tsx       | 246 ++++++++++++++
 .../src/components/document/ffe-section.tsx        |   8 +
 .../document/rooms/concept-render-upload.tsx       | 355 +++++++++++++++++++++
 .../waves/w3/d6-fix.md                             | 107 +++++++
 .../waves/w3/d6-impl.md                             | 191 +++++++++++
 5 files changed, 907 insertions(+)
```

Exactly the lane's three files plus its own two reports. `ffe-section.tsx`'s diff is one import
(`ConceptRenderUpload`) and one mount immediately after `<RoomHeading .../>`, guarded by `!selecting` —
verified by reading the diff directly (`git diff 1059f5275 90c75b7ae -- .../ffe-section.tsx`), not
just trusting the stat. `ffe-section.tsx` is not in Wave 3's shared-file table, so no lane-ownership
conflict. The fix commit (`90c75b7ae`) touches only `concept-render-upload.tsx` plus its own
`d6-fix.md` — no drift into `packages/supabase`, `globals.css`, or any file outside the lane's
pathspec. Commit messages are Conventional Commits (`feat(designer): …`, `docs(portal-polish): …`,
`fix(designer): …`); no `git add -A` evidence (each commit's file list is narrow and deliberate).
**Clean.**

## Gates — re-run independently, fresh, from the worktree

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/concept-render-upload.test.tsx
PASS src/components/document/__tests__/concept-render-upload.test.tsx
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total

$ (cd apps/designer-portal && npx eslint src/components/document)
✖ 38 problems (1 error, 37 warnings)
# the 1 error, confirmed by re-reading the output directly:
#   piece-room-save-gate.test.tsx:159  import/first — the known baseline, not from either new file

$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts
PASS shadow-gate.test.ts, PASS contrast.test.ts
Test Suites: 2 passed, 2 total
Tests:       59 passed, 59 total

$ pnpm --filter @patina/designer-portal test -- --ci        # full suite, fresh run
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6701 passed, 6702 total
Snapshots:   12 passed, 12 total

$ pnpm --filter @patina/designer-portal lint                # whole portal
✖ 205 problems (2 errors, 203 warnings)
# both errors re-confirmed by grepping the raw output:
#   piece-room-save-gate.test.tsx:159        import/first
#   use-commercial-documents.test.ts:930     react-hooks/rules-of-hooks
```

Every number matches both the impl report and the first review exactly — 545/545 suites, 6701 passed
+ 1 todo (baseline 544/6691+1 todo + this lane's 10), lint 205 problems with the same 2 known errors
at the same two lines, lane-scope eslint unchanged at 38/1/37. The full suite ran clean on the first
try this time (no flake to chase, unlike the impl report's one loaded-machine run). **All gate
numbers independently verified true, not just repeated from the reports.**

## Fix round — independently verified against the diff, not the fix report's prose

```
$ git -C .../agent-pp-d6 show 90c75b7ae -- apps/designer-portal/src/components/document/rooms/concept-render-upload.tsx
```

Confirmed exactly two changes, both matching what `d6-fix.md` claims:

1. **d6-1 (P2, 44px targets) — actually fixed.** `min-h-11` added to both the file input and the
   caption input's className, nothing else touched on those elements. Matches
   `add-line-sheet.tsx:10`'s `FIELD_CLASS` convention (`min-h-11 w-full …`) exactly.
2. **d6-2 (P3, label family/tracking) — actually fixed.** Both `<label>` elements gained `font-mono`
   and `tracking-[0.08em]` (was `tracking-[0.05em]`, no family class, inheriting the page's Inter
   sans). Confirmed `font-mono` resolves to `var(--font-mono)` / DM Mono via
   `apps/designer-portal/tailwind.config.ts:17` — the same family the house sheet's `.t-head` names.
   Colour left at `--text-muted`, correctly not touched (the finding was about family/tracking, not
   colour).

d6-3 (orphaned storage object on Remove) and d6-4 (uncontrolled `useEffect` read) were declined with
reasoning recorded in `d6-fix.md`. Independently re-checked both declines:

- **d6-3.** `clearConceptRender` still nulls only the four `project_rooms` columns; the object in the
  private `room-renders` bucket is never deleted on Remove. Confirmed this needs either a
  `packages/supabase` hook (Lane A2's file, off-limits to D6 per the plan's step 3) or a product
  ruling on whether Remove should destroy the object — genuinely not fixable inside this lane's
  pathspec. The decline is correct.
- **d6-4.** Re-read `readConceptRender`: `createBrowserClient()` is called inside an `async` function
  that is `await`ed inside a `try/catch` in the `useEffect`. A synchronous throw inside an async
  function becomes a rejected promise, which the `catch` already handles — the fix report's reasoning
  is correct. The residual risk (a hang, not a throw) is real but unfixed by the offered mitigations
  without adding an abstraction nobody asked for. Reasonable to decline; correctly recorded as an
  accepted risk rather than silently dropped.

Gate numbers in `d6-fix.md` were re-run above and matched exactly — no regression from the fix, no
new suite, no count movement anywhere.

## House sheet conformance (SPEC.md §A, as amended by §F)

- **No new hex.** Every colour token used (`--color-pearl`, `--color-clay`, `--color-charcoal`,
  `--color-terracotta-ink`, `--text-muted`, `--text-subtle`) is confirmed present in
  `globals.css` with the exact hex values the house sheet's A1 block specifies for `--ink-muted` /
  `--ink-subtle` (`#4E4339` / `#5A4E43`). No literal hex anywhere in either new file.
- **No shadow / pill / badge / dot / ✓ / spinner.** Grepped both new files directly — none present.
  The only loading affordance and the `disabled:opacity-50` come from the shared, untouched
  `DocumentAction` primitive (`.da-act`) the whole document surface already uses; confirmed by
  reading `document-action.tsx` directly — not this lane's file, not this lane's decision.
- **No truncation.** No `text-overflow` / `line-clamp` anywhere. Prose capped at `max-w-[56ch]`,
  matching A6's `.consequence` and A10's caption convention.
- **Type steps / tokens.** After the fix, the two field labels are `font-mono text-[11px] uppercase
  tracking-[0.08em]` — this now matches `.t-head`'s family, size, tracking and case exactly (SPEC.md
  A3), even though the component still doesn't wire the literal `.t-head` class name. Confirmed no
  Wave-3 lane wires the named `.t-*` classes into `globals.css` at all (checked A1/A4's diffs) — this
  remains a program-level gap the first review correctly scoped as out of D6's blame, and the fix
  round correctly declined to fix it here (would require editing `globals.css`, outside pathspec).
- **A10 plate/caption convention.** The 92×92 `object-cover` plate at `rounded-[3px]` with a 1px
  `--color-pearl` border matches A10's Desk-thumbnail row (92×92px cover, 3px radius, 1px hairline
  border) exactly. The caption line `Concept render · {caption} · uploaded {date}` is a reasonable,
  though not literal, fit to A10's "what it is · whose it is · when" pattern — here the middle segment
  is the studio's own free-text description rather than an attribution ("photographed by …"), which
  is defensible since a concept render's caption field is explicitly the studio's own words, not an
  authorship credit. **Noting as a low-confidence, non-blocking observation, not a finding**: A10's
  canonical examples all use "verbed by Studio Name" for the middle segment; this deviates in kind
  (content, not attribution) without a ruling that says this is fine. Not blocking — PP-7's own text
  only requires caption + date to be shown, which is satisfied.
- **PP-7 / R142.** Consent line `"Labeled 'Concept · not installed' on the client's page"` is
  byte-identical to the ruling text and confirmed (by test and by reading the render order) to render
  **before** any upload act exists. `--color-error` never appears; `--color-terracotta-ink` is used
  for both error states, matching the F56 ink convention.

## D1/D4 (designer-portal CLAUDE.md)

Re-read the CLAUDE.md directly (not summarized): "D4 — zero shadows … the portal-polish program
(R139–R142, I153) adopts no depth at all" and "D1 — strict focus. No split views, no document tabs,
no persistent global nav inside a document." Confirmed: no `box-shadow` / `shadow-*` in either new
file; `shadow-gate.test.ts` re-run green and unedited (diff confirms it is not in the lane's file
list); no route, no tab, no persistent nav — the component is an inline disclosure at the existing
room heading that unmounts with nothing else on the page changing. The unfolded form's `border-l
border-[var(--color-pearl)]` is a 1px hairline indent, not a depth cue — consistent with A4's
hairline-for-structure convention, not a violation.

## Accessibility — re-checked independently, one item the first review did not surface

- **Focus indicators on inputs (new finding this pass).** The caption input's className includes
  `outline-none` paired with only `focus:border-[var(--color-clay)]` as the focus indicator — the
  browser's native focus ring is suppressed and replaced by a 1px border colour change from
  `--color-pearl` to `--color-clay` on a dashed rule. This is a real, if minor, focus-visibility
  concern (WCAG 2.4.7): a colour-only border change on a 1px line is a weaker focus cue than the
  default ring. **However**, this is not something D6 introduced — it is copied verbatim from the
  exact convention already established in the sibling files the lane matched deliberately:
  `add-line-sheet.tsx:10` (`FIELD_CLASS`) and `add-to-project-sheet.tsx:26` both use the identical
  `outline-none … focus:border-[var(--color-clay)]` pattern. Filing as **P3, confidence: high** — a
  real, verified pattern, but a pre-existing program-wide convention this lane correctly followed
  rather than deviated from; not this lane's bug to fix alone, and fixing it here without fixing the
  two sibling files would create inconsistency rather than resolve one. The file input has no
  `outline-none` override and keeps its native focus ring.
- **44px targets** — re-verified after the fix: both new inputs now carry `min-h-11` (44px); every
  `DocumentAction` (Add/Replace/Remove/Upload/Cancel) inherits `min-h-[44px] min-w-[44px]` from the
  shared `.da-act` base class (`document-action.tsx:53`), confirmed by reading that file directly.
- **`aria-expanded`, not `aria-pressed`.** The toggle act (`Add a concept render` / `Replace`) uses
  `aria-expanded` for a disclosure that reveals a form — the semantically correct choice per the review
  checklist's own distinction (`aria-pressed` is for toggle-button *state*, not visibility disclosure).
  The label stays stable across open/closed states (only changes with `record` presence, never with
  `open`), so there is no unstable-label problem.
- **Errors** use `role="alert"`, matching the codebase's existing convention; confirmed live in the
  test suite (`await screen.findByRole('alert')`).
- **Labels** are `htmlFor`-associated via `useId()`; confirmed both `<label htmlFor>` / `<input id>`
  pairs are present and unique per room (id is scoped by `useId()`, not room id — fine, since each
  `ConceptRenderUpload` instance gets its own hook call).
- **Alt text** on the render image is non-empty: `record.caption ?? \`Concept render for ${roomName}\`
  ` — never empty, never omitted.
- **Contrast** — `--text-muted` (9.22:1), `--text-subtle` (7.73:1), `--color-terracotta-ink`
  (5.28–5.64:1 per the codebase's own documented figures in `globals.css`) all clear the 4.5:1 floor
  for the text sizes used. No stage plates or `--rail` person plates appear anywhere in this
  component, so that specific check in the review brief does not apply to this lane's surface.

## Test coverage

Confirmed by reading `concept-render-upload.test.tsx` directly: every test drives the real component
through `fireEvent` / `screen` queries by role/label/text and asserts on rendered output or mock-call
payloads — no snapshot test, no className assertion, no markup-shape test. The two strings changed by
the fix (label classNames) are not pinned by any test — correctly not adding a markup test for a pure
styling change, consistent with the file's own behavior-first testing convention.

## Comparison to the specimen

`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html` (the Desk roster) does not
contain a concept-render region at all — this feature lives inside the project document's rooms/FF&E
surface (`ffe-section.tsx`), not the Desk. `client-house.html` also has no "Concept" text or
matching UI (the on-image label is H5's client-portal concern, out of D6's scope). There is no
directly matching region in any of the three specimens to diff against; the component instead follows
A10's general plate/caption/empty-state conventions, which is the correct fallback per the plan (no
specimen dictates this exact UI). **No divergence to report against the specimens themselves** —
noting the absence of a direct comparison target rather than skipping the check.

## Findings

**P3 — Caption input relies on a colour-only focus indicator (`outline-none` + border-colour change) (confidence: high, informational).**
See "Accessibility" above. Pre-existing program convention (`add-line-sheet.tsx`, `add-to-project-sheet.tsx`),
correctly matched rather than deviated from by this lane. Not a regression D6 introduced; flagging
forward as a design-system-level item (all three files share it), not a per-lane fix.

**P3 — Concept-render caption line's middle segment departs from A10's "whose it is" attribution pattern (confidence: low, informational).**
See "House sheet conformance" above. `Concept render · {studio's free-text caption} · uploaded {date}`
vs. A10's canonical `{what} · {verbed by whom} · {when}`. Defensible given the caption field's stated
purpose (the studio's own words, not an attribution), and PP-7's ruling does not require the A10
three-part attribution form specifically — flagging only because the checklist calls for house-sheet
conformance, not because it reads as broken.

**P3 — Orphaned storage object on Remove, unresolved (confidence: high, severity: informational/low) — carried forward.**
Confirmed still true after the fix round: `clearConceptRender` clears only the four columns; the
object in `room-renders` is never deleted. Correctly out of this lane's pathspec (needs A2's owner or
a ruling); the fix round's decline is accurate, not a dodge.

**P3 — Uncontrolled `useEffect` read across unrelated suites, unresolved (confidence: low-medium) — carried forward.**
Confirmed still true and still correctly reasoned as low-risk: the async throw is caught by the
existing `try/catch`; the only unmitigated risk is a hang, and the fix round's decline not to add
client-injection machinery for that is a reasonable proportionality call, not a fixed defect being
waved away.

No P1 or P2 remains. The one P2 from the first review (44px touch targets) is verifiably fixed —
confirmed by reading the diff, not by trusting the fix report's prose.

## Non-findings re-confirmed independently

- No route added, no `href` anywhere in either new file.
- MIME/size limits imported from A2's hook module (`ROOM_RENDER_MAX_BYTES`, `ROOM_RENDER_MIME_TYPES`),
  never retyped — confirmed by reading the import list and the hook file itself
  (`packages/supabase/src/hooks/use-room-concept-render.ts`), not just the component's usage.
- Hook call shape (`mutateAsync({ projectId, roomId, file, caption })`) matches the hook's actual
  `UploadRoomConceptRenderInput` signature exactly — confirmed by reading the hook file directly.
- No feature flag anywhere in the diff (matches PP-8's "everyone gets it").
- `git status --porcelain` on the worktree is clean — no stray uncommitted files, no untracked
  landmines.

## Verdict

**approve.** The one P2 from the prior round is genuinely fixed and independently re-verified against
the diff and a fresh gate run (type-check clean; new suite 10/10; lane eslint 38/1/37 unchanged; full
suite 545/545, 6701+1 todo; whole-portal lint 205/2 unchanged, both errors confirmed as the pre-existing
baseline). Pathspec discipline holds through both the original push and the fix commit. No P1 or P2
remains; the four P3s are either pre-existing program-wide conventions this lane correctly matched, or
already-transparently-reported, correctly-declined-as-out-of-scope items. Nothing here should block
Wave 3 integration.
