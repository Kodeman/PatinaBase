-- ═══════════════════════════════════════════════════════════════════════════
-- 00316 — Studio shared-workspace RLS (additive studio legs)
--
-- Widens the designer-portal domain so all ACTIVE members of a design_studio
-- org see and work on each other's projects, clients, proposals, decisions,
-- boards, time, and invoices — via the 00315 is_studio_comember() helper keyed
-- on the owning designer's uid.
--
-- INVARIANTS:
--   • EVERY change is an ADDITIVE permissive policy. Nothing existing is dropped
--     EXCEPT margin_notes_studio_read (00205), which is rewritten because its
--     inline org_members double-join is silently empty for non-admin members
--     (the exact bug this design replaces).
--   • Owner legs (designer_id = auth.uid()), client/consent read+sign legs, and
--     pool INSERT legs stay verbatim.
--   • Solo studios pay ~zero cost: is_studio_comember short-circuits on the
--     self-branch (p_owner = auth.uid()) before touching org_members, and the
--     cheap owner policy still evaluates independently.
--   • uid-keying (not per-row studio_id) gives one mechanism across parents and
--     the studio-less tables (designer_clients/leads/proposals/invoices).
--   • DESTRUCTIVE guardrails held narrow: projects DELETE stays lead-only;
--     invoices have no studio DELETE (raw delete + void stay owner-only, 00187);
--     consent UPDATE stays client-only; designer_earnings/payouts untouched.
--
-- No GRANT/REVOKE (policies only) → no legacy-grants regen needed for this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── projects (live: 00168) — add SELECT + UPDATE; INSERT self / DELETE lead stay
CREATE POLICY "projects_studio_select" ON public.projects
  FOR SELECT TO authenticated
  USING (is_studio_comember(designer_id));

CREATE POLICY "projects_studio_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (is_studio_comember(designer_id))
  WITH CHECK (is_studio_comember(designer_id));

-- ─── designer_clients (live: 00014) — full studio access
CREATE POLICY "designer_clients_studio_rw" ON public.designer_clients
  FOR ALL TO authenticated
  USING (is_studio_comember(designer_id))
  WITH CHECK (is_studio_comember(designer_id));

-- ─── leads (live: 00014 + 00166) — SELECT + UPDATE only; no studio INSERT.
-- Unassigned pool leads (designer_id IS NULL) stay invisible: is_studio_comember(NULL)=false.
CREATE POLICY "leads_studio_select" ON public.leads
  FOR SELECT TO authenticated
  USING (is_studio_comember(designer_id));

CREATE POLICY "leads_studio_update" ON public.leads
  FOR UPDATE TO authenticated
  USING (is_studio_comember(designer_id))
  WITH CHECK (is_studio_comember(designer_id));

-- ─── proposals (live: 00014 + 00100) — full studio access; client legs untouched
CREATE POLICY "proposals_studio_rw" ON public.proposals
  FOR ALL TO authenticated
  USING (is_studio_comember(designer_id))
  WITH CHECK (is_studio_comember(designer_id));

-- ─── client_decisions + options (live: 00062/00064) — via denormalized designer_id.
-- Client consent UPDATE legs (00064, keyed on designer_clients.client_id) NOT touched.
CREATE POLICY "client_decisions_studio_rw" ON public.client_decisions
  FOR ALL TO authenticated
  USING (is_studio_comember(designer_id))
  WITH CHECK (is_studio_comember(designer_id));

CREATE POLICY "client_decision_options_studio_rw" ON public.client_decision_options
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_decisions cd
    WHERE cd.id = client_decision_options.decision_id
      AND is_studio_comember(cd.designer_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_decisions cd
    WHERE cd.id = client_decision_options.decision_id
      AND is_studio_comember(cd.designer_id)));

-- ─── room_scans (live designer-read: 00020) — SELECT-only via the designer_clients
-- relationship; scans stay owned/written by the client (user_id). Pass-through
-- widening: 00020 inlines designer_clients.designer_id = auth.uid(), so widening
-- designer_clients alone does NOT reach this — it needs its own leg.
CREATE POLICY "room_scans_studio_designer_read" ON public.room_scans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.designer_clients dc
    WHERE dc.client_id = room_scans.user_id
      AND is_studio_comember(dc.designer_id)));

