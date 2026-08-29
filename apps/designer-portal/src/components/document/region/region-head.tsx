'use client';

/**
 * The head of a Project region — two registers on one line: the region's name
 * and its one-line state on the left (serif, the document's own voice), its
 * ledger of acts on the right (Scored Ink words, never boxes).
 *
 * The ledger's ORDER is its hierarchy: entry 0 is the region's leader and is
 * rendered `inked` whatever it declares; everything after it is a secondary or
 * quieter word. That is why `variant` on entry 0 is ignored rather than
 * honored — a caller cannot demote the leader by relabelling it, and cannot
 * promote a second leader by spelling one.
 *
 * F28/F87 and direction-b §6 M4 — the head is a two-track grid only from
 * 1180px. Below that the heading stacks ABOVE its ledger, because a two-track
 * grid at 390 puts the inked leader over the region's own name. The status
 * carries direction-b's wrap discipline: line one is identity and never
 * elides; line two is the worst two exceptions in tie-break order; a third is
 * dropped whole, never abbreviated; nothing cuts mid-word.
 *
 * What the breakpoint moves is LAYOUT only. The ledger's action region —
 * role="group" + an accessible name + data-action-region — is the contract
 * `action-visibility.spec.ts` and DocumentActionGroup's one-leader guard
 * query, and it rides the same element at every width, stacked or two-track.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  DocumentAction,
  DocumentActionGroup,
  type DocumentActionVariant,
} from '../document-action';

export interface RegionLedgerEntry {
  /** DocumentAction actionKey — stable telemetry identity. */
  key: string;
  label: ReactNode;
  onClick?: () => void;
  /** Link-form entries render as an anchor rather than a button. */
  href?: string;
  /** Ignored at index 0, which is always the inked leader. */
  variant?: 'secondary' | 'tertiary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: ReactNode;
  trailing?: ReactNode;
  'aria-expanded'?: boolean;
}

export interface RegionHeadProps {
  headingId: string;
  /** Serif register — the region's name. */
  name: ReactNode;
  /** Line one — the region's identity. Wraps; never elides, never truncates. */
  status: ReactNode;
  /**
   * Line two — the exceptions standing on the region, sharpest first. At most
   * two print; a third is dropped whole rather than abbreviated.
   */
  exceptions?: readonly ReactNode[];
  eyebrow?: ReactNode;
  surfaceKey: string;
  regionKey: string;
  /** Primary-first: entry 0 renders inked. */
  actions: readonly RegionLedgerEntry[];
  /** When present, the head renders the Fold toggle for this body. */
  bodyId?: string;
  onFold?: () => void;
}

export function RegionHead({
  headingId,
  name,
  status,
  exceptions = [],
  eyebrow,
  surfaceKey,
  regionKey,
  actions,
  bodyId,
  onFold,
}: RegionHeadProps) {
  const showFold = Boolean(bodyId && onFold);
  const printedExceptions = exceptions.slice(0, 2);
  // The ledger is a NAMED action region, not an anonymous box. The Room heads
  // that predate this primitive name theirs by hand ("Library actions",
  // "People actions", "Drafting actions"); a RegionHead's ledger carried
  // role="group" and data-action-region with no accessible name at all, so a
  // screen reader announced an unnamed group and every one of them sounded
  // alike. `name` is the region's own word, so the name follows it.
  const ledgerLabel =
    typeof name === 'string' ? `${name} actions` : undefined;

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const misdeclared = actions
      .slice(1)
      .filter(
        (entry) =>
          (entry.variant as DocumentActionVariant | undefined) === 'inked',
      );
    if (misdeclared.length > 0) {
      console.error(
        `RegionHead "${surfaceKey}/${regionKey}" declares an inked variant at ledger index > 0 (${misdeclared
          .map((entry) => entry.key)
          .join(', ')}); only the leading entry is inked.`,
      );
    }
    if (actions.length === 0 && !bodyId) {
      console.error(
        `RegionHead "${surfaceKey}/${regionKey}" has neither a ledger entry nor a foldable body; a head with no acts is a caption, not a head.`,
      );
    }
  }, [actions, bodyId, regionKey, surfaceKey]);

  return (
    <div
      data-region-head={regionKey}
      className="grid grid-cols-1 items-start gap-x-4 gap-y-2 min-[1180px]:grid-cols-[1fr_auto]"
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        )}
        <h2
          id={headingId}
          tabIndex={-1}
          className="font-heading text-[24px] font-medium leading-[1.2] text-[var(--text-primary)] outline-none"
        >
          {name}
        </h2>
        <p className="text-[12.5px] text-[var(--color-mocha)]">{status}</p>
        {printedExceptions.length > 0 && (
          <p className="text-[12.5px] text-[var(--color-mocha)]">
            {printedExceptions.map((exception, index) => (
              <span key={index}>
                {index > 0 && ' · '}
                {exception}
              </span>
            ))}
          </p>
        )}
      </div>

      {(actions.length > 0 || showFold) && (
        <DocumentActionGroup
          surfaceKey={surfaceKey}
          regionKey={regionKey}
          aria-label={ledgerLabel}
          className="justify-start min-[1180px]:justify-end"
        >
          {actions.map((entry, index) => {
            const variant: DocumentActionVariant =
              index === 0 ? 'inked' : (entry.variant ?? 'secondary');
            const shared = {
              actionKey: entry.key,
              variant,
              disabled: entry.disabled,
              loading: entry.loading,
              loadingLabel: entry.loadingLabel,
              trailing: entry.trailing,
              'aria-expanded': entry['aria-expanded'],
            };
            return entry.href ? (
              <DocumentAction key={entry.key} {...shared} href={entry.href}>
                {entry.label}
              </DocumentAction>
            ) : (
              <DocumentAction key={entry.key} {...shared} onClick={entry.onClick}>
                {entry.label}
              </DocumentAction>
            );
          })}
          {showFold && (
            <DocumentAction
              actionKey={`${regionKey}-fold`}
              variant="tertiary"
              aria-expanded
              aria-controls={bodyId}
              onClick={onFold}
            >
              Fold ↑
            </DocumentAction>
          )}
        </DocumentActionGroup>
      )}
    </div>
  );
}
