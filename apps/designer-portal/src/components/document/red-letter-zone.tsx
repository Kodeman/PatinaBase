'use client';

/**
 * The red letter — every need the document is carrying, printed once, in one
 * place, at the top of the page.
 *
 * It is a region, not an alert: the needs are already true when the page opens
 * and nothing about them is a live interruption, so it must never seize a
 * screen reader mid-sentence the way role="alert" would.
 */

import type { NeedKind } from '@/lib/document/desk-derivation';
import { DocumentAction, DocumentActionGroup } from './document-action';

// SP-20/F41 — every need kind already carries a stamp colour at its point of
// derivation (desk-derivation.ts's STAMP palette, read at NeedLine.stamp.color);
// these are the SAME tokens, copied here only because those per-rule stamp
// objects aren't exported as a kind-keyed lookup. Token VALUES are B3-L1's to
// change; this map only decides which existing token each row's folio dot
// wears, and never invents a new one.
//
// One deliberate divergence: upstream both `schedule_unconfigured` (the setup
// chore) and `task_due` (the dated overdue need) stamp clay, which is exactly
// the pair SP-20 exists to tell apart. The setup tier takes dusty blue here —
// the token the surface already spends on quiet, non-obstructing needs
// (reconnect_due, po_unacknowledged) — so the two kinds the plank names read
// differently at a glance.
const NEED_KIND_STAMP_COLOR: Record<NeedKind, string> = {
  overdue_decision: 'var(--color-terracotta)',
  overdue_invoice: 'var(--color-terracotta)',
  proposal_signed: 'var(--color-sage)',
  damage_claim: 'var(--color-terracotta)',
  proposal_declined: 'var(--color-terracotta)',
  proposal_expired: 'var(--color-terracotta)',
  lines_flagged: 'var(--color-clay)',
  new_lead: 'var(--color-clay)',
  ceremony_pending: 'var(--color-clay)',
  reconnect_due: 'var(--color-dusty-blue)',
  hesitating_proposal: 'var(--color-dusty-blue)',
  awaiting_inspection: 'var(--color-sage)',
  schedule_conflict: 'var(--color-terracotta)',
  schedule_proposal: 'var(--color-clay)',
  task_due: 'var(--color-clay)',
  schedule_unconfigured: 'var(--color-dusty-blue)',
  po_unsent: 'var(--color-clay)',
  po_unacknowledged: 'var(--color-dusty-blue)',
  pulse_due: 'var(--color-sage)',
};

export interface RedLetterRow {
  key: string;
  kind: NeedKind;
  text: string;
  actionLabel: string | null;
  onAct: () => void;
  urgent: boolean;
  /** N-01 — the ISO day the need is DUE on (`NeedLine.dueOn`), carried
   *  through rather than left to be scraped back out of `text`. The desk's
   *  templates print DATES ("— oldest due Aug 23"), never day counts, so a
   *  regex over the sentence finds nothing and every deadline collapses to the
   *  same distance. `null` where the rule states no date even in its prose. */
  dueOn?: string | null;
}

/**
 * The zone's model, for the lens band (C-6).
 *
 * The rows are the zone's own, in the order the desk ranked them; `primary` is
 * F07's first row, the most urgent thing the paper is carrying. The band's
 * line 2 is now the one printing of that act at every width (OD-11 / DL-05),
 * so this zone no longer registers it with `useMobilePrimaryAction`.
 */
export interface RedLetterModel {
  rows: readonly RedLetterRow[];
  primary: RedLetterRow | null;
}

export function deriveRedLetterModel(
  rows: readonly RedLetterRow[],
): RedLetterModel {
  const first = rows[0];
  return { rows, primary: first?.actionLabel ? first : null };
}

export function RedLetterZone({ rows }: { rows: readonly RedLetterRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Needs attention"
      className="rounded-[3px] border-l-2 border-[var(--color-terracotta)] bg-[rgba(212,160,144,0.08)] px-3.5 py-2.5"
    >
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
        Needs attention · in one place
      </p>
      {/* ONE group for the whole zone: the rows are one ledger of acts, not N
          anonymous groups of one. Its width is the list's — the group frame is
          a flex container, so the list is its single full-width child. */}
      <DocumentActionGroup
        surfaceKey="document"
        regionKey="red-letter"
        aria-label="Needs attention actions"
      >
        <ul className="mt-1.5 w-full">
          {rows.map((row, index) => (
            <li
              key={row.key}
              data-need-kind={row.kind}
              data-need-urgent={row.urgent || undefined}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-dashed border-[rgba(139,115,85,0.14)] py-1 last:border-b-0"
            >
              {/* The dot never grows a count, a label, or a second urgency
                  tier (C4/D8); it only tells a setup chore from a dated
                  overdue need at a glance. */}
              <p
                className={`font-heading text-[14px] text-[var(--color-charcoal)] ${
                  row.urgent ? 'font-medium' : 'font-normal'
                }`}
              >
                <span
                  aria-hidden="true"
                  data-need-stamp
                  data-stamp-color={NEED_KIND_STAMP_COLOR[row.kind]}
                  className="mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle"
                  style={{ backgroundColor: NEED_KIND_STAMP_COLOR[row.kind] }}
                />
                {row.text}
              </p>
              {row.actionLabel && (
                <DocumentAction
                  // Two needs of the same kind are two acts; an index-free key
                  // would file both under one telemetry identity.
                  actionKey={`red-letter-${row.kind}-${index}`}
                  variant="secondary"
                  onClick={row.onAct}
                >
                  {row.actionLabel}
                </DocumentAction>
              )}
            </li>
          ))}
        </ul>
      </DocumentActionGroup>
    </section>
  );
}
