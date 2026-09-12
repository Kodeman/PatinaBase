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
-- three different ways lands once. sms_capable is NOT asserted from the card:
-- it keeps its safe `false` default unless public.channel_value_was_on_sms_rail()
-- says the number really was on an SMS rail — an sms_conversations thread on it,
-- or a FIELD-kind seat on it that has been asked for consent. The mere existence
-- of a folded party row is not evidence (party_kind also covers architect,
-- photographer, stager, client, client_rep, vendor, other) (CS4-7 — an office
-- line must never be offered an SMS invite, and person cards routinely carry
-- office numbers).
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
-- IT ALSO CLOSES THE REFERENCED SIDE OF THE THREE CARD GUARDS (r8 R8-M2, R-AR).
-- assert_channel_owner_kind (here) and 00592's designation and rule-route
-- guards all fire on the REFERENCING row; nothing fired when the card being
-- pointed AT changed its entity_kind or its studio, which undid all three at
-- once. assert_studio_contact_identity_stable() at the foot of this file is
-- that missing BEFORE UPDATE trigger on studio_contacts — placed here, not in
-- 00592, because it reads studio_contact_channels.
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
  'rolodex card (studio_contacts) — owner_type must equal that card''s own '
  'entity_kind, enforced by assert_channel_owner_kind(); `value` is normalised on write — phones to '
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

-- ── The SMS-rail evidence test ──────────────────────────────────────────────
-- sms_capable says "this line takes a text". The backfill has to answer that
-- from what the database already knows, and the honest answers are narrow:
--
--   · sms_conversations holds one row per (twilio_number, phone_e164) (00282).
--     A thread exists only because a message actually moved on that number.
--   · a project_parties seat of a FIELD kind (gc / sub / installer / receiver —
--     sms-inbound/pipeline.ts's FIELD_KINDS, the only kinds the rail covers)
--     whose sms_consent_status has left `not_asked`: the number was really put
--     on the rail, even if nothing has been sent yet.
--
-- Deliberately PHONE-GLOBAL: being an SMS-capable line is a fact about the
-- line, not about one studio's consent (that is studio_channel_consent's job,
-- 00594). Deliberately NOT "some party row exists with this number": party_kind
-- also covers architect, photographer, stager, client, client_rep, vendor and
-- other, and marking those SMS-capable is the assertion crm-model §2 CS4-7
-- exists to deny — F-10 Sam Rowe, "never texted", and F-27 Ray Thao, "NEVER
-- texted; scheduled through 311", are both ordinary folded party rows.
--
-- Backfill helper only: SECURITY INVOKER and not granted to authenticated, so
-- it cannot become a half-RLS'd reader of two tables from the portal.
CREATE OR REPLACE FUNCTION public.channel_value_was_on_sms_rail(p_value text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p_value IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.sms_conversations c
          WHERE c.phone_e164 = p_value
       )
       OR EXISTS (
         SELECT 1 FROM public.project_parties pp
          WHERE public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))
                = p_value
            AND pp.party_kind IN ('gc', 'sub', 'installer', 'receiver')
            AND COALESCE(pp.sms_consent_status, 'not_asked') <> 'not_asked'
       )
     );
$$;

