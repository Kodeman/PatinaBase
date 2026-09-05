Wave 3 reset ownership — nobody on this wave resets the shared local Supabase stack during the
build. Unlike Wave 1/Wave 2, the **backend lane validates on a scratch database, not the shared
stack**, and **only the integration steward resets the shared stack**, and only after the
orchestrator's handshake.

- 2026-09-05 — **steward pass** (this session): confirmed the shared local Supabase stack is
  running (`supabase status` from `/Users/kody/Code/patina-merged` returned the standard local
  API/DB/Studio URLs, no error) and did **not** reset or seed it. A peer program
  (`studio-invoices/*`, worktrees `agent-si-*`) is actively minting migrations against this same
  repo/stack — its `00571_studio_invoices.sql` is committed on `studio-invoices/w1-db` and
  siblings, and its own worktrees hold uncommitted-elsewhere lane state. Wave 3 must not disturb
  that program's stack state.
- No lane in this wave — backend included — is authorized to run `supabase db reset` /
  `supabase:reset` / any migration-apply against the shared local stack during the build phase.
  The backend lane's brief directs it to stand up its own scratch database for SQL-gate
  validation instead.
- The integration steward resets the shared stack once, for the Wave-3 integration gate pass,
  after the orchestrator confirms the peer program (`studio-invoices`) is clear to be replayed
  over, exactly as the Wave 2 integration steward did at close. Until that handshake, treat the
  shared stack as belonging to the peer program.
- No `.env` file exists in any Wave 3 worktree. Local Supabase keys for any web-lane walk against
  the shared stack come from `supabase status -o env` run fresh from
  `/Users/kody/Code/patina-merged` — see `env.md`.
