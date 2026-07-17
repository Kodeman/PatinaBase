'use client';

import { toTransmissionLog, type FulfillmentComposerEvent } from '@patina/fulfillment';

// The Transmission Log (S3, spec §5.3). The log IS fulfillment_events filtered
// to the PO (+ the order's notification.* events) — append-only, rendered as
// DM Mono lines: "SENT · EMAIL · JUL 16 · 10:58 · MSG 8F3A". Keyword in sage;
// a warn-tone keyword (variance/exception) in terracotta. Chronological, ZERO
// edit affordances — a correction is another appended line, never an edit.

export function TransmissionLog({ events }: { events: FulfillmentComposerEvent[] }) {
  const lines = toTransmissionLog(events);

  return (
    <section data-testid="transmission-log">
      <div
        className="mb-2 text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Transmission log
      </div>

      {lines.length === 0 ? (
        <div
          data-testid="tx-log-empty"
          className="py-2 text-[0.72rem] text-[var(--text-subtle)]"
        >
          Nothing logged yet — a PO without a logged send has no SLA clock.
        </div>
      ) : (
        <ul>
          {lines.map((line) => (
            <li
              key={line.id}
              data-testid="tx-log-line"
              data-keyword={line.keyword}
              className="border-t py-[5px] text-[0.66rem] uppercase leading-relaxed tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-mono)', borderColor: 'var(--border-subtle, var(--border-default))', color: 'var(--text-muted)' }}
            >
              <span
                className="font-medium"
                style={{
                  color:
                    line.tone === 'warn'
                      ? 'var(--color-terracotta, var(--color-error))'
                      : 'var(--color-sage, var(--color-success))',
                }}
              >
                {line.keyword}
              </span>
              {' · '}
              {line.detail}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
