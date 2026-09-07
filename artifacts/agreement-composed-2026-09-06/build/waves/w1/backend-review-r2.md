# Wave 1 · backend lane · adversarial review, round 2

Reviewer: separate context, did not write this code. Date 2026-09-06.
Branch `agreement/w1-backend`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
(`git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`).

**Verdict: fix.** One blocker and four majors. Nothing in the migration itself
is unsafe on Strata — the grafts are clean, the fingerprint is byte-identical
for parts-less documents, the ACLs and `search_path`s are preserved, and the
file applies twice cleanly. The blocker is not in the SQL's correctness but in
what the composed system does with it: **every money part the Wave 1 composer
can add projects nothing into the money row.**

---

## 1 · What round 1 asked for, and what happened

| # | R1 finding | Status | Evidence |
|---|---|---|---|
| B1 | `classify_project_time_entry_authority` NULL-unsafe | **FIXED** | Body grafted from `00412` head; catalog diff old-vs-new is 8 lines, all the one named delta. Suite case 23 added; `agreement_parts_test.sql` rc=0, 14 PASS groups. |
| B2 | R5: a `clause` keyed `patina.ceiling` wrote money | **FIXED** | All nine projection subqueries now assert `kind` and (schedule) `variant`. `agreement_parts_projection_test.sql` case 8 pins it; rc=0, 5 PASS groups. |
| B3 | `_agreement_requires_rate_card` keyed on variant, projection on key | **FIXED as asked — and the fix relocated the defect.** See **N1/N2**. | Predicate now keys on `part_key='patina.role_rates'`. Probe P6/Q1 below. |
| B4 | `authorizedCents` typed `number` | **FIXED** in `packages/types`. The designer-lane mirror is **not** — see **N5**. | `commercial.ts:113-117` widened. |
| B5 | flag-off write path changed (NULL ceiling) | **FIXED** | `p_allow_null_ceiling boolean DEFAULT false`; `upsert_design_services_draft` passes `false`; projection test case 9 asserts omitted / JSON-null / stated all land 0 / 0 / 2400000. |
| B6 | R4 floor accepts ceiling `0` alongside a rate card | **OPEN** | Probe P3: `ceiling 0 + rate card -> <accepted> (ceiling=0)`. |
| B7 | `materialize_standard_parts` does not widen `document_kind` | **OPEN** | Probe P4: `before=legacy materialized=true count=9 after=legacy`. |
| B8 | bundle's legacy early-return omits `parts` | **OPEN** | Read of the grafted `00425` body, migration `:2442-2458`. Q5 confirms the non-legacy branch does carry `"parts": []`. |
| B9 | rate `effectiveAt` not carried through the parts door | **OPEN** | Probe P7: caller sent `2026-01-01`, row holds `2026-09-07 00:47:10+00`. |
| B10 | `useUpdateStudioAgreementDefaults` doc comment wrong | **OPEN** | Comment unchanged at `use-studio-agreement-defaults.ts:104`. Probe Q4: a plain member's upsert raises `42501 new row violates row-level security policy`, it does not reach zero rows. |
| B11 | duplicate `partKey` surfaces a raw constraint name | **OPEN** | Probe P1: `23505 duplicate key value violates unique constraint "uniq_agreement_part_key"`. |
| B12 | `SET CONSTRAINTS … DEFERRED` is a no-op | **OPEN** | `00575:2034`. |
| B13 | `v_rate` unused in `upsert_design_services_draft` | **OPEN** | `00575:1867`. |
| B14 | `design_services_paper_issue_test.sql` off the declared pathspec | **OPEN, recorded** | Lane notes §112-113 name it. |
| B15 | new definer RPCs `REVOKE` list omits `authenticated` | **OPEN** | `00575:2196`, `:2389`. |
| A1 | env.md's `pg_dump --no-acl` recipe | **Confirmed again** — I used `pg_dump --no-owner -Fc` + `pg_restore`. env.md still carries the broken recipe. |
| A2 | criterion E cascade is pre-existing | **Confirmed again** | Probe P14: `23514 proposal_service_rates is immutable after its proposal leaves draft`, identical on a 00574 baseline DB. |

---

## 2 · New findings

### N1 · blocker · Every money part the composer can add projects nothing

`upsert_agreement_parts` derives the money row from nine literal `patina.*`
keys. The designer lane mints **`custom.<uuid>`** for every part added from the
rail (`part-kinds.ts:165`, comment at `:146-147`), and the add menu offers all
seven W1 schedule variants (`part-kinds.ts:26-32`). So a studio that removes a
standard money part and adds a fresh one — or adds a second — composes a
document whose figures never reach `proposal_service_terms`.

