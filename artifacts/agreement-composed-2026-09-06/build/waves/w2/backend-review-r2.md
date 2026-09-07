# Wave 2 — BACKEND lane, adversarial review, ROUND 2

Reviewer: separate context, did not write this code. Date 2026-09-07.
Branch `agreement/w2-backend`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`
(`git rev-parse --show-toplevel` confirmed). Range `main..HEAD` =
18 commits, 16 files, +7534 / −51.

**Verdict: FIX.** No blocker survives. Round 1's two blockers (B1 fingerprint,
B2 keepsake raw fields) and one of its three majors (M1 consent gate) are
fixed and independently proven. One major remains: the M2 two-studio Template
guard does not hold for the exact persona its own commit message names, and
the test written for it uses a different fixture that cannot fail.

---

## 1. Round-1 findings — verified, one by one

| id | round-1 severity | status | proof |
|---|---|---|---|
| B1 fingerprint break | blocker | **FIXED** | all 15 pre-existing services documents hash identically before and after both migrations |
| B2 keepsake raw fields | blocker | **FIXED** | rendered snapshot carries no payload key, no raw cents, no raw enum, no attestation |
| M1 consent composer unauthorized | major | **FIXED** | gate is `get_client_commercial_document_bundle`'s own predicate, character for character; bundle's own gate is identical so no caller regressed |
| M2 cross-studio Template leak | major | **PARTIAL — see F1** | hook filter closes the picker; the RPC guard still admits the two-studio lead designer |
| M3 keepsake drifts from signed page | major | **MOSTLY FIXED — see F2, F3** | renderer now reads AGREEMENT_PART_COPY as SQL literals, pinned on both sides; attachments and the closing boundary still diverge |
| m1 patina.deposit two kinds | minor | **PERSISTS** | 00576:819 schedule/procurement, 00576:893 clause |
| m2 dead event actions | minor | **PERSISTS** | proven: a materialization writes 9 `added` rows, 0 `materialized` |
| m3 flat never countersigned | minor | **PERSISTS (coverage only)** | I ran the flat rail myself; behaviour is correct, still untested |
| m4 frozen signature drift | nit | **PERSISTS** | `copy_agreement_parts_from_authority(uuid, text DEFAULT NULL)` |
| m5 duplicated comment | nit | **PERSISTS** | the R17(a) paragraph appears at 00577:1367 and 00577:1410 |
| m6 empty attachment heading | minor | **PERSISTS — see F4** | `<h2>Empty attachment</h2><article class="leaf"></article>` |
| m7 credit-rule exclusion | nit | advisory, unchanged | recorded for integration |
| m8 event actor FK target | nit | **PERSISTS** | 00577:282 `actor uuid REFERENCES public.profiles(id)` |

### B1 — proven fixed

```
scratch DB patina_w2r restored from the shared stack (head 00575, W1 applied)
15 design-services documents with a terms row, fingerprints captured
apply 00576 exit=0   apply 00577 exit=0
diff fp_before fp_after  ->  ALL FINGERPRINTS IDENTICAL
```

The serviceTerms leg now drops the four keys while they stand at their pre-W2
values (`fee_basis`/`fee_amount_cents`/`fee_schedule` NULL,
`retainer_credit_rule` `'credited'`), the same conditional shape W1 gave
`parts`. Write any one of them and all four re-enter the digest — I confirmed
the flat rail below moves the hash and still countersigns.

### B2 — proven fixed

A composed agreement carrying a `day_rate`, a `cost_plus`, a non-refundable
retainer, a cadence, an attestation and a studio-only clause renders:

```
<h2>Services</h2><p>Scope &lt;b&gt;here&lt;/b&gt;</p><h2>Day rate</h2><p>Recorded with your
agreement.</p><h2>Cost plus</h2><p>Recorded with your agreement.</p><h2>Retainer</h2>
<p>$5,000.00</p><p>Design work begins after the fully executed agreement and retainer
payment.</p><h2>Billing</h2><p>per draw</p><p>Additional work requires written
authorization before it can be invoiced.</p><h2>Empty attachment</h2><article
class="leaf"></article><h2>Ceiling</h2><p>No ceiling — professional time is billed as it
is worked.</p><h2>Percent of cost</h2><p>Recorded with your agreement.</p>
<h2>Phases</h2><p>Recorded with your agreement.</p><h2>Deliverables</h2><ul><li>Concept
presentation</li></ul>
```

```
has_payload_key=f  has_raw_cents=f  has_raw_enum=f  has_studio_only=f
naked_empty_clause_heading=f  has_attestation=f
naked_empty_attachment_heading=t   <-- F4
```

Every sentence matches `packages/types/src/agreement-copy.ts` verbatim, and
the same literals are pinned on the TS side by
`apps/client-portal/src/components/__tests__/commercial-document-shell.test.tsx`
and on the SQL side by `agreement_fee_schedules_test.sql:764`, so a move in
either place turns the other red. That is the R27 mechanism the round-1
finding asked for.

### M1 — proven fixed

The gate is `auth.uid() IS NOT NULL AND (client_id = auth.uid() OR
is_studio_comember(designer_id))`, identical to the bundle's own gate, so the
bundle's only caller passes for exactly the readers it already admitted and no
signed-in stranger reads a fee shape. `agreement_fee_schedules_test.sql` case
14 covers lead / co-member / homeowner / stranger / unauthenticated.

---

## 2. Findings, this round

### F1 · MAJOR — the two-studio Template guard misses the designer it was written for

`materialize_agreement_template` resolves the "agreement's studio" as *every*
active non-guest design studio that both `auth.uid()` and
`proposal.designer_id` belong to, then accepts a Template whose `studio_id` is
any of them. When the acting designer **is** the lead designer and belongs to
two studios, both studios resolve, and studio B's private Template lands on
studio A's agreement. That is the 00566 two-studio persona the fix's own
commit message names ("A designer who belongs to two studios…").

Probe (scratch DB, `ROLLBACK`): one designer, owner of Probe Studio A and
Probe Studio B, lead on a Studio-A draft, materializing Studio B's private
Template:

```
NOTICE:  LEAK: studio B template materialized into studio A agreement, 1 parts

     what     |    part_key     |        title        |             source_template_key
