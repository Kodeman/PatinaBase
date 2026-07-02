-- ═══════════════════════════════════════════════════════════════════════════
-- 00237 — open_project_direct: projects that skip the proposal (R79)
--
-- The Document's OpenProjectSheet is the manual-creation half of PRJ-01: a
-- repeat client calls, the work is agreed on a handshake, and the designer
-- opens the project directly — no lead, no discovery, no proposal. The old
-- 7-step wizard does not port (R79); the sheet captures essentials only
-- (household · title · budget band · start date) and this RPC is its one act.
--
-- Model: set_document_client (00225) for the designer-invoked DEFINER guard
-- shape; activate_proposal_as_project (00199 lineage) for what "a project
-- opened" does to the designer↔client relationship (status advances to
-- 'active'). Differences, by design:
--   · p_client_id is NULLABLE — a project may open unlinked and take its
--     household later through the household sheet (set_document_client).
--   · The relationship row is ENSURED, not required: R73's invite-and-link
--     machinery usually creates it first, but a directly-picked profile
--     without one gets a designer_clients row here (source 'direct') so the
--     Desk, People, and the client mirror agree with the document immediately.
--   · p_id lets the caller supply the project id so a network-level retry of
--     the same act can never double-insert (ON CONFLICT (id) DO NOTHING and
--     the existing row is returned). Idempotence beyond that is not required.
--
-- The project lands with status 'active', proposal_id NULL — document_state
-- shape A picks it up as a manual project (R1: Brief→Proposal sections ghost)
-- and the designer composes the rest in /doc/{id}.
--
-- Additive only (D7): no table altered, no legacy path touched.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.open_project_direct(
  p_title            text,
  p_client_id        uuid    default null,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_start_date       date    default current_date,
  p_id               uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer uuid := auth.uid();
  v_id       uuid := coalesce(p_id, gen_random_uuid());
  v_title    text := btrim(coalesce(p_title, ''));
  v_existing projects;
begin
  if v_designer is null then
    raise exception 'open_project_direct requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  if v_title = '' then
    raise exception 'a project title is required'
      using errcode = 'check_violation';
  end if;

  -- Sanity: a band whose floor is above its ceiling is a typo, not a band.
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'budget band minimum exceeds its maximum'
      using errcode = 'check_violation';
  end if;

  -- Retry guard: if the caller-supplied id already exists, this is the same
  -- act arriving twice — return the existing project (ours) instead of
  -- inserting a sibling. A foreign id is a privilege error, not a no-op.
  if p_id is not null then
    select * into v_existing from projects where id = p_id;
    if found then
      if v_existing.designer_id is distinct from v_designer then
        raise exception 'project % belongs to another designer', p_id
          using errcode = 'insufficient_privilege';
      end if;
      return v_existing.id;
    end if;
  end if;

  insert into projects (
    id, name, status, designer_id, client_id, created_by,
    proposal_id, start_date, budget_min, budget_max
  )
  values (
    v_id, v_title, 'active', v_designer, p_client_id, v_designer,
    null, p_start_date, p_budget_min_cents, p_budget_max_cents
  )
  on conflict (id) do nothing;

  -- Ensure + advance the relationship (mirror of what activation does for the
  -- client's status): insert the designer_clients row when missing; when
  -- present, advance a pre-project status to 'active'. Never demotes an
  -- archived relationship (non-destructive, D7). The conflict target is the
  -- PARTIAL unique index idx_designer_clients_unique_profile (designer_id,
  -- client_id) WHERE client_id IS NOT NULL — hence the index predicate here
  -- (p_client_id is non-null on this branch by construction).
  if p_client_id is not null then
    insert into designer_clients (designer_id, client_id, source, status)
    values (v_designer, p_client_id, 'direct', 'active')
    on conflict (designer_id, client_id) where client_id is not null do update
      set status     = 'active',
          updated_at = now()
      where designer_clients.status in ('lead', 'proposal', 'prospect');
  end if;

  return v_id;
end;
$$;

grant execute on function public.open_project_direct(text, uuid, integer, integer, date, uuid)
  to authenticated;

comment on function public.open_project_direct(text, uuid, integer, integer, date, uuid) is
  'R79: open a project directly, skipping the proposal. Designer-invoked (SECURITY '
  'DEFINER; guards auth + title + budget band internally). Inserts the project '
  '(status ''active'', proposal_id NULL, designer_id/created_by = auth.uid()) and '
  'ensures/advances the designer_clients relationship to ''active'' (mirror of '
  'activate_proposal_as_project''s client-status move). p_id makes a retried act '
  'return the already-created project instead of double-inserting.';