Probe Q1 posted exactly what the composer emits (rate card $225/hr, ceiling
$24,000, retainer $5,000 / `retainer_paid`, cadence `biweekly`, deposit 25%,
all under `custom.<uuid>`):

```
Q1 composer-added money parts -> ceiling=<NULL> retainer=0 policy=immediate
   cadence=monthly deposit=<NULL> rateRows=0
```

Every figure the client will read off the rendered parts is absent from the
money row the authority snapshots. The R4 DB floor does not fire (it also keys
on `patina.role_rates`), `_agreement_requires_rate_card` returns false, and the
document sends.

Round 1's B3 fix is not wrong on its own terms — predicate, floor and
projection now agree — but the third party to that agreement, the composer, was
never brought into it.

**Fix (needs an orchestrator ruling):** either (a) project each money variant
from the single part carrying that `kind`/`variant`, whatever its key, and
refuse a second one; or (b) have the composer re-use the standard `patina.*`
key when the added part's kind/variant matches a standard slot and no part
already holds that key. (a) matches what a designer means by "Ceiling"; (b) is
the smaller diff. Either way `_agreement_requires_rate_card`, the R4 floor and
the projection must keep reading the same thing.

### N2 · major · Readiness reads `variant`, the DB reads `part_key` — green, then an authority that bills nothing

`readiness.ts:58` `FEE_VARIANTS`, `:212` and `:218-224` key R-5/R-6/R-7 on
`kind === 'schedule' && variant === '…'`, per build sheet §4.4. The DB keys on
`part_key`. Both directions fail:

- **False-green.** Probe P6 composed a rate card under `custom.…` plus the
  required prose, sent, signed and countersigned:

  ```
  P6 projected rates=0 ceiling=<NULL>
  P6 executed=true authorityRates=0 authorityCeiling=<NULL>
  P6 hour on a custom-key rate card -> billing_state=pending_authorization
  ```

  An executed agreement with **zero authority rates**. `v_rate.id IS NULL` in
  `classify_project_time_entry_authority` parks every billable hour in
  `pending_authorization` and nothing will ever move it — the exact "looks
  healthy, bills nothing" state B1 was raised for, reached by a different door.
  Before 00575 this state was unreachable: send required ≥1 rate row.
- **False-red.** A studio that keeps a reference rate card under its own key
  gets R-6's *"An agreement that bills hourly needs a ceiling"* for rates the
  DB will never project.

