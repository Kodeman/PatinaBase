-- ═══════════════════════════════════════════════════════════════════════════
-- 00569 — the why, the viewer's chair, and the client's receipt
--
-- Program: "The Decision, Delivered" · Wave 2 · P-13 (data half), P-20, and
-- the Wave-1 carry iosb3-M2. Also carries P-06's deep-link pin, which is a
-- SQL fact: notify_client_attention (00534) derives metadata.deep_link from
-- the entity type and id the producers pass it.
--
-- Covers:
--   1. project_approval_artifacts.why exists, is nullable, and refuses more
--      than 200 characters — at the column AND at the creating RPC.
--   2. The why survives into the immutable artifact and out through the
--      sanitized projection, for the frozen lead and for the studio alike.
--   3. viewerRole names the caller's chair per row: 'lead' for the frozen
--      decision lead, 'studio' for a design-studio co-member. ('household' is
--      the declared third value for a project client who is not this row's
--      lead; the projection's own row filter makes it unreachable at 00569,
--      which this file states rather than pretends otherwise.)
--   4. Answering writes the household its receipt on the client rail: one
--      in_app bell row, titled in the second person and naming the released
--      piece — or claiming nothing when nothing moved. The row arrives already
--      read and writes NO push envelope: it acknowledges the act of the person
--      it is addressed to, and the product does not buzz her to report what she
--      just did. Every other caller of the rail keeps both rows, unread.
--   5. The released piece names are frozen into the immutable 'responded'
--      receipt, because the same statement that names them clears the link.
--   6. P-06 — a proposal and an invoice attention row carry /proposals/<id>
--      and /invoices/<id>.
--   7. whyAuthorName — the why reaches the homeowner attributed to whoever
--      composed it, frozen with the artifact: an inherited line keeps its
--      author across a reissue, a re-asked line takes the reissuer's name,
--      and a why-less approval carries no name at all.
--   8. P-18/R1 (folded in from the web lane's 00570) — clientConsentMethod +
--      clientSignature reach the response columns; a response sent without
--      them keeps the unsigned click-through posture it always had.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/workflow/approval_authority/00569_why_viewer_role_receipt_contract_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

BEGIN;

-- ── structure ──────────────────────────────────────────────────────────────

DO $structure$
DECLARE
  v_reviews text := pg_get_functiondef(
    'public.get_project_decision_reviews(uuid)'::regprocedure
  );
  v_respond text := pg_get_functiondef(
    'public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)'::regprocedure
  );
  v_why_check text;
  v_why_author_check text;
  v_respond_public text := pg_get_functiondef(
    'public.respond_project_approval(uuid,jsonb,timestamptz,text)'::regprocedure
  );
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_approval_artifacts'
      AND column_name = 'why'
      AND is_nullable = 'YES'
      AND data_type = 'text'
  ), 'project_approval_artifacts.why is missing or not nullable text';

  SELECT pg_get_constraintdef(oid) INTO v_why_check
  FROM pg_constraint
  WHERE conrelid = 'public.project_approval_artifacts'::regclass
    AND conname = 'project_approval_artifacts_why_check';
  ASSERT v_why_check LIKE '%200%',
    'the why column carries no 200-character ceiling';

  -- P-13: who said it, frozen beside what was said, and never without it.
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_approval_artifacts'
      AND column_name = 'why_author_name'
      AND is_nullable = 'YES'
      AND data_type = 'text'
  ), 'project_approval_artifacts.why_author_name is missing or not nullable text';

  SELECT pg_get_constraintdef(oid) INTO v_why_author_check
  FROM pg_constraint
  WHERE conrelid = 'public.project_approval_artifacts'::regclass
    AND conname = 'project_approval_artifacts_why_author_check';
  ASSERT v_why_author_check IS NOT NULL
     AND v_why_author_check LIKE '%why_author_name IS NULL%',
    'nothing stops a name being frozen under no line';

  -- The widened creating RPCs, and no ambiguous leftovers.
  ASSERT to_regprocedure(
    'public.create_project_approval_decision(uuid,jsonb,text,text)'
  ) IS NOT NULL, 'create_project_approval_decision did not learn p_why';
  ASSERT to_regprocedure(
    'public.create_project_approval_decision(uuid,jsonb,text)'
  ) IS NULL,
    'the 3-argument create signature still stands — a 3-arg call is ambiguous';
  ASSERT to_regprocedure(
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid,text,text)'
  ) IS NOT NULL,
    'the checked creator did not learn p_why / p_why_author_name';
  ASSERT to_regprocedure(
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)'
  ) IS NULL, 'the 4-argument checked signature still stands';

  -- P-18/R1, folded in from the web lane's 00570: the public wrapper takes the
  -- typed name and hands it to the checked responder, which has validated the
  -- pair since 00464 but could never be given it.
  ASSERT v_respond_public LIKE '%clientConsentMethod%'
     AND v_respond_public LIKE '%clientSignature%',
    'the response wrapper still refuses the name it asks the homeowner to type';
  ASSERT v_respond_public NOT LIKE '%p_idempotency_key, NULL, NULL%',
    'the response wrapper still hard-codes a NULL consent pair';

  ASSERT has_function_privilege(
    'authenticated',
    'public.create_project_approval_decision(uuid,jsonb,text,text)',
    'EXECUTE'
  ), 'the studio cannot call the widened create RPC';
  ASSERT NOT has_function_privilege(
    'anon', 'public.create_project_approval_decision(uuid,jsonb,text,text)',
    'EXECUTE'
  ), 'anon may call the create RPC';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid,text,text)',
    'EXECUTE'
  ), 'the private checked creator is reachable by authenticated';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._project_approval_release_sentence(text[])',
    'EXECUTE'
  ), 'the receipt sentence helper is reachable by authenticated';

  ASSERT v_reviews LIKE '%''why'', artifact.why%',
    'the sanitized projection does not carry the why';
  ASSERT v_reviews LIKE '%''whyAuthorName''%'
     AND v_reviews LIKE '%artifact.why_author_name%',
    'the sanitized projection does not attribute the why to its author';
  ASSERT v_reviews LIKE '%''viewerRole''%'
     AND v_reviews LIKE '%''lead''%'
     AND v_reviews LIKE '%''studio''%'
     AND v_reviews LIKE '%''household''%',
    'the sanitized projection declares no viewer role';
  ASSERT v_respond LIKE '%notify_client_attention%'
     AND v_respond LIKE '%decision_receipt%'
     AND v_respond LIKE '%releasedItemNames%',
    'the response writes the household no receipt';
  ASSERT pg_get_functiondef(
    'public._project_approval_release_sentence(text[])'::regprocedure
  ) LIKE '%search_path TO ''public'', ''pg_temp''%',
    'the receipt sentence helper does not pin its search_path';
