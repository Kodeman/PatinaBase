-- ═══════════════════════════════════════════════════════════════════════════
-- 00252 — The Folio reaches proposal-stage documents (R85 / R24)
--
-- Additive only (D7). R85 mounts the Folio on proposal-stage documents so
-- space plans and drawings can reach the CLIENT's copy of a proposal BEFORE a
-- project exists. Precedent: 00224 gave `project_documents` a
-- `designer_client_id` anchor leg for the Discovery folio (pre-project, keyed
-- to the engagement). This mirrors it for the PROPOSAL stage:
--
--   1. `project_documents.proposal_id` (nullable) — the proposal anchor. Files
--      live under project-documents/{proposal_id}/…
--   2. The owner CHECK widens to accept the proposal leg.
--   3. Designer read + manage RLS legs (the proposal's designer owns it) —
--      mirrors 00224's designer-client legs, keyed on proposals.designer_id.
--   4. A CLIENT read leg (client_visible AND proposals.client_id = auth.uid())
--      — mirrors 00203's project client leg, so flagged space plans reach the
--      client's proposal copy pre-project (R85). Discovery had no client leg;
--      the proposal DOES, because the client sees the proposal.
--   5. Storage object policies for both legs (folder[1] = proposal_id).
--
-- Nothing existing is touched: project_id / designer_client_id anchors and
-- their policies are unchanged. The `client_visible` default (FALSE, 00203)
-- carries — a proposal folio file is studio-only until the designer shares it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table project_documents
  add column if not exists proposal_id uuid
    references proposals(id) on delete cascade;

comment on column project_documents.proposal_id is
  'R85: anchors a folio file (space plan, drawing) to a PROPOSAL-stage document, before a project exists. Files live under project-documents/{proposal_id}/…. Flagged (client_visible) files reach the client''s proposal copy; the client read leg below scopes them to proposals.client_id.';

-- Widen the owner presence CHECK to accept the proposal leg (00224 added the
-- designer_client_id leg; this adds proposal_id).
alter table project_documents drop constraint if exists chk_project_documents_owner;
alter table project_documents add constraint chk_project_documents_owner
  check (
    project_id is not null
    or designer_client_id is not null
    or proposal_id is not null
  );

create index if not exists idx_project_documents_proposal
  on project_documents(proposal_id, section_key)
  where proposal_id is not null;

-- ── Designer legs: the proposal's designer reads + manages its folio ─────────
drop policy if exists "Designers view proposal folio" on public.project_documents;
create policy "Designers view proposal folio"
  on public.project_documents for select to authenticated
  using (
    proposal_id is not null
    and exists (
      select 1 from public.proposals pr
      where pr.id = project_documents.proposal_id
        and pr.designer_id = auth.uid()
    )
  );

drop policy if exists "Designers manage proposal folio" on public.project_documents;
create policy "Designers manage proposal folio"
  on public.project_documents for all to authenticated
  using (
    proposal_id is not null
    and exists (
      select 1 from public.proposals pr
      where pr.id = project_documents.proposal_id
        and pr.designer_id = auth.uid()
    )
  )
  with check (
    proposal_id is not null
    and exists (
      select 1 from public.proposals pr
      where pr.id = project_documents.proposal_id
        and pr.designer_id = auth.uid()
    )
  );

-- ── Client leg: the proposal's client reads only FLAGGED files (R85) ─────────
-- Mirrors 00203's project client leg. A space plan the designer shared
-- (client_visible = true) reaches the client's proposal copy before a project
-- exists.
drop policy if exists "Clients view flagged proposal folio" on public.project_documents;
create policy "Clients view flagged proposal folio"
  on public.project_documents for select to authenticated
  using (
    proposal_id is not null
    and client_visible = true
    and exists (
      select 1 from public.proposals pr
      where pr.id = project_documents.proposal_id
        and pr.client_id = auth.uid()
    )
  );

-- ── Storage: the bucket gains the proposal legs (folder[1] = proposal_id) ────
drop policy if exists "Designers manage proposal folio objects" on storage.objects;
create policy "Designers manage proposal folio objects"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.proposals pr
      where pr.id = ((storage.foldername(name))[1])::uuid
        and pr.designer_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from public.proposals pr
      where pr.id = ((storage.foldername(name))[1])::uuid
        and pr.designer_id = auth.uid()
    )
  );

drop policy if exists "Clients read flagged proposal folio objects" on storage.objects;
create policy "Clients read flagged proposal folio objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1
      from public.proposals pr
      join public.project_documents pd
        on pd.proposal_id = pr.id
       and pd.storage_path = name
       and pd.client_visible = true
      where pr.id = ((storage.foldername(name))[1])::uuid
        and pr.client_id = auth.uid()
    )
  );
