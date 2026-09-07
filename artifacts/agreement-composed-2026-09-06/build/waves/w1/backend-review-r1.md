# Wave 1 · lane `backend` — adversarial review (re-review after the R17–R21 rulings)

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w1-backend`,
17 commits ahead of `main`, 20 files, +7803 / −15.

> **Note on this file.** The lane already carries `backend-review-r1.md`,
> `-r2.md` and `-r3.md` from three earlier rounds; this dispatch was labelled
> "round 1" and named this path, so this file is rewritten. The three earlier
> reviews remain in git history (`42fdaa35a`, `469d1814d`, `b04a686ef`) and
> the r2/r3 files are untouched on disk. Nothing below is copied from them —
> every claim is from a run on a scratch database in this session.

---

## Verdict

**block.** One blocker and three majors.

The blocker is not new code — it is the orchestrator's own **R17**
("One source of truth per document"), ruled after round 3 and binding on this
wave, which this branch does not implement in any of its three prescribed
forms. The lane's last commit is round 3's review; no fix commit follows it.

The first major is new and was not found by any earlier round: the R4 floor
asks `jsonb_typeof(...) = 'number'` before it counts a figure, and the
projection casts without asking, so **a rate card whose `hourlyRateCents`
arrives as a JSON string bills at $225/hr against a NULL ceiling and sends** —
the exact state R4 exists to refuse.

Everything the earlier rounds fixed is genuinely fixed: F-1 holds across all
11 seeded proposals, the fingerprint covers all ten columns and no timestamp,
the guard freezes parts at send, RLS admits co-members only, the parts table's
write grant is withheld, the projection is not forked, the pinned hash moved
exactly one hex string, the generated seed and the generated types both
regenerate byte-identically, and both package gates are green.

---

## Gates run (all in this session)

Shared local stack read-only. **It now reads head `00575`** — the integration
steward has already reset it with this migration applied, so the earlier
rounds' "restore artifact" caveat is partly retired: these suites now run
against a stack that was actually reset with 00575 in the ledger.

Scratch DB `patina_w1r`: `pg_dump --no-owner -Fc --exclude-schema=cron` of the
shared stack → `pg_restore` (env.md's plain `pg_dump | psql` form is still
unusable on the local pg 18 client). Control DB `patina_w1ctl`: same dump with
`_countersign_design_services_agreement_impl` reverted to its `00566:304-874`
body. Both dropped at the end; `pg_database` shows no `patina_*` left.

```
shared stack head                                      00575  (read only; never reset, never written)
psql -v ON_ERROR_STOP=1 -f 00575_agreement_parts.sql   APPLY  rc=0   (0 ERROR lines)
   re-applied a second time on the same DB             APPLY2 rc=0   (idempotent — criterion Q)

commercial/agreement_parts_test.sql                    rc=0  15 PASS notices  (134 ASSERTs)
commercial/agreement_parts_projection_test.sql         rc=0   5 PASS notices  ( 29 ASSERTs)
commercial/design_services_paper_issue_test.sql        rc=0  13 PASS
commercial/multi_studio_signature_test.sql             rc=0   7 PASS
commercial/direct_order_attribution_test.sql           rc=0
commercial/fulfillment_intake_ledger_balance_test.sql  rc=0
schedule/ceremony_hardening_test.sql                   rc=0  15 PASS
edge_api/public_sd_hardening_contract_test.sql         rc=0
edge_api/public_rpc_authorization_contract_test.sql    rc=0

