-- ═══════════════════════════════════════════════════════════════════════════
-- 00382 — Accept the exact next row version from already-loaded spec clients
-- Function-body lineage: 00380 → 00382
-- Reconciles: pre-00382 Designer bundles sent OLD.row_version + 1 even though
--             the trigger owns the increment. New bundles omit the field.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.spec_book_bump_spec_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ffe_item_id IS DISTINCT FROM OLD.ffe_item_id THEN
    RAISE EXCEPTION 'ffe_item_id is immutable' USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  -- Normal clients omit row_version, so NEW carries OLD here. Designer tabs
  -- loaded before the client fix send exactly OLD + 1 while filtering their
  -- UPDATE on OLD. Accept only that legacy shape; arbitrary values still fail.
  IF NEW.row_version IS DISTINCT FROM OLD.row_version
     AND NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
    RAISE EXCEPTION 'row_version is managed by the database'
      USING errcode = 'serialization_failure';
  END IF;

  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;
