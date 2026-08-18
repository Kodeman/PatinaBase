-- ═══════════════════════════════════════════════════════════════════════════
-- 00485 — Bind the caller in the proposal-mood-boards SELECT policy
--
-- THE BUG. 00438 flipped the bucket private (`UPDATE storage.buckets SET
-- public = false WHERE id = 'proposal-mood-boards'`) and, in the same file,
-- re-created the read policy as:
--
--   CREATE POLICY proposal_mood_boards_proposal_read
--   ON storage.objects FOR SELECT TO PUBLIC
--   USING (
--     bucket_id = 'proposal-mood-boards'
--     AND EXISTS (SELECT 1 FROM public.proposals proposal
--                 WHERE proposal.id::text = (storage.foldername(name))[1])
--   );
--
-- That predicate proves the PROPOSAL EXISTS. It never asks who is calling.
-- Compare it to its three siblings created three statements later in the same
-- migration — proposal_mood_boards_proposal_{insert,update,delete} — each of
-- which carries `AND public.is_design_studio_comember(proposal.designer_id)`.
-- The caller-binding conjunct is present on every write leg and absent from
-- the read leg.
--
-- WHAT THAT MEANT. On a private bucket RLS is the only gate: there is no
-- public object path, so nothing else stands between a request and the row.
-- `anon` holds USAGE on schema storage and SELECT on storage.objects, the
-- policy is PERMISSIVE and applies TO PUBLIC, and storage.objects carries no
-- RESTRICTIVE policy. A permissive policy that is true for everyone is
-- therefore a grant to everyone. Any caller — signed in or not — who knows or
-- guesses a proposal UUID could list and sign that proposal's mood-board
-- objects. Verified live on Strata: 5 objects across 3 of 33 proposals.
--
-- THE FIX. Keep the policy's shape, its name, and its proposal-prefix scope;
-- add the caller. Nothing about the bucket's posture changes: it stays
-- private, the four FF&E-era policy names survive (the 2026-08-12 Ruling 1
-- check in docs/ops/wave1-prod-reconciliation-plan.md §5.3 still passes), and
-- project-prefixed paths stay unreadable exactly as 00438 left them.
--
-- Both legs are copied from existing siblings rather than invented:
--
--   • designer / studio — `public.is_design_studio_comember(designer_id)`,
--     verbatim from proposal_mood_boards_proposal_{insert,update,delete}
--     (00438) on this same bucket. The helper (00399) admits the owning
--     designer and active, non-guest co-members of their studio.
--
--   • client — reference-scoped to the currently-active issued board, lifted
--     verbatim from can_read_board_storage_object's issued-proposal-media leg
--     (00462) via public.can_client_read_issued_board_media below. An issued
--     proposal's client may sign only an exact media reference on its ACTIVE
--     board (cover or explicit item), not any key under the proposal prefix.
--     The earlier `client_id = auth.uid() AND status IN (...)` leg was
--     prefix-wide and let a client reach the designer's archived/superseded/
--     never-projected imagery under the same folder (Kody's tightening ruling).
--     This leg is load-bearing, not defensive — useClientSafeProposalBundle
--     (packages/supabase/src/hooks/use-proposals.ts) and the iOS
--     ProposalsAPIClient both call createSignedUrls with the CLIENT'S OWN
--     session, so it must still admit the active issued board's media or every
--     mood board in the client portal and the iOS app goes blank.
--
--   • share holders — deliberately NO leg. Guest share surfaces are served
--     server-side by service_role, which is BYPASSRLS: apps/client-portal
--     /src/app/share/[token]/page.tsx resolves the token with
--     createServiceClient() and signs with signBoardMediaValue(admin, …), and
--     supabase/functions/spec-pdf does the same. Structurally a share is a
--     bearer token hashed into document_shares.token_hash; no JWT claim
--     carries it, so RLS cannot evaluate one. An EXISTS over document_shares
--     could only prove that SOME share exists for the proposal — which is the
--     exact defect this migration removes.
--
-- TO authenticated, not TO PUBLIC. Every leg needs auth.uid(), so anon would
-- evaluate to false anyway; naming the role stops the predicate from being
-- reached at all, and matches the three sibling policies on this bucket.
--
-- `storage.objects.name` is fully qualified per the 00430 rule ("qualify on
-- sight"). public.proposals has no `name` column, so the unqualified form
-- happened to resolve correctly here — but that is an accident of proposals'
-- column list, which is precisely how 00170 stayed broken for 260 migrations.
--
-- Policies only — no GRANT/REVOKE — so supabase/seed/00-legacy-grants.sql does
-- not need regenerating.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Client reference-scope helper (Kody's tightening ruling) ────────────────
-- The client leg is lifted verbatim from can_read_board_storage_object's
-- issued-proposal-media leg (00462): a client may sign only an EXACT media
-- reference on the immutable, currently-ACTIVE issued board — its cover or an
-- explicit item reference — never another key sharing the proposal prefix. The
-- prior leg admitted `client_id = auth.uid()` for ANY object under the
-- proposal's folder, so an issued-proposal client could sign the designer's
-- archived, superseded, or never-projected imagery under the same prefix.
--
-- Only this one leg is adopted. can_read_board_storage_object's project and
-- studio-template legs are deliberately NOT copied here — they read on paths the
-- 2026-08-12 Ruling 1 closed for this bucket.
--
-- SECURITY DEFINER, exactly as the source: proposal_boards / proposal_board_items
-- are studio-scoped (their SELECT policies name studio membership, not the
-- client), so an inline client-context subquery over them would see nothing and
-- blank every issued board in the client portal. The definer boundary is what
-- lets the reference check run with full visibility, just as it does inside
-- can_read_board_storage_object. 00483 strips PUBLIC EXECUTE from routines the
-- migration principal creates after it, so the GRANT to authenticated is
-- load-bearing, and PUBLIC stays unable to reach it.
CREATE OR REPLACE FUNCTION public.can_client_read_issued_board_media(
  p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.proposals AS proposal
    JOIN public.proposal_boards AS board ON board.proposal_id = proposal.id
    WHERE proposal.client_id = auth.uid()
      AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired')
      AND board.status = 'active'
      AND public.board_media_projection_is_allowed(board.id)
      AND (
        public.board_storage_reference_path(board.cover_image_url) = p_object_name
        OR EXISTS (
          SELECT 1
          FROM public.proposal_board_items AS item
          WHERE item.board_id = board.id
            AND (
              public.board_storage_reference_path(item.image_url) = p_object_name
              OR public.board_json_has_explicit_media_reference(
                item.data, p_object_name
              )
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_client_read_issued_board_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_client_read_issued_board_media(text)
  TO authenticated;

DROP POLICY IF EXISTS proposal_mood_boards_proposal_read ON storage.objects;
CREATE POLICY proposal_mood_boards_proposal_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'proposal-mood-boards'
  AND (
    -- The owning designer, or an active non-guest co-member of their studio
    -- (00438 write legs, 00399 helper). UNCHANGED: the studio owns everything
    -- under the proposal prefix, so this leg stays prefix-scoped.
    EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = (storage.foldername(storage.objects.name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
    -- The client the proposal was issued to — TIGHTENED to an exact reference on
    -- the currently-active issued board (see helper above), not the whole prefix.
    OR public.can_client_read_issued_board_media(storage.objects.name)
  )
);

-- Policy intent (kept as file documentation, not COMMENT ON POLICY):
-- storage.objects is owned by supabase_storage_admin, and COMMENT requires
-- ownership, so the ordinary migration principal cannot set it. Creating the
-- policy itself is permitted; only the comment is not. Per 00483's split, a
-- reserved-owner change belongs to the platform-admin phase, and a comment
-- carries no authorization weight, so it is recorded here instead.
--
--   Proposal-prefixed mood-board media is readable by the owning design
--   studio and by the proposal's client once it has been issued. Guest share
--   surfaces are served server-side by service_role (BYPASSRLS) and need no
--   leg here; before 00485 this policy proved only that the proposal existed
--   and therefore admitted every caller, anon included.
