# Lane D6 — Concept render upload UI (PP-7) — implementation report

- **Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d6`
- **Branch:** `portal-polish/d6` (cut from `origin/main` @ `1059f5275`), pushed
- **Commit:** `f6f660a880470390c8296bee35154ec54c83ddc3` —
  `feat(designer): concept render upload at the room heading (PP-7)`

## Diff stat

```
 .../__tests__/concept-render-upload.test.tsx       | 246 ++++++++++++++
 .../src/components/document/ffe-section.tsx        |   8 +
 .../document/rooms/concept-render-upload.tsx       | 355 +++++++++++++++++++++
 3 files changed, 609 insertions(+)
```

Three files, exactly the three the lane lists. `ffe-section.tsx` is `+8/-0`: one import
(`./rooms/concept-render-upload`) and one mount inside the `roomGroups.map` immediately after
`<RoomHeading …/>`, guarded by `!selecting` the same way the room's existing "Add a line" act is.
Mounting at the call site rather than inside `RoomHeading` keeps the diff to one import and one
mount — `RoomHeading` receives no `projectId` today, so mounting inside it would have meant a prop
change threaded through all three call sites.

## What it does

`components/document/rooms/concept-render-upload.tsx`:

- **Closed state.** A tertiary `DocumentAction` "Add a concept render" (`aria-expanded`), region
  `room-concept-render`. No route; everything unfolds in place.
- **Unfolded.** A labeled file field (`accept="image/jpeg,image/png,image/webp"`), a labeled caption
  field, and the consent line **"Labeled 'Concept · not installed' on the client's page"** rendered
  before any upload. The Upload act (secondary — a render is neither money nor a signed paper, so it
  is not `terminal`) appears once a file passes the gate; a tertiary Cancel folds the form.
- **The gate is the bucket's own.** `ROOM_RENDER_MAX_BYTES` and `ROOM_RENDER_MIME_TYPES` are imported
  from A2's module, never retyped, so the client-side limits cannot drift from 00580. Rejections name
  the reason: `That file is 9 MB. A concept render has to be 8 MB or under.` /
  `That file is not a JPEG, PNG or WebP. A concept render has to be one of those three.`
- **Existing render.** A 92×92 `object-cover` plate at `rounded-[3px]` with a 1px `--color-pearl`
  border (A10's Desk-thumbnail plate), signed from the private bucket for one hour, with the caption
  line `Concept render · {caption} · uploaded Sep 8` (what it is · whose words · when, A10) and
  **Replace** / **Remove** acts. The "Add a concept render" label is replaced by "Replace" — never
  both.
- **Errors are quiet and in place.** `role="alert"`, `--color-terracotta-ink`, 12px, no toast, no
  banner, no `--color-error`. A failed upload sets the reason and returns; the record on screen is
  untouched, the staged file stays staged. A failed removal says
  `The render did not come down. It is still on the client's page.` and the render stays.
- **Absence is silence.** A room whose render cannot be read renders no plate and no error — only the
  act.

## The hook's shape — reported, not fixed (lane may not edit `packages/supabase`)

`useRoomConceptRender` (`packages/supabase/src/hooks/use-room-concept-render.ts`) exposes the
**upload only**. Two things the lane's step 4 needs are absent:

1. **No read.** Nothing in `@patina/supabase` returns a room's `concept_render_url` /
   `_caption` / `_uploaded_at`, and the portal-local `useDocumentRooms`
   (`apps/designer-portal/src/hooks/use-document-rooms.ts:29`) selects only
   `id, project_id, name, budget_cents, sort_order`. There is also no signer for the private
   `room-renders` bucket.
2. **No remove.** Nothing clears the four columns.

Both are therefore done inside `concept-render-upload.tsx` with `createBrowserClient()`, the same
precedent `use-document-rooms.ts` sets. **A2's owner should decide** whether they belong in the
package as `useRoomConceptRenderRecord` / `useRemoveRoomConceptRender`; if they land there, this
component's two local helpers (`readConceptRender`, `clearConceptRender`) delete cleanly.

A second constraint shaped that choice: both are **plain awaited calls, not React Query reads**.
This component mounts under every room heading in `ffe-section.tsx`, and several existing suites
mount that section **with no `QueryClientProvider`** — `ffe-section-ceremony.test.tsx:141-142` says
so in as many words. A `useQuery` in the closed state would have thrown "No QueryClient set" in at
least five suites this lane may not edit. For the same reason `useRoomConceptRender()` (which calls
`useQueryClient()`) is called only inside `ConceptRenderForm`, which mounts only once the studio
opens the act — so no existing suite ever reaches it.

## Evidence

**Lane gate — new suite** (`pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/concept-render-upload.test.tsx`):