-- ─── Boards (live: 00179 + 00272 project anchoring) ──────────────────────────
-- proposal_boards owner shape is exactly-one-of proposal_id / project_id (00272).
CREATE POLICY "proposal_boards_studio_rw" ON public.proposal_boards
  FOR ALL TO authenticated
  USING (
    (proposal_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.proposals p
       WHERE p.id = proposal_boards.proposal_id AND is_studio_comember(p.designer_id)))
    OR (project_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.projects p
       WHERE p.id = proposal_boards.project_id AND is_studio_comember(p.designer_id)))
  )
  WITH CHECK (
    (proposal_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.proposals p
       WHERE p.id = proposal_boards.proposal_id AND is_studio_comember(p.designer_id)))
    OR (project_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.projects p
       WHERE p.id = proposal_boards.project_id AND is_studio_comember(p.designer_id)))
  );

-- proposal_board_items: via parent proposal_boards (both anchor shapes).
CREATE POLICY "proposal_board_items_studio_rw" ON public.proposal_board_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.proposal_boards pb
    WHERE pb.id = proposal_board_items.board_id
      AND (
        (pb.proposal_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.proposals p WHERE p.id = pb.proposal_id AND is_studio_comember(p.designer_id)))
        OR (pb.project_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.projects p WHERE p.id = pb.project_id AND is_studio_comember(p.designer_id)))
      )))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_boards pb
    WHERE pb.id = proposal_board_items.board_id
      AND (
        (pb.proposal_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.proposals p WHERE p.id = pb.proposal_id AND is_studio_comember(p.designer_id)))
        OR (pb.project_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.projects p WHERE p.id = pb.project_id AND is_studio_comember(p.designer_id)))
      )));

-- project_boards: via parent project.
CREATE POLICY "project_boards_studio_rw" ON public.project_boards
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_boards.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_boards.project_id AND is_studio_comember(p.designer_id)));

-- ─── projects-parented child fleet — one identical leg each via projects.designer_id
-- (project_rooms/project_ffe_items/project_phases/project_payment_milestones/
--  scope_change_requests: 00066; project_narrative_sections: 00138;
--  project_palettes: 00140). Rows whose project_id is NULL degrade safely to the
--  existing owner policy.
CREATE POLICY "project_rooms_studio_rw" ON public.project_rooms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_rooms.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_rooms.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "project_ffe_items_studio_rw" ON public.project_ffe_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_ffe_items.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_ffe_items.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "project_phases_studio_rw" ON public.project_phases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_phases.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_phases.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "project_payment_milestones_studio_rw" ON public.project_payment_milestones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_payment_milestones.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_payment_milestones.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "scope_change_requests_studio_rw" ON public.scope_change_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scope_change_requests.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scope_change_requests.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "project_narrative_sections_studio_rw" ON public.project_narrative_sections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_narrative_sections.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_narrative_sections.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "project_palettes_studio_rw" ON public.project_palettes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_palettes.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_palettes.project_id AND is_studio_comember(p.designer_id)));

-- ─── proposals-parented child fleet — via proposals.designer_id
-- (proposal_items: 00014; proposal_scope_rooms/proposal_phases/proposal_exclusions/
--  proposal_payment_milestones/proposal_change_order_terms: 00066).
CREATE POLICY "proposal_items_studio_rw" ON public.proposal_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_items.proposal_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "proposal_scope_rooms_studio_rw" ON public.proposal_scope_rooms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_scope_rooms.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_scope_rooms.proposal_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "proposal_phases_studio_rw" ON public.proposal_phases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_phases.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_phases.proposal_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "proposal_exclusions_studio_rw" ON public.proposal_exclusions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_exclusions.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_exclusions.proposal_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "proposal_payment_milestones_studio_rw" ON public.proposal_payment_milestones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_payment_milestones.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_payment_milestones.proposal_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "proposal_change_order_terms_studio_rw" ON public.proposal_change_order_terms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_change_order_terms.proposal_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_change_order_terms.proposal_id AND is_studio_comember(p.designer_id)));

