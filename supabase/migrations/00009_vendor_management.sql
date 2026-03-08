-- ═══════════════════════════════════════════════════════════════════════════
-- VENDOR MANAGEMENT SCHEMA
-- Extends vendor functionality for designer trade accounts, reviews, and reputation
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE market_position AS ENUM ('entry', 'mid', 'premium', 'luxury', 'ultra-luxury');
CREATE TYPE production_model AS ENUM ('stock', 'mto', 'custom', 'mixed');
CREATE TYPE account_status AS ENUM ('none', 'pending', 'active');
CREATE TYPE ownership_type AS ENUM ('family', 'private', 'pe-backed', 'public');

-- ─── EXTEND VENDORS TABLE ────────────────────────────────────────────────────

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS market_position market_position DEFAULT 'mid',
    ADD COLUMN IF NOT EXISTS production_model production_model DEFAULT 'mixed',
    ADD COLUMN IF NOT EXISTS founded_year INTEGER CHECK (founded_year >= 1800 AND founded_year <= 2100),
    ADD COLUMN IF NOT EXISTS ownership ownership_type,
    ADD COLUMN IF NOT EXISTS headquarters_city TEXT,
    ADD COLUMN IF NOT EXISTS headquarters_state TEXT,
    ADD COLUMN IF NOT EXISTS parent_company_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS primary_category TEXT,
    ADD COLUMN IF NOT EXISTS secondary_categories TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS designer_rating_avg NUMERIC(2,1) DEFAULT 0 CHECK (designer_rating_avg >= 0 AND designer_rating_avg <= 5),
    ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lead_times JSONB DEFAULT '{}'; -- { quickShip, madeToOrder, custom }

CREATE INDEX IF NOT EXISTS idx_vendors_market_position ON vendors(market_position);
CREATE INDEX IF NOT EXISTS idx_vendors_primary_category ON vendors(primary_category);
CREATE INDEX IF NOT EXISTS idx_vendors_rating ON vendors(designer_rating_avg DESC);

-- ─── VENDOR TRADE PROGRAMS ───────────────────────────────────────────────────
-- Defines the trade tiers a vendor offers to designers

CREATE TABLE vendor_trade_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    tier_order INTEGER NOT NULL DEFAULT 0, -- For sorting tiers (lower = entry level)
    discount_percent NUMERIC(4,2) CHECK (discount_percent >= 0 AND discount_percent <= 100),
    discount_display TEXT, -- e.g., "40%" or "50/10" for compound discounts
    minimum_volume INTEGER DEFAULT 0, -- Annual volume required in cents
    minimum_requirements TEXT[] DEFAULT '{}',
    benefits TEXT[] DEFAULT '{}',
    application_url TEXT,
    contact_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, tier_name)
);

CREATE INDEX idx_vendor_trade_programs_vendor ON vendor_trade_programs(vendor_id);

-- ─── DESIGNER VENDOR ACCOUNTS ────────────────────────────────────────────────
-- Tracks the relationship between designers and their vendor trade accounts

CREATE TABLE designer_vendor_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designer_id UUID NOT NULL, -- References auth.users
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    account_status account_status NOT NULL DEFAULT 'none',
    current_tier_id UUID REFERENCES vendor_trade_programs(id) ON DELETE SET NULL,
    account_number TEXT,
    account_since TIMESTAMPTZ,
    ytd_volume INTEGER DEFAULT 0, -- In cents
    volume_to_next_tier INTEGER, -- In cents, null if at top tier
    next_tier_id UUID REFERENCES vendor_trade_programs(id) ON DELETE SET NULL,
    sales_rep_name TEXT,
    sales_rep_email TEXT,
    sales_rep_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(designer_id, vendor_id)
);

CREATE INDEX idx_designer_vendor_accounts_designer ON designer_vendor_accounts(designer_id);
CREATE INDEX idx_designer_vendor_accounts_vendor ON designer_vendor_accounts(vendor_id);
CREATE INDEX idx_designer_vendor_accounts_status ON designer_vendor_accounts(account_status);

