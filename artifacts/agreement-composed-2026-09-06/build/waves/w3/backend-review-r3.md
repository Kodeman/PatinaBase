# Wave 3 · backend lane — adversarial review, round 3

**Reviewer**: separate context, did not write this code · **Date**: 2026-09-07
**Branch**: `agreement/w3-backend` @ `98fdb0124` · **Worktree**:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-backend`
(`git rev-parse --show-toplevel` → the same path)

**The branch has not moved a line of code since round 1's fix commit.**
`git log --oneline main..HEAD` is 17 commits; the last three are documentation
only (`e51277fae` r1 review, `7916c16e1` r1 fix log, `782fb31f9` r2 review,
`98fdb0124` r2 response — 234 lines of notes, zero source). `git diff --stat
main...HEAD` = 17 files, **14 983 insertions, 21 deletions**, byte-identical to
what round 2 reviewed.

Consequence: **every one of round 2's ten findings is still open at source.**
Round 2's two blockers were correctly diagnosed as another lane's fix; neither
sibling lane has moved on them either (`agreement/w3-client` @ `4a2e560b6`,
`agreement/w3-designer` @ `0a50e1ac1` — both round-3 review docs on top of
unchanged source). This round adds **one new blocker** of the same root cause:
the B3 redaction also breaks the consent sentence, and that one was not named
before.

---

## Gates the reviewer ran (not read from the lane log)

Scratch clone `patina_w3r3`. First attempt with the env.md recipe
(`pg_dump … | psql`) **fails on this machine** and must be recorded: libpq 18.4's
`pg_dump` emits `\restrict`/`\unrestrict`, which puts `psql -f` into restricted
mode and rejects the `\.` COPY terminators — the parser desyncs at the first
`COPY cron.job` and **every `ALTER TABLE … ADD CONSTRAINT` after it is silently
swallowed** (probe: `select count(*) from pg_constraint where contype='f'` = **0**,
`organizations` had no PK). A clone in that state passes migrations that would
fail on Strata. The working recipe is custom format, **serial** (`-j 4`
deadlocked, losing 64 objects), and **without `--no-acl`** (the ACL-stripped
clone red-fails four commercial suites on grants that exist in production):

```
pg_dump --no-owner -Fc postgres > w3r3.dump
pg_restore --no-owner -d patina_w3r3 w3r3.dump      → 57 errors ignored, all
   clone artifacts (pg_cron absent, dblink/secrets/log_min_messages perms,
   default-privileges on schemas this role does not own, 4 data rows whose FKs
   reference undumped auth rows)
probe: 796 public FKs · 1123 public functions · 793 policies · organizations_pkey present
probe: to_regclass agreement_templates / studio_agreement_parts /
       project_billing_authorities / compose_agreement_consent /
       _commercial_document_fingerprint → all present (W1+W2 schema on the clone)
```

Apply:

```
psql -v ON_ERROR_STOP=1 -f 00578_design_build_kind.sql   → exit 0, 0 ERROR (3 idempotency NOTICEs)
psql -v ON_ERROR_STOP=1 -f 00579_trade_agreements.sql    → exit 0, 0 ERROR (3 idempotency NOTICEs)
```

Suites, against `postgresql://postgres:postgres@127.0.0.1:54322/patina_w3r3`:

```
commercial/design_build_test.sql             exit 0 · 18 PASS
commercial/trade_agreement_test.sql          exit 0 ·  8 PASS
commercial/agreement_parts_test.sql          exit 0 · 30 PASS
commercial/agreement_library_test.sql        exit 0 · 14 PASS
commercial/agreement_fee_schedules_test.sql  exit 0 · 11 PASS
commercial/agreement_parts_projection_test   exit 0 ·  5 PASS
commercial/multi_studio_signature_test.sql   exit 0 ·  7 PASS
billing/studio_invoice_test.sql              exit 0
edge_api/public_sd_hardening_contract_test   exit 0   (both pinned hashes match)
edge_api/public_rpc_authorization_contract   exit 0
edge_api/platform_acl_compatibility_test     exit 3 at :125 — "PUBLIC must retain
   only CONNECT on the current database", a documented KNOWN_FAILURE; the wave's
   registrations at :438 and :928 NEVER EXECUTE (finding R3-16)

scripts/run-sql-tests.sh (PGURL → the clone)
   total 166 · green 132 · expected-fail 21 · unexpected-fail 13 · effective-green 153/166
   The thirteen are name-for-name round 2's thirteen. Spot-probed
   edge_api/public_acl_residual_census.sql — fails on `relation "cron.job" does not
   exist`, a clone artifact, not this wave.
```

