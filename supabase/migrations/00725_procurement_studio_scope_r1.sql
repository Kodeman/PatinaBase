-- ═══════════════════════════════════════════════════════════════════════════
-- 00725 — Procurement tables honour projects.studio_id (US-17 R1 F10; SQ-468)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00717 and 00721 moved the procurement reads and the project child tables
-- onto can_buy_for_project / can_send_purchase_order (00702): with
-- projects.studio_id set, the project owner or an active non-guest member of
-- that studio; with no studio_id, a non-guest co-member of the owner. Four
-- procurement policies still asked is_studio_comember(owner), so a member of
-- studio T who is the owner's co-member only through T read studio S's rows
-- (R1 F10 reproduced this on vendor_quote_requests). pg_policies on main
-- (00722) lists no other procurement table with an is_studio_comember gate:
--
--   vendor_quote_requests_studio_rw     (00584, FOR ALL)
--   purchase_order_changes_studio_read  (SELECT)
--   install_windows_studio_rw           (FOR ALL; authenticated holds SELECT only)
--   damage_claims_studio_rw             (00584, FOR ALL)
--
-- Each is recreated with the same name, command and roles; only the studio
-- predicate changes. Owner policies ("Designers can manage their quote
-- requests", "Designers manage damage claims …", "Studio owners can read
-- damage claims …") are separate and untouched. None of the four tables has a
-- client policy.
--
-- purchase_order_changes is read-only, so it takes the studio-membership read
-- rather than a buying test. can_buy_for_project is exactly that read: the
-- owner or a non-guest member of projects.studio_id, else (studio_id NULL)
-- is_studio_comember(owner). is_studio_comember already excluded guests, so no
-- reader who could read before loses the row except the cross-studio
-- co-member.
--
-- vendor_quote_requests.project_id is nullable. A request on a project is
-- decided by can_buy_for_project; a request with no project has no studio to
-- ask and keeps is_studio_comember(designer_id), as record_vendor_quote does
-- (00721 P3). On a project, WITH CHECK also keeps is_studio_comember on the
-- requester, so a write cannot re-attribute a request to a user outside the
-- writer's studios (who would then read it through the owner policy).
--
-- damage_claims resolves its project through the inspection's PO with
-- can_send_purchase_order, as 00717 did for receiving_inspection_lines;
-- receiving_inspections' own policy is can_send_purchase_order, so the EXISTS
-- reads under matching RLS.
--
-- No grants change.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. vendor_quote_requests ───────────────────────────────────────────────

DROP POLICY IF EXISTS vendor_quote_requests_studio_rw ON public.vendor_quote_requests;
CREATE POLICY vendor_quote_requests_studio_rw ON public.vendor_quote_requests
  FOR ALL TO authenticated
  USING (
    CASE WHEN vendor_quote_requests.project_id IS NOT NULL
         THEN public.can_buy_for_project(vendor_quote_requests.project_id)
         ELSE public.is_studio_comember(vendor_quote_requests.designer_id)
    END
  )
  WITH CHECK (
    public.is_studio_comember(vendor_quote_requests.designer_id)
    AND (vendor_quote_requests.project_id IS NULL
         OR public.can_buy_for_project(vendor_quote_requests.project_id))
  );

-- ─── 2. purchase_order_changes ──────────────────────────────────────────────

DROP POLICY IF EXISTS purchase_order_changes_studio_read ON public.purchase_order_changes;
CREATE POLICY purchase_order_changes_studio_read ON public.purchase_order_changes
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(purchase_order_changes.project_id));

-- ─── 3. install_windows ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS install_windows_studio_rw ON public.install_windows;
CREATE POLICY install_windows_studio_rw ON public.install_windows
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(install_windows.project_id))
  WITH CHECK (public.can_buy_for_project(install_windows.project_id));

-- ─── 4. damage_claims ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS damage_claims_studio_rw ON public.damage_claims;
CREATE POLICY damage_claims_studio_rw ON public.damage_claims
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND public.can_send_purchase_order(ri.purchase_order_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.receiving_inspections ri
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND public.can_send_purchase_order(ri.purchase_order_id)
    )
  );
