-- ═══════════════════════════════════════════════════════════════════════════
-- 00581 — The First Letter: a render snapshot for a studio's client letter
--
-- INTENT. A homeowner's first contact stops being GoTrue's generic invite and
-- becomes a letter the studio wrote. The letter must be reproducible byte for
-- byte on the token page days later, so everything it says is FROZEN here at
-- send: who signed it, which studio, which city, which project, the subject and
-- the standing sentence as rendered. Nothing on the token page is read from a
-- mutable profile, project, membership, or organization row. Precedent and
-- rationale: 00388_proposal_send_dispatch_guard.sql's dispatch snapshot.
--
-- ADDITIVE ONLY. New nullable columns, one CHECK, one index, one column on
-- project_notes, one SECURITY DEFINER read. No drops, no data movement, no new
-- table, and no change to client_invitations' existing RLS — its policies are
-- column-agnostic and already cover every column added here. Same shape as
-- 00560_invite_handoff_note.sql, which this file copies deliberately.
--
-- Lineage: no function is redefined here. public.client_invitation_status is new.
--
-- STATUS IS NOT A COLUMN. It is notification_log.status/opened_at joined
-- through email_log_id, plus accepted_at/expires_at on our own row. Duplicating
-- provider status into a second table is how the two drift.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The snapshot ───────────────────────────────────────────────────────────
ALTER TABLE public.client_invitations
  -- The missing join: today client_invitations and designer_clients do not
  -- know about each other, so a People Room row cannot find its own letter.
  ADD COLUMN IF NOT EXISTS designer_client_id uuid
    REFERENCES public.designer_clients(id) ON DELETE SET NULL,
  -- 'notice' is R13's already-has-account letter: same snapshot, same status
  -- rail, nothing to accept.
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'invite',
  ADD COLUMN IF NOT EXISTS recipient_name         text,
  ADD COLUMN IF NOT EXISTS sender_display_name    text,
  ADD COLUMN IF NOT EXISTS designer_given_name    text,
  ADD COLUMN IF NOT EXISTS designer_full_name     text,
  ADD COLUMN IF NOT EXISTS studio_name            text,
  ADD COLUMN IF NOT EXISTS studio_logo_url        text,
  ADD COLUMN IF NOT EXISTS signature_city         text,
  ADD COLUMN IF NOT EXISTS project_name           text,
  ADD COLUMN IF NOT EXISTS rendered_subject       text,
  -- R6: the token page prints this sentence word for word. Stored rather than
  -- recomposed so the page cannot disagree with the letter even if the
  -- composer changes underneath it.
  ADD COLUMN IF NOT EXISTS rendered_standing_sentence text,
  ADD COLUMN IF NOT EXISTS email_log_id           uuid,
  ADD COLUMN IF NOT EXISTS provider_idempotency_key text,
  ADD COLUMN IF NOT EXISTS last_sent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS resend_count           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS superseded_by          uuid
    REFERENCES public.client_invitations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at             timestamptz,
  -- R11: any studio member may write; the studio owner signs.
  ADD COLUMN IF NOT EXISTS signer_id              uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS writer_id              uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_invitations_kind_check'
       AND conrelid = 'public.client_invitations'::regclass
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_kind_check
      CHECK (kind IN ('invite', 'notice'));
  END IF;

  -- R4: the cap is a length, not a preference. Enforced here as well as in the
  -- composer and the route, so no caller can write a letter the reader cannot
  -- take in. Confirmed 0 rows over 280 on Strata before this shipped.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_invitations_personal_message_len'
       AND conrelid = 'public.client_invitations'::regclass
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_personal_message_len
      CHECK (personal_message IS NULL OR char_length(personal_message) <= 280);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_email_log
  ON public.client_invitations(email_log_id) WHERE email_log_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_idem_key
  ON public.client_invitations(provider_idempotency_key)
  WHERE provider_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_invitations_designer_client
  ON public.client_invitations(designer_client_id);

COMMENT ON COLUMN public.client_invitations.rendered_standing_sentence IS
  '00581: the letter''s system sentence, frozen at send. The token page prints '
  'this verbatim so the email and the page cannot say different words.';

-- ── The frozen byline on a seeded note (R8) ────────────────────────────────
-- The note the designer wrote becomes the house's first standing note. Its
-- byline is FROZEN — a studio that renames itself must not silently relabel a
-- letter it sent last month. TheNote prefers this over the live studio name
-- whenever it is present. Nullable: every existing note keeps live resolution.
ALTER TABLE public.project_notes
  ADD COLUMN IF NOT EXISTS author_byline text;

COMMENT ON COLUMN public.project_notes.author_byline IS
  '00581: a byline frozen at write time, e.g. "Leah Hartwell · Middle West '
  'Studio · 8 September". When set, the client page signs the note with this '
  'and never with a live-resolved studio name.';

-- No GRANT is needed for the new columns: project_notes already carries
-- table-level GRANT SELECT, INSERT to authenticated and GRANT ALL to
-- service_role (00565). The column-scoped UPDATE grant deliberately omits
-- author_byline, so a studio member cannot rewrite a byline after the fact.

-- ── The one read a designer needs (L4) ─────────────────────────────────────
-- notification_log's policies are ADDRESSEE-scoped (00562 grants the addressed
-- user the opened-mark), not sender-scoped, so a designer joining to it under
-- her own JWT would silently read nothing. SECURITY DEFINER, restricted to the
-- caller's own invitations, is the narrowest thing that answers the question.
CREATE OR REPLACE FUNCTION public.client_invitation_status(
  p_designer_client_id uuid
)
RETURNS TABLE (state text, at timestamptz, invitation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT ci.*
      FROM public.client_invitations ci
     WHERE ci.designer_client_id = p_designer_client_id
       AND ci.designer_id = (select auth.uid())
       AND ci.superseded_by IS NULL
       AND ci.revoked_at IS NULL
     ORDER BY ci.sent_at DESC
     LIMIT 1
  )
  SELECT
    CASE
      WHEN l.accepted_at IS NOT NULL                     THEN 'accepted'
      WHEN l.expires_at < now()                          THEN 'lapsed'
      WHEN nl.opened_at IS NOT NULL                      THEN 'opened'
      ELSE                                                    'sent'
    END AS state,
    CASE
      WHEN l.accepted_at IS NOT NULL                     THEN l.accepted_at
      WHEN l.expires_at < now()                          THEN l.expires_at
      WHEN nl.opened_at IS NOT NULL                      THEN nl.opened_at
      ELSE COALESCE(l.last_sent_at, l.sent_at)
    END AS at,
    l.id AS invitation_id
  FROM latest l
  LEFT JOIN public.notification_log nl ON nl.id = l.email_log_id;
$$;

REVOKE EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.client_invitation_status(uuid) IS
  '00581: the four row states a designer reads for her own letter — sent, '
  'opened, accepted, lapsed — from the latest non-superseded invitation joined '
  'to its notification_log row. Scoped to the calling designer''s own rows. '
  'Returns zero rows when no letter has been written.';
