# Wave 1 · lane `backend` · adversarial review, round 1

**Reviewer** separate context, did not write this code · **Date** 2026-09-06
**Branch** `agreement/w1-backend` @ `2f2dad942` (7 commits on `main`)
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
**Verdict** `fix` — one blocker, four majors. Everything else is green, and the
migration itself applies clean, is idempotent, and passes the F-1 regression at
full strength.

---

## 0 · What I ran

Scratch database `patina_w1r`, built per `env.md` but with **ACLs preserved**
(`pg_dump --no-owner -Fc` + `pg_restore`, **not** `--no-acl`: `--no-acl` strips
every table GRANT and the RLS suites then fail spuriously with
`permission denied for table proposals`). Baseline database `patina_w1base` from
the same dump, migration **not** applied, used to separate pre-existing failures
from regressions. Both dropped at the end.

`pg_dump`/`psql` 18 write a `\restrict` directive that psql then refuses inside
COPY blocks — plain-SQL dump/restore is unusable here; custom format works.

| Gate | Result |
|---|---|
| `psql -v ON_ERROR_STOP=1 -f supabase/migrations/00575_agreement_parts.sql` | **rc=0**, ends `COMMIT` |
| Same file applied a **second** time (idempotency, criterion Q) | **rc=0**, no errors |
| **F-1**: `_commercial_document_fingerprint` over all 11 seeded proposals, before vs after apply | **byte-identical, 11/11** (`diff` empty) |
| `commercial/agreement_parts_test.sql` | **rc=0**, 12 PASS groups / 21 assertions |
| `commercial/agreement_parts_projection_test.sql` | **rc=0**, 3 PASS groups / 7 assertions |
| `commercial/multi_studio_signature_test.sql` | **rc=0**, 7 PASS |
| `commercial/design_services_paper_issue_test.sql` | **rc=0**, 13 PASS |
| `schedule/ceremony_hardening_test.sql` | **rc=0**, 15 PASS |
| `edge_api/public_sd_hardening_contract_test.sql` | **rc=0** |
| `commercial/{design_services_authority, design_services_gap_hardening, authorized_schedule, executed_on_paper, trade_scope}_test.sql` | rc=3 — **identical failure line and message on `patina_w1base` without 00575**; all five listed in `supabase/tests/KNOWN_FAILURES.md` Group 3 |
| Re-pinned hash, recomputed from the applied function | `8995735d7c966a6bd4db4a1669ee043b12398b9d64fe676c2281ece2536bc0b3` — **matches the value committed to the contract test exactly** |
| `python3 scripts/generate-legacy-grants.py` then `git status --porcelain` | **clean** — the committed seed is the generated one, 2221 replayed statements |
| `supabase gen types typescript --db-url …/patina_w1r` vs the committed `database.types.ts` | **no agreement-related difference**; the only diff is two FK `Relationships` blocks (`engagement_events`, `invoice_links`) that my restore could not reproduce — an artifact of my scratch DB, not of the lane |
| `pnpm --filter @patina/types type-check` | pass |
| `pnpm turbo build --filter=@patina/types` | pass, `dist/agreement.{js,d.ts}` present |
| `pnpm --filter @patina/supabase type-check` | pass |
| `pnpm --filter @patina/supabase test` | **87 files, 1060 passed / 12 skipped**, incl. `use-agreement-parts.test.ts` (14) and `use-studio-agreement-defaults.test.ts` (10) |

**Head-body grafting (criterion P).** I extracted each redefined function from
00575 and from its `grep \| sort \| tail -1` winner and diffed them
mechanically. All nine grafts are faithful; every delta is exactly the one §3
names, and nothing else moved:

