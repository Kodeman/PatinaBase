# Patina skill library

Eleven `patina-*` skills written 2026-07-08/09 by the outgoing operator session for the next operator (originally Opus 4.8 / Sonnet-class; retuned 2026-08-05 for the Claude 5 family — Fable 5 orchestrating, Opus 5 / Sonnet 5 / Haiku executing), from a 7-agent repo discovery plus the accumulated session-memory gotcha archive, then adversarially reviewed. Every load-bearing claim was repo-verified at authoring time; each skill carries a `Last verified:` stamp (currently `main @ c4de810d`, migrations head `00284`) — re-verify anything load-bearing if the repo has moved far past it.

## Inventory

| Skill | One-line scope | Top damage prevented |
|---|---|---|
| `patina-db-migrations` | Author/apply Supabase migrations, RLS, RPCs, grants, seeds | RPC last-writer-wins reverts; number collisions; post-flip grant mistakes; bare `extensions.*` calls |
| `patina-edge-functions` | Author/test/deploy Deno edge functions, `_shared`, `verify_jwt` | `_shared` fan-out under-deploys; unauthenticated public functions |
| `patina-portal-features` | Golden path for portal pages/hooks/data/controls/flags | Stale-dist edits; hydration/hook-order breaks; wrong Button/`asChild` |
| `patina-local-dev` | Boot/troubleshoot local stack, env, flags, seeds, email | Destructive ops against a prod-pointed `.env.local`; orphaned dev servers |
| `patina-verification` | Which command actually gates what; false-green traps | Trusting mock-fallback renders, dead CI, lying ledgers, shadowed `.js` |
| `patina-testing` | Writing/fixing jest/vitest/playwright/deno tests | Silently no-op `jest.mock`; networkidle races; flag-gated e2e failures |
| `patina-deploy` | Ship portals/services/migrations/functions to prod | Raw OpenNext builds; dead-box scripts; unverified "deployed" claims |
| `patina-prod-ops` | Diagnose/operate Strata + Cloudflare prod | GUC-vs-Vault mistakes; cron "succeeded" misreads; unauthorized mutations |
| `patina-stripe-payments` | The payments rail (edge fns + Supabase, NOT orders) | "Fixing" the dormant orders Stripe module; wrong webhook secret |
| `patina-parallel-work` | Worktrees, concurrent sessions, commit hygiene | Shared-checkout contamination; `git add -A`; migration-number races |
| `patina-ios-verification` | Patina/Patina Field build-and-verify discipline | Sim-green shipped as done; UI-"synced" scans that never landed server-side |

Standing policies encoded throughout (from Kody, 2026-07-08): prod mutations need an explicit in-session ask, but "ship X" authorizes the full chain without per-step re-asking; read-only prod is always fine; the old Coolify box is dead — never touch; the cutover punch list is active — verify infra state live before trusting any doc claim.

Deliberately NOT covered (use existing tools): App Store Connect / TestFlight → the 25 `asc-*` skills in `apps/mobile/Patina/.claude/skills/`; xcodebuild mechanics → `building-with-xcode`; generic debugging/TDD process → superpowers plugin skills; repo architecture basics → root `CLAUDE.md` (drift-corrected 2026-07-09).

## Cowork operational skills

Four additional skill folders (added 2026-07-11) serve Claude **Cowork**
workflows — vendor sourcing, brand copy, order coordination, trade paperwork
— not repo-engineering procedures like the eleven above. Source: the
canonical copies live in `docs/agent-os/patina-agent-os-cowork-handoff.md`
§B ("Section B — Skills"); keep this repo copy in sync if that doc changes.
All fifteen skill folders (the eleven above plus these four) are gated by
the same `pnpm lint:skills` check (`scripts/lint-skills.mjs`,
`.github/workflows/skills-lint.yml`, advisory — no branch protection exists).

| Skill | One-line scope |
|---|---|
| `vendor-qualification-rubric` | Research and score a candidate maker/manufacturer against the 500-point rubric — Kody's operational half pre-scored, Leah's brand half packaged as a review card |
| `patina-brand-voice` | Patina's voice, lexicon, and copy rules for any designer/maker/homeowner-facing text |
| `concierge-order-playbook` | Coordinate a Rail A concierge furniture order end-to-end — PO/invoice drafts, freight research, damage-claim prep |
| `trade-paperwork-prep` | Prepare (never submit) trade program applications and account paperwork for makers/brands |

Two of the four ship with a `references/` file this session filled in:
`vendor-qualification-rubric/references/rubric.md` (the full 8-dimension
table + scoring anchors, generated from `packages/types/src/vendor-pipeline.ts`)
and `trade-paperwork-prep/references/patina-facts.md` (a committed template
with every real value redacted to `«KODY: fill»` — see that file's own
top note before touching it).

## Maintaining

- When a skill turns out wrong or the repo moves under it, fix the skill in the same change as the code and refresh its `Last verified:` stamp — a stale skill is worse than none.
- Keep descriptions trigger-only ("Use when …", no workflow summaries) — the description is what decides whether a future agent loads it.
- Re-audit skills at each model release — instructions tuned to an older model's failure modes become counterproductive on the next one.
- Known-unverified items (flagged in-skill): live `.workers.dev` reachability, `next lint` fallback behavior for admin/client, Strata's default-privilege posture post-flip, seed-marker exact values, iOS dark-mode re-walk status.
