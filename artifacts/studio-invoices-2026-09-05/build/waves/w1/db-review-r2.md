# W1 DB lane — adversarial review, round 2

Reviewer: separate context, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`, branch
`studio-invoices/w1-db`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

**Verdict: fix** — no blocker. One **major** (a migration-number collision with a
concurrent program's worktree; an integration action, not a code defect), plus
polish. Every money-path and RLS probe I could think of came back clean.

---

## Prior-round findings — status

| id | r1 severity | status now | evidence |
|---|---|---|---|
| F1 ungated status write on the studio branch | blocker | **FIXED** | `INSERT invoices(project_id NULL, status 'paid', invoice_number 'INV-9999', amount_paid_cents 100000…)` as an authenticated member → `P2 refused sqlstate=P0001 msg=studio_id_not_designer_studio`. `UPDATE … SET status='sent', invoice_number='INV-7777'` on a studio draft → `HANDWRITE refused sqlstate=P0001`; `SET amount_paid_cents=40000` → `HANDWRITE amount_paid refused sqlstate=P0001`. Legitimate draft edit still passes (`DRAFT EDIT accepted memo=edited memo title=R consult, revised`). |
| F2 Checkout rail unproven by the suite | major | **FIXED** | `studio_invoice_test.sql:156-217` now drives `claim_invoice_checkout_attempt → finalize → settle` and asserts paid + a `designer_earnings` row with `project_id IS NULL` and the title in the description. Suite `PASS`. |
| F3 stack-reset log incomplete | minor | **PARTLY** | `db-notes.md:157-163` still says "Both are logged in `stack-reset-notice.md`"; the notice file has one lane line (14:21:55Z = the second, worktree-scoped reset). The first reset (main checkout, dropped the peer's 00569) still has no line. |
| F4 no contract-test pin for `create_draft_studio_invoice` | minor | **UNCHANGED** | `grep -rn create_draft_studio_invoice supabase/tests/` → only `billing/studio_invoice_test.sql`. The pin lives only in the one-shot DO block at `00570:876-940`. |
| F5 `resolve_studio_identity` short-circuits on a bogus studio | minor | **UNCHANGED** | `SELECT * FROM resolve_studio_identity(NULL, <designer>, '…dead')` → `studio_id NULL, name 'Studio Manager', source full_name` (skips the primary-studio derivation). |
| F6 no `has_designer_domain_role` on the studio branch | minor | **UNCHANGED** | See R2-3 below — now with a sharper proof. |
| F7 hook forces `kind:'adhoc'` | nit | **UNCHANGED** | `use-invoices.ts:789`; test at `__tests__/use-invoices.test.ts:542` pins it. |
| F8 unguarded `ADD CONSTRAINT`, no title length CHECK | nit | **UNCHANGED** | `00570:45-56`. |

---

## Brief items 1–10 — delivered

1. `project_id` nullable + FK/cascade kept, `title text`, `chk_invoices_anchor` **validated** (`convalidated = t`), `COMMENT ON COLUMN` present.
2. `set_invoice_studio_id()` rebased on its TRUE head. Anchored grep → `00511_public_sd_hardening.sql` is the last definition before 00570. Body diff old→new: **145 inserted lines, 0 deleted** — every project-path line byte-identical.
3. `create_draft_studio_invoice` — SECURITY DEFINER, `proconfig = {search_path=pg_catalog, public, pg_temp}`, ACL identical in shape to `create_draft_invoice` (`{postgres=X/postgres,authenticated=X/postgres}`), totals/rounding copied exactly (`round(qty*unit)::integer`, `round(subtotal*rate)::integer` — probe: qty 0.5 × 333¢, rate 0.0825 → 167 / 14 / 181).
4. `apply_invoice_payment_effects` rebased on `00277`; diff is exactly two hunks — `JOIN` → `LEFT JOIN projects` and `COALESCE(pr.name, i.title, 'Studio invoice')`. Refund contra leg untouched.
5. Three additive household SELECT policies; 00178's stay.
6. `resolve_studio_identity` drop+create as the 3-arg form, grants and comment re-applied.
7. `supabase/tests/billing/studio_invoice_test.sql` — PASS.
8. `database.types.ts` regenerated (nullable `project_id`, `title`, the new RPC, the 3-arg resolver).
9. Hooks: `Invoice.project_id: string | null`, `title`, `useCreateDraftStudioInvoice`, `useClientInvoices` (select shape matches `useProjectInvoices` exactly), both exported.
10. Null-safety in the designer portal; the client portal needed none (`type-check` clean).

## Gates I ran

```
supabase --workdir …/agent-si-db db reset      → "Finished supabase db reset" (clean)
bash …/scripts/run-sql-tests.sh                → total 157 · green 136 · expected-fail 21 · unexpected-fail 0
  PASS supabase/tests/billing/studio_invoice_test.sql
  PASS supabase/tests/billing/invoice_checkout_integrity_test.sql
  PASS supabase/tests/edge_api/public_sd_hardening_contract_test.sql
  PASS supabase/tests/commercial/multi_studio_signature_test.sql
  PASS supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql
pnpm --filter @patina/supabase type-check      → clean
pnpm --filter @patina/supabase test -- use-invoices → 48 passed
pnpm --filter @patina/designer-portal type-check → clean
pnpm --filter @patina/client-portal type-check   → clean
pnpm --filter @patina/designer-portal test -- accounts desk-receivables → 3 suites, 12 tests passed
```

## Independent probes (all against the freshly reset local stack)

- **Cross-studio household** — member B of studio two billing a household on member A's studio-one roster → `42501 studio invoice household not found or access denied`.
- **Non-member studio / blank title / empty lines / milestone kind** — covered by the suite (42501 / 23514) and re-run green.
- **Direct DML on `invoice_line_items`** — a `milestone` line is refused by `chk_line_items_milestone_kind`, an `ffe` line by `chk_line_items_ffe_kind`, a **`time` line is accepted** on a studio draft (same latitude the project path has; S6 is enforced at the RPC only). See R2-10.
- **Identity immutability** — `UPDATE … SET project_id = <a real project>` on a studio draft → `P0001`; `UPDATE … SET client_id = <stranger>` → `P0001`; `UPDATE invoices SET project_id = NULL` on a project invoice as `postgres` → `P0001`.
- **RLS** — household: issued 1 / draft 0 / line items on issued 1 / line items on draft 0. Co-member: issued 1 / draft 1. Stranger: 0 invoices, 0 line items (zero rows, never an error). `anon`: 0 rows.
- **The bookkeeper persona end to end** (the plan's studio moment): member B with no roster row draws the invoice → stamped `designer_id = A` (the roster owner); B issues it → `INV-0001` off `studio_invoice_counters`; B records a check → `paid`; `designer_earnings` = 1 row, `Invoice INV-0001 — Bookkeeper consult`.

---

## Findings

### R2-1 · major (confidence 0.95) · migration number collision — renumber before merge
`00570` is claimed twice across live worktrees:
```
.codex/worktrees/agent-si-db/      … 00570_studio_invoices.sql
.codex/worktrees/agent-cae-w2-web/ … 00570_approval_response_signature.sql
.codex/worktrees/agent-cae-w2-backend/ … 00569_approval_why_viewer_role_and_receipt.sql
main                               … tip 00568_decision_first_notice_dispatch.sql
```
`patina-parallel-work` SKILL.md:132 — "Re-check the target tip right before merge; renumber on collision". Two files sharing the version prefix land as one ledger version; whichever merges second is at risk of being treated as already applied and silently skipped on Strata. Fix: the integration lane renumbers this migration (00571+ after re-checking the tip) and re-runs `db reset` + the SQL suite. No code change inside the migration.

### R2-2 · minor (confidence 0.9) · `title` is not in the trigger's `UPDATE OF` list
```
CREATE TRIGGER set_invoice_studio_id BEFORE INSERT OR UPDATE OF id, studio_id, designer_id,
  client_id, project_id, status, invoice_number, issue_date, due_date, payment_terms_days,
  currency, subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents, memo,
  internal_notes, sent_at, paid_at, voided_at, void_reason, stripe_checkout_session_id,
  reminder_count, last_reminder_at, ar_flagged_at, ar_last_chased_at, created_at, updated_at
  ON public.invoices …