END
$structure$;

-- ── the sentence, before any fixture ───────────────────────────────────────

DO $sentence$
BEGIN
  ASSERT public._project_approval_release_sentence(ARRAY[]::text[])
    = 'Your answer is on the record.', 'an empty release claims a consequence';
  ASSERT public._project_approval_release_sentence(ARRAY['the cabinet order'])
    = 'It releases the cabinet order.', 'one piece is named';
  ASSERT public._project_approval_release_sentence(ARRAY['a', 'b'])
    = 'It releases two pieces that were waiting on it.',
    'two pieces are counted, not joined with "and"';
  ASSERT public._project_approval_release_sentence(ARRAY['a', 'b', 'c'])
    = 'It releases three pieces that were waiting on it.',
    'three pieces are counted in words';
  -- project_ffe_items.name is catalogue text the studio typed. A comma inside
  -- one name turned an "and" join into what reads as a list of three things,
  -- on the email, the bell and the lock screen at once.
  ASSERT public._project_approval_release_sentence(
      ARRAY['Built-in shelving, north wall']
    ) = 'It releases one piece that was waiting on it.',
    'a lone name carrying a comma is counted, not named';
  ASSERT public._project_approval_release_sentence(
      ARRAY['Built-in shelving, north wall', 'Built-in Window Banquette']
    ) = 'It releases two pieces that were waiting on it.',
    'two names, one with a comma, must not read as three things';
  ASSERT public._project_approval_release_sentence(
      (SELECT array_agg('p' || n) FROM generate_series(1, 21) AS n)
    ) = 'It releases the pieces that were waiting on it.',
    'past twenty the count stops being a word worth reading';
END
$sentence$;

-- ── fixture ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid, text) TO PUBLIC;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a5690000-0000-4000-8000-000000000001', 'w2-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5690000-0000-4000-8000-000000000002', 'w2-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5690000-0000-4000-8000-000000000003', 'w2-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a5690000-0000-4000-8000-000000000001', 'w2-designer@test.invalid', 'W2 Designer', true),
  ('a5690000-0000-4000-8000-000000000002', 'w2-lead@test.invalid', 'W2 Lead', false),
  ('a5690000-0000-4000-8000-000000000003', 'w2-peer@test.invalid', 'Peer Ashford', true)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('a5691000-0000-4000-8000-000000000001', 'design_studio', 'W2 Studio',
        'w2-receipt-studio', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a5691100-0000-4000-8000-000000000001', 'a5690000-0000-4000-8000-000000000001',
   'a5691000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a5691100-0000-4000-8000-000000000002', 'a5690000-0000-4000-8000-000000000003',
   'a5691000-0000-4000-8000-000000000001', 'admin', 'active', now());

