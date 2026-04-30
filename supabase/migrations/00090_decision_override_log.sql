-- Migration: 00090_decision_override_log.sql
-- Designer override flow (PRD line 123): designer marks a decision on the
-- client's behalf and records explicit consent evidence for the audit trail.

CREATE TABLE IF NOT EXISTS public.decision_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  option_id UUID REFERENCES public.client_decision_options(id) ON DELETE SET NULL,
  acted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_method TEXT NOT NULL
    CHECK (consent_method IN ('verbal', 'written', 'text_excerpt', 'email_excerpt')),
  consent_evidence TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_overrides_decision
  ON public.decision_overrides(decision_id, created_at DESC);

ALTER TABLE public.decision_overrides ENABLE ROW LEVEL SECURITY;

-- Designer (acted_by) can read & insert overrides for decisions they own.
CREATE POLICY decision_overrides_designer_select
  ON public.decision_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.designer_id = auth.uid()
    )
  );

CREATE POLICY decision_overrides_designer_insert
  ON public.decision_overrides FOR INSERT
  WITH CHECK (
    acted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.designer_id = auth.uid()
    )
  );

-- Client can read overrides on decisions addressed to them (transparency).
CREATE POLICY decision_overrides_client_select
  ON public.decision_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.client_id = auth.uid()
    )
  );

COMMENT ON TABLE public.decision_overrides IS
  'Audit log for designer override of a client decision. Each row records who acted, which option was selected, and how consent was captured (verbal note, text excerpt, etc).';
