-- ═══════════════════════════════════════════════════════════════════════════
-- 00374 — Field Site Request loop: secure requests, guest delivery, Binder
--
-- P1 foundation for project-scoped Site Requests. Reuses project_rooms and
-- project_parties; guests never receive database credentials and can reach one
-- request only through service-role RPCs that validate a SHA-256 token hash.
-- Immutable item revisions, capture attempts, activity, and Binder approvals
-- preserve provenance. Storage objects remain at immutable paths:
--   site-requests/{request}/{item-version}/{attempt}/{file}
--
-- No stale infrastructure: scheduled work uses guarded pg_cron through the
-- 00258 Vault-backed public.invoke_edge_function bridge.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ─── Request / item spine ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_requests (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assignee_party_id          uuid NOT NULL REFERENCES public.project_parties(id) ON DELETE RESTRICT,
  assignee_name_snapshot     text,
  assignee_phone_snapshot    text,
  assignee_trade_snapshot    text,
  consent_status_snapshot    text NOT NULL DEFAULT 'not_asked'
    CHECK (consent_status_snapshot IN ('not_asked','pending','granted','opted_out')),
  status                     text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','awaiting_consent','sent','in_progress','delivered',
      'completed','closed','expired'
    )),
  note                       text,
  due_at                     timestamptz NOT NULL,
  due_context                text,
  sent_at                    timestamptz,
  closed_at                  timestamptz,
  expires_at                 timestamptz,
  due_reminder_sent_at       timestamptz,
  last_nudged_at             timestamptz,
  last_dispatched_at         timestamptz,
  unapproved_media_delete_after timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(COALESCE(note, ''))) <= 4000),
  CHECK (length(btrim(COALESCE(due_context, ''))) <= 500),
  CHECK (
    (status = 'draft' AND sent_at IS NULL)
    OR status <> 'draft'
  ),
  CHECK (
    (status IN ('closed','expired') AND closed_at IS NOT NULL)
    OR status NOT IN ('closed','expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_site_requests_project
  ON public.site_requests(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_requests_assignee_open
  ON public.site_requests(assignee_party_id, status)
  WHERE status NOT IN ('completed','closed','expired');
CREATE INDEX IF NOT EXISTS idx_site_requests_due_open
  ON public.site_requests(due_at)
  WHERE status IN ('sent','in_progress','delivered');
CREATE INDEX IF NOT EXISTS idx_site_requests_expiry_open
  ON public.site_requests(expires_at)
  WHERE status NOT IN ('completed','closed','expired') AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.site_request_items (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE CASCADE,
  client_item_id         uuid,
  sort_order             integer NOT NULL CHECK (sort_order >= 0),
  status                 text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','delivered','redo_requested','approved')),
  current_version_number integer NOT NULL DEFAULT 0 CHECK (current_version_number >= 0),
  current_version_id     uuid,
  redo_note              text,
  reopened_at            timestamptz,
  approved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, sort_order),
  UNIQUE (request_id, client_item_id),
  CHECK (
    (status = 'redo_requested' AND length(btrim(COALESCE(redo_note, ''))) > 0)
    OR status <> 'redo_requested'
  )
);

CREATE INDEX IF NOT EXISTS idx_site_request_items_request
  ON public.site_request_items(request_id, sort_order);

CREATE TABLE IF NOT EXISTS public.site_request_item_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            uuid NOT NULL REFERENCES public.site_request_items(id) ON DELETE RESTRICT,
  version_number     integer NOT NULL CHECK (version_number > 0),
  kit_code           text NOT NULL CHECK (kit_code IN ('K-01','K-02')),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  guidance           text CHECK (length(COALESCE(guidance, '')) <= 4000),
  room_id            uuid REFERENCES public.project_rooms(id) ON DELETE RESTRICT,
  room_name_snapshot text,
  configuration      jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(configuration) = 'object'),
  created_by         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, version_number)
);

ALTER TABLE public.site_request_items
  DROP CONSTRAINT IF EXISTS site_request_items_current_version_id_fkey;