-- 00511: every project lead holds a designer-domain role.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT membership.user_id, role.id, membership.user_id
FROM public.organization_members AS membership
CROSS JOIN public.roles AS role
WHERE membership.organization_id = 'a5691000-0000-4000-8000-000000000001'
  AND membership.role IN ('owner', 'admin')
  AND role.name = 'studio_owner';

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, client_email, status, source
) VALUES
  ('a5692000-0000-4000-8000-000000000001',
   'a5690000-0000-4000-8000-000000000001',
   'a5690000-0000-4000-8000-000000000002', 'W2 Lead',
   'w2-lead@test.invalid', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status, current_phase
) VALUES
  ('a5693000-0000-4000-8000-000000000001', 'W2 Receipt Project',
   'a5690000-0000-4000-8000-000000000001',
   'a5690000-0000-4000-8000-000000000002',
   'a5690000-0000-4000-8000-000000000001',
   'a5691000-0000-4000-8000-000000000001', 'active', 'design');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order, lane, follows_phase_id
) VALUES
  ('a5693100-0000-4000-8000-000000000001',
   'a5693000-0000-4000-8000-000000000001',
   'Approval laboratory', 'approval-lab', 'pending', 0, 'thread', NULL);

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
SELECT
  ('a5694000-0000-4000-8000-' || lpad(issue_no::text, 12, '0'))::uuid,
  'a5693000-0000-4000-8000-000000000001'::uuid,
  issue_no,
  'W2 issued set ' || issue_no,
  'w2-plan-' || issue_no,
  encode(extensions.digest(('w2-request-' || issue_no)::bytea, 'sha256'), 'hex'),
  encode(extensions.digest(('w2-artifact-' || issue_no)::bytea, 'sha256'), 'hex'),
  4 + issue_no,
  'a5690000-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 3) AS issue_no;

CREATE TEMP TABLE w2_results (label text PRIMARY KEY, payload jsonb NOT NULL)
  ON COMMIT DROP;
GRANT SELECT, INSERT ON w2_results TO authenticated, service_role;

