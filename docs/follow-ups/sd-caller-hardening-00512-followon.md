# 00512 caller-hardening — PARKED for redesign

**Status:** split out of the SD-hardening landing set and parked. Ruled 2026-08-19 (Kody): land
`00511` + `00513`; **do not land `00512`** as written — it must be redesigned first.

**Where the file lives:** branch `followon/sd-caller-hardening-00512` (parked). It is **removed** from
the landing branch `followon/sd-hardening-v3`. Its number `00512` stays reserved-parked; `00513`
keeps its number (the 00512 gap in the applied sequence is intentional and fine).

Artifacts parked here:
- `supabase/migrations/00512_public_sd_caller_hardening.sql` (6102 lines)
- `supabase/tests/edge_api/public_sd_caller_hardening_contract_test.sql`

---

## Why it was pulled

`00512` rewrites `public.sync_invoice_line_milestone_latch()` (the BEFORE INSERT/UPDATE/DELETE
trigger on `invoice_line_items`) and adds, to the **detach** branch:

```sql
IF v_detach THEN
  IF current_user = 'authenticated' THEN
    RAISE EXCEPTION 'invoice milestone latch: direct detach is not allowed'
      USING ERRCODE = '42501';
  END IF;
  ...
```

A *detach* is any DELETE of a line that carries a `milestone_id`, or any UPDATE that changes its
`milestone_id` / `invoice_id`. Blocking `current_user = 'authenticated'` breaks every direct
authenticated portal write that removes or re-points a milestone-backed draft line:

| Portal hook (`packages/supabase/src/hooks/use-invoices.ts`) | Direct write | Blocked by 00512 |
|---|---|---|
| `useDeleteLineItem` | `DELETE FROM invoice_line_items WHERE id = … AND invoice_id = …` | a milestone line cannot be removed |
| `useDeleteDraftInvoice` | `DELETE FROM invoices WHERE id = … AND status = 'draft'` | the `ON DELETE CASCADE` fires the latch DELETE branch per child → the **whole draft invoice** becomes undeletable if it holds any milestone line |
| `useUpsertLineItems` | `UPDATE invoice_line_items SET milestone_id = …, invoice_id = …` | re-pointing a milestone line is refused |

### This is a real regression against live prod behavior, not a test artifact

Prod runs `00397_billing_checkout_integrity.sql`'s latch (verified read-only on Strata
`bkvcixdmuyejfzcijpdg`, 2026-08-19 — the live body does **not** contain the `direct detach is not
allowed` string). 00397's detach branch **allows** an authenticated detach from a `draft` (or
`void`) invoice and auto-unlatches the milestone:

```sql
IF FOUND
   AND v_previous_invoice.status NOT IN ('draft','void')   -- only NON-draft is refused
   AND EXISTS ( … milestone still latched … ) THEN
  RAISE EXCEPTION 'invoice milestone latch: cannot detach milestone % from % invoice %' …;
END IF;
UPDATE project_payment_milestones
SET invoice_id = NULL, status = 'pending', due_date = NULL, paid_at = NULL, …
WHERE id = OLD.milestone_id AND invoice_id = OLD.invoice_id;
```

So **today** a designer can delete a milestone line from a draft, or delete the draft outright, and
the milestone returns to `pending` for re-drafting. 00512 removes that capability for the
authenticated portal path with no replacement — same family as finding #1 (a DEFINER-era
assumption applied to the one path the portal drives directly).

### Reachable now

Prod holds **7 draft invoices, 4 of them carrying milestone lines** (read-only, 2026-08-19). All
four are undeletable-as-drafts under 00512 the moment it lands. This is why it is pulled rather
than shipped-then-patched.

## Why landing 00511 + 00513 without 00512 is safe

- `00511` touches **neither** `sync_invoice_line_milestone_latch` **nor** `apply_scope_change`
  **nor** `engage_trade_scope` (grep-verified). `00513` touches none of them either. So the landing
  set leaves prod's 00397 latch exactly as it is.
- `00511`'s `create_draft_invoice` is a SECURITY DEFINER RPC; its milestone-line inserts run as the
  definer owner (`postgres`), which the 00397 latch's *attach* branch validates and latches the
  same as before. The create/issue/void/pay lifecycle is unaffected — 00512's only lifecycle change
  was on the **detach** branch, which the create path never hits.
- Therefore 00511 is correct and complete standalone; 00512 was an independent hardening layer, not
  a dependency of 00511.

⚠ **00512 also carried the 00510 carry-forward repair.** During the S1 merge, 00512 was found to be
silently reverting 00510 S3 (it replaced `apply_scope_change` from a pre-00510 body, dropping the
explicit `assignment_scope`); that was fixed *inside 00512* with a rebased body + a postcondition.
Because 00512 is now removed from the landing set and **nothing in 00511/00513 references
`apply_scope_change`**, prod's live 00510 `assignment_scope` behavior is undisturbed by the landing
set — there is no migration in it that rewrites that function. The carry-forward repair rides along
on this parked branch and only matters again if/when 00512 is redesigned and relanded on top of a
head that already has 00510.

## Redesign required before 00512 (or its successor) can land

1. **Restore authenticated draft-detach + auto-unlatch, under studio authority.** The latch must
   again let an authorized studio member detach a milestone line from a *draft/void* invoice and
   return the milestone to `pending` — deriving that authority RLS-independently (the
   `has_designer_domain_role` / `is_design_studio_comember` pattern), not by reading the caller's
   own RLS-filtered rows. Keep 00397's refusal for **non-draft** invoices.
2. **Provide a supported delete path for the portal's direct DELETE**, or change the portal to call
   a DEFINER RPC. The portal deletes lines and whole draft invoices with direct authenticated
   DELETEs today; the redesign must either keep those working or ship the RPC and migrate the three
   hooks (`useDeleteLineItem`, `useDeleteDraftInvoice`, `useUpsertLineItems`) to it in the same
   change.
3. **Preserve 00512's genuine hardening** (the caller-backed no-literal SECURITY DEFINER narrowing,
   the ACL tightening, the lock-order profile) — the pull is about the latch-detach regression, not
   the rest of the migration.
4. **Re-apply the 00510 carry-forward** (`apply_scope_change` `assignment_scope` + its
   postcondition) against whatever head it relands on.
5. **Its own separate-context, money-path adversarial review** before it lands — it modifies
   billing-path security logic, and must not be rushed.

## Verification when 00512 is picked back up

- `supabase db reset` exits 0 with 00512 back in the set (renumber it to the then-current head).
- `public_sd_caller_hardening_contract_test.sql` exits 0.
- A focused probe: an authorized studio member deletes a milestone-backed line from a *draft*
  invoice → succeeds, milestone returns to `pending`; deletes the whole draft → succeeds; the same
  detach from a *sent/issued* invoice → still refused.
- The three portal hooks' paths (or their RPC replacements) work end to end.

## Related

- Landing-set register: `docs/follow-ups/sd-hardening-w7-followon.md`
- Number ledger: `docs/engineering/migration-number-reservations.md` (00512 = reserved-parked)
- Prod latch source of truth: `supabase/migrations/00397_billing_checkout_integrity.sql`
