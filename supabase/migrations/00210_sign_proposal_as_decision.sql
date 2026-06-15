-- ═══════════════════════════════════════════════════════════════════════════
-- 00210 — Signing is a decision: sign_proposal + request_proposal_change (R44)
--
-- The Document folds proposal signing into the same one-act/many-surfaces grammar
-- as send_weekly_pulse (00195): one RPC, one transaction, several surfaces light
-- up (the proposal row flips, an approval Decision lands in the margins, an
-- engagement event records the audit trail, and — by default — the project
-- activates). Mirrors the legacy /portal sign route's exact guards and writes so
-- both homes agree on what "signed" means (R44, DECISIONS forthcoming).
--
-- Audit-first findings:
--   · The client sign route requires an authenticated user (getUser non-null) and
--     enforces: name ≥ 2 chars, ownership (client_id = auth.uid()), signability
--     (status ∈ ('sent','viewed')), and authoritative expiry (valid_until > now()).
--     sign_proposal reproduces every guard INSIDE the RPC.
--   · A client has NO INSERT privilege on client_decisions (the designer FOR ALL
--     policy is keyed on designer_id = auth.uid()). So an approval Decision authored
--     on the client's behalf needs SECURITY DEFINER — exactly like apply_decision.
--   · activate_proposal_as_project (00199) is SECURITY DEFINER and requires
--     proposals.project_id IS NULL. We hold the row under FOR UPDATE, so the sign
--     guards on v_proposal.project_id directly (skip if already linked) rather than
--     catching a localized error string — a real activation failure rolls the sign back.
--   · proposal_engagement.event_type is free TEXT (no CHECK) — 'signed' /
--     'change_requested' are both valid. viewer_id FK → profiles(id) (mirrors auth).
--   · The legacy sign path is authenticated-only (not anon), so grants go to
--     `authenticated` only — anon is deliberately omitted.
--
-- Additive only (D7). The legacy /portal proposal sign route keeps working
-- unchanged; this RPC is the consolidated path The Document calls, and the route
-- may adopt it later. No destructive changes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Guard rail: one approval Decision per proposal ───────────────────────
-- A partial unique index across the edge races (concurrent signs, retried signs).
-- Scoped to approval Decisions only, so it never touches the shipped choice rows.
create unique index if not exists client_decisions_one_approval_per_proposal
  on public.client_decisions (linked_proposal_id)
  where decision_type = 'approval' and linked_proposal_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- sign_proposal — the one-act proposal sign (client-invoked, R44)
-- ═══════════════════════════════════════════════════════════════════════════
-- Model: send_weekly_pulse (00195) — but CLIENT-invoked, so it re-authorizes
-- every guard the legacy route enforces before touching a single row.

create or replace function public.sign_proposal(
  p_proposal_id   uuid,
  p_signed_name   text,
  p_signed_ip     text    default null,
  p_auto_activate boolean default true,
  p_start_date    date    default current_date
)
returns proposals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal          proposals;
  v_designer_client_id uuid;
  v_signed_name       text := btrim(coalesce(p_signed_name, ''));