CREATE TEMP TABLE w2_tokens (
  label text PRIMARY KEY,
  decision_id uuid NOT NULL,
  updated_at timestamptz NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON w2_tokens TO authenticated, service_role;

-- ── P-13. Creating with a why, and refusing an over-long one ───────────────

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

SELECT public.set_project_decision_authority(
  'a5693000-0000-4000-8000-000000000001',
  'a5690000-0000-4000-8000-000000000002', NULL, 0
);

RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.create_w2_approval(
  p_label text,
  p_issue_no integer,
  p_why text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_project_approval_decision(
    'a5693000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'title', 'W2 ' || p_label,
      'question', 'Approve W2 request ' || p_label || '?',
      'context', 'Client-safe W2 fixture.',
      'dueAt', (now() + interval '9 days')::text,
      'phaseId', 'a5693100-0000-4000-8000-000000000001',
      'sectionKey', 'project',
      'artifactKind', 'plan_issue',
      'artifactId', ('a5694000-0000-4000-8000-' ||
                    lpad(p_issue_no::text, 12, '0'))::uuid,
      'costCentsDelta', 0,
      'scheduleDaysDelta', 0,
      'leadTimeDaysDelta', 0
    ),
    'w2-create-' || p_label,
    p_why
  );
  INSERT INTO w2_results(label, payload) VALUES (p_label || '-create', v_result);
  RETURN (v_result->>'decisionId')::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.create_w2_approval(text, integer, text) TO PUBLIC;
SET LOCAL ROLE authenticated;

SELECT pg_temp.create_w2_approval(
  'released', 1,
  'The island moved a foot; everything else is as we drew it.'
);
SELECT pg_temp.create_w2_approval('returned', 2, NULL);

DO $why_limits$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.create_w2_approval('overlong', 3, repeat('x', 201));
  EXCEPTION WHEN check_violation THEN v_denied := true;
  END;
  ASSERT v_denied, 'the creating RPC accepted a why longer than 200 characters';

  -- Exactly 200 is fine, and a blank why is no why at all.
  PERFORM pg_temp.create_w2_approval('atlimit', 3, repeat('x', 200));
END
$why_limits$;

RESET ROLE;

-- The column refuses it too, with every trigger stood down — so a writer that
-- reaches the table by another road meets the same ceiling.
DO $column_check$
DECLARE
  v_denied boolean := false;
BEGIN
  SET LOCAL session_replication_role = replica;
  BEGIN
    INSERT INTO public.project_approval_artifacts (
      decision_id, project_id, source_kind, source_id, source_version,
      artifact_hash, artifact_title, question, why, due_at, phase_id,
      cost_cents_delta, schedule_days_delta, lead_time_days_delta,
      source_snapshot
    )
    SELECT
      (payload->>'decisionId')::uuid,
      'a5693000-0000-4000-8000-000000000001',
      'plan_issue', 'a5694000-0000-4000-8000-000000000003', 1,
      repeat('a', 64), 'direct', 'direct?', repeat('y', 201),
      now() + interval '9 days',
      'a5693100-0000-4000-8000-000000000001', 0, 0, 0, '{}'::jsonb
    FROM w2_results WHERE label = 'returned-create';
  EXCEPTION WHEN check_violation THEN v_denied := true;
  END;
  SET LOCAL session_replication_role = origin;
  ASSERT v_denied, 'the why column accepted more than 200 characters';
END
$column_check$;

-- ── Confirm, publish, and stage the work an approval will release ──────────

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;

INSERT INTO w2_results(label, payload)
SELECT create_row.label || '-confirm',
       public.confirm_project_decision_review(
         (create_row.payload->>'decisionId')::uuid,
         jsonb_build_object(
           'authorityRevision', (create_row.payload->>'authorityRevision')::integer,
           'artifactHash', create_row.payload->>'artifactHash',
           'reviewMethod', 'portal_clickthrough'
         ),
         'w2-confirm-' || replace(create_row.label, '-create', '')
       )
FROM w2_results AS create_row
WHERE create_row.label IN ('released-create', 'returned-create')
ORDER BY create_row.label;

RESET ROLE;
SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

INSERT INTO w2_tokens(label, decision_id, updated_at)
SELECT replace(create_row.label, '-create', ''), published.id, published.updated_at
FROM w2_results AS create_row
CROSS JOIN LATERAL public.publish_client_decision(
  (create_row.payload->>'decisionId')::uuid
) AS published
WHERE create_row.label IN ('released-create', 'returned-create')
ORDER BY create_row.label;

RESET ROLE;

INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, blocked, blocked_reason,
  blocked_by_decision_id
)
SELECT
  'a5695000-0000-4000-8000-000000000001',
  'a5693000-0000-4000-8000-000000000001',
  'the cabinet order', 'specified', 1, true, 'Waiting on the issued set',
  decision_id
FROM w2_tokens WHERE label = 'released';

-- ── P-13 + iosb3-M2. The projection, from both chairs ──────────────────────

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $lead_read$
DECLARE
  v_row jsonb;
  v_list jsonb;
BEGIN
  SELECT item.value INTO v_row
  FROM jsonb_array_elements(
    public.get_project_decision_reviews('a5693000-0000-4000-8000-000000000001')
  ) AS item(value)
  WHERE item.value->>'decisionId' = (
    SELECT decision_id::text FROM w2_tokens WHERE label = 'released'
  );

  ASSERT v_row->>'why'
    = 'The island moved a foot; everything else is as we drew it.',
    'the frozen why did not survive into the client projection';
  -- The composing designer's DISPLAY name, frozen at compose time (W2-n4,
  -- 00572). 00569 froze full_name's first token — 'W2' — and the Wave-2 walk
  -- ruled that a studio signing its work "Leah Kochaver" must not have a client
  -- read "— Leah" under the one sentence she wrote herself. This profile has no
  -- display_name, so the whole full_name stands in.
  ASSERT v_row->>'whyAuthorName' = 'W2 Designer',
    'the why reached the homeowner unattributed: '
    || COALESCE(v_row->>'whyAuthorName', '<null>');
  ASSERT v_row->>'viewerRole' = 'lead',
    'the frozen decision lead is not told she is the lead';

  v_list := public.list_my_project_decision_reviews();
  -- released, returned, and the 200-character at-limit draft.
  ASSERT jsonb_array_length(v_list) = 3,
    'the lead sees a list other than her own three approvals: '
    || jsonb_array_length(v_list);
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list) AS item(value)
    WHERE item.value->>'viewerRole' IS DISTINCT FROM 'lead'
  ), 'the current-user list lost the viewer role';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list) AS item(value)
    WHERE item.value->>'why' IS NULL
  ), 'an approval composed without a why should carry none';
  -- No line, no name: an attribution under nothing attributes nothing.
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list) AS item(value)
    WHERE item.value->>'why' IS NULL
      AND item.value->>'whyAuthorName' IS NOT NULL
  ), 'a why-less approval carries an author name anyway';
