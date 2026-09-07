# Wave 2 — INTEGRATION lane notes

Date 2026-09-07. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-integration`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w2-integration`,
base `main` @ `8bc8bcc4d3b00353a803b2a701659b06d9a02058`.

Integration HEAD: **`a8906896f5daaf784d1516431c48c6b917c8b69c`**.

## The merge

`git fetch origin main` → `8bc8bcc4d`, a descendant of the lane base
`a6584dbc5` (`git merge-base --is-ancestor` confirmed). Worktree created off
that tip.

Three `--no-ff` merges, in the mandated order, **zero conflicts in all three**:

| Order | Branch | Merged sha | Files | Result |
|---|---|---|---|---|
| 1 | `agreement/w2-backend` | `7e4c1d421` | 18 changed, +8429 / −51 | clean |
| 2 | `agreement/w2-designer` | `f047b98a5` | 46 changed, +9366 / −237 | clean |
| 3 | `agreement/w2-client` | `4eaa6db59` | 18 changed, +3489 / −32 | clean |

Note the lane heads merged are each one commit past the shas the orchestrator's
lane state named (`173acdac6` / `76c089c29` / `2ffc6dacc`); the extra commit on
each branch is that lane's round-3 review document, which is a program doc, not
code.

Designer review finding **R3-2** — the designer lane committing three files
under `packages/supabase/**`, the backend lane's exclusive pathspec — produced
no conflict here: the two lanes touched disjoint files
(`use-agreement-parts.ts` + two specs on the designer side,
`use-agreement-library.ts` / `use-agreement-part-events.ts` / `index.ts` on the
backend side, and `index.ts`'s hunks did not overlap). The seam violation is
real and stands as a process finding; it cost nothing mechanically.

No product code was written in this lane. Nothing was resolved by hand.

## Migrations

Re-swept every local ref (`git for-each-ref` × `git ls-tree -- supabase/migrations`)
and every worktree's working tree at merge time. Highest number on the tip and
on every ref outside this program: **`00575_agreement_parts.sql`**. Ours are
`00576` and `00577`, consecutive and uncollided.

**No renumbering was needed.** Filenames, banner numbers and 00577's lineage
block already agree, and nothing already applied to Strata was touched.

`docs/design/the-document/DECISIONS.md` carries the R138 entry on the branch
(`:10749`), and the file's tail footer reads `*Entries add: R138 · last id = R138*`.

## The stack

`stack-notice.md` was appended with the hand-over before anything ran, then
`supabase db reset --workdir <integration worktree>` replayed every migration
through `00577` plus all 36 seed files. Clean, no errors. The stack now carries
Wave 2's schema and is the one the walk runs against (`walk-env.md`).

Only `postgres` and `storage_vectors` exist as databases — every lane scratch DB
was already gone.

## The blocker integration found that no lane could

The three lanes each validated their migrations on a **`pg_dump` clone of the
shared stack**. A clone carries the live ACLs, so the `00-legacy-grants.sql`
seed never replayed on any of them. On a real `supabase db reset` it does, and
it now breaks:

`supabase/seed/00-legacy-grants.sql:11665` replays 00511's hardening as ONE
statement naming seventeen functions, among them
`public.sign_design_services_agreement_with_trusted_ip( uuid, text, uuid, text )`.
Wave 2 **DROPs that 4-argument overload** (correctly — build sheet §3.4's
overload hazard). The statement therefore raises `undefined_function`, the
generator's wrapper swallows it —

```sql
DO $g$ BEGIN
  REVOKE ALL PRIVILEGES ON FUNCTION …seventeen functions… FROM PUBLIC, anon, authenticated, …;
EXCEPTION WHEN undefined_function OR … THEN NULL;
END $g$;
```

— and **none of the other sixteen functions get re-hardened.** Earlier,
per-migration `GRANT … TO authenticated` statements in the same seed survive
unreverted. Proved directly:

```
$ psql -c "REVOKE ALL PRIVILEGES ON FUNCTION public.consume_board_unfurl_quota(uuid),
           public.sign_design_services_agreement_with_trusted_ip( uuid, text, uuid, text )
           FROM authenticated;"
ERROR:  function public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text) does not exist
```

Eight EXECUTE tuples survive that should not, on six functions — none of them a
Wave 2 function:

```
EXTRA | public.set_project_studio_id()                 | service_role
EXTRA | public.set_project_studio_id()                 | authenticated
EXTRA | public.set_invoice_studio_id()                 | service_role
EXTRA | public.set_invoice_studio_id()                 | authenticated
EXTRA | public.notify_decision_required(uuid)          | authenticated
EXTRA | public.notify_decision_resolved(uuid)          | authenticated
EXTRA | public.consume_board_unfurl_quota(uuid)        | authenticated
EXTRA | public.prepare_spec_book_issue(...)            | service_role
```

That single cause fails **three** SQL suites that are green on `main`:

- `edge_api/public_sd_hardening_contract_test.sql` — *"a public 00511 direct ACL tuple drifted"*
- `document/decision_journey_atomicity_test.sql` — *"notify_decision_required must be service-role only under 00511"*
- `mood_boards/maintenance_quota_test.sql` — *"quota RPC caller grants are incorrect"*

The Wave 1 wave report records the hardening contract test as `rc=0` on `main`,
so this is Wave 2's regression, not inherited.

Re-running `python3 scripts/generate-legacy-grants.py` does not fix it: the
generator prunes *single-function* statements that name a dropped signature (it
did, for four of them — see the seed diff) but keeps a *multi-function*
statement verbatim. The fix is product code and belongs to the backend lane —
either 00577 re-issues 00511's REVOKE/GRANT pair for the sixteen survivors plus
the widened 5-argument signature, or the generator learns to rewrite a dropped
signature inside a multi-function statement. **Out of this lane's scope** ("no
product code except conflict resolution and renumbering"), so it is reported,
not patched.

## Two findings the lane states listed that integration resolved

- Designer **R3-1** — `pnpm --filter @patina/designer-portal type-check` was red
  (12 errors) on the designer branch alone. On the merge it is **green, no
  output**. This was exactly the seam it was predicted to be.
- Client **C3-2** — *not* resolved. `b0000000-0000-0000-0000-00000000cb04`
  (*Cedar Lane — Phase Work*) appears in `threshold.spec.ts` and in no other
  file in the repository; no seed creates it. The e2e touchpoint fails at its
  first assertion.

## Two failures that are not this wave's

- `apps/client-portal/tests/threshold.spec.ts:341` "names the other houses on
  the mat" — expects 2 houses, the seeded stack renders 7. The spec is
  **add-only** in Wave 2 (241 insertions, 0 deletions; the test body and
  `MULTI_OTHER_HOUSE_COUNT = 2` are byte-identical to `main`), no Wave 2 change
  creates a project, and it fails identically in isolation on a freshly reset
  stack. This is the seed-accumulation drift the Wave 1 rulings already recorded
  for this file, and the throwaway-household cleanup R30's amendments sent to
  the main backlog.
- `supabase/tests/rls/project_notes_test.sql` — *"the client saw 2 reading
  marks, expected only her own."* Green on the first run after a reset, red on
  the second: the file does not clean up after itself. Test isolation, not
  Wave 2.
- `supabase/tests/svc_media/shape_reconciliation_fixture_proof.sql` appeared red
  in my first sweep only because I invoked the runner from outside the repo
  root — its `\i docs/engineering/svc-media-shape-reconciliation.reverse.sql`
  resolves against the psql process's CWD. Run from the worktree root it is
  `PASS`. Worth a note in the runner, not a finding.

## Corrections to the build sheet, for the record

- §7 names `./scripts/run-public-acl-psql.sh` for the hardening contract test.
  **That script does not exist in this repo** (the backend reviewer said the
  same). `scripts/run-sql-tests.sh` covers it, or plain
  `psql -v ON_ERROR_STOP=1 -f`. The runner must be invoked with the repo root as
  CWD.
- §7's `pnpm --filter @patina/client-portal test:e2e -- --workers=1` fails with
  *"No tests found"* — pnpm forwards the literal `--` and Playwright reads it as
  a test-file regex. Use `npx playwright test --workers=1` from
  `apps/client-portal`.
- §3.0's provisional numbers (00577/00578) assumed Wave 1 would take two
  numbers; it took one. Wave 2 is 00576/00577, as `env.md` minted.

## What this lane did not do

- Did not push. Did not run any production mutation — no `supabase db push`, no
  `supabase functions deploy`, no `wrangler deploy`.
- Did not touch `.claude/`, `.agents/`, hooks, settings, or any `.env` file.
- Did not create or remove any worktree other than the integration worktree
  step 1 instructed.
- Did not write product code. The three open blockers (backend R3-B1, R3-B2;
  client C3-2) are reported, not fixed.
- Did not walk the 14 steps — `walk-env.md` prepares it; the walk itself waits
  on the blockers.
