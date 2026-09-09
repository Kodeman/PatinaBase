-- ═══════════════════════════════════════════════════════════════════════════
-- 00584 — lead contact phone: a spot for both phone and email on a new lead
--
-- INTENT
-- A captured lead had one "Contact" field. An email landed in
-- leads.contact_email; anything else was folded into project_description as
-- "Contact: <value>" prose, because leads carried no phone column. This gives
-- phone a column of its own on leads AND on designer_clients, so a phone taken
-- at the front door survives Discovery and reads in the People directory.
-- Both fields stay optional — name and the project line remain the only
-- required capture. Old leads whose phone lives in description prose are left
-- alone (no backfill).
--
-- LINEAGE (bodies copied verbatim from the files named, then grafted)
--   public.begin_discovery(uuid)                    00386 → 00399:515-675
--   public.ceremony_complete(...)                   00331:75-374
--   public.hydrate_lead_relationship_contact()      00399:744-768
--   public.people_directory (view)                  00221 → 00420 → 00478:139-371
--   No later migration redefines any of the four (verified by grep across
--   supabase/migrations at 00583; 00583_studio_comember_rls_sweep, unmerged on
--   fix/studio-comember-rls-sweep, changes policies only and none of the four).
--
-- NUMBER
-- Minted as 00583, moved to 00584: fix/studio-comember-rls-sweep claimed 00583
-- first on origin, and the ledger version is the numeric prefix.
--
-- E.164 DERIVATION
-- public.normalize_party_phone_e164() (00281) cannot be reused here: its body
-- names NEW.phone / NEW.phone_e164, and these columns are contact_phone /
-- client_phone. Each table gets its own trigger function of the same shape,
-- calling the same pure helper public.normalize_phone_e164(text) (00281).
-- Trigger names sort after hydrate_lead_relationship_contact_trg so the
-- normalizer sees the hydrated phone (BEFORE row triggers fire in name order).
--
-- ANON WRITES
-- The leads normalizer is unconditional and SECURITY INVOKER, and anon holds no
-- EXECUTE on public.normalize_phone_e164, so an anon INSERT into leads raises
-- "permission denied for function normalize_phone_e164" before RLS reaches its
-- own WITH CHECK denial. Every lead write today is authenticated or SECURITY
-- DEFINER, and 00281's project_parties trigger has the identical shape, so this
-- is left as-is; a future public capture form would need EXECUTE granted.
--
-- NO INDEX YET
-- Neither *_e164 column is indexed. 00281 indexed project_parties.phone_e164
-- for the inbound conversation-key lookup; nothing reads these two columns yet,
-- so the index waits for the reader that needs it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ──────────────────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_phone_e164 text;

COMMENT ON COLUMN public.leads.contact_phone IS
  'Phone as the designer typed it at capture. Optional. Carries through to '
  'designer_clients.client_phone when the lead begins Discovery (00584).';
COMMENT ON COLUMN public.leads.contact_phone_e164 IS
  'Normalized derivation of contact_phone, set by the normalize_phone_leads '
  'trigger. NULL when the raw phone is absent, cleared, or unparseable '
  '(00584).';

ALTER TABLE public.designer_clients
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS client_phone_e164 text;

COMMENT ON COLUMN public.designer_clients.client_phone IS
  'Working phone for a captured household with no Patina account. A client '
  'with a profile manages their own phone on profiles.phone (00584).';
COMMENT ON COLUMN public.designer_clients.client_phone_e164 IS
  'Normalized derivation of client_phone, set by the '
  'normalize_phone_designer_clients trigger (00584).';

