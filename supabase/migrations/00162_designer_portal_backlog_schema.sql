-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00162: Designer Portal Backlog Schema
--
-- Net-new tables and columns that upcoming designer-portal frontend work
-- depends on. Each piece is guarded with IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS so this migration is safe to re-run and so it no-ops on anything an
-- earlier migration already shipped.
--
-- Backlog mapping:
--   VEN-01 (Request Quote)        → public.vendor_quote_requests
--   CLI-08 (nurture note send)    → client_nurture_touchpoints.content / email_sent_at
--   SET-10 (active sessions list) → public.user_sessions
--   SET-08 (SMS preferences)      → profiles.phone (already exists) + profiles.sms_opt_in
--   CLI-03 (decision option imgs) → client_decision_options.image_url (already exists)
--
-- Conventions mirrored from 00009 / 00040 / 00062 / 00148:
--   * schema-qualified public.* for net-new tables
--   * RLS enabled on every new table with auth.uid()-scoped policies
--   * updated_at maintained by the shared update_updated_at_column() trigger fn
--     (defined in 00014)
--   * indexes on every FK column
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VENDOR QUOTE REQUESTS  (VEN-01 — Request Quote)
--    A designer asks a vendor for a quote on a defined scope. Designers CRUD
--    their own rows; nobody else can see them.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vendor_quote_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID        NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  designer_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request content
  scope        TEXT,
  timeline     TEXT,
  message      TEXT,

  -- Lifecycle: draft is composed locally, sent once dispatched to the vendor,
  -- responded/closed track follow-up.
  status       TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'sent', 'responded', 'closed')),

  -- Timestamps
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_quote_requests_vendor
  ON public.vendor_quote_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_quote_requests_designer
  ON public.vendor_quote_requests(designer_id);
CREATE INDEX IF NOT EXISTS idx_vendor_quote_requests_status
  ON public.vendor_quote_requests(status);

-- updated_at trigger (idempotent)
DROP TRIGGER IF EXISTS update_vendor_quote_requests_updated_at
  ON public.vendor_quote_requests;
CREATE TRIGGER update_vendor_quote_requests_updated_at
  BEFORE UPDATE ON public.vendor_quote_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.vendor_quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Designers can manage their quote requests"
  ON public.vendor_quote_requests;
CREATE POLICY "Designers can manage their quote requests"
  ON public.vendor_quote_requests FOR ALL
  TO authenticated
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

COMMENT ON TABLE public.vendor_quote_requests IS
  'VEN-01: designer-initiated quote requests to a vendor. RLS scopes every row to its owning designer.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CLIENT NURTURE TOUCHPOINTS — add nurture-note content + send timestamp
--    (CLI-08 — nurture note send)
--    Table created in 00062. RLS / policy already exist there ("Designers can
--    manage their touchpoints"); we only add columns here.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_nurture_touchpoints
  ADD COLUMN IF NOT EXISTS content       TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_nurture_touchpoints.content IS
  'CLI-08: the body of the nurture note composed/sent to the client.';
COMMENT ON COLUMN public.client_nurture_touchpoints.email_sent_at IS
  'CLI-08: timestamp the nurture note was emailed; NULL until dispatched.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. USER SESSIONS  (SET-10 — active sessions list)
--    A lightweight record of authenticated sessions the user can review and
--    revoke. Users may read and delete their own rows only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_agent     TEXT,
  ip             TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active
  ON public.user_sessions(user_id, last_active_at DESC);

-- RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own sessions"
  ON public.user_sessions;
CREATE POLICY "Users can read their own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own sessions"
  ON public.user_sessions;
CREATE POLICY "Users can delete their own sessions"
  ON public.user_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role (Edge Functions / triggers, where auth.uid() IS NULL) records
-- sessions on the user's behalf.
DROP POLICY IF EXISTS "Service role full access to user sessions"
  ON public.user_sessions;
CREATE POLICY "Service role full access to user sessions"
  ON public.user_sessions FOR ALL
  USING (auth.uid() IS NULL);

COMMENT ON TABLE public.user_sessions IS
  'SET-10: per-user record of active authenticated sessions for the security settings list. Users may read/revoke (delete) their own.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PROFILES — SMS opt-in  (SET-08 — SMS preferences)
--    profiles.phone already exists (00013). Add the SMS consent flag only.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_in  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.sms_opt_in IS
  'SET-08: user consent to receive SMS notifications. Pairs with notification_preferences.channels_sms.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CLIENT DECISION OPTIONS — image_url  (CLI-03 — option images)
--    image_url already exists on client_decision_options (00062). Re-asserted
--    here defensively; this is a no-op on any environment with 00062 applied.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.client_decision_options.image_url IS
  'CLI-03: image shown to the client for this decision option.';
