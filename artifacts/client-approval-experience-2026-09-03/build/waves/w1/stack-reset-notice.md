# Wave 1 — local Supabase stack reset notice

Only the backend lane (`agent-cae-w1-backend`) resets the shared local stack during Wave 1.
Every reset is announced here before it is run.

| when | who | why |
|---|---|---|
| 2026-09-04, round-2 fix pass | backend lane (`approvals/w1-backend`) | Minted `00568_decision_first_notice_dispatch.sql` — P-02's missing publish-time producer (review finding F1). Replaying migrations + seeds to prove it applies clean, then `scripts/run-sql-tests.sh`. |
