# Wave 1 · carry-fix lane — notes

**The Agreement, Composed** · Wave 1 (*loosen the room*) · 2026-09-06
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`)
Branch `agreement/w1-integration`, from `51edd76c71445a18d6decd23c2d4f080c9a8ef39`.

This lane closes the orchestrator-ruled carry items directly on the integration
branch, in place, and re-runs every gate. It is the integration steward's
successor and owns the shared local stack for the duration.

---

## 1 · What was already closed, and how that was established

R17, R18, R19 and the readiness half of R21 were **already delivered** by the
lanes after their round-3 reviews and merged into this branch. This lane
verified each rather than re-implementing it:

| Ruling | State on arrival | Evidence |
|---|---|---|
| **R17** — one source of truth | **closed** | `00575` carries all three walls: `guard_agreement_projection_write` (a BEFORE INSERT/UPDATE/DELETE trigger on both projection tables keyed on the transaction-local GUC `app.agreement_projection`), the typed `agreement_composed` refusal in `upsert_design_services_draft`, and INSERT/UPDATE/DELETE withdrawn from `authenticated` **and** `anon`. `agreement_parts_test.sql` case 25 reproduces reviewer probes **P16** (the flag-off door over a composed draft) and **P3b** (a hand on the money row as the table owner) and asserts both refuse with the same sentence and the same `agreement_composed` DETAIL — plus the GUC-names-another-proposal probe and the grant assertions. |
| **R18** — one part per money variant | **closed** | `add-part-menu.tsx` renders only the options the rail filtered against the composition; `readiness.ts:110-116` adds one blocker per duplicated money shape (`duplicateMoneyVariants`); `00575` refuses `an agreement carries only one %` at the save. Save cannot reach 23514 from the room. |
| **R19** — standard parts keep their keys | **closed** | `createBlankPart` mints `custom.<uuid>` only for parts the designer ADDS; `materialize_standard_parts` seeds the nine `patina.*` keys and the composer never re-keys them. The prose projection reads `patina.services` / `patina.terms` / `patina.deliverables` / `patina.exclusions` by key **and** asserts the kind, so a `custom.<uuid>` clause never projects. `agreement_parts_projection_test.sql` cases 1-4 are the rail-composed-vs-seven-facet parity assertion. |
| **R21** — "Not yet set" survives composition | **half closed** | The homeowner's own renderer and readiness were done (`isWritten`, empty clause/list parts render nothing, the R4 floor reads client-visible money parts). The **designer's live preview** was not — see §2. |

## 2 · What this lane changed

### R21 · the designer's preview printed `$0` where the homeowner's page prints "Not yet set"

`materialize_standard_parts` seeds `patina.ceiling` from `billing_ceiling_cents`
and `patina.retainer` from `retainer_amount_cents` (NOT NULL DEFAULT 0), so the
first composed agreement carries `{ cents: 0 }` in both. The client's
`isWritten` excludes zero; the designer's `readCents` returned `0` and took the
money arm — and under the retainer it also printed the activation sentence,
promising something about a retainer that does not exist.

Ceiling, retainer and flat now print the seven-facet room's own "Not yet set"
treatment (`font-heading text-[1.05rem] italic text-[var(--text-muted)]`, the
same treatment `service-agreement-preview.tsx:165-173` uses today), and a
zero-percent deposit draws no term at all. An **absent** ceiling still says what
an absent ceiling means (F-2) — that is a stated uncapped agreement, not an
unwritten figure. The sentence moved into `AGREEMENT_PART_COPY.notYetSet` so
neither surface can drift by retyping it.

Five new cases in `agreement-parts-body.test.tsx`.

### R20 · the paperwork

`build-sheet.md` §3.7 step 6 and §6.2 cases 6-7 still instructed projection "by
`part_key`, not by variant". Both are amended in place, each carrying the
sentence it replaced and the reason it was superseded, and the projection
test's file header now cites the ruling. R5's half of the original instruction
is preserved by the **shape** requirement (a clause keyed `patina.ceiling` is
prose however many cents it names); its "never silently choose" half by the
single-instance refusal, which §3.7 now declares.

### Backend minors (00575 edited in place — unapplied on Strata)

- **B-7** `materialize_standard_parts` widens `'legacy'` → `'design_services'`
  the way `upsert_agreement_parts` does. Seeding is what makes a document
  composed, and the client bundle takes the retired early-return for a legacy
  kind — so nine parts were hashed into the fingerprint she signs against and
  visible on no page she reads. `commercial_state` is deliberately untouched.
- **B-8** the bundle's `parts` key is present on every document, `[]` when
  there are none (contract §2.4), the retired early-return included.
- **B-9** a rate carries `effectiveAt` through the parts door.
  `classify_project_time_entry_authority` filters authority rates on
  `effective_at <= started_at`, and `v_rates` built only
  version/roleName/hourlyRateCents/sortOrder — so a rate written for January
  stopped applying to January's hours the first time the room was opened and
  saved. Three halves: `materialize` seeds the date beside the rate, `v_rates`
  reads it back, and the designer's `readRoles` carries it through the editor.
  `RateCardPayload` gained `effectiveAt?: string | null`.
- **B11 / N6 / R5 (m6)** the last three raw casts. Whether a part is
  `required`, whether the client sees it, the part it was copied from, the rate
  card's order, and the date a rate takes effect are each asked and worded
  before the rows land — a designer never reads `invalid input syntax for type
  boolean` as her save note. Cases (i)-(l) extend the R7 refusal sweep, and the
  sweep's identifier assertion covers them.
- **R3-5** the furnishings deposit is seeded only from a percent somebody set —
  this document's own, or the studio's default. The literal `50` was the
  separate furnishings authorization's fallback, a house constant nobody typed,
  and seeded `client_visible` it printed "50% deposit" on the page the
  homeowner signs, three paragraphs above the sentence saying furnishings need
  their own named authorization.

### Designer minors

- **DR5** the rail chipped `flat` and `per_phase` `· creates authority` while
  `FlatEditor` told the designer the opposite on the same screen.
  `AUTHORITY_VARIANTS` (@patina/types) is R9's **Wave-2** list and is left
  alone; the rail's `createsAuthority` now reads the variants that create
  authority in THIS build, and `PerPhaseEditor` carries FlatEditor's sentence.
- **DR13** `service-agreement-drafting-room.tsx` statically imported
  `AgreementComposer`, pulling `parts-rail`, `part-editor`, `add-part-menu`,
  `readiness` and `@dnd-kit` into the chunk every designer downloads — almost
  none of whom the fail-closed flag reaches. It loads through `next/dynamic`
  now, behind the flag branch, with the room's own gate sentence as its loading
  frame. Flag-off markup is unchanged (the committed snapshot pins it).
- **DR21 / DR7 / M2** one studio-defaults data layer. The
  `@patina/supabase` hooks are the survivor; the app-local
  `apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts` is deleted
  and the Agreement defaults card reads and writes through the package hooks in
  their camelCase contract, passing `updatedBy`. The column is NULL with no
  default and no trigger (00575:1946), so every save until now left "who last
  changed the studio's defaults" permanently unanswerable. The query key is
  unchanged, so the cache is the same cache. The package hook's doc comment
  claimed a plain member's write "reaches no rows rather than erroring"; both
  shapes throw, and it now says so.

## 3 · What this lane did NOT do

- Did not touch the **client** portal. R3-5 is fixed at the seed, in `00575`,
  which is where the reviewer's ruling put it ("seed the part only when a
  percent was actually set"); the client's renderer already withheld a zero.
- Did not act on the advisories the wave report carries in §7 that are outside
  the ruled item list: backend **M1-new** (the DB floor asks only the ceiling
  question), **M3** (`discard_agreement_parts` has no product caller), client
  **F-1/F-2** (`composed` has no producer), **F-4** (the vacuous §6.6 e2e
  assertion), **m-new** (an Addendum drops the composition), **m3**, **m5**,
  **n1-n16**. They stand.
- Did not push. Did not run `supabase db push`, `supabase functions deploy`, or
  `wrangler`. Did not contact Strata.
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
- Did not create or remove a worktree.
- Did not run the designer-portal agreement e2e
  (`playwright.agreement.config.ts`) or the client e2e — the gate list for this
  lane names the SQL suites, the type gates, the unit suites and the admin
  build, and the last integration round already ran the client e2e on this
  tree's code.

## 4 · One hygiene miss, disclosed

The deletion of `apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts`
was staged (`git rm`) before the first commit of the session and therefore rode
in `2e87edc33` ("the retired door, the date on a rate, and a deposit nobody
set") rather than in `5a8ed7e07` ("one studio-defaults data layer"), where its
message belongs. Nothing unintended was swept in — the deletion is this lane's
own, ruled work — but the attribution is one commit early. History was not
rewritten to fix it because `git rebase -i` is unavailable in this environment
and the tree is correct as it stands.

## 5 · Gates

See `wave-report.md` §9 ("Carry fixes") for the full table with counts.
