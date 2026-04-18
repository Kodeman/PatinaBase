-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Scan upload pipeline columns + RPCs + confirm-scan-bundle RLS
-- Description: Extends room_scans with columns Phase B's iOS uploader patches
--              as artifacts arrive (bundle manifest, photos manifest, coverage
--              heatmap, per-artifact SHA256s, aggregate progress/timings).
--              Installs two RPCs used by the uploader + edge function. Ensures
--              room_scan_images RLS allows owner writes and designer-share
--              reads. Additive on top of 00077_advanced_room_scan.sql; does
--              not re-add or drop any 00077 column. Rollback notes in the
--              commit message (drop cols/indices/fns/policies).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM_SCANS — upload pipeline columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS photos_manifest_url TEXT,
  ADD COLUMN IF NOT EXISTS bundle_manifest_url TEXT,
  ADD COLUMN IF NOT EXISTS coverage_heatmap_url TEXT,
  ADD COLUMN IF NOT EXISTS artifacts_sha256 JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS upload_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upload_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upload_progress SMALLINT NOT NULL DEFAULT 0
    CHECK (upload_progress BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS upload_error TEXT,
  ADD COLUMN IF NOT EXISTS upload_attempt_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN room_scans.photos_manifest_url IS 'URL of photos_metadata.ndjson sidecar (one line per posed photo with pose + intrinsics)';
COMMENT ON COLUMN room_scans.bundle_manifest_url IS 'URL of the v3 ScanManifest.json (authoritative artifact inventory)';
COMMENT ON COLUMN room_scans.coverage_heatmap_url IS 'URL of coverage_heatmap.json produced by CoverageAnalyzer at finalize';
COMMENT ON COLUMN room_scans.artifacts_sha256 IS 'Per-artifact content hashes, keyed by ArtifactKind.rawValue. Uploader merges entries via merge_scan_artifact_sha256()';
COMMENT ON COLUMN room_scans.upload_progress IS 'Aggregate upload progress 0-100, updated on each artifact PUT';
COMMENT ON COLUMN room_scans.upload_started_at IS 'First PUT timestamp for this scan''s artifact set';
COMMENT ON COLUMN room_scans.upload_completed_at IS 'Set by mark_scan_upload_complete() once confirm-scan-bundle verifies all artifacts';
COMMENT ON COLUMN room_scans.upload_error IS 'Last terminal uploader error for debugging; cleared on successful retry';
COMMENT ON COLUMN room_scans.upload_attempt_count IS 'Monotonic retry counter incremented by the uploader on each resumed attempt';

CREATE INDEX IF NOT EXISTS idx_room_scans_upload_in_progress
  ON room_scans(user_id)
  WHERE upload_completed_at IS NULL AND status IN ('processing', 'uploading');

-- Guard against any pre-default rows. (No-op on a fresh DB.)
UPDATE room_scans SET artifacts_sha256 = '{}'::jsonb WHERE artifacts_sha256 IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM_SCAN_IMAGES — idempotent owner-only writes, owner + designer reads.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scan_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_scan_images owner insert" ON room_scan_images;
CREATE POLICY "room_scan_images owner insert"
  ON room_scan_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = scan_id AND rs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "room_scan_images owner select" ON room_scan_images;
DROP POLICY IF EXISTS "room_scan_images designer select" ON room_scan_images;
DROP POLICY IF EXISTS "room_scan_images owner or designer select" ON room_scan_images;
CREATE POLICY "room_scan_images owner or designer select"
  ON room_scan_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = scan_id AND rs.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM room_scan_associations rsa
      WHERE rsa.scan_id = room_scan_images.scan_id
        AND rsa.designer_id = auth.uid()
        AND rsa.status = 'active'
        AND (rsa.expires_at IS NULL OR rsa.expires_at > NOW())
    )
  );

DROP POLICY IF EXISTS "room_scan_images owner update" ON room_scan_images;
CREATE POLICY "room_scan_images owner update"
  ON room_scan_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = scan_id AND rs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "room_scan_images owner delete" ON room_scan_images;
CREATE POLICY "room_scan_images owner delete"
  ON room_scan_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM room_scans rs
      WHERE rs.id = scan_id AND rs.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs invoked by the iOS uploader and the confirm-scan-bundle edge function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_scan_upload_complete(p_scan_id UUID)
  RETURNS void
  LANGUAGE sql
  SECURITY INVOKER
AS $$
  UPDATE room_scans
     SET upload_completed_at = NOW(),
         upload_progress = 100,
         status = 'ready'
   WHERE id = p_scan_id
     AND user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.mark_scan_upload_complete IS 'Caller (owner) marks their scan ready. RLS via SECURITY INVOKER; auth.uid() gate inside.';

CREATE OR REPLACE FUNCTION public.merge_scan_artifact_sha256(
  p_scan_id UUID,
  p_kind TEXT,
  p_sha TEXT
)
  RETURNS void
  LANGUAGE sql
  SECURITY INVOKER
AS $$
  UPDATE room_scans
     SET artifacts_sha256 = artifacts_sha256 || jsonb_build_object(p_kind, p_sha)
   WHERE id = p_scan_id
     AND user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.merge_scan_artifact_sha256 IS 'Owner-only JSONB merge into room_scans.artifacts_sha256. p_kind is ArtifactKind.rawValue.';

GRANT EXECUTE ON FUNCTION public.mark_scan_upload_complete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_scan_artifact_sha256(UUID, TEXT, TEXT) TO authenticated;
