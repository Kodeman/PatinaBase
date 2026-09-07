# Wave 1 · lane `backend` — notes

Program: **The Agreement, Composed** · Wave 1 · 2026-09-06
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-backend`
Branch: `agreement/w1-backend` · base `4c0b7b17b` (via T0 `f2ad39de5`)

---

## What shipped

| Item | File | State |
|---|---|---|
| The migration | `supabase/migrations/00575_agreement_parts.sql` (2444 lines, 13 functions) | new |
| Generated ACL seed | `supabase/seed/00-legacy-grants.sql` | regenerated (`python3 scripts/generate-legacy-grants.py`, +144 lines) |
| Parts + fingerprint + guard + RLS + R4 floor SQL test | `supabase/tests/commercial/agreement_parts_test.sql` | new — 21 assertions, 12 PASS groups |
| Projection parity SQL test | `supabase/tests/commercial/agreement_parts_projection_test.sql` | new — 7 assertions, 3 PASS groups |
| Pinned-hash re-pin | `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | 1 `body_sha256` re-pinned |
| Refusal-message pins | `supabase/tests/commercial/design_services_paper_issue_test.sql` | 2 expected strings updated |
| Generated DB types | `packages/supabase/src/database.types.ts` | regenerated (+153 / −6) |
| Parts hooks | `packages/supabase/src/hooks/use-agreement-parts.ts` | new |
| Studio-defaults hooks | `packages/supabase/src/hooks/use-studio-agreement-defaults.ts` | new |
| Barrel | `packages/supabase/src/hooks/index.ts` | two export blocks |
| Hook tests | `packages/supabase/src/hooks/__tests__/use-agreement-parts.test.ts`, `…/use-studio-agreement-defaults.test.ts` | new — 24 tests |

`packages/types/src/agreement.ts`, `commercial.ts` and `index.ts` were **already
delivered by the T0 handshake commit `13bc4445c`** on this branch. Verified
character-for-character against build-sheet §2.4 — no edit needed, none made.

**Nothing under `apps/` was touched.** Nothing was pushed. No production
mutation of any kind: no `supabase db push`, no `functions deploy`, no
`wrangler deploy`. The shared local stack was **read only** (one `pg_dump`);
it was never reset, seeded, or written to.

---

## Lineage — every redefined body was grafted from its `grep | sort | tail -1` winner

Verified at authoring time, not trusted from the sheet:

| Function | Head file | Slice | Delta |
|---|---|---|---|
| `guard_commercial_authored_child` | `00423` | 440-464 | one `WHEN 'proposal_agreement_parts'` CASE arm |
| `_commercial_document_fingerprint` | `00423` | 1214-1278 | one conditional `parts` block appended to the `tradeScope` chain |
| `send_commercial_document` | `00423` | 1546-1839 | refusal A predicate + message |
| `_sign_design_services_agreement_authorized` | `00412` | 767-872 | refusal B predicate + message |
| `_issue_design_services_agreement_on_paper` | `00477` | 252-337 | refusal C predicate + message |
| `_countersign_design_services_agreement_impl` | `00566` | 304-874 | one `IS NULL` disjunct (F-2) |
| `get_project_authority_summary` | `00422` | 2381-2489 | two NULL-safe ceiling reads (F-2) |
| `upsert_design_services_draft` | `00422` | 1707-1812 | projection block 1749-1793 → `PERFORM _project_agreement_terms(...)` |
| `get_client_commercial_document_bundle` | `00425` | 1214-1437 | one enumerated `parts` key |

The grafting was done by a script that slices the exact line range out of the
head migration and applies each delta as an **asserted single-occurrence string
replacement** — an anchor that matched zero or two times aborts rather than
emitting a silently-wrong file. So every unchanged line is byte-identical to
its head body, by construction rather than by proofreading.

The superseded ceiling bodies at `00414:911-913`, `00475:891` and `00511:4595`
were deliberately left alone (00566 supersedes them; redefining a superseded
body is the 00199-reverts-00185 failure mode).

---

## Findings

### ⚠ F-5 (NEW — needs an orchestrator ruling). A **fourth** rate-card refusal exists that the build sheet does not list.

`public.record_paper_client_signature` (head **`00425:416`**) carries the same
predicate at **`00425:485-490`**:

```sql
IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
   OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)
THEN RAISE EXCEPTION 'design services agreement requires terms and at least one role rate'
```

Build-sheet §3.6 names three sites (A `send_commercial_document`, B
`_sign_design_services_agreement_authorized`, C
`_issue_design_services_agreement_on_paper`). **This is a fourth.** Left
unrelaxed, per "the refusals relaxed exactly as the sheet lists them".

**Consequence, flag-on:** a composed flat-fee or retainer-only agreement — no
`rate_card` part, therefore no rate rows — can be **sent**, **signed in the
portal**, **issued on paper** and **countersigned**, but its client signature
**cannot be recorded from a printed copy**. The paper-signature door is the one
leg of the rail that still demands a rate the agreement has no reason to carry.
Dark behind `agreement-parts`, so it is not a live defect today.

**Recommendation:** relax it by the same `_agreement_requires_rate_card`
predicate, in Wave 2, from the `00425:416` head body. One-line delta, same
shape as B and C. Needs a ruling because it expands W1's stated scope.

### F-6 (informational, designer lane). `finiteCents` now meets a NULL ceiling.

`apps/designer-portal/src/hooks/use-commercial-documents.ts:214` reads
`billingCeilingCents: finiteCents(row.billing_ceiling_cents)`. That column is
now nullable, and `get_project_authority_summary` now returns
`ceilingCents: null` / `remainingCents: null` on an uncapped authority. The
designer lane's P0 §4.6 already owns widening those readers to
`number | null`; flagged here so the two lanes agree on the shape rather than
discovering it at integration.

### Deliberate deviations from the build sheet

