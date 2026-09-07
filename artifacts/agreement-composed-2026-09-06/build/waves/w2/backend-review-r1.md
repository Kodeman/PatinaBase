# Wave 2 — BACKEND lane, adversarial review, round 1

Reviewer: separate context, did not write this code. Date 2026-09-07.
Branch `agreement/w2-backend` @ `831a3e162`, base `main` (`a6584dbc5` lineage).
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`
(`git rev-parse --show-toplevel` confirmed).

**Verdict: FIX — 2 blockers, 3 majors.** Every build-sheet item in the backend
lane's section was delivered, the grafts are honest, the re-pins are correct and
the SQL suites are green. Two defects are not caught by any of that: one makes
the migration unsafe on Strata, one puts raw field names and raw cents on the
homeowner's keepsake.

---

## What was verified, and how

Scratch databases only. The shared stack at `54322/postgres` was read but never
written; confirmed still at head `00575` with `to_regclass('public.agreement_templates')`
NULL after every probe, and both scratch DBs dropped.

```
patina_w2r  = pg_restore of the shared stack (head 00575) → apply 00576 → apply 00577
patina_w2s  = pg_restore of the shared stack (head 00575) → one agreement taken to
              client_signed and COMMITTED → apply 00576 → apply 00577
```

### Apply

```
00576_agreement_library.sql          rc=0   (only "… does not exist, skipping" notices)
00577_agreement_fee_schedules.sql    rc=0   (only "… does not exist, skipping" notices)
to_regclass: agreement_templates | agreement_part_events | agreement_execution_snapshots
```

### SQL suites, before and after the two migrations (same scratch DB)

| Suite | W1 baseline | after 00576+00577 |
|---|---|---|
| `commercial/agreement_library_test.sql` | n/a | **rc=0, 11 PASS** |
| `commercial/agreement_fee_schedules_test.sql` | n/a | **rc=0, 5 PASS** |
| `commercial/agreement_parts_test.sql` | rc=0, 30 PASS | rc=0, 30 PASS |
| `commercial/agreement_parts_projection_test.sql` | — | rc=0, 5 PASS |
| `commercial/multi_studio_signature_test.sql` | rc=0, 7 PASS | rc=0, 7 PASS |
| `schedule/ceremony_hardening_test.sql` | rc=0, 15 PASS | rc=0, 15 PASS |
| `edge_api/public_sd_hardening_contract_test.sql` | — | **rc=0** (assert-only) |
| `commercial/design_services_authority_test.sql` | rc=3 | rc=3 — identical error |
| `commercial/design_services_gap_hardening_test.sql` | rc=3 | rc=3 — identical error |
| `commercial/authorized_schedule_test.sql` | rc=3 | rc=3 — identical error |

The three reds are byte-identical on both sides of the change and are already in
`supabase/tests/KNOWN_FAILURES.md` (Group 3 fixture drift). Not this wave's.

### Overloads and pinned hashes

```
_sign_design_services_agreement_authorized      | 1
sign_design_services_agreement_with_trusted_ip  | 1
upsert_agreement_parts                          | 1
to_regprocedure(_sign_design_services_agreement_authorized(uuid,text,uuid,text,jsonb)) → resolves

sign …_with_trusted_ip(uuid,text,uuid,text,jsonb)  = 8539825f7dc69971ae5ab3ec81c7e86d7b663f7beea5133fb4cbe010fd7f0288
_countersign_design_services_agreement_impl(...)   = a5c8dfec6d6798dc7bc8c2ab0f0ac71f97b715536a33be466f65ab0840e9221b
```
Both match the manifest rows re-pinned in
`public_sd_hardening_contract_test.sql`, both carry a previous-hash comment in
the 00566 house style, the two counts are untouched, and the bare signature
literal in the "sign/accept siblings" assertion moved with the function.

### Grafts

Each redefined body extracted programmatically from its `grep|sort|tail -1`
winner and diffed against the shipped one. Every diff is the named delta and
nothing else:

| Function | Grafted from | Diff |
|---|---|---|
| `upsert_agreement_parts` | 00575 | signature + fee validation + one-fee-basis refusal + fee projection + event log |
| `_countersign_design_services_agreement_impl` | **00575** (not 00566) | 4 columns on the authority INSERT + the snapshot INSERT |
| `get_client_commercial_document_bundle` | 00575 | `consentSentence` + `executionSnapshot` keys |
| `_sign_design_services_agreement_authorized` | 00575 | `p_consent` + metadata merge |
| `sign_design_services_agreement_with_trusted_ip` | 00511 | `p_consent` + pass-through |

Grafting the countersign from 00566 (as the brief and the sheet both said) would
have reverted W1's F-2 `IS NULL` disjunct. The lane caught that; it is right.
`'commercialDocumentId'` and the verbatim
`app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )`
fragment both survive, and the hardening test's exhaustive caller-universe
assertion passes — **no new caller**.

### Reproducibility

```
python3 scripts/generate-legacy-grants.py   → baseline + 2262 replayed statements
git status --porcelain supabase/seed/00-legacy-grants.sql   → EMPTY (byte-identical)

