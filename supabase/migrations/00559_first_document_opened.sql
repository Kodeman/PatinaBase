-- ═══════════════════════════════════════════════════════════════════════════
-- 00559 — first_document_opened_at: the checklist's sixth row (L3)
--
-- Studio Setup Checklist's new "Your first hire opened a document" row
-- (decisions.md 2026-09-03) needs a moment on organization_members that
-- fires when the hire — not the owner — actually opens a document, the
-- exact trigger VISION §2 names as the one defining the customer.
--
-- mark_first_document_opened() is SECURITY DEFINER (the caller has no
-- own-row UPDATE policy on organization_members — same chicken-and-egg
-- set_my_member_title (00416) solved) but writes only the calling user's
-- own active row, and only once (first_document_opened_at IS NULL guards
-- re-stamping on every subsequent document open).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS first_document_opened_at timestamptz;

COMMENT ON COLUMN public.organization_members.first_document_opened_at IS
  'Onboarding checklist row 6 ("Your first hire opened a document", 00559): stamped once, by mark_first_document_opened(), the first time this member opens a Document. NULL = not yet.';

CREATE OR REPLACE FUNCTION public.mark_first_document_opened()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.organization_members
     SET first_document_opened_at = now()
   WHERE user_id = auth.uid()
     AND status = 'active'
     AND first_document_opened_at IS NULL;
$$;

COMMENT ON FUNCTION public.mark_first_document_opened() IS
  'Stamps the calling user''s own active organization_members row with first_document_opened_at, once. SECURITY DEFINER because there is deliberately no own-row UPDATE policy on organization_members (mirrors set_my_member_title, 00416); the auth.uid() predicate is what keeps this to the caller''s own row.';

-- Prod auto-grants anon EXECUTE on newly created functions (see 00416, 00557
-- notes) — the REVOKE is load-bearing, not decorative.
REVOKE ALL ON FUNCTION public.mark_first_document_opened() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_first_document_opened() TO authenticated;