Types + ACL seed:

```
python3 scripts/generate-legacy-grants.py → "baseline + 2568 replayed statements"
git diff --stat supabase/seed/00-legacy-grants.sql → EMPTY (in sync)

supabase gen types typescript --db-url …/patina_w3r3 → diff vs the committed file:
   95 lines. Filtered for any line that is not a `Relationships` FK entry: NO OUTPUT.
   All 95 belong to the 4 tables whose FKs the clone could not restore.

pnpm --filter @patina/supabase type-check → exit 0
pnpm --filter @patina/types    type-check → exit 0
```

### Method probes

- **Graft honesty, proved against the LIVE pre-Wave-3 bodies, not against files.**
  For all 23 redefined functions I diffed `pg_proc.prosrc` in the shared stack
  (head `00577`) against `prosrc` in the migrated clone. Every removed line is a
  deliberate `document_kind` widening. Longest removal lists:
  `_countersign_design_services_agreement_impl` −5 (five `'design_services'`
  literals), `upsert_agreement_parts` −13 (the pre-Wave-3 cadence refusal and the
  variant label CASE, both re-emitted wider), `_render_agreement_snapshot_html` −1
  / +170, `send_commercial_document` −0 / +110. **No stale graft, and no W1/W2
  line reverted.** This also settles the one file-archaeology trap: the impl the
  sheet warns about is `_create_furnishings_authorization_from_schedule_00444_impl`,
  renamed at **00445:84** (the banner says 00462, which only redefines the public
  wrapper) — the live-body diff shows −2/+2, both widenings, so the graft is right
  even though the banner's citation is not.
- **PART 7c enumerator re-run on the branch** — 22 rows. Every 00578-head row is a
  widened `IN (…, 'design_build')`; the three narrow `send_commercial_document`
  lines are W1's rate-card/ceiling/fee floor, and the turnkey class has its own
  four gates 130 lines further down. The four rows still headed at 00575
  (`_issue_design_services_agreement_on_paper`, `_record_paper_client_signature_impl`,
  `discard_agreement_parts`, `materialize_standard_parts`) are each named in the
  banner's "NOT redefined, deliberately" block with a reason. That obligation is met.
- **No new `app_private.issue_invoice_for_actor` caller** — the caller set is
  byte-identical before and after (6 functions, same names).
- **No bare extension call** — regex over both files for unqualified
  `gen_random_uuid|gen_random_bytes|digest|crypt|uuid_generate_v*|hmac`: no output.
- **RLS + grants on all 7 new tables** — all `relrowsecurity = t`, `anon` SELECT
  false everywhere. `studio_trade_agreement_tokens` has no policy and no
  `authenticated` grant at all (correct: it is reached only through two
  `service_role` definer RPCs).
- **Seeded rows immutable** — `UPDATE`/`DELETE` of `patina.design_build` as
  `postgres` without the maintenance GUC both raise *"Patina agreement templates
  are immutable"*.
- **Seeded shapes** — 11 template entries, `patina.flow_down` `enabled=false`
  `clientVisible=false`; 6 jurisdiction notices WI/MN/IL/CA/NY/MA, all
  `enabled=false`.
- **Token replay** — `sign_trade_agreement_by_token` locks agreement → token in
  that order, re-reads under lock, returns the original receipt on replay, and
  computes the fingerprint itself rather than trusting a caller's snapshot.
