# Patina skill library

Eleven `patina-*` skills written 2026-07-08/09 by the outgoing operator session for the next operator (Opus 4.8 / Sonnet-class), from a 7-agent repo discovery plus the accumulated session-memory gotcha archive, then adversarially reviewed. Every load-bearing claim was repo-verified at authoring time; each skill carries a `Last verified:` stamp (currently `main @ c4de810d`, migrations head `00284`) — re-verify anything load-bearing if the repo has moved far past it.

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

## Maintaining

- When a skill turns out wrong or the repo moves under it, fix the skill in the same change as the code and refresh its `Last verified:` stamp — a stale skill is worse than none.
- Keep descriptions trigger-only ("Use when …", no workflow summaries) — the description is what decides whether a future agent loads it.
- Known-unverified items (flagged in-skill): live `.workers.dev` reachability, `next lint` fallback behavior for admin/client, Strata's default-privilege posture post-flip, seed-marker exact values, iOS dark-mode re-walk status.
