-- ═══════════════════════════════════════════════════════════════════════════
-- 00593 — People room CRM · W1a (2 of 3): typed reach channels
--
-- E6. Today a person or firm has exactly one `phone` and one `email` on the
-- rolodex card (00417:70-120) and a second, independent snapshot on every party
-- row (00281:48-61). A mobile, an office line, a dispatch line and an
-- after-hours line are four different facts with four different consent and
-- SMS-capability stories; one text column cannot hold them.
--
-- studio_contact_channels is the typed list, owned by the card that carries it.
-- `value` is NORMALISED on the way in by the same idiom 00281 and 00583 use:
-- one BEFORE INSERT/UPDATE trigger per table, calling the shared pure helper
-- public.normalize_phone_e164(text) for phone kinds; emails are lowercased and
-- trimmed. Unlike the party/lead normalisers, `value` is NOT NULL here, so an
-- unparseable phone falls back to its trimmed raw text rather than becoming
-- NULL — the number the studio typed is never lost, it simply gets no E.164.
--
-- BACKFILL: every phone and email already on a rolodex card, plus the phone and
-- email on any party row already folded to a card (studio_contact_id set,
-- 00418). ON CONFLICT DO NOTHING against the (owner, kind, value) unique index,
-- which is evaluated AFTER the normalising trigger — so the same number typed
-- three different ways lands once.
--
-- The normalising rule itself lives in ONE function, public.normalize_channel_value
-- (created here), because 00594 keys its consent record on the same value. Two
-- statements of the same rule drift: the consent RPC refused an unparseable
-- phone while this trigger kept the raw text, leaving channel rows no consent
-- record could ever be written for.
--
-- The kind vocabulary is crm-model §2's Reach channel list: four voice lines,
-- two email doors (general + AP), and portal_311. status is crm-model's
-- ok/bounced/unsubscribed/dead, with ok spelled `active`.
--
-- RLS gates on the OWNING CARD's organization_id via studio_contact_org(uuid)
-- (00592).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration
-- (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_contact_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_type text NOT NULL CHECK (owner_type IN ('person', 'company')),
  owner_id   uuid NOT NULL REFERENCES public.studio_contacts(id) ON DELETE CASCADE,

  channel_kind text NOT NULL CHECK (
    channel_kind IN (
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311'
    )
  ),
  value      text NOT NULL,
  label      text,

  -- An office line must never be offered an SMS invite (CS4-7).
  sms_capable boolean NOT NULL DEFAULT false,

  verified    boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  preferred   boolean NOT NULL DEFAULT false,

  status    text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'bounced', 'unsubscribed', 'dead')),
  status_at timestamptz,

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vocabulary, re-stated as named constraints so a rerun of this file over an
-- existing table really does widen them (CREATE TABLE IF NOT EXISTS would skip
-- the inline versions above) — the 00592 idiom. Both lists are crm-model §2.
--
-- channel_kind carries the four voice lines, BOTH email doors (the general
-- address and the AP address the bookkeeper pays from — direction §2.2 E6, and
-- the partner of 00592's remit_to), and portal_311, the only way F-27 is
-- reachable at all. DELIBERATELY NOT HERE: crm-model's app / account /
-- field_link / paper. Those are not addresses a studio member types onto a
-- card — they are reach tiers derived from an access grant (E9) and belong
-- with that object, not in this table's vocabulary.
ALTER TABLE public.studio_contact_channels
  DROP CONSTRAINT IF EXISTS studio_contact_channels_channel_kind_check;
ALTER TABLE public.studio_contact_channels
  ADD CONSTRAINT studio_contact_channels_channel_kind_check CHECK (
    channel_kind IN (
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311'
    )
  );

-- status: crm-model §2 names ok/bounced/unsubscribed/dead. 'ok' is spelled
-- 'active' here (a rename, harmless); 'bounced' is not optional — it is the
-- commonest verdict the email rail writes back (direction §7 P3, CS6-10, which
-- also requires the date status_at carries).
ALTER TABLE public.studio_contact_channels
  DROP CONSTRAINT IF EXISTS studio_contact_channels_status_check;
ALTER TABLE public.studio_contact_channels
  ADD CONSTRAINT studio_contact_channels_status_check CHECK (
    status IN ('active', 'bounced', 'unsubscribed', 'dead')
  );

COMMENT ON TABLE public.studio_contact_channels IS
  'E6: every way a person or firm is actually reachable, typed. Owned by the '
  'rolodex card (studio_contacts); `value` is normalised on write — phones to '
  'E.164 via normalize_phone_e164 (00281), emails lowercased. Consent is NOT '
  'here: it is a fact about the channel VALUE per studio, in '
  'studio_channel_consent (00594).';

COMMENT ON COLUMN public.studio_contact_channels.value IS
  'Normalised by normalize_studio_contact_channel(): E.164 for phone kinds '
  '(falling back to the trimmed raw text when unparseable, since the column is '
  'NOT NULL), lower(btrim(...)) for the two email kinds, trimmed raw text for '
  'portal_311 (a portal handle is neither).';
COMMENT ON COLUMN public.studio_contact_channels.channel_kind IS
  'crm-model §2 Reach channel. mobile/office/dispatch/after_hours are voice '
  'lines; email is the general address and ap_email the one the bookkeeper pays '
  'from (pairs with 00592''s remit_to); portal_311 is a municipal scheduling '
  'portal — F-27 is reachable no other way. app/account/field_link/paper are '
  'NOT kinds here: they are reach tiers derived from an access grant (E9).';
COMMENT ON COLUMN public.studio_contact_channels.status IS
  'active | bounced | unsubscribed | dead — the send rails'' verdict on the '
  'channel, dated by status_at (crm-model §2 spells active as ok). Distinct '
  'from consent, which is per studio per value.';

-- ── Normalisation ───────────────────────────────────────────────────────────
-- The channel-key rule lives in ONE function, because 00594's consent record is
-- keyed on the same value and the two must never disagree. A rule stated twice
-- drifted once already: the consent RPC refused an unparseable phone while this
-- trigger kept the trimmed raw text, so a channel row could exist that no
-- consent record could ever be written for.
--
-- IMMUTABLE and side-effect-free, so it is safe to call from a trigger, from a
-- SECURITY DEFINER RPC, and from a backfill's WHERE clause alike.
CREATE OR REPLACE FUNCTION public.normalize_channel_value(
  p_channel_kind text,
  p_value        text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_channel_kind IN ('email', 'ap_email')
      THEN NULLIF(lower(btrim(COALESCE(p_value, ''))), '')
    -- A portal handle/URL is neither phone nor address: keep what was typed.
    WHEN p_channel_kind = 'portal_311'
      THEN NULLIF(btrim(COALESCE(p_value, '')), '')
    ELSE COALESCE(
           public.normalize_phone_e164(p_value),
           NULLIF(btrim(COALESCE(p_value, '')), '')
         )
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_channel_value(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_channel_value(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.normalize_channel_value(text, text) IS
  'The ONE channel-key rule: E.164 for phone kinds, falling back to the trimmed '
  'raw text when unparseable; lower(btrim(...)) for email and ap_email; trimmed '
  'raw for portal_311. NULL only when nothing was typed. Called by '
  'normalize_studio_contact_channel() (this file) and by 00594''s '
  'record_channel_consent() / record_channel_reconsent(), so a channel row and '
  'its consent record always land on the same key.';

CREATE OR REPLACE FUNCTION public.normalize_studio_contact_channel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- COALESCE to '' because value is NOT NULL here: the number the studio typed
  -- is never lost, it simply gets no E.164.
  NEW.value := COALESCE(
    public.normalize_channel_value(NEW.channel_kind, NEW.value),
    ''
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_studio_contact_channel() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.normalize_studio_contact_channel() IS
  'BEFORE INSERT/UPDATE on studio_contact_channels: defers entirely to '
  'normalize_channel_value(), the one channel-key rule 00594''s consent RPCs '
  'also use. Same shape as 00281''s normalize_party_phone_e164 and 00583''s two '
  'lead/client normalisers — a per-table trigger fn over one shared pure '
  'helper (00593).';

DROP TRIGGER IF EXISTS normalize_studio_contact_channel_trg ON public.studio_contact_channels;
CREATE TRIGGER normalize_studio_contact_channel_trg
  BEFORE INSERT OR UPDATE ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.normalize_studio_contact_channel();

DROP TRIGGER IF EXISTS set_updated_at_studio_contact_channels ON public.studio_contact_channels;
CREATE TRIGGER set_updated_at_studio_contact_channels
  BEFORE UPDATE ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The ON CONFLICT arbiter for the backfill (and for every later re-fold). The
-- normalising trigger runs first, so the arbiter sees the normalised value.
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_contact_channels_owner_kind_value
  ON public.studio_contact_channels(owner_id, channel_kind, value);

-- "Who holds this number / address" — the dedupe and consent join.
CREATE INDEX IF NOT EXISTS idx_studio_contact_channels_value
  ON public.studio_contact_channels(value);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.studio_contact_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_contact_channels_member_select ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_select
  ON public.studio_contact_channels FOR SELECT
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_insert ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_insert
  ON public.studio_contact_channels FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_update ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_update
  ON public.studio_contact_channels FOR UPDATE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)))
  WITH CHECK (public.is_active_studio_member(public.studio_contact_org(owner_id)));

DROP POLICY IF EXISTS studio_contact_channels_member_delete ON public.studio_contact_channels;
CREATE POLICY studio_contact_channels_member_delete
  ON public.studio_contact_channels FOR DELETE
  TO authenticated
  USING (public.is_active_studio_member(public.studio_contact_org(owner_id)));

REVOKE ALL ON TABLE public.studio_contact_channels FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_contact_channels TO authenticated;
GRANT ALL ON public.studio_contact_channels TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill
-- ═══════════════════════════════════════════════════════════════════════════
-- (a) Rolodex card phones. A person's single number is their mobile; a firm's
--     is the office line. Only a person's number is assumed SMS-capable.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT sc.entity_kind,
       sc.id,
       CASE WHEN sc.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
       COALESCE(sc.phone_e164, sc.phone),
       sc.entity_kind = 'person',
       'From the card (00593 backfill)'
FROM public.studio_contacts sc
WHERE btrim(COALESCE(sc.phone_e164, sc.phone, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (b) Rolodex card emails.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, label)
SELECT sc.entity_kind, sc.id, 'email', sc.email, 'From the card (00593 backfill)'
FROM public.studio_contacts sc
WHERE btrim(COALESCE(sc.email, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (c) Party-row phones, for parties already folded onto a PERSON card (00418).
--     The snapshot on the row is often the only place a working number lives.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT 'person', sc.id, 'mobile', COALESCE(pp.phone_e164, pp.phone), true,
       'From a project roster (00593 backfill)'
FROM public.project_parties pp
JOIN public.studio_contacts sc
  ON sc.id = pp.studio_contact_id AND sc.entity_kind = 'person'
WHERE btrim(COALESCE(pp.phone_e164, pp.phone, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

-- (d) Party-row emails, same fold.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, label)
SELECT 'person', sc.id, 'email', pp.email, 'From a project roster (00593 backfill)'
FROM public.project_parties pp
JOIN public.studio_contacts sc
  ON sc.id = pp.studio_contact_id AND sc.entity_kind = 'person'
WHERE btrim(COALESCE(pp.email, '')) <> ''
ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;
