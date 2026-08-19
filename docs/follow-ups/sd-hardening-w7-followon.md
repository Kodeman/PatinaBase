# SD-hardening (canonical studio authority) — W7 follow-on register

**Status:** scoped, not landed. Ruled 2026-08-18: the whole SD tranche folds into **one**
properly-reviewed follow-on program. Phase 1 (PR #28) and the edge-API auth path (PR #29) land
on their own; this SD work lands *after* Phase 1, as its own reviewed program.

**Carrier branch:** `followon/sd-hardening-v3` (branched from `followon/sd-hardening-v2` tip
`79a0d1b5`, with `origin/main` merged in). Nothing is on `main`. Nothing is applied to staging
or prod.

This register is the authoritative scope. It supersedes the plan's terse "W7 — 00488 canonical
studio authority" line with what the 2026-08-18 adversarial review actually found.

> **⚠ Renumbered 2026-08-19.** The tranche's provisional numbers were consumed on `main` while it
> sat. `00487 → 00511`, `00488 → 00512`, `00489 → 00513`, including every internal identifier
> (`_00487_profile`, `pg_temp._00488_references_routine`, exception strings, contract-test helper
> names). **The narrative below still uses the old numbers where it recounts history** — read
> `00487`/`00488`/`00489` as `00511`/`00512`/`00513` throughout, except where it refers to
> `00489_media_registry_kernel.sql` on `main` (which keeps its number). Line numbers cited into
> `00487` (e.g. `00487:2612`, `00487:2854-2872`) still point at the same lines of
> `00511_public_sd_hardening.sql`. Ledger: `docs/engineering/migration-number-reservations.md`.

---

## What this tranche contains

| Artifact | State | Notes |
|---|---|---|
| `supabase/migrations/00511_public_sd_hardening.sql` (7272 lines) | authored, **contract test NOT green** | was 00487; recovered/renumbered from the old descoped 00488; the "lock narrowing" commit `01d411ea` *is* this whole file (the file did not exist at its parent) |
| `supabase/migrations/00512_public_sd_caller_hardening.sql` | authored, **contract test GREEN end-to-end** (`public_sd_caller_hardening_contract_test.sql`, local exit 0) | was 00488 |
| `supabase/migrations/00513_invoice_numbering_studio_uniqueness.sql` (70 lines) | authored, **proven & load-bearing**, SAFE-to-land | was 00489; independent of 00511; sits above it by number |
| `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | **stops at line 6187** on finding #1 | passes cleanly through 6088 once 00513 is in place |

## Why it folds together instead of landing 00489 now

- **The lock narrowing is inseparable from 00487.** `01d411ea` introduced the entire 7272-line
  00487 as a new file; there is no standalone narrowing edit to peel off. Landing the narrowing
  means landing all of the un-reviewed, W7-scoped 00487 — which also introduces the finding-#1
  trigger behavior. So it cannot land as an isolated "proven change."
- **Extracting 00489 alone forces a renumber collision.** Phase 1 ends at 00486; a standalone
  00489 would renumber to 00487, then collide with this tranche's 00487/00488 when they land later
  — a migration-ordering hazard for a money-path change.
- **00489's bug is not reachable on prod today.** Prod holds 20 invoices in a single studio with
  no multi-studio designers, so the cross-studio numbering collision cannot occur yet. There is no
  urgency that justifies the renumber cost. Keeping 00489 with its SD context (where it was
  surfaced) and giving the whole tranche one review is strictly cleaner.

---

## The three definers of scope

### 1. Finding #1 — a REAL production defect (not a test artifact). MUST be fixed here.

`set_project_studio_id` / `set_invoice_studio_id` are **SECURITY INVOKER** triggers that verify the
*designer's* designer-role by reading `public.user_roles` under the **caller's** RLS. `user_roles`
RLS is `USING (user_id = auth.uid())`, so a co-member cannot see another user's role row and the
trigger RAISEs — even though the trigger's own co-member branch (`00487:2854-2872`) checks only
`v_actor_is_member`, i.e. it *intends* to allow co-member edits, and RLS admits the write
(`is_studio_comember` is SECURITY DEFINER and bypasses RLS).

**Reachability (verified against the live RLS + code):**
- Create / issue / void / pay all route through SECURITY DEFINER RPCs (`create_draft_invoice`,
  `issue_invoice`, `void_invoice`, `record_invoice_payment`) — trigger runs as the definer owner,
  `user_roles` read unaffected. **Safe.**
- **Draft-header edits use a direct authenticated `UPDATE`** (`packages/supabase/src/hooks/
  use-invoices.ts:738`). Lead-editing-own-draft (`designer_id = self`) works; **a co-member editing
  a lead's draft is blocked** by the trigger despite RLS + trigger-intent allowing it. This bites
  multi-member studios today.
- Projects side is effectively a non-issue: co-member direct insert is RLS-blocked anyway
  (`WITH CHECK designer_id = auth.uid()`), and real creation is the `activate_proposal_as_project`
  DEFINER RPC.

**Resolution — option (a), recommended:** derive the designer's designer-role via a **SECURITY
DEFINER authority helper** (RLS-independent, mirroring `is_studio_comember`) inside both triggers.
This fixes the real co-member direct-write defect *and* unblocks the positive-authority probes.
Option (b) — routing test fixtures through the DEFINER RPCs — only papers over the test and does
**not** match production, because the portal's draft-header edit path is a direct authenticated
UPDATE; the co-member draft-edit positive probe genuinely requires a supported direct-write path.

⚠ Option (a) modifies **money-path security logic** and needs its own separate-context adversarial
review before it lands. It must NOT be rushed.

### 2. The 00487 contract test back-half — unblock after finding #1 is fixed.

`public_sd_hardening_contract_test.sql` stops at **line 6187** — a co-member immutable-edit positive
authority probe that finding #1 breaks and that CANNOT be seeded as postgres without masking the
assertion (a weakened assertion = stop). ~10 more back-half fixture writes are the same finding-#1
family (6327, 6375, 6400, 6458, 6735, 6747…). They come green once the triggers derive authority
RLS-independently (option a). Do **not** grind them with more postgres-seeding — that masks the
verification.

⚠ **Fixture bug in `03989a58`:** the postgres-seeded fixture at ~6187 seeds the invoice with
`studio_id = NULL`, and the immutable-update parent check `project.studio_id = NEW.studio_id`
(`00487:2612`) can never match NULL → RAISE. Even routed through postgres the fixture is
mis-seeded; it needs a real `studio_id`, not just a role switch. Fix the fixture when reworking the
back-half.

### 3. Full adversarial review of 00487-the-migration.

00487 applied cleanly and passed its own SHA256 body-hash and ACL self-checks on a local replay,
so it is *sound-and-landable as a migration* — but it is the **un-reviewed** canonical-studio-
authority program. It has never had the full-migration adversarial pass the plan reserved for W7.
That review is a gate before landing, independent of the test back-half.

---

## Carry-in findings from the 2026-08-18 review (all recorded, none blocking the *scope*)

- **Lock narrowing — SAFE as a change.** `public.roles` is a 14-row immutable global catalog with
  no tenant column (only ever seeded, never UPDATE/DELETE anywhere), so its `FOR SHARE` guarded
  nothing; the retained `FOR SHARE OF user_role` covers the real mutable single-row TOCTOU. No
  lock-order inversion between `set_invoice_studio_id` and `set_project_studio_id` (both:
  root → user_role → membership → studio). Asserted at apply time by the migration's body-hash pin.
  - **Finding 1.1 (low sev):** the commit message's causal story is inaccurate —
    `reassign_project_lead` does **not** lock/delete `user_roles` (it takes `FOR UPDATE` on
    `projects` + `designer_clients`); the 00487 concurrency probe actually guards a concurrent
    `UPDATE organization_members SET status='suspended'` via `set_project_studio_id`, which was
    **not** narrowed. Safety conclusion holds; the rationale mislabels the mechanism. Correct the
    commit narrative when this lands.
  - **Finding 1.2 (low sev):** the fix is asymmetric — `set_project_studio_id` and the other
    commercial-authority functions still `FOR SHARE` the roles catalog, so the "multixact hotspot"
    is only removed from the invoice path. Harmless (shared/shared on immutable rows), inconsistent.

- **00489 — SAFE-to-land, one gating precondition.** No `ON CONFLICT` / index-name dependency on
  the dropped `uniq_invoices_designer_number` (referenced only in 00178 creation + 00489); the two
  partial predicates cover every `invoice_number IS NOT NULL` row with no gap; a `studio_id`
  NULL→NOT-NULL duplicate is doubly prevented (the new index would reject it, and
  `set_invoice_studio_id` makes `studio_id` immutable on UPDATE); CREATE-before-DROP is atomic and
  idempotent.
  - **Finding 2.1 (gating, high sev IF false):** the migration asserts prod holds "20 numbered
    invoices, all studio-bound, contiguous, no dups, zero studio-less." **Unverifiable without prod
    access — confirm before any prod apply** with:
    ```sql
    SELECT studio_id, invoice_number, count(*) FROM public.invoices
      WHERE invoice_number IS NOT NULL AND studio_id IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;
    SELECT designer_id, invoice_number, count(*) FROM public.invoices
      WHERE invoice_number IS NOT NULL AND studio_id IS NULL GROUP BY 1,2 HAVING count(*)>1;
    ```
    Any duplicate aborts the `CREATE UNIQUE INDEX` (fail-safe, no data loss) and blocks the deploy.
  - **Finding 2.2 (low sev):** not `CREATE INDEX CONCURRENTLY` → a brief write lock on `invoices`
    during build; trivial at ~20 rows, but note it for a larger table.

---

## Landing checklist (when this program is picked up, after Phase 1 is on main)

1. [x] Fix finding #1 via option (a): a SECURITY DEFINER authority helper in
       `set_project_studio_id` + `set_invoice_studio_id`. Landed as
       `public.has_designer_domain_role(uuid)` inside 00511. **The separate-context adversarial
       review of this money-path change is still owed** — it is part of item 3's dispatch.
2. [x] Fix the `03989a58` fixture and rework the 00511 test back-half to green **without** masking
       the positive-authority assertions. Both contract tests now exit 0.
3. [ ] Full adversarial review of 00511-the-migration (never had one). **Now also has to rule on
       the nine suite regressions in "Suite impact" below, including the likely second production
       defect.**
4. [ ] Correct the `01d411ea` commit narrative (finding 1.1); optionally symmetrize the lock fix
       (finding 1.2).
5. [x] Renumber/reconcile the tranche against main's head. 00487/00488/00489 → **00511/00512/00513**;
       ledger updated in `docs/engineering/migration-number-reservations.md`.
6. [x] Prod dup-check (finding 2.1) — **CLEAR**, see below.
7. [~] Verify: `supabase db reset` exits 0 ✔; both contract tests green under
       `psql -X -v ON_ERROR_STOP=1` ✔; full `scripts/run-sql-tests.sh` **not** clean — 11
       unexpected failures remain (see "Suite impact"). 00513 discrimination not re-checked.

## Prod precondition for 00513 (finding 2.1) — CLEAR

Read-only against Strata (`bkvcixdmuyejfzcijpdg`), 2026-08-19. The migration header's claim is
exact:

| Check | Result |
|---|---|
| duplicate `(studio_id, invoice_number)` where both non-null | **0** |
| duplicate `(designer_id, invoice_number)` where `studio_id IS NULL` | **0** |
| numbered invoices | 20 |
| numbered invoices with no studio | 0 |
| distinct studios holding numbers | 1 |
| `uniq_invoices_designer_number` (to be dropped) | present |
| `uniq_invoices_studio_number` / `..._studioless` | absent (not yet applied) |

Both new partial unique indexes will build cleanly. Re-run immediately before any prod apply —
the count can only grow.

## Suite impact — the tranche regresses 11 SQL-suite files

Measured 2026-08-19 on one box, same runner. Baseline on the merged main (`33d95754`): 89 green,
22 expected-fail, **0 unexpected**. With the tranche: **23 unexpected**, reduced to **11** after
repairing genuinely stale fixtures (102/113 effective-green).

The 12 repaired files were stale, not broken: 00511 makes the design studio the canonical
authority for every project, and prod already matches that invariant (23 projects / 27 invoices,
**zero** studio-less among either, verified read-only 2026-08-19). Those fixtures predated it.
Nothing was relaxed or re-seeded as postgres to get them green.

The remaining 11 are behavior changes the tranche makes to code `main` already ships, and each
needs a ruling rather than a test edit:

- 🔴 **`billing/invoice_checkout_integrity` — likely a SECOND production defect.** 00512's
  `sync_invoice_line_milestone_latch` refuses any *authenticated* detach of a milestone-latched
  invoice line (`invoice milestone latch: direct detach is not allowed`, 42501) and no RPC
  replaces it. `useDeleteLineItem` (`packages/supabase/src/hooks/use-invoices.ts`) removes lines
  with a direct authenticated DELETE, so after this tranche a designer cannot delete a
  milestone-backed line from a draft invoice. Same family as finding #1: a DEFINER-era assumption
  applied to the one path the portal drives directly. Ad-hoc lines are unaffected
  (`milestone_id IS NULL` → no detach).
- ⚠ **`edge_api/public_rpc_authorization_contract`** — main's own 00484 contract test asserts
  `the trusted project trigger lost its internal primary-studio lookup`, a property of
  `set_project_studio_id` that 00511's rewrite removes. Two shipped contracts disagree; which one
  yields is a reviewer's call.
- `mood_boards/maintenance_quota` (`quota RPC caller grants are incorrect`) and
  `workflow/approval_authority/00465` (`permission denied for function notify_decision_required`)
  — 00512 narrows EXECUTE; the tests assert the pre-narrowing grant set.
- `document/decision_journey_atomicity`, `document/client_scope_change_request`,
  `commercial/design_services_paper_issue` — 00512 replaces bodies/authority these assert on.
- `procurement/ffe_coverage`, `procurement/dual_pricing`,
  `mood_boards/lineage_and_client_bundle`, `document/proposal_phase_authority_atomicity` — still
  `studio_id_not_designer_studio`, but reached through RPCs rather than a direct fixture insert,
  so each needs its own reading before being called stale.

## Carried-in repairs the merge itself forced

- **00512 was silently reverting 00510.** It replaces `apply_scope_change` from a body captured
  before 00510 existed, dropping 00510 S3's explicit `project_ffe_items.assignment_scope`. Caught
  by 00512's own source-hash preflight once it sequenced above 00510. Rebased, both pins moved,
  and a postcondition now asserts the installed body still names `assignment_scope`.
- **Five routines' source ACLs are unreachable on a fresh local replay.** They hold their
  non-postgres EXECUTE grants only from creation-time `ALTER DEFAULT PRIVILEGES`; prod has them
  (verified), a fresh `supabase db reset` does not, because `seed/00-legacy-grants.sql` runs after
  the migration phase. Recorded as an explicit alternative source state (`original_roles_local`)
  on 00512's three profile tables rather than by weakening the shared assertion.

## Related

- Program state: `project_codex_staging_and_cloudflare_phase1_2026_08_16` (memory)
- Edge-API worker review: `project_edge_api_worker_review_2026_08_17` (memory)
- Phase 1 PR #28 (`phase1-close/staging-ready`); auth-path PR #29 (`feat/edge-api-auth-path`)
