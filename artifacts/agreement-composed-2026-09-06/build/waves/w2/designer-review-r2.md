# Wave 2 — designer lane, adversarial review **round 2**

**"The Agreement, Composed" · Wave 2 (the Library) · 2026-09-07**
Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`
(`git rev-parse --show-toplevel` pasted below), branch `agreement/w2-designer`.

```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer
```

19 commits on `main..HEAD`, 44 files, **+8,416 / −237**.

---

## 1 · Gates, run by me, output pasted

Base note: `main` has moved to `8bc8bcc4d` since the lane's base `a6584dbc5`, and
the only commit between them is `docs(agreements): program build docs`. No
`apps/` or `packages/` file moved on main:
`git diff --stat a6584dbc5..main -- apps/designer-portal packages/` is **empty**.

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` — **branch alone** | **RED · 12 errors · exit 2** |
| `pnpm --filter @patina/designer-portal type-check` — **integration probe** | **clean, exit 0** |
| `pnpm --filter @patina/designer-portal lint` | 2 errors / 203 warnings — the recorded baseline |
| `pnpm --filter @patina/designer-portal test` (full) | **534 suites · 6495 tests · 7 snapshots — all passed · 28.4 s** |
| `pnpm --filter @patina/supabase test` | **88 files · 1071 passed / 12 skipped** |

### The branch-alone type-check (verbatim tail)

```
src/components/document/account/agreement-library-card.tsx(28,3): error TS2724: '"@patina/supabase"' has no exported member named 'useAgreementTemplates'.
…(29,3) useDeleteAgreementTemplate · (30,3) useDeleteStudioAgreementPart · (31,3) useRenameAgreementTemplate
…(32,3) useSaveAgreementPart · (33,3) useStudioAgreementParts
src/components/document/commercial/project-services-addendum-action.tsx(5,10): TS2305 useCopyAgreementPartsFromAuthority
src/components/document/rooms/drafting/agreement/add-part-sheet.tsx(25,10): TS2724 useStudioAgreementParts
src/components/document/rooms/drafting/agreement/agreement-composer.tsx(26,3): TS2724 useMaterializeAgreementTemplate
src/components/document/rooms/drafting/agreement/part-history-strip.tsx(17,10): TS2724 useAgreementPartEvents
src/components/document/rooms/drafting/agreement/save-as-template-action.tsx(19,10): TS2724 useSaveAgreementAsTemplate
src/components/document/rooms/drafting/agreement/template-picker-sheet.tsx(19,10): TS2724 useAgreementTemplates
Exit status 2
```

Twelve errors, seven import sites, **every one** a missing backend-lane hook.
Nothing else.

### The integration probe (mine, independent of the lane's)

Copied, uncommitted, from `agent-agr-w2-backend` @ `c9b0529c6`:
`packages/supabase/src/{database.types.ts,hooks/index.ts,hooks/use-agreement-library.ts,hooks/use-agreement-part-events.ts}`.

```
> tsc --noEmit
(no output)
```

Then restored; `git status --porcelain -- packages/` → empty. **Round 1's D-1 and
D-2 are substantively fixed**: the six call sites now match the backend's real
signatures — `useRenameAgreementTemplate(studioId).mutateAsync({id,title})`,
`useDeleteAgreementTemplate(studioId).mutateAsync(id)`,
`useDeleteStudioAgreementPart(studioId).mutateAsync(id)`, flat
`SaveAgreementPartInput`, `useMaterializeAgreementTemplate(proposalId).mutateAsync(templateKey)`.

### Lint

Both errors are the ruled pre-existing baseline, in files this lane never opened:
`components/document/rooms/piece/piece-room-save-gate.test.tsx:159` (`import/first`
rule not found) and `hooks/__tests__/use-commercial-documents.test.ts:930`
(`react-hooks/rules-of-hooks`).

### Flag-off byte-identity — verified independently

- `ec60b7465` (`test(document): pin the composed room's flag-off render…`) added
  **only** the spec and the `.snap` — `git show --stat` shows exactly two files.
- Its parent is `213686f39`, the T0 types commit, whose own parent is the lane
  base. So the snapshots were generated against Wave 1's components.
- `git log ec60b7465..HEAD -- …/agreement-composer-library-off.test.tsx.snap`
  is **empty** — never regenerated, never `-u`'d.
- The suite passes today: `Snapshots: 7 passed`.

Chain holds for the five pinned surfaces. It does **not** cover the retainer
editor or the attachment fall-through (finding R2-12).

---

## 2 · Prior-round findings — verification

