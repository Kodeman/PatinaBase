# Wave 1 · lane `backend` — adversarial review, round 3

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w1-backend`,
16 commits ahead of `main`, 19 files, +7482 / −15.

Every claim below is from a run on a scratch database, not from a plan.

---

## Verdict

**fix.** One blocker, three majors. The round-2 findings are genuinely closed
— all five, verified by probe — but the fix for N4 (withhold the parts table's
write grant so the figure on the page and the figure in the money row cannot
part company) was applied to one of the two tables that carry the agreement's
money, and the other one is still writable by any co-member through an
ordinary portal act.

---

## Gates run

Scratch DB `patina_w1r3`, built per env.md but with `pg_dump --no-owner -Fc` +
`pg_restore` (env.md's plain-SQL form is unusable on the local pg 18 client —
advisory A3, now confirmed a fourth time). Baseline head `00574` confirmed.
A second DB `patina_base574` was restored from the same dump WITHOUT 00575 as
the control for every "is this new?" question. Both dropped at the end; the
shared stack was never reset, never written, and still reads `00574`.

```
head=00574 confirmed
psql -v ON_ERROR_STOP=1 -f 00575_agreement_parts.sql            APPLY  rc=0
psql -v ON_ERROR_STOP=1 -f 00575_agreement_parts.sql (again)    APPLY2 rc=0   (idempotent, criterion Q)

