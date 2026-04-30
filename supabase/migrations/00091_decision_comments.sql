-- Migration: 00091_decision_comments.sql
-- Inline questions/comments on decisions (PRD line 119: "Can ask questions inline").
-- Both designer and client can post; the thread is visible to both parties.

CREATE TABLE IF NOT EXISTS public.decision_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_comments_decision
  ON public.decision_comments(decision_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.touch_decision_comment_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_decision_comment_updated_at_trg ON public.decision_comments;
CREATE TRIGGER touch_decision_comment_updated_at_trg
BEFORE UPDATE ON public.decision_comments
FOR EACH ROW EXECUTE FUNCTION public.touch_decision_comment_updated_at();

ALTER TABLE public.decision_comments ENABLE ROW LEVEL SECURITY;

-- Designer (owner) can read all comments on their decisions.
CREATE POLICY decision_comments_designer_select
  ON public.decision_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.designer_id = auth.uid()
    )
  );

-- Client (recipient) can read comments on decisions addressed to them.
CREATE POLICY decision_comments_client_select
  ON public.decision_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id AND dc.client_id = auth.uid()
    )
  );

-- Either party can insert a comment as themselves on a decision they're party to.
CREATE POLICY decision_comments_insert
  ON public.decision_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = decision_id
        AND (dc.designer_id = auth.uid() OR dc.client_id = auth.uid())
    )
  );

-- Authors can edit their own comments.
CREATE POLICY decision_comments_update_own
  ON public.decision_comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Authors can delete their own comments.
CREATE POLICY decision_comments_delete_own
  ON public.decision_comments FOR DELETE
  USING (author_id = auth.uid());

COMMENT ON TABLE public.decision_comments IS
  'Inline thread on a client decision; designer and client can post Q&A before the decision is resolved.';
