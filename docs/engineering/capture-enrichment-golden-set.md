# Capture enrichment golden-set case register

Expands `docs/engineering/patina-cloudflare-phase-1-runbook.md` §"Phase 3
capture contracts and golden set" (lines ~540-567) into named, numbered
cases. This register is the acceptance surface for Phase 3 (capture
enrichment) — every case below must have a passing executable test before
that family is considered done, at the tier assigned to it.

No case here has been built yet. This document only reserves names,
expected behavior, and test tiers ahead of code, per the C-A0 zero-cost
foundation workstream.

## Message contract under test

All cases exercise, directly or indirectly, the wire contract defined once
in `packages/types/src/capture-enrichment.ts`:

```ts
type CaptureEnrichmentMessageV1 = {
  schemaVersion: 1;
  enrichmentRunId: string;
  contentRevision: number;
  traceId: string;
};
```

## Test tiers

| Tier           | What it proves                                                                                                                                                                                                            | Where it runs                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB-sql`       | Ledger/state-machine correctness — `capture_enrichment_runs` transitions, outbox insertion atomicity, idempotent claim-by-revision, RLS on `proposal_captures`/`field_captures`. No network, no AI calls.                 | pgTAP / SQL test suite against a local Postgres (`supabase db reset` + seed), same lane as other migration tests.                                                                           |
| `workerd-mock` | Consumer/dispatcher logic — message parsing (`parseCaptureEnrichmentMessageV1`), retry classification, batch dispatch, Workers AI call shaping — against mocked bindings. No real model call, no real network egress.     | Miniflare/workerd unit test (vitest-pool-workers style), same lane as `infra/edge-api-worker` tests.                                                                                        |
| `live-metered` | Real Workers AI model behavior (moondream OCR/caption, whisper transcription, gemma normalization) that a mock cannot stand in for. Costs money and quota; kept to the smallest case set that proves real-model behavior. | Deployed staging Worker calling real Cloudflare-hosted models, run deliberately (not on every PR).                                                                                          |
| `deno-ssrf`    | Egress/redirect safety on the extension URL-capture intake path — the fetch that resolves a submitted product-image URL must not follow a redirect into a private/reserved address.                                       | Deno test against the intake edge function's fetch wrapper, isolated from the rest of the Deno edge-function suite because it asserts network-boundary behavior rather than business logic. |

`DB-sql` and `workerd-mock` are the default tiers — nearly every case below
runs on both because ledger correctness and dispatcher correctness are
usually two assertions on the same scenario. `live-metered` and `deno-ssrf`
are called out explicitly only where no cheaper tier can prove the behavior.

## Case register

### Family: extension URL capture — valid image

**GS-01 — Valid public product image, full enrichment success**

- Producer: Chrome extension URL capture.
- Setup: seed a `proposal_captures` row with a public, directly-fetchable
  product image URL; no existing `capture_enrichment_runs` row for it.
- Trigger: intake creates the source record + product and, in the same
  transaction, inserts the outbox row; pg_cron reconciler sends the
  `CaptureEnrichmentMessageV1`; consumer claims the run.
- Expected ledger state: `capture_enrichment_runs` moves
  `queued → running → ready`; `contentRevision` on the row matches the
  message; attempts = 1.
- Expected suggestion behavior: versioned suggestions (caption, OCR facts,
  normalized category/material/color/style) are written with provenance;
  no designer-entered field is touched.
- Tier: `DB-sql`, `workerd-mock`; `live-metered` for one instance of this
  case to prove the real moondream chain end to end.

### Family: SSRF / redirect safety

**GS-02 — Redirect to a private/reserved address is refused**

- Producer: Chrome extension URL capture.
- Setup: submitted product URL responds with a redirect (3xx) whose
  `Location` resolves to a private, loopback, link-local, or otherwise
  reserved address (RFC 1918 / RFC 5735 ranges, `169.254.169.254`, etc.).
- Trigger: intake's URL-resolution fetch follows the redirect chain.
- Expected ledger state: source record is created (capture still exists),
  but no `capture_enrichment_runs` row reaches `running`; enrichment is
  short-circuited before any outbound fetch to the resolved private target,
  and the run is marked terminal with a redacted error.
- Expected suggestion behavior: no suggestion is produced; no bytes from
  the private target are fetched or logged.
- Tier: `deno-ssrf` (primary — this is the case the tier exists for);
  `DB-sql` to confirm the terminal ledger state.

### Family: duplicate delivery and stale revision

**GS-03 — Duplicate delivery of the same message is a no-op**

- Producer: pg_cron reconciler (at-least-once redelivery) or Queue
  redelivery after a consumer ack that didn't commit cleanly.
- Setup: a run already reached `ready` for `enrichmentRunId` X at
  `contentRevision` N.
- Trigger: consumer receives a second `CaptureEnrichmentMessageV1` with the
  identical `enrichmentRunId`/`contentRevision`.
- Expected ledger state: unchanged — no second suggestion write, no
  duplicate `running` transition, attempts counter not incremented for a
  message the ledger recognizes as already resolved.
- Expected suggestion behavior: existing suggestions are untouched;
  duplicate is dropped silently at the ledger check, logged as
  `enrichment_duplicate_ignored`.
- Tier: `DB-sql`, `workerd-mock`.

**GS-04 — Stale content revision is ignored in favor of current**

- Producer: pg_cron reconciler delivering a message minted before a newer
  capture edit bumped the revision.
- Setup: capture's `contentRevision` has advanced from N to N+1 (e.g. the
  designer edited a field) after the outbox row for N was created but
  before it was consumed.
- Trigger: consumer receives the message for revision N.
- Expected ledger state: run for revision N is marked stale/ignored, not
  `ready`; no state transition on the current (N+1) revision's row from
  this delivery.
- Expected suggestion behavior: no suggestion write against revision N;
  only a later message keyed to N+1 may produce one.
- Tier: `DB-sql`, `workerd-mock`.

### Family: deleted / dismissed / superseded capture

**GS-05 — Source capture deleted before enrichment completes**

- Producer: designer-portal or Field delete action racing the enrichment
  consumer.
- Setup: capture is deleted (or soft-deleted per source-specific lifecycle)
  between outbox send and consumer claim.
- Trigger: consumer attempts to claim the run for the now-deleted target.
- Expected ledger state: run transitions to `cancelled`, not `ready` or
  `failed`; no orphaned `running` row.
- Expected suggestion behavior: no suggestion is written or surfaced;
  nothing references a deleted target.
- Tier: `DB-sql`, `workerd-mock`.

**GS-06 — Capture dismissed by the designer before enrichment completes**

- Producer: designer-portal dismiss action.
- Setup: capture status flips to dismissed after outbox insertion, before
  consumer claim.
- Trigger: consumer attempts to claim the run.
- Expected ledger state: run transitions to `cancelled`; dismissal on the
  source ledger is preserved untouched.
- Expected suggestion behavior: no suggestion is written; dismissed capture
  stays dismissed regardless of what enrichment would have found.
- Tier: `DB-sql`, `workerd-mock`.

**GS-07 — Capture superseded by a newer capture of the same target**

- Producer: repeat capture of the same product/source (e.g. re-scraped URL,
  re-photographed item) creating a newer capture that supersedes the
  original.
- Setup: original capture has an in-flight enrichment run; a newer capture
  is recorded as its supersession.
- Trigger: consumer attempts to claim the superseded run.
- Expected ledger state: superseded run transitions to `cancelled`; the
  superseding capture gets its own independent run.
- Expected suggestion behavior: suggestions, if any, attach only to the
  superseding capture's run — never backfilled onto the superseded one.
- Tier: `DB-sql`, `workerd-mock`.

### Family: personal / studio / catalog source semantics

**GS-08 — Personal-source capture enrichment scope**

- Producer: any capture surface, source flagged personal (private to the
  capturing user/designer).
- Setup: capture belongs to a personal, non-shared scope.
- Trigger: normal enrichment run.
- Expected ledger state: run proceeds normally; RLS on
  `capture_enrichment_runs`/`proposal_captures` restricts read to the
  owning actor only.
- Expected suggestion behavior: suggestions are visible only within the
  personal scope; never surfaced to other studio members or the catalog.
- Tier: `DB-sql`.

**GS-09 — Studio-source capture enrichment scope**

- Producer: any capture surface, source flagged studio-shared.
- Setup: capture belongs to a studio, visible to co-members per studio RLS.
- Trigger: normal enrichment run.
- Expected ledger state: run proceeds normally; RLS allows studio
  co-members to read the run/suggestions, not just the original capturer.
- Expected suggestion behavior: suggestions visible studio-wide; still
  never overwrite a co-member's confirmed edits (see GS-16).
- Tier: `DB-sql`.

**GS-10 — Catalog-source capture enrichment scope**

- Producer: capture destined for/attached to a shared product-catalog
  entry.
- Setup: capture's target is a catalog product, not a personal/studio-only
  record.
- Trigger: normal enrichment run.
- Expected ledger state: run proceeds; catalog visibility rules (not
  studio/personal RLS) gate who can read the resulting suggestions.
- Expected suggestion behavior: suggestions feed catalog-facing fields only
  through the same "suggestion never overwrites confirmed data" rule,
  scoped to catalog data ownership.
- Tier: `DB-sql`.

### Family: multilingual OCR and normalization

**GS-11 — Multilingual OCR with English normalization and original retention**

- Producer: extension URL capture or Field capture with in-image text in a
  non-English language (e.g. a foreign-language product label).
- Setup: source image contains non-English text Moondream can OCR.
- Trigger: OCR + normalization chain runs (`moondream3.1-9B-A2B` for OCR,
  `gemma-4-26b-a4b-it` for JSON-schema normalization).
- Expected ledger state: run reaches `ready`; suggestion payload carries
  both the original-language OCR text and its English-normalized form as
  distinct fields (never a lossy overwrite of one by the other).
- Expected suggestion behavior: normalized (English) text feeds
  matching/suggestion fields; original text is retained verbatim alongside
  it and follows the capture lifecycle (deleted/dismissed capture takes the
  derived OCR text with it).
- Tier: `workerd-mock` (mocked model output fixtures covering at least two
  source languages); `live-metered` for one real pass to confirm the actual
  model's normalization behavior.

### Family: Field audio transcription

**GS-12 — Field audio transcription success**

- Producer: Patina Field capture with a voice note.
- Setup: audio is a supported format/duration within Whisper limits.
- Trigger: asynchronous transcription (`@cf/openai/whisper-large-v3-turbo`)
  completes normally.
- Expected ledger state: run reaches `ready`; transcript recorded with
  model metadata.
- Expected suggestion behavior: transcript-derived suggestions follow the
  same never-overwrite rule as image-derived ones.
- Tier: `workerd-mock`; `live-metered` for one real pass.

**GS-13 — Field audio unsupported media**

- Producer: Patina Field capture with an audio format/codec Whisper cannot
  process.
- Setup: audio file has an unsupported container/codec or is corrupt.
- Trigger: transcription call is attempted.
- Expected ledger state: run reaches a terminal state (not endlessly
  retried) — unsupported media is classified terminal, not a
  timeout/capacity retry candidate per the runbook's retry rule ("invalid
  input, oversized payload, access/configuration errors, and unsupported
  media are terminal or partial completion").
- Expected suggestion behavior: no transcript suggestion is produced; error
  is redacted in the stored `error` field (no raw file content/paths
  logged).
- Tier: `workerd-mock`.

**GS-14 — Field audio timeout with partial completion**

- Producer: Patina Field capture with a long voice note.
- Setup: transcription exceeds the platform timeout mid-stream.
- Trigger: Workers AI call times out after producing partial output.
- Expected ledger state: run captures whatever partial transcript exists
  and records a partial-completion status distinct from full `ready` and
  from hard `failed`; timeout itself is retryable per the runbook's retry
  classification (retry only timeouts, capacity 429s, platform 5xx) but the
  partial artifact already captured is not discarded by a retry.
- Expected suggestion behavior: any suggestion derived from the partial
  transcript is marked with its partial provenance so it is visually
  distinguishable from a full transcript's suggestion.
- Tier: `workerd-mock`.

### Family: suggestion precedence over confirmed data

**GS-15 — Empty field is prefilled by a suggestion**

- Producer: any enrichment run whose target field (e.g. material, color)
  is currently empty/unset.
- Setup: target field has never been set by a designer or device
  confirmation.
- Trigger: enrichment produces a suggestion for that field.
- Expected ledger state: run reaches `ready`; suggestion recorded with
  provenance.
- Expected suggestion behavior: the empty field is prefilled from the
  suggestion (this is the one path where a suggestion is allowed to change
  visible data, and only because there was no confirmed value to protect).
- Tier: `DB-sql`.

**GS-16 — Designer-entered field is never overwritten by a suggestion**

- Producer: any enrichment run whose target field already has a
  designer-entered or device-confirmed value.
- Setup: field was explicitly set by a human (or confirmed device data)
  before the enrichment run.
- Trigger: enrichment produces a conflicting suggestion for the same field.
- Expected ledger state: run reaches `ready`; suggestion is recorded as a
  suggestion, not applied.
- Expected suggestion behavior: the confirmed field value is byte-for-byte
  unchanged after the run; the suggestion is surfaced as a proposed
  alternative only, never auto-applied. This is the negative-space case
  proving "AI output is always a suggestion."
- Tier: `DB-sql`, `workerd-mock`.

### Family: controlled-vocabulary matching

**GS-17 — Matched controlled-vocabulary candidate**

- Producer: any enrichment run producing a category/material/color/style
  candidate.
- Setup: candidate value produced by normalization matches an entry in the
  current controlled vocabulary (category/material/color/style tables).
- Trigger: matching step runs against the vocabulary current at run time.
- Expected ledger state: run reaches `ready`; matched candidate recorded
  with a reference to the matched vocabulary entry.
- Expected suggestion behavior: matched suggestion is eligible to prefill
  an empty field (per GS-15) using the canonical vocabulary value, not the
  raw model string.
- Tier: `DB-sql`, `workerd-mock`.

**GS-18 — Unmatched controlled-vocabulary candidate retained separately**

- Producer: any enrichment run producing a candidate with no controlled-
  vocabulary match (e.g. a novel material name).
- Setup: normalization output has no matching entry in the current
  vocabulary snapshot.
- Trigger: matching step finds no match.
- Expected ledger state: run reaches `ready`; unmatched candidate is stored
  in a distinct field/slot from matched candidates, not silently dropped
  and not force-matched to the nearest vocabulary entry.
- Expected suggestion behavior: unmatched candidate is surfaced to the
  designer as free text / "new value" rather than prefilling a controlled
  field as if it were a canonical match.
- Tier: `DB-sql`, `workerd-mock`.

### Family: terminal error and manual retry

**GS-19 — Terminal model/config error**

- Producer: any enrichment run hitting a non-retryable failure (invalid
  input, oversized payload, access/configuration error).
- Setup: e.g. a malformed image, a payload exceeding the model's size
  limit, or a misconfigured Workers AI binding/access token.
- Trigger: Workers AI call returns the corresponding error class.
- Expected ledger state: run transitions straight to `failed` (terminal),
  not `queued` for another automatic attempt; error is redacted before
  storage (no raw payload, no secrets).
- Expected suggestion behavior: no suggestion is produced; UI must surface
  that the run failed terminally and needs manual action.
- Tier: `workerd-mock`.

**GS-20 — Manual retry after terminal error**

- Producer: designer or Field user triggering a manual retry action on a
  `failed` run.
- Setup: run from GS-19 is in `failed` state.
- Trigger: manual retry request re-queues enrichment for the same target at
  its current `contentRevision`.
- Expected ledger state: a fresh run (or the existing row reset to
  `queued`, per the chosen retry model) is created with attempts tracked
  separately from the original failed attempt; original failed run remains
  auditable, not deleted.
- Expected suggestion behavior: if the retry succeeds, suggestions are
  written normally (per GS-01); if it fails again, GS-19 applies again.
- Tier: `DB-sql`, `workerd-mock`.

### Family: embedding freshness

**GS-21 — Nomic job key changes with content revision/hash**

- Producer: the Nomic embedding pipeline (inference Container), triggered
  independently of Workers AI enrichment.
- Setup: a capture/product's content revision or hash changes (e.g. because
  enrichment or a designer edit changed embeddable fields).
- Trigger: a Nomic embedding job is enqueued for the target.
- Expected ledger state: the job key embeds the current content
  revision/hash, distinct from the job key used for the prior revision — no
  shared idempotency key across revisions.
- Expected suggestion behavior: not applicable (this family verifies
  vector freshness, not AI suggestions); the assertion is that a stale
  vector from a prior revision is never returned as current because its
  job key can never collide with the current revision's key.
- Tier: `DB-sql`.

### Family: message envelope validation

**GS-22 — Malformed queue message is rejected, not thrown past**

- Producer: any producer path (pg_cron dispatcher or a bug injecting a
  malformed body), exercising `parseCaptureEnrichmentMessageV1` directly.
- Setup: message bodies missing a required field, with `schemaVersion` not
  equal to `1`, with a non-integer/negative `contentRevision`, or with a
  non-object body.
- Trigger: consumer calls `parseCaptureEnrichmentMessageV1(body)` on
  receipt, before any ledger read.
- Expected ledger state: no ledger row is touched — validation fails before
  any claim attempt.
- Expected suggestion behavior: not applicable; this case is purely about
  the envelope, one layer beneath any ledger/suggestion behavior.
- Tier: `workerd-mock` (this is also the natural home for
  `@patina/types` unit tests of the validator itself, run in that
  package's own `type-check`/test lane rather than a Worker runtime).

## Coverage summary

| Runbook family                                                       | Cases               |
| -------------------------------------------------------------------- | ------------------- |
| Valid public-image extension capture                                 | GS-01               |
| Redirect to private/reserved address                                 | GS-02               |
| Duplicate delivery / stale revision                                  | GS-03, GS-04        |
| Deleted / dismissed / superseded                                     | GS-05, GS-06, GS-07 |
| Personal / studio / catalog semantics                                | GS-08, GS-09, GS-10 |
| Multilingual OCR + English normalization                             | GS-11               |
| Field audio success / unsupported / timeout-partial                  | GS-12, GS-13, GS-14 |
| Empty vs. designer-entered precedence                                | GS-15, GS-16        |
| Matched / unmatched vocabulary                                       | GS-17, GS-18        |
| Terminal error + manual retry                                        | GS-19, GS-20        |
| Nomic job key keyed to content revision                              | GS-21               |
| Message envelope validation (contract-adjacent, not in runbook list) | GS-22               |

22 cases total across 4 tiers (`DB-sql`, `workerd-mock`, `live-metered`,
`deno-ssrf`). None are built yet — this register exists so the Phase 3
build wave has named acceptance criteria before any enrichment code lands.
