'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommercialDocumentKind } from '@patina/types';

import { ScoredAction } from '@/components/making/scored-action';
import { SpineGate } from '@/components/making/spine-gate';
import { countInWords, moneyInWords } from '@/components/making/standing-sentence';
import {
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { makingEvents, proposalClientEvents } from '@/lib/analytics/events';
import {
  parseSourceDate,
  type NoteModel,
  type ThresholdMark,
  type ThresholdProposal,
} from '@/lib/threshold/derive';
import { noteInBrief } from '@/lib/threshold/standing';

import {
  KIND_LABEL,
  SIGNATURE_NOTICE,
  consentLineFor,
  refusalSentence,
  signLabelFor,
  summaryLineFor,
} from './consent-copy';

/* ── THE DOOR ────────────────────────────────────────────────────────────────
   A paper waiting for the client's name is not a card in a list: it is a door
   drawn shut across the full measure of the page, with the studio's note
   pinned to the leaf and the instrument itself printed on it. The act is the
   shipped signature flow — the same typed name, the same consent line, the
   same POST to /api/proposals/[id]/sign, the same cache invalidation — hung on
   the gate device rather than on a route the client would have to leave for.

   EVERY KIND OF PAPER COMES THROUGH HERE. `deriveThreshold` builds a door for
   each signature gate, and The Making's `signatureGates` filter admits every
   commercial kind, not only furnishings. So the consent, the act label and the
   summary all branch on the resolved `CommercialDocumentKind` exactly as the
   sign route branches them (consent-copy.ts, drift-guarded against the route's
   source), and the line-item table draws only for the kind that has lines.

   THE ACT IS NOT OFFERED UNTIL THE PAPER IS DRAWN. The whole argument of the
   door is that the instrument is printed on the leaf, so Sign stays disarmed
   while the bundle is in flight or errored — the route it copies gates its
   entire page on the same read.

   WHAT SIGNING LOOKS LIKE. The doorway is measured, pinned to that height,
   then released to zero on the next frame so the collapse has a length to
   interpolate from; the leaf swings on its hinges across the same 520 ms with
   nothing clipping it. Under prefers-reduced-motion nothing swings: the leaf
   goes at once and the receipt crossfades in. On a phone the leaf lifts on the
   vertical instead — a 68-degree rotation on a 360px measure reads as a
   glitch, not as a door. ─────────────────────────────────────────────────── */

const SWING_MS = 520;

/** "5 August" — the deck's own date idiom. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

type DoorState = 'shut' | 'swinging' | 'open';

/** The instrument behind the door. `kind` decides which legal line it carries. */
export interface DoorProposal extends ThresholdProposal {
  /**
   * Resolved by Lane 4 from `commercialSummaryFromProposal`. When absent the
   * bundle's own document kind is used, and failing that the route's `else`
   * branch — never the furnishings copy by default.
   */
  kind?: CommercialDocumentKind;
}

export interface DoorGateProps {
  mark: ThresholdMark;
  proposal: DoorProposal;
  /**
   * The studio's standing note, pinned to the leaf. Null pins nothing.
   *
   * CONTRACT: the pin carries the note's OPENING and a way back to it, never
   * its body — `TheNote` sets the letter itself, once, under `#note`. Pin it
   * on ONE door: the same quote on three leaves is three voices asking for the
   * same signature.
   */
  note: NoteModel | null;
  projectId: string;
  onSigned?: () => void;
  /**
   * The first door on the page carries the page-level `#door` anchor that the
   * collapsed `/proposals` route lands on; any further door is addressed by
   * its own mark.
   */
  first?: boolean;
  /** Who countersigns, where the kind's consent says someone does. */
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
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [replay, setReplay] = useState<string | null>(null);
  const [doorState, setDoorState] = useState<DoorState>('shut');
  const [swingHeight, setSwingHeight] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [receiptInked, setReceiptInked] = useState(false);

  const doorwayRef = useRef<HTMLDivElement | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // State is render-time, so two clicks in one tick both read `submitting`
  // false. The latch closes that; the shipped route has the same hole.
  const inFlight = useRef(false);

  useEffect(
    () => () => {
      if (swingTimer.current) clearTimeout(swingTimer.current);
    },
    [],
  );

  const fieldId = useId().replace(/:/g, '');
  const nameId = `door-name-${fieldId}`;
  const consentId = `door-consent-${fieldId}`;
  const hintId = `door-hint-${fieldId}`;

  const kind: CommercialDocumentKind =
    proposal.kind ?? bundle.data?.document?.kind ?? 'legacy';
  const isFurnishings = kind === 'furnishings_authorization';

  const items = isFurnishings ? (bundle.data?.furnishings?.items ?? []) : [];
  // The Making's fallback, verbatim: a trade scope carries no deposit percent,
  // its deposit is simply the first draw in the schedule.
  const depositCents =
    bundle.data?.furnishings?.depositRequiredCents ??
    bundle.data?.tradeScope?.draws[0]?.amountCents ??
    null;
  const sent = parseSourceDate(proposal.sentAt);

  // The paper has to be on the leaf before the act is offered.
  const drawn = !bundle.isLoading && !bundle.isError;
  // The same validation the shipped sign page runs.
  const ready = drawn && agreed && name.trim().length >= 2;

  async function onSign() {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const signedByName = name.trim();
    makingEvents.gateFollowed({
      projectId,
      proposalId: proposal.id,
      kind: kind === 'legacy' ? 'design_services' : kind,
    });
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedByName }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string | null;
        notificationDelivery?: { state?: string };
      };
      if (!response.ok) throw new Error(refusalSentence(body.error));

      await invalidateSignedCommercialDocument(
        queryClient,
        proposal.id,
        body.projectId ?? projectId,
      );
      proposalClientEvents.signed({ proposalId: proposal.id, signedByName });

      setSignedAt(new Date());
      // The route pushes ?delivery=pending_retry so CommercialNotificationRecovery
      // can offer the replay. The Threshold IS the page that param lands on, so
      // the recovery is surfaced here instead of being navigated to.
      setDeliveryPending(body.notificationDelivery?.state === 'pending_retry');

      const stilled =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (stilled) {
        setDoorState('open');
      } else {
        // Measure first: `max-height: none` cannot interpolate to a length, so
        // the collapse needs a real starting pixel height.
        setSwingHeight(doorwayRef.current?.scrollHeight ?? null);
        setDoorState('swinging');
        window.requestAnimationFrame(() => setCollapsed(true));
        swingTimer.current = setTimeout(() => setDoorState('open'), SWING_MS);
      }
      window.requestAnimationFrame(() => setReceiptInked(true));
      onSigned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : refusalSentence(null));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function onReplay() {
    setReplay(null);
    try {
      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposal.id)}/notifications/replay`,
        { method: 'POST' },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        notificationDelivery?: { state?: string };
      };
      if (!response.ok) throw new Error(body.error || 'Confirmation delivery could not be checked.');
      setReplay(
        body.notificationDelivery?.state === 'delivered'
          ? 'Confirmation delivery is confirmed.'
          : 'Confirmation delivery is still pending. You can retry safely.',
      );
    } catch (err) {
      setReplay(
        err instanceof Error ? err.message : 'Confirmation delivery could not be checked.',
      );
    }
  }

  const countersigns = studioName?.trim() || 'the studio';
  const receipt = signedAt
    ? `${proposal.title} · signed ${DAY_MONTH.format(signedAt)} · ${countersigns} countersigns`
    : null;

  // The document's own total is authoritative: Σ clientLineTotalCents
  // reconciles to it, but an allowance line can be snapshotted at a ceiling
  // the unit price does not divide evenly into.
  const lineSum = items.reduce((sum, item) => sum + (item.clientLineTotalCents || 0), 0);
  const totalCents = proposal.totalAmountCents > 0 ? proposal.totalAmountCents : lineSum;
  const caption =
    items.length > 0
      ? `${capitalize(countInWords(items.length))} ${
          items.length === 1 ? 'piece orders' : 'pieces order'
        } the moment you sign.`
      : null;

  // Explicit px on both ends: `max-height: none` cannot interpolate to a
  // length, and a unitless 0 leaves the transition nothing to read either.
  const maxHeight =
    doorState === 'shut'
      ? undefined
      : collapsed
        ? '0px'
        : swingHeight === null
          ? undefined
          : `${swingHeight}px`;

  return (
    <section
      id={first ? 'door' : `door-${mark.id.replace(/:/g, '-')}`}
      data-threshold-unit="door"
      // A door that has been signed is no longer asking for her hand, so it
      // stops claiming the ink that "since yesterday" reserves for open asks.
      {...(signedAt ? {} : { 'data-never-dim': '' })}
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
          style={{ opacity: receiptInked ? 1 : 0 }}
          className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-[var(--text-body)] transition-opacity duration-[420ms]"
        >
          {receipt}
        </p>
      )}

      {deliveryPending && (
        <div data-testid="door-delivery-pending" className="mt-2">
          <p role="status" className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--text-body)]">
            Your signature remains recorded, but confirmation delivery is still pending. You
            can retry safely.
          </p>
          <ScoredAction
            actionKey="door_notice_replay"
            regionKey="door"
            variant="secondary"
            onClick={onReplay}
          >
            Resend confirmation notice
          </ScoredAction>
          {replay && (
            <p role="status" className="text-[15px] leading-relaxed text-[var(--text-body)]">
              {replay}
            </p>
          )}
        </div>
      )}

      {doorState !== 'open' && (
        <div
          ref={doorwayRef}
          data-testid="door-way"
          // Nothing clips while the leaf is swinging; the doorway is unmounted
          // the moment the collapse completes, which is what does the hiding.
          aria-hidden={doorState !== 'shut' ? true : undefined}
          style={maxHeight === undefined ? undefined : { maxHeight }}
          className="mt-4 [perspective:1800px] [perspective-origin:8%_50%] transition-[max-height] duration-[520ms] ease-[cubic-bezier(.24,.78,.28,1)] max-[600px]:duration-[240ms] motion-reduce:transition-none"
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

            <p
              data-testid="door-summary"
              className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--text-body)]"
            >
              {summaryLineFor(kind, proposal.title)}
            </p>

            {note && (
              <figure
                data-testid="door-note-pin"
                className="relative mt-5 max-w-[58ch] border border-[var(--border-subtle)] bg-[var(--bg-warm)] px-5 pb-4 pt-4"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-[5px] left-1/2 -ml-1 h-[9px] w-[9px] rounded-full border border-current bg-[var(--color-off-white)]"
                />
                {/* The quote marks are load-bearing: this is the one first-person
                    paragraph on a third-person page, and unattributed it reads
                    as the page speaking. */}
                {/* The OPENING of the note, never the whole of it: the letter
                    itself is set once, under `#note`, and a door that reprinted
                    it would have the client read the same paragraph twice on
                    one page. */}
                <blockquote className="font-heading text-[1.1rem] italic leading-relaxed">
                  {`“${noteInBrief(note.body)}”`}
                </blockquote>
                <figcaption className="mt-2.5 font-mono text-[11px] uppercase not-italic tracking-[0.1em] text-[var(--text-muted)]">
                  {[
                    studioName?.trim() ? `— ${studioName.trim()}` : '— the studio',
                    parseSourceDate(note.sentAt)
                      ? DAY_MONTH.format(parseSourceDate(note.sentAt) as Date)
                      : null,
                  ]
                    .filter((part): part is string => !!part)
                    .join(' · ')}
                </figcaption>
                <a
                  data-testid="door-note-read"
                  href="#note"
                  className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-body)] underline decoration-[var(--border-default)] underline-offset-4"
                >
                  Read the note
                </a>
              </figure>
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
              kindLabel={KIND_LABEL[kind] ?? null}
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
                      className="mt-1 h-4 w-4 shrink-0 border border-current"
                    />
                    <span>{consentLineFor(kind)}</span>
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
                      className="min-w-[12rem] border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.1rem] text-[var(--text-primary)]"
                    />
                    <ScoredAction
                      actionKey="gate_sign"
                      regionKey="gate"
                      variant="primary"
                      disabled={!ready}
                      loading={submitting}
                      loadingLabel="Signing"
                      aria-describedby={hintId}
                      onClick={onSign}
                    >
                      {signLabelFor(kind)}
                    </ScoredAction>
                  </div>
                  <p
                    id={hintId}
                    data-testid="door-hint"
                    className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
                  >
                    {!drawn
                      ? bundle.isError
                        ? 'This paper could not be drawn just now. Reload to try again.'
                        : 'Drawing this paper.'
                      : ready
                        ? `Ready when you are. ${SIGNATURE_NOTICE}`
                        : `Type your full name and tick the line to sign. ${SIGNATURE_NOTICE}`}
                  </p>
                  {/* A refused signature is a genuine error, so it takes the
                      error ink — NOT terracotta, which on this surface is the
                      Installation phase. The money-is-never-red rule governs
                      balances, overages and lateness; it does not ask a
                      validation message to whisper (the-making.tsx:494). */}
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
