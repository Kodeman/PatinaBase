-- 00886 Round 8 C4 service acceptance (US-52 W4 WP-10A). Shipped INACTIVE.
--
-- Contract: docs/design/designer-portal-round8/contracts/C4-evidence-acceptance.md
-- §2.1-§2.11, under Kody's rulings of 2026-10-27:
--   K4  Signers come only from the agreed scope edition's frozen signer policy
--       (project_scope_edition_signers). Every active required signer must
--       respond; optional signers never change the outcome. Replacement is
--       audited on the replaced signer row. A material scope change supersedes
--       every open request. designer_declared was not ruled in, so source is
--       constrained to 'edition_policy' and no other input path exists.
--   K5  Acceptance is an authenticated click-through (portal_authenticated or
--       ios_authenticated). Paper intake is permitted (§2.1, §2.2, §2.6): a
--       studio member records it, and a different owner or admin of the
--       recorded studio confirms or rejects it. Pending intakes lapse when the
--       request ends or the signer policy revision moves (SQ-1857 T5).
--       signer_policy_unreachable: every bound signer is reachable under K5
--       (a profile responds signed in; a profile-less household card responds
--       on paper), so no bound signer is refused as unreachable.
--
-- Inactive: every mutation re-checks scope_editions at entry and has EXECUTE
-- revoked from PUBLIC, anon, authenticated and service_role. Only the two read
-- RPCs and the read-only storage-policy predicate
-- _can_access_service_acceptance_paper_object(text) are granted to
-- authenticated. The activation grant plan is appended to C4 §2.8; activation
-- is a later migration.
--
-- Stale refusals (stale_scope, stale_signer_policy, paper_document_changed,
-- scope_edition_stale, scope_execution_document_moved) use PT409 (HTTP 409),
-- never 40001/40P01: PostgREST 14 retries those without limit (RC7-e2-2, as 00837).
--
-- Lock order (§2.3): projects (FOR SHARE for a response or a paper review,
-- FOR UPDATE for create, withdraw, replace and supersede), then the scope
-- edition FOR SHARE, then requests FOR UPDATE, then signers FOR UPDATE by id,
-- then inserts. C6 (WP-10B) does not exist on this base: there is no service
-- obligation record and no complete_studio_service. WP-10B adds the
-- contributing-table trigger that interlocks C6 completion with these tables.
--
-- V22: create composes an outbound_drafts row of kind service_acceptance_request
-- (status awaiting_review; the designer sends it). The after-send hook is the
-- AFTER UPDATE trigger _service_acceptance_after_send on outbound_drafts: when
-- record_outbound_draft_after_send (00785) first sets after_send_done_at on a
-- delivered draft, a draft-lifecycle request bound to that draft gets sent_at
-- and lifecycle 'sent' once. A rejected or unknown delivery never sets
-- after_send_done_at, so the request stays in draft. The kind's renderer in
-- supabase/functions/_shared/outbound-kinds is WP-10C (outside this slice).
--
-- Paper content binding (C4 §2.1, SQ-2215 F1): Postgres cannot read storage
-- bytes, so record_service_acceptance_paper_intake stores the object's identity
-- (storage version and eTag) with document_sha256 NULL. The service-role step
-- stamp_service_acceptance_paper_hash, called by the WP-10C edge function after
-- it downloads that object version and hashes its bytes, binds document_sha256
-- once. Confirmation refuses an unstamped intake (paper_document_unstamped), a
-- different expected hash, and an object whose version or eTag moved after
-- hashing (paper_document_changed). The object is also immutable once an intake
-- records it (trigger on storage.objects, 00835 pattern).
--
-- Idempotent DDL: tables and indexes use IF NOT EXISTS (every constraint is
-- inline in its CREATE TABLE), and each trigger and policy is dropped before it
-- is created, so re-applying 00886 is a no-op on its own schema.
--
-- Supersession grafts (bodies copied verbatim from their current definitions,
-- with only the marked C4 lines added):
--   _mint_scope_edition       00869 -> 00883 (current) -> 00886
--   _scope_after_execution    00869 (current) -> 00886
-- Callers keep their bodies: the countersign implementation (00619 -> 00869 ->
-- 00885) and scope reconciliation (00870) reach C4 through these two functions.

