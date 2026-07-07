-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00258: room_scans project linkage (Patina Field Capture — pro site scan)
--
-- Flow F of the "Patina Field Capture" iOS app lets a DESIGNER LiDAR-scan a room
-- on a site visit and attach the scan to one of their projects. room_scans already
-- carries project_id (00014) and room_id (00019 → rooms). This migration adds the
-- second project-scope linkage — project_room_id (→ project_rooms, the project's
-- scope rooms from 00066) — and a BEFORE INSERT/UPDATE routing guard that mirrors
-- field_captures_guard_routing (00233): a scan may only be routed to a project the
-- inserter can SEE and OWNS, and a project_room must belong to that project.
--
-- IDEMPOTENT (IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE trigger) per the
-- house style of the recent migrations (00233, 00082, 00019).
--
-- NOTE — project_id is re-declared with IF NOT EXISTS purely so this migration reads
-- as a self-contained "linkage" unit. It is a NO-OP: 00014 already created
-- room_scans.project_id with the identical type / FK / ON DELETE SET NULL, and its
-- index (idx_room_scans_project) already exists. project_room_id is the only
-- genuinely new column.
--
-- RLS — INTENTIONALLY NOT WIDENED. In this flow the scan is designer-OWNED
-- (room_scans.user_id = the scanning designer), and the existing owner policy
-- ("Users can manage their room scans", 00014: FOR ALL USING auth.uid() = user_id)
-- already lets the inserter read its own linked scans back. The linkage is
-- owner-authored and owner-read; project-member cross-reads are a future sharing
-- concern, not something THIS linkage needs — so no SELECT policy is added.
-- (The designer's own project is visible to the guard's lookup via 00168's
-- "Project participants can view projects": designer_id = auth.uid().)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Linkage columns ─────────────────────────────────────────────────────────
ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_room_id UUID REFERENCES project_rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN room_scans.project_room_id IS
  'Optional link to a project_rooms (00066) scope room. Nullable; room_scans_guard_routing enforces it belongs to project_id.';

CREATE INDEX IF NOT EXISTS idx_room_scans_project_room
  ON room_scans(project_room_id)
  WHERE project_room_id IS NOT NULL;

-- ── Routing guard (mirrors field_captures_guard_routing / 00233) ────────────
-- SECURITY INVOKER (the plpgsql default): the projects / project_rooms lookups run
-- under the CALLER's RLS, so a project the inserter can't see returns NOT FOUND and
-- trips the "does not exist or is not visible" branch — exactly like 00233. Two
-- deliberate adaptations from field_captures:
--   • the owner column here is user_id (field_captures used designer_id);
--   • room_scans has no organization_id, so the org-membership branch is dropped.
CREATE OR REPLACE FUNCTION room_scans_guard_routing()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_proj_designer UUID;
  v_proj_created  UUID;
  v_room_project  UUID;
BEGIN
  -- Project ownership + visibility.
  IF NEW.project_id IS NOT NULL THEN
    SELECT designer_id, created_by
      INTO v_proj_designer, v_proj_created
      FROM projects
     WHERE id = NEW.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'room_scans: project_id % does not exist or is not visible', NEW.project_id;
    END IF;

    IF v_proj_designer IS DISTINCT FROM NEW.user_id
       AND v_proj_created IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'room_scans: cannot attach a scan to a project owned by a different designer';
    END IF;
  END IF;

  -- project_room must belong to the routed project.
  IF NEW.project_room_id IS NOT NULL THEN
    SELECT project_id INTO v_room_project
      FROM project_rooms
     WHERE id = NEW.project_room_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'room_scans: project_room_id % does not exist or is not visible', NEW.project_room_id;
    END IF;

    IF NEW.project_id IS NOT NULL AND v_room_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'room_scans: project_room_id % does not belong to project_id %',
        NEW.project_room_id, NEW.project_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION room_scans_guard_routing IS
  'BEFORE INSERT/UPDATE guard: a scan may only be routed to a project the inserter can see and owns (user_id = projects.designer_id or created_by), and project_room_id must belong to project_id. Mirrors field_captures_guard_routing (00233).';

-- WHEN-gated so the guard fires ONLY when a linkage column is present/changing.
-- This keeps it off the hot resumable-upload UPDATE path (upload_progress /
-- model_url / status / mark_scan_upload_complete never touch the linkage columns),
-- and off every pre-existing client-app INSERT (which sets neither), so nothing
-- other than this pro flow's linked writes is affected. Mirrors the in-house
-- WHEN-gated room_scans trigger precedent (on_room_scan_insert, 00019).
DROP TRIGGER IF EXISTS trg_room_scans_guard_insert ON room_scans;
CREATE TRIGGER trg_room_scans_guard_insert
  BEFORE INSERT ON room_scans
  FOR EACH ROW
  WHEN (NEW.project_id IS NOT NULL OR NEW.project_room_id IS NOT NULL)
  EXECUTE FUNCTION room_scans_guard_routing();

DROP TRIGGER IF EXISTS trg_room_scans_guard_update ON room_scans;
CREATE TRIGGER trg_room_scans_guard_update
  BEFORE UPDATE ON room_scans
  FOR EACH ROW
  WHEN (
    (NEW.project_id IS NOT NULL OR NEW.project_room_id IS NOT NULL)
    AND (NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.project_room_id IS DISTINCT FROM OLD.project_room_id)
  )
  EXECUTE FUNCTION room_scans_guard_routing();

COMMIT;
