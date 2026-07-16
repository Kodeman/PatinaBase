-- ═══════════════════════════════════════════════════════════════════════════
-- 00331 — ceremony_complete: the threshold act (R106 §2/§7, build plan 2.3)
--
-- Program: Arrival Arc (Wave 2). One transaction: freeze the ceremony, accept
-- the lead, ensure the engagement's designer_clients row, seed client_discovery
-- from the request, start the direct thread with the intro as its head message,
-- letter the client, stamp the ceremony. "The document begins with the
-- introduction; nothing converts."
--
-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ FLAG — UNIQUE INDEX RE-SCOPE (the one structural change in this wave)      ║
-- ║                                                                            ║
-- ║ BEFORE (00018):                                                            ║
-- ║   CREATE UNIQUE INDEX idx_designer_clients_unique_profile                  ║
-- ║     ON designer_clients(designer_id, client_id)                            ║
-- ║     WHERE client_id IS NOT NULL;                                           ║
-- ║                                                                            ║
-- ║ AFTER (this migration):                                                    ║
-- ║   CREATE UNIQUE INDEX idx_designer_clients_unique_profile                  ║
-- ║     ON designer_clients(designer_id, client_id)                            ║
-- ║     WHERE client_id IS NOT NULL AND status <> 'lead';                      ║
-- ║                                                                            ║
-- ║ WHY: I65 bug 2 rules ceremony_complete must NEVER downgrade an existing    ║
-- ║ active/proposal relationship, and I65 bug 3 + 00327 delta 5 (Kody-ruled)   ║
-- ║ already made document_state Shape D emit a status='lead' row ALONGSIDE a   ║
-- ║ signed project — the repeat client's new engagement needs its OWN          ║
-- ║ Discovery-stage row. The old pair-wide uniqueness made that row            ║
-- ║ impossible. Rows at status='lead' are now ENGAGEMENTS (0..n per pair, one  ║
-- ║ per accepted request, deduped in-function by lead_id); non-lead rows keep  ║
-- ║ the exactly-one-canonical-relationship invariant.                          ║
-- ║                                                                            ║
-- ║ RIPPLE (both defused in this file — full ON CONFLICT/UPDATE census run     ║
-- ║ across migrations + portal hooks):                                         ║
-- ║  1. open_project_direct (00237) — its ON CONFLICT inference clause         ║
-- ║     `(designer_id, client_id) WHERE client_id IS NOT NULL` no longer       ║
-- ║     implies the index predicate → inference would fail at runtime.         ║
-- ║     Regrafted below (body verbatim + guarded promote).                     ║
-- ║  2. activate_proposal_as_project (head 00326) — its pair-wide              ║
-- ║     `UPDATE … SET status='active' WHERE status IN ('lead','proposal')`     ║
-- ║     would 23505 when a pair holds {active, lead} rows (exactly the arc's   ║
-- ║     repeat-client signing moment) and could promote two lead rows into     ║
-- ║     collision. Regrafted below (461-line body verbatim + one guarded       ║
-- ║     UPDATE delta).                                                         ║
-- ║  3. NOT fixed here (portal lane, flagged in the lane report):              ║
-- ║     use-leads.ts useAcceptLead/useBeginDiscovery pair-queries use          ║
-- ║     .maybeSingle() — they error once a pair carries two rows. No ON        ║
-- ║     CONFLICT inference to break (they are check-then-write), but the       ║
-- ║     flag-off accept path must be hardened before repeat-client pairs       ║
-- ║     exist in prod.                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Lineage:
--   open_project_direct:          00237 → 00331 (this)
--   activate_proposal_as_project: 00140 → 00167 → 00180 → 00185 → 00199 →
--     00262 → 00269 → 00274 → 00279 → 00324 → 00326 → 00331 (this)
--   (both bodies copied verbatim from their grep|sort|tail-1 heads; deltas are
--    ONLY the designer_clients blocks, marked "-- 00331 delta")
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The index re-scope (before/after in the FLAG box above) ──────────────
DROP INDEX IF EXISTS public.idx_designer_clients_unique_profile;
CREATE UNIQUE INDEX idx_designer_clients_unique_profile
  ON public.designer_clients(designer_id, client_id)
  WHERE client_id IS NOT NULL AND status <> 'lead';