```
00570 adds a column the invoice emails, the Stripe product name, the ledger and the client's letterbox all read, but does not add it to the gate's column list — an `UPDATE invoices SET title = …` never fires `set_invoice_studio_id()` at all. Not exploitable today: the only designer/co-member UPDATE policies are `((designer_id = auth.uid()) AND (status = 'draft'))` and `(is_studio_comember(designer_id) AND (status = 'draft'))`, so a title rewrite on an issued invoice is refused by RLS. Defence-in-depth only, and a drift the contract test cannot catch (it pins the function body, not the trigger definition). Fix: `ALTER TRIGGER`/recreate the trigger with `title` in the `UPDATE OF` list, in the same migration, and assert the trigger definition in `studio_invoice_test.sql`.

### R2-3 · minor (confidence 0.85) · a member with no designer-domain role can be stamped as `designer_id` and earn
The project path requires `public.has_designer_domain_role(NEW.designer_id)` at two places in the trigger and joins `roles.domain = 'designer'` inside `create_draft_invoice`. The studio branch and `create_draft_studio_invoice` require only an active non-guest `organization_members` row. Sharper proof than r1: in one transaction, as the same actor with `has_designer_domain_role → f`,
```
create_draft_studio_invoice(...)  → OK
create_draft_invoice(...)         → "invoice project not found or access denied"
```
and after settle the studio invoice wrote a `designer_earnings` `design_fee` row for that user. Within the brief as written ("an active non-guest organization_members row"), and `db-notes` reasons it out ("a studio invoice has no project lead"), so this is an authority-model delta for the orchestrator to rule, not a brief violation. If it should match: add `AND public.has_designer_domain_role(NEW.designer_id)` to both studio-branch EXISTS clauses and to the roster resolution.

### R2-4 · minor (confidence 0.9) · the new SD RPC is pinned only inside the migration
`create_draft_studio_invoice` appears nowhere in `supabase/tests/` except its own behavior suite. `public_sd_hardening_contract_test.sql:2085-2115` pins `create_draft_invoice` (overload count, `prosecdef`, `proconfig`, args, result, ACL, body sha256, octet_length); the studio sibling has only the one-shot `DO $studio_draft_roster$` block at `00570:876-940`, which never runs again after the migration applies. Fix: add a sibling manifest row / DO block to the contract test.

### R2-5 · minor (confidence 0.8) · `resolve_studio_identity` short-circuits on an unresolvable `p_studio_id`
`00570:1244-1248` sets `v_studio_id := p_studio_id` unconditionally, so a non-existent studio skips both the project and primary-studio derivations and falls to the profile identity (probe above). Unreachable from a real invoice (`studio_id` is FK-checked), so an edge-case note. Fix: only short-circuit when the `organizations` read `FOUND`.

### R2-6 · minor (confidence 0.9) · the reset log still doesn't record the reset that wiped the peer's 00569
`db-notes.md:157-163` asserts both resets are logged; `stack-reset-notice.md` carries one lane line. The orchestrator should know the peer's 00569 was dropped from the shared local stack once, and the missing line should be appended.

### R2-7 · minor (confidence 0.75) · no index behind the new household policies
`pg_indexes` on `invoices`: `designer_status`, `due_date_live`, `project`, `studio`, pkey and the two number-uniqueness indexes — **no `client_id` index**. All three new policies filter `client_id = auth.uid()`, and `useClientInvoices()` is an unscoped `select` that runs on the client page's front door. Fix: `CREATE INDEX idx_invoices_client ON public.invoices (client_id) WHERE client_id IS NOT NULL;`.

### R2-8 · nit (confidence 0.8) · guard symmetry and an unbounded title on direct DML
`00570:48` uses `ADD COLUMN IF NOT EXISTS title` but `:51` uses a bare `ADD CONSTRAINT chk_invoices_anchor`; the RPC bounds the title at 200 chars while a draft `UPDATE … SET title = …` (accepted in probe 3) is unbounded. Optional `CHECK (char_length(title) <= 200)`.

### R2-9 · nit (confidence 0.7) · the hook swallows a mis-typed line kind
`use-invoices.ts:786-795` maps every line to `kind: 'adhoc'` and drops `milestoneId`/`ffeItemId`, so the RPC's explicit `23514` message ("a studio invoice carries ad-hoc lines only…") can never reach the R83 band. Pass `row.kind` through.

### R2-10 · nit (confidence 0.65) · S6 is enforced at the RPC only
A `time`-kind line inserts cleanly onto a studio draft via direct DML (`invoice_line_items` INSERT policy is `designer_id = auth.uid() AND status = 'draft'`); only `milestone` and `ffe` are stopped, by their own pre-existing CHECKs. The same latitude exists on project invoices, so nothing regressed — but W2's line editor (`useUpsertLineItems`) must carry the ad-hoc lock, or a studio invoice can grow a `time` line the composer never intended.

### R2-11 · nit (confidence 0.9) · M2's `Studio ·` stamp is not here (correctly)
`accounts-ledger-page.tsx:131` / `accounts-receivables-page.tsx:170` render `project?.name ?? title ?? 'Studio'`, so a studio invoice shows only its title — proposal M2 shows `Studio · Design consultation · INV-0031 · sent · $450.00`. This is W2's stamp, and the brief forbade UI here; noting only so the orchestrator does not read W1 as having delivered M2.

### R2-12 · nit (confidence 0.6) · narrower REVOKE list than the sibling
`create_draft_invoice` revokes from `PUBLIC, anon, authenticated, service_role, dashboard_user, agent_reader, agent_writer, edge_catalog_reader, edge_rls_user`; `create_draft_studio_invoice` omits the last four. No exposure — the resulting ACLs are byte-identical (`{postgres=X/postgres,authenticated=X/postgres}` for both) and the migration's own ACL ASSERT proves it. Belt-and-braces divergence only.