END
$lead_read$;
RESET ROLE;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $studio_read$
DECLARE
  v_list jsonb;
BEGIN
  v_list := public.list_my_project_decision_reviews();
  ASSERT jsonb_array_length(v_list) > 0,
    'the studio co-member sees no approvals at all';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list) AS item(value)
    WHERE item.value->>'viewerRole' IS DISTINCT FROM 'studio'
  ), 'a studio co-member is drawn as the person who answers';
  -- The studio composed the why and must be able to read it back.
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_list) AS item(value)
    WHERE item.value->>'why'
      = 'The island moved a foot; everything else is as we drew it.'
  ), 'the composer cannot read back the why it wrote';
END
$studio_read$;
RESET ROLE;

-- ── P-20. Answering writes the household its receipt ───────────────────────

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;

INSERT INTO w2_results(label, payload)
SELECT 'released-response', public.respond_project_approval(
  token.decision_id, '{"outcome":"approved"}'::jsonb,
  token.updated_at, 'w2-respond-released'
)
FROM w2_tokens AS token WHERE token.label = 'released';

INSERT INTO w2_results(label, payload)
SELECT 'returned-response', public.respond_project_approval(
  token.decision_id, '{"outcome":"changes_requested"}'::jsonb,
  token.updated_at, 'w2-respond-returned'
)
FROM w2_tokens AS token WHERE token.label = 'returned';

RESET ROLE;

DO $receipt$
DECLARE
  u_lead uuid := 'a5690000-0000-4000-8000-000000000002';
  v_released uuid := (SELECT decision_id FROM w2_tokens WHERE label = 'released');
  v_returned uuid := (SELECT decision_id FROM w2_tokens WHERE label = 'returned');
  v_other uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_meta jsonb;
  v_count integer;
BEGIN
  -- 1. The released names are frozen into the immutable responded receipt.
  SELECT payload INTO v_result FROM w2_results WHERE label = 'released-response';
  ASSERT v_result->'releasedItemNames' = '["the cabinet order"]'::jsonb,
    'the response did not freeze what it released: '
    || COALESCE(v_result->>'releasedItemNames', '<null>');
  SELECT payload INTO v_result FROM w2_results WHERE label = 'returned-response';
  ASSERT v_result->'releasedItemNames' = '[]'::jsonb,
    'a return released something';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_ffe_items
    WHERE id = 'a5695000-0000-4000-8000-000000000001'
      AND NOT blocked AND blocked_by_decision_id IS NULL
  ), 'the approved answer did not actually release the piece';

  -- 2. The bell row: one per approval, in the second person, naming the
  --    consequence. The "needs you" line written at publish is the row this
  --    replaces (00534 de-dups on entity while unopened), so there is exactly
  --    one in_app row for this decision.
  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'in_app'
    AND metadata->>'entity_id' = v_released::text;
  ASSERT v_count = 1,
    'the receipt stacked a second bell line instead of replacing the ask: '
    || v_count;

  SELECT metadata INTO v_meta
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'in_app'
    AND metadata->>'entity_id' = v_released::text;
  ASSERT v_meta->>'kind' = 'decision_receipt',
    'the bell row is not marked as a receipt';
  -- The artifact's own title, not the decision's — the same rule the email
  -- renderer follows, and the words she actually saw on the plate.
  ASSERT v_meta->>'title' = 'You approved "W2 issued set 1".',
    'the receipt does not say what she did: ' || COALESCE(v_meta->>'title', '<null>');
  ASSERT v_meta->>'body' = 'It releases the cabinet order.',
    'the receipt does not name the real consequence: '
    || COALESCE(v_meta->>'body', '<null>');
  ASSERT v_meta->>'entity_type' = 'decision'
     AND v_meta->>'deep_link' = '/decisions/' || v_released::text,
    'the receipt does not address the record';

  -- 3. A receipt is not a summons. It acknowledges the act of the person it is
  --    addressed to — the responder IS the frozen lead, the checked responder
  --    refuses anyone else — so it writes NO push envelope (no sound, no
  --    interruption-level active, no springboard number for her own answer)
  --    and the bell row arrives already read. The ceremony rides the email.
  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'push'
    AND metadata->>'entity_id' = v_released::text
    AND metadata->>'kind' = 'decision_receipt';
  ASSERT v_count = 0,
    'the receipt pushed the person who just acted: ' || v_count;

  -- And it added no envelope at all: the one push row this approval owns is
  -- the ASK's, written when the studio sent it. The receipt left it alone.
  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'push'
    AND metadata->>'entity_id' = v_released::text;
  ASSERT v_count = 1,
    'the answer changed how many envelopes this approval owns: ' || v_count;

  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'in_app'
    AND metadata->>'entity_id' = v_released::text
    AND opened_at IS NOT NULL AND status = 'opened';
  ASSERT v_count = 1,
    'the receipt left an unread line asking her to acknowledge her own answer';

  -- Every other caller of the rail is untouched: an attention row that carries
  -- no 'decision_receipt' kind still writes its envelope and still arrives
  -- unread. Probed on an entity of its own so it cannot disturb the rows the
  -- receipt assertions read.
  PERFORM public.notify_client_attention(
    u_lead, 'decision', v_other, 'A decision needs you', 'Body',
    '{}'::jsonb
  );
  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'push'
    AND metadata->>'entity_id' = v_other::text;
  ASSERT v_count = 1,
    'a non-receipt attention row lost its push envelope: ' || v_count;
  SELECT count(*) INTO v_count
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'in_app'
    AND metadata->>'entity_id' = v_other::text
    AND opened_at IS NULL AND status = 'delivered';
  ASSERT v_count = 1,
    'a non-receipt attention row arrived already read';

  -- 4. A return claims no consequence and is never called "declined".
  SELECT metadata INTO v_meta
  FROM public.notification_log
  WHERE user_id = u_lead AND channel = 'in_app'
    AND metadata->>'entity_id' = v_returned::text;
  ASSERT v_meta->>'title' = 'You returned "W2 issued set 2".',
    'changes_requested is RETURNED everywhere: '
    || COALESCE(v_meta->>'title', '<null>');
  ASSERT v_meta->>'body' = 'Your answer is on the record.',
    'a return invented a consequence: ' || COALESCE(v_meta->>'body', '<null>');

  -- 5. The designer's own resolved row still lands — the client leg is
  --    additive, not a replacement.
  ASSERT EXISTS (
    SELECT 1 FROM public.decision_notifications
    WHERE decision_id = v_released
      AND kind = 'decision_resolved'
      AND user_id = 'a5690000-0000-4000-8000-000000000001'
  ), 'the designer lost the resolved notification';
