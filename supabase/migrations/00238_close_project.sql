-- ═══════════════════════════════════════════════════════════════════════════
-- 00238 — close_project: the Care band's "Close the book" (R80)
--
-- Completion in the Document is ONE act: the Care band's closure checklist +
-- portfolio snapshot settle into the project row and the status flips to
-- 'completed' in a single transaction. The legacy /complete page's write was
-- a client-side UPDATE that spread an unknown `closureItems` column into the
-- projects PATCH (a latent 400) and never persisted the snapshot at all —
-- this RPC gives both a real home.
--
--   · closure_checklist  jsonb — [{ key, label, completed }] as closed
--   · portfolio_snapshot jsonb — { headline, description, value_cents,
--                                  duration, rooms }
--
-- completed_at stamps via the 00095 trigger (status transition → completed).
-- Idempotent: closing an already-completed project refreshes the checklist /
-- snapshot (a re-close with better words is not an error) and returns the row.
--
-- Designer-invoked SECURITY DEFINER in the set_document_client (00225) shape:
-- auth + ownership re-authorized inside the function. Additive only (D7): two
-- nullable columns, no legacy path touched.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists closure_checklist  jsonb,
  add column if not exists portfolio_snapshot jsonb;

comment on column public.projects.closure_checklist is
  'R80: the Care band''s closure checklist as it stood when the book was closed '
  '([{ key, label, completed }]). Written by close_project.';
comment on column public.projects.portfolio_snapshot is
  'R80: the portfolio snapshot captured at close ({ headline, description, '
  'value_cents, duration, rooms }). Written by close_project.';

create or replace function public.close_project(
  p_project_id uuid,
  p_closure    jsonb default null,
  p_snapshot   jsonb default null
)
returns projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer uuid := auth.uid();
  v_project  projects;
begin
  if v_designer is null then
    raise exception 'close_project requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_project
  from projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'project % not found', p_project_id
      using errcode = 'no_data_found';
  end if;

  if v_project.designer_id is distinct from v_designer then
    raise exception 'project % may only be closed by its designer', p_project_id
      using errcode = 'insufficient_privilege';
  end if;

  -- One transaction: status → completed (completed_at stamps via the 00095
  -- trigger), the checklist + snapshot settle onto the row. Re-closing an
  -- already-completed project refreshes the words without moving the dates.
  update projects
     set status             = 'completed',
         closure_checklist  = coalesce(p_closure,  closure_checklist),
         portfolio_snapshot = coalesce(p_snapshot, portfolio_snapshot),
         updated_at         = now()
   where id = p_project_id
   returning * into v_project;

  return v_project;
end;
$$;

grant execute on function public.close_project(uuid, jsonb, jsonb) to authenticated;

comment on function public.close_project(uuid, jsonb, jsonb) is
  'R80: the Care band''s "Close the book" — one transaction: projects.status → '
  '''completed'' (completed_at via the 00095 trigger), closure_checklist + '
  'portfolio_snapshot persist. Designer-invoked (SECURITY DEFINER; auth + '
  'ownership guarded internally). Idempotent on an already-completed project.';