| Function | Head grafted from | Delta |
|---|---|---|
| `guard_commercial_authored_child` | 00423 | one `WHEN` arm + comment |
| `_commercial_document_fingerprint` | 00423 | one conditional `parts` block, alias `ap` |
| `send_commercial_document` | 00423 | refusal A predicate + message |
| `_sign_design_services_agreement_authorized` | 00412 | refusal B predicate + message |
| `_issue_design_services_agreement_on_paper` | 00477 | refusal C predicate + message |
| `_countersign_design_services_agreement_impl` | **00566** (not the 00475/00511 traps) | one `IS NULL` disjunct |
| `get_project_authority_summary` | 00422 | exhaustion test + `remainingCents` |
| `upsert_design_services_draft` | 00422 | projection block → `PERFORM _project_agreement_terms` |
| `get_client_commercial_document_bundle` | **00425** | one `parts` key |

`sign_design_services_agreement_with_trusted_ip` is **not** redefined anywhere in
the diff, so its pin survives untouched (criterion O). The contract-test diff
moves **exactly one hex string**; `arguments`, `result_type`, `final_config`,
`security_definer`, the ACL contract, the caller contract and the lock-order
contract are all unchanged.

**Delivery.** Every item in the lane brief is present: the single migration
(banner with lineage, table, RLS, grants, guard dispatch, fingerprint fold,
ceiling nullability with all three refusals relaxed through one helper, the
extracted projection called by both writers, `upsert_agreement_parts`,
`materialize_standard_parts`, `studio_agreement_defaults`, the bundle
extension, 14 `COMMENT ON`s), `packages/types/src/agreement.ts` **verbatim to
§2.4**, both hooks with the specified query keys, both SQL tests, the
regenerated grants seed, the regenerated types. Nothing under `apps/`. No
Wave 2 / Wave 3 object appears in the diff (criterion U clean). No
"clause library" / "contract builder" (criterion V clean — "seven-facet room"
appears only in SQL and TS comments, never in a string a designer reads).
Commits are Conventional, pathspec-scoped, trailer-free.

---

## 1 · Findings

### B1 · blocker · confidence 0.9 — the fourth NULL-ceiling reader was missed: an uncapped agreement never authorizes an hour

`supabase/migrations/00575_agreement_parts.sql` (omission) ·
`supabase/migrations/00412_design_services_commercial_authority.sql:2610`

F-2 made three readers NULL-safe. There is a **fourth**, and it is the one that
decides whether a logged hour is billable:
`public.classify_project_time_entry_authority()` — 00412 is its sole and current
head (`grep | sort | tail -1`), and it is a live `BEFORE INSERT OR UPDATE`
trigger on `project_time_entries`:

```sql
  IF v_prior_cents + NEW.rated_amount_cents
     <= COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) THEN
    NEW.billing_state := 'authorized';
  ELSE
    NEW.billing_state := 'pending_authorization';
  END IF;
```

Both operands of the `COALESCE` are `project_billing_authorities.billing_ceiling_cents`,
which 00575 makes nullable. NULL → the comparison is NULL → the `ELSE` branch →
**every billable hour on an uncapped agreement lands `pending_authorization`,
permanently.** This is the exact failure mode the build sheet's F-2 row
describes ("evaluates NULL → false → nothing is ever authorized") at a site its
enumeration did not list, and contract §2 states the requirement plainly:
"time authorization treats NULL as uncapped."

Reproduced end to end on `patina_w1r` (probe C4): draft → `upsert_design_services_draft`
with `billingCeilingCents` omitted → send → sign → countersign →

```
PROBE C4: uncapped authority with 1 rate(s), ceiling=NULL
PROBE C4: billable hour on an UNCAPPED authority -> billing_state=pending_authorization  (expected authorized)
PROBE C4: summary state=active remaining=null pendingAuthorization=15000
```

and isolated (probe N(b)) by flipping one authority's ceiling with nothing else
changed:

```
PROBE N(b): capped ceiling -> billing_state=authorized
PROBE N(b): NULL ceiling   -> billing_state=pending_authorization
```

The countersign promotion loop **was** fixed, so the two now disagree: the
promotion loop would authorize the entry the classifier refuses to authorize.
`get_project_authority_summary` reports `state=active, remainingCents=null`
while `pendingAuthorizationCents` climbs and nothing is invoiceable — the
uncapped agreement looks healthy and quietly bills nothing.