supabase gen types typescript --db-url <scratch>  vs committed database.types.ts
  → 90 diff lines, ALL of them the five FK Relationship blocks pg_restore could
    not recreate (the lane documented this) plus my own probe helper. The
    committed file is faithful.

pnpm --filter @patina/types    type-check  → rc=0
pnpm --filter @patina/supabase type-check  → rc=0
```

### Behaviour probes (independent of the lane's own tests)

- Seeded template UPDATE and DELETE both raise `insufficient_privilege`
  ("Patina agreement templates are immutable") as superuser; both succeed under
  `SET LOCAL app.allow_patina_template_mutation = 'on'`. ✔
- Plain active member: reads 3 seeded templates and the studio's part;
  `save_agreement_part` raises "only a studio owner or admin may edit the
  Library"; direct DELETE affects 0 rows; direct UPDATE of a seeded title
  affects 0 rows. ✔ (R3 in RLS/RPC, not only in the UI.)
- Sanitizer, three depths:
  `{body, proposalId, nested:{createdBy,keep}, items:[{id,text}]}` →
  `{"body":"Ours.","items":[{"text":"keep me"}],"nested":{"keep":"yes"}}`. ✔
- R9 in the projection: a hand-made `day_rate` + `cost_plus` written straight
  through the RPC leaves `fee_basis`, `fee_amount_cents`, `fee_schedule` all
  NULL, and the consent sentence names neither. ✔
- Seeded set is exactly `patina.consultation`, `patina.design_services`,
  `patina.furnishings_services`; `patina.design_build` absent. ✔

---

## BLOCKER 1 — the four new terms columns change the fingerprint of every existing document, and countersign refuses on the mismatch

`supabase/migrations/00577_agreement_fee_schedules.sql:71-78` (and the banner
claim at `:41-46`).

`_commercial_document_fingerprint` hashes the terms row as
`to_jsonb(t) - 'created_at' - 'updated_at'` (00575). Four `ADD COLUMN`s change
that JSON for **every** row, so every design-services and service-addendum
document's fingerprint moves at migration time. `_countersign_design_services_agreement_impl`
hard-refuses when the stored client signature disagrees with the freshly
computed one (`00577:1799-1804`).

The banner says "a new COLUMN is covered automatically — the same reason
`furnishings_deposit_percent` needed none." That is true going forward and false
for documents already signed. W1's own comment inside the fingerprint names this
exact failure mode: *"A parts-less document must hash exactly what it hashed
before this migration, or every in-flight client_signed agreement dies."* The
build sheet's §3.3 asserts the same wrong thing; the sheet is wrong.

Proven twice on scratch DBs.

**(a) a parts-less legacy agreement, same DB, before and after:**

```
before 00576/00577 : c33f273c4d44629bf6d30469fa1b704fff031dcd6f7f38f259329ab3304f35aa
after  00576/00577 : c7142f125f979142cbdd9455a17a0b6e450b4b9502a2bb07f0ccf8877db47066

serviceTerms after: {... "fee_basis": null, "fee_schedule": null,
                     "fee_amount_cents": null, "retainer_credit_rule": "credited" ...}
