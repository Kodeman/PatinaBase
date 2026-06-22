-- ═══════════════════════════════════════════════════════════════════════════
-- 00225 — set_document_client: view/set/change the client on an open document
--
-- The Document had no way to attach or change the client on a proposal/project
-- outside the buried Send-sheet ClientPicker. This RPC is the one-act path the
-- household sheet calls to point a document at a client (or unlink it), folding
-- the relationship-status mirror into the same transaction (§5).
--
-- Designer-invoked (not client): re-authorizes ownership inside the function the
-- way sign_proposal (00210) does for the client side.
--   · auth.uid() must own the target (projects/proposals.designer_id = auth.uid()).
--     The 00168 "Lead designer can update projects" policy already permits the
--     direct UPDATE, but routing through one RPC unifies the guard + status mirror.
--   · the chosen client must be one of THIS designer's designer_clients rows
--     (never attach a stranger's profile, which would orphan
--     useDesignerClientForClientUser downstream). NULL unlinks.
--   · the newly-linked relationship advances toward the engagement's stage
--     (project → active, proposal → at least proposal) so the Desk + client
--     mirror agree with the document immediately. The PRIOR client's relationship
--     is left untouched (non-destructive, D7) — see DECISIONS R68.
--
-- Additive only (D7): no schema change, no table touched destructively; the
-- legacy ClientPicker→useUpdateProposal path keeps working unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.set_document_client(
  p_engagement_kind text,   -- 'project' | 'proposal'
  p_target_id        uuid,   -- the project id or proposal id
  p_client_id        uuid     -- profiles.id to link, or NULL to unlink
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer uuid := auth.uid();
  v_count    int;
begin
  if v_designer is null then
    raise exception 'set_document_client requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  -- Guard: the chosen client must be one of this designer's relationships
  -- (or NULL to unlink). Prevents attaching a profile the designer has no
  -- designer_clients row for — which would break the relationship resolution.
  if p_client_id is not null and not exists (
    select 1 from designer_clients
    where designer_id = v_designer and client_id = p_client_id
  ) then
    raise exception 'client % is not one of your clients', p_client_id
      using errcode = 'insufficient_privilege';
  end if;

  if p_engagement_kind = 'project' then
    update projects
      set client_id = p_client_id, updated_at = now()
      where id = p_target_id and designer_id = v_designer;
  elsif p_engagement_kind = 'proposal' then
    update proposals
      set client_id = p_client_id, updated_at = now()
      where id = p_target_id and designer_id = v_designer;
  else
    raise exception 'unknown engagement kind %', p_engagement_kind
      using errcode = 'check_violation';
  end if;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no % owned by you with id %', p_engagement_kind, p_target_id
      using errcode = 'insufficient_privilege';
  end if;

  -- One act, many surfaces (§5): advance the newly-linked relationship to match
  -- the engagement stage. Non-destructive — never demotes the prior client.
  if p_client_id is not null then
    if p_engagement_kind = 'project' then
      update designer_clients
        set status = 'active', updated_at = now()
        where designer_id = v_designer and client_id = p_client_id
          and status in ('lead', 'proposal');
    else
      update designer_clients
        set status = 'proposal', updated_at = now()
        where designer_id = v_designer and client_id = p_client_id
          and status = 'lead';
    end if;
  end if;
end;
$$;

grant execute on function public.set_document_client(text, uuid, uuid) to authenticated;
