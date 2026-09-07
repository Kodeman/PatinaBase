# Wave 1 · designer lane — adversarial review, round 2

Reviewer context: separate from the implementer. Branch `agreement/w1-designer`
at `0d74a641b`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`
(`git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`).
Base `4c0b7b17b`. 20 commits, 38 files, +7574 / −193.

## Gates I ran myself

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer

pnpm --filter @patina/designer-portal type-check
  → tsc --noEmit, no output, exit 0

pnpm --filter @patina/designer-portal lint
  → ✖ 205 problems (2 errors, 203 warnings)
    piece-room-save-gate.test.tsx:159   import/first rule not found
    hooks/__tests__/use-commercial-documents.test.ts:930  react-hooks/rules-of-hooks
    Both verified pre-existing: `git show main:<file>` puts the same code at the
    same line on main. The second file IS in this lane's diff (+189 lines of
    new cases), but the offending block is main's, unmoved.

pnpm --filter @patina/designer-portal test
  → Test Suites: 522 passed, 522 total
    Tests:       6298 passed, 6298 total
    Snapshots:   2 passed, 2 total
```

## Round-1 findings — verified state

| ID | R1 severity | State now | Evidence |
|---|---|---|---|
| D1 | blocker | **FIXED** | `commercial-document-body.tsx:44` and `service-agreement-instruments.tsx:356` both pass `parts`. `grep -rn "Not yet set" apps/designer-portal/src` leaves only `service-agreement-preview.tsx:173,198`, both inside the `composed ? … : …` else branch. |
| D2 | major | **FIXED** | `service-agreement-instruments.tsx:367-377` passes `readinessOverride` from `assessAgreementReadiness` when `parts.length > 0`; 4 new cases in `service-agreement-instruments.test.tsx`. |
| D3 | major | **FIXED** | `readiness.ts:57` `FEE_VARIANTS = rate_card · flat · per_phase · ceiling`, no longer `AUTHORITY_VARIANTS`. Cases added at `readiness.test.ts:240` and `:267`. |
| D4 | major | **FIXED** | `use-commercial-documents.ts:220` now `nullableFiniteCents(row.billing_ceiling_cents)`; pinned in `use-commercial-documents.test.ts`. |
| D5 | major | **MOSTLY FIXED** | Sentences moved to `packages/types/src/agreement-copy.ts`; the four drifted rows and the empty-part rule now agree with the client renderer by inspection. Two residues remain (DR9, DR18) and the fix itself is DR2. |
| D6 | major | **FIXED** | `fetchAgreementParts` soft-fails only on `42P01`/`PGRST205`/a matching message; everything else rethrows. |
| D7 | major | **FIXED** | `account-studio-page.tsx:1065` `{agreementPartsOn && …}`, and the read is `useStudioAgreementDefaults(agreementPartsOn ? studio?.id : null)`. |
| D8 | major | **FIXED** | Spec renamed `agreement-parts.agreement.pw.ts`; `playwright.agreement.config.ts` adds `testMatch: "**/*.agreement.pw.ts"`; base `playwright.config.ts` untouched. |
| D9 | minor | **OPEN** → DR4 | `readiness.ts:135` still guards R-7 on `roles.length > 0`. |
| D10 | minor | **OPEN** → DR5 | `parts-rail.tsx:221` still chips `flat`/`per_phase` "creates authority"; `PerPhaseEditor` still has no record-only note. |
| D11 | minor | **OPEN** → DR6 | `account-studio-page.tsx:1359,1365` still print `agreementDefaults?.cadence` / `.retainer_credit_rule` raw. |
| D12 | minor | **OPEN** → DR7 | `use-studio-agreement-defaults.ts:138-148` still omits `updated_by`; the migration declares it `NULL` with no default (00575:1946). |
| D13 | minor | **OPEN and worse** → DR3 | The composer key still carries `parts.length` — and it also carries `terms.updatedAt`, which the projection bumps on every save. |
| D14 | minor | **HALF FIXED** → DR8 | `readinessOverride` is covered; `project-authority-band` and `money-region` still have no null-ceiling case. |
| D15 | nit | **OPEN** → DR9 | `agreement-parts-body.tsx:311` still `String.fromCharCode(65 + index)`. |
| D16 | minor | **OPEN and now false** → DR12 | The notes still say "Nothing under `packages/**` … was touched by this lane" while commit `883586d43` adds `packages/types/src/agreement-copy.ts`. |
| D17 | minor | **OPEN** → DR13 | `service-agreement-drafting-room.tsx:24` static import. |
| D18 | nit | **OPEN (not this lane's)** → DR14 | Same two pre-existing errors. |
| D19 | nit | **OPEN** → DR10 | `agreement-composer.tsx:437,445` still key by message string. |
| D20 | nit | **OPEN** → DR11 | `emptyProjection()` still diverges from `emptyTerms()`. |

## New findings, round 2

### DR1 — major · an uncapped agreement prints `$0 budget` and `authorized $0`

`get_project_authority_summary` returns `'authorizedCents', v_authority.billing_ceiling_cents`
(backend lane, `00575_agreement_parts.sql:1493`). F-2 makes that column NULL on a
flat-fee agreement. The designer adapter reads it with `finiteCents`, not
`nullableFiniteCents` (`use-commercial-documents.ts:833`), and
`finiteCents(null)` is `Math.round(Number(null))` = **0**
(`use-commercial-documents.ts:151-154`).

Three surfaces then print that zero as a real figure:

- `project-authority-band.tsx:76` — `authorized $0`
- `money-region.tsx:211,214` — `"$0 authorized of $0 budget"` / `"$0 budget · …"`
- `use-money-ladder.ts:90` → `money-ladder.ts:90-91` — the budget rung reads
  `$0 approved` rather than `nothing approved yet`, because `authorizedCents`
  arrives as `0` and not `null`.

This is exactly criterion **N** ("no UI prints `$0` where it means uncapped"),
on the one field the lane did not widen. The backend lane already widened
`ProjectBillingAuthority.authorizedCents` to `number | null` in
`packages/types/src/commercial.ts` for this reason; the designer lane's copy of
the same file kept it `number` (see DR2).

Fix: `nullableFiniteCents` on `authorizedCents`, widen the app-local
`ProjectBillingAuthority.authorizedCents` in
`lib/document/commercial-documents.ts:88`, and render "No ceiling" in the three
readers, with a case in each of the two renderers' suites.

### DR2 — major · the lane edited `packages/**`, and it conflicts with both peer lanes

§2.2 lists `packages/**` under **May not touch** for this lane. Commit
`883586d43` adds `packages/types/src/agreement-copy.ts` and a second
`export * from` line in `packages/types/src/index.ts`.

```
git merge-tree --write-tree agreement/w1-designer agreement/w1-backend
  CONFLICT (content): Merge conflict in packages/types/src/commercial.ts
  CONFLICT (content): Merge conflict in packages/types/src/index.ts

git merge-tree --write-tree agreement/w1-designer agreement/w1-client
  CONFLICT (content): Merge conflict in packages/types/src/index.ts
```

`index.ts` is cosmetic. `commercial.ts` is **not**:

```
--- backend                          +++ designer
-  /** NULL = uncapped (F-2), mirrors `ceilingCents` … */
-  authorizedCents: number | null;
+  authorizedCents: number;
```

So the merge forces a decision nobody has made, and whichever side wins
determines whether DR1 is a type error or a silent `$0`. `agreement.ts` is
byte-identical across all three lanes (`diff -u` clean), so only these two
files are at issue.

Fix: the integration steward resolves `commercial.ts` in the backend lane's
favour (it matches the RPC) and applies DR1's changes; `agreement-copy.ts`
moves under the backend lane's ownership of `packages/types` or is accepted
with the deviation recorded.

### DR3 — major · every Save remounts the composer and throws the designer back to part 1

`service-agreement-drafting-room.tsx:107` keys `AgreementComposer` on
`` `${bundle.data.terms?.updatedAt ?? "new"}-${bundle.data.parts.length}` ``.

`upsert_agreement_parts` calls `_project_agreement_terms`, whose upsert ends
`updated_at = now()` (backend `00575:1848`+ body). So **every** save changes
`terms.updatedAt`, the key changes, the composer unmounts, and `saveNote`
("All agreement changes saved.") and `selectedId` are rebuilt from the bundle.
The round-1 finding said "any Save that adds or removes a part"; it is in fact
every save.

Independently, the RPC is `DELETE … ; INSERT …` with no `id` in the insert
column list (backend `00575:2035-2052`), so **every part gets a new uuid on
every save**. `agreement-composer.tsx:196-200` re-selects with
`saved.some((part) => part.id === current)`, which is now never true, so even
without the remount the editor jumps to the first part after each Save.

Neither is caught: `agreement-composer.test.tsx` renders the composer directly
(no room key) and its save mock returns the same ids.

Fix: key the composer on the proposal/document id, and re-select by `partKey`
rather than `id` after a save.

### DR4 — minor · a rate card with no roles at all raises nothing (D9, still open)

`readiness.ts:133-142` gates R-7 on `roles.length > 0`. Sheet R-7 reads "a
`rate_card` part **present** ⇒ ≥1 role with a non-blank name and
`hourlyRateCents > 0`". A composition of services + terms + `flat` +
`rate_card{roles: []}` is `ready: true` with a rate-card part that says nothing.

The DB agrees in this one case (its floor tests
`jsonb_array_length(payload->'roles') > 0`, backend `00575:2068-2069`), so this
is a spec deviation rather than a false-green against the server — but the rail
still offers a Role rates part that can be saved empty and never questioned.

### DR5 — minor · `flat` and `per_phase` are chipped "creates authority" (D10, still open)

`parts-rail.tsx:221` chips any variant in `AUTHORITY_VARIANTS`, which includes
`flat` and `per_phase`. §4.2's add-menu column says "yes (2, **record-only**
chip)", and `FlatEditor` (`part-editor.tsx:508-511`) says the opposite of the
chip on the same screen: "Recorded on the agreement now; it starts creating
billing authority in a later release." `PerPhaseEditor` carries no note at all.

