-- Migration: 00100_proposal_client_sign_rls.sql
-- The "Clients can update proposal status" policy from migration 00014/00063
-- has only a USING clause, which Postgres also applies as the implicit
-- WITH CHECK predicate. That makes it impossible for a client to transition
-- a proposal out of sent/viewed → accepted/declined, since the new row
-- fails the same predicate.
--
-- Replace the policy so USING gates which rows the client can target
-- (their own, currently in sent/viewed) and WITH CHECK allows the new row
-- to land in accepted, declined, viewed (no draft/expired/sent self-transition).

DROP POLICY IF EXISTS "Clients can update proposal status" ON public.proposals;

CREATE POLICY "Clients can update proposal status"
  ON public.proposals FOR UPDATE
  USING (
    auth.uid() = client_id
    AND status IN ('sent', 'viewed')
  )
  WITH CHECK (
    auth.uid() = client_id
    AND status IN ('viewed', 'accepted', 'declined')
  );