Build-sheet criterion L ("push the same payload past the UI straight to
`upsert_agreement_parts` and `send_commercial_document` and confirm the DB
refuses too") does not hold.

### N3 · major · `materialize_standard_parts` bypasses the R4 DB floor, and the floor is not re-checked at send

The floor lives only inside `upsert_agreement_parts`. `materialize_standard_parts`
writes the nine parts directly. Probe Q3, on a draft whose terms row carries a
rate card and a cleared ceiling (a co-member may clear it under
`proposal_service_terms_studio_rw` while draft — the lane's own case 23 does
exactly this):

```
Q3 materialize seeded rate_card + ceiling cents=<null>
Q3 send of an uncapped HOURLY agreement -> <sent>
```

`send_commercial_document` only asks whether rate **rows** exist, never whether
a ceiling part is present, so R4's "a ceiling part is required whenever a rate
card is present" is enforced at exactly one door out of three.

**Fix:** run the same floor predicate in `materialize_standard_parts`, or lift
it into `_agreement_requires_rate_card`'s neighbourhood and call it from
`send_commercial_document` too.

### N4 · major · A co-member's direct table write moves the hash but not the money row

§3.3 grants `authenticated` INSERT/UPDATE/DELETE on `proposal_agreement_parts`
with an `ALL` policy for co-members — as specified. But the projection lives
only in the RPC, so a direct write desynchronises the instrument from the money
row with no refusal anywhere. Probe Q2 (co-member, draft, straight `UPDATE`):

```
Q2 direct part edit by a co-member: terms ceiling 2400000 -> 2400000, digest moved
```

The digest moved, so the client signs the *new* ceiling on the rendered
document; `proposal_service_terms` still holds the old one, and that is what
countersign snapshots into the authority. Two parties bound to different
numbers.

**Fix (ruling):** either drop INSERT/UPDATE/DELETE from the table grant and
route all writes through the RPC (the discipline `proposal_service_terms`
already keeps — clients read through a definer function, and the room writes
through `upsert_design_services_draft`), or add an AFTER trigger that
re-projects. The former is smaller and matches the contract's own "No wave
writes business tables outside definer RPCs" program rule.

### N5 · major · `authorizedCents` renders `$0` for an uncapped authority (designer lane)

The backend widened `ProjectBillingAuthoritySummary.authorizedCents` to
`number | null` (B4, correct). The designer lane's app-local mirror was not:
`apps/designer-portal/src/lib/document/commercial-documents.ts:88` still reads
`authorizedCents: number`, and `money-region.tsx:211` / `:214` print
`money(authority.authorizedCents)` unguarded, while `:202` *does* guard
`remainingCents`. `money` is
`Intl.NumberFormat(...).format(cents / 100)` (`project-commerce.ts:458`) and
`money(null)` returns `"$0"` (verified in node). An uncapped authority's seam
reads **"$0 budget"** — criterion N's named failure. Designer lane owns the fix;
recording it here because it is the direct downstream of this lane's
nullability change.

### N6 · minor · An incomplete rate row surfaces a raw column name to the studio

Probe P2, through `upsert_agreement_parts`:

```
P2 rate role with no rate / blank name -> 23502 /
   null value in column "hourly_rate_cents" of relation "proposal_service_rates"
   violates not-null constraint
```

R7 forbids a database column name in studio-facing text, and every other
refusal in this function is a sentence. Not reachable from the composer today —
`readRoles` coerces to `0` (`part-kinds.ts:229`) — so this is an RPC-surface
issue of the same class as B11.

---

## 3 · What passed

| Criterion | Result |
|---|---|
| **A** Fingerprint conditionality (F-1) | **PASS.** 9 seeded proposals (design_services, trade_scope, legacy), digests captured on a 00574 scratch DB, 00575 applied, recomputed: `diff` empty. Still empty after a second apply. |
| **B** Fingerprint coverage | **PASS.** Probe P13 mutated all twelve columns in turn: `position kind variant part_key title payload required client_visible source_template_key source_part_id` all moved the digest; `created_at` / `updated_at` `UNCHANGED`. |
| **C** Client-visibility | **PASS.** `client_visible` moves the digest (P13); suite case 16 asserts the bundle filters it out. |
| **D** Guard bypass by direct write | **PASS.** `pg_trigger`: `guard_proposal_agreement_parts_authored BEFORE INSERT OR DELETE OR UPDATE … FOR EACH ROW`. Probe P10 post-send: `23514 proposal_agreement_parts is immutable after its proposal leaves draft`. |
| **E** Cascade | Pre-existing failure, unchanged (A2). |
| **F** RLS leak | **PASS.** P8: co-member sees 3, outsider sees 0 and `INSERT → 23514`, client sees 0. P9: outsider's `upsert_agreement_parts` and `materialize_standard_parts` both `42501`. |
| **G** Studio-defaults RLS | **PASS.** P11: plain member reads 1, `UPDATE` touches 0 rows; outsider reads 0. Q4: plain member's upsert `42501`. |
| **H** Projection drift | **PASS.** `_project_agreement_terms`'s body next to `00422:1749-1793`: the only differences are the `p_allow_null_ceiling` CASE and `COALESCE(p_rates,'[]')` in the loop's source. `agreement_parts_projection_test.sql` rc=0. |
| **I** Projection over-reach (R5) | **PASS.** Projection test case 8 (clause keyed `patina.ceiling` carrying 7 777 777 → ceiling NULL; list keyed `patina.retainer` → 0; etc.), plus cases 6-7 for custom keys. |
| **O** Pinned-hash honesty | **PASS.** Exactly one hex string moved in `public_sd_hardening_contract_test.sql` (`430d3a…` → `8995735d…`); `arguments`, `result_type`, `final_config`, `security_definer` untouched; `sign_design_services_agreement_with_trusted_ip` not redefined (`md5(prosrc)` identical old vs new: `605b3ff4c91e299058e51bc474192c38`). Recomputed hash on the applied scratch DB = `8995735d7c966a6bd4db4a1669ee043b12398b9d64fe676c2281ece2536bc0b3`, matches the pin. Contract test rc=0. |
| **P** Head-body grafting | **PASS, all eleven.** `grep|sort|tail -1` returns exactly the files the banner names. Catalog body diff old-vs-new: `guard_commercial_authored_child` 3 lines (one `WHEN` arm + comment) · `_commercial_document_fingerprint` 21 (the conditional block) · `send_commercial_document` 9 · `_sign_design_services_agreement_authorized` 7 · `_issue_design_services_agreement_on_paper` 7 · `_countersign_design_services_agreement_impl` 8 (the `IS NULL` disjunct) · `get_project_authority_summary` 10 · `classify_project_time_entry_authority` 8 · `get_client_commercial_document_bundle` 14 (the `parts` key) · `upsert_design_services_draft` 51 (projection → `PERFORM`). No superseded body reintroduced; `00566`'s studio resolution intact. |
| **Q** Idempotency | **PASS.** 00575 applied twice on the same DB, rc=0 both times, fingerprints still byte-identical. |
| **R** Grants | **PASS.** `python3 scripts/generate-legacy-grants.py` re-run: output byte-identical to the committed seed ("baseline + 2222 replayed statements"), so it is generated, not hand-edited. New table ACLs match `studio_billing_settings`; both new tables carry **no** `anon` grant (better than the older peers, which do). |
| **T** Unknown kind | **PASS (DB half).** P12: a `kind='wormhole' variant='quantum'` part saves, sends, and crosses the bundle as data. |
| **U** Wave leakage | **PASS.** The only match for the W2/W3 symbol list in the diff is a `COMMENT` explaining why `source_part_id` has no FK yet. |
| **V** Vocabulary | **PASS.** No "clause library", no "contract builder", no "variant" in studio copy. "seven-facet room" appears only in SQL comments and test names. |
| Types (`agreement.ts`) | **PASS.** Byte-for-byte the frozen §2.4 text. |
| Catalog invariants | **PASS.** All nine redefined functions keep identical `proacl`, `proconfig` and `prosecdef` old-vs-new. Both `billing_ceiling_cents` columns `is_nullable = YES`. |

---

## 4 · Gates run

Scratch DB `patina_w1rev`, built per env.md but with `pg_dump --no-owner -Fc`
+ `pg_restore` (A1); baseline DB `patina_w1base` from the same dump without
00575. Both dropped at the end; the shared stack is untouched at `00574`.

```
psql -f 00575_agreement_parts.sql                            rc=0   (and rc=0 on a second apply)

commercial/agreement_parts_test.sql                          rc=0 PASS=14
commercial/agreement_parts_projection_test.sql               rc=0 PASS=5
commercial/multi_studio_signature_test.sql                   rc=0 PASS=7
commercial/design_services_paper_issue_test.sql              rc=0 PASS=13
schedule/ceremony_hardening_test.sql                         rc=0 PASS=15
edge_api/public_sd_hardening_contract_test.sql               rc=0 (asserts only, no NOTICEs)

commercial/design_services_authority_test.sql                rc=3  ── pre-existing
commercial/design_services_gap_hardening_test.sql            rc=3  ── pre-existing
commercial/authorized_schedule_test.sql                      rc=3  ── pre-existing
commercial/executed_on_paper_test.sql                        rc=3  ── pre-existing
commercial/trade_scope_test.sql                              rc=3  ── pre-existing
```

The five reds fail **identically on the 00574 baseline DB** (same file, same
line, same message — e.g. `design_services_authority_test.sql:177 ERROR: design
services agreement d5300000-… not found or access denied` in both runs). They
are scratch-restore artifacts, not 00575. The lane's notes say the same
(§170-186, §395-402). **They therefore remain unverified against this change** —
the integration steward's `pnpm supabase:reset` is the only run that will prove
them, and it must be run before merge.

```
pnpm --filter @patina/types type-check       PASS (tsc --noEmit, no output)
pnpm --filter @patina/supabase type-check    PASS (tsc --noEmit, no output)
pnpm --filter @patina/supabase test          PASS  87 files, 1060 passed | 12 skipped
```

Types regen from the scratch DB:
`npx supabase gen types typescript --db-url …/patina_w1rev` → 35 609 lines vs
the committed 35 689; the whole 86-line diff is `Relationships: []` where the
committed file has FK arrays for `engagement_events_user_id_fkey` and
`invoice_links_created_by_fkey`. Cause: my `pg_restore` carried 849 of the
shared stack's 851 FK constraints. **No `proposal_agreement_parts`,
`studio_agreement_defaults`, `_project_agreement_terms` or nullability
difference at all** — the committed `database.types.ts` is in sync.

Working tree clean (`git status --porcelain` returns only the sandbox's
`.env*: Operation not permitted` noise).

---

## 5 · What I did not verify

- The five pre-existing red suites against a real `supabase db reset`.
- Anything under `apps/` beyond the read-only greps cited in N1, N2 and N5 —
  the designer and client lanes have their own reviewers.
- Flag-off byte-identity of the rendered portals (criteria J and K) — portal
  lanes.
- The edge-function NULL-ceiling render (criterion U') — no `deno test` run.
- Prod. Nothing was pushed, deployed, or run against Strata.
