-- ═══════════════════════════════════════════════════════════════════════════
-- 00204 — The Account Page: milestone triggers + gate settlement
--          (R26 + R23 settlement mechanics, Dissolve Track 1.1/1.4)
--
-- Audit-first findings:
--   · `project_payment_milestones` (00066) is the milestone spine — already
--     carries label/percentage/amount_cents/status/due_date and a free-text
--     trigger_condition. The R26 INLINE TRIGGER CONFIG is two additive
--     columns (trigger_kind / trigger_section_key) + an invoice link.
--   · No invoice auto-draft exists (the package's "existing auto-draft
--     trigger" was the activation seeding of milestone STATUS, not invoice
--     drafting). `draft_invoice_from_milestone` below is the one drafting
--     path; the R23 gate-settlement trigger and the production-start trigger
--     both call it. Drafts land in the Money margin via the shipped
--     margin_items invoice branch — review-then-send (issue_invoice) stands.
--   · R23 settlement: client approval of a section gate advances the
--     project's REAL phase vocabulary (current_phase / status) — the spine,
--     Desk, and old zones all read the same truth. SECURITY DEFINER because
--     the responding party is the CLIENT, whose RLS rightly cannot touch
--     projects or invoices.
--
-- Wired trigger kinds in v1: on_section_settled (gate approval) and
-- on_production_start (first line enters production). on_signing and
-- on_date are config + due-date driven (the activation RPC already seeds
-- the first milestone outstanding at signing) — drafting for those stays
-- with the designer's Generate-invoice act. Flagged in DECISIONS I25.
-- ═══════════════════════════════════════════════════════════════════════════

alter table project_payment_milestones
  add column if not exists trigger_kind text
    check (trigger_kind in ('on_signing','on_production_start','on_section_settled','on_date')),
  add column if not exists trigger_section_key text
    check (trigger_section_key in ('brief','discovery','direction','proposal','project','install','care')),
  add column if not exists invoice_id uuid references invoices(id) on delete set null;

comment on column project_payment_milestones.trigger_kind is
  'R26 inline trigger config: on signing · on production start · when [section] settles · on date. NULL = legacy milestone (trigger_condition free text only).';
comment on column project_payment_milestones.invoice_id is
  'The draft invoice this milestone produced (draft_invoice_from_milestone). NULL until drafted; also the idempotency latch.';

create index if not exists idx_milestones_trigger
  on project_payment_milestones(project_id, trigger_kind)
  where trigger_kind is not null;

-- ── draft_invoice_from_milestone ─────────────────────────────────────────────
-- One drafting path for every trigger kind and for the Account Page's
-- Generate-invoice act. Drafts only (review-then-send per R26/R11); the
-- draft surfaces as a Money margin item immediately (margin_items branch).

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

  return v_inv;
end;
$$;

comment on function draft_invoice_from_milestone(uuid) is
  'R26: drafts ONE invoice from a payment milestone (idempotent via invoice_id). Draft only — the designer reviews and sends through issue_invoice. SECURITY DEFINER: settlement triggers fire from client responses.';

-- Internal: only the settlement triggers (definer context) may call this
-- directly. Designers go through the checked wrapper below.
revoke execute on function draft_invoice_from_milestone(uuid) from public, anon, authenticated;

create or replace function generate_milestone_invoice(p_milestone_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_designer uuid;
begin
  select m.project_id, p.designer_id into v_project, v_designer
  from project_payment_milestones m
  join projects p on p.id = m.project_id
  where m.id = p_milestone_id;
  if v_project is null then
    raise exception 'generate_milestone_invoice: milestone % not found', p_milestone_id;
  end if;
  if v_designer is distinct from auth.uid() and not is_project_team_member(v_project) then
    raise exception 'generate_milestone_invoice: not your project';
  end if;
  return draft_invoice_from_milestone(p_milestone_id);
end;
$$;

comment on function generate_milestone_invoice(uuid) is
  'R26 Generate-invoice act (Account Page): the designer-checked door to draft_invoice_from_milestone.';

grant execute on function generate_milestone_invoice(uuid) to authenticated;

-- ── R23: gate settlement ─────────────────────────────────────────────────────
-- Client approval SETTLES the section in the same transaction:
--   1. the project advances in its existing vocabulary
--        project  → current_phase 'installation'  (Install becomes active)
--        install  → status 'completed'            (Care becomes active)
--   2. milestones triggered by "when [section] settles" draft their invoice.
-- A declined approval changes nothing here — the section holds active and
-- the gate narrates why (the margin body reads the option + client note).

create or replace function settle_section_on_gate_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved boolean;
  v_m record;
begin
  if new.decision_kind <> 'approval'
     or new.section_key is null
     or new.project_id is null
     or new.status <> 'responded'
     or old.status = 'responded' then
    return new;
  end if;

  select exists (
    select 1 from client_decision_options o
    where o.decision_id = new.id and o.selected and o.approves
  ) into v_approved;

  if not v_approved then
    return new;
  end if;

  if new.section_key = 'project' then
    update projects
       set current_phase = 'installation', updated_at = now()
     where id = new.project_id
       and current_phase is distinct from 'installation'
       and current_phase is distinct from 'final_walkthrough'
       and status not in ('completed', 'archived');
  elsif new.section_key = 'install' then
    update projects
       set status = 'completed', updated_at = now()
     where id = new.project_id
       and status not in ('completed', 'archived');
  end if;

  for v_m in
    select id from project_payment_milestones m
    where m.project_id = new.project_id
      and m.trigger_kind = 'on_section_settled'
      and m.trigger_section_key = new.section_key
      and m.invoice_id is null
  loop
    perform draft_invoice_from_milestone(v_m.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists settle_section_on_gate_approval_trg on client_decisions;
create trigger settle_section_on_gate_approval_trg
  after update on client_decisions
  for each row
  execute function settle_section_on_gate_approval();

comment on function settle_section_on_gate_approval() is
  'R23: an approved section gate settles the section (phase/status advance) and drafts on_section_settled milestones — one act, one transaction (§5).';

-- ── on_production_start ──────────────────────────────────────────────────────
-- The first line entering production drafts the matching milestones.

create or replace function draft_milestones_on_production_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
begin
  if new.status <> 'production' or old.status = 'production' then
    return new;
  end if;

  for v_m in
    select id from project_payment_milestones m
    where m.project_id = new.project_id
      and m.trigger_kind = 'on_production_start'
      and m.invoice_id is null
  loop
    perform draft_invoice_from_milestone(v_m.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists draft_milestones_on_production_start_trg on project_ffe_items;
create trigger draft_milestones_on_production_start_trg
  after update of status on project_ffe_items
  for each row
  execute function draft_milestones_on_production_start();
