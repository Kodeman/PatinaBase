# Repo GC Manifest — Worktree Inventory (2026-08)

Inventory only — **no deletions performed** in this pass. No `git worktree remove`, `git rm`,
`git clean`, or branch deletion was run. Disk sizes were **not measured** (`du -sh` on these
directories timed out at 2 minutes in a prior attempt and was skipped here by design). Agent
**a20** in W6 executes retirement on the RETIRE rows below, and only **after** the merges for
Thread A (`security/public-sd-caller-hardening`) and Thread B (`infra/staging-environment`) land.

Merged status is proven with `git merge-base --is-ancestor <branch> main` for every branch —
never inferred from branch name or memory. Dirty/clean is `git status --porcelain | head -1`
per worktree.

Total worktrees (including main checkout): **47**. Non-main worktrees: **46**.

## Inventory

| Path | Branch | Merged into main | Working tree | Verdict | Notes |
|---|---|---|---|---|---|
| `/Users/kody/Code/patina-merged` | `main` | — | dirty | KEEP | main checkout, not a disposable worktree |
| `.claude/worktrees/agent-a3f1418a4de22bdf6` | `worktree-agent-a3f1418a4de22bdf6` | yes | clean | RETIRE | |
| `.claude/worktrees/agent-a977f5a533dcc80ee` | `worktree-agent-a977f5a533dcc80ee` | yes | clean | RETIRE | |
| `.claude/worktrees/agent-aaa96f9f1199fa4ac` | `worktree-agent-aaa96f9f1199fa4ac` | yes | clean | RETIRE | |
| `.claude/worktrees/agent-acbd9da63988fb664` | `worktree-agent-acbd9da63988fb664` | yes | clean | RETIRE | |
| `.claude/worktrees/agent-ad8d82de50432d762` | `worktree-agent-ad8d82de50432d762` | yes | clean | RETIRE | |
| `.claude/worktrees/agent-site-binder-privacy` | `fix/site-binder-privacy` | no | clean | KEEP | unmerged branch |
| `.claude/worktrees/agent-workflow-approval-authority` | `feat/workflow-approval-authority` | no | clean | KEEP | unmerged branch |
| `.claude/worktrees/agent-workflow-approval-lifecycle` | `feat/workflow-approval-lifecycle` | no | clean | KEEP | unmerged branch |
| `.claude/worktrees/agent-workflow-approval-notifications` | `feat/workflow-approval-notifications` | no | clean | KEEP | unmerged branch |
| `.claude/worktrees/agent-workflow-privacy-contract` | `test/workflow-privacy-contract` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-a1` | `phase1-close/acl-residual-census` | no | clean | KEEP | live phase1-close agent (a1) — in flight |
| `.codex/worktrees/agent-a2` | `phase1-close/claude-md-truth` | no | clean | KEEP | live phase1-close agent (a2) — in flight |
| `.codex/worktrees/agent-a3r` | `phase1-close/gc-manifest` | trivially yes (just branched off main) | clean | KEEP | this agent's own worktree — in flight |
| `.codex/worktrees/agent-a4` | `phase1-close/integration` | no | clean | KEEP | live phase1-close agent (a4) — in flight |
| `.codex/worktrees/agent-acl-37-authority` | `codex/aesthete-authority-contract` | no | **dirty** | KEEP | unmerged + uncommitted changes |
| `.codex/worktrees/agent-acl-caller-rpc-hardening` | `security/public-sd-caller-hardening` | no | clean | KEEP | **protected: Thread A** — needed until merge lands |
| `.codex/worktrees/agent-acl-sd-followup` | `audit/acl-sd-hardening-followup` @ `5528d0a7` | no | clean | KEEP | **protected**: holds migration 00485, needed by W2 |
| `.codex/worktrees/agent-canonical-studio-closure` | `security/canonical-studio-authority-closure` @ `ac34a980` | no | clean | KEEP | **protected**: holds 00488, needed by W7 |
| `.codex/worktrees/agent-cf-public-acl` | `cloudflare-phase1/public-acl` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-acl-audit` | `cloudflare-phase1/public-acl-audit` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-acl-cron-inventory` | detached @ `a03e5b6f` | no | clean | KEEP | **protected**: detached HEAD, see finding below |
| `.codex/worktrees/agent-cf-public-acl-migration` | `cloudflare-phase1/public-acl-migration` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-acl-review` | `cloudflare-phase1/public-acl-review` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-acl-review-fixes` | `cloudflare-phase1/public-acl-review-fixes` | no | **dirty** | KEEP | unmerged + uncommitted changes |
| `.codex/worktrees/agent-cf-public-acl-test-harness` | `cloudflare-phase1/public-acl-test-harness` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-acl-tests` | `cloudflare-phase1/public-acl-tests` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-cf-public-rpc-hardening` | `cloudflare-phase1/public-rpc-hardening` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-contextual-handoff-final-ui` | `fix/contextual-handoff-final-ui-remediation` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-contextual-handoff-remediation` | `fix/contextual-handoff-remediation` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-project-contextual-handoffs-00440` | `feat/project-contextual-handoffs-db` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-project-contextual-handoffs-db` | `fix/workflow-approval-notification-requeue` | no | clean | KEEP | unmerged branch (note: dir name doesn't match branch) |
| `.codex/worktrees/agent-site-request-awaiting-consent-00442` | `fix/site-request-awaiting-consent-handoff` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-stage2-client-access` | `fix/stage2-client-access` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-stage2-client-attention-discussion` | `fix/stage2-client-attention-discussion` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-stage2-client-authority-ui` | `fix/stage2-client-authority-ui` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-stage2-option-privacy-00440` | `fix/stage2-option-frozen-authority` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/agent-workflow-spine-db` | `feat/workflow-spine-db` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/approval-realtime-closure` | `feat/approval-realtime-closure` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/contextual-handoff-designer` | `feat/contextual-handoff-designer` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/designer-stage2-approval` | `feat/designer-stage2-approval-cutover` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/designer-stage2-remediation` | `fix/designer-stage2-remediation` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/site-request-authority-detail` | `fix/site-request-authority-detail` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/stage2-client-approval` | `feat/stage2-client-approval-cutover` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/workflow-approval-contract` | `test/workflow-approval-authority` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/workflow-privacy-fix` | `fix/workflow-privacy-authority` | no | clean | KEEP | unmerged branch |
| `.codex/worktrees/workflow-stage0` | `feat/workflow-stage0-contract` | no | clean | KEEP | unmerged branch |