| R1 id | Status | Evidence |
|---|---|---|
| D-1 gate red | **Substantively fixed / structurally open** | branch alone 12 errors; merged tree clean (§1). Now R2-1. |
| D-2 invented signatures | **FIXED** | integration probe exit 0. |
| D-3 R23 duplicate hook | **FIXED** | `git diff main...HEAD -- …/use-commercial-documents.ts` is empty; the action imports `useCopyAgreementPartsFromAuthority` from `@patina/supabase`. |
| D-4 provenance dropped | **FIXED, in the wrong pathspec** | mapper emits `sourceTemplateKey`/`sourcePartId`; 00577:1180-1181 reads both. But the fix is committed under `packages/supabase/**` — R2-2. |
| D-5 orphan addendum | **FIXED, with a new tail** | two-phase state machine; test *"retries onto the draft it already made"*. New defect R2-9. |
| D-6 fee basis | **FIXED** | `FEE_BASIS_VARIANTS`/`feeBasisParts`/`FEE_BASIS_BLOCKER`; `readiness.ts:140-146`; `refusalFor` returns the RPC's sentence. Matches 00577:1216-1220 exactly (which, like the room, counts **all** flat/per_phase parts, not only client-visible ones — the build sheet's "client-visible" wording is what both sides deviate from, consistently). |
| D-7 empty required record-only | **FIXED** | `scheduleValueIsSet` cases for `percent_of_cost`, `percent_of_spend`, `cost_plus`, `day_rate`, `package`; `default: return true` kept for the three W3 variants. |
| D-8 one-click Delete | **FIXED** | `Remove it` / `Keep it` + `REMOVE_TEMPLATE_WARNING` / `REMOVE_PART_WARNING`, one row at a time. |
| D-9 DEFAULTS strip | **NOT FIXED** | still two strips. R2-8. |
| D-10 empty Patina payloads | **NOT FIXED** | `add-part-sheet.tsx:155` still `blankPayload(...)`. R2-4. |
| D-11 percent decimal | **NOT FIXED** | `percent-editor.tsx:48/55`, `cost-plus-editor.tsx:37/44`. R2-3. |
| D-12 Patina rows behind loading | **NOT FIXED** | `add-part-sheet.tsx:211`. R2-5. |
| D-13 shared error slot | **PARTLY** | `askToRemove` now clears `note` too; the slot is still one, still at the card's foot (`:420`). R2-6. |
| D-14 extra query flag-off | **NOT FIXED** | `agreement-composer.tsx:158` unconditional; `useAgreementParts` is `enabled: !!proposalId`. `main`'s composer has no such call. R2-7. |
| D-15 picker defers to Save | **NOT FIXED** (documented) | R2-13, ruling owed. |
| D-16 replace warning | **NOT FIXED** | R2-3's sibling; `REPLACE_WARNING` vs `setParts(landed); setDirty(false)`. R2-2 in the majors. |
| D-17 module-wide flag mock | **NOT FIXED, and extended** | the new `-library-on` suite mocks `useFeatureFlag: () => ({value:true})` module-wide. R2-14. |
| D-18 snapshot coverage | **NOT FIXED** | five snapshots; no retainer, no attachment. R2-12. |
| N-1…N-5 | **NOT FIXED** | verified line by line, §3. |
| N-6 attachment editor scope | documented, accepted | |
| N-7 notes miscount | **FIXED** | fix-round §F1 says 12; I measured 12. |

---

## 3 · Findings, round 2

Severity per the brief's rubric; the orchestrator filters.

### R2-1 · major · confidence 1.0 — the lane's mandated gate is red on the committed branch

`pnpm --filter @patina/designer-portal type-check` exits 2 with 12 errors. The
merged tree is green (I proved it), and the build sheet sequences "Backend merges
first … No lane blocks on another for *authoring*", so this is merge-order, not a
defect. **Integration owes the merged-tree type-check before either branch is
called done.** If the orchestrator reads §7's gate literally, this is a blocker.

### R2-2 · major · confidence 1.0 — the lane wrote into the backend lane's pathspec

`6a28247ec fix(agreements): a part's Library origin survives the next Save` commits

```
packages/supabase/src/hooks/use-agreement-parts.ts
packages/supabase/src/hooks/__tests__/use-agreement-parts.test.ts
packages/supabase/src/hooks/__tests__/to-agreement-part-payload.test.ts   (new)
```