-- ─── VENDOR REVIEWS ──────────────────────────────────────────────────────────
-- Designer reviews of vendors with multi-dimensional ratings

CREATE TABLE vendor_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    designer_id UUID NOT NULL, -- References auth.users
    rating_quality INTEGER NOT NULL CHECK (rating_quality >= 1 AND rating_quality <= 5),
    rating_finish INTEGER NOT NULL CHECK (rating_finish >= 1 AND rating_finish <= 5),
    rating_delivery INTEGER NOT NULL CHECK (rating_delivery >= 1 AND rating_delivery <= 5),
    rating_service INTEGER NOT NULL CHECK (rating_service >= 1 AND rating_service <= 5),
    rating_value INTEGER NOT NULL CHECK (rating_value >= 1 AND rating_value <= 5),
    overall_rating NUMERIC(2,1) GENERATED ALWAYS AS (
        (rating_quality + rating_finish + rating_delivery + rating_service + rating_value)::NUMERIC / 5
    ) STORED,
    written_review TEXT CHECK (char_length(written_review) <= 2000),
    lead_time_accuracy TEXT CHECK (lead_time_accuracy IN ('faster', 'as_expected', 'slower')),
    lead_time_weeks_over INTEGER CHECK (lead_time_weeks_over >= 0),
    verified_purchase BOOLEAN DEFAULT false,
    has_ordered_recently BOOLEAN NOT NULL DEFAULT false,
    vendor_response TEXT,
    vendor_response_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, designer_id) -- One review per designer per vendor (can be updated)
);

CREATE INDEX idx_vendor_reviews_vendor ON vendor_reviews(vendor_id);
CREATE INDEX idx_vendor_reviews_designer ON vendor_reviews(designer_id);
CREATE INDEX idx_vendor_reviews_rating ON vendor_reviews(overall_rating DESC);

-- ─── VENDOR SPECIALIZATIONS ──────────────────────────────────────────────────
-- Designer-validated areas of expertise for each vendor

CREATE TABLE vendor_specializations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- e.g., "Sofas", "Performance Fabric", "Dining Tables"
    rating NUMERIC(2,1) DEFAULT 5.0 CHECK (rating >= 1 AND rating <= 5),
    vote_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, category)
);

CREATE INDEX idx_vendor_specializations_vendor ON vendor_specializations(vendor_id);
CREATE INDEX idx_vendor_specializations_rating ON vendor_specializations(rating DESC, vote_count DESC);

-- ─── VENDOR SPECIALIZATION VOTES ─────────────────────────────────────────────
-- Tracks which designers have voted on specializations

CREATE TABLE vendor_specialization_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialization_id UUID NOT NULL REFERENCES vendor_specializations(id) ON DELETE CASCADE,
    designer_id UUID NOT NULL, -- References auth.users
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(specialization_id, designer_id)
);

CREATE INDEX idx_vendor_specialization_votes_spec ON vendor_specialization_votes(specialization_id);

-- ─── VENDOR CERTIFICATIONS ───────────────────────────────────────────────────
-- Third-party certifications held by vendors

CREATE TABLE vendor_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    certification_type TEXT NOT NULL, -- e.g., "fsc", "greenguard", "bcorp", "fairtrade"
    certification_level TEXT, -- e.g., "Gold", "Mix", "Platinum"
    is_verified BOOLEAN DEFAULT false,
    verification_url TEXT,
    expiration_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vendor_id, certification_type)
);

CREATE INDEX idx_vendor_certifications_vendor ON vendor_certifications(vendor_id);
CREATE INDEX idx_vendor_certifications_type ON vendor_certifications(certification_type);

-- ─── SAVED VENDORS ───────────────────────────────────────────────────────────
-- Designers can save/favorite vendors for quick access

CREATE TABLE saved_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designer_id UUID NOT NULL, -- References auth.users
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(designer_id, vendor_id)
);

CREATE INDEX idx_saved_vendors_designer ON saved_vendors(designer_id);
CREATE INDEX idx_saved_vendors_vendor ON saved_vendors(vendor_id);