The contract's own comment on `AUTHORITY_VARIANTS` ("so the composer can chip a
part `creates authority` vs `record only`") reads the other way, so this needs
an orchestrator ruling rather than a unilateral change — but the chip and the
editor must stop contradicting each other, and PerPhase must get FlatEditor's
sentence either way.

### DR6 — minor · raw enum values in the studio's face (D11, still open)

`account-studio-page.tsx:1359` renders `{agreementDefaults?.cadence ?? '—'}` →
`biweekly` / `milestone`; `:1365` renders `{agreementDefaults?.retainer_credit_rule ?? '—'}`
→ `non_refundable`. The manager form immediately above offers "Every two
weeks" / "At named milestones" / "Non-refundable" for the same two values, so a
plain member reads snake_case where an admin reads prose.

### DR7 — minor · `updated_by` is never written (D12, still open)

`use-studio-agreement-defaults.ts:138-148` upserts six columns; `updated_by` is
not among them. The migration declares
`updated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL`
(backend `00575:1946`) with no default and no trigger, so "who last changed the
studio's defaults" is permanently unanswerable.

### DR8 — minor · criterion N's two renderers changed with no test (D14, half open)

`git diff main...HEAD --name-only` contains `project-authority-band.tsx` and
`money-region.tsx` but neither `project-authority-band.test.tsx` nor
`money-region.test.tsx`. `grep -rln "No ceiling" apps/designer-portal/src`
returns only `agreement-parts-body.test.tsx`. The `readinessOverride` half of
the round-1 finding IS now covered (`service-agreement-instruments.test.tsx`).