- **Vocabulary** — every `RAISE EXCEPTION` literal in both files, and every seeded
  template `title`/`body`, scanned for "variant", "clause library", "contract
  builder", "dashboard", "overdue", "AI", a column name, or money in prose: the
  only hits are four pre-existing 00423 trade-scope messages carried through a
  graft, all studio-facing. No new violation.

---

## Findings

### R3-1 · BLOCKER (new) — the sentence she ticks is not the sentence the record keeps, on every closed-book turnkey

The B3 redaction changed the shape the client half of the consent pair reads.
Proved on the clone, on the shipped body, with no fixture:

```
select public._agreement_redact_client_payload(
  'schedule','pricing_basis',
  '{"basis":"cost_plus_gmp","gmpCents":9000000,"feeBps":1800,"subMarkupBps":0,
    "costBasisCents":4750000,"costLines":[…2 lines…],"subDisclosure":"closed_book"}',
  'closed_book');

→ {"basis":"cost_plus_gmp","gmpCents":9000000,"subDisclosure":"closed_book",
   "contractSumCents":9000000,"scheduleOfValues":[{…},{…}]}          ← NO costLines
```

The two halves then disagree:

- **SQL** (`compose_agreement_consent`, 00578, reads `proposal_agreement_parts`
  RAW): `IF jsonb_typeof(v_basis->'costLines') = 'array' AND
  jsonb_array_length(...) > 0 THEN v_fragments := v_fragments || 'the schedule of
  values'`. costLines are there → the fragment is **included**.
- **TS** (`apps/client-portal/src/components/threshold/consent-copy.ts:330`, reads
  the bundle): `...(consentRows(part.payload.costLines).length > 0 ? ['the
  schedule of values'] : [])`. costLines are gone → the fragment is **omitted**.

`door-gate.tsx:723` renders `composeConsentLine(kind, consentParts)` beside the
checkbox; `get_client_commercial_document_bundle` (bundle body :140) projects
`compose_agreement_consent(p_proposal_id)`, and `sign/route.ts:412-422` posts
**that** string into `p_consent`, which `_sign_design_services_agreement_authorized`
freezes into `commercial_document_signatures.metadata.consentSentence`. So on a
closed-book turnkey the homeowner ticks a sentence that omits the schedule of
values and the record freezes one that names it — the precise failure the client
lane's own commit `cacf8c359` ("the sentence she ticks is the sentence the record
keeps") was written to prevent, and which that file's own header calls "drift…
one sentence read and a different sentence filed."

It gets worse on a plain `cost_plus` basis: `designBuildContractSumCents`
(consent-copy.ts:305-317) derives the sum from `costBasisCents` **and** `feeBps`,
both redacted, so it returns `null`, the pricing-basis arm returns `[]`, and the
sentence loses the basis fragment as well.

Neither half's test can see it. `consent-copy.test.ts:596-604` builds
`HALVORSEN_PRICING_BASIS` **with** the seven cost lines and comments "so this
fixture is the payload a sent agreement actually carries" — which is true of the
part row and false of the bundle. `design_build_test.sql` asserts the SQL half
against the same raw part.

**Not fixable in one lane alone.** Either the backend composes the consent from
`_agreement_redact_client_payload(...)` output (so both halves read one shape), or
the client lane reads `contractSumCents`/`scheduleOfValues`. The former is one
edit in `compose_agreement_consent` and keeps the pin literal; the latter is the
same edit R3-2 already needs.

### R3-2 · BLOCKER (carried, R2-1, unfixed in either lane) — a closed-book turnkey door renders no schedule of values, no cost basis and no fee

