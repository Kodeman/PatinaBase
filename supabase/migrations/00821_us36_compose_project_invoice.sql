-- 00821 — Compose a project invoice in one transaction (US-36 K13).
-- Calls the 00511 draft writer and the 00817 studio-scoped billing writer. The
-- 00617 claim is INVOKER/RLS, so this DEFINER mirrors the project-hour
-- UPDATE and SELECT policy union (00177/00316/00484/00605/00606).
CREATE OR REPLACE FUNCTION public.compose_project_invoice(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_expected_client_id uuid,
  p_expected_studio_id uuid,
  p_tax_rate numeric,
  p_payment_terms_days integer,
  p_memo text,
  p_internal_notes text,
  p_lines jsonb,
  p_entry_ids uuid[],
  p_billing_lines jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_claimed integer;
BEGIN
  -- Commercial-hour edits lock the entry before their classifier locks its
  -- project. Take the same order before create_draft_invoice's project SHARE.
  PERFORM entry.id
  FROM public.project_time_entries AS entry
  WHERE entry.id = ANY(p_entry_ids)
  ORDER BY entry.id
  FOR UPDATE OF entry;

  SELECT count(*) INTO v_claimed
  FROM public.project_time_entries AS entry
  JOIN public.projects AS project ON project.id = entry.project_id
  WHERE entry.id = ANY(p_entry_ids)
    AND project.id = p_project_id
    AND entry.invoice_id IS NULL
    AND entry.billable
    AND entry.duration_minutes IS NOT NULL
    AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
    AND entry.rate_source IS DISTINCT FROM 'none'
    AND (
      -- Permissive UPDATE union from pg_policies: project lead (00177 ALL),
      -- own project-team hour, own studio-comember hour, studio owner/admin.
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    );
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'compose_project_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_invoice := public.create_draft_invoice(
      p_project_id, p_expected_designer_id, p_expected_client_id,
      p_expected_studio_id, p_tax_rate, p_payment_terms_days,
      p_memo, p_internal_notes, p_lines
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'compose_project_invoice: draft: %', SQLERRM USING ERRCODE = SQLSTATE;
  END;

  BEGIN
    UPDATE public.project_time_entries AS entry
       SET invoice_id = v_invoice.id
      FROM public.projects AS project
     WHERE entry.id = ANY(p_entry_ids)
       AND entry.project_id = project.id
       AND project.id = p_project_id
       AND entry.invoice_id IS NULL
       AND entry.billable
       AND entry.duration_minutes IS NOT NULL
       AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
       AND entry.rate_source IS DISTINCT FROM 'none'
       AND (
         project.designer_id = auth.uid()
         OR (entry.user_id = auth.uid() AND (
           public.is_project_team_member(entry.project_id)
           OR public.is_studio_comember(project.designer_id)
         ))
         OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
       );
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'compose_project_invoice: claim: %', SQLERRM USING ERRCODE = SQLSTATE;
  END;
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'compose_project_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  IF p_billing_lines IS NOT NULL AND p_billing_lines <> '[]'::jsonb THEN
    BEGIN
      PERFORM * FROM public.add_invoice_billing_lines(v_invoice.id, p_billing_lines);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'compose_project_invoice: lines: %', SQLERRM USING ERRCODE = SQLSTATE;
    END;
  END IF;

  SELECT * INTO STRICT v_invoice FROM public.invoices WHERE id = v_invoice.id;
  RETURN v_invoice;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compose_project_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb, uuid[], jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_project_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb, uuid[], jsonb
) TO authenticated;