```
PASS src/components/document/__tests__/concept-render-upload.test.tsx
  the concept-render act at the room heading
    ✓ offers the act on a room with no render yet
    ✓ unfolds a file field, a caption field and the consent line before any upload
    ✓ refuses a file over 8 MB with a named reason and uploads nothing
    ✓ refuses a file that is not a JPEG, PNG or WebP with a named reason
    ✓ sends the project, the room, the file and the caption to the hook
    ✓ shows an existing render with its caption, its date, Replace and Remove
    ✓ clears the four columns on Remove and takes the render off the room
    ✓ leaves the existing render standing when the upload fails, and says so in place
    ✓ says a failed removal left the render where it was
    ✓ renders the room silently when the render cannot be read

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

**Type-check** (`pnpm --filter @patina/designer-portal type-check`):

```
> tsc --noEmit
```

Clean. (First run reported 73 `TS2307 Cannot find module '@patina/api-routes' / '@patina/types/media'`
errors — a fresh-worktree artifact: `turbo build --filter=@patina/designer-portal^...` does not build
`@patina/api-routes`. `pnpm turbo build --filter=@patina/api-routes --filter=@patina/types` fixed all
73. Worth adding to the wave's setup line for later lanes.)

**ESLint, lane scope** (`npx eslint apps/designer-portal/src/components/document`):

```
✖ 38 problems (1 error, 37 warnings)
```

The one error is the known `piece-room-save-gate.test.tsx:159 import/first`. Nothing from either new
file. (An interim run showed 2 errors and one warning of mine — an `import/first` disable comment in
the test and an unused `@next/next/no-img-element` disable in the component. Both removed before the
commit.)

**ESLint, whole portal** (`pnpm --filter @patina/designer-portal lint`):

```
  159:1  error  Definition for rule 'import/first' was not found  import/first
  930:8  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …
✖ 205 problems (2 errors, 203 warnings)
```

Exactly the two known baseline errors (`piece-room-save-gate.test.tsx:159`,
`use-commercial-documents.test.ts:930`). Count not grown.

**Gate tests** (`… test -- --ci src/lib/document/__tests__/{shadow-gate,contrast,document-action-hierarchy-contract}.test.ts`):

```
PASS src/lib/document/__tests__/shadow-gate.test.ts
PASS src/lib/document/__tests__/contrast.test.ts
Test Suites: 3 passed, 3 total
Tests:       74 passed, 74 total
```

`shadow-gate.test.ts` unedited and green; `--elevation-sheet` and `desk-settle` untouched; no
`box-shadow` and no `shadow-*` utility in either new file.

**Every suite that mounts `FFESection`** (33 suites — `schedule/__tests__`, `ffe-section-life`,
`ffe-section-spec-details-link`, all of `app/(document)/doc`, `work-block`, plus the new one):

```
Test Suites: 33 passed, 33 total
Tests:       448 passed, 448 total
```

**Full designer-portal suite** (`pnpm --filter @patina/designer-portal test -- --ci`):

```
Test Suites: 2 failed, 543 passed, 545 total
Tests:       3 failed, 1 todo, 6698 passed, 6702 total
```

Baseline was 544 suites / 6691 passed + 1 todo; this lane adds one suite of ten, so the arithmetic
lands at 545 / 6701 + 1 todo. **The failures are timeout flake on a loaded machine, not this lane.**
A second full run failed a *different* set — `worktable-speccing.test.tsx`,
`coordination/__tests__/item-composer-party.test.tsx`, `commercial/trade/trade-scope-detail.test.tsx`,
`portal/proposals/product-picker-modal.test.tsx`, all at 28–72 s per suite, all
`Exceeded timeout of 5000 ms`. Re-run in isolation:

```
PASS src/components/document/coordination/__tests__/item-composer-party.test.tsx (10.152 s)
PASS src/components/document/commercial/trade/trade-scope-detail.test.tsx (5.585 s)
PASS src/components/portal/proposals/product-picker-modal.test.tsx
Test Suites: 4 passed, 4 total
Tests:       60 passed, 60 total
```

None of the four renders `FFESection`. Wave 2 was running concurrently on the same machine.
**The integration lane should re-run the full suite on an unloaded machine** to confirm the clean
545 / 6701 + 1 todo.

## What I did not do

- **Did not touch `packages/supabase`** — no barrel edit, no hook edit, no `database.types.ts`. The
  two gaps above are reported for A2's owner, not patched.
- **Did not add a route, a toast, a badge, a pill, a spinner, a shadow, a new token or a new hex
  literal.** Every colour is an existing `globals.css` token; the only pigment printed as text is
  `--color-terracotta-ink` (the F56-compliant ink), never base `--color-clay` / `--color-terracotta`.
- **Did not fold A1's `test.todo` 'terminal' row** — that is D4's, and the Upload act is deliberately
  `secondary`: no money moves and no paper is signed.
- **Did not delete the storage object on Remove.** The lane says Remove clears the four fields, and
  it clears exactly those four. The object is left in the private bucket; a later upload of the same
  filename `upsert`s over it (the hook's own behaviour). **Flagging it:** if orphaned objects should
  be swept, that is a ruling and a backend change, not this lane.
- **Did not start a dev server, reset the database, touch `main`, or run anything against Strata.**
- **No renders captured** — the Desk/Document is signed-in and renders belong to the Wave 3
  integration lane.
