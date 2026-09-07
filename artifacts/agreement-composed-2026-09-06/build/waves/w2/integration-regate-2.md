# Wave 2 close-out — RE-GATE 2

**"The Agreement, Composed" · the Library · rulings R31–R37.**

Reviewer: a separate context; did not write any of this code.
Date 2026-09-07.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(`git rev-parse --show-toplevel` pasted at the head of the run), branch
`agreement/w2-integration`, head **`dc8ecf9a0f75fa3bd97463ed28fcb406aeb1f8cd`**.
Working tree clean at the start and at the end of this review.

---

## Verdict

**NOT READY TO SHIP — two findings stand, both on R31.**

Everything else lands. All seven rulings are implemented; the four unexpected SQL
failures the integration steward reported are green; the SQL suite is
**164 / 164 effective-green with zero unexpected failures**; every portal, package,
Deno and type gate is green; the client e2e is down to the named pre-existing reds
only; and every probe this re-gate was asked to run behaves as the ruling says it
must.

The two findings are the same shape as the blocker R31 was written to kill, and
neither is caught by any gate in the repo:

- **W2RG-01** — the generated `supabase/seed/00-legacy-grants.sql` is **stale**.
  R32 and R34 added GRANT/REVOKE statements to `00576`/`00577` *after* the seed was
  last regenerated (in R31's own commit), and `scripts/generate-legacy-grants.py`
  was never re-run. On every fresh `supabase db reset` two SECURITY DEFINER helpers
  the migrations explicitly revoke stand `EXECUTE`-able by `anon` and `authenticated`.
- **W2RG-02** — R31's per-function split has a word-boundary bug that silently
  falls back to the old whole-statement behaviour, and it is already firing on the
  two largest multi-function blocks in the repo.

Nothing was pushed. Nothing reached Strata. No Worker was deployed. No migration
and no seed file was modified by this reviewer.

| | |
|---|---|
| R31–R37 fidelity | ✅ all seven implemented as ruled (two defects *within* R31 — below) |
| `schema_migrations` head | ✅ `00577` |
| 00576/00577 function bodies vs `pg_proc` | ✅ **24 / 24** matched by object probe |
| 00511 hardening manifest ACLs | ✅ **27 / 27** exactly as pinned; the eight surviving tuples are gone |
| The grants seed replays in full | ❌ **W2RG-01 — three statements missing; the file is stale** |
| The generator is per-function | ❌ **W2RG-02 — two multi-function blocks still whole** |
| B1 probe (two-studio designer) | ✅ saves, materializes; strangers and her other studio refuse |
| B2 probe (hidden fee) | ✅ reaches neither terms nor the executed authority |
| Consent composer parity (SQL vs TS) | ✅ **11 / 11** scenarios byte-identical |
| Record consent sentence from the signature row | ✅ proved live on the bundle |
| Per-phase `sent` fixture + its e2e touchpoint | ✅ seeded, and the touchpoint passes against it |
| Template picker offers the three seeded templates | ✅ all three, `design_build` excluded |
| SQL suites | ✅ 164 total · 143 green · 21 expected-fail · **0 unexpected** |
| Generated types | ✅ regenerated, `git diff --exit-code` clean |
| Packages / portals / Deno | ✅ all green |
| Client e2e | ✅ 36 passed, 3 failed — all three named pre-existing |

---

## 1 · The stack this was measured on

Reset from this branch, unsandboxed, five times (each logged in `stack-notice.md`):
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
— every migration through `00577` and all 36 seed files, clean, no errors.

```
Applying migration 00575_agreement_parts.sql...
Applying migration 00576_agreement_library.sql...
Applying migration 00577_agreement_fee_schedules.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
… 35 more seed files …
Finished supabase db reset on branch main.

select version from supabase_migrations.schema_migrations order by version desc limit 5;
 00577 | 00576 | 00575 | 00574 | 00573
```

### Every function body in 00576/00577 matches `pg_proc`

Parsed every `CREATE OR REPLACE FUNCTION` in the two files (8 in `00576`, 16 in
`00577` — 24 distinct `(schema, name, nargs)` triples, no duplicates), took the last
definition of each, and compared it whitespace-normalised against
`encode(convert_to(p.prosrc,'UTF8'),'base64')` from `pg_proc`:

```
probed 24 functions; matched 24
  ok public.guard_agreement_template_immutability/0   ok public.compose_agreement_consent/1
  ok public.sanitize_agreement_part_payload/1         ok public._log_agreement_part_events/4
  ok public._agreement_restore_list_item_ids/1        ok public.upsert_agreement_parts/3
  ok public.save_agreement_part/2                     ok public.upsert_agreement_parts/2
  ok public._agreement_studio_id/2                    ok public._sign_design_services_agreement_authorized/5
  ok public.agreement_studio_context/1                ok public._sign_design_services_agreement_authorized/4
  ok public.save_agreement_as_template/2              ok public.sign_design_services_agreement_with_trusted_ip/5
  ok public.materialize_agreement_template/2          ok public.sign_design_services_agreement_with_trusted_ip/4
  ok public._commercial_document_fingerprint/1        ok public._countersign_design_services_agreement_impl/3
  ok public._agreement_html_escape/1                  ok public.get_client_commercial_document_bundle/1
  ok public._agreement_money/1                        ok public.copy_agreement_parts_from_authority/2
  ok public._agreement_addendum_why/1                 ok public._render_agreement_snapshot_html/1
```

Both restored arities (`…_with_trusted_ip/4`, `_sign_…_authorized/4`,
`upsert_agreement_parts/2`) are live objects, so nothing that holds an old
signature has lost its callee.

---

## 2 · R31–R37, ruling by ruling

### R31 · Never drop a hardened arity; make the generator per-function — **implemented, with two defects**

**The restored arities.** `00577` DROPs each widened function's old arity before
creating the wide body, then puts the old arity back as a thin delegating wrapper
carrying the ACL the hardening migration wrote:

```sql
-- 00577 PART 10 — R31 — 00511's four-argument arity, restored as a wrapper …
CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid,
  p_signed_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ BEGIN
  RETURN public.sign_design_services_agreement_with_trusted_ip(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip, NULL::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;
```

and the wide bodies correctly lose their defaults so a four-argument call still has
exactly one candidate:

```diff
-  p_signed_ip text DEFAULT NULL,
-  p_consent jsonb DEFAULT NULL
+  p_signed_ip text,
+  p_consent jsonb
```

The hardening contract test's manifest is widened to 18 rows and pins the restored
arity's own body hash:

```diff
-  ASSERT (SELECT count(*) FROM _00511_expected_public) = 17,
+  ASSERT (SELECT count(*) FROM _00511_expected_public) = 18,
```

**The 00511 manifest, probed directly.** For all 27 signatures 00511 hardens (the
17-function public block, the 9-function internal block, `create_draft_invoice`),
comparing live non-`postgres` `EXECUTE` grantees to what 00511's own REVOKE/GRANT
pairs pin: **27 OK, 0 DRIFT, 0 ABSENT**. And the eight tuples the integration
steward listed as surviving are gone:

```
consume_board_unfurl_quota(uuid)      -> postgres, service_role      (was + authenticated)
notify_decision_required(uuid)        -> postgres, service_role      (was + authenticated)
notify_decision_resolved(uuid)        -> postgres, service_role      (was + authenticated)
prepare_spec_book_issue(…)            -> authenticated, postgres     (was + service_role)
set_invoice_studio_id()               -> postgres                    (was + authenticated, service_role)
set_project_studio_id()               -> postgres                    (was + authenticated, service_role)
```

`public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)` is
present and `service_role`-only, which is what makes the seed's 00511 replay whole.

**The generator.** `split_function_targets()` splits `… ON FUNCTION a(…), b(…) FROM …`
one function per guarded `DO $g$` block, and the seed now carries 2 459 guarded
blocks where the old shape had one 17-function REVOKE. All four previously-red
suites are green (§4.1).

**Defect 1 — W2RG-01: the committed seed is stale.** See §3.
**Defect 2 — W2RG-02: the split silently falls back.** See §3.

### R32 · The Library belongs to the agreement's studio — **holds**

`00576` replaces the "exactly one shared studio" arithmetic with
`_agreement_studio_id(p_proposal_id, p_actor)` — the project's studio once bound,
else the lead's studios in 00563's order, with the actor's standing asserted by
`EXISTS` afterwards, exactly `save_board_as_template`'s argument-plus-EXISTS shape:

```diff
-  IF COALESCE(array_length(v_studio_ids, 1), 0) <> 1 THEN
+  -- R32 — the studio the AGREEMENT sits in, not a count of the author's.
+  v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());
+  IF v_studio_id IS NULL THEN
     RAISE EXCEPTION 'template studio is not an authorized design workspace'
```

and the Contract Room stops asking the actor's own organizations:

```diff
-  const { data: orgs } = useOrganizations();
-  const studio = (orgs ?? []).find((org) => org.type === "design_studio") ?? (orgs ?? [])[0] ?? null;
+  const studioContext = useAgreementStudioContext(proposalId);
+  const studioId = studioContext.data?.studioId ?? null;
+  const canManage = studioContext.data?.canManage === true;
```

**B1 probe, run as the local seed's two-studio designer, auto-provision trigger ON.**
`designer@patina.dev` = `a0000000-…-0004`, owner of *Leah Hartwell*
(`14570c77-…`) and *Local Dev Studio* (`b0000000-…-0001`), both `design_studio` /
`active`; `pg_trigger.provision_studio_on_designer` on `public.profiles` is
`tgenabled = 'O'`.

```
acting_as a0000000-…-0004 | her_active_studios 2

B1a save her own studio's agreement as a Template ......... SUCCESS
      studio.6ceb9496-… | studio | b0000000-…-0001 | design_services | B1 probe template
B1b materialize that Template into her own studio's draft . SUCCESS — 5 parts
B1c a stranger studio's Template .......................... REFUSED
      ERROR: template not found or not accessible
B1d her OTHER studio's Template onto this agreement ....... REFUSED
      ERROR: template belongs to another studio
B1e seeded patina.design_services ......................... SUCCESS — 9 parts
B1f seeded patina.consultation ............................ SUCCESS — 5 parts
B1g an ORIGIN agreement (project_id NULL), saved as a Template
      SUCCESS — b0000000-…-0001 | design_services | B1 origin template
```

B1g is the case R32 names explicitly: with no project to answer, the lead's
studios in 00563's order resolve to the one already hosting a project for this
designer-client pair — not an arbitrary one of her two.

### R33 · Only client-visible fee parts project — **holds**

```diff
   FROM public.proposal_agreement_parts ap
   WHERE ap.proposal_id = p_proposal_id
-    AND ap.kind = 'schedule' AND ap.variant IN ('flat', 'per_phase');
+    AND ap.kind = 'schedule' AND ap.variant IN ('flat', 'per_phase')
+    AND ap.client_visible;
```

with the same predicate added to the `rate_card` fallback and to the one-fee-basis
count, and readiness saying it in the ruling's own words:

```ts
export const HIDDEN_FEE_BLOCKER =
  "This fee is hidden from your client, so it cannot bill.";
```

**B2 probe** — pinned as case 16 of `supabase/tests/commercial/agreement_fee_schedules_test.sql`
and run on the reset stack. A `clientVisible:false` flat fee of $8 000 beside a
visible rate card and ceiling, driven through send → sign → countersign:
`proposal_service_terms.fee_basis = 'hourly'`, `fee_amount_cents IS NULL`,
`fee_schedule IS NULL`; the executed `project_billing_authorities` row is
`fee_basis = 'hourly'`, `fee_amount_cents IS NULL`; the consent sentence does not
name it; the frozen keepsake contains no `8,000.00`; the visible rate card still
projects its one rate row. Its other half — hide the *only* fee — leaves
`fee_basis` NULL and R22's floor refuses the send (`%names no fee%`).

```
NOTICE:  PASS 16: R33 — only a fee she can read reaches the money row, and a hidden one cannot send
```

All 17 cases in that file pass.

### R34 · The addendum's why reaches the homeowner — **holds**

`_agreement_addendum_why(uuid)` lifts the FIRST recorded `why` on a
`service_addendum` (one line per addendum, not per part); the bundle projects it as
`'why'`; `_render_agreement_snapshot_html` writes it first; the client body prints
it above the change; and the table comment is amended so R8's studio-only rule and
its one exception are both stated where a reader will find them. Case 17 of the
fee-schedules suite pins the door and the keepsake.

### R35 · The picker filters by kind, not class — **holds**

```ts
export function documentKindForTemplateClass(templateClass: string): string {
  return templateClass === "design_build" ? "design_build" : "design_services";
}
…
.filter((template) => documentKindForTemplateClass(template.class) === wanted)
```

Seeded shelf on the reset stack, and what the picker resolves for each document kind:

```
patina.consultation          | seeded | consultation          | Consultation / hourly              | 5 parts
patina.design_services       | seeded | design_services       | Design services (Patina standard)  | 9 parts
patina.furnishings_services  | seeded | furnishings_services  | Furnishings only                   | 7 parts

design_services   -> patina.consultation, patina.design_services, patina.furnishings_services
service_addendum  -> patina.consultation, patina.design_services, patina.furnishings_services
design_build      -> patina.design_build            (Wave 3; absent from the shelf by design)
```

All three seeded design-services-kind Templates are offered. R3-5's "one usable
seeded template out of three" is closed.

### R36 · The record's consent sentence comes from the signature row — **holds**

The bundle projects one scalar off the signature's metadata:

```sql
'consentSentence', NULLIF(btrim(COALESCE(s.metadata->>'consentSentence', '')), '')
```

and the record reads it, falling back to the standing sentence for the method:

```diff
-      consentSentence={block.sentence}
+      consentSentence={signature.consentSentence ?? block.sentence}
```
(`page.tsx:91` — `signature` is `paper.signatures.find((row) => row.party === 'client')`.)

**Proved live.** Signed the seeded per-phase agreement as its client through the
service-role route with a sentence deliberately *unlike* what the composer answers
today, then read the bundle as that client:

```
compose_agreement_consent(cb04) today
  = "I agree to these design-services terms, the per-phase fee schedule, and the
     retainer, which is not refundable, and understand my signature alone does not
     authorize work until the studio countersigns."

commercial_document_signatures.metadata->>'consentSentence'
  = "FROZEN-AT-SIGNATURE sentence, not recomposed."

bundle.signatures[0] = {
  "partyRole": "client", "signedName": "Solo Homeowner",
  "consentSentence": "FROZEN-AT-SIGNATURE sentence, not recomposed.", …
}
```

The record prints what she ticked, never a sentence recomposed from today's parts.

**The per-phase `sent` fixture.** `supabase/seed/the-client-page.sql` now lays down
`b0000000-0000-0000-0000-00000000cb04` "Cedar Lane — Phase Work" — five parts
(Services · per-phase fee · non-refundable retainer · lead-paint notice with
`acknowledgeRequired` · Terms), sent under the row-exact capability GUCs, with no
signature row. On the reset stack:

```
b0000000-…-cb04 | Cedar Lane — Phase Work | sent | design_services
```

and the touchpoint runs against it unconditionally (§4.8).

### R37 · Deploy notes accepted — **holds**

- `retainer_credit_rule NOT NULL DEFAULT 'credited'` — the banner now names the
  backfill as a claim about the past ("reading one of those rows afterwards cannot
  tell a rule that was agreed from a rule that was defaulted").
- `patina.deposit` is one key, one kind, everywhere. Probed across every seeded
  template: `patina.deposit` is `schedule/procurement` in both templates that carry
  it; the prose moved to `patina.deposit_terms`; and **no seeded part key appears
  with two different `kind/variant` shapes anywhere.**
- `copy_agreement_parts_from_authority` has its SQL test (case 17, passes).
- The keepsake renderer matches `agreement-parts-body.tsx`: why → sections
  (excluding `attachment` and `attestation`) → the closing boundary sentence →
  attachments as trailing lettered leaves (`A..Z`, then the ordinal). Verified
  against the TSX directly; case 13 passes.
- `AgreementExecutionSnapshot` now types exactly the three keys the bundle emits
  (`html`, `documentHash`, `createdAt`) — `proposalId` and `partSet` removed;
  `adaptExecutionSnapshot` reads the same three.
- `useAgreementTemplates` escapes its filter value (`postgrestValue()`).
- Both new hook modules have specs (`use-agreement-library.test.ts`,
  `use-agreement-part-events.test.ts`) — the `@patina/supabase` suite is now
  90 files / 1 108 tests, up from 88 / 1 071.

---

## 3 · Findings

Severity and confidence on every finding; the orchestrator filters.

### W2RG-01 · The generated ACL seed is stale — **major**, confidence 0.97

`supabase/seed/00-legacy-grants.sql` · `scripts/generate-legacy-grants.py`

R31's commit (`ae33cb5cf`) regenerated the seed. R32 (`a8731cb00`) then added
`_agreement_studio_id` and `agreement_studio_context` to `00576` with grants, and
R34 (`6a00828c2`) added `_agreement_addendum_why` to `00577` with a REVOKE —
and neither re-ran the generator. Running it on this head produces a **24-line
delta**, i.e. the committed seed is missing three statements:

```
+ -- 00576_agreement_library.sql
+ DO $g$ BEGIN
+   REVOKE ALL ON FUNCTION public._agreement_studio_id(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
+ …
+   REVOKE ALL ON FUNCTION public.agreement_studio_context(uuid) FROM PUBLIC, anon, service_role;
+   GRANT EXECUTE ON FUNCTION public.agreement_studio_context(uuid) TO authenticated;
+ -- 00577_agreement_fee_schedules.sql
+   REVOKE ALL ON FUNCTION public._agreement_addendum_why(uuid) FROM PUBLIC, anon, authenticated, service_role;
```

(The regenerated file was reverted with `git checkout --`; the tree is clean.)

This is not cosmetic. The seed's first act is a blanket baseline —

```sql
EXECUTE format('GRANT EXECUTE ON %s %s TO anon, authenticated, service_role', …)
  -- for EVERY function in schema public
```

— and the replayed REVOKEs are what take it back. With three of them missing, on
every fresh `supabase db reset` from this branch:

```
_agreement_addendum_why(uuid)   -> anon, authenticated, postgres, service_role
_agreement_studio_id(uuid,uuid) -> anon, authenticated, postgres, service_role
agreement_studio_context(uuid)  -> anon, authenticated, postgres, service_role
   (compare: _agreement_html_escape(text) -> postgres,  _agreement_money(numeric) -> postgres)
```

`_agreement_addendum_why` is `SECURITY DEFINER` and performs **no authorization at
all** — it is a definer read of any addendum's `why` sentence by proposal id, and
`anon` can call it. `_agreement_studio_id` is `SECURITY DEFINER` and answers "which
studio does this agreement sit in, and is user X an active non-guest member of it"
for any pair of uuids. `agreement_studio_context` is exposed to `anon` and
`service_role` on top of its intended `authenticated` (its own `auth.uid()` and
co-member checks still hold, so that one is a posture break rather than a leak).

Scope: local stacks only — seeds never run on prod, and on Strata the migrations'
own REVOKEs stand. But it violates the program's own standing rule
("`generate-legacy-grants.py` re-run when grants change"), it is exactly the
stale-generated-artifact class R31 exists to eliminate, and no gate in the repo
catches it: the hardening contract test pins 00511's manifest, not Wave 2's new
functions.

Fix: `python3 scripts/generate-legacy-grants.py`, commit the 24-line delta,
`supabase db reset`, re-probe the three ACLs.

### W2RG-02 · R31's per-function split silently falls back on a name containing `to` or `from` — **major**, confidence 0.95

`scripts/generate-legacy-grants.py:99-104`

```python
keyword = re.match(r"(?:FROM|TO)\b", rest[i:], re.IGNORECASE)
# A keyword only ends the target list once a complete target has
# been read — `FROM` cannot appear inside `public.f(uuid)`.
if keyword and "".join(current).strip():
```

The regex has a trailing `\b` but **no leading one**, so at depth 0 it matches the
`to` at the end of an identifier immediately before `(`. On
`public.find_products_similar_to(uuid, integer)` the scanner takes `to(uuid, integer), …`
as the tail, the last target comes out as `'public.find_products_similar_'`, the
`all("(" in t and t.endswith(")"))` guard rejects the split, and
`split_function_targets` returns `None` — which the caller reads as "keep the whole
statement".

Demonstrated: the regenerated seed contains exactly **two** multi-function guarded
blocks, both from `00484_public_rpc_authorization_contract.sql`, and both contain
that function name — a **25-function `REVOKE ALL PRIVILEGES`** (line 11 992) and a
**13-function `GRANT EXECUTE`** (line 11 998). The moment any migration drops or
widens one of those 25 signatures, the guard swallows the hardening of the other 24
— the identical failure R31 was written to make impossible, one migration away.
The degradation is silent: no warning, no error, and the seed still replays clean.

It fails safe today (whole statement kept, not a truncated one emitted), which is
why this is major rather than a blocker on its own.

Fix: require the character before the keyword to be a non-identifier character,
e.g. `if depth == 0 and (i == 0 or not (rest[i-1].isalnum() or rest[i-1] == '_')):`
before the `FROM|TO` match — then regenerate and confirm zero multi-function blocks
remain.

### W2RG-03 · A stale comment now contradicts the line above it — **nit**, confidence 0.99

`apps/client-portal/src/lib/commercial-documents.ts:717-724`

R36 added `consentSentence: nullableText(first(row, 'consentSentence', 'consent_sentence')),`
and left the comment that used to explain its absence directly underneath:

```ts
consentSentence: nullableText(first(row, 'consentSentence', 'consent_sentence')),
// NOT read here: the sentence this signer ticked. … so there is no consent key
// on this row to read. … the wave that rules the bundle addition adds both
// halves together.
```

Both halves *were* added together, in this wave. The comment is now false and will
mislead the next reader of exactly the file R36 hardened.

### W2RG-04 · The e2e touchpoint still says its fixture is owed — **nit**, confidence 0.98

`apps/client-portal/tests/threshold.spec.ts:628-635`

```
* Unconditional (R26): the fixture is named at the head of this file, and it
* is OWED — the seed does not lay it down yet, and `supabase/seed/**` is the
* backend lane's pathspec. Until that fixture and the Wave 2 migrations are
* on the stack this test is red at its first assertion …
```

R36 laid the fixture down in `supabase/seed/the-client-page.sql` and the test now
passes. The comment describes a state that no longer exists.

### W2RG-05 · SQL and TS consent composers disagree on a duplicate money variant — **nit**, confidence 0.9

`00577` `compose_agreement_consent` LOOPs every matching part and appends a fragment
per part; `consent-copy.ts` `composeConsentLine` takes `money.find(...)` — the first
only. Two `retainer` parts would give SQL two fragments and TS one. The two are
documented as "the SAME function written twice, in two languages, and they must not
drift", and this is the one input on which they do.

Unreachable today, which is why it is a nit: `authenticated` holds **`SELECT` only**
on `public.proposal_agreement_parts` (probed: `grants: authenticated:SELECT`), and
`upsert_agreement_parts` refuses the input —

```
ERROR:  an agreement carries only one retainer
CONTEXT:  PL/pgSQL function upsert_agreement_parts(uuid,jsonb,text) line 309 at RAISE
```

so no caller can construct the divergent state. Worth aligning the TS to the SQL
(or the reverse) the next time either is touched.

### W2RG-06 · An unset visible `flat` part is still named in the consent sentence — **advisory**, confidence 0.6

Both composers name "the flat design fee" for a `flat` part with no `cents` key at
all, unlike `ceiling`, `retainer`, `per_phase` and `procurement`, which all require
a set value (R21). The two sides agree byte-for-byte, so this is not a parity break,
and R22's floor independently refuses the send while no visible fee carries a set
value — so it cannot reach a homeowner. Recorded because it is the one money variant
whose consent fragment is unconditional.

---

## 4 · Gates

Every command below was run from
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
on the reset stack, at head `dc8ecf9a0`.

### 4.1 SQL suites — ✅ 0 unexpected failures

`SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres ./scripts/run-sql-tests.sh`
(unsandboxed — the script needs `mktemp`), on a stack reset immediately before, so
the order-sensitive `rls/project_notes_test.sql` got its first run:

```
================ summary ================
total:             164
green:             143
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:   164 / 164  (green + expected-fail)
===========================================
```

All four suites the integration steward reported red are green:

```
PASS  supabase/tests/edge_api/public_sd_hardening_contract_test.sql
PASS  supabase/tests/document/decision_journey_atomicity_test.sql
PASS  supabase/tests/mood_boards/maintenance_quota_test.sql
PASS  supabase/tests/rls/project_notes_test.sql
```

as are Wave 2's own and the suites the build sheet pins:

```
PASS  commercial/agreement_library_test.sql        PASS  commercial/multi_studio_signature_test.sql
PASS  commercial/agreement_fee_schedules_test.sql  PASS  commercial/design_services_paper_issue_test.sql
PASS  commercial/agreement_parts_test.sql          PASS  schedule/ceremony_hardening_test.sql
PASS  commercial/agreement_parts_projection_test.sql
```

### 4.2 Generated types — ✅

```bash
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts   # exit 0, no output
```
36 072 lines, byte-identical to what is committed.

### 4.3 Packages — ✅

```
pnpm --filter @patina/types    type-check   → clean, no output
pnpm --filter @patina/supabase type-check   → clean, no output
pnpm --filter @patina/supabase test         → Test Files 90 passed (90)
                                              Tests 1108 passed | 12 skipped (1120)
```

### 4.4 designer-portal — ✅

`pnpm turbo build --filter=@patina/designer-portal^...` → 6/6 successful (the
dist-resolved `@patina/types` rebuilt before any type gate), then:

```
pnpm --filter @patina/designer-portal type-check   → clean, no output
pnpm --filter @patina/designer-portal test
  Test Suites: 534 passed, 534 total
  Tests:       6505 passed, 6505 total
  Snapshots:   7 passed, 7 total
  Time:        24.722 s
```

Full jest on a clean checkout — the merge gate — is green, and all seven snapshots
**passed rather than being written**, which is the flag-off byte-identity check.

### 4.5 client-portal — ✅

```
pnpm --filter @patina/client-portal type-check     → clean, no output
pnpm --filter @patina/client-portal test:coverage
  Test Suites: 129 passed, 129 total
  Tests:       2059 passed, 2059 total
  Snapshots:   1 passed, 1 total
```
The 70/60/70/70 coverage floor is enforced by this script and did not trip.

### 4.6 admin-portal — ✅

`pnpm --filter @patina/admin-portal build`, unsandboxed, after `rm -rf apps/admin-portal/.next/types`:
build completed and printed its full route table (`/studios`, `/users`,
`/system/deployments`, …). The repo's strictest gate accepts the `packages/` changes.

### 4.7 Deno — ✅

```
deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/
  ok | 337 passed | 0 failed (1s)
```
No `deno.lock` appeared at the repo root; `git status --porcelain` is empty.

### 4.8 Client e2e — ✅ (three named pre-existing reds, nothing else)

Stack reset first. Server started **by this reviewer** from
`apps/client-portal` with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the
local anon key and `SUPABASE_SERVICE_ROLE_KEY` both from
`supabase status --workdir /Users/kody/Code/patina-merged -o env`, and
`NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true` — the
config sets `reuseExistingServer: true` and pins no override in `webServer.env`, so
a self-started server is the only way the Wave 2 UI is on. Confirmed the running
server loaded the local stack (`curl -sL http://localhost:3002/ | grep -o '127.0.0.1:54321'`
→ hit). Then `npx playwright test --workers=1 --reporter=list`:

```
  3 failed
    tests/plans-link.spec.ts:190   plan transmittal guest link (Plan Room 00429)
    tests/share-link.spec.ts:114   guest share link (C2)
    tests/threshold.spec.ts:341    names the other houses on the mat …
  36 passed (3.6m)
```

- `plans-link:190` and `share-link:114` — the two named pre-existing failures.
- `threshold.spec.ts:341` — the named `threshold` seed-accumulation drift, at its
  post-Wave-2 line number (`origin/main:236`, same test, same title). Verified
  pre-existing three ways: the spec is **add-only** against `origin/main`
  (`git diff origin/main..HEAD -- apps/client-portal/tests/threshold.spec.ts` has a
  single `-` line, the diff header); Wave 2's seed diff creates **no `public.projects`
  row**; and the seed gives `client@patina.dev` 8 projects against the spec's
  `MULTI_OTHER_HOUSE_COUNT = 2` (received 7 others). Already on the main backlog.
- `threshold.spec.ts:158` (the TZ-fragile case) did not fire this run.

**Nothing else is red — the fourth Wave-2-own failure is gone.** Confirmed with a
targeted re-run on a freshly reset stack (the signing touchpoint mutates its
fixture, so it needs one):

```
✓ tests/threshold.spec.ts:520 reads the composed agreement in full — its parts in position order (7.9s)
✓ tests/threshold.spec.ts:588 keeps the record route standing, and claims no snapshot it does not have (7.5s)
✓ tests/threshold.spec.ts:636 signs a composed agreement at its door, and files what she agreed to (9.4s)
  3 passed (26.4s)
```

R26 and C3-2 are satisfied: the fixture is in the seed and the assertion runs
against it unconditionally.

### 4.9 Consent composer parity, SQL vs TS — ✅ 11 / 11

`public.compose_agreement_consent(uuid)` was called on a real proposal with each
part set laid down and rolled back per scenario; `composeConsentLine` in
`apps/client-portal/src/components/threshold/consent-copy.ts` was transpiled
(`npx tsc … --module commonjs`) and called on the same inputs. Byte comparison:

```
PARITY OK — the nine standard parts, rate_card fee (materialize_standard_parts shape)
PARITY OK — the nine standard parts with the fee as FLAT
PARITY OK — the nine standard parts with the fee as PER_PHASE
PARITY OK — flat alone
PARITY OK — per_phase alone
PARITY OK — per_phase with an EMPTY phases array
PARITY OK — flat with no cents key at all (unset)
PARITY OK — hidden flat beside a visible rate card (R33)
PARITY OK — no money parts at all (legacy sentence)
PARITY OK — unset ceiling and zero retainer (R21)
PARITY OK — record-only variants only (R9)
ALL 11 SCENARIOS BYTE-IDENTICAL
```

The three the ruling names, in full:

```
nine standard parts, rate_card:
  I agree to these design-services terms, the signed role rates, the design authorization
  ceiling, the retainer credited against fees, and the furnishings deposit, and understand
  my signature alone does not authorize work until the studio countersigns.
nine standard parts, FLAT:
  I agree to these design-services terms, the design authorization ceiling, the flat design
  fee, the retainer, which is not refundable, and the furnishings deposit, and understand …
nine standard parts, PER_PHASE:
  I agree to these design-services terms, the design authorization ceiling, the per-phase fee
  schedule, the replenishing retainer, and the furnishings deposit, and understand …
```

Canonical variant order, R21's "unset is not consented to", R9's record-only
silence and R33's hidden-fee silence all hold identically on both sides.

---

## 5 · What this re-gate did NOT do

- **No walk.** No signed-in browser pass of the Contract Room, the Library, the
  picker, the door or the record. The B1/B2/R36 evidence is DB- and e2e-level.
- **No prod anything.** No `db push`, no `functions deploy`, no
  `deploy-portal.sh`, no `wrangler`. Nothing pushed; the branch is local.
- **No lint.** `pnpm --filter @patina/designer-portal lint` was not re-run; the two
  pre-existing errors are recorded in the Wave 1 rulings and this wave touches
  neither file. Per patina-verification, no other package's lint result is
  meaningful.
- **Designer/admin/manufacturer e2e not run** — only the client Playwright suite,
  chromium (its only project).
- **The designer portal was not booted.** Only the client portal, for the e2e.
- **`threshold.spec.ts:158`** did not fail this run; its timezone fragility is
  neither confirmed nor cleared here.
- **W2RG-01 and W2RG-02 were reported, not patched** — a reviewer does not fix.
  The generator was run once to detect the staleness and its output reverted.

---

## 6 · What must happen before this ships

1. Re-run `python3 scripts/generate-legacy-grants.py`, commit the 24-line seed
   delta, `supabase db reset`, and re-probe that `_agreement_studio_id`,
   `agreement_studio_context` and `_agreement_addendum_why` carry the ACLs their
   migrations write (W2RG-01).
2. Anchor the `FROM|TO` terminator in `split_function_targets` and regenerate, so
   no multi-function guarded block survives in the seed (W2RG-02).
3. Delete the two stale comments (W2RG-03, W2RG-04) — one line each.
4. Then re-run: `./scripts/run-sql-tests.sh`, `pnpm db:generate` +
   `git diff --exit-code`, and the client e2e. Nothing else in this report needs
   re-measuring.
