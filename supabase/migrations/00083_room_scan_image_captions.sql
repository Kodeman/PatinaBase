-- Per-photo user captions captured in the iOS post-scan review step.
-- Mirrors `ScanManifest.PhotoEntry.userAnnotation` and is written by the
-- mobile client at upload time (Services/Sync/RoomScanSyncService.swift).
-- Nullable — most photos have no caption.
ALTER TABLE room_scan_images
    ADD COLUMN IF NOT EXISTS caption TEXT;

COMMENT ON COLUMN room_scan_images.caption IS
    'Free-form per-photo note the user entered in the iOS scan review step.';
