-- ═══════════════════════════════════════════════════════════════════════════
-- PATINA DATABASE SCHEMA
-- Initial migration - Core tables for product catalog and teaching system
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable vector extension for future ML features
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── VENDORS ───────────────────────────────────────────────────────────────

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    website TEXT,
    trade_terms TEXT,
    contact_info JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_name ON vendors(name);

-- ─── PRODUCTS ──────────────────────────────────────────────────────────────

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_retail INTEGER, -- Stored in cents
    price_trade INTEGER,  -- Stored in cents
    dimensions JSONB,     -- { width, height, depth, unit }
    materials TEXT[] DEFAULT '{}',
    source_url TEXT NOT NULL,
    images TEXT[] DEFAULT '{}',
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    captured_by UUID NOT NULL, -- Will reference auth.users
    captured_at TIMESTAMPTZ NOT NULL,
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    embedding vector(1536), -- For future ML similarity search
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_captured_at ON products(captured_at DESC);
CREATE INDEX idx_products_embedding ON products USING ivfflat (embedding vector_cosine_ops);

-- ─── STYLES ────────────────────────────────────────────────────────────────

CREATE TABLE styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES styles(id) ON DELETE SET NULL,
    description TEXT,
    visual_markers TEXT[] DEFAULT '{}',
    embedding vector(1536), -- For style similarity
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_styles_name ON styles(name);
CREATE INDEX idx_styles_parent ON styles(parent_id);

-- ─── PRODUCT-STYLE RELATIONSHIPS ───────────────────────────────────────────

CREATE TABLE product_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    style_id UUID NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    assigned_by UUID NOT NULL, -- Will reference auth.users
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, style_id)
);

CREATE INDEX idx_product_styles_product ON product_styles(product_id);
CREATE INDEX idx_product_styles_style ON product_styles(style_id);

-- ─── PRODUCT RELATIONS ─────────────────────────────────────────────────────

CREATE TYPE relation_type AS ENUM ('pairs_with', 'alternative', 'never_with');

CREATE TABLE product_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_a_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_b_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    relation_type relation_type NOT NULL,
    notes TEXT,
    assigned_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_a_id, product_b_id, relation_type),
    CHECK (product_a_id != product_b_id)
);

CREATE INDEX idx_product_relations_a ON product_relations(product_a_id);
CREATE INDEX idx_product_relations_b ON product_relations(product_b_id);

-- ─── PROJECTS ──────────────────────────────────────────────────────────────

CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    client_profile_id UUID, -- Will reference client_profiles
    status project_status DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON projects(status);

-- ─── PROJECT-PRODUCT RELATIONSHIPS ─────────────────────────────────────────

CREATE TABLE project_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    notes TEXT,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, product_id)
);

CREATE INDEX idx_project_products_project ON project_products(project_id);
CREATE INDEX idx_project_products_product ON project_products(product_id);

-- ─── CLIENT PROFILES ───────────────────────────────────────────────────────

CREATE TABLE client_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    archetype TEXT,
    budget_range JSONB, -- { min, max, currency }
    style_preferences UUID[] DEFAULT '{}', -- Array of style IDs
    quiz_responses JSONB,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key from projects to client_profiles
ALTER TABLE projects
ADD CONSTRAINT fk_projects_client_profile
FOREIGN KEY (client_profile_id) REFERENCES client_profiles(id) ON DELETE SET NULL;

-- ─── QUIZ SESSIONS ─────────────────────────────────────────────────────────

CREATE TABLE quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- Nullable for anonymous users
    responses JSONB DEFAULT '[]',
    computed_profile JSONB,
    completed_at TIMESTAMPTZ,
    conversion_event TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_sessions_user ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_completed ON quiz_sessions(completed_at);

-- ─── UPDATED_AT TRIGGER ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_styles_updated_at
    BEFORE UPDATE ON styles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_client_profiles_updated_at
    BEFORE UPDATE ON client_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- For development: Allow all authenticated users full access
-- TODO: Implement proper role-based policies before production

CREATE POLICY "Allow authenticated access to vendors"
    ON vendors FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to products"
    ON products FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to styles"
    ON styles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to product_styles"
    ON product_styles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to product_relations"
    ON product_relations FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to projects"
    ON projects FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to project_products"
    ON project_products FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated access to client_profiles"
    ON client_profiles FOR ALL
    TO authenticated
    USING (true);

CREATE POLICY "Allow all access to quiz_sessions"
    ON quiz_sessions FOR ALL
    TO anon, authenticated
    USING (true);