`readPricingBasis` (`design-build-body.tsx:137-176`) reads only
`payload.costLines`, `payload.feeBps`, `payload.gmpCents/nteCents/fixedCents`. It
never reads `payload.scheduleOfValues` or `payload.contractSumCents` — grep for
both names in that file returns only its own derived locals. With the redaction
live, `costLines` is `[]`, so `scheduleOfValues(reading)` returns `[]` at line
195, the SOV section disappears, `costBasisCents` is 0 and the Fee row is null.
Walk step 11 requires *"The SOV renders pro-rated (closed-book)"*. The keepsake
does render it (`_render_agreement_snapshot_html` :215 calls the same redactor and
prints `scheduleOfValues`), so the live door and the frozen record now say
different things about one document. Client branch head `4a2e560b6` has not moved
on it; its fixture (`commercial-document-shell-design-build.test.tsx:48-64`) still
supplies `costLines`, so `J-3` stays green over a shape production cannot produce.

### R3-3 · BLOCKER (carried, R2-2, unfixed in either lane) — the waiver door is closed on the designer lane's hand

Probed on the clone: `agreement_draw_lien_waivers` → `authenticated` SELECT true,
INSERT **false**, one SELECT-only policy. `packages/supabase/src/hooks/use-design-build.ts:249`
on `agreement/w3-designer` still does `.from('agreement_draw_lien_waivers').insert({…})`,
and its test asserts that table name. Walk step 16 records a waiver; in production
it will raise `42501`. The door the backend built is
`record_agreement_draw_lien_waiver(uuid,text,uuid,text,date,integer,text,timestamptz)`
— `secdef=true`, `search_path=public, extensions, pg_temp`, EXECUTE to
`authenticated` only.

### R3-4 · MAJOR (carried, R2-5 / r1 m1) — nine functions ship with no pinned `search_path`, against the program's own migration rule

`pg_proc.proconfig` on the migrated clone:

```
_agreement_contract_sum_cents      (none)    _validate_draws_payload         (none)
_agreement_draw_rows               (none)    _validate_allowances_payload    (none)
_agreement_is_int                  (none)    _validate_no_double_count       (none)
_agreement_redact_client_payload   (none)    _validate_pricing_basis_payload (none)
_agreement_schedule_of_values      (none)
```

