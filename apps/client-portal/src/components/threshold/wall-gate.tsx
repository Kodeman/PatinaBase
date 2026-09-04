'use client';

import { useId, useRef, useState } from 'react';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { SpineGate } from '@/components/threshold/instruments/spine-gate';
import { countInWords, moneyInWords } from '@/components/threshold/instruments/standing-sentence';
import {
  useAcceptTradeScope,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { makingEvents } from '@/lib/analytics/events';
import type { ClientSelection } from '@/lib/commercial-documents';
import type { ThresholdMark } from '@/lib/threshold/derive';
import { refusalSentence } from '@/lib/threshold/refusal';

import { KIND_LABEL } from './consent-copy';

/* ── THE PAINTED WALL ────────────────────────────────────────────────────────
   Finished trade work waiting to be accepted, drawn the way a decorator's
   elevation draws it: the wall hatched where the work stands, with a square
   notch cut out of its profile exactly where the client's acceptance is owed.
   Accepting heals the notch and settles the hatching into flat ink, and a
   stamp records what her name released.

   The acceptance itself is The Making's AcceptanceGate, lifted: the same
   bundle read for the draws, the same caption composed from draws that
   actually exist, the same two-character name validation, the same
   `useAcceptTradeScope` mutation, the same `gateFollowed` payload. Two things
   are deliberately not the same — the gate's accent, because off the spine
   there is no `useSpineInk` chapter colour to continue and SpineGate's own
   default is the honest reading; and the drawing, which is new. ─────────── */

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

const HATCH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function WallDrawing({ accepted }: { accepted: boolean }) {
  return (
    <svg
      data-testid="wall-drawing"
      role="img"
      aria-label={
        accepted
          ? 'Elevation of the painted wall, whole: the notch healed and the paintwork settled'
          : 'Elevation of the painted wall, with a square notch cut into it where your acceptance is owed'
      }
      viewBox="0 0 1000 200"
      className="mt-4 block h-auto w-full"
      style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
    >
      <g vectorEffect="non-scaling-stroke">
        {/* the wall's profile — notched while the acceptance is owed */}
        <polygon
          data-testid="wall-notched"
          data-wall-state={accepted ? 'healed' : 'notched'}
          points="40,170 300,170 300,120 660,120 660,170 780,170 780,60 900,60 900,170 960,170 960,20 40,20"
          className="transition-opacity duration-[420ms] motion-reduce:transition-none"
          style={{ opacity: accepted ? 0 : 1 }}
        />
        <polygon
          data-testid="wall-whole"
          points="40,170 780,170 780,60 900,60 900,170 960,170 960,20 40,20"
          className="transition-opacity duration-[420ms] motion-reduce:transition-none"
          style={{ opacity: accepted ? 1 : 0 }}
        />
        <line x1="0" y1="170" x2="1000" y2="170" />
        <line x1="60" y1="170" x2="520" y2="58" strokeDasharray="4 4" />
        <g
          data-testid="wall-hatch"
          data-wall-state={accepted ? 'settled' : 'hatched'}
          className="transition-opacity duration-[420ms] motion-reduce:transition-none"
          style={{ opacity: accepted ? 0 : 0.45 }}
        >
          {HATCH.map((step) => (
            <line
              key={step}
              x1={60 + step * 60}
              y1={115}
              x2={155 + step * 60}
              y2={20}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

export interface WallGateProps {
  mark: ThresholdMark;
  selection: ClientSelection;
  projectId: string;
  onAccepted?: () => void;
  /**
   * The first wall on the page carries the page-level `#wall` anchor the key's
   * mark leaders and `changed` both address; any further wall is addressed by
   * its own mark, so two walls never claim one id.
   */
  first?: boolean;
}

export function WallGate({
  mark,
  selection,
  projectId,
  onAccepted,
  first = true,
}: WallGateProps) {
  const proposalId = selection.instrument?.proposalId ?? mark.proposalId;
  const bundle = useClientCommercialDocument(proposalId ?? '');
  const accept = useAcceptTradeScope(proposalId, projectId);

  const [signedName, setSignedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const fieldId = useId().replace(/:/g, '');
  const nameId = `accept-name-${fieldId}`;
  const hintId = `accept-hint-${fieldId}`;

  const draws = bundle.data?.tradeScope?.draws ?? [];
  const gatedDraw = draws.find((draw) => draw.gatesOnAcceptance) ?? null;
  const paidDraws = draws.filter(
    (draw) => draw.amountCents > 0 && draw.invoicePaidCents >= draw.amountCents,
  ).length;
  const party = bundle.data?.tradeScope?.party?.displayName ?? null;

  const caption =
    [
      paidDraws > 0
        ? `${capitalize(countInWords(paidDraws))} ${
            paidDraws === 1 ? 'draw is' : 'draws are'
          } paid.`
        : null,
      gatedDraw && gatedDraw.amountCents > 0
        ? `The draw of ${moneyInWords(gatedDraw.amountCents)} releases on your acceptance.`
        : null,
    ]
      .filter((clause): clause is string => clause !== null)
      .join(' ') || null;

  async function onAccept() {
    if (inFlight.current) return;
    const name = signedName.trim();
    if (name.length < 2) {
      setError('Type your full name to accept the finished work.');
      return;
    }
    setError(null);
    inFlight.current = true;
    if (proposalId) {
      makingEvents.gateFollowed({
        projectId,
        proposalId,
        kind: 'trade_acceptance',
      });
    }
    try {
      await accept.mutateAsync(name);
      setAcceptedAt(new Date());
      onAccepted?.();
    } catch (err) {
      setError(refusalSentence(err, 'Unable to accept this work right now.'));
    } finally {
      inFlight.current = false;
    }
  }

  // Acceptance is not only a local event: the mutation's invalidation refetches
  // the bundle, and revisiting the page has no local state at all. Reading the
  // scope's own progress back means the healed wall survives both.
  const acceptedOnRecord =
    bundle.data?.tradeScope?.progress?.state === 'accepted' ||
    selection.tradeJourney === 'accepted';
  const accepted = acceptedAt !== null || acceptedOnRecord;

  return (
    <section
      id={first ? 'wall' : `wall-${mark.id.replace(/:/g, '-')}`}
      data-threshold-unit="wall"
      {...(accepted ? {} : { 'data-never-dim': '' })}
      aria-labelledby={`wall-title-${fieldId}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] pb-2.5 pt-2.5">
        <h2
          id={`wall-title-${fieldId}`}
          className="font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
        >
          The painted wall
        </h2>
        <p className="max-w-[34ch] text-[15px] leading-normal text-[var(--text-body)] sm:text-right">
          {[selection.roomName || null, party, 'substantially complete']
            .filter((part): part is string => !!part)
            .join(' · ')}
        </p>
      </div>

      <WallDrawing accepted={accepted} />

      {acceptedAt && (
        <p className="mt-3">
          <span
            data-testid="wall-stamp"
            className="inline-block max-w-[38ch] -rotate-[1.1deg] border border-current px-2.5 pb-1 pt-1.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--color-mocha)]"
          >
            {`Accepted ${DAY_MONTH.format(acceptedAt)}${
              gatedDraw && gatedDraw.amountCents > 0
                ? ` · ${moneyInWords(gatedDraw.amountCents)} released`
                : ''
            }`}
            {party && (
              <span className="block font-normal normal-case tracking-[0.04em]">
                {party}
                {selection.roomName ? ` · ${selection.roomName}` : ''}
              </span>
            )}
          </span>
        </p>
      )}

      {!accepted && (
        <div className="mt-2 max-w-[640px] sm:ml-[clamp(24px,26%,300px)]">
          <SpineGate
            variant="acceptance"
            title={selection.name}
            kindLabel={KIND_LABEL.trade_scope ?? null}
            totalCents={selection.clientLineTotalCents || null}
            caption={caption}
            act={
              proposalId ? (
                <div>
                  <label
                    className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
                    htmlFor={nameId}
                  >
                    Type your full name
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <input
                      id={nameId}
                      type="text"
                      value={signedName}
                      onChange={(event) => setSignedName(event.target.value)}
                      autoComplete="name"
                      data-testid="accept-trade-scope-name"
                      className="min-w-[12rem] border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.1rem] text-[var(--text-primary)]"
                    />
                    <ScoredAction
                      actionKey="gate_accept"
                      regionKey="gate"
                      variant="primary"
                      loading={accept.isPending}
                      loadingLabel="Accepting"
                      aria-describedby={hintId}
                      onClick={onAccept}
                    >
                      Accept the finished work
                    </ScoredAction>
                  </div>
                  <p
                    id={hintId}
                    data-testid="wall-hint"
                    className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
                  >
                    {bundle.isLoading
                      ? 'Reading the draws on this scope.'
                      : caption === null
                        ? 'Type your full name to accept.'
                        : `Type your full name to accept. ${caption}`}
                  </p>
                  {/* A refused acceptance is a genuine error, so it takes the
                      error ink — NOT terracotta, which on this surface is the
                      Installation phase. The money-is-never-red rule governs
                      balances, overages and lateness; it does not ask a
                      validation message to whisper (the-making.tsx:494). */}
                  {error && (
                    <p
                      role="alert"
                      className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]"
                    >
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[15px] leading-normal text-[var(--text-muted)]">
                  The studio will send the paper this work stands on.
                </p>
              )
            }
          />
        </div>
      )}
    </section>
  );
}