Build sheet §2: **backend** owns "everything under `packages/`"; "A lane that
needs a change in another lane's pathspec **raises it; it does not reach
across.**" Round 1's D-4 said the same in words ("backend pathspec — raise across
the seam"). The change itself is correct and conflict-free
(`git log main..HEAD -- …/use-agreement-parts.ts` on `agreement/w2-backend` is
empty), and `pnpm --filter @patina/supabase test` is green here — but the backend
lane's gates and the backend reviewer never saw it. Integration must review it as
a backend change or move it.

### R2-3 · major · confidence 0.9 — the percent fields still cannot take a decimal

`percent-editor.tsx:48` `value={percent === null ? "" : String(percent)}` with
`:55` `readPercent(event.target.value)`; identical shape at
`cost-plus-editor.tsx:37/44`. Typing `12.` → `Number("12.") === 12` → the
controlled input re-renders as `"12"` → `12.5%` is unreachable. Both are
record-only variants where a fractional markup is ordinary; `part-kinds.ts:458`
even ships a `readNumber` that deliberately does not round, so the intent was
decimals. Fix: hold the raw string locally and parse on blur, as the deposit
"Other" field's cousin does.

### R2-4 · major · confidence 0.75 — "Replace the parts" silently discards unsaved work

`template-picker-sheet.tsx:27` — *"This replaces the parts on this agreement.
**Nothing else on the draft changes.**"* `agreement-composer.tsx:318-322` then
runs `setParts(landed); setSelectedId(…); setDirty(false)`, throwing away every
edit the designer had typed and not saved. The warning is true of the document and
false of the room. Either refuse while `dirty`, persist first, or say so.

### R2-5 · minor · confidence 0.85 — Patina's nine standard parts come back empty

`add-part-sheet.tsx:155` builds each Patina row's payload with
`blankPayload(kind, variant)`, and `PATINA_STANDARD_AGREEMENT_PARTS`
(`packages/types/src/agreement.ts:96-106`) carries no bodies at all. Contract §1:
"Default bodies = today's literals from `service-agreement-drafting-room.tsx`
(`DEFAULT_DELIVERABLES`, `DEFAULT_EXCLUSIONS`, default scope sentence)." Remove
Exclusions and re-add it "from your Library" and the list comes back empty; the
same for Deliverables, Services and Terms; Role rates returns with no roles even
where `studio_agreement_defaults` holds a rate card. `materialize_standard_parts`
has the literals — the picker does not.

### R2-6 · minor · confidence 0.85 — the picker hides its constant rows behind a network read

`add-part-sheet.tsx:211` gates the whole Parts column on `library.isLoading`,
though `rows = [...patinaRows, ...studioRows]` and `patinaRows` is a pure
`useMemo` over a constant with `[]` deps.

### R2-7 · minor · confidence 0.75 — one shared error slot, printed under the wrong strip

`agreement-library-card.tsx:420` renders the single `note` after both strips, so a
failed **template** rename or removal prints below the **Parts** list. The three
begin-acts now clear it (an improvement on round 1), but a note raised by a commit
path survives until one of them runs.

### R2-8 · minor · confidence 0.85 — an extra `proposal_agreement_parts` read in the dark state

`agreement-composer.tsx:158` `const partsRead = useAgreementParts(proposalId);` is
unconditional, purely to serve `applyTemplate`'s post-materialize re-read.
`useAgreementParts` is `enabled: !!proposalId`
(`packages/supabase/src/hooks/use-agreement-parts.ts:166-180`), and `main`'s
composer contains no such call (`git grep hasEditor`-style check: `git grep -n
useAgreementParts main -- …/agreement-composer.tsx` → nothing). With
`agreement-parts` on and `agreement-library` off — exactly how W2 ships — the
Contract Room issues a read Wave 1 did not, duplicating data the bundle already
carried. Markup is byte-identical (snapshots); behaviour is not.

### R2-9 · minor · confidence 0.8 — the addendum act can never start a *second* addendum after a refusal

`project-services-addendum-action.tsx:36` `draftId` is set on the first successful
`create_service_addendum` and **never cleared** — not by `onClose`
(`:173 onClose={() => setSheetOpen(false)}`), not by a later act. After a refused
copy the designer closes the sheet; the next click on "Create services addendum"
takes `compose()`'s `if (draftId)` branch (`:88-91`), copies onto the **old**
draft, and pushes to the old draft's room — with the title field disabled
(`titleFrozen={draftId !== null}`). Escaping needs a page reload. The lane's test
*"starts a second addendum with a clean why"* cancels **before** creating, so it
does not cover this path.

### R2-10 · minor · confidence 0.8 — flag-off *behaviour* is not Wave 1's, though the markup is

