# Lane D6 — Concept render upload UI (PP-7) — review

Reviewer context: separate session, did not implement D6. Inspected the pushed branch
`origin/portal-polish/d6` (`2cb4c242c` on top of `f6f660a88`, cut from `origin/main` @ `1059f5275`) and
the read-only worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d6`. Gates re-run
independently from that worktree (not trusted from the impl report).

## Pathspec discipline

```
git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/d6 --stat
 .../__tests__/concept-render-upload.test.tsx       | 246 ++++++++++++++
 .../src/components/document/ffe-section.tsx        |   8 +
 .../document/rooms/concept-render-upload.tsx       | 355 +++++++++++++++++++++
 .../waves/w3/d6-impl.md                            | 191 +++++++++++
 4 files changed, 800 insertions(+)
```

Exactly the three files the lane's brief lists, plus its own report. `ffe-section.tsx`'s `+8/-0` diff
is one import (`ConceptRenderUpload`) and one mount inside `roomGroups.map`, immediately after
`<RoomHeading .../>`, guarded by `!selecting` — matches the brief precisely. `ffe-section.tsx` is not
in Wave 3's shared-file table, so no lane-ownership conflict. **Clean.**

## Gates — re-run independently from the worktree

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/concept-render-upload.test.tsx
PASS ... 10 passed, 10 total

$ npx eslint src/components/document/rooms/concept-render-upload.tsx src/components/document/__tests__/concept-render-upload.test.tsx
(zero output — zero problems)

$ npx eslint src/components/document        # lane-scope, matches the brief's gate
✖ 38 problems (1 error, 37 warnings)        # the 1 error is the known piece-room-save-gate.test.tsx:159
                                             # import/first baseline — confirmed by line/rule match

$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts
PASS shadow-gate.test.ts, PASS contrast.test.ts — 59 passed, 2 suites

$ pnpm --filter @patina/designer-portal test -- --ci     # full suite
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6701 passed, 6702 total

$ pnpm --filter @patina/designer-portal lint             # whole portal
✖ 205 problems (2 errors, 203 warnings)   # piece-room-save-gate.test.tsx:159, use-commercial-documents.test.ts:930
```

