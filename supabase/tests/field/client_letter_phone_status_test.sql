-- ═══════════════════════════════════════════════════════════════════════════
-- client_letter_phone_status — a phone letter's status, and the lapsed page's
-- one tap (migration 00654, The Field Line Phase 2 residue, SQ-109)
--
-- Covers:
--   1. LOW-3 (the defect). A phone letter whose MAILED 7-day expires_at has
--      passed still reads 'sent' while its 90-day capability stands — the state
--      the People Room showed as "Lapsed" on day 8.
--   2. A phone letter reads 'opened' from a client_link_uses row, under either
--      action name the two doors write ('open', 'open_letter'), at the FIRST
--      open; 'accept' and 'apply_client_effect:…' rows are not an open.
--   3. A phone letter reads 'lapsed' when the capability has expired, and when
--      it has been revoked, and when none was ever minted — each with the
--      timestamp the state names.
--   4. accepted_at still outranks every other word, on both identities.
--   5. THE EMAIL LETTER IS BYTE-IDENTICAL. sent / opened (notification_log) /
--      lapsed (the mailed token's seven days) / accepted, proved on a row that
--      ALSO carries a live capability and a use row — neither may move it.
--      A row with BOTH an email and a phone is an email letter.
--   6. client_link_refresh_target: NULL for an unknown string and for a live
--      capability; the invitation id for an expired one and a revoked one; NULL
--      when the letter behind it is revoked or superseded; and the raw token
--      that create_client_link minted is what it hashes, so the two agree.
--   7. Authorization: client_link_refresh_target is service_role only.
--
-- How to run (P26 — a disposable TEMPLATE template0 clone, NEVER the shared
-- stack, and never `supabase db reset`):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/field/client_letter_phone_status_test.sql
--
-- Transaction-wrapped + ROLLBACK, so it is re-runnable. request.jwt.claims is
-- set because client_invitation_status() scopes itself to auth.uid(); the role
-- is NOT switched, because the function is SECURITY DEFINER and the privilege
-- assertions ask pg_catalog about anon/authenticated directly.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL request.jwt.claims =
  '{"sub":"c1900000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('c1900000-0000-4000-8000-000000000001', 'c19-designer@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('c1900000-0000-4000-8000-000000000001', 'c19-designer@test.invalid', 'C19 Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('c1900000-0000-4000-8000-0000000000a1', 'C19 House',
        'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-000000000001');

-- One household per scenario: client_invitation_status reads the LATEST row for
-- a designer_client, so keeping the scenarios apart keeps the question simple.
INSERT INTO public.designer_clients (id, designer_id, client_name, client_phone, status)
VALUES
  ('c1900000-0000-4000-8000-0000000000c1', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Live',     '5551230001', 'active'),
  ('c1900000-0000-4000-8000-0000000000c2', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Opened',   '5551230002', 'active'),
  ('c1900000-0000-4000-8000-0000000000c3', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Expired',  '5551230003', 'active'),
  ('c1900000-0000-4000-8000-0000000000c4', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Revoked',  '5551230004', 'active'),
  ('c1900000-0000-4000-8000-0000000000c5', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Unminted', '5551230005', 'active'),
  ('c1900000-0000-4000-8000-0000000000c6', 'c1900000-0000-4000-8000-000000000001', 'C19 Phone Accepted', '5551230006', 'active');

INSERT INTO public.designer_clients (id, designer_id, client_name, client_email, status)
VALUES
  ('c1900000-0000-4000-8000-0000000000d1', 'c1900000-0000-4000-8000-000000000001', 'C19 Email Sent',     'c19-sent@test.invalid',     'active'),
  ('c1900000-0000-4000-8000-0000000000d2', 'c1900000-0000-4000-8000-000000000001', 'C19 Email Opened',   'c19-opened@test.invalid',   'active'),
  ('c1900000-0000-4000-8000-0000000000d3', 'c1900000-0000-4000-8000-000000000001', 'C19 Email Lapsed',   'c19-lapsed@test.invalid',   'active'),
  ('c1900000-0000-4000-8000-0000000000d4', 'c1900000-0000-4000-8000-000000000001', 'C19 Email Accepted', 'c19-accepted@test.invalid', 'active'),
  ('c1900000-0000-4000-8000-0000000000d5', 'c1900000-0000-4000-8000-000000000001', 'C19 Both',           'c19-both@test.invalid',     'active');

-- ── the letters ────────────────────────────────────────────────────────────
-- Every one of them was sent 30 days ago, so the MAILED token's seven days
-- (client_invitations.expires_at) have run out on all of them. That is the whole
-- point: on an email letter that means lapsed, on a phone letter it means
-- nothing at all.
INSERT INTO public.client_invitations
  (id, token, email, phone, designer_id, designer_client_id, project_id, kind, sent_at, expires_at)
VALUES
  ('c1900000-0000-4000-8000-000000000011', 'c19-tok-phone-live',     NULL, '(555) 123-0001',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c1',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000012', 'c19-tok-phone-opened',   NULL, '(555) 123-0002',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c2',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000013', 'c19-tok-phone-expired',  NULL, '(555) 123-0003',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c3',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000014', 'c19-tok-phone-revoked',  NULL, '(555) 123-0004',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c4',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000015', 'c19-tok-phone-unminted', NULL, '(555) 123-0005',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c5',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000016', 'c19-tok-phone-accepted', NULL, '(555) 123-0006',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000c6',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  -- The email letters. d1/d2/d4 are inside their seven days; d3 is not.
  ('c1900000-0000-4000-8000-000000000021', 'c19-tok-email-sent', 'c19-sent@test.invalid', NULL,
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000d1',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '1 day', now() + interval '6 days'),
  ('c1900000-0000-4000-8000-000000000022', 'c19-tok-email-opened', 'c19-opened@test.invalid', NULL,
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000d2',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '1 day', now() + interval '6 days'),
  ('c1900000-0000-4000-8000-000000000023', 'c19-tok-email-lapsed', 'c19-lapsed@test.invalid', NULL,
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000d3',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days'),
  ('c1900000-0000-4000-8000-000000000024', 'c19-tok-email-accepted', 'c19-accepted@test.invalid', NULL,
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000d4',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '1 day', now() + interval '6 days'),
  -- BOTH identities on one row: an email letter that also carries her number.
  ('c1900000-0000-4000-8000-000000000025', 'c19-tok-both', 'c19-both@test.invalid', '(555) 123-0025',
   'c1900000-0000-4000-8000-000000000001', 'c1900000-0000-4000-8000-0000000000d5',
   'c1900000-0000-4000-8000-0000000000a1', 'invite', now() - interval '30 days', now() - interval '23 days');

UPDATE public.client_invitations SET accepted_at = now() - interval '2 days'
 WHERE id IN ('c1900000-0000-4000-8000-000000000016', 'c1900000-0000-4000-8000-000000000024');

-- ── the capabilities ───────────────────────────────────────────────────────
-- Minted through create_client_link (00650) so the hash at rest is the real one,
-- then aged or revoked by hand where the case needs it.
CREATE TEMP TABLE c19_tokens (label text PRIMARY KEY, link_id uuid, token text);

INSERT INTO c19_tokens (label, link_id, token)
SELECT 'live',     id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000011');
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'opened',   id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000012');
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'expired',  id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000013');
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'revoked',  id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000014');
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'accepted', id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000016');
-- An EMAIL letter with a capability on it as well: case 5 proves it changes
-- nothing about the email letter's verdict.
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'email',    id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000023');
-- The both-identities row, likewise.
INSERT INTO c19_tokens (label, link_id, token)
SELECT 'both',     id, token FROM public.create_client_link('c1900000-0000-4000-8000-000000000025');

UPDATE public.client_links SET expires_at = now() - interval '1 day'
 WHERE id = (SELECT link_id FROM c19_tokens WHERE label = 'expired');
UPDATE public.client_links SET status = 'revoked'
 WHERE id = (SELECT link_id FROM c19_tokens WHERE label = 'revoked');

-- Her opens. Two rows on the 'opened' letter under the two action names the two
-- doors write, plus one that is NOT an open.
INSERT INTO public.client_link_uses (link_id, used_at, action, source)
SELECT link_id, now() - interval '20 days', 'open',        'client_portal' FROM c19_tokens WHERE label = 'opened';
INSERT INTO public.client_link_uses (link_id, used_at, action, source)
SELECT link_id, now() - interval '19 days', 'open_letter', 'client_portal' FROM c19_tokens WHERE label = 'opened';
INSERT INTO public.client_link_uses (link_id, used_at, action, source)
SELECT link_id, now() - interval '25 days', 'apply_client_effect:approve_selection', 'sms:SM1' FROM c19_tokens WHERE label = 'live';
INSERT INTO public.client_link_uses (link_id, used_at, action, source)
SELECT link_id, now() - interval '24 days', 'accept', 'client_portal' FROM c19_tokens WHERE label = 'live';

-- The email letter's own open, in the ledger the email path reads.
INSERT INTO public.notification_log (id, user_id, type, channel, status, opened_at, sent_at)
VALUES ('c1900000-0000-4000-8000-0000000000e1', 'c1900000-0000-4000-8000-000000000001',
        'client_invite_letter', 'email', 'opened', now() - interval '12 hours', now() - interval '1 day');
UPDATE public.client_invitations SET email_log_id = 'c1900000-0000-4000-8000-0000000000e1'
 WHERE id = 'c1900000-0000-4000-8000-000000000022';

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — LOW-3: the mailed token's seven days do not lapse a phone letter
-- ═══════════════════════════════════════════════════════════════════════════
DO $case1$
DECLARE
  v_state text;
  v_at    timestamptz;
  v_sent  timestamptz;
BEGIN
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c1');
  ASSERT v_state = 'sent',
    'FAIL 1a: a phone letter with a live capability must read sent 23 days after '
    'the mailed token expired, got ' || COALESCE(v_state, '<null>');

  SELECT COALESCE(last_sent_at, sent_at) INTO v_sent
    FROM public.client_invitations WHERE id = 'c1900000-0000-4000-8000-000000000011';
  ASSERT v_at = v_sent,
    'FAIL 1b: sent must be dated by the send, got ' || COALESCE(v_at::text, '<null>');

  -- The rows that are not an open: an answered text and an acknowledgement.
  ASSERT v_state <> 'opened',
    'FAIL 1c: an apply_client_effect or accept use row is not an open of the letter';

  RAISE NOTICE 'client_letter_phone_status: case 1 (a live capability reads sent) passed.';
END
$case1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 2 — LOW-3: 'opened' is a use row, at the FIRST open
-- ═══════════════════════════════════════════════════════════════════════════
DO $case2$
DECLARE
  v_state text;
  v_at    timestamptz;
BEGIN
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c2');
  ASSERT v_state = 'opened',
    'FAIL 2a: a phone letter she has opened must read opened — it has no email '
    'log to read one from — got ' || COALESCE(v_state, '<null>');
  ASSERT v_at BETWEEN now() - interval '20 days' - interval '1 minute'
                  AND now() - interval '20 days' + interval '1 minute',
    'FAIL 2b: opened must be dated by the FIRST open, got ' || COALESCE(v_at::text, '<null>');

  RAISE NOTICE 'client_letter_phone_status: case 2 (opened from the use ledger) passed.';
END
$case2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 3 — lapsed is the capability running out, being revoked, or absent
-- ═══════════════════════════════════════════════════════════════════════════
DO $case3$
DECLARE
  v_state text;
  v_at    timestamptz;
  v_exp   timestamptz;
BEGIN
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c3');
  SELECT expires_at INTO v_exp FROM public.client_links
   WHERE id = (SELECT link_id FROM c19_tokens WHERE label = 'expired');
  ASSERT v_state = 'lapsed',
    'FAIL 3a: an expired capability is a lapsed phone letter, got ' || COALESCE(v_state, '<null>');
  ASSERT v_at = v_exp,
    'FAIL 3b: lapsed must be dated by the capability, not the mailed token, got '
    || COALESCE(v_at::text, '<null>');

  SELECT state INTO v_state
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c4');
  ASSERT v_state = 'lapsed',
    'FAIL 3c: a revoked capability is a lapsed phone letter, got ' || COALESCE(v_state, '<null>');

  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c5');
  ASSERT v_state = 'lapsed',
    'FAIL 3d: a phone letter with no capability at all is lapsed — there is no '
    'way in — got ' || COALESCE(v_state, '<null>');
  ASSERT v_at = (SELECT expires_at FROM public.client_invitations
                  WHERE id = 'c1900000-0000-4000-8000-000000000015'),
    'FAIL 3e: with no capability to date the lapse, the letter''s own date stands';

  RAISE NOTICE 'client_letter_phone_status: case 3 (lapsed) passed.';
END
$case3$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 4 — accepted outranks everything, on both identities
-- ═══════════════════════════════════════════════════════════════════════════
DO $case4$
DECLARE
  v_state text;
  v_at    timestamptz;
BEGIN
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000c6');
  ASSERT v_state = 'accepted',
    'FAIL 4a: a phone letter she has answered reads accepted, got ' || COALESCE(v_state, '<null>');
  ASSERT v_at = (SELECT accepted_at FROM public.client_invitations
                  WHERE id = 'c1900000-0000-4000-8000-000000000016'),
    'FAIL 4b: accepted must be dated by accepted_at';

  SELECT state INTO v_state
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000d4');
  ASSERT v_state = 'accepted',
    'FAIL 4c: an accepted email letter is unchanged, got ' || COALESCE(v_state, '<null>');

  RAISE NOTICE 'client_letter_phone_status: case 4 (accepted) passed.';
END
$case4$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 5 — THE EMAIL LETTER IS BYTE-IDENTICAL
-- ═══════════════════════════════════════════════════════════════════════════
-- Two of these rows carry a live capability and, on the lapsed one, a use row as
-- well. Neither may reach an email letter's verdict: it is judged by the mailed
-- token's seven days and by notification_log, as it always was.
DO $case5$
DECLARE
  v_state text;
  v_at    timestamptz;
BEGIN
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000d1');
  ASSERT v_state = 'sent',
    'FAIL 5a: an email letter inside its seven days reads sent, got ' || COALESCE(v_state, '<null>');
  ASSERT v_at = (SELECT COALESCE(last_sent_at, sent_at) FROM public.client_invitations
                  WHERE id = 'c1900000-0000-4000-8000-000000000021'),
    'FAIL 5b: sent is dated by the send';

  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000d2');
  ASSERT v_state = 'opened',
    'FAIL 5c: an email letter reads opened from its notification_log row, got '
    || COALESCE(v_state, '<null>');
  ASSERT v_at = (SELECT opened_at FROM public.notification_log
                  WHERE id = 'c1900000-0000-4000-8000-0000000000e1'),
    'FAIL 5d: opened is dated by the email log';

  -- The one that would break if the capability leaked into the email path: this
  -- letter's capability is LIVE for 90 days and has a use row, and the letter is
  -- still lapsed, because the mailed token is what an email letter lives by.
  INSERT INTO public.client_link_uses (link_id, used_at, action, source)
  SELECT link_id, now() - interval '2 days', 'open', 'client_portal'
    FROM c19_tokens WHERE label = 'email';
  SELECT state, at INTO v_state, v_at
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000d3');
  ASSERT v_state = 'lapsed',
    'FAIL 5e: an email letter past its seven days is lapsed even with a live '
    'capability and an open on it, got ' || COALESCE(v_state, '<null>');
  ASSERT v_at = (SELECT expires_at FROM public.client_invitations
                  WHERE id = 'c1900000-0000-4000-8000-000000000023'),
    'FAIL 5f: an email letter''s lapse is dated by the mailed token';

  -- BOTH identities on one row is an email letter.
  SELECT state INTO v_state
    FROM public.client_invitation_status('c1900000-0000-4000-8000-0000000000d5');
  ASSERT v_state = 'lapsed',
    'FAIL 5g: a row carrying an email AND a phone is judged as an email letter, got '
    || COALESCE(v_state, '<null>');

  RAISE NOTICE 'client_letter_phone_status: case 5 (the email letter is unchanged) passed.';
END
$case5$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 6 — LOW-4: client_link_refresh_target
-- ═══════════════════════════════════════════════════════════════════════════
DO $case6$
DECLARE
  v_id  uuid;
  v_tok text;
BEGIN
  -- 6a: a string that hashes to nothing says nothing.
  ASSERT public.client_link_refresh_target('not-a-token-at-all') IS NULL,
    'FAIL 6a: an unknown string must answer NULL';
  ASSERT public.client_link_refresh_target(NULL) IS NULL,
    'FAIL 6b: NULL must answer NULL';
  ASSERT public.client_link_refresh_target('   ') IS NULL,
    'FAIL 6c: blank must answer NULL';

  -- 6d: a capability that still works needs no fresh letter.
  SELECT token INTO v_tok FROM c19_tokens WHERE label = 'live';
  ASSERT public.client_link_refresh_target(v_tok) IS NULL,
    'FAIL 6d: a live capability must answer NULL — she has a working link';

  -- 6e: an EXPIRED capability on a live letter names the letter to re-send. This
  -- is the case the refresh tap has been silently dropping: the raw token
  -- create_client_link handed back hashes to this row, so the one hashing rule
  -- holds across the mint and this lookup.
  SELECT token INTO v_tok FROM c19_tokens WHERE label = 'expired';
  v_id := public.client_link_refresh_target(v_tok);
  ASSERT v_id = 'c1900000-0000-4000-8000-000000000013',
    'FAIL 6e: an expired capability must name its invitation, got ' || COALESCE(v_id::text, '<null>');

  -- 6f: a revoked capability, same answer — the homeowner cannot tell the two
  -- apart and neither refusal is hers to fix.
  SELECT token INTO v_tok FROM c19_tokens WHERE label = 'revoked';
  v_id := public.client_link_refresh_target(v_tok);
  ASSERT v_id = 'c1900000-0000-4000-8000-000000000014',
    'FAIL 6f: a revoked capability must name its invitation, got ' || COALESCE(v_id::text, '<null>');

  -- 6g: a REVOKED LETTER is not reopened by a tap.
  UPDATE public.client_invitations SET revoked_at = now()
   WHERE id = 'c1900000-0000-4000-8000-000000000014';
  ASSERT public.client_link_refresh_target(v_tok) IS NULL,
    'FAIL 6g: a revoked letter must not be re-sent by a tap';
  UPDATE public.client_invitations SET revoked_at = NULL
   WHERE id = 'c1900000-0000-4000-8000-000000000014';

  -- 6h: a SUPERSEDED letter already has a newer one, with its own capability.
  UPDATE public.client_invitations SET superseded_by = 'c1900000-0000-4000-8000-000000000011'
   WHERE id = 'c1900000-0000-4000-8000-000000000014';
  ASSERT public.client_link_refresh_target(v_tok) IS NULL,
    'FAIL 6h: a superseded letter must not be re-sent by a tap';
  UPDATE public.client_invitations SET superseded_by = NULL
   WHERE id = 'c1900000-0000-4000-8000-000000000014';

  -- 6i: an accepted letter is NOT a refusal. A capability holder tapping "let
  -- them know I have it" set accepted_at; that must not cost her the way back in
  -- when her link later runs out.
  UPDATE public.client_links SET expires_at = now() - interval '1 day'
   WHERE id = (SELECT link_id FROM c19_tokens WHERE label = 'accepted');
  SELECT token INTO v_tok FROM c19_tokens WHERE label = 'accepted';
  ASSERT public.client_link_refresh_target(v_tok) = 'c1900000-0000-4000-8000-000000000016',
    'FAIL 6i: an accepted phone letter with a dead capability must still be refreshable';

  RAISE NOTICE 'client_letter_phone_status: case 6 (the refresh target) passed.';
END
$case6$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 7 — authorization
-- ═══════════════════════════════════════════════════════════════════════════
DO $case7$
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.client_link_refresh_target(text)', 'EXECUTE'),
    'FAIL 7a: anon must not ask which capabilities are dead';
  ASSERT NOT has_function_privilege('authenticated',
    'public.client_link_refresh_target(text)', 'EXECUTE'),
    'FAIL 7b: an authenticated caller must not ask which capabilities are dead';
  ASSERT has_function_privilege('service_role',
    'public.client_link_refresh_target(text)', 'EXECUTE'),
    'FAIL 7c: service_role must be able to ask';
  ASSERT NOT has_function_privilege('anon',
    'public.client_invitation_status(uuid)', 'EXECUTE'),
    'FAIL 7d: anon must not read a designer''s letter status';
  ASSERT has_function_privilege('authenticated',
    'public.client_invitation_status(uuid)', 'EXECUTE'),
    'FAIL 7e: the designer''s own read must survive — authenticated keeps EXECUTE';

  RAISE NOTICE 'client_letter_phone_status: case 7 (authorization) passed.';
  RAISE NOTICE 'All client_letter_phone_status assertions passed.';
END
$case7$;

ROLLBACK;
