# Wave 1 · designer lane — adversarial review, round 3

Branch `agreement/w1-designer` @ `3701ace43` · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`
(`git rev-parse --show-toplevel` pasted in the report-back).
Base `main` = `4c0b7b17b`. 26 commits, 43 files, +8467 / −199.

No code changed between round 2's fix pass (`3701ace43`) and this review, so
this round is: verify the three findings the lane fixed, verify the sixteen it
did not, and attack the tree fresh.

## Gates I ran myself

Run as `pnpm --dir <worktree> --filter …` — a bare `cd` does not persist
between this session's Bash calls (`feedback_workflow_cwd_does_not_persist.md`),
and the first attempt at a bare `cd` + `pnpm` silently ran in the **main
checkout** instead. The `--dir` form resolves the worktree correctly
(`tsc` banner prints `.codex/worktrees/agent-agr-w1-designer/apps/designer-portal`).

```
pnpm --filter @patina/designer-portal type-check
  → tsc --noEmit, no output, exit 0

pnpm --filter @patina/designer-portal lint
  → ✖ 205 problems (2 errors, 203 warnings) — EXIT 1, the named gate is RED
    piece-room-save-gate.test.tsx:159   import/first rule not found
    use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks
    Both verified identical on `main` via `git show main:<file>` — pre-existing,
    not this lane's (DR14 stands, informational).

pnpm --filter @patina/designer-portal test        # the merge gate
  → Test Suites: 523 passed, 523 total
    Tests:       6304 passed, 6304 total
    Snapshots:   2 passed, 2 total

pnpm --filter @patina/designer-portal test -- <the six touched areas>
  → Test Suites: 40 passed, 40 total
    Tests:       488 passed, 488 total
    Snapshots:   1 passed, 1 total   ← the flag-off byte-identity snapshot
```

**Flag-off byte-identity, checked independently.** The snapshot's blob at HEAD
is byte-identical to the blob committed in `ba80eee66` — the commit whose
parent is the types-only `bab1b9b92` and which touches nothing but the test and
the snapshot:

```
git show ba80eee66:…/service-agreement-drafting-room.test.tsx.snap | shasum -a 256
  032778484bb8efcf65bf40c80166f41394674dc2b71adce635d7e2870e925292
shasum -a 256 …/service-agreement-drafting-room.test.tsx.snap
  032778484bb8efcf65bf40c80166f41394674dc2b71adce635d7e2870e925292
