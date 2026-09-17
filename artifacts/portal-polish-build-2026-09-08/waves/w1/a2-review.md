# Lane A2 review — Concept render backend (PP-7)

**Reviewer** — separate context, did not implement. Branch `origin/portal-polish/a2` @ `06fdf2143`
(cut from `origin/main` @ `02eb0a95f`). Worktree inspected read-only:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a2`.

**Verdict: approve.**

---

## What I independently verified (not just re-read the impl report)

1. **File scope.** `git diff origin/main...origin/portal-polish/a2 --name-only` returns exactly the
   nine files the plan's Lane A2 section names, plus the lane's own report
   (`artifacts/.../w1/a2-impl.md`). `threshold.tsx` untouched (`git diff` empty). No route file touched.
2. **RPC provenance and diff.** Re-ran `grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_project_threshold" supabase/migrations/*.sql | sort | tail -1` myself → `00578_design_build_kind.sql`. Extracted
   `00578:3451-3618` and the function body from `00580` with `awk`, ran `diff` — the *entire* delta is
   eight added lines, the same four `conceptRender*` keys once per branch (furnishings, trade). Nothing
   else in the ~170-line body moved, no key renamed or removed.
3. **DDL additive/nullable.** All four `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` columns, no default, no
   backfill. Confirmed live: `psql -c "\d project_rooms"` shows all four columns nullable with no
   default, FK `concept_render_uploaded_by → auth.users(id)`, and the three pre-existing policies
   (`Clients can view their project rooms`, `Designers manage their project rooms`,
   `project_rooms_studio_rw`) unchanged and none column-scoped.
4. **Bucket private + limits.** `SELECT ... FROM storage.buckets WHERE id = 'room-renders'` →
   `public = f`, `file_size_limit = 8388608` (8 MB), `allowed_mime_types = {image/jpeg,image/png,image/webp}`.
5. **Policies reuse existing predicates.** Read the four storage policies in the migration file directly —
   insert/update/delete call `app_private.is_project_studio_member(...)`, select is
   `is_project_studio_member(...) OR is_project_client(...)`. Neither predicate is redefined anywhere in
   the file (`grep -c "CREATE.*FUNCTION.*is_project_"` → 0 in 00580). Both leading path segments are
   uuid-shape-checked inside a `CASE`, avoiding the `AND`-does-not-guarantee-order 22P02 trap.
6. **No vendor/trade cost in the client payload.** `grep -in "vendor|trade_price|markup|margin|wholesale"`
   over the migration file turns up only comments/the function's own `COMMENT ON FUNCTION` disclaiming
   them — no such field is added to any `jsonb_build_object`. The SQL test's leak-scan (regex over every
   key at every depth, including `instrument` and `allowance` sub-objects) is a real, working assertion,
   confirmed by reading it, not just trusting the report's prose.
7. **Hook never writes the row on upload failure.** Read `use-room-concept-render.ts`: `uploadError` is
   checked and thrown before `auth.getUser()` or the `.update()` call is ever reached. Read the vitest
   ("never writes the row when the upload fails") and confirmed it asserts `from` was never called, not
   merely that the promise rejected.
8. **`database.types.ts` committed and in sync.** `git diff --exit-code` at HEAD is empty (the four
   columns are present, committed in `a5e1c1899`). I ran `pnpm db:generate` again myself against the
   already-running local stack and re-checked `git diff --exit-code packages/supabase/src/database.types.ts`
   → exit 0. Diff is exactly the four columns × `Row`/`Insert`/`Update`, nothing else moved.
9. **Gates re-run by me, not just trusted from the report:**
   - `pnpm --filter @patina/supabase test` → **94 files passed, 1152 passed | 12 skipped** — matches the
     report's numbers exactly.
   - `pnpm --filter @patina/supabase type-check` → clean.
   - `pnpm turbo build --filter=@patina/supabase^... --filter=@patina/client-portal^...` (precondition
     the report calls out) → 8/8 tasks green.
   - `pnpm --filter @patina/client-portal type-check` → clean.
   - `pnpm --filter @patina/client-portal test -- src/lib/threshold` → **13 suites, 266 tests, all
     green** (spot-check of the derive.ts change's blast radius; full client-portal suite run was not
     in my required gate list and was not re-run in full).
10. **Read-only DB probes I ran directly** (I did not run `supabase db reset` — that is A2's resource,
    not mine): `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d project_rooms"` and
    a `SELECT` on `storage.buckets` — both reported above, both consistent with the migration and the
    impl report.
11. **Commit hygiene.** Three commits (`a5e1c1899`, `3dadf9c8d`, `06fdf2143`), each with explicit
    pathspecs (verified via `git show --stat`), Conventional Commit messages, no `git add -A`. Branch is
    pushed to `origin/portal-polish/a2`. `main` untouched.

## Review checklist — item by item

| Item | Status | Evidence |
|---|---|---|
| RPC body came from 00578 | **Pass** | `grep \| sort \| tail -1` re-run myself; extraction line range matches |
| Diff against it is exactly four keys | **Pass** | `diff` of extracted old vs. new function body — 8 lines, same 4 keys ×2 |
| Every DDL step additive and nullable | **Pass** | `\d project_rooms` — no defaults, `ADD COLUMN IF NOT EXISTS` |
| Bucket private | **Pass** | `storage.buckets` row: `public = f` |
| Bucket has mime/size limits | **Pass** | `file_size_limit = 8388608`, 3-entry `allowed_mime_types` |
| Policies reuse `is_project_studio_member` / `is_project_client` | **Pass** | read verbatim in migration; neither predicate redefined |
| Grants explicit | **Pass** | `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` then `GRANT EXECUTE ... TO authenticated, service_role`, restated per post-2026-05-30 convention; `has_function_privilege` assertions in the SQL test for both `authenticated` (yes) and `anon` (no) |
| No vendor cost/pricing enters client payload | **Pass** | grep over migration + SQL test's own leak-scan assertion, both read directly |
| Hook never writes the row on upload failure | **Pass** | code path read; test asserts `from` uncalled |
| `database.types.ts` committed and in sync | **Pass** | committed in `a5e1c1899`; `db:generate` + `git diff --exit-code` re-run by me, exit 0 |

