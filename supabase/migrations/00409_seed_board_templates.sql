-- ══════════════════════════════════════════════════════════════════════════
-- 00409 — Four stable Patina mood-board starters
--
-- Migration-seeded (not config.toml seed data): these rows are production
-- product content. Stable `patina.*` natural keys and fixed UUIDs make replay
-- deterministic; ON CONFLICT DO NOTHING respects 00408's immutable seed rows.
-- No starter references a user, studio, proposal, project, product, capture,
-- palette, board, or bucket object.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO public.board_templates (
  id,
  template_key,
  name,
  description,
  kind,
  studio_id,
  canvas_width,
  canvas_height,
  background_color,
  sections,
  items,
  cover_url,
  created_by
)
VALUES
  (
    'ba000000-0000-4000-8000-000000000001',
    'patina.single-room-concept',
    'Single-room concept',
    'A quiet hero image, two supporting references, and the idea in words.',
    'seeded',
    NULL,
    1200,
    800,
    '#FAF8F5',
    '[
      {"id":"ba100000-0000-4000-8000-000000000001","name":"The feeling","color":"#E8DED0"},
      {"id":"ba100000-0000-4000-8000-000000000002","name":"The pieces","color":"#DDE4DC"}
    ]'::jsonb,
    '[
      {"type":"note","x":64,"y":64,"width":360,"height":150,"z_index":1,"rotation":0,"locked":false,"content":"Name the feeling of the room in one or two sentences.","data":{"section_id":"ba100000-0000-4000-8000-000000000001"}},
      {"type":"image","x":460,"y":64,"width":660,"height":420,"z_index":2,"rotation":0,"locked":false,"data":{"name":"Hero reference","section_id":"ba100000-0000-4000-8000-000000000001"}},
      {"type":"image","x":64,"y":530,"width":300,"height":206,"z_index":3,"rotation":-2,"locked":false,"data":{"name":"Material reference","section_id":"ba100000-0000-4000-8000-000000000002"}},
      {"type":"product","x":410,"y":530,"width":300,"height":206,"z_index":4,"rotation":1,"locked":false,"data":{"name":"Anchor piece","section_id":"ba100000-0000-4000-8000-000000000002"}},
      {"type":"product","x":756,"y":530,"width":300,"height":206,"z_index":5,"rotation":-1,"locked":false,"data":{"name":"Supporting piece","section_id":"ba100000-0000-4000-8000-000000000002"}}
    ]'::jsonb,
    NULL,
    NULL
  ),
  (
    'ba000000-0000-4000-8000-000000000002',
    'patina.palette-material-study',
    'Palette + materials study',
    'Build the room from color, grain, textile, stone, and metal.',
    'seeded',
    NULL,
    1200,
    900,
    '#F7F3EC',
    '[
      {"id":"ba200000-0000-4000-8000-000000000001","name":"Palette","color":"#E8DED0"},
      {"id":"ba200000-0000-4000-8000-000000000002","name":"Materials","color":"#D9E0D7"}
    ]'::jsonb,
    '[
      {"type":"palette","x":64,"y":64,"width":1072,"height":180,"z_index":1,"rotation":0,"locked":false,"data":{"name":"Room palette","swatches":[{"hex":"#DED3C4","name":"Foundation"},{"hex":"#8B7355","name":"Wood"},{"hex":"#4E655A","name":"Accent"},{"hex":"#C8A77B","name":"Warm metal"}],"section_id":"ba200000-0000-4000-8000-000000000001"}},
      {"type":"image","x":64,"y":314,"width":320,"height":250,"z_index":2,"rotation":-2,"locked":false,"data":{"name":"Textile","section_id":"ba200000-0000-4000-8000-000000000002"}},
      {"type":"image","x":440,"y":314,"width":320,"height":250,"z_index":3,"rotation":1,"locked":false,"data":{"name":"Stone or surface","section_id":"ba200000-0000-4000-8000-000000000002"}},
      {"type":"image","x":816,"y":314,"width":320,"height":250,"z_index":4,"rotation":-1,"locked":false,"data":{"name":"Wood or finish","section_id":"ba200000-0000-4000-8000-000000000002"}},
      {"type":"note","x":64,"y":630,"width":1072,"height":190,"z_index":5,"rotation":0,"locked":false,"content":"What repeats? What contrasts? Name the material rule that keeps the room coherent.","data":{"section_id":"ba200000-0000-4000-8000-000000000002"}}
    ]'::jsonb,
    NULL,
    NULL
  ),
  (
    'ba000000-0000-4000-8000-000000000003',
    'patina.zoned-furniture-plan',
    'Furniture plan by zone',
    'Group the selections by how the room is lived in, not by vendor.',
    'seeded',
    NULL,
    1400,
    900,
    '#FAF8F5',
    '[
      {"id":"ba300000-0000-4000-8000-000000000001","name":"Gather","color":"#E4D8CA"},
      {"id":"ba300000-0000-4000-8000-000000000002","name":"Pause","color":"#DCE3DA"},
      {"id":"ba300000-0000-4000-8000-000000000003","name":"Move through","color":"#DEDCE4"}
    ]'::jsonb,
    '[
      {"type":"note","x":52,"y":52,"width":400,"height":110,"z_index":1,"rotation":0,"locked":false,"content":"Gather","data":{"section_id":"ba300000-0000-4000-8000-000000000001"}},
      {"type":"product","x":52,"y":190,"width":300,"height":260,"z_index":2,"rotation":0,"locked":false,"data":{"name":"Primary seating","section_id":"ba300000-0000-4000-8000-000000000001"}},
      {"type":"product","x":382,"y":190,"width":300,"height":260,"z_index":3,"rotation":0,"locked":false,"data":{"name":"Conversation piece","section_id":"ba300000-0000-4000-8000-000000000001"}},
      {"type":"note","x":730,"y":52,"width":300,"height":110,"z_index":4,"rotation":0,"locked":false,"content":"Pause","data":{"section_id":"ba300000-0000-4000-8000-000000000002"}},
      {"type":"product","x":730,"y":190,"width":300,"height":260,"z_index":5,"rotation":0,"locked":false,"data":{"name":"Reading or retreat","section_id":"ba300000-0000-4000-8000-000000000002"}},
      {"type":"note","x":1062,"y":52,"width":286,"height":110,"z_index":6,"rotation":0,"locked":false,"content":"Move through","data":{"section_id":"ba300000-0000-4000-8000-000000000003"}},
      {"type":"product","x":1062,"y":190,"width":286,"height":260,"z_index":7,"rotation":0,"locked":false,"data":{"name":"Threshold or path piece","section_id":"ba300000-0000-4000-8000-000000000003"}},
      {"type":"image","x":52,"y":520,"width":1296,"height":310,"z_index":8,"rotation":0,"locked":false,"data":{"name":"Plan, elevation, or room reference"}}
    ]'::jsonb,
    NULL,
    NULL
  ),
  (
    'ba000000-0000-4000-8000-000000000004',
    'patina.before-after-story',
    'Before + after story',
    'Hold the existing condition beside the design promise and its proof.',
    'seeded',
    NULL,
    1400,
    900,
    '#F8F4ED',
    '[
      {"id":"ba400000-0000-4000-8000-000000000001","name":"Before","color":"#E5E0D8"},
      {"id":"ba400000-0000-4000-8000-000000000002","name":"After","color":"#D9E4DA"}
    ]'::jsonb,
    '[
      {"type":"note","x":52,"y":52,"width":620,"height":100,"z_index":1,"rotation":0,"locked":false,"content":"Before · what is not serving the room","data":{"section_id":"ba400000-0000-4000-8000-000000000001"}},
      {"type":"image","x":52,"y":180,"width":620,"height":440,"z_index":2,"rotation":0,"locked":false,"data":{"name":"Existing condition","section_id":"ba400000-0000-4000-8000-000000000001"}},
      {"type":"note","x":728,"y":52,"width":620,"height":100,"z_index":3,"rotation":0,"locked":false,"content":"After · the design promise","data":{"section_id":"ba400000-0000-4000-8000-000000000002"}},
      {"type":"image","x":728,"y":180,"width":620,"height":440,"z_index":4,"rotation":0,"locked":false,"data":{"name":"Direction or finished room","section_id":"ba400000-0000-4000-8000-000000000002"}},
      {"type":"product","x":728,"y":666,"width":280,"height":180,"z_index":5,"rotation":-1,"locked":false,"data":{"name":"Proof piece one","section_id":"ba400000-0000-4000-8000-000000000002"}},
      {"type":"product","x":1068,"y":666,"width":280,"height":180,"z_index":6,"rotation":1,"locked":false,"data":{"name":"Proof piece two","section_id":"ba400000-0000-4000-8000-000000000002"}},
      {"type":"note","x":52,"y":666,"width":620,"height":180,"z_index":7,"rotation":0,"locked":false,"content":"Name the change the client should feel first.","data":{"section_id":"ba400000-0000-4000-8000-000000000001"}}
    ]'::jsonb,
    NULL,
    NULL
  )
ON CONFLICT (template_key) DO NOTHING;
