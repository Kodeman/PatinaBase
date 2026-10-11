-- US-25 (SQ-750) walk fixture, v2. LOCAL ONLY. Idempotent and re-runnable.
--
-- Supersedes seed_uplift_walk.sql (US-24 / SQ-721, kept as evidence). Apply v1 first only on a
-- database that has never seen it; v2 inserts everything v1 did (same e7210000-... ids, ON CONFLICT
-- DO NOTHING) and then repairs what SQ-739 diagnosed:
--   * Pell Court's v1 invoice was inserted already `paid`, so guard_invoice_payment_overpayment
--     (00397) turned its succeeded payment into requires_refund and apply_invoice_payment_effects
--     demoted the invoice to `sent` ("$9,200 OUT" + RECORD THE PAYMENT). v2 inserts the deposit
--     invoice as `sent` with nothing paid, then the succeeded payment; the trigger flips it to paid.
--   * Pell Court's v1 project could not carry projects.proposal_id (guard_project_completion_authority
--     lets only activate_proposal_as_project set it). v2 creates Pell Court through
--     activate_proposal_as_project as Leah, so proposal_id is set. The v1 Pell Court project
--     (e7210000-...-0004) is archived and its broken invoice voided, so only one Pell Court is live.
-- Unlike v1, v2 UPDATES its own fixture rows on every run to re-anchor relative times to now():
--   * Linden Place declined yesterday: "The sofa is over budget".
--   * Ines Calder's inquiry two hours ago.
--   * Holloway PO-HD-0412 unanswered 12 days; INV-2026-0721 12 days past due.
--   * Jordan (the hire) handed Marsh Street Kitchen by Leah two days ago, with a note.
--   * Pell Court's deposit landed three hours ago, with one draft PO waiting to be released.
--   * Jordan also holds one signed, unacted pre-project proposal (Wren Row Bath) for the
--     false all-clear test.
-- It also clears studio_need_states for Leah and Jordan on the fixture's records, so every run starts
-- the walk with no line deferred, acted or read. It touches no row outside the e7210000-/e7500000-
-- fixture ids except those need-state rows.
--
-- Applied with:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk.sql      # once, if never applied
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk_v2.sql
-- Never against Strata. Never via supabase db reset. Needs migration 00765 (studio_need_states).

\i artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk.sql

do $$
declare
  uid_leah   uuid := 'a0000000-0000-0000-0000-000000000004';
  uid_client uuid := 'a0000000-0000-0000-0000-000000000005';
  uid_hire   uuid := 'e7210000-0000-4000-8000-000000000100';
  studio     uuid := 'b0000000-0000-0000-0000-000000000001';
  vendor     uuid := '11111111-1111-1111-1111-111111111104';
  marsh      uuid := 'e7210000-0000-4000-8000-000000000001';
  linden     uuid := 'e7210000-0000-4000-8000-000000000002';
  holloway   uuid := 'e7210000-0000-4000-8000-000000000003';
  pell_v1    uuid := 'e7210000-0000-4000-8000-000000000004';
  pell_prop  uuid := 'e7500000-0000-4000-8000-000000000021';
  wren_prop  uuid := 'e7500000-0000-4000-8000-000000000023';
  pell       uuid;
  ts         timestamptz := now();