REVOKE ALL ON FUNCTION public.channel_value_was_on_sms_rail(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.channel_value_was_on_sms_rail(text) TO service_role;

COMMENT ON FUNCTION public.channel_value_was_on_sms_rail(text) IS
  'TRUE when a normalised phone really was on an SMS rail: an sms_conversations '
  'thread exists on it (00282), or a FIELD-kind project_parties seat '
  '(gc/sub/installer/receiver) on it has been asked for consent at all. The '
  'evidence test 00593''s backfill uses for sms_capable — the mere existence of '
  'a party row is NOT evidence, since party_kind also covers architect, '
  'photographer, stager, client, client_rep, vendor and other (crm-model §2 '
  'CS4-7). Phone-global on purpose: SMS capability is a fact about the line, '
  'not about a studio''s consent (00593).';

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

-- ── owner_type has to be the kind the card actually is ──────────────────────
-- owner_type's CHECK says person|company; owner_id's FK says "some card".
-- Neither says they agree, so a company card could carry owner_type='person'
-- and be offered an SMS invite as a person, or a person card could sit in a
-- firm's Reach list as the firm's own line. A CHECK cannot reach studio_contacts,
-- so this is a BEFORE trigger — the same shape as 00592's
-- assert_affiliation_card_kinds().
CREATE OR REPLACE FUNCTION public.assert_channel_owner_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT sc.entity_kind INTO v_kind
    FROM public.studio_contacts sc WHERE sc.id = NEW.owner_id;

  IF v_kind IS DISTINCT FROM NEW.owner_type THEN
    RAISE EXCEPTION 'channel_owner_kind_mismatch'
      USING HINT = 'studio_contact_channels.owner_type must equal the card''s '
                   'own entity_kind: a company card''s channels are '
                   'owner_type = company, a person card''s are person.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_channel_owner_kind()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_channel_owner_kind() IS
  'BEFORE INSERT/UPDATE on studio_contact_channels: owner_type must equal '
  'studio_contacts.entity_kind for owner_id (channel_owner_kind_mismatch). The '
  'column CHECK and the FK each say half of this and neither says they agree '
  '(00593).';

DROP TRIGGER IF EXISTS assert_channel_owner_kind_trg ON public.studio_contact_channels;
CREATE TRIGGER assert_channel_owner_kind_trg
  BEFORE INSERT OR UPDATE OF owner_type, owner_id
  ON public.studio_contact_channels
  FOR EACH ROW EXECUTE FUNCTION public.assert_channel_owner_kind();

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
-- (a) Rolodex card phones. The card holds ONE untyped number; nothing on it
--     says which kind of line it is, so this statement asserts as little as it
--     can get away with.
--
--     sms_capable STAYS AT ITS `false` DEFAULT UNLESS THERE IS EVIDENCE.
--     sms_capable exists to deny exactly the thing a blanket `true` would
--     assert: "an office line must not be offered an SMS invite" (crm-model §2
--     CS4-7, direction §5.1). Person cards carrying an office, showroom,
--     dispatch or 311-only number are ordinary in the fixture (F-13 Ingrid,
--     F-14 Rosa, F-17 Jim, F-20 Claire, F-27 Ray), and this statement runs ONCE
--     — a wrong `true` is then a card the studio has to correct by hand.
--
--     THE EVIDENCE IS AN SMS RAIL, NOT A ROW. A party row folded onto the card
--     (00418) proves only that the studio wrote the number down: party_kind
--     ranges over architect, photographer, stager, client, client_rep, vendor
--     and other, none of which the SMS rail covers (FIELD_KINDS = gc | sub |
--     installer | receiver, sms-inbound/pipeline.ts). Sam Rowe the architect
--     (F-10, "never texted") and Ray Thao at the AHJ (F-27, "NEVER texted;
--     scheduled through 311") both have folded rows, and existence alone marked
--     both SMS-capable — the exact assertion CS4-7 exists to deny. So the test
--     is one of two real signals, both phone-global because being an SMS line is
--     a fact about the LINE, not about a studio's consent:
--       · an sms_conversations row on the normalised number — the Field
--         Coordination thread table, keyed (twilio_number, phone_e164) (00282).
--         A thread exists only because a message actually moved.
--       · or a folded party row on a FIELD_KINDS seat whose sms_consent_status
--         has moved off `not_asked` — the number was really put on the rail,
--         even if nothing has been sent yet.
--     Everything else keeps `false` and the `line type unconfirmed` label, so
--     W1b's Reach editor asks the studio rather than asserting for it. Leg (c)
--     below applies the SAME test rather than a literal `true`, so the two legs
--     agree by construction rather than racing the ON CONFLICT.
--
--     channel_kind is still `mobile` for a person and `office` for a firm —
--     the vocabulary has no "unknown" and a row needs some kind — but where
--     there is no SMS evidence the label says so, so W1b's Reach editor can
--     show the studio which lines it is being asked to type.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT sc.entity_kind,
       sc.id,
       CASE WHEN sc.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
       COALESCE(sc.phone_e164, sc.phone),
       ev.texted,
       CASE WHEN sc.entity_kind = 'person' AND NOT ev.texted
            THEN 'From the card (00593 backfill) — line type unconfirmed'
            ELSE 'From the card (00593 backfill)' END
FROM public.studio_contacts sc
CROSS JOIN LATERAL (
  SELECT sc.entity_kind = 'person'
         AND public.channel_value_was_on_sms_rail(
               public.normalize_channel_value('mobile', COALESCE(sc.phone_e164, sc.phone))
             ) AS texted
) ev
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
--     Same evidence test as leg (a) — a roster row is where the number came
--     from, not proof it is a mobile: F-27's 311 desk line and F-10's
--     emergency-only number arrive here exactly the same way.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
SELECT 'person', sc.id, 'mobile', COALESCE(pp.phone_e164, pp.phone),
       public.channel_value_was_on_sms_rail(
         public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))),
       CASE WHEN public.channel_value_was_on_sms_rail(
                   public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone)))
            THEN 'From a project roster (00593 backfill)'
            ELSE 'From a project roster (00593 backfill) — line type unconfirmed' END
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

