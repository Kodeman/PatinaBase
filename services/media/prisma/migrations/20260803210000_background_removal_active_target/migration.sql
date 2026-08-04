-- Count every vendor attempt and permit only one live request per board item
-- inside an owner/quota context. Reconcile legacy rows before adding the
-- partial unique index so deploy remains safe with in-flight production data.

ALTER TYPE svc_media.background_removal_status
  ADD VALUE IF NOT EXISTS 'FAILED_COUNTED';

UPDATE svc_media.background_removal_requests
SET
  status = 'FAILED_RELEASED',
  outcome = 'INTERNAL_FAILED',
  completed_at = COALESCE(completed_at, now())
WHERE status = 'RESERVED'
  AND reservation_expires_at <= now();

WITH ranked_active AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY quota_owner_id, board_id, item_id
      ORDER BY created_at, id
    ) AS target_rank
  FROM svc_media.background_removal_requests
  WHERE status = 'RESERVED'
)
UPDATE svc_media.background_removal_requests AS request
SET
  status = 'FAILED_RELEASED',
  outcome = 'INTERNAL_FAILED',
  completed_at = COALESCE(request.completed_at, now())
FROM ranked_active
WHERE request.id = ranked_active.id
  AND ranked_active.target_rank > 1;

CREATE UNIQUE INDEX background_removal_requests_active_target_unique
  ON svc_media.background_removal_requests (quota_owner_id, board_id, item_id)
  WHERE status = 'RESERVED';
