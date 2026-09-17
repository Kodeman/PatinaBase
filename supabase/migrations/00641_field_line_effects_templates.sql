-- ═══════════════════════════════════════════════════════════════════════════
-- 00641 — The Field Line (Phase 0, P0-05): the delivery effects, the authority
--          that answers for them, and the compliance copy
--
-- Lineage for public.apply_field_effect:
--   00282:225 (the legacy core; 00399 renamed it to
--   _apply_field_effect_legacy_00399) → 00399:4878 (the guarded wrapper, the
--   `grep … | sort | tail -1` winner at this commit) → 00641 (here).
--   The 00399 wrapper's one job — pinning app.client_decision_write_id for a
--   coordination target so the journey's decision-capability guard passes — is
--   kept verbatim, and every legacy effect name still reaches the legacy core
--   unchanged. This file only ADDS a vocabulary beside it.
--
-- Contract S3 (effects), S8 (copy), S12 (privileges).
--
-- WHAT LANDS HERE
--
--   1. public.field_delivery_reports — the record the delivery asks answer.
--      Nothing in the schema could hold "they said Tuesday 2-4", "they are
--      here", "one carton is scratched" or "they left": receiving_inspections
--      needs an auth.users inspector (a field party is login-less, R46),
--      client_decisions has no delivery kind, and project_tasks carries a date
--      and a status and nothing about a visit. Writing those facts into
--      project_tasks.description as prose is how the rail became untruthful in
--      the first place, so they get columns.
--
--      ONE ROW PER (party, subject). Availability, arrival, condition and
--      departure are four columns on one visit, never four states of one
--      column — S3's "arrival and condition stay distinct" is a shape, not a
--      convention.
--
--   2. The authority gate, IN THE DATABASE. pipeline.ts:646-733 classifies an
--      effect through two TypeScript maps and then reads project_party_authority
--      (00624). An effect name missing from those maps files as
--      n/a / failed_no_authority — i.e. the map, not the grant, is what decides
--      today, and a map is not an authority. public.field_effect_authority_scopes()
--      is the same table expressed where it cannot be bypassed, and
--      apply_field_effect refuses an effect the seat holds no in-force grant
--      for, with the stable code `field_effect_no_authority`
--      (SQLSTATE 42501, and the token repeated in DETAIL so a PostgREST caller
--      can branch on it without parsing prose).
--
--      The map (delivered to P0-06a for AUTHORITY_SCOPES/COORDINATION_CLASS):
--        confirm_availability → scope schedule      (decision class schedule)
--        report_arrival       → scope site_access|key (class site_access)
--        report_departure     → scope site_access|key (class site_access)
--        report_condition     → NO scope             (class logistics)
--      Availability and presence are acts the job works to, and 00624's
--      `schedule` and `site_access` scopes name exactly them; pipeline.ts
--      already treats a party's report_delay as class `schedule` and asks the
--      grant. A CONDITION REPORT IS DELIBERATELY UNGATED: it states what the
--      person is looking at. Refusing it for want of a grant would suppress the
--      one fact the studio most needs, so instead a not-ok condition opens the
--      message for review and names an owner.
--
--   3. The four effects. Availability NEVER marks goods received (no task
--      close, no receiving row, no arrived_at); arrival and condition are
--      separate writes; the actor is the party; the cross-project forgery guard
--      of 00282:288-306 is re-asserted here for the subject, because the new
--      branch does not pass through the legacy core.
--
--   4. The compliance copy (contract S8). The canonical rates/HELP/STOP line is
--      defined ONCE, in one plpgsql constant, and appended to every sms_% body
--      in email_templates — the six corrected Field Line bodies explicitly, and
--      any other sms_% row by sweep. Studio name first in every body;
--      "Patina" only in the opt-in invite (the one message that has to name who
--      is relaying); sms_optin_invite renders "Reply YES {{code}}";
--      sms_delivery_confirm carries "Ref {{ref}}".
--
-- Idempotent throughout: CREATE … IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY
-- IF EXISTS + CREATE, guarded ALTER … ADD CONSTRAINT, and template writes that
-- converge (the closing line is appended only when it is not already the tail).
--
-- Privileges (contract S12): on this stack ALTER DEFAULT PRIVILEGES still hands
-- anon and authenticated full rights on a new table at creation, so the new
-- table carries an explicit REVOKE ALL … FROM PUBLIC, anon, authenticated
-- BEFORE its policy, and supabase/seed/00-legacy-grants.sql is regenerated in
-- the same commit (config.toml [db.seed] replays it AFTER migrations, so an
-- un-regenerated seed silently re-grants what this file revokes).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. public.field_delivery_reports — what the field said about one delivery
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.field_delivery_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id        uuid NOT NULL,

  -- The prompt's subject (sms_prompts.subject_id) — a task or a coordination
  -- item on the party's OWN project. Not an FK: two target tables, and the
  -- forgery guard in apply_field_effect is what holds it to the project.
  subject_kind    text NOT NULL,
  subject_id      uuid NOT NULL,

  -- confirm_availability. A PROPOSAL, written where the studio can read it.
  -- It is not the schedule: nothing here moves project_tasks.due_date.
  proposed_date   date,
  proposed_window text,
  availability_at timestamptz,

  -- report_arrival / report_departure. Presence, not receipt.
  arrived_at      timestamptz,
  left_at         timestamptz,

  -- report_condition.
  condition_ok    boolean,
  condition_note  text,
  condition_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_delivery_reports_subject_kind_check
    CHECK (subject_kind IN ('task', 'coordination')),
  CONSTRAINT field_delivery_reports_window_len_check
    CHECK (proposed_window IS NULL OR length(proposed_window) <= 120),
  CONSTRAINT field_delivery_reports_note_len_check
    CHECK (condition_note IS NULL OR length(condition_note) <= 2000)
);

