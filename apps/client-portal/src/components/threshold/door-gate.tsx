'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ScoredAction } from '@/components/making/scored-action';
import { SpineGate } from '@/components/making/spine-gate';
import { countInWords, moneyInWords } from '@/components/making/standing-sentence';
import {
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { proposalClientEvents } from '@/lib/analytics/events';
import {
  parseSourceDate,
  type NoteModel,
  type ThresholdMark,
  type ThresholdProposal,
} from '@/lib/threshold/derive';

/* ── THE DOOR ────────────────────────────────────────────────────────────────
   A paper waiting for the client's name is not a card in a list: it is a door
   drawn shut across the full measure of the page, with the studio's note
   pinned to the leaf and the authorization itself printed on it. The act is
   the shipped signature flow — the same typed name, the same consent line, the
   same POST to /api/proposals/[id]/sign, the same cache invalidation — hung on
   the gate device rather than on a route the client would have to leave for.

   WHAT SIGNING LOOKS LIKE. The leaf swings on its hinges (rotateY, 520ms) and
   the doorway collapses in the same beat, leaving a one-line lintel receipt
   where the door stood. Under prefers-reduced-motion nothing swings: the
   receipt crossfades in and the leaf is gone. On a phone the leaf lifts on the
   vertical instead — a 68-degree rotation on a 360px measure reads as a glitch,
   not as a door. ─────────────────────────────────────────────────────────── */

const SWING_MS = 520;

/** "5 August" — the deck's own date idiom. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

type DoorState = 'shut' | 'swinging' | 'open';

export interface DoorGateProps {
  mark: ThresholdMark;
  proposal: ThresholdProposal;
  /** The studio's standing note, pinned to the leaf. Null pins nothing. */
  note: NoteModel | null;
  projectId: string;
  onSigned?: () => void;
  /**
   * The first door on the page carries the page-level `#door` anchor that the
   * collapsed `/proposals` route lands on; any further door is addressed by
   * its own mark.
   */
  first?: boolean;
  /** Who countersigns. Falls back to "the studio" when the name is unknown. */
  studioName?: string | null;
}