### DR9 — nit · attachment lettering still diverges and breaks past Z (D15)

`agreement-parts-body.tsx:311` `String.fromCharCode(65 + index)` yields `[` at
index 26. The client lane wrote `attachmentLetter()`
(`apps/client-portal/src/components/agreement-parts-body.tsx:55-57`) which
falls back to numbers. W1 authors no attachments, so cosmetic today.

### DR10 — nit · duplicate React keys reachable in the readiness panel (D19)

`agreement-composer.tsx:437` and `:445` key both lists by the message string.
Two `procurement` parts with `depositPercent: null` push the identical note
twice (`readiness.ts:165-168`).

### DR11 — nit · two disagreeing "empty terms" shapes (D20)

`emptyProjection()` (`agreement-composer.tsx:466`) sets
`furnishingsDepositPercent: null`; the seven-facet room's `emptyTerms()`
(`service-agreement-drafting-room.tsx:65`) uses `50`. Inert under parts.

### DR12 — minor · the lane notes are now materially wrong about `packages/**`

`designer-notes.md` still says "Base `4c0b7b17b` + the T0 types commit
`bab1b9b92` … already cherry-picked onto the branch when the lane opened"
(the branch carries its own commit; the backend lane carries a distinct
`13bc4445c`), and "Nothing under `packages/**`, `supabase/**` or
`apps/client-portal/**` was touched by this lane" — which commit `883586d43`
falsifies. The "Files this lane changed" list omits both `packages/types`
files. The round-1 fix table does describe the change, so this is a stale
paragraph, not a concealment; the integration steward should not be reading a
"no packages" claim while resolving a packages conflict.