against `_agreement_money_to_the_cent → search_path=pg_catalog, pg_temp` and
`_agreement_sub_disclosure` / `_agreement_design_build_subs → search_path=public,
pg_temp`, added in the same commits. All nine hold `GRANT EXECUTE TO
authenticated`. **In fairness: all nine are `prosecdef = f`** — a caller who
poisons their own `search_path` and calls one is exploiting only themselves, and
when they are called from inside a pinned definer they inherit that pin. So the
exploit surface is nil; what is violated is the stated rule ("Every migration: …
search_path pinned"), the file's own internal consistency, and reviewer patience
— this is the third round it has been raised and it is nine one-line edits.

### R3-5 · MAJOR (carried, R2-3) — RC-4 unmet and unruled: the closed book is one division away

`_agreement_schedule_of_values(basis,'closed_book')` allocates every line as
`cost × contractSum / costBasis` — a **uniform** multiple, confirmed on the clone:
cost lines 3 800 000 / 950 000 with a 9 000 000 GMP over a 4 750 000 basis return
7 200 000 / 1 800 000, both exactly ×1.8947. On the same client-visible page, the
allowances part states its lines **at cost** (`patina.allowances`,
`clientVisible=true`; the walk's fixture states tile 400 000 / fixtures 350 000 /
lighting 280 000 while the SOV states 472 000 for the same tile line — ratio
1.18 exactly, so 4 484 000 ÷ 1.18 = 3 800 000, the cabinetry sub's own contract
price in walk step 16). One known (cost, SOV) pair reveals the ratio, and the
ratio reveals every trade's price. RC-4 asks literally whether "a sub's bid cannot
be backed out of line ÷ (1 + fee)" — it can, and T17 freezes both tables together
in the keepsake. The lane records this honestly (backend-notes R1-2) and calls it a
P-level decision. **It is still not ruled**, and the ship report cannot be written
without an answer.

### R3-6 · MINOR (carried, R2-4) — the spent-token receipt expires at 30 days, and the two doors disagree past that

`resolve_trade_agreement_link` matches `t.expires_at > now() AND (t.status =
'active' OR t.spent_at IS NOT NULL)`; `sign_trade_agreement_by_token` returns
`already_signed` at body line 49, **before** it tests `status`/`expires_at` at line
59. So on day 31 the sub who signed gets their receipt from one door and `NULL`
(a 404) from the other, on a surface with no login. Separately, RC-1 asks "Does a
revoked token resolve to NULL rather than a 'this link was used' page?" while §4.5
and walk step 16 require the settled receipt; the lane resolved that conflict
itself and the deviation is still unratified.

### R3-7 · MINOR (carried, R2-6) — the sub-disclosure mode is read off any clause part and never validated

`_agreement_sub_disclosure` (body read from the clone) selects the first
`kind='clause'` part whose `payload->>'mode'` is non-empty, ordered by position —
**no `part_key` filter** — and returns it unchecked. Every reader tests `=
'open_book'` (`_agreement_design_build_subs`, `_agreement_redact_client_payload`,
`_render_agreement_snapshot_html`), so any other string silently closes the book;
the send door refuses only `NULL` and `'conflict'`. It is latent, not live: the
seeded template gives `mode` to exactly one entry (`patina.sub_disclosure`, seeded
`null`) and to no other clause. The scoped key exists and is one predicate away.

### R3-8 · MINOR (carried, R2-7) — the client redaction is a denylist, so it fails open on any key a later editor adds

`RETURN v_payload - 'costLines' - 'feeBps' - 'costBasisCents' - 'subMarkupBps';`
and `_validate_pricing_basis_payload` permits arbitrary extra keys. Nothing leaks
today (the designer editor writes a fixed key set), but the default direction is
open, on the one edge that separates a homeowner from her trades' prices.

### R3-9 · MINOR (carried, R2-8 m4) — the `'studio'` signature party is never written

One `INSERT INTO public.studio_trade_agreement_signatures` exists in 00579
(:874) and it hardcodes `'sub'`. The `party` column and its CHECK admit a studio
side that nothing populates.

### R3-10 · MINOR (carried, R2-8 m5) — a `FOR ALL` policy over a SELECT-only grant

Probed: `studio_trade_agreements` → `authenticated` SELECT true, INSERT/UPDATE
**false**, while the only policy `studio_trade_agreements_studio_rw` is `cmd=ALL`.
The policy's write half can never be reached. Harmless, and misleading to the next
reader about which door writes that table.

### R3-11 · MINOR (carried, R2-8 m6) — F-W3-4 and F-W3-6 are absent from the migration banner

`grep -l "F-W3-4\|F-W3-6" supabase/migrations/0057*.sql` → no file. Both are in
`backend-notes.md` (:150, :166) — F-W3-4 is why `issue_agreement_draw_invoice`
carries a `service_role` grant the build sheet's snippet does not, which is the
kind of deviation the banner exists to hold. F-W3-1/2/3/7 are all in the banner;
these two are the gap.

### R3-12 · MINOR (carried, R2-8 m8) — `materialize_agreement_template` clears the lifecycle GUC instead of restoring it

00578:5861 ends `PERFORM set_config('app.commercial_document_id', '', true);` with
no `v_previous` capture, while all fourteen other sites in the same file restore
`COALESCE(v_previous_commercial, '')`. A nested caller loses its GUC.

### R3-13 · MINOR (carried, R2-8 m9) — a dead `service_role` grant on the draw ledger

`information_schema.role_table_grants` for `agreement_draw_invoices` shows
`service_role` INSERT/UPDATE/DELETE, while `guard_agreement_draw_ledger` raises
`insufficient_privilege` on every INSERT/DELETE/UPDATE where `current_user IS
DISTINCT FROM 'postgres'`. The grant can never be exercised; it reads as a
back-door that isn't one.

### R3-14 · MINOR (carried, R2-8 / r1 m2) — RC-10 has no recorded answer

`grep -c "RC-10"` over both migrations and `backend-notes.md` → `0 0 0`. Every
other RC the lane touched is answered somewhere. This one needs a sentence in the
ship report, nothing more.

### R3-15 · MINOR — the env.md scratch-DB recipe does not work on this machine and silently produces a constraint-free clone

Recorded because the next reviewer and the integration steward will hit it. See
the Gates section: `pg_dump … | psql` under libpq 18.4 desyncs on the first failed
`COPY cron.job` and drops every constraint statement that follows, with
`psql` exiting **0**. A lane that validated on such a clone would have proved
nothing about FKs, PKs or uniqueness. env.md should be amended to
`pg_dump --no-owner -Fc` + serial `pg_restore --no-owner` (no `--no-acl`: four
commercial suites red-fail on a grant-stripped clone), with
`select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace`
as the sanity probe before any test is believed.

### R3-16 · MINOR (carried, R2-10) — the wave's ACL registrations in `platform_acl_compatibility_test.sql` never execute

Direct run on the migrated clone: `ERROR: PUBLIC must retain only CONNECT on the
current database` at **:125**, a documented `KNOWN_FAILURES.md:51` abort. The Wave
3 registrations sit at :438 and :928 and are never reached, so that file's colour
says nothing about this wave either way. Real coverage exists elsewhere —
`design_build_test` T12 (18 signatures, anon-denial plus exact grantee tuples) and
`public_rpc_authorization_contract_test` both PASS. No assertion change is owed;
the steward must run that file whole on a reset shared stack, and the ship report
should credit T12, not this file.

### R3-17 · NIT (carried, R2-9 n1) — the CA notice is titled Cancellation and classed `mandated_contents`

```
CA | mandated_contents   | Cal. Bus. & Prof. Code §7159 | Notice of Cancellation (California)
IL | cancellation_notice | …                            | Notice of Cancellation (Illinois)
```
Five siblings carry `cancellation_notice`. Retitle or reclassify.

### R3-18 · NIT (carried, R2-9 n3) — int4 money on a construction class

`agreement_draw_invoices.gross_cents / net_cents / retainage_cents`,
`agreement_draw_lien_waivers.amount_cents` and `studio_trade_agreements.price_cents`
are all `integer` — a $21.47M ceiling on the one document class that is a whole
house. Worth naming in the ship report even if nothing moves this wave.

### R3-19 · NIT (carried, R2-9) — a per-row disclosure lookup inside the bundle's parts aggregate

`get_client_commercial_document_bundle` calls `_agreement_sub_disclosure(p_proposal_id)`
three times, one of them (body :322) inside the per-part `jsonb_agg` CASE, so it
is re-evaluated per part on every client read. Hoist it into a local.

### R3-20 · NIT — the banner cites the wrong file for one rename

The lineage block says `_create_furnishings_authorization_from_schedule_impl …
RENAMED by 00462:1401`. The `ALTER FUNCTION … RENAME TO` is at **00445:84**;
00462:1408 only redefines the public wrapper. The graft itself is correct (proved
by live-body diff), so this is a citation, not a defect.

---

## Verdict

**block** — three blockers (R3-1 new, R3-2 and R3-3 carried), two majors.

None of the three blockers is in this branch's SQL alone, and all three share one
root: **round 1's B3 fix changed the client-visible pricing-basis shape, and no
consumer was moved with it.** The cheapest program-level fix is one edit in this
lane — compose the consent from, and project into the bundle, one agreed shape —
plus the client lane reading `scheduleOfValues`/`contractSumCents` and the
designer lane calling `record_agreement_draw_lien_waiver`. RC-4 (R3-5) needs a
ruling before the ship report can be written at all.

What this branch does well is worth stating: the grafts are honest against the
live pre-Wave-3 bodies (23 functions, every removed line an intentional
widening), the pinned hashes match, the enumerator's leftovers are each named and
reasoned in the banner, seeded rows are immutable, the token rail's replay
protection is careful about lock order, and the types and ACL seed are in sync.
The gap is not craft; it is that two review rounds produced 240 lines of notes and
zero one-line edits.
