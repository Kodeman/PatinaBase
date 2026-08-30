# Capture Enrichment Outbox — Follow-up

**Status**: Rows accumulate; not a launch blocker; owner TBD.

## Issue

- `commit_proposal_capture` (migration 00516) enqueues `capture_enrichment_runs` and `capture_enrichment_outbox` rows.
- `infra/capture-enrichment-worker/` has only `OPERATIONS.md` — no implementation code.
- Nothing drains the outbox queue.
- Rows accumulate in the database.

## Next Step

Define ownership and drain mechanism for the outbox. Likely:
1. A Cloudflare Worker or edge function to process `capture_enrichment_outbox` rows.
2. A scheduled job (pg_cron) to move rows from outbox → some terminal state or external system.
3. Or: defer enrichment entirely if capture launch does not require it.

**Assigned to**: TBD
