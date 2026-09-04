'use client';

import type { ReactNode } from 'react';

import { ScoredAction } from './scored-action';
import { moneyInWords } from './standing-sentence';

/* ── THE GATE — Direction B's signature device ───────────────────────────────
   The spine runs the length of The Making unbroken until something is owed.
   Where an act is required the line does not fade or branch: it STOPS, square,
   and does not resume until the client's name is on the paper. That break is
   the whole argument of the surface — every ask is causal, and the client can
   see exactly what her signature restarts.

   The surrounding vertical rule belongs to the spine frame. This component
   renders only the break in it: a top rule cut square with a solid cap of the
   phase's ink sitting on it, the act in the gap, then a lighter rule and a
   shorter, thinner cap below — the line picking back up at reduced ink.

   PLACEMENT: the caps straddle this block's left edge, so they reach back into
   the gutter and land on the rule. `SpineRow` (making-spine.tsx) puts its body
   10px right of the spine's centre, which is inside the caps' reach — drop the
   gate straight into a row and the break lands. Pull it further left with the
   row's `className` and the caps centre on the line exactly as the deck draws
   them (`.db-gate`, grid-column 1 / span 3). Either way the gate must sit on
   the frame, never in a card beside it: a break that is not in the line is
   decoration, and the whole device is that the line is broken.

   No shadow anywhere: depth here is value contrast, a warmer sheet of paper,
   and flat rules. ────────────────────────────────────────────────────────── */

export type SpineGateVariant = 'signature' | 'acceptance';

/** The mono kind line — the deck's `.db-gk`, uppercased by `.type-meta-small`. */
const KIND_LINE: Record<SpineGateVariant, string> = {
  signature: 'A gate · the line stops until you sign',
  acceptance: 'A gate · the line stops until you accept',
};

/** The act itself, uppercased by the scored-ink grammar. */
const ACT_LABEL: Record<SpineGateVariant, string> = {
  signature: 'Sign',
  acceptance: 'Accept the finished work',
};

/** What the money at the bottom of the paper does when the act is taken. */
const MOVED_ON_ACT: Record<SpineGateVariant, string> = {
  signature: 'on signing',
  acceptance: 'releases on your acceptance',
};

const ACTION_KEY: Record<SpineGateVariant, string> = {
  signature: 'gate_sign',
  acceptance: 'gate_accept',
};

export interface SpineGateProps {
  /** Which kind of break this is — a paper to sign, or work to accept. */
  variant: SpineGateVariant;
  /** The instrument's own name, e.g. "Furnishings authorization No. 7". */
  title: string;
  /**
   * What kind of paper this is, in the portal's existing kind vocabulary
   * ("Furnishings authorization", "Trade scope", …). Omitted when unknown.
   */
  kindLabel?: string | null;
  /** The whole of it, in cents. Omitted when the paper carries no figure. */
  totalCents?: number | null;
  /**
   * The money the act moves, in cents — a deposit due on signing, or the draw
   * released on acceptance. Omitted when the data does not carry one; never
   * guessed, and never stated twice (leave it out if the caption names it).
   */
  depositCents?: number | null;
  /**
   * One sentence in the standing-sentence voice, naming what the act causes:
   * "Three pieces order the moment you sign." Composed by the caller from real
   * state — this component never invents it.
   */
  caption?: string | null;
  /**
   * Where the act leads, for a gate whose act is somewhere else — a paper to
   * sign lives at `/proposals/[id]/sign`.
   *
   * Optional because not every gate is a link. Accepting finished work has no
   * route of its own anywhere in the portal: it is an inline form (a name, a
   * confirmation) that posts to `/api/trade-scopes/[id]/accept`. A gate like
   * that hands its whole act in as `act` instead, and the line still breaks
   * around it — the break is the device, not the anchor.
   */
  href?: string;
  /**
   * The act itself, when it cannot be a link. Replaces the default scored
   * action; compose it from `ScoredAction` so it inks like every other act on
   * the surface.
   */
  act?: ReactNode;
  /**
   * The phase ink the spine is carrying where it breaks. Gates live in the
   * open chapter, so procurement gold is the common case.
   */
  accent?: string;
  /** Fired when the client takes the act — the caller reports `gateFollowed`. */
  onFollow?: () => void;
}

export function SpineGate({
  variant,
  title,
  kindLabel,
  totalCents,
  depositCents,
  caption,
  href,
  act,
  accent = 'var(--phase-procurement)',
  onFollow,
}: SpineGateProps) {
  const hasTotal = typeof totalCents === 'number' && totalCents > 0;
  const hasDeposit = typeof depositCents === 'number' && depositCents > 0;
  // Whole dollars, like every other figure this surface prints — the caption
  // three lines below is composed with the same formatter, and a gate that
  // reads "$12,500.00" above "The draw of $1,440 releases…" is speaking two
  // money idioms inside one block. Cents belong to the toll's ledger, where
  // they are the point.
  const vitals = [
    kindLabel ? kindLabel : null,
    hasTotal ? moneyInWords(totalCents as number) : null,
  ].filter((part): part is string => !!part);

  return (
    <div
      data-testid="spine-gate"
      data-gate-variant={variant}
      className="relative my-1 border-y bg-[var(--bg-warm)] px-5 py-5 sm:px-6"
      style={{
        borderTopColor: `color-mix(in srgb, ${accent} 60%, transparent)`,
        borderBottomColor: `color-mix(in srgb, ${accent} 32%, transparent)`,
      }}
    >
      {/* the incoming line, cut off square */}
      <span
        aria-hidden="true"
        data-testid="spine-gate-stop"
        className="absolute -left-[13px] -top-[3px] h-[5px] w-[26px]"
        style={{ backgroundColor: accent }}
      />
      {/* and picking back up below, at reduced ink */}
      <span
        aria-hidden="true"
        data-testid="spine-gate-resume"
        className="absolute -bottom-[2px] -left-[9px] h-[3px] w-[22px]"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 50%, transparent)` }}
      />

      {/* the kind line takes the phase's ink darkened into legibility — the
          deck writes gold as #8a6f18 here for exactly this reason */}
      <p
        className="type-meta-small"
        style={{ color: `color-mix(in srgb, ${accent} 52%, var(--color-charcoal))` }}
      >
        {KIND_LINE[variant]}
      </p>

      <p className="type-item-name mt-1.5">{title}</p>

      {vitals.length > 0 && (
        <p className="type-meta-small mt-1.5 text-[var(--text-muted)]" data-testid="spine-gate-vitals">
          {vitals.join(' · ')}
        </p>
      )}

      {hasDeposit && (
        <p className="type-meta-small mt-1 text-[var(--text-muted)]" data-testid="spine-gate-deposit">
          {moneyInWords(depositCents as number)} {MOVED_ON_ACT[variant]}
        </p>
      )}

      {caption && (
        <p
          className="font-heading mt-3 max-w-[52ch] text-[0.95rem] italic leading-relaxed text-[var(--text-body)]"
          data-testid="spine-gate-caption"
        >
          {caption}
        </p>
      )}

      <div className="mt-4" data-testid="spine-gate-act">
        {act ??
          (href ? (
            <ScoredAction
              actionKey={ACTION_KEY[variant]}
              regionKey="gate"
              variant="primary"
              href={href}
              onClick={onFollow}
            >
              {ACT_LABEL[variant]}
            </ScoredAction>
          ) : null)}
      </div>
    </div>
  );
}
