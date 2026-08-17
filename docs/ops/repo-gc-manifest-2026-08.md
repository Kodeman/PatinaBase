# Repo GC Manifest — Worktree Inventory (2026-08)

Inventory only — **no deletions performed** in this pass. No `git worktree remove`, `git rm`,
`git clean`, or branch deletion was run. Disk sizes were **not measured** (`du -sh` on these
directories timed out at 2 minutes in a prior attempt and was skipped here by design). Agent
**a20** in W6 executes retirement on the RETIRE rows below, and only **after** the merges for
Thread A (`security/public-sd-caller-hardening`) and Thread B (`infra/staging-environment`) land.

## Methodology — ancestry was tried and rejected; `git cherry` is the operative test

The first pass of this manifest classified merge status with
`git merge-base --is-ancestor <branch> main`. **That method is unsound for this repo and its
result was thrown out.** This repo squashes and rebases onto `main`, so a branch whose work has
genuinely landed does not show its tip as an ancestor of `main` — the ancestry test reported
**0 of 35** branch-carrying `.codex/` worktrees as merged, which is wrong: two of those branches
turned out to be fully landed (all commits patch-equivalent to something already on `main`), and
twenty more are landed except for one to three residual commits each.

**`git cherry main <branch>` is the correct test and is what this table uses.** It compares
commits by patch-id, not by ancestry, so it correctly identifies work that reached `main` via
squash or rebase:
- `-` = a commit whose patch is already on `main` (**already-on-main**)
- `+` = a commit whose patch is **not** on `main` under any equivalent form (**genuinely-new**)

**a20: do not fall back to `--is-ancestor` for this repo.** Use `git cherry main <branch>` (or
`git cherry -v main <branch>` for subject lines) as the merge-status test going forward.

Dirty/clean is `git status --porcelain | head -1` per worktree, unchanged from the first pass.

Total worktrees (including main checkout): **47**. Non-main worktrees: **46**.

## Verdict rules

- **RETIRE** — `genuinely-new == 0` **and** working tree clean. Ancestry does not matter.
- **TRIAGE** — `genuinely-new > 0` but `already-on-main > 0`. Nearly all the branch's work has
  landed, but it retains commits that have not, in some form, reached `main`. A bulk retire would
  silently destroy those commits; treating it as a flat "unmerged, keep" would bury the same risk
  under 46 look-alike rows. The genuinely-new commits are listed inline for a human to triage —
  this manifest does not judge whether they should be rescued or discarded.
- **KEEP** — everything else: dirty trees, wholly-unmerged branches (`already-on-main == 0`,
  i.e. no work has landed under any form yet), the detached worktree, and the
  protected/in-flight set below.