END
$receipt$;

-- ── P-13. The revision keeps the why (r1-B2) ───────────────────────────────
--
-- Revision is the normal sequel to a RETURNED approval (P-16). The successor
-- is built by the creator, so until 00569 widened the supersede call the
-- composer's first field emptied itself on every reissue. Two chains, one for
-- each branch: silence inherits the predecessor's line, an explicit p_why
-- replaces it.

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
SELECT
  ('a5694000-0000-4000-8000-' || lpad(issue_no::text, 12, '0'))::uuid,
  'a5693000-0000-4000-8000-000000000001'::uuid,
  issue_no,
  'W2 issued set ' || issue_no,
  'w2-plan-' || issue_no,
  encode(extensions.digest(('w2-request-' || issue_no)::bytea, 'sha256'), 'hex'),
  encode(extensions.digest(('w2-artifact-' || issue_no)::bytea, 'sha256'), 'hex'),
  4 + issue_no,
  'a5690000-0000-4000-8000-000000000001'::uuid
FROM generate_series(4, 7) AS issue_no;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.create_w2_approval(
  'revise-carry', 4, 'The island moved a foot; the rest is as we drew it.'
);
SELECT pg_temp.create_w2_approval(
  'revise-ask', 5, 'The island moved a foot; the rest is as we drew it.'
);
RESET ROLE;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO w2_results(label, payload)
SELECT create_row.label || '-confirm',
       public.confirm_project_decision_review(
         (create_row.payload->>'decisionId')::uuid,
         jsonb_build_object(
           'authorityRevision', (create_row.payload->>'authorityRevision')::integer,
           'artifactHash', create_row.payload->>'artifactHash',
           'reviewMethod', 'portal_clickthrough'
         ),
         'w2-confirm-' || replace(create_row.label, '-create', '')
       )
FROM w2_results AS create_row
WHERE create_row.label IN ('revise-carry-create', 'revise-ask-create')
ORDER BY create_row.label;

RESET ROLE;
SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

INSERT INTO w2_tokens(label, decision_id, updated_at)
SELECT replace(create_row.label, '-create', ''), published.id, published.updated_at
FROM w2_results AS create_row
CROSS JOIN LATERAL public.publish_client_decision(
  (create_row.payload->>'decisionId')::uuid
) AS published
WHERE create_row.label IN ('revise-carry-create', 'revise-ask-create')
ORDER BY create_row.label;

