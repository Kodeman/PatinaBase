-- ═══════════════════════════════════════════════════════════════════════════
-- SEED STYLE TAXONOMY
-- 12 style archetypes, 8 client archetypes, 16 appeal signals
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── STYLE ARCHETYPES ────────────────────────────────────────────────────────

INSERT INTO styles (name, is_archetype, description, visual_markers, display_order, color_hex) VALUES
('Warm Modern', true,
 'Contemporary design with organic warmth. Clean lines softened by natural materials and warm tones.',
 ARRAY['natural wood tones', 'curved forms', 'textured fabrics', 'warm metals like brass'],
 1, '#D4A574'),

('Soft Contemporary', true,
 'Modern aesthetics with softened edges and muted palette. Approachable and comfortable.',
 ARRAY['rounded corners', 'bouclé fabrics', 'neutral earth tones', 'subtle curves'],
 2, '#C9B8A8'),

('Mid-Century Modern', true,
 'Classic 1950s-60s design aesthetic. Iconic forms that have stood the test of time.',
 ARRAY['tapered legs', 'walnut and teak wood', 'bold accent colors', 'organic atomic shapes'],
 3, '#8B7355'),

('Scandinavian Minimal', true,
 'Nordic simplicity and functionality. Light, airy, and purposeful design.',
 ARRAY['light wood like oak and birch', 'white palette', 'clean lines', 'minimal ornamentation'],
 4, '#E8E4DE'),

('Modern Industrial', true,
 'Raw materials with urban edge. Celebrates the beauty of utilitarian elements.',
 ARRAY['exposed metal', 'reclaimed wood', 'concrete elements', 'utilitarian forms'],
 5, '#5C5C5C'),

('Traditional', true,
 'Classic elegance with timeless details. Rich materials and formal arrangements.',
 ARRAY['ornate carvings', 'rich velvet fabrics', 'dark mahogany woods', 'symmetrical arrangements'],
 6, '#6B4423'),

('Transitional', true,
 'Bridge between traditional and contemporary. Best of both worlds with comfortable scale.',
 ARRAY['simplified silhouettes', 'neutral palette', 'subtle traditional details', 'comfortable proportions'],
 7, '#9C8B7A'),

('Rustic', true,
 'Natural materials with handcrafted character. Embraces imperfection and organic beauty.',
 ARRAY['distressed finishes', 'natural textures', 'earthy brown tones', 'visible joinery'],
 8, '#8B6914'),

('Coastal', true,
 'Relaxed seaside-inspired aesthetic. Fresh, light, and breezy atmosphere.',
 ARRAY['blue-white palette', 'natural fibers like rattan', 'weathered wood', 'airy open feel'],
 9, '#87CEEB'),

('Bohemian', true,
 'Eclectic mix with global influences. Layered, collected, and personally expressive.',
 ARRAY['layered textiles', 'mixed patterns', 'warm jewel colors', 'collected vintage feel'],
 10, '#B8860B'),

('Maximalist', true,
 'Bold, layered, and more-is-more approach. Statement-making and unapologetic.',
 ARRAY['rich saturated colors', 'pattern mixing', 'statement furniture pieces', 'layered accessories'],
 11, '#8B0000'),

('Japandi', true,
 'Japanese-Scandinavian fusion. Wabi-sabi meets Nordic functionality.',
 ARRAY['muted earth tones', 'natural materials', 'functional beauty', 'wabi-sabi imperfections'],
 12, '#A0937D')
ON CONFLICT (name) DO UPDATE SET
  is_archetype = EXCLUDED.is_archetype,
  description = EXCLUDED.description,
  visual_markers = EXCLUDED.visual_markers,
  display_order = EXCLUDED.display_order,
  color_hex = EXCLUDED.color_hex;

-- ─── CLIENT ARCHETYPES ───────────────────────────────────────────────────────

INSERT INTO client_archetypes (name, description, typical_budget_range, visual_cues, display_order) VALUES
('Design Enthusiast',
 'Design-forward client who follows trends and appreciates curated spaces. Values aesthetics highly.',
 '{"min": 50000, "max": 150000, "currency": "USD"}',
 ARRAY['follows design publications', 'visits showrooms', 'has strong visual opinions'],
 1),

