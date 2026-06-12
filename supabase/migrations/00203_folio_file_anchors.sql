-- ═══════════════════════════════════════════════════════════════════════════
-- 00203 — The Folio: files clipped to the paper (R24, Dissolve Track 1.2)
--
-- Audit-first finding: the package proposed a new `engagement_files` table;
-- the codebase already carries `project_documents` (00169) + the private
-- `project-documents` bucket (00170) with working upload RLS. Codebase wins —
-- extend additively:
--   · margin-grammar anchors (line / section / letterhead) + section_key
--   · literal versioning: version_of chains a re-upload behind its
--     predecessor (the stacked-edge render reads the chain)
--   · client_visible, DEFAULT FALSE — the folio shares the Notes' private
--     layer; the client mirror renders only flagged files.
--
-- Backfill: rows that exist today were already client-readable through the
-- old Documents surface — they backfill to client_visible = true so the old
-- zones' truth does not change out from under a live engagement (D7).
-- New uploads default studio-only per the ruling.
-- ═══════════════════════════════════════════════════════════════════════════

alter table project_documents
  add column if not exists anchor_kind text
    check (anchor_kind in ('line', 'section', 'letterhead')),
  add column if not exists anchor_id uuid,
  add column if not exists section_key text
    check (section_key in ('brief','discovery','direction','proposal','project','install','care')),
  add column if not exists version_of uuid references project_documents(id) on delete set null,
  add column if not exists client_visible boolean not null default false;

comment on column project_documents.anchor_kind is
  'The Document folio anchor (R24). NULL = legacy upload (letterhead-equivalent). ''line'' carries anchor_id = project_ffe_items.id; ''section'' carries section_key.';
comment on column project_documents.version_of is
  'R24 literal versioning: this file supersedes the referenced one. Chains render as the Desk''s stacked edges; one click slides older versions out.';
comment on column project_documents.client_visible is
  'R24: the folio respects the same private layer as Notes. FALSE (default) = studio eyes only; the client mirror renders only flagged files. Pre-00203 rows backfilled TRUE (they were already client-readable).';

-- Pre-existing rows keep their pre-folio client visibility (every row at
-- migration time predates the folio).
update project_documents set client_visible = true;

create index if not exists idx_project_documents_anchor
  on project_documents(project_id, section_key)
  where section_key is not null;

create index if not exists idx_project_documents_version_of
  on project_documents(version_of)
  where version_of is not null;

-- ── Client read narrows to flagged files ─────────────────────────────────────
-- (Designer/team policies unchanged; backfill above keeps existing files
-- visible to clients, so no live engagement loses anything.)

drop policy if exists "Clients can view their project documents" on public.project_documents;
create policy "Clients can view their project documents"
  on public.project_documents for select
  using (
    client_visible = true
    and exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
        and p.client_id = auth.uid()
    )
  );

-- Storage: the client leg of the bucket read policy gains the same gate.
drop policy if exists "Project members can read documents" on storage.objects;
create policy "Project members can read documents"
  on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and (
      -- lead designer or active team member: every file
      exists (
        select 1 from public.projects p
        where p.id = ((storage.foldername(name))[1])::uuid
          and p.designer_id = auth.uid()
      )
      or public.is_project_team_member(((storage.foldername(name))[1])::uuid)
      -- the client: only files flagged client_visible (R24)
      or exists (
        select 1
        from public.projects p
        join public.project_documents pd
          on pd.project_id = p.id
         and pd.storage_path = name
         and pd.client_visible = true
        where p.id = ((storage.foldername(name))[1])::uuid
          and p.client_id = auth.uid()
      )
    )
  );
