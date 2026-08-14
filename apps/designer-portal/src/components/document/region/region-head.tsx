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
  /** One-line status phrase, truncated rather than wrapped. */
  status: ReactNode;
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
  eyebrow,
  surfaceKey,
  regionKey,
  actions,
  bodyId,
  onFold,
}: RegionHeadProps) {
  const showFold = Boolean(bodyId && onFold);

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
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        )}
        <h2
          id={headingId}
          tabIndex={-1}
          className="font-heading text-[18px] font-medium text-[var(--color-charcoal)] outline-none"
        >
          {name}
        </h2>
        <p className="truncate text-[12.5px] text-[var(--color-mocha)]">
          {status}
        </p>
      </div>

      {(actions.length > 0 || showFold) && (
        <DocumentActionGroup
          surfaceKey={surfaceKey}
          regionKey={regionKey}
          className="justify-end"
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