-- ── 2. E.164 derivation triggers ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_lead_contact_phone_e164()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The raw column is the only source on UPDATE, so clearing the phone clears
  -- the derivation with it. On INSERT a directly-supplied e164 is still put
  -- through the normalizer, so a hand write cannot smuggle a raw value in.
  NEW.contact_phone_e164 := public.normalize_phone_e164(
    CASE
      WHEN TG_OP = 'INSERT' AND NEW.contact_phone IS NULL
        THEN NEW.contact_phone_e164
      ELSE NEW.contact_phone
    END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_lead_contact_phone_e164()
  FROM PUBLIC, anon;

COMMENT ON FUNCTION public.normalize_lead_contact_phone_e164() IS
  'BEFORE INSERT/UPDATE trigger on leads: keeps contact_phone_e164 a '
  'normalized derivation of contact_phone (00584).';

DROP TRIGGER IF EXISTS normalize_phone_leads ON public.leads;
CREATE TRIGGER normalize_phone_leads
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lead_contact_phone_e164();

CREATE OR REPLACE FUNCTION public.normalize_designer_client_phone_e164()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.client_phone_e164 := public.normalize_phone_e164(
    CASE
      WHEN TG_OP = 'INSERT' AND NEW.client_phone IS NULL
        THEN NEW.client_phone_e164
      ELSE NEW.client_phone
    END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_designer_client_phone_e164()
  FROM PUBLIC, anon;

COMMENT ON FUNCTION public.normalize_designer_client_phone_e164() IS
  'BEFORE INSERT/UPDATE trigger on designer_clients: keeps client_phone_e164 a '
  'normalized derivation of client_phone. Sorts after '
  'hydrate_lead_relationship_contact_trg so it sees the hydrated phone (00584).';

DROP TRIGGER IF EXISTS normalize_phone_designer_clients ON public.designer_clients;
CREATE TRIGGER normalize_phone_designer_clients
  BEFORE INSERT OR UPDATE ON public.designer_clients
  FOR EACH ROW EXECUTE FUNCTION public.normalize_designer_client_phone_e164();

-- ── 3. begin_discovery — 00399:515-675 verbatim + client_phone on every
--       branch that writes client_email ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.begin_discovery(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'begin_discovery requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  -- _can_author_proposal is the canonical exact-author helper: owner, or two
  -- active non-guest memberships in the same active design_studio. The older
  -- is_studio_comember helper intentionally includes other organization types.
  IF NOT FOUND OR NOT public._can_author_proposal(v_lead.designer_id) THEN
    RAISE EXCEPTION 'lead % not found or access denied', p_lead_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_lead.status NOT IN ('new', 'viewed', 'contacted', 'accepted') THEN
    RAISE EXCEPTION 'lead % cannot begin discovery from status %',
      p_lead_id, v_lead.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.leads
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  -- The lead_id is the durable idempotency key. A later invite or proposal can
  -- legitimately link a profile and advance this relationship beyond `lead`;
  -- retries must return that exact progressed row without normalizing it back.
  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE designer_id = v_lead.designer_id
    AND lead_id = p_lead_id
  ORDER BY created_at, id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'lead', to_jsonb(v_lead),
      'designerClientId', v_relationship.id
    );
  END IF;

  IF v_lead.homeowner_id IS NOT NULL THEN
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND client_id = v_lead.homeowner_id
      AND status = 'lead'
      AND lead_id IS NULL
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.designer_clients
      SET source = 'lead',
          lead_id = p_lead_id,
          updated_at = now()
      WHERE id = v_relationship.id
      RETURNING * INTO v_relationship;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, v_lead.homeowner_id, 'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  ELSE
    IF v_lead.contact_email IS NOT NULL THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_email = v_lead.contact_email
        AND client_id IS NULL
        AND lead_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      IF v_relationship.status = 'lead' THEN
        UPDATE public.designer_clients
        SET client_name = v_lead.contact_name,
            client_email = v_lead.contact_email,
            client_phone = COALESCE(client_phone, v_lead.contact_phone),
            source = 'lead',
            lead_id = p_lead_id,
            updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      ELSE
        -- A pre-existing progressed direct contact may be associated with this
        -- lead, but Discovery never rewinds its identity or lifecycle state.
        UPDATE public.designer_clients
        SET lead_id = p_lead_id, updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      END IF;
    ELSIF v_lead.contact_email IS NOT NULL THEN
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, client_phone,
        source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,
        v_lead.contact_phone, 'lead', p_lead_id, 'lead'
      )
      ON CONFLICT (designer_id, client_email)
        WHERE client_email IS NOT NULL AND client_id IS NULL
      DO UPDATE SET
        client_name = CASE
          WHEN designer_clients.status = 'lead' THEN EXCLUDED.client_name
          ELSE designer_clients.client_name
        END,
        source = CASE
          WHEN designer_clients.status = 'lead' THEN 'lead'
          ELSE designer_clients.source
        END,
        client_phone = COALESCE(designer_clients.client_phone, EXCLUDED.client_phone),
        lead_id = EXCLUDED.lead_id,
        updated_at = now()
      WHERE designer_clients.lead_id IS NULL
         OR designer_clients.lead_id = EXCLUDED.lead_id
      RETURNING * INTO v_relationship;
      IF v_relationship.id IS NULL THEN
        RAISE EXCEPTION 'contact email is already claimed by another lead'
          USING ERRCODE = 'unique_violation';
      END IF;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, client_phone,
        source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, NULL,
        v_lead.contact_phone, 'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'designerClientId', v_relationship.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_discovery(uuid) TO authenticated;

COMMENT ON FUNCTION public.begin_discovery(uuid) IS
  'Atomic Brief→Discovery transition. The exact designer or an active '
  'non-guest peer in the same active design_studio may act; contractor, '
  'manufacturer, inactive, and guest co-memberships confer no authority. '
  '00584: every branch that writes client_email also carries the lead''s '
  'contact_phone onto designer_clients.client_phone; an existing row''s phone '
  'is preserved (COALESCE), never overwritten.';

-- ── 4. hydrate_lead_relationship_contact — 00399:744-768 verbatim + phone on
--       INSERT only, so an emptied "Phone on file" stays empty. The trigger's
--       UPDATE OF column list is 00399's unchanged.
--       Deliberately NO phone backfill of existing rows: an old lead's phone
--       lives in project_description prose and must not be guessed at. ──────

CREATE OR REPLACE FUNCTION public.hydrate_lead_relationship_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND (NEW.client_name IS NULL
          OR NEW.client_email IS NULL
          OR (TG_OP = 'INSERT' AND NEW.client_phone IS NULL))
  THEN
    SELECT contact_name, contact_email, contact_phone
    INTO v_contact_name, v_contact_email, v_contact_phone
    FROM public.leads
    WHERE id = NEW.lead_id
      AND designer_id IS NOT DISTINCT FROM NEW.designer_id;

    NEW.client_name := COALESCE(NEW.client_name, v_contact_name);
    NEW.client_email := COALESCE(NEW.client_email, v_contact_email);
    -- INSERT only: the household sheet's "Phone on file" must be clearable, so
    -- an UPDATE that empties client_phone is never refilled from the lead.
    IF TG_OP = 'INSERT' THEN
      NEW.client_phone := COALESCE(NEW.client_phone, v_contact_phone);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hydrate_lead_relationship_contact()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS hydrate_lead_relationship_contact_trg
  ON public.designer_clients;
CREATE TRIGGER hydrate_lead_relationship_contact_trg
BEFORE INSERT OR UPDATE OF lead_id, designer_id, client_name, client_email
ON public.designer_clients
FOR EACH ROW EXECUTE FUNCTION public.hydrate_lead_relationship_contact();

-- ── 5. ceremony_complete — 00331:75-374 verbatim + client_phone on the
--       engagement row it ensures ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ceremony_complete(
  p_lead_id         uuid,
  p_intro           text,
  p_slots           jsonb,
  p_timezone        text,
  p_credential_line text DEFAULT NULL,
  p_portfolio_url   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_lead         leads%ROWTYPE;
  v_ceremony     match_ceremonies%ROWTYPE;
  v_slot         jsonb;
  v_slots        jsonb := '[]'::jsonb;
  v_slot_count   int;
  v_starts       timestamptz;
  v_dc           designer_clients%ROWTYPE;
  v_client_name  text;
  v_scan         room_scans%ROWTYPE;
  v_scan_found   boolean := false;
  v_rooms        jsonb := '[]'::jsonb;
  v_styles       text[] := '{}';
  v_scan_id      uuid;
  v_budget_min   integer;
  v_budget_max   integer;
  v_band         text[];
  v_thread_id    uuid;
  v_msg_id       uuid;
  v_studio_name  text;
  v_log_id       uuid;
  v_title        text;
  v_message      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  -- ── Validate: caller owns the lead, and the ceremony stub exists ──
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND OR v_lead.designer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_authorized' USING DETAIL = p_lead_id::text;
  END IF;

  -- Lock the ceremony row: serializes a double-send race on one transaction.
  SELECT * INTO v_ceremony FROM match_ceremonies
   WHERE lead_id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ceremony_not_found'
      USING DETAIL = 'accept_design_request has not run for lead ' || p_lead_id::text;
  END IF;

  -- ── IDEMPOTENT: already sent/picked → return the existing stamps ──
  IF v_ceremony.state IN ('sent', 'picked') THEN
    RETURN jsonb_build_object(
      'ceremony_id',        v_ceremony.id,
      'lead_id',            p_lead_id,
      'designer_client_id', v_ceremony.designer_client_id,
      'thread_id',          v_ceremony.thread_id,
      'intro_message_id',   v_ceremony.intro_message_id,
      'already_sent',       true
    );
  END IF;

  -- ── Gate re-check (2.2: non-empty words AND 2–3 future slots) ──
  IF p_intro IS NULL OR btrim(p_intro) = '' THEN
    RAISE EXCEPTION 'intro_required' USING DETAIL = 'the introduction must be written';
  END IF;

  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'slots_invalid' USING DETAIL = 'offered slots must be a json array';
  END IF;
  v_slot_count := jsonb_array_length(p_slots);
  IF v_slot_count < 2 OR v_slot_count > 3 THEN
    RAISE EXCEPTION 'slots_count' USING DETAIL = '2-3 offered slots required, got ' || v_slot_count;
  END IF;

  -- Normalize: every slot gets a server-side uuid id if absent, a 45-minute
  -- default duration, and must start in the future.
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_starts := (v_slot->>'starts_at')::timestamptz;
    IF v_starts IS NULL THEN
      RAISE EXCEPTION 'slot_starts_at_required' USING DETAIL = v_slot::text;
    END IF;
    IF v_starts <= now() THEN
      RAISE EXCEPTION 'slot_in_past' USING DETAIL = v_starts::text;
    END IF;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'id',               COALESCE(NULLIF(v_slot->>'id', '')::uuid, gen_random_uuid()),
      'starts_at',        to_jsonb(v_starts),
      'duration_minutes', COALESCE(NULLIF(v_slot->>'duration_minutes', '')::int, 45)
    ));
  END LOOP;

  -- ── Freeze the ceremony FIRST: the 00332 trigger guard reads state='sent'
  --    when the leads UPDATE below fires it, suppressing the generic 00289
  --    homeowner notification in favor of the named introduction moment. ──
  UPDATE match_ceremonies
     SET state           = 'sent',
         intro_text      = p_intro,
         credential_line = NULLIF(btrim(COALESCE(p_credential_line, '')), ''),
         portfolio_url   = NULLIF(btrim(COALESCE(p_portfolio_url, '')), ''),
         offered_slots   = v_slots,
         offered_at      = now(),
         timezone        = NULLIF(btrim(COALESCE(p_timezone, '')), ''),
         updated_at      = now()
   WHERE id = v_ceremony.id;

  UPDATE leads
     SET status      = 'accepted',
         accepted_at = COALESCE(accepted_at, now()),
         updated_at  = now()
   WHERE id = p_lead_id;

  -- ── designer_clients: the engagement row (I65 bug 2 — NEVER downgrade an
  --    active/proposal relationship; the index re-scope above makes a second,
  --    engagement-scoped 'lead' row legal). Resolution order:
  --      1. a lead-status row already linked to THIS lead (idempotency/root)
  --      2. a virgin lead-status row for the pair (no lead linked) → adopt it
  --      3. otherwise INSERT a fresh engagement row — existing active/proposal
  --         rows are never read, touched, or downgraded. ──
  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.full_name)
    INTO v_client_name
  FROM profiles p WHERE p.id = v_lead.homeowner_id;

  SELECT * INTO v_dc FROM designer_clients
   WHERE designer_id = v_uid AND lead_id = p_lead_id AND status = 'lead'
   ORDER BY created_at LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_dc FROM designer_clients
     WHERE designer_id = v_uid AND client_id = v_lead.homeowner_id
       AND status = 'lead' AND lead_id IS NULL
     ORDER BY created_at LIMIT 1;

    IF FOUND THEN
      UPDATE designer_clients
         SET lead_id      = p_lead_id,
             client_name  = COALESCE(client_name, v_client_name),
             client_phone = COALESCE(client_phone, v_lead.contact_phone),
             source       = COALESCE(source, 'design_request'),
             updated_at   = now()
       WHERE id = v_dc.id
       RETURNING * INTO v_dc;
    ELSE
      INSERT INTO designer_clients (designer_id, client_id, client_name, client_phone, source, lead_id, status)
      VALUES (v_uid, v_lead.homeowner_id, v_client_name, v_lead.contact_phone,
              'design_request', p_lead_id, 'lead')
      RETURNING * INTO v_dc;
    END IF;
  END IF;

  -- ── client_discovery, seeded atomically from the request (I65 find 1: this
  --    replaces the lazy first-render seed for arc-born engagements). ──
  SELECT rs.* INTO v_scan
  FROM lead_room_scans lrs
  JOIN room_scans rs ON rs.id = lrs.scan_id
  WHERE lrs.lead_id = p_lead_id
  ORDER BY lrs.is_primary DESC, lrs.position ASC
  LIMIT 1;
  v_scan_found := FOUND;

  IF v_scan_found THEN
    v_rooms := jsonb_build_array(jsonb_build_object(
      'name',            initcap(replace(COALESCE(NULLIF(v_scan.room_type, ''), 'room'), '_', ' ')),
      'floor_area_sqft', v_scan.floor_area
    ));
    v_styles  := COALESCE(v_scan.suggested_styles, '{}');
    v_scan_id := v_scan.id;
  END IF;

  -- Budget mapping, DEFENSIVE (I62: prod budget_range has drifted to free
  -- text). The 5 documented slugs, then a $Nk–$Mk / $Nk-$Mk parse (en/em dash
  -- or hyphen, optional $ and decimals), else both stay null.
  CASE v_lead.budget_range
    WHEN 'under_5k'  THEN v_budget_min := 0;          v_budget_max := 500000;
    WHEN '5k_15k'    THEN v_budget_min := 500000;     v_budget_max := 1500000;
    WHEN '15k_50k'   THEN v_budget_min := 1500000;    v_budget_max := 5000000;
    WHEN '50k_100k'  THEN v_budget_min := 5000000;    v_budget_max := 10000000;
    WHEN 'over_100k' THEN v_budget_min := 10000000;   v_budget_max := NULL;
    ELSE
      v_band := regexp_match(
        COALESCE(v_lead.budget_range, ''),
        '^\$?\s*(\d+(?:\.\d+)?)\s*[kK]\s*[–—-]\s*\$?\s*(\d+(?:\.\d+)?)\s*[kK]$'
      );
      IF v_band IS NOT NULL THEN
        v_budget_min := round(v_band[1]::numeric * 100000);
        v_budget_max := round(v_band[2]::numeric * 100000);
      END IF;
  END CASE;

  INSERT INTO client_discovery (
    designer_client_id, designer_id, project_type, rooms, style_keywords,
    budget_min_cents, budget_max_cents, room_scan_id
  )
  VALUES (
    v_dc.id, v_uid, v_lead.project_type, v_rooms, v_styles,
    v_budget_min, v_budget_max, v_scan_id
  )
  ON CONFLICT (designer_client_id) DO NOTHING;
  -- ready_at stays null: the seed pre-fills, it does not declare readiness.

  -- ── The thread + the introduction as its head message (R106 §6: "this
  --    message becomes the head of the client–designer thread"). ──
  -- rpc_start_direct_thread (00103) reads auth.uid() from the JWT claim, which
  -- survives the definer context (I65-verified); idempotent by design (finds
  -- an existing direct thread for the pair first).
  v_thread_id := public.rpc_start_direct_thread(v_lead.homeowner_id);

  INSERT INTO comms_messages (thread_id, sender_id, body)
  VALUES (v_thread_id, v_uid, p_intro)
  RETURNING id INTO v_msg_id;

  -- ── Client notification: the named introduction moment. Best-effort — a
  --    notification failure must never unwind the send. ──
  BEGIN
    SELECT rsi.name INTO v_studio_name
    FROM public.resolve_studio_identity(NULL, v_uid) rsi;
    v_studio_name := COALESCE(NULLIF(btrim(v_studio_name), ''), 'Your designer');

    v_title   := v_studio_name || ' introduced themselves';
    v_message := v_studio_name || ' introduced themselves — pick a time.';

    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_lead.homeowner_id,
      'match_introduction',
      'in_app',
      'delivered',
      'design-request-intro-delivered',
      jsonb_build_object(
        'lead_id',            p_lead_id,
        'designer_id',        v_uid,
        'ceremony_id',        v_ceremony.id,
        'designer_client_id', v_dc.id,
        'thread_id',          v_thread_id,
        'entity_type',        'design_request',
        'entity_id',          p_lead_id::text,
        'title',              v_title,
        'message',            v_message,
        'deep_link',          '/doc/' || p_lead_id::text,
        'url',                '/doc/' || p_lead_id::text
      )
    )
    RETURNING id INTO v_log_id;

    PERFORM public.invoke_edge_function(
      'notification-dispatch',
      jsonb_build_object(
        'user_id',     v_lead.homeowner_id,
        'type',        'match_introduction',
        'channel',     'email',
        'template_id', 'design-request-intro-delivered',
        'data', jsonb_build_object(
          'studio_name', v_studio_name,
          'projectType', v_lead.project_type,
          'slot_count',  v_slot_count,
          'leadId',      p_lead_id,
          'thread_id',   v_thread_id
        ),
        'priority', 'high'
      )
    );

    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             v_lead.homeowner_id,
        'title',               v_title,
        'body',                v_message,
        'entity_type',         'design_request',
        'entity_id',           p_lead_id::text,
        'notification_log_id', v_log_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ceremony_complete: notification step failed for lead %: %',
      p_lead_id, sqlerrm;
  END;

  -- ── Stamp the ceremony with what the send created. ──
  UPDATE match_ceremonies
     SET designer_client_id = v_dc.id,
         thread_id          = v_thread_id,
         intro_message_id   = v_msg_id,
         updated_at         = now()
   WHERE id = v_ceremony.id;

  RETURN jsonb_build_object(
    'ceremony_id',        v_ceremony.id,
    'lead_id',            p_lead_id,
    'designer_client_id', v_dc.id,
    'thread_id',          v_thread_id,
    'intro_message_id',   v_msg_id,
    'already_sent',       false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ceremony_complete(uuid, text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ceremony_complete(uuid, text, jsonb, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.ceremony_complete(uuid, text, jsonb, text, text, text) IS
  'Arrival Arc threshold act (R106 §2): one transaction — freeze the ceremony '
  '(state=sent, offered_slots normalized server-side), accept the lead (00332 '
  'guard suppresses the generic 00289 letter), ensure the engagement''s '
  'status=lead designer_clients row (NEVER downgrading active/proposal — I65), '
  'seed client_discovery from the request (defensive budget parse, I62), start '
  'the direct thread with the intro as head message, letter the client '
  '(in_app + email + APNs, best-effort), stamp the ceremony. Idempotent: '
  're-call after send returns the existing stamps. 00584: the engagement row '
  'carries the lead''s contact_phone onto client_phone.';

-- ── 6. people_directory — 00478:139-371 verbatim, two columns changed:
--       the client branch's phone prefers designer_clients.client_phone and
--       the lead branch's prefers leads.contact_phone, each still falling back
--       to the joined profile's phone. Every other column and branch is
--       byte-identical to 00478. ──────────────────────────────────────────────

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- v4: meta gains has_sent_proposal + issued_on_paper (this migration).
-- Everything else in this branch is unchanged from 00420.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  COALESCE(dc.client_phone, pr.phone)                            AS phone,
  dc.client_id                                                   AS profile_id,
  NULL::uuid                                                     AS project_id,
  dc.designer_id                                                 AS designer_id,
  dc.status                                                      AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects',     dc.total_projects,
    'total_revenue',      dc.total_revenue,
    'last_project_at',    dc.last_project_at,
    'last_contacted_at',  dc.last_contacted_at,
    'first_project_at',   dc.first_project_at,
    'style_tags',         dc.style_tags,
    'source',             dc.source,
    'satisfaction_score', dc.satisfaction_score,
    'nickname',           dc.nickname,
    'location',           dc.location,
    'lead_id',            dc.lead_id
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id)
                                                                 AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Unchanged from 00420.
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  COALESCE(l.contact_phone, hp.phone),
  l.homeowner_id,
  NULL::uuid,
  l.designer_id,
  l.status,
  COALESCE(l.contacted_at, l.created_at),
  jsonb_build_object(
    'project_type',      l.project_type,
    'project_description', l.project_description,
    'budget_range',      l.budget_range,
    'timeline',          l.timeline,
    'match_score',       l.match_score,
    'location_city',     l.location_city,
    'location_state',    l.location_state,
    'response_deadline', l.response_deadline,
    'created_at',        l.created_at
  ),
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Unchanged from 00420.
SELECT
  v.id,
  'maker',
  v.name,
  COALESCE(v.orders_email, v.trade_account_email),
  NULL::text,
  v.contact_profile_id,
  NULL::uuid,
  auth.uid(),
  v.nomination_status,
  v.updated_at,
  jsonb_build_object(
    'primary_category',      v.primary_category,
    'lead_times',            v.lead_times,
    'default_payment_terms', v.default_payment_terms,
    'founding_circle',       v.founding_circle,
    'made_in',               v.made_in,
    'trade_terms',           v.trade_terms,
    'is_patina_catalog',     v.is_patina_catalog,
    'review_count',          v.review_count,
    'designer_rating_avg',   v.designer_rating_avg
  ),
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.saved_vendors mine
       WHERE mine.vendor_id = v.id
         AND mine.designer_id = (select auth.uid())
     ) THEN 'mine'
     ELSE 'studio'
   END)::text
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE public.is_studio_comember(sv.designer_id)
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
)

