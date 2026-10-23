# Agent development kickoff

Read root AGENTS.md, REDESIGN.md, this program README, the relevant brief and skills before executing. The approval already covers the round-eight redesign direction; do not repeatedly ask to proceed with reversible, in-scope development once the user commissions it.

## Branch and queue

Integration branch: **`redesign/designer-portal-round8`**. The reference artifact commit and preparation docs belong here. Each commissioned work package uses its own feature branch/worktree based on this integration branch. Do not implement on the user's shared checkout or let separate agents share an index.

The WP catalog is a specification index. For commissioned repository work, follow K1 in [DECISIONS.md](DECISIONS.md): Sidequest owns engineering dispatch, claims, candidate verification, review and integration; `agent_tasks` remains the Agent OS runtime business queue. Do not mirror engineering lifecycle there or revive `cowork_tasks`. Do not enqueue/start the development program merely because this preparation exists.

At commissioned dispatch, name the intended queue environment and authorized connection/capability using `docs/agent-os/agent-roles-runbook.md` and current RPC grants; do not infer the queue target from a portal `.env.local` or create another database queue. `agent_reader`/`agent_writer` are NOLOGIN roles, not credentials. Migration 00484 revokes `agent_writer` table access and grants the enqueue RPC to `agent_writer`/`service_role`; never insert directly. Credentials remain server-side. A request to prepare this branch is not authorization to write operational tasks to Strata.

Program ticket convention (not new schema-required fields): put WP/slice ID, integration base SHA, route/provider, independent reviewer provider, owned pathspecs/worktree, dependency contract IDs, acceptance IDs, exact gates and evidence links in the existing task payload/description. Use the existing enqueue/transition APIs and actor audit context. Include a deterministic enqueue idempotency key and explicit audit actor; actor is not lease ownership. Store team identity in the payload, not `assignee` (currently limited to `kody`/`leah`). Do not invent columns, task types or status enums; inspect the current `@patina/agent-queue` types/registry before enqueueing.

Follow current AGENTS model/provider routing. Separate implementation from independent review, using the other provider; apply the current Sidequest/category policy where required rather than inventing a model routing table in this plan.

## Checkout protocol (for the later commissioned team)

Choose unique values under the current `patina-parallel-work` convention and inspect current refs before running. The example `agent-*` linked worktree is supported; bootstrap checks registered linked-worktree status, not a particular tool brand. If orchestration provisions the worktree, use its assigned path instead:

```bash
PATINA_REPO=/Users/kody/Code/patina-merged
R8_WORKTREE="$PATINA_REPO/.codex/worktrees/agent-r8-wp00"
git --git-dir="$PATINA_REPO/.git" fetch origin redesign/designer-portal-round8
git --git-dir="$PATINA_REPO/.git" worktree add "$R8_WORKTREE" \
  -b redesign/r8-wp00 origin/redesign/designer-portal-round8
cd "$R8_WORKTREE"
git rev-parse --show-toplevel
bash scripts/bootstrap-worktree.sh
```

Read `patina-local-dev` before starting servers or test stacks. Bootstrap uses a localhost-only environment profile and must not import production settings. Verify endpoints without printing secrets. Rebuild dist-resolved dependencies before app gates. One named owner controls each local DB/reset/seed and each port. Tests with fixtures are not safe against a production-pointed `.env.local`.

## Roles and exclusive seams

| Role | Owns | Does not independently rewrite |
|---|---|---|
| Integration lead | Branch sequence, DocumentLayout/DocumentHoldLayout wiring, doc page orchestrator, studio registry, route/identity/query contracts, release evidence | Domain transitions without the owning domain reviewer |
| Foundation | Scoped theme, type/rhythm, paper/contents/instrument primitives, focus/return and responsive behavior | Shared all-portal theme or provider lifecycle without integration review |
| Studio/resources | Desk/next-act presentation, inquiry/resource/relationship views, global discovery and exact entry links | Second next-act engine, placement store or copied job data |
| Selection/design | FF&E lenses, room/board/library handoff, evidence/print/issue presentation | Independent pricing/approval state or altered print immutability |
| Commerce/coordination | Existing order/account/hour and correspondence presentation, related hook changes within assigned paths | New invoice engine, second timer, uncontrolled sending or implicit trade authority |
| Build/closeout domain | C2–C6 data/authority contracts and assigned RPC/migration/consumer changes; package and acceptance behavior | Studio PO fabrication for external work or blanket relaxation of close_project |
| Client consumers | WP-10C authenticated acceptance in client portal/iOS, designer request handoff, permitted paper intake and old-reader behavior | Separate acceptance truth or unreviewed signer/consent policy |
| Quality | Test actors/fixtures, target matrix, behavior/role/a11y/performance evidence, independent review | Snapshot approval that hides functional regressions |

