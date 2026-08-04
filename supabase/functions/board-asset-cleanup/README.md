# Board asset cleanup

`board-asset-cleanup` is a service-role-only, two-pass garbage collector for
objects under `proposal-mood-boards/{owner}/boards/{board}/...`.

The supported invocation path is `public.dispatch_board_asset_gc(true)`. That
RPC creates a `job_runs` row, invokes the function with its id, and leaves the
function to finish the run through `finish_board_asset_gc_run`. Migration 00410
schedules that exact dry-run call daily.

Safety invariants:

- The default and scheduled behavior is dry-run. A non-boolean `dry_run` value
  also resolves to dry-run.
- Deletion requires both literal JSON `"dry_run": false` and the edge secret
  `BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED=true`. Do not set that secret until
  reviewed production dry-run receipts show the candidate set is correct.
- A newly unreferenced object is only recorded. It cannot be deleted on first
  sight; eligibility begins after 14 continuous days without any reference.
- Restored references and missing/re-uploaded objects reset candidate history.
- References include live board item image fields and nested image/original/
  thumbnail values, frozen `project_boards` snapshots, `board_templates`, and
  existing board cover paths.
- URL/key normalization accepts only this bucket's canonical Storage URLs or
  raw `{uuid}/boards/{uuid}/...` keys. No other Storage namespace is scanned or
  removed.

Run focused tests from the repository root:

```bash
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/board-asset-cleanup/core_test.ts
```