('Comfort Seeker',
 'Prioritizes livability and relaxation over aesthetics. Home should feel like a retreat.',
 '{"min": 30000, "max": 80000, "currency": "USD"}',
 ARRAY['values softness and comfort', 'prefers low-maintenance', 'family-oriented'],
 2),

('Luxury Collector',
 'Values investment pieces and high-end craftsmanship. Quality over quantity mindset.',
 '{"min": 150000, "max": 500000, "currency": "USD"}',
 ARRAY['appreciates provenance', 'buys fewer but better', 'heritage brands'],
 3),

('Practical Minimalist',
 'Wants clean, functional spaces without excess. Less is more philosophy.',
 '{"min": 40000, "max": 100000, "currency": "USD"}',
 ARRAY['dislikes clutter', 'values multi-function', 'prefers quality basics'],
 4),

('Young Professional',
 'Building first quality home, budget-conscious but taste-driven. Ready to invest in key pieces.',
 '{"min": 20000, "max": 60000, "currency": "USD"}',
 ARRAY['urban lifestyle', 'smaller spaces', 'mix of investment and affordable'],
 5),

('Family Focused',
 'Durability and functionality for active households. Design must work for real life.',
 '{"min": 40000, "max": 120000, "currency": "USD"}',
 ARRAY['kid-friendly materials', 'easy-clean fabrics', 'safety conscious'],
 6),

('Eclectic Creative',
 'Loves mixing styles and making bold choices. Home reflects personality and travels.',
 '{"min": 30000, "max": 90000, "currency": "USD"}',
 ARRAY['vintage hunting', 'global influences', 'unique one-of-a-kind pieces'],
 7),

('Heritage Traditionalist',
 'Values timeless pieces and classic design. Furniture should last generations.',
 '{"min": 60000, "max": 200000, "currency": "USD"}',
 ARRAY['appreciates craftsmanship', 'traditional forms', 'family heirlooms'],
 8)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  typical_budget_range = EXCLUDED.typical_budget_range,
  visual_cues = EXCLUDED.visual_cues,
  display_order = EXCLUDED.display_order;

-- ─── APPEAL SIGNALS ──────────────────────────────────────────────────────────

-- Visual category
INSERT INTO appeal_signals (name, category, description) VALUES
('Statement Silhouette', 'visual',
 'Eye-catching form that anchors a space. The piece commands attention through its shape.'),
('Subtle Elegance', 'visual',
 'Refined beauty that reveals itself over time. Understated sophistication.'),
('Textural Interest', 'visual',
 'Rich surface qualities and tactile appeal. Invites touch and adds depth.'),
('Color Impact', 'visual',
 'Bold or unique color that draws attention. Makes a statement through hue.')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Functional category
INSERT INTO appeal_signals (name, category, description) VALUES
('Multi-functional', 'functional',
 'Serves multiple purposes or adapts to needs. Maximizes utility per square foot.'),
('Space-Efficient', 'functional',
 'Maximizes utility in limited space. Perfect for smaller homes or apartments.'),
('Easy Care', 'functional',
 'Low maintenance materials and construction. Designed for real life.'),
('Comfort-First', 'functional',
 'Prioritizes physical comfort and ergonomics. Designed for extended use.')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Emotional category
INSERT INTO appeal_signals (name, category, description) VALUES
('Nostalgic', 'emotional',
 'Evokes memories or vintage charm. Creates emotional connection through familiar forms.'),
('Calming', 'emotional',
 'Creates sense of peace and relaxation. Reduces visual noise and stress.'),
('Energizing', 'emotional',
 'Adds vitality and dynamism to space. Brings life and movement.'),
('Grounding', 'emotional',
 'Provides stability and warmth. Creates a sense of rootedness and security.')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Lifestyle category
INSERT INTO appeal_signals (name, category, description) VALUES
('Entertainer-Ready', 'lifestyle',
 'Ideal for hosting and social gatherings. Facilitates conversation and connection.'),
('Work-From-Home', 'lifestyle',
 'Supports home office or creative work. Functional for productive environments.'),
('Wellness-Oriented', 'lifestyle',
 'Supports healthy living and self-care. Promotes physical and mental wellbeing.'),
('Pet-Friendly', 'lifestyle',
 'Durable and suitable for pet households. Designed to coexist with furry friends.')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;