**Revised counts vs. the ancestry-based first pass:** RETIRE 5 → **7** (feat/workflow-spine-db
and feat/workflow-stage0-contract move off KEEP once cherry proves they're fully landed).
**22 of the 41 first-pass KEEPs reclassify to TRIAGE** — every `.codex/` branch that carries a
generic `fix(workflow): close runtime invalidation gaps` or `test: pin workflow privacy
authority contracts`-shaped landed history plus 1–3 leftover commits. All 22 verdict changes are
in the `.codex/` set — none of the 10 `.claude/` worktrees or the protected/in-flight set changed.

## Protected / in-flight (override the rules above regardless of cherry/dirty result)

- `agent-acl-sd-followup` → `audit/acl-sd-hardening-followup` @ `5528d0a7` — holds migration
  00485, needed by W2
- `agent-canonical-studio-closure` → `security/canonical-studio-authority-closure` @ `ac34a980`
  — holds 00488, needed by W7
- `agent-cf-public-acl-cron-inventory` → detached HEAD @ `a03e5b6f` — clean tree, no uncommitted
  work; HEAD is the identical commit currently tipping `cloudflare-phase1/public-acl`
  ("test(db): scope SQL harness helpers explicitly") — appears to be a duplicate inspection
  checkout of that branch's tip, not divergent work
- `agent-acl-caller-rpc-hardening` → `security/public-sd-caller-hardening` (**Thread A**) —
  needed until the merge lands
- Thread B (`infra/staging-environment`) — **no worktree carries this branch** among the 46; per
  the coordinator it has since merged from the branch ref directly and was dropped from the
  protected list
- Live `phase1-close/*` agent worktrees: `agent-a1`, `agent-a2`, `agent-a4`, `agent-a3r` (this
  agent's own worktree) — work in flight

## Inventory

| Path | Branch | already-on-main | genuinely-new | Working tree | Verdict |
|---|---|---|---|---|---|
| `/Users/kody/Code/patina-merged` | `main` | — | — | dirty | KEEP (main checkout) |
| `.claude/worktrees/agent-a3f1418a4de22bdf6` | `worktree-agent-a3f1418a4de22bdf6` | 0 | 0 | clean | RETIRE |
| `.claude/worktrees/agent-a977f5a533dcc80ee` | `worktree-agent-a977f5a533dcc80ee` | 0 | 0 | clean | RETIRE |
| `.claude/worktrees/agent-aaa96f9f1199fa4ac` | `worktree-agent-aaa96f9f1199fa4ac` | 0 | 0 | clean | RETIRE |
| `.claude/worktrees/agent-acbd9da63988fb664` | `worktree-agent-acbd9da63988fb664` | 0 | 0 | clean | RETIRE |
| `.claude/worktrees/agent-ad8d82de50432d762` | `worktree-agent-ad8d82de50432d762` | 0 | 0 | clean | RETIRE |
| `.claude/worktrees/agent-site-binder-privacy` | `fix/site-binder-privacy` | 37 | 1 | clean | **TRIAGE** |
| `.claude/worktrees/agent-workflow-approval-authority` | `feat/workflow-approval-authority` | 20 | 1 | clean | **TRIAGE** |
| `.claude/worktrees/agent-workflow-approval-lifecycle` | `feat/workflow-approval-lifecycle` | 21 | 1 | clean | **TRIAGE** |
| `.claude/worktrees/agent-workflow-approval-notifications` | `feat/workflow-approval-notifications` | 22 | 1 | clean | **TRIAGE** |
| `.claude/worktrees/agent-workflow-privacy-contract` | `test/workflow-privacy-contract` | 10 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-a1` | `phase1-close/acl-residual-census` | 0 | 1 | clean | KEEP — in-flight |
| `.codex/worktrees/agent-a2` | `phase1-close/claude-md-truth` | 0 | 2 | clean | KEEP — in-flight |
| `.codex/worktrees/agent-a3r` | `phase1-close/gc-manifest` | 0 | 1 | clean | KEEP — this agent, in-flight |
| `.codex/worktrees/agent-a4` | `phase1-close/integration` | 0 | 84 | clean | KEEP — in-flight |
| `.codex/worktrees/agent-acl-37-authority` | `codex/aesthete-authority-contract` | 0 | 73 | **dirty** | KEEP — wholly unmerged + dirty |
| `.codex/worktrees/agent-acl-caller-rpc-hardening` | `security/public-sd-caller-hardening` | 0 | 79 | clean | KEEP — protected (Thread A) |
| `.codex/worktrees/agent-acl-sd-followup` | `audit/acl-sd-hardening-followup` | 0 | 78 | clean | KEEP — protected (00485) |
| `.codex/worktrees/agent-canonical-studio-closure` | `security/canonical-studio-authority-closure` | 0 | 74 | clean | KEEP — protected (00488) |
| `.codex/worktrees/agent-cf-public-acl` | `cloudflare-phase1/public-acl` | 0 | 71 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-acl-audit` | `cloudflare-phase1/public-acl-audit` | 0 | 66 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-acl-cron-inventory` | detached @ `a03e5b6f` | 0 | 71 | clean | KEEP — protected (detached, see notes) |
| `.codex/worktrees/agent-cf-public-acl-migration` | `cloudflare-phase1/public-acl-migration` | 0 | 67 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-acl-review` | `cloudflare-phase1/public-acl-review` | 0 | 70 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-acl-review-fixes` | `cloudflare-phase1/public-acl-review-fixes` | 0 | 73 | **dirty** | KEEP — wholly unmerged + dirty |
| `.codex/worktrees/agent-cf-public-acl-test-harness` | `cloudflare-phase1/public-acl-test-harness` | 0 | 70 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-acl-tests` | `cloudflare-phase1/public-acl-tests` | 0 | 68 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-cf-public-rpc-hardening` | `cloudflare-phase1/public-rpc-hardening` | 0 | 73 | clean | KEEP — wholly unmerged |
| `.codex/worktrees/agent-contextual-handoff-final-ui` | `fix/contextual-handoff-final-ui-remediation` | 37 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-contextual-handoff-remediation` | `fix/contextual-handoff-remediation` | 36 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-project-contextual-handoffs-00440` | `feat/project-contextual-handoffs-db` | 29 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-project-contextual-handoffs-db` | `fix/workflow-approval-notification-requeue` | 24 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-site-request-awaiting-consent-00442` | `fix/site-request-awaiting-consent-handoff` | 33 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-stage2-client-access` | `fix/stage2-client-access` | 25 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-stage2-client-attention-discussion` | `fix/stage2-client-attention-discussion` | 28 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-stage2-client-authority-ui` | `fix/stage2-client-authority-ui` | 26 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-stage2-option-privacy-00440` | `fix/stage2-option-frozen-authority` | 28 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/agent-workflow-spine-db` | `feat/workflow-spine-db` | 10 | 0 | clean | RETIRE (fully landed by cherry, despite failing ancestry) |
| `.codex/worktrees/approval-realtime-closure` | `feat/approval-realtime-closure` | 30 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/contextual-handoff-designer` | `feat/contextual-handoff-designer` | 33 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/designer-stage2-approval` | `feat/designer-stage2-approval-cutover` | 24 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/designer-stage2-remediation` | `fix/designer-stage2-remediation` | 26 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/site-request-authority-detail` | `fix/site-request-authority-detail` | 35 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/stage2-client-approval` | `feat/stage2-client-approval-cutover` | 22 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/workflow-approval-contract` | `test/workflow-approval-authority` | 16 | 1 | clean | **TRIAGE** |
| `.codex/worktrees/workflow-privacy-fix` | `fix/workflow-privacy-authority` | 16 | 3 | clean | **TRIAGE** |
| `.codex/worktrees/workflow-stage0` | `feat/workflow-stage0-contract` | 9 | 0 | clean | RETIRE (fully landed by cherry, despite failing ancestry) |

## TRIAGE detail — genuinely-new commits per branch

21 of the 22 TRIAGE branches carry the **same single genuinely-new commit**:

- `d6175631` — `fix(workflow): close runtime invalidation gaps`

on: `fix/site-binder-privacy`, `feat/workflow-approval-authority`,
`feat/workflow-approval-lifecycle`, `feat/workflow-approval-notifications`,
`fix/contextual-handoff-final-ui-remediation`, `fix/contextual-handoff-remediation`,
`feat/project-contextual-handoffs-db`, `fix/workflow-approval-notification-requeue`,
`fix/site-request-awaiting-consent-handoff`, `fix/stage2-client-access`,
`fix/stage2-client-attention-discussion`, `fix/stage2-client-authority-ui`,
`fix/stage2-option-frozen-authority`, `feat/approval-realtime-closure`,
`feat/contextual-handoff-designer`, `feat/designer-stage2-approval-cutover`,
`fix/designer-stage2-remediation`, `fix/site-request-authority-detail`,
`feat/stage2-client-approval-cutover`, `test/workflow-approval-authority`.

The remaining two branches carry different genuinely-new commits:

- `test/workflow-privacy-contract` — 1 genuinely-new commit:
  - `49d06348` — `test: pin workflow privacy authority contracts`
- `fix/workflow-privacy-authority` — 3 genuinely-new commits:
  - `d6175631` — `fix(workflow): close runtime invalidation gaps`
  - `f59fbd51` — `test: pin workflow privacy authority contracts`
  - `f887a2b5` — `fix: enforce workflow privacy authority`

Note `49d06348` and `f59fbd51` are two **different commits with the identical subject line**
("test: pin workflow privacy authority contracts") on two different branches — likely the same
logical change carried on divergent parents. This manifest does not judge whether any of these
commits should be rescued or discarded; that call belongs to a20 or a human reviewer.

## Other notes

- **Detached-HEAD worktree** (`agent-cf-public-acl-cron-inventory`): working tree is clean, no
  uncommitted work. `HEAD` = `a03e5b6fbc86304cbfe66ca5181d2a79184d2f90`
  ("test(db): scope SQL harness helpers explicitly"), identical to the current tip of
  `cloudflare-phase1/public-acl` (checked out separately in `agent-cf-public-acl`). Looks like a
  duplicate inspection checkout of that branch's tip, not divergent work.
- **Thread B** (`infra/staging-environment`) carries no worktree among the 46 — confirmed absent
  in both passes. Per the coordinator it has since merged directly from the branch ref and is no
  longer part of the protected list.
- `phase1-close/gc-manifest` (this agent's own branch) shows `already-on-main: 0,
  genuinely-new: 1` because it was just cut from `main` and carries only this manifest's own
  commit(s) — not a meaningful merge signal either way; kept as in-flight regardless.
