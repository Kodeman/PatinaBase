-- 00836 — Atomic saved purchasing-authorization preview.
-- Lineage: get_commercial_document_send_snapshot from 00412, grafted additively.
-- Reuse the STABLE client reader (00755); no draft-access or send-authority change.
CREATE OR REPLACE FUNCTION public.get_commercial_document_send_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_result jsonb;
  v_client jsonb;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_result := jsonb_build_object(
    'proposalId', v_proposal.id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal.id)
  );
  IF v_proposal.document_kind = 'furnishings_authorization' THEN
    v_client := public.get_client_commercial_document_bundle(p_proposal_id);
    v_result := v_result || jsonb_build_object('furnishingsPreview', jsonb_build_object(
      'proposalId', v_client #> '{document,id}',
      'projectId', v_client #> '{document,projectId}',
      'title', v_client #> '{document,title}',
      'state', v_client #> '{document,commercialState}',
      'body', jsonb_build_object(
        'totalAmountCents', v_client #> '{document,totalAmountCents}',
        'depositPercent', v_client #> '{document,depositPercent}',
        -- The shared body derives the contractual deposit from these two
        -- fingerprinted fields, never the client's invoice-backed amounts.
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'description', item->'name',
            'roomName', item->'roomName',
            'quantity', item->'quantity',
            'unit', item->'unit',
            'rooms', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'name', room->'name', 'quantity', room->'quantity', 'unit', room->'unit'
            ) ORDER BY room_order), '[]'::jsonb)
              FROM jsonb_array_elements(item->'rooms') WITH ORDINALITY AS rooms(room, room_order)),
            'clientUnitPriceCents', item->'clientUnitPriceCents',
            'clientLineTotalCents', item->'clientLineTotalCents',
            'allowance', item->>'itemType' = 'allowance',
            'currency', COALESCE(item->>'currency', 'USD')
          ) ORDER BY item_order)
          FROM jsonb_array_elements(v_client #> '{furnishings,items}')
            WITH ORDINALITY AS items(item, item_order)
        ), '[]'::jsonb)
      )
    ));
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_commercial_document_send_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_document_send_snapshot(uuid)
  TO authenticated;