## Notes

- **Thread B** (`infra/staging-environment`) has **no worktree currently checked out** in this
  repo — the branch/worktree named in the brief was not found among the 46 non-main worktrees.
  a20 should confirm whether that branch exists elsewhere (or under a different local name)
  before acting on Thread B's merge gate.
- **Detached-HEAD worktree finding** (`agent-cf-public-acl-cron-inventory`): working tree is
  clean (no uncommitted work). `HEAD` is `a03e5b6fbc86304cbfe66ca5181d2a79184d2f90`
  ("test(db): scope SQL harness helpers explicitly"), which is the exact same commit currently
  tipping the `cloudflare-phase1/public-acl` branch (checked out in
  `agent-cf-public-acl`). Nothing unique to this detached checkout was found; it appears to be a
  duplicate inspection checkout of that branch's tip, not a divergent line of work.
- Five worktrees are protected per the brief regardless of merge/dirty status; they are marked
  KEEP above with the stated reason: `agent-acl-sd-followup`, `agent-canonical-studio-closure`,
  `agent-cf-public-acl-cron-inventory`, any worktree on `security/public-sd-caller-hardening`
  (Thread A — `agent-acl-caller-rpc-hardening`), and any worktree on
  `infra/staging-environment` (Thread B — none found, see above).
- The four live `phase1-close/*` agent worktrees (`agent-a1`, `agent-a2`, `agent-a4`,
  `agent-a3r`) are marked KEEP as in-flight work.
- `phase1-close/gc-manifest` (this agent's own branch) shows "merged" only because it was just
  cut from `main` and has not diverged yet — not a meaningful signal either way.