git log --oneline -- <the snap>  → ba80eee66 only
```

It was generated before the room was edited, never regenerated, and still
passes. The room's own diff is three additions plus one `?? 0`; the
`ServiceAgreementEditor` call is untouched. Criterion J's markup half: **pass**
(with N7 below on how narrow the one scenario is). Criterion J's bundle half is
still not addressed (DR13).

**Cross-lane merge state, re-checked myself** (`git merge-tree --write-tree`):

```
designer × backend  → exit 0, no conflict
designer × client   → CONFLICT packages/types/src/commercial.ts
backend  × client   → CONFLICT packages/types/src/commercial.ts   (same, without this lane)
```

`packages/types/src/commercial.ts` and `agreement.ts` are byte-identical
between the designer and backend worktrees (`diff -q` silent). The only
designer-side residue outside `apps/designer-portal/**` is
`packages/types/src/agreement-copy.ts` plus its export block in `index.ts`.

---

## Round-2 findings — verified state

| # | State | Evidence |
|---|---|---|
| DR1 | **FIXED** | `use-commercial-documents.ts:836` reads `authorizedCents` through `nullableFiniteCents`; `project-authority-band.tsx:76-79` and `:92-95` print `No ceiling`; `money-region.tsx:210-224` drives both seams off `budgetFigure` (`no ceiling · $X authorized`); `money-ladder.ts:90` already answered `nothing approved yet` for null. Three new cases in the two renderers' suites plus `use-commercial-documents-authority.test.tsx`. |
| DR2 | **PARTIALLY FIXED → minor** | The semantic divergence and the designer×backend conflict are gone (merge-tree above). The `§2.2` boundary deviation stands: `packages/types/src/agreement-copy.ts` + one `export *` block. Declared in the notes with a steward option. Needs a ruling, not a rework. |
| DR3 | **FIXED** | `service-agreement-drafting-room.tsx:105-115` keys the composer on `proposalId`; `agreement-composer.tsx:193-206` captures `selectedKey = selected?.partKey` before the round-trip and re-selects by `partKey`. New suite `service-agreement-drafting-room-composer-key.test.tsx` (mount counter) + a composer case where the save returns fresh ids. |
| DR4 | **OPEN** | `readiness.ts:139-148` still gates R-7 on `roles.length > 0`. A `rate_card` part with `roles: []` raises nothing. Sheet R-7: "a `rate_card` part present ⇒ ≥1 role…". |
| DR5 | **OPEN** | `parts-rail.tsx:221` chips `flat`/`per_phase` as `· creates authority` (via `AUTHORITY_VARIANTS`) while `part-editor.tsx:509-512` tells the designer the opposite; `PerPhaseEditor` still carries no record-only sentence. |
| DR6 | **OPEN** | `account-studio-page.tsx:1360` `{agreementDefaults?.cadence ?? '—'}` → `biweekly`; `:1366` → `non_refundable`. `AGREEMENT_CREDIT_RULES` and the three cadence labels sit 130 lines above in the same file. |
| DR7 | **OPEN** | `use-studio-agreement-defaults.ts:141-152` upserts six columns, no `updated_by`. The backend lane's `packages/supabase/src/hooks/use-studio-agreement-defaults.ts:132` **does** send it — the app-local copy is the one the card uses (N2). |
| DR8 | **FIXED** | `ead9c3b12` adds `project-authority-band.test.tsx` (+21) and `money-region.test.tsx` (+28) with null-ceiling cases. |
| DR9 | **OPEN** | `agreement-parts-body.tsx:312` `String.fromCharCode(65 + index)`; the client lane's `attachmentLetter()` (its `:55-57`) falls back to numbers past Z. |
| DR10 | **OPEN** | `agreement-composer.tsx:459` and `:466` key both lists by the message string; two `procurement` parts with `depositPercent: null` push the same note twice (`readiness.ts:176-180`). |
| DR11 | **OPEN** | `agreement-composer.tsx:484` `billingCeilingCents: null`, `:492` `furnishingsDepositPercent: null`; the room's `emptyTerms()` uses `50`. Inert. |
| DR12 | **OPEN, worse** | See N-DOC below. |
| DR13 | **OPEN** | `service-agreement-drafting-room.tsx:24` static `import { AgreementComposer }`. Criterion J's bundle half is not mentioned anywhere in the notes — `grep -n "chunk\|dynamic"` on `designer-notes.md` returns nothing. |
| DR14 | stands | Both lint errors reproduced above and shown identical on `main`. |
| DR15 | **OPEN** | `use-studio-agreement-defaults.ts:115` `if (error) return defaultStudioAgreementDefaults(...)` — no code check, unlike `fetchAgreementParts` (`use-commercial-documents.ts:369-379`). |
| DR16 | **RESOLVED — by the backend, not by this lane** | The backend's current head reads the floor by SHAPE: `_agreement_floor_unmet` (00575:266-295) tests `ap.kind = 'schedule' AND ap.variant = 'rate_card'` / `= 'ceiling'`, with no `part_key` predicate. `readiness.ts:206-217` asks the same question. The two now agree; the spec collision is gone. (Residual nit N9.) |
| DR17 | **OPEN** | `use-commercial-documents.ts:416` `const parts = await fetchAgreementParts(...)` still sits after the `Promise.all` and **before** `if (proposalResult.error) throw` at `:418`. |
| DR18 | **OPEN** | Designer imports `AGREEMENT_PART_COPY`; the client renderer still spells its own literals. `readPhases` (`part-kinds.ts:253`) coerces a null phase amount to `0`, so the designer prints `$0` where the client prints `—`. |
| DR19 | **OPEN, still unrecorded** | `grep -rn "agreement-parts" apps/designer-portal/src` finds `useFeatureFlag` at exactly two sites: `service-agreement-drafting-room.tsx:84` and `account-studio-page.tsx:162`. `commercial-document-body.tsx:47` and `service-agreement-instruments.tsx:131,150,356,367` render and judge a composed agreement with no flag check. Byte-identity still holds for a parts-less document; the carve-out is simply not written down anywhere. |

Score: 3 fixed (DR1, DR3, DR8), 1 fixed by a peer lane (DR16), 1 partially
fixed (DR2), **13 still open**, 1 informational (DR14).

---

## New findings, round 3

### N1 — major · two ceilings pass readiness and are refused by the save

The Add menu offers `Ceiling`, `Retainer`, `Billing cadence`,
`Furnishings deposit` and `Role rates` (`part-kinds.ts:136-141`,
`ADD_PART_OPTIONS` maps every one of `W1_SCHEDULE_VARIANTS`) — on an agreement
that already carries all five from `materialize_standard_parts`. Adding a
second one mints a fresh `custom.<uuid>` key (`part-kinds.ts:165`), so
readiness's only duplicate rule — R-11, on `partKey` (`readiness.ts:93-104`) —
never fires, and `scheduleValueIsSet` is happy. The panel says ready.

`upsert_agreement_parts` then refuses the whole save:

```sql
-- 00575_agreement_parts.sql:2170-2189 (backend lane)
  WHERE ap.kind = 'schedule'
    AND ap.variant IN ('rate_card','ceiling','retainer','cadence','procurement')
  GROUP BY ap.variant HAVING count(*) > 1
  … RAISE EXCEPTION 'an agreement carries only one %', v_duplicate
```

Two clicks from a materialized agreement (`+ Add a part` → `Ceiling`) reach a
save that cannot succeed. The composer surfaces the raw RPC message in
`saveNote` and nothing tells her which of the two parts to remove. Local state
survives (`setParts` only runs on success), so nothing is lost but the attempt.

There is no case for it in `readiness.test.ts` (30 cases) and none in
`agreement-composer.test.tsx`.

The DB rule is a backend addition — the build sheet's §4.4 does not list it and
§6.2 case 7 in fact contemplated a *second* ceiling under a custom key as legal
and inert. So the orchestrator has two ways out: teach readiness the rule (one
`Set()` over the five variants, mirroring R-11's shape), or rule the DB
refusal out. They must not disagree, and today they do.

**Confidence 0.85.**

### N2 — minor · two data layers for the same two tables will land together

The build sheet §2.1 assigns `packages/supabase/src/hooks/use-agreement-parts.ts`
and `…/use-studio-agreement-defaults.ts` to the **backend** lane, and contract
§3 puts the hooks there. The backend built both (`ls` on its worktree; exported
from `hooks/index.ts:565-581` and `:1614-1627`). The designer lane
independently built `apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts`
and put the parts read/write in `use-commercial-documents.ts` (that half is
§2.2-sanctioned).

After merge the tree carries two implementations of the studio-defaults
read/write. The query keys happen to coincide (`['studio-agreement-defaults', studioId]`
both sides; `['agreement-parts', proposalId]` both sides), so caches do not
tear — but the shared-package pair is dead code that nothing imports, and the
copy the Account card actually uses is the weaker of the two: it omits
`updated_by` (DR7) and fails soft on **every** error rather than a missing
relation (DR15), both of which the `packages/supabase` version gets right.

Steward call: point the card at the shared hook and delete the app-local one,
or delete the shared pair. **Confidence 0.9.**

### N3 — minor · the flag-off room can still overwrite a composed draft's money row

`agreement-parts` is a PostHog flag, so two members of the same studio can be
on opposite sides of it. Member A composes (parts written, `proposal_service_terms`
projected from them). Member B, flag-off, opens the same draft: the room renders
the seven facets from the projected terms row, and a Save there calls
`upsert_design_services_draft`, which (backend `00575:1961-2020`) rewrites the
terms row and leaves `proposal_agreement_parts` untouched. The client's copy is
rendered from the **parts**; the executed authority is snapshotted from **terms**.
Nothing in the designer lane, and nothing in the RPC, refuses this.

Mitigations that make it awkward rather than silent: the legacy RPC still
refuses an empty rates array, so B must type a role first, and the flag-off
readiness demands a ceiling. But it is reachable and unrecorded, and the
program rule ("flag-off byte-identical") is exactly what forbids the obvious
guard. Wants a ruling. **Confidence 0.6.**

### N4 — nit · `UnsupportedPartCard` prints the stored value, not the word

`part-editor.tsx:596-600` renders `{part.kind}{part.variant ? ` · ${part.variant}` : ""}`
— a designer opening a `per_phase`, `percent_of_cost` or `cost_plus` part reads
the snake_case stored value. `partKindLabel()` (`part-kinds.ts:65-73`) already
maps all fifteen variants to prose and is used by the rail two files away. The
sheet's §4.2 does say "its kind/variant as a mono chip", so this is arguably
sanctioned; R7's "never a database column name" and DR6's precedent say the
prose label is the right chip. **Confidence 0.85.**

### N5 — nit · a module comment states a money-safety property that is no longer true

`part-editor.tsx:14-16`: *"the server's projection is keyed on `part_key`
anyway, so a custom schedule part cannot rewrite the terms row either."* The
backend's projection reads the five money figures by **shape**
(`00575:2225-2265`, `AND ap.kind = 'schedule' AND ap.variant = 'ceiling'` etc.,
no key predicate) — a custom-keyed ceiling **does** write `billing_ceiling_cents`.
That is the backend's deliberate choice (its own comment explains it), and it is
the behaviour the composer needs, since every part it adds gets a custom key.
The comment is the thing that is wrong, and it is the comment a future reader
will trust when reasoning about R5. `readiness.ts` reads by shape and is
correct. **Confidence 0.9.**

### N6 — nit · the designer's preview changes the cadence wording under the flag

Flag-off: `cadenceLabel[preview.billingCadence]` → `Every two weeks` /
`At named milestones` (`service-agreement-preview.tsx:15-19`). Composed:
`agreementCadenceText(cadence)` → the stored word with `_` opened up, printed
under `capitalize` → `Biweekly` / `Milestone`
(`agreement-parts-body.tsx:176-186`, `agreement-copy.ts:44-46`). The composed
wording matches today's **client** shell (`commercial-document-shell.tsx:247`)
and §4.5 asks for "capitalized cadence", so this is per spec — but the same
document reads two ways on the same designer's screen depending on a flag, and
the composed one is the stored token. **Confidence 0.8.**

### N7 — nit · the byte-identity snapshot covers one scenario

`service-agreement-drafting-room.test.tsx:154-176` renders exactly one
proposal: no `client_id`, no `client`, a discovery description, and whatever
`useCommercialDocument` is mocked to return for a new agreement. A populated
terms row, a non-draft state, an attached client, and a signature block are all
outside the pinned tree. The claim the program makes is "byte-identical to
today"; the evidence is "byte-identical for a fresh empty draft".
**Confidence 0.9.**

### N8 — nit · the e2e spec has never been executed

`designer-notes.md` records `npx playwright test --list` only, and no
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` walk — reasonably, since 00575 is
not on the shared stack. The §7 designer gate list includes
`test:e2e -- … --project=chromium`, so the lane's gate set is not complete and
the integration steward inherits it. The config deviation itself
(`playwright.agreement.config.ts` deriving from the base config instead of
editing it, and `*.agreement.pw.ts` instead of `*.spec.ts`) is well argued in
the file's header — the secret-scan trap is real — and I would accept it.
**Confidence 0.95.**

### N9 — nit · readiness accepts a ceiling the DB floor would reject

`readCents` (`part-kinds.ts:179-183`) accepts `"2400000"`; the DB floor insists
`jsonb_typeof(ap.payload->'cents') = 'number'` (`00575:288`). Nothing in the
composer writes a string (`toCents` returns a number), so this only bites a
payload authored outside the UI. **Confidence 0.7.**

### N-DOC (DR12 restated, and larger) — minor · the lane notes now contradict themselves

Three statements in `designer-notes.md` are false at HEAD, and the round-2
addendum appended below them says the opposite without correcting them:

- `:7` "the T0 types commit `bab1b9b92` … was already cherry-picked onto the
  branch when the lane opened" — `git rev-parse bab1b9b92^` is `4c0b7b17b`, the
  base; the commit is this lane's own authorship, and the backend carries a
  separate one. (Harmless — the contents are byte-identical, which is why the
  merge is clean — but it is not what happened.)
- `:168-171` "This lane changed no `packages/**` file … no further `packages/**`
  edit was made, so no rebuild was needed" — `96634b560` edits
  `packages/types/src/commercial.ts`, and `packages/types/dist/commercial.d.ts`
  is timestamped `20:08`, after it.
- `:206` "Nothing under `packages/**`, `supabase/**` or `apps/client-portal/**`
  was touched by this lane" — four `packages/types` files are in
  `git diff main...HEAD --name-only`.

Also: the "Files this lane changed" list omits all four `packages/types` files
and every file added in round 2 (`money-region.test.tsx`,
`project-authority-band.test.tsx`, `use-commercial-documents-authority.test.tsx`,
`service-agreement-drafting-room-composer-key.test.tsx`), and names
`e2e/agreement/agreement-parts.spec.ts` where the file is
`agreement-parts.agreement.pw.ts`. The Billing-untouched figure reads 448
insertions; `git diff main...HEAD --numstat` says **460 / 0** (still insert-only,
so the claim holds — the number does not).

And the framing: the round-2 section opens *"Three findings, all major … All
three are fixed; nothing was deferred."* Round 2 reported **nineteen**
findings. Sixteen were deferred; the "Still open after round 2" list names four
of them. A steward reading the lane log — which is the artefact that outlives
this review — would conclude the lane has one open item. It has thirteen.
**Confidence 0.95.**

---

## What I attacked and found clean

- **Criterion S · DTO collapse.** `commercial-documents.ts` re-exports the
  vocabulary and aliases `ServiceAgreementTerms = DesignServiceTerms` /
  `ServiceRate = DesignServiceRate`; no second declaration survives. Both pinned
  cases exist (`asCommercialDocumentKind('trade_scope') === 'trade_scope'`,
  `commercialDocumentExperience('trade_scope') === 'legacy'`).
- **Criterion U · wave leakage.** `git diff main...HEAD | grep -iE
  "save_agreement_part|save_agreement_as_template|materialize_agreement_template|studio_agreement_parts|agreement_templates|compose_agreement_consent|agreement_execution_snapshots|Save as template"`
  hits only tests, comments and the review docs. The add menu offers blank
  kinds only.
- **Criterion V · vocabulary.** No "clause library", no "contract builder", no
  "facet" in composer copy, no emoji (`grep -P` over added lines in
  `apps/designer-portal` returns nothing), no badge, no count chip, no
  red/green, no checkmark-as-status. The required marker is a middot in
  `--color-clay-ink`; a blocked row reads `needs attention`.
- **Criterion T · unknown kinds.** `hasEditor` → `UnsupportedPartCard`;
  `renderPartBody`'s `default` → `RecordedLine`; `readItems`/`readRoles`/
  `readPhases` all `flatMap` past malformed rows. Three tests, none throws, no
  raw JSON (only the raw kind/variant chip, N4).
- **P0 "Not yet set" on a sendable document.** On the composed path the whole
  seven-section block is replaced; a kept-but-empty ceiling renders
  `AGREEMENT_PART_COPY.ceilingUncapped`. The italic branch survives only for
  flag-off, which is what §4.4 asks for.
- **The Account card.** `git diff --numstat` on `account-studio-page.tsx` is
  **460 insertions, 0 deletions** — Billing is untouched, byte for byte. The
  card sits between the Billing block and Members, is gated on
  `agreementPartsOn`, copies Billing's seed / dirty / re-seed-from-persisted
  mechanics, carries the R7 help sentence and the credit-rule "Stored now…"
  note, and shows a read-only `<dl>` to a non-manager (whose content is DR6).
- **The rail.** `readOnly` hides the row menu and `AddPartMenu`; Remove is
  offered on a `required` part (R4), and readiness is what refuses.
- **`fetchAgreementParts`** fails soft on `42P01` / `PGRST205` only and throws
  otherwise — the right shape, and the reason given (an empty rail over a
  stored composition would be overwritten wholesale by the next Save) is the
  correct one.
- **Pathspec hygiene.** Every commit is explicit; the only non-`apps/designer-portal`
  paths are the four `packages/types` files (DR2) and the three program docs.

---

## Verdict

**fix.** One major (N1 — a two-click path from a materialized agreement to a
save the server cannot accept, with readiness green and no test), plus a
thirteen-finding backlog carried unfixed from round 2 that the lane log
describes as one open item (N-DOC). No blocker: the flag-off byte-identity
holds on the evidence the program asked for, type-check and the full 6304-test
suite are green, the named lint gate's two errors are `main`'s, nothing outside
the lane's pathspec moved except the one declared `packages/types` deviation,
and no refusal reaches a designer- or homeowner-facing string.
