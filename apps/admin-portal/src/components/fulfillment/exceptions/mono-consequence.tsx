'use client';

import { ledgerLineParts, type ConsequencePreview } from '@patina/fulfillment';

// The mono ledger-consequence block (S7, spec §5.5: "each showing its ledger
// consequence in mono before the operator commits"). Fed by the resolve RPC's
// preview — the SAME derivation that posts on commit, so what's shown here is
// byte-identical to what lands. DM Mono, tabular-nums, one line per posting;
// an honest "$0 — no financial posting" for a non-financial path.

export function MonoConsequence({ cons }: { cons: ConsequencePreview | null }) {
  if (!cons) return null;

  const empty = !cons.financial || cons.lines.length === 0;

  return (
    <div
      data-testid="mono-consequence"
      data-financial={cons.financial}
      className="mt-2 border-l-2 pl-3"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div
        className="text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Ledger consequence · before commit
      </div>
      {empty ? (
        <div
          className="mt-1 text-[0.8rem] tabular-nums text-[var(--text-body)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          $0 — no financial posting
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-0.5">
          {cons.lines.map((line, i) => {
            const p = ledgerLineParts(line);
            return (
              <div
                key={`${p.code}-${i}`}
                className="flex items-baseline justify-between gap-4 text-[0.8rem] tabular-nums text-[var(--text-body)]"
                style={{ fontFamily: 'var(--font-meta)' }}
              >
                <span className="text-[var(--text-muted)]">
                  {p.code} {p.name ?? ''}
                </span>
                <span className="whitespace-nowrap">
                  {p.side} {p.amount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
