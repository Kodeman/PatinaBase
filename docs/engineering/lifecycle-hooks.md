# Lifecycle hooks

Patina's lifecycle automation is one dependency-free Node engine with thin adapters for coding agents, Git, pull requests, scheduled integration, protected deployment, and repository management. The shared implementation lives in `scripts/hooks/core.mjs`; `scripts/hooks/patina-hooks.mjs` is its command-line boundary.

## Enforcement model

The hooks intentionally distinguish high-confidence safety policy from quality feedback:

| Layer        | Trigger                                           | Behavior                                                                                                                       |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Agent        | Session start, before commands, after edits, stop | Blocks dangerous commands; provides repository and affected-check context                                                      |
| Git          | Commit and push                                   | Blocks secrets, forbidden artifacts, unsafe migrations, and invalid commit subjects; affected checks at push are advisory      |
| Pull request | Every PR and main push                            | `Security policy` is the candidate required check; affected build/type/lint/unit and iOS jobs remain visible but advisory      |
| Integration  | Nightly, manual, and before production            | Rebuilds local Supabase, runs SQL/edge tests, and exercises portal browser suites                                              |
| Production   | Manual dispatch only                              | Validates immutable main SHAs, requires integration, waits for the `production` environment, and executes one ordered manifest |
| Management   | Weekly and manual                                 | Reports lifecycle drift, package-script gaps, migration collisions, skill problems, and dependency vulnerabilities             |

Only findings marked `blocking` stop local or PR policy execution. Quality failures are still red GitHub checks, but they should not become required until their inherited baseline is green.

## Local installation and commands

`pnpm install` runs Husky's `prepare` script and installs the hooks. The adapters are deliberately small:

- `.husky/pre-commit` scans staged path names and staged content.
- `.husky/commit-msg` enforces Conventional Commits.
- `.husky/pre-push` runs focused affected checks without rejecting the push; broad fan-outs print their plan and defer execution to CI.
- `.claude/settings.json` and `.codex/hooks.json` invoke the same engine for agent events.

Useful direct commands:

```bash
pnpm hooks:test
pnpm hooks:policy
pnpm hooks:verify
pnpm hooks:audit
node scripts/hooks/patina-hooks.mjs verify --base origin/main --head HEAD --json
node scripts/hooks/patina-hooks.mjs deploy-plan --base <deployed-sha> --release <main-sha> --scope affected
```

Affected verification follows workspace dependencies. Shared package changes fan out to consumers; retained Nest services use their real strict `build` gates; edge `_shared` changes discover importing functions; Deno always uses `supabase/functions/deno.json`; and the two iOS apps retain their canonical `ios-gate.sh all` entrypoints.

## Command safety

Agent hooks deny broad staging (`git add -A`, `git add .`, or `git add --all`), bare monorepo-wide `pnpm dev`, retired Coolify/GHCR scripts, raw OpenNext builds, and direct production mutations. Database reset/seed commands are also denied when the designer portal resolves to a non-local Supabase URL.

The production denial is defense in depth. An explicitly authorized emergency local session can be launched with `PATINA_ALLOW_LOCAL_PROD_DEPLOY=1`; setting it inside an already-running agent command is intentionally insufficient. Routine releases must use the protected workflow.

## Production setup

Before enabling production dispatch, repository administrators must create a GitHub Environment named `production`, add required reviewers, prevent self-review, and restrict deployment to `main`. Configure these environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `CLOUDFLARE_API_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The dispatcher requires both the previously deployed SHA and the release SHA. Both must be immutable full SHAs, the release must be on `origin/main`, and the base must be its ancestor. The generated artifact records exactly what will run in this order:

1. Supabase migrations
2. affected Edge Functions
3. affected Cloudflare service workers
4. affected portals through `infra/deploy-portal.sh`
5. public smoke checks

The executor refuses to run outside GitHub Actions or without `PATINA_PRODUCTION_DEPLOY=1`, and refuses a manifest whose release SHA differs from the checked-out commit. The workflow retains both the approved manifest and execution results for 90 days.

After this workflow has completed a successful dry release and the existing policy baseline is understood, make only `Policy and affected quality / Security policy` required on `main`. Do not require the advisory affected-quality or nightly integration jobs until their historical failures have been paid down.

## Operations

The retired `docker-publish.yml` workflow is removed because production now runs on Cloudflare Workers/Containers and Supabase Strata. The weekly audit uploads evidence but does not open or mutate issues. Owners should review its red runs, triage dependency findings, and update the hook engine tests whenever a policy changes.

Hook configuration is repository code. Changes to the engine, agent adapters, Git adapters, or workflow definitions should include a test that fails before the behavior change and should be reviewed like deployment code.