-- Both reissues are made by the OTHER studio member, whose shown name is
-- 'Peer Ashford' and not 'W2 Designer'. That is what makes the assertions below
-- mean anything: an inherited line must keep the name of whoever wrote it,
-- and a re-asked line must take the name of whoever reissued it.
RESET ROLE;
SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;

-- Silence: the predecessor's frozen line carries forward.
INSERT INTO w2_results(label, payload)
SELECT 'revise-carry-supersede', public.supersede_project_approval_decision(
  token.decision_id,
  jsonb_build_object(
    'title', 'W2 revise-carry, reissued',
    'question', 'Approve the reissued set?',
    'context', 'Client-safe W2 fixture.',
    'dueAt', (now() + interval '11 days')::text,
    'artifactKind', 'plan_issue',
    'artifactId', 'a5694000-0000-4000-8000-000000000006',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  token.updated_at,
  'w2-supersede-carry'
)
FROM w2_tokens AS token WHERE token.label = 'revise-carry';

-- The composer re-asks: the new line wins.
INSERT INTO w2_results(label, payload)
SELECT 'revise-ask-supersede', public.supersede_project_approval_decision(
  token.decision_id,
  jsonb_build_object(
    'title', 'W2 revise-ask, reissued',
    'question', 'Approve the reissued set?',
    'context', 'Client-safe W2 fixture.',
    'dueAt', (now() + interval '11 days')::text,
    'artifactKind', 'plan_issue',
    'artifactId', 'a5694000-0000-4000-8000-000000000007',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  token.updated_at,
  'w2-supersede-ask',
  'You asked us to hold the island where it was.'
)
FROM w2_tokens AS token WHERE token.label = 'revise-ask';

RESET ROLE;

DO $revision_why$
DECLARE
  v_carried text;
  v_carried_author text;
  v_reasked text;
  v_reasked_author text;
BEGIN
  SELECT artifact.why, artifact.why_author_name
    INTO v_carried, v_carried_author
  FROM w2_results AS row_carry
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = (row_carry.payload->>'successorDecisionId')::uuid
  WHERE row_carry.label = 'revise-carry-supersede';
  ASSERT v_carried = 'The island moved a foot; the rest is as we drew it.',
    'the revision dropped the line that explained the ask: '
    || COALESCE(v_carried, '<null>');
  ASSERT v_carried_author = 'W2 Designer',
    'an inherited line was re-attributed to whoever reissued it: '
    || COALESCE(v_carried_author, '<null>');

  SELECT artifact.why, artifact.why_author_name
    INTO v_reasked, v_reasked_author
  FROM w2_results AS row_ask
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = (row_ask.payload->>'successorDecisionId')::uuid
  WHERE row_ask.label = 'revise-ask-supersede';
  ASSERT v_reasked = 'You asked us to hold the island where it was.',
    'the composer could not re-ask the why on a revision: '
    || COALESCE(v_reasked, '<null>');
  ASSERT v_reasked_author = 'Peer Ashford',
    'a re-asked line kept the predecessor''s name: '
    || COALESCE(v_reasked_author, '<null>');

  -- The 200-character ceiling is not re-implemented here: supersession hands
  -- the value straight to the creating core, which already refuses an
  -- over-long why above, and every artifact row meets the column CHECK.
END
$revision_why$;

-- ── P-06. The deep link a producer's push row carries ──────────────────────

DO $deep_links$
DECLARE
  u_lead uuid := 'a5690000-0000-4000-8000-000000000002';
  v_proposal uuid := 'a569a000-0000-4000-8000-000000000001';
  v_invoice uuid := 'a569a000-0000-4000-8000-000000000002';
BEGIN
  PERFORM public.notify_client_attention(
    u_lead, 'proposal', v_proposal, 'A proposal is ready for you',
    'W2 Designer sent a proposal for your review.', '{}'::jsonb
  );
  PERFORM public.notify_client_attention(
    u_lead, 'invoice', v_invoice, 'An invoice is ready',
    'W2 Designer sent invoice INV-1 for W2 Receipt Project.', '{}'::jsonb
  );

  ASSERT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id = u_lead AND channel = 'push'
      AND metadata->>'entity_type' = 'proposal'
      AND metadata->>'entity_id' = v_proposal::text
      AND metadata->>'deep_link' = '/proposals/' || v_proposal::text
  ), 'a proposal push row does not carry /proposals/<id>';
  ASSERT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id = u_lead AND channel = 'push'
      AND metadata->>'entity_type' = 'invoice'
      AND metadata->>'entity_id' = v_invoice::text
      AND metadata->>'deep_link' = '/invoices/' || v_invoice::text
  ), 'an invoice push row does not carry /invoices/<id>';