-- ─── designer_clients-parented child fleet — via designer_clients.designer_id
-- (client_reviews/client_nurture_touchpoints/client_activity_log: 00062). These
-- carry only designer_client_id (no denormalized designer_id) → join designer_clients.
CREATE POLICY "client_reviews_studio_rw" ON public.client_reviews
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_reviews.designer_client_id AND is_studio_comember(dc.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_reviews.designer_client_id AND is_studio_comember(dc.designer_id)));

CREATE POLICY "client_nurture_touchpoints_studio_rw" ON public.client_nurture_touchpoints
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_nurture_touchpoints.designer_client_id AND is_studio_comember(dc.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_nurture_touchpoints.designer_client_id AND is_studio_comember(dc.designer_id)));

CREATE POLICY "client_activity_log_studio_rw" ON public.client_activity_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_activity_log.designer_client_id AND is_studio_comember(dc.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.designer_clients dc WHERE dc.id = client_activity_log.designer_client_id AND is_studio_comember(dc.designer_id)));

-- ─── project_time_entries (live: 00177) — studio SELECT-all; write only OWN rows.
-- Mirrors the existing team pattern; guard_invoiced_time_entry (00177) still
-- protects invoiced rows.
CREATE POLICY "time_entries_studio_read" ON public.project_time_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
     WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "time_entries_studio_insert_own" ON public.project_time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "time_entries_studio_update_own" ON public.project_time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)))
  WITH CHECK (user_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)));

CREATE POLICY "time_entries_studio_delete_own" ON public.project_time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)));

-- ─── invoices / line items / payments (live: 00178) ──────────────────────────
-- SELECT + INSERT + draft-only UPDATE for line items; payments read-only; NO
-- studio DELETE (raw delete stays owner-only; void_invoice stays owner-only, 00187).
CREATE POLICY "invoices_studio_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (is_studio_comember(designer_id));

CREATE POLICY "invoices_studio_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (is_studio_comember(designer_id));

CREATE POLICY "invoices_studio_update_draft" ON public.invoices
  FOR UPDATE TO authenticated
  USING (is_studio_comember(designer_id) AND status = 'draft')
  WITH CHECK (is_studio_comember(designer_id) AND status = 'draft');

CREATE POLICY "invoice_line_items_studio_select" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_line_items.invoice_id AND is_studio_comember(i.designer_id)));

CREATE POLICY "invoice_line_items_studio_insert_draft" ON public.invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_line_items.invoice_id AND is_studio_comember(i.designer_id) AND i.status = 'draft'));

CREATE POLICY "invoice_line_items_studio_update_draft" ON public.invoice_line_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_line_items.invoice_id AND is_studio_comember(i.designer_id) AND i.status = 'draft'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_line_items.invoice_id AND is_studio_comember(i.designer_id) AND i.status = 'draft'));

CREATE POLICY "invoice_line_items_studio_delete_draft" ON public.invoice_line_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_line_items.invoice_id AND is_studio_comember(i.designer_id) AND i.status = 'draft'));

CREATE POLICY "invoice_payments_studio_select" ON public.invoice_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_payments.invoice_id AND is_studio_comember(i.designer_id)));

-- ─── FIX: margin_notes_studio_read (00205) — replace the silently-broken inline
-- org_members double-join with is_studio_comember(). Keeps the is_project_team_member
-- OR-leg and the project_id/proposal_id engagement-anchored shape. No client path.
DROP POLICY IF EXISTS margin_notes_studio_read ON public.margin_notes;
CREATE POLICY margin_notes_studio_read ON public.margin_notes
  FOR SELECT TO authenticated
  USING (
    (
      project_id IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = margin_notes.project_id
            AND is_studio_comember(p.designer_id)
        )
        OR is_project_team_member(margin_notes.project_id)
      )
    )
    OR (
      proposal_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.proposals pr
        WHERE pr.id = margin_notes.proposal_id
          AND is_studio_comember(pr.designer_id)
      )
    )
  );

COMMENT ON POLICY margin_notes_studio_read ON public.margin_notes IS
  '§14.6 widening, fixed in 00316: studio members read each other''s notes via is_studio_comember (00205''s inline org_members join was silently empty for non-admin members). Keeps the is_project_team_member team leg. Authoring/editing stays author-scoped (00196). No client path.';
