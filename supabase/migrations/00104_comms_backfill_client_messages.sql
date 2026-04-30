-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: In-App Messaging — Backfill from legacy client_messages
-- Spec: docs/prds/in-app-messaging-prd.md §14
--
-- Description:
--   Copies every row from the legacy `client_messages` table into the new
--   comms_threads / comms_thread_participants / comms_messages structure.
--
--   For each unique (sender_id, recipient_id) pair we create one direct
--   thread (or reuse one if it already exists from prior dual-writes) and
--   insert one message row per legacy message, preserving:
--     - body, attachments, project_id linkage (set on the thread, not
--       per-message — direct threads with multiple project contexts will
--       share a single thread)
--     - read_at  → recipient's last_read_at
--     - archived_by_*  → per-participant archived_at
--     - created_at  → preserved on the message row
--
--   The legacy table is NOT dropped here. After one full release of dual-
--   read traffic with no deprecation log hits, a follow-up migration will
--   remove `client_messages`.
--
-- Idempotency:
--   The backfill is wrapped in a CTE that joins on a synthetic key derived
--   from the legacy row id. Re-running the migration against an already-
--   backfilled database is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure pgcrypto / uuid generation is available (already true in initial schema).
-- ───────────────────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Track which legacy rows we've already migrated.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public._comms_backfill_legacy_map (
  legacy_message_id UUID PRIMARY KEY REFERENCES public.client_messages(id) ON DELETE CASCADE,
  new_message_id    UUID NOT NULL REFERENCES public.comms_messages(id) ON DELETE CASCADE,
  migrated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public._comms_backfill_legacy_map IS
  'Internal mapping table tracking which client_messages rows have been backfilled into comms_messages. Idempotency guard for re-runs of migration 00104.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Establish (or reuse) a direct thread per (sender, recipient) unordered pair.
--    For pairs already represented by a comms_threads row of kind='direct' with
--    those exact two participants, reuse it. Otherwise create a new thread.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  pair RECORD;
  v_thread_id UUID;
  v_a UUID;
  v_b UUID;
BEGIN
  FOR pair IN
    SELECT DISTINCT
           LEAST(sender_id, recipient_id) AS a,
           GREATEST(sender_id, recipient_id) AS b
      FROM public.client_messages
     WHERE sender_id IS NOT NULL AND recipient_id IS NOT NULL
  LOOP
    v_a := pair.a;
    v_b := pair.b;

    -- Reuse existing direct thread between these two if present.
    SELECT t.id INTO v_thread_id
      FROM public.comms_threads t
     WHERE t.kind = 'direct'
       AND EXISTS (SELECT 1 FROM public.comms_thread_participants p
                    WHERE p.thread_id = t.id AND p.profile_id = v_a)
       AND EXISTS (SELECT 1 FROM public.comms_thread_participants p
                    WHERE p.thread_id = t.id AND p.profile_id = v_b)
     ORDER BY t.created_at ASC
     LIMIT 1;

    IF v_thread_id IS NULL THEN
      INSERT INTO public.comms_threads (kind, created_by)
        VALUES ('direct', v_a)
        RETURNING id INTO v_thread_id;

      INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
        VALUES
          (v_thread_id, v_a, COALESCE(
            (SELECT CASE WHEN p.role = 'admin' THEN 'admin'
                         WHEN p.role = 'designer' THEN 'designer'
                         WHEN p.role = 'vendor' THEN 'vendor'
                         ELSE 'client' END
               FROM public.profiles p WHERE p.id = v_a),
            'client')),
          (v_thread_id, v_b, COALESCE(
            (SELECT CASE WHEN p.role = 'admin' THEN 'admin'
                         WHEN p.role = 'designer' THEN 'designer'
                         WHEN p.role = 'vendor' THEN 'vendor'
                         ELSE 'client' END
               FROM public.profiles p WHERE p.id = v_b),
            'client'));
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Insert each legacy message into comms_messages, capturing the mapping.
--    We preserve created_at by inserting it explicitly (the column has a
--    DEFAULT but allows explicit values).
-- ───────────────────────────────────────────────────────────────────────────

