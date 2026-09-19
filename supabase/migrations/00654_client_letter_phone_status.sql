-- ═══════════════════════════════════════════════════════════════════════════
-- 00654 — A PHONE LETTER'S STATUS IS THE CAPABILITY'S, NOT THE MAILED TOKEN'S
--
-- The Field Line Phase 2 residue (SQ-109, from the SQ-108 review of SQ-16).
-- Two defects, both of them a phone letter being judged by an email letter's
-- objects:
--
--   LOW-3  client_invitation_status (00581:122) reads client_invitations.
--          expires_at — the MAILED token's seven days — and notification_log,
--          which a phone letter has no row in (email_log_id stays NULL). So the
--          People Room showed "Lapsed" on day 8 for a capability that lives 90
--          days (00650:167), and could never show "Opened" however many times
--          she opened her letter. The invitation row is the letter; the
--          capability is the door. A phone letter's state is the door's.
--
--   LOW-4  the lapsed page's one tap (client-invite/index.ts handleRefresh)
--          looks the token up in client_invitations.token. A homeowner reached
--          by text holds a capability token whose sha256 is all that is at rest
--          (00650:172), so that lookup misses every time: the tap answered
--          "A fresh letter is on its way" and re-minted nothing.
--          client_link_refresh_target below is the hash-side lookup the refresh
--          leg needs — and it lives HERE, in SQL, so the one implementation of
--          the hashing rule (encode(digest(token,'sha256'),'hex')) is not
--          copied into TypeScript where the two could drift.
--
-- Additive: CREATE OR REPLACE on one function, CREATE on one more. No table,
-- column, constraint or grant on an existing object changes, and the EMAIL
-- letter's four states are byte-identical (asserted both ways in
-- supabase/tests/field/client_letter_phone_status_test.sql).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_invitation_status — one function, two identities
-- ═══════════════════════════════════════════════════════════════════════════
-- The four state words are unchanged (sent / opened / accepted / lapsed) and so
-- is the shape: the designer's People Room row, her hook (use-client-invitation-
-- status.ts) and the status pill all keep reading exactly what they read today.
-- What changes is WHERE the two middle words come from when the letter was
-- addressed by phone.
--
-- Discriminated on `email IS NULL`, not on kind and not on `phone IS NOT NULL`:
-- 00650's CHECK guarantees one of the two stands, a row may carry BOTH (an email
-- letter that also has a number on it), and an email letter must keep its own
-- verdict whatever else is on the row. So every row with an email takes the old
-- path, character for character.
--
-- 'opened' for a phone letter is a client_link_uses row (00650:185) for one of
-- this invitation's capabilities. The audit action names vary by door: the token
-- page resolves with 'open' (client-portal auth/invite/[token]/page.tsx) while
-- the capability's own scope calls the action 'open_letter'
-- (CLIENT_LINK_ACTIONS, client-invite/lib.ts:57). BOTH are admitted, so the
-- status cannot go quiet because a caller named the action the way the scope
-- does. 'accept' and 'apply_client_effect:…' rows are deliberately NOT read as
-- an open: the first already sets accepted_at (which outranks every other word
-- below) and the second is an answer to a later text, not the first letter.
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
      WHEN l.email IS NULL THEN
        CASE
          -- No live capability = no way in = lapsed. A revoked one and an
          -- expired one read the same, exactly as resolve_client_link answers
          -- the same NULL for both (00650:330).
          WHEN cap.status IS DISTINCT FROM 'active'
            OR cap.expires_at <= now()                   THEN 'lapsed'
          WHEN cap.opened_at IS NOT NULL                 THEN 'opened'
          ELSE                                                'sent'
        END
      WHEN l.expires_at < now()                          THEN 'lapsed'
      WHEN nl.opened_at IS NOT NULL                      THEN 'opened'
      ELSE                                                    'sent'
    END AS state,
    CASE
      WHEN l.accepted_at IS NOT NULL                     THEN l.accepted_at
      WHEN l.email IS NULL THEN
        CASE
          WHEN cap.status IS DISTINCT FROM 'active'
            OR cap.expires_at <= now()
            -- When the capability itself is gone (never minted, or its row
            -- deleted with the letter) there is no expiry to name, so the
            -- letter's own date stands rather than a fabricated one.
            THEN COALESCE(cap.expires_at, l.expires_at)
          WHEN cap.opened_at IS NOT NULL                 THEN cap.opened_at
          ELSE COALESCE(l.last_sent_at, l.sent_at)
        END
      WHEN l.expires_at < now()                          THEN l.expires_at
      WHEN nl.opened_at IS NOT NULL                      THEN nl.opened_at
      ELSE COALESCE(l.last_sent_at, l.sent_at)
    END AS at,
    l.id AS invitation_id
  FROM latest l
  LEFT JOIN public.notification_log nl ON nl.id = l.email_log_id
  -- The newest capability minted for this letter, and the first time she opened
  -- the letter through ANY of them: a re-mint (resend, or the refresh tap
  -- below) must not take the fact that she has already read it away from her.
  LEFT JOIN LATERAL (
    SELECT
      newest.status,
      newest.expires_at,
      (SELECT min(cu.used_at)
         FROM public.client_link_uses cu
         JOIN public.client_links cl2 ON cl2.id = cu.link_id
        WHERE cl2.invitation_id = l.id
          AND cu.action IN ('open', 'open_letter')) AS opened_at
      FROM public.client_links newest
     WHERE newest.invitation_id = l.id
     ORDER BY newest.created_at DESC
     LIMIT 1
  ) cap ON true;
