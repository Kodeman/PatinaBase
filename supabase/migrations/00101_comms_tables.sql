-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: In-App Messaging — Tables, Indexes, Activity Trigger
-- Spec: docs/prds/in-app-messaging-prd.md §9
-- Description:
--   Introduces the comms_* tables that replace the legacy `client_messages`
--   flat model and the phantom `comms` microservice. v1 supports designer↔
--   client/vendor direct threads and project group threads, with attachments,
--   per-participant read state, and inline decision-card linkage.
--
--   Legacy `client_messages` is preserved (read-only at the data layer) and
--   will be backfilled into this model in a follow-up migration (Phase 7).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. comms_threads
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comms_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL
                    CHECK (kind IN ('direct','project','vendor_brief','support')),
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  proposal_id     UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  title           TEXT,
  created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- project threads must always be tied to a project
  CONSTRAINT comms_threads_project_kind_link
    CHECK (kind <> 'project' OR project_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_comms_threads_project
  ON public.comms_threads(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comms_threads_proposal
  ON public.comms_threads(proposal_id)
  WHERE proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comms_threads_last_message
  ON public.comms_threads(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_comms_threads_kind
  ON public.comms_threads(kind);

COMMENT ON TABLE public.comms_threads IS
  'In-app messaging threads. kind=direct (1:1), project (group, requires project_id), vendor_brief (designer↔vendor), support (admin).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. comms_thread_participants
--    Join row carrying per-user state on a thread (read, archive, mute, prefs).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comms_thread_participants (
  thread_id          UUID NOT NULL REFERENCES public.comms_threads(id) ON DELETE CASCADE,
  profile_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role               TEXT NOT NULL
                       CHECK (role IN ('designer','client','vendor','admin')),
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at            TIMESTAMPTZ,
  last_read_at       TIMESTAMPTZ NOT NULL DEFAULT 'epoch'::TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ,
  muted_at           TIMESTAMPTZ,
  notification_pref  TEXT NOT NULL DEFAULT 'all'
                       CHECK (notification_pref IN ('all','mentions','none')),

  PRIMARY KEY (thread_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_comms_participants_profile_inbox
  ON public.comms_thread_participants(profile_id, last_read_at)
  WHERE archived_at IS NULL AND left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comms_participants_thread
  ON public.comms_thread_participants(thread_id)
  WHERE left_at IS NULL;

COMMENT ON TABLE public.comms_thread_participants IS
  'Per-thread per-user state. Membership is gated by RLS via this table.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. comms_messages
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comms_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL REFERENCES public.comms_threads(id) ON DELETE CASCADE,
  sender_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body                TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 16000),
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to_message_id UUID REFERENCES public.comms_messages(id) ON DELETE SET NULL,
  decision_id         UUID REFERENCES public.client_decisions(id) ON DELETE SET NULL,
  mentions            UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  system              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at           TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,

  -- system messages have no human author
  CONSTRAINT comms_messages_system_or_sender
    CHECK ((system AND sender_id IS NULL) OR (NOT system AND sender_id IS NOT NULL)),

  -- attachments JSON must be an array
  CONSTRAINT comms_messages_attachments_array
    CHECK (jsonb_typeof(attachments) = 'array'),

  -- per-message attachment count cap (PRD §3: 4 / message)
  CONSTRAINT comms_messages_attachment_count
    CHECK (jsonb_array_length(attachments) <= 4)
);

CREATE INDEX IF NOT EXISTS idx_comms_messages_thread_created
  ON public.comms_messages(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comms_messages_sender
  ON public.comms_messages(sender_id)
  WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comms_messages_decision
  ON public.comms_messages(decision_id)
  WHERE decision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comms_messages_mentions
  ON public.comms_messages USING GIN(mentions);

COMMENT ON TABLE public.comms_messages IS
  'Messages within a thread. system=true messages are emitted by the platform (joins/leaves, decision events) and have no sender.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. comms_quick_replies
--    Per-designer reply templates surfaced in the QuickReplyBar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comms_quick_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label       TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comms_quick_replies_profile
  ON public.comms_quick_replies(profile_id, position);

COMMENT ON TABLE public.comms_quick_replies IS
  'Per-user message templates. Designer-side QuickReplyBar; clients may use later.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. updated_at touch triggers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.comms_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comms_threads_touch_updated_at ON public.comms_threads;
CREATE TRIGGER comms_threads_touch_updated_at
BEFORE UPDATE ON public.comms_threads
FOR EACH ROW EXECUTE FUNCTION public.comms_touch_updated_at();

DROP TRIGGER IF EXISTS comms_quick_replies_touch_updated_at ON public.comms_quick_replies;
CREATE TRIGGER comms_quick_replies_touch_updated_at
BEFORE UPDATE ON public.comms_quick_replies
FOR EACH ROW EXECUTE FUNCTION public.comms_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Activity bump: keep comms_threads.last_message_at in sync
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.comms_bump_thread_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.comms_threads
     SET last_message_at = NEW.created_at,
         updated_at      = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comms_messages_bump_activity ON public.comms_messages;
CREATE TRIGGER comms_messages_bump_activity
AFTER INSERT ON public.comms_messages
FOR EACH ROW EXECUTE FUNCTION public.comms_bump_thread_activity();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Participant cardinality enforcement
--
--   `direct` and `vendor_brief` threads must contain exactly two distinct
--   participants. We enforce this via a CONSTRAINT TRIGGER deferred to the
--   end of the transaction, so the thread + both participant rows can be
--   inserted in any order within a single tx (RPCs depend on this).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.comms_check_thread_cardinality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_thread_id UUID;
  v_kind      TEXT;
  v_count     INT;
BEGIN
  -- Identify the thread we're validating, depending on which table fired us.
  IF (TG_TABLE_NAME = 'comms_threads') THEN
    v_thread_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_thread_id := COALESCE(NEW.thread_id, OLD.thread_id);
  END IF;

  SELECT kind INTO v_kind FROM public.comms_threads WHERE id = v_thread_id;
  IF v_kind IS NULL THEN
    -- thread was deleted in this tx; nothing to enforce
    RETURN NULL;
  END IF;

  IF v_kind IN ('direct','vendor_brief') THEN
    SELECT COUNT(DISTINCT profile_id) INTO v_count
      FROM public.comms_thread_participants
     WHERE thread_id = v_thread_id
       AND left_at IS NULL;

    IF v_count <> 2 THEN
      RAISE EXCEPTION
        '% thread % must have exactly 2 active participants (found %)',
        v_kind, v_thread_id, v_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS comms_threads_cardinality ON public.comms_threads;
CREATE CONSTRAINT TRIGGER comms_threads_cardinality
AFTER INSERT OR UPDATE ON public.comms_threads
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.comms_check_thread_cardinality();

DROP TRIGGER IF EXISTS comms_participants_cardinality ON public.comms_thread_participants;
CREATE CONSTRAINT TRIGGER comms_participants_cardinality
AFTER INSERT OR UPDATE OR DELETE ON public.comms_thread_participants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.comms_check_thread_cardinality();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Enable RLS now; policies land in 00102_comms_rls.sql.
--    Without policies + RLS enabled, the tables are unreadable to anyone
--    other than service_role — safe default while the next migration lands.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.comms_threads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_thread_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_quick_replies        ENABLE ROW LEVEL SECURITY;