begin
  -- ── Retire the v1 Pell Court (no proposal_id; invoice stuck at sent) ─────────
  -- Archived through its own RPC (guard_project_terminal_identity_integrity), as Leah.
  if exists (select 1 from projects where id = pell_v1 and status <> 'archived') then
    update projects set name = 'Pell Court Dining (US-24 seed, superseded)' where id = pell_v1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_leah::text, 'role', 'authenticated')::text, true);
    perform public.archive_project(pell_v1, 'active');
    perform set_config('request.jwt.claims', '', true);
  end if;
  update invoices set status = 'void'
   where id = 'e7210000-0000-4000-8000-000000000042' and status <> 'void';

  -- ── Pell Court through the activation path ──────────────────────────────────
  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, accepted_at, created_at, updated_at)
  values (pell_prop, null, uid_leah, uid_client, 'Pell Court Dining', 'accepted', 'client_signed',
          1840000, 50, ts - interval '6 days', ts - interval '5 days', ts - interval '20 hours',
          ts - interval '8 days', ts - interval '20 hours')
  on conflict (id) do nothing;

  select id into pell from projects where proposal_id = pell_prop;
  if pell is null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_leah::text, 'role', 'authenticated')::text, true);
    pell := public.activate_proposal_as_project(pell_prop, (ts - interval '20 hours')::date);
    perform set_config('request.jwt.claims', '', true);
  end if;
  update projects set name = 'Pell Court Dining', site_address = '9 Pell Court', studio_id = studio
   where id = pell and (name is distinct from 'Pell Court Dining' or studio_id is distinct from studio);

  -- Deposit: inserted `sent` with nothing paid, then the succeeded payment (the trigger marks it paid).
  insert into invoices (id, project_id, designer_id, client_id, studio_id, invoice_number, title, status,
                        issue_date, due_date, payment_terms_days, currency, subtotal_cents, tax_rate, tax_cents,
                        total_cents, amount_paid_cents, sent_at, created_at, updated_at, paid_at)
  values ('e7500000-0000-4000-8000-000000000042', pell, uid_leah, uid_client, studio,
          'INV-2026-0723', 'Pell Court Dining — furnishings deposit', 'sent',
          (ts - interval '20 hours')::date, (ts + interval '7 days')::date, 7, 'usd', 920000, 0, 0,
          920000, 0, ts - interval '20 hours', ts - interval '20 hours', ts - interval '20 hours', null)
  on conflict (id) do nothing;

  insert into invoice_payments (id, invoice_id, amount_cents, method, status, reference, note, recorded_by,
                                received_at, created_at, updated_at)
  values ('e7500000-0000-4000-8000-000000000043', 'e7500000-0000-4000-8000-000000000042', 920000,
          'ach_manual', 'succeeded', 'ACH 20261011', 'Deposit for the Pell Court dining order', uid_leah,
          ts - interval '3 hours', ts - interval '3 hours', ts - interval '3 hours')
  on conflict (id) do nothing;
  update invoices set paid_at = ts - interval '3 hours'
   where id = 'e7500000-0000-4000-8000-000000000042' and status = 'paid';

  -- One order drafted and waiting for the deposit: the deposit line's act is Release the order.
  insert into purchase_orders (id, designer_id, project_id, vendor_id, po_number, total_cents, status,
                               sent_at, acknowledged_at, ack_state, created_by, sidemark, created_at, updated_at,
                               payment_pattern)
  values ('e7500000-0000-4000-8000-000000000031', uid_leah, pell, vendor, 'PO-PC-0419', 1380000, 'draft',
          null, null, 'none', uid_leah, 'PELL / DINING', ts - interval '18 hours', ts - interval '18 hours',
          'fifty_fifty')
  on conflict (id) do nothing;

  -- ── Linden Place: declined yesterday, in the client's words ─────────────────
  -- Decline state only changes through decline_proposal, so v2 adds a revised version of v1's
  -- proposal (parent_proposal_id makes v1's decline answered) declined yesterday with the new reason.
  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, declined_at, decline_reason,
                         parent_proposal_id, created_at, updated_at)
  values ('e7500000-0000-4000-8000-000000000022', linden, uid_leah, uid_client,
          'Linden Place Living Room', 'declined', 'declined',
          2480000, 50, ts - interval '3 days', ts - interval '2 days', ts - interval '1 day',
          'The sofa is over budget', 'e7210000-0000-4000-8000-000000000022',
          ts - interval '4 days', ts - interval '1 day')
  on conflict (id) do nothing;

  -- ── Holloway: PO-HD-0412 unanswered 12 days; INV-2026-0721 12 days past due ─
  update purchase_orders set sent_at = ts - interval '12 days', created_at = ts - interval '13 days'
   where id = 'e7210000-0000-4000-8000-000000000031';
  update invoices set issue_date = (ts - interval '42 days')::date, due_date = (ts - interval '12 days')::date
   where id = 'e7210000-0000-4000-8000-000000000041';

  -- ── Ines Calder wrote two hours ago ─────────────────────────────────────────
  update leads set created_at = ts - interval '2 hours', updated_at = ts - interval '2 hours',
                   response_deadline = ts + interval '3 days', status = 'new'
   where id = 'e7210000-0000-4000-8000-000000000051';

  -- ── Marsh Street handed to Jordan by Leah two days ago, with a note ─────────
  -- useProjectLeads dates the hand-off by updated_at when it is newer than assigned_at, so the
  -- updated_at trigger is skipped for this one re-anchor (session_replication_role, local only).
  set local session_replication_role = replica;
  update project_team_members set assigned_at = ts - interval '2 days', updated_at = ts - interval '2 days'
   where id in ('e7210000-0000-4000-8000-000000000111', 'e7210000-0000-4000-8000-000000000112');
  set local session_replication_role = origin;
  update organization_members
     set handoff_note = 'Marsh Street is yours from today. The cabinet order is the next thing; ask me before anything goes to the client.'
   where id = 'e7210000-0000-4000-8000-000000000101';
  -- Inserting the hire's auth user (v1) also auto-created a solo studio "Jordan Reyes" with Jordan as
  -- owner, and the portal resolved that as Jordan's studio: an empty project list, no leads, no note
  -- (seen in SQ-750's first pass). The walk's hire belongs to Leah's studio only, so the empty solo
  -- studio is deleted. guard_org_membership_changes protects a last owner except for service_role.
  perform set_config('role', 'service_role', true);
  delete from organizations o
   where o.id in (select organization_id from organization_members
                   where user_id = uid_hire and organization_id <> studio and role = 'owner')
     and not exists (select 1 from projects p where p.studio_id = o.id);
  perform set_config('role', 'postgres', true);

  -- ── False all-clear: one signed proposal on Jordan's seat, unacted ──────────
  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, accepted_at, created_at, updated_at)
  values (wren_prop, null, uid_hire, uid_client, 'Wren Row Bath — design services', 'accepted', 'client_signed',
          480000, 30, ts - interval '3 days', ts - interval '2 days', ts - interval '5 hours',
          ts - interval '4 days', ts - interval '5 hours')
  on conflict (id) do nothing;

  -- ── Walk state: nothing deferred, acted or read on the fixture ──────────────
  delete from studio_need_states
   where user_id in (uid_leah, uid_hire)
     and project_id in (marsh, linden, holloway, pell_v1, pell);
  delete from studio_need_states
   where user_id in (uid_leah, uid_hire)
     and (need_key like '%e7210000-%' or need_key like '%e7500000-%');
end $$;

-- Postconditions (SQ-739 regression): the deposit is paid and its payment succeeded; Pell Court carries
-- its proposal.
do $$
begin
  if not exists (select 1 from invoices where id = 'e7500000-0000-4000-8000-000000000042'
                   and status = 'paid' and amount_paid_cents = 920000) then
    raise exception 'seed v2: Pell Court deposit is not paid';
  end if;
  if not exists (select 1 from invoice_payments where id = 'e7500000-0000-4000-8000-000000000043'
                   and status = 'succeeded') then
    raise exception 'seed v2: Pell Court payment is not succeeded';
  end if;
  if not exists (select 1 from projects where proposal_id = 'e7500000-0000-4000-8000-000000000021'
                   and status = 'active') then
    raise exception 'seed v2: Pell Court has no proposal_id';
  end if;
end $$;