## Global constraints (plan-wide) — checked

- **Worked only in assigned files.** Confirmed by `--name-only` diff (§1 above). The one file outside
  the plan's literal nine — `supabase/seed/00-legacy-grants.sql` — is a **required, mechanically
  generated** consequence of the migration adding `GRANT`/`REVOKE` statements, per
  `.claude/skills/patina-db-migrations/SKILL.md:22,62,103`: "If your migration adds any GRANT/REVOKE,
  regenerate it." It also falls inside the plan's own `supabase/seed/*` allowance for this lane, even
  though the plan's parenthetical ("only if a fixture render is needed") anticipated a different reason
  for touching that glob. Not a violation — flagged only for the record.
- **No anchor ids renamed / no route changed.** No UI files touched at all in this lane; N/A and clean.
- **Types from `@patina/types` / generated `database.types.ts`.** The new `RoomConceptRender` interface
  in `derive.ts` is a hand-defined view-model shape, consistent with every other interface already in
  that file (`ThresholdProposal`, `ThresholdReceipt`, etc. are all local to `derive.ts`, not imported).
  Not a violation of the "never redefine a `@patina/types` type" rule — this isn't a duplicate of an
  existing domain type.
- **Hooks exported from the barrel, shipped with a vitest.** `useRoomConceptRender` and its constants/
  types are exported from `packages/supabase/src/hooks/index.ts` (the file A2 owns); six vitests cover
  path composition, the row payload and both `.eq` scopes, blank-caption→null, both failure paths, and
  both invalidations exactly.
- **No lane resets the DB or starts a dev server** other than the owner. A2 is the owner for Wave 1; its
  report shows the reset it ran. I did not reset the DB; I only probed the already-reset local stack and
  ran `pnpm db:generate` (a read-plus-regenerate against the DB, not a reset).
- **Migration number.** Head at the report's writing was `00579`; `00580` was free and taken correctly
  (re-verified: `ls supabase/migrations | tail -3` still shows `00580_room_concept_render.sql` as the
  newest real migration file on this branch).

## Findings

| # | Severity | Confidence | Finding |
|---|---|---|---|
| F1 | P3 | high | The plan's Lane A2 §3 and the design spec both describe the target as "the rooms payload," but `get_client_project_threshold` has no such payload — its only array is the flat `selections` list. The implementer caught this, placed the four fields onto each selection line's existing room join instead (satisfying the literal "diff is exactly four keys" constraint), and explicitly told Wave 2/H5 to read the render off `useProjectRooms`/`ThresholdRoom` rather than this RPC. This is the correct call and is well-argued in the impl report — flagging only so Wave 2's reviewer knows not to expect a `rooms` array in the RPC output and to check that H5 actually wires `toThresholdRoom` (in `threshold.tsx`, an H-lane file) to populate `ThresholdRoom.conceptRender` from the raw `project_rooms` row, since A2 correctly left that wiring undone (out of its file list). No fix needed in this lane. |
| F2 | P3 | low | Storage object paths are shape-checked (`<uuid>/<uuid>/...`) but the second segment (room id) is deliberately never joined back to `project_rooms` to confirm it belongs to the first segment's project — a studio member could write an object under `<their-project>/<arbitrary-uuid>/file` where the arbitrary uuid does not correspond to any real room in that project. The impl report explains this trade-off explicitly (joining back would run under the caller's own RLS and could narrow the studio predicate). I traced the consequence: since the `project_rooms.concept_render_url` column is only ever set by the hook using a project/room pair verified against `project_rooms`'s own RLS (`.eq('id', roomId).eq('project_id', projectId)`), an orphan object at a fabricated path is inert — nothing ever points a real row at it, and no cross-project read is possible since the first segment (project id) still gates all read access. Documented risk, not exploitable within this lane's own write path; worth a one-line note in Wave 2/3 review if any *other* code path ever writes `concept_render_url` directly. |
| F3 | P3 | low | `supabase/seed/00-legacy-grants.sql` is technically outside the plan's literal nine-file list for this lane, though within its `supabase/seed/*` allowance and mandated by the migrations skill for any file adding GRANT/REVOKE. No action needed — recorded so a later auditor doesn't mistake it for scope creep. |

No P1 or P2 findings. Every item on the plan's Lane A2 review checklist passed independent verification
(re-derived, not just re-read from the impl report), all gates I re-ran matched the report's numbers
exactly, and the live local database matches the migration's claims.

## What I did not do

- Did not run `supabase db reset` or the full SQL test suite (`bash scripts/run-sql-tests.sh`) — DB reset
  is A2's owned resource per the plan's shared-state table; instead read A2's pasted output and ran the
  two read-only probes the review brief specified (`\d project_rooms`, a `SELECT` on `storage.buckets`).
- Did not run the full `@patina/client-portal test -- --ci` suite (2250 tests) — not in my required gate
  list; ran the narrower `src/lib/threshold` scope (266 tests, all green) as a targeted check on the one
  file this lane changed in that package.
- Did not push anything — this is a review-only pass, no fix commits.