-- ---------------------------------------------------------------------------
-- Records (§2.1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_acceptance_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  scope_edition_id uuid NOT NULL REFERENCES public.project_scope_editions(id) ON DELETE RESTRICT,
  scope_content_hash text NOT NULL,
  evidence_manifest_id uuid NOT NULL REFERENCES public.evidence_manifests(id) ON DELETE RESTRICT,
  evidence_manifest_hash text NOT NULL,
  request_number integer NOT NULL CHECK (request_number >= 1),
  predecessor_request_id uuid REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft','sent','withdrawn','superseded','closed')),
  aggregate_outcome text NOT NULL DEFAULT 'pending'
    CHECK (aggregate_outcome IN ('pending','accepted','accepted_with_conditions','returned')),
  closed_reason text CHECK (closed_reason IN ('accepted','accepted_with_conditions','returned')),
  closed_at timestamptz,
  signer_policy_revision integer NOT NULL DEFAULT 1 CHECK (signer_policy_revision >= 1),
  outbound_draft_id uuid NOT NULL REFERENCES public.outbound_drafts(id) ON DELETE RESTRICT,
  sent_at timestamptz,
  superseded_reason text
    CHECK (superseded_reason IN ('scope_edition_superseded','scope_edition_stale','successor_request')),
  superseded_at timestamptz,
  client_request_id text NOT NULL,
  request_hash text NOT NULL,
  withdrawn_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  withdrawn_at timestamptz,
  withdraw_reason text,
  withdraw_client_request_id text,
  withdraw_request_hash text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT service_acceptance_requests_number_key UNIQUE (project_id, request_number),
  CONSTRAINT service_acceptance_requests_client_request_key UNIQUE (project_id, client_request_id),
  CONSTRAINT service_acceptance_requests_closed_ck CHECK (
    (lifecycle = 'closed') = (closed_at IS NOT NULL)
    AND (lifecycle = 'closed') = (closed_reason IS NOT NULL)
    AND (lifecycle = 'closed') = (aggregate_outcome <> 'pending')
    AND (closed_reason IS NULL OR closed_reason = aggregate_outcome)),
  CONSTRAINT service_acceptance_requests_sent_ck CHECK (
    (lifecycle <> 'draft' OR sent_at IS NULL) AND (lifecycle NOT IN ('sent','closed') OR sent_at IS NOT NULL)),
  CONSTRAINT service_acceptance_requests_superseded_ck CHECK (
    (lifecycle = 'superseded') = (superseded_reason IS NOT NULL)
    AND (superseded_reason IS NULL) = (superseded_at IS NULL)),
  CONSTRAINT service_acceptance_requests_withdrawn_ck CHECK (
    (lifecycle = 'withdrawn') = (withdrawn_at IS NOT NULL)
    AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL)
    AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL)
    AND (withdrawn_at IS NULL) = (withdraw_client_request_id IS NULL)
    AND (withdrawn_at IS NULL) = (withdraw_request_hash IS NULL)),
  CONSTRAINT service_acceptance_requests_key_ck CHECK (
    btrim(client_request_id) <> '' AND length(client_request_id) <= 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_requests_one_open_idx
  ON public.service_acceptance_requests (project_id) WHERE lifecycle IN ('draft','sent');
CREATE INDEX IF NOT EXISTS service_acceptance_requests_edition_idx
  ON public.service_acceptance_requests (scope_edition_id) WHERE lifecycle IN ('draft','sent');
CREATE INDEX IF NOT EXISTS service_acceptance_requests_draft_idx ON public.service_acceptance_requests (outbound_draft_id);

CREATE TABLE IF NOT EXISTS public.service_acceptance_signers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  slot text NOT NULL CHECK (btrim(slot) <> ''),
  required boolean NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  household_person_id uuid REFERENCES public.studio_contacts(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'edition_policy' CHECK (source = 'edition_policy'),
  policy_slot text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','replaced')),
  replaced_by_signer_id uuid REFERENCES public.service_acceptance_signers(id) ON DELETE RESTRICT,
  replacement_reason text,
  replaced_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  replaced_at timestamptz,
  replacement_client_request_id text,
  replacement_request_hash text,
  replacement_policy_revision integer,
  replacement_lapsed_intake_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT service_acceptance_signers_person_ck CHECK ((profile_id IS NULL) <> (household_person_id IS NULL)),
  CONSTRAINT service_acceptance_signers_replaced_ck CHECK (
    (status = 'replaced') = (replaced_at IS NOT NULL)
    AND (replaced_at IS NULL) = (replaced_by_signer_id IS NULL)
    AND (replaced_at IS NULL) = (replacement_reason IS NULL)
    AND (replaced_at IS NULL) = (replaced_by IS NULL)
    AND (replaced_at IS NULL) = (replacement_client_request_id IS NULL)
    AND (replaced_at IS NULL) = (replacement_request_hash IS NULL)
    AND (replaced_at IS NULL) = (replacement_policy_revision IS NULL)
    AND (replaced_at IS NULL) = (replacement_lapsed_intake_ids IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_signers_active_profile_idx
  ON public.service_acceptance_signers (request_id, profile_id) WHERE status = 'active' AND profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_signers_active_person_idx
  ON public.service_acceptance_signers (request_id, household_person_id)
  WHERE status = 'active' AND household_person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_signers_active_slot_idx
  ON public.service_acceptance_signers (request_id, slot) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_signers_replacement_key_idx
  ON public.service_acceptance_signers (request_id, replacement_client_request_id)
  WHERE replacement_client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_acceptance_signers_profile_idx
  ON public.service_acceptance_signers (profile_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.service_acceptance_paper_intakes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  signer_id uuid NOT NULL REFERENCES public.service_acceptance_signers(id) ON DELETE RESTRICT,
  storage_object_id uuid NOT NULL,
  storage_object_version text NOT NULL CHECK (btrim(storage_object_version) <> ''),
  storage_object_etag text NOT NULL CHECK (btrim(storage_object_etag) <> ''),
  document_sha256 text CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  document_stamped_at timestamptz,
  paper_signed_on date NOT NULL,
  signed_name text NOT NULL CHECK (btrim(signed_name) <> '' AND length(signed_name) <= 200),
  disposition text NOT NULL CHECK (disposition IN ('accept','accept_with_conditions','return')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  return_reason text,
  presented_request_number integer NOT NULL,
  presented_scope_content_hash text NOT NULL,
  presented_evidence_manifest_hash text NOT NULL,
  presented_signer_policy_revision integer NOT NULL,
  client_request_id text NOT NULL,
  request_hash text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  review_state text NOT NULL DEFAULT 'pending_review'
    CHECK (review_state IN ('pending_review','confirmed','rejected','lapsed')),
  lapsed_reason text CHECK (lapsed_reason IN ('request_terminal','signer_policy_revised')),
  lapsed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  review_client_request_id text,
  review_request_hash text,
  CONSTRAINT service_acceptance_paper_intakes_key UNIQUE (request_id, client_request_id),
  CONSTRAINT service_acceptance_paper_intakes_disposition_ck CHECK (
    (disposition = 'accept_with_conditions') = (jsonb_array_length(conditions) > 0)
    AND (disposition = 'return') = (return_reason IS NOT NULL)),
  CONSTRAINT service_acceptance_paper_intakes_stamp_ck CHECK (
    (document_sha256 IS NULL) = (document_stamped_at IS NULL)
    AND (review_state <> 'confirmed' OR document_sha256 IS NOT NULL)),
  CONSTRAINT service_acceptance_paper_intakes_lapsed_ck CHECK (
    (review_state = 'lapsed') = (lapsed_reason IS NOT NULL) AND (lapsed_reason IS NULL) = (lapsed_at IS NULL)),
  CONSTRAINT service_acceptance_paper_intakes_review_ck CHECK (
    (review_state IN ('confirmed','rejected')) = (reviewed_at IS NOT NULL)
    AND (reviewed_at IS NULL) = (reviewed_by IS NULL)
    AND (reviewed_at IS NULL) = (review_client_request_id IS NULL)
    AND (reviewed_at IS NULL) = (review_request_hash IS NULL)
    AND (review_state <> 'rejected' OR btrim(COALESCE(review_note, '')) <> '')
    AND reviewed_by IS DISTINCT FROM recorded_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS service_acceptance_paper_intakes_review_key_idx
  ON public.service_acceptance_paper_intakes (request_id, review_client_request_id)
  WHERE review_client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_acceptance_paper_intakes_object_idx ON public.service_acceptance_paper_intakes (storage_object_id);
CREATE INDEX IF NOT EXISTS service_acceptance_paper_intakes_signer_idx ON public.service_acceptance_paper_intakes (signer_id);

CREATE TABLE IF NOT EXISTS public.service_acceptance_responses (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  signer_id uuid NOT NULL REFERENCES public.service_acceptance_signers(id) ON DELETE RESTRICT,
  response text NOT NULL CHECK (response IN ('accept','accept_with_conditions','return')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  return_reason text,
  method text NOT NULL CHECK (method IN ('portal_authenticated','ios_authenticated','paper_intake')),
  responder_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  paper_intake_id uuid REFERENCES public.service_acceptance_paper_intakes(id) ON DELETE RESTRICT,
  presented_scope_content_hash text NOT NULL,
  presented_evidence_manifest_hash text NOT NULL,
  presented_signer_policy_revision integer NOT NULL,
  client_request_id text,
  request_hash text,
  responded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT service_acceptance_responses_signer_key UNIQUE (request_id, signer_id),
  CONSTRAINT service_acceptance_responses_client_request_key UNIQUE (request_id, client_request_id),
  CONSTRAINT service_acceptance_responses_shape_ck CHECK (
    (response = 'accept_with_conditions') = (jsonb_array_length(conditions) > 0)
    AND (response = 'return') = (return_reason IS NOT NULL)),
  CONSTRAINT service_acceptance_responses_method_ck CHECK (
    (method = 'paper_intake') = (paper_intake_id IS NOT NULL)
    AND (method = 'paper_intake') = (responder_profile_id IS NULL)
    AND (method = 'paper_intake') = (client_request_id IS NULL)
    AND (client_request_id IS NULL) = (request_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS service_acceptance_responses_signer_idx ON public.service_acceptance_responses (signer_id);

COMMENT ON TABLE public.service_acceptance_requests IS
  'C4 client acceptance of the agreed studio service: one request per scope edition send, append-only lifecycle.';
COMMENT ON COLUMN public.service_acceptance_requests.aggregate_outcome IS
  'Derived only by _derive_service_acceptance_outcome under app.service_acceptance_outcome_id.';
COMMENT ON TABLE public.service_acceptance_responses IS
  'Append-only authenticated click-through or confirmed paper responses (K5).';
COMMENT ON COLUMN public.service_acceptance_paper_intakes.document_sha256 IS
  'Server-computed sha256 of the stored PDF bytes at storage_object_version/storage_object_etag. NULL until the service-role stamp_service_acceptance_paper_hash binds it; confirmation requires it.';

ALTER TABLE public.service_acceptance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_acceptance_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_acceptance_paper_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_acceptance_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_acceptance_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_acceptance_signers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_acceptance_paper_intakes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_acceptance_responses FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Write guards. These run as the invoking role so current_user is the RPC
-- owner (postgres) only inside the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._guard_service_acceptance_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  mutable text[] := ARRAY['lifecycle','aggregate_outcome','closed_reason','closed_at','signer_policy_revision',
    'sent_at','superseded_reason','superseded_at','withdrawn_by','withdrawn_at','withdraw_reason',
    'withdraw_client_request_id','withdraw_request_hash'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_acceptance_record_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user <> 'postgres' OR current_setting('app.service_acceptance_request_id', true)
     IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END)::text THEN
    RAISE EXCEPTION 'service_acceptance_write_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.lifecycle <> 'draft' OR NEW.aggregate_outcome <> 'pending' OR NEW.signer_policy_revision <> 1 THEN
      RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable)
     OR OLD.lifecycle IN ('withdrawn','superseded','closed')
     OR (OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
     OR NEW.signer_policy_revision NOT IN (OLD.signer_policy_revision, OLD.signer_policy_revision + 1)
     OR (NEW.lifecycle <> OLD.lifecycle AND (OLD.lifecycle, NEW.lifecycle) NOT IN (
       ('draft','sent'),('draft','withdrawn'),('sent','withdrawn'),('draft','superseded'),
       ('sent','superseded'),('sent','closed'))) THEN
    RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.aggregate_outcome <> OLD.aggregate_outcome
     AND current_setting('app.service_acceptance_outcome_id', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'service_acceptance_outcome_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._guard_service_acceptance_child()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  mutable text[] := CASE TG_TABLE_NAME
    WHEN 'service_acceptance_signers' THEN ARRAY['status','replaced_by_signer_id','replacement_reason','replaced_by',
      'replaced_at','replacement_client_request_id','replacement_request_hash','replacement_policy_revision',
      'replacement_lapsed_intake_ids']
    WHEN 'service_acceptance_paper_intakes' THEN ARRAY['review_state','lapsed_reason','lapsed_at','reviewed_by',
      'reviewed_at','review_note','review_client_request_id','review_request_hash']
    ELSE ARRAY[]::text[] END;
  open_state text := CASE TG_TABLE_NAME WHEN 'service_acceptance_signers' THEN 'active' ELSE 'pending_review' END;
  stamp text[] := ARRAY['document_sha256','document_stamped_at'];
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'service_acceptance_responses') THEN
    RAISE EXCEPTION 'service_acceptance_record_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user <> 'postgres' OR current_setting('app.service_acceptance_request_id', true)
     IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NEW.request_id ELSE OLD.request_id END)::text THEN
    RAISE EXCEPTION 'service_acceptance_write_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME <> 'service_acceptance_responses' AND to_jsonb(NEW)->>(CASE TG_TABLE_NAME
         WHEN 'service_acceptance_signers' THEN 'status' ELSE 'review_state' END) <> open_state
       OR (TG_TABLE_NAME = 'service_acceptance_paper_intakes' AND to_jsonb(NEW)->>'document_sha256' IS NOT NULL) THEN
      RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- The content stamp: a pending intake gains its hash once and nothing else moves.
  IF TG_TABLE_NAME = 'service_acceptance_paper_intakes' AND to_jsonb(OLD)->>'document_sha256' IS NULL
     AND to_jsonb(NEW)->>'document_sha256' IS NOT NULL THEN
    IF (to_jsonb(NEW) - stamp) IS DISTINCT FROM (to_jsonb(OLD) - stamp) OR to_jsonb(OLD)->>'review_state' <> open_state THEN
      RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable)
     OR to_jsonb(OLD)->>mutable[1] <> open_state OR to_jsonb(NEW)->>mutable[1] = open_state THEN
    RAISE EXCEPTION 'service_acceptance_transition_invalid' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_service_acceptance_request ON public.service_acceptance_requests;
CREATE TRIGGER guard_service_acceptance_request BEFORE INSERT OR UPDATE OR DELETE
  ON public.service_acceptance_requests FOR EACH ROW EXECUTE FUNCTION public._guard_service_acceptance_request();
DROP TRIGGER IF EXISTS guard_service_acceptance_signer ON public.service_acceptance_signers;
CREATE TRIGGER guard_service_acceptance_signer BEFORE INSERT OR UPDATE OR DELETE
  ON public.service_acceptance_signers FOR EACH ROW EXECUTE FUNCTION public._guard_service_acceptance_child();
DROP TRIGGER IF EXISTS guard_service_acceptance_paper_intake ON public.service_acceptance_paper_intakes;
CREATE TRIGGER guard_service_acceptance_paper_intake BEFORE INSERT OR UPDATE OR DELETE
  ON public.service_acceptance_paper_intakes FOR EACH ROW EXECUTE FUNCTION public._guard_service_acceptance_child();
DROP TRIGGER IF EXISTS guard_service_acceptance_response ON public.service_acceptance_responses;
CREATE TRIGGER guard_service_acceptance_response BEFORE INSERT OR UPDATE OR DELETE
  ON public.service_acceptance_responses FOR EACH ROW EXECUTE FUNCTION public._guard_service_acceptance_child();

-- ---------------------------------------------------------------------------
-- Paper storage (00835 pattern): private PDF bucket, studio-only, immutable
-- once an intake records the object.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-acceptance-paper', 'service-acceptance-paper', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS service_acceptance_paper_bucket_boundary ON storage.buckets;
CREATE POLICY service_acceptance_paper_bucket_boundary ON storage.buckets AS RESTRICTIVE
  FOR ALL TO authenticated, anon USING (id <> 'service-acceptance-paper')
  WITH CHECK (id <> 'service-acceptance-paper');

CREATE OR REPLACE FUNCTION public._can_access_service_acceptance_paper_object(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND p_key ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    AND EXISTS (SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(p_key, '/', 1) AND public.can_compose_project_plan(p.id));
$$;
REVOKE ALL ON FUNCTION public._can_access_service_acceptance_paper_object(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._can_access_service_acceptance_paper_object(text) TO authenticated;

DROP POLICY IF EXISTS service_acceptance_paper_anon_boundary ON storage.objects;
CREATE POLICY service_acceptance_paper_anon_boundary ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon USING (bucket_id <> 'service-acceptance-paper')
  WITH CHECK (bucket_id <> 'service-acceptance-paper');
DROP POLICY IF EXISTS service_acceptance_paper_read_boundary ON storage.objects;
CREATE POLICY service_acceptance_paper_read_boundary ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (bucket_id <> 'service-acceptance-paper'
    OR public._can_access_service_acceptance_paper_object(name));
DROP POLICY IF EXISTS service_acceptance_paper_read ON storage.objects;
CREATE POLICY service_acceptance_paper_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'service-acceptance-paper' AND public._can_access_service_acceptance_paper_object(name));
DROP POLICY IF EXISTS service_acceptance_paper_insert_boundary ON storage.objects;
CREATE POLICY service_acceptance_paper_insert_boundary ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'service-acceptance-paper' OR (
    public._can_access_service_acceptance_paper_object(name) AND owner_id = auth.uid()::text));
DROP POLICY IF EXISTS service_acceptance_paper_insert ON storage.objects;
CREATE POLICY service_acceptance_paper_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-acceptance-paper'
    AND public._can_access_service_acceptance_paper_object(name) AND owner_id = auth.uid()::text);
DROP POLICY IF EXISTS service_acceptance_paper_update_boundary ON storage.objects;
CREATE POLICY service_acceptance_paper_update_boundary ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (bucket_id <> 'service-acceptance-paper')
  WITH CHECK (bucket_id <> 'service-acceptance-paper');
DROP POLICY IF EXISTS service_acceptance_paper_delete_boundary ON storage.objects;
CREATE POLICY service_acceptance_paper_delete_boundary ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (bucket_id <> 'service-acceptance-paper');

CREATE OR REPLACE FUNCTION public._guard_recorded_service_acceptance_paper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.service_acceptance_paper_intakes i WHERE i.storage_object_id = OLD.id) THEN
    RAISE EXCEPTION 'Recorded acceptance paper cannot be changed or deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS immutable_recorded_service_acceptance_paper ON storage.objects;
CREATE TRIGGER immutable_recorded_service_acceptance_paper BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public._guard_recorded_service_acceptance_paper();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._service_acceptance_key(p_key text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' OR length(p_key) > 200 THEN
    RAISE EXCEPTION 'client_request_id_invalid' USING ERRCODE = 'check_violation';
  END IF;
  RETURN p_key;
END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_hash(p_value jsonb)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(public._plan_room_canonical_json(p_value), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._is_service_acceptance_studio_admin(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = public.project_recorded_studio(p_project_id) AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role IN ('owner','admin'));
$$;

-- Response payload shape; the server assigns every conditionId.
CREATE OR REPLACE FUNCTION public._service_acceptance_conditions(p_response text, p_conditions jsonb, p_return_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_out jsonb := '[]'::jsonb; v_list jsonb := COALESCE(p_conditions, '[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_list) <> 'array' THEN
    RAISE EXCEPTION 'service_acceptance_response_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF p_response IS NULL OR p_response NOT IN ('accept','accept_with_conditions','return')
     OR (p_response = 'accept_with_conditions') <> (jsonb_array_length(v_list) BETWEEN 1 AND 20)
     OR (p_response <> 'accept_with_conditions' AND jsonb_array_length(v_list) > 0)
     OR (p_response = 'return') <> (btrim(COALESCE(p_return_reason, '')) <> '')
     OR length(COALESCE(p_return_reason, '')) > 2000 THEN
    RAISE EXCEPTION 'service_acceptance_response_invalid' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_list) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR (v_item - 'text') <> '{}'::jsonb
       OR jsonb_typeof(v_item->'text') IS DISTINCT FROM 'string'
       OR btrim(v_item->>'text') = '' OR length(v_item->>'text') > 2000 THEN
      RAISE EXCEPTION 'service_acceptance_response_invalid' USING ERRCODE = 'check_violation';
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'conditionId', extensions.gen_random_uuid(), 'text', btrim(v_item->>'text')));
  END LOOP;
  RETURN v_out;
END;
$$;

-- Signer binding mirrors 00869 _validate_scope_signer_parts (client profile or
-- a live person card in the client's own household) without its proposal
-- author gate, so an owner or admin can replace a signer.
CREATE OR REPLACE FUNCTION public._validate_service_acceptance_signers(p_proposal_id uuid, p_signers jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE; v_signer jsonb; v_person text; v_people text[] := '{}';
  v_profile uuid; v_contact uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_signers) s WHERE (s->>'required')::boolean) THEN
    RAISE EXCEPTION 'signer_policy_no_required_signer' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO STRICT v_proposal FROM public.proposals WHERE id = p_proposal_id;
  FOR v_signer IN SELECT value FROM jsonb_array_elements(p_signers) LOOP
    v_profile := (v_signer->>'profileId')::uuid;
    v_contact := (v_signer->>'householdPersonId')::uuid;
    v_person := NULL;
    IF v_profile IS NOT NULL AND v_profile = v_proposal.client_id THEN
      v_person := 'profile:' || v_profile;
    ELSE
      SELECT COALESCE('profile:' || sc.profile_id, 'contact:' || sc.id) INTO v_person
      FROM public.designer_clients dc
      JOIN public.client_households h ON h.id = dc.household_id
      JOIN public.studio_contacts sc ON sc.id = ANY(h.member_person_ids)
      WHERE dc.id = v_proposal.designer_client_id AND dc.client_id = v_proposal.client_id
        AND dc.designer_id = v_proposal.designer_id AND h.organization_id = v_proposal.studio_id
        AND sc.organization_id = h.organization_id AND sc.entity_kind = 'person' AND sc.merged_into IS NULL
        AND ((v_profile IS NOT NULL AND sc.profile_id = v_profile) OR (v_contact IS NOT NULL AND sc.id = v_contact));
    END IF;
    IF v_person IS NULL OR (v_profile IS NULL) = (v_contact IS NULL) THEN
      RAISE EXCEPTION 'signer_policy_unbound' USING ERRCODE = 'check_violation';
    END IF;
    IF v_person = ANY(v_people) THEN
      RAISE EXCEPTION 'signer_policy_duplicate' USING ERRCODE = 'check_violation';
    END IF;
    v_people := array_append(v_people, v_person);
  END LOOP;
END;
$$;

-- §2.3 order for an existing request: projects, edition, request, signers.
CREATE OR REPLACE FUNCTION public._lock_service_acceptance_request(p_request_id uuid, p_exclusive boolean)
RETURNS public.service_acceptance_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project uuid; v_edition uuid; v_request public.service_acceptance_requests%ROWTYPE;
BEGIN
  SELECT project_id, scope_edition_id INTO v_project, v_edition
  FROM public.service_acceptance_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_exclusive THEN
    PERFORM 1 FROM public.projects WHERE id = v_project FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.projects WHERE id = v_project FOR SHARE;
  END IF;
  PERFORM 1 FROM public.project_scope_editions WHERE id = v_edition FOR SHARE;
  SELECT * INTO STRICT v_request FROM public.service_acceptance_requests WHERE id = p_request_id FOR UPDATE;
  PERFORM 1 FROM public.service_acceptance_signers WHERE request_id = p_request_id ORDER BY id FOR UPDATE;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public._lapse_service_acceptance_intakes(p_request_id uuid, p_reason text)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_ids uuid[]; previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  WITH lapsed AS (
    UPDATE public.service_acceptance_paper_intakes SET review_state = 'lapsed', lapsed_reason = p_reason,
      lapsed_at = clock_timestamp()
    WHERE request_id = p_request_id AND review_state = 'pending_review' RETURNING id
  ) SELECT COALESCE(array_agg(id ORDER BY id), '{}') INTO v_ids FROM lapsed;
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public._supersede_service_acceptance_request(p_request_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  UPDATE public.service_acceptance_requests SET lifecycle = 'superseded', superseded_reason = p_reason,
    superseded_at = clock_timestamp()
  WHERE id = p_request_id AND lifecycle IN ('draft','sent');
  IF FOUND THEN
    PERFORM public._lapse_service_acceptance_intakes(p_request_id, 'request_terminal');
    PERFORM public.resolve_outbound_drafts('service_acceptance_request', p_request_id);
  END IF;
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
END;
$$;

-- Called by the C2 grafts below once the edition row is locked.
CREATE OR REPLACE FUNCTION public._supersede_service_acceptance_requests(p_edition_id uuid, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_count integer := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.service_acceptance_requests
    WHERE scope_edition_id = p_edition_id AND lifecycle IN ('draft','sent') ORDER BY id FOR UPDATE LOOP
    PERFORM public._supersede_service_acceptance_request(v_id, p_reason);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_pending_required(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('signerId', s.id, 'slot', s.slot) ORDER BY s.slot), '[]'::jsonb)
  FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id AND s.status = 'active' AND s.required
    AND NOT EXISTS (SELECT 1 FROM public.service_acceptance_responses x WHERE x.signer_id = s.id);
$$;

-- §2.4. Only this function moves aggregate_outcome (capability-setting guard
-- app.service_acceptance_outcome_id). A non-pending outcome closes the request
-- in the same statement.
CREATE OR REPLACE FUNCTION public._derive_service_acceptance_outcome(p_request_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_request public.service_acceptance_requests%ROWTYPE; v_required integer; v_returned integer;
  v_pending integer; v_conditional integer; v_outcome text;
  previous_request text := current_setting('app.service_acceptance_request_id', true);
  previous_outcome text := current_setting('app.service_acceptance_outcome_id', true);
BEGIN
  SELECT * INTO STRICT v_request FROM public.service_acceptance_requests WHERE id = p_request_id FOR UPDATE;
  SELECT count(*), count(*) FILTER (WHERE x.response = 'return'), count(*) FILTER (WHERE x.id IS NULL),
         count(*) FILTER (WHERE x.response = 'accept_with_conditions')
    INTO v_required, v_returned, v_pending, v_conditional
  FROM public.service_acceptance_signers s
  LEFT JOIN public.service_acceptance_responses x ON x.signer_id = s.id
  WHERE s.request_id = p_request_id AND s.status = 'active' AND s.required;
  IF v_required = 0 THEN
    RAISE EXCEPTION 'signer_policy_no_required_signer' USING ERRCODE = 'check_violation';
  END IF;
  v_outcome := CASE WHEN v_returned > 0 THEN 'returned' WHEN v_pending > 0 THEN 'pending'
    WHEN v_conditional > 0 THEN 'accepted_with_conditions' ELSE 'accepted' END;
  IF v_outcome <> 'pending' AND v_request.lifecycle = 'sent' THEN
    PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
    PERFORM set_config('app.service_acceptance_outcome_id', p_request_id::text, true);
    UPDATE public.service_acceptance_requests SET aggregate_outcome = v_outcome, lifecycle = 'closed',
      closed_reason = v_outcome, closed_at = clock_timestamp()
    WHERE id = p_request_id;
    PERFORM set_config('app.service_acceptance_outcome_id', COALESCE(previous_outcome, ''), true);
    PERFORM public._lapse_service_acceptance_intakes(p_request_id, 'request_terminal');
    PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_request, ''), true);
  END IF;
  RETURN v_outcome;
END;
$$;

-- Object identity only, never a content hash: is the recorded paper object
-- still at the storage version and eTag the intake recorded?
CREATE OR REPLACE FUNCTION public._service_acceptance_paper_object_unchanged(p_object_id uuid, p_version text, p_etag text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM storage.objects o WHERE o.id = p_object_id
    AND o.bucket_id = 'service-acceptance-paper' AND o.version = p_version AND o.metadata->>'eTag' = p_etag);
$$;

-- Non-studio readers keep each response's method, so confirmed paper stays
-- distinct from an authenticated click-through (K5), but never see the response
-- id, the paper object, its hash, or who recorded or reviewed it.
CREATE OR REPLACE FUNCTION public._service_acceptance_request_json(p_request_id uuid, p_studio boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'requestId', r.id, 'projectId', r.project_id, 'requestNumber', r.request_number,
    'scopeEditionId', r.scope_edition_id, 'scopeContentHash', r.scope_content_hash,
    'evidenceManifestHash', r.evidence_manifest_hash, 'lifecycle', r.lifecycle,
    'aggregateOutcome', r.aggregate_outcome, 'closedAt', r.closed_at,
    'signerPolicyRevision', r.signer_policy_revision, 'sentAt', r.sent_at,
    'signers', COALESCE((SELECT jsonb_agg(CASE WHEN p_studio THEN jsonb_build_object(
        'signerId', s.id, 'slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
        'householdPersonId', s.household_person_id, 'status', s.status,
        'replacedBySignerId', s.replaced_by_signer_id, 'replacementReason', s.replacement_reason,
        'replacedAt', s.replaced_at, 'response', resp.body)
      ELSE jsonb_build_object('signerId', s.id, 'slot', s.slot, 'required', s.required,
        'response', resp.body - 'responseId') END ORDER BY s.slot, s.created_at, s.id)
      FROM public.service_acceptance_signers s
      LEFT JOIN LATERAL (SELECT jsonb_build_object('responseId', x.id, 'response', x.response,
          'conditions', x.conditions, 'returnReason', x.return_reason, 'method', x.method,
          'respondedAt', x.responded_at) AS body
        FROM public.service_acceptance_responses x WHERE x.signer_id = s.id) resp ON true
      WHERE s.request_id = r.id AND (p_studio OR s.status = 'active')), '[]'::jsonb))
  || CASE WHEN p_studio THEN jsonb_build_object(
      'predecessorRequestId', r.predecessor_request_id, 'evidenceManifestId', r.evidence_manifest_id,
      'closedReason', r.closed_reason, 'supersededReason', r.superseded_reason,
      'supersededAt', r.superseded_at, 'withdrawnAt', r.withdrawn_at, 'withdrawReason', r.withdraw_reason,
      'outboundDraftId', r.outbound_draft_id, 'createdAt', r.created_at,
      'paperIntakes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'intakeId', i.id, 'signerId', i.signer_id, 'storageObjectId', i.storage_object_id,
          'documentSha256', i.document_sha256, 'paperSignedOn', i.paper_signed_on, 'signedName', i.signed_name,
          'disposition', i.disposition, 'conditions', i.conditions, 'returnReason', i.return_reason,
          'presentedSignerPolicyRevision', i.presented_signer_policy_revision, 'reviewState', i.review_state,
          'lapsedReason', i.lapsed_reason, 'recordedBy', i.recorded_by, 'recordedAt', i.recorded_at,
          'reviewedBy', i.reviewed_by, 'reviewedAt', i.reviewed_at, 'reviewNote', i.review_note)
        ORDER BY i.recorded_at, i.id)
        FROM public.service_acceptance_paper_intakes i WHERE i.request_id = r.id), '[]'::jsonb))
    ELSE '{}'::jsonb END
  FROM public.service_acceptance_requests r WHERE r.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_create_receipt(p_request_id uuid, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('requestId', r.id, 'lifecycle', r.lifecycle, 'outboundDraftId', r.outbound_draft_id,
    'signerPolicyRevision', r.signer_policy_revision, 'replayed', p_replayed,
    'signers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('signerId', s.id, 'slot', s.slot,
        'required', s.required, 'profileId', s.profile_id, 'householdPersonId', s.household_person_id)
        ORDER BY s.slot), '[]'::jsonb)
      FROM public.service_acceptance_signers s WHERE s.request_id = r.id AND s.status = 'active'))
  FROM public.service_acceptance_requests r WHERE r.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public._service_acceptance_response_receipt(p_response_id uuid, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('responseId', x.id, 'aggregateOutcome', r.aggregate_outcome,
    'pendingRequiredSigners', public._service_acceptance_pending_required(r.id),
    'signerPolicyRevision', r.signer_policy_revision, 'replayed', p_replayed)
  FROM public.service_acceptance_responses x
  JOIN public.service_acceptance_requests r ON r.id = x.request_id WHERE x.id = p_response_id;
$$;

-- ---------------------------------------------------------------------------
-- Mutations (§2.2). Each re-checks scope_editions first and replays a receipt
-- for its own (scope, client_request_id) before any lifecycle guard (R15).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_service_acceptance_request(
  p_project_id uuid, p_scope_edition_id uuid, p_evidence_manifest_id uuid, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_project public.projects%ROWTYPE;
  v_edition public.project_scope_editions%ROWTYPE; v_manifest public.evidence_manifests%ROWTYPE;
  v_existing public.service_acceptance_requests%ROWTYPE; v_prior public.service_acceptance_requests%ROWTYPE;
  v_signers jsonb; v_studio uuid; v_draft uuid; v_number integer; v_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_uid IS NULL OR v_project.id IS NULL OR NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_edition FROM public.project_scope_editions
  WHERE id = p_scope_edition_id AND project_id = p_project_id FOR SHARE;
  v_hash := public._service_acceptance_hash(jsonb_build_object('projectId', p_project_id,
    'scopeEditionId', p_scope_edition_id, 'evidenceManifestId', p_evidence_manifest_id));
  SELECT * INTO v_existing FROM public.service_acceptance_requests
  WHERE project_id = p_project_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_hash <> v_hash OR v_existing.created_by <> v_uid THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_acceptance_create_receipt(v_existing.id, true);
  END IF;
  IF v_edition.id IS NULL OR v_edition.status <> 'active' THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_manifest FROM public.evidence_manifests WHERE id = p_evidence_manifest_id;
  IF v_manifest.id IS NULL OR v_manifest.project_id <> p_project_id OR v_manifest.purpose <> 'service_acceptance' THEN
    RAISE EXCEPTION 'evidence_manifest_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
      'householdPersonId', s.household_person_id) ORDER BY s.slot), '[]'::jsonb) INTO v_signers
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  IF jsonb_typeof(v_edition.content->'signerPolicy') IS DISTINCT FROM 'object' OR jsonb_array_length(v_signers) = 0 THEN
    RAISE EXCEPTION 'signer_policy_missing' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._validate_service_acceptance_signers(v_edition.source_proposal_id, v_signers);
  v_studio := public.project_recorded_studio(p_project_id);
  IF v_studio IS NULL OR v_project.client_id IS NULL THEN
    RAISE EXCEPTION 'service_acceptance_recipient_missing' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_prior FROM public.service_acceptance_requests WHERE project_id = p_project_id
  ORDER BY request_number DESC LIMIT 1 FOR UPDATE;
  IF v_prior.lifecycle IN ('draft','sent') THEN
    PERFORM public._supersede_service_acceptance_request(v_prior.id, 'successor_request');
  END IF;
  v_number := COALESCE(v_prior.request_number, 0) + 1;
  v_draft := public.compose_outbound_draft('service_acceptance_request', v_studio, p_project_id, 'email', 'client',
    jsonb_build_object('client_id', v_project.client_id), 'Review the agreed services',
    'Your studio has prepared the agreed services for your review. Open your project to accept them, '
      || 'accept them with conditions, or return them with a note.',
    jsonb_build_object('requestId', v_id, 'projectId', p_project_id, 'requestNumber', v_number,
      'scopeEditionId', v_edition.id),
    'service_acceptance_request', v_id, 'service_acceptance_request:' || v_id, NULL, NULL, v_uid::text);
  PERFORM set_config('app.service_acceptance_request_id', v_id::text, true);
  INSERT INTO public.service_acceptance_requests(id, project_id, scope_edition_id, scope_content_hash,
    evidence_manifest_id, evidence_manifest_hash, request_number, predecessor_request_id, outbound_draft_id,
    client_request_id, request_hash, created_by)
  VALUES (v_id, p_project_id, v_edition.id, v_edition.content_hash, v_manifest.id, v_manifest.manifest_hash,
    v_number, v_prior.id, v_draft, v_key, v_hash, v_uid);
  INSERT INTO public.service_acceptance_signers(request_id, slot, required, profile_id, household_person_id, policy_slot)
  SELECT v_id, s.slot, s.required, s.profile_id, s.household_person_id, s.slot
  FROM public.project_scope_edition_signers s WHERE s.edition_id = v_edition.id;
  PERFORM public._derive_service_acceptance_outcome(v_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_acceptance_create_receipt(v_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_service_acceptance(
  p_request_id uuid, p_response text, p_conditions jsonb, p_return_reason text, p_scope_content_hash text,
  p_evidence_manifest_hash text, p_signer_policy_revision integer, p_client_request_id text,
  p_method text DEFAULT 'portal_authenticated')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_responses%ROWTYPE; v_signer public.service_acceptance_signers%ROWTYPE;
  v_conditions jsonb; v_response_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_request := public._lock_service_acceptance_request(p_request_id, false);
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'response', p_response,
    'conditions', p_conditions, 'returnReason', p_return_reason, 'scopeContentHash', p_scope_content_hash,
    'evidenceManifestHash', p_evidence_manifest_hash, 'signerPolicyRevision', p_signer_policy_revision,
    'method', p_method));
  SELECT * INTO v_existing FROM public.service_acceptance_responses
  WHERE request_id = p_request_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.responder_profile_id <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_acceptance_response_receipt(v_existing.id, true);
  END IF;
  SELECT * INTO v_signer FROM public.service_acceptance_signers
  WHERE request_id = p_request_id AND profile_id = v_uid ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1;
  IF v_signer.id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_request.lifecycle <> 'sent' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF v_signer.status <> 'active' THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_scope_content_hash IS DISTINCT FROM v_request.scope_content_hash
     OR p_evidence_manifest_hash IS DISTINCT FROM v_request.evidence_manifest_hash
     OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
    RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'PT409';
  END IF;
  IF p_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_acceptance_responses WHERE signer_id = v_signer.id) THEN
    RAISE EXCEPTION 'already_responded' USING ERRCODE = 'unique_violation';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('portal_authenticated','ios_authenticated') THEN
    RAISE EXCEPTION 'service_acceptance_response_invalid' USING ERRCODE = 'check_violation';
  END IF;
  v_conditions := public._service_acceptance_conditions(p_response, p_conditions, p_return_reason);
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  INSERT INTO public.service_acceptance_responses(id, request_id, signer_id, response, conditions, return_reason,
    method, responder_profile_id, presented_scope_content_hash, presented_evidence_manifest_hash,
    presented_signer_policy_revision, client_request_id, request_hash)
  VALUES (v_response_id, p_request_id, v_signer.id, p_response, v_conditions, NULLIF(btrim(p_return_reason), ''),
    p_method, v_uid, p_scope_content_hash, p_evidence_manifest_hash, p_signer_policy_revision, v_key, v_hash);
  PERFORM public._derive_service_acceptance_outcome(p_request_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_acceptance_response_receipt(v_response_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_service_acceptance_paper_intake(
  p_request_id uuid, p_signer_id uuid, p_storage_object_id uuid, p_paper_signed_on date, p_signed_name text,
  p_disposition text, p_conditions jsonb, p_return_reason text, p_presented_request_number integer,
  p_presented_scope_content_hash text, p_presented_evidence_manifest_hash text,
  p_presented_signer_policy_revision integer, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_paper_intakes%ROWTYPE; v_signer public.service_acceptance_signers%ROWTYPE;
  v_object storage.objects%ROWTYPE; v_conditions jsonb; v_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_acceptance_request(p_request_id, false);
  IF v_uid IS NULL OR NOT public.can_compose_project_plan(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'signerId', p_signer_id,
    'storageObjectId', p_storage_object_id, 'paperSignedOn', p_paper_signed_on, 'signedName', p_signed_name,
    'disposition', p_disposition, 'conditions', p_conditions, 'returnReason', p_return_reason,
    'presentedRequestNumber', p_presented_request_number, 'presentedScopeContentHash', p_presented_scope_content_hash,
    'presentedEvidenceManifestHash', p_presented_evidence_manifest_hash,
    'presentedSignerPolicyRevision', p_presented_signer_policy_revision));
  SELECT * INTO v_existing FROM public.service_acceptance_paper_intakes
  WHERE request_id = p_request_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.recorded_by <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('intakeId', v_existing.id, 'reviewState', v_existing.review_state,
      'documentSha256', v_existing.document_sha256, 'replayed', true);
  END IF;
  IF v_request.lifecycle <> 'sent' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_signer FROM public.service_acceptance_signers WHERE id = p_signer_id AND request_id = p_request_id;
  IF v_signer.id IS NULL OR v_signer.status <> 'active' THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_presented_request_number IS DISTINCT FROM v_request.request_number
     OR p_presented_scope_content_hash IS DISTINCT FROM v_request.scope_content_hash
     OR p_presented_evidence_manifest_hash IS DISTINCT FROM v_request.evidence_manifest_hash
     OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
    RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'PT409';
  END IF;
  IF p_presented_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_acceptance_responses WHERE signer_id = v_signer.id) THEN
    RAISE EXCEPTION 'already_responded' USING ERRCODE = 'unique_violation';
  END IF;
  v_conditions := public._service_acceptance_conditions(p_disposition, p_conditions, p_return_reason);
  IF p_paper_signed_on IS NULL OR p_paper_signed_on > current_date
     OR btrim(COALESCE(p_signed_name, '')) = '' OR length(p_signed_name) > 200 THEN
    RAISE EXCEPTION 'service_acceptance_paper_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_object FROM storage.objects WHERE id = p_storage_object_id FOR SHARE;
  IF v_object.id IS NULL OR v_object.bucket_id <> 'service-acceptance-paper'
     OR split_part(v_object.name, '/', 1) <> v_request.project_id::text
     OR NOT public._can_access_service_acceptance_paper_object(v_object.name)
     OR v_object.owner_id IS DISTINCT FROM v_uid::text
     OR v_object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf'
     OR NOT (CASE WHEN v_object.metadata->>'size' ~ '^[0-9]+$'
       THEN (v_object.metadata->>'size')::numeric BETWEEN 1 AND 20971520 ELSE false END)
     OR btrim(COALESCE(v_object.version, '')) = '' OR btrim(COALESCE(v_object.metadata->>'eTag', '')) = '' THEN
    RAISE EXCEPTION 'service_acceptance_paper_invalid' USING ERRCODE = 'check_violation';
  END IF;
  -- The content hash stays NULL until the service-role stamp binds the bytes.
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  INSERT INTO public.service_acceptance_paper_intakes(id, request_id, signer_id, storage_object_id,
    storage_object_version, storage_object_etag, paper_signed_on, signed_name, disposition, conditions, return_reason,
    presented_request_number, presented_scope_content_hash, presented_evidence_manifest_hash,
    presented_signer_policy_revision, client_request_id, request_hash, recorded_by)
  VALUES (v_id, p_request_id, v_signer.id, v_object.id, v_object.version, v_object.metadata->>'eTag',
    p_paper_signed_on, btrim(p_signed_name), p_disposition, v_conditions, NULLIF(btrim(p_return_reason), ''),
    p_presented_request_number, p_presented_scope_content_hash, p_presented_evidence_manifest_hash,
    p_presented_signer_policy_revision, v_key, v_hash, v_uid);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('intakeId', v_id, 'reviewState', 'pending_review', 'documentSha256', NULL::text,
    'replayed', false);
END;
$$;

-- The WP-10C edge function calls this as service_role after it downloads the
-- recorded object version and hashes its bytes. It binds document_sha256 once;
-- a same-value replay returns the receipt.
CREATE OR REPLACE FUNCTION public.stamp_service_acceptance_paper_hash(
  p_intake_id uuid, p_document_sha256 text, p_object_version text, p_object_etag text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_request_id uuid; v_intake public.service_acceptance_paper_intakes%ROWTYPE;
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  -- The service path carries no end-user identity; a signed-in caller never stamps.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_document_sha256 IS NULL OR p_document_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'paper_document_hash_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT request_id INTO v_request_id FROM public.service_acceptance_paper_intakes WHERE id = p_intake_id;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._lock_service_acceptance_request(v_request_id, false);
  SELECT * INTO STRICT v_intake FROM public.service_acceptance_paper_intakes WHERE id = p_intake_id FOR UPDATE;
  IF v_intake.document_sha256 IS NOT NULL THEN
    IF v_intake.document_sha256 = p_document_sha256 AND v_intake.storage_object_version = p_object_version
       AND v_intake.storage_object_etag = p_object_etag THEN
      RETURN jsonb_build_object('intakeId', v_intake.id, 'documentSha256', v_intake.document_sha256,
        'reviewState', v_intake.review_state, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'paper_document_hash_conflict' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_intake.review_state <> 'pending_review' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_object_version IS DISTINCT FROM v_intake.storage_object_version
     OR p_object_etag IS DISTINCT FROM v_intake.storage_object_etag
     OR NOT public._service_acceptance_paper_object_unchanged(v_intake.storage_object_id,
       v_intake.storage_object_version, v_intake.storage_object_etag) THEN
    RAISE EXCEPTION 'paper_document_changed' USING ERRCODE = 'PT409';
  END IF;
  PERFORM set_config('app.service_acceptance_request_id', v_request_id::text, true);
  UPDATE public.service_acceptance_paper_intakes SET document_sha256 = p_document_sha256,
    document_stamped_at = clock_timestamp()
  WHERE id = p_intake_id;
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('intakeId', p_intake_id, 'documentSha256', p_document_sha256,
    'reviewState', 'pending_review', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_service_acceptance_paper_intake(
  p_intake_id uuid, p_decision text, p_expected_document_sha256 text, p_note text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request_id uuid;
  v_request public.service_acceptance_requests%ROWTYPE; v_intake public.service_acceptance_paper_intakes%ROWTYPE;
  v_signer public.service_acceptance_signers%ROWTYPE; v_response_id uuid;
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  SELECT request_id INTO v_request_id FROM public.service_acceptance_paper_intakes WHERE id = p_intake_id;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_request := public._lock_service_acceptance_request(v_request_id, false);
  IF NOT public._is_service_acceptance_studio_admin(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('intakeId', p_intake_id, 'decision', p_decision,
    'expectedDocumentSha256', p_expected_document_sha256, 'note', p_note));
  SELECT * INTO v_intake FROM public.service_acceptance_paper_intakes
  WHERE request_id = v_request_id AND review_client_request_id = v_key;
  IF v_intake.id IS NOT NULL THEN
    IF v_intake.id <> p_intake_id OR v_intake.reviewed_by <> v_uid OR v_intake.review_request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('intakeId', v_intake.id, 'reviewState', v_intake.review_state,
      'responseId', (SELECT id FROM public.service_acceptance_responses WHERE paper_intake_id = v_intake.id),
      'aggregateOutcome', v_request.aggregate_outcome, 'replayed', true);
  END IF;
  SELECT * INTO STRICT v_intake FROM public.service_acceptance_paper_intakes WHERE id = p_intake_id FOR UPDATE;
  IF v_intake.recorded_by = v_uid THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('confirmed','rejected')
     OR (p_decision = 'rejected' AND btrim(COALESCE(p_note, '')) = '') OR length(COALESCE(p_note, '')) > 2000 THEN
    RAISE EXCEPTION 'service_acceptance_review_invalid' USING ERRCODE = 'check_violation';
  END IF;
  IF v_request.lifecycle <> 'sent' OR v_intake.review_state <> 'pending_review' THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- Confirmation binds the stamped bytes; a rejection may proceed unstamped.
  IF p_decision = 'confirmed' AND v_intake.document_sha256 IS NULL THEN
    RAISE EXCEPTION 'paper_document_unstamped' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_expected_document_sha256 IS DISTINCT FROM v_intake.document_sha256
     OR (p_decision = 'confirmed' AND NOT public._service_acceptance_paper_object_unchanged(v_intake.storage_object_id,
       v_intake.storage_object_version, v_intake.storage_object_etag)) THEN
    RAISE EXCEPTION 'paper_document_changed' USING ERRCODE = 'PT409';
  END IF;
  IF p_decision = 'confirmed' THEN
    SELECT * INTO STRICT v_signer FROM public.service_acceptance_signers WHERE id = v_intake.signer_id;
    IF v_signer.status <> 'active' THEN
      RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF v_intake.presented_request_number <> v_request.request_number
       OR v_intake.presented_scope_content_hash <> v_request.scope_content_hash
       OR v_intake.presented_evidence_manifest_hash <> v_request.evidence_manifest_hash
       OR (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) <> 'active' THEN
      RAISE EXCEPTION 'stale_scope' USING ERRCODE = 'PT409';
    END IF;
    IF v_intake.presented_signer_policy_revision <> v_request.signer_policy_revision THEN
      RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
    END IF;
    IF EXISTS (SELECT 1 FROM public.service_acceptance_responses WHERE signer_id = v_signer.id) THEN
      RAISE EXCEPTION 'already_responded' USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  PERFORM set_config('app.service_acceptance_request_id', v_request_id::text, true);
  UPDATE public.service_acceptance_paper_intakes SET review_state = p_decision, reviewed_by = v_uid,
    reviewed_at = clock_timestamp(), review_note = NULLIF(btrim(p_note), ''),
    review_client_request_id = v_key, review_request_hash = v_hash
  WHERE id = p_intake_id;
  IF p_decision = 'confirmed' THEN
    v_response_id := extensions.gen_random_uuid();
    INSERT INTO public.service_acceptance_responses(id, request_id, signer_id, response, conditions, return_reason,
      method, paper_intake_id, presented_scope_content_hash, presented_evidence_manifest_hash,
      presented_signer_policy_revision)
    VALUES (v_response_id, v_request_id, v_intake.signer_id, v_intake.disposition, v_intake.conditions,
      v_intake.return_reason, 'paper_intake', v_intake.id, v_intake.presented_scope_content_hash,
      v_intake.presented_evidence_manifest_hash, v_intake.presented_signer_policy_revision);
    PERFORM public._derive_service_acceptance_outcome(v_request_id);
  END IF;
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('intakeId', p_intake_id, 'reviewState', p_decision, 'responseId', v_response_id,
    'aggregateOutcome', (SELECT aggregate_outcome FROM public.service_acceptance_requests WHERE id = v_request_id),
    'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_service_acceptance_signer(
  p_request_id uuid, p_signer_id uuid, p_new_profile_id uuid, p_new_household_person_id uuid,
  p_expected_signer_policy_revision integer, p_reason text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_signers%ROWTYPE; v_target public.service_acceptance_signers%ROWTYPE;
  v_signers jsonb; v_lapsed uuid[]; v_revision integer; v_new_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_acceptance_request(p_request_id, true);
  IF NOT public._is_service_acceptance_studio_admin(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'signerId', p_signer_id,
    'newProfileId', p_new_profile_id, 'newHouseholdPersonId', p_new_household_person_id,
    'expectedSignerPolicyRevision', p_expected_signer_policy_revision, 'reason', p_reason));
  SELECT * INTO v_existing FROM public.service_acceptance_signers
  WHERE request_id = p_request_id AND replacement_client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.replaced_by <> v_uid OR v_existing.replacement_request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('signerId', v_existing.replaced_by_signer_id,
      'signerPolicyRevision', v_existing.replacement_policy_revision,
      'lapsedIntakeIds', to_jsonb(v_existing.replacement_lapsed_intake_ids), 'replayed', true);
  END IF;
  IF v_request.lifecycle NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_expected_signer_policy_revision IS DISTINCT FROM v_request.signer_policy_revision THEN
    RAISE EXCEPTION 'stale_signer_policy' USING ERRCODE = 'PT409';
  END IF;
  SELECT * INTO v_target FROM public.service_acceptance_signers WHERE id = p_signer_id AND request_id = p_request_id;
  IF v_target.id IS NULL OR v_target.status <> 'active' THEN
    RAISE EXCEPTION 'signer_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' OR length(p_reason) > 2000
     OR (p_new_profile_id IS NULL) = (p_new_household_person_id IS NULL) THEN
    RAISE EXCEPTION 'service_acceptance_replacement_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('slot', s.slot, 'required', s.required, 'profileId', s.profile_id,
      'householdPersonId', s.household_person_id) ORDER BY s.slot)
    || jsonb_build_array(jsonb_build_object('slot', v_target.slot, 'required', v_target.required,
      'profileId', p_new_profile_id, 'householdPersonId', p_new_household_person_id))
    INTO v_signers
  FROM public.service_acceptance_signers s
  WHERE s.request_id = p_request_id AND s.status = 'active' AND s.id <> v_target.id;
  v_signers := COALESCE(v_signers, jsonb_build_array(jsonb_build_object('slot', v_target.slot,
    'required', v_target.required, 'profileId', p_new_profile_id, 'householdPersonId', p_new_household_person_id)));
  PERFORM public._validate_service_acceptance_signers(
    (SELECT source_proposal_id FROM public.project_scope_editions WHERE id = v_request.scope_edition_id), v_signers);
  v_revision := v_request.signer_policy_revision + 1;
  v_lapsed := public._lapse_service_acceptance_intakes(p_request_id, 'signer_policy_revised');
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  -- One statement: the active-slot index sees the old signer retired before
  -- the insert, and the self-FK sees the new signer at statement end.
  WITH retired AS (
    UPDATE public.service_acceptance_signers SET status = 'replaced', replaced_by_signer_id = v_new_id,
      replacement_reason = btrim(p_reason), replaced_by = v_uid, replaced_at = clock_timestamp(),
      replacement_client_request_id = v_key, replacement_request_hash = v_hash,
      replacement_policy_revision = v_revision, replacement_lapsed_intake_ids = v_lapsed
    WHERE id = v_target.id RETURNING id
  )
  INSERT INTO public.service_acceptance_signers(id, request_id, slot, required, profile_id, household_person_id,
    policy_slot)
  SELECT v_new_id, p_request_id, v_target.slot, v_target.required, p_new_profile_id, p_new_household_person_id,
    v_target.policy_slot
  FROM (SELECT count(*) FROM retired) dependency;
  UPDATE public.service_acceptance_requests SET signer_policy_revision = v_revision WHERE id = p_request_id;
  PERFORM public._derive_service_acceptance_outcome(p_request_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('signerId', v_new_id, 'signerPolicyRevision', v_revision,
    'lapsedIntakeIds', to_jsonb(v_lapsed), 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_service_acceptance_request(p_request_id uuid, p_reason text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_acceptance_request(p_request_id, true);
  IF v_uid IS NULL OR NOT public.can_compose_project_plan(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id, 'reason', p_reason));
  IF v_request.withdraw_client_request_id = v_key THEN
    IF v_request.withdrawn_by <> v_uid OR v_request.withdraw_request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('requestId', v_request.id, 'lifecycle', v_request.lifecycle,
      'withdrawnAt', v_request.withdrawn_at, 'replayed', true);
  END IF;
  IF v_request.lifecycle NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'service_acceptance_withdraw_invalid' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.service_acceptance_request_id', p_request_id::text, true);
  UPDATE public.service_acceptance_requests SET lifecycle = 'withdrawn', withdrawn_by = v_uid,
    withdrawn_at = clock_timestamp(), withdraw_reason = btrim(p_reason), withdraw_client_request_id = v_key,
    withdraw_request_hash = v_hash
  WHERE id = p_request_id RETURNING * INTO v_request;
  PERFORM public._lapse_service_acceptance_intakes(p_request_id, 'request_terminal');
  PERFORM public.resolve_outbound_drafts('service_acceptance_request', p_request_id);
  PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('requestId', v_request.id, 'lifecycle', v_request.lifecycle,
    'withdrawnAt', v_request.withdrawn_at, 'replayed', false);
END;
$$;

-- V22 after-send hook: the first after_send_done_at on a delivered draft marks
-- its draft-lifecycle request sent, once.
CREATE OR REPLACE FUNCTION public._service_acceptance_after_send()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous_marker text := current_setting('app.service_acceptance_request_id', true);
BEGIN
  PERFORM 1 FROM public.service_acceptance_requests
  WHERE id = NEW.ref_id AND outbound_draft_id = NEW.id AND lifecycle = 'draft' AND sent_at IS NULL FOR UPDATE;
  IF FOUND THEN
    PERFORM set_config('app.service_acceptance_request_id', NEW.ref_id::text, true);
    UPDATE public.service_acceptance_requests SET lifecycle = 'sent', sent_at = NEW.delivered_at
    WHERE id = NEW.ref_id AND lifecycle = 'draft' AND sent_at IS NULL;
    PERFORM set_config('app.service_acceptance_request_id', COALESCE(previous_marker, ''), true);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS service_acceptance_after_send ON public.outbound_drafts;
CREATE TRIGGER service_acceptance_after_send AFTER UPDATE OF after_send_done_at ON public.outbound_drafts
  FOR EACH ROW WHEN (NEW.kind = 'service_acceptance_request' AND NEW.ref_type = 'service_acceptance_request'
    AND OLD.after_send_done_at IS NULL AND NEW.after_send_done_at IS NOT NULL AND NEW.delivered_at IS NOT NULL)
  EXECUTE FUNCTION public._service_acceptance_after_send();

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_project_service_acceptance(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id)
     OR NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId', p_project_id,
    'capability', CASE WHEN COALESCE((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), false)
      THEN 'active' ELSE 'inactive' END,
    'requests', COALESCE((SELECT jsonb_agg(public._service_acceptance_request_json(r.id, true)
        ORDER BY r.request_number DESC)
      FROM public.service_acceptance_requests r WHERE r.project_id = p_project_id), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_service_acceptance_requests()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(public._service_acceptance_request_json(r.id, false) || jsonb_build_object(
      'viewerRole', CASE WHEN mine.required THEN 'signer_required' WHEN mine.id IS NOT NULL THEN 'signer_optional'
        ELSE 'observer' END,
      'viewerSignerId', mine.id) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
  FROM public.service_acceptance_requests r
  JOIN public.projects p ON p.id = r.project_id
  LEFT JOIN public.service_acceptance_signers mine
    ON mine.request_id = r.id AND mine.status = 'active' AND mine.profile_id = auth.uid()
  WHERE auth.uid() IS NOT NULL AND r.sent_at IS NOT NULL AND (mine.id IS NOT NULL OR p.client_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- C2 supersession grafts (§2.5, C2 §2.5 and §2.8 F8)
-- ---------------------------------------------------------------------------

-- Grafted from 00883_round8_external_reader_parity.sql (lineage 00869 -> 00883).
CREATE OR REPLACE FUNCTION public._mint_scope_edition(p_document_id uuid, p_predecessor_id uuid DEFAULT NULL, p_reconciled boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc public.project_commercial_documents%ROWTYPE; proposal public.proposals%ROWTYPE;
  predecessor public.project_scope_editions%ROWTYPE; client_signature public.commercial_document_signatures%ROWTYPE;
  studio_signature public.commercial_document_signatures%ROWTYPE;
  v_edition_id uuid := extensions.gen_random_uuid(); v_edition_number integer; parts jsonb;
  packages jsonb; phases jsonb; policy jsonb; content jsonb; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id = p_document_id;
  PERFORM 1 FROM public.projects WHERE id = doc.project_id FOR UPDATE;
  SELECT * INTO STRICT proposal FROM public.proposals WHERE id = doc.proposal_id FOR UPDATE;
  IF NOT public.can_author_scope_proposal(proposal.id) OR NOT public.can_compose_project_plan(doc.project_id)
     OR (proposal.studio_id IS NOT NULL AND proposal.studio_id IS DISTINCT FROM
         (SELECT studio_id FROM public.projects WHERE id = doc.project_id)) THEN
    RAISE EXCEPTION 'scope_edition_tenant_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO doc FROM public.project_commercial_documents
  WHERE id=p_document_id AND project_id=doc.project_id AND proposal_id=proposal.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scope_execution_document_moved' USING ERRCODE = 'PT409'; END IF;
  SELECT id INTO v_edition_id FROM public.project_scope_editions WHERE commercial_document_id = doc.id;
  IF FOUND THEN RETURN v_edition_id; END IF;
  v_edition_id := extensions.gen_random_uuid();
  SELECT execution_seq INTO seq FROM public.project_commercial_execution_order
  WHERE project_id = doc.project_id AND commercial_document_id = doc.id;
  IF seq IS NULL THEN RAISE EXCEPTION 'scope_execution_order_missing' USING ERRCODE = 'check_violation'; END IF;
  IF doc.document_kind NOT IN ('design_services','design_build','service_addendum')
     OR proposal.commercial_state <> 'executed' OR doc.executed_at IS NULL
     OR proposal.document_kind IS DISTINCT FROM doc.document_kind
     OR (proposal.project_id IS NOT NULL AND proposal.project_id <> doc.project_id) THEN
    RAISE EXCEPTION 'scope_execution_document_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO predecessor FROM public.project_scope_editions
  WHERE project_id = doc.project_id AND ((p_predecessor_id IS NULL AND status = 'active') OR id = p_predecessor_id)
  FOR UPDATE;
  IF NOT doc.is_origin AND (predecessor.id IS NULL OR predecessor.status NOT IN ('active','stale')
     OR (NOT p_reconciled AND (predecessor.status <> 'active'
        OR proposal.drafted_against_scope_edition_id IS DISTINCT FROM predecessor.id))) THEN
    RAISE EXCEPTION 'scope_edition_stale' USING ERRCODE = 'PT409';
  END IF;
  IF doc.is_origin AND EXISTS (SELECT 1 FROM public.project_scope_editions WHERE project_id = doc.project_id) THEN
    RAISE EXCEPTION 'scope_edition_origin_exists' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO client_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'client';
  SELECT * INTO studio_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'studio';
  IF client_signature.id IS NULL OR studio_signature.id IS NULL
     OR client_signature.signer_user_id IS DISTINCT FROM proposal.client_id
     OR client_signature.evidence_fingerprint IS DISTINCT FROM public._commercial_document_fingerprint(proposal.id)
     OR studio_signature.evidence_fingerprint IS DISTINCT FROM client_signature.evidence_fingerprint THEN
    RAISE EXCEPTION 'scope_edition_signature_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position),'[]') INTO parts
  FROM public.proposal_agreement_parts WHERE proposal_id = proposal.id;
  PERFORM public._normalize_scope_package_parts(proposal.id,parts);
  IF EXISTS (SELECT 1 FROM public.project_scope_edition_packages old WHERE old.edition_id = predecessor.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind' = 'scope_package'
      AND p->'payload'->>'packageKey' = old.package_key)) THEN
    RAISE EXCEPTION 'scope_edition_package_dropped' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT doc.is_origin THEN
    PERFORM public._assert_scope_external_amendment(doc.project_id,parts);
  END IF;
  v_edition_number := COALESCE(predecessor.edition_number,0) + 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'package_key',p->>'packageKey','label',p->>'label','room_ids',COALESCE(p->'roomIds','[]'),
    'inclusion',p->>'inclusion','condition_text',p->>'conditionText','responsibilities',p->'responsibilities',
    'provenance',COALESCE(p->'provenance','{}'),'override_of',p->>'overrideOf',
    'design_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'design'='studio'
       THEN COALESCE(old.design_owed_since,v_edition_number) END,
    'installation_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'installation'='studio'
       THEN COALESCE(old.installation_owed_since,v_edition_number) END) ORDER BY p->>'packageKey'),'[]') INTO packages
  FROM (SELECT value->'payload' p FROM jsonb_array_elements(parts) WHERE value->>'kind'='scope_package') new
  LEFT JOIN public.project_scope_edition_packages old ON old.edition_id=predecessor.id AND old.package_key=p->>'packageKey';
  IF doc.is_origin AND EXISTS (
    SELECT 1 FROM public.proposal_phases pp WHERE pp.proposal_id=proposal.id AND
      (SELECT count(*) FROM public.project_phases jp WHERE jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id) <> 1
  ) THEN RAISE EXCEPTION 'scope_edition_phase_unbound' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(binding) ORDER BY source_proposal_phase_id),'[]') INTO phases FROM (
    SELECT source_proposal_phase_id, project_phase_id,package_key,service_slot,bound_in_edition
    FROM public.project_scope_edition_phases WHERE edition_id=predecessor.id
    UNION ALL
    SELECT pp.id, CASE WHEN doc.is_origin THEN jp.id END, b.package_key,b.service_slot,
      CASE WHEN b.package_key IS NOT NULL THEN v_edition_number END
    FROM public.proposal_phases pp
    LEFT JOIN public.project_phases jp ON doc.is_origin AND jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id
    LEFT JOIN (
      SELECT p->'payload'->>'packageKey' package_key, s.key service_slot, phase.value::text::uuid phase_id
      FROM jsonb_array_elements(parts) p
      CROSS JOIN LATERAL jsonb_each(COALESCE(p->'payload'->'serviceBindings','{}')) s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.value) phase
      WHERE p->>'kind'='scope_package'
    ) b ON b.phase_id=pp.id WHERE pp.proposal_id=proposal.id
  ) binding;
  SELECT p->'payload' INTO policy FROM jsonb_array_elements(parts) p WHERE p->>'kind'='acceptance_signer_policy';
  content := jsonb_build_object('packagesRecorded',EXISTS(SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind'='scope_package'),
    'packages',packages,'phases',phases,'signerPolicy',policy,'reconciled',p_reconciled);
  PERFORM set_config('app.scope_edition_id',COALESCE(predecessor.id::text,''),true);
  -- One statement lets the immediate self-FK see the new successor while the
  -- one-active index sees the predecessor retired before the INSERT.
  WITH retired AS (
    UPDATE public.project_scope_editions SET status='superseded',superseded_at=studio_signature.signed_at,
      superseded_by_edition_id=v_edition_id WHERE id=predecessor.id RETURNING id
  )
  INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,
    predecessor_edition_id,agreement_fingerprint,effective_at,content,content_hash,status)
  SELECT v_edition_id,doc.project_id,v_edition_number,CASE WHEN doc.is_origin THEN 'baseline' ELSE 'amendment' END,
    doc.id,proposal.id,predecessor.id,client_signature.evidence_fingerprint,studio_signature.signed_at,
    content,encode(extensions.digest(convert_to(content::text,'UTF8'),'sha256'),'hex'),'active'
  FROM (SELECT count(*) FROM retired) dependency;
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  -- C4 (00886): a material scope change supersedes every open acceptance request.
  IF predecessor.id IS NOT NULL THEN
    PERFORM public._supersede_service_acceptance_requests(predecessor.id,'scope_edition_superseded');
  END IF;
  INSERT INTO public.project_scope_edition_packages
    (edition_id,package_key,label,room_ids,inclusion,condition_text,responsibilities,provenance,override_of,design_owed_since,installation_owed_since)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(packages) AS p(package_key text,label text,room_ids uuid[],inclusion text,
    condition_text text,responsibilities jsonb,provenance jsonb,override_of text,design_owed_since integer,installation_owed_since integer);
  INSERT INTO public.project_scope_edition_phases(edition_id,source_proposal_phase_id,project_phase_id,package_key,service_slot,bound_in_edition)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(phases) AS p(source_proposal_phase_id uuid,project_phase_id uuid,package_key text,service_slot text,bound_in_edition integer);
  INSERT INTO public.project_scope_edition_signers(edition_id,slot,required,profile_id,household_person_id,policy_revision)
  SELECT v_edition_id,s->>'slot',(s->>'required')::boolean,(s->>'profileId')::uuid,(s->>'householdPersonId')::uuid,(policy->>'policyRevision')::integer
  FROM jsonb_array_elements(COALESCE(policy->'signers','[]')) s;
  RETURN v_edition_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._mint_scope_edition(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;

-- Grafted from 00869_round8_scope_execution.sql.
CREATE OR REPLACE FUNCTION public._scope_after_execution(p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE doc public.project_commercial_documents%ROWTYPE; edition uuid; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  seq := public._record_scope_execution(p_document_id);
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id=p_document_id;
  SELECT id INTO edition FROM public.project_scope_editions WHERE project_id=doc.project_id AND status='active' FOR UPDATE;
  IF COALESCE((SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'),false) THEN
    PERFORM public._mint_scope_edition(doc.id);
  ELSIF NOT doc.is_origin AND edition IS NOT NULL THEN
    PERFORM set_config('app.scope_edition_id',edition::text,true);
    UPDATE public.project_scope_editions SET status='stale',stale_at=clock_timestamp(),stale_reason='amended_while_inactive',
      stale_commercial_document_id=doc.id,stale_execution_seq=seq WHERE id=edition;
    -- C4 (00886): a stale edition supersedes its open acceptance requests.
    PERFORM public._supersede_service_acceptance_requests(edition,'scope_edition_stale');
    PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._scope_after_execution(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants: inactive. Mutations and helpers are granted to no one.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._guard_service_acceptance_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._guard_service_acceptance_child() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._guard_recorded_service_acceptance_paper() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_key(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_hash(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._is_service_acceptance_studio_admin(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_conditions(text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._validate_service_acceptance_signers(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._lock_service_acceptance_request(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._lapse_service_acceptance_intakes(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._supersede_service_acceptance_request(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._supersede_service_acceptance_requests(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_pending_required(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._derive_service_acceptance_outcome(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_paper_object_unchanged(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_request_json(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_create_receipt(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_response_receipt(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_after_send() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_service_acceptance(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_service_acceptance_requests() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_service_acceptance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_service_acceptance_requests() TO authenticated;