```

**(b) end to end — an agreement taken to `client_signed` and COMMITTED on the
W1 head, then migrated, then countersigned:**

```
state=client_signed
stored_client_fp           = 79190b3dba2b688f819dc5983dc0b606c4c99fdcda8c05fffacd0c1374a33bfd
current_fp (pre-migration) = 79190b3dba2b688f819dc5983dc0b606c4c99fdcda8c05fffacd0c1374a33bfd
--- apply 00576, 00577 ---
current_fp (post)          = 3fdc13d438136e27c440365e17864d2a4556e500dd7cdbd7e304c78bf79da86a
countersign_design_services_agreement(...)
  → NOTICE: COUNTERSIGN REFUSED: 23514 studio countersign requires the exact
    current client consent fingerprint
```

Every agreement sitting in `client_signed` on Strata at `db push` time becomes
permanently uncountersignable. No flag covers this — `agreement-library` gates
UI, not the schema. The `executed` retry branch (`00577:1824-1830`) breaks the
same way.

**Fix direction** (orchestrator's call, not mine to make): make the terms
projection inside the fingerprint drop the four keys when they are at their
pre-W2 values — the same conditional shape W1 used for `parts` — and re-pin the
fingerprint's own hash if it is pinned anywhere. A migration-time repair of
existing signature rows is not available; the signature table is immutable.

---

## BLOCKER 2 — the copy she keeps prints raw payload field names, raw integer cents, and a raw enum

`supabase/migrations/00577_agreement_fee_schedules.sql:344-378` (record-only
`ELSE` branch), `:353-357` (retainer credit rule), `:390-404` (attestation).

Actual output of `_render_agreement_snapshot_html` on a composed agreement
carrying a retainer, a `day_rate` and a `cost_plus` part:

```html
<h2>Retainer</h2><p>$5,000.00 · non_refundable</p>
<h2>Day rate</h2><table><tr><td>dayRateCents</td><td>250000</td></tr>
                        <tr><td>minimumDays</td><td>2</td></tr></table>
<h2>Cost plus</h2><table><tr><td>disclosure</td><td>Net invoices shown on request.</td></tr>
                         <tr><td>markupPercent</td><td>18</td></tr></table>
```

This is R12's frozen keepsake — the most permanent homeowner-facing artifact the
program produces. `dayRateCents`, `minimumDays`, `markupPercent`, `disclosure`
are stored field names; `250000` is raw cents where every other money figure in
the same renderer goes through `_agreement_money`; `non_refundable` is a raw
enum with an underscore in it. The vocabulary rule binding every string a
homeowner reads forbids a database column name outright, and the same rule is
why `agreementCadenceText()` exists in `packages/types/src/agreement-copy.ts`.

The comment above the branch says "with no money read out of it" — the branch
does read money out of it, unformatted.

---

## MAJOR 1 — `compose_agreement_consent` performs no authorization check

`supabase/migrations/00577_agreement_fee_schedules.sql:436-548`.

`SECURITY DEFINER`, `GRANT EXECUTE … TO authenticated`, and no access test of
any kind on `p_proposal_id`. Any signed-in user reads the composed consent
sentence for any proposal id in the database, which discloses which fee
instruments another studio's agreement carries and the retainer's credit rule.

```
-- an authenticated user in no studio, unrelated to the proposal
stranger part rows visible: 0                       ← RLS is correct
STRANGER READS: I agree to these design-services terms, the flat design fee,
  and the retainer, which is not refundable, and understand my signature alone
  does not authorize work until the studio countersigns.
```

Every sibling definer RPC in this family gates on `is_studio_comember` /
`_can_author_proposal` / the client's own id; 00511 is the migration whose whole
subject is that posture. The bundle calls it as owner and does not need the
grant to be this wide.

---

## MAJOR 2 — a multi-studio member sees, and can compose from, the other studio's Library

`packages/supabase/src/hooks/use-agreement-library.ts:128-143` and
`supabase/migrations/00576_agreement_library.sql` (`materialize_agreement_template`,
the template lookup).

`useAgreementTemplates(studioId)` uses `studioId` **only as a cache key** — the
query has no `.eq('studio_id', …)` and leans on RLS, which returns every studio
the member belongs to. `useStudioAgreementParts` does filter; templates do not.
Separately, `materialize_agreement_template` checks that the caller may author
the proposal and that the caller is an active member of the *template's* studio
— never that the two studios are the same.

Proven on a designer who owns two studios (the 00566 two-studio account the walk
script singles out):

```
what the hook's query returns, under RLS, with studioId = studio ONE:
  seeded  |                                      | Consultation / hourly
  seeded  |                                      | Design services (Patina standard)
  seeded  |                                      | Furnishings only
  studio  | b1100000-…-000000000002 (studio TWO) | Studio TWO private template   ← leak

