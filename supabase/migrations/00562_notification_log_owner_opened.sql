-- ═══════════════════════════════════════════════════════════════════════════
-- 00562 — notification_log: the addressed user may mark their own rows opened
--
-- W1-C-01 / C2-07. `public.notification_log` (00041) has exactly one UPDATE
-- policy — "Service role can update notification logs", `USING (auth.uid() IS
-- NULL)` — so a signed-in user matches no UPDATE policy at all. The iOS app's
-- `NotificationsAPIClient.markOpened` / `markAllOpened` issue
--
--   PATCH /rest/v1/notification_log?opened_at=is.null&channel=in.(in_app,push)
--   {"opened_at": "…", "status": "opened"}
--
-- and PostgREST answers 200 with an empty array — zero rows affected. The feed
-- clears optimistically, the next fetch reverts it, and the bell can never
-- reach zero for a real person. Proven on the local stack with a real
-- client@patina.dev bearer token: SELECT returns the user's 6 rows, the PATCH
-- affects 0, and the table still reads 6 of 6 unread.
--
-- WHAT THIS DOES
--
--   a) Adds an UPDATE policy for `authenticated` over the rows that user owns,
--      scoped to the two channels the app's feed actually surfaces
--      (`in_app`, `push` — `NotificationsAPIClient.list`'s own filter). An
--      email or SMS row is delivery machinery; nothing in a client surface
--      reads it and nothing should let a client write it.
--
--   b) Narrows what that policy can reach to the three engagement columns.
--      Supabase's default grants give `authenticated` table-wide UPDATE, so
--      without (b) the policy would also let a person rewrite their own row's
--      `type`, `metadata` (which carries `deep_link`), `error` and
--      `retry_count`. Column-level grants are enforced by PostgREST, so a
--      PATCH naming any other column now fails with 42501 instead of
--      succeeding quietly.
--
--   c) Pins the new row's status to the engagement values, so the one write
--      the app makes ("this was read") cannot be turned into a claim about
--      delivery ('bounced', 'failed', 'suppressed').
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   The pre-existing "Service role can update notification logs" policy is
--   `USING (auth.uid() IS NULL)`, which is TRUE under the `anon` key — so the
--   anon key can still rewrite any user's notification rows. 00555 §CAVEAT
--   saw it, called it HIGH, and deferred it deliberately: notification_log is
--   on the live email/cron rail 00552/00553/00554 had just moved, and it
--   wanted a migration that could be verified against that rail. That is still
--   true and still owed; it is a different change from this one and it is not
--   folded in here.
--
-- ROLLBACK
--   DROP POLICY "Users can mark own notifications opened" ON public.notification_log;
--   GRANT UPDATE ON public.notification_log TO authenticated;
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) the policy
DROP POLICY IF EXISTS "Users can mark own notifications opened"
  ON public.notification_log;

CREATE POLICY "Users can mark own notifications opened"
  ON public.notification_log
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND channel IN ('in_app'::notification_channel, 'push'::notification_channel)
  )
  WITH CHECK (
    auth.uid() = user_id
    AND channel IN ('in_app'::notification_channel, 'push'::notification_channel)
    -- (c) an engagement write, never a delivery claim
    AND status IN (
      'delivered'::notification_status,
      'opened'::notification_status,
      'clicked'::notification_status
    )
  );

-- (b) the column ceiling. REVOKE first: the table-wide grant Supabase installs
-- would otherwise leave every column writable and the policy would be the only
-- thing standing between a client and their own row's routing metadata.
REVOKE UPDATE ON public.notification_log FROM authenticated;
GRANT UPDATE (opened_at, clicked_at, status)
  ON public.notification_log TO authenticated;

COMMENT ON POLICY "Users can mark own notifications opened"
  ON public.notification_log IS
  'W1-C-01/C2-07: the addressed user marks their own in-app/push rows read. '
  'Column grants restrict the write to opened_at, clicked_at and status; the '
  'WITH CHECK keeps status inside the engagement values.';