$$;

-- CREATE OR REPLACE keeps 00581's ACL, but the posture is stated rather than
-- inherited: this function reads a capability table nobody else may read.
REVOKE EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_invitation_status(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.client_invitation_status(uuid) IS
  '00581/00654: the four row states a designer reads for her own letter — sent, '
  'opened, accepted, lapsed — from the latest non-superseded invitation. An '
  'EMAIL letter reads its mailed token''s seven days and its notification_log '
  'row, unchanged. A PHONE letter (email IS NULL) reads the capability instead: '
  'lapsed when no live client_links row stands, opened from a client_link_uses '
  'row, because a phone letter has no email log and does not live by the mailed '
  'token''s clock. Scoped to the calling designer''s own rows. Returns zero '
  'rows when no letter has been written.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. client_link_refresh_target — the hash side of the lapsed page's one tap
-- ═══════════════════════════════════════════════════════════════════════════
-- Answers ONE question for the refresh leg: "is this string a capability that
-- has run out, on a letter that is still the current one?" — and answers it
-- with an invitation id, never with a token, a snapshot, or a reason.
--
-- NOT resolve_client_link, and not a widening of it. That function is the token
-- holder's read path and must keep refusing a dead capability (it is what makes
-- an expired link stop working); this one exists precisely to look at the dead
-- ones, so it is service_role only and returns nothing a page could print.
--
-- NULL when: the string hashes to nothing; the capability is still live (a
-- working link needs no fresh letter); or the letter behind it is revoked or
-- superseded — a studio that closed the door must not have it reopened by a tap,
-- and a superseded letter already has a newer one with its own capability.
-- accepted_at is deliberately NOT a refusal: for a capability holder it records
-- that she said she has the letter (00650 accept leg), not that a session was
-- burned, so it must not cost her a way back in.
CREATE OR REPLACE FUNCTION public.client_link_refresh_target(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_link public.client_links;
  v_inv  public.client_invitations;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- token_hash is UNIQUE (00650:171), so this is one row or none.
  SELECT * INTO v_link
    FROM public.client_links cl
   WHERE cl.token_hash = v_hash;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_link.status = 'active' AND v_link.expires_at > now() THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
    FROM public.client_invitations ci
   WHERE ci.id = v_link.invitation_id;
  IF NOT FOUND
     OR v_inv.revoked_at IS NOT NULL
     OR v_inv.superseded_by IS NOT NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_inv.id;
END;
$$;

-- Deny-all but service_role, STATED: the stack's ALTER DEFAULT PRIVILEGES for
-- role postgres in schema public hands anon and authenticated EXECUTE on every
-- function created here, so withholding a GRANT is not enough (00650:203 proved
-- this on a clone). A capability-shaped lookup is never a thing a browser holds.
REVOKE ALL ON FUNCTION public.client_link_refresh_target(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_link_refresh_target(text) TO service_role;

COMMENT ON FUNCTION public.client_link_refresh_target(text) IS
  '00654: for the lapsed page''s one tap. Hashes a raw client capability token '
  'and returns the invitation id when that capability has expired or been '
  'revoked while its letter is still the current, unrevoked one — so the '
  'refresh leg can re-mint and re-text. NULL for an unknown string, a live '
  'capability, and a revoked or superseded letter. service_role only; returns '
  'no token and no snapshot, so it is no oracle for a page to read.';
