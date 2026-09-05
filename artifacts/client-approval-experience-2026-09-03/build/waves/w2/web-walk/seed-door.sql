-- Web walk r1 · the door. The seed binds no unsigned commercial instrument, so
-- the sent proposal "Aspen Loft — Stair and rail" is bound as a trade scope,
-- which is what makes it a signature gate on the threshold. LOCAL ONLY.
INSERT INTO public.project_commercial_documents
  (project_id, proposal_id, document_kind, wave_name, is_origin, created_by)
VALUES
  ('b0000000-0000-0000-0000-0000000000d1',
   'b0000000-0000-0000-0000-0000000cd102',
   'trade_scope', NULL, false,
   'a0000000-0000-0000-0000-000000000004')
ON CONFLICT (proposal_id) DO NOTHING;
SELECT d.proposal_id, d.document_kind, p.status, p.title
  FROM public.project_commercial_documents d
  JOIN public.proposals p ON p.id = d.proposal_id
 WHERE d.proposal_id = 'b0000000-0000-0000-0000-0000000cd102';