### DR13 — minor · the composer ships in the flag-off bundle (D17)

`service-agreement-drafting-room.tsx:24` statically imports `AgreementComposer`,
pulling `parts-rail`, `part-editor`, `add-part-menu`, `readiness` and `@dnd-kit`
into the chunk a flag-off designer downloads. Criterion J's second half asks for
the opposite. The rendered markup is provably identical (the committed
snapshot), so this is weight, not behaviour.

### DR14 — nit · the named lint gate is red, from two pre-existing errors

Recorded so the integration steward does not attribute it to this lane. See
the gates block above.

### DR15 — minor · the defaults read swallows every error, not only a missing table

`use-studio-agreement-defaults.ts:112` — `if (error) return defaultStudioAgreementDefaults(studioId)`.
That is the shape D6 was raised about and the parts read was fixed to avoid, and
`designer-notes.md` decision 3 claims both reads "fail soft on a missing
relation". This one fails soft on an RLS denial and on a dropped connection too:
the card then shows the platform defaults over a studio's real saved values.
The blast radius is smaller than D6's (the dirty predicate compares against the
fallback, so Save stays disabled and nothing is overwritten), but the studio is
shown a rate card it does not have.

### DR16 — minor · the UI's ceiling floor is stricter than the DB's for a custom rate card

`readiness.ts:196-217` computes `billsTime` from **any** `schedule`/`rate_card`
part. The DB floor is deliberately narrower — `part_key = 'patina.role_rates'`
only, with the comment "A rate card under a studio or custom key projects no
rates, so it bills no time and owes no cap" (backend `00575:2058-2069`). So a
studio that adds a custom "Consultant rates" rate-card part is refused a send by
the panel that the server would have allowed. §4.4's R-6 text supports the UI as
written, so this is a spec collision to rule on, not an implementation slip.

### DR17 — nit · the parts read is unconditional, serial, and ahead of the error checks

