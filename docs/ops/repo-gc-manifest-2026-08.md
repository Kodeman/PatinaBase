# Repo GC Manifest — Worktree Inventory (2026-08)

Inventory only — **no deletions performed** in this pass. No `git worktree remove`, `git rm`,
`git clean`, or branch deletion was run. Disk sizes were **not measured** (`du -sh` on these
directories timed out at 2 minutes in a prior attempt and was skipped here by design). Agent
**a20** in W6 executes retirement on the RETIRE rows below, and only **after** the merges for
Thread A (`security/public-sd-caller-hardening`) and Thread B (`infra/staging-environment`) land.

⚠ **Sandbox footgun for anyone scripting this repo's git state, including a20:** unquoted
`for f in $files` does not word-split in this zsh sandbox, so the loop silently runs once instead
of iterating — use `for f in $(...)` (command substitution splits) or iterate a real array.
Separately, invoking `git` as a subprocess inside a `while read` loop in this same sandbox
intermittently returned silently-corrupted/empty output with no visible error during this
manifest's construction; the workaround used here was generating a flat *sequential* script
(loop only for text-building, never wrapping the actual `git` invocation) and cross-checking
results against known values before trusting a batch. Budget for both quirks before writing any
git-in-a-loop tooling against this repo.

## Methodology — three layers, each correcting the one before: ancestry → `git cherry` → content

**Layer 1 (rejected): `git merge-base --is-ancestor <branch> main`.** Unsound for this repo — it
squashes and rebases onto `main`, so a branch whose work genuinely landed does not show its tip
as an ancestor. This test reported **0 of 35** branch-carrying `.codex/` worktrees as merged,
which was wrong.

**Layer 2 (also insufficient on its own): `git cherry main <branch>`.** Compares commits by
patch-id rather than ancestry, so it correctly recognizes work that reached `main` via squash or
rebase: `-` = a commit whose patch is already on `main` (**already-on-main**), `+` = a commit
whose patch has no exact match on `main` (**genuinely-new**). This is a real improvement over
ancestry, but patch-id is still exact-match only — **it over-reports orphans whenever a commit
landed and `main` then evolved past it, or a migration got renumbered on the way in.** Content
comparison against `main`'s current tree caught three "genuinely-new" commits that patch-id
flagged but that had, in fact, already landed (see Layer 3 findings below): `d6175631` (landed
verbatim, `main` just moved on around it), `f887a2b5` (landed as a renumbered migration, 2-line
diff), and `f59fbd51`/`49d06348` (landed except for two documentation files).

**Layer 3 (the one that actually settled it): content comparison.** For every commit `git cherry`
flagged as genuinely-new, diff its changed files against `main`'s current versions — byte-identical
or drifted-by-later-evolution means it landed; a file with no counterpart on `main` at all is the
only real signal of orphaned work. This is what actually distinguishes RETIRE from TRIAGE below.

**a20: do not stop at `git cherry`, and do not fall back to `--is-ancestor`.** Patch-id is
necessary but not sufficient here — confirm any `+` commit's content actually has no home on
`main` before treating a branch as carrying real orphaned work.

Dirty/clean is `git status --porcelain | head -1` per worktree, unchanged from the first pass.

Total worktrees (including main checkout): **47**. Non-main worktrees: **46**.

## Verdict rules

- **RETIRE** — after content comparison, no genuinely-orphaned content remains **and** working
  tree clean. A `git cherry` `+` commit does not by itself block RETIRE if its content is
  confirmed present on `main` (verbatim, evolved-in-place, or renumbered).
- **TRIAGE** — after content comparison, real orphaned content remains: file(s) with no
  counterpart anywhere on `main`. Listed inline for a human to decide rescue-or-discard — this
  manifest does not judge that call.
- **KEEP** — everything else: dirty trees, wholly-unmerged branches (`already-on-main == 0`,
  i.e. no work has landed under any form yet), the detached worktree, and the
  protected/in-flight set below.

**Revised counts, three passes:**
- Ancestry (rejected): RETIRE 5 / KEEP 41 / TRIAGE 0
- `git cherry` (superseded): RETIRE 7 / TRIAGE 22 / KEEP 17
- **Content comparison (final): RETIRE 27 / TRIAGE 2 / KEEP 17**