For each task, replace these broad areas with **explicit file pathspecs**. Reserve shared files before dispatch. A feature team can propose an orchestrator patch, but the integration lead lands it. A migration owner assigns provisional numbers and rechecks current integration head immediately before merge.

## Ready-to-dispatch brief template

> Deliver exactly WP-XX's named slice; no unrelated refactor, new navigation, abstraction or feature. Read [brief], DOMAIN-CONTRACTS Cx, acceptance Axx/Xxx, and named current source. Use worktree [absolute path], branch [name], with exclusive write paths [explicit list]. Preserve [invariants] and existing consumer contracts. The approved reference is [artifact/scene]; do not modify it. Implement real persisted behavior using existing hooks/RPCs and canonical keys. Domain unknown [Pxx] blocks only [dependent operation]; continue independent work. Required gate commands are [exact commands from VERIFICATION.md plus targeted domain tests]. Report commit, affected paths, command outcomes and skips, live-data/role evidence, desktop/mobile screenshot paths, review findings and limitations. No production deployment or external sending is authorized by this brief unless explicitly added by the user.

Reviewer brief: review the diff plus actual source contracts in a separate provider context; report **every finding with confidence and severity**, reproduction/evidence and suggested correction. Distinguish inherited issue, regression and deliberate deferral. Do not filter to high severity or treat the implementer's test summary as independent proof.

## Integration protocol

1. Rebase/merge the current integration head according to repository conventions; check branch/working-tree identity and explicit path ownership.
2. Implement one reviewable behavior slice. New public/domain contracts are reviewed before another team consumes them.
3. Run the relevant real gates and supply evidence. Source-only, mocked, skipped and live-data results are labelled separately.
4. Resolve independent review findings; integration lead evaluates every residual item and records any accepted deferral.
5. Merge to the redesign integration branch. Re-run the integrated cross-surface journeys affected by the merge, not merely the feature's component tests.
6. Stage explicit paths, use Conventional Commits, push feature/integration branches as authorized, and retire owned worktrees. Preserve unmerged branches carrying useful work; delete a branch only after mergedness/abandonment has been established under repository policy.

### Integration branch → main

The integration lead owns main synchronization at each working-day start and before any migration/contract merge. Fetch and merge current `origin/main` into this branch in an isolated integration worktree; record the new base and resolve conflicts with domain owners. Recheck every provisional migration number/order against both tips, then replay the combined local migration chain. Feature teams consume the refreshed integration head. Do not force-rewrite a branch shared by teams.

A coherent release slice can be proposed to main after its old/new consumers, migrations and fallback pass, with UI behind the agreed renderer flag and new consequential RPCs separately inert/server-gated; partial UI must not become the default. The integration lead owns that PR and reconciles migration numbers again immediately before merge. Apply the separate server activation/grant rule in ROLLOUT: migrations on main must be safe to apply without the new UI, and direct callers must not bypass a disabled consequential transition. Merging code and deploying are distinct: this preparation does neither. An internal production pilot starts only after compatible code is on main and a later user request authorizes deployment.

Run the AI quality workflow manually on the integration branch during development (`gh workflow run ai-quality-gate.yml --ref redesign/designer-portal-round8`) and record the exact run SHA. Its manual path does **not** execute the PR-only bundle detection/measurement step; run the bundle commands in VERIFICATION separately. The affected verifier falls back to `origin/main` for an empty manual-event base. A passing dispatch is not proof of broader integration/browser/domain coverage.

Use [PR-TEMPLATE](PR-TEMPLATE.md) for a concise review record. The current AI quality workflow targets PRs to main; do not assume a PR into this integration branch runs that same complete set. Run required local/manual gates regardless.
