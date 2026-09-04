# First Flight · W1 — notice: the shared local stack is about to be reset

**Written 2026-09-03, 15:52 CDT** by the W1 integration steward (S9b), from
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-integration`.

## What is about to happen

`pnpm supabase:reset` (`cd supabase && supabase db reset`) against the **local** stack —
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, API `http://127.0.0.1:54321`.
Nothing in this step touches Strata or any other production surface.

The reset replays `supabase/migrations/` from the W1 integration tip
**`d65c9b47ba2c9a1ece9b86050821ea88b36b86fd`** and re-seeds from the `sql_paths` arrays in
`supabase/config.toml`, then `bash scripts/run-sql-tests.sh` runs the SQL suite and the result is
diffed against `supabase/tests/KNOWN_FAILURES.md`.

`steward.md` §4 reserved this reset to the steward at integration, and this is that moment: the wave
carries L1-X's migration and it has to be proved against a head that replays cleanly.

## Why the peer session's 00558 is safe this time

§4's warning was that `00558_feedback_bug_reports_github` was applied to the local database and its
file existed in no first-flight worktree — so a reset would have dropped it. That is no longer true:
`00558_feedback_bug_reports_github.sql` is **in this branch's `supabase/migrations/`**, so the replay
puts it back. The head after the reset is:

```
00555_ios_round_one_security.sql
00556_admin_studio_management.sql
00557_increment_scan_upload_attempt.sql
00558_feedback_bug_reports_github.sql
00559_proposal_signing_multi_studio.sql      ← L1-X's, this wave
```

## The state of the stack as this was written

The Docker daemon is **not answering** — `docker ps`, `docker version` and a direct
`GET /_ping` on `/Users/kody/.docker/run/docker.sock` all hang and are killed at their timeout;
`127.0.0.1:54322` is closed while `:54321` still accepts. Docker Desktop's process is alive.

The most likely cause is recorded here so nobody re-diagnoses it: **the boot volume filled up**
during this session's first unit-gate run (`Macintosh HD` out of space, seen in
`.gatelogs/merge6-unit-1.log` as `Patina-primary.priors` and `.dia` write failures). Clearing
`~/Library/Developer/Xcode/DerivedData` returned 109 GiB, but the daemon did not recover on its own.

So this step begins by restarting Docker Desktop and `supabase start`, before the reset itself. Any
peer session holding the local stack loses it either way — that is what this notice is for.

## If you are a peer session reading this

Your local rows are gone after this runs. The seeds and the W0 first-flight client fixture
(`supabase/seed/first-flight-client-fixture.sql`, wired into both `sql_paths` arrays) are replayed,
so the walk fixture comes back. Anything you wrote by hand does not.
