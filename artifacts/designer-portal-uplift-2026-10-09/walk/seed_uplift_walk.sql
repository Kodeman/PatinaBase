-- US-24 (SQ-721) walk fixture. ADDITIVE and idempotent. LOCAL ONLY.
--
-- Reuses the existing local studio "Local Dev Studio" (organizations b0000000-...-0001) whose owner
-- is Leah Hartwell (designer@patina.dev, a0000000-...-0004, from supabase/seed/dev-accounts.sql).
-- That studio already carries ~16 jobs across phases from earlier seeds and walks (Halloran House,
-- Cedar Lane Study, Okonkwo residence, Aspen Loft Refresh, Chen Residence, Lindqvist kitchen, ...),
-- including fresh leads, sent invoices and landed payments. This file adds only what S1-S8 still
-- lacked:
--   * a first hire (hire@patina.dev, "Jordan Reyes", password123) as a studio member with a
--     handoff note from Leah, and one job handed to them (S5);
--   * a client approval on a real job, received yesterday (S2);
--   * a client decline with a reason (S2);
--   * a PO sent 9 days ago with no vendor acknowledgment (S3);
--   * an invoice 12 days past due and unpaid, and a deposit that landed this morning (S4);
--   * a fresh inquiry from today (S7).
-- Every row uses the e7210000-... id prefix and ON CONFLICT DO NOTHING; no existing row is updated.
-- Times are relative to now() at apply time.
--
-- Applied with:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk.sql
-- Never against Strata. Never via supabase db reset.

do $$
declare
  uid_leah   uuid := 'a0000000-0000-0000-0000-000000000004';
  uid_client uuid := 'a0000000-0000-0000-0000-000000000005';
  uid_hire   uuid := 'e7210000-0000-4000-8000-000000000100';
  studio     uuid := 'b0000000-0000-0000-0000-000000000001';
  vendor     uuid := '11111111-1111-1111-1111-111111111104'; -- Verellen (existing seed vendor)
  pw_hash    text := extensions.crypt('password123', extensions.gen_salt('bf'));
  ts         timestamptz := now();
