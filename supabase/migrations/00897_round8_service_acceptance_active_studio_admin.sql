-- ═══════════════════════════════════════════════════════════════════════════
-- 00897 — Round 8 C4/C6: a suspended studio's admins lose service-acceptance
-- authority (US-52 release review, fix lane F-A defect 2, MEDIUM). Ships
-- INACTIVE.
--
-- _is_service_acceptance_studio_admin (00886) checked an active owner/admin
-- membership of the project's recorded studio, but not the studio's own
-- status, so a suspended, deactivated or pending_approval studio kept the
-- authority of every mutation that routes through it:
--   review_service_acceptance_paper_intake (confirm/reject paper)   00886
--   replace_service_acceptance_signer                               00893
--   complete_studio_service, through _can_complete_studio_service   00888
--   revoke_studio_service_completion                                00888
--   present_service_acceptance_offline                              00899
-- It now also requires organizations.status = 'active', the rule 00556 put in
-- is_studio_comember and is_active_org_member.
--
-- Not changed, on purpose:
--   * is_org_admin_or_owner stays status-blind. 00556 documents the exception:
--     a suspended studio's own admins keep managing their roster. That is
--     roster management, not acceptance authority, and this predicate is not
--     roster management.
--   * _can_complete_studio_service keeps its designer-of-record branch
--     (projects.designer_id), as 00556 kept the self-branch of
--     is_studio_comember. Only its studio-admin branch moves.
--   * can_compose_project_plan (create, record paper intake, withdraw, the
--     studio read) is outside this fix.
--
-- Redefinition, copied verbatim from its only CREATE OR REPLACE with the
-- marked delta:
--   _is_service_acceptance_studio_admin   00886 -> 00897
-- CREATE OR REPLACE keeps its ACL (revoked from every API role, 00886), so
-- this file has no GRANT/REVOKE. No backfill.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._is_service_acceptance_studio_admin(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members m
    -- 00897 delta (F-A defect 2): the recorded studio itself must be active.
    JOIN public.organizations o ON o.id = m.organization_id AND o.status = 'active'
    WHERE m.organization_id = public.project_recorded_studio(p_project_id) AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('owner','admin'));
$$;