`readiness.ts` and `part-kinds.ts`'s `addPartOptions` / `scheduleValueIsSet` are
not flag-gated. With `agreement-library` off:

- a Wave-1 composition carrying two `flat` parts now reports `FEE_BASIS_BLOCKER`
  and Save is held — and a Wave 1 test asserting the opposite
  (*"lets an agreement state more than one flat fee — nothing projects"*) was
  rewritten to assert the refusal;
- `+ Add a part` no longer offers a second fee basis;
- a required `cost_plus`/`package`/… part with `{}` now blocks, where Wave 1's
  `default: return true` passed it.

All three are **correct** once 00577 is on Strata (the DB refusal is
flag-blind), and the last is unreachable in practice. But the program rule says
"with either flag off both portals render exactly as Wave 1 shipped", and the
rewritten Wave 1 test is a deliberate turnover. It should be a recorded ruling,
not a lane decision.

### R2-11 · minor · confidence 0.6 — the DEFAULTS strip of §4.4 is still absent

§4.4 asks for three strips: "3. **DEFAULTS** — W1's `studio_agreement_defaults`
strip, read-only here if W1 already put it on this page; otherwise omit."
W1 put its own defaults card on `account-studio-page.tsx` directly above this
insertion, so the literal reading asks for a read-only echo. The card ships
TEMPLATES and PARTS. Documented in the lane notes. **Ruling owed** — the lane's
reading (do not build a second defaults surface) is defensible.

### R2-12 · minor · confidence 0.6 — the byte-identity pin misses two surfaces the lane edited

Five snapshots: rail + standard parts, flat, per-phase, furnishings deposit,
record-only fall-through. The retainer's Wave 1 caveat was wrapped in
`{!libraryOn && …}` (`part-editor.tsx:471`) and the attachment gained a
`libraryOn` branch (`:130`); both are covered only by behaviour assertions.

### R2-13 · minor · confidence 0.6 — the picker still defers its write to Save