UNION ALL

-- ── FIELD / ROSTER PARTIES on studio projects ─────────────────────────────
-- Unchanged from 00420.
SELECT
  pp.id,
  pp.party_kind,
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  pp.sms_consent_status,
  pp.updated_at,
  jsonb_build_object(
    'company_name',       pp.company_name,
    'vendor_id',          pp.vendor_id,
    'project_name',       pj.name,
    'party_kind',         pp.party_kind,
    'trade',              pp.trade,
    'phone_e164',         pp.phone_e164,
    'sms_consent_status', pp.sms_consent_status,
    'sms_consented_at',   pp.sms_consented_at,
    'sms_opt_out_at',     pp.sms_opt_out_at,
    'show_to_client',     pp.show_to_client,
    'studio_contact_id',  pp.studio_contact_id
  ),
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver',
                        'architect', 'photographer', 'stager')
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) )

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Unchanged from 00420.
SELECT
  t.id,
  'team',
  COALESCE(tp.full_name, tp.display_name, tp.email, 'Teammate'),
  tp.email,
  tp.phone,
  t.user_id,
  t.project_id,
  auth.uid(),
  t.role,
  t.assigned_at,
  jsonb_build_object(
    'role',         t.role,
    'project_name', t.project_name,
    'job_title',    t.job_title,
    'staff_role',   t.staff_role
  ),
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name,
    om.job_title  AS job_title,
    om.staff_role AS staff_role,
    ( pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) ) AS is_mine
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  LEFT JOIN public.organization_members om
    ON om.user_id = tm.user_id
   AND om.organization_id = pj.studio_id
   AND om.status = 'active'
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id

