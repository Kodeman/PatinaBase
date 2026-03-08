-- ═══════════════════════════════════════════════════════════════════════════
-- TEACHING WORKFLOW SCHEMA
-- Style spectrum, client archetypes, appeal signals, teaching queue, validation
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── STYLE ENHANCEMENTS ──────────────────────────────────────────────────────

-- Add archetype-specific fields to styles table
ALTER TABLE styles
ADD COLUMN is_archetype BOOLEAN DEFAULT false,
ADD COLUMN display_order INTEGER,
ADD COLUMN color_hex TEXT,
ADD COLUMN icon_name TEXT;

-- Add source tracking to product_styles
ALTER TABLE product_styles
ADD COLUMN is_primary BOOLEAN DEFAULT false,
ADD COLUMN source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ml_predicted', 'validated'));

-- ─── STYLE SPECTRUM ──────────────────────────────────────────────────────────

CREATE TABLE product_style_spectrum (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warmth REAL CHECK (warmth >= -1 AND warmth <= 1),
    complexity REAL CHECK (complexity >= -1 AND complexity <= 1),
    formality REAL CHECK (formality >= -1 AND formality <= 1),
    timelessness REAL CHECK (timelessness >= -1 AND timelessness <= 1),
    boldness REAL CHECK (boldness >= -1 AND boldness <= 1),
    craftsmanship REAL CHECK (craftsmanship >= -1 AND craftsmanship <= 1),
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id)
);

CREATE INDEX idx_product_style_spectrum_product ON product_style_spectrum(product_id);

-- Calibration reference products for each spectrum dimension
CREATE TABLE spectrum_calibration_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spectrum_dimension TEXT NOT NULL CHECK (spectrum_dimension IN
        ('warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship')),
    position REAL NOT NULL CHECK (position >= -1 AND position <= 1),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(spectrum_dimension, position, product_id)
);

CREATE INDEX idx_spectrum_calibration_dimension ON spectrum_calibration_products(spectrum_dimension);

-- ─── CLIENT ARCHETYPES ───────────────────────────────────────────────────────

CREATE TABLE client_archetypes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    visual_cues TEXT[] DEFAULT '{}',
    typical_budget_range JSONB,
    display_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_archetypes_name ON client_archetypes(name);

-- ─── APPEAL SIGNALS ──────────────────────────────────────────────────────────

CREATE TYPE appeal_category AS ENUM ('visual', 'functional', 'emotional', 'lifestyle');

CREATE TABLE appeal_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category appeal_category NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appeal_signals_category ON appeal_signals(category);

-- Product-Appeal Signal relationships
CREATE TABLE product_appeal_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    appeal_signal_id UUID NOT NULL REFERENCES appeal_signals(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, appeal_signal_id)
);

CREATE INDEX idx_product_appeal_signals_product ON product_appeal_signals(product_id);
CREATE INDEX idx_product_appeal_signals_signal ON product_appeal_signals(appeal_signal_id);

-- ─── PRODUCT-CLIENT MATCHING ─────────────────────────────────────────────────

CREATE TABLE product_client_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    archetype_id UUID NOT NULL REFERENCES client_archetypes(id) ON DELETE CASCADE,
    match_strength REAL DEFAULT 1.0 CHECK (match_strength >= 0 AND match_strength <= 1),
    is_avoidance BOOLEAN DEFAULT false,
    notes TEXT,
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, archetype_id)
);

CREATE INDEX idx_product_client_matches_product ON product_client_matches(product_id);
CREATE INDEX idx_product_client_matches_archetype ON product_client_matches(archetype_id);
CREATE INDEX idx_product_client_matches_avoidance ON product_client_matches(is_avoidance);

-- ─── MATERIAL COMPATIBILITY ──────────────────────────────────────────────────

CREATE TABLE material_compatibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_a TEXT NOT NULL,
    material_b TEXT NOT NULL,
    compatibility TEXT CHECK (compatibility IN ('excellent', 'good', 'caution', 'avoid')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(material_a, material_b)
);

CREATE INDEX idx_material_compatibility_a ON material_compatibility(material_a);
CREATE INDEX idx_material_compatibility_b ON material_compatibility(material_b);

-- ─── TEACHING SESSIONS ───────────────────────────────────────────────────────

CREATE TYPE teaching_mode AS ENUM ('embedded', 'quick_tags', 'deep_analysis', 'validation');

CREATE TABLE teaching_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designer_id UUID NOT NULL,
    mode teaching_mode NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    products_taught INTEGER DEFAULT 0,
    duration_seconds INTEGER
);

CREATE INDEX idx_teaching_sessions_designer ON teaching_sessions(designer_id);
CREATE INDEX idx_teaching_sessions_mode ON teaching_sessions(mode);

-- ─── TEACHING QUEUE ──────────────────────────────────────────────────────────

CREATE TYPE teaching_priority AS ENUM ('high', 'normal', 'low');
CREATE TYPE teaching_status AS ENUM ('pending', 'in_progress', 'needs_validation', 'validated', 'conflict');

CREATE TABLE teaching_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    priority teaching_priority DEFAULT 'normal',
    status teaching_status DEFAULT 'pending',
    assigned_to UUID,
    assigned_at TIMESTAMPTZ,
    requires_deep_analysis BOOLEAN DEFAULT false,
    completeness_score INTEGER DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id)
);

CREATE INDEX idx_teaching_queue_status ON teaching_queue(status);
CREATE INDEX idx_teaching_queue_priority ON teaching_queue(priority);
CREATE INDEX idx_teaching_queue_assigned ON teaching_queue(assigned_to);

-- ─── VALIDATION ──────────────────────────────────────────────────────────────

