# Patina skill library — STAGING

Written 2026-07-08 against `main @ 593876c1` (migrations head `00284`) by the outgoing operator session, for the next operator (Opus 4.8 / Sonnet-class). Every load-bearing claim was verified against the repo at authoring time; each skill carries a `Last verified:` stamp — re-verify anything load-bearing if the repo has moved.

**These are NOT live.** Skill discovery loads `.claude/skills/<name>/SKILL.md` (one level); nothing in `_staging/<name>/` is picked up. Promote per skill:

```bash
git mv .claude/skills/_staging/<name> .claude/skills/<name>
```

After promoting the first one, confirm in a fresh session that `_staging` skills did NOT also load (if they did, move this whole directory out of `.claude/skills/`).

## Inventory (11 skills)

| Skill | One-line scope | Top damage prevented |
|---|---|---|
| `patina-db-migrations` | Author/apply Supabase migrations, RLS, RPCs, grants, seeds | RPC last-writer-wins reverts; number collisions; post-flip grant mistakes |
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

Deliberately NOT covered (use existing tools): App Store Connect / TestFlight → the 25 `asc-*` skills in `apps/mobile/Patina/.claude/skills/`; xcodebuild mechanics → `building-with-xcode`; generic debugging/TDD process → superpowers plugin skills; repo architecture basics → root `CLAUDE.md` (note: it has known drift — 4 portals not 3, ~280 migrations not 52, no circuit breaker, projects service uses Supabase Realtime not WebSockets).

## Before promoting — reviewer checklist

- [ ] Spot-check 2–3 skills against files you know well; the authors verified against `main @ 593876c1`, but you know intent the repo can't show.
- [ ] Confirm the prod-gate wording matches your current comfort level (it encodes "ship X = full chain authorized").
- [ ] `patina-stripe-payments` / `patina-prod-ops`: the "LIVE keys owed" / punch-list items were true on 2026-07-08 — refresh if state moved.
- [ ] Decide whether `supabase/CLAUDE.md`'s stale "latest body in 00262" line should be fixed at the source (two skills currently warn against it instead).
- [ ] Known-unverified items (flagged in-skill): live `.workers.dev` reachability, `next lint` fallback behavior for admin/client, Strata's default-privilege posture post-flip, seed-marker exact values, iOS dark-mode re-walk status.