materialize studio TWO's template into studio ONE's proposal → 1 part written
  patina.services | Studio TWO scope | source_template_key = studio.fe7f0889-…
```

R2 says the scope is the studio. The library test's cross-studio case only
covers a member of B who is *not* a member of A, so nothing catches this.

---

## MAJOR 3 — the keepsake is a third renderer and drifts from the page she signed

`_render_agreement_snapshot_html` composes its own prose instead of reading
`AGREEMENT_PART_COPY` (`packages/types/src/agreement-copy.ts`), which R27
established as the one source both surfaces read. Concretely, for the same
part set the snapshot and the client body disagree:

| Part state | client body (W1) | the snapshot |
|---|---|---|
| ceiling with no figure | `No ceiling — professional time is billed as it is worked.` | nothing at all |
| retainer | the activation sentence (`agreementRetainerActivation`) | `$5,000.00 · non_refundable` |
| cadence | the cadence + `Additional work requires written authorization…` | the bare stored word |
| any unset money part | `Not yet set` | the part is dropped |

R12's promise is that she keeps *the agreement as executed*. A keepsake whose
sentences were never on the page she signed does not keep that promise. (The
snapshot has never been rendered in a browser by anyone yet — the lane says so.)

---

## Minors and nits

1. **`patina.deposit` carries two different kinds.** `schedule`/`procurement` in
   `patina.design_services` (00576:785) and `clause` in
   `patina.furnishings_services` (00576:858). R19 asks the standard keys to be
   stable; one key that is a money part in one template and prose in another
   will confuse any reader that dispatches on the key. Minor.
2. **`action` values `'materialized'` and `'renamed'` are dead.** The CHECK
   allows them (00577:147-148) and nothing writes either — a template
   materialization logs a set of `added` rows whose `why` happens to start
   "Materialized from ". The history strip cannot tell a materialization from
   nine separate additions. Minor.
3. **`flat` is never carried through a countersign.** `agreement_fee_schedules_test.sql`
   runs the full rail on `per_phase` only; `fee_basis='flat'` reaching
   `project_billing_authorities` is asserted nowhere. Minor.
4. **`copy_agreement_parts_from_authority` drifted from the frozen signature.**
   §2 froze `(p_proposal_id uuid, p_why text)`; shipped as
   `(uuid, text DEFAULT NULL)`. Harmless, but the sheet said "frozen". Nit.
5. **Duplicated comment block** in `upsert_agreement_parts` — the
   "true = the parts door … R17(a) … cannot leak past this statement" paragraph
   appears twice, once orphaned above the new fee block (00577 ≈ :1173 and
   :1186). A graft-anchor artifact. Nit.
6. **An empty `attachment` part still renders its heading.** The empty-part guard
   compares `v_body <> '<p></p>'`, but an attachment's body is
   `<article class="leaf"><p></p></article>`, which passes it (00577:397-400).
   R21/R3-6 said no naked headings. Minor.
7. **`agreement_parts_projection_test.sql` now also excludes `retainer_credit_rule`.**
   The reasoning in the file is sound (the seven-facet room has no field for it),
   but it means no test compares that column across the two doors. Advisory.
8. **`agreement_part_events.actor` references `public.profiles(id)`** while
   `agreement_templates.created_by` references `auth.users(id)`. Any definer
   write for a user without a profile row would FK-violate rather than record
   the event. Nit; every designer has a profile today.

---

## Not verified by this review

- No portal type-check, jest, e2e or `admin-portal build` — `packages/**`
  changed, so the admin build is still owed at integration.
- No `pnpm supabase:reset` on the shared stack (integration steward's).
- Nothing applied to Strata; no `db push`, no `functions deploy`, no wrangler.
- The SQL↔TS consent parity can only be half-checked: the SQL literals match
  build-sheet §5.1 verbatim, but `composeConsentLine` does not exist yet (client
  lane). Diff them at integration.
- The snapshot HTML was asserted textually, never rendered.
