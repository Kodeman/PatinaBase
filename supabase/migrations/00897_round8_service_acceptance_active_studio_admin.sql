-- ═══════════════════════════════════════════════════════════════════════════
-- 00897 — Round 8 C4/C6: a non-active studio loses service-acceptance and
-- service-completion authority (US-52 release review, fix lane F-A defect 2,
-- MEDIUM). Ships INACTIVE.
--
-- _is_service_acceptance_studio_admin (00886) checked an active owner/admin
-- membership of the project's recorded studio, but not the studio's own
-- status, so a suspended, deactivated or pending_approval studio kept the
-- authority of every mutation that routes through it:
--   review_service_acceptance_paper_intake (confirm/reject paper)   00886
--   replace_service_acceptance_signer                               00893
--   complete_studio_service, through _can_complete_studio_service   00888
--   resolve_service_acceptance_condition, through the same          00888
--   revoke_studio_service_completion                                00888
--   present_service_acceptance_offline                              00899
-- It now also requires organizations.status = 'active', the rule 00556 put in
-- is_studio_comember and is_active_org_member.
--
-- _can_complete_studio_service (00888) also admitted the project's designer
-- of record with no studio check, so the designer of a suspended studio's
-- project could still complete the service and resolve its conditions
-- (including the completed_with_conditions -> completed advance). Its
-- designer-of-record branch now fails when the project's recorded studio
-- (projects.studio_id) exists and is not active. A project with no recorded
-- studio keeps the designer-of-record authority: there is no studio to be
-- suspended.
--
-- Not changed, on purpose:
--   * is_org_admin_or_owner stays status-blind. 00556 documents the exception:
--     a suspended studio's own admins keep managing their roster. That is
--     roster management, not acceptance authority, and this predicate is not
--     roster management.
--   * get_studio_service_completion keeps its own read predicate (the
--     designer of record or a studio co-member), so a suspended studio's
--     designer still reads the record.
--   * can_compose_project_plan (create, record paper intake, withdraw, the
--     studio read) is outside this fix.
--
-- Redefinitions, each copied verbatim from its only CREATE OR REPLACE with
-- the marked delta:
--   _is_service_acceptance_studio_admin   00886 -> 00897
--   _can_complete_studio_service          00888 -> 00897
-- CREATE OR REPLACE keeps their ACLs (both revoked from every API role, 00886
-- and 00888), so this file has no GRANT/REVOKE. No backfill.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._is_service_acceptance_studio_admin(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members m
    -- 00897 delta (F-A defect 2): the recorded studio itself must be active.
    JOIN public.organizations o ON o.id = m.organization_id AND o.status = 'active'
    WHERE m.organization_id = public.project_recorded_studio(p_project_id) AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('owner','admin'));
$$;

-- Designer of record (close_project's identity rule, 00399:7353) or a studio
-- owner/admin of the recorded studio.
CREATE OR REPLACE FUNCTION public._can_complete_studio_service(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.designer_id = auth.uid()
      -- 00897 delta (F-A defect 2): a recorded studio that is not active ends
      -- the designer-of-record authority too.
      AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p.studio_id AND o.status <> 'active'))
    OR public._is_service_acceptance_studio_admin(p_project_id));
$$;