supabase gen types --db-url <shared stack>             diff vs committed file = 0 lines
python3 scripts/generate-legacy-grants.py              regenerates byte-identically (no git drift)
pnpm --filter @patina/types    type-check              clean
pnpm --filter @patina/supabase type-check              clean
pnpm --filter @patina/supabase test                    87 files, 1060 passed | 12 skipped
```

Six suites are red, and **every one is red for a reason older than this
wave**. On the control DB — same dump, `_countersign_design_services_agreement_impl`
put back to its 00566 body — each fails at the identical line with the
identical message:

```
authorized_schedule_test           :308  design services agreement d73…001 not found or access denied
design_services_authority_test     :177  design services agreement d53…001 not found or access denied
design_services_gap_hardening_test :128  proposal d63…001 failed canonical project provenance
executed_on_paper_test             :214  design services agreement ea3…001 not found or access denied
trade_rfq_test                     :154  design services agreement d93…001 not found or access denied
trade_scope_test                   :196  design services agreement d83…001 not found or access denied
```

All six are in `supabase/tests/KNOWN_FAILURES.md` Group 3, recorded there as
dying later (at the `designDisposition` readiness gate); the earlier death
point is 00563/00566 drift, not 00575. The countersign graft is exonerated by
the control.

---

## Criteria that pass, with the evidence

| # | Criterion | Evidence from this session |
|---|---|---|
| **A** | F-1 fingerprint identity | The 00423 fingerprint body was installed side-by-side as `public._fp_pre00575`. `count(*) filter (where _commercial_document_fingerprint(id) is not distinct from _fp_pre00575(id))` → **11 of 11**. A parts-less document hashes exactly what it hashed before 00575. |
| **B** | Fingerprint coverage | One column at a time on a materialized part: `position=t kind=t variant=t part_key=t title=t payload=t required=t client_visible=t source_template_key=t source_part_id=t` — and `created_at`/`updated_at` moved together → `f`. 10/10 and blind to timestamps. |
| **C** | Client-visibility | `client_visible` moves the digest (above); the bundle omits the row — P7b: nine parts, one hidden, bundle returns **8**. |
| **D** | Guard freezes at send | After `send_commercial_document`: direct `UPDATE`, `DELETE` and `INSERT` all `23514 proposal_agreement_parts is immutable after its proposal leaves draft`; `upsert_agreement_parts` itself `42501`. |
| **F** | RLS to a non-member | Outsider `SELECT` → 0 rows; outsider `upsert_agreement_parts` and `materialize_standard_parts` → `42501`. Client `SELECT` on the raw table → 0 rows. |
| **G** | RLS on studio defaults | Plain member `INSERT` → `42501 new row violates row-level security policy`; plain member `UPDATE` → 0 rows; plain member `SELECT` → 1 row; outsider `SELECT` → 0 rows; owner `INSERT` accepted. R3 exactly. |
| **H** | Projection not forked | `_project_agreement_terms` diffed line-by-line against `00422:1749-1793`: the only deltas are the opt-in `p_allow_null_ceiling` CASE around the ceiling read and `COALESCE(p_rates,'[]')`. `upsert_design_services_draft` diffed against `00422:1707-1812`: the only delta is the block → `PERFORM public._project_agreement_terms(…, false)`. |
| **M** | Readiness false-red | A flat-fee agreement (services + `flat` + terms, no rate card, no ceiling) saves with `billing_ceiling_cents IS NULL`, 0 rate rows, and **sends**. |
| **O** | Pinned-hash honesty | `git diff` on `public_sd_hardening_contract_test.sql`: exactly one hex string moved (`430d3a…` → `899573…`) plus a lineage comment. `arguments`, `result_type`, `proconfig`, `security_definer` untouched; `sign_design_services_agreement_with_trusted_ip`'s entry not touched. The file passes rc=0 against the applied DB. |
| **R** | Grants / definer hygiene | `pg_proc`: every new and every redefined function pins `search_path` (`public, pg_temp`, or `public, extensions, pg_temp` for the fingerprint, or `pg_catalog, public, pg_temp` for countersign — its 00566 value); `guard_commercial_authored_child` is the only `SECURITY INVOKER`; ACLs are `postgres=X` plus `authenticated=X` on exactly the five public doors. No bare extension function anywhere in the file. `information_schema.role_table_grants` for `proposal_agreement_parts`: `authenticated SELECT` and nothing else. |
| **Q** | Idempotency | Applied twice on the same DB, rc=0 both times, only "already exists, skipping" notices. |
| **T** | Unknown kind | `kind='wormhole' variant='quantum'` saves and moves the digest (covered inside criterion B's loop). |
| **U** | Wave leakage | The only W2/W3 identifier in the whole diff is the `source_part_id` comment §3.9 requires. |
| **V** | Vocabulary | No "clause library", no "contract builder", no "AI" anywhere in `supabase/**` or `packages/**`. The five new refusal sentences read in the designer's words ("an agreement carries only one ceiling", "an agreement that bills time needs a ceiling"). |
| — | Contract §2.4 types | `packages/types/src/agreement.ts` matches the frozen text: 6 kinds, **15** schedule variants, 4 template classes, 6 authority variants, **9** standard parts, every payload interface present. |
| — | Scope | 20 files, all on §2.1's list except `design_services_paper_issue_test.sql` (documented, necessary — the sheet reworded the two strings it pins). No `apps/**`. Conventional Commits, explicit pathspecs, no trailers, no `merge(...)` subject, not pushed. |

---

## R1 · **blocker** · R17 is not implemented, and the divergence it forbids executes

`rulings-2026-09-06.md` R17 (ruled after round 3, binding on this wave)
prescribes three mechanisms, "belt and braces":

- (a) a BEFORE INSERT/UPDATE/DELETE trigger on `proposal_service_terms` and
  `proposal_service_rates` refusing when the proposal has parts unless
  `app.agreement_projection` is set;
- (b) `upsert_design_services_draft` raising a typed refusal
  `agreement_composed` when parts exist;
- (c) `REVOKE INSERT, UPDATE, DELETE ON proposal_service_terms,
  proposal_service_rates FROM authenticated` if no client code writes them
  directly.

None is present. `grep -n 'agreement_projection\|agreement_composed'
supabase/migrations/00575_agreement_parts.sql` → no match. On the applied DB,
`information_schema.role_table_grants` still shows `authenticated` holding
`INSERT, UPDATE, DELETE` on both tables. R17's required SQL test ("reviewer
probe P16 and P3b must now refuse") does not exist in either new suite.

The divergence is reachable and I walked it to execution.

```
P14  flag-on member composes:  ceiling 2,400,000 · cadence biweekly · Lead Designer @ 22500
     flag-off co-member saves the seven-facet room over the same draft
        → upsert_design_services_draft ACCEPTED (no agreement_composed refusal)
        → the 5 parts are untouched
     send → SENT · client signs · studio countersigns → EXECUTED

     the page the client signed says   ceiling=2400000  cadence=biweekly  rate=22500
     the authority the studio bills    ceiling=500000   cadence=monthly   rate=9900
```

Two parties bound to different numbers, and the fingerprint cannot catch it —
it hashes both halves, so the contradictory pair is precisely what the
signature attests to.

The second road needs no second member:

```
P2   compose ceiling 2,400,000 + a rate card; then, as any co-member,
     UPDATE proposal_service_terms SET billing_ceiling_cents = NULL   → ACCEPTED
     _agreement_floor_unmet = false   (it reads the parts, which still say 2,400,000)
     send → SENT  with the money row uncapped and the signed page capped
```

And a third, which the current refusals *do* catch, showing the wall is only
half-built: `DELETE FROM proposal_service_rates` on a composed draft is
accepted, and the send then refuses (P13) — because the send refusal happens
to read the rate rows. Nothing reads the ceiling, the cadence, the retainer or
the deposit that way.

Before 00575 this class of state was unreachable: the column was `NOT NULL`
and the terms row was the only source. 00575 creates a second source of truth
for the same five figures and guards one of them.

**Fix:** implement R17 (a)+(b)+(c) as ruled, and add the SQL test R17 names —
one case per road: the flag-off RPC over a composed draft, and a direct
`UPDATE` of the money row on a composed draft. Both must refuse.

---

## R2 · **major** · The R4 floor is type-strict; the projection is not — an uncapped hourly agreement sends

`_agreement_floor_unmet` asks `jsonb_typeof(e.role->'hourlyRateCents') =
'number'` before it counts a role as "bills time" (migration `:282`), and
`jsonb_typeof(ap.payload->'cents') = 'number'` before it counts a ceiling
(`:290`). The projection immediately below asks nothing — it casts
`(e.rate->>'hourlyRateCents')::integer` (`:2298`) and
`(ap.payload->>'cents')::integer` (`:2266`), and `->>` renders a JSON string
just as happily as a JSON number.

The two halves therefore disagree about the same payload, in **both**
directions:

```
P17  rate card with "hourlyRateCents": "22500"   (a JSON string), no ceiling part
       upsert_agreement_parts            ACCEPTED
       _agreement_floor_unmet            false          ← the floor does not see a rate
       proposal_service_rates            22500          ← the projection does
       proposal_service_terms.ceiling    <NULL>         ← uncapped
       send_commercial_document          SENT

P18  ceiling with "cents": "2400000"     (a JSON string), beside a numeric rate card
       upsert_agreement_parts            23514 / an agreement that bills time needs a ceiling
                                                        ← the floor does not see a cap the
                                                          projection would have written
```

P17 is the state R4 exists to refuse — an agreement that bills real hours
against no cap, sent to a homeowner — and it passes every one of the four
doors, because all four ask the same type-strict predicate. P18 is the mirror:
a legitimate composition refused with a sentence about a ceiling the designer
did in fact state.

`upsert_agreement_parts` is `GRANT EXECUTE … TO authenticated`, so the payload
shape is whatever the caller sends; the build sheet's own criterion L says the
floor "is the real gate" precisely for callers that bypass the room.

**Fix:** make the two halves read the same way. Either coerce in one place
(`(x #>> '{}')::numeric` guarded by `jsonb_typeof IN ('number','string')`), or
refuse a non-numeric money payload in `upsert_agreement_parts` with a
designer-worded sentence before anything projects. Add both probes as cases.

---

## R3 · **major** · Six raw database identifiers reach the studio through the save door

`upsert_agreement_parts` lets the storage layer's own errors out. Every one of
these came back from the RPC as `SQLERRM` on the applied DB:

```
P8  second ceiling            23514  an agreement carries only one ceiling            ← good
P8  duplicate partKey         23505  duplicate key value violates unique constraint "uniq_agreement_part_key"
P8  blank role name           23514  … violates check constraint "proposal_service_rates_role_name_check"
P8  role with no rate         23502  null value in column "hourly_rate_cents" of relation "proposal_service_rates"
P8  cadence "per_draw"        23514  … violates check constraint "proposal_service_terms_billing_cadence_check"
P8  negative ceiling          23514  … violates check constraint "proposal_service_terms_billing_ceiling_cents_check"
P8  deposit 150%              23514  … violates check constraint "proposal_service_terms_furnishings_deposit_check"
```

R7 is binding on "every string a designer reads", and the designer lane
surfaces the RPC's error text verbatim as the composer's `saveNote`
(`agreement-composer.tsx:210-216`). Six of the seven rows above put a table
name, a column name or a constraint name on a designer's screen. The lane
already knows the right shape — the first row is the sentence it wrote by hand
for the duplicate-money case; the rest were left to Postgres.

Note `cadence: "per_draw"` is *type-legal* today: contract §2.4's
`CadencePayload` admits `'per_draw'`, and the DB CHECK does not widen for it
until W3. A part whose payload the shared types call valid raises a raw
constraint name.

**Fix:** validate the five money payloads and the part keys inside
`upsert_agreement_parts` and refuse in the designer's words — the way the
duplicate refusal already does — rather than letting the constraint speak.

---

## R4 · **major** · The `@patina/supabase` hooks this lane shipped are dead code; the portal wrote its own

`packages/supabase/src/hooks/use-agreement-parts.ts` (189 lines) and
`use-studio-agreement-defaults.ts` (147 lines), plus 475 lines of tests, are on
this lane's §2.1 pathspec, are correctly written, and are exported from the
barrel. **Nothing imports them.** Grep across both portal worktrees:

```
.../agent-agr-w1-designer/apps/designer-portal/src/hooks/use-commercial-documents.ts:561
    export function useSaveAgreementParts(proposalId: string)
.../agent-agr-w1-designer/apps/designer-portal/src/hooks/use-commercial-documents.ts:584
    export function useMaterializeStandardParts(proposalId: string)
.../agent-agr-w1-designer/apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts:103
    export function useStudioAgreementDefaults(...)
```

Two implementations of one data path, already diverging: the app-local
`useSaveAgreementParts` takes `proposalId` at hook construction, and the
package one takes it per call and returns the RPC's object. `CLAUDE.md`'s rule
is `@patina/supabase` hooks for Supabase data. This is an integration
decision, not a backend bug — but it must be made before merge, or the repo
ships 336 lines of unreachable code plus a second contract for the same RPC.

**Fix (orchestrator):** delete one set at integration and point the composer
at the survivor.

---

## R5 · minor · The bundle's `parts` key is *not* "always present"

Contract §2.4 freezes `parts` as "a new top-level key, **always present**, `[]`
when the document has none", and the migration's own comment at `:2643` repeats
it ("the key is present and `[]` on every document, so the client adapter never
branches on absence"). The `'legacy'` early-return does not carry it:

```
P7  legacy document → bundle keys = [document]   has_parts = false
```

The client lane's adapter must therefore branch on absence after all, or read
`undefined` where the frozen interface promised an array.

**Fix:** add `'parts', '[]'::jsonb` to the legacy early-return, or amend §2.4.

---

## R6 · minor · `materialize_standard_parts` seeds a `legacy` document without widening its kind

```
P6  legacy draft → materialize_standard_parts: materialized=true partCount=9
                   proposals.document_kind AFTER = legacy
```

`upsert_agreement_parts` performs the `legacy → design_services` widen
(`:2143-2146`); `materialize_standard_parts` does not. The result is a document
that carries nine parts, hashes them into its fingerprint, and still routes
through every `document_kind = 'legacy'` branch — including the bundle's early
return (R5 above), which hides those parts from the client entirely.

**Fix:** either widen in `materialize_standard_parts` too, or refuse to seed a
document whose kind is not in `('legacy'…)` — but do one of them.

---

## R7 · minor · `useUpdateStudioAgreementDefaults`'s doc comment states the opposite of the DB

`use-studio-agreement-defaults.ts:104-107`: *"a plain member's write reaches no
rows rather than erroring, so the caller checks the returned row."* The
mutation is an `.upsert(...).select().single()`. Probed:

```
P12  plain member INSERT → 42501 new row violates row-level security policy for
                                 table "studio_agreement_defaults"
P12  plain member UPDATE → 0 rows
```

For a studio with no defaults row yet — the common first-write case — the hook
throws. A caller written to the comment will not catch it.

**Fix:** correct the comment (and say which of the two shapes the caller must
handle).

---

## R8 · minor · The parts door re-stamps `effective_at`

`v_rates` (`:2294-2300`) carries `roleName` / `hourlyRateCents` / `sortOrder`
only, so `_project_agreement_terms` falls to
`COALESCE((v_rate->>'effectiveAt')::timestamptz, now())` and every parts save
stamps `now()`. `classify_project_time_entry_authority` selects authority rates
with `effective_at <= NEW.started_at` (`:1728`, `:1746`, `:1769`, `:1779`,
`:1792`, `:1799`). Parts freeze at send, so a composed agreement cannot be
re-stamped after execution and the practical exposure is small — but a document
that carried a back-dated rate through the seven-facet room loses that
back-date the first time it is composed, silently.

---

## R9 · nit · `SET CONSTRAINTS uniq_agreement_part_position DEFERRED` is a no-op

`pg_constraint` on the applied DB: `uniq_agreement_part_position |
condeferrable = t | condeferred = t`. The constraint is already INITIALLY
DEFERRED, so the statement at `:2148` changes nothing. Harmless; either drop it
or comment it as belt-and-braces.

## R10 · nit · `v_rate jsonb` is declared and unused in `upsert_design_services_draft`

`:1973`. The loop that used it moved to `_project_agreement_terms`.

## R11 · nit · The new definer RPCs' REVOKE lists omit `authenticated`

`upsert_agreement_parts` (`:2328`) and `materialize_standard_parts` (`:2533`)
revoke `FROM PUBLIC, anon, service_role` then grant to `authenticated`; the
00422 family names `authenticated` in the REVOKE first. The applied `proacl` is
identical either way (verified in `pg_proc`), so this is style, not exposure.

## R12 · nit · The freeze guard prints a raw table name

`:189` — `RAISE EXCEPTION '% is immutable after its proposal leaves draft',
TG_TABLE_NAME` yields *"proposal_agreement_parts is immutable…"*. Inherited
verbatim from 00423 and only reachable by direct SQL (the write grant is
withheld), so no designer sees it today; recorded because the sentence is now
attached to a table the composer's own surface is named after.

## R13 · nit · Build-sheet criterion E is wrong about today's behaviour

Deleting a **draft** proposal raises `23514 … is immutable after its proposal
leaves draft` — the cascade removes the parent before the child guard runs.
Identical with parts (`proposal_agreement_parts`) and without
(`proposal_service_rates`), so 00575 does not cause it; the criterion simply
does not describe the repo.

## R14 · advisory · F-5 stands, as ruled

`record_paper_client_signature` (`00425:485-490`) is a fourth rate-card refusal
the sheet's §3.6 does not list, left unrelaxed. The rulings file already
accepts this ("Backend F-5 … is accepted as the build sheet's omission — keep
it"). Consequence, flag-on: a composed flat-fee agreement can be sent, signed,
issued on paper and countersigned, but its client signature cannot be recorded
from a printed copy. Dark behind the flag.

## R15 · advisory · R20's paperwork is still owed

R20 rules the shape-keyed money projection accepted, but build sheet §3.7
step 6 and §6.2 cases 6-7 still instruct the opposite ("derive the projection
by `part_key`, not by variant"). A later reader diffing sheet against code will
read a lane that went off-brief. Amend the sheet at integration; §2.4 also
never declares the `an agreement carries only one …` refusal that the ruling
forced.

## R16 · advisory · R19's prose asymmetry has a consequence nobody has recorded

R19 ratifies prose-by-key, and the code matches it. The consequence measured:

```
P9  an agreement whose Services, Deliverables and Terms were all ADDED from the
    rail (custom.<uuid> keys) writes  scope=''  terms=<NULL>  deliverables=[]
```

`create_service_addendum` (`00422:1816`, deliberately not redefined in W1)
copies those four columns into the addendum, which W1's non-goals say renders
on the legacy path. An addendum minted from such an agreement is a document
with no scope, no deliverables, no exclusions and no terms. R19 makes this the
composer's problem (it must re-use the standard keys), so it is not a backend
defect — but nothing in either suite pins it, and W2's P7 will inherit it.

---

## What I could not verify here

- `pnpm supabase:reset` from zero. The shared stack now reads `00575`, which
  means a reset with this migration has already succeeded — but I did not run
  it, and the six red suites above remain unproven against a fully seeded
  database. The integration steward's reset must stay an explicit merge gate.
- Anything under `apps/**` — out of lane. R3's studio-facing consequence and
  R4's duplicate hooks are stated from grep of the sibling worktrees, not from
  a portal run.
