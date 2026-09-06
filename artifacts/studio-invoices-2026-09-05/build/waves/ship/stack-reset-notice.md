---
## Merge-main reset — 2026-09-06T01:47Z

STACK OWNER: merge-main steward (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`,
branch `studio-invoices/integration`). The peer session released the stack
before this reset; no peer work was on it.

```
supabase --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration db reset
  ...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}

schema_migrations tail (psql):  00571, 00569, 00568, 00567, 00566, 00565
```

The stack now carries **main's 00569 (approvals W2) UNDER our 00571** — the ledger
main's tip and this branch will both hold after the merge. There is no 00570 on
any branch; approvals W3 holds 00572/00573 on their own worktrees and is not on
this stack. **Mint W4+ migrations from 00574.**

Stack released at the end of this step.
