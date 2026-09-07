# Wave 2 · designer lane · adversarial review, round 1

**Program:** "The Agreement, Composed" — Wave 2 (the Library) · 2026-09-07
**Branch:** `agreement/w2-designer` · **Worktree:**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`)
**Reviewer:** separate context; did not write this code.

**Verdict: BLOCK.** The lane's own mandated gate
(`pnpm --filter @patina/designer-portal type-check`) is red on the committed
branch, and an integration probe against the backend lane's *actual*
`@patina/supabase` hooks proves the portal will not compile after the merge:
six hook call sites were written against invented signatures. Two further
defects lose data silently (part provenance; an orphan addendum draft).

---

## 1 · Gates I ran myself

All from a bare `cd` into the worktree, then `pnpm --filter …`.

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` (committed branch) | **FAIL — 11 errors**, exit 1 |
| `pnpm --filter @patina/designer-portal type-check` (+ backend lane's real hooks copied in, working-tree probe) | **FAIL — 9 errors**, exit 2 |
| `pnpm --filter @patina/designer-portal lint` | 2 errors · 203 warnings, exit 1 — **both errors pre-existing** (`piece-room-save-gate.test.tsx:159`, `hooks/__tests__/use-commercial-documents.test.ts:930`), files this lane never opened; matches R21's recorded baseline |
| `pnpm --filter @patina/designer-portal test` (full) | **PASS — 533 suites · 6455 tests · 7 snapshots**, 61.7 s |
| Flag-off byte-identity, run **against `main`'s components** (I reverted the four touched component files to `main` in the working tree and re-ran the new spec) | **PASS — 5/5 snapshots** |
| Snapshot regeneration audit (`git log main..HEAD -- …/__snapshots__/`) | flag-off snap touched **only** by `ec60b7465`; W1's `drafting/__snapshots__/` **untouched** |

Working tree restored to `HEAD` after both probes; `git status --porcelain --
packages/` and `-- apps/…/agreement/` are clean (the only `git status` noise is
sandbox "Operation not permitted" on `.env.example` reads).

### Committed-branch type-check (verbatim tail)

```
src/components/document/account/agreement-library-card.tsx(28,3): error TS2724: '"@patina/supabase"' has no exported member named 'useAgreementTemplates'.
src/components/document/account/agreement-library-card.tsx(29,3): error TS2724: … 'useDeleteAgreementTemplate'.
src/components/document/account/agreement-library-card.tsx(30,3): error TS2305: … no exported member 'useDeleteStudioAgreementPart'.
src/components/document/account/agreement-library-card.tsx(31,3): error TS2724: … 'useRenameAgreementTemplate'.
src/components/document/account/agreement-library-card.tsx(32,3): error TS2724: … 'useSaveAgreementPart'.
src/components/document/account/agreement-library-card.tsx(33,3): error TS2724: … 'useStudioAgreementParts'.
src/components/document/rooms/drafting/agreement/add-part-sheet.tsx(25,10): error TS2724: … 'useStudioAgreementParts'.
src/components/document/rooms/drafting/agreement/agreement-composer.tsx(26,3): error TS2724: … 'useMaterializeAgreementTemplate'.
src/components/document/rooms/drafting/agreement/part-history-strip.tsx(17,10): error TS2724: … 'useAgreementPartEvents'.
src/components/document/rooms/drafting/agreement/save-as-template-action.tsx(19,10): error TS2724: … 'useSaveAgreementAsTemplate'.
src/components/document/rooms/drafting/agreement/template-picker-sheet.tsx(19,10): error TS2724: … 'useAgreementTemplates'.
Exit status 1
```

(The lane notes say "exactly nine errors". It is eleven lines across six
import sites.)

### Integration probe (the finding that matters)

I copied `packages/supabase/src/hooks/{use-agreement-library.ts,
use-agreement-part-events.ts,index.ts}` from
`.codex/worktrees/agent-agr-w2-backend` into this worktree's working tree and
re-ran the gate:

```
agreement-library-card.tsx(81,26): error TS2554: Expected 1 arguments, but got 0.
agreement-library-card.tsx(82,26): error TS2554: Expected 1 arguments, but got 0.
agreement-library-card.tsx(84,22): error TS2554: Expected 1 arguments, but got 0.
agreement-library-card.tsx(135,9): error TS2353: 'templateKey' does not exist in type '{ id: string; title: string; }'.
agreement-library-card.tsx(153,9): error TS2353: 'part' does not exist in type 'SaveAgreementPartInput'.
agreement-library-card.tsx(238,44): error TS2345: '{ templateKey: string; }' is not assignable to 'string'.
agreement-library-card.tsx(333,46): error TS2345: '{ studioId: string; partId: string; }' is not assignable to 'string'.
agreement-composer.tsx(160,31): error TS2554: Expected 1 arguments, but got 0.
agreement-composer.tsx(343,45): error TS2345: '{ proposalId: string; templateKey: string; }' is not assignable to 'string'.
Exit status 2
```

Files restored, `packages/` clean.

---

## 2 · Findings

Severity · confidence. Nothing filtered.

### D-1 · blocker · 1.00 — the lane's mandated gate is red

`pnpm --filter @patina/designer-portal type-check` fails on the committed
branch with 11 errors. The lane's notes report "clean" — that number was
obtained with an **uncommitted, self-authored reference implementation** of
`packages/supabase/src/hooks/use-agreement-library.ts` which was then deleted.
A gate passed against a shim the lane wrote to satisfy itself is not the gate.

### D-2 · blocker · 1.00 — six hook call sites do not match the backend lane's hooks

Proved above. Concretely (designer call → backend signature):

| Call site | Designer wrote | Backend ships |
|---|---|---|
| `agreement-composer.tsx:160,343` | `useMaterializeAgreementTemplate()` · `.mutateAsync({proposalId, templateKey})` | `useMaterializeAgreementTemplate(proposalId)` · `.mutateAsync(templateKey: string)` |
| `agreement-library-card.tsx:81,135` | `useRenameAgreementTemplate()` · `.mutateAsync({templateKey, title})` | `useRenameAgreementTemplate(studioId)` · `.mutateAsync({id, title})` |
| `agreement-library-card.tsx:82,238` | `useDeleteAgreementTemplate()` · `.mutateAsync({templateKey})` | `useDeleteAgreementTemplate(studioId)` · `.mutateAsync(id: string)` |
| `agreement-library-card.tsx:84,333` | `useDeleteStudioAgreementPart()` · `.mutateAsync({studioId, partId})` | `useDeleteStudioAgreementPart(studioId)` · `.mutateAsync(id: string)` |
| `agreement-library-card.tsx:153` | `savePart.mutateAsync({studioId, part:{…}})` | `SaveAgreementPartInput` is **flat**: `{studioId, partKey?, kind, variant?, title, payload, …}` |

`useSaveAgreementAsTemplate`, `useAgreementTemplates`, `useStudioAgreementParts`
and `useAgreementPartEvents` happen to line up. Build-sheet §2 froze hook
*names* only; both lanes then invented shapes. One side has to move — the fix is
cheap, but it is a hard build break at merge and must be ruled, not discovered.

### D-3 · major · 0.85 — R23 broken: an app-local duplicate of a package hook

`apps/designer-portal/src/hooks/use-commercial-documents.ts:899` adds
`useCopyAgreementPartsFromAuthority`, justified in the lane notes as "there is
no package hook to duplicate". The backend lane ships exactly that hook —
`packages/supabase/src/hooks/use-agreement-library.ts:335
useCopyAgreementPartsFromAuthority(proposalId)`. R23 ("one data layer — the
portal-local duplicates are deleted") is broken, and the two implementations
already disagree on cache invalidation (the package hook also invalidates
`commercialKeys.all` and `['proposal', proposalId]`).

### D-4 · major · 0.95 — part provenance is threaded, commented, and never written

`add-part-sheet.tsx` builds `AddPartChoice.sourcePartId`;
`agreement-composer.tsx:317` copies it onto the new `AgreementPart` under the
comment *"`sourcePartId` rides along so the saved row can be traced back to the
Library entry it came from."* It does not.
`packages/supabase/src/hooks/use-agreement-parts.ts:112 toAgreementPartPayload`
emits only `{kind, variant, partKey, title, payload, required, clientVisible}`
— `sourcePartId` and `sourceTemplateKey` are dropped.

Worse than dead plumbing: `upsert_agreement_parts` is DELETE-then-INSERT and
*does* read `sourcePartId`/`sourceTemplateKey` from the jsonb
(`00575_agreement_parts.sql:2849-2862`,
`00577_agreement_fee_schedules.sql:939-952`), so **every Save from the room
nulls `source_part_id` and `source_template_key` on every part**, including the
provenance `materialize_agreement_template` just wrote
(`00576_agreement_library.sql:680`). Contract §2 lists both columns as W2
objects. The fix lives in the backend lane's pathspec — which is precisely why
this had to be raised across the seam and was not.

### D-5 · major · 0.90 — a failed part-copy leaves an orphan addendum, and a retry mints another

`project-services-addendum-action.tsx:73-88` runs two mutations in sequence:
`createAddendum.mutateAsync(title)` then `copyParts.mutateAsync(…)`. If the
second throws, the first has already created a `service_addendum` draft on the
project. The sheet stays open showing the refusal; the only act available is
"Create the addendum" again, which calls `create_service_addendum` a second
time. The lane's own spec pins this behaviour without noticing it
(`project-services-addendum-action.test.tsx:228 "prints the database's refusal
… and stays put"` — it asserts `mockPush` was not called, not that no draft was
left behind). Needs either a compensating discard, or reuse of the draft on
retry, or a single server-side act.

### D-6 · major · 0.90 — the one-fee-basis refusal is reachable from the room (R18 broken)

Backend `00577_agreement_fee_schedules.sql:985-993` raises
`an agreement carries one fee basis` (ERRCODE `check_violation`) when a
composition carries more than one of `flat` / `per_phase`. The picker
(`add-part-sheet.tsx`, `SINGLE_INSTANCE_VARIANTS` in `part-kinds.ts:174`) does
not treat `flat`/`per_phase` as single-instance, so the designer can add
`Flat fee` beside `Fee by phase` — or two `Flat fee` parts, each under a fresh
`custom.<uuid>` key — and `readiness.ts` reports nothing. The refusal only
arrives as a save-note at Save. R18 says in terms: "readiness reports the
duplicate as a blocker so Save can never hit 23514 from the room." The lane
declared this as an advisory in its notes and shipped it; the fix is one entry
beside `duplicateMoneyVariants` plus two picker entries.

### D-7 · major · 0.70 — build-sheet §4.2's readiness clause is not implemented

§4.2 ends: *"a record-only part is never a blocker on money grounds; it blocks
only if it is `required` and its typed payload is empty."* `readiness.ts` is
untouched by this lane, and `part-kinds.ts:430 scheduleValueIsSet` ends
`default: return true` — so a `required` `cost_plus` / `percent_of_cost` /
`day_rate` / `package` part with a wholly empty payload is reported complete.
Reachable through a studio Library part carrying `requiredDefault = true`. The
first half of the clause holds only by accident (`FEE_VARIANTS` excludes them).

### D-8 · major · 0.70 — irreversible one-click Delete in the Account Library card

`agreement-library-card.tsx:238` (template) and `:333` (part) fire
`deleteTemplate` / `deletePart` straight from the button — no confirmation, no
undo, and the card's only feedback is an error line at the very bottom. The
same wave puts a two-step destructive confirmation on
`materialize_agreement_template`, which merely replaces a *draft's* parts.
Deleting a studio Template that other members compose from is the more
destructive of the two and asks nothing.

### D-9 · minor · 0.65 — the DEFAULTS strip of §4.4 is absent

Build sheet §4.4 gives the card three strips: TEMPLATES, PARTS, **DEFAULTS**
("W1's `studio_agreement_defaults` strip, read-only here if W1 already put it
on this page; otherwise omit. Do not build a second defaults editor."). W1 did
put it on the page, so the literal reading asks for a read-only echo; the card
ships two strips and no DEFAULTS. Defensible (the W1 card sits directly above),
documented in the lane notes, but it is a build-sheet item not delivered and
wants a ruling rather than a lane's judgement.

### D-10 · minor · 0.85 — Patina's standard parts come back from the picker empty

`add-part-sheet.tsx:130-145` builds every Patina row's payload with
`blankPayload(kind, variant)`. Contract §1 fixes the standard parts' default
bodies as "today's literals from `service-agreement-drafting-room.tsx`
(`DEFAULT_DELIVERABLES`, `DEFAULT_EXCLUSIONS`, default scope sentence)". A
designer who removes Exclusions and re-adds it "from your Library" gets an
empty list; the same for Deliverables, Services and Terms. `Role rates` comes
back with no roles even where `studio_agreement_defaults` holds a rate card.

### D-11 · minor · 0.80 — the percent fields cannot take a decimal

`percent-editor.tsx:52-60` and `cost-plus-editor.tsx:35-45` round-trip the field
through `readPercent` on every keystroke: typing `12.` yields `Number("12.") =
12`, the input re-renders as `"12"`, and the decimal point is eaten. `12.5%`
cannot be entered. Both are record-only variants where fractional markups are
ordinary.

### D-12 · minor · 0.70 — the picker hides Patina's shelf while the studio query loads

`add-part-sheet.tsx:186` gates the whole Parts column on `library.isLoading`,
including the nine `PATINA_STANDARD_AGREEMENT_PARTS` rows, which need no
network at all. On a slow studio read the designer sees only "Opening the
Library…".

### D-13 · minor · 0.65 — one error slot at the foot of the Library card

`agreement-library-card.tsx` keeps a single `note` state rendered after both
strips. A failed template delete prints below the Parts list; a stale note
survives until the next act clears it (`beginRename*` clear it, the delete
paths do not).

### D-14 · minor · 0.60 — an extra query in the `agreement-library`-off production state

`agreement-composer.tsx:158 useAgreementParts(proposalId)` is called
unconditionally, purely to serve `applyTemplate`'s post-materialize re-read.
With `agreement-parts` on and `agreement-library` off — the exact state W2
ships dark in — the room now issues a `proposal_agreement_parts` read that
Wave 1 did not. Markup is unchanged (proved by the snapshots); behaviour is not.

### D-15 · minor · 0.60 — the picker defers its write, against §4.3

§4.3: *"Clicking appends the part at the end of the rail (position = max+1)
**via `upsert_agreement_parts`**."* The implementation adds to the composer's
local array and waits for Save. Consistent with how the rest of the room
behaves and documented in the notes — but a deviation from the sheet, and it is
what lets D-6 reach Save.

### D-16 · minor · 0.55 — the replace warning does not mention unsaved work

`REPLACE_WARNING` = *"This replaces the parts on this agreement. Nothing else on
the draft changes."* `applyTemplate` then throws away whatever the designer had
in local state, saved or not, and `setDirty(false)`. The sentence is true of the
*document* and false of the *room*.

### D-17 · minor · 0.55 — W1's composer spec now stubs the flag module globally

`agreement-composer.test.tsx` gains
`jest.mock("@/hooks/use-feature-flag", () => ({ useFeatureFlag: () => ({ value:
false, isLoading: false }) }))`. Any other flag read anywhere in the composer's
render tree is now forced false inside W1's own regression suite.

### D-18 · minor · 0.50 — the flag-off pin does not cover the retainer or the attachment

Five snapshots: rail + standard parts, flat, per-phase, furnishings deposit,
record-only fall-through. The lane also edited the retainer editor's flag-off
path (`{!libraryOn && <p>…</p>}`, `part-editor.tsx:466-476`) and the attachment
fall-through; both are covered by behaviour assertions in `part-editor.test.tsx`
but not by the byte-identity pin. (I verified the five that exist do pass
against `main`'s components, so what is pinned is genuinely pinned.)

### N-1 · nit · 0.90 — `parts-rail.tsx` imports twice from `@/components/ui/controls`
`:37 import { Input } …` then `:39 import { Button } …`.

### N-2 · nit · 0.75 — `aria-pressed` leaks between the picker's two columns
Choosing Patina's `Ceiling` on the left also marks `ceiling` pressed in the
`Schedule ▾` list, because that list compares on `chosen?.variant` alone
(`add-part-sheet.tsx:279`).

### N-3 · nit · 0.85 — `DayRateEditor` reads a day count through `readCents`
`day-rate-editor.tsx:22 readCents(payload.minimumDays)`. Works; misleads.

### N-4 · nit · 0.70 — `PackageEditor` keys "includes" rows by array index
`package-editor.tsx:73 key={index}` — removing a middle row re-uses inputs.

### N-5 · nit · 0.65 — `agreementPartSaved` fires when nothing was saved
`agreement-composer.tsx:325` fires it on a purely local add; nothing reaches the
table until Save, and no `agreement_part_saved` follows the Save that does.

### N-6 · nit · 0.60 — the attachment editor is beyond §4.1's tree
Not in the build sheet's component tree; the lane added it because §4.3 puts
Attachment in the picker and P6 needs a producer. Documented, defensible,
recorded as scope for the orchestrator.

### N-7 · nit · 0.50 — the lane notes' error count is wrong
"exactly nine errors" vs. the gate's eleven lines / six import sites.

---

## 3 · What I checked and found clean

- **Flag-off byte-identity.** Independently proved: I reverted
  `agreement-composer.tsx`, `part-editor.tsx`, `parts-rail.tsx` and
  `part-kinds.ts` to `main` and the five committed snapshots still pass, 5/5.
  The snapshot file has exactly one commit (`ec60b7465`, before any component
  changed) and W1's `drafting/__snapshots__/` is untouched. The three W1
  editors that moved into `schedules/` (`flat`, `per_phase`, `procurement`)
  reproduce W1's markup exactly with `libraryOn = false`.
- **Account page (M4).** Exactly one JSX insertion plus the sanctioned flag
  read and the import — 14 lines, `+14 −0` on `account-studio-page.tsx`. The
  Billing block is byte-untouched. The gate spec covers all four flag
  combinations and asserts placement below Billing and below W1's defaults card.
- **Fail-closed gating.** `useFeatureFlag` returns `{value:false,
  isLoading:true}` until PostHog answers; the composer additionally requires
  `!libraryLoading`; every W2 surface is behind `agreementParts &&
  agreementLibrary`; sheets are additionally behind `!readOnly` (R6). Every
  hook sits above every conditional and there are no early returns in the
  composer.
- **R7 vocabulary.** Grepped every added line for `clause library`, `contract
  builder`, `snippet`, `block`, `section`, `variant`, `AI`, `dashboard`,
  `overdue`, `confetti` — every hit is an identifier, a Tailwind class, a
  comment or a snapshot class attribute; no designer-facing string offends.
  `VARIANT_LABELS` (`part-kinds.ts:46-62`) names all fifteen variants in the
  designer's words, so no database token reaches the page. No badges, no count
  chips beyond §4.4's own prescribed count line, no colour-as-status, no emoji.
- **R9.** `authorityStanding` reads `AUTHORITY_VARIANTS` from `@patina/types`
  and never re-declares it; `procurement` → `creates authority · deposit only`;
  everything else → `record only (R9)` with §4.2's single help sentence, no
  tooltip, no link. Matches the backend's projection (`fee_basis` written only
  from `flat`/`per_phase`/`hourly`, `00577:1160-1196`).
- **R5.** Nothing under `schedules/` writes outside its own payload; the
  composer never touches the terms row or the rates table.
- **R3.** `SaveAsTemplateAction` hides for a non-owner/admin *and* prints the
  RPC's `insufficient_privilege` sentence when the two disagree; the Library
  card hides its acts the same way. Hooks sit above the `if (!canManage) return
  null`.
- **P8.** Renders nothing with zero events; newest first; caps at five behind a
  disclosure; `materialized` is shown as "Added from a template"; the `why` is
  on its own line; studio-only (R8) — the strip never reaches client code.
- **Commit hygiene.** Ten commits plus the shared T0 types commit. Conventional
  Commits subjects, no trailers, no `merge(...)`, explicit pathspecs — no
  commit touches anything outside `apps/designer-portal/src/**` except the T0
  commit (`packages/types/src/agreement.ts`, byte-identical to the backend
  branch's own `68532c2a1`, verified with `cmp`) and the lane notes. Nothing
  under `.claude/`, `.agents/`, `supabase/`, or any `.env`. Not pushed.
- **Tests.** Every build-sheet designer spec exists and asserts behaviour, not
  shape: picker (12 cases incl. all fifteen variants and R18 by money shape),
  save-as-template (7), template picker (11), authority chip (7, incl. an
  exhaustiveness case over the vocabulary), part editor (30 across both flag
  states), history strip (11), library card, library gate, addendum action (11,
  with W1's original assertion kept verbatim).

## 4 · Not verified

- No browser walk. Build-sheet §9 steps 1–8 and 14 are this lane's surfaces and
  none was exercised against a running portal or a real database — every claim
  above is a command's output or a source read.
- No SQL, no `pnpm db:generate`, no client portal, no admin-portal build, no
  Playwright. The shared Supabase stack was not touched.
- The integration probe used the backend lane's *current* branch state; if that
  lane re-shapes its hooks before merge, D-2's table must be re-derived.
