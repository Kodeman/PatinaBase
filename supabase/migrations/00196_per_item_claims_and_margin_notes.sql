-- ═══════════════════════════════════════════════════════════════════════════
-- 00196 — Per-item damage-claim attribution + margin notes
--
-- The Document, Slice 4. Additive only (D7):
--   1. damage_claims.ffe_item_id — the FK ruled in R7: claims gain item-grain
--      attribution so DAMAGED can return as a TRUTHFUL per-item stamp.
--      NULL = PO-grain claim (all pre-00196 rows): those keep surfacing only
--      as the Desk need line, never as a line stamp.
--   2. margin_notes — the sixth margin kind (R14): designer-authored
--      marginalia. Studio-visible, never client-visible. Escalates in place
--      to a client decision or a scope change request.
-- ═══════════════════════════════════════════════════════════════════════════

alter table damage_claims
  add column if not exists ffe_item_id uuid
    references project_ffe_items(id) on delete set null;

comment on column damage_claims.ffe_item_id is
  'Item-grain attribution (R7/R14 follow-through, 00196). NULL = PO-grain claim: surfaces on the Desk need line only — never as a line stamp (truth device, R2).';

create index idx_damage_claims_open_item
  on damage_claims(ffe_item_id)
  where state in ('drafted', 'vendor_notified') and ffe_item_id is not null;

create table margin_notes (
  id                           uuid primary key default gen_random_uuid(),
  project_id                   uuid references projects(id) on delete cascade,
  proposal_id                  uuid references proposals(id) on delete cascade,
  designer_id                  uuid not null references profiles(id) on delete cascade,
  body                         text not null,
  anchor_kind                  text not null default 'letterhead'
    check (anchor_kind in ('line', 'section', 'letterhead')),
  anchor_id                    uuid,
  due_date                     timestamptz,
  escalated_to_decision_id     uuid references client_decisions(id) on delete set null,
  escalated_to_scope_change_id uuid references scope_change_requests(id) on delete set null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint chk_margin_notes_engagement
    check (project_id is not null or proposal_id is not null)
);

comment on table margin_notes is
  'The Note (R14): designer-authored marginalia, the margin''s private layer — studio-visible (D6), never client-visible. Escalates in place to a client decision or scope change request. RLS is author-scoped in v1 (same single-lead-designer limitation as 00150; widen when studio membership lands).';

create index idx_margin_notes_project on margin_notes(project_id);
create index idx_margin_notes_proposal on margin_notes(proposal_id);

alter table margin_notes enable row level security;

create policy margin_notes_designer_all on margin_notes
  for all to authenticated
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());