1. **`search_path` on the new functions.** The sheet writes
   `SET search_path TO 'public'` for `_agreement_requires_rate_card` and
   `_project_agreement_terms`. Shipped as `SET search_path = public, pg_temp`
   — the posture of every neighbour in the commercial family (00412 / 00422 /
   00423), and stricter: omitting `pg_temp` leaves it implicitly *first* in
   the resolution order. Nothing pins these functions, so no contract moves.
2. **Two refusal-message pins in an existing test.** The sheet's backend
   pathspec list does not name
   `supabase/tests/commercial/design_services_paper_issue_test.sql`, but its
   own gate list runs it, and it asserts the two refusal strings the sheet
   instructs us to reword (`:843`, `:853`). Updated to the new sentences with
   a comment saying the *bar* did not move, only the words. Without this the
   suite goes red on a message the sheet itself dictated.
3. **`agreement_parts_test.sql` §14, the outsider INSERT.** The sheet expects
   `42501`. The actual first refusal is `check_violation` from
   `guard_commercial_authored_child`: that guard is `SECURITY INVOKER`, so its
   own `proposals` read runs under the outsider's RLS, finds nothing, and
   refuses in the freeze guard's words before the parts table's `WITH CHECK`
   is ever evaluated. The test accepts either errcode and additionally
   asserts that no row landed — the property that actually matters.
4. **One extra test group (21).** `materialize_standard_parts` seeding from
   `studio_agreement_defaults` is P3's whole point and the sheet's §6.1 table
   does not cover it. Added as PASS 21.

---

## Verification (all evidence below is from a run, not from a plan)

### Scratch database

The shared stack was **not** reset. A scratch DB `patina_w1` was built from a
`pg_dump` of the shared stack (head **00574**, confirmed by
`select version from supabase_migrations.schema_migrations order by version desc limit 1`),
restored as `supabase_admin` (the local `postgres` role cannot `SET ROLE
supabase_admin`, which is what the plain-`postgres` restore choked on), with
`-N cron` (pg_cron can only live in the `postgres` database, and its unrestorable
`COPY` corrupted the rest of the stream).

Five FK constraints failed to re-validate on restore
(`engagement_events_user_id_fkey`, `invoice_links_created_by_fkey`,
`invoice_links_invoice_id_fkey`, `organization_members_user_id_fkey`,
`user_roles_user_id_fkey` — pre-existing orphan rows in the shared stack, not
anything 00575 did). They were re-added `NOT VALID` before type generation,
because without them the generated `Relationships` blocks would have silently
lost those edges and the types diff would have been wrong.

### Migration apply

```
psql patina_w1 -v ON_ERROR_STOP=1 -f supabase/migrations/00575_agreement_parts.sql
→ clean, COMMIT. Re-run on the same DB → clean again (idempotent; only
  "already exists, skipping" notices).
```

`billing_ceiling_cents` `attnotnull = f` on **both**
`proposal_service_terms` and `project_billing_authorities`, probed directly
via `pg_attribute`.

### SQL suites (scratch DB rebuilt clean from 00574, 00575 applied)

| Suite | rc | PASS groups |
|---|---|---|
| `commercial/agreement_parts_test.sql` | **0** | 12 (21 assertions) |
| `commercial/agreement_parts_projection_test.sql` | **0** | 3 (7 assertions) |
| `commercial/multi_studio_signature_test.sql` | **0** | 7 |
| `commercial/design_services_paper_issue_test.sql` | **0** | 13 |
| `schedule/ceremony_hardening_test.sql` | **0** | 15 |
| `edge_api/public_sd_hardening_contract_test.sql` | **0** | — (assert-only) |
| `commercial/design_services_authority_test.sql` | 3 | KNOWN_FAILURES · **identical line + message before and after 00575** |
| `commercial/design_services_gap_hardening_test.sql` | 3 | KNOWN_FAILURES · identical before/after |
| `commercial/authorized_schedule_test.sql` | 3 | KNOWN_FAILURES · identical before/after |
| `commercial/executed_on_paper_test.sql` | 3 | KNOWN_FAILURES · identical before/after |
| `commercial/trade_scope_test.sql` | 3 | KNOWN_FAILURES · identical before/after |

**The five red suites were red at baseline too** — the same run was done
against the scratch DB *before* applying 00575 and each failed at the same
line with the same message. All five are listed in
`supabase/tests/KNOWN_FAILURES.md` (Group 3). Their recorded failure point
there is the `designDisposition` readiness gate, which is *later* than where
they die today — 00563/00566's countersign studio resolution moved the failure
earlier; that drift predates this wave and is not caused by it.
`trade_scope_test.sql` and `executed_on_paper_test.sql` are in the gate list
precisely because the fingerprint and the bundle are shared with those rails:
their behavior is unchanged, before and after, to the character.

### Re-pinned hash

`public._countersign_design_services_agreement_impl(uuid,text,jsonb)`
`430d3a45…a854a770` → **`8995735d7c966a6bd4db4a1669ee043b12398b9d64fe676c2281ece2536bc0b3`**,
obtained the 00566 way:

```sql
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid = to_regprocedure(
  'public._countersign_design_services_agreement_impl(uuid,text,jsonb)');
```

Confirmed by grep that of everything 00575 redefines, this is the **only**
pinned entry; `sign_design_services_agreement_with_trusted_ip` **is** pinned
and is **not** redefined. The dependency manifest's other assertions (ACL,
caller contract, lock order) pass unchanged — `CREATE OR REPLACE` preserves
the ACL 00511 emptied.

### Types

```
supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54322/patina_w1
  > packages/supabase/src/database.types.ts
git diff --stat → 153 insertions(+), 6 deletions(-)
```

The only **deletions** are the six `billing_ceiling_cents: number` lines that
became `number | null`. Additions: `proposal_agreement_parts`,
`studio_agreement_defaults`, `upsert_agreement_parts`,
`materialize_standard_parts`. A second regen against the freshly rebuilt
scratch DB is **byte-identical** to the committed file, so the
`git diff --exit-code` gate is clean after staging.