`use-commercial-documents.ts:416` — `const parts = await fetchAgreementParts(…)`
runs **after** the `Promise.all`, so it adds a serial round-trip to every
commercial-document bundle load on every surface, for every user, flag on or
off; and it runs **before** `if (proposalResult.error) throw …`, so a
missing/denied proposal now costs an extra query before it fails. Folding it
into the `Promise.all` costs nothing and removes both.

### DR18 — nit · cross-lane copy is shared by inspection, not by construction

The client renderer still spells its own literals
(`apps/client-portal/src/components/agreement-parts-body.tsx:69,153,173-174,191,209`)
rather than importing `AGREEMENT_PART_COPY`. Today they match. One residual
behavioural drift: `per_phase` with a null phase amount prints `—` on the
client and `$0` on the designer, because `readPhases` coerces null to zero
(`part-kinds.ts:239`). Both are recorded in the lane notes as advisories.

### DR19 — minor · the flag policy is applied inconsistently across the wave's surfaces

The Account defaults card is gated on `agreement-parts` (the D7 fix), but
`commercial-document-body.tsx` and `service-agreement-instruments.tsx` render a
composed agreement's parts — and compute `readinessOverride` from them — with no
flag check at all. Both choices are defensible (a sent agreement must read as
what was signed; the Account card is a new surface), but they are opposite
answers to the same question and no ruling records either. Byte-identity holds
for a parts-less document on both surfaces, which is what the program rule
literally requires.

## What I checked and found clean

- **Flag-off byte-identity (criterion J, first half).** The snapshot commit
  `ba80eee66` touches only the test and the snapshot;
  `git diff main ba80eee66 -- …/service-agreement-drafting-room.tsx` is empty,
  so it was generated on the unmodified room. `git diff ba80eee66 HEAD` on the
  test and the snapshot is empty — neither was rewritten after the flag branch
  landed. It passes in the full run.
- **P0 "Not yet set".** Unreachable on any composed document from any designer
  surface (grep above).
- **RPC interface parity.** `toPartPayload` emits `kind · variant · partKey ·
  title · payload · required · clientVisible`; the RPC reads exactly those keys
  (backend `00575:2042-2051`).
- **Query keys / invalidation.** `settleAgreementParts` matches
  `useSaveServiceAgreement`'s existing pattern plus `['agreement-parts', id]`;
  the key string matches §2.4's frozen interface.
- **Criterion S.** Two pinned cases added; `asCommercialDocumentKind('trade_scope')`
  widens, `commercialDocumentExperience('trade_scope')` still answers `'legacy'`;
  `type-check` green proves no exhaustive switch or `Record<CommercialDocumentKind,…>`
  broke.
- **Criterion U (wave leakage).** No `save_agreement_part`,
  `save_agreement_as_template`, `materialize_agreement_template`,
  `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent`,
  `agreement_execution_snapshots`, no `design_build` anywhere in the diff.
- **Criterion V (vocabulary).** No "clause library", no "contract builder", no
  "facet" in any rendered string; no badge, count chip, red/green, checkmark or
  emoji; the required marker is a middot in `--color-clay-ink`. The only raw
  vocabulary on screen is `UnsupportedPartCard`'s mono `kind · variant` chip,
  which §4.2 asks for by name, and DR6's read-only `<dl>`, which it does not.
- **Criterion T.** Unknown kinds/variants fall through to `UnsupportedPartCard`
  and `RecordedLine` in three places; three tests cover it; no raw JSON.
- **Billing untouched.** `git diff main...HEAD --stat` on
  `account-studio-page.tsx` is `+460 −0`.
- **Commit hygiene.** 20 commits, Conventional subjects, no bodies, no
  trailers, no `merge(...)`; `git diff main...HEAD --name-only` outside
  `apps/designer-portal/`, `artifacts/agreement-composed-*` and
  `packages/types/` is empty; working tree clean.

## Verdict

**fix** — no blocker; three majors (DR1, DR2, DR3), all cheap and all landing in
files this lane already owns except `packages/types/src/commercial.ts`, which is
the integration steward's call.