--------------+-----------------+---------------------+---------------------------------------------
 landed_parts | patina.services | STUDIO B ONLY SCOPE | studio.c1b00000-0000-4000-8000-000000000002
```

The new test (`agreement_library_test.sql` case 11) cannot catch this: its
proposal `a6300000-…-004` is led by `a6000000-…-001`, who is a member of
studio A only, so the two-membership join resolves to studio A alone and the
refusal fires for the wrong reason. `save_agreement_as_template` refuses
ambiguity (0 or >1 studios); `materialize_agreement_template` deliberately
does not, and that is where the hole is.

Practical exposure is bounded — the actor is an owner/admin of both Libraries,
and the hook's new `.eq`/`.or` filter means the picker never offers it — but
the migration comment and the lane notes both claim the RPC "refuses that
write", and it does not. Fix: resolve the agreement's studio the way
`save_agreement_as_template` does (refusing ambiguity), or pin the proposal's
studio at composition time; then re-point case 11 at a proposal the
two-studio designer actually leads and watch it go red first.

### F2 · MINOR — the keepsake puts attachments somewhere the signed page never did

`AgreementPartsBody` (`apps/client-portal/src/components/agreement-parts-body.tsx:427-438`)
pulls `attachment` parts **out** of the ordered sections and renders them last,
each as a lettered leaf with a rule and an `ATTACHMENT A · {title}` mono
eyebrow. `_render_agreement_snapshot_html` renders them **inline in position
order** under a plain `<h2>{title}</h2>`, with no letter and no eyebrow. In my
probe the attachment sat at position 7 and printed seventh, between the
cadence and the ceiling — on the page she signed it would have printed last.
R12 + R27 and the migration's own banner ("leaf for leaf it says what
agreement-parts-body.tsx said on the night she ticked the box") say these must
match.

### F3 · MINOR — the keepsake drops the closing boundary sentence

`AgreementPartsBody` always closes with

> This agreement authorizes design services only. Furnishings, freight, tax,
> installation, and purchasing require a separate named furnishings
> authorization.

The snapshot renderer never emits it. The homeowner's permanent copy therefore
omits the one sentence on the page that limits what she authorized.

### F4 · MINOR — an empty attachment still prints a naked heading (m6, unfixed)

The attachment branch always opens `<article class="leaf">` and closes it, so
an attachment with an empty body and `acknowledgeRequired:false` yields
`<h2>Title</h2><article class="leaf"></article>` — non-empty, so the loop-tail
guard emits the heading. Proven above (`naked_empty_attachment_heading=t`).
R21 rules an empty part renders nothing. (Parity note: the client body *does*
always draw an attachment's eyebrow, so if the intent is parity, F2 is the
finding and this one folds into it — but the two cannot both be right.)

### F5 · MINOR — `AgreementExecutionSnapshot` promises fields the bundle never sends

`packages/types/src/agreement.ts` declares `AgreementExecutionSnapshot` with
required `proposalId` and `partSet`. The bundle emits only
`{html, documentHash, createdAt}` (00577:2457-2464), deliberately. A client-lane
consumer that types the bundle's `executionSnapshot` with this interface gets a
compile-time promise the runtime never keeps. Either narrow the type (or add a
`…Ref` shape for the bundle) or say so at the declaration.

### F6 · MINOR — the two new hook modules ship with no tests

`packages/supabase` has 87 spec files and 1068 passing tests; none of them
touch `use-agreement-library.ts` or `use-agreement-part-events.ts`. That
matters more than usual here because, after F1, the hook's
`.or('studio_id.is.null,studio_id.eq.<id>')` filter is the *only* effective
guard against the two-studio Template leak, and it is untested. The same line
interpolates `studioId` into a PostgREST filter grammar without escaping;
today's inputs are uuids, so this is a latent shape rather than a live bug.

### F7 · MINOR — the flat fee basis still reaches no authority in any test (m3)

Only the per-phase rail runs draft→send→sign→countersign. I ran the flat rail
myself and the behaviour is correct:

```
FLAT CONSENT: I agree to these design-services terms and the flat design fee, and understand
              my signature alone does not authorize work until the studio countersigns.
