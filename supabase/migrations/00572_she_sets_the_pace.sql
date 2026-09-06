-- ═══════════════════════════════════════════════════════════════════════════
-- 00572 — She sets the pace
--
-- Program: "The Decision, Delivered" · Wave 3 · P-28 (the data half), plus the
-- Wave-2 walk nit W2-n4 (the why's attribution).
--
-- Ruling R16 governs this file: Patina goes quiet after the overdue notice and
-- the studio takes it from there; push honours an 8am–8pm local window and
-- releases at 8am; the in-app row is NEVER deferred. Nothing here may suppress
-- an overdue notice or a superseding edition.
--
-- Six things, one transaction:
--
--   1. THE THREE CADENCES. `notification_preferences.reminder_cadence` is a
--      two-value TEXT column with a CHECK (00278) — not an enum, so no
--      ADD VALUE isolation is needed. It widens to the three named cadences of
--      ux/03 §6.2, in her words: 'right_away' ("Tell me right away"), 'daily'
--      ("Once a day"), 'weekly_sunday' ("Once a week, on Sunday"). The old
--      values map forward — immediate → right_away, daily_digest → daily — and
--      a BEFORE trigger keeps accepting the two retired spellings so a portal
--      still running yesterday's build (portals deploy AFTER migrations) writes
--      a preference instead of a constraint violation.
--
--      THE DEFAULT MOVES to 'daily', and the reason is the vision's own
--      refusal of dark defaults: "the default is the quietest cadence that
--      still gets a real decision to her on time." 'weekly_sunday' cannot make
--      that promise — an approval issued Monday and due Wednesday would be
--      mailed the following Sunday, after its date. 'daily' can: the first
--      notice and the overdue notice always break the digest (ux/03 §6.2 —
--      "a new decision and a passed date are news, not summary", enforced this
--      wave in `_shared/decision-notify.ts`), so the only letter 'daily' ever
--      delays is the in-between reminder, by at most a day. Existing rows are
--      mapped, never re-defaulted: a person who chose 'immediate' keeps
--      'right_away'.
--
--   2. A SNOOZE SHE OWNS. `public.decision_snoozes` — one standing snooze per
--      person per approval — and `set_decision_snooze(p_decision_id, p_kind)`,
--      which computes `snoozed_until` in her own zone. 'tomorrow_morning' is
--      tomorrow at 8am local; 'sunday' is the next Sunday at 8am local;
--      'when_due' is the decision's own due date; 'never' is 'infinity'.
--      Nothing in the store can silence the overdue notice or a superseding
--      edition — that exception lives in the delivery chokepoint, which reads
--      this table but ignores it for those two letters.
--
--      ZONE RESOLUTION, stated once and used by every arithmetic in this file:
--      `notification_preferences.timezone` when the row exists and names a
--      zone Postgres knows, otherwise 'America/New_York'. `public.profiles`
--      carries no timezone column (checked), so there is no profile rung on
--      the ladder. The last rung is the rail's own DEFAULT_TIME_ZONE
--      (`_shared/decision-notify.ts`) rather than UTC deliberately: the same
--      person must not be a New Yorker to the letter's date line and a
--      Londoner to the hour her phone may ring. It is also the column DEFAULT
--      of `notification_preferences.timezone` itself (00040), so the fallback
--      only ever applies to a person with no preferences row at all.
--
--   3. THE HOUR IT MAY RING. `notification_log.deliver_after` (new, nullable)
--      plus `push_deliver_after()`, grafted into `notify_client_attention` —
--      the one writer of client-facing attention rows. A push envelope minted
--      outside 8am–8pm local is written with `deliver_after` set to the next
--      8am local and is NOT handed to apns-send; `release_due_client_pushes()`
--      (cron, every 15 minutes) dispatches it when its hour comes and skips
--      every row whose `deliver_after` is still in the future. The in_app row
--      is written and delivered exactly as before — the window governs the
--      buzz, never the record.
--
--   4. THE QUIET. `record_decision_studio_handoff()` writes ONE designer-facing
--      in_app row on the rail the designer inbox already reads
--      (`notification_log`, channel in_app — `packages/supabase/src/hooks/
--      use-inbox.ts`): "Patina has stopped reminding {client}; it is yours to
--      chase." `expire-decisions` calls it after the overdue notice lands. The
--      client-side half of the quiet — no further automated approval mail for
--      that approval — is enforced in the delivery chokepoint, because that is
--      the only place every producer passes through.
--
--   5. THE FIRST NOTICE GETS A SECOND CHANCE. Wave 1 shipped the first notice
--      as a one-shot (backend R3-03), ruled at the Wave-1 close as "accepted
--      for Wave 1, retry rides with P-28". `sweep_decision_first_notices()`
--      runs every 30 minutes and re-invokes `decision-first-notice` for a
--      still-pending Stage-2 approval published in the last 72 hours that has
--      no `notification_log` row keyed {decisionId, notice:'first'} and no
--      attempt inside the last 30 minutes. `decision_first_notice_attempts`
--      records the attempt itself, because a letter skipped by a preference
--      gate writes no log row at all and would otherwise be retried 144 times.
--      It covers EVERY decision put to the client, Stage-2 approval or legacy
--      choice, because 00568's trigger announces every one of them and this
--      wave's Sunday and 8am gates can hold any of those letters.
--
--      CUTOFF: nothing published before `_decision_first_notice_sweep_cutoff()`,
--      which is recorded once when this file applies as the LATER of
--      2026-09-05T00:00:00Z (the day 00568 landed on main with the Wave-1
--      integration merge) and that apply moment. Migrations run in order, so
--      that moment is provably at or after 00568's own: the sweep is then
--      structurally unable to mail a back catalogue, whatever date the constant
--      guessed. An approval published before the producer existed was never
--      owed a first notice and must not be sent one now.
--
--   6. THE WHY IS SIGNED WITH THE NAME THE STUDIO SHOWS (W2-n4). 00569 froze
--      the composer's GIVEN name; the ruling says display name.
--      `_create_project_approval_decision_checked` is regrafted from 00569 with
--      that one resolution changed, and existing rows are backfilled from the
--      'created' action receipt's actor.
--
--   AND TWO SCHEDULES MOVE. `decision-reminders-daily` (00092, 09:00 UTC) is
--   replaced by `decision-reminders-hourly`, and `notification-digest-daily`
--   (00278, 15:00 UTC) by `notification-digest-hourly`. The Sunday rule owes
--   her a Monday letter "at 8am local"; a once-a-day cron at 09:00 UTC is 4am
--   on the east coast, so a not-before-8am-local gate on a daily run would have
--   held the American reminder every single day. The summary owes the same
--   promise and 15:00 UTC is 7am in California in winter. Hourly, the
--   per-recipient gate releases each at the first run at or after 8am in HER
--   zone. No letter is duplicated: dedupe is per-decision and unchanged
--   (reminder_sent_at plus the notification_log key on {decisionId, notice}),
--   and the digest keeps its 20-hour / six-day min-intervals.
--
-- Every redefined body is grafted from its latest prior definition:
--   notify_client_attention                            ← 00569
--   _create_project_approval_decision_checked          ← 00569
-- (grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql
--  | sort | tail -1 names 00569 for both.)
--
-- Round-1 review repairs folded into this file (it has never been applied to
-- Strata): the release cron retires an envelope whose ask was answered while it
-- waited (M4); the sweep covers legacy decisions (M7) and reads a cutoff
-- recorded at apply time rather than a guessed constant (M8); the why backfill
-- resolves an inherited sentence to its composer instead of the designer who
-- reissued it (M6); and the digest cron goes hourly so the summary can keep the
-- same 8am-local, never-Sunday promise as the letter (M3).
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
--
-- Lineage: 00040 (notification_preferences) → 00041 (notification_log) →
-- 00092 (the decision crons) → 00173 (the decision spine) → 00278 (the two
-- cadences) → 00463/00464/00465/00466 (the Stage-2 approval rail) →
-- 00534 (notify_client_attention) → 00568 (the first notice) →
-- 00569 (the why, the viewer role, the receipt) → 00572.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. One zone resolver, used by every arithmetic below ───────────────────

CREATE OR REPLACE FUNCTION public.notification_time_zone(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT pref.timezone
        FROM public.notification_preferences AS pref
       WHERE pref.user_id = p_user_id
         AND NULLIF(btrim(COALESCE(pref.timezone, '')), '') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_timezone_names AS z
            WHERE z.name = btrim(pref.timezone)
         )
       LIMIT 1
    ),
    'America/New_York'
  );
