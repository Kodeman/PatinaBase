# Wave-1 pre-apply snapshot (§2)

This is the §2 pre-apply snapshot per `docs/ops/wave1-prod-reconciliation-plan.md`, taken 2026-08-12 (run at `2026-08-12T18:26:09Z` UTC) against production Supabase project **Strata** (`bkvcixdmuyejfzcijpdg`), BEFORE applying wave1 migrations 00460–00472. All queries were read-only `SELECT`s executed via `mcp__claude_ai_Supabase__execute_sql`; nothing was inserted, updated, or altered against the database.

`build_board_share_payload` is **absent** from `snapshot-2.1-function-bodies.json` — this is expected: it does not exist on prod pre-apply, and wave1 introduces it. All 14 other requested functions were found and captured with `prosrc` + `md5(prosrc)`.

## Files and row counts

| File | Rows |
| --- | --- |
| `snapshot-2.1-function-bodies.json` | 14 (of 15 requested; `build_board_share_payload` absent as expected) |
| `snapshot-2.2-public-policies.json` | 750 |
| `snapshot-2.3-storage-objects-policies.json` | 61 |
| `snapshot-2.4-buckets.json` | 19 |
| `snapshot-2.5-board-share-grants.json` | 6 |