-- The seat must belong to the report's OWN project — the same composite key
-- 00639 used for sms_prompts, so a report naming another studio's party is not
-- merely unreadable, it is unwritable.
DO $field_delivery_reports_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'field_delivery_reports_party_project_fkey'
       AND conrelid = 'public.field_delivery_reports'::regclass
  ) THEN
    ALTER TABLE public.field_delivery_reports
      ADD CONSTRAINT field_delivery_reports_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE CASCADE;
  END IF;
END;
$field_delivery_reports_fk$;

CREATE UNIQUE INDEX IF NOT EXISTS field_delivery_reports_subject_uniq
  ON public.field_delivery_reports (party_id, subject_kind, subject_id);

CREATE INDEX IF NOT EXISTS idx_field_delivery_reports_project
  ON public.field_delivery_reports (project_id, updated_at DESC);

COMMENT ON TABLE public.field_delivery_reports IS
  'The Field Line (00641), contract S3: one row per (seat, delivery subject) '
  'holding what the field actually said — the window they proposed, when they '
  'arrived, what the goods looked like, when they left. Four distinct columns '
  'on purpose: availability is not receipt and arrival is not condition, and a '
  'single status column would let one of them stand in for another. Written '
  'only through apply_field_effect (SECURITY DEFINER); readable by the '
  'project''s studio.';
COMMENT ON COLUMN public.field_delivery_reports.proposed_date IS
  'The date the party proposed, resolved by the parser against the day they '
  'texted. NULL when they answered with a rule rather than a day ("any weekday '
  'after 1").';
COMMENT ON COLUMN public.field_delivery_reports.proposed_window IS
  'Their own words for the window ("2-4", "morning", "weekdays after 1"). A '
  'proposal on the record, never a write to project_tasks.due_date: moving the '
  'schedule is a separate act by someone who holds the schedule grant.';
