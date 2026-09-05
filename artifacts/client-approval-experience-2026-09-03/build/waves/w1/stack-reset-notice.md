# Wave 1 — local Supabase stack reset notice

Only the backend lane (`agent-cae-w1-backend`) resets the shared local stack during Wave 1.
Every reset is announced here before it is run.

| when | who | why |
|---|---|---|
| 2026-09-04, round-2 fix pass | backend lane (`approvals/w1-backend`) | Minted `00568_decision_first_notice_dispatch.sql` — P-02's missing publish-time producer (review finding F1). Replaying migrations + seeds to prove it applies clean, then `scripts/run-sql-tests.sh`. |
| 2026-09-05, integration | integration steward (`approvals/w1-integration`) | Wave-1 integration branch (backend + web + iosa merged). Replaying migrations + seeds through `00568_decision_first_notice_dispatch.sql` to prove the merged tree applies clean, then `scripts/run-sql-tests.sh` and a generated-types check. |
| 2026-09-05, close-out integration | integration steward (`approvals/w1-integration`) | Wave-1 close-out: `approvals/w1-backend` close-out merged onto the integration branch (`6f10a26ae`). Replaying migrations + seeds through `00568_decision_first_notice_dispatch.sql` to prove the merged tree still applies clean, then `scripts/run-sql-tests.sh` and a generated-types check. |
