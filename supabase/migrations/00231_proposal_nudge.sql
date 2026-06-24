-- ═══════════════════════════════════════════════════════════════════════════
-- 00231 — proposal nudge (R71 / Phase 3): a gentle "remind the client" act
-- ═══════════════════════════════════════════════════════════════════════════
-- Once a proposal is in the client's hands (sent/viewed), the designer's only
-- act besides Revise is to nudge. This is a SEPARATE, lightweight reminder — it
-- must NOT reuse send_proposal (which re-stamps sent_at AND supersedes sibling
-- versions). It only stamps an engagement timestamp + bumps a count, exactly
-- like chase_invoice (00209) does for overdue receivables.
--
-- Additive only (D7): two nullable/defaulted columns + one SECURITY DEFINER RPC.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.proposals.last_nudged_at IS
  'R71: when the designer last sent the client a gentle reminder about this '
  'proposal. Gates the Nudge act''s cooldown; never touches status/sent_at.';
COMMENT ON COLUMN public.proposals.nudge_count IS
  'R71: how many reminders the designer has sent for this proposal.';

-- nudge_proposal: stamp last_nudged_at = now() + bump nudge_count for a proposal
-- the caller owns and that is still in the client's hands. SECURITY DEFINER with
-- an explicit ownership guard (designer_id = auth.uid()) so the stamp lands even
-- though a sent/viewed proposal is otherwise update-locked by RLS. Returns the
-- new timestamp; raises on a wrong-state or too-soon nudge (the JS gates both,
-- but this RPC is reachable on its own).
CREATE OR REPLACE FUNCTION public.nudge_proposal(p_proposal_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp  TIMESTAMPTZ := now();
  v_owner  UUID;
  v_status TEXT;
  v_last   TIMESTAMPTZ;
BEGIN
  SELECT designer_id, status, last_nudged_at
    INTO v_owner, v_status, v_last
    FROM public.proposals WHERE id = p_proposal_id;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN NULL;  -- not the caller's proposal (or it doesn't exist): no-op
  END IF;

  -- A nudge only makes sense while the proposal is in the client's hands.
  IF v_status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'nudge_proposal: proposal % is "%" — only sent/viewed proposals can be nudged', p_proposal_id, v_status;
  END IF;

  -- Cooldown: at most one nudge per 3 days — a reminder, never a pester. Keep
  -- in lockstep with NUDGE_COOLDOWN_DAYS in proposal-watch-derivation.ts.
  IF v_last IS NOT NULL AND v_last > v_stamp - interval '3 days' THEN
    RAISE EXCEPTION 'nudge_proposal: proposal % was nudged on % — wait before nudging again', p_proposal_id, v_last;
  END IF;

  UPDATE public.proposals
     SET last_nudged_at = v_stamp,
         nudge_count    = nudge_count + 1
   WHERE id = p_proposal_id;

  RETURN v_stamp;
END;
$$;

COMMENT ON FUNCTION public.nudge_proposal(UUID) IS
  'R71: stamp last_nudged_at + bump nudge_count for a sent/viewed proposal the '
  'caller owns (the gentle "remind the client" act). Does NOT re-send, re-stamp '
  'sent_at, or supersede siblings; the email is dispatched separately by the '
  'proposal-nudge edge function. 3-day cooldown enforced server-side.';

REVOKE ALL ON FUNCTION public.nudge_proposal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nudge_proposal(UUID) TO authenticated;
