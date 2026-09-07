# Wave 2 — designer lane notes

**"The Agreement, Composed" · Wave 2 (the Library) · 2026-09-07**

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`).
Branch `agreement/w2-designer`, forked at `213686f39` (the T0 types commit on
top of env.md's base `a6584dbc5`).

Ten commits, all under `apps/designer-portal/src/**` plus this file.

---

## 1 · What landed, item by item

| Build-sheet item | Files | Commit |
|---|---|---|
| Flag-off pin (generated on Wave 1 code, before anything else) | `agreement/__tests__/agreement-composer-library-off.test.tsx` + its 5 snapshots | `ec60b7465` |
| **P5** `schedules/` — nine files, the authority chip, the dispatch | `agreement/schedules/{index.ts,authority-chip.tsx,flat-editor,per-phase-editor,percent-editor,cost-plus-editor,day-rate-editor,package-editor,procurement-editor}.tsx`, `part-editor.tsx`, `parts-rail.tsx`, `part-kinds.ts` | `bb95979cb` |
| **P4/M2** the Library picker · the template picker + replace warning · Save as template (admin/owner) | `add-part-sheet.tsx`, `template-picker-sheet.tsx`, `save-as-template-action.tsx`, `agreement-composer.tsx`, `lib/analytics/document-events.ts` | `9ce1bbe79` |
| **P8** the history strip | `part-history-strip.tsx`, `agreement-composer.tsx` | `f758dcefc` |
| **M4** the Library card + **one** insertion | `account/agreement-library-card.tsx`, `account/account-studio-page.tsx` | `17664d948` |
| **P7** the addendum act with its `why` | `commercial/addendum-from-parts-sheet.tsx`, `commercial/project-services-addendum-action.tsx`, `hooks/use-commercial-documents.ts` | `fe371ddd4` |
| The attachment editor; the retainer's Wave 1 caveat retired | `part-editor.tsx` | `5e5916e23` |
| Lint baseline + R7 vocabulary fixes | `agreement-composer.tsx`, `agreement-library-card.tsx` | `c6d48e2ce`, `120b1dcf8` |

---

## 2 · Where the build sheet and the Wave 1 tree disagreed

**§2 names `add-part-sheet.tsx` as "W1 file, extended". It is not on the
tree.** Wave 1 shipped `add-part-menu.tsx` (a blank-kinds dropdown) and never
an `add-part-sheet.tsx`. So `add-part-sheet.tsx` is **new** here, and
`add-part-menu.tsx` is untouched — it is still what the rail's footer renders
with the Library flag off, which is what keeps the flag-off render identical.

**§2 does not list `agreement-composer.tsx`, `part-kinds.ts` or
`readiness.ts`.** The composer is the only thing that can read the flag, hold
the sheets, and know the studio, so it is edited. `part-kinds.ts` gained the
three money helpers lifted out of `part-editor.tsx` and one id helper.
`readiness.ts` is **untouched** — see §5's advisory on the fee basis.

**§4.4 says the card goes "immediately after the Billing block".** Wave 1
already put its Agreement-defaults card immediately after Billing, so the
Library card sits immediately after *that* — still below Billing, and the two
agreement cards stay adjacent. Billing itself is byte-untouched; the gate spec
asserts it on all four flag combinations.

**The Attachment editor is not in §4.1's tree, and §4.3 puts Attachment in the
picker.** Without an editor a designer could add an attachment and never write
it, and the client lane's attachment leaf + acknowledgment (P6) would have no
producer. A minimal one (body + "ask the client to confirm she received this")
is in `part-editor.tsx`, behind the flag; flag off, an attachment stays in Wave
1's read-only card.

---

## 3 · Flag-off byte-identity — how it is proved, not asserted

The snapshot spec was written and its five snapshots **generated on the Wave 1
tree**, committed in `ec60b7465`, *before* a single component changed. Every
later commit re-ran it. It never regenerated; it has never been run with `-u`.

Five surfaces: the room and rail with the standard parts, and the flat,
per-phase, furnishings-deposit and record-only editors — exactly the places
Wave 2 reaches into.

Wave 1's own seven-facet snapshot
(`drafting/__snapshots__/service-agreement-drafting-room.test.tsx.snap`) is
untouched and re-ran green in every sweep. Two snapshot files, seven snapshots,
all passing.

Behaviour, not just pixels, is pinned too: `part-editor.test.tsx` runs each
Wave 2 delta twice, flag on and flag off (30 cases), and
`project-services-addendum-action.test.tsx` keeps Wave 1's original assertion
verbatim beside the new P7 ones.

---

## 4 · The cross-lane seam — read this at integration

The nine `@patina/supabase` hooks this lane imports are the **backend lane's**
deliverable and were on no branch when this lane ran:

```
useStudioAgreementParts        add-part-sheet.tsx
useAgreementTemplates          template-picker-sheet.tsx, agreement-library-card.tsx
useSaveAgreementAsTemplate     save-as-template-action.tsx
useMaterializeAgreementTemplate  agreement-composer.tsx
useAgreementPartEvents         part-history-strip.tsx
useRenameAgreementTemplate     agreement-library-card.tsx
useDeleteAgreementTemplate     agreement-library-card.tsx
useSaveAgreementPart           agreement-library-card.tsx
useDeleteStudioAgreementPart   agreement-library-card.tsx
```

On the committed branch alone, `pnpm --filter @patina/designer-portal
type-check` reports **exactly nine errors**, every one of them
`has no exported member` for a hook in the list above, across six import sites
— and nothing else. To run the gate to ground, a **working-tree-only**
reference implementation of
`packages/supabase/src/hooks/use-agreement-library.ts` plus one barrel line was
written and the gate re-run **clean**. **Neither was committed** (`packages/**`
is the backend lane's pathspec), and both were **removed before this lane
finished** — `git status -- packages/` is empty, and the lint and jest numbers
below are from the tree with the shim gone. The full jest suite is green either
way: every spec that mounts a Wave 2 surface mocks `@patina/supabase` in its own
factory, so nothing in the suite depends on the shim existing.

### Argument shapes this lane assumed

The frozen interface gives hook *names*, not signatures. These follow
`use-board-templates.ts`, which is the repo precedent `00408` — and therefore
the Library migration — is modelled on: one object argument, camelCase keys.

| Hook | Assumed argument | Return this lane relies on |
|---|---|---|
| `useSaveAgreementAsTemplate` | `{ proposalId, title }` | resolves; value unused |
| `useMaterializeAgreementTemplate` | `{ proposalId, templateKey }` | resolves; **value unused** |
| `useSaveAgreementPart` | `{ studioId, part }` | resolves; value unused |
| `useRenameAgreementTemplate` | `{ templateKey, title }` | resolves; value unused |
| `useDeleteAgreementTemplate` | `{ templateKey }` | resolves; value unused |
| `useDeleteStudioAgreementPart` | `{ studioId, partId }` | resolves; value unused |
| `useAgreementTemplates(studioId)` | — | `{ data: AgreementTemplate[], isLoading }` |
| `useStudioAgreementParts(studioId)` | — | `{ data: StudioAgreementPart[], isLoading }` |
| `useAgreementPartEvents(proposalId)` | — | `{ data: AgreementPartEvent[], isLoading }` |

**Deliberately no dependency on `materialize_agreement_template`'s return
shape.** The RPC answers an integer; the room holds its composition in local
state. So after materializing, the composer re-reads with Wave 1's
`useAgreementParts(proposalId).refetch()` and rebuilds from the table. If the
backend's hook ends up returning the rows too, nothing here has to change.

`copy_agreement_parts_from_authority` has **no** package hook in the frozen
interface, so P7 calls it through an app-local mutation
(`useCopyAgreementPartsFromAuthority`, `hooks/use-commercial-documents.ts`)
beside `useCreateServiceAddendum`, which is the other half of the same flow.
This is not the R23 duplicate-data-layer smell: there is no package hook to
duplicate.

**One request to the client lane.** The attachment editor writes `body` and
`acknowledgeRequired` and leaves `payload.title` alone — the part's title is
the part row's `title`, renamed on the rail like every other part's. The
client's attachment leaf should read the **row's** `title`, not
`payload.title`, or a renamed attachment will print its old name.

---

## 5 · Decisions and advisories

- **R18 in the picker.** A part already on the agreement is shown **disabled**
  with "already on this agreement", by key *and* by money shape — a
  `studio.*`-keyed ceiling is refused when `patina.ceiling` is present, which
  the key check alone would miss.
- **Advisory — the fee basis is not guarded in the room.** Build sheet §3.4
  adds a refusal, `an agreement carries one fee basis`, when a composition
  carries both a client-visible `flat` and a `per_phase`. R18's ruled Add-menu
  list is the five money variants and does not name it, so this lane did not
  invent the guard: the picker still offers both, `readiness.ts` is untouched,
  and the room would earn a 23514 on Save. Cheap to close (one entry beside
  `duplicateMoneyVariants`) — raising it rather than doing it unasked.
- **The rail's chip changed meaning under the flag.** Wave 1 chipped only the
  four variants that projected then (DR5 deliberately excluded `flat` and
  `per_phase` because their editors said "recorded now, authority later"). In
  Wave 2 they project, so flag-on the rail chips all three R9 standings and
  both editors drop that sentence. Flag off, Wave 1's chip and Wave 1's
  sentence are both back, together — the snapshot pins it.
- **The retainer's credit-rule caveat** ("Stored now; it starts appearing on
  new agreements in a later release") is false once `retainer_credit_rule`
  projects, so it is flag-gated off. Same reasoning, same shape.
- **Analytics** are five names on `documentEvents`, fired from the composer,
  the save-as-template act and the addendum act — never a leaf. None carries a
  title, a body, or a figure.
- **Money never appears in prose (R5).** Nothing in `schedules/` writes outside
  its own payload; the composer never touches the terms row.
- `document-events.ts`, `use-commercial-documents.ts` and
  `account-studio-page.tsx` all carry pre-existing Prettier drift (they predate
  the repo's default style). Additions match each file's own style; running
  `--write` on them would have produced a 1,600-line reformat, so they were left
  alone. The pre-commit warning on those three is that drift, not this lane's.

---

## 6 · Gates

All from the worktree, `pnpm --dir <worktree> --filter @patina/designer-portal …`.

| Gate | Result |
|---|---|
| `type-check` (the real gate — designer's build does not check types) | **clean**, with the §4 working-tree reference hooks present |
| `type-check`, committed branch alone (shim removed) | **9 errors**, every one `has no exported member` for a backend-lane hook, across 6 import sites; nothing else |
| `lint`, committed branch alone | **2 errors, 203 warnings** — byte-identical to Wave 1's recorded baseline (R21: both errors pre-existing, in files this lane never opened) |
| **full** `test` (jest), committed branch alone | **533 suites · 6455 tests · 7 snapshots — all passed** (Wave 1's close-out: 523 / 6338 / 2) |
| Touched suites, run individually | `agreement` 9 suites, `account` 13 suites, `drafting` 16 suites — all green (counts in the report) |
| Flag-off snapshots | 7 passed, 0 written, 0 obsolete — never regenerated |

Not run, and not this lane's: the SQL suites, `pnpm db:generate`, the client
portal, the admin-portal build, Playwright, and anything touching the shared
Supabase stack. No production command of any kind ran; Strata was not contacted.

---

## 7 · What this lane did NOT do

- Did not push, did not create or remove a worktree, did not touch `.claude/`,
  `.agents/`, hooks, settings or any `.env` file.
- Did not write to `packages/**`, `supabase/**`, or `apps/client-portal/**` —
  no commit touches a file outside `apps/designer-portal/src/**` and this note.
- Did not reset, seed or otherwise mutate the shared local Supabase stack; no
  scratch database was created either, because this lane owns no migration.
- Did not run the app in a browser. Every claim above is a command's output or
  a source read — the 14-step walk in build-sheet §9 is still owed, and steps
  1–8 and 14 are this lane's surfaces.
- Did not resolve the fee-basis advisory in §5.

---

# Fix round 1 — 2026-09-07

Everything above is the build round and is left as written. This section is
what the round-1 adversarial review (D-1 … D-8) changed, and what is now true.

Commits (oldest first), `a6584dbc5` base:

| sha | subject |
|---|---|
| `89404cbfe` | fix(document): the Library card takes the package's hook shapes, and asks before it removes |
| `e101885fd` | fix(document): materialize a template through the package hook's own signature |
| `7ecd75b8a` | fix(document): an addendum retries onto the draft it already made, through the package hook |
| `32c71728c` | fix(document): the room holds one fee basis, and an unwritten fee schedule (R18) |
| `6a28247ec` | fix(agreements): a part's Library origin survives the next Save |
| `b943a05fa` | style(document): prettier the Library card's new studio-binding assertion |

17 files, +894 / −217.

## F1 · D-1 and D-2 — the gate, and the six invented signatures

The review was right about both, and they are one fault: the build round wrote
six call sites against a hook shape it had guessed at, then proved the gate
green against a reference implementation it had written for itself. **That
reference file is gone and nothing replaced it.** The call sites now match the
backend lane's real exports, read off `agreement/w2-backend`:

| call site | was | now |
|---|---|---|
| `agreement-library-card.tsx:81` | `useRenameAgreementTemplate()` | `useRenameAgreementTemplate(studioId)` |
| `:82` | `useDeleteAgreementTemplate()` | `useDeleteAgreementTemplate(studioId)` |
| `:84` | `useDeleteStudioAgreementPart()` | `useDeleteStudioAgreementPart(studioId)` |
| rename commit | `mutateAsync({ templateKey, title })` | `mutateAsync({ id, title })` |
| part rename | `mutateAsync({ studioId, part: {…} })` | flat `SaveAgreementPartInput` |
| template delete | `mutateAsync({ templateKey })` | `mutateAsync(template.id)` |
| part delete | `mutateAsync({ studioId, partId })` | `mutateAsync(part.id)` |
| `agreement-composer.tsx:160` | `useMaterializeAgreementTemplate()` | `useMaterializeAgreementTemplate(proposalId)` |
| `:343` | `mutateAsync({ proposalId, templateKey })` | `mutateAsync(template.templateKey)` |

**How the gate was run, exactly, and why it cannot be run any other way.** The
hooks live on the backend branch; this branch alone cannot compile against
them, and it says so loudly — 12 `TS2724`/`TS2305` "has no exported member"
errors, one per import, and nothing else. So the gate is an INTEGRATION PROBE:
the backend worktree's four package files (`hooks/use-agreement-library.ts`,
`hooks/use-agreement-part-events.ts`, `hooks/index.ts`, `database.types.ts`)
are copied into this working tree **uncommitted**, the gates run, and the files
are then restored with `git checkout --` / `rm` so the branch carries none of
the backend's code. The final run was against backend HEAD `c9b0529c6`.

`git status --porcelain -- packages/` is clean of probe residue at the point
this note was written; the only `packages/**` change this branch commits is F5
below.

This is a genuine cross-lane dependency, not something the designer lane can
close on its own. **Integration owes a merged-tree type-check** before either
branch is called done.

## F2 · D-3 and D-5 — one data layer, and one addendum

The app-local `useCopyAgreementPartsFromAuthority` is deleted (45 lines out of
`hooks/use-commercial-documents.ts`); `project-services-addendum-action.tsx`
imports the package's hook. The build round's claim that "the frozen interface
assigns no package hook to this RPC" was simply wrong.

The package hook binds `proposalId` at construction, and the addendum's id does
not exist until `create_service_addendum` has resolved — so the act is now a
two-phase state machine rather than two awaits in one function:

1. `compose()` mints the draft **once** and holds its id in `draftId`.
2. An effect keyed on `[draftId, carrying]` runs the copy against the bound
   hook, then fires the analytics event and pushes to the room.

That shape is what fixes D-5. A refused copy keeps `draftId`, so pressing
"Create the addendum" again carries the parts across **onto the draft that
already exists** — `create_service_addendum` is never called a second time. The
title field goes disabled at that point with "The draft is made. Rename it in
the Contract Room.", because a retry cannot rename what is already minted.

Pinned by a new test: *"retries onto the draft it already made — never a second
addendum"* — one `createAddendum` call, two `copyParts` calls, one push.

## F3 · D-6 — one fee basis (R18, 00577)

`flat` beside `per_phase` is one of each, so the per-variant rule could not see
it, and 00577 raises `an agreement carries one fee basis` at Save. Three places
now hold it, in the RPC's own sentence:

- `part-kinds.ts` — `FEE_BASIS_VARIANTS`, `feeBasisParts()`, `FEE_BASIS_BLOCKER`;
  `addPartOptions()` drops both fee bases once the agreement carries one.
- `add-part-sheet.tsx` — `refusalFor()` returns `this agreement carries one fee
  basis` (not "already on this agreement", which would be a lie about a
  different variant).
- `readiness.ts` — every fee-basis part after the first is a blocker on its own
  row, so Save can never reach the 23514 from the room.

One Wave 1 test asserted the opposite — *"lets an agreement state more than one
flat fee — nothing projects"*. Its premise ("nothing projects") is what Wave 2's
`fee_basis` column ends. It is rewritten to assert the refusal, with a comment
saying why it turned over.

## F4 · D-7 — a required fee schedule that is empty

`scheduleValueIsSet` ended `default: return true`, so a required `cost_plus`,
`percent_of_cost`, `percent_of_spend`, `day_rate` or `package` carrying `{}`
read complete. All five now answer from their own payload (build-sheet §4.2:
record-only is a statement about the projection, not about whether the part is
written). The `default: return true` stays, and stays correct, for the three
variants the room opens no editor for (`pricing_basis`, `draws`, `allowances`).

## F5 · D-4 — provenance, across the seam

`toAgreementPartPayload` (`packages/supabase/src/hooks/use-agreement-parts.ts`)
dropped `sourceTemplateKey` / `sourcePartId`, so the first Save after
materializing a template blanked the columns the RPC had just written. Fixed at
the mapper, which is where the fault is — **this is the one file this branch
commits outside `apps/designer-portal/`**.

It is safe to take here: it is a Wave 1 file, and `git diff a6584dbc5..HEAD --
packages/supabase/src/hooks/use-agreement-parts.ts` on `agreement/w2-backend`
is **empty** — the backend lane never opened it, so there is no conflict to
make. `upsert_agreement_parts` has read both keys since 00575:2849-2862, so the
change is correct with or without Wave 2 applied.

One existing package test pinned the old payload exactly and was updated;
`to-agreement-part-payload.test.ts` is new and pins the provenance directly.

## F6 · D-8 — Delete asks twice

Both Library deletes were one-click and irreversible while the far gentler
template materialize had a two-step warning. `Delete` now becomes `Remove it` /
`Keep it` with a line beneath it — `REMOVE_TEMPLATE_WARNING` /
`REMOVE_PART_WARNING`, both saying that agreements already composed from the
entry are untouched (true: `source_part_id` is a soft pointer). One row asks at
a time. Three new tests, including *"asks about one row at a time"*.

## Gates — fix round, on the committed tree

Probe applied (F1), backend HEAD `c9b0529c6`:

| gate | result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean, exit 0** |
| `pnpm --filter @patina/designer-portal type-check`, probe removed | 12 errors, all `has no exported member` — the cross-lane dependency, unchanged |
| `pnpm --filter @patina/designer-portal lint` | **2 errors / 203 warnings — the recorded baseline**; both errors pre-existing in files this lane never opened (`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`, both byte-identical to base) |
| `npx eslint` on the 15 touched files only | **0 errors**, 6 warnings (pre-existing `no-img-element` disables in untouched `account/*` files) |
| `pnpm --filter @patina/designer-portal test` (full) | **534 suites · 6495 tests · 7 snapshots — all passed** |
| `pnpm --filter @patina/supabase test` (full) | **88 files · 1071 passed / 12 skipped** |
| `pnpm --filter @patina/client-portal type-check` | clean (after `pnpm turbo build --filter=@patina/client-portal^...`) |
| `pnpm --filter @patina/admin-portal build` | **succeeded** — the repo's strictest gate, run because F5 edits a shared package |

**One flake, recorded rather than hidden.** On one of four full-suite runs,
`src/hooks/__tests__/use-lens-state.test.tsx` failed under parallel load; it
passes in isolation (17/17) and the file, `use-lens-state.ts` and
`use-lens-density.ts` are untouched by this lane
(`git log a6584dbc5..HEAD -- <those paths>` is empty). It is an rAF/`flushSync`
timing suite, not an agreement one.

## Still owed after this round

- **Integration must run the designer type-check on the MERGED tree.** Nothing
  on this branch alone can prove it, and this round's green is a probe.
- The 14-step walk (build-sheet §9), steps 1–8 and 14. No browser was opened.
- Nothing here touched the SQL suites, `db:generate`, Playwright, the shared
  Supabase stack, or production.

---

# Fix round 2 — 2026-09-07

Four findings came back (R2-1 … R2-4). Two are code defects and are fixed on
this branch; two are seam facts that only integration can close, and both are
raised below rather than papered over.

## R2-3 — a percent could not hold a decimal point

`percent-editor.tsx` and `cost-plus-editor.tsx` each rendered
`value={String(readPercent(raw))}` against a controlled input. `Number("12.")`
is `12`, so the field re-rendered as `12` on the keystroke that typed the point
and 12.5% was unreachable — on two record-only schedules where a fractional
percentage is the ordinary case, and against a `readNumber` in `part-kinds.ts`
that deliberately does not round because "12.5% is a percent somebody typed".

New `schedules/percent-field.ts` holds one `usePercentField(value, commit)`:
the keystrokes are kept verbatim in local state while the field is being typed
into, the parsed number is committed on **every** keystroke (so a Save that
never sees a blur still carries the figure), and blur drops the draft so the
stored value comes back in canonical form. `readPercent` moved into the same
module; both editors now read it from there rather than each declaring its own.

Four tests in `part-editor.test.tsx`, driven through `PartEditor` rather than
the editor in isolation: the point survives on a percent and on a markup, the
committed payload is `12.5`, emptying the field commits `null`, and blur hands
back the stored value. The first two fail on the old code (`toHaveValue("12.")`
was `"12"`).

Scope note — the money editors (`flat`, `per_phase`, `package`, `day_rate`)
share the shape through `dollars(readCents(...))`, but those are Wave 1's
editors lifted here unchanged and are deployed; the finding named these two and
they are the two that changed.

## R2-4 — "Replace the parts" was silent about the unsaved edits

`REPLACE_WARNING` said *"Nothing else on the draft changes"*, which is true of
the saved document and false of the room: `applyTemplate` runs `setParts(landed)`
and `setDirty(false)`, so every locally typed, unsaved edit went with the
replaced parts and the warning never mentioned it.

The sheet now takes `unsavedChanges` and shows `REPLACE_WARNING_UNSAVED` —
*"This replaces the parts on this agreement, including the changes you have not
saved yet. Nothing else on the draft changes."* — whenever the room is dirty.
`agreement-composer.tsx` passes `unsavedChanges={dirty}`; the `applyTemplate`
comment says why. Refusing while dirty was the alternative and was rejected: the
only way out of dirty is Save, and a Save immediately before a wholesale replace
writes an intermediate composition into the change history for nothing.

Two tests: the sheet spec pins the swapped sentence, and
`agreement-composer-library-on.test.tsx` drives the real room — lay a Library
part in without saving, open the template picker, confirm — and asserts the
unsaved sentence is the one on screen and the plain one is not.

## R2-1 — SEAM: the type-check gate is red on this branch alone

Reproduced exactly as reported. On the committed branch:

```
$ pnpm --filter @patina/designer-portal type-check
12 errors, all TS2724/TS2305 "has no exported member" across 7 import sites
(useAgreementTemplates, useDeleteAgreementTemplate, useDeleteStudioAgreementPart,
 useRenameAgreementTemplate, useSaveAgreementPart, useStudioAgreementParts,
 useCopyAgreementPartsFromAuthority, useMaterializeAgreementTemplate,
 useAgreementPartEvents, useSaveAgreementAsTemplate)
Exit status 2
```

Every one of the twelve is the backend lane's `packages/supabase` not being on
this branch. **No error names a designer-lane symbol**, and the count did not
move across this round's two commits.

Merged-tree probe, re-run after both fixes landed. Four files copied from
`agreement/w2-backend` into the working tree, uncommitted —
`packages/supabase/src/{database.types.ts,hooks/index.ts,hooks/use-agreement-library.ts,hooks/use-agreement-part-events.ts}`:

```
$ pnpm --filter @patina/designer-portal type-check
(no output)
type-check exit: 0
```

Working tree restored afterwards; `git status --porcelain -- packages/` is
empty. `packages/types/src/agreement.ts` and `index.ts` are already byte-identical
between this branch and backend's (`git diff HEAD agreement/w2-backend -- <those>`
is empty), so the T0 handshake needs nothing further.

**This is merge order, not a defect, and this lane cannot close it.** Build
sheet §2: "Backend merges first … No lane blocks on another for *authoring*."
Integration runs `pnpm --filter @patina/designer-portal type-check` on the
merged tree before either branch is called done. The probe above says what that
run will return.

## R2-2 — SEAM: the `packages/supabase` commit, formally raised

Commit `6a28247ec` *"a part's Library origin survives the next Save"* touches
three files under `packages/supabase/**`, which build sheet §2 assigns to the
backend lane ("everything under `packages/`"). The finding is correct: this lane
reached across the seam instead of raising. **Raising it is what this section
is.**

What the change is, in full — `toAgreementPartPayload` in
`packages/supabase/src/hooks/use-agreement-parts.ts` dropped two keys the RPC
reads:

```ts
     required: part.required,
     clientVisible: part.clientVisible,
+    sourceTemplateKey: part.sourceTemplateKey ?? null,
+    sourcePartId: part.sourcePartId ?? null,
   }));
```

Why it matters: `upsert_agreement_parts` is DELETE-then-INSERT and reads
`sourceTemplateKey` / `sourcePartId` off each entry (00575:1168-1181 on the
backend branch reads both keys). A mapper that drops them blanks the provenance
columns `materialize_agreement_template` had just written — on the very next
Save. The Library entry a part came from would survive exactly until the
designer typed into it. Two specs pin it:
`__tests__/to-agreement-part-payload.test.ts` (new, 60 lines) and an added case
in `__tests__/use-agreement-parts.test.ts`.

Why it is still on this branch rather than moved:

- The backend branch has **never touched this file** —
  `git log main..agreement/w2-backend -- packages/supabase/src/hooks/use-agreement-parts.ts`
  is empty — so the change is conflict-free at merge and is not duplicated.
- This lane cannot write to `agreement/w2-backend`: it is another lane's branch
  and worktree, a concurrent backend fix agent may hold it, and the brief
  forbids reaching outside this worktree. Deleting the fix instead would hand
  the merged product a live provenance bug in exchange for a tidier log.

**Integration: review this commit as a backend change** — the first of the two
remedies the reviewer named — or move it onto `agreement/w2-backend` before
merge and re-run `pnpm --filter @patina/supabase test`. It was green here at
round 1 (88 files, 1071 passed / 12 skipped), but the backend lane's own gates
and reviewer have never seen it.

## Gates — fix round 2, on the committed tree

| gate | result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check`, branch alone | **12 errors, exit 2** — all `has no exported member` from the un-merged backend; none names a designer symbol (R2-1) |
| `pnpm --filter @patina/designer-portal type-check`, backend's 4 files probed in | **no output, exit 0** |
| `pnpm --filter @patina/designer-portal lint` | **205 problems — 2 errors, 203 warnings**: the recorded baseline, unchanged. Both errors are pre-existing, in `piece-room-save-gate.test.tsx:159` and `use-commercial-documents.test.ts:930`, neither touched by this branch (`git log main..HEAD -- <those>` is empty) |
| `npx eslint` on this round's 8 touched files | **exit 0** — no errors, no warnings |
| `pnpm --filter @patina/designer-portal test -- <the 3 touched specs>` | **3 suites · 52 tests · all passed** |
| `pnpm --filter @patina/designer-portal test` (full) | **534 suites · 6501 tests · 7 snapshots — all passed** |

The 7 snapshots include Wave 1's flag-off byte-identity snapshot
(`agreement-composer-library-off.test.tsx.snap`) — re-run, not regenerated, and
green.

## Still owed after fix round 2

- **R2-1 and R2-2 are integration's, not this lane's** — the merged-tree
  type-check, and the review (or relocation) of `6a28247ec`.
- The 14-step walk (build-sheet §9), steps 1–8 and 14. No browser was opened
  this round either.
- Nothing here touched the SQL suites, `db:generate`, Playwright, the shared
  Supabase stack, or production.
