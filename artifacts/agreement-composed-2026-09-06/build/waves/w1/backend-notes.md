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