**Fix**: graft `classify_project_time_entry_authority` from 00412 verbatim and
make the one comparison NULL-safe, e.g.
`IF COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) IS NULL
 OR v_prior_cents + NEW.rated_amount_cents <= COALESCE(…) THEN`.
Add the reader to the banner's F-2 paragraph, and add an assertion to
`agreement_parts_test.sql` (§6.1 has no time-entry case; criterion N asked for
"log billable time" and it was not exercised).

---

### B2 · major · confidence 1.0 — R5 breached: a `clause` part keyed `patina.ceiling` writes the money row

`supabase/migrations/00575_agreement_parts.sql:1817-1878` (`upsert_agreement_parts`, the `v_terms` build)

The projection is derived **only** by `part_key`; `kind` and `variant` are never
consulted. The build sheet's §3.7 table lists a kind/variant for each key, and
R5 is categorical — "only `schedule` variants project into terms/authority" —
but nothing enforces it. Probe I saved a part list in which the *ceiling* and
*cadence* keys were `clause` parts carrying money in their payload:

```
PROBE I: ceiling=7777777 cadence=milestone deposit=<NULL>
```

Prose became money. Build-sheet review criterion I ("Make a `clause` or `list`
part carry `cents`, `cadence`, `depositPercent` in its payload … Terms row
unmoved. Prose never becomes money.") fails for exactly this shape.

The complementary case is correct: a `schedule/ceiling` part under
`custom.second_ceiling` projects nothing (probe I(b) PASS), and a clause under
`patina.services` carrying `cents` projects nothing.

Not reachable from the W1 composer (custom parts get `custom.<uuid>` keys), but
`upsert_agreement_parts` is `GRANT EXECUTE … TO authenticated`, so any studio
member can post this shape, and the resulting money row is then frozen into the
fingerprint and the countersign snapshot.

**Fix**: add `AND ap.kind = 'clause' | 'list' | 'schedule'` (and, for the
schedule keys, `AND ap.variant = '<the key's variant>'`) to each of the nine
projection subqueries — a part that does not have the shape its key promises
projects nothing.

---

### B3 · major · confidence 1.0 — the refusal predicate and the projection disagree about what "a rate card" is

`supabase/migrations/00575_agreement_parts.sql:177-193` (`_agreement_requires_rate_card`) vs `:1878-1893` (the `v_rates` build)

`_agreement_requires_rate_card` keys on `kind='schedule' AND variant='rate_card'`
— **any** part. The rate projection keys on `part_key='patina.role_rates'` —
**one** part. A rate card composed under any other key therefore demands role
rates that nothing will ever project. Probe P5:

```
PROBE P5: custom-key rate card -> projected rates=0, requiresRateCard=t,
          send=design-services send requires terms, and role rates whenever a rate card is present
```

The parts save succeeds, the R4 floor is satisfied (a ceiling is present), and
then the document is **permanently unsendable** with a message that names a
thing the designer can see is right there on the page. Whether a designer can
reach it depends on the designer lane's add-part menu (a `schedule` part added
blank and set to `rate_card` would do it); the RPC reaches it unconditionally.

**Fix**: make the two agree — either key `_agreement_requires_rate_card` on
`part_key = 'patina.role_rates'`, or project rates from every
`schedule/rate_card` part. The first is smaller and matches the projection's own
"by `part_key`, never by variant" doctrine.

---

### B4 · major · confidence 0.95 — `authorizedCents` is still typed `number`, but the RPC now returns null for it

`packages/types/src/commercial.ts:113` · `supabase/migrations/00575_agreement_parts.sql:1477-1478`

`get_project_authority_summary` returns the **same nullable column** three times:

```sql
    'ceilingCents',    v_authority.billing_ceiling_cents,
    'authorizedCents', v_authority.billing_ceiling_cents,
    'remainingCents',  CASE WHEN … IS NULL THEN NULL ELSE greatest(…) END,
```

The lane widened `ceilingCents` and `remainingCents` to `number | null` and left
`authorizedCents: number`. §3.6 only named the first two, so the sheet led the
lane here — but the type is now a lie at runtime, and TypeScript will not catch
the readers: `money(authority.authorizedCents)`
(`money-region.tsx:205,208`, `project-authority-band.tsx:71`) renders the
uncapped case as `$0`, which is criterion N's named failure ("no UI prints `$0`
where it means uncapped").

