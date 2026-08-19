# Capture enrichment worker operational contracts

Skeleton written ahead of code, per the Phase 3 (capture enrichment) C-A0
zero-cost foundation workstream. `infra/capture-enrichment-worker/` has no
implementation yet — this file exists so the alert-event grid, the log
field allowlist, and the logging rule are fixed before the consumer,
dispatcher, or any Workers AI call is written. Modeled on
`infra/edge-api-worker/OPERATIONS.md`'s alert-event table.

Message contract: `CaptureEnrichmentMessageV1` in
`packages/types/src/capture-enrichment.ts` — one definition shared by the
pg_cron dispatcher (producer), the Cloudflare Queue send path, and this
worker (consumer). Golden-set acceptance cases for every event below live
in `docs/engineering/capture-enrichment-golden-set.md`.

## Cloudflare log alert contract

Alert filters match the exact `event` and `severity` fields below. Events
are derived from the runbook's retry classification (`docs/engineering/patina-cloudflare-plan.md`,
"Phase 3 target: capture enrichment" > "Workers AI chain": retry only
timeouts, capacity 429s, and platform 5xx; invalid input, oversized
payload, access/configuration errors, and unsupported media are terminal
or partial completion) plus the ledger states the golden set exercises
(claimed, duplicate, stale, cancelled, ready, failed).

| Event                           | Severity   | Meaning                                                                                                                                                                                                                                                                      | Action                                                                                                                                                                                   |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enrichment_claimed`            | `info`     | Consumer atomically claimed a run at its current `contentRevision` and began processing.                                                                                                                                                                                     | Evidence record — do not attach a notification.                                                                                                                                          |
| `enrichment_duplicate_ignored`  | `info`     | A redelivered message for an already-resolved run was dropped at the ledger check (Queues delivery is at-least-once).                                                                                                                                                        | Evidence record. Alert only if duplicate volume as a fraction of claims rises sharply — that would indicate ack/commit failures upstream, not normal redelivery.                         |
| `enrichment_stale_ignored`      | `info`     | A message referenced a `contentRevision` older than the run's current revision; ignored in favor of the newer one.                                                                                                                                                           | Evidence record — do not attach a notification.                                                                                                                                          |
| `enrichment_cancelled`          | `info`     | Target capture was deleted, dismissed, or superseded before the run could complete; run marked `cancelled`, never `failed`.                                                                                                                                                  | Evidence record — do not attach a notification.                                                                                                                                          |
| `enrichment_stage_completed`    | `info`     | One pipeline stage (image facts/caption/OCR, transcription, JSON-schema normalization) finished and wrote its suggestion output with provenance.                                                                                                                             | Evidence record — do not attach a notification.                                                                                                                                          |
| `enrichment_retryable_error`    | `error`    | A Workers AI call failed with a retryable class (timeout, capacity 429, platform 5xx); the run was requeued, not failed terminally.                                                                                                                                          | Investigate `traceId` if the retryable rate sustains above baseline for a window — an isolated occurrence is expected platform noise.                                                    |
| `enrichment_terminal_error`     | `critical` | A Workers AI call failed with a non-retryable class (invalid input, oversized payload, access/configuration error, unsupported media); run marked `failed` and awaits manual retry.                                                                                          | Investigate `traceId`; confirm the stored error is redacted (no raw payload, no secrets). A sustained rate above baseline usually means a model/config regression, not user input noise. |
| `enrichment_partial_completion` | `error`    | Field audio transcription timed out mid-stream; the partial transcript already produced is captured and preserved, not discarded by a subsequent retry.                                                                                                                      | Evidence record unless the partial rate spikes, which would indicate a systemic timeout regression rather than isolated long recordings.                                                 |
| `dispatch_batch_sent`           | `info`     | The pg_cron reconciler sent one batch of undispatched outbox rows to the Cloudflare Queue, because a Postgres transaction and a Queue send cannot be atomic.                                                                                                                 | Evidence record. Acceptance is a positive count: compare sent-row count against outbox backlog for the window, the same shape as the edge-api-worker's shadow-match acceptance evidence. |
| `dispatch_reconciler_stalled`   | `critical` | The reconciler produced zero `dispatch_batch_sent` events across an interval while the outbox backlog is nonzero.                                                                                                                                                            | Page: undispatched rows are stuck and enrichment is silently not happening. Check `job_runs` for the reconciler's pg_cron job and Queue health.                                          |
| `config_invalid`                | `critical` | Runtime configuration (Workers AI bindings, model IDs, queue binding) failed validation at startup.                                                                                                                                                                          | Page: the worker refuses to boot by design rather than run in an ambiguous state — same posture as `edge_api_configuration_invalid` in the edge API worker. Fix config and redeploy.     |
| `ssrf_redirect_rejected`        | `error`    | Extension URL-capture intake's fetch followed a redirect toward a private/reserved/loopback/link-local address and refused to continue.                                                                                                                                      | Investigate `traceId`. Expected count is at or near zero outside deliberate golden-set (`GS-02`) probes — any other occurrence warrants review.                                          |
| `nomic_job_key_collision`       | `critical` | Two different content revisions produced the same Nomic embedding job key — should be impossible by construction (`docs/engineering/patina-cloudflare-plan.md`: "content revision/hash becomes part of the Nomic job key so enrichment changes cannot leave stale vectors"). | Page immediately: audit job-key derivation before any stale vector can be served as current.                                                                                             |

Cloudflare email notification provisioning remains an operator action, same
as `infra/edge-api-worker`. This worker does not send external email.

## Structured log field allowlist

Log payloads for every event above contain only these fields — nothing
else, ever:

`event`, `severity`, `traceId`, `enrichmentRunId`, `contentRevision`,
`stage` (`image-facts` | `caption` | `ocr` | `transcription` |
`normalization`), `attempt`, `errorClass` (a coarse classification tag —
`timeout` | `capacity` | `platform-5xx` | `invalid-input` |
`oversized-payload` | `access-config` | `unsupported-media` — never the raw
error message or stack), `modelId`, `batchSize` (for `dispatch_batch_sent`),
`backlogCount`.

Never logged, under any event, in any field: source URLs, capture notes,
user identity (name/email/user ID), raw media bytes or file paths, raw
model output (captions/OCR text/transcripts), raw request/response bodies,
Workers AI account/auth tokens, or Supabase service-role credentials. This
mirrors the edge-api-worker's logging rule ("no tokens, API keys, cookies,
SQL parameters, URLs/PII, or bodies") and extends it to the AI-specific
surfaces this worker adds — do not log a caption or transcript "just for
debugging," even truncated; log the `traceId` and pull the record from
Postgres/R2 instead.

## No ad-hoc `console.log`

All worker output goes through the shared structured-log helper (mirroring
`infra/edge-api-worker`'s pattern once this worker has code) — never a bare
`console.log`/`console.error`. An ad-hoc log call bypasses the field
allowlist above and is exactly the mechanism that would leak a caption,
transcript, or source URL into log storage. Every log call names one of the
`event` values in the table above; a log call that doesn't fit an existing
event is a signal the event grid is incomplete and needs a new row here
before the code ships, not a reason to log unstructured text instead.