CREATE TYPE validation_vote AS ENUM ('confirm', 'adjust', 'flag');

CREATE TABLE teaching_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    validator_id UUID NOT NULL,
    vote validation_vote NOT NULL,
    adjustments JSONB,
    flag_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, validator_id)
);

CREATE INDEX idx_teaching_validations_product ON teaching_validations(product_id);
CREATE INDEX idx_teaching_validations_validator ON teaching_validations(validator_id);
CREATE INDEX idx_teaching_validations_vote ON teaching_validations(vote);

-- ─── DESIGNER STATS ──────────────────────────────────────────────────────────

CREATE TABLE designer_teaching_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designer_id UUID NOT NULL UNIQUE,
    products_taught INTEGER DEFAULT 0,
    validations_completed INTEGER DEFAULT 0,
    accuracy_score REAL DEFAULT 0.0 CHECK (accuracy_score >= 0 AND accuracy_score <= 1),
    consensus_rate REAL DEFAULT 0.0 CHECK (consensus_rate >= 0 AND consensus_rate <= 1),
    total_teaching_minutes INTEGER DEFAULT 0,
    badges JSONB DEFAULT '[]',
    match_impact_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_designer_teaching_stats_designer ON designer_teaching_stats(designer_id);

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────

CREATE TRIGGER update_product_style_spectrum_updated_at
    BEFORE UPDATE ON product_style_spectrum
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_teaching_queue_updated_at
    BEFORE UPDATE ON teaching_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_designer_teaching_stats_updated_at
    BEFORE UPDATE ON designer_teaching_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─── AUTO-ADD TO TEACHING QUEUE ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION add_product_to_teaching_queue()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO teaching_queue (product_id, status, priority)
    VALUES (NEW.id, 'pending', 'normal')
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_add_to_teaching_queue
    AFTER INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION add_product_to_teaching_queue();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE product_style_spectrum ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectrum_calibration_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeal_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_appeal_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_client_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_teaching_stats ENABLE ROW LEVEL SECURITY;

-- Product style spectrum: Read all, manage own
CREATE POLICY "Users can read all product style spectrum"
    ON product_style_spectrum FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own product style spectrum"
    ON product_style_spectrum FOR INSERT
    TO authenticated
    WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Users can update own product style spectrum"
    ON product_style_spectrum FOR UPDATE
    TO authenticated
    USING (assigned_by = auth.uid())
    WITH CHECK (assigned_by = auth.uid());

-- Spectrum calibration: Read all (system managed)
CREATE POLICY "Anyone can read spectrum calibration"
    ON spectrum_calibration_products FOR SELECT
    TO authenticated, anon
    USING (true);

-- Client archetypes: Read all (system data)
CREATE POLICY "Anyone can read client archetypes"
    ON client_archetypes FOR SELECT
    TO authenticated, anon
    USING (true);

-- Appeal signals: Read all (system data)
CREATE POLICY "Anyone can read appeal signals"
    ON appeal_signals FOR SELECT
    TO authenticated, anon
    USING (true);

-- Product appeal signals: Read all, manage own
CREATE POLICY "Users can read all product appeal signals"
    ON product_appeal_signals FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own product appeal signals"
    ON product_appeal_signals FOR INSERT
    TO authenticated
    WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Users can delete own product appeal signals"
    ON product_appeal_signals FOR DELETE
    TO authenticated
    USING (assigned_by = auth.uid());

-- Product client matches: Read all, manage own
CREATE POLICY "Users can read all product client matches"
    ON product_client_matches FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own product client matches"
    ON product_client_matches FOR INSERT
    TO authenticated
    WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Users can update own product client matches"
    ON product_client_matches FOR UPDATE
    TO authenticated
    USING (assigned_by = auth.uid())
    WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Users can delete own product client matches"
    ON product_client_matches FOR DELETE
    TO authenticated
    USING (assigned_by = auth.uid());

-- Material compatibility: Read all (system data)
CREATE POLICY "Anyone can read material compatibility"
    ON material_compatibility FOR SELECT
    TO authenticated, anon
    USING (true);

-- Teaching sessions: Users can read and manage their own
CREATE POLICY "Users can read own teaching sessions"
    ON teaching_sessions FOR SELECT
    TO authenticated
    USING (designer_id = auth.uid());

CREATE POLICY "Users can insert own teaching sessions"
    ON teaching_sessions FOR INSERT
    TO authenticated
    WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Users can update own teaching sessions"
    ON teaching_sessions FOR UPDATE
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());

-- Teaching queue: Read all, claim/release items
CREATE POLICY "Users can read teaching queue"
    ON teaching_queue FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can claim teaching queue items"
    ON teaching_queue FOR UPDATE
    TO authenticated
    USING (assigned_to IS NULL OR assigned_to = auth.uid())
    WITH CHECK (assigned_to IS NULL OR assigned_to = auth.uid());

-- Teaching validations: Read all, submit own
CREATE POLICY "Users can read teaching validations"
    ON teaching_validations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own teaching validations"
    ON teaching_validations FOR INSERT
    TO authenticated
    WITH CHECK (validator_id = auth.uid());

CREATE POLICY "Users can update own teaching validations"
    ON teaching_validations FOR UPDATE
    TO authenticated
    USING (validator_id = auth.uid())
    WITH CHECK (validator_id = auth.uid());

-- Designer teaching stats: Users can read all (for leaderboards), manage own
CREATE POLICY "Users can read all designer teaching stats"
    ON designer_teaching_stats FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own designer teaching stats"
    ON designer_teaching_stats FOR INSERT
    TO authenticated
    WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Users can update own designer teaching stats"
    ON designer_teaching_stats FOR UPDATE
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());