**Fix**: `authorizedCents: number | null` with the same comment as its two
siblings. (The app-local mirrors — `apps/designer-portal/src/lib/document/commercial-documents.ts:107,112`
and `apps/client-portal/src/lib/commercial-documents.ts:703` — are the designer
and client lanes' problem, but `finiteCents(...)`/`number(...)` coercing null to
`0` there is the same `$0`-means-uncapped hazard and should be checked in those
reviews.)

---

### B5 · major · confidence 1.0 — the flag-off write path changed: an omitted ceiling now lands NULL, not 0

`supabase/migrations/00575_agreement_parts.sql:1550` (`_project_agreement_terms`)

`00422:1756` read `COALESCE((p_terms->>'billingCeilingCents')::integer, 0)`.
The extracted helper reads `(NULLIF(p_terms->>'billingCeilingCents',''))::integer`
— NULL-preserving — and `upsert_design_services_draft`, the **flag-off** RPC,
now goes through it. Probes C2/C3:

```
PROBE C2: ceiling omitted by the caller -> billing_ceiling_cents = NULL (00422 wrote 0)
PROBE C3: explicit JSON null            -> billing_ceiling_cents = NULL
```

The migration comment defends this as unreachable ("the seven-facet room never
sends null — its hook always writes `Math.round(terms.billingCeilingCents)`").
Two things weaken that:

1. `Math.round(null) === 0` holds, but `Math.round(undefined)` is `NaN` and
   `JSON.stringify(NaN)` is `null` — and this same wave widens
   `DesignServiceTerms.billingCeilingCents` to `number | null`, so the DTO the
   hook reads can now legitimately be absent.
2. The RPC is `GRANT EXECUTE … TO authenticated`; the guarantee lives in one
   caller, not in the function.

Combined with B1 this is the live route to a project that looks fine and bills
nothing. Flag-off byte-identity is asserted for the two portals; this is the one
place where the flag-off **database** behavior is not identical to today.

**Fix**: either keep `COALESCE(…, 0)` in the helper and have
`upsert_agreement_parts` pass an explicit sentinel for "uncapped", or add a
third argument (`p_allow_null_ceiling boolean DEFAULT false`) so only the parts
door can write NULL. Whichever, the flag-off door must write what it wrote
before, byte for byte.

---

### B6 · minor · confidence 1.0 — the DB floor accepts `ceiling = 0` beside a rate card

`supabase/migrations/00575_agreement_parts.sql:1793-1811`

The R4 floor tests `ap.payload->>'cents' IS NOT NULL`, so a ceiling of **zero**
satisfies it. Probe L:

```
PROBE L (ceiling 0 + rate card): err=<accepted> ceiling=0
```

Criterion L lists "rate card + ceiling `0`" among the combinations that must be
blocked. It is blocked only in the designer lane's readiness panel, and the
sheet's own §3.7 step 5 specifies exactly the predicate that was written — so
this is the sheet's gap as much as the lane's. Today's flag-off path also
defaults the ceiling to 0, so it is not a new hazard; but a zero-cap agreement
sends and then authorizes no hour, which reads to a studio exactly like B1.
Worth a `> 0` in the floor, or an explicit ruling that zero is a legal cap.

---

### B7 · minor · confidence 0.9 — `materialize_standard_parts` does not widen `document_kind`, so a legacy draft can hold nine invisible parts

`supabase/migrations/00575_agreement_parts.sql:1920-2101`

`upsert_agreement_parts` runs the `document_kind = CASE WHEN 'legacy' THEN
'design_services'` widen (`:1767`); `materialize_standard_parts` accepts a
`legacy` document and does **not**. Probe L2:

```
PROBE L2: kind before materialize = legacy
PROBE L2: materialized=true, parts=9, kind after = legacy
```

`get_client_commercial_document_bundle`'s legacy early-return (00425, correctly
untouched) then returns no `parts` key at all, while
`_commercial_document_fingerprint` **does** hash those nine parts. If the
composer materializes on open — the sheet's stated flow — a legacy draft ends up
with a composed agreement the client can never see. No in-flight document is
harmed (materialize requires `status = 'draft'`), but the two RPCs should agree.