COMMENT ON COLUMN public.field_delivery_reports.arrived_at IS
  'First arrival wins: a second "here" on the same subject is the same visit '
  'and must not silently restate when it began.';
COMMENT ON COLUMN public.field_delivery_reports.left_at IS
  'Last departure wins: "done for today" is about now, and a later one is a '
  'later truth.';
COMMENT ON COLUMN public.field_delivery_reports.condition_ok IS
  'What they said about the goods. FALSE also opens sms_messages.needs_review '
  'and names an owner (the project lead) — a damage report that only sat in a '
  'column is a damage report nobody read.';

ALTER TABLE public.field_delivery_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.field_delivery_reports FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.field_delivery_reports TO authenticated;
GRANT  ALL    ON public.field_delivery_reports TO service_role;

DROP POLICY IF EXISTS field_delivery_reports_team_select
  ON public.field_delivery_reports;
CREATE POLICY field_delivery_reports_team_select
  ON public.field_delivery_reports FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_delivery_reports.project_id
        AND (p.designer_id = (select auth.uid()) OR public.is_studio_comember(p.designer_id))
    )
  );
-- No INSERT/UPDATE/DELETE policy on purpose: every write goes through
-- apply_field_effect, which is the field's single mutation choke point.

DROP TRIGGER IF EXISTS set_updated_at_field_delivery_reports
  ON public.field_delivery_reports;
CREATE TRIGGER set_updated_at_field_delivery_reports
  BEFORE UPDATE ON public.field_delivery_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The authority table, expressed where it cannot be bypassed
-- ═══════════════════════════════════════════════════════════════════════════

