/**
 * Capture enrichment queue message contract (schema v1).
 *
 * Source of truth: docs/engineering/patina-cloudflare-plan.md, "Phase 3
 * target: capture enrichment" > "Outbox and queue contract". This is the
 * single definition shared by the pg_cron dispatcher (producer), the
 * Cloudflare Queue send path, and the enrichment consumer — never redefine
 * this shape elsewhere.
 *
 * The message is intentionally minimal: it carries no source URLs, notes,
 * user identity, or media bytes. The consumer loads authoritative
 * Postgres/R2 state keyed by `enrichmentRunId` and `contentRevision`; the
 * database ledger — not Queue delivery order — decides idempotency and
 * current revision, because Cloudflare Queues delivery is at-least-once and
 * unordered.
 */
export type CaptureEnrichmentMessageV1 = {
  /** Discriminant. Always the literal 1 for this message shape. */
  schemaVersion: 1;
  /** Primary key of the `capture_enrichment_runs` row this message targets. */
  enrichmentRunId: string;
  /** Content revision/hash the run was queued against; stale revisions are ignored by the consumer. */
  contentRevision: number;
  /** Correlation ID threaded through producer, dispatcher, and consumer logs. */
  traceId: string;
};

/** One field-level validation failure from {@link parseCaptureEnrichmentMessageV1}. */
export type CaptureEnrichmentMessageV1ParseError = {
  /** Name of the offending field, or `(root)` when the input itself is not a plausible object. */
  field: keyof CaptureEnrichmentMessageV1 | '(root)';
  reason: string;
};

/**
 * Discriminated ok/error result for {@link parseCaptureEnrichmentMessageV1}.
 * Prefer this over throwing: the consumer runs inside a Queue handler where
 * an uncaught throw retries the whole batch rather than classifying one bad
 * message.
 */
export type CaptureEnrichmentMessageV1ParseResult =
  | { ok: true; value: CaptureEnrichmentMessageV1 }
  | { ok: false; errors: CaptureEnrichmentMessageV1ParseError[] };

/**
 * Runtime validator for {@link CaptureEnrichmentMessageV1}. Hand-rolled, no
 * dependencies, so it can be imported from any runtime (Postgres-triggered
 * dispatcher, Cloudflare Worker producer, Cloudflare Queue consumer) without
 * pulling in a schema library.
 *
 * Accepts `unknown` because every call site is a deserialization boundary
 * (Queue message body, dispatcher payload, test fixture) where the shape is
 * not yet trusted. Collects every field error rather than failing fast, so
 * a caller can log/report the full set of problems in one line.
 */
export function parseCaptureEnrichmentMessageV1(input: unknown): CaptureEnrichmentMessageV1ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ field: '(root)', reason: 'expected a non-null, non-array object' }],
    };
  }

  const record = input as Record<string, unknown>;
  const errors: CaptureEnrichmentMessageV1ParseError[] = [];

  if (record.schemaVersion !== 1) {
    errors.push({ field: 'schemaVersion', reason: 'must be the literal number 1' });
  }

  if (typeof record.enrichmentRunId !== 'string' || record.enrichmentRunId.trim().length === 0) {
    errors.push({ field: 'enrichmentRunId', reason: 'must be a non-empty string' });
  }

  if (
    typeof record.contentRevision !== 'number' ||
    !Number.isFinite(record.contentRevision) ||
    !Number.isInteger(record.contentRevision) ||
    record.contentRevision < 0
  ) {
    errors.push({ field: 'contentRevision', reason: 'must be a non-negative integer' });
  }

  if (typeof record.traceId !== 'string' || record.traceId.trim().length === 0) {
    errors.push({ field: 'traceId', reason: 'must be a non-empty string' });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      enrichmentRunId: record.enrichmentRunId as string,
      contentRevision: record.contentRevision as number,
      traceId: record.traceId as string,
    },
  };
}
