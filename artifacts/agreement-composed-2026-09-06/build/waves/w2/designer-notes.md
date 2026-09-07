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