begin
  -- ── The first hire ─────────────────────────────────────────────────────────
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid_hire, 'authenticated', 'authenticated',
    'hire@patina.dev', pw_hash, ts,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jordan Reyes"}'::jsonb,
    ts, ts, '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid_hire, uid_hire::text,
          jsonb_build_object('sub', uid_hire::text, 'email', 'hire@patina.dev'), 'email', ts, ts, ts)
  on conflict on constraint identities_provider_id_provider_unique do nothing;

  -- handle_new_user pre-creates a bare profile; fill name/role only when still blank.
  insert into public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
  values (uid_hire, 'hire@patina.dev', 'Jordan Reyes', 'Jordan Reyes', 'designer', ts, ts)
  on conflict (id) do nothing;
  update public.profiles set full_name = 'Jordan Reyes', display_name = 'Jordan Reyes', role = 'designer'
   where id = uid_hire and coalesce(full_name, '') = '';

  insert into public.user_roles (user_id, role_id)
  select uid_hire, id from public.roles where name in ('studio_designer', 'app_user')
  on conflict (user_id, role_id) do nothing;

  insert into organization_members (id, user_id, organization_id, role, invited_by, status, joined_at, job_title, handoff_note)
  values ('e7210000-0000-4000-8000-000000000101', uid_hire, studio, 'member', uid_leah, 'active',
          ts - interval '9 days', 'Junior designer',
          'Marsh Street is yours from today. The cabinet order is the next thing; ask me before anything goes to the client.')
  on conflict (user_id, organization_id) do nothing;

  -- ── Jobs ───────────────────────────────────────────────────────────────────
  -- projects.lead_designer_id is generated from designer_id, and a later lead change must go through
  -- reassign_project_lead (00399). The fixture inserts Marsh Street already led by the hire
  -- (created by Leah, previous_lead row below) instead of calling the RPC as an authenticated user.
  insert into projects (id, name, status, created_by, designer_id, studio_id, client_id, current_phase, site_address, created_at)
  values
    ('e7210000-0000-4000-8000-000000000001', 'Marsh Street Kitchen',     'active', uid_leah, uid_hire, studio, uid_client, 'procurement', '14 Marsh Street',   ts - interval '60 days'),
    ('e7210000-0000-4000-8000-000000000002', 'Linden Place Living Room', 'active', uid_leah, uid_leah, studio, uid_client, 'proposal',    '3 Linden Place',    ts - interval '21 days'),
    ('e7210000-0000-4000-8000-000000000003', 'Holloway Den',             'active', uid_leah, uid_leah, studio, uid_client, 'procurement', '88 Holloway Road',  ts - interval '75 days'),
    ('e7210000-0000-4000-8000-000000000004', 'Pell Court Dining',        'active', uid_leah, uid_leah, studio, uid_client, 'proposal',    '9 Pell Court',      ts - interval '30 days')
  on conflict (id) do nothing;

  -- S5: Marsh Street handed from Leah to the hire.
  insert into project_team_members (id, project_id, user_id, role, assigned_by, assigned_at)
  values
    ('e7210000-0000-4000-8000-000000000111', 'e7210000-0000-4000-8000-000000000001', uid_hire, 'lead_designer',  uid_leah, ts - interval '2 days'),
    ('e7210000-0000-4000-8000-000000000112', 'e7210000-0000-4000-8000-000000000001', uid_leah, 'previous_lead',  uid_leah, ts - interval '2 days')
  on conflict (project_id, user_id, role) do nothing;

  -- ── S2: client approved (yesterday) and client declined (yesterday) ──────────
  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, accepted_at, created_at, updated_at)
  values ('e7210000-0000-4000-8000-000000000021', 'e7210000-0000-4000-8000-000000000004', uid_leah, uid_client,
          'Pell Court Dining — furnishings', 'accepted', 'client_signed',
          1840000, 50, ts - interval '6 days', ts - interval '5 days', ts - interval '20 hours',
          ts - interval '8 days', ts - interval '20 hours')
  on conflict (id) do nothing;

  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, declined_at, decline_reason, created_at, updated_at)
  values ('e7210000-0000-4000-8000-000000000022', 'e7210000-0000-4000-8000-000000000002', uid_leah, uid_client,
          'Linden Place Living Room — direction and furnishings', 'declined', 'declined',
          2650000, 50, ts - interval '7 days', ts - interval '6 days', ts - interval '26 hours',
          'Love the sofa, but the total is more than we planned. Can we see a version without the custom rug?',
          ts - interval '9 days', ts - interval '26 hours')
  on conflict (id) do nothing;

  -- document_state reads a project's proposal through projects.proposal_id, which is immutable once a
  -- project is active (guard_project_completion_authority). So the two proposals above sit on their
  -- jobs' records only; the same two client moves are also seeded as proposal-stage engagements (no
  -- project yet), which is how a pre-project proposal reaches the Desk.
  insert into proposals (id, project_id, designer_id, client_id, title, status, commercial_state,
                         total_amount, deposit_percent, sent_at, viewed_at, accepted_at, declined_at, decline_reason,
                         created_at, updated_at)
  values
    ('e7210000-0000-4000-8000-000000000023', null, uid_leah, uid_client,
     'Thornfield Primary Suite — design services', 'accepted', 'client_signed',
     1200000, 30, ts - interval '4 days', ts - interval '3 days', ts - interval '18 hours', null, null,
     ts - interval '6 days', ts - interval '18 hours'),
    ('e7210000-0000-4000-8000-000000000024', null, uid_leah, uid_client,
     'Garnet Hill Family Room — design services', 'declined', 'declined',
     950000, 30, ts - interval '5 days', ts - interval '4 days', null, ts - interval '22 hours',
     'We have decided to wait until spring.',
     ts - interval '7 days', ts - interval '22 hours')
  on conflict (id) do nothing;

  -- ── S3: PO sent 9 days ago, no vendor acknowledgment ─────────────────────────
  insert into purchase_orders (id, designer_id, project_id, vendor_id, po_number, total_cents, status,
                               sent_at, acknowledged_at, ack_state, created_by, sidemark, created_at, updated_at, payment_pattern)
  values ('e7210000-0000-4000-8000-000000000031', uid_leah, 'e7210000-0000-4000-8000-000000000003', vendor,
          'PO-HD-0412', 742000, 'confirmed', ts - interval '9 days', null, 'none', uid_leah, 'HOLLOWAY / DEN',
          ts - interval '10 days', ts - interval '9 days', 'fifty_fifty')
  on conflict (id) do nothing;

  -- Marsh Street (the hire's job): PO also sent, unanswered 4 days — the "next thing" in the handoff note.
  insert into purchase_orders (id, designer_id, project_id, vendor_id, po_number, total_cents, status,
                               sent_at, acknowledged_at, ack_state, created_by, sidemark, created_at, updated_at, payment_pattern)
  values ('e7210000-0000-4000-8000-000000000032', uid_hire, 'e7210000-0000-4000-8000-000000000001', vendor,
          'PO-MS-0388', 1265000, 'confirmed', ts - interval '4 days', null, 'none', uid_leah, 'MARSH / KITCHEN',
          ts - interval '5 days', ts - interval '4 days', 'fifty_fifty')
  on conflict (id) do nothing;

  -- ── S4: invoice 12 days overdue, unpaid; deposit landed this morning ────────
  insert into invoices (id, project_id, designer_id, client_id, studio_id, invoice_number, title, status,
                        issue_date, due_date, payment_terms_days, currency, subtotal_cents, tax_rate, tax_cents,
                        total_cents, amount_paid_cents, sent_at, created_at, updated_at, paid_at)
  values
    ('e7210000-0000-4000-8000-000000000041', 'e7210000-0000-4000-8000-000000000003', uid_leah, uid_client, studio,
     'INV-2026-0721', 'Holloway Den — design fee, phase 2', 'sent',
     (ts - interval '42 days')::date, (ts - interval '12 days')::date, 30, 'usd', 380000, 0, 0,
     380000, 0, ts - interval '42 days', ts - interval '42 days', ts - interval '42 days', null),
    ('e7210000-0000-4000-8000-000000000042', 'e7210000-0000-4000-8000-000000000004', uid_leah, uid_client, studio,
     'INV-2026-0722', 'Pell Court Dining — furnishings deposit', 'paid',
     (ts - interval '20 hours')::date, (ts + interval '7 days')::date, 7, 'usd', 920000, 0, 0,
     920000, 920000, ts - interval '20 hours', ts - interval '20 hours', ts - interval '3 hours', ts - interval '3 hours')
  on conflict (id) do nothing;

  insert into invoice_payments (id, invoice_id, amount_cents, method, status, reference, note, recorded_by, received_at, created_at, updated_at)
  values ('e7210000-0000-4000-8000-000000000043', 'e7210000-0000-4000-8000-000000000042', 920000, 'ach_manual',
          'succeeded', 'ACH 20261009', 'Deposit for the Pell Court dining order', uid_leah,
          ts - interval '3 hours', ts - interval '3 hours', ts - interval '3 hours')
  on conflict (id) do nothing;

  -- ── S7: a fresh inquiry from today ──────────────────────────────────────────
  insert into leads (id, designer_id, project_type, project_description, budget_range, timeline,
                     location_city, location_state, status, response_deadline, contact_name, contact_email,
                     source, created_at, updated_at)
  values ('e7210000-0000-4000-8000-000000000051', uid_leah, 'full_room',
          'We just moved in and the family room has nothing that fits. Two kids, one dog, lots of light.',
          '$25k–$50k', '3-6 months', 'Portland', 'OR', 'new', ts + interval '3 days',
          'Ines Calder', 'ines.calder@example.com', 'website', ts - interval '2 hours', ts - interval '2 hours')
  on conflict (id) do nothing;
end $$;