-- ═══════════════════════════════════════════════════════════════════════════
-- The card cannot change WHAT IT IS or WHOSE IT IS while something holds it
-- ═══════════════════════════════════════════════════════════════════════════
-- (r8 R8-M2, ruling R-AR.) The three guards this wave adds —
-- assert_studio_contact_designations() (00592), assert_studio_contact_rule_route()
-- (00592) and assert_channel_owner_kind() (above) — all fire on the REFERENCING
-- row only: the card that holds the designation, the rule that holds the route,
-- the channel that holds owner_type. NOTHING fires when the card being pointed
-- AT changes what it is or whose it is. Both columns are ordinary
-- member-writable columns on studio_contacts (00417's member UPDATE policy) and
-- entity_kind is one the shipped data layer already writes on update
-- (packages/supabase/src/hooks/use-studio-contacts.ts). So ONE UPDATE undid all
-- three at once:
--
--   · flip a person card to a company card and it carries channels with
--     owner_type = 'person' — the exact state assert_channel_owner_kind() was
--     written to prevent ("a company card could be offered an SMS invite as a
--     person");
--   · a firm's paperwork_contact_person_id then names a FIRM, and after an org
--     move names a card in ANOTHER STUDIO — 00592's own "cross-tenant paperwork
--     link waiting for a SECURITY DEFINER reader that does not re-check", which
--     is what P3's trade-upload chase (PR-a) mints a token against;
--   · a contact rule routes to a firm, in another studio — and R-L / R-S print
--     that routed person's name as the one line telling a designer how to reach
--     a do-not-contact person.
--
-- The cheapest correct answer, and the one ruled: REFUSE the change while any
-- channel, designation, rule route, rule SUBJECT or affiliation still points at
-- the card, and name in the hint what holds it. The studio's way out is the same one the room
-- already offers — detach the dependents (or merge the card, PR-o) and then
-- change it — and the refusal is legible rather than a constraint violation
-- three tables away.
--
-- IT REFUSES A CHANGE, NOT A RESTATEMENT: `UPDATE OF` fires whenever the column
-- is in the SET list, unchanged value included, and the shipped hook writes
-- entity_kind on every edit that passes one. So the first test is IS DISTINCT
-- FROM; an UPDATE that merely restates the card's own kind passes through.
--
-- This guard lives in 00593 rather than 00592 for one reason: it reads
-- studio_contact_channels, which 00592 has not created yet. Same shape as the
-- three guards it completes.
CREATE OR REPLACE FUNCTION public.assert_studio_contact_identity_stable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holders text[] := ARRAY[]::text[];
  v_n       integer;
BEGIN
  IF NEW.entity_kind    IS NOT DISTINCT FROM OLD.entity_kind
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contact_channels c
   WHERE c.owner_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' reach channel(s) on this card');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contacts sc
   WHERE sc.paperwork_contact_person_id = OLD.id
      OR sc.signer_person_id            = OLD.id
      OR sc.site_contact_person_id      = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' designation(s) naming it on other cards');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_contact_rules r
   WHERE r.route_to_person_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' contact rule(s) routing to it');
  END IF;

  -- THE FIFTH HOLDER: the card a rule is ABOUT, not only the card it routes TO
  -- (r9 R5-M1). studio_contact_rules.subject_id (00592:721) is polymorphic and
  -- deliberately unFK'd, and assert_studio_contact_rule_route() polices it from
  -- the RULE side only (rule_subject_kind_mismatch, 00592:929-937 — added for
  -- r8 F1 because "a rule filed under the other noun is invisible to every
  -- reader that asks correctly, and a FORBIDDING rule nobody finds fails
  -- OPEN"). Omitting it here left the card side of that same hole open: one
  -- member-reachable `UPDATE studio_contacts SET entity_kind` — a column the
  -- shipped hook writes on every edit — flipped a rule's subject to the other
  -- noun and the forbidding rule went unfindable; and the organization_id leg
  -- did the same for rule_route_other_studio, leaving the rule ruling about a
  -- card in another tenant. Worse, the stranded row could never be repaired:
  -- any later write to it raises the very error the rule-side guard exists to
  -- raise, so W1b's rule editor could not undo what the card editor did.
  -- 'engagement' subjects name a project_parties row, not a card, so they are
  -- not this card's holders.
  SELECT count(*) INTO v_n
    FROM public.studio_contact_rules r
   WHERE r.subject_type IN ('person', 'company')
     AND r.subject_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' contact rule(s) filed against this card');
  END IF;

  SELECT count(*) INTO v_n
    FROM public.studio_person_affiliations a
   WHERE a.person_id = OLD.id OR a.company_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' affiliation(s) standing on it');
  END IF;

  IF array_length(v_holders, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'studio_contact_identity_held'
      USING HINT = 'This card cannot change its entity_kind or its studio '
                   'while something still points at it or is filed about it: '
                   || array_to_string(v_holders, ', ')
                   || '. Detach or move those first — a company card carrying '
                      'a person''s channels, a designation naming a firm, a '
                      'route into another studio, or a contact rule filed under '
                      'the other noun are states the three guards on those rows '
                      'exist to refuse.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_studio_contact_identity_stable()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_studio_contact_identity_stable() IS
  'BEFORE UPDATE OF entity_kind, organization_id on studio_contacts: refuses '
  'the change (studio_contact_identity_held) while any reach channel, '
  'designation, contact-rule route, contact-rule SUBJECT or affiliation still '
  'points at the card, with a HINT naming what holds it. The three guards this wave adds — '
  'assert_channel_owner_kind, assert_studio_contact_designations, '
  'assert_studio_contact_rule_route — all fire on the REFERENCING row, so one '
  'ordinary UPDATE of the REFERENCED card undid all three at once: a company '
  'card carrying owner_type = person channels, a paperwork designation naming a '
  'firm in another studio, a rule routing across tenants. subject_id is counted '
  'alongside route_to_person_id (r9 R5-M1): flipping a rule SUBJECT''s '
  'entity_kind filed a forbidding rule under the other noun — unfindable to a '
  'reader that asks by the card''s own kind, and unrepairable, since '
  'rule_subject_kind_mismatch then refuses every later write to that row. A '
  'restatement of the same values passes through; only an actual change is '
  'refused (00593, r8 R8-M2, R-AR).';

DROP TRIGGER IF EXISTS assert_studio_contact_identity_stable_trg
  ON public.studio_contacts;
CREATE TRIGGER assert_studio_contact_identity_stable_trg
  BEFORE UPDATE OF entity_kind, organization_id
  ON public.studio_contacts
  FOR EACH ROW EXECUTE FUNCTION public.assert_studio_contact_identity_stable();