COMMENT ON INDEX public.idx_designer_clients_unique_profile IS
  '00331 (Arrival Arc): re-scoped from all-statuses to NON-LEAD rows only. '
  'status=''lead'' rows are per-engagement (one per accepted request, deduped by '
  'lead_id inside ceremony_complete); non-lead rows keep the one-canonical-'
  'relationship-per-pair invariant. Changing this predicate requires re-checking '
  'every ON CONFLICT inference on (designer_id, client_id): open_project_direct '
  'and activate_proposal_as_project were regrafted in 00331 for exactly that.';

-- ── 2. ceremony_complete ─────────────────────────────────────────────────────
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
         SET lead_id     = p_lead_id,
             client_name = COALESCE(client_name, v_client_name),
             source      = COALESCE(source, 'design_request'),
             updated_at  = now()
       WHERE id = v_dc.id
       RETURNING * INTO v_dc;
    ELSE
      INSERT INTO designer_clients (designer_id, client_id, client_name, source, lead_id, status)
      VALUES (v_uid, v_lead.homeowner_id, v_client_name, 'design_request', p_lead_id, 'lead')
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
  're-call after send returns the existing stamps.';

-- ── 3. open_project_direct regraft (00237 body verbatim + 00331 delta) ───────
-- Delta ONLY in the designer_clients block: the ON CONFLICT inference clause
-- must imply the re-scoped index predicate, and 00237's promote-the-lead-row
-- behavior is preserved via an explicit guarded UPDATE (promoting a lead row
-- is only legal when the pair has no engaged row).
create or replace function public.open_project_direct(
  p_title            text,
  p_client_id        uuid    default null,
  p_budget_min_cents integer default null,
  p_budget_max_cents integer default null,
  p_start_date       date    default current_date,
  p_id               uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer uuid := auth.uid();
  v_id       uuid := coalesce(p_id, gen_random_uuid());
  v_title    text := btrim(coalesce(p_title, ''));
  v_existing projects;
begin
  if v_designer is null then
    raise exception 'open_project_direct requires an authenticated user'
      using errcode = 'insufficient_privilege';
  end if;

  if v_title = '' then
    raise exception 'a project title is required'
      using errcode = 'check_violation';
  end if;

  -- Sanity: a band whose floor is above its ceiling is a typo, not a band.
  if p_budget_min_cents is not null and p_budget_max_cents is not null
     and p_budget_min_cents > p_budget_max_cents then
    raise exception 'budget band minimum exceeds its maximum'
      using errcode = 'check_violation';
  end if;

  -- Retry guard: if the caller-supplied id already exists, this is the same
  -- act arriving twice — return the existing project (ours) instead of
  -- inserting a sibling. A foreign id is a privilege error, not a no-op.
  if p_id is not null then
    select * into v_existing from projects where id = p_id;
    if found then
      if v_existing.designer_id is distinct from v_designer then
        raise exception 'project % belongs to another designer', p_id
          using errcode = 'insufficient_privilege';
      end if;
      return v_existing.id;
    end if;
  end if;

  insert into projects (
    id, name, status, designer_id, client_id, created_by,
    proposal_id, start_date, budget_min, budget_max
  )
  values (
    v_id, v_title, 'active', v_designer, p_client_id, v_designer,
    null, p_start_date, p_budget_min_cents, p_budget_max_cents
  )
  on conflict (id) do nothing;

  -- Ensure + advance the relationship (mirror of what activation does for the
  -- client's status). 00331 delta: idx_designer_clients_unique_profile now
  -- covers only NON-LEAD rows, so this runs in two steps:
  --   (a) preserve 00237's behavior for the classic single-lead-row pair —
  --       promote that row to 'active' — but only when the pair has no engaged
  --       (non-lead) row (promoting alongside one would violate the re-scoped
  --       index), and at most ONE row (oldest) when several lead engagements
  --       exist;
  --   (b) otherwise insert/advance the engaged row. The ON CONFLICT inference
  --       clause mirrors the new index predicate ('lead' can no longer appear
  --       among conflicts, so the DO UPDATE where-list drops it).
  if p_client_id is not null then
    update designer_clients dc
       set status     = 'active',
           updated_at = now()
     where dc.designer_id = v_designer
       and dc.client_id   = p_client_id
       and dc.status      = 'lead'
       and dc.id = (
             select dc3.id from designer_clients dc3
              where dc3.designer_id = v_designer
                and dc3.client_id   = p_client_id
                and dc3.status      = 'lead'
              order by dc3.created_at
              limit 1)
       and not exists (
             select 1 from designer_clients dc2
              where dc2.designer_id = v_designer
                and dc2.client_id   = p_client_id
                and dc2.id <> dc.id
                and dc2.status <> 'lead');

    if not found then
      insert into designer_clients (designer_id, client_id, source, status)
      values (v_designer, p_client_id, 'direct', 'active')
      on conflict (designer_id, client_id) where client_id is not null and status <> 'lead'
      do update
        set status     = 'active',
            updated_at = now()
        where designer_clients.status in ('proposal', 'prospect');
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.open_project_direct(text, uuid, integer, integer, date, uuid)
  to authenticated;

comment on function public.open_project_direct(text, uuid, integer, integer, date, uuid) is
  'R79: open a project directly, skipping the proposal. Designer-invoked (SECURITY '
  'DEFINER; guards auth + title + budget band internally). Inserts the project '
  '(status ''active'', proposal_id NULL, designer_id/created_by = auth.uid()) and '
  'ensures/advances the designer_clients relationship to ''active''. Body lineage '
  '00237 → 00331: the relationship step now promotes a lone lead-engagement row '
  'explicitly and its ON CONFLICT inference matches the 00331 re-scoped '
  'idx_designer_clients_unique_profile (non-lead rows only). p_id makes a retried '
  'act return the already-created project instead of double-inserting.';

-- ── 4. activate_proposal_as_project regraft (00326 body verbatim + 1 delta) ──
-- The 461-line body below is the 00326 head copied VERBATIM; the ONLY delta is
-- the final designer_clients UPDATE (marked "-- 00331 delta"), which promotes
-- exactly one relationship row — preferring the proposal's own engagement row
-- (designer_client_id, 00327) — and never promotes a 'lead' row into collision
-- with the pair's existing engaged row under the re-scoped unique index.
CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal RECORD;
  v_project_id UUID;
  v_design_fee_total INTEGER := 0;
  v_ffe_budget_total INTEGER := 0;
  v_room RECORD;
  v_new_room_id UUID;
  v_item RECORD;
  v_item_notes TEXT;
  v_item_eta DATE;
  v_phase RECORD;
  v_new_phase_id UUID;
  v_milestone RECORD;
  v_new_milestone_id UUID;       -- 00274 delta
  v_kickoff_milestone_id UUID;   -- 00274 delta
  v_kickoff_amount_cents INTEGER; -- 00274 delta
  v_co_terms RECORD;
  v_team RECORD;
  v_section RECORD;
  v_palette RECORD;
  v_swatches JSONB;
  v_board RECORD;
  v_board_items JSONB;
  v_scope_room_map JSONB := '{}'::jsonb;
  v_exclusions JSONB;
  v_running_date DATE;
  v_phase_map JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or not in accepted status', p_proposal_id;
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal % already activated as project %', p_proposal_id, v_proposal.project_id;
  END IF;

  SELECT COALESCE(SUM(fee_cents), 0) INTO v_design_fee_total
  FROM proposal_phases
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(SUM(line_total_cents), 0) INTO v_ffe_budget_total
  FROM proposal_items
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', pe.description,
    'category', pe.category
  ) ORDER BY pe.sort_order), '[]'::jsonb)
  INTO v_exclusions
  FROM proposal_exclusions pe
  WHERE pe.proposal_id = p_proposal_id;

  SELECT * INTO v_co_terms
  FROM proposal_change_order_terms
  WHERE proposal_id = p_proposal_id;

  INSERT INTO projects (
    proposal_id, designer_id, client_id, name, status, notes,
    budget_cents, total_amount_cents, design_fee_cents, start_date,
    site_address, kickoff_message, client_visibility_tier,
    scope_boundaries,
    change_order_terms,
    created_by
  ) VALUES (
    p_proposal_id,
    v_proposal.designer_id,
    v_proposal.client_id,
    v_proposal.title,
    'active',
    v_proposal.description,
    v_ffe_budget_total,
    v_proposal.total_amount,
    v_design_fee_total,
    p_start_date,
    v_proposal.project_address,
    v_proposal.personal_message,
    COALESCE(v_proposal.client_visibility_tier, 'milestone'),
    v_exclusions,
    CASE WHEN v_co_terms IS NOT NULL THEN jsonb_build_object(
      'process_description', v_co_terms.process_description,
      'hourly_rate_cents', v_co_terms.hourly_rate_cents,
      'minimum_fee_cents', v_co_terms.minimum_fee_cents,
      'approval_required', v_co_terms.approval_required
    ) ELSE '{}'::jsonb END,
    v_proposal.designer_id
  )
  RETURNING id INTO v_project_id;

  FOR v_room IN
    SELECT * FROM proposal_scope_rooms
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_rooms (
      project_id, source_scope_room_id, room_id,
      name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id, v_room.id, v_room.room_id,
      v_room.name, v_room.room_type, v_room.dimensions, v_room.floor_area_sqft,
      v_room.budget_cents, v_room.ffe_categories, v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_room_id;

    v_scope_room_map := v_scope_room_map || jsonb_build_object(v_room.id::text, v_new_room_id::text);

    FOR v_item IN
      SELECT * FROM proposal_items
      WHERE proposal_id = p_proposal_id AND scope_room_id = v_room.id
      ORDER BY position
    LOOP
      v_item_notes := COALESCE(v_item.notes, '');
      IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
        v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                        || 'Internal: ' || v_item.internal_notes;
      END IF;
      v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                         THEN p_start_date + (v_item.lead_time_weeks * 7)
                         ELSE NULL END;

      -- 00279: unit_price_cents = CLIENT price (unit_sell_price); trade price +
      -- markup carry alongside (restores the 00185 dual-pricing repair that
      -- 00199 reverted). line_total_cents was already the client total.
      -- GREATEST/COALESCE clamps mirror the 00185 tier-a backfill: negative
      -- trade/markup (writable via direct PostgREST, propagated by
      -- clone_proposal) would violate the 00185 >= 0 CHECKs and block activation.
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
        'specified',
        v_item.quantity,
        v_item.unit_sell_price,
        GREATEST(COALESCE(v_item.unit_price, 0), 0),
        GREATEST(COALESCE(v_item.markup_percent, 0), 0),
        v_item.line_total_cents,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_id, v_item.vendor_name, v_item_eta,
        NULLIF(v_item_notes, ''),
        v_item.position
      );
    END LOOP;
  END LOOP;

  FOR v_item IN
    SELECT * FROM proposal_items
    WHERE proposal_id = p_proposal_id AND scope_room_id IS NULL
    ORDER BY position
  LOOP
    v_item_notes := COALESCE(v_item.notes, '');
    IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
      v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                      || 'Internal: ' || v_item.internal_notes;
    END IF;
    v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                       THEN p_start_date + (v_item.lead_time_weeks * 7)
                       ELSE NULL END;

    -- 00279: same dual-pricing mapping as the room loop above (restores 00185).
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
      'specified',
      v_item.quantity,
      v_item.unit_sell_price,
      GREATEST(COALESCE(v_item.unit_price, 0), 0),
      GREATEST(COALESCE(v_item.markup_percent, 0), 0),
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_id, v_item.vendor_name, v_item_eta,
      NULLIF(v_item_notes, ''),
      v_item.position
    );
  END LOOP;

  -- Custom field DEFS (S6, 00268): copy the proposal's schedule columns onto
  -- project-owned rows (same field_key/name/kind/sort). The per-line VALUES ride
  -- along in project_ffe_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap.
  INSERT INTO spec_field_defs (project_id, field_key, name, kind, sort_order)
  SELECT v_project_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_proposal_id;

  -- 00324 delta (1): TWO-PASS phase copy. Pass 1 inserts every project_phase
  -- with follows_phase_id NULL (a forward chain reference cannot be resolved in
  -- a single pass), carrying the chain columns duration_days / anchor_date /
  -- lane, and builds v_phase_map. The legacy start/target cascade is KEPT but
  -- now advances by duration_days when present (delta 2) — a naive compat
  -- approximation the gated Spine UI never reads (the resolver is TS-only).
  v_running_date := p_start_date;
  FOR v_phase IN
    SELECT * FROM proposal_phases
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_phases (
      project_id, source_proposal_phase_id,
      name, phase_key, status,
      start_date, target_end_date, duration_weeks,
      duration_days, anchor_date, lane, follows_phase_id,   -- 00324: chain columns
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14),  -- 00324 delta (2)
      v_phase.duration_weeks,
      v_phase.duration_days, v_phase.anchor_date, v_phase.lane, NULL,   -- 00324: follows remapped in pass 2
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
    v_running_date := v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14);  -- 00324 delta (2)
  END LOOP;

  -- 00324 delta (1), pass 2: remap the follows chain now that v_phase_map holds
  -- every source→new phase pairing. Resolves forward references a single-pass
  -- insertion cannot.
  UPDATE project_phases pp
  SET follows_phase_id = (v_phase_map ->> src.follows_phase_id::text)::uuid
  FROM proposal_phases src
  WHERE pp.source_proposal_phase_id = src.id
    AND pp.project_id = v_project_id
    AND src.follows_phase_id IS NOT NULL;

  -- 00324 delta (3): translate anchored proposal milestones into project-side
  -- schedule_milestones. phase_id remaps through v_phase_map; anchor_date / kind
  -- / name / sort_order carry; offset_days is NULL and status is 'upcoming'
  -- (activation stamps the working status — R101.3). No schedule_revisions
  -- write (Slice 05).
  INSERT INTO schedule_milestones (phase_id, name, kind, offset_days, anchor_date, status, sort_order)
  SELECT (v_phase_map ->> psm.phase_id::text)::uuid,
         psm.name, psm.kind, NULL, psm.anchor_date, 'upcoming', psm.sort_order
  FROM proposal_schedule_milestones psm
  JOIN proposal_phases pp ON pp.id = psm.phase_id
  WHERE pp.proposal_id = p_proposal_id;

  -- 00326: Slice 05 memory — freeze the baseline. project_phases +
  -- schedule_milestones are now fully written (the two-pass follows remap
  -- above and this milestone insert are the last touches to either table),
  -- so cut the v1 revision snapshot. cut_schedule_revision is SECURITY
  -- DEFINER and derives its actor from auth.uid() INTERNALLY (deliberately
  -- not a parameter — banner §1); inside this DEFINER function auth.uid()
  -- STILL resolves to the signing session user (SECURITY DEFINER swaps the
  -- role, never the request.jwt GUC that auth.uid() reads), and that user is
  -- the proposal's client (sign_proposal, 00210) or designer
  -- (record_offline_signature, 00254) — the cut's designer-OR-client guard
  -- accepts either. NOT wrapped in an exception block (unlike the deposit
  -- auto-draft): the baseline is a hard guarantee of activation, not a
  -- best-effort side effect.
  PERFORM cut_schedule_revision(v_project_id, 'Baseline v1 — cut at signature');

  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 00274: the kickoff milestone (sort_order = 0, seeded 'outstanding' at
  -- signing) is stamped trigger_kind = 'on_signing'. The NOT EXISTS guard is
  -- defensive-only — v_project_id is fresh from the INSERT above, so no
  -- project_payment_milestones row for it can already exist — but it keeps
  -- the invariant "at most one on_signing milestone per project" true even
  -- if this function is ever reached a second time for the same project.
  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, due_date, sort_order,
      trigger_kind
    ) VALUES (
      v_project_id,
      CASE WHEN v_milestone.phase_id IS NOT NULL
        THEN (v_phase_map ->> v_milestone.phase_id::text)::UUID
        ELSE NULL
      END,
      v_milestone.label, v_milestone.percentage,
      v_milestone.amount_cents, v_milestone.trigger_condition,
      CASE v_milestone.sort_order WHEN 0 THEN 'outstanding' ELSE 'pending' END,
      CASE v_milestone.sort_order WHEN 0 THEN p_start_date ELSE NULL END,
      v_milestone.sort_order,
      CASE
        WHEN v_milestone.sort_order = 0
             AND NOT EXISTS (
               SELECT 1 FROM project_payment_milestones existing
               WHERE existing.project_id = v_project_id
                 AND existing.trigger_kind = 'on_signing'
             )
        THEN 'on_signing'
        ELSE NULL
      END
    )
    RETURNING id INTO v_new_milestone_id;

    IF v_milestone.sort_order = 0 THEN
      v_kickoff_milestone_id := v_new_milestone_id;
      v_kickoff_amount_cents := v_milestone.amount_cents;
    END IF;
  END LOOP;

  -- 00274: auto-draft the deposit invoice. Draft only (review-then-send per
  -- R26/R11 stands — the designer still uses Issue & Send). Guarded to
  -- amount_cents > 0 because draft_invoice_from_milestone (00204) has no
  -- zero-amount special case of its own. Wrapped so drafting can NEVER fail
  -- activation — a client signature must succeed even if this hits an edge
  -- case; the milestone simply stays undrafted for the designer to pick up
  -- manually via Generate-invoice (00204).
  IF v_kickoff_milestone_id IS NOT NULL AND v_kickoff_amount_cents > 0 THEN
    BEGIN
      PERFORM draft_invoice_from_milestone(v_kickoff_milestone_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'activate_proposal_as_project: deposit auto-draft failed for milestone % (project %): %',
        v_kickoff_milestone_id, v_project_id, SQLERRM;
    END;
  END IF;

  FOR v_team IN
    SELECT * FROM proposal_team_members
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, created_at
  LOOP
    INSERT INTO project_team_members (
      project_id, user_id, role, permissions,
      assigned_by, assigned_at
    ) VALUES (
      v_project_id, v_team.user_id, v_team.role, COALESCE(v_team.permissions, '{}'::jsonb),
      v_proposal.designer_id, NOW()
    )
    ON CONFLICT (project_id, user_id, role) DO NOTHING;
  END LOOP;

  FOR v_section IN
    SELECT * FROM proposal_sections
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_narrative_sections (
      project_id, source_section_id,
      type, title, body, metadata, sort_order
    ) VALUES (
      v_project_id, v_section.id,
      v_section.type, v_section.title, v_section.body,
      COALESCE(v_section.metadata, '{}'::jsonb), v_section.sort_order
    );
  END LOOP;

  FOR v_palette IN
    SELECT * FROM proposal_palettes
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'hex', ps.hex,
      'name', ps.name,
      'role', ps.role,
      'paint_color_id', ps.paint_color_id,
      'brand', ps.brand,
      'brand_code', ps.brand_code,
      'sort_order', ps.sort_order
    ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_swatches
    FROM palette_swatches ps
    WHERE ps.palette_id = v_palette.id;

    INSERT INTO project_palettes (
      project_id, source_palette_id,
      name, is_primary, source_image_url, notes,
      scope_room_id, swatches, sort_order
    ) VALUES (
      v_project_id, v_palette.id,
      v_palette.name, COALESCE(v_palette.is_primary, FALSE),
      v_palette.source_image_url, v_palette.notes,
      CASE WHEN v_palette.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_palette.scope_room_id::text)::UUID
        ELSE NULL END,
      v_swatches, v_palette.sort_order
    );
  END LOOP;

  -- Mood boards (00180): snapshot each proposal board into project_boards
  -- with its items embedded as an ordered JSONB array. The board's scope
  -- room is remapped to the new project_rooms row the same way palettes are.
  FOR v_board IN
    SELECT * FROM proposal_boards
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', bi.type,
      'x', bi.x,
      'y', bi.y,
      'width', bi.width,
      'height', bi.height,
      'z_index', bi.z_index,
      'rotation', bi.rotation,
      'product_id', bi.product_id,
      'image_url', bi.image_url,
      'content', bi.content,
      'data', bi.data
    ) ORDER BY bi.z_index, bi.created_at), '[]'::jsonb)
    INTO v_board_items
    FROM proposal_board_items bi
    WHERE bi.board_id = v_board.id;

    INSERT INTO project_boards (
      project_id, source_board_id, name, project_room_id,
      cover_image_url, canvas_width, canvas_height, background_color,
      items, sort_order
    ) VALUES (
      v_project_id, v_board.id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_board.scope_room_id::text)::UUID
        ELSE NULL END,
      v_board.cover_image_url, v_board.canvas_width, v_board.canvas_height,
      v_board.background_color,
      v_board_items, v_board.sort_order
    );
  END LOOP;

  UPDATE proposals SET project_id = v_project_id WHERE id = p_proposal_id;

  -- 00331 delta (Arrival Arc): idx_designer_clients_unique_profile now covers
  -- only NON-LEAD rows, and a pair may hold one engaged row plus per-engagement
  -- 'lead' rows. Promote exactly ONE relationship row — preferring the
  -- proposal's own engagement row (designer_client_id, 00327) — and never
  -- promote a 'lead' row when an engaged row already exists for the pair
  -- (that would 23505 against the re-scoped unique index). For every
  -- pre-00331 data shape (at most one row per pair) this is behaviorally
  -- identical to the old pair-wide UPDATE.
  UPDATE designer_clients dc
  SET status = 'active', updated_at = NOW()
  WHERE dc.designer_id = v_proposal.designer_id
    AND dc.client_id = v_proposal.client_id
    AND dc.status IN ('lead', 'proposal')
    AND dc.id = (
      SELECT dc3.id FROM designer_clients dc3
       WHERE dc3.designer_id = v_proposal.designer_id
         AND dc3.client_id   = v_proposal.client_id
         AND dc3.status IN ('lead', 'proposal')
       ORDER BY (dc3.id IS NOT DISTINCT FROM v_proposal.designer_client_id) DESC,
                dc3.created_at
       LIMIT 1)
    AND (dc.status = 'proposal'
         OR NOT EXISTS (
              SELECT 1 FROM designer_clients dc2
               WHERE dc2.designer_id = dc.designer_id
                 AND dc2.client_id   = dc.client_id
                 AND dc2.id <> dc.id
                 AND dc2.status <> 'lead'));

  RETURN v_project_id;
END;
$function$;

COMMENT ON FUNCTION public.activate_proposal_as_project(uuid, date) IS
  'Bridges an accepted proposal into an active project (body lineage: 00140 → 00167 → 00180 → 00185 → 00199 → 00262 → 00269 → 00274 → 00279 → 00324 → 00326 → 00331). '
  '00279 reconciles the 00185 FF&E dual-pricing repair 00199 reverted; 00324 carries the schedule chain (two-pass follows remap + anchored milestone translation); 00326 (R100) cuts the v1 baseline at signature. '
  '00331 (Arrival Arc) adds ONE delta: the final designer_clients UPDATE promotes exactly one relationship row — preferring the proposal''s own engagement row (designer_client_id, 00327) — and never promotes a lead row into collision with the pair''s engaged row under the re-scoped idx_designer_clients_unique_profile. Everything else is byte-identical to 00326.';