-- NULL  → not a Field Line delivery effect (the legacy vocabulary; the legacy
--         core answers for it exactly as before).
-- {}    → a Field Line effect that needs NO grant (a report of fact).
-- {…}   → the 00624 scopes, any one of which answers for the effect.
CREATE OR REPLACE FUNCTION public.field_effect_authority_scopes(p_effect_type text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_effect_type
    WHEN 'confirm_availability' THEN ARRAY['schedule']
    WHEN 'report_arrival'       THEN ARRAY['site_access', 'key']
    WHEN 'report_departure'     THEN ARRAY['site_access', 'key']
    WHEN 'report_condition'     THEN ARRAY[]::text[]
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.field_effect_authority_scopes(text) IS
  'The Field Line (00641), contract S3: which project_party_authority (00624) '
  'scopes answer for a delivery effect. NULL means "not one of ours" — the '
  'legacy apply_field_effect core keeps its own vocabulary and its own guards. '
  'An empty array means the effect is a statement of fact (report_condition) '
  'and is never refused for want of a grant. pipeline.ts:671-690 carries the '
  'same table in TypeScript for its touch record; THIS one is the authority, '
  'because a map that only exists in the caller can be bypassed by another '
  'caller.';

CREATE OR REPLACE FUNCTION public.party_holds_field_authority(
  p_party_id uuid,
  p_scopes   text[],
  p_on       date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_scopes IS NULL              THEN true
    WHEN cardinality(p_scopes) = 0     THEN true
    ELSE EXISTS (
      SELECT 1
        FROM public.project_party_authority a
       WHERE a.engagement_id = p_party_id
         AND a.scope = ANY (p_scopes)
         AND a.effective_from <= p_on
         AND (a.effective_to IS NULL OR a.effective_to >= p_on)
    )
  END;
$$;

COMMENT ON FUNCTION public.party_holds_field_authority(uuid, text[], date) IS
  'Does this seat hold an in-force 00624 grant for any of these scopes on this '
  'day? Mirrors authorityVerdictFor() (pipeline.ts:691-733) minus its '
  'prepares_only leg, which PR-n makes decisive on MONEY only — none of the '
  'Field Line delivery scopes is a money scope, and "prepares the paperwork" '
  'says nothing about whether someone may be on site or name a window.';

REVOKE ALL ON FUNCTION public.field_effect_authority_scopes(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.field_effect_authority_scopes(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.party_holds_field_authority(uuid, text[], date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_holds_field_authority(uuid, text[], date)
  TO service_role;

-- Who owns a review that nobody claimed? The project lead — the current
-- lead_designer seat on the project, else the project's designer of record.
CREATE OR REPLACE FUNCTION public.field_project_lead_user(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT tm.user_id
        FROM public.project_team_members tm
       WHERE tm.project_id = p_project_id
         AND tm.role = 'lead_designer'
         AND tm.removed_at IS NULL
       ORDER BY tm.assigned_at NULLS LAST, tm.created_at NULLS LAST, tm.user_id
       LIMIT 1
    ),
    (SELECT p.designer_id FROM public.projects p WHERE p.id = p_project_id)
  );
$$;

COMMENT ON FUNCTION public.field_project_lead_user(uuid) IS
  'The Field Line (00641): the studio person a field review lands on when no '
  'one has claimed it — the project''s active lead_designer seat, else the '
  'designer of record. Used for sms_messages.owner_user_id (00639, contract '
  'S4) when a condition report says the goods are not ok.';

REVOKE ALL ON FUNCTION public.field_project_lead_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.field_project_lead_user(uuid)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The delivery effects
-- ═══════════════════════════════════════════════════════════════════════════
-- Kept OUT of the legacy core deliberately: 00282's body is the coordination
-- vocabulary and its guards, and grafting four new branches into it would mean
-- re-emitting a 250-line function that five later migrations depend on. This
-- one is reached only from the wrapper below, which is the only place that
-- decides which vocabulary a type belongs to.
CREATE OR REPLACE FUNCTION public._apply_field_delivery_effect(
  p_party_id       uuid,
  p_effect         jsonb,
  p_source         text,
  p_sms_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_party       public.project_parties;
  v_project_id  uuid;
  v_type        text  := p_effect->>'type';
  v_target_kind text  := p_effect#>>'{target,kind}';
  v_target_id   uuid  := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_note        text  := NULLIF(btrim(COALESCE(p_effect#>>'{condition,note}', p_effect->>'note', '')), '');
  v_scopes      text[] := public.field_effect_authority_scopes(p_effect->>'type');
  v_now         timestamptz := now();
  v_title       text;
  v_summary     text;
  v_when        text;
  v_date        date;
  v_window      text;
  v_ok_raw      text;
  v_ok          boolean;
  v_owner       uuid;
  v_report_id   uuid;
  v_task_id     uuid;
  v_item_id     uuid;
  v_remaining   integer;
  v_result      jsonb;
BEGIN
  -- ── The party is the actor and the tenant anchor ────────────────────────
  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_field_effect: party % not found', p_party_id
      USING ERRCODE = 'no_data_found';
  END IF;
  v_project_id := v_party.project_id;

  -- ── The authority gate (contract S3) ────────────────────────────────────
  -- Refused here, not in the caller's map: the grant is the authority.
  IF NOT public.party_holds_field_authority(
       p_party_id, v_scopes, (v_now AT TIME ZONE 'UTC')::date
     ) THEN
    RAISE EXCEPTION
      'apply_field_effect: field_effect_no_authority — % needs an in-force % grant on party %',
      v_type, array_to_string(v_scopes, ' or '), p_party_id
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_effect_no_authority',
            HINT    = 'project_party_authority (00624) holds no in-force grant for this seat and scope.';
  END IF;

  -- ── FORGERY GUARD: the subject belongs to the party's project ───────────
  IF v_target_id IS NULL OR v_target_kind IS NULL THEN
    RAISE EXCEPTION
      'apply_field_effect: % needs the prompt subject as its target', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_target_kind = 'task' THEN
    SELECT t.title INTO v_title
      FROM public.project_tasks t
     WHERE t.id = v_target_id AND t.project_id = v_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_field_effect: task % is not on party %''s project',
        v_target_id, p_party_id USING ERRCODE = 'check_violation';
    END IF;
    v_task_id := v_target_id;
  ELSIF v_target_kind = 'coordination' THEN
    SELECT cd.title INTO v_title
      FROM public.client_decisions cd
     WHERE cd.id = v_target_id AND cd.project_id = v_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_field_effect: item % is not on party %''s project',
        v_target_id, p_party_id USING ERRCODE = 'check_violation';
    END IF;
    v_item_id := v_target_id;
  ELSE
    RAISE EXCEPTION 'apply_field_effect: % cannot target a %', v_type, v_target_kind
      USING ERRCODE = 'check_violation';
  END IF;

  -- One visit record per (seat, subject).
  INSERT INTO public.field_delivery_reports (project_id, party_id, subject_kind, subject_id)
  VALUES (v_project_id, p_party_id, v_target_kind, v_target_id)
  ON CONFLICT (party_id, subject_kind, subject_id) DO NOTHING;

  SELECT r.id INTO v_report_id
    FROM public.field_delivery_reports r
   WHERE r.party_id = p_party_id
     AND r.subject_kind = v_target_kind
     AND r.subject_id = v_target_id;

  -- ── Dispatch ────────────────────────────────────────────────────────────
  IF v_type = 'confirm_availability' THEN
    v_date := NULLIF(btrim(COALESCE(
      p_effect#>>'{availability,date}', p_effect->>'new_date', ''
    )), '')::date;
    v_window := NULLIF(btrim(COALESCE(
      p_effect#>>'{availability,window}', p_effect->>'window', ''
    )), '');

    IF v_date IS NULL AND v_window IS NULL THEN
      RAISE EXCEPTION
        'apply_field_effect: confirm_availability needs a date or a window'
        USING ERRCODE = 'check_violation';
    END IF;

    -- AVAILABILITY IS NOT RECEIPT. No task close, no arrived_at, no receiving
    -- row — a window someone offered is not goods on the floor.
    UPDATE public.field_delivery_reports
       SET proposed_date   = v_date,
           proposed_window = v_window,
           availability_at = v_now
     WHERE id = v_report_id;

    v_when := btrim(
      COALESCE(to_char(v_date, 'Mon FMDD'), '') ||
      CASE WHEN v_window IS NOT NULL
           THEN CASE WHEN v_date IS NOT NULL THEN ' ' ELSE '' END || v_window
           ELSE '' END
    );
    v_summary := 'Noted for "' || COALESCE(v_title, 'the delivery') || '": ' ||
                 v_when || '. Nothing is marked received.';

  ELSIF v_type = 'report_arrival' THEN
    UPDATE public.field_delivery_reports
       SET arrived_at = COALESCE(arrived_at, v_now)
     WHERE id = v_report_id;
    v_summary := 'Arrival logged for "' || COALESCE(v_title, 'the delivery') || '".';

  ELSIF v_type = 'report_departure' THEN
    UPDATE public.field_delivery_reports
       SET left_at = v_now
     WHERE id = v_report_id;
    v_summary := 'Departure logged for "' || COALESCE(v_title, 'the delivery') || '".';

  ELSIF v_type = 'report_condition' THEN
    v_ok_raw := NULLIF(btrim(COALESCE(
      p_effect#>>'{condition,ok}', p_effect->>'ok', ''
    )), '');
    IF v_ok_raw IS NULL THEN
      RAISE EXCEPTION 'apply_field_effect: report_condition needs ok true or false'
        USING ERRCODE = 'check_violation';
    END IF;
    v_ok := v_ok_raw::boolean;

    UPDATE public.field_delivery_reports
       SET condition_ok   = v_ok,
           condition_note = v_note,
           condition_at   = v_now
     WHERE id = v_report_id;

    IF v_ok THEN
      v_summary := 'Condition logged for "' || COALESCE(v_title, 'the delivery') || '": looks good.';
    ELSE
      -- A problem is not a column entry. Open the review and name its owner.
      IF p_sms_message_id IS NOT NULL THEN
        v_owner := public.field_project_lead_user(v_project_id);
        UPDATE public.sms_messages
           SET needs_review   = true,
               owner_user_id  = COALESCE(owner_user_id, v_owner)
         WHERE id = p_sms_message_id;
      END IF;
      v_summary := 'Condition logged for "' || COALESCE(v_title, 'the delivery') ||
                   '" and flagged for review.';
    END IF;

  ELSE
    -- Unreachable while the wrapper routes by field_effect_authority_scopes();
    -- kept so a future name added to that table but not here fails loudly.
    RAISE EXCEPTION 'apply_field_effect: % is registered but not implemented', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Remaining open work for this party — the confirmation's "N left" line,
  -- counted exactly as the legacy core counts it (00282:437-443).
  SELECT
    (SELECT count(*) FROM public.project_tasks t
      WHERE t.owner_party_id = p_party_id AND t.status <> 'done')
    + (SELECT count(*) FROM public.client_decisions cd
      WHERE cd.court_party_id = p_party_id AND cd.status = 'pending')
    INTO v_remaining;

  v_result := jsonb_build_object(
    'applied',         true,
    'effect_type',     v_type,
    'summary_text',    v_summary,
    'remaining_count', v_remaining,
    'item_id',         v_item_id,
    'task_id',         v_task_id,
    'report_id',       v_report_id,
    'source',          p_source
  );

  IF p_sms_message_id IS NOT NULL THEN
    UPDATE public.sms_messages
       SET applied_effect               = v_result,
           matched_task_id              = COALESCE(v_task_id, matched_task_id),
           matched_coordination_item_id = COALESCE(v_item_id, matched_coordination_item_id)
     WHERE id = p_sms_message_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public._apply_field_delivery_effect(uuid, jsonb, text, uuid) IS
  'The Field Line (00641), contract S3: the delivery half of '
  'apply_field_effect — confirm_availability, report_arrival, '
  'report_condition, report_departure. Reached ONLY through '
  'public.apply_field_effect. Refuses an effect the seat holds no 00624 grant '
  'for (field_effect_no_authority), re-asserts 00282''s cross-project forgery '
  'guard on the prompt subject, and writes public.field_delivery_reports. '
  'Availability never marks goods received.';

REVOKE ALL ON FUNCTION public._apply_field_delivery_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The guarded wrapper (00399:4878 + the new vocabulary)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id uuid,
  p_effect jsonb,
  p_source text DEFAULT 'sms',
  p_sms_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_result jsonb;
BEGIN
  -- The Field Line vocabulary (00641). Registered names route to the delivery
  -- core, which asks project_party_authority before it writes anything.
  IF public.field_effect_authority_scopes(p_effect->>'type') IS NOT NULL THEN
    RETURN public._apply_field_delivery_effect(
      p_party_id, p_effect, p_source, p_sms_message_id
    );
  END IF;

  -- 00399's wrapper, verbatim: pin the decision-write capability for a
  -- coordination target so the journey guard passes, then the legacy core.
  IF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
    PERFORM set_config('app.client_decision_write_id', v_target_id::text, true);
  END IF;

  v_result := public._apply_field_effect_legacy_00399(
    p_party_id, p_effect, p_source, p_sms_message_id
  );
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid) IS
  'Field Coordination single mutation choke point (SMS / /field page / triage). '
  'SECURITY DEFINER, service-role + DEFINER callers only. 00399''s guard is '
  'kept: a coordination target pins app.client_decision_write_id before the '
  'legacy core runs. 00641 adds the Field Line delivery vocabulary '
  '(confirm_availability, report_arrival, report_condition, report_departure) '
  'in front of it — those names are answered by _apply_field_delivery_effect, '
  'which refuses a seat without the 00624 grant their scope names.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The compliance copy (contract S8)
-- ═══════════════════════════════════════════════════════════════════════════
-- Today: sms_court_assignment, sms_daily_digest and sms_delivery_confirm carry
-- no rates/HELP/STOP line at all, sms_help carries no rates line, and
-- sms_optin_invite (00432:76) and sms_optin_confirm (00284:302) open on the
-- trade's first name instead of the studio's. The bodies below are the six
-- corrected ones; the closing line exists exactly once in this file and is
-- appended by the code, so no body can drift from it.
--
-- Each head is written to fit two GSM-7 segments (306 septets) once the closing
-- line is appended and every parameter is rendered at its documented maximum —
-- supabase/functions/_tests/field-line-copy.test.ts reads THESE literals and
-- asserts it. The field link is 98 septets of that budget on its own
-- (CLIENT_PORTAL_URL + '/field/' + a 64-hex token), which is why the copy is
-- as short as it is.
--
-- <<< FIELD LINE COPY BLOCK (parsed by supabase/functions/_tests/field-line-copy.test.ts)
DO $field_line_copy$
DECLARE
  v_closing CONSTANT text :=
    'Msg&data rates may apply. Reply HELP for help, STOP to opt out.';
  v_row record;
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      ('sms_optin_invite',
       'Field SMS - Opt-in invite',
       '{{studio_name}} sends {{project_name}} updates by text through Patina. Reply YES {{code}} to confirm (~1 msg/day).',
       '["studio_name","project_name","code"]'),

      ('sms_optin_confirm',
       'Field SMS - Opt-in confirmation',
       '{{studio_name}} has you set for {{project_name}} updates here (~1 msg/day).',
       '["studio_name","project_name"]'),

      ('sms_court_assignment',
       'Field SMS - Court/task assignment',
       '{{studio_name}} on {{project_name}}: "{{item_title}}" is on you. Reply here or tap: {{link}}',
       '["studio_name","project_name","item_title","link"]'),

      ('sms_daily_digest',
       'Field SMS - Daily digest',
       '{{studio_name}} at {{project_name}} today: {{menu}} Reply DONE 1 or send a photo. Full list: {{link}}',
       '["studio_name","project_name","menu","link"]'),

      ('sms_delivery_confirm',
       'Field SMS - Delivery confirm',
       '{{studio_name}} at {{project_name}}: delivery {{delivery_window}}, {{delivery_summary}}. Ref {{ref}}. Reply OK {{ref}} to confirm, or text what is wrong.',
       '["studio_name","project_name","delivery_window","delivery_summary","ref"]'),

      ('sms_help',
       'Field SMS - HELP reply',
       '{{studio_name}} project updates by text (~1 msg/day). Questions: hello@patina.cloud',
       '["studio_name"]')
    ) AS t(slug, name, head, vars)
  LOOP
    INSERT INTO public.email_templates (
      slug, name, description, category, subject_default, html_content, variables
    )
    VALUES (
      v_row.slug, v_row.name, v_row.name, 'transactional', NULL,
      v_row.head || ' ' || v_closing, v_row.vars::jsonb
    )
    ON CONFLICT (slug) DO UPDATE
      SET name         = EXCLUDED.name,
          html_content = EXCLUDED.html_content,
          variables    = EXCLUDED.variables,
          is_active    = true,
          updated_at   = now();
  END LOOP;

  -- Any other sms_% row — one this file does not know about, or one a later
  -- hand-edit shortened — ends with the same line. Idempotent: a body already
  -- ending in it is not touched.
  UPDATE public.email_templates
     SET html_content = btrim(html_content) || ' ' || v_closing,
         updated_at   = now()
   WHERE slug LIKE 'sms\_%'
     AND btrim(COALESCE(html_content, '')) <> ''
     AND right(btrim(html_content), length(v_closing)) IS DISTINCT FROM v_closing;
END
$field_line_copy$;
-- >>> FIELD LINE COPY BLOCK