### Package gates

```
pnpm --filter @patina/types type-check          → clean
pnpm turbo build --filter=@patina/types         → 1/1 successful (cached; dist/agreement.js present)
pnpm --filter @patina/supabase type-check       → clean
pnpm --filter @patina/supabase test             → 87 files, 1060 passed | 12 skipped
   (of which the two new files: 24 passed)
```

### Not verified here

- `pnpm supabase:reset` against the **shared** stack — deliberately not run;
  the integration steward owns that reset. The migration is proven against a
  00574 snapshot of that exact stack, and the regenerated ACL seed has not yet
  been exercised by a real reset.
- Nothing in `apps/` — no portal type-check, no jest, no Playwright. Out of
  lane.
- Strata: untouched, unqueried, not pushed.

---

## Round 1 — adversarial review fixes (2026-09-06)

Five findings, all addressed. Scratch DB for this round: `patina_w1f`
(`pg_dump --no-owner --exclude-schema=cron` of the shared stack at head
`00574`, restored WITH ACLs — a `--no-acl` restore makes every `SET LOCAL ROLE
authenticated` section fail `permission denied for table proposals`, so the
brief's `--no-acl` flag was dropped deliberately). A second DB, `patina_w1base`,
holds the same snapshot WITHOUT `00575` as a control.

### B1 (blocker) — `classify_project_time_entry_authority` was F-2's fourth reader

`00412:2607-2613` compares `v_prior_cents + NEW.rated_amount_cents <=
COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents)`. On an
uncapped authority that comparison is NULL, the `ELSE` fires, and every
billable hour lands `pending_authorization` forever — a project that looks
healthy and bills nothing.

Grafted the whole `00412:2400` body into `00575` (PART 4c, now "the FOUR
NULL-unsafe ceiling readers") verbatim — extracted programmatically from
`00412`, not retyped — with one delta: the comparison gains a leading
`COALESCE(…) IS NULL OR`. `00412` is the sole and current head
(`grep -rln "CREATE OR REPLACE FUNCTION[^(]*classify_project_time_entry_authority"
supabase/migrations/*.sql | sort` → one file). The trigger
`aac_classify_project_time_entry_authority_trg` is untouched (CREATE OR REPLACE
swaps the body beneath it), and the stable-project-row `FOR UPDATE` that
`design_services_authority_test.sql:191` pins is exactly where `00412` put it.
The function is **not** pinned in `public_sd_hardening_contract_test.sql` (no
occurrence in `supabase/tests/edge_api/`), so no hash re-pin was owed.

Banner: the F-2 paragraph now names four readers and cites `00412:2607-2613`;
the lineage block gains `classify_project_time_entry_authority 00412:2400`.

**Negative control.** With the fix in place `agreement_parts_test.sql` exits 0.
Re-applying the untouched `00412` body to the same scratch DB and re-running:

```
psql:supabase/tests/commercial/agreement_parts_test.sql:949: ERROR:
  F-2: NULL is uncapped — a billable hour on an uncapped authority is
  authorized, got 'pending_authorization'
exit=3
```

### B2 (major) — R5: a standard key was enough; the shape was not checked

`upsert_agreement_parts` derived the money projection from `part_key` alone, so
a `clause` keyed `patina.ceiling` wrote `billing_ceiling_cents`. All ten
projection subqueries (nine keys; `patina.retainer` reads twice) now assert the
kind, and every schedule key also asserts the variant:

| key | shape now required |
|---|---|
| `patina.services`, `patina.terms` | `kind = 'clause'` |
| `patina.deliverables`, `patina.exclusions` | `kind = 'list'` |
| `patina.ceiling` | `schedule` / `ceiling` |
| `patina.retainer` (×2) | `schedule` / `retainer` |
| `patina.cadence` | `schedule` / `cadence` |
| `patina.deposit` | `schedule` / `procurement` |
| `patina.role_rates` | `schedule` / `rate_card` |

### B3 (major) — the refusal and the projection read different parts

`_agreement_requires_rate_card` keyed on `kind='schedule' AND
variant='rate_card'` (ANY part) while the rate projection keys on
`part_key='patina.role_rates'` (ONE part), so a rate card under any other key
demanded role rates that nothing would ever project and the document could
never be sent. The predicate now reads `part_key = 'patina.role_rates'` in the
`schedule`/`rate_card` shape — the smaller side, and the one that matches the
projection's own "by part_key, never by variant" doctrine.

The R4 floor inside `upsert_agreement_parts` was keyed the same wrong way (it
would have refused a custom-key rate card for lacking a cap on money it never
carries), so both halves of that floor now read `patina.role_rates` and
`patina.ceiling` in shape too. Projection, floor and refusal are one set.

### B4 (major) — `authorizedCents` was still `number`

`get_project_authority_summary` returns the same nullable
`billing_ceiling_cents` for `authorizedCents` that `ceilingCents` and
`remainingCents` were widened for. `packages/types/src/commercial.ts` →
`authorizedCents: number | null`, with the sibling comment. `pnpm --filter
@patina/types build` re-emitted `dist/` so the designer and client lanes see it.
The app-local mirrors (`apps/designer-portal/src/lib/document/commercial-documents.ts`,
`apps/client-portal/src/lib/commercial-documents.ts`) are those lanes' — flagged
as an advisory, not touched from here. The client mirror's
`ProjectAuthoritySummary extends Omit<ProjectBillingAuthoritySummary, 'rates'>`
still type-checks: its `number(...)` coercion widens into `number | null`.

### B5 (major) — the flag-off write path had changed

`_project_agreement_terms` had replaced `00422:1756`'s
`COALESCE((p_terms->>'billingCeilingCents')::integer, 0)` with a NULL-preserving
read for BOTH callers, so an omitted or JSON-null ceiling through
`upsert_design_services_draft` — the flag-off RPC, `GRANT`ed to `authenticated`
— landed NULL where 00422 landed 0.

The helper now takes `p_allow_null_ceiling boolean DEFAULT false`; the `false`
branch is `00422:1756` character for character. `upsert_design_services_draft`
passes `false`, `upsert_agreement_parts` passes `true`. A
`DROP FUNCTION IF EXISTS public._project_agreement_terms(uuid, jsonb, jsonb)`
precedes the definition so a re-run cannot leave two ambiguous overloads. The
guarantee now lives in the function, not in one TypeScript caller's discipline.

### Tests added

`supabase/tests/commercial/agreement_parts_test.sql`
- **(22)** a `schedule`/`rate_card` under `custom.trade_rates`: projects no
  rates, `_agreement_requires_rate_card` is false, the R4 floor stays quiet, and
  the document **sends** (B3).
- **(23)** the uncapped-with-rates authority, reached the way a studio reaches
  it — the terms row is studio-writable while the document is a draft
  (`proposal_service_terms_studio_rw`, `00412:318`), so the ceiling is cleared
  there, then send → sign → countersign. A billable hour on that authority is
  `authorized` and rates at 15000; the summary reads `accrued 15000 / pending 0
  / state active`; and a ceiling of 1 still parks the next hour (B1).

`supabase/tests/commercial/agreement_parts_projection_test.sql`
- **(8)** six parts under standard keys in the WRONG shape — a clause keyed
  `patina.ceiling` carrying `cents`, a clause keyed `patina.cadence` naming a
  cadence, a list keyed `patina.retainer` carrying cents and an activation
  policy, a list keyed `patina.role_rates` carrying roles, a clause keyed
  `patina.deposit` quoting a percent — project **nothing**, are all still
  stored, and the one correctly-shaped part still projects (B2).
- **(9)** the flag-off door: omitted ceiling → 0, explicit JSON null → 0, a real
  number → whole (B5).

### Gates, round 1

```
# scratch DB, head 00574 confirmed
select version from supabase_migrations.schema_migrations order by version desc limit 3
  → 00574 / 00573 / 00572

psql -d patina_w1f -v ON_ERROR_STOP=1 -f supabase/migrations/00575_agreement_parts.sql
  → COMMIT, exit 0
  → re-applied a second time on the same DB: exit 0 (idempotent)

psql -d patina_w1f -f supabase/tests/commercial/agreement_parts_test.sql
  → exit 0, 14 PASS notices (was 12; (22) and (23) are new)
psql -d patina_w1f -f supabase/tests/commercial/agreement_parts_projection_test.sql
  → exit 0, 5 PASS notices (was 3; (8) and (9) are new)
psql -d patina_w1f -f supabase/tests/edge_api/public_sd_hardening_contract_test.sql
  → exit 0   (same file on patina_w1base, no 00575: exit 3,
              "an exact 00511 dependency profile drifted" — the re-pin is right)

PGURL=…/patina_w1f  scripts/run-sql-tests.sh -d supabase/tests/commercial
  → 12 total, 6 green, 6 fail
PGURL=…/patina_w1base scripts/run-sql-tests.sh -d supabase/tests/commercial
  → 12 total, 3 green, 9 fail
```

The six red files are **identical in both runs** — `authorized_schedule`,
`design_services_authority`, `design_services_gap_hardening`,
`executed_on_paper`, `trade_rfq`, `trade_scope`. They are scratch-DB
environment failures, not `00575`: the `pg_dump` restore could not carry the
`cron` schema, the vault secrets, or the seed rows behind five FK constraints,
and these suites lean on that seed. `00575` moves three files from red to
green (`agreement_parts_test`, `agreement_parts_projection_test`,
`design_services_paper_issue_test`) and moves none the other way.

```
supabase gen types typescript --db-url …/patina_w1f > packages/supabase/src/database.types.ts
git diff --stat → 1 file, 6 insertions(+), 1 deletion(-)
```

The only delta is `_project_agreement_terms`'s `Args` gaining
`p_allow_null_ceiling?: boolean`. Five FK-relationship blocks that the degraded
restore had dropped were repaired on the scratch DB first (orphan rows deleted
with `session_replication_role = replica`, then the five `ADD CONSTRAINT`s from
the dump replayed) so the regen would not silently strip real relationship
metadata from the committed file.

```
python3 scripts/generate-legacy-grants.py
  → baseline + 2222 replayed statements; +7/-1
  → picks up REVOKE on classify_project_time_entry_authority(), and
    _project_agreement_terms's new 4-arg signature

pnpm --filter @patina/types type-check     → clean
pnpm --filter @patina/supabase type-check  → clean
pnpm --filter @patina/supabase test        → 87 files, 1060 passed | 12 skipped
```

Scratch DBs `patina_w1f` and `patina_w1base` dropped at the end of the round.
Shared stack never reset, never written. Strata untouched.

---

# Round 2 — the five findings of `backend-review-r2.md`

Verdict taken as written: one blocker (N1) and four majors (N2–N5). The
blocker was not in the SQL's correctness. It was that round 1 made the
predicate, the R4 floor and the projection agree with each other on
`part_key = 'patina.role_rates'`, and the third party to that agreement — the
composer, which mints `custom.<uuid>` for every part added from the rail —
was never brought into it.

## The ruling this round takes, and why

N1 offered two roads: (a) project each money variant from the single part
carrying that kind/variant whatever its key, refusing a second; or (b) make
the composer re-use the standard `patina.*` key when an added part matches an
empty standard slot.

**(a).** Three reasons, in order of weight:

1. It is what a designer means. A studio that deletes the seeded Ceiling and
   adds a fresh one has not created a footnote; it has stated the cap. Under
   (b) the same act would be a cap only if the old slot happened to be empty,
   which is a rule about keys and no designer will ever hold it.
2. **It closes N2 with no second edit.** `readiness.ts` already keys R-5/R-6/R-7
   on `kind === 'schedule' && variant === '…'` (`:58`, `:212`, `:218-224`,
   build sheet §4.4). Moving the DB onto the same ground makes panel and
   database read the same thing by construction, in both directions — no
   false-green executed agreement with zero authority rates, no false-red
   "needs a ceiling" for a rate card that would never project. Under (b) the
   panel and the database would still be reading two different questions and
   agreeing only by the composer's good behaviour.
3. It survives Wave 2. The Library will mint parts under `studio.<slug>`
   keys; a projection keyed on `patina.*` would have to learn every new key
   namespace, and a projection keyed on the shape already knows them all.

What (a) costs: "the ceiling" must be a scalar, so a **second part of any
money shape is refused** rather than silently ranked. That refusal is new
surface, and it is written in the words a designer uses for the part —
`an agreement carries only one ceiling` — never the words the table uses (R7).

**Prose did not move.** The four prose slots (`scope`, `deliverables`,
`exclusions`, `terms`) still read by key: two clauses cannot both be "the
scope", `UNIQUE (proposal_id, part_key)` already makes each a scalar, and R5
is a rule about money, not about which clause is which. Every subquery on
both sides still asserts the kind, so a clause keyed `patina.ceiling` is
still prose that mentions a cap and writes nothing (projection case 8 stands
unchanged).

## What changed, finding by finding

### N1 · blocker — money is read by shape

`upsert_agreement_parts`: the five money subqueries (`billingCeilingCents`,
`retainerAmountCents`, `retainerActivationPolicy`, `billingCadence`,
`furnishingsDepositPercent`) and the rates aggregate dropped their
`part_key = 'patina.…'` predicate and now read `kind = 'schedule' AND
variant = '…'` alone. A new refusal runs before the projection: at most one
part of each of the five projecting shapes, named for the designer
(`rate card`, `ceiling`, `retainer`, `billing cadence`, `furnishings
deposit`).

Proof on the applied scratch DB, straight out of `pg_proc`:

```
money key still a PREDICATE in upsert: <none — money reads by shape only>
prose keys still predicates (expected 4): patina.deliverables, patina.exclusions,
                                          patina.services, patina.terms
```

Test 22 was inverted. It used to pin "a rate card under a custom key projects
nothing and demands nothing"; it now composes exactly what the rail emits —
rate card $225/hr, ceiling $24,000, retainer $5,000 / `retainer_paid`, cadence
`biweekly`, deposit 25%, every one under `custom.<uuid>` — and asserts each
figure lands in `proposal_service_terms` / `proposal_service_rates`, that the
uncapped version of it is refused, and that a second ceiling raises
`an agreement carries only one ceiling` leaving no parts behind.

### N2 · major — readiness and the database read the same question

No `readiness.ts` edit. `_agreement_requires_rate_card` dropped
`part_key = 'patina.role_rates'` for the shape, and the R4 floor moved into
`_agreement_floor_unmet`, whose two halves are the panel's own tests:

| | `readiness.ts` | `_agreement_floor_unmet` |
|---|---|---|
| bills time | `variant === 'rate_card'` and some role with a non-blank name and `hourlyRateCents > 0` (`:210-218`) | `variant = 'rate_card'` and some role with `btrim(roleName) <> ''` and `hourlyRateCents > 0` |
| has a cap | a `variant === 'ceiling'` part with `cents > 0` (`:219-224`) | a `variant = 'ceiling'` part with `cents > 0` |

The ceiling half is `> 0`, not `IS NOT NULL` — which also closes round 1's
**B6** ("the floor accepts ceiling `0` alongside a rate card"). A zero cap
beside a rate card authorizes no hour at all; it is not a cap, it is a
document that bills nothing, and the panel already said so. Making the two
agree and closing B6 turned out to be the same edit.

Both halves ask `jsonb_typeof(...) = 'number'` before any cast, so a
malformed payload fails the test instead of raising `22P02` in the middle of
a send.

### N3 · major — the floor at every door out of draft

`_agreement_floor_unmet` is now called by `upsert_agreement_parts` (save),
`send_commercial_document`, `_sign_design_services_agreement_authorized` and
`_issue_design_services_agreement_on_paper` (the three doors out of draft).
Same sentence at all four.

```
Q3-fix send asks the floor = true
Q3-fix sign asks the floor = true
Q3-fix paper asks the floor = true
```

**`materialize_standard_parts` deliberately does NOT ask it.** The first
attempt did, and case 21 caught the cost immediately: a studio whose
`studio_agreement_defaults.rate_card` carries roles and whose defaults name no
ceiling would be locked out of the composer altogether, refused on the way in
with a sentence about a part the room has not shown it yet. Seeding is not
composing — it lays out a state that already exists so the room can render it.
The harm in probe Q3 was never the seeding; it was the line after it,
`Q3 send of an uncapped HOURLY agreement -> <sent>`, and that is closed at the
send door. The room's readiness panel names the missing ceiling the moment the
rail renders, and the save door refuses the composition until it is there.

Test 24 is Q3's exact route, end to end: co-member clears the ceiling on the
terms row while draft → `materialize_standard_parts` seeds (asserted to
succeed, ceiling part empty) → `_agreement_floor_unmet` true → **send refused**
→ document still `draft` → **save refused with the same sentence**. Plus the
other road in: parts saved while capped, cap emptied underneath, send refused.

### N4 · major — one write door

`GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` became an explicit
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` plus
`GRANT SELECT`. The REVOKE is explicit rather than merely absent because the
platform still carries `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO
authenticated` on this stack — visible in the contrast on the applied DB,
where the peer table keeps every privilege from that default and the parts
table keeps one:

```
parts.authenticated:    SELECT
parts.anon:             <none>
defaults.authenticated: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

The `FOR ALL` policy is kept as a second wall rather than narrowed, so a
restored grant does not silently reopen the door to a non-co-member.

Cases 13-15 were rewritten around it. The co-member reads nine parts, is
refused `42501` on a direct UPDATE / INSERT / DELETE, and the test asserts the
thing the grant exists to protect: **the digest did not move and the money row
did not move**, because nothing was written. Then the same co-member composes
through `upsert_agreement_parts` and the edit lands. The outsider's three ops
are refused; the client sees nothing on the raw table and reads the bundle.

### N5 · major — NOT fixed here, and deliberately

`apps/designer-portal/src/lib/document/commercial-documents.ts` belongs to the
designer lane, and **the designer lane has already fixed it** — commit
`ead9c3b12` on `agreement/w1-designer`, "an uncapped agreement has no budget,
not a spent one":

```
apps/designer-portal/src/lib/document/commercial-documents.ts:93
  authorizedCents: number | null;
apps/designer-portal/src/components/document/commercial/money-region.tsx:212-213
  authority && authority.authorizedCents !== null ? money(authority.authorizedCents) : …
```

with `money-region.test.tsx`, `project-authority-band.test.tsx` and
`use-commercial-documents-authority.test.tsx` covering all three surfaces the
review named. Their own round-2 review carries it (`designer-review-r2.md`
:78-84) with a wider fix than this lane would have written — `nullableFiniteCents`
on the adapter and "No ceiling" copy in three places.

Making the same edit on this branch would land two versions of the same change
in the same four files and hand the integration steward a conflict in exactly
the code the fix is about. Recorded as an advisory instead; the orchestrator
should confirm `ead9c3b12` is in the merge.

## Still open from round 1, not routed to this round

Round 2 listed N1–N5 only, so these were left where the reviewer left them:
**B6** is closed as a side effect of N2 (above). **B7** (materialize does not
widen `document_kind`), **B8** (the bundle's legacy early-return omits
`parts`), **B9** (rate `effectiveAt` not carried through the parts door),
**B10** (`useUpdateStudioAgreementDefaults` doc comment says "zero rows" where
the DB raises `42501`), **B11** and **N6** (a duplicate `partKey` and an
incomplete rate row surface `uniq_agreement_part_key` / `hourly_rate_cents`
to the studio — R7 forbids a column name in studio-facing text), **B12**
(`SET CONSTRAINTS … DEFERRED` is a no-op), **B13** (`v_rate` unused), **B15**
(the new definer RPCs' `REVOKE` list omits `authenticated` before granting it
back) all stand. B11/N6 are the same class as the refusal this round added and
would be cheap to close together in a round 3.

## Gates — round 2

Scratch DB `patina_w1fix`, built from a `pg_dump --no-owner -Fc` of the shared
stack at `00574` and `pg_restore`d **without** `--no-acl` (env.md's recipe
strips every grant, and the first attempt this round died on
`permission denied for table proposals` inside the parts RLS policy — the A1
advisory, confirmed a third time and now with a symptom). The five FK
constraints the restore drops were replayed `NOT VALID`, because the shared
stack itself carries orphan rows behind them; `pg_constraint` count 851 = 851,
so the type regen reads the same relationship metadata the committed file was
built from.

```
head=00574
psql -f 00575_agreement_parts.sql                       APPLY-RC=0
                                                        APPLY2-RC=0   (re-applied, idempotent)
F-1 HOLDS: 11/11 digests byte-identical across the apply

commercial/agreement_parts_test.sql                     rc=0  PASS=15
commercial/agreement_parts_projection_test.sql          rc=0  PASS=5
commercial/design_services_paper_issue_test.sql         rc=0  PASS=13
commercial/multi_studio_signature_test.sql              rc=0  PASS=7
schedule/ceremony_hardening_test.sql                    rc=0  PASS=15
edge_api/public_sd_hardening_contract_test.sql          rc=0  (asserts only)
edge_api/public_rpc_authorization_contract_test.sql     rc=0  (asserts only)
```

Seven suites stay red, and every one fails **identically on a `patina_w1base`
DB restored from the same dump WITHOUT 00575** — same rc, same file, same
line, same message:

```
authorized_schedule_test           base rc=3 / 00575 rc=3  :308 design services agreement d73…001 not found or access denied
design_services_authority_test     base rc=3 / 00575 rc=3  :177 design services agreement d53…001 not found or access denied
design_services_gap_hardening_test base rc=3 / 00575 rc=3  :128 proposal d63…001 failed canonical project provenance
direct_order_attribution_test      base rc=3 / 00575 rc=3  :488 two roster designers on one day must file the order uncredited
executed_on_paper_test             base rc=3 / 00575 rc=3  :214 design services agreement ea3…001 not found or access denied
trade_rfq_test                     base rc=3 / 00575 rc=3  :154 design services agreement d93…001 not found or access denied
trade_scope_test                   base rc=3 / 00575 rc=3  :196 design services agreement d83…001 not found or access denied
edge_api/platform_acl_compatibility_test  base rc=3 / 00575 rc=3  :125 PUBLIC must retain only CONNECT
```

They are scratch-restore artifacts (the restore cannot carry `cron`, the vault
secrets, or the seed rows behind those FKs; a fresh `CREATE DATABASE` grants
PUBLIC `CONNECT, TEMPORARY`). **They remain unverified against this change** —
the integration steward's `pnpm supabase:reset` is the only run that proves
them, and it must happen before merge. This is unchanged from round 1 and the
reviewer confirmed it independently.

The pinned-hash contract test needed **no** re-pin this round.
`_countersign_design_services_agreement_impl` — the one function
`public_sd_hardening_contract_test.sql` pins by `body_sha256` — was not
redefined in round 2, and its round-1 pin
(`8995735d7c966a6bd4db4a1669ee043b12398b9d64fe676c2281ece2536bc0b3`) still
matches. The three functions that DID change bodies are reached by that file
only through substring assertions (`_sign_design_services_agreement_authorized`
must not contain `issue_invoice(` or `request.jwt.claims`; the added floor
check contains neither), which is why it is rc=0 rather than re-pinned.

```
python3 scripts/generate-legacy-grants.py
  → baseline + 2224 replayed statements; +13/-1
  → the parts-table REVOKE/GRANT pair and _agreement_floor_unmet's REVOKE

supabase gen types typescript --db-url …/patina_w1fix
  → diff vs the committed file: 4 lines, all of them _agreement_floor_unmet's
    Args/Returns block. Applied; regenerated a second time against the
    freshly-rebuilt DB and the committed file came back byte-identical.

pnpm --dir packages/types    type-check   → clean (tsc --noEmit, no output)
pnpm --dir packages/supabase type-check   → clean (tsc --noEmit, no output)
pnpm --dir packages/supabase test         → 87 files, 1060 passed | 12 skipped
```

Scratch DBs `patina_w1fix` and `patina_w1base` dropped at the end of the round.
Shared stack never reset, never written, still `00574`. No `db push`, no
`functions deploy`, no `wrangler`. Strata untouched. Nothing pushed.

# Round 3 — the four findings after the R17–R21 rulings (2026-09-06)

`R1` blocker, `R2` `R3` `R4` major. All four addressed. One sentence on what
each of them actually was:

## R1 · blocker — R17 was ruled and never built

The ruling said three walls; the file had none of them, and the divergence it
forbids ran end to end. A flag-off co-member could call
`upsert_design_services_draft` on a composed draft and the whole ceremony
completed: the page the client signed said ceiling 2,400,000 / biweekly /
22500 an hour, and the authority the studio bills against said 500,000 /
monthly / 9900. The fingerprint cannot catch it — it hashes both halves, so
both halves moved together and the digest agreed with itself.

All three walls are now in the migration, in a new **PART 5b**:

- **(a) the trigger.** `guard_agreement_projection_write` fires
  `BEFORE INSERT OR UPDATE OR DELETE` on `proposal_service_terms` and on
  `proposal_service_rates` and refuses while the proposal has parts, unless
  the transaction-local GUC `app.agreement_projection` names that proposal.
  `upsert_agreement_parts` sets it for exactly the width of the
  `_project_agreement_terms` call and restores it after — and again in the
  `EXCEPTION` handler, beside the existing `app.commercial_document_id`
  restore. It is `SECURITY DEFINER` on purpose: "does this document have
  parts" has to be total, and asked as the caller an RLS-invisible part would
  answer "no" exactly where the wall is needed. Trigger firing order is
  alphabetical, and `guard_…_authored` < `guard_…_projection`, so a frozen
  document still refuses in the freeze's own words.
- **(b) the typed refusal.** `upsert_design_services_draft` raises
  `'This agreement is composed from parts. Open it in the Contract Room with
  parts on to change it.'` with `DETAIL = 'agreement_composed'`. Both halves
  are load-bearing: the flag-off seven-facet room prints the MESSAGE as one
  plain sentence beside a disabled Save (R17 gives that sentence verbatim),
  and a caller that wants to branch reads the DETAIL token. The refusal
  stands after the access and kind checks, so a stranger still learns nothing
  but `access denied`. The trigger raises the identical pair, so the room
  reads one sentence whichever wall stopped it.
- **(c) the grant.** `REVOKE INSERT, UPDATE, DELETE ON proposal_service_terms,
  proposal_service_rates FROM authenticated, anon` (00412:399-400 granted the
  full write set when the seven-facet room was the only author). Nothing in
  `apps/`, `packages/` or `supabase/functions/` writes either table — the
  portal reads them (`use-commercial-documents.ts:302-307`) and the notify
  function reads two columns (`commercial-document-notify/index.ts:363`); the
  grep is in the migration comment. `anon`'s write set went with it: this
  stack's pre-flip creation defaults granted it and no migration ever asked
  for it. `SELECT` re-granted explicitly. ACL seed regenerated.

Three test fixtures wrote those tables by hand as `authenticated` and had to
move, because they were exercising a door that no longer exists:
`agreement_parts_test.sql` cases 23 and 24 (the Q3 route began with a
co-member clearing the ceiling — that step is now itself a refusal, asserted,
and the state is stood up owner-side) and
`public_sd_hardening_contract_test.sql`'s canonical addendum fixture (split so
the terms edit happens with `RESET ROLE` between two `authenticated` blocks;
the send it was setting up is still the authenticated act being tested).

## R2 · major — money was typed on one side of the wall only

`_agreement_floor_unmet` asks `jsonb_typeof(...) = 'number'` before it counts
a figure. The projection cast with `->>` and asked nothing. So a rate card
whose `hourlyRateCents` arrived as the STRING `"22500"` billed real hours
against a ceiling the floor could not see and SENT (probe P17), and the mirror
— a ceiling stated as `"2400000"` beside a numeric rate card — earned "an
agreement that bills time needs a ceiling", a red for the wrong reason (P18).

Taken the second way the finding offers: refuse at the door. Every money
figure now passes `_agreement_assert_cents(payload, field, noun)` before
anything is written — a whole, non-negative, in-range JSON number, asked with
`jsonb_typeof` exactly as the floor asks it, `noun` being the designer's word
for the figure. Absent or JSON null still returns NULL: R21's "Not yet set" is
a legal state of a draft, and the R4 floor, not this function, decides whether
it may leave one. Both probes are pinned as cases; P18 now earns its own
sentence ("the ceiling needs an amount in dollars and cents") instead of the
floor's.

## R3 · major — six database identifiers were reaching the designer

The composer prints the RPC's error text as its save note. A pre-write
validation loop over `p_parts` now answers all of them in the designer's
words, before any row lands — the six the review named plus two of the same
class it did not: a rate card naming one role twice (which the rates table's
unique index would have answered with its own name) and a retainer activation
policy outside the two the money row can hold. `per_draw` is refused here in
words a designer can act on: the contract's `CadencePayload` admits it and the
`billing_cadence` CHECK does not widen until Wave 3.

The test does not only pin the eight sentences — it also asserts that not one
of them matches `(violates|constraint|column|relation|proposal_service|
proposal_agreement|uniq_agreement)`, which is the assertion that survives a
reworded refusal.

## R4 · major — two implementations of the same three hooks

The designer lane's own comment says why its copy exists: it "cannot touch
`packages/**` while the backend lane is building the matching table and its
package hook concurrently", and it froze the query keys so "the integration
step is a one-line import swap".

**Decision recorded for the integration steward: the `@patina/supabase` hooks
are the survivor** (CLAUDE.md — `@patina/supabase` hooks for Supabase data;
contract §3 names these two module paths). What this round did is remove the
divergence that would have made that swap a rewrite:

- `useSaveAgreementParts(proposalId, { onSaved })` and
  `useMaterializeStandardParts(proposalId, { onSaved })` now bind the proposal
  at construction and take the domain `AgreementPart[]`, exactly as the app's
  copies do; `toAgreementPartPayload` is the same mapping the app's private
  `toPartPayload` performs. Mutation keys (`save-agreement-parts` /
  `materialize-standard-parts`) and the invalidated families
  (`agreement-parts` / `commercial-documents` / `proposal`) now match too, and
  `agreementPartsKey(id)` is exported as the app's spelling of the same key.
- `onSaved` is awaited between the RPC and the invalidation, which is where an
  app that keeps its own document bundle refetches and seeds it — the one
  thing a package hook cannot do for it (the bundle fetcher is app-local).
- `useStudioAgreementDefaults` now reads a FAILED lookup as the Patina
  standard, not as a throw — the designer lane's reason, adopted: 00575 lands
  on Strata on its own schedule and the Worker deploys on another, and the
  Account page must render in the window between.

**What integration still has to do**, and it is two mechanical edits, not a
judgement: delete
`apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts` and the two
part hooks in `use-commercial-documents.ts:561,584`, import from
`@patina/supabase` instead, and pass the app's bundle refetch as `onSaved`.
One shape difference remains and is deliberate: the package returns the
camelCase `StudioAgreementDefaults` (`@patina/types` — camelCase domain types,
never DB rows) where the app's copy returned the snake_case row. The card
needs an ~8-line read-site rename, not a behaviour change. Do NOT ship both
sets.

## Gates — round 3

Scratch DB `patina_w1` = `pg_dump --no-owner --exclude-schema=cron` of the
shared stack (head `00575`, the steward has reset it since round 2) restored
into a fresh database, then the migration applied over it. The `cron` schema
is excluded because pg_dump 18's `\restrict` stream desyncs on the `cron.job`
COPY and takes the rest of the file with it; four FK constraints
(`engagement_events_user_id`, `invoice_links_created_by`,
`invoice_links_invoice_id`, `organization_members_user_id`,
`user_roles_user_id`) fail to validate on restore for want of seed rows. Both
are restore artifacts and both are visible in the type diff below.

```
psql -v ON_ERROR_STOP=1 -f supabase/migrations/00575_agreement_parts.sql
  → exit 0, zero errors, over a database that already carried 00575
    (every statement is CREATE OR REPLACE / IF NOT EXISTS / DROP+ADD)

scripts/run-sql-tests.sh -k supabase/tests/KNOWN_FAILURES.md
  commercial   12 total ·  6 green ·  6 expected-fail ·  0 unexpected
  edge_api      8 total ·  3 green ·  3 expected-fail ·  2 unexpected
  rls          21 total · 17 green ·  2 expected-fail ·  2 unexpected
  document     14 total · 12 green ·  2 expected-fail ·  0 unexpected

  The four unexpected are IDENTICAL on `patina_w1_base` — the same dump
  restored WITHOUT this round's migration: edge_api/public_acl_residual_census
  and catalog_roles_remote_conformance_negative (both `relation "cron.job"
  does not exist`), rls/00563_proposal_signing_multi_studio and
  rls/project_notes_test. Not this round's, and not this wave's.

  Before this round's test edits, `public_sd_hardening_contract_test.sql` was
  a THIRD unexpected failure under the new grants; after the fixture split it
  is green (exit 0).

per-file:
  commercial/agreement_parts_test.sql             exit 0 · 19 PASS blocks
                                                  (28 numbered cases, 25-28 new)
  commercial/agreement_parts_projection_test.sql  exit 0 ·  5 PASS blocks
  edge_api/public_sd_hardening_contract_test.sql  exit 0 ·  0 errors

python3 scripts/generate-legacy-grants.py
  → baseline + 2230 replayed statements; +36/-0
  → the two projection-table REVOKE/GRANT pairs and the two new function REVOKEs

supabase gen types typescript --db-url …/patina_w1
  → one real delta, applied: `_agreement_assert_cents`'s Args/Returns block.
    `guard_agreement_projection_write` returns `trigger` and is not generated.
    The remaining 83 diff lines are the four FK Relationships blocks the
    scratch restore could not build; the committed file keeps them, so the
    generated file was NOT copied over wholesale.

pnpm --filter @patina/types    type-check → clean (tsc --noEmit, no output)
pnpm --filter @patina/supabase type-check → clean (tsc --noEmit, no output)
pnpm --filter @patina/supabase test       → 87 files, 1062 passed | 12 skipped
                                            (use-agreement-parts 16,
                                             use-studio-agreement-defaults 10)
```

Scratch DBs `patina_w1` and `patina_w1_base` dropped at the end of the round.
The shared stack was READ (one `pg_dump`) and never written, never reset. No
`db push`, no `functions deploy`, no `wrangler`. Strata untouched. Nothing
pushed.

### Still owed to the integration steward

- `pnpm supabase:reset` is the only run that proves the six commercial
  expected-fails and the four scratch-artifact reds; unchanged from round 1.
- The R4 import swap above, in the designer worktree.
- Re-check the migration tip before merge; `00575` is still provisional.

