-- ═══════════════════════════════════════════════════════════════════════════
-- 00547 — Fix the broken reference item in the "Furniture plan by zone" starter
-- (D10, board-paths audit 2026-08-31)
--
-- THE BUG. 00409 seeded four Patina starter board templates. Every `image`-type
-- placeholder item across all four ships with no `data.url` — that's
-- intentional (see 00409's own header: "No starter references a... bucket
-- object"), and `ImageTile` (board-item-renderer.tsx) renders a dashed
-- "Missing image" box for any image item with no URL, prompting the designer
-- to drop in their own reference. That's fine for the small, section-scoped
-- image slots (e.g. "Hero reference", "Textile").
--
-- The zoned-furniture-plan template's last item is different in kind, not
-- degree: at x:52 y:520 width:1296 height:310 it is a full board-width band —
-- the single largest surface on the template, spanning almost the entire
-- 1400×900 canvas — and unlike its own template siblings ("Gather" / "Pause" /
-- "Move through", all `note` items with real instructional copy and a
-- `section_id`) it carries no `section_id` and, being an `image` item,
-- `ImageTile` never renders its `data.name` ("Plan, elevation, or room
-- reference") at all — that field is silently unused by the renderer. The
-- result a fresh board from this template actually shows: the template's most
-- prominent surface is a bare dashed "Missing image" box with zero guidance,
-- which is what the audit's prod screenshot caught.
--
-- THE FIX. No seeded asset in this repo is an appropriate fit — every actual
-- image URL under supabase/seed/ is local dev/demo fixture data (picsum-style
-- URLs, `*.invalid` placeholders, or scoped to a dev user's own storage),
-- never something safe to hardcode into a PRODUCTION, migration-owned,
-- unauthenticated starter template that every studio on every environment
-- sees. Per the brief's second option, convert the item to a type that
-- renders meaningfully without external media: `note`, matching the exact
-- pattern its three siblings in this same template already use. Geometry
-- (x/y/width/height/z_index/rotation/locked) is preserved exactly so the
-- template's layout is otherwise unchanged.
--
-- MECHANISM. `board_templates.kind = 'seeded'` rows are guarded immutable by
-- `guard_board_template_immutability()` (00408) unless
-- `app.allow_patina_template_mutation = 'on'` — the migration-only escape
-- hatch that trigger exists for. The UPDATE's WHERE clause matches only the
-- OLD broken shape (`type = 'image'` with this item's name), so it is a
-- no-op on replay once applied — safe for both a fresh `db reset` (which
-- replays 00409's original insert and then this fix, in order) and Strata,
-- where 00409 has already shipped the broken row.
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL app.allow_patina_template_mutation = 'on';

UPDATE public.board_templates
SET items = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'type' = 'image'
        AND elem->'data'->>'name' = 'Plan, elevation, or room reference'
      THEN jsonb_build_object(
        'type', 'note',
        'x', elem->'x',
        'y', elem->'y',
        'width', elem->'width',
        'height', elem->'height',
        'z_index', elem->'z_index',
        'rotation', elem->'rotation',
        'locked', elem->'locked',
        'content',
          'Drop in a floor plan, elevation, or room reference here to anchor how these zones sit in the room.',
        'data', '{}'::jsonb
      )
      ELSE elem
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(board_templates.items) WITH ORDINALITY AS t(elem, ord)
)
WHERE template_key = 'patina.zoned-furniture-plan'
  AND items @> '[{"type":"image","data":{"name":"Plan, elevation, or room reference"}}]'::jsonb;