The cherry pass over-reported 20 branches as TRIAGE on the strength of one commit
(`d6175631` — content-confirmed landed, just drifted from later `main` evolution) and one more
branch's blocking reason turned out to be a renumbered migration (`f887a2b5` → `00462`, landed).
Those 20 branches plus the 2 fully-landed-by-cherry branches from pass 2 (`feat/workflow-spine-db`,
`feat/workflow-stage0-contract`) make up the 27 RETIRE. Only 2 branches (`fix/workflow-privacy-authority`,
`test/workflow-privacy-contract`) carry content that genuinely has no home on `main` — see
**Orphaned content** below. All verdict changes are in the `.codex`/`.claude` branch-carrying set;
the protected/in-flight/wholly-unmerged KEEP set (17 rows) is unchanged from pass 2.

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
| `.claude/worktrees/agent-site-binder-privacy` | `fix/site-binder-privacy` | 37 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.claude/worktrees/agent-workflow-approval-authority` | `feat/workflow-approval-authority` | 20 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.claude/worktrees/agent-workflow-approval-lifecycle` | `feat/workflow-approval-lifecycle` | 21 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.claude/worktrees/agent-workflow-approval-notifications` | `feat/workflow-approval-notifications` | 22 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.claude/worktrees/agent-workflow-privacy-contract` | `test/workflow-privacy-contract` | 10 | 1 | clean | **TRIAGE** — 2 orphaned docs |
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
| `.codex/worktrees/agent-contextual-handoff-final-ui` | `fix/contextual-handoff-final-ui-remediation` | 37 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-contextual-handoff-remediation` | `fix/contextual-handoff-remediation` | 36 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-project-contextual-handoffs-00440` | `feat/project-contextual-handoffs-db` | 29 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-project-contextual-handoffs-db` | `fix/workflow-approval-notification-requeue` | 24 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-site-request-awaiting-consent-00442` | `fix/site-request-awaiting-consent-handoff` | 33 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-stage2-client-access` | `fix/stage2-client-access` | 25 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-stage2-client-attention-discussion` | `fix/stage2-client-attention-discussion` | 28 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-stage2-client-authority-ui` | `fix/stage2-client-authority-ui` | 26 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-stage2-option-privacy-00440` | `fix/stage2-option-frozen-authority` | 28 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/agent-workflow-spine-db` | `feat/workflow-spine-db` | 10 | 0 | clean | RETIRE (fully landed by cherry, despite failing ancestry) |
| `.codex/worktrees/approval-realtime-closure` | `feat/approval-realtime-closure` | 30 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/contextual-handoff-designer` | `feat/contextual-handoff-designer` | 33 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/designer-stage2-approval` | `feat/designer-stage2-approval-cutover` | 24 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/designer-stage2-remediation` | `fix/designer-stage2-remediation` | 26 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/site-request-authority-detail` | `fix/site-request-authority-detail` | 35 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/stage2-client-approval` | `feat/stage2-client-approval-cutover` | 22 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/workflow-approval-contract` | `test/workflow-approval-authority` | 16 | 1 | clean | RETIRE (d6175631 content-confirmed landed) |
| `.codex/worktrees/workflow-privacy-fix` | `fix/workflow-privacy-authority` | 16 | 3 | clean | **TRIAGE** — 2 orphaned docs (d6175631 and f887a2b5 content-confirmed landed) |
| `.codex/worktrees/workflow-stage0` | `feat/workflow-stage0-contract` | 9 | 0 | clean | RETIRE (fully landed by cherry, despite failing ancestry) |

## Content-comparison findings — why 20 of 22 `git cherry` flags turned out to be false positives

`git cherry` flagged three distinct commits (by content, across 22 branches) as genuinely-new.
Content diff against `main`'s current tree resolved all three:

- **`d6175631` "fix(workflow): close runtime invalidation gaps" — LANDED, not an orphan.** All
  three symbols it introduces are present on `main`: `WorkflowInvalidationClient` in
  `packages/supabase/src/hooks/use-project-workflow.ts` (confirmed present on `main` directly),
  plus `invalidateProjectWorkflow` and `projectWorkflowQueryKey` in the hook tests. Of its 21
  files, 5 are byte-identical to `main` and 16 differ only because `main` evolved further after
  the merge. Patch-id diverged from context drift, nothing more. This is the commit gating 21 of
  the 22 cherry-flagged branches; 20 of those 21 had it as their *only* genuinely-new commit and
  move straight to RETIRE.

- **`f887a2b5` "fix: enforce workflow privacy authority" — LANDED, renumbered.** 46 files: 29
  identical to `main`, 16 evolved, 1 "absent" as a literal path —
  `supabase/migrations/00434_workflow_privacy_authority.sql`. `main` carries the same migration
  renumbered as `00462_workflow_privacy_authority.sql` (confirmed present on `main`), and the two
  differ by exactly two lines: the header comment and one inline `pre-00434` → `pre-00462`
  reference. Renumber, not loss.

- **`49d06348` / `f59fbd51` "test: pin workflow privacy authority contracts" — LANDED except two
  documentation files.** Two different commits, same subject line, carried on divergent parents
  of `test/workflow-privacy-contract` and `fix/workflow-privacy-authority` respectively — same
  logical change. Both are landed except for the two files in **Orphaned content** below.

**Net effect:** `fix/workflow-privacy-authority`'s three cherry-flagged commits are now all
accounted for — `d6175631` landed, `f887a2b5` landed as `00462`, `f59fbd51` landed except the two
orphaned docs. `test/workflow-privacy-contract`'s one cherry-flagged commit (`49d06348`) is the
same story. **Verdict for both: TRIAGE, sole remaining reason is the two orphaned docs — nothing
else in either branch needs rescuing.**

## Orphaned content — 2 files, 111 lines

This is the **single actionable rescue in the entire 46-worktree inventory**. Everything else is
either already landed on `main` (safe to RETIRE) or wholly unmerged work still in progress (KEEP).
Both files live identically in `test/workflow-privacy-contract`
(`.claude/worktrees/agent-workflow-privacy-contract`) and `fix/workflow-privacy-authority`
(`.codex/worktrees/workflow-privacy-fix`), under `supabase/tests/workflow/`, and neither exists
on `main`:

1. **`supabase/tests/workflow/README.md`** — 52 lines. How to run the workflow privacy contract
   tests. `main` already has the test files this README documents
   (`board_privacy_contract_test.sql`, `commercial_privacy_contract_test.sql`,
   `configuration_privacy_contract_test.sql`, `storage_privacy_contract_test.ts`, confirmed
   present in `supabase/tests/workflow/` on `main`) but **no runner instructions**.
2. **`supabase/tests/workflow/storage_http_followup.md`** — 59 lines. The spec for the Deno
   storage harness. `main` already has `storage_privacy_contract_test.ts` — the work this spec
   called for got built, but the spec that called for it never landed.

Both are documentation only — no code, no schema, no test logic is orphaned. Whether to rescue
either doc onto `main` (or let them stay lost) is a call for a20 or a human reviewer; this
manifest does not make it.

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
