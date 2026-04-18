-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Vendor Pipeline
-- Description: Tracks furniture manufacturers from discovery → live partnership.
-- Integrates with Claude Cowork (external automation agent) which writes
-- scores and task results via the service_role key (bypasses RLS).
--
-- Note: the existing `public.vendors` table (from 00001) is a catalog-side
-- marketplace record with a different shape (name, website, contact_info, etc).
-- This pipeline uses its own `pipeline_vendors` table to avoid collision.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- PIPELINE_VENDORS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  website_url TEXT,
  location_city VARCHAR(100),
  location_state VARCHAR(50),
  location_country VARCHAR(50) DEFAULT 'US',
  year_established INTEGER,

  -- Classification
  product_categories TEXT[] DEFAULT '{}',
  price_range_low INTEGER,
  price_range_high INTEGER,
  company_size VARCHAR(50),

  -- Pipeline state
  stage VARCHAR(50) NOT NULL DEFAULT 'discovery',
  stage_changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Qualification
  total_score INTEGER,
  triage_level VARCHAR(20),
  has_hard_veto BOOLEAN DEFAULT FALSE,
  veto_reason TEXT,

  -- Contacts
  primary_contact_name VARCHAR(255),
  primary_contact_email VARCHAR(255),
  primary_contact_phone VARCHAR(50),
  primary_contact_role VARCHAR(100),

  -- Trade relationship
  trade_account_status VARCHAR(50),
  trade_discount_pct DECIMAL(5,2),
  payment_terms VARCHAR(50),
  drop_ship_capable BOOLEAN,

  -- Data & feed
  data_format VARCHAR(50),
  feed_url TEXT,
  feed_frequency VARCHAR(50),
  last_feed_sync_at TIMESTAMPTZ,

  -- Ownership
  scored_by_kody BOOLEAN DEFAULT FALSE,
  scored_by_leah BOOLEAN DEFAULT FALSE,
  awaiting_leah_review BOOLEAN DEFAULT FALSE,

  -- Notes & metadata
  notes TEXT,
  leah_notes TEXT,
  source VARCHAR(100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pipeline_vendors_stage_check CHECK (stage IN (
    'discovery', 'qualification', 'outreach', 'negotiation',
    'onboarding', 'live', 'paused', 'rejected'
  )),
  CONSTRAINT pipeline_vendors_triage_check CHECK (
    triage_level IS NULL OR triage_level IN ('green', 'yellow', 'orange', 'red')
  )
);

CREATE INDEX IF NOT EXISTS idx_pipeline_vendors_stage ON public.pipeline_vendors(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_vendors_triage ON public.pipeline_vendors(triage_level);
CREATE INDEX IF NOT EXISTS idx_pipeline_vendors_score
  ON public.pipeline_vendors(total_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pipeline_vendors_awaiting_leah
  ON public.pipeline_vendors(awaiting_leah_review) WHERE awaiting_leah_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_pipeline_vendors_slug ON public.pipeline_vendors(slug);

CREATE OR REPLACE FUNCTION update_pipeline_vendors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_vendors_updated_at ON public.pipeline_vendors;
CREATE TRIGGER trg_pipeline_vendors_updated_at
  BEFORE UPDATE ON public.pipeline_vendors
  FOR EACH ROW EXECUTE FUNCTION update_pipeline_vendors_updated_at();


-- ---------------------------------------------------------------------------
-- PIPELINE_VENDOR_SCORES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_vendor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.pipeline_vendors(id) ON DELETE CASCADE,

  dimension INTEGER NOT NULL,
  dimension_name VARCHAR(100) NOT NULL,
  weight INTEGER NOT NULL,

  raw_score INTEGER CHECK (raw_score IS NULL OR (raw_score >= 1 AND raw_score <= 5)),
  weighted_score INTEGER GENERATED ALWAYS AS (raw_score * weight) STORED,

  scored_by VARCHAR(50) NOT NULL,
  scored_at TIMESTAMPTZ DEFAULT NOW(),

  evidence TEXT,
  data_sources TEXT[],

  CONSTRAINT unique_pipeline_vendor_dimension UNIQUE(vendor_id, dimension),
  CONSTRAINT pipeline_vendor_scores_dimension_check CHECK (dimension BETWEEN 1 AND 8),
  CONSTRAINT pipeline_vendor_scores_scored_by_check CHECK (scored_by IN ('cowork', 'kody', 'leah'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_vendor_scores_vendor
  ON public.pipeline_vendor_scores(vendor_id);


-- ---------------------------------------------------------------------------
-- COWORK_TASKS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cowork_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_type VARCHAR(100) NOT NULL,
  vendor_id UUID REFERENCES public.pipeline_vendors(id) ON DELETE SET NULL,

  status VARCHAR(50) NOT NULL DEFAULT 'pending',

  input_payload JSONB DEFAULT '{}'::jsonb,
  output_payload JSONB DEFAULT '{}'::jsonb,
  output_files TEXT[],

  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  is_recurring BOOLEAN DEFAULT FALSE,
  cron_expression VARCHAR(100),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  CONSTRAINT cowork_tasks_type_check CHECK (task_type IN (
    'prospect_scan', 'auto_score', 'generate_brief', 'draft_email',
    'ingest_feed', 'normalize_data', 'image_audit', 'feed_sync', 'rescore'
  )),
  CONSTRAINT cowork_tasks_status_check CHECK (status IN (
    'pending', 'picked_up', 'running', 'completed', 'failed', 'cancelled'
  ))
);

CREATE INDEX IF NOT EXISTS idx_cowork_tasks_status ON public.cowork_tasks(status);
CREATE INDEX IF NOT EXISTS idx_cowork_tasks_vendor ON public.cowork_tasks(vendor_id);
CREATE INDEX IF NOT EXISTS idx_cowork_tasks_type ON public.cowork_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_cowork_tasks_pending
  ON public.cowork_tasks(status, created_at) WHERE status = 'pending';


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Admins (role.domain = 'admin' via user_roles) manage everything.
-- Cowork uses the service_role key which bypasses RLS by design.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pipeline_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_vendor_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cowork_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage pipeline vendors" ON public.pipeline_vendors;
CREATE POLICY "Admins can manage pipeline vendors"
  ON public.pipeline_vendors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage pipeline vendor scores" ON public.pipeline_vendor_scores;
CREATE POLICY "Admins can manage pipeline vendor scores"
  ON public.pipeline_vendor_scores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage cowork tasks" ON public.cowork_tasks;
CREATE POLICY "Admins can manage cowork tasks"
  ON public.cowork_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );


COMMENT ON TABLE public.pipeline_vendors IS
  'Furniture manufacturers tracked through the discovery → live partnership pipeline. Distinct from the catalog-side public.vendors table.';
COMMENT ON TABLE public.pipeline_vendor_scores IS
  '8-dimension qualification rubric scores per pipeline vendor. Each row = one dimension.';
COMMENT ON TABLE public.cowork_tasks IS
  'Task queue shared with Claude Cowork. Portal writes requests; Cowork picks up via service_role.';
