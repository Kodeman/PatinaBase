# Workflow Stage-0 privacy contracts

These failing-first contracts encode the direct-access matrix in
`docs/design/workflow-completion/PRIVACY-AUTHORITY-AUDIT.md`. They use
deterministic UUIDs, explicit JWT claims and database roles, one transaction per
file, and unconditional rollback. Expected privacy gaps are assertions, not
skips: the pre-remediation schema exits non-zero after printing every case.

Run each file against an isolated, fully migrated local stack:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/board_privacy_contract_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/commercial_privacy_contract_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/configuration_privacy_contract_test.sql
```

Do not run these against a shared database while another migration owner is
resetting or pushing schema. The suites roll back relational fixtures, but role
switching and concurrent schema replacement still make a shared run unsafe.

## T01-T22 coverage

| Audit case | Contract coverage |
|---|---|
| T01 | Board B03/B04; configuration P04. |
| T02 | Board B01/B02 statically enforce private metadata; HTTP H01/H02 completes object-access proof. |
| T03 | Board B05/B06. |
| T04 | Board B07/B08. |
| T05 | Board B09/B09A/B09B cover UPDATE/INSERT/DELETE. |
| T06 | Board B14. |
| T07 | Blocked on a durable non-lead household-member identity link; current schema exposes only the singular `projects.client_id` / `designer_clients.client_id`. Add the fixture and raw-row probes when that relationship model exists; do not simulate it as a project-team role. |
| T08 | Board B13, commercial C14, configuration P10. |
| T09 | Board B15. |
| T10 | Commercial C02. |
| T11 | Commercial C03. |
| T12 | Commercial C04. |
| T13 | Board B11. |
| T14 | HTTP H06/H07; SQL cannot exercise object-byte overwrite/delete. |
| T15 | Commercial C07/C09; C08/C10 preserve UPDATE immutability. |
| T16 | Configuration P01-P04. |
| T17 | Configuration P05. |
| T18 | Configuration P07. |
| T19 | Configuration P08/P09. |
| T20 | Commercial C12. |
| T21 | Commercial C13. |
| T22 | Board B12/B16. |

The companion [Storage HTTP follow-up](storage_http_followup.md) defines the
non-SQL portion without weakening T02 or T14.
