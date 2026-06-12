-- ═══════════════════════════════════════════════════════════════════════════
-- 00205 — margin_notes studio read (§14.6, rides the R29 Team popover)
--
-- 00196 shipped margin_notes author-scoped (designer_id = auth.uid()) — the
-- known single-lead limitation. D6: documents are visible to all studio
-- members; notes are the margin's studio-private layer, so studio members
-- must READ each other's notes (never the client — no client policy exists).
--
-- "Studio" here = (a) active co-membership in any organization the
-- engagement's lead designer is an active member of (00021
-- organization_members), or (b) active membership on the project team
-- (project_team_members via is_project_team_member, the 00170 precedent).
-- Authoring stays self-scoped: the existing FOR ALL policy already lets any
-- member write notes carrying their own designer_id; update/delete remain
-- the author's alone.
-- ═══════════════════════════════════════════════════════════════════════════

create policy margin_notes_studio_read on margin_notes
  for select to authenticated
  using (
    -- project engagements: shared studio with the lead, or on the team
    (
      project_id is not null and (
        exists (
          select 1
          from projects p
          join organization_members om_lead
            on om_lead.user_id = p.designer_id and om_lead.status = 'active'
          join organization_members om_me
            on om_me.organization_id = om_lead.organization_id
           and om_me.user_id = auth.uid() and om_me.status = 'active'
          where p.id = margin_notes.project_id
        )
        or is_project_team_member(margin_notes.project_id)
      )
    )
    -- pre-signing engagements: shared studio with the proposal's designer
    or (
      proposal_id is not null and exists (
        select 1
        from proposals pr
        join organization_members om_lead
          on om_lead.user_id = pr.designer_id and om_lead.status = 'active'
        join organization_members om_me
          on om_me.organization_id = om_lead.organization_id
         and om_me.user_id = auth.uid() and om_me.status = 'active'
        where pr.id = margin_notes.proposal_id
      )
    )
  );

comment on policy margin_notes_studio_read on margin_notes is
  '§14.6 widening (00205): studio members read each other''s notes per D6. Authoring/editing stays author-scoped (00196 policy). No client path — notes never mirror.';
