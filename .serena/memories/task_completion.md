# Task Completion — commands to run when a coding task is done

Run all four from the **repo root** (`/Users/kody/Code/patina-merged`). They are Turborepo pipelines:

```bash
pnpm type-check   # turbo run type-check
pnpm lint         # turbo run lint
pnpm test         # turbo run test
pnpm build        # turbo run build   (only when a build is actually needed)
pnpm format       # prettier --write (NOT turbo — see below); format:check to verify
```

## Scope to what you changed (fast feedback)
Turbo `--filter` by package name (the `name` field in package.json, e.g. `@patina/designer-portal`, `@patina/supabase`), not the folder path:
```bash
pnpm turbo run type-check --filter=@patina/designer-portal
pnpm turbo run test lint type-check --filter=@patina/supabase
```
Or run the per-package script directly inside the package dir (`pnpm --filter <name> <script>`). The most-touched app is the designer portal (`@patina/designer-portal`).

## How Turborepo scopes these (turbo.json)
- **Every quality task `dependsOn: ["^build"]`** — `type-check`, `lint`, `test`, and `build` all first build the package's workspace dependencies (`dist/**`, `.next/**`). This is why type-checking one app can trigger builds of `@patina/design-system`, `@patina/types`, etc.
- **Worktree builds MUST go through turbo** (the `dist/` dependency gotcha): running `next build`/`tsc` directly in a worktree fails because sibling package `dist/` outputs aren't present. Use `pnpm turbo run build --filter=...` so `^build` populates them first. (Confirmed pattern across The Document / procurement work.)
- `dev` is `cache:false` + `persistent`; `test` outputs `coverage/`,`test-results/`.
- Turbo strict env: shell-exported `NEXT_PUBLIC_*` vars are stripped unless in `globalPassThroughEnv` (currently only `NEXT_PUBLIC_FLAG_OVERRIDES`). Flag overrides pass through; other exported NEXT_PUBLIC vars won't reach tasks.

## Per-package runner / tooling map (non-uniform!)
- **`type-check` is NOT defined on the 3 NestJS services** (`orders`/`media`/`projects`) — they type-check only via `nest build` (their `build` script). `pnpm type-check` silently skips them. To type-check a service, run its `build`.
- **Test runners are split:**
  - **jest** — the 3 Next portals (`designer-portal`, `admin-portal`, `client-portal`) and the 3 NestJS services.
  - **vitest** — most libs: `supabase`, `patina-design-system`(=`@patina/design-system`), `api-routes`, `api-client`, `help-system`, `aesthete-quiz`, `extension`, `email`, `notifications`, `utils`, `cache`.
- **Lint tooling is split:** `designer-portal` uses **flat ESLint v9** (`eslint .`, config `eslint.config.mjs`); `admin-portal`/`client-portal` still use `next lint`. There is NO root eslint config. NestJS `lint` scripts run `eslint --fix` (they mutate files).
- **`format` is a root-level prettier glob, not a turbo task** — runs across the whole tree from root only.
- `type-check` script = `tsc --noEmit` in the packages that define it.

## Package name aliases worth knowing
- Design-system: dir `packages/patina-design-system`, name **`@patina/design-system`**.
- `pnpm dev` is discouraged; use selective `pnpm dev:designer` / `dev:admin` / `dev:client` (see root scripts).

## CLAUDE.md drift (verified against tree 2026-07)
CLAUDE.md's structure section is stale — these exist but aren't listed there:
- App: **`apps/manufacturer-portal`** (`@patina/manufacturer-portal`, has dev/build/lint/type-check).
- Packages: **`aesthete-quiz`, `catalog-ui`, `help-system`** (beyond the ~11 CLAUDE.md names).
- Workspace globs include **`studios/*`** (currently `studios/help-system`, the Sanity studio).
pnpm-workspace.yaml globs: `apps/*`, `packages/*`, `services/*`, `studios/*`.

## Known test gotchas (see related memories via CLAUDE.md index)
- **Jest + tsconfig `paths`**: `jest.mock('@patina/<pkg>')` silently never applies (paths + SWC rewrite). Mock the real ESM offender (`@portabletext/react`) instead.
- **Jest ESM / field-primitives**: any jest suite importing `field-primitives` fails to load (`@portabletext/react` ESM untransformed via `@patina/help-system`); mock `field-primitives` per-suite. Bites decision composer/panel suites.

## DB-side verification (when a change touches SQL/RPCs)
Not part of type/lint/test but part of "done" for migration work: `pnpm supabase:reset` (`cd supabase && supabase db reset`) must run clean through the latest migration, and run any SQL smoke for the RPC you changed. Prisma services: `pnpm prisma:generate` after editing a `schema.prisma`.