---

### B8 · minor · confidence 1.0 — the bundle's `parts` key is not "always present"

`supabase/migrations/00575_agreement_parts.sql:2157-2178` (legacy early-return above it)

§2.4 freezes the interface as "a new top-level `parts` key, **always present**,
`[]` when the document has none, so the client adapter never branches on
absence." For `document_kind = 'legacy'` the early-return object has no `parts`
key. §3.10 acknowledges the early-return is untouched, so the two halves of the
sheet disagree; the client lane needs to know which one binds.

---

### B9 · minor · confidence 0.85 — the parts door cannot carry a rate's `effectiveAt`; every save re-stamps `now()`

`supabase/migrations/00575_agreement_parts.sql:1878-1893`

`upsert_agreement_parts` builds `v_rates` with `version`, `roleName`,
`hourlyRateCents`, `sortOrder` and no `effectiveAt`, so
`_project_agreement_terms` defaults each row to `now()`. The seven-facet door
passes the client's value through. `classify_project_time_entry_authority`
filters authority rates on `source.effective_at <= NEW.started_at`, so a rate
stamped at save time does not cover hours logged before that save. Harmless
while the document is a draft; the projection-parity test excludes
`effective_at` and its comment records the divergence, so this is a known,
undocumented-in-the-sheet asymmetry rather than an accident. Flag it for W2 when
`RateCardPayload` grows.

---

### B10 · minor · confidence 0.95 — `useUpdateStudioAgreementDefaults`'s comment contradicts its code

`packages/supabase/src/hooks/use-studio-agreement-defaults.ts:104-107`

> "a plain member's write reaches no rows rather than erroring, so the caller
> checks the returned row"

The mutation ends `.select().single()`. An INSERT blocked by
`studio_agreement_defaults_admin_insert` raises `42501`; an UPDATE filtered to
zero rows makes `.single()` raise `PGRST116`. Either way it throws, and the
caller cannot "check the returned row". The Account → Studio card (designer
lane) will be written against this comment.

---

### B11 · minor · confidence 1.0 — a duplicate `partKey` surfaces a raw constraint name to the client

`supabase/migrations/00575_agreement_parts.sql:1777-1791`

```
PROBE dup partKey -> 23505 duplicate key value violates unique constraint "uniq_agreement_part_key"
```

Every other refusal in this function is a typed `check_violation` /
`insufficient_privilege` with a sentence. This one leaks a database identifier
into whatever the portal renders — and R7 forbids a database column name in
studio-facing text, which a naive error toast would print verbatim.

---

### B12 · nit · confidence 0.9 — `SET CONSTRAINTS uniq_agreement_part_position DEFERRED` is a no-op that leaks

`supabase/migrations/00575_agreement_parts.sql:1773`

The constraint is already `DEFERRABLE INITIALLY DEFERRED`, so the statement
changes nothing — and `SET CONSTRAINTS` is transaction-scoped, so it stays set
for the rest of the caller's transaction. Harmless; remove it or comment why it
is defensive.

---

### B13 · nit · confidence 1.0 — `v_rate` is now an unused declaration

`supabase/migrations/00575_agreement_parts.sql:1596-1610` (`upsert_design_services_draft` DECLARE)

The loop that used it moved into `_project_agreement_terms`. Keeping the DECLARE
makes the "body VERBATIM" claim literally true, which is defensible; say so in a
comment or drop it.

---

### B14 · nit · confidence 1.0 — `design_services_paper_issue_test.sql` is modified but is not on the lane's pathspec list

`supabase/tests/commercial/design_services_paper_issue_test.sql:840-858`