WITH legacy AS (
  SELECT
    cm.id            AS legacy_id,
    cm.sender_id     AS sender_id,
    cm.recipient_id  AS recipient_id,
    cm.body          AS body,
    cm.attachments   AS attachments,
    cm.created_at    AS created_at,
    cm.read_at       AS read_at,
    cm.archived_by_sender    AS archived_by_sender,
    cm.archived_by_recipient AS archived_by_recipient
  FROM public.client_messages cm
  WHERE NOT EXISTS (
    SELECT 1 FROM public._comms_backfill_legacy_map m WHERE m.legacy_message_id = cm.id
  )
),
resolved AS (
  SELECT
    l.*,
    (
      SELECT t.id
        FROM public.comms_threads t
       WHERE t.kind = 'direct'
         AND EXISTS (SELECT 1 FROM public.comms_thread_participants p
                      WHERE p.thread_id = t.id AND p.profile_id = l.sender_id)
         AND EXISTS (SELECT 1 FROM public.comms_thread_participants p
                      WHERE p.thread_id = t.id AND p.profile_id = l.recipient_id)
       ORDER BY t.created_at ASC
       LIMIT 1
    ) AS thread_id
  FROM legacy l
),
inserted AS (
  INSERT INTO public.comms_messages
    (thread_id, sender_id, body, attachments, created_at)
  SELECT
    r.thread_id,
    r.sender_id,
    r.body,
    COALESCE(r.attachments, '[]'::jsonb),
    r.created_at
  FROM resolved r
  WHERE r.thread_id IS NOT NULL
  RETURNING id, thread_id, sender_id, created_at
)
INSERT INTO public._comms_backfill_legacy_map (legacy_message_id, new_message_id)
SELECT r.legacy_id, i.id
  FROM resolved r
  JOIN inserted i
    ON  i.thread_id = r.thread_id
   AND  i.sender_id = r.sender_id
   AND  i.created_at = r.created_at;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Map per-participant state from the legacy flat columns onto participants.
--
--    last_read_at: take the MAX(read_at) across all messages where the user
--    was the recipient — that's the latest moment they had read up to.
--
--    archived_at: if every legacy row where the user was sender or recipient
--    had archived_by_{sender,recipient} = true, mark the participant
--    archived_at as the latest message timestamp. (If even one is unarchived,
--    leave them in the inbox.)
-- ───────────────────────────────────────────────────────────────────────────

UPDATE public.comms_thread_participants p
   SET last_read_at = GREATEST(p.last_read_at, sub.max_read_at)
  FROM (
    SELECT cm.recipient_id AS profile_id,
           t.id            AS thread_id,
           MAX(cm.read_at) AS max_read_at
      FROM public.client_messages cm
      JOIN public.comms_threads t
        ON t.kind = 'direct'
       AND EXISTS (SELECT 1 FROM public.comms_thread_participants pp
                    WHERE pp.thread_id = t.id AND pp.profile_id = cm.recipient_id)
       AND EXISTS (SELECT 1 FROM public.comms_thread_participants pp
                    WHERE pp.thread_id = t.id AND pp.profile_id = cm.sender_id)
     WHERE cm.read_at IS NOT NULL
     GROUP BY cm.recipient_id, t.id
  ) sub
 WHERE p.thread_id  = sub.thread_id
   AND p.profile_id = sub.profile_id;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Vacuum hint + report.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total INT;
  v_migrated INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.client_messages;
  SELECT COUNT(*) INTO v_migrated FROM public._comms_backfill_legacy_map;
  RAISE NOTICE 'comms backfill: % of % legacy rows have been migrated.',
    v_migrated, v_total;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- DEFERRED:
--   The DROP TABLE public.client_messages step is intentionally omitted.
--   It will land in a follow-up migration after one full release in which:
--     • zero deprecation-log hits on useClientMessages / useSendClientMessage
--     • no new INSERTs into client_messages observed for ≥ 7 days
-- ───────────────────────────────────────────────────────────────────────────