export function DoorGate({
  mark,
  proposal,
  note,
  projectId,
  onSigned,
  first = true,
  studioName,
}: DoorGateProps) {
  const queryClient = useQueryClient();
  const bundle = useClientCommercialDocument(proposal.id);

  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<Date | null>(null);
  const [doorState, setDoorState] = useState<DoorState>('shut');
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (swingTimer.current) clearTimeout(swingTimer.current);
    },
    [],
  );

  const fieldId = useId();
  const nameId = `door-name-${fieldId}`;
  const consentId = `door-consent-${fieldId}`;
  const hintId = `door-hint-${fieldId}`;

  const items = bundle.data?.furnishings?.items ?? [];
  const depositCents = bundle.data?.furnishings?.depositRequiredCents ?? null;
  const sent = parseSourceDate(proposal.sentAt);

  // The same validation the shipped sign page runs: a name of at least two
  // characters and the consent line ticked.
  const ready = agreed && name.trim().length >= 2;

  async function onSign() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    const signedByName = name.trim();
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string | null;
      };
      if (!response.ok) throw new Error(body.error || 'Failed to sign this authorization.');

      await invalidateSignedCommercialDocument(
        queryClient,
        proposal.id,
        body.projectId ?? projectId,
      );
      proposalClientEvents.signed({ proposalId: proposal.id, signedByName });

      setSignedAt(new Date());
      const stilled =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (stilled) {
        setDoorState('open');
      } else {
        setDoorState('swinging');
        swingTimer.current = setTimeout(() => setDoorState('open'), SWING_MS);
      }
      onSigned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign this authorization.');
      setSubmitting(false);
    }
  }

  const receipt = signedAt
    ? `${proposal.title} · signed ${DAY_MONTH.format(signedAt)} · ${
        studioName?.trim() || 'the studio'
      } countersigns`
    : null;

  // The document's own total is authoritative: Σ clientLineTotalCents
  // reconciles to it, but an allowance line can be snapshotted at a ceiling
  // the unit price does not divide evenly into.
  const lineSum = items.reduce((sum, item) => sum + (item.clientLineTotalCents || 0), 0);
  const totalCents = proposal.totalAmountCents > 0 ? proposal.totalAmountCents : lineSum;
  const caption =
    items.length > 0
      ? `${countInWords(items.length)} ${
          items.length === 1 ? 'piece orders' : 'pieces order'
        } the moment you sign.`
      : null;

  return (
    <section
      id={first ? 'door' : `door-${mark.id}`}
      data-threshold-unit="door"
      data-never-dim=""
      aria-labelledby={`door-title-${fieldId}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] pb-2.5 pt-2.5">
        <h2
          id={`door-title-${fieldId}`}
          className="font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
        >
          {proposal.title}
        </h2>
        <p className="max-w-[34ch] text-[15px] leading-normal text-[var(--text-body)] sm:text-right">
          {signedAt
            ? 'Open. It opened on your name.'
            : sent
              ? `Shut since ${DAY_MONTH.format(sent)} · it opens on your name`
              : 'Shut · it opens on your name'}
        </p>
      </div>

      {receipt && (
        <p
          data-testid="door-receipt"
          className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-[var(--text-body)] transition-opacity duration-[420ms] motion-reduce:transition-none"
        >
          {receipt}
        </p>
      )}

      {doorState !== 'open' && (
        <div
          data-testid="door-way"
          className="mt-4 overflow-hidden [perspective:1800px] [perspective-origin:8%_50%] transition-[max-height] duration-[520ms] ease-[cubic-bezier(.24,.78,.28,1)] max-[600px]:duration-[240ms] motion-reduce:transition-none"
          style={{ maxHeight: doorState === 'swinging' ? 0 : undefined }}
        >
          <div
            data-testid="door-leaf"
            data-door-state={doorState}
            className={[
              'relative origin-left border border-current bg-[var(--bg-surface)] p-5 [backface-visibility:hidden] sm:p-7',
              'transition-transform duration-[520ms] ease-[cubic-bezier(.24,.78,.28,1)]',
              'max-[600px]:duration-[240ms] max-[600px]:ease-out motion-reduce:transition-none',
              doorState === 'swinging'
                ? '[transform:rotateY(-68deg)] max-[600px]:[transform:translateY(-26px)]'
                : '',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="absolute -left-px top-[16%] h-9 w-[7px] border border-current bg-[var(--bg-warm)]"
            />
            <span
              aria-hidden="true"
              className="absolute -left-px top-[66%] h-9 w-[7px] border border-current bg-[var(--bg-warm)]"
            />
            <span
              aria-hidden="true"
              className="absolute right-4 top-1/2 -mt-[5px] h-2.5 w-2.5 rounded-full border border-current"
            />

            {note && (
              <div
                data-testid="door-note-pin"
                className="relative mt-1 max-w-[58ch] border border-[var(--border-subtle)] bg-[var(--bg-warm)] px-5 pb-4 pt-4"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-[5px] left-1/2 -ml-1 h-[9px] w-[9px] rounded-full border border-current bg-[var(--color-off-white)]"
                />
                <p className="font-heading text-[1.1rem] italic leading-relaxed">
                  {note.body}
                </p>
              </div>
            )}

            {items.length > 0 && (
              <dl data-testid="door-lines" className="mt-5 max-w-[52ch]">
                {items.map((item, index) => (
                  <div
                    key={`${item.description}-${index}`}
                    className="flex justify-between gap-4 border-b border-dotted border-[var(--border-default)] py-1.5 text-[15px]"
                  >
                    <dt>{item.description}</dt>
                    <dd className="font-mono text-[13px]">
                      {moneyInWords(item.clientLineTotalCents || 0)}
                    </dd>
                  </div>
                ))}
                <div
                  data-testid="door-total"
                  className="flex justify-between gap-4 border-b border-current py-1.5 text-[15px]"
                >
                  <dt>{caption ?? 'The whole of it'}</dt>
                  <dd className="font-mono text-[13px]">{moneyInWords(totalCents)}</dd>
                </div>
              </dl>
            )}

            <SpineGate
              variant="signature"
              title={proposal.title}
              kindLabel={sent ? `Sent ${DAY_MONTH.format(sent)}` : null}
              totalCents={items.length > 0 ? null : totalCents}
              depositCents={depositCents}
              caption={items.length > 0 ? null : caption}
              act={
                <div>
                  <label
                    className="flex max-w-[52ch] cursor-pointer items-start gap-3 text-[15px] leading-normal text-[var(--text-body)]"
                    htmlFor={consentId}
                  >
                    <input
                      id={consentId}
                      type="checkbox"
                      checked={agreed}
                      disabled={submitting || !!signedAt}
                      onChange={(event) => setAgreed(event.target.checked)}
                      className="mt-1 h-3 w-3 shrink-0 border border-current"
                    />
                    <span>
                      I authorize the studio to procure only the named lines at the
                      quantities and client prices shown. {studioName?.trim() || 'The studio'}{' '}
                      countersigns.
                    </span>
                  </label>

                  <label
                    className="mt-4 block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
                    htmlFor={nameId}
                  >
                    Type your full name
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    <input
                      id={nameId}
                      type="text"
                      value={name}
                      autoComplete="name"
                      disabled={submitting || !!signedAt}
                      onChange={(event) => setName(event.target.value)}
                      data-testid="door-sign-name"
                      className="min-w-[12rem] border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.1rem] text-[var(--text-primary)] focus-visible:focus-ring"
                    />
                    <ScoredAction
                      actionKey="door_sign"
                      regionKey="door"
                      variant="primary"
                      disabled={!ready}
                      loading={submitting}
                      loadingLabel="Signing"
                      aria-describedby={hintId}
                      onClick={onSign}
                    >
                      Sign
                    </ScoredAction>
                  </div>
                  <p
                    id={hintId}
                    className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
                  >
                    {ready
                      ? 'Ready when you are. Your typed name acts as your electronic signature.'
                      : 'Type your full name and tick the line to sign.'}
                  </p>
                  {error && (
                    <p
                      role="alert"
                      className="mt-2 text-[15px] leading-normal text-[var(--color-error)]"
                    >
                      {error}
                    </p>
                  )}
                </div>
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
