-- ═══════════════════════════════════════════════════════════════════════════
-- 00558 — Feedback bug reports → GitHub issues
--
-- The Tester Notes widget (a flag-gated `tester-notes` doorway that rides every
-- designer-portal route) lets a tester mark a note as a BUG. A bug is not just
-- a note: it should land in the tracker the same minute it is written, with the
-- screen, route, viewport, app version, user agent, and the captured screenshot
-- attached — so the builder never has to ask "where were you and what browser".
--
-- Shape (mirrors 00259's waitlist→edge template):
--   · five additive columns on public.feedback (report_kind + the GitHub
--     writeback fields + the user agent),
--   · an AFTER INSERT trigger, filtered WHEN (NEW.report_kind = 'bug'), that
--     hands the row to the `feedback-github-issue` edge function through
--     public.invoke_edge_function (00258, Vault-backed settings),
--   · the INSERT policy re-cut so a client can never pre-seed the GitHub
--     writeback fields.
--
-- Why the writeback fields are service-role-only: 00255 grants authenticated
-- INSERT + SELECT and NO update policy at all, so the only way a github_* value
-- can be written is the service-role edge function. The tightened WITH CHECK
-- closes the remaining hole — an author inserting a row that already claims an
-- issue number, which would make the function's idempotency guard skip it.
--
-- The notification never blocks the note: any failure inside the trigger is
-- caught and warned, exactly as 00259 does. A tester's note is the point; the
-- issue is the convenience.
--
-- Who can file: the PostHog flag `tester-notes` gates the WIDGET only. INSERT on
-- public.feedback is open to every authenticated user (00255), so any signed-in
-- account can write a row with report_kind='bug' and trip this trigger. The
-- per-author rate limit below (20 bug rows an hour) is therefore the abuse
-- bound, not the flag. A tester allowlist — a role, a table, or a claim checked
-- here — is a follow-up decision for Kody, deliberately not taken in this
-- migration.
--
-- Additive only: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Columns ─────────────────────────────────────────────────────────────────
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS report_kind TEXT NOT NULL DEFAULT 'note'
    CHECK (report_kind IN ('note', 'bug'));

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS github_issue_number INTEGER;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS github_issue_url TEXT;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS github_issue_error TEXT;

COMMENT ON COLUMN public.feedback.report_kind IS
  'note (default) or bug. A bug fires the AFTER INSERT trigger below, which '
  'files a GitHub issue through the feedback-github-issue edge function.';
COMMENT ON COLUMN public.feedback.github_issue_error IS
  'Why the issue was not filed (missing token, GitHub HTTP error). NULL once an '
  'issue lands. Written only by the service-role edge function.';

-- ── INSERT policy: the author may not pre-seed the GitHub writeback ─────────
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND github_issue_number IS NULL
    AND github_issue_url IS NULL
    AND github_issue_error IS NULL
  );

-- ── Trigger → edge function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_feedback_bug_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  -- The abuse bound: an honest tester never files twenty bugs in an hour, and
  -- a scripted one gets a marked row instead of twenty GitHub issues.
  recent_bugs INTEGER;
BEGIN
  SELECT count(*) INTO recent_bugs
  FROM public.feedback f
  WHERE f.created_by = NEW.created_by
    AND f.report_kind = 'bug'
    AND f.id <> NEW.id
    AND f.created_at > now() - INTERVAL '1 hour';

  IF recent_bugs >= 20 THEN
    -- The note itself still stands; only the issue is withheld, and the widget
    -- shows the reason on the row.
    UPDATE public.feedback
      SET github_issue_error = 'rate limited'
      WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM public.invoke_edge_function(
    'feedback-github-issue',
    jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_feedback_bug_report: % (%)', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Trigger-only: nothing calls this by name, and a caller who could would be
-- invoking the edge function with a row of their choosing.
REVOKE EXECUTE ON FUNCTION public.notify_feedback_bug_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_feedback_bug_report_trigger ON public.feedback;
CREATE TRIGGER notify_feedback_bug_report_trigger
  AFTER INSERT ON public.feedback
  FOR EACH ROW
  WHEN (NEW.report_kind = 'bug')
  EXECUTE FUNCTION public.notify_feedback_bug_report();
