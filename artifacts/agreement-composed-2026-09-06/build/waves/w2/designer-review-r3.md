# Wave 2 · designer lane · adversarial review, round 3

Reviewer: separate context, did not write this code.
Branch: `agreement/w2-designer` @ `76c089c29`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-designer`
(`git rev-parse --show-toplevel` → that path).
Base: `main` (`a6584dbc5`). 24 commits, 46 files, +9104 / −237.

**Verdict: fix.** No blocker under the rubric's plain reading (see R3-1 for the one
tension). Five majors — two carried unfixed from round 2, three new. Round 2's
R2-3 (percent decimals) and R2-4 (the Template replace warning) are genuinely
fixed and verified.

---

## Gates I ran myself

| Command (bare `cd` to the worktree first) | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **RED — 12 errors, `Exit status 2`** (all `has no exported member` against `@patina/supabase`; R3-1) |
| same, with the backend lane's `packages/supabase` files copied in | **green, no output, exit 0** (integration probe; working tree restored, `git status --porcelain -- packages/` clean) |
| `pnpm --filter @patina/designer-portal lint` | 2 errors / 203 warnings — both errors pre-existing (`piece-room-save-gate.test.tsx:159` `import/first`, `use-commercial-documents.test.ts:930` `rules-of-hooks`), exactly the baseline W1's R19 recorded |
| `pnpm --filter @patina/designer-portal test` (FULL) | **534 suites passed / 534, 6501 tests passed / 6501, 7 snapshots passed**, exit 0 |
| `pnpm --filter @patina/supabase test` | 88 files passed, 1071 passed / 12 skipped |

Flag-off snapshot provenance checked by hand: `.snap` was added by `ec60b7465`
(spec + snap only, parent = the T0 types commit), and
`git log ec60b7465..HEAD -- <snap>` is **empty** — never regenerated. The spec was
touched once after (`9ce1bbe79`) and that diff adds one mock line only. The five
pinned snapshots are therefore main's markup. `packages/types/src/agreement.ts` is
**byte-identical** across all three lane branches (T0 handshake clean).

Not verified here: no SQL, no local stack, no browser walk, no client portal.

---

## Fixed since round 2

- **R2-3 · decimal percents.** `schedules/percent-field.ts` (new, 49 lines) holds the
  raw keystrokes in local state and drops the draft on blur; `percent-editor.tsx`
  and `cost-plus-editor.tsx` both bind through it. Four jest cases in
  `part-editor.test.tsx` pin it.
- **R2-4 · the replace warning.** `REPLACE_WARNING_UNSAVED` names the unsaved edits;
  the composer hands the sheet `unsavedChanges={dirty}`. Two cases pin it.

---

## Findings

### R3-1 · major (confidence 1.0) — the lane's mandated gate is RED on the committed branch
`apps/designer-portal/src/components/document/account/agreement-library-card.tsx:28`

`pnpm --filter @patina/designer-portal type-check` exits 2 with 12
`TS2724`/`TS2305` errors across 7 import sites: `useAgreementTemplates`,
`useDeleteAgreementTemplate`, `useDeleteStudioAgreementPart`,
`useRenameAgreementTemplate`, `useSaveAgreementPart`, `useStudioAgreementParts`,
`useCopyAgreementPartsFromAuthority`, `useMaterializeAgreementTemplate`,
`useAgreementPartEvents`, `useSaveAgreementAsTemplate`.

I proved this is merge-order, not a defect: copying
`packages/supabase/src/{database.types.ts,hooks/index.ts,hooks/use-agreement-library.ts,hooks/use-agreement-part-events.ts}`
from `agreement/w2-backend` @ `173acdac6` into the working tree makes `tsc --noEmit`
produce **no output, exit 0**. Every designer call site matches the backend's real
signatures (checked one by one against `use-agreement-library.ts:134-360`), including
`useSaveAgreementAsTemplate()` with no argument — the hook falls back to
`result.studioId` for its invalidation, so the omission is safe.

Build-sheet §2 sanctions this ("Backend merges first … No lane blocks on another for
*authoring*"), but §7 names this exact command as THE gate and the severity rubric
lists "red gate" under *blocker*. **Orchestrator call.** Integration must run this on
the merged tree before either branch is called done.

### R3-2 · major (confidence 1.0) — the lane commits into the backend's exclusive pathspec
`packages/supabase/src/hooks/use-agreement-parts.ts:130`

`git diff --name-only main...HEAD | grep -v '^apps/designer-portal/src/'` returns,
besides the three program docs and the sanctioned T0 cherry-pick (`213686f39`,
`packages/types/src/agreement.ts`), three files under `packages/supabase/**`, all from
commit `6a28247ec` "fix(agreements): a part's Library origin survives the next Save":
`use-agreement-parts.ts`, its test, and a new `to-agreement-part-payload.test.ts`.
Build-sheet §2: backend owns "everything under `packages/`"; "a lane that needs a
change in another lane's pathspec **raises** it; it does not reach across."

The change itself is right and conflict-free: `git log main..agreement/w2-backend --
packages/supabase/src/hooks/use-agreement-parts.ts` is **empty** (backend never
touched the file, so the merge takes the designer's version verbatim), the RPC really
does read both keys (`00577_agreement_fee_schedules.sql:1180-1181`
`NULLIF(e.part->>'sourceTemplateKey','')` / `sourcePartId`), and
`pnpm --filter @patina/supabase test` is green here. But the backend lane's gates and
its reviewer never saw it. **Integration reviews it as a backend change, or moves the
commit onto the backend branch.**

### R3-3 · major (confidence 0.85) — NEW — the addendum sheet tells the designer the homeowner reads the why. She does not.
`apps/designer-portal/src/components/document/commercial/addendum-from-parts-sheet.tsx:28`

`WHY_HELP = "One line, kept with the addendum. Your client reads it beside the
change."`, rendered at `:111`; the file's own docblock says "The homeowner reads the
why beside the change." The `why` is written into `agreement_part_events`, and the
backend's own migration comment is unambiguous:

> `COMMENT ON TABLE public.agreement_part_events IS '… the one line the designer wrote
> about why. **Studio-only — it never reaches the client bundle (R8)** …'`
> (`00577_agreement_fee_schedules.sql:2724-2729`)

Confirmed on the other side too: `get_client_commercial_document_bundle` in
`00577` emits no `why` key, and `git diff main...HEAD -- apps/client-portal/src` on
`agreement/w2-client` contains no `why` render at all (the only two hits are prose in
comments). So a designer is promised an audience the system does not deliver, in the
one place W2 asks her to write something for the homeowner.

The build sheet prescribes that copy verbatim (§4.5) while §3.3 states the events table
is studio-only — the sheet contradicts itself, and §"Binding sources" says to *raise*
that, not choose. The lane chose, and then wrote the false claim into its own docblock.
**Fix: reword to what is true ("Kept with the addendum, on the studio's record."), or
rule that a later wave surfaces it and say "not yet" in the help line.**

### R3-4 · major (confidence 0.8) — NEW — the room asks the wrong studio for the Library
`apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx:141`

```tsx
const { data: orgs } = useOrganizations();
const studio = (orgs ?? []).find((org) => org.type === "design_studio") ?? (orgs ?? [])[0] ?? null;
const studioId = studio?.id ?? null;
const canManage = studio?.membership?.role === "owner" || studio?.membership?.role === "admin";
```

`useOrganizations` (`packages/supabase/src/hooks/use-organizations.ts:150-183`) selects
`organization_members … .eq('status','active')` with **no `ORDER BY`** — the row order
is whatever Postgres returns. For a designer in two design studios (the account the
walk script §9 explicitly says to use, "the 00566 resolution path is the one that
breaks"), `studioId` is an arbitrary one of the two and has nothing to do with the
studio the agreement sits in.

Three consequences:

1. **The Add-a-part picker lists the other studio's Library parts.** Adding one is a
   purely local act (`addFromLibrary`, `:303-330`) and reaches the table through
   `upsert_agreement_parts`, which validates `sourcePartId` only as a uuid shape
   (`00577:1015-1016`) and never checks the part's studio. So studio B's private clause
   body lands on studio A's agreement, and `source_part_id` points into B's shelf —
   precisely the cross-studio composition the backend hardened
   `materialize_agreement_template` against three hours ago (`f91d6c8cc`, "a Template
   lands only where the agreement plainly sits").
2. **`canManage` is the wrong studio's role**, so `Save as template…` can be hidden from
   an owner of the agreement's studio (the RPC's refusal makes the converse harmless).
3. The Template picker lists the wrong shelf, and — because the backend now refuses
   zero-or-several (`00576:677-681`, `'this agreement does not sit in a single studio,
   so a studio Template cannot be composed into it'`) — a two-studio designer's
   *every* studio Template click ends in that refusal, with no warning beforehand.

**Fix: resolve the studio from the proposal (raise it across the seam — the bundle
carries no studio id today), or refuse the Library acts outright when the actor's
studio is ambiguous and say so.**

### R3-5 · major (confidence 0.8) — NEW — two of the three seeded templates can never be used
`apps/designer-portal/src/components/document/rooms/drafting/agreement/template-picker-sheet.tsx:40`

```ts
export function templateClassFor(documentKind: string): string {
  return documentKind === "service_addendum" ? "design_services" : documentKind;
}
```
and `:70-72` filters `template.class === wanted`.

The composer only opens for `design_services` / `service_addendum` (readiness R-1
refuses anything else), so `wanted` is always `'design_services'`. The seeded rows are
`patina.design_services` (class `design_services`), `patina.consultation` (class
`consultation`) and `patina.furnishings_services` (class `furnishings_services`)
(`00576_agreement_library.sql:799, 852, 884`). **`Consultation / hourly` and
`Furnishings only` therefore never appear in the picker on any document W2 can
compose** — and the Agreement Library card lists them with no class filter
(`agreement-library-card.tsx:106-111`), so the designer sees two templates on the shelf
she can never reach. Studio templates are unaffected (they always save as
`design_services`, per `save_agreement_as_template` step 6).

P4 ships one usable seeded template out of three. The build sheet prescribes the filter
(§4.3) and the three classes (§3.2) without reconciling them. **Orchestrator ruling:
map the classes onto the kinds W2 can compose, or record that two seeded templates ship
dark.**

### R3-6 · minor (confidence 0.85) — Patina's nine standard parts come back from the picker empty
`add-part-sheet.tsx:155`

`patinaRows` builds each choice with `blankPayload(standard.kind, standard.variant)`
(`part-kinds.ts:107`+ → `{body:''}` / `{items:[]}` / `{roles:[]}` …), because
`PATINA_STANDARD_AGREEMENT_PARTS` (`packages/types/src/agreement.ts:96-106`) carries
only `partKey/kind/variant/defaultTitle/required` — no bodies. Contract §1: "Default
bodies = today's literals from `service-agreement-drafting-room.tsx`". Removing
Exclusions and re-adding it "from your Library" yields an empty list; same for
Deliverables, Services, Terms and Role rates. The literals exist — the seeded template
carries them verbatim (`00576:801-812`) and `materialize_standard_parts` has them.
**Seed the Patina rows from the same literals.** (Unfixed from round 2 · D-10.)

### R3-7 · minor (confidence 0.85) — the picker hides nine constants behind a network wait
`add-part-sheet.tsx:211`

`{library.isLoading ? <p>Opening the Library…</p> : <ul>{rows.map(…)}</ul>}` gates the
whole Parts column, while `rows = [...patinaRows, ...studioRows]` and `patinaRows` is a
`useMemo` over a module constant with `[]` deps. **Render `patinaRows` immediately;
scope the loading line to the studio section.** (Unfixed from round 2 · D-12.)

### R3-8 · minor (confidence 0.8) — after a refused copy the addendum act can never start a new draft
`project-services-addendum-action.tsx:36`

`const [draftId, setDraftId] = useState<string | null>(null)` is set once on a
successful `create_service_addendum` (`:94`) and **never cleared** — not by
`onClose={() => setSheetOpen(false)}` (`:173`), not anywhere. After a refused
`copy_agreement_parts_from_authority` the designer closes the sheet; the next "Create
services addendum" click reopens it, `compose()`'s `if (draftId) { setCarrying(…);
return; }` (`:88-91`) copies onto the OLD draft and pushes to the old draft's room, with
the title frozen (`titleFrozen={draftId !== null}`, `:180`). Escaping needs a reload.
The lane's test "starts a second addendum with a clean why" cancels *before* creating,
so it does not cover this path. **Clear `draftId` when the sheet closes on an abandoned
act.** (Unfixed from round 2.)

### R3-9 · minor (confidence 0.8) — an extra read in the flag-off production state
`agreement-composer.tsx:159`

`const partsRead = useAgreementParts(proposalId);` is called unconditionally, purely to
serve `applyTemplate`'s post-materialize re-read; the hook is
`useQuery({… enabled: !!proposalId})` and fires eagerly on mount.
`git show main:…/agreement-composer.tsx | grep useAgreementParts` returns nothing. With
`agreement-parts` on and `agreement-library` off — exactly how W2 ships dark — the room
issues a `proposal_agreement_parts` read Wave 1 did not, duplicating data the bundle
already carries. Markup is byte-identical (the five snapshots pass); behaviour is not.
It is also redundant: `useMaterializeAgreementTemplate` already invalidates
`agreementPartsKeys.list(proposalId)`. (Unfixed from round 2.)

### R3-10 · minor (confidence 0.8) — flag-off *behaviour* changed, and the byte-identity pin cannot see it
`readiness.ts:140`

`readiness.ts:140-146` adds `FEE_BASIS_BLOCKER` for every fee-basis part after the
first with **no flag guard**; `part-kinds.ts:226-234` `addPartOptions` (the flag-OFF
menu) drops the second fee basis; `scheduleValueIsSet` gained five W2 cases that a
required empty part now fails. So with `agreement-library` off, a W1 composition
carrying two `flat` parts now reports a blocker and Save is held, and a required empty
`cost_plus`/`package` part now blocks where W1 answered `true`.

The flag-off snapshot cannot catch any of it: I read the `.snap` — `AddPartMenu` renders
only its closed `+ Add a part` button (`…flat-fee editor 1`, line 158 of that block), so
the menu's option list is never in the pinned markup. All three changes are correct once
`00577` is on Strata (the DB refusal at `00577:1216-1220` is flag-blind), but the
program rule is "with either flag off both portals render exactly as Wave 1 shipped".
**Record the turnover as a ruling rather than a lane decision.** (Unfixed from round 2.)

### R3-11 · minor (confidence 0.75) — one shared error slot at the Library card's foot
`agreement-library-card.tsx:420`

A single `note` state renders once at `:420-424`, after both the Templates block
(`:214-313`) and the Parts block (`:315-418`). `commitTemplateRename`,
`commitTemplateRemove`, `commitPartRename` and `commitPartRemove` all write into it, so
a failed *template* act prints below the Parts list. Improved since round 1
(`beginRenameTemplate` `:129`, `beginRenamePart` `:137`, `askToRemove` `:145` all clear
it), but the placement is still wrong. **Scope the note to the strip that raised it.**

### R3-12 · minor (confidence 0.7) — NEW — a refused Library rename prints PostgREST's own words
`agreement-library-card.tsx:430`

`refusal(error, fallback)` returns `error.message` verbatim whenever it is a non-empty
string. The RPC paths are safe (their `RAISE` messages are hand-written in the
designer's words), but **rename and delete of a template are plain PostgREST table
writes**, not RPCs (`useRenameAgreementTemplate` does
`.update({title}).eq('id',…).select('*').single()`). An RLS denial there matches zero
rows and `.single()` fails with PostgREST's `PGRST116` — "JSON object requested,
multiple (or no) rows returned" — which is what the designer then reads on the studio's
Account page. The same shape is W1's `refusalMessage` in the composer, so this is a
pattern rather than a slip, but the new call sites are the ones that can reach a
non-hand-written message. **Map the PostgREST codes to a sentence, as
`save-as-template-action.tsx:31-44` already does for `42501`.**

### R3-13 · minor (confidence 0.6) — the DEFAULTS strip of §4.4 is absent
`agreement-library-card.tsx:206`

§4.4 asks for three strips; the card ships TEMPLATES and PARTS. Item 3 reads "DEFAULTS —
W1's `studio_agreement_defaults` strip, **read-only here if W1 already put it on this
page**; otherwise omit." W1's defaults card *is* on `account-studio-page.tsx` directly
above this insertion (`:1069-1389`, Library card at `:1391-1399`), so the literal reading
asks for a read-only echo. Documented in the lane notes and in the card's docblock.
**Orchestrator: add the echo, or record the omission as accepted.**

### R3-14 · minor (confidence 0.6) — the flag-off pin misses two editors the lane edited
`__tests__/__snapshots__/agreement-composer-library-off.test.tsx.snap:1`

Five snapshots: the rail + standard parts, flat, per-phase, furnishings deposit, and a
record-only variant in W1's read-only card. The retainer's Wave 1 caveat is now wrapped
in `{!libraryOn && …}` (`part-editor.tsx:471-476`) and the attachment gained a
`libraryOn` branch (`part-editor.tsx:130`); neither is snapshot-pinned. The first
snapshot carries a retainer part **in the rail** but opens on `patina.services`, so the
retainer editor's flag-off markup is never rendered into a snapshot. Covered only by
behaviour assertions in `part-editor.test.tsx`. **Add both to the flag-off spec.**

### R3-15 · minor (confidence 0.6) — the picker still defers its write to Save
`agreement-composer.tsx:303`

§4.3: "Clicking appends the part at the end of the rail (position = max+1) **via
`upsert_agreement_parts`**." `addFromLibrary` (`:303-330`) mutates local state and waits
for Save; `add-part-sheet.tsx`'s docblock says "Nothing here writes." Consistent with the
rest of the room and documented in the lane notes; harmless now that R18's refusals
close the path to a 23514. **Ruling: accept the deviation, or write through on click.**

### R3-16 · minor (confidence 0.85) — the composer suites stub the flag module, not the flag
`__tests__/agreement-composer-library-on.test.tsx:91`

`agreement-composer.test.tsx:116` and `agreement-composer-library-off.test.tsx:92` mock
`useFeatureFlag: () => ({ value: false, isLoading: false })` module-wide;
`agreement-composer-library-on.test.tsx:91` mocks it to `true` module-wide. Every other
flag read anywhere in the composer's subtree is forced along with `agreement-library` —
in the "on" suite, forced **on**. **Mock by flag name.**

### R3-17 · nit (confidence 0.5) — NEW — PARTS is a flat list, not grouped by kind
`agreement-library-card.tsx:329`

§4.4 item 2: "PARTS — **grouped by kind** with counts". The card renders
`libraryParts.map(…)` as one flat `<ul>` with the count line above it. The rows do
arrive kind-ordered (`useStudioAgreementParts` orders `kind, title`), so they are
contiguous, but there are no kind headings. The count line matches the prescribed format
exactly. Cosmetic; recorded so the omission is deliberate.

### R3-18 · nit (confidence 0.85) — `aria-pressed` leaks across the picker's three columns
`add-part-sheet.tsx:313`

The Schedule menu compares `picked = chosen?.variant === variant` (`:313`) and the Blank
kinds compare `chosen?.kind === blank.kind && chosen.variant === null` (`:274-276`), both
on *shape*, while the left column compares on `partKey` (`:219`). Picking Patina's
Ceiling also marks `ceiling` pressed in the Schedule menu; picking Services also marks
Blank → Clause pressed. `AddPartChoice` carries no column discriminator.

### R3-19 · nit (confidence 0.9) — two imports from the same module
`parts-rail.tsx:39` — `:37 import { Input } from "@/components/ui/controls";` … `:39
import { Button } from "@/components/ui/controls";` (the second added by this lane).

### R3-20 · nit (confidence 0.85) — a day count read through a cents reader
`schedules/day-rate-editor.tsx:21` — `const minimumDays = readCents(payload.minimumDays);`.
Works (it is a rounding coercion) but names the wrong unit; the file already parses the
write side by hand at `:47-59`.

### R3-21 · nit (confidence 0.7) — "What it includes" rows keyed by array index
`schedules/package-editor.tsx:68` — `<div key={index} …>` with `writeIncludes` filtering
by index (`:88-91`). `per-phase-editor.tsx:52` keys by `phase.key`; the right shape is
already in the folder.

### R3-22 · nit (confidence 0.65) — two analytics events fire on purely local acts
`agreement-composer.tsx:325` — `documentEvents.agreementPartSaved` fires at the end of
`addFromLibrary` and `agreementPartRemoved` from `removePart` (`:265`); nothing reaches
`proposal_agreement_parts` until `persist()`, and no event follows the Save that does
write. **Rename them, or fire from `persist()`.**

### R3-23 · nit (confidence 0.5) — R2's "mine" filter is not implemented
`agreement-library-card.tsx:106` — §1 Rulings, R2: "'Mine' is a client-side filter on
`created_by` in the Library card, nothing more." The card sorts seeded-first then title
and offers no filter; `createdBy` is on `AgreementTemplate`
(`packages/types/src/agreement.ts:190`) and unread. Reads as a permission rather than a
requirement; recorded so the omission is deliberate.

---

## Checks that passed

- **Vocabulary (R7).** `git diff main...HEAD -- apps/designer-portal/src | grep '^+' |
  grep -iE 'clause library|contract builder|snippet|block|section|dashboard|overdue|
  confetti'` — every hit is a CSS class (`block text-[13px]`) or a JSX `<section>`, plus
  the two docblocks that *forbid* the words. No emoji, no badge, no count chip, no
  red/green status, no checkmark-as-status in any new string.
- **No database word reaches the designer.** `partKindLabel` covers all 15 variants
  (`part-kinds.ts:46-62`) before its `variant.replace(/_/g,' ')` fallback; the Library
  card imports it deliberately rather than printing `part.variant`.
- **R9 split.** `authorityStanding` reads `AUTHORITY_VARIANTS` from `@patina/types`
  (never re-declared), `procurement` → deposit-only, everything else record-only, with
  `RECORD_ONLY_HELP` under the editor and no tooltip/icon/link. Eight jest cases pin the
  full vocabulary and assert nothing is missed.
- **M4 is exactly one insertion.** `account-studio-page.tsx` gains an import, one flag
  read (`:162`) and one four-line render (`:1391-1399`) below Billing (`:953-1068`) and
  below W1's Agreement defaults (`:1069-1389`). Billing is untouched — the diff for that
  file is +14 lines and touches nothing inside either block.
- **Fail-closed.** The account card is `{agreementPartsOn && agreementLibraryOn && studio
  && …}`; the composer computes `libraryOn = libraryFlag && !libraryLoading`;
  `useFeatureFlag` itself defaults `{value:false, isLoading:true}`
  (`use-feature-flag.ts:119-120`). `agreement-library-gate.test.tsx` (199 lines) proves
  all four flag combinations.
- **No W3 leakage.** No `design_build`, no `per_draw`, no attestation/jurisdiction/draw
  surface, no new `issue_invoice_for_actor` caller anywhere in the diff. The three W3
  variants chip `record only (R9)` and open in W1's read-only card, with a test.
- **R6.** Every Library act sits inside `{!readOnly && …}`; a sent agreement offers none
  of them (`agreement-composer-library-on.test.tsx:425`).
- **Query keys.** Every call site matches the backend's hook signatures; the one
  argument-less call (`useSaveAgreementAsTemplate()`) still invalidates, via the hook's
  `result.studioId` fallback.
- **Tests assert behaviour**, not markup: ~90 new cases across 10 spec files, including
  the R18 pair rule, the R3 role split, the R9 vocabulary sweep, the history strip's
  ordering and cap, and the four flag-pair combinations.

*Written by the round-3 adversarial reviewer, 2026-09-07.*
