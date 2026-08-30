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
  /** The body this act discloses. An `aria-expanded` with nothing named is a
   *  state with no subject: the reader hears "collapsed" and has no way to
   *  reach what it controls. */
  'aria-controls'?: string;
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
  /** W5-C5 — this head's eyebrow arrives after a fetch, so its line box is
   *  held open from the first commit rather than inserted above the name when
   *  the query lands. */
  reserveEyebrow?: boolean;
  surfaceKey: string;
  regionKey: string;
  /** Primary-first: entry 0 renders inked. */
  actions: readonly RegionLedgerEntry[];
  /** When present, the head renders the Fold toggle for this body. */
  bodyId?: string;
  onFold?: () => void;
  /**
   * Silences the dev-mode guard below for a head that is neither foldable
   * nor ledgered by construction — a ratified state, not an oversight.
   * `previous-work.tsx` passes this for the empty record head (count 0, no
   * act, no body). Default `false`: the guard stays on everywhere else.
   */
  allowNoActs?: boolean;
  /**
   * W4-R1 — which of the ledger's acts print while the lens has not reached
   * this region. `'leader'` prints entry 0 alone: proposal §4 R2 says the one
   * inked leader prints at quiet and "the overflow group does not; it returns
   * when the region opens". The entries are not rendered rather than rendered
   * inert, because `DocumentActionGroup`'s one-leader guard and
   * `action-visibility.spec.ts` both COUNT `[data-action-key]` nodes — an
   * `aria-hidden` copy would still be one of them.
   *
   * The Fold toggle is not one of these: it is the region's own disclosure
   * control, rendered by this head rather than passed in `actions`, and it
   * carries the `aria-controls` that must keep naming a mounted body (W4-C7).
   */
  actsAtQuiet?: 'all' | 'leader';
}

export function RegionHead({
  headingId,
  name,
  status,
  exceptions = [],
  eyebrow,
  reserveEyebrow = false,
  surfaceKey,
  regionKey,
  actions,
  bodyId,
  onFold,
  allowNoActs = false,
  actsAtQuiet = 'all',
}: RegionHeadProps) {
  const showFold = Boolean(bodyId && onFold);
  const printedActions =
    actsAtQuiet === 'leader' ? actions.slice(0, 1) : actions;
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
    if (actions.length === 0 && !bodyId && !allowNoActs) {
      console.error(
        `RegionHead "${surfaceKey}/${regionKey}" has neither a ledger entry nor a foldable body; a head with no acts is a caption, not a head.`,
      );
    }
  }, [actions, allowNoActs, bodyId, regionKey, surfaceKey]);

  return (
    <div
      data-region-head={regionKey}
      // B4/B5 — the left track carries a FLOOR, not a bare `1fr`. `auto` sizes
      // the ledger column to its max-content (the acts are `whitespace-nowrap`
      // and `shrink-0`, so that is the whole ledger on one line) and `1fr`
      // takes only what is left: under the four-act Pieces ledger at 1440 that
      // left ~60px and the status broke one word per line. A `minmax(0,1fr)`
      // would change nothing — the left column already carries `min-w-0`, so
      // its automatic minimum is 0 either way. The floor is what caps the
      // ledger column, and the ledger's own `flex-wrap` does the rest.
      className="grid grid-cols-1 items-start gap-x-4 gap-y-2 min-[1180px]:grid-cols-[minmax(20rem,1fr)_auto]"
    >
      <div className="min-w-0">
        {/* W5-C5 — a head whose eyebrow ARRIVES (the proposal's version, the
            brief's `Respond by`, discovery's `Ready`) reserves the line from
            the first commit. Those three feeds all land after first paint, and
            a conditional `<p>` appearing above the `<h2>` pushes the name, the
            status line and every root below it down — H5's forbidden shift, in
            the head, and the same class D-B39 measured for the loading
            register. `min-h-[15.4px]` is one line of 11px mono at
            `leading-[1.4]`, the literal D-B38 uses on band line 1. Heads whose
            eyebrow is a constant (approvals, money, care) print exactly as
            before: nothing is reserved for a line that was never going to
            move. */}
        {(eyebrow || reserveEyebrow) && (
          <p
            className={`font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]${
              reserveEyebrow ? ' min-h-[15.4px]' : ''
            }`}
          >
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

      {(printedActions.length > 0 || showFold) && (
        <DocumentActionGroup
          surfaceKey={surfaceKey}
          regionKey={regionKey}
          aria-label={ledgerLabel}
          className="justify-start min-[1180px]:justify-end"
        >
          {printedActions.map((entry, index) => {
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
              'aria-controls': entry['aria-controls'],
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