UNION ALL

-- ── CONTACTS (the shared rolodex, 00417) ──────────────────────────────────
-- Unchanged from 00420.
SELECT
  sc.id,
  'contact',
  COALESCE(sc.full_name, sc.company_name),
  sc.email,
  sc.phone,
  sc.profile_id,
  NULL::uuid,
  sc.created_by,
  (CASE WHEN sc.archived_at IS NULL THEN 'active' ELSE 'archived' END)::text,
  sc.updated_at,
  jsonb_build_object(
    'contact_kind',    sc.contact_kind,
    'entity_kind',     sc.entity_kind,
    'company_name',    sc.company_name,
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v5 '
  '(00584): the client branch''s phone reads '
  'COALESCE(designer_clients.client_phone, profiles.phone) and the lead '
  'branch''s reads COALESCE(leads.contact_phone, profiles.phone), so a phone '
  'taken at capture shows for a household with no Patina account instead of '
  'reading blank. v4 (00478): the client branch''s meta gains '
  'has_sent_proposal and issued_on_paper from '
  'designer_client_send_evidence(), so the directory/Nurture derivations can '
  'tell a merely-drafted agreement from one that was really emailed and from '
  'one handed over on paper (00477), instead of all three reading as '
  'status_raw = ''proposal''. Read them paper-first, then send evidence, then '
  'draft. v3 (00420): every branch is STUDIO-scoped via is_studio_comember '
  '(00315), a contacts branch surfaces the shared rolodex (studio_contacts, '
  '00417), and the appended `scope` column reads ''mine'' | ''studio'' for the '
  'scope lens. The party branch admits the 00419 roster kinds but excludes '
  '''client'' (it would collide with the clients branch''s role semantics). '
  'security_invoker view — base-table RLS still governs, so branches over '
  'tables that are not studio-widened (project_parties, project_team_members, '
  'saved_vendors) widen only for callers those tables already admit.';