FLAT SIGNED: true      FLAT EXECUTED: true
TERMS      fee_basis=flat amount=800000 schedule=<NULL> credit=credited
AUTHORITY  fee_basis=flat amount=800000 schedule=<NULL> credit=credited ceiling=<NULL>
SNAPSHOT   hash_matches_fp=t
```

So this is a coverage gap, not a defect — but the flat branch of the authority
snapshot is the one a walk is least likely to exercise.

### F8 · MINOR — `patina.deposit` still names two different parts (m1)

`00576:819` seeds `patina.deposit` as `schedule` / `procurement` in
`patina.design_services`; `00576:893` seeds the same key as a `clause` in
`patina.furnishings_services`. Proven by materializing both:

```
patina.design_services      -> … | patina.deposit/schedule/procurement | …
patina.furnishings_services -> … | patina.deposit/clause/- | …
```

R19 wants the standard `patina.*` keys stable. Any reader dispatching on the
key mis-reads one of them.

### F9 · MINOR — a materialization is still nine `added` rows (m2)

Proven:

```
 action | count |                         why
--------+-------+-----------------------------------------------------
 added  |     9 | Materialized from Design services (Patina standard)
```

`agreement_part_events.action` still admits `'materialized'` and `'renamed'`;
nothing writes either. P8's history strip cannot tell a template
materialization from nine separate additions except by reading the `why`.

### F10 · NIT — `copy_agreement_parts_from_authority` still widened (m4)

Shipped `(p_proposal_id uuid, p_why text DEFAULT NULL)` where build-sheet §3.4
froze `(p_proposal_id uuid, p_why text)`. Harmless; the sheet called the
cross-lane signatures frozen.

### F11 · NIT — the duplicated R17(a) comment block (m5)

`00577:1367` and `00577:1410` carry the same paragraph; the first is a
graft-anchor artifact above the new fee-selection block.

### F12 · NIT — `agreement_part_events.actor` points at `profiles`, not `auth.users` (m8)

`00577:282` vs `00576`'s `created_by uuid REFERENCES auth.users(id)`. A caller
without a `profiles` row would FK-violate the whole save rather than lose the
event. Latent today.

### F13 · NIT — every pre-W2 authority now asserts `retainer_credit_rule = 'credited'`

`ADD COLUMN retainer_credit_rule text NOT NULL DEFAULT 'credited'` on
`project_billing_authorities` backfills every already-executed authority with a
value nobody snapshotted at countersign. The default matches historical
behaviour and nothing homeowner-facing prints it, so this is a record-keeping
nit, not a defect — worth one sentence in the deploy note.

### F14 · NIT — the fee projection ignores `client_visible`

Build sheet §3.4 says "exactly one of a `flat` or a `per_phase` **client-visible**
schedule part". Both the duplicate refusal and the projection read the part by
shape alone, visibility-blind — consistent with how W1 reads ceiling/retainer,
and harmless because R22 refuses send without a *client-visible* fee. Recorded
so the deviation is noticed rather than inherited.

### F15 · NIT — `agreementCadenceText` and the SQL renderer disagree on multi-underscore values

TS `cadence.replace("_", " ")` replaces the first underscore only; SQL
`replace(v_text, '_', ' ')` replaces all. No current vocabulary value has two
underscores.

---

## 3. Everything that checks out

- **Both migrations apply clean on a scratch DB**, and clean again on re-apply
  (idempotent; seeded rows stay at 3, no guard trip).
- **Grafts are minimal and from the grep winner.** Body diffs against their
  heads: `_countersign_…_impl` 00575→00577 = the authority INSERT's four
  columns plus the guarded snapshot INSERT, nothing else;
  `_sign_…_authorized` = the metadata merge only;
  `sign_…_with_trusted_ip` 00511→00577 = one argument passed through;
  `get_client_commercial_document_bundle` = two added keys;
  `_commercial_document_fingerprint` = the conditional serviceTerms leg.
  `upsert_agreement_parts` keeps every W1 guard (I diffed it line by line — no
  W1 refusal was removed).
- **Countersign anchors survive**: `'commercialDocumentId'` present, and the
  `app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date,
  v_actor )` fragment matches verbatim (both probed `t`).
- **No new invoice caller.** The universe is the same six routines.
- **Overloads**: `\df`-equivalent catalog probe returns exactly one row for
  `sign_design_services_agreement_with_trusted_ip`,
  `_sign_design_services_agreement_authorized` and `upsert_agreement_parts`.
  ACLs after the DROPs are re-issued identically to their heads
  (`sign_…` → service_role only; `upsert_agreement_parts` → authenticated
  only; `_sign_…_authorized` → none).
- **Both pinned hashes match the live catalog**:
  `sign…(uuid,text,uuid,text,jsonb)` =
  `8539825f7dc69971ae5ab3ec81c7e86d7b663f7beea5133fb4cbe010fd7f0288`,
  `_countersign…(uuid,text,jsonb)` =
  `a5c8dfec6d6798dc7bc8c2ab0f0ac71f97b715536a33be466f65ab0840e9221b`,
  and `public_sd_hardening_contract_test.sql` passes. The `:2332` sibling
  literal moved with the function.
- **RLS + grants in the same migration**: all four new tables `rls=true`;
  policies exactly as §3.2/§3.3 specify; `anon` holds nothing; `authenticated`
  gets `SELECT` plus `UPDATE (title, consent_key)` / `DELETE` on templates and
  `SELECT`/`DELETE` on studio parts; both append-only tables carry
  `guard_commercial_immutable_row`.
- **Every SECURITY DEFINER pins `search_path`**; every private helper is
  revoked from `PUBLIC, anon, authenticated, service_role`; no bare extension
  function call anywhere in the diff.
- **R3 enforced in the database**: a plain member's `save_agreement_part`
  raises `insufficient_privilege`, and the same member reads 4 templates.
- **Seeded rows are Patina's**: `UPDATE` and `DELETE` both raise 42501
  "Patina agreement templates are immutable" **as the session superuser**.
- **All three seeded templates materialize** into a draft in the contract's
  order; `patina.design_build` is absent; no seeded money the designer did not
  type (all three compose to the legacy consent literal — R28).
- **`save_agreement_as_template` works from a SENT proposal** and leaves the
  part set byte-identical.
- **Consent parity**: the SQL legacy literals are character-identical to
  `consent-copy.ts:26-37`; the composed sentences match §5.1's table (I read
  back the flat and non-refundable-retainer forms live).
- **R9 in the projection, not the chip**: `cost_plus`, `percent_of_cost`,
  `day_rate`, `package` written straight through the RPC leave `fee_basis`
  NULL and the consent sentence unchanged.
- **No W3 leakage**: every `design_build` / `per_draw` hit in the diff is a
  comment or a negative assertion.
- **R7 vocabulary**: zero hits for "clause library", "contract builder",
  "snippet"; no `AI` in any added string.
- **ACL seed is current**: `python3 scripts/generate-legacy-grants.py` →
  "baseline + 2263 replayed statements", `git status` clean afterwards.
- **Generated types are in sync**: a fresh
  `supabase gen types typescript --db-url <scratch>` differs from the committed
  file by **106 lines, all of them the five `Relationships` blocks for FKs my
  `pg_restore` could not re-create** (the shared stack's own orphan rows —
  documented in the lane notes). **Zero agreement-related lines differ.**
- **DECISIONS R138** lands on this branch, append-only, footer updated to
  `last id = R138`.

---

## 4. Gates I ran

Scratch DB `patina_w2r`, `pg_restore --no-owner` of the shared stack (head
`00575`), both migrations applied in order. Shared stack never written;
confirmed still at `00575` with `agreement_templates` absent afterwards. Both
scratch DBs dropped.

```
apply 00576  exit=0   (only "… does not exist, skipping" notices)
apply 00577  exit=0   (only "… does not exist, skipping" notices)
re-apply 00576 exit=0 · re-apply 00577 exit=0   (idempotent)