begin
  -- Auth: the legacy route requires an authenticated user.
  if auth.uid() is null then
    raise exception 'sign_proposal requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  -- Input: signed name ≥ 2 chars (matches the route's invalid_name guard).
  if char_length(v_signed_name) < 2 then
    raise exception 'a signature name of at least 2 characters is required'
      using errcode = 'check_violation';
  end if;

  -- Row fetch + lock (serializes concurrent signs; the activate path has no
  -- lock of its own, so we hold the proposal row for the whole transaction).
  select * into v_proposal
  from proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal % not found', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  -- Ownership: only the proposal's client may sign (route's 403 forbidden).
  if v_proposal.client_id is distinct from auth.uid() then
    raise exception 'proposal % may only be signed by its client', p_proposal_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotency: an already-accepted proposal is a no-op so retries are safe.
  if v_proposal.status = 'accepted' then
    return v_proposal;
  end if;

  -- Signability: status ∈ ('sent','viewed') (route's 409 not_signable).
  if v_proposal.status not in ('sent', 'viewed') then
    raise exception 'proposal % is not in a signable status (%)',
      p_proposal_id, v_proposal.status
      using errcode = 'check_violation';
  end if;

  -- Expiry: authoritative even when status has not been flipped to 'expired'
  -- (route's 410 proposal_expired).
  if v_proposal.valid_until is not null and v_proposal.valid_until < now() then
    raise exception 'proposal % has expired', p_proposal_id
      using errcode = 'check_violation';
  end if;

  -- ── (1) The approval Decision (lands in the margins as a settled approval) ──
  -- Resolve the designer↔client relationship row; the BEFORE INSERT trigger would
  -- also backfill designer_id from it, but we set both explicitly to be safe.
  select id into v_designer_client_id
  from designer_clients
  where designer_id = v_proposal.designer_id
    and client_id   = v_proposal.client_id;

  if v_designer_client_id is null then
    raise exception 'no designer↔client relationship for proposal %', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  -- status = 'responded' is the settled value (the CHECK has no 'approved'/'settled').
  -- The partial unique index above guards against a duplicate approval on retry.
  insert into client_decisions (
    designer_client_id,
    designer_id,
    project_id,
    linked_proposal_id,
    title,
    decision_type,
    blocking_status,
    status,
    client_consent_method,
    client_signature,
    client_consented_at,
    sent_at,
    responded_at,
    selected_by
  )
  values (
    v_designer_client_id,
    v_proposal.designer_id,
    v_proposal.project_id,                 -- NULL pre-activation; back-linked later
    p_proposal_id,
    'Proposal approval',
    'approval',
    'non_blocking',
    'responded',
    'electronic_signature',
    v_signed_name,
    now(),
    now(),
    now(),
    auth.uid()
  )
  on conflict (linked_proposal_id)
    where decision_type = 'approval' and linked_proposal_id is not null
    do nothing;

  -- ── (2) Flip the proposal row (mirror of the legacy route's UPDATE) ─────────
  update proposals
     set status         = 'accepted',
         signed_at       = now(),
         signed_by_name  = v_signed_name,
         signed_ip       = p_signed_ip,
         accepted_at     = now(),
         updated_at      = now()
   where id = p_proposal_id
   returning * into v_proposal;

  -- ── (3) The engagement event (audit trail; route inserts the same shape) ────
  insert into proposal_engagement (proposal_id, viewer_id, event_type, metadata)
  values (
    p_proposal_id,
    auth.uid(),
    'signed',
    jsonb_build_object(
      'via', 'sign_proposal',
      'signed_by_name', v_signed_name,
      'signed_ip', p_signed_ip
    )
  );

  -- ── (4) Auto-activate into a project (default on) ───────────────────────────
  -- We hold the proposal row under FOR UPDATE, so v_proposal.project_id is the
  -- authoritative "already activated?" check (activate_proposal_as_project's own
  -- precondition). Guard on it directly rather than catching a localized error
  -- string — a retried/partially-applied sign skips activation cleanly, while a
  -- REAL activation failure propagates and rolls the whole sign back (atomic).
  if p_auto_activate and v_proposal.project_id is null then
    perform public.activate_proposal_as_project(p_proposal_id, p_start_date);
  end if;

  return v_proposal;
end;
$$;

grant execute on function public.sign_proposal(uuid, text, text, boolean, date)
  to authenticated;

comment on function public.sign_proposal(uuid, text, text, boolean, date) is
  'R44: the one-act proposal sign. Client-invoked (SECURITY DEFINER — a client has '
  'no INSERT on client_decisions). Reproduces the legacy /portal sign route guards '
  '(auth · name≥2 · ownership · status∈(sent,viewed) · valid_until>now) then, in one '
  'transaction: settles an ''approval'' client_decisions row (status=''responded''), '
  'flips proposals to ''accepted'', records a ''signed'' proposal_engagement event, and '
  '(default) activates the project. Idempotent on an already-accepted proposal.';

-- ═══════════════════════════════════════════════════════════════════════════
-- request_proposal_change — the client asks for a revision (R44)
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER by audit: the client UPDATE RLS policy (00100) has a WITH CHECK
-- of status ∈ ('viewed','accepted','declined'). Writing client_feedback while leaving
-- the proposal in 'sent' fails that WITH CHECK, so a clean "request changes without
-- accepting/declining" flow must bypass the status-bound policy via DEFINER, with the
-- same ownership + signability guards enforced internally.

create or replace function public.request_proposal_change(
  p_proposal_id uuid,
  p_feedback    text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal   proposals;
  v_feedback   text := btrim(coalesce(p_feedback, ''));
begin
  if auth.uid() is null then
    raise exception 'request_proposal_change requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  if v_feedback = '' then
    raise exception 'change-request feedback is required'
      using errcode = 'check_violation';
  end if;

  select * into v_proposal
  from proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal % not found', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  if v_proposal.client_id is distinct from auth.uid() then
    raise exception 'only the proposal''s client may request changes'
      using errcode = 'insufficient_privilege';
  end if;

  -- Same signability window as signing: a change request only makes sense while
  -- the proposal is live (not yet accepted/declined/expired).
  if v_proposal.status not in ('sent', 'viewed') then
    raise exception 'proposal % is not open for change requests (%)',
      p_proposal_id, v_proposal.status
      using errcode = 'check_violation';
  end if;

  -- Record the feedback WITHOUT terminal-statusing the row (status stays as-is so
  -- the proposal remains live and the designer can clone_proposal('revision'),
  -- which carries client_feedback forward — see 00176).
  update proposals
     set client_feedback = v_feedback,
         updated_at      = now()
   where id = p_proposal_id;

  -- Engagement event (event_type is free TEXT — no CHECK; mirrors the 'signed' row).
  insert into proposal_engagement (proposal_id, viewer_id, event_type, metadata)
  values (
    p_proposal_id,
    auth.uid(),
    'change_requested',
    jsonb_build_object('via', 'request_proposal_change')
  );
end;
$$;

grant execute on function public.request_proposal_change(uuid, text) to authenticated;

comment on function public.request_proposal_change(uuid, text) is
  'R44: the client asks for a proposal revision. Client-invoked (SECURITY DEFINER — '
  'the 00100 client UPDATE policy''s WITH CHECK forbids leaving status=''sent'' while '
  'writing client_feedback). Guards ownership + status∈(sent,viewed), writes '
  'client_feedback WITHOUT changing status (the proposal stays live for '
  'clone_proposal(''revision'') to carry forward), and records a '
  '''change_requested'' proposal_engagement event.';