ALTER TABLE public.site_request_items
  ADD CONSTRAINT site_request_items_current_version_id_fkey
  FOREIGN KEY (current_version_id)
  REFERENCES public.site_request_item_versions(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_site_request_item_versions_item
  ON public.site_request_item_versions(item_id, version_number DESC);

-- ─── Immutable capture attempts and evidence ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_deliverables (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE RESTRICT,
  item_id                uuid NOT NULL REFERENCES public.site_request_items(id) ON DELETE RESTRICT,
  item_version_id        uuid NOT NULL REFERENCES public.site_request_item_versions(id) ON DELETE RESTRICT,
  client_attempt_id      uuid NOT NULL,
  attempt_number         integer NOT NULL CHECK (attempt_number > 0),
  status                 text NOT NULL DEFAULT 'capturing'
    CHECK (status IN ('capturing','delivered')),
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  captured_by_name       text,
  captured_at            timestamptz,
  delivered_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_version_id, client_attempt_id),
  UNIQUE (item_version_id, attempt_number),
  CHECK (
    (status = 'delivered' AND delivered_at IS NOT NULL)
    OR (status = 'capturing' AND delivered_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_site_deliverables_item
  ON public.site_deliverables(item_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_site_deliverables_request
  ON public.site_deliverables(request_id, delivered_at DESC);

CREATE TABLE IF NOT EXISTS public.site_deliverable_media (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id       uuid NOT NULL REFERENCES public.site_deliverables(id) ON DELETE RESTRICT,
  client_filename      text NOT NULL CHECK (length(btrim(client_filename)) BETWEEN 1 AND 255),
  object_path          text NOT NULL UNIQUE,
  mime_type            text NOT NULL CHECK (mime_type IN (
    'image/heic','image/heif','image/jpeg','image/png','image/webp',
    'application/octet-stream'
  )),
  checksum_sha256      text NOT NULL
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  expected_size_bytes  bigint CHECK (expected_size_bytes IS NULL OR expected_size_bytes >= 0),
  received_size_bytes  bigint CHECK (received_size_bytes IS NULL OR received_size_bytes >= 0),
  storage_etag         text,
  upload_state         text NOT NULL DEFAULT 'intended'
    CHECK (upload_state IN ('intended','uploaded','processing','ready','failed','deleted')),
  received_at          timestamptz,
  deleted_at           timestamptz,
  derivatives          jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(derivatives) = 'object'),
  processing_error     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, client_filename, checksum_sha256)
);

CREATE INDEX IF NOT EXISTS idx_site_deliverable_media_delivery
  ON public.site_deliverable_media(deliverable_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_deliverable_media_state
  ON public.site_deliverable_media(upload_state)
  WHERE upload_state IN ('intended','uploaded','processing','failed');

ALTER TABLE public.site_deliverable_media
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.site_deliverable_media
  DROP CONSTRAINT IF EXISTS site_deliverable_media_upload_state_check;
ALTER TABLE public.site_deliverable_media
  ADD CONSTRAINT site_deliverable_media_upload_state_check
  CHECK (upload_state IN ('intended','uploaded','processing','ready','failed','deleted'));

CREATE TABLE IF NOT EXISTS public.site_deliverable_dimensions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id    uuid NOT NULL REFERENCES public.site_deliverables(id) ON DELETE RESTRICT,
  label             text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  value_mm          integer NOT NULL CHECK (value_mm > 0 AND value_mm <= 1000000),
  captured_by_name  text,
  captured_at       timestamptz NOT NULL,
  proof_media_id    uuid REFERENCES public.site_deliverable_media(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, label)
);

CREATE INDEX IF NOT EXISTS idx_site_deliverable_dimensions_delivery
  ON public.site_deliverable_dimensions(deliverable_id);

-- ─── Append-only Binder and request activity ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_binder_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  room_id              uuid NOT NULL REFERENCES public.project_rooms(id) ON DELETE RESTRICT,
  request_id           uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE RESTRICT,
  item_id              uuid NOT NULL REFERENCES public.site_request_items(id) ON DELETE RESTRICT,
  item_version_id      uuid NOT NULL REFERENCES public.site_request_item_versions(id) ON DELETE RESTRICT,
  deliverable_id       uuid NOT NULL UNIQUE REFERENCES public.site_deliverables(id) ON DELETE RESTRICT,
  entry_kind           text NOT NULL CHECK (entry_kind IN ('K-01','K-02')),
  payload              jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  supersedes_entry_id  uuid REFERENCES public.site_binder_entries(id) ON DELETE RESTRICT,
  approved_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at          timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (supersedes_entry_id IS NULL OR supersedes_entry_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_site_binder_entries_room
  ON public.site_binder_entries(project_id, room_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_binder_entries_item
  ON public.site_binder_entries(item_id, approved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_binder_supersedes_once
  ON public.site_binder_entries(supersedes_entry_id)
  WHERE supersedes_entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.site_request_access (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE CASCADE,
  token_hash            text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','revoked','expired')),
  expires_at            timestamptz NOT NULL,
  last_used_at          timestamptz,
  revoked_at            timestamptz,
  revoked_reason        text,
  link_dispatched_at    timestamptz,
  provider_message_id   text,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('revoked','expired') AND revoked_at IS NOT NULL)
    OR status IN ('pending','active')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_request_access_active
  ON public.site_request_access(request_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_site_request_access_expiry
  ON public.site_request_access(expires_at)
  WHERE status = 'active';

ALTER TABLE public.site_request_access ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.site_request_access
  DROP CONSTRAINT IF EXISTS site_request_access_status_check;
ALTER TABLE public.site_request_access
  ADD CONSTRAINT site_request_access_status_check
  CHECK (status IN ('pending','active','revoked','expired'));
ALTER TABLE public.site_request_access
  DROP CONSTRAINT IF EXISTS site_request_access_check;
ALTER TABLE public.site_request_access
  ADD CONSTRAINT site_request_access_check CHECK (
    (status IN ('revoked','expired') AND revoked_at IS NOT NULL)
    OR status IN ('pending','active')
  );

CREATE TABLE IF NOT EXISTS public.site_request_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE RESTRICT,
  item_id        uuid REFERENCES public.site_request_items(id) ON DELETE RESTRICT,
  deliverable_id uuid REFERENCES public.site_deliverables(id) ON DELETE RESTRICT,
  sequence_no    bigint NOT NULL CHECK (sequence_no > 0),
  event_type     text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 100),
  actor_kind     text NOT NULL CHECK (actor_kind IN ('designer','guest','system','service')),
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_label    text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  dedupe_key     text UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_site_request_events_thread
  ON public.site_request_events(request_id, sequence_no);

-- Durable dispatch work stores identifiers and retry state only. Raw guest
-- tokens are minted into memory only after a worker claims a send-ready row.
CREATE TABLE IF NOT EXISTS public.site_request_dispatch_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE RESTRICT,
  action              text NOT NULL CHECK (action IN (
    'consent-invite','send','resend','consent-granted','nudge','due-reminder'
  )),
  source_event_id     uuid REFERENCES public.site_request_events(id) ON DELETE RESTRICT,
  access_id           uuid REFERENCES public.site_request_access(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','cancelled')),
  available_at        timestamptz NOT NULL DEFAULT now(),
  claimed_at          timestamptz,
  attempt_count       integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id text,
  last_error          text,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_request_dispatch_outbox_live
  ON public.site_request_dispatch_outbox(request_id, action)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_site_request_dispatch_outbox_ready
  ON public.site_request_dispatch_outbox(available_at, created_at)
  WHERE status IN ('pending','processing');

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS site_request_dispatch_outbox_id uuid
  REFERENCES public.site_request_dispatch_outbox(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_site_request_dispatch
  ON public.sms_messages(site_request_dispatch_outbox_id, created_at DESC)
  WHERE site_request_dispatch_outbox_id IS NOT NULL;

-- Delivery notifications are separately durable and batched for a short
-- request-scoped window. A duplicate guest delivery never appends here.
CREATE TABLE IF NOT EXISTS public.site_request_delivery_notification_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.site_requests(id) ON DELETE RESTRICT,
  bucket_started_at   timestamptz NOT NULL DEFAULT now(),
  deliverable_ids     uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','cancelled')),
  available_at        timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  claimed_at          timestamptz,
  attempt_count       integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  notification_log_id uuid REFERENCES public.notification_log(id) ON DELETE SET NULL,
  last_error          text,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_request_delivery_notification_live
  ON public.site_request_delivery_notification_outbox(request_id)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_site_request_delivery_notification_ready
  ON public.site_request_delivery_notification_outbox(available_at, created_at)
  WHERE status IN ('pending','processing');

-- Current Binder state is derived. History remains in the base table.
CREATE OR REPLACE VIEW public.site_binder_current
WITH (security_invoker = true)
AS
SELECT e.*
FROM public.site_binder_entries e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.site_binder_entries newer
  WHERE newer.supersedes_entry_id = e.id
);

COMMENT ON VIEW public.site_binder_current IS
  'Derived current Site Binder entries. Base site_binder_entries is append-only; superseded history remains queryable.';

-- ─── Private immutable storage bucket ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-requests',
  'site-requests',
  false,
  52428800,
  ARRAY[
    'image/heic','image/heif','image/jpeg','image/png','image/webp',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Structural validation and immutability guards ─────────────────────────

CREATE OR REPLACE FUNCTION public._site_request_validate_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_parties pp
    WHERE pp.id = NEW.assignee_party_id
      AND pp.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'assignee party must belong to request project'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_validate_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT sr.project_id
    INTO v_project_id
  FROM public.site_request_items i
  JOIN public.site_requests sr ON sr.id = i.request_id
  WHERE i.id = NEW.item_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'site request item does not exist' USING errcode = '23503';
  END IF;

  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_rooms pr
    WHERE pr.id = NEW.room_id
      AND pr.project_id = v_project_id
  ) THEN
    RAISE EXCEPTION 'room must belong to request project' USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_immutable_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING errcode = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public._site_deliverable_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_deliverables are immutable attempts'
      USING errcode = '55000';
  END IF;

  IF OLD.request_id <> NEW.request_id
     OR OLD.item_id <> NEW.item_id
     OR OLD.item_version_id <> NEW.item_version_id
     OR OLD.client_attempt_id <> NEW.client_attempt_id
     OR OLD.attempt_number <> NEW.attempt_number
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'deliverable identity is immutable'
      USING errcode = '55000';
  END IF;

  IF OLD.status = 'delivered' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'delivered attempts are immutable'
      USING errcode = '55000';
  END IF;

  IF OLD.status = 'capturing' AND NEW.status NOT IN ('capturing','delivered') THEN
    RAISE EXCEPTION 'invalid deliverable state transition'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_media_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site deliverable media is immutable'
      USING errcode = '55000';
  END IF;

  IF OLD.deliverable_id <> NEW.deliverable_id
     OR OLD.client_filename <> NEW.client_filename
     OR OLD.object_path <> NEW.object_path
     OR OLD.mime_type <> NEW.mime_type
     OR OLD.checksum_sha256 <> NEW.checksum_sha256
     OR OLD.expected_size_bytes IS DISTINCT FROM NEW.expected_size_bytes
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'site media identity and upload intent are immutable'
      USING errcode = '55000';
  END IF;

  IF OLD.upload_state = 'intended' AND NEW.upload_state NOT IN ('intended','uploaded','failed','deleted')
     OR OLD.upload_state = 'uploaded' AND NEW.upload_state NOT IN ('uploaded','processing','ready','failed','deleted')
     OR OLD.upload_state = 'processing' AND NEW.upload_state NOT IN ('processing','ready','failed','deleted')
     OR OLD.upload_state = 'ready' AND NEW.upload_state NOT IN ('ready','deleted')
     OR OLD.upload_state = 'failed' AND NEW.upload_state NOT IN ('failed','processing','deleted')
     OR OLD.upload_state = 'deleted' AND NEW.upload_state <> 'deleted' THEN
    RAISE EXCEPTION 'invalid site media state transition'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_access_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site request access records are retained'
      USING errcode = '55000';
  END IF;
  IF OLD.request_id <> NEW.request_id
     OR OLD.token_hash <> NEW.token_hash
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'site request access identity is immutable'
      USING errcode = '55000';
  END IF;
  IF OLD.status IN ('revoked','expired') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'revoked or expired access cannot be reactivated'
      USING errcode = '23514';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'active access cannot return to pending'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_requests_validate_project_party ON public.site_requests;
CREATE TRIGGER site_requests_validate_project_party
  BEFORE INSERT OR UPDATE OF project_id, assignee_party_id
  ON public.site_requests
  FOR EACH ROW EXECUTE FUNCTION public._site_request_validate_request();

DROP TRIGGER IF EXISTS site_request_versions_validate_room ON public.site_request_item_versions;
CREATE TRIGGER site_request_versions_validate_room
  BEFORE INSERT OR UPDATE OF item_id, room_id
  ON public.site_request_item_versions
  FOR EACH ROW EXECUTE FUNCTION public._site_request_validate_version();

DROP TRIGGER IF EXISTS site_request_versions_immutable ON public.site_request_item_versions;
CREATE TRIGGER site_request_versions_immutable
  BEFORE UPDATE OR DELETE ON public.site_request_item_versions
  FOR EACH ROW EXECUTE FUNCTION public._site_request_immutable_row();

DROP TRIGGER IF EXISTS site_dimensions_immutable ON public.site_deliverable_dimensions;
CREATE TRIGGER site_dimensions_immutable
  BEFORE UPDATE OR DELETE ON public.site_deliverable_dimensions
  FOR EACH ROW EXECUTE FUNCTION public._site_request_immutable_row();

DROP TRIGGER IF EXISTS site_binder_entries_immutable ON public.site_binder_entries;
CREATE TRIGGER site_binder_entries_immutable
  BEFORE UPDATE OR DELETE ON public.site_binder_entries
  FOR EACH ROW EXECUTE FUNCTION public._site_request_immutable_row();

DROP TRIGGER IF EXISTS site_request_events_immutable ON public.site_request_events;
CREATE TRIGGER site_request_events_immutable
  BEFORE UPDATE OR DELETE ON public.site_request_events
  FOR EACH ROW EXECUTE FUNCTION public._site_request_immutable_row();

DROP TRIGGER IF EXISTS site_deliverables_immutable_attempt ON public.site_deliverables;
CREATE TRIGGER site_deliverables_immutable_attempt
  BEFORE UPDATE OR DELETE ON public.site_deliverables
  FOR EACH ROW EXECUTE FUNCTION public._site_deliverable_guard();

DROP TRIGGER IF EXISTS site_media_immutable_evidence ON public.site_deliverable_media;
CREATE TRIGGER site_media_immutable_evidence
  BEFORE UPDATE OR DELETE ON public.site_deliverable_media
  FOR EACH ROW EXECUTE FUNCTION public._site_media_guard();

DROP TRIGGER IF EXISTS site_access_immutable_identity ON public.site_request_access;
CREATE TRIGGER site_access_immutable_identity
  BEFORE UPDATE OR DELETE ON public.site_request_access
  FOR EACH ROW EXECUTE FUNCTION public._site_access_guard();

DROP TRIGGER IF EXISTS set_updated_at_site_requests ON public.site_requests;
CREATE TRIGGER set_updated_at_site_requests
  BEFORE UPDATE ON public.site_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_site_request_items ON public.site_request_items;
CREATE TRIGGER set_updated_at_site_request_items
  BEFORE UPDATE ON public.site_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_site_media ON public.site_deliverable_media;
CREATE TRIGGER set_updated_at_site_media
  BEFORE UPDATE ON public.site_deliverable_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_site_access ON public.site_request_access;
CREATE TRIGGER set_updated_at_site_access
  BEFORE UPDATE ON public.site_request_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_site_dispatch_outbox ON public.site_request_dispatch_outbox;
CREATE TRIGGER set_updated_at_site_dispatch_outbox
  BEFORE UPDATE ON public.site_request_dispatch_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at_site_delivery_notification_outbox ON public.site_request_delivery_notification_outbox;
CREATE TRIGGER set_updated_at_site_delivery_notification_outbox
  BEFORE UPDATE ON public.site_request_delivery_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS: authenticated designers read; all mutation is transactional RPC ──

ALTER TABLE public.site_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_deliverable_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_deliverable_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_binder_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_dispatch_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_request_delivery_notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_requests_designer_read ON public.site_requests;
CREATE POLICY site_requests_designer_read
  ON public.site_requests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = site_requests.project_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_request_items_designer_read ON public.site_request_items;
CREATE POLICY site_request_items_designer_read
  ON public.site_request_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests sr
    JOIN public.projects p ON p.id = sr.project_id
    WHERE sr.id = site_request_items.request_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_request_versions_designer_read ON public.site_request_item_versions;
CREATE POLICY site_request_versions_designer_read
  ON public.site_request_item_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_request_items i
    JOIN public.site_requests sr ON sr.id = i.request_id
    JOIN public.projects p ON p.id = sr.project_id
    WHERE i.id = site_request_item_versions.item_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_deliverables_designer_read ON public.site_deliverables;
CREATE POLICY site_deliverables_designer_read
  ON public.site_deliverables FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests sr
    JOIN public.projects p ON p.id = sr.project_id
    WHERE sr.id = site_deliverables.request_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_media_designer_read ON public.site_deliverable_media;
CREATE POLICY site_media_designer_read
  ON public.site_deliverable_media FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_deliverables d
    JOIN public.site_requests sr ON sr.id = d.request_id
    JOIN public.projects p ON p.id = sr.project_id
    WHERE d.id = site_deliverable_media.deliverable_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_dimensions_designer_read ON public.site_deliverable_dimensions;
CREATE POLICY site_dimensions_designer_read
  ON public.site_deliverable_dimensions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_deliverables d
    JOIN public.site_requests sr ON sr.id = d.request_id
    JOIN public.projects p ON p.id = sr.project_id
    WHERE d.id = site_deliverable_dimensions.deliverable_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_binder_designer_read ON public.site_binder_entries;
CREATE POLICY site_binder_designer_read
  ON public.site_binder_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = site_binder_entries.project_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_access_designer_read ON public.site_request_access;
CREATE POLICY site_access_designer_read
  ON public.site_request_access FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests sr
    JOIN public.projects p ON p.id = sr.project_id
    WHERE sr.id = site_request_access.request_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS site_events_designer_read ON public.site_request_events;
CREATE POLICY site_events_designer_read
  ON public.site_request_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.site_requests sr
    JOIN public.projects p ON p.id = sr.project_id
    WHERE sr.id = site_request_events.request_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS "Site request designers read immutable media" ON storage.objects;
CREATE POLICY "Site request designers read immutable media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-requests'
    AND EXISTS (
      SELECT 1
      FROM public.site_requests sr
      JOIN public.projects p ON p.id = sr.project_id
      WHERE sr.id::text = (storage.foldername(storage.objects.name))[1]
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- No authenticated INSERT/UPDATE/DELETE storage policy. Guest uploads use a
-- service-role-created signed upload URL for the exact immutable intent path.

-- ─── Internal transactional helpers ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public._site_request_designer_authorized(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.projects p
       WHERE p.id = p_project_id
         AND public.is_studio_comember(p.designer_id)
     );
$$;

CREATE OR REPLACE FUNCTION public._site_request_append_event(
  p_request_id uuid,
  p_event_type text,
  p_actor_kind text,
  p_actor_id uuid DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_item_id uuid DEFAULT NULL,
  p_deliverable_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_sequence bigint;
BEGIN
  PERFORM 1 FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.site_request_events
    WHERE dedupe_key = p_dedupe_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  SELECT COALESCE(max(sequence_no), 0) + 1
    INTO v_sequence
  FROM public.site_request_events
  WHERE request_id = p_request_id;

  INSERT INTO public.site_request_events (
    request_id, item_id, deliverable_id, sequence_no, event_type,
    actor_kind, actor_id, actor_label, payload, dedupe_key
  )
  VALUES (
    p_request_id, p_item_id, p_deliverable_id, v_sequence, p_event_type,
    p_actor_kind, p_actor_id, p_actor_label, COALESCE(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_mint_access(
  p_request_id uuid,
  p_expires_at timestamptz,
  p_created_by uuid DEFAULT NULL,
  p_reason text DEFAULT 'superseded'
)
RETURNS TABLE (access_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_access_id uuid;
BEGIN
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'access expiry must be in the future' USING errcode = '22023';
  END IF;

  -- Only abandon an earlier unacknowledged attempt. An acknowledged active
  -- link remains valid until the provider accepts its replacement.
  UPDATE public.site_request_access
  SET status = 'revoked',
      revoked_at = now(),
      revoked_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'unacknowledged retry')
  WHERE request_id = p_request_id
    AND status = 'pending';

  v_token := 'sr_' || rtrim(translate(
    encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'
  ), '=');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.site_request_access (
    request_id, token_hash, expires_at, created_by
  )
  VALUES (p_request_id, v_hash, p_expires_at, p_created_by)
  RETURNING id INTO v_access_id;

  RETURN QUERY SELECT v_access_id, v_token, p_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_dispatch_result(
  p_request_id uuid,
  p_action text,
  p_access_id uuid DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_needs_consent boolean DEFAULT false,
  p_reused boolean DEFAULT false,
  p_outbox_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'request_id', sr.id,
    'status', sr.status,
    'access_id', p_access_id,
    'token', p_token,
    'expires_at', a.expires_at,
    'needs_consent', p_needs_consent,
    'reused', p_reused,
    'outbox_id', p_outbox_id,
    'party_id', sr.assignee_party_id,
    'project_id', sr.project_id,
    'assignee_phone', sr.assignee_phone_snapshot,
    'assignee_name', sr.assignee_name_snapshot,
    'designer_name', COALESCE(dp.full_name, 'Your designer'),
    'studio_name', COALESCE(studio.name, dp.full_name, 'Patina'),
    'site_name', p.name,
    'due_at', sr.due_at,
    'due_context', sr.due_context,
    'item_count', (SELECT count(*) FROM public.site_request_items i WHERE i.request_id = sr.id),
    'action', p_action
  )
  INTO v_result
  FROM public.site_requests sr
  JOIN public.projects p ON p.id = sr.project_id
  LEFT JOIN public.profiles dp ON dp.id = p.designer_id
  LEFT JOIN public.site_request_access a ON a.id = p_access_id
  LEFT JOIN LATERAL (
    SELECT o.name
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = p.designer_id
      AND om.status = 'active'
      AND o.type = 'design_studio'
    ORDER BY (om.role = 'owner') DESC, om.created_at
    LIMIT 1
  ) studio ON true
  WHERE sr.id = p_request_id;

  RETURN v_result;
END;
$$;

-- Built-in P1 kits are versioned constants. Saved/custom kits land later.
CREATE OR REPLACE FUNCTION public.site_request_builtin_kits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object(
      'code','K-01','version',1,'kind','measure_set',
      'title','Measure set','canonical_unit','integer_mm',
      'allows_proof_photo',true,
      'configuration',jsonb_build_object(
        'precision_denominator',16,
        'allows_metric',true,
        'dimensions',jsonb_build_array(
          jsonb_build_object(
            'id','floor_to_sill','label','A · floor → sill',
            'guidance','Measure vertically from the finished floor to the sill.',
            'required',true
          ),
          jsonb_build_object(
            'id','sill_to_head','label','B · sill → head',
            'guidance','Measure vertically from the sill to the opening head.',
            'required',true
          ),
          jsonb_build_object(
            'id','run_length','label','C · run length',
            'guidance','Measure the full horizontal run shown in the diagram.',
            'required',true
          )
        )
      )
    ),
    jsonb_build_object(
      'code','K-02','version',1,'kind','detail_photos',
      'title','Detail photos','allows_skip_reason',true,
      'originals_retained',true,
      'configuration',jsonb_build_object(
        'shots',jsonb_build_array(
          jsonb_build_object(
            'id','wide_context','label','Wide context',
            'guidance','Show the detail in the full wall or room context.',
            'required',true
          ),
          jsonb_build_object(
            'id','straight_on','label','Straight on',
            'guidance','Center the detail and keep the phone level.',
            'required',true
          ),
          jsonb_build_object(
            'id','left_return','label','Left return',
            'guidance','Show the left edge, return, and nearby condition.',
            'required',true
          ),
          jsonb_build_object(
            'id','detail','label','Close detail',
            'guidance','Move close enough to show material, joint, and finish.',
            'required',true
          )
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public._site_request_enqueue_dispatch(
  p_request_id uuid,
  p_action text,
  p_source_event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  IF p_action NOT IN (
    'consent-invite','send','resend','consent-granted','nudge','due-reminder'
  ) THEN
    RAISE EXCEPTION 'unsupported dispatch action %', p_action USING errcode = '22023';
  END IF;

  SELECT id INTO v_outbox_id
  FROM public.site_request_dispatch_outbox
  WHERE request_id = p_request_id
    AND action = p_action
    AND status IN ('pending','processing')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_outbox_id IS NULL THEN
    INSERT INTO public.site_request_dispatch_outbox (
      request_id, action, source_event_id
    ) VALUES (p_request_id, p_action, p_source_event_id)
    RETURNING id INTO v_outbox_id;
  END IF;
  RETURN v_outbox_id;
END;
$$;

-- ─── Designer operations ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.site_request_create_draft(
  p_project_id uuid,
  p_assignee_party_id uuid,
  p_due_at timestamptz,
  p_due_context text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request_id uuid;
  v_item_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_ordinal bigint;
  v_room_id uuid;
  v_room_name text;
  v_sort integer;
  v_client_item_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public._site_request_designer_authorized(p_project_id) THEN
    RAISE EXCEPTION 'not authorized for project %', p_project_id
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_due_at IS NULL OR p_due_at <= now() THEN
    RAISE EXCEPTION 'due_at must be in the future' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_parties
    WHERE id = p_assignee_party_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'assignee does not belong to project' USING errcode = '23514';
  END IF;

  INSERT INTO public.site_requests (
    project_id, created_by, assignee_party_id, due_at, due_context, note
  )
  VALUES (
    p_project_id, auth.uid(), p_assignee_party_id, p_due_at,
    NULLIF(btrim(p_due_context), ''), NULLIF(btrim(p_note), '')
  )
  RETURNING id INTO v_request_id;

  FOR v_item, v_ordinal IN
    SELECT value, ordinality
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    IF COALESCE(v_item->>'kit_code', '') NOT IN ('K-01','K-02') THEN
      RAISE EXCEPTION 'unsupported P1 kit %', v_item->>'kit_code'
        USING errcode = '22023';
    END IF;
    IF length(btrim(COALESCE(v_item->>'title', ''))) = 0 THEN
      RAISE EXCEPTION 'item title is required' USING errcode = '22023';
    END IF;

    v_room_id := NULLIF(v_item->>'room_id', '')::uuid;
    v_client_item_id := COALESCE(
      NULLIF(v_item->>'client_item_id', '')::uuid,
      gen_random_uuid()
    );
    v_sort := COALESCE((v_item->>'sort_order')::integer, (v_ordinal - 1)::integer);
    SELECT name INTO v_room_name FROM public.project_rooms WHERE id = v_room_id;

    INSERT INTO public.site_request_items (
      request_id, client_item_id, sort_order
    )
    VALUES (v_request_id, v_client_item_id, v_sort)
    RETURNING id INTO v_item_id;

    INSERT INTO public.site_request_item_versions (
      item_id, version_number, kit_code, title, guidance, room_id,
      room_name_snapshot, configuration, created_by
    )
    VALUES (
      v_item_id, 1, v_item->>'kit_code', btrim(v_item->>'title'),
      NULLIF(btrim(v_item->>'guidance'), ''), v_room_id, v_room_name,
      COALESCE(
        (
          SELECT kit.value->'configuration'
          FROM jsonb_array_elements(public.site_request_builtin_kits()) AS kit(value)
          WHERE kit.value->>'code' = v_item->>'kit_code'
        ),
        '{}'::jsonb
      ) || COALESCE(v_item->'configuration', '{}'::jsonb),
      auth.uid()
    )
    RETURNING id INTO v_version_id;

    UPDATE public.site_request_items
    SET current_version_number = 1,
        current_version_id = v_version_id
    WHERE id = v_item_id;
  END LOOP;

  PERFORM public._site_request_append_event(
    v_request_id, 'draft_created', 'designer', auth.uid(), NULL,
    NULL, NULL,
    jsonb_build_object('item_count', jsonb_array_length(COALESCE(p_items, '[]'::jsonb))),
    'draft-created:' || v_request_id::text
  );
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_revise_item(
  p_item_id uuid,
  p_kit_code text,
  p_title text,
  p_guidance text DEFAULT NULL,
  p_room_id uuid DEFAULT NULL,
  p_configuration jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.site_request_items;
  v_request public.site_requests;
  v_version_id uuid;
  v_version integer;
  v_room_name text;
BEGIN
  SELECT * INTO v_item FROM public.site_request_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request item % not found', p_item_id USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_request FROM public.site_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status <> 'draft' THEN
    RAISE EXCEPTION 'only draft request items may be revised' USING errcode = '55000';
  END IF;
  IF p_kit_code NOT IN ('K-01','K-02') OR length(btrim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION 'valid kit_code and title are required' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_configuration, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'configuration must be an object' USING errcode = '22023';
  END IF;

  v_version := v_item.current_version_number + 1;
  SELECT name INTO v_room_name FROM public.project_rooms WHERE id = p_room_id;

  INSERT INTO public.site_request_item_versions (
    item_id, version_number, kit_code, title, guidance, room_id,
    room_name_snapshot, configuration, created_by
  )
  VALUES (
    p_item_id, v_version, p_kit_code, btrim(p_title),
    NULLIF(btrim(p_guidance), ''), p_room_id, v_room_name,
    COALESCE(
      (
        SELECT kit.value->'configuration'
        FROM jsonb_array_elements(public.site_request_builtin_kits()) AS kit(value)
        WHERE kit.value->>'code' = p_kit_code
      ),
      '{}'::jsonb
    ) || COALESCE(p_configuration, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_version_id;

  UPDATE public.site_request_items
  SET current_version_number = v_version,
      current_version_id = v_version_id
  WHERE id = p_item_id;

  PERFORM public._site_request_append_event(
    v_request.id, 'item_revised', 'designer', auth.uid(), NULL,
    p_item_id, NULL,
    jsonb_build_object('version_id', v_version_id, 'version_number', v_version),
    'item-version:' || v_version_id::text
  );
  RETURN v_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_send(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_party public.project_parties;
  v_expiry timestamptz;
  v_consent text;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status NOT IN ('draft','awaiting_consent') THEN
    RAISE EXCEPTION 'request in % must use resend, not send', v_request.status
      USING errcode = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.site_request_items
    WHERE request_id = p_request_id AND current_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'request must contain at least one item' USING errcode = '22023';
  END IF;

  SELECT * INTO v_party
  FROM public.project_parties
  WHERE id = v_request.assignee_party_id
    AND project_id = v_request.project_id
  FOR UPDATE;
  IF NOT FOUND OR v_party.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'assignee must have a normalized phone number'
      USING errcode = '22023';
  END IF;

  IF v_party.sms_consent_status = 'not_asked' THEN
    UPDATE public.project_parties
    SET sms_consent_status = 'pending'
    WHERE id = v_party.id;
    v_consent := 'pending';
  ELSE
    v_consent := v_party.sms_consent_status;
  END IF;

  UPDATE public.site_requests
  SET assignee_name_snapshot = v_party.display_name,
      assignee_phone_snapshot = v_party.phone_e164,
      assignee_trade_snapshot = v_party.trade,
      consent_status_snapshot = v_consent
  WHERE id = p_request_id;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(),
      last_error = 'consent_already_granted'
  WHERE request_id = p_request_id
    AND action = 'consent-invite'
    AND status IN ('pending','processing')
    AND v_consent = 'granted';

  IF v_consent <> 'granted' THEN
    UPDATE public.site_requests
    SET status = 'awaiting_consent'
    WHERE id = p_request_id;

    v_event_id := public._site_request_append_event(
      p_request_id, 'consent_requested', 'designer', auth.uid(), NULL,
      NULL, NULL,
      jsonb_build_object('party_id', v_party.id, 'consent_status', v_consent),
      'consent-requested:' || p_request_id::text
    );
    v_outbox_id := public._site_request_enqueue_dispatch(
      p_request_id, 'consent-invite', v_event_id
    );
    RETURN public._site_request_dispatch_result(
      p_request_id, 'consent-invite', NULL, NULL, true,
      v_request.status = 'awaiting_consent', v_outbox_id
    );
  END IF;

  v_expiry := COALESCE(
    p_expires_at,
    GREATEST(v_request.due_at + interval '7 days', now() + interval '7 days')
  );
  UPDATE public.site_requests
  SET consent_status_snapshot = 'granted',
      expires_at = v_expiry
  WHERE id = p_request_id;

  v_event_id := public._site_request_append_event(
    p_request_id, 'request_send_requested', 'designer', auth.uid(), NULL,
    NULL, NULL,
    jsonb_build_object('expires_at', v_expiry),
    'request-send-requested:' || p_request_id::text
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'send', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'send', NULL, NULL, false, false, v_outbox_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_resend(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_party public.project_parties;
  v_expiry timestamptz;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status IN ('draft','completed','closed','expired') THEN
    RAISE EXCEPTION 'request in % cannot be resent', v_request.status USING errcode = '55000';
  END IF;

  SELECT * INTO v_party
  FROM public.project_parties
  WHERE id = v_request.assignee_party_id
  FOR UPDATE;
  IF v_party.sms_consent_status <> 'granted' OR v_party.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'granted SMS consent and phone are required to resend'
      USING errcode = '55000';
  END IF;

  v_expiry := COALESCE(
    p_expires_at,
    GREATEST(v_request.due_at + interval '7 days', now() + interval '7 days')
  );
  UPDATE public.site_requests
  SET consent_status_snapshot = 'granted',
      assignee_name_snapshot = v_party.display_name,
      assignee_phone_snapshot = v_party.phone_e164,
      assignee_trade_snapshot = v_party.trade,
      expires_at = v_expiry
  WHERE id = p_request_id;

  v_event_id := public._site_request_append_event(
    p_request_id, 'request_resend_requested', 'designer', auth.uid(), NULL,
    NULL, NULL,
    jsonb_build_object('expires_at', v_expiry), NULL
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'resend', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'resend', NULL, NULL, false, false, v_outbox_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_dispatch_after_consent(
  p_request_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_party public.project_parties;
  v_expiry timestamptz;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF v_request.status IN ('completed','closed','expired') THEN
    RAISE EXCEPTION 'terminal request cannot dispatch' USING errcode = '55000';
  END IF;

  SELECT * INTO v_party
  FROM public.project_parties
  WHERE id = v_request.assignee_party_id
    AND project_id = v_request.project_id
  FOR UPDATE;
  IF NOT FOUND OR v_party.sms_consent_status <> 'granted' OR v_party.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'assignee has not granted SMS consent' USING errcode = '55000';
  END IF;

  v_expiry := COALESCE(
    p_expires_at,
    GREATEST(v_request.due_at + interval '7 days', now() + interval '7 days')
  );
  UPDATE public.site_requests
  SET consent_status_snapshot = 'granted',
      assignee_name_snapshot = v_party.display_name,
      assignee_phone_snapshot = v_party.phone_e164,
      assignee_trade_snapshot = v_party.trade,
      expires_at = v_expiry
  WHERE id = p_request_id;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(),
      last_error = 'consent_already_granted'
  WHERE request_id = p_request_id
    AND action = 'consent-invite'
    AND status IN ('pending','processing');

  v_event_id := public._site_request_append_event(
    p_request_id, 'consent_granted_dispatch_ready', 'service', NULL, NULL,
    NULL, NULL,
    jsonb_build_object('expires_at', v_expiry),
    'consent-dispatch-ready:' || p_request_id::text
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'consent-granted', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'consent-granted', NULL, NULL, false, false, v_outbox_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_mark_dispatched(
  p_request_id uuid,
  p_access_id uuid,
  p_provider_message_id text DEFAULT NULL,
  p_dispatched_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access public.site_request_access;
  v_idempotent boolean := false;
BEGIN
  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE id = p_access_id
    AND request_id = p_request_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active request access not found' USING errcode = 'no_data_found';
  END IF;

  IF v_access.link_dispatched_at IS NOT NULL THEN
    v_idempotent := true;
  ELSE
    UPDATE public.site_request_access
    SET link_dispatched_at = COALESCE(p_dispatched_at, now()),
        provider_message_id = NULLIF(btrim(p_provider_message_id), '')
    WHERE id = p_access_id;

    UPDATE public.site_requests
    SET last_dispatched_at = COALESCE(p_dispatched_at, now())
    WHERE id = p_request_id;

    PERFORM public._site_request_append_event(
      p_request_id, 'request_dispatched', 'service', NULL, NULL,
      NULL, NULL,
      jsonb_build_object(
        'access_id', p_access_id,
        'provider_message_id', NULLIF(btrim(p_provider_message_id), '')
      ),
      'request-dispatched:' || p_access_id::text
    );
  END IF;

  SELECT * INTO v_access FROM public.site_request_access WHERE id = p_access_id;
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'access_id', p_access_id,
    'status', v_access.status,
    'link_dispatched_at', v_access.link_dispatched_at,
    'provider_message_id', v_access.provider_message_id,
    'idempotent', v_idempotent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_claim_delivery_notification(
  p_outbox_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox public.site_request_delivery_notification_outbox;
  v_request public.site_requests;
  v_log_id uuid;
  v_count integer;
  v_title text;
  v_message text;
  v_log_status public.notification_status;
BEGIN
  SELECT * INTO v_outbox
  FROM public.site_request_delivery_notification_outbox
  WHERE id = p_outbox_id
    AND (
      (status = 'pending' AND available_at <= p_now)
      OR (status = 'processing' AND claimed_at < p_now - interval '5 minutes')
    )
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_request
  FROM public.site_requests
  WHERE id = v_outbox.request_id;
  IF v_request.status IN ('closed','expired') THEN
    UPDATE public.site_request_delivery_notification_outbox
    SET status = 'cancelled', completed_at = p_now,
        last_error = 'request_terminal'
    WHERE id = v_outbox.id;
    RETURN NULL;
  END IF;

  v_count := cardinality(v_outbox.deliverable_ids);
  v_title := 'Site Request delivery ready';
  v_message := CASE WHEN v_count = 1
    THEN '1 Site Request item is ready for review.'
    ELSE v_count::text || ' Site Request items are ready for review.'
  END;
  v_log_id := v_outbox.notification_log_id;
  IF v_log_id IS NOT NULL THEN
    SELECT status INTO v_log_status
    FROM public.notification_log WHERE id = v_log_id;
    IF v_log_status IN ('delivered','opened','clicked') THEN
      UPDATE public.site_request_delivery_notification_outbox
      SET status = 'sent', completed_at = p_now, claimed_at = NULL,
          last_error = NULL
      WHERE id = v_outbox.id;
      RETURN NULL;
    END IF;
  END IF;
  IF v_log_id IS NULL THEN
    INSERT INTO public.notification_log (
      user_id, type, channel, status, template_id, metadata
    ) VALUES (
      v_request.created_by, 'site_request_delivery_ready', 'push', 'queued',
      'site-request-delivery-ready',
      jsonb_build_object(
        'request_id', v_request.id,
        'project_id', v_request.project_id,
        'deliverable_count', v_count,
        'entity_type', 'site_request',
        'entity_id', v_request.id,
        'title', v_title,
        'message', v_message,
        'deep_link', '/work/' || v_request.project_id::text || '/site/' || v_request.id::text
      )
    ) RETURNING id INTO v_log_id;
  ELSE
    UPDATE public.notification_log
    SET status = 'sending', error = NULL,
        retry_count = v_outbox.attempt_count,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'deliverable_count', v_count,
          'title', v_title,
          'message', v_message
        )
    WHERE id = v_log_id;
  END IF;

  UPDATE public.site_request_delivery_notification_outbox
  SET status = 'processing', claimed_at = p_now,
      attempt_count = attempt_count + 1,
      notification_log_id = v_log_id, last_error = NULL
  WHERE id = v_outbox.id;

  RETURN jsonb_build_object(
    'outbox_id', v_outbox.id,
    'request_id', v_request.id,
    'user_id', v_request.created_by,
    'notification_log_id', v_log_id,
    'title', v_title,
    'body', v_message,
    'entity_type', 'site_request',
    'entity_id', v_request.id,
    'deliverable_count', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_complete_delivery_notification(
  p_outbox_id uuid,
  p_sent boolean,
  p_error text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox public.site_request_delivery_notification_outbox;
  v_retry_at timestamptz;
BEGIN
  SELECT * INTO v_outbox
  FROM public.site_request_delivery_notification_outbox
  WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery notification outbox row not found'
      USING errcode = 'no_data_found';
  END IF;
  IF v_outbox.status = 'sent' THEN
    RETURN jsonb_build_object('outbox_id', v_outbox.id, 'status', 'sent', 'idempotent', true);
  END IF;

  IF p_sent THEN
    UPDATE public.site_request_delivery_notification_outbox
    SET status = 'sent', completed_at = p_now, claimed_at = NULL,
        last_error = NULL
    WHERE id = v_outbox.id;
  ELSE
    v_retry_at := p_now + make_interval(
      mins => LEAST(60, GREATEST(2, (2 ^ LEAST(v_outbox.attempt_count, 5))::integer))
    );
    UPDATE public.site_request_delivery_notification_outbox
    SET status = 'pending', available_at = v_retry_at, claimed_at = NULL,
        last_error = left(COALESCE(NULLIF(btrim(p_error), ''), 'push_failed'), 500)
    WHERE id = v_outbox.id;
    UPDATE public.notification_log
    SET status = 'failed',
        error = left(COALESCE(NULLIF(btrim(p_error), ''), 'push_failed'), 500),
        retry_count = v_outbox.attempt_count
    WHERE id = v_outbox.notification_log_id;
  END IF;
  RETURN jsonb_build_object(
    'outbox_id', v_outbox.id,
    'status', CASE WHEN p_sent THEN 'sent' ELSE 'retry' END,
    'retry_at', CASE WHEN p_sent THEN NULL ELSE v_retry_at END,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_pending_delivery_notifications(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 25
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id
  FROM public.site_request_delivery_notification_outbox
  WHERE (status = 'pending' AND available_at <= p_now)
     OR (status = 'processing' AND claimed_at < p_now - interval '5 minutes')
  ORDER BY available_at, created_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
$$;

-- Storage cleanup is deliberately two-phase: the worker asks for immutable
-- object paths, deletes them through Storage, then confirms exact media ids.
CREATE OR REPLACE FUNCTION public.site_request_unapproved_media_cleanup_candidates(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 100
)
RETURNS TABLE (media_id uuid, bucket_id text, object_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, 'site-requests'::text, m.object_path
  FROM public.site_deliverable_media m
  JOIN public.site_deliverables d ON d.id = m.deliverable_id
  JOIN public.site_requests sr ON sr.id = d.request_id
  WHERE sr.status IN ('closed','expired')
    AND sr.unapproved_media_delete_after <= p_now
    AND m.upload_state <> 'deleted'
    AND NOT EXISTS (
      SELECT 1 FROM public.site_binder_entries be
      WHERE be.deliverable_id = d.id
    )
  ORDER BY sr.unapproved_media_delete_after, m.created_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.site_request_confirm_media_cleanup(
  p_media_ids uuid[],
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.site_deliverable_media m
  SET upload_state = 'deleted', deleted_at = p_now
  FROM public.site_deliverables d, public.site_requests sr
  WHERE m.id = ANY(COALESCE(p_media_ids, '{}'::uuid[]))
    AND d.id = m.deliverable_id
    AND sr.id = d.request_id
    AND sr.status IN ('closed','expired')
    AND sr.unapproved_media_delete_after <= p_now
    AND NOT EXISTS (
      SELECT 1 FROM public.site_binder_entries be
      WHERE be.deliverable_id = d.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_nudge(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_access public.site_request_access;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status NOT IN ('sent','in_progress','delivered') THEN
    RAISE EXCEPTION 'request in % cannot be nudged', v_request.status USING errcode = '55000';
  END IF;
  IF v_request.last_nudged_at IS NOT NULL
     AND v_request.last_nudged_at::date = current_date THEN
    RAISE EXCEPTION 'request may be nudged at most once per day' USING errcode = '55000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.site_request_dispatch_outbox
    WHERE request_id = p_request_id
      AND action = 'nudge'
      AND status IN ('pending','processing')
  ) THEN
    RAISE EXCEPTION 'request already has a pending nudge' USING errcode = '55000';
  END IF;

  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE request_id = p_request_id
    AND status = 'active'
    AND expires_at > now()
    AND link_dispatched_at IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request has no dispatched active access' USING errcode = '55000';
  END IF;

  v_event_id := public._site_request_append_event(
    p_request_id, 'nudge_requested', 'designer', auth.uid(), NULL,
    NULL, NULL,
    jsonb_build_object('note', NULLIF(btrim(p_note), ''), 'access_id', v_access.id),
    NULL
  );
  v_outbox_id := public._site_request_enqueue_dispatch(
    p_request_id, 'nudge', v_event_id
  );
  RETURN public._site_request_dispatch_result(
    p_request_id, 'nudge', v_access.id, NULL, false, false, v_outbox_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_revoke_access(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_count integer;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.site_request_access
  SET status = 'revoked',
      revoked_at = now(),
      revoked_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'designer revoked')
  WHERE request_id = p_request_id AND status IN ('pending','active');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(),
      last_error = 'access revoked by designer'
  WHERE request_id = p_request_id
    AND status IN ('pending','processing');

  IF v_count > 0 THEN
    PERFORM public._site_request_append_event(
      p_request_id, 'access_revoked', 'designer', auth.uid(), NULL,
      NULL, NULL, jsonb_build_object('reason', NULLIF(btrim(p_reason), '')), NULL
    );
  END IF;
  RETURN jsonb_build_object('request_id', p_request_id, 'revoked_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_close(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request public.site_requests;
  v_revoked integer;
BEGIN
  SELECT * INTO v_request FROM public.site_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_request.status = 'expired' THEN
    RAISE EXCEPTION 'expired request cannot be closed' USING errcode = '55000';
  END IF;

  UPDATE public.site_requests
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      unapproved_media_delete_after = COALESCE(
        unapproved_media_delete_after, now() + interval '90 days'
      )
  WHERE id = p_request_id AND status <> 'closed';

  UPDATE public.site_request_access
  SET status = 'revoked', revoked_at = now(), revoked_reason = 'request closed'
  WHERE request_id = p_request_id AND status IN ('pending','active');
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'cancelled', completed_at = now(), last_error = 'request closed'
  WHERE request_id = p_request_id AND status IN ('pending','processing');

  PERFORM public._site_request_append_event(
    p_request_id, 'request_closed', 'designer', auth.uid(), NULL,
    NULL, NULL, jsonb_build_object('revoked_access_count', v_revoked),
    'request-closed:' || p_request_id::text
  );
  RETURN jsonb_build_object(
    'request_id', p_request_id, 'status', 'closed',
    'closed_at', (SELECT closed_at FROM public.site_requests WHERE id = p_request_id),
    'revoked_access_count', v_revoked
  );
END;
$$;

-- ─── Service-only guest bootstrap / upload / delivery operations ──────────

CREATE OR REPLACE FUNCTION public._site_request_queue_delivery_notification(
  p_request_id uuid,
  p_deliverable_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  SELECT id INTO v_outbox_id
  FROM public.site_request_delivery_notification_outbox
  WHERE request_id = p_request_id
    AND status IN ('pending','processing')
  ORDER BY bucket_started_at DESC LIMIT 1 FOR UPDATE;

  IF v_outbox_id IS NULL THEN
    INSERT INTO public.site_request_delivery_notification_outbox (
      request_id, bucket_started_at, deliverable_ids, available_at
    ) VALUES (
      p_request_id, p_now, ARRAY[p_deliverable_id], p_now + interval '2 minutes'
    ) RETURNING id INTO v_outbox_id;
  ELSE
    UPDATE public.site_request_delivery_notification_outbox
    SET deliverable_ids = CASE
          WHEN p_deliverable_id = ANY(deliverable_ids) THEN deliverable_ids
          ELSE array_append(deliverable_ids, p_deliverable_id)
        END,
        available_at = GREATEST(available_at, p_now + interval '30 seconds')
    WHERE id = v_outbox_id;
  END IF;
  RETURN v_outbox_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_guest_bootstrap(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access public.site_request_access;
  v_request public.site_requests;
  v_result jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE token_hash = p_token_hash
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM public.site_requests
  WHERE id = v_access.request_id
    AND status IN ('sent','in_progress','delivered')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.site_request_access
  SET last_used_at = now()
  WHERE id = v_access.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.site_request_events
    WHERE dedupe_key = 'guest-opened:' || v_access.id::text
  ) THEN
    PERFORM public._site_request_append_event(
      v_request.id, 'guest_opened', 'guest', NULL,
      v_request.assignee_name_snapshot, NULL, NULL,
      jsonb_build_object('access_id', v_access.id),
      'guest-opened:' || v_access.id::text
    );
  END IF;

  SELECT jsonb_build_object(
    'access', jsonb_build_object(
      'id', v_access.id,
      'expires_at', v_access.expires_at
    ),
    'request', jsonb_build_object(
      'id', sr.id,
      'project_id', sr.project_id,
      'status', sr.status,
      'due_at', sr.due_at,
      'due_context', sr.due_context,
      'note', sr.note,
      'site_name', p.name,
      'designer_name', COALESCE(dp.full_name, 'Your designer'),
      'studio_name', COALESCE(studio.name, dp.full_name, 'Patina')
    ),
    'assignee', jsonb_build_object(
      'id', sr.assignee_party_id,
      'display_name', sr.assignee_name_snapshot,
      'trade', sr.assignee_trade_snapshot
    ),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'current_version_id', i.current_version_id,
          'sort_order', i.sort_order,
          'status', i.status,
          'redo_note', i.redo_note,
          'version', jsonb_build_object(
            'id', iv.id,
            'version_number', iv.version_number,
            'kit_code', iv.kit_code,
            'title', iv.title,
            'guidance', iv.guidance,
            'room_id', iv.room_id,
            'room_name', iv.room_name_snapshot,
            'configuration', iv.configuration
          ),
          'deliveries', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', d.id,
                'attempt_number', d.attempt_number,
                'status', d.status,
                'delivered_at', d.delivered_at,
                'payload', d.payload,
                'media', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'id', m.id,
                    'filename', m.client_filename,
                    'mime_type', m.mime_type,
                    'upload_state', m.upload_state,
                    'object_path', m.object_path
                  ) ORDER BY m.created_at)
                  FROM public.site_deliverable_media m
                  WHERE m.deliverable_id = d.id
                ), '[]'::jsonb)
              ) ORDER BY d.attempt_number
            )
            FROM public.site_deliverables d
            WHERE d.item_id = i.id
          ), '[]'::jsonb)
        )
        ORDER BY i.sort_order
      )
      FROM public.site_request_items i
      JOIN public.site_request_item_versions iv ON iv.id = i.current_version_id
      WHERE i.request_id = sr.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.site_requests sr
  JOIN public.projects p ON p.id = sr.project_id
  LEFT JOIN public.profiles dp ON dp.id = p.designer_id
  LEFT JOIN LATERAL (
    SELECT o.name
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = p.designer_id
      AND om.status = 'active'
      AND o.type = 'design_studio'
    ORDER BY (om.role = 'owner') DESC, om.created_at
    LIMIT 1
  ) studio ON true
  WHERE sr.id = v_request.id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_guest_create_upload(
  p_token_hash text,
  p_item_version_id uuid,
  p_client_attempt_id uuid,
  p_filename text,
  p_mime_type text,
  p_checksum_sha256 text,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access public.site_request_access;
  v_item public.site_request_items;
  v_version public.site_request_item_versions;
  v_deliverable public.site_deliverables;
  v_media public.site_deliverable_media;
  v_attempt integer;
  v_filename text;
  v_path text;
BEGIN
  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE token_hash = p_token_hash
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired site request access'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT i.* INTO v_item
  FROM public.site_request_items i
  WHERE i.current_version_id = p_item_version_id
    AND i.request_id = v_access.request_id
  FOR UPDATE;
  IF NOT FOUND OR v_item.status NOT IN ('open','redo_requested') THEN
    RAISE EXCEPTION 'item is not open for capture' USING errcode = '55000';
  END IF;
  SELECT * INTO v_version
  FROM public.site_request_item_versions
  WHERE id = p_item_version_id AND item_id = v_item.id;

  IF p_client_attempt_id IS NULL THEN
    RAISE EXCEPTION 'client attempt id is required' USING errcode = '22023';
  END IF;
  IF p_checksum_sha256 IS NULL OR lower(p_checksum_sha256) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'checksum must be lowercase SHA-256 hex' USING errcode = '22023';
  END IF;
  IF p_mime_type NOT IN (
    'image/heic','image/heif','image/jpeg','image/png','image/webp',
    'application/octet-stream'
  ) THEN
    RAISE EXCEPTION 'unsupported media type %', p_mime_type USING errcode = '22023';
  END IF;
  IF p_size_bytes IS NOT NULL AND p_size_bytes < 0 THEN
    RAISE EXCEPTION 'size must be nonnegative' USING errcode = '22023';
  END IF;

  SELECT * INTO v_deliverable
  FROM public.site_deliverables
  WHERE item_version_id = p_item_version_id
    AND client_attempt_id = p_client_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt
    FROM public.site_deliverables
    WHERE item_version_id = p_item_version_id;

    INSERT INTO public.site_deliverables (
      request_id, item_id, item_version_id, client_attempt_id, attempt_number
    )
    VALUES (
      v_access.request_id, v_item.id, p_item_version_id,
      p_client_attempt_id, v_attempt
    )
    RETURNING * INTO v_deliverable;
  ELSIF v_deliverable.status = 'delivered' THEN
    RAISE EXCEPTION 'attempt is already delivered' USING errcode = '55000';
  END IF;

  v_filename := regexp_replace(COALESCE(p_filename, ''), '[^A-Za-z0-9._-]+', '_', 'g');
  v_filename := regexp_replace(v_filename, '^\.+', '');
  IF length(v_filename) = 0 THEN
    v_filename := 'upload.bin';
  END IF;
  v_filename := left(v_filename, 180);
  v_path := v_access.request_id::text || '/' || p_item_version_id::text || '/'
    || v_deliverable.attempt_number::text || '/' || left(lower(p_checksum_sha256), 12)
    || '-' || v_filename;

  SELECT * INTO v_media
  FROM public.site_deliverable_media
  WHERE deliverable_id = v_deliverable.id
    AND client_filename = v_filename
    AND checksum_sha256 = lower(p_checksum_sha256)
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.site_deliverable_media (
      deliverable_id, client_filename, object_path, mime_type,
      checksum_sha256, expected_size_bytes
    )
    VALUES (
      v_deliverable.id, v_filename, v_path, p_mime_type,
      lower(p_checksum_sha256), p_size_bytes
    )
    RETURNING * INTO v_media;

    PERFORM public._site_request_append_event(
      v_access.request_id, 'upload_intent_created', 'guest', NULL, NULL,
      v_item.id, v_deliverable.id,
      jsonb_build_object('media_id', v_media.id, 'object_path', v_media.object_path),
      'upload-intent:' || v_media.id::text
    );
  ELSIF v_media.mime_type <> p_mime_type
        OR v_media.expected_size_bytes IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION 'idempotent upload intent metadata mismatch' USING errcode = '22023';
  END IF;

  UPDATE public.site_requests
  SET status = CASE WHEN status = 'sent' THEN 'in_progress' ELSE status END
  WHERE id = v_access.request_id;
  UPDATE public.site_request_access SET last_used_at = now() WHERE id = v_access.id;

  RETURN jsonb_build_object(
    'request_id', v_access.request_id,
    'item_id', v_item.id,
    'item_version_id', p_item_version_id,
    'deliverable_id', v_deliverable.id,
    'media_id', v_media.id,
    'attempt_number', v_deliverable.attempt_number,
    'bucket_id', 'site-requests',
    'object_path', v_media.object_path,
    'upload_state', v_media.upload_state
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_guest_ack_upload(
  p_token_hash text,
  p_media_id uuid,
  p_storage_etag text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  v_access public.site_request_access;
  v_media public.site_deliverable_media;
  v_deliverable public.site_deliverables;
  v_storage_size bigint;
  v_idempotent boolean := false;
BEGIN
  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE token_hash = p_token_hash
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired site request access'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT m.*
  INTO v_media
  FROM public.site_deliverable_media m
  JOIN public.site_deliverables d ON d.id = m.deliverable_id
  WHERE m.id = p_media_id
    AND d.request_id = v_access.request_id
  FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'media does not belong to request' USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_deliverable FROM public.site_deliverables WHERE id = v_media.deliverable_id;

  IF v_media.upload_state IN ('uploaded','processing','ready') THEN
    v_idempotent := true;
  ELSE
    SELECT NULLIF(metadata->>'size', '')::bigint
      INTO v_storage_size
    FROM storage.objects
    WHERE bucket_id = 'site-requests'
      AND name = v_media.object_path;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'storage object receipt not found' USING errcode = 'no_data_found';
    END IF;
    IF v_media.expected_size_bytes IS NOT NULL
       AND COALESCE(v_storage_size, p_size_bytes) IS DISTINCT FROM v_media.expected_size_bytes THEN
      RAISE EXCEPTION 'storage object size does not match upload intent'
        USING errcode = '22023';
    END IF;

    UPDATE public.site_deliverable_media
    SET upload_state = 'uploaded',
        received_size_bytes = COALESCE(v_storage_size, p_size_bytes),
        storage_etag = NULLIF(btrim(p_storage_etag), ''),
        received_at = now()
    WHERE id = p_media_id;

    PERFORM public._site_request_append_event(
      v_access.request_id, 'upload_received', 'guest', NULL, NULL,
      v_deliverable.item_id, v_deliverable.id,
      jsonb_build_object('media_id', p_media_id),
      'upload-received:' || p_media_id::text
    );
  END IF;

  SELECT * INTO v_media FROM public.site_deliverable_media WHERE id = p_media_id;
  RETURN jsonb_build_object(
    'media_id', v_media.id,
    'deliverable_id', v_media.deliverable_id,
    'upload_state', v_media.upload_state,
    'received_at', v_media.received_at,
    'idempotent', v_idempotent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_guest_deliver(
  p_token_hash text,
  p_item_version_id uuid,
  p_client_attempt_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dimensions jsonb DEFAULT '[]'::jsonb,
  p_captured_by_name text DEFAULT NULL,
  p_captured_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access public.site_request_access;
  v_request public.site_requests;
  v_item public.site_request_items;
  v_version public.site_request_item_versions;
  v_deliverable public.site_deliverables;
  v_attempt integer;
  v_dimension jsonb;
  v_expected jsonb;
  v_definition jsonb;
  v_submission jsonb;
  v_definition_id text;
  v_definition_label text;
  v_proof_media_id uuid;
  v_request_status text;
  v_idempotent boolean := false;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_dimensions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an object and dimensions an array'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE token_hash = p_token_hash
    AND status = 'active'
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or expired site request access'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.site_requests
  WHERE id = v_access.request_id
    AND status IN ('sent','in_progress','delivered')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request is not open for delivery' USING errcode = '55000';
  END IF;

  SELECT * INTO v_item
  FROM public.site_request_items
  WHERE request_id = v_request.id
    AND current_version_id = p_item_version_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item version is not current for this request'
      USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_version
  FROM public.site_request_item_versions
  WHERE id = p_item_version_id AND item_id = v_item.id;

  SELECT * INTO v_deliverable
  FROM public.site_deliverables
  WHERE item_version_id = p_item_version_id
    AND client_attempt_id = p_client_attempt_id
  FOR UPDATE;

  IF FOUND AND v_deliverable.status = 'delivered' THEN
    IF v_deliverable.payload IS DISTINCT FROM COALESCE(p_payload, '{}'::jsonb)
       OR (SELECT count(*) FROM public.site_deliverable_dimensions dd
           WHERE dd.deliverable_id = v_deliverable.id)
          <> jsonb_array_length(COALESCE(p_dimensions, '[]'::jsonb))
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(p_dimensions, '[]'::jsonb)) dim
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.site_deliverable_dimensions dd
           WHERE dd.deliverable_id = v_deliverable.id
             AND dd.label = btrim(dim->>'label')
             AND dd.value_mm = (dim->>'value_mm')::integer
             AND dd.proof_media_id IS NOT DISTINCT FROM NULLIF(dim->>'proof_media_id', '')::uuid
         )
       ) THEN
      RAISE EXCEPTION 'idempotency key was reused with different delivery data'
        USING errcode = '22023';
    END IF;
    v_idempotent := true;
  ELSIF FOUND AND v_item.status NOT IN ('open','redo_requested') THEN
    RAISE EXCEPTION 'item is not open for delivery' USING errcode = '55000';
  ELSIF NOT FOUND THEN
    IF v_item.status NOT IN ('open','redo_requested') THEN
      RAISE EXCEPTION 'item is not open for delivery' USING errcode = '55000';
    END IF;
    SELECT COALESCE(max(attempt_number), 0) + 1 INTO v_attempt
    FROM public.site_deliverables
    WHERE item_version_id = p_item_version_id;
    INSERT INTO public.site_deliverables (
      request_id, item_id, item_version_id, client_attempt_id, attempt_number
    )
    VALUES (
      v_request.id, v_item.id, p_item_version_id,
      p_client_attempt_id, v_attempt
    )
    RETURNING * INTO v_deliverable;
  END IF;

  IF NOT v_idempotent THEN
    IF EXISTS (
      SELECT 1 FROM public.site_deliverable_media
      WHERE deliverable_id = v_deliverable.id
        AND upload_state NOT IN ('uploaded','ready')
    ) THEN
      RAISE EXCEPTION 'all upload intents must have server receipts before delivery'
        USING errcode = '55000';
    END IF;

    IF v_version.kit_code = 'K-01' THEN
      v_expected := v_version.configuration->'dimensions';
      IF jsonb_typeof(v_expected) <> 'array'
         OR jsonb_array_length(v_expected) = 0 THEN
        RAISE EXCEPTION 'K-01 item version has no valid dimension configuration'
          USING errcode = '22023';
      END IF;
      IF jsonb_array_length(COALESCE(p_dimensions, '[]'::jsonb))
         <> jsonb_array_length(v_expected) THEN
        RAISE EXCEPTION 'K-01 requires every configured dimension exactly once'
          USING errcode = '22023';
      END IF;
      FOR v_definition IN SELECT value FROM jsonb_array_elements(v_expected)
      LOOP
        v_definition_id := CASE
          WHEN jsonb_typeof(v_definition) = 'string' THEN trim(both '"' from v_definition::text)
          ELSE NULLIF(btrim(v_definition->>'id'), '')
        END;
        v_definition_label := CASE
          WHEN jsonb_typeof(v_definition) = 'string' THEN trim(both '"' from v_definition::text)
          ELSE NULLIF(btrim(v_definition->>'label'), '')
        END;
        IF v_definition_id IS NULL OR v_definition_label IS NULL THEN
          RAISE EXCEPTION 'K-01 dimension configuration requires stable id and label'
            USING errcode = '22023';
        END IF;
        IF (
          SELECT count(*) FROM jsonb_array_elements(p_dimensions) dim
          WHERE btrim(dim->>'label') = v_definition_label
        ) <> 1 THEN
          RAISE EXCEPTION 'K-01 configured dimension % (%) is missing or duplicated',
            v_definition_id, v_definition_label USING errcode = '22023';
        END IF;
      END LOOP;
    ELSIF v_version.kit_code = 'K-02' THEN
      v_expected := v_version.configuration->'shots';
      IF jsonb_typeof(v_expected) <> 'array'
         OR jsonb_array_length(v_expected) = 0
         OR jsonb_typeof(p_payload->'shots') <> 'array'
         OR jsonb_array_length(p_payload->'shots') <> jsonb_array_length(v_expected) THEN
        RAISE EXCEPTION 'K-02 requires a media-or-skip result for every configured shot'
          USING errcode = '22023';
      END IF;
      FOR v_definition IN
        SELECT value FROM jsonb_array_elements(v_expected) WITH ORDINALITY
      LOOP
        v_definition_id := CASE
          WHEN jsonb_typeof(v_definition) = 'string' THEN NULL
          ELSE NULLIF(btrim(v_definition->>'id'), '')
        END;
        v_definition_label := CASE
          WHEN jsonb_typeof(v_definition) = 'string' THEN trim(both '"' from v_definition::text)
          ELSE NULLIF(btrim(v_definition->>'label'), '')
        END;
        IF v_definition_id IS NULL OR v_definition_label IS NULL THEN
          RAISE EXCEPTION 'K-02 shot configuration requires stable id and label'
            USING errcode = '22023';
        END IF;
        SELECT value INTO v_submission
        FROM jsonb_array_elements(p_payload->'shots') submitted(value)
        WHERE submitted.value->>'id' = v_definition_id;
        IF NOT FOUND
           OR btrim(COALESCE(v_submission->>'label', '')) <> v_definition_label THEN
          RAISE EXCEPTION 'K-02 configured shot % is missing or mislabeled', v_definition_id
            USING errcode = '22023';
        END IF;
        IF v_submission->>'status' = 'captured' THEN
          IF NULLIF(v_submission->>'media_id', '') IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.site_deliverable_media m
            WHERE m.id = (v_submission->>'media_id')::uuid
              AND m.deliverable_id = v_deliverable.id
              AND m.upload_state IN ('uploaded','ready')
          ) THEN
            RAISE EXCEPTION 'K-02 captured shot % requires its received media', v_definition_id
              USING errcode = '23514';
          END IF;
        ELSIF v_submission->>'status' = 'skipped' THEN
          IF length(btrim(COALESCE(v_submission->>'skip_note', ''))) = 0 THEN
            RAISE EXCEPTION 'K-02 skipped shot % requires a verbatim note', v_definition_id
              USING errcode = '22023';
          END IF;
        ELSE
          RAISE EXCEPTION 'K-02 shot % must be captured or skipped', v_definition_id
            USING errcode = '22023';
        END IF;
      END LOOP;
      IF EXISTS (
        SELECT 1 FROM public.site_deliverable_media m
        WHERE m.deliverable_id = v_deliverable.id
          AND m.upload_state IN ('uploaded','ready')
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'shots') shot
            WHERE shot->>'status' = 'captured'
              AND NULLIF(shot->>'media_id', '')::uuid = m.id
          )
      ) THEN
        RAISE EXCEPTION 'K-02 contains received media not mapped to a configured shot'
          USING errcode = '22023';
      END IF;
    END IF;

    FOR v_dimension IN
      SELECT value FROM jsonb_array_elements(COALESCE(p_dimensions, '[]'::jsonb))
    LOOP
      IF length(btrim(COALESCE(v_dimension->>'label', ''))) = 0
         OR (v_dimension->>'value_mm') IS NULL THEN
        RAISE EXCEPTION 'dimension label and value_mm are required'
          USING errcode = '22023';
      END IF;
      v_proof_media_id := NULLIF(v_dimension->>'proof_media_id', '')::uuid;
      IF v_proof_media_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.site_deliverable_media
        WHERE id = v_proof_media_id
          AND deliverable_id = v_deliverable.id
          AND upload_state IN ('uploaded','ready')
      ) THEN
        RAISE EXCEPTION 'proof media must be a received asset on this attempt'
          USING errcode = '23514';
      END IF;

      INSERT INTO public.site_deliverable_dimensions (
        deliverable_id, label, value_mm, captured_by_name, captured_at,
        proof_media_id
      )
      VALUES (
        v_deliverable.id, btrim(v_dimension->>'label'),
        (v_dimension->>'value_mm')::integer,
        NULLIF(btrim(p_captured_by_name), ''),
        COALESCE(p_captured_at, now()), v_proof_media_id
      );
    END LOOP;

    UPDATE public.site_deliverables
    SET status = 'delivered',
        payload = COALESCE(p_payload, '{}'::jsonb),
        captured_by_name = COALESCE(
          NULLIF(btrim(p_captured_by_name), ''),
          v_request.assignee_name_snapshot
        ),
        captured_at = COALESCE(p_captured_at, now()),
        delivered_at = now()
    WHERE id = v_deliverable.id;

    UPDATE public.site_request_items
    SET status = 'delivered'
    WHERE id = v_item.id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.site_request_items
      WHERE request_id = v_request.id
        AND status NOT IN ('delivered','approved')
    ) THEN
      v_request_status := 'delivered';
    ELSE
      v_request_status := 'in_progress';
    END IF;
    UPDATE public.site_requests SET status = v_request_status WHERE id = v_request.id;
    UPDATE public.site_request_access SET last_used_at = now() WHERE id = v_access.id;

    PERFORM public._site_request_append_event(
      v_request.id, 'item_delivered', 'guest', NULL,
      COALESCE(NULLIF(btrim(p_captured_by_name), ''), v_request.assignee_name_snapshot),
      v_item.id, v_deliverable.id,
      jsonb_build_object(
        'item_version_id', p_item_version_id,
        'attempt_number', v_deliverable.attempt_number
      ),
      'item-delivered:' || v_deliverable.id::text
    );
    BEGIN
      PERFORM public._site_request_queue_delivery_notification(
        v_request.id, v_deliverable.id, now()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'site request delivery notification enqueue failed for deliverable %: %',
        v_deliverable.id, SQLERRM;
    END;
    SELECT * INTO v_deliverable FROM public.site_deliverables WHERE id = v_deliverable.id;
  ELSE
    SELECT status INTO v_request_status FROM public.site_requests WHERE id = v_request.id;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'item_id', v_item.id,
    'item_version_id', p_item_version_id,
    'deliverable_id', v_deliverable.id,
    'attempt_number', v_deliverable.attempt_number,
    'item_status', (SELECT status FROM public.site_request_items WHERE id = v_item.id),
    'request_status', (SELECT status FROM public.site_requests WHERE id = v_request.id),
    'delivered_at', v_deliverable.delivered_at,
    'idempotent', v_idempotent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_approve_item(
  p_item_id uuid,
  p_deliverable_id uuid,
  p_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.site_request_items;
  v_request public.site_requests;
  v_version public.site_request_item_versions;
  v_deliverable public.site_deliverables;
  v_room_id uuid;
  v_prior_entry_id uuid;
  v_entry_id uuid;
  v_approved_at timestamptz;
  v_request_status text;
  v_idempotent boolean := false;
BEGIN
  SELECT * INTO v_item FROM public.site_request_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request item % not found', p_item_id USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_request FROM public.site_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_version
  FROM public.site_request_item_versions
  WHERE id = v_item.current_version_id AND item_id = v_item.id;
  SELECT * INTO v_deliverable
  FROM public.site_deliverables
  WHERE id = p_deliverable_id
    AND request_id = v_request.id
    AND item_id = v_item.id
    AND item_version_id = v_item.current_version_id
    AND status = 'delivered'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivered current-version attempt not found'
      USING errcode = 'no_data_found';
  END IF;

  SELECT id, approved_at, supersedes_entry_id
    INTO v_entry_id, v_approved_at, v_prior_entry_id
  FROM public.site_binder_entries
  WHERE deliverable_id = p_deliverable_id;
  IF FOUND THEN
    v_idempotent := true;
  ELSE
    IF v_request.status IN ('closed', 'expired') THEN
      RAISE EXCEPTION 'request in % cannot accept a new approval', v_request.status
        USING errcode = '55000';
    END IF;
    IF v_item.status <> 'delivered' THEN
      RAISE EXCEPTION 'item in % cannot be approved', v_item.status USING errcode = '55000';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.site_deliverable_media media
      WHERE media.deliverable_id = v_deliverable.id
        AND (media.deleted_at IS NOT NULL OR media.upload_state = 'deleted')
    ) THEN
      RAISE EXCEPTION 'delivery evidence was already removed and cannot be approved'
        USING errcode = '55000';
    END IF;
    v_room_id := COALESCE(p_room_id, v_version.room_id);
    IF v_room_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.project_rooms
      WHERE id = v_room_id AND project_id = v_request.project_id
    ) THEN
      RAISE EXCEPTION 'approval requires a room on the request project'
        USING errcode = '23514';
    END IF;

    SELECT current_entry.id INTO v_prior_entry_id
    FROM public.site_binder_entries current_entry
    WHERE current_entry.item_id = v_item.id
      AND NOT EXISTS (
        SELECT 1 FROM public.site_binder_entries newer
        WHERE newer.supersedes_entry_id = current_entry.id
      )
    ORDER BY current_entry.approved_at DESC
    LIMIT 1;

    INSERT INTO public.site_binder_entries (
      project_id, room_id, request_id, item_id, item_version_id,
      deliverable_id, entry_kind, payload, supersedes_entry_id, approved_by
    )
    VALUES (
      v_request.project_id, v_room_id, v_request.id, v_item.id, v_version.id,
      v_deliverable.id, v_version.kit_code,
      jsonb_build_object(
        'title', v_version.title,
        'guidance', v_version.guidance,
        'configuration', v_version.configuration,
        'delivery_payload', v_deliverable.payload,
        'dimensions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', dd.id,
            'label', dd.label,
            'value_mm', dd.value_mm,
            'captured_by_name', dd.captured_by_name,
            'captured_at', dd.captured_at,
            'proof_media_id', dd.proof_media_id
          ) ORDER BY dd.label)
          FROM public.site_deliverable_dimensions dd
          WHERE dd.deliverable_id = v_deliverable.id
        ), '[]'::jsonb),
        'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', m.id,
            'object_path', m.object_path,
            'mime_type', m.mime_type,
            'checksum_sha256', m.checksum_sha256,
            'upload_state', m.upload_state,
            'derivatives', m.derivatives
          ) ORDER BY m.created_at)
          FROM public.site_deliverable_media m
          WHERE m.deliverable_id = v_deliverable.id
        ), '[]'::jsonb),
        'provenance', jsonb_build_object(
          'assignee_name', v_request.assignee_name_snapshot,
          'assignee_phone', v_request.assignee_phone_snapshot,
          'captured_by_name', v_deliverable.captured_by_name,
          'captured_at', v_deliverable.captured_at,
          'delivered_at', v_deliverable.delivered_at
        )
      ),
      v_prior_entry_id, auth.uid()
    )
    RETURNING id, approved_at INTO v_entry_id, v_approved_at;

    UPDATE public.site_request_items
    SET status = 'approved', approved_at = v_approved_at
    WHERE id = v_item.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.site_request_items
      WHERE request_id = v_request.id AND status <> 'approved'
    ) THEN
      v_request_status := 'completed';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.site_request_items
      WHERE request_id = v_request.id AND status NOT IN ('delivered','approved')
    ) THEN
      v_request_status := 'delivered';
    ELSE
      v_request_status := 'in_progress';
    END IF;
    UPDATE public.site_requests SET status = v_request_status WHERE id = v_request.id;

    PERFORM public._site_request_append_event(
      v_request.id, 'item_approved', 'designer', auth.uid(), NULL,
      v_item.id, v_deliverable.id,
      jsonb_build_object(
        'binder_entry_id', v_entry_id,
        'room_id', v_room_id,
        'supersedes_entry_id', v_prior_entry_id
      ),
      'item-approved:' || v_deliverable.id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'deliverable_id', v_deliverable.id,
    'binder_entry_id', v_entry_id,
    'supersedes_entry_id', v_prior_entry_id,
    'request_status', (SELECT status FROM public.site_requests WHERE id = v_request.id),
    'approved_at', v_approved_at,
    'idempotent', v_idempotent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_redo_item(
  p_item_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.site_request_items;
  v_request public.site_requests;
  v_reopened_at timestamptz := now();
BEGIN
  IF length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'redo note is required verbatim' USING errcode = '22023';
  END IF;
  IF length(p_note) > 4000 THEN
    RAISE EXCEPTION 'redo note is too long' USING errcode = '22023';
  END IF;

  SELECT * INTO v_item FROM public.site_request_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site request item % not found', p_item_id USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_request FROM public.site_requests WHERE id = v_item.request_id FOR UPDATE;
  IF NOT public._site_request_designer_authorized(v_request.project_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_item.status NOT IN ('delivered','approved') THEN
    RAISE EXCEPTION 'only delivered or approved items may be reopened'
      USING errcode = '55000';
  END IF;
  IF v_request.status IN ('closed','expired') THEN
    RAISE EXCEPTION 'terminal request cannot be reopened' USING errcode = '55000';
  END IF;

  UPDATE public.site_request_items
  SET status = 'redo_requested',
      redo_note = p_note,
      reopened_at = v_reopened_at,
      approved_at = NULL
  WHERE id = p_item_id;
  UPDATE public.site_requests SET status = 'in_progress' WHERE id = v_request.id;

  PERFORM public._site_request_append_event(
    v_request.id, 'item_redo_requested', 'designer', auth.uid(), NULL,
    p_item_id, NULL,
    jsonb_build_object('note', p_note),
    NULL
  );
  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'request_id', v_request.id,
    'status', 'redo_requested',
    'redo_note', p_note,
    'reopened_at', v_reopened_at
  );
END;
$$;

-- ─── Dispatch bookkeeping, expiry, due reminder, consent bridge ───────────

CREATE OR REPLACE FUNCTION public._site_request_safe_dispatch_error(p_error text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE NULLIF(btrim(COALESCE(p_error, '')), '')
    WHEN 'quiet_hours' THEN 'quiet_hours'
    WHEN 'no_phone_number' THEN 'no_phone_number'
    WHEN 'opted_out' THEN 'opted_out'
    WHEN 'not_consented' THEN 'not_consented'
    WHEN 'not_invitable' THEN 'not_invitable'
    WHEN 'empty_body' THEN 'empty_body'
    WHEN 'twilio_not_configured' THEN 'twilio_not_configured'
    WHEN 'sms_dispatch_error' THEN 'sms_dispatch_error'
    WHEN 'sms_provider_error' THEN 'sms_provider_error'
    WHEN 'dispatch_token_missing' THEN 'dispatch_token_missing'
    WHEN 'request_terminal' THEN 'request_terminal'
    WHEN 'no_dispatched_access' THEN 'no_dispatched_access'
    ELSE 'dispatch_error'
  END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_safe_provider_message_id(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(p_value, '')) ~ '^[A-Za-z0-9_-]{1,100}$'
      THEN btrim(p_value)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_claim_dispatch(
  p_outbox_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_outbox public.site_request_dispatch_outbox;
  v_request public.site_requests;
  v_access public.site_request_access;
  v_access_id uuid;
  v_token text;
  v_expiry timestamptz;
  v_result jsonb;
  v_note text;
BEGIN
  SELECT * INTO v_outbox
  FROM public.site_request_dispatch_outbox
  WHERE id = p_outbox_id
    AND (
      (status = 'pending' AND available_at <= p_now)
      OR (status = 'processing' AND claimed_at < p_now - interval '5 minutes')
    )
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_request FROM public.site_requests
  WHERE id = v_outbox.request_id FOR UPDATE;
  IF v_request.status IN ('completed','closed','expired') THEN
    UPDATE public.site_request_dispatch_outbox
    SET status = 'cancelled', completed_at = p_now,
        last_error = 'request_terminal'
    WHERE id = v_outbox.id;
    RETURN NULL;
  END IF;

  UPDATE public.site_request_dispatch_outbox
  SET status = 'processing', claimed_at = p_now,
      attempt_count = attempt_count + 1, last_error = NULL
  WHERE id = v_outbox.id
  RETURNING * INTO v_outbox;

  IF v_outbox.action IN ('send','resend','consent-granted') THEN
    v_expiry := COALESCE(
      v_request.expires_at,
      GREATEST(v_request.due_at + interval '7 days', p_now + interval '7 days')
    );
    SELECT m.access_id, m.token, m.expires_at
      INTO v_access_id, v_token, v_expiry
    FROM public._site_request_mint_access(
      v_request.id, v_expiry, v_request.created_by,
      'unacknowledged dispatch retry'
    ) m;
    UPDATE public.site_request_dispatch_outbox
    SET access_id = v_access_id WHERE id = v_outbox.id;
  ELSIF v_outbox.action IN ('nudge','due-reminder') THEN
    SELECT * INTO v_access
    FROM public.site_request_access
    WHERE request_id = v_request.id
      AND status = 'active'
      AND expires_at > p_now
      AND link_dispatched_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
      UPDATE public.site_request_dispatch_outbox
      SET status = 'cancelled', completed_at = p_now,
          last_error = 'no_dispatched_access'
      WHERE id = v_outbox.id;
      RETURN NULL;
    END IF;
    v_access_id := v_access.id;
  END IF;

  IF v_outbox.source_event_id IS NOT NULL THEN
    SELECT payload->>'note' INTO v_note
    FROM public.site_request_events WHERE id = v_outbox.source_event_id;
  END IF;

  v_result := public._site_request_dispatch_result(
    v_request.id, v_outbox.action, v_access_id, v_token,
    v_outbox.action = 'consent-invite', false, v_outbox.id
  );
  RETURN v_result || jsonb_build_object(
    'dispatch_note', v_note,
    'attempt_count', v_outbox.attempt_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_complete_dispatch(
  p_outbox_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox public.site_request_dispatch_outbox;
  v_access public.site_request_access;
  v_retry_at timestamptz;
  v_safe_error text;
  v_provider_message_id text;
BEGIN
  IF p_status NOT IN ('sent','retry','cancelled') THEN
    RAISE EXCEPTION 'dispatch completion must be sent, retry, or cancelled'
      USING errcode = '22023';
  END IF;
  SELECT * INTO v_outbox FROM public.site_request_dispatch_outbox
  WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch outbox row not found' USING errcode = 'no_data_found';
  END IF;
  v_safe_error := public._site_request_safe_dispatch_error(p_error);
  v_provider_message_id := public._site_request_safe_provider_message_id(
    p_provider_message_id
  );
  IF v_outbox.status = 'sent' THEN
    RETURN jsonb_build_object(
      'outbox_id', v_outbox.id, 'status', 'sent', 'idempotent', true
    );
  END IF;
  IF v_outbox.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'outbox_id', v_outbox.id, 'status', 'cancelled', 'idempotent', true
    );
  END IF;

  IF p_status = 'sent' THEN
    IF v_outbox.action IN ('send','resend','consent-granted') THEN
      SELECT * INTO v_access FROM public.site_request_access
      WHERE id = v_outbox.access_id
        AND request_id = v_outbox.request_id
        AND status = 'pending'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'pending access for dispatch not found' USING errcode = 'no_data_found';
      END IF;

      UPDATE public.site_request_access
      SET status = 'revoked', revoked_at = p_now,
          revoked_reason = 'superseded by acknowledged dispatch'
      WHERE request_id = v_outbox.request_id
        AND status = 'active'
        AND id <> v_access.id;
      UPDATE public.site_request_access a
      SET status = 'revoked', revoked_at = p_now,
          revoked_reason = 'superseded dispatch work'
      FROM public.site_request_dispatch_outbox o
      WHERE o.request_id = v_outbox.request_id
        AND o.id <> v_outbox.id
        AND o.action IN ('send','resend','consent-granted')
        AND o.status IN ('pending','processing')
        AND a.id = o.access_id
        AND a.status = 'pending';
      UPDATE public.site_request_dispatch_outbox
      SET status = 'cancelled', completed_at = p_now,
          last_error = 'superseded by acknowledged dispatch'
      WHERE request_id = v_outbox.request_id
        AND id <> v_outbox.id
        AND action IN ('send','resend','consent-granted')
        AND status IN ('pending','processing');
      UPDATE public.site_request_access
      SET status = 'active', link_dispatched_at = p_now,
          provider_message_id = v_provider_message_id
      WHERE id = v_access.id;
      UPDATE public.site_requests
      SET status = CASE
            WHEN status IN ('draft','awaiting_consent') THEN 'sent'
            ELSE status
          END,
          sent_at = COALESCE(sent_at, p_now),
          last_dispatched_at = p_now
      WHERE id = v_outbox.request_id;
    ELSIF v_outbox.action = 'nudge' THEN
      UPDATE public.site_requests SET last_nudged_at = p_now
      WHERE id = v_outbox.request_id;
    ELSIF v_outbox.action = 'due-reminder' THEN
      UPDATE public.site_requests SET due_reminder_sent_at = p_now
      WHERE id = v_outbox.request_id;
    END IF;

    UPDATE public.site_request_dispatch_outbox
    SET status = 'sent', completed_at = p_now, claimed_at = NULL,
        provider_message_id = v_provider_message_id,
        last_error = NULL
    WHERE id = v_outbox.id;
    PERFORM public._site_request_append_event(
      v_outbox.request_id, 'dispatch_sent', 'service', NULL, NULL,
      NULL, NULL,
      jsonb_build_object(
        'action', v_outbox.action,
        'outbox_id', v_outbox.id,
        'access_id', v_outbox.access_id,
        'provider_message_id', v_provider_message_id
      ),
      'dispatch-sent:' || v_outbox.id::text
    );
    RETURN jsonb_build_object(
      'outbox_id', v_outbox.id, 'request_id', v_outbox.request_id,
      'status', 'sent', 'idempotent', false
    );
  END IF;

  IF v_outbox.access_id IS NOT NULL THEN
    UPDATE public.site_request_access
    SET status = 'revoked', revoked_at = p_now,
        revoked_reason = v_safe_error
    WHERE id = v_outbox.access_id AND status = 'pending';
  END IF;

  IF p_status = 'cancelled' THEN
    UPDATE public.site_request_dispatch_outbox
    SET status = 'cancelled', completed_at = p_now, claimed_at = NULL,
        last_error = v_safe_error
    WHERE id = v_outbox.id;
  ELSE
    v_retry_at := p_now + make_interval(
      mins => LEAST(60, GREATEST(2, (2 ^ LEAST(v_outbox.attempt_count, 5))::integer))
    );
    UPDATE public.site_request_dispatch_outbox
    SET status = 'pending', available_at = v_retry_at, claimed_at = NULL,
        access_id = NULL, last_error = v_safe_error
    WHERE id = v_outbox.id;
    PERFORM public._site_request_append_event(
      v_outbox.request_id, 'dispatch_retry_scheduled', 'service', NULL, NULL,
      NULL, NULL,
      jsonb_build_object(
        'action', v_outbox.action, 'outbox_id', v_outbox.id,
        'attempt', v_outbox.attempt_count, 'retry_at', v_retry_at,
        'error', v_safe_error
      ),
      'dispatch-retry:' || v_outbox.id::text || ':' || v_outbox.attempt_count::text
    );
  END IF;
  RETURN jsonb_build_object(
    'outbox_id', v_outbox.id, 'request_id', v_outbox.request_id,
    'status', p_status,
    'retry_at', CASE WHEN p_status = 'retry' THEN v_retry_at ELSE NULL END,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_pending_dispatches(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 25
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id
  FROM public.site_request_dispatch_outbox
  WHERE (
    status = 'pending' AND available_at <= p_now
  ) OR (
    status = 'processing' AND claimed_at < p_now - interval '5 minutes'
  )
  ORDER BY available_at, created_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
$$;

-- Compatibility shim for the pre-outbox Edge contract. New callers complete
-- by outbox id; older probes that retained an access id still finalize safely.
CREATE OR REPLACE FUNCTION public.site_request_mark_dispatched(
  p_request_id uuid,
  p_access_id uuid,
  p_provider_message_id text DEFAULT NULL,
  p_dispatched_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  SELECT id INTO v_outbox_id
  FROM public.site_request_dispatch_outbox
  WHERE request_id = p_request_id AND access_id = p_access_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_outbox_id IS NULL THEN
    RAISE EXCEPTION 'dispatch outbox row for access not found' USING errcode = 'no_data_found';
  END IF;
  RETURN public.site_request_complete_dispatch(
    v_outbox_id, 'sent', p_provider_message_id, NULL,
    COALESCE(p_dispatched_at, now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_dispatch_context(
  p_request_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access public.site_request_access;
BEGIN
  SELECT * INTO v_access
  FROM public.site_request_access
  WHERE request_id = p_request_id
    AND status = 'active'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN public._site_request_dispatch_result(
    p_request_id, p_action, v_access.id, NULL, false, true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_record_dispatch(
  p_request_id uuid,
  p_action text,
  p_provider_message_id text DEFAULT NULL,
  p_status text DEFAULT 'sent',
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_key text;
  v_provider_message_id text;
BEGIN
  IF p_status NOT IN ('sent','failed','skipped') THEN
    RAISE EXCEPTION 'dispatch status must be sent, failed, or skipped'
      USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_requests WHERE id = p_request_id) THEN
    RAISE EXCEPTION 'site request % not found', p_request_id USING errcode = 'no_data_found';
  END IF;

  v_provider_message_id := public._site_request_safe_provider_message_id(
    p_provider_message_id
  );

  v_key := CASE
    WHEN v_provider_message_id IS NOT NULL
      THEN 'dispatch-provider:' || v_provider_message_id
    WHEN p_action = 'due-reminder'
      THEN 'dispatch-due:' || p_request_id::text
    ELSE NULL
  END;
  v_event_id := public._site_request_append_event(
    p_request_id, 'dispatch_' || p_status, 'service', NULL, NULL,
    NULL, NULL,
    jsonb_build_object(
      'action', p_action,
      'provider_message_id', v_provider_message_id,
      'error', public._site_request_safe_dispatch_error(p_error)
    ),
    v_key
  );
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'action', p_action,
    'status', p_status,
    'event_id', v_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.site_request_process_lifecycle(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
  v_expired_count integer := 0;
  v_due jsonb := '[]'::jsonb;
  v_context jsonb;
  v_access_id uuid;
  v_event_id uuid;
  v_outbox_id uuid;
BEGIN
  FOR v_request IN
    SELECT id
    FROM public.site_requests
    WHERE expires_at IS NOT NULL
      AND expires_at <= p_now
      AND status NOT IN ('completed','closed','expired')
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.site_requests
    SET status = 'expired',
        closed_at = p_now,
        unapproved_media_delete_after = p_now + interval '90 days'
    WHERE id = v_request.id;
    UPDATE public.site_request_access
    SET status = 'expired',
        revoked_at = p_now,
        revoked_reason = 'request expired'
    WHERE request_id = v_request.id AND status IN ('pending','active');
    UPDATE public.site_request_dispatch_outbox
    SET status = 'cancelled', completed_at = p_now,
        last_error = 'request expired'
    WHERE request_id = v_request.id AND status IN ('pending','processing');
    PERFORM public._site_request_append_event(
      v_request.id, 'request_expired', 'system', NULL, NULL,
      NULL, NULL, jsonb_build_object('expired_at', p_now),
      'request-expired:' || v_request.id::text
    );
    v_expired_count := v_expired_count + 1;
  END LOOP;

  FOR v_request IN
    SELECT id
    FROM public.site_requests
    WHERE due_reminder_sent_at IS NULL
      AND due_at > p_now
      AND due_at <= p_now + interval '24 hours'
      AND status IN ('sent','in_progress','delivered')
    ORDER BY due_at
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT id INTO v_access_id
    FROM public.site_request_access
    WHERE request_id = v_request.id
      AND status = 'active'
      AND expires_at > p_now
      AND link_dispatched_at IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_access_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.site_request_dispatch_outbox o
      WHERE o.request_id = v_request.id
        AND o.action = 'due-reminder'
        AND o.status IN ('pending','processing','sent')
    ) THEN
      v_event_id := public._site_request_append_event(
        v_request.id, 'due_reminder_ready', 'system', NULL, NULL,
        NULL, NULL, jsonb_build_object('ready_at', p_now),
        'due-reminder:' || v_request.id::text
      );
      v_outbox_id := public._site_request_enqueue_dispatch(
        v_request.id, 'due-reminder', v_event_id
      );
      v_context := public._site_request_dispatch_result(
        v_request.id, 'due-reminder', v_access_id, NULL, false, false, v_outbox_id
      );
      v_due := v_due || jsonb_build_array(v_context);
    END IF;
    v_access_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'expired_count', v_expired_count,
    'due_reminders', v_due
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._site_request_consent_granted_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request record;
BEGIN
  IF NEW.sms_consent_status <> 'granted'
     OR OLD.sms_consent_status = 'granted' THEN
    RETURN NEW;
  END IF;

  FOR v_request IN
    SELECT id
    FROM public.site_requests
    WHERE assignee_party_id = NEW.id
      AND status = 'awaiting_consent'
    ORDER BY created_at
  LOOP
    BEGIN
      PERFORM public.invoke_edge_function(
        'site-request-dispatch',
        jsonb_build_object(
          'action', 'consent-granted',
          'request_id', v_request.id,
          'party_id', NEW.id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'site request consent dispatch failed for request %: %',
        v_request.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_request_consent_granted_dispatch
  ON public.project_parties;
CREATE TRIGGER site_request_consent_granted_dispatch
  AFTER UPDATE OF sms_consent_status ON public.project_parties
  FOR EACH ROW
  WHEN (
    OLD.sms_consent_status IS DISTINCT FROM NEW.sms_consent_status
    AND NEW.sms_consent_status = 'granted'
  )
  EXECUTE FUNCTION public._site_request_consent_granted_dispatch();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'site-request-lifecycle') THEN
    PERFORM cron.unschedule('site-request-lifecycle');
  END IF;
END $$;
SELECT cron.schedule(
  'site-request-lifecycle',
  '*/15 * * * *',
  $$SELECT public.invoke_edge_function(
    'site-request-dispatch',
    '{"action":"lifecycle"}'::jsonb
  );$$
);

DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Field Site Request P1 (00374): site-request-lifecycle every 15 minutes -> invoke_edge_function site-request-dispatch action=lifecycle, which calls site_request_process_lifecycle for expiry and once-only due reminders. Existing Agent OS, fulfillment, Aesthete, scan, and earlier jobs are unchanged.'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- ─── Explicit ACLs ─────────────────────────────────────────────────────────

REVOKE ALL ON TABLE public.site_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_item_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_deliverables FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_deliverable_media FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_deliverable_dimensions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_binder_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_dispatch_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_request_delivery_notification_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_binder_current FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.site_requests TO authenticated;
GRANT SELECT ON TABLE public.site_request_items TO authenticated;
GRANT SELECT ON TABLE public.site_request_item_versions TO authenticated;
GRANT SELECT ON TABLE public.site_deliverables TO authenticated;
GRANT SELECT ON TABLE public.site_deliverable_media TO authenticated;
GRANT SELECT ON TABLE public.site_deliverable_dimensions TO authenticated;
GRANT SELECT ON TABLE public.site_binder_entries TO authenticated;
GRANT SELECT ON TABLE public.site_request_access TO authenticated;
GRANT SELECT ON TABLE public.site_request_events TO authenticated;
GRANT SELECT ON TABLE public.site_binder_current TO authenticated;

GRANT ALL ON TABLE public.site_requests TO service_role;
GRANT ALL ON TABLE public.site_request_items TO service_role;
GRANT ALL ON TABLE public.site_request_item_versions TO service_role;
GRANT ALL ON TABLE public.site_deliverables TO service_role;
GRANT ALL ON TABLE public.site_deliverable_media TO service_role;
GRANT ALL ON TABLE public.site_deliverable_dimensions TO service_role;
GRANT ALL ON TABLE public.site_binder_entries TO service_role;
GRANT ALL ON TABLE public.site_request_access TO service_role;
GRANT ALL ON TABLE public.site_request_events TO service_role;
GRANT ALL ON TABLE public.site_request_dispatch_outbox TO service_role;
GRANT ALL ON TABLE public.site_request_delivery_notification_outbox TO service_role;
GRANT SELECT ON TABLE public.site_binder_current TO service_role;

REVOKE ALL ON FUNCTION public._site_request_validate_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_validate_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_immutable_row() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_deliverable_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_media_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_access_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_designer_authorized(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_append_event(uuid,text,text,uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_mint_access(uuid,timestamptz,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_dispatch_result(uuid,text,uuid,text,boolean,boolean,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_enqueue_dispatch(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_queue_delivery_notification(uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_safe_dispatch_error(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_safe_provider_message_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._site_request_consent_granted_dispatch() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.site_request_builtin_kits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_builtin_kits() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.site_request_create_draft(uuid,uuid,timestamptz,text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_revise_item(uuid,text,text,text,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_send(uuid,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_resend(uuid,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_nudge(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_revoke_access(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_close(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_approve_item(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.site_request_redo_item(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.site_request_create_draft(uuid,uuid,timestamptz,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_revise_item(uuid,text,text,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_send(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_resend(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_nudge(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_revoke_access(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_approve_item(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.site_request_redo_item(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.site_request_guest_bootstrap(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_guest_create_upload(text,uuid,uuid,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_guest_ack_upload(text,uuid,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_guest_deliver(text,uuid,uuid,jsonb,jsonb,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_dispatch_after_consent(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_mark_dispatched(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_dispatch_context(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_record_dispatch(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_process_lifecycle(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_claim_dispatch(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_complete_dispatch(uuid,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_pending_dispatches(timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_claim_delivery_notification(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_complete_delivery_notification(uuid,boolean,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_pending_delivery_notifications(timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_unapproved_media_cleanup_candidates(timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_request_confirm_media_cleanup(uuid[],timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.site_request_guest_bootstrap(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_guest_create_upload(text,uuid,uuid,text,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_guest_ack_upload(text,uuid,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_guest_deliver(text,uuid,uuid,jsonb,jsonb,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_dispatch_after_consent(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_mark_dispatched(uuid,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_dispatch_context(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_record_dispatch(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_process_lifecycle(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_claim_dispatch(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_complete_dispatch(uuid,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_pending_dispatches(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_claim_delivery_notification(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_complete_delivery_notification(uuid,boolean,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_pending_delivery_notifications(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_unapproved_media_cleanup_candidates(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_request_confirm_media_cleanup(uuid[],timestamptz) TO service_role;

COMMENT ON TABLE public.site_request_access IS
  'Request-scoped opaque guest access. token_hash stores lowercase SHA-256 only; sr_ raw tokens are minted only after dispatch outbox claim and are never persisted.';
COMMENT ON TABLE public.site_binder_entries IS
  'Append-only approved Site Binder provenance. Current state is derived by site_binder_current; superseded entries remain immutable history.';
COMMENT ON FUNCTION public.site_request_guest_bootstrap(text) IS
  'Service-role-only narrow guest DTO. Input is a server-computed lowercase SHA-256 token hash; invalid, revoked, expired, or terminal access returns NULL.';
COMMENT ON FUNCTION public.site_request_guest_deliver(text,uuid,uuid,jsonb,jsonb,text,timestamptz) IS
  'Service-role-only idempotent item delivery keyed by exact item version + client attempt UUID. K-01 stores canonical integer millimetres.';