-- ─── VENDOR BRANDS ───────────────────────────────────────────────────────────
-- Some vendors have multiple brands (e.g., parent company with sub-brands)

CREATE TABLE vendor_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL,
    brand_url TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_brands_vendor ON vendor_brands(vendor_id);

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────

-- Auto-update updated_at for new tables
CREATE TRIGGER update_vendor_trade_programs_updated_at
    BEFORE UPDATE ON vendor_trade_programs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_designer_vendor_accounts_updated_at
    BEFORE UPDATE ON designer_vendor_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendor_reviews_updated_at
    BEFORE UPDATE ON vendor_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendor_specializations_updated_at
    BEFORE UPDATE ON vendor_specializations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendor_certifications_updated_at
    BEFORE UPDATE ON vendor_certifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─── FUNCTIONS ───────────────────────────────────────────────────────────────

-- Function to update vendor rating averages after review changes
CREATE OR REPLACE FUNCTION update_vendor_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendors
    SET
        designer_rating_avg = (
            SELECT COALESCE(AVG(overall_rating), 0)
            FROM vendor_reviews
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        ),
        review_count = (
            SELECT COUNT(*)
            FROM vendor_reviews
            WHERE vendor_id = COALESCE(NEW.vendor_id, OLD.vendor_id)
        )
    WHERE id = COALESCE(NEW.vendor_id, OLD.vendor_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendor_stats_on_review
    AFTER INSERT OR UPDATE OR DELETE ON vendor_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_rating_stats();

-- Function to update specialization ratings after votes
CREATE OR REPLACE FUNCTION update_specialization_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vendor_specializations
    SET
        rating = (
            SELECT COALESCE(AVG(rating), 5.0)
            FROM vendor_specialization_votes
            WHERE specialization_id = COALESCE(NEW.specialization_id, OLD.specialization_id)
        ),
        vote_count = (
            SELECT COUNT(*)
            FROM vendor_specialization_votes
            WHERE specialization_id = COALESCE(NEW.specialization_id, OLD.specialization_id)
        )
    WHERE id = COALESCE(NEW.specialization_id, OLD.specialization_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_specialization_on_vote
    AFTER INSERT OR UPDATE OR DELETE ON vendor_specialization_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_specialization_rating();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE vendor_trade_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_vendor_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_specialization_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_brands ENABLE ROW LEVEL SECURITY;

-- Public read access for vendor data
CREATE POLICY "Public read access to vendor_trade_programs"
    ON vendor_trade_programs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Public read access to vendor_specializations"
    ON vendor_specializations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Public read access to vendor_certifications"
    ON vendor_certifications FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Public read access to vendor_brands"
    ON vendor_brands FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Public read access to vendor_reviews"
    ON vendor_reviews FOR SELECT
    TO authenticated
    USING (true);

-- Designer-specific access for their own data
CREATE POLICY "Designers can manage their vendor accounts"
    ON designer_vendor_accounts FOR ALL
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Designers can manage their saved vendors"
    ON saved_vendors FOR ALL
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Designers can manage their reviews"
    ON vendor_reviews FOR ALL
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Designers can manage their specialization votes"
    ON vendor_specialization_votes FOR ALL
    TO authenticated
    USING (designer_id = auth.uid())
    WITH CHECK (designer_id = auth.uid());

-- Admin write access for vendor management tables
CREATE POLICY "Admin write access to vendor_trade_programs"
    ON vendor_trade_programs FOR ALL
    TO authenticated
    USING (true); -- TODO: Restrict to admin role

CREATE POLICY "Admin write access to vendor_specializations"
    ON vendor_specializations FOR ALL
    TO authenticated
    USING (true); -- TODO: Restrict to admin role

CREATE POLICY "Admin write access to vendor_certifications"
    ON vendor_certifications FOR ALL
    TO authenticated
    USING (true); -- TODO: Restrict to admin role

CREATE POLICY "Admin write access to vendor_brands"
    ON vendor_brands FOR ALL
    TO authenticated
    USING (true); -- TODO: Restrict to admin role
