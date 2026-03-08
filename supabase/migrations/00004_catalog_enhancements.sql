-- ═══════════════════════════════════════════════════════════════════════════
-- CATALOG ENHANCEMENTS
-- Collections, tags, project sections, and project enhancements
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── COLLECTIONS ─────────────────────────────────────────────────────────────

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    is_public BOOLEAN DEFAULT false,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collections_created_by ON collections(created_by);
CREATE INDEX idx_collections_is_public ON collections(is_public);

CREATE TABLE collection_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(collection_id, product_id)
);

CREATE INDEX idx_collection_products_collection ON collection_products(collection_id);
CREATE INDEX idx_collection_products_product ON collection_products(product_id);

-- ─── TAGS ────────────────────────────────────────────────────────────────────

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B8FAD',
    is_system BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, created_by)
);

CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_created_by ON tags(created_by);

CREATE TABLE product_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, tag_id)
);

CREATE INDEX idx_product_tags_product ON product_tags(product_id);
CREATE INDEX idx_product_tags_tag ON product_tags(tag_id);

-- ─── PROJECT SECTIONS ────────────────────────────────────────────────────────

CREATE TABLE project_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_sections_project ON project_sections(project_id);

-- Add section reference to project_products
ALTER TABLE project_products
ADD COLUMN section_id UUID REFERENCES project_sections(id) ON DELETE SET NULL,
ADD COLUMN position INTEGER DEFAULT 0;

-- ─── PROJECT ENHANCEMENTS ────────────────────────────────────────────────────

ALTER TABLE projects
ADD COLUMN budget_min INTEGER,
ADD COLUMN budget_max INTEGER,
ADD COLUMN timeline_start DATE,
ADD COLUMN timeline_end DATE,
ADD COLUMN created_by UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
ADD COLUMN share_token TEXT UNIQUE;

-- Remove the default after adding the column
ALTER TABLE projects ALTER COLUMN created_by DROP DEFAULT;

CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_share_token ON projects(share_token);

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────

CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sections ENABLE ROW LEVEL SECURITY;

-- Collections: Users can read their own and public collections
CREATE POLICY "Users can read own collections"
    ON collections FOR SELECT
    TO authenticated
    USING (created_by = auth.uid() OR is_public = true);

CREATE POLICY "Users can insert own collections"
    ON collections FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own collections"
    ON collections FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own collections"
    ON collections FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- Collection products: Access based on collection access
CREATE POLICY "Users can read collection products"
    ON collection_products FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM collections
            WHERE collections.id = collection_products.collection_id
            AND (collections.created_by = auth.uid() OR collections.is_public = true)
        )
    );

CREATE POLICY "Users can manage own collection products"
    ON collection_products FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM collections
            WHERE collections.id = collection_products.collection_id
            AND collections.created_by = auth.uid()
        )
    );

-- Tags: Users can read all tags, manage their own
CREATE POLICY "Users can read all tags"
    ON tags FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert own tags"
    ON tags FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid() OR is_system = false);

CREATE POLICY "Users can update own tags"
    ON tags FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() AND is_system = false)
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own tags"
    ON tags FOR DELETE
    TO authenticated
    USING (created_by = auth.uid() AND is_system = false);

-- Product tags: Users can manage tags on their own products
CREATE POLICY "Users can read all product tags"
    ON product_tags FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can manage product tags on own products"
    ON product_tags FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM products
            WHERE products.id = product_tags.product_id
            AND products.captured_by = auth.uid()
        )
    );

-- Project sections: Access based on project access
CREATE POLICY "Users can read own project sections"
    ON project_sections FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_sections.project_id
            AND projects.created_by = auth.uid()
        )
    );

CREATE POLICY "Users can manage own project sections"
    ON project_sections FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_sections.project_id
            AND projects.created_by = auth.uid()
        )
    );