§2.1 lists only `public_sd_hardening_contract_test.sql` as a modified test. The
edit is correct and necessary (00575 reworded two refusal sentences and this
file pins both strings), and it is explained in the lane notes — but the sheet's
file list should have named it, and the reviewer should confirm nothing else
matches those strings. I grepped: the only other occurrence anywhere in
`apps/`, `packages/`, `services/`, `supabase/functions/` is a **comment** at
`apps/designer-portal/src/components/document/commercial/service-agreement-instruments.tsx:145`.
No code branches on the message text.

---

### B15 · nit · confidence 0.8 — new definer RPCs revoke from a narrower set than the 00422 family

`supabase/migrations/00575_agreement_parts.sql:1910-1913`, `:2103-2106`

```sql
REVOKE ALL ON FUNCTION public.upsert_agreement_parts(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.upsert_agreement_parts(uuid, jsonb) TO authenticated;
```

00422's shape is `REVOKE … FROM PUBLIC, anon, authenticated, service_role;` then
`GRANT … TO authenticated;`. On a post-flip stack the outcome is identical, and
Strata predates the flip only for objects that already exist — a brand-new
function has no legacy grant — so this is cosmetic. Matching the family's shape
costs one word and removes the question.

---

## 2 · Advisories (not blocking, not the lane's doing)

- **Criterion E does not hold, and did not hold before.** Deleting a *draft*
  proposal raises `23514 proposal_service_rates is immutable after its proposal
  leaves draft` — the cascade fires the guard after the parent row is gone.
  Reproduced identically on `patina_w1base` **without** 00575. Pre-existing;
  00575 adds `proposal_agreement_parts` to the same class without changing which
  error you get.
- **Five commercial suites are red** on the scratch DB; each fails at the same
  line with the same message at baseline, and all five are in
  `KNOWN_FAILURES.md` Group 3 (`designDisposition` readiness-gate drift). The
  lane's notes report this accurately and my independent run reproduces its
  table row for row.
- **`env.md`'s scratch recipe should drop `--no-acl`.** With ACLs stripped the
  RLS assertions die on `permission denied for table proposals` and a reviewer
  could easily misread that as an RLS defect.
- **Criteria J, K, S, T (portal-side), and U'** (the `commercial-document-notify`
  Deno render of a NULL ceiling) belong to the designer/client lanes and the
  integration steward; not assessed here. `money()` at
  `commercial-document-notify/core.ts:54-55` should be confirmed against a real
  render before deploy.

## 3 · What passed under attack

- **A (F-1)** byte-identical digests, 11/11, before vs after apply.
- **B** every column of a part is inside the hash — I mutated `kind`,
  `variant`, `part_key`, `required`, `source_template_key`, `source_part_id`
  (the six the lane's own file does not cover) and each moved the digest, and
  reverting all six restored it exactly. `created_at`/`updated_at` do not move it.
- **C** a `client_visible = false` part moves the digest **and** is absent from
  the bundle.
- **D** direct `INSERT`/`UPDATE`/`DELETE` as a studio co-member is refused with
  `23514 proposal_agreement_parts is immutable after its proposal leaves draft`
  on `sent` (`proposals.status='sent'`) **and** on executed
  (`proposals.status='accepted'`); the trigger binding exists in `pg_trigger`.
- **F** an outsider sees 0 rows, `INSERT` → `42501`, `UPDATE`/`DELETE` → 0 rows,
  and both RPCs → `42501`. A client sees 0 rows on the raw table.
- **G** a plain active member's `UPDATE` on `studio_agreement_defaults` reaches
  0 rows; an outsider reads 0.
- **H** projection parity: `agreement_parts_projection_test.sql` green, and
  `_project_agreement_terms` read line by line against `00422:1749-1793` differs
  in exactly two places — the NULL-preserving ceiling (B5) and
  `COALESCE(p_rates, '[]'::jsonb)` guarding the loop against a NULL array.
- **O** exactly one hex string moved in the pinned-hash test, and it matches the
  applied function.
- **Q** clean twice.
- **R** the grants seed regenerates to a byte-identical file.
- **T** `kind='wormhole'`, `variant='quantum'`, `payload='{}'` stores without a
  refusal.
- **U** no W2/W3 object anywhere in the diff.