§4.3: "Clicking appends the part at the end of the rail (position = max+1) via
`upsert_agreement_parts`." `addFromLibrary` (`agreement-composer.tsx:303-330`)
mutates local state. Consistent with the rest of the room, documented, and now
harmless (R2's D-6 fix closed the 23514 path) — but it is the sheet's literal
wording. **Ruling owed.**

### R2-14 · minor · confidence 0.85 — both composer suites mock the flag module, not the flag

`agreement-composer.test.tsx:116` and `agreement-composer-library-off.test.tsx:92`
force `useFeatureFlag: () => ({ value: false })` module-wide;
`agreement-composer-library-on.test.tsx:91` forces `value: true` module-wide. Any
other flag read anywhere in the composer's tree is silently forced along with
`agreement-library` — in the "on" suite, forced **on**. Mock by flag name.

### R2-15 · nit · confidence 0.85 — `aria-pressed` leaks across all three picker columns

`add-part-sheet.tsx:313` `picked = chosen?.variant === variant` (Schedule menu) and
`:274-276` `chosen?.kind === blank.kind && chosen.variant === null` (Blank kinds)
compare on shape, while the left column compares on `partKey` (`:219`). Picking
Patina's **Ceiling** also marks `ceiling` pressed in the Schedule menu; picking
Patina's **Services** also marks the Blank **Clause** button pressed. Carry a
column discriminator on `AddPartChoice`.

### R2-16 · nit · confidence 0.9 — two imports from the same module in `parts-rail.tsx`

`:37 import { Input } from "@/components/ui/controls";` and
`:39 import { Button } from "@/components/ui/controls";` (the second added here).

### R2-17 · nit · confidence 0.85 — a day count read through a cents reader

`day-rate-editor.tsx:21` `const minimumDays = readCents(payload.minimumDays);`.
Works — `readCents` is a plain rounding coercion — but names the wrong unit, and
the file already parses the write side by hand at `:52-58`.

### R2-18 · nit · confidence 0.7 — `package` includes are keyed by array index

`package-editor.tsx:68` `<div key={index} …>`; `writeIncludes` filters by index.
Removing a middle row re-uses the wrong input. `per-phase-editor.tsx:52` keys by
`phase.key` — the right shape is already in the folder.

### R2-19 · nit · confidence 0.65 — `agreement_part_saved` / `agreement_part_removed` fire on purely local acts

`agreement-composer.tsx:325` and `:265` fire from `addFromLibrary` / `removePart`;
nothing reaches `proposal_agreement_parts` until `persist()`, and no event follows
the Save that does write. Either rename them, or fire from `persist()`.

### R2-20 · nit · confidence 0.5 — R2's "mine is a filter" is not on the card

Build sheet §1: "'Mine' is a client-side filter on `created_by` in the Library
card, nothing more." The card has no such filter. Reads as permission rather than
requirement; recording it so the omission is deliberate.

---

## 4 · Things I checked and found clean

- **R7 vocabulary.** `grep`'d every added string in the diff: no "clause
  library", "contract builder", "snippet", "block", "section", no "gate" / "task"
  / "dashboard" / "overdue", no emoji, no badge, no count **chip** (the Library
  card's counts are a plain line, and its own test says so), no colour-as-status
  (the record-only chip differs only in ink weight). "clause library" and
  "contract builder" appear only inside two doc comments saying *never* to use them.
- **No column names in UI text.** `agreement-library-card.tsx:363` deliberately
  routes through `partKindLabel(part.kind, part.variant)` rather than printing
  `part.variant`. The `record only (R9)` chip is §4.2's mandated literal.
- **R5 / prose never carries money.** Nothing under `schedules/` writes outside its
  own payload; the composer never touches the terms row.
- **R9 split.** `authorityStanding` checks `procurement` first → `deposit-only`,
  then `AUTHORITY_VARIANTS` from `@patina/types` (never re-declared) → `authority`,
  else `record-only`. `RECORD_ONLY_HELP` renders only for `record-only`
  (`part-editor.tsx:85`), one line, no tooltip, no icon, no link.
- **No W3 leakage.** No `design_build`, no `per_draw`, no attestation /
  jurisdiction / draws / lien surface; `attestation` appears only as a kind label
  in the contract §1 vocabulary. No `app_private.issue_invoice_for_actor` anywhere
  in the diff (the lane touches no SQL at all).
- **M4 is one insertion.** `account-studio-page.tsx` diff is +14 lines: one import,
  one flag read, one gated element. Billing is byte-untouched — not a class, not a
  string — and the gate spec asserts the card's absence on all four flag
  combinations.
- **`canManage` matches the page's.** Composer: `studio?.membership?.role === 'owner' | 'admin'`;
  `account-studio-page.tsx:287-288`: `myRole = studio?.membership.role`, same test.
  Studio resolution (`design_studio` first, else first org) is the same in both.
- **Provenance round-trips.** `toAgreementPartPayload` emits both source keys;
  `00577_agreement_fee_schedules.sql:1168-1181` inserts them and `:1015` validates
  the uuid shape; `:2664-2676` carries them across an addendum copy.
- **Fail-closed.** Every W2 surface is gated; the composer additionally requires
  `!isLoading`; the account card requires **both** flags plus a resolved studio;
  no hook sits below an early return.
- **Commit hygiene.** All 19 subjects Conventional, no `merge(...)`, no trailers,
  no `git add -A` residue: every commit touches only
  `apps/designer-portal/src/**` or `artifacts/.../build/**` — **except**
  `6a28247ec` (R2-2).
- **Tests assert behaviour**, not implementation: ~95 new cases across nine specs,
  including the R3 hidden/visible split, the R18 refusals in the RPC's own words,
  the two-step remove, the addendum retry, and thirty flag-on/flag-off pairs in
  `part-editor.test.tsx`.

## 5 · Not verified by me (out of this lane, or not runnable here)

- Every SQL item in the brief's METHOD list — grafts, `DROP FUNCTION` of old
  arities, re-issued grants, the two pinned hashes, the seeded rows' immutability,
  `materialize` stripping owner refs, the consent composer's SQL↔TS byte parity,
  the countersign snapshot and its fingerprint equality. **All backend-lane; this
  lane commits no `supabase/**` file.** I read 00577 only to confirm the room's
  refusal matches the RPC's.
- The client lane's surfaces, `pnpm db:generate`, Playwright, the admin-portal
  build, and the shared Supabase stack. No production command was run; Strata was
  not contacted.
- Build-sheet §9's 14-step walk. No browser was opened by this review either;
  steps 1–8 and 14 remain owed.

## 6 · Verdict

**fix** — no blocker survives verification, but four majors stand:
R2-1 (the branch-alone gate, closed only by integration), R2-2 (the cross-lane
pathspec breach), R2-3 (a decimal percent cannot be typed), R2-4 (the replace
warning discards unsaved work while saying nothing else changes). The lane's
round-1 debt on D-1…D-8 is genuinely paid; D-9…D-18 and N-1…N-5 are, with one
partial exception, untouched.
