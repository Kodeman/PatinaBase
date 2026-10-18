-- ═══════════════════════════════════════════════════════════════════════════
-- 00825 — Preserve non-object invoice archives and legacy snapshot-key values.
-- Archive helper lineage: 00823. Existing-row conflict repair only; fresh
-- INSERT writers, metadata classifier, authorization and grants are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._invoice_line_append_archive_snapshot(p_existing jsonb, p_new jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_result jsonb := p_existing;
  v_snapshots jsonb := '[]'::jsonb;
  v_relocation text := 'archiveSnapshotsLegacy';
  v_suffix integer := 2;
  v_key text;
  v_value jsonb;
  v_conflict boolean := false;
BEGIN
  IF jsonb_typeof(p_existing) <> 'object' THEN
    v_snapshots := jsonb_build_array(p_existing);
    v_result := jsonb_build_object('archiveSnapshots', v_snapshots);
  ELSIF p_existing ? 'archiveSnapshots' THEN
    IF jsonb_typeof(p_existing->'archiveSnapshots') = 'array' THEN
      v_snapshots := p_existing->'archiveSnapshots';
    ELSE
      WHILE p_existing ? v_relocation
         OR (jsonb_typeof(p_new) = 'object' AND p_new ? v_relocation) LOOP
        v_relocation := 'archiveSnapshotsLegacy' || v_suffix;
        v_suffix := v_suffix + 1;
      END LOOP;
      v_result := (p_existing - 'archiveSnapshots') ||
        jsonb_build_object(v_relocation, p_existing->'archiveSnapshots');
      v_result := jsonb_set(v_result, '{archiveSnapshots}', v_snapshots);
      v_conflict := true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_snapshots) AS snapshot(value)
    WHERE snapshot.value = p_new
  ) THEN
    RETURN v_result;
  END IF;

  IF jsonb_typeof(p_existing) <> 'object' OR jsonb_typeof(p_new) <> 'object' THEN
    v_conflict := true;
  ELSE
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_new) LOOP
      IF v_key = 'archiveSnapshots' AND NOT v_result ? v_key THEN
        v_conflict := true;
      ELSIF NOT v_result ? v_key THEN
        v_result := v_result || jsonb_build_object(v_key, v_value);
      ELSIF v_result->v_key IS DISTINCT FROM v_value THEN
        v_conflict := true;
      END IF;
    END LOOP;
  END IF;
  IF v_conflict THEN
    v_result := jsonb_set(v_result, '{archiveSnapshots}', v_snapshots || jsonb_build_array(p_new));
  END IF;
  RETURN v_result;
END;
$$;