$$;

REVOKE ALL ON FUNCTION public.notification_time_zone(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_time_zone(uuid) TO service_role;

COMMENT ON FUNCTION public.notification_time_zone(uuid) IS
  'The zone Patina speaks to one person in: notification_preferences.timezone '
  'when it exists and Postgres knows it, else America/New_York — the rail''s '
  'own DEFAULT_TIME_ZONE (_shared/decision-notify.ts) and the column default '
  '(00040). public.profiles carries no timezone column, so there is no profile '
  'rung. One resolver so the date on the letter and the hour of the buzz can '
  'never disagree.';

-- ── 1. The three cadences ──────────────────────────────────────────────────

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_reminder_cadence_check;

UPDATE public.notification_preferences
   SET reminder_cadence = CASE reminder_cadence
                            WHEN 'immediate'    THEN 'right_away'
                            WHEN 'daily_digest' THEN 'daily'
                            ELSE reminder_cadence
                          END
 WHERE reminder_cadence IN ('immediate', 'daily_digest');

-- Anything a forgotten writer left behind lands on the new default rather than
-- failing the CHECK below; there is no third historical spelling in the tree.
UPDATE public.notification_preferences
   SET reminder_cadence = 'daily'
 WHERE reminder_cadence NOT IN ('right_away', 'daily', 'weekly_sunday');

ALTER TABLE public.notification_preferences
  ALTER COLUMN reminder_cadence SET DEFAULT 'daily';

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_reminder_cadence_check
  CHECK (reminder_cadence IN ('right_away', 'daily', 'weekly_sunday'));

-- Migrations land before portals do. Until the client portal ships the new
-- picker it will keep writing 'immediate' / 'daily_digest', and a preference
-- write that 400s is a worse outcome than a normalised one.
CREATE OR REPLACE FUNCTION public.normalize_reminder_cadence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.reminder_cadence := CASE btrim(COALESCE(NEW.reminder_cadence, ''))
    WHEN 'immediate'    THEN 'right_away'
    WHEN 'daily_digest' THEN 'daily'
    WHEN ''             THEN 'daily'
    ELSE btrim(NEW.reminder_cadence)
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_reminder_cadence()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_reminder_cadence
  ON public.notification_preferences;
CREATE TRIGGER normalize_reminder_cadence
  BEFORE INSERT OR UPDATE OF reminder_cadence
  ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_reminder_cadence();

COMMENT ON COLUMN public.notification_preferences.reminder_cadence IS
  'How often Patina writes to her about work that is waiting (P-28, 00572). '
  'right_away = every reminder as it fires. daily (DEFAULT) = one summary a '
  'day. weekly_sunday = one summary a week, on Sunday. The first notice and '
  'the overdue notice always break the digest, which is why daily can be the '
  'default without any approval arriving late. The retired spellings '
  '(immediate, daily_digest) are normalised on write by the '
  'normalize_reminder_cadence trigger.';

DROP INDEX IF EXISTS public.idx_notification_preferences_reminder_digest_due;
CREATE INDEX IF NOT EXISTS idx_notification_preferences_reminder_digest_due
  ON public.notification_preferences(last_reminder_digest_sent_at)
  WHERE reminder_cadence IN ('daily', 'weekly_sunday') AND channels_email = true;

-- ── 2. A snooze she owns ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_snoozes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL
    REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  snoozed_until timestamptz NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('tomorrow_morning', 'sunday', 'when_due', 'never')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, decision_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_snoozes_decision
  ON public.decision_snoozes(decision_id, snoozed_until);

ALTER TABLE public.decision_snoozes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decision_snoozes_owner_select ON public.decision_snoozes;
CREATE POLICY decision_snoozes_owner_select ON public.decision_snoozes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS decision_snoozes_owner_insert ON public.decision_snoozes;
CREATE POLICY decision_snoozes_owner_insert ON public.decision_snoozes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS decision_snoozes_owner_update ON public.decision_snoozes;
CREATE POLICY decision_snoozes_owner_update ON public.decision_snoozes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS decision_snoozes_owner_delete ON public.decision_snoozes;
CREATE POLICY decision_snoozes_owner_delete ON public.decision_snoozes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS decision_snoozes_service_all ON public.decision_snoozes;
CREATE POLICY decision_snoozes_service_all ON public.decision_snoozes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.decision_snoozes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.decision_snoozes
  TO authenticated;
GRANT ALL ON TABLE public.decision_snoozes TO service_role;

COMMENT ON TABLE public.decision_snoozes IS
  'P-28: one standing snooze per person per approval — her volume knob, not a '
  'dismissal. Nothing here suppresses the overdue notice or a superseding '
  'edition (R16); the delivery chokepoint reads this table and ignores it for '
  'those two letters. A row is replaced, never stacked: choosing again '
  'overwrites.';

COMMENT ON COLUMN public.decision_snoozes.snoozed_until IS
  'Computed by set_decision_snooze in her own zone at the moment she chose. '
  '''never'' and a dateless ''when_due'' both store ''infinity''.';

-- The next 8am local strictly after p_from, in the given zone.
CREATE OR REPLACE FUNCTION public.next_local_morning(
  p_zone text,
  p_from timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (p_from AT TIME ZONE p_zone)
         < (date_trunc('day', p_from AT TIME ZONE p_zone) + interval '8 hours')
      THEN (date_trunc('day', p_from AT TIME ZONE p_zone) + interval '8 hours')
             AT TIME ZONE p_zone
    ELSE (date_trunc('day', p_from AT TIME ZONE p_zone)
           + interval '1 day' + interval '8 hours') AT TIME ZONE p_zone
  END;
$$;

REVOKE ALL ON FUNCTION public.next_local_morning(text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_local_morning(text, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.next_local_morning(text, timestamptz) IS
  'R16''s release hour: the first 8am in p_zone at or after p_from. Used by '
  'the push window and by the ''tomorrow_morning'' snooze.';

CREATE OR REPLACE FUNCTION public.set_decision_snooze(
  p_decision_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_kind text := btrim(COALESCE(p_kind, ''));
  v_decision public.client_decisions%ROWTYPE;
  v_zone text;
  v_now timestamptz := now();
  v_local timestamp;
  v_target timestamp;
  v_until timestamptz;
  v_may boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'a snooze belongs to a signed-in reader'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_kind NOT IN ('tomorrow_morning', 'sunday', 'when_due', 'never') THEN
    RAISE EXCEPTION 'unsupported snooze kind %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT decision.* INTO v_decision
    FROM public.client_decisions AS decision
   WHERE decision.id = p_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Only the person the approval is addressed to may turn its volume down:
  -- the frozen decision lead on a Stage-2 approval, the relationship's client
  -- on a legacy option choice. A studio co-member reading the same row is not
  -- being asked, and must not be able to silence the person who is.
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    SELECT true INTO v_may
      FROM public.project_decision_authority_snapshots AS snapshot
     WHERE snapshot.decision_id = v_decision.id
       AND snapshot.decision_lead_id = v_actor
     LIMIT 1;
  ELSE
    SELECT true INTO v_may
      FROM public.designer_clients AS relationship
     WHERE relationship.id = v_decision.designer_client_id
       AND relationship.client_id = v_actor
     LIMIT 1;
  END IF;
  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'this approval is not addressed to you'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_zone := public.notification_time_zone(v_actor);

  IF v_kind = 'never' THEN
    v_until := 'infinity'::timestamptz;
  ELSIF v_kind = 'when_due' THEN
    -- A dateless approval has no due moment, and Patina will not invent one
    -- (no invented timing). Recorded as a standing quiet; the overdue notice
    -- cannot exist without a date, and a superseding edition still breaks it.
    v_until := COALESCE(v_decision.due_date, 'infinity'::timestamptz);
  ELSIF v_kind = 'tomorrow_morning' THEN
    v_local := v_now AT TIME ZONE v_zone;
    v_until := (date_trunc('day', v_local) + interval '1 day'
                 + interval '8 hours') AT TIME ZONE v_zone;
  ELSE
    -- 'sunday' — the next Sunday at 8am local, strictly after now. Sunday
    -- morning before eight is still this Sunday; Sunday afternoon is the next.
    v_local := v_now AT TIME ZONE v_zone;
    v_target := date_trunc('day', v_local) + interval '8 hours';
    WHILE extract(dow FROM v_target) <> 0 OR v_target <= v_local LOOP
      v_target := v_target + interval '1 day';
    END LOOP;
    v_until := v_target AT TIME ZONE v_zone;
  END IF;

  INSERT INTO public.decision_snoozes
    (user_id, decision_id, snoozed_until, kind)
  VALUES (v_actor, p_decision_id, v_until, v_kind)
  ON CONFLICT (user_id, decision_id) DO UPDATE
    SET snoozed_until = EXCLUDED.snoozed_until,
        kind          = EXCLUDED.kind,
        created_at    = now();

  RETURN jsonb_build_object(
    'decisionId',   p_decision_id,
    'kind',         v_kind,
    'snoozedUntil', CASE WHEN v_until = 'infinity'::timestamptz
                         THEN NULL ELSE to_jsonb(v_until) END,
    'timeZone',     v_zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_decision_snooze(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_decision_snooze(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.set_decision_snooze(uuid, text) IS
  'P-28: "Remind me later" — tomorrow_morning | sunday | when_due | never. '
  'Computes snoozed_until in the caller''s own zone (notification_time_zone) '
  'and refuses any caller the approval is not addressed to. Never suppresses '
  'the overdue notice or a superseding edition (R16) — that exception lives in '
  'the delivery chokepoint.';

-- ── 3. The hour it may ring ────────────────────────────────────────────────

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS deliver_after timestamptz;

COMMENT ON COLUMN public.notification_log.deliver_after IS
  'R16 (P-28): the earliest moment a PUSH row may be handed to apns-send. NULL '
  'on every row that was dispatched at once, and on every non-push row — the '
  'in_app leg is never deferred. Set to the next 8am local when the envelope '
  'was minted outside 8am–8pm in the recipient''s zone.';

CREATE INDEX IF NOT EXISTS idx_notification_log_push_release
  ON public.notification_log(deliver_after)
  WHERE channel = 'push' AND status = 'queued' AND deliver_after IS NOT NULL;

CREATE OR REPLACE FUNCTION public.push_deliver_after(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zone text := public.notification_time_zone(p_user_id);
  v_hour integer;
BEGIN
  v_hour := extract(hour FROM (p_now AT TIME ZONE v_zone))::integer;
  -- Eight to eight, her clock. Inside the window the envelope goes now and
  -- carries no deliver_after at all.
  IF v_hour >= 8 AND v_hour < 20 THEN
    RETURN NULL;
  END IF;
  RETURN public.next_local_morning(v_zone, p_now);
END;
$$;

REVOKE ALL ON FUNCTION public.push_deliver_after(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_deliver_after(uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.push_deliver_after(uuid, timestamptz) IS
  'R16: NULL when p_now is inside 8am–8pm in the recipient''s zone (send it '
  'now), otherwise the next 8am local. The push leg only — the in-app row is '
  'never deferred.';
CREATE OR REPLACE FUNCTION public.notify_client_attention(
  p_user_id     uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_title       text,
  p_body        text,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path       text;
  v_meta       jsonb;
  v_type       text;
  v_in_app     uuid;
  v_push       uuid;
  v_is_receipt boolean;
  v_deliver_at timestamptz;
BEGIN
  -- A notification helper must never abort its caller's transaction. Every
  -- rejection here is a quiet NULL, not an exception.
  IF p_user_id IS NULL OR p_entity_id IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_receipt := COALESCE(p_metadata->>'kind', '') = 'decision_receipt';

  v_path := CASE p_entity_type
              WHEN 'proposal' THEN '/proposals/'
              WHEN 'invoice'  THEN '/invoices/'
              WHEN 'decision' THEN '/decisions/'
            END;
  IF v_path IS NULL THEN
    RAISE WARNING 'notify_client_attention: unroutable entity_type %', p_entity_type;
    RETURN NULL;
  END IF;
  v_path := v_path || p_entity_id::text;
  v_type := p_entity_type || '_attention';

  v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id::text,
    'title',       p_title,
    'body',        COALESCE(p_body, ''),
    -- 'message' mirrors 'body': the client portal inbox renders metadata.message
    -- (00388, invoice-send), the iOS bell renders metadata.body.
    'message',     COALESCE(p_body, ''),
    'deep_link',   v_path,
    'url',         v_path
  );

  -- The bell row. De-duplicated on (user, entity_type, entity_id) while the
  -- reader has not opened it, so a reminder cadence refreshes one line instead
  -- of burying the screen.
  SELECT n.id INTO v_in_app
    FROM public.notification_log n
   WHERE n.user_id = p_user_id
     AND n.channel = 'in_app'
     AND n.opened_at IS NULL
     AND n.metadata->>'entity_type' = p_entity_type
     AND n.metadata->>'entity_id'   = p_entity_id::text
   ORDER BY n.created_at DESC
   LIMIT 1;

  IF v_in_app IS NOT NULL THEN
    UPDATE public.notification_log
       SET metadata  = metadata || v_meta,
           type      = v_type,
           -- 'opened' beside opened_at is the shape markOpened writes
           -- (NotificationsAPIClient), so every reader agrees this is read.
           status    = CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END
                         ::public.notification_status,
           opened_at = CASE WHEN v_is_receipt THEN now() ELSE opened_at END,
           sent_at   = now()
     WHERE id = v_in_app;
  ELSE
    INSERT INTO public.notification_log
      (user_id, type, channel, status, template_id, metadata, sent_at, opened_at)
    VALUES
      (p_user_id, v_type, 'in_app',
       (CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END)
         ::public.notification_status,
       'client-attention', v_meta, now(),
       CASE WHEN v_is_receipt THEN now() END)
    RETURNING id INTO v_in_app;
  END IF;

  -- A receipt stops here: no envelope, nothing to hand apns-send, no id to
  -- return. The caller PERFORMs this and reads no result.
  IF v_is_receipt THEN
    RETURN NULL;
  END IF;

  -- R16 (00572). The push envelope, and the hour it may ring. Outside eight to
  -- eight in HER zone the row is written with a deliver_after of the next 8am
  -- local and is NOT handed to apns-send now; the release cron picks it up.
  -- The bell row above is already written and is never deferred — the window
  -- governs the buzz, not the record.
  v_deliver_at := public.push_deliver_after(p_user_id, now());

  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata, deliver_after)
  VALUES
    (p_user_id, v_type, 'push', 'queued', 'client-attention-push', v_meta,
     v_deliver_at)
  RETURNING id INTO v_push;

  IF v_deliver_at IS NOT NULL THEN
    RETURN v_push;
  END IF;

  -- Best-effort dispatch. Locally the Vault carries no service_role_key, so
  -- invoke_edge_function returns NULL with a warning; on a device with no APNs
  -- secrets apns-send answers 200 {skipped}. Neither may break a send.
  BEGIN
    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             p_user_id,
        'title',               p_title,
        'body',                COALESCE(p_body, ''),
        'entity_type',         p_entity_type,
        'entity_id',           p_entity_id::text,
        'notification_log_id', v_push
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_attention: apns dispatch failed for % %: %',
      p_entity_type, p_entity_id, sqlerrm;
  END;

  RETURN v_push;
END;
$$;

COMMENT ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb) IS
  'SP-08: the one writer of client-facing attention rows. Two notification_log '
  'rows per call — in_app/delivered (the bell, never handed to apns-send) and '
  'push/queued (the envelope, whose id is). De-duplicates the bell row on '
  '(user, entity_type, entity_id) while unopened. P-20 (00569): a row whose '
  'metadata.kind is ''decision_receipt'' acknowledges the reader''s own act, so '
  'it is written already opened and gets no push envelope and no dispatch — '
  'one row, no badge, no sound. R16 (00572): an envelope minted outside '
  '8am–8pm local carries a deliver_after of the next 8am local and is left for '
  'release_due_client_pushes; the bell row is never deferred. service_role '
  'only: it writes for an arbitrary user_id.';

CREATE OR REPLACE FUNCTION public.release_due_client_pushes(
  p_limit integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_sent integer := 0;
BEGIN
  FOR v_row IN
    SELECT n.id, n.user_id, n.metadata,
           -- Before this wave the envelope was minted and dispatched in the
           -- same statement, so nothing could happen in between. A held one
           -- can wait ten hours, and in those hours she may answer. Two
           -- questions decide whether the phone may still ring:
           --
           --   • is the bell row still unopened? notify_client_attention
           --     de-duplicates on (user, entity_type, entity_id) while unread
           --     and the receipt branch marks that same row opened, so an
           --     opened row means the ask has been seen or answered.
           --   • is the ask itself still hers to answer? A decision that has
           --     left 'pending' has been answered, withdrawn or superseded.
           --
           -- entity_id is compared as text (it was written as uuid::text), so
           -- a malformed envelope can never raise a cast error inside a cron.
           (
             EXISTS (
               SELECT 1
                 FROM public.notification_log AS bell
                WHERE bell.user_id = n.user_id
                  AND bell.channel = 'in_app'
                  AND bell.opened_at IS NULL
                  AND bell.metadata->>'entity_type' = n.metadata->>'entity_type'
                  AND bell.metadata->>'entity_id'   = n.metadata->>'entity_id'
             )
             AND NOT EXISTS (
               SELECT 1
                 FROM public.client_decisions AS decision
                WHERE n.metadata->>'entity_type' = 'decision'
                  AND decision.id::text = n.metadata->>'entity_id'
                  AND decision.status <> 'pending'
             )
           ) AS still_waiting
      FROM public.notification_log AS n
     WHERE n.channel = 'push'
       AND n.status = 'queued'
       AND n.deliver_after IS NOT NULL
       AND n.deliver_after <= now()
     ORDER BY n.deliver_after
     LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  LOOP
    -- An answer overtook the envelope: retire it rather than ring at 8am
    -- about something she settled at ten last night.
    IF NOT v_row.still_waiting THEN
      UPDATE public.notification_log
         SET status = 'suppressed',
             metadata = metadata || jsonb_build_object(
               'release_skipped', 'answered_before_release')
       WHERE id = v_row.id;
      CONTINUE;
    END IF;

    -- Claimed before dispatch so a second run cannot ring the same phone
    -- twice; apns-send stamps it delivered or failed from there.
    UPDATE public.notification_log
       SET status = 'sending', sent_at = now()
     WHERE id = v_row.id;

    BEGIN
      PERFORM public.invoke_edge_function(
        'apns-send',
        jsonb_build_object(
          'user_id',             v_row.user_id,
          'title',               COALESCE(v_row.metadata->>'title', ''),
          'body',                COALESCE(v_row.metadata->>'body', ''),
          'entity_type',         v_row.metadata->>'entity_type',
          'entity_id',           v_row.metadata->>'entity_id',
          'notification_log_id', v_row.id
        )
      );
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'release_due_client_pushes: dispatch failed for %: %',
        v_row.id, sqlerrm;
    END;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.release_due_client_pushes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_client_pushes(integer)
  TO service_role;

COMMENT ON FUNCTION public.release_due_client_pushes(integer) IS
  'R16''s 8am release: dispatches queued push envelopes whose deliver_after has '
  'arrived and skips every row whose hour has not. Claims each row as sending '
  'before invoking apns-send so a re-run cannot double-ring. An envelope whose '
  'bell row has been opened, or whose decision has left ''pending'' while it '
  'waited, is retired as suppressed instead of dispatched — a held push must '
  'never ring about an ask she already answered.';

-- ── 4. The quiet: the studio takes it from there ───────────────────────────

CREATE OR REPLACE FUNCTION public.record_decision_studio_handoff(
  p_decision_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_client_name text;
  v_existing uuid;
  v_id uuid;
  v_body text;
BEGIN
  SELECT decision.* INTO v_decision
    FROM public.client_decisions AS decision
   WHERE decision.id = p_decision_id;
  IF NOT FOUND OR v_decision.designer_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    SELECT COALESCE(
             NULLIF(btrim(COALESCE(lead.display_name, '')), ''),
             NULLIF(btrim(COALESCE(lead.full_name, '')), '')
           )
      INTO v_client_name
      FROM public.project_decision_authority_snapshots AS snapshot
      JOIN public.profiles AS lead ON lead.id = snapshot.decision_lead_id
     WHERE snapshot.decision_id = v_decision.id;
  ELSE
    SELECT COALESCE(
             NULLIF(btrim(COALESCE(relationship.client_name, '')), ''),
             NULLIF(btrim(COALESCE(client.full_name, '')), '')
           )
      INTO v_client_name
      FROM public.designer_clients AS relationship
      LEFT JOIN public.profiles AS client ON client.id = relationship.client_id
     WHERE relationship.id = v_decision.designer_client_id;
  END IF;

  -- No invented name: an unnamed reader becomes "your client", never a guess.
  v_body := 'Patina has stopped reminding '
            || COALESCE(v_client_name, 'your client')
            || '; it is yours to chase.';

  -- Once per approval. The designer inbox reads notification_log in_app rows
  -- (packages/supabase/src/hooks/use-inbox.ts); a second row would be a second
  -- nudge for the same silence.
  SELECT n.id INTO v_existing
    FROM public.notification_log AS n
   WHERE n.user_id = v_decision.designer_id
     AND n.channel = 'in_app'
     AND n.type = 'decision_studio_handoff'
     AND n.metadata->>'decisionId' = p_decision_id::text
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata, sent_at)
  VALUES (
    v_decision.designer_id,
    'decision_studio_handoff',
    'in_app',
    'delivered',
    'decision-studio-handoff',
    jsonb_build_object(
      'decisionId', p_decision_id::text,
      'title',      COALESCE(v_decision.title, 'An approval'),
      'body',       v_body,
      'message',    v_body,
      'deep_link',  '/desk',
      'url',        '/desk'
    ),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_decision_studio_handoff(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_decision_studio_handoff(uuid)
  TO service_role;

COMMENT ON FUNCTION public.record_decision_studio_handoff(uuid) IS
  'R16: the hand-off line. Once per approval, on the designer''s own inbox rail '
  '(notification_log in_app) after the overdue notice has gone out — "Patina '
  'has stopped reminding {client}; it is yours to chase." Idempotent: a second '
  'call returns the row already written.';

-- ── 5. The first notice gets a second chance ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.decision_first_notice_attempts (
  decision_id uuid PRIMARY KEY
    REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.decision_first_notice_attempts
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decision_first_notice_attempts_service
  ON public.decision_first_notice_attempts;
CREATE POLICY decision_first_notice_attempts_service
  ON public.decision_first_notice_attempts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.decision_first_notice_attempts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.decision_first_notice_attempts TO service_role;

COMMENT ON TABLE public.decision_first_notice_attempts IS
  'Bookkeeping for the first-notice retry sweep (Wave-1 carry R3-03, ruled to '
  'ride with P-28). A letter skipped by a preference gate writes no '
  'notification_log row, so the sweep records its own attempts here and honours '
  'a 30-minute cooldown against them. Never read by any client surface.';

-- The cutoff is recorded ONCE, at the moment this migration applies, rather
-- than hard-coded to a date the author guessed. `supabase_migrations.
-- schema_migrations` carries no applied-at column, so 00568's own apply moment
-- cannot be read back — but migrations apply in order, so THIS migration's
-- apply moment is provably at or after 00568's. Taking the later of that and
-- the merge-day constant makes the sweep structurally incapable of mailing a
-- back catalogue on a stack where 00568 landed later than the constant says
-- (r1 M8). The cost is bounded and small: an approval published in the hours
-- between 00568 and 00572 that missed its letter gets no retry, and the 72-hour
-- window makes even that stop binding three days after this file applies.
CREATE TABLE IF NOT EXISTS public.decision_first_notice_sweep_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cutoff_at timestamptz NOT NULL
);

ALTER TABLE public.decision_first_notice_sweep_state
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS decision_first_notice_sweep_state_service
  ON public.decision_first_notice_sweep_state;
CREATE POLICY decision_first_notice_sweep_state_service
  ON public.decision_first_notice_sweep_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.decision_first_notice_sweep_state
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.decision_first_notice_sweep_state TO service_role;

COMMENT ON TABLE public.decision_first_notice_sweep_state IS
  'One row. `cutoff_at` is the earliest send the first-notice retry sweep may '
  'ever speak for: the later of 2026-09-05 (the day 00568 landed on main) and '
  'the moment 00572 applied on this stack. Written once — a re-apply leaves '
  'the original value standing.';

INSERT INTO public.decision_first_notice_sweep_state (singleton, cutoff_at)
VALUES (true, GREATEST('2026-09-05T00:00:00Z'::timestamptz, now()))
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public._decision_first_notice_sweep_cutoff()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT state.cutoff_at
       FROM public.decision_first_notice_sweep_state AS state
      WHERE state.singleton),
    '2026-09-05T00:00:00Z'::timestamptz
  );
$$;

REVOKE ALL ON FUNCTION public._decision_first_notice_sweep_cutoff()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._decision_first_notice_sweep_cutoff()
  TO service_role;

COMMENT ON FUNCTION public._decision_first_notice_sweep_cutoff() IS
  'The earliest send the sweep may speak for: the later of the day 00568 — the '
  'publish-time first-notice producer — landed on main, and the moment 00572 '
  'applied here. An approval published before the producer existed was never '
  'owed a first notice and must never be sent one now.';

CREATE OR REPLACE FUNCTION public.sweep_decision_first_notices(
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_fired integer := 0;
BEGIN
  FOR v_row IN
    -- 00568's trigger announces EVERY decision put to the client — it carries
    -- no approval_contract filter — and this wave's Sunday and 8am gates can
    -- hold any of those letters. A sweep that only picked up Stage-2 asks
    -- would leave a legacy choice silently unannounced with nothing to return
    -- for it (r1 M7), so the selection mirrors the trigger's own edge and asks
    -- for frozen evidence only where the contract requires it.
    SELECT d.id, d.designer_client_id
      FROM public.client_decisions AS d
     WHERE d.status = 'pending'
       AND d.court = 'client'
       AND COALESCE(d.sent_at, d.created_at) >= now() - interval '72 hours'
       AND COALESCE(d.sent_at, d.created_at)
             >= public._decision_first_notice_sweep_cutoff()
       -- A Stage-2 ask with incomplete evidence is refused by the producer
       -- anyway; re-inviting it 144 times a day would only fill the log.
       AND (
         d.approval_contract IS DISTINCT FROM 'project_artifact_v1'
         OR (
           EXISTS (SELECT 1 FROM public.project_approval_artifacts AS artifact
                    WHERE artifact.decision_id = d.id)
           AND EXISTS (SELECT 1
                         FROM public.project_decision_authority_snapshots
                              AS snapshot
                        WHERE snapshot.decision_id = d.id)
         )
       )
       -- An approval past its date belongs to the overdue notice, not to a
       -- first notice arriving after the fact (R16's quiet).
       AND (d.due_date IS NULL OR d.due_date > now())
       AND NOT EXISTS (
         SELECT 1
           FROM public.notification_log AS log
          WHERE log.type = 'decision_required'
            AND log.channel = 'email'
            AND log.status <> 'failed'
            AND log.metadata @> jsonb_build_object(
                  'decisionId', d.id::text, 'notice', 'first')
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.decision_first_notice_attempts AS attempt
          WHERE attempt.decision_id = d.id
            AND attempt.last_attempt_at > now() - interval '30 minutes'
       )
     ORDER BY COALESCE(d.sent_at, d.created_at)
     LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  LOOP
    INSERT INTO public.decision_first_notice_attempts
      (decision_id, attempts, last_attempt_at)
    VALUES (v_row.id, 1, now())
    ON CONFLICT (decision_id) DO UPDATE
      SET attempts = public.decision_first_notice_attempts.attempts + 1,
          last_attempt_at = now();

    BEGIN
      PERFORM public.invoke_edge_function(
        'decision-first-notice',
        jsonb_build_object('decision_id', v_row.id)
      );
      v_fired := v_fired + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'sweep_decision_first_notices: dispatch failed for %: %',
        v_row.id, sqlerrm;
    END;
  END LOOP;

  RETURN v_fired;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_decision_first_notices(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_decision_first_notices(integer)
  TO service_role;

COMMENT ON FUNCTION public.sweep_decision_first_notices(integer) IS
  'Wave-1 carry R3-03: the first notice was a one-shot, so a single skip '
  '(quiet hours, a preference off at that instant, a Resend hiccup) silenced '
  'an approval permanently. Re-invokes decision-first-notice for any pending '
  'client-court decision — Stage-2 approval or legacy choice, the same edge '
  '00568''s trigger announces on — published in the last 72 hours with no '
  '{decisionId, notice:''first''} email row and no attempt in the last 30 '
  'minutes. Never for an approval published before the cutoff, and never for '
  'one already past its date.';

-- ── The two crons ──────────────────────────────────────────────────────────

-- The reminder letter learns to wait for morning. 00092 ran decision-reminders
-- once a day at 09:00 UTC, which is 4am on the US east coast: a recipient-side
-- "not before 8am local, and never on Sunday" gate (ux/03 §6.2, this wave's
-- _shared/decision-notify.ts) would have held every American reminder at 4am
-- and then held it again the next day, forever. Hourly, the same gate releases
-- the letter at the first run at or after 8am in HER zone — which is what
-- "send Monday 8am local" means. Dedupe is unchanged and already per-decision
-- (reminder_sent_at plus the notification_log key), so twenty-four passes send
-- no more letters than one did.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'decision-reminders-daily') THEN
    PERFORM cron.unschedule('decision-reminders-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'decision-reminders-hourly') THEN
    PERFORM cron.unschedule('decision-reminders-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'decision-reminders-hourly',
  '0 * * * *',
  $$SELECT public.invoke_edge_function('decision-reminders', '{}'::jsonb);$$
);

-- The summary keeps the same hours as the letters. 00278 ran
-- notification-digest once a day at 15:00 UTC — 07:00 in California in
-- winter, and midnight in Tokyo on a Saturday for what is meant to be a Sunday
-- summary. This wave holds the direct letter until 8am local and never mails
-- on a Sunday; the digest is now the vehicle for the DEFAULT cadence, so it
-- owes the same promise (r1 M3). A once-a-day cron cannot keep it — at 15:00
-- UTC a Pacific reader is never inside her own morning — so the digest goes
-- hourly and the per-reader gate (isDigestDue) decides the hour. The 20-hour
-- and six-day min-intervals are unchanged, so twenty-four passes still send
-- one summary.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-daily') THEN
    PERFORM cron.unschedule('notification-digest-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-digest-hourly') THEN
    PERFORM cron.unschedule('notification-digest-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'notification-digest-hourly',
  '20 * * * *',
  $$SELECT public.invoke_edge_function('notification-digest', '{}'::jsonb);$$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-push-window-release') THEN
    PERFORM cron.unschedule('client-push-window-release');
  END IF;
END $$;

SELECT cron.schedule(
  'client-push-window-release',
  '*/15 * * * *',
  $$SELECT public.release_due_client_pushes(200);$$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'decision-first-notice-retry-sweep') THEN
    PERFORM cron.unschedule('decision-first-notice-retry-sweep');
  END IF;
END $$;

SELECT cron.schedule(
  'decision-first-notice-retry-sweep',
  '*/30 * * * *',
  $$SELECT public.sweep_decision_first_notices(100);$$
);

DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. The Decision, Delivered (00572): decision-reminders-hourly on the hour -> the decision-reminders edge function, replacing 00092''s decision-reminders-daily at 09:00 UTC so the per-recipient not-before-8am-local gate has an hour to release into; notification-digest-hourly at 20 past -> the notification-digest edge function, replacing 00278''s notification-digest-daily at 15:00 UTC for the same reason (the summary owes the same 8am-local, never-Sunday promise as the letter); client-push-window-release every 15 minutes -> public.release_due_client_pushes(200), dispatching push envelopes held outside 8am-8pm local; decision-first-notice-retry-sweep every 30 minutes -> public.sweep_decision_first_notices(100), re-inviting decision-first-notice for a published approval that never got its letter. Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
-- undefined_object joins the usual insufficient_privilege guard: the registry
-- comment is documentation, and a stack without pg_cron installed must not fail
-- the migration over a sentence.
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN NULL;
END $$;

-- ── 6. The why is signed with the name the studio shows (W2-n4) ────────────
--
-- One resolver, used by the creating RPC and by the backfill below, so a row
-- written today and a row repaired from 2026 carry the same rule.

CREATE OR REPLACE FUNCTION public._why_author_display_name(p_actor uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(btrim(left(COALESCE(
    NULLIF(btrim(COALESCE(author.display_name, '')), ''),
    NULLIF(regexp_replace(btrim(COALESCE(author.full_name, '')),
                          '\s+', ' ', 'g'), '')
  ), 120)), '')
  FROM public.profiles AS author
  WHERE author.id = p_actor;
$$;

REVOKE ALL ON FUNCTION public._why_author_display_name(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._why_author_display_name(uuid) IS
  'W2-n4: the name the studio shows — display_name, else the whole full_name '
  'with its whitespace collapsed — truncated to the column''s 120 characters. '
  'NULL when the author has no name on file: an attribution is dropped, never '
  'invented. 00569 froze full_name''s first token here; the ruling asks for the '
  'display name.';

--
-- Grafted from 00569 (the latest body — grep | sort | tail -1), one resolution
-- changed: display_name first, then the WHOLE full_name, where 00569 took
-- full_name's first token. The signature is unchanged, so no DROP is needed and
-- no caller has to move.
CREATE OR REPLACE FUNCTION public._create_project_approval_decision_checked(
  p_project_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_predecessor_decision_id uuid,
  p_why text DEFAULT NULL,
  p_why_author_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_authority public.project_decision_authorities%ROWTYPE;
  v_relationship public.designer_clients%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_source record;
  v_unknown jsonb;
  v_title text;
  v_question text;
  v_context text;
  v_why text := NULLIF(btrim(COALESCE(p_why, '')), '');
  v_why_author_name text := NULLIF(btrim(COALESCE(p_why_author_name, '')), '');
  v_due_at timestamptz;
  v_phase_id uuid;
  v_section_key text;
  v_source_kind text;
  v_source_id uuid;
  v_cost_delta integer;
  v_schedule_delta integer;
  v_lead_delta integer;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
  v_request_hash text;
  v_decision_id uuid := extensions.gen_random_uuid();
  v_snapshot_id uuid := extensions.gen_random_uuid();
  v_artifact_id uuid := extensions.gen_random_uuid();
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_decision_updated_at timestamptz;
  v_result jsonb;
  v_previous_decision_insert text := current_setting(
    'app.project_approval_decision_insert_id', true
  );
  v_previous_option_insert text := current_setting(
    'app.project_approval_option_decision_id', true
  );
  v_previous_evidence_insert text := current_setting(
    'app.project_approval_evidence_decision_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval creation requires an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'title', 'question', 'context', 'dueAt', 'phaseId', 'sectionKey',
    'artifactKind', 'artifactId', 'costCentsDelta',
    'scheduleDaysDelta', 'leadTimeDaysDelta'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project approval payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_title := btrim(COALESCE(p_payload->>'title', ''));
  v_question := btrim(COALESCE(p_payload->>'question', ''));
  v_context := NULLIF(btrim(COALESCE(p_payload->>'context', '')), '');
  IF char_length(v_title) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'approval title must contain 1 to 240 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_question) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'approval question must contain 1 to 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_why IS NOT NULL AND char_length(v_why) > 200 THEN
    RAISE EXCEPTION 'approval why must contain at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- P-13: who said it, frozen with what was said. Resolved from the caller's
  -- own profile unless a predecessor's attribution was handed in with an
  -- inherited line. A name long enough to break the column is TRUNCATED, never
  -- raised on: a person's name is not a reason to refuse an approval.
  --
  -- W2-n4 (00572): the DISPLAY name, not the given name. 00569 froze the first
  -- whitespace-separated token of full_name, borrowing the sign-off's rule; the
  -- ruling asks for the name the studio shows, which is `display_name` when the
  -- person set one and the whole `full_name` otherwise. A studio that signs its
  -- work "Leah Kochaver" should not have a client read "— Leah" under the one
  -- sentence she wrote herself.
  IF v_why IS NULL THEN
    v_why_author_name := NULL;
  ELSIF v_why_author_name IS NULL THEN
    v_why_author_name := public._why_author_display_name(v_actor);
  END IF;
  v_why_author_name := NULLIF(btrim(left(COALESCE(v_why_author_name, ''), 120)), '');

  IF NOT (p_payload ? 'dueAt')
     OR NULLIF(p_payload->>'dueAt', '') IS NULL
  THEN
    RAISE EXCEPTION 'approval dueAt is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_due_at := (p_payload->>'dueAt')::timestamptz;

  IF NOT (p_payload ? 'phaseId')
     OR NULLIF(p_payload->>'phaseId', '') IS NULL
  THEN
    RAISE EXCEPTION 'approval phaseId is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_phase_id := (p_payload->>'phaseId')::uuid;
  v_section_key := NULLIF(p_payload->>'sectionKey', '');
  v_source_kind := NULLIF(p_payload->>'artifactKind', '');
  v_source_id := NULLIF(p_payload->>'artifactId', '')::uuid;
  IF v_source_kind IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'one artifactKind and artifactId are required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (p_payload ?& ARRAY[
       'costCentsDelta', 'scheduleDaysDelta', 'leadTimeDaysDelta'
     ])
     OR jsonb_typeof(p_payload->'costCentsDelta') <> 'number'
     OR jsonb_typeof(p_payload->'scheduleDaysDelta') <> 'number'
     OR jsonb_typeof(p_payload->'leadTimeDaysDelta') <> 'number'
     OR p_payload->>'costCentsDelta' !~ '^-?[0-9]+$'
     OR p_payload->>'scheduleDaysDelta' !~ '^-?[0-9]+$'
     OR p_payload->>'leadTimeDaysDelta' !~ '^-?[0-9]+$'
  THEN
    RAISE EXCEPTION 'all three signed integer impact deltas are required'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_cost_delta := (p_payload->>'costCentsDelta')::integer;
    v_schedule_delta := (p_payload->>'scheduleDaysDelta')::integer;
    v_lead_delta := (p_payload->>'leadTimeDaysDelta')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'impact deltas must fit signed int32'
      USING ERRCODE = 'numeric_value_out_of_range';
  END;

  v_request := jsonb_build_object(
    'projectId', p_project_id,
    'predecessorDecisionId', p_predecessor_decision_id,
    'title', v_title,
    'question', v_question,
    'context', v_context,
    'dueAt', v_due_at,
    'phaseId', v_phase_id,
    'sectionKey', v_section_key,
    'artifactKind', v_source_kind,
    'artifactId', v_source_id,
    'costCentsDelta', v_cost_delta,
    'scheduleDaysDelta', v_schedule_delta,
    'leadTimeDaysDelta', v_lead_delta
  );
  -- The why joins the hashed request only when there IS one. Adding a
  -- null-valued key unconditionally would change the hash of every
  -- why-less create, so an idempotency key minted before this migration and
  -- retried after it would be rejected as "reused with a different request".
  IF v_why IS NOT NULL THEN
    v_request := v_request || jsonb_build_object('why', v_why);
  END IF;
  v_request_hash := public._project_approval_hash(v_request);

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or approval creation denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.action_kind = 'created'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different create request'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;
  IF v_due_at <= now() THEN
    RAISE EXCEPTION 'approval dueAt must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_authority
  FROM public.project_decision_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR SHARE;
  IF NOT FOUND
     OR v_project.client_id IS NULL
     OR v_authority.decision_lead_id IS DISTINCT FROM v_project.client_id
     OR v_authority.required_coapprover_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'project has no valid explicit household approval authority'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients AS relationship
  WHERE relationship.designer_id = v_project.designer_id
    AND relationship.client_id = v_project.client_id
    AND relationship.status = 'active'
  ORDER BY relationship.created_at, relationship.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project has no exact active designer-client relationship'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_phases AS phase
    WHERE phase.id = v_phase_id AND phase.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'approval phase must belong to the project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_predecessor_decision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.client_decisions AS predecessor
       WHERE predecessor.id = p_predecessor_decision_id
         AND predecessor.project_id = p_project_id
         AND predecessor.approval_contract = 'project_artifact_v1'
     )
  THEN
    RAISE EXCEPTION 'Stage-2 predecessor must belong to the same project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_source
  FROM public._resolve_project_approval_artifact(
    p_project_id, v_source_kind, v_source_id
  );

  PERFORM set_config(
    'app.project_approval_decision_insert_id', v_decision_id::text, true
  );
  INSERT INTO public.client_decisions (
    id, designer_client_id, project_id, title, context, due_date,
    status, decision_type, decision_kind, coordination_kind,
    blocking_status, blocks_kind, court, designer_id, phase_id,
    section_key, approval_contract, predecessor_decision_id
  ) VALUES (
    v_decision_id, v_relationship.id, p_project_id, v_title, v_context, v_due_at,
    'draft', 'approval', 'approval', 'signoff',
    'blocks_phase', 'phase',
    'client', v_project.designer_id, v_phase_id, v_section_key,
    'project_artifact_v1', p_predecessor_decision_id
  ) RETURNING updated_at INTO v_decision_updated_at;
  PERFORM set_config(
    'app.project_approval_decision_insert_id',
    COALESCE(v_previous_decision_insert, ''), true
  );

  PERFORM set_config(
    'app.project_approval_evidence_decision_id', v_decision_id::text, true
  );
  INSERT INTO public.project_decision_authority_snapshots (
    id, decision_id, project_id, decision_lead_id,
    required_coapprover_id, authority_revision, assigned_by
  ) VALUES (
    v_snapshot_id, v_decision_id, p_project_id,
    v_authority.decision_lead_id, v_authority.required_coapprover_id,
    v_authority.revision, v_authority.assigned_by
  );

  PERFORM set_config(
    'app.project_approval_option_decision_id', v_decision_id::text, true
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, quantity, cost_delta_cents,
    lead_time_days_delta, approves, selected, sort_order,
    approval_outcome, cost_cents_delta, schedule_days_delta
  ) VALUES
    (v_decision_id, 'Approved', NULL, 1, v_cost_delta,
     v_lead_delta, true, false, 0, 'approved', v_cost_delta, v_schedule_delta),
    (v_decision_id, 'Changes requested', NULL, 1, v_cost_delta,
     v_lead_delta, false, false, 1, 'changes_requested', v_cost_delta, v_schedule_delta),
    (v_decision_id, 'Needs discussion', NULL, 1, v_cost_delta,
     v_lead_delta, false, false, 2, 'needs_discussion', v_cost_delta, v_schedule_delta);
  PERFORM set_config(
    'app.project_approval_option_decision_id',
    COALESCE(v_previous_option_insert, ''), true
  );

  INSERT INTO public.project_approval_artifacts (
    id, decision_id, project_id, source_kind, source_id, source_version,
    artifact_hash, artifact_title, question, context, why, why_author_name,
    due_at, phase_id,
    cost_cents_delta, schedule_days_delta, lead_time_days_delta,
    source_snapshot
  ) VALUES (
    v_artifact_id, v_decision_id, p_project_id, v_source_kind, v_source_id,
    v_source.source_version, v_source.artifact_hash, v_source.artifact_title,
    v_question, v_context, v_why, v_why_author_name, v_due_at, v_phase_id,
    v_cost_delta, v_schedule_delta, v_lead_delta, v_source.safe_snapshot
  );

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', p_project_id,
    'decisionId', v_decision_id,
    'authoritySnapshotId', v_snapshot_id,
    'artifactId', v_artifact_id,
    'artifactHash', v_source.artifact_hash,
    'authorityRevision', v_authority.revision,
    'predecessorDecisionId', p_predecessor_decision_id,
    'updatedAt', v_decision_updated_at,
    'status', 'draft'
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, p_project_id, v_decision_id, 'created', v_key,
    v_request_hash, v_actor, v_result
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );

  RETURN v_result || jsonb_build_object('idempotent', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_insert_id',
    COALESCE(v_previous_decision_insert, ''), true
  );
  PERFORM set_config(
    'app.project_approval_option_decision_id',
    COALESCE(v_previous_option_insert, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );
  RAISE;
END;
$$;


REVOKE ALL ON FUNCTION public._create_project_approval_decision_checked(
  uuid, jsonb, text, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._create_project_approval_decision_checked(
  uuid, jsonb, text, uuid, text, text
) IS
  'Checked creator for a Stage-2 approval. 00572 (W2-n4): the why is attributed '
  'with the composer''s DISPLAY name — display_name, else the whole full_name — '
  'where 00569 froze the given name alone.';

-- The rows 00569 already froze carry a given name. Their author is the actor on
-- the approval's own 'created' receipt, which is immutable and never rewritten,
-- so the backfill has a true source rather than a guess. A row whose author has
-- since been deleted, or has no name at all, is left exactly as it is: an
-- attribution is dropped, never invented.
--
-- ONE APPROVAL IS NOT ITS OWN AUTHOR (r1 M6). `supersede_project_approval_
-- decision` (00569) carries an unchanged why — and the name beside it —
-- forward onto the successor, precisely so an inherited sentence keeps the
-- signature of whoever actually wrote it. But the successor's own 'created'
-- receipt names the designer who REISSUED it, who is often someone else. So
-- the author is resolved from the deepest ancestor still carrying that same
-- sentence, walking `predecessor_decision_id` up the chain: the composer, not
-- the reissuer. A row whose why differs from its predecessor's was written
-- fresh and resolves from its own receipt, as before.
--
-- Kept as a function rather than a bare statement so the SQL tests can put a
-- row in front of it and watch it move, and so a later repair can run it again.
CREATE OR REPLACE FUNCTION public.backfill_why_author_display_names()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  -- `project_approval_artifacts` is UPDATE-immutable by trigger (00463's
  -- guard_project_approval_evidence_edge), and rightly so: an approval's
  -- evidence is the record. This one column is not evidence — it is a
  -- rendering of a name the ruling says was rendered wrongly, and 00569's own
  -- comment already calls it "frozen so a later RENAME cannot rewrite what the
  -- homeowner already read". A repair is not a rename. The guard is lifted for
  -- the length of this statement only, on this table only, and restored even
  -- if the statement raises; every other column, row and table is untouched.
  ALTER TABLE public.project_approval_artifacts
    DISABLE TRIGGER a_guard_project_approval_artifact_edge_trg;
  BEGIN
    WITH RECURSIVE composer AS (
      -- Seed: every artifact that carries a sentence, standing on its own
      -- decision. `project_approval_artifacts.decision_id` is UNIQUE (00463),
      -- so there is exactly one row per step of the walk.
      SELECT a.decision_id              AS target_decision,
             d.id                       AS ancestor_id,
             d.predecessor_decision_id  AS parent_id,
             a.why                      AS why,
             0                          AS depth
        FROM public.project_approval_artifacts AS a
        JOIN public.client_decisions AS d ON d.id = a.decision_id
       WHERE a.why IS NOT NULL
      UNION ALL
      -- Step: up one edition, but only while the sentence is the SAME one.
      -- A successor whose designer wrote a fresh why stops the walk there and
      -- is attributed to whoever wrote that.
      SELECT c.target_decision, p.id, p.predecessor_decision_id, c.why,
             c.depth + 1
        FROM composer AS c
        JOIN public.client_decisions AS p ON p.id = c.parent_id
        JOIN public.project_approval_artifacts AS pa
          ON pa.decision_id = p.id
         AND pa.why IS NOT DISTINCT FROM c.why
       WHERE c.depth < 50
    ),
    origin AS (
      SELECT DISTINCT ON (target_decision) target_decision, ancestor_id
        FROM composer
       ORDER BY target_decision, depth DESC
    ),
    resolved AS (
      SELECT DISTINCT ON (origin.target_decision)
             origin.target_decision AS decision_id,
             public._why_author_display_name(receipt.actor_id) AS name
        FROM origin
        JOIN public.project_approval_action_receipts AS receipt
          ON receipt.decision_id = origin.ancestor_id
         AND receipt.action_kind = 'created'
       ORDER BY origin.target_decision, receipt.created_at
    )
    UPDATE public.project_approval_artifacts AS artifact
       SET why_author_name = resolved.name
      FROM resolved
     WHERE resolved.decision_id = artifact.decision_id
       AND artifact.why IS NOT NULL
       AND resolved.name IS NOT NULL
       AND artifact.why_author_name IS DISTINCT FROM resolved.name;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.project_approval_artifacts
      ENABLE TRIGGER a_guard_project_approval_artifact_edge_trg;
    RAISE;
  END;
  ALTER TABLE public.project_approval_artifacts
    ENABLE TRIGGER a_guard_project_approval_artifact_edge_trg;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_why_author_display_names()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_why_author_display_names()
  TO service_role;

COMMENT ON FUNCTION public.backfill_why_author_display_names() IS
  'W2-n4 (00572): re-attributes a frozen why to its author''s DISPLAY name, '
  'resolved from the immutable ''created'' receipt of the deepest edition still '
  'carrying that same sentence — so an inherited why keeps its composer and is '
  'never re-signed with the name of the designer who reissued it. Idempotent — '
  'a second run moves nothing.';

SELECT public.backfill_why_author_display_names();
