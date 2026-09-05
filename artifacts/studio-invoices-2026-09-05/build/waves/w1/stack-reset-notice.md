# Wave 1 stack resets (agent-si-db is the W1 stack owner)

- 2026-09-05T14:21:55Z — `supabase db reset` from `.codex/worktrees/agent-si-db/supabase` to apply 00570_studio_invoices.sql. NOTE: the shared local stack had a peer's 00569 applied that does not exist on branch studio-invoices/w1-db; this reset replays only this worktree's ledger (tip 00570) and drops it.
