'use client';

/**
 * The head of a Project region (US-46 B, the US-42 deck's slide 10), one
 * left-justified column at every width, read down the left edge:
 *
 *   1. the region's name as a `.t-d2` heading (US-43 R2, 26px Playfair,
 *      sentence case as authored), with the quiet Fold toggle beside it on
 *      the same baseline, wrapping under the name when the line is short;
 *   2. one `.t-body` ink status sentence, plus its exceptions;
 *   3. the single scored lead, alone on its own line;
 *   4. the remaining tools on one wrapping row beneath it.
 *
 * The mono eyebrow, when a head has one, still prints above the name: `h2 + p`
 * must stay the status (prework-regions e2e), and the W5-C5 reserve below
 * holds that line's box open from the first commit.
 *
 * The ledger's ORDER is its hierarchy (US-43 R4): entry 0 is the section's one
 * scored lead and renders `primary` (ink over clay scores, unfilled) unless the
 * caller declares its variant; every later entry keeps its declared variant,
 * `secondary` by default. A caller cannot promote a second lead.
 *
 * The status carries direction-b's wrap discipline: line one is identity and
 * never elides; line two is the worst two exceptions in tie-break order; a
 * third is dropped whole, never abbreviated; nothing cuts mid-word.
 *
 * The lead line and the tools row are two lines of ONE action region —
 * role="group" + an accessible name + data-action-region — because that is
 * the contract `action-visibility.spec.ts` and DocumentActionGroup's
 * one-leader guard query: one named group per head, leader inside it.
 */

