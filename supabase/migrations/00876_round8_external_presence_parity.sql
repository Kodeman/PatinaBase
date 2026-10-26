-- 00876 — C5 external presence safety and item concurrency authority.
-- Builds on 00875 external fulfilments and the native FF&E pricing writers.
-- Ruling #198: spec versions are optional overlays, not item edit authority.
-- This checkpoint contains the independent item-version seam only. Binding,
-- conversion and commercial writer guards remain required before submission.
ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public._ffe_bump_item_row_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._ffe_bump_item_row_version() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS zzzz_ffe_item_row_version_trg ON public.project_ffe_items;
CREATE TRIGGER zzzz_ffe_item_row_version_trg
  BEFORE UPDATE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public._ffe_bump_item_row_version();