commercial/agreement_parts_test.sql                  rc=0  PASS 1-24 (15 grouped notices)
commercial/agreement_parts_projection_test.sql       rc=0  PASS 1-9  (5 grouped notices)
commercial/design_services_paper_issue_test.sql      rc=0  14 asserts
commercial/multi_studio_signature_test.sql           rc=0  7 asserts
schedule/ceremony_hardening_test.sql                 rc=0  15 asserts
edge_api/public_sd_hardening_contract_test.sql       rc=0  (assert-only; the two "error" hits are
                                                            the file's own draw-error sentinels)
commercial/trade_scope_test.sql                      rc=3  — and rc=3 with the SAME message on
                                                            patina_base574 WITHOUT 00575. Restore
                                                            artifact, not a regression.

python3 scripts/generate-legacy-grants.py            → regenerates byte-identical (git status clean)
supabase gen types --db-url …/patina_w1r3            → 95 diff lines vs the committed file, ALL of
                                                        them `Relationships` blocks for the two FKs
                                                        pg_restore drops. No table, column, function
                                                        or nullability difference.
pnpm --filter @patina/types  type-check              → clean
pnpm --filter @patina/supabase type-check            → clean
pnpm --filter @patina/supabase test                  → 87 files, 1060 passed | 12 skipped
```

## Criteria that pass, with the evidence

| # | Criterion | Evidence |
|---|---|---|
| **A** | F-1 fingerprint identity | All **11** proposals in the restored DB hash byte-identically before and after the apply (`diff fp_before.txt fp_after.txt` empty). |
| **B** | Fingerprint coverage | `position`, `kind`, `variant`, `part_key`, `title`, `payload`, `required`, `client_visible`, `source_template_key`, `source_part_id` each move the digest (10/10 `t`); `created_at`/`updated_at` alone do **not** (`f`). |
| **C** | Client-visibility | `client_visible` moves the digest; the bundle omits the row (suite case 16). |
| **D** | Guard freezes at send | After `send_commercial_document`: `UPDATE`/`INSERT`/`DELETE` all `23514 proposal_agreement_parts is immutable after its proposal leaves draft`, and the RPC itself refuses `42501`. |
| **F/G** | RLS | Co-member reads 7 parts, direct `UPDATE` → `42501 permission denied for table proposal_agreement_parts`. Outsider/client covered by suite cases 13-15, 17. |
| **M** | Readiness false-red | A flat-fee agreement (no rate card, no ceiling) saves with `billing_ceiling_cents IS NULL`, 0 rate rows, and **sends**. |
| **O** | Pinned-hash honesty | Exactly one hex string moved in `public_sd_hardening_contract_test.sql` (`430d3a…` → `899573…`); `arguments`, `result_type`, `final_config`, `security_definer` untouched; `sign_design_services_agreement_with_trusted_ip`'s entry not touched. |
| **P** | Head-body grafting | `pg_proc.prosrc` diffed baseline-vs-00575 for all eight redefined functions. Every delta is exactly the one §3 names: guard = one `WHEN` arm; countersign = one `IS NULL` disjunct; `get_project_authority_summary` = the two F-2 edits; `classify_project_time_entry_authority` = one `IS NULL` disjunct; fingerprint = the conditional `parts` block; bundle = the enumerated `parts` key; `upsert_design_services_draft` = the block replaced by `PERFORM public._project_agreement_terms(…, false)`. No superseded body was resurrected. |
| **R** | Grants | `information_schema.role_table_grants` for `proposal_agreement_parts`: `authenticated SELECT` and nothing else. Every new definer function's `proacl` matches its family. `generate-legacy-grants.py` regenerates the committed file byte-identically. Zero bare extension functions (`gen_random_uuid()`/`digest(` all schema-qualified). Every new definer pins `search_path = public, pg_temp` (verified in `pg_proc.proconfig`, not only in the file). |
| **T** | Unknown kind | `kind='wormhole'`, `variant='quantum'` saves, hashes, and moves the digest. |
| **U** | Wave leakage | The only W2/W3 name anywhere in the diff is the `source_part_id` comment §3.9 requires. |
| **V** | Vocabulary | No "clause library", no "contract builder", no "facet" in any refusal. All 5 new refusal sentences read in the designer's words. |

## Round-2 findings — all five closed, verified

| # | Was | Now |
|---|---|---|
| N1 | Money keyed on `patina.*` while the composer mints `custom.<uuid>` | Composing the rail's exact emission (rate card, ceiling, retainer, cadence, deposit, all under `custom.<uuid>`) writes `ceiling=2400000 retainer=500000 policy=retainer_paid cadence=biweekly deposit=25 rateRows=1`. |
| N2 | Readiness keyed on shape, DB on key | `_agreement_floor_unmet`'s two halves are `readiness.ts:211-224`'s `billsTime` and its `cents > 0` ceiling test, term for term. |
| N3 | Floor asked at one of four doors | Asked at `upsert_agreement_parts`, `send_commercial_document`, `_sign_design_services_agreement_authorized` and `_issue_design_services_agreement_on_paper`. Probe Q3's route (`ceiling` cleared on the terms row, standard parts seeded from it) now refuses at the save and at the send. |
| N4 | `authenticated` held INSERT/UPDATE/DELETE | `authenticated SELECT` only; direct `UPDATE` → `42501`. |
| N5 | Designer mirror typed `authorizedCents: number` | `commercial-documents.ts:87-98` — `ceilingCents`, `authorizedCents`, `remainingCents` all `number \| null`. (Designer lane; verified fixed.) |
| B6 | A zero ceiling satisfied the floor | `_agreement_floor_unmet` requires `jsonb_typeof(payload->'cents') = 'number' AND … > 0`. Ceiling 0 + rate card → `23514 an agreement that bills time needs a ceiling`. |

---

## R1 · **blocker** · The parts and the money row can part company, and only the parts are guarded

`proposal_service_terms` and `proposal_service_rates` still grant
`authenticated` INSERT / UPDATE / DELETE under `proposal_service_terms_studio_rw`
(00412:318) — verified in `information_schema.role_table_grants`. 00575 makes
those rows the **projection** of the parts, and the guard that stops the two
from disagreeing was installed on only one side.

The reachable route needs no SQL at all. A PostHog rollout is per person, so a
studio can hold one member inside `agreement-parts` and one outside it:

```
P16  A (flag on) composes: ceiling 2,400,000 · cadence biweekly · 1 role @ 22500
     B (flag off) opens the same draft and saves the seven-facet room
        → upsert_design_services_draft ACCEPTED; money row ceiling=500000 cadence=monthly
        → A's 7 parts untouched
     send  → <SENT>       (the floor reads the PARTS, which still say 2,400,000)
     sign  → accepted
     countersign → executed
     client-visible ceiling part = 2400000   authority ceiling = 500000  cadence=monthly
```

The page the client signs says $24,000 at biweekly. The billing authority the
studio bills against says $5,000 at monthly. Nothing refuses, and the
fingerprint does not catch it — it hashes both halves, so the contradictory
pair is exactly what the signature attests to.

The same divergence in the other direction erases the cap outright:

```
P3b  A composes ceiling 2,400,000; a co-member UPDATEs proposal_service_terms
     SET billing_ceiling_cents = NULL (plain SQL, granted, draft)
       → _agreement_floor_unmet = false        (it reads the parts)
       → send <SENT>
       → the bundle the client reads: parts ceiling = 2400000,
                                       serviceTerms.billingCeilingCents = <NULL>
       → executed; authority ceiling = <NULL> (UNCAPPED), authorityRates = 1
```

Before 00575 this state was unreachable: the column was `NOT NULL`, the terms
row was the only source, and the page rendered from it. 00575 creates a second
source of truth for the same five figures and protects one of them.

The lane's own commit message states the principle it is missing —
*"a direct UPDATE moved the figure the client signs without moving the figure
the authority snapshots — two parties bound to different numbers, refused by
nothing."*

**Fix (orchestrator ruling).** Any of:
1. Refuse `upsert_design_services_draft` when the proposal carries parts (the
   flag-off door should not be able to overwrite a composed agreement), and
   withhold INSERT/UPDATE/DELETE on `proposal_service_terms` /
   `proposal_service_rates` from `authenticated` the way the parts grant was
   withheld — every writer already goes through a definer RPC.
2. Or re-project from the parts inside `send_commercial_document` / the sign
   doors, so whatever the money row says at the door is what the parts say.
3. Or make `_agreement_floor_unmet` (and the send refusal) read the **terms
   row** rather than the parts, and add a "the parts and the money row
   disagree" refusal.

No test in either suite covers a divergence between the parts and the terms
row; whichever way this is ruled, one belongs there.

---

## R2 · **major** · The new duplicate refusal has no counterpart in the readiness panel

Round 3 added `an agreement carries only one %` for a second `rate_card`,
`ceiling`, `retainer`, `cadence` or `procurement` part (migration :2170-2192).
Verified: `P4 second ceiling -> 23514 / an agreement carries only one ceiling`.

The room offers exactly that act. `add-part-menu.tsx` renders
`ADD_PART_OPTIONS` unconditionally, and `part-kinds.ts:25-33` puts all seven W1
schedule variants on it — including `ceiling`, `retainer`, `cadence`,
`rate_card` and `procurement`, every one of which `materialize_standard_parts`
has already seeded. `readiness.ts`'s R-11 checks only a duplicate **`partKey`**
(`:98-104`), and every added part gets a fresh `custom.<uuid>`, so the panel
never sees a duplicate.

A designer with the nine seeded parts who picks `+ Add a part → Ceiling` gets
`ready: true`, a Save button that is enabled, and then `23514` surfaced as
`saveNote`. Before round 3 the same act simply saved (the second ceiling was
ignored). The refusal is the right call; it is not declared in the frozen
§2.4 interface and the designer lane was never told to enforce it.

**Fix.** Add the rule to `readiness.ts` (one blocker per duplicated money
shape, in the same words the DB uses), or grey the variant out in the Add menu
when one is already present. Declare it in §2.4.

---

## R3 · **major** · Prose reads by key, so a rail-added clause or list projects nothing

Round 3 moved the five money figures onto kind + variant but left the four
prose slots on `part_key` (deliberate; documented at `backend-notes.md:474-479`).
The composer mints `custom.<uuid>` for **every** part it adds, prose included
(`part-kinds.ts:144-174`). So:

```
P15  a fully rail-composed agreement (Services, Terms and Exclusions all added
     from the rail) writes:
       scope='' · terms=<NULL> · deliverables=[] · exclusions=[]
```

The prose is on the page and absent from the row. Three consumers read that
row and not the parts:

- `create_service_addendum` (00422:1816, **not** redefined in W1) copies
  `t.scope`, `t.deliverables`, `t.exclusions`, `t.terms` into the addendum,
  which W1's own non-goals say "carries no parts and renders on the legacy
  path". An addendum minted from a composed agreement is therefore a document
  with no scope, no deliverables, no exclusions and no terms.
- `commercial-document-shell.tsx:194` (the client's no-parts body).
- The designer's flag-off preview.

The asymmetry may well be the right design; its consequence is not recorded
anywhere and no test covers it.

**Fix (orchestrator ruling).** Either project prose by shape as well (first
`clause`/`list` in position order fills the slot), or make the composer re-use
`patina.services` / `patina.terms` / `patina.deliverables` / `patina.exclusions`
when the matching standard slot is empty, or record in the sheet that a
composed agreement's addendum renders empty and hold it for W2's P7.

---

## R4 · **major** · The projection deviates from binding sheet text, and the sheet's own tests were rewritten, with no ruling recorded

Build sheet §3.7 step 6 is explicit: *"Derive the projection **by `part_key`**,
not by variant — `UNIQUE (proposal_id, part_key)` guarantees at most one of
each, and a custom or duplicate schedule part must never silently rewrite the
money row (R5)."* §6.2 cases 6 and 7 pin exactly that behaviour: *"a custom
part carrying a `cents` payload → the terms row is unchanged"* and *"a second
`schedule`/`ceiling` part under a custom key → still no projection from it;
the `patina.ceiling` value stands."*

00575 now does the opposite, and both test cases were rewritten to assert the
opposite (`PASS 6-7: money reads by shape under any key, one of each …`).

I believe the change is **correct** — it is the only way N1 and N2 close
together, and the lane argues it well (`backend-notes.md:441-479`). But
`rulings-2026-09-06.md` carries no entry for it, the build sheet still says the
old thing, and §2.4's frozen interface never mentions the duplicate refusal
this ruling forced. A later reader diffing sheet against code will read a lane
that went off-brief.

**Fix.** Record the ruling and amend §3.7 step 6 and §6.2 cases 6-7 before
merge, or reverse the change.

---

## R5 · minor · A third database identifier reaches the studio, and this one is reachable from the room

Same class as B11 / N6, but this one is not RPC-surface-only. `readRoles`
coerces a missing rate to `0` but passes the role name through as typed, so a
role row with a blank name saves as:

```
P8  23514 / new row for relation "proposal_service_rates" violates check
    constraint "proposal_service_rates_role_name_check"
```

surfaced verbatim as the composer's `saveNote` (`agreement-composer.tsx:210-216`).
R7 forbids a database identifier in studio-facing text. Filter roles with a
blank name out of `v_rates`, or refuse them with a sentence.

## R6 · minor · The `@patina/supabase` hooks this lane shipped are dead code

`packages/supabase/src/hooks/use-agreement-parts.ts` and
`use-studio-agreement-defaults.ts` (336 lines, 475 lines of tests) are on this
lane's pathspec and are correctly built — the query keys sit in the existing
commercial family, the invalidation set is the sheet's. **Nothing imports
them.** The designer lane wrote its own `useSaveAgreementParts` /
`useMaterializeStandardParts` inside
`apps/designer-portal/src/hooks/use-commercial-documents.ts:561-577` (which
refetches the bundle instead of returning the RPC's object — a different
contract from §2.4's) and an entirely new
`apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts` that is not
on the designer lane's §2.2 pathspec list at all.

Two implementations of one data path, diverging already at the return shape.
CLAUDE.md's rule is `@patina/supabase` hooks for Supabase data. Orchestrator
call: delete one set at integration.

## R7 · nit · A designer-lane comment now states the opposite of what the DB does

`part-kinds.ts:145-147`: *"The key is namespaced `custom.<uuid>` because the
projection is keyed on `part_key` (R5) — a custom part must never be mistaken
for a standard one and rewrite the money row."* Since round 3 a custom money
part is exactly what rewrites the money row.

## R8 · nit · Criterion E does not hold, and did not before either

Deleting a **draft** proposal that carries terms and rates raises
`23514 proposal_service_rates is immutable after its proposal leaves draft` —
the cascade removes the parent before the child triggers run, so the guard's
draft test finds nothing. Identical with and without parts (P18), so 00575
does not cause it. The sheet's criterion E ("deleting a draft proposal
cascades cleanly") is simply wrong about today's behaviour.

## R9 · advisory · F-5 still unruled

The lane's own finding: `record_paper_client_signature` (head `00425:485-490`)
is a **fourth** rate-card refusal the sheet's §3.6 does not list, left
unrelaxed. A composed flat-fee agreement can be sent, signed, issued on paper
and countersigned but its client signature cannot be recorded from a printed
copy. Dark behind the flag. Needs a ruling.

---

## Still open from earlier rounds — every one re-verified by probe

| # | Sev | State |
|---|---|---|
| B7 | minor | `P9 legacy materialize: materialized=true count=9 kind_after=legacy` — still seeds nine parts onto a `legacy` document without the widen `upsert_agreement_parts` runs. |
| B8 | minor | The bundle's `legacy` early-return (migration :2586-2602) returns only `'document'`; §2.4 freezes `parts` as "always present". |
| B9 | minor | `v_rates` (migration :2294-2300) carries `roleName`/`hourlyRateCents`/`sortOrder` only; every save re-stamps `effective_at = now()`. `classify_project_time_entry_authority` filters authority rates on `effective_at <= started_at`. |
| B10 | minor | `use-studio-agreement-defaults.ts:104-107` still says the write "reaches no rows rather than erroring"; the mutation ends `.select().single()` and RLS raises `42501`. |
| B11 | minor | `P7 duplicate partKey -> 23505 / duplicate key value violates unique constraint "uniq_agreement_part_key"`. |
| N6 | minor | `P6 role with no hourlyRateCents -> 23502 / null value in column "hourly_rate_cents" of relation "proposal_service_rates"`. |
| B12 | nit | `SET CONSTRAINTS uniq_agreement_part_position DEFERRED` (:2148) is still a no-op. |
| B13 | nit | `v_rate` still declared and unused in `upsert_design_services_draft`. |
| B15 | nit | `upsert_agreement_parts` (:2328) and `materialize_standard_parts` (:2533) revoke `FROM PUBLIC, anon, service_role`; the 00422 family also names `authenticated`. Cosmetic — applied ACLs verified identical in shape to their peers. |
| B14 | nit | `design_services_paper_issue_test.sql` is still an extra pathspec beyond §2.1. The edit is correct and necessary; record it in the sheet at integration. |
| A3 | advisory | env.md's plain-SQL `pg_dump \| psql` recipe remains unusable on the local pg 18 client. `trade_scope_test` (and the six others the lane names) fail identically on a 00574 control DB — restore artifacts, but therefore **still unverified against this change**. The integration steward's `pnpm supabase:reset` run of those suites must be an explicit merge gate. |

---

## Scope

Nineteen files, all on §2.1's list except `design_services_paper_issue_test.sql`
(B14, documented). No `apps/**`. No unrequested feature, refactor or
abstraction. Commits are Conventional, pathspec-explicit, no trailers, no
`merge(...)` subject, not pushed.
