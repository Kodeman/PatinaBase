-- ═══════════════════════════════════════════════════════════════════════════
-- 00280 — In-app notification when a milestone drafts its invoice
--
-- draft_invoice_from_milestone (00204) is the ONE drafting path behind every
-- trigger kind and the manual Generate-invoice act:
--   · activate_proposal_as_project deposit auto-draft (on_signing, 00274/00279)
--   · settle_section_on_gate_approval (on_section_settled, 00204)
--   · draft_milestones_on_production_start (on_production_start, 00204)
--   · the on_date pg_cron sweep (00206)
--   · generate_milestone_invoice (the designer's manual door, 00204)
-- Verified before writing: grep confirms 00204 is the ONLY definer of
-- draft_invoice_from_milestone (00206 and 00274 merely CALL it) — so the body
-- below is 00204's VERBATIM, and this is the latest redefinition.
--
-- DELTA over the 00204 body: after the invoice INSERT + milestone latch UPDATE
-- succeed, post ONE in-app notification_log row for the project's designer so
-- the draft surfaces in their inbox ("Draft invoice ready — <milestone>"). It
-- is placed AFTER the invoice_id latch UPDATE, and the function returns early
-- when v_m.invoice_id is already set, so exactly one notification is ever
-- produced per milestone (a webhook replay / re-draft returns the existing
-- invoice before reaching this line — no duplicate inbox rows).
--
-- Best-effort guard: the notification is wrapped in its own BEGIN/EXCEPTION so
-- a notification failure can NEVER fail (or roll back) invoice drafting — the
-- invoice is the money-bearing act; the inbox row is a courtesy. Mirrors the
-- best-effort pattern of notify_item_feedback (00267) and the stripe-webhook
-- in_app inserts. The in_app row shape (channel='in_app', status='delivered',
-- metadata.subject/message/deep_link) matches those existing writers so the
-- designer's Post/inbox renders it with no reader change.
--
-- CREATE OR REPLACE preserves the 00204 ACLs; the REVOKE is restated (as 00277
-- restates its grants) so a fresh direct-apply — where the function may be
-- created new — keeps the "internal, definer-context callers only" posture.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function draft_invoice_from_milestone(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m    project_payment_milestones%rowtype;
  v_p    projects%rowtype;
  v_inv  uuid;
begin
  select * into v_m from project_payment_milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'draft_invoice_from_milestone: milestone % not found', p_milestone_id;
  end if;

  -- Idempotent: a milestone drafts at most one invoice.
  if v_m.invoice_id is not null then
    return v_m.invoice_id;
  end if;

  select * into v_p from projects where id = v_m.project_id;

  insert into invoices (project_id, designer_id, client_id, status,
                        subtotal_cents, tax_cents, total_cents, memo)
  values (v_m.project_id, v_p.designer_id, v_p.client_id, 'draft',
          v_m.amount_cents, 0, v_m.amount_cents,
          v_m.label || ' — payment milestone')
  returning id into v_inv;

  update project_payment_milestones
     set invoice_id = v_inv,
         status     = case when status = 'pending' then 'outstanding' else status end,
         updated_at = now()
   where id = p_milestone_id;

  -- 00280: surface the fresh draft in the designer's in-app inbox. Best-effort
  -- only — a notification failure must never fail drafting; the invoice is the
  -- money act, the inbox row is a courtesy. Runs once per milestone (the
  -- invoice_id latch above returns early on any re-draft, so no dupes).
  begin
    insert into notification_log (user_id, type, channel, status, template_id, metadata)
    values (
      v_p.designer_id,
      'invoice_draft_created',
      'in_app',
      'delivered',
      'invoice-draft-created',
      jsonb_build_object(
        'invoice_id',   v_inv,
        'milestone_id', p_milestone_id,
        'project_id',   v_m.project_id,
        'amount_cents', v_m.amount_cents,
        'subject',      'Draft invoice ready — ' || v_m.label,
        'title',        'Draft invoice ready — ' || v_m.label,
        'message',      coalesce(v_p.name, 'Your project') || ': a draft invoice for '
                          || v_m.label || ' is ready to review and send.',
        'deep_link',    '/portal/billing/invoices/' || v_inv::text,
        'url',          '/portal/billing/invoices/' || v_inv::text
      )
    );
  exception when others then
    raise warning 'draft_invoice_from_milestone: notification insert failed for milestone % (invoice %): %',
      p_milestone_id, v_inv, sqlerrm;
  end;

  return v_inv;
end;
$$;

comment on function draft_invoice_from_milestone(uuid) is
  'R26: drafts ONE invoice from a payment milestone (idempotent via invoice_id). Draft only — the designer reviews and sends through issue_invoice. SECURITY DEFINER: settlement triggers fire from client responses. 00280: also posts a best-effort in_app notification_log row (type=invoice_draft_created) to the project designer once per milestone; a notification failure never fails drafting.';

-- Internal: only the settlement triggers (definer context) may call this
-- directly. Designers go through the checked wrapper (generate_milestone_invoice).
revoke execute on function draft_invoice_from_milestone(uuid) from public, anon, authenticated;
