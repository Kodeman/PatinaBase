-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA FOR DEVELOPMENT
-- ═══════════════════════════════════════════════════════════════════════════

-- Insert initial style taxonomy
INSERT INTO styles (name, description, visual_markers) VALUES
    ('Modern', 'Clean lines, minimal ornamentation, functional design', ARRAY['clean lines', 'minimal', 'functional']),
    ('Traditional', 'Classic design elements, ornate details, rich woods', ARRAY['ornate', 'classic', 'wood grain']),
    ('Transitional', 'Blend of traditional and contemporary elements', ARRAY['balanced', 'timeless']),
    ('Industrial', 'Raw materials, exposed elements, urban aesthetic', ARRAY['metal', 'exposed', 'raw']),
    ('Scandinavian', 'Light woods, minimalism, hygge comfort', ARRAY['light wood', 'minimal', 'cozy']),
    ('Bohemian', 'Eclectic mix, global influences, layered textures', ARRAY['eclectic', 'textured', 'colorful']),
    ('Coastal', 'Beach-inspired, light colors, natural materials', ARRAY['light', 'natural', 'breezy']),
    ('Farmhouse', 'Rustic charm, practical design, warm materials', ARRAY['rustic', 'warm', 'practical']);

-- Insert child styles
INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Mid-Century Modern', id, 'Post-war design movement, organic forms, iconic pieces', ARRAY['tapered legs', 'organic curves', 'teak']
FROM styles WHERE name = 'Modern';

INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Contemporary', id, 'Current trends, evolving aesthetics, innovative materials', ARRAY['current', 'innovative', 'fresh']
FROM styles WHERE name = 'Modern';

INSERT INTO styles (name, parent_id, description, visual_markers)
SELECT 'Danish Modern', id, 'Danish design principles, craftsmanship, functionality', ARRAY['danish', 'crafted', 'oak']
FROM styles WHERE name = 'Scandinavian';

-- Insert sample vendor
INSERT INTO vendors (name, website, trade_terms, notes) VALUES
    ('Sample Manufacturer', 'https://example.com', 'Net 30, 40% trade discount', 'Development seed data');

-- Insert sample project
INSERT INTO projects (name, status, notes) VALUES
    ('Sample Project', 'active', 'Development seed data - feel free to delete');