All numbers **match the impl report exactly** — 545/545 suites, 6701+1 todo (baseline 544/6691+1 todo
+ this lane's 1 suite of 10), lint 2 known errors unchanged, lane-scope eslint 1 known error unchanged,
zero problems in the two new files. Report is trustworthy on every gate figure I checked.

## House sheet conformance

- **No new hex.** Every colour used (`--color-pearl`, `--color-clay`, `--color-charcoal`,
  `--color-terracotta-ink`, `--text-muted`, `--text-subtle`) is a pre-existing designer-portal token;
  `--text-muted`/`--text-subtle` already alias the house sheet's `--ink-muted`/`--ink-subtle` hex values
  (`globals.css:80-81`). Confirmed no literal hex in the new file.
- **No shadow / badge / pill / dot / ✓ / spinner / opacity-.5-on-a-state.** Grepped the new component —
  none present. (The pulsing-dot loading indicator and `disabled:opacity-50` come from the shared,
  untouched `DocumentAction`/`.da-act` primitive the whole app already uses — not introduced by this
  lane, out of its pathspec.)
- **No truncation.** No `text-overflow`/`line-clamp`. Prose is capped at `max-w-[56ch]`, consistent
  with the house sheet's own 56ch `.consequence` convention.
- **Type steps.** The component does **not** use the house sheet's named `.t-*` classes at all —
  labels and captions are raw Tailwind arbitrary values (`text-[11px] uppercase tracking-[0.05em]`,
  `text-[12px]`, `text-[13px]`). This is consistent with the **existing** local convention throughout
  `ffe-section.tsx` / `schedule/*.tsx` (verified: `add-line-sheet.tsx`, `add-to-project-sheet.tsx`,
  `composition-bar.tsx` all use the same raw-arbitrary-value style), and I confirmed **no Wave 3 lane
  (D1/D2/D3/D4/D5) has wired `.t-*` classes into designer-portal's `globals.css` either** — this is a
  program-level gap, not one D6 introduced alone. Still, two concrete divergences from the sheet worth
  naming (see Findings).
- **PP-7 / R142.** Consent line text is byte-identical to the ruling: `"Labeled 'Concept · not
  installed' on the client's page"`, rendered **before** any upload (confirmed by test and by reading
  the render order). `--color-error` never appears. The on-image label itself is H5's concern
  (client-portal), correctly out of this lane's scope.

## CLAUDE.md D1/D4

No split view, no document tabs, no persistent nav — the upload UI is an inline disclosure at the room
heading, unmounts with nothing else changing. No new depth: the unfolded form's `border-l` is a
structural hairline indent (matches A4's "1px solid var(--hairline) for structure"), not a shadow. Zero
`box-shadow` / `shadow-*` in the diff. `shadow-gate.test.ts` stays green and unedited.

## Hook usage vs. A2's actual shape

Independently read `packages/supabase/src/hooks/use-room-concept-render.ts` on `origin/main`. Confirmed:
`useRoomConceptRender()` really does expose upload only (`mutateAsync({ projectId, roomId, file,
caption })`), `ROOM_RENDERS_BUCKET` / `ROOM_RENDER_MAX_BYTES` / `ROOM_RENDER_MIME_TYPES` are exported
exactly as consumed, and there truly is no read or remove hook and no signer. The lane's report is
accurate, not a hand-wave — it did not invent a gap to justify skipping `packages/supabase`, the gap is
real, and the lane correctly left `packages/supabase` untouched (outside its pathspec) and used the same
`createBrowserClient()` precedent `use-document-rooms.ts` already sets.

The "no `QueryClientProvider` in some FFESection-mounting suites" justification for doing the read/remove
as plain awaited calls rather than `useQuery`/`useMutation` is also verified — I read
`schedule/__tests__/ffe-section-ceremony.test.tsx:141-142` directly and it says exactly what the report
claims. `useRoomConceptRender()` (which calls `useQueryClient()`) is called only inside `ConceptRenderForm`,
which mounts only once `open` is true, so the 32-plus suites that mount `FFESection` without a
`QueryClientProvider` never reach it — consistent with the full-suite 545/545 green result above.

## Findings

**P2 — 44px touch target not met on the file and caption inputs (confidence: high).**
`concept-render-upload.tsx`'s two form fields have no enforced minimum height:
```
<input id={...file} type="file" ... className="mt-1 block w-full max-w-[360px] py-2 text-[12px] ...">
<input id={...caption} ... className="mt-1 block w-full max-w-[360px] border-b ... py-1.5 text-[13px] ...">
```
Neither carries `min-h-11` (44px). The sibling file this lane's own component visually matches —
`schedule/add-line-sheet.tsx:10` — defines its shared input class as `'min-h-11 w-full rounded-[3px]
border ...'`, i.e. the established local convention for a text field in this exact directory already
enforces the 44px floor the review checklist names explicitly. The caption input's rendered height
(≈1.5×2 padding + ~20px line-height) lands around 31px, well under 44px; the native file input is
similarly unconstrained. Failure scenario: a designer on a touchpad/touchscreen with reduced dexterity,
or any automated 44px-target audit (the review brief calls this out by name), gets a smaller-than-spec
hit target on both fields — a real, easily-verified miss, not a style nitpick. Fix: add `min-h-11` (or
an equivalent explicit `min-height: 44px`) to both input classNames, matching `add-line-sheet.tsx`'s own
`INPUT_CLASS`.

**P3 — Meta-label styling diverges from the house sheet's `.t-head` and from the file's own convention (confidence: medium).**
The "Image file" / "Caption" field labels render as `"block text-[11px] uppercase tracking-[0.05em]
text-[var(--text-muted)]"` — no `font-mono`. Every comparable uppercase micro-label elsewhere in
`ffe-section.tsx` (`:439`, `:447`, `:456`, `:651`, `:1341`, `:1359`) and in `schedule/add-line-sheet.tsx`
/ `schedule/add-to-project-sheet.tsx` carries `font-mono`, and the house sheet's own `.t-head` (11px,
DM Mono, 500 weight, `.08em` tracking, UPPER) is exactly this kind of running/field label. D6's labels
are body-family (inheriting the page's sans font) at `.05em` tracking rather than `.08em`. This is a
small, purely visual regression against the closest matching house-sheet class and against the file's
own sibling labels — the two new labels will read in a visibly different typeface weight/family than
every other field label around them in the same document. Not blocking on its own (no test pins this
string's styling, and the whole Wave-3 program has not yet wired `.t-*` into designer-portal — see
above), but worth fixing in the same pass since the reference is one file-read away.

**P3 — Orphaned storage object on Remove (confidence: high, severity judgment: informational/low).**
`clearConceptRender` clears exactly the four `project_rooms` columns; the object in the private
`room-renders` bucket is never deleted. The lane's own report flags this explicitly and correctly frames
it as a backend/ruling question, not something in scope to fix here (A2's `useRoomConceptRender` already
established the "upsert-over-the-same-path" precedent, and no ruling requires deletion on Remove).
Confirmed accurate reporting, not a hidden gap — flagging only so the integration lane or A2's owner
picks it up rather than losing it.

**P3 — Uncontrolled network call in `useEffect` during unrelated test suites (confidence: low-medium).**
`ConceptRenderUpload`'s top-level `useEffect` calls `createBrowserClient()` and issues a real
`.from('project_rooms').select()...maybeSingle()` on every mount, including inside the 30+ other
`FFESection`-mounting suites that do not mock `@patina/supabase` (only `concept-render-upload.test.tsx`
does). The call is wrapped in try/catch so a failure renders silently (verified: full suite is
545/545 green, no new flake introduced), but it is a real, uncontrolled async side effect landing in
suites this lane does not own or test — a latent source of open-handle/flake risk if `createBrowserClient()`'s
failure behavior ever changes from "rejects" to "throws synchronously" or "hangs". Not currently
observed to break anything; flagging as a fragility note rather than a confirmed defect.

## Non-findings worth recording (verified, no issue)

- Test coverage is behavior-focused, not markup-focused: mounts the real component, drives it through
  `fireEvent`/`screen`, asserts on rendered text/roles/mock-call payloads — not snapshot or class-name
  assertions. All 10 new tests re-run clean from the worktree.
- MIME/size gate is imported from A2's hook module, never retyped (`ROOM_RENDER_MAX_BYTES`,
  `ROOM_RENDER_MIME_TYPES`) — cannot drift from the 00580 bucket config.
- Consent line renders before any upload act exists (verified: the "Upload" `DocumentAction` only
  mounts once `file` is set, and the consent paragraph is unconditional inside the open form).
- No route added; no `href` used anywhere in the new component.
- Accessibility basics: labels are `htmlFor`-associated (`useId()`), alt text on the render image is
  non-empty (caption or a room-name fallback), errors use `role="alert"` matching the codebase's
  existing convention, the toggle act correctly uses `aria-expanded` (disclosure pattern) with a label
  that stays stable across open/closed (only changes with `record` presence) — an appropriate choice
  over `aria-pressed`, which is for toggle-button state, not visibility disclosure.
- Contrast: `--text-muted` (9.22:1), `--text-subtle` (7.73:1), `--color-terracotta-ink` (5.28–5.64:1 per
  the codebase's own documented figures) are all well above the 4.5:1 floor for the sizes used.
- No feature flag added (matches PP-8's "everyone gets it, no feature flag").

## Verdict

**needs-fix** — one P2 (44px touch targets on the two form inputs) remains. The P3s are minor/cosmetic
or already transparently reported by the lane; none block on their own, but the touch-target fix is a
two-line change and should not wait for a separate round.