END
$deep_links$;

-- ── P-18/R1. The typed name reaches the response it was typed for ──────────
--
-- Folded in from the web lane's 00570. Approve carries a typed legal name;
-- Return and Hold are press-and-hold only and send neither key, so their rows
-- keep the click-through posture they have always had — no signature, no
-- consent method, no consented-at — while the review confirmation that
-- preceded them stays 'portal_clickthrough' (R1: a press and hold is still a
-- click-through).

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
VALUES (
  'a5694000-0000-4000-8000-000000000008',
  'a5693000-0000-4000-8000-000000000001',
  8, 'W2 issued set 8', 'w2-plan-8',
  encode(extensions.digest('w2-request-8'::bytea, 'sha256'), 'hex'),
  encode(extensions.digest('w2-artifact-8'::bytea, 'sha256'), 'hex'),
  12, 'a5690000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.create_w2_approval('signed', 8, NULL);
RESET ROLE;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO w2_results(label, payload)
SELECT 'signed-confirm',
       public.confirm_project_decision_review(
         (create_row.payload->>'decisionId')::uuid,
         jsonb_build_object(
           'authorityRevision', (create_row.payload->>'authorityRevision')::integer,
           'artifactHash', create_row.payload->>'artifactHash',
           'reviewMethod', 'portal_clickthrough'
         ),
         'w2-confirm-signed'
       )
FROM w2_results AS create_row WHERE create_row.label = 'signed-create';
RESET ROLE;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO w2_tokens(label, decision_id, updated_at)
SELECT 'signed', published.id, published.updated_at
FROM w2_results AS create_row
CROSS JOIN LATERAL public.publish_client_decision(
  (create_row.payload->>'decisionId')::uuid
) AS published
WHERE create_row.label = 'signed-create';
RESET ROLE;

SELECT pg_temp.assume_actor('a5690000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO w2_results(label, payload)
SELECT 'signed-response', public.respond_project_approval(
  token.decision_id,
  jsonb_build_object(
    'outcome', 'approved',
    'clientConsentMethod', 'electronic_signature',
    'clientSignature', 'Harper Vale'
  ),
  token.updated_at, 'w2-respond-signed'
)
FROM w2_tokens AS token WHERE token.label = 'signed';
RESET ROLE;

DO $signature$
DECLARE
  v_signed uuid := (SELECT decision_id FROM w2_tokens WHERE label = 'signed');
  v_unsigned uuid := (SELECT decision_id FROM w2_tokens WHERE label = 'released');
  v_row public.client_decisions%ROWTYPE;
  v_refused boolean := false;
BEGIN
  -- 1. The two keys reach the columns 00464 has always written.
  SELECT * INTO v_row FROM public.client_decisions WHERE id = v_signed;
  ASSERT v_row.client_consent_method = 'electronic_signature',
    'the typed name did not record a consent method: '
    || COALESCE(v_row.client_consent_method, '<null>');
  ASSERT v_row.client_signature = 'Harper Vale',
    'the response dropped the signature: '
    || COALESCE(v_row.client_signature, '<null>');
  ASSERT v_row.client_consented_at IS NOT NULL,
    'a recorded signature carries no consented-at';

  -- 2. Without them, the row is exactly what it was before this migration:
  --    a click-through, unsigned. ('released' was answered with
  --    {"outcome":"approved"} and nothing else.)
  SELECT * INTO v_row FROM public.client_decisions WHERE id = v_unsigned;
  ASSERT v_row.client_consent_method IS NULL
     AND v_row.client_signature IS NULL
     AND v_row.client_consented_at IS NULL,
    'a response with no name invented consent for the homeowner';
  ASSERT EXISTS (
    SELECT 1 FROM public.project_decision_review_confirmations
    WHERE decision_id = v_unsigned AND review_method = 'portal_clickthrough'
  ), 'the review leg stopped reading as a click-through';

  -- 3. The wrapper still refuses a key it does not know, and still refuses a
  --    signature with no method — the checked function's rule, reached now
  --    that the pair can travel.
  BEGIN
    PERFORM public.respond_project_approval(
      v_signed, '{"outcome":"approved","signedBy":"Harper Vale"}'::jsonb,
      now(), 'w2-respond-unknown-key'
    );
  EXCEPTION WHEN invalid_parameter_value THEN v_refused := true;
  END;
  ASSERT v_refused, 'the response wrapper accepted an unknown payload key';
END
$signature$;

ROLLBACK;
