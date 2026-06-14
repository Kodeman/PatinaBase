-- 00208: Engine placement provenance (R38).
--
-- The Engine is a presence, not a place: it answers in ⌘K and the Library
-- librarian with paper result-lines, and the one act is "Place → [document]".
-- The ask itself does not persist (no thread, no history); what persists is the
-- ACT — a placed piece wears a quiet "via the Engine" mark in the document.
--
-- This is the faint, honest footprint R38 calls for. Additive and
-- non-destructive (R21/D7) — NULL is the ordinary path, unchanged for every
-- existing line. Mirrors the `source_decision_id` provenance pattern (00175).

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS added_via TEXT;

COMMENT ON COLUMN public.project_ffe_items.added_via IS
  'How this line entered the schedule. ''engine'' = placed via the Engine (R38, '
  '⌘K ask / the Library librarian); NULL = the ordinary path (proposal carry, '
  'decision feed-through, manual add).';
