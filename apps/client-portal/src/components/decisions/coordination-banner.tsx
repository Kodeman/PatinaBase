'use client';

import type { CoordinationKind, Court } from '@patina/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// Track 5 — The Client Mirror.
//
// A small, type + court-aware banner that sits at the head of a coordination
// item in the client portal. It tells the client one thing plainly: whether
// this item is theirs to act on ("Your move") or something their designer is
// carrying on their behalf ("Your designer is handling this").
//
// Selections and sign-offs in the client's court keep their existing
// actionable UI and never render this read-only "handling" state — the card
// decides which path to take. This banner is the read-only signpost for
// everything else (RFIs, submittals, punch items, or anything sitting in the
// designer / GC / vendor court).
//
// Document ethos: zero shadows (D4), typography-first hierarchy, the quiet
// "waiting on your designer" intent from the prototype (no toast, no badge).
// ═══════════════════════════════════════════════════════════════════════════

/** The human label for each coordination kind, as the client should read it. */
const KIND_LABELS: Record<CoordinationKind, string> = {
  selection: 'Selection',
  rfi: 'Question',
  submittal: 'Submittal',
  signoff: 'Sign-off',
  punch: 'Punch item',
};

/** Who the client is waiting on, when the item is not in their court. */
const COURT_WAITING_LABEL: Partial<Record<Court, string>> = {
  designer: 'Your designer is handling this',
  gc: 'Your designer is handling this with the builder',
  vendor: 'Your designer is handling this with the vendor',
};

interface CoordinationBannerProps {
  kind: CoordinationKind;
  court: Court;
}

export function CoordinationBanner({ kind, court }: CoordinationBannerProps) {
  const isClientMove = court === 'client';
  const typeLabel = KIND_LABELS[kind] ?? 'Open item';

  if (isClientMove) {
    return (
      <div
        className="mb-3 flex items-center gap-2 rounded-[3px] px-3 py-2"
        style={{
          background: 'rgba(196, 165, 123, 0.06)',
          border: '1px solid rgba(196, 165, 123, 0.18)',
        }}
        data-testid="coordination-banner"
        data-court="client"
        data-kind={kind}
      >
        <span className="type-meta-small text-[var(--accent-primary)]">{typeLabel}</span>
        <span aria-hidden className="text-[var(--text-muted)]">&middot;</span>
        <span className="type-meta text-[var(--accent-primary)]">Your move</span>
      </div>
    );
  }

  const waitingLabel = COURT_WAITING_LABEL[court] ?? 'Your designer is handling this';

  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-[3px] px-3 py-2"
      style={{
        background: 'rgba(139, 156, 173, 0.05)',
        border: '1px solid rgba(139, 156, 173, 0.14)',
      }}
      data-testid="coordination-banner"
      data-court={court}
      data-kind={kind}
    >
      <span className="type-meta-small text-[var(--text-muted)]">{typeLabel}</span>
      <span aria-hidden className="text-[var(--text-muted)]">&middot;</span>
      <span className="type-body-small text-[var(--text-body)]">{waitingLabel}</span>
    </div>
  );
}