import type { ReactNode } from 'react';
import { useEffect, useId } from 'react';
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
  actionRef?: React.Ref<HTMLButtonElement>;
  /** Link-form entries render as an anchor rather than a button. */
  href?: string;
  /** At index 0, omitted means the scored `primary` lead (unless the head is `leaderless`). */
  variant?: 'secondary' | 'tertiary' | 'danger';
  disabled?: boolean;
  /**
   * D3 Gated — why a `disabled` act cannot be taken. With a reason the act is
   * `held` rather than natively disabled: it stays in tab order, reads
   * `aria-disabled="true"`, swallows the press, and this one muted sentence
   * prints beneath the ledger, linked by `aria-describedby`.
   */
  reason?: ReactNode;
  holds?: import('@/lib/document/spotlight/use-hold-spotlight').SpotlightHold[];
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
  /** Lead-first: entry 0 renders primary unless it declares a variant. */
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
   * leader prints at quiet and "the overflow group does not; it returns
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
  /**
   * US-19 499-2 / F2-12 (P-1) — `false` declares a head with no scored leader:
   * entry 0 prints its own declared weight (`secondary` when none), as every
   * other entry does, and at quiet no act prints. Only the caller that knows
   * nothing leads its region says so; the default makes entry 0 the lead.
   */
  leader?: boolean;
  /**
   * R3 — the head stands as a LANDMARK and prints nothing. The `<h2>` keeps
   * its id and its -1 tabindex so the rail's jumps still land and the heading
   * outline is unbroken; it is `sr-only`, and the eyebrow, the status line and
   * the exceptions are not rendered at all. The band states the standing fact
   * at these stops, and a head that restates it is the second printing R3
   * removes.
   */
  silent?: boolean;
  /**
   * US-19 FR2 F2-13 (R150 R5, `one-voice`) — the region has no scored leader
   * at all: entry 0 keeps its declared variant (secondary by default). The
   * caller sets it when its first act is a create act with no standing need
   * behind it; it can still never promote a second leader.
   */
  leaderless?: boolean;
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
  leader: leaderProp = true,
  silent = false,
  leaderless = false,
}: RegionHeadProps) {
  // SQ-514 `leader` (no receivable due) and SQ-518 `leaderless` (a create act
  // at index 0) both leave entry 0 its declared variant.
  const leads = leaderProp && !leaderless;
  const showFold = Boolean(bodyId && onFold);
  const printedActions =
    actsAtQuiet === 'leader' ? actions.slice(0, leads ? 1 : 0) : actions;
  const printedExceptions = silent ? [] : exceptions.slice(0, 2);
  const reasonIdBase = useId();
  const reasonId = (entry: RegionLedgerEntry) => `${reasonIdBase}-${entry.key}-reason`;
  const isHeld = (entry: RegionLedgerEntry) =>
    Boolean(entry.disabled && entry.reason);
  // The elected lead stands alone on its own line; every other act sits on the
  // tools row beneath it. A head that does not lead puts entry 0 on that row.
  const leadEntry = leads ? printedActions[0] : undefined;
  const toolEntries = leadEntry ? printedActions.slice(1) : printedActions;
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
    const misdeclared = actions.slice(1).filter((entry) => {
      const declared = entry.variant as DocumentActionVariant | undefined;
      return declared === 'primary';
    });
    if (misdeclared.length > 0) {
      console.error(
        `RegionHead "${surfaceKey}/${regionKey}" declares a lead variant at ledger index > 0 (${misdeclared
          .map((entry) => entry.key)
          .join(', ')}); only the leading entry leads.`,
      );
    }
    if (actions.length === 0 && !bodyId && !allowNoActs) {
      console.error(
        `RegionHead "${surfaceKey}/${regionKey}" has neither a ledger entry nor a foldable body; a head with no acts is a caption, not a head.`,
      );
    }
  }, [actions, allowNoActs, bodyId, regionKey, surfaceKey]);

  const renderEntry = (entry: RegionLedgerEntry, variant: DocumentActionVariant) => {
    const shared = {
      actionKey: entry.key,
      variant,
      disabled: entry.disabled,
      held: isHeld(entry),
      holds: entry.holds,
      'aria-describedby': isHeld(entry) ? reasonId(entry) : undefined,
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
      <DocumentAction key={entry.key} ref={entry.actionRef} {...shared} onClick={entry.onClick}>
        {entry.label}
      </DocumentAction>
    );
  };

  // D3 Gated — a held act's reason prints directly under the line its act
  // stands on, left-aligned, and is linked to it by `aria-describedby`.
  const renderReasons = (entries: readonly RegionLedgerEntry[]) =>
    entries.filter(isHeld).map((entry) => (
      <p
        key={entry.key}
        id={reasonId(entry)}
        className="basis-full text-[11.5px] text-[var(--text-muted)]"
      >
        {entry.reason}
      </p>
    ));

  return (
    // US-46 B — one left-justified column at every width. The two-track grid
    // that set the ledger in a right-hand column from 1180 is gone: the acts
    // read down the left edge under the status, as the deck's slide 10 shows.
    <div data-region-head={regionKey} className="grid grid-cols-1 items-start gap-y-2">
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
        {!silent && (eyebrow || reserveEyebrow) && (
          <p
            className={`font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]${
              reserveEyebrow ? ' min-h-[15.4px]' : ''
            }`}
          >
            {eyebrow}
          </p>
        )}
        {/* The name line. The Fold toggle sits beside the name on its
            baseline and wraps under it when the line runs out (390). The
            status follows the `<h2>` in the DOM — `h2 + p` stays the status
            (prework-regions e2e) — and `order-last` + `basis-full` print it
            on its own line below the toggle. Only the toggle is focusable, so
            the tab order still runs name line, lead, tools, top to bottom. */}
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h2
            id={headingId}
            tabIndex={-1}
            // US-43 R2 — the region's name is a real heading level: 26px
            // Playfair in ink, sentence case as authored, wrapping at 390. The
            // ring is clay-ink (5.75:1); clay drew 2.18:1, under 1.4.11. A -1
            // tabindex heading that a rail jump focuses must draw its ring.
            className={
              silent
                ? 'sr-only'
                : 't-d2 min-w-0 text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]'
            }
          >
            {name}
          </h2>
          {/* US-43 — one status sentence in ink, on the paper and never on
              the rail. The exceptions follow it in the same line, each in
              whatever state ink its caller gives it. */}
          {!silent && (
            <p className="t-body order-last mt-1 basis-full text-[var(--ink)]">
              {status}
              {printedExceptions.map((exception, index) => (
                <span key={index}>
                  {' · '}
                  {exception}
                </span>
              ))}
            </p>
          )}
          {/* The region's own disclosure control, not one of the ledger's
              acts: it keeps naming its body (W4-C7) at quiet and open alike,
              and it is never the lead. Outside the ledger's group it names
              its region for telemetry by hand. */}
          {showFold && (
            <DocumentAction
              actionKey={`${regionKey}-fold`}
              surfaceKey={surfaceKey}
              regionKey={regionKey}
              variant="tertiary"
              aria-expanded
              aria-controls={bodyId}
              onClick={onFold}
            >
              Collapse ↑
            </DocumentAction>
          )}
        </div>
      </div>

      {printedActions.length > 0 && (
        <DocumentActionGroup
          surfaceKey={surfaceKey}
          regionKey={regionKey}
          aria-label={ledgerLabel}
          className="justify-start"
        >
          {leadEntry && (
            <>
              <div data-region-lead="" className="flex basis-full justify-start">
                {renderEntry(leadEntry, leadEntry.variant ?? 'primary')}
              </div>
              {renderReasons([leadEntry])}
            </>
          )}
          {toolEntries.length > 0 && (
            <>
              <div
                data-region-tools=""
                className="flex basis-full flex-wrap items-center justify-start gap-x-3 gap-y-2"
              >
                {toolEntries.map((entry) => renderEntry(entry, entry.variant ?? 'secondary'))}
              </div>
              {renderReasons(toolEntries)}
            </>
          )}
        </DocumentActionGroup>
      )}
    </div>
  );
}
