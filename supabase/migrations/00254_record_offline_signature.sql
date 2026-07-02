-- ═══════════════════════════════════════════════════════════════════════════
-- 00254 — Record an offline signature: record_offline_signature (R92)
--
-- When a client signs a physical contract, the designer needs to move the
-- proposal past the proposal phase. sign_proposal (00210) can't do it — it is
-- CLIENT-authorized (client_id = auth.uid()) and a designer session is rejected.
-- This is its designer-authorized sibling: the same one-act/many-surfaces
-- grammar (settle an approval Decision → flip the proposal to 'accepted' →
-- activate the project), but the caller is the proposal's DESIGNER and consent
-- is recorded as 'paper' rather than 'electronic_signature'.
--
-- Deltas from sign_proposal:
--   · Ownership guard is designer_id = auth.uid() (not client_id).
--   · Signability is ('sent','viewed','expired') — an issued proposal, including
--     one that lapsed digitally: a paper signature isn't time-boxed, so there is
--     NO valid_until expiry guard. 'draft' (never issued), 'declined' (client
--     rejected), and 'revised' (superseded) are excluded.
--   · client_consent_method = 'paper' (added to the CHECK below).
--   · The engagement event is 'signed_offline'.
--   · Returns the activated project id (so the caller can walk straight in) —
--     the auto-activated project_id is not visible on the pre-activation proposal
--     row, so returning it directly is cleaner than returning proposals.
--
-- Because it delegates to activate_proposal_as_project (00199), the whole
-- proposal (rooms, FF&E, phases, milestones) carries into the new active project
-- exactly as a digital sign would.
--
-- Additive only (D7). sign_proposal and the legacy /portal route are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Widen the consent-method CHECK to admit paper signatures ────────────────
-- client_consent_method was defined in 00117 with an inline CHECK (auto-named
-- client_decisions_client_consent_method_check) allowing NULL,
-- 'electronic_signature', 'click_through'. Drop + recreate with 'paper' added
-- (drop-auto-named-CHECK pattern from 00084).
alter table public.client_decisions
  drop constraint if exists client_decisions_client_consent_method_check;

alter table public.client_decisions
  add constraint client_decisions_client_consent_method_check
  check (
    client_consent_method is null
    or client_consent_method in ('electronic_signature', 'click_through', 'paper')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- record_offline_signature — the one-act offline sign (designer-invoked, R92)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_offline_signature(
  p_proposal_id   uuid,
  p_signed_name   text,
  p_auto_activate boolean default true,
  p_start_date    date    default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal           proposals;
  v_designer_client_id uuid;
  v_signed_name        text := btrim(coalesce(p_signed_name, ''));
begin
  -- Auth: an authenticated caller (the designer).
  if auth.uid() is null then
    raise exception 'record_offline_signature requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  -- Input: signed name ≥ 2 chars (mirrors sign_proposal's invalid_name guard).
  if char_length(v_signed_name) < 2 then
    raise exception 'a signature name of at least 2 characters is required'
      using errcode = 'check_violation';
  end if;

  -- Row fetch + lock (serializes concurrent signs; the activate path has no lock
  -- of its own, so we hold the proposal row for the whole transaction).
  select * into v_proposal
  from proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal % not found', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  -- Ownership: only the proposal's designer may record the signature.
  if v_proposal.designer_id is distinct from auth.uid() then
    raise exception 'proposal % may only be recorded by its designer', p_proposal_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotency: an already-accepted proposal is a no-op; return its project id
  -- (the row is current under FOR UPDATE) so retries are safe.
  if v_proposal.status = 'accepted' then
    return v_proposal.project_id;
  end if;

  -- Signability: an issued proposal, including one that lapsed digitally. A paper
  -- signature isn't time-boxed, so 'expired' is allowed and there is no
  -- valid_until check. 'draft'/'declined'/'revised' are excluded.
  if v_proposal.status not in ('sent', 'viewed', 'expired') then
    raise exception 'proposal % is not in a recordable status (%)',
      p_proposal_id, v_proposal.status
      using errcode = 'check_violation';
  end if;

  -- A client relationship is required to attribute the signature + carry the
  -- activation. (sign_proposal implies this via client_id = auth.uid().)
  if v_proposal.client_id is null then
    raise exception 'proposal % has no client to attribute the signature to', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  -- ── (1) The approval Decision (lands in the margins as a settled approval) ──
  select id into v_designer_client_id
  from designer_clients
  where designer_id = v_proposal.designer_id
    and client_id   = v_proposal.client_id;

  if v_designer_client_id is null then
    raise exception 'no designer↔client relationship for proposal %', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  -- Identical to sign_proposal's approval insert except client_consent_method =
  -- 'paper'. The partial unique index client_decisions_one_approval_per_proposal
  -- guarantees one approval per proposal even if a later digital sign runs.
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
    'paper',
    v_signed_name,
    now(),
    now(),
    now(),
    auth.uid()                             -- the designer who recorded it
  )
  on conflict (linked_proposal_id)
    where decision_type = 'approval' and linked_proposal_id is not null
    do nothing;

  -- ── (2) Flip the proposal row ───────────────────────────────────────────────
  update proposals
     set status         = 'accepted',
         signed_at       = now(),
         signed_by_name  = v_signed_name,
         signed_ip       = null,           -- no IP for a paper signature
         accepted_at     = now(),
         updated_at      = now()
   where id = p_proposal_id
   returning * into v_proposal;

  -- ── (3) The engagement event (audit trail) ──────────────────────────────────
  insert into proposal_engagement (proposal_id, viewer_id, event_type, metadata)
  values (
    p_proposal_id,
    auth.uid(),
    'signed_offline',
    jsonb_build_object(
      'via', 'record_offline_signature',
      'signed_by_name', v_signed_name,
      'recorded_by', auth.uid()
    )
  );

  -- ── (4) Auto-activate into a project (default on) ───────────────────────────
  -- We hold the proposal row under FOR UPDATE, so v_proposal.project_id is the
  -- authoritative "already activated?" check. Return the resulting project id so
  -- the caller can walk straight into the new document.
  if v_proposal.project_id is not null then
    return v_proposal.project_id;
  elsif p_auto_activate then
    return public.activate_proposal_as_project(p_proposal_id, p_start_date);
  else
    return null;
  end if;
end;
$$;

grant execute on function public.record_offline_signature(uuid, text, boolean, date)
  to authenticated;

comment on function public.record_offline_signature(uuid, text, boolean, date) is
  'R92: the one-act offline sign. Designer-invoked (SECURITY DEFINER — re-authorizes '
  'designer_id = auth.uid() internally). For when a client signs a physical contract: '
  'guards ownership + status∈(sent,viewed,expired) — no expiry check, a paper signature '
  'is not time-boxed — then, in one transaction: settles an ''approval'' client_decisions '
  'row (client_consent_method=''paper''), flips proposals to ''accepted'', records a '
  '''signed_offline'' proposal_engagement event, and (default) activates the project, '
  'returning its id. Idempotent on an already-accepted proposal. Sibling to sign_proposal '
  '(00210, client-invoked).';