rc=0 PASS=12  commercial/agreement_library_test.sql
rc=0 PASS=8   commercial/agreement_fee_schedules_test.sql
rc=0 PASS=30  commercial/agreement_parts_test.sql
rc=0 PASS=5   commercial/agreement_parts_projection_test.sql
rc=0 PASS=7   commercial/multi_studio_signature_test.sql
rc=0 PASS=13  commercial/design_services_paper_issue_test.sql
rc=0 PASS=15  schedule/ceremony_hardening_test.sql
rc=0          edge_api/public_sd_hardening_contract_test.sql   (assert-only)
rc=0          edge_api/public_rpc_authorization_contract_test.sql

run-sql-tests.sh -d supabase/tests/commercial : 8 green / 6 fail
run-sql-tests.sh -d supabase/tests/edge_api   : 3 green / 5 fail
```

Every failure is pre-existing or environmental, proven side by side on a W1
baseline (`patina_w2base`, no W2 migrations):

```
suite                                  BASE            W2
authorized_schedule_test               rc=3 same msg   rc=3 same msg
design_services_authority_test         rc=3 same msg   rc=3 same msg
design_services_gap_hardening_test     rc=3 same msg   rc=3 same msg
executed_on_paper_test                 rc=3 same msg   rc=3 same msg
trade_rfq_test                         rc=3 same msg   rc=3 same msg
trade_scope_test                       rc=3 same msg   rc=3 same msg
```

(the five KNOWN_FAILURES Group-3 files plus `trade_rfq_test`, all
`designDisposition`-family fixture drift). The five `edge_api` failures are
`cron.job does not exist` — the pg_cron schema does not survive `pg_restore`
into a scratch DB; not a code signal.

```
pnpm --filter @patina/types    type-check   → clean (rc 0)
pnpm --filter @patina/supabase type-check   → clean (rc 0)
pnpm --filter @patina/supabase test         → 87 files, 1068 passed | 12 skipped
python3 scripts/generate-legacy-grants.py   → 2263 statements, git clean
supabase gen types … <scratch>              → 106-line diff, 0 agreement lines
git status --porcelain                      → empty
```

## 5. Not verified by me

- No portal gate (`designer-portal` / `client-portal` / `admin-portal`) — no
  `apps/**` file is in this lane's diff; `pnpm --filter @patina/admin-portal
  build` is still owed at integration because `packages/**` moved.
- The snapshot HTML has still never been **rendered in a browser**. F2/F3/F4
  are read off the two implementations, not off a screenshot.
- Nothing applied to Strata. No `db push`, no `functions deploy`, no wrangler.
- The shared local stack was never reset; a `pnpm supabase:reset` replay that
  includes the regenerated ACL seed is owed at integration.
- Consent parity against the client lane's `composeConsentLine` — that function
  lives on the client branch and is not in this diff. I verified the SQL side
  against build-sheet §5.1 and against `consentLineFor`'s literals on `main`.
