'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommercialDocumentKind } from '@patina/types';

import { HoldAction, ScoredAction } from '@/components/threshold/instruments/scored-action';
import {
  SignatureLine,
  signatureIsComplete,
} from '@/components/threshold/instruments/signature-line';
import { SpineGate } from '@/components/threshold/instruments/spine-gate';
import { countInWords, moneyInWords } from '@/components/threshold/instruments/standing-sentence';
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
import { hasPassed } from '@/lib/threshold/expiry';
import { noteInBrief } from '@/lib/threshold/standing';

import {
  KIND_LABEL,
  consentLineFor,
  refusalSentence,
  signLabelFor,
  summaryLineFor,
} from './consent-copy';
import { DoorActs } from './door-acts';

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
  /**
   * `proposals.valid_until`. The old `/proposals/[id]` page treated a passed
   * date as expired for actionability even before the expiry job ran, and the
   * acts on the leaf keep that gate.
   */
  validUntil?: string | null;
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
  /** The studio that holds the signature, named on the receipt and the pin. */
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
  const [declined, setDeclined] = useState(false);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [replay, setReplay] = useState<string | null>(null);
  const [doorState, setDoorState] = useState<DoorState>('shut');
  const [swingHeight, setSwingHeight] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [receiptInked, setReceiptInked] = useState(false);

  const doorwayRef = useRef<HTMLDivElement | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The wait that holds the refetch back until the leaf has finished (W2-01). */
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Written beside `setSignedAt`, and read in the catch — where `signedAt`
   * itself is still the value this render closed over.
   */
  const signedAtRef = useRef<Date | null>(null);
  // State is render-time, so two clicks in one tick both read `submitting`
  // false. The latch closes that; the shipped route has the same hole.
  const inFlight = useRef(false);

  useEffect(
    () => () => {
      if (swingTimer.current) clearTimeout(swingTimer.current);
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    },
    [],
  );

  const fieldId = useId().replace(/:/g, '');
  const nameId = `door-name-${fieldId}`;
  const consentId = `door-consent-${fieldId}`;
  const hintId = `door-hint-${fieldId}`;

  // Null until the paper says what it is. The copy has to name something, so
  // it falls back to the route's own `else` branch — but an act that branches
  // on the rail (Decline) may not, and takes the null instead.
  const resolvedKind: CommercialDocumentKind | null =
    proposal.kind ?? bundle.data?.document?.kind ?? null;
  const kind: CommercialDocumentKind = resolvedKind ?? 'legacy';
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
  // The old page held every act back under one `isActionable`, expiry
  // included. The acts row withdraws Ask / Request a change / Decline past
  // `valid_until`; the block that asks for her name disarms on the same date,
  // or the door offers a signature `/api/proposals/[id]/sign` will refuse.
  const expired = hasPassed(proposal.validUntil ?? null);
  // The same validation the shipped sign page runs. A declined paper is not
  // signable, so the block that asks for her name disarms with it — a page
  // may not go on offering an answer she has already given.
  const ready =
    drawn && !declined && !expired && agreed && signatureIsComplete(name);

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

      proposalClientEvents.signed({ proposalId: proposal.id, signedByName });

      const stampedAt = new Date();
      signedAtRef.current = stampedAt;
      setSignedAt(stampedAt);
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

      // W2-01. THE INVALIDATION GOES LAST, AND IT WAITS FOR THE LEAF.
      //
      // It used to be awaited first, and the refetch it triggers takes the
      // signed paper out of the papers the Threshold draws doors from — so
      // `renderDoor` returned null and this whole section unmounted about
      // 40 ms after the POST answered, before the swinging state was ever
      // set. Nothing of the ceremony was drawn: no leaf, no reopened head,
      // and no receipt, which is where P-19's sentence lives. The paper was
      // signed correctly the whole time; the door simply never moved.
      //
      // The state above is this component's own, so the leaf swings on it
      // alone. The refetch is what ends the door, and it is allowed to end
      // it only once the swing has run.
      await new Promise<void>((resolve) => {
        invalidateTimer.current = setTimeout(resolve, stilled ? 0 : SWING_MS);
      });
      await invalidateSignedCommercialDocument(
        queryClient,
        proposal.id,
        body.projectId ?? projectId,
      );
    } catch (err) {
      // A refusal is the only thing this may say. A signature that landed and
      // then failed to refresh a cache has not failed, and must not be
      // reported as one — so the invalidation above throws into a caught
      // branch only when `signedAt` is still null.
      if (!signedAtRef.current) {
        setError(err instanceof Error ? err.message : refusalSentence(null));
      }
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

  // RULED 2026-09-05 (P-19). "countersigns" is retired: this line used to
  // promise a second act on every kind of paper, including a trade scope,
  // whose own consent line is pinned never to assert one. What is true the
  // moment the route answers is that the studio holds her name and a copy is
  // hers — the same sentence the phone's seal says.
  const holder = studioName?.trim() || 'Your studio';
  const receipt = signedAt
    ? `${proposal.title} · signed ${DAY_MONTH.format(signedAt)} · ${holder} has your signature. You’ll have a copy.`
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
            : declined
              ? 'Shut. You declined it.'
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
            surfaceKey="the_threshold"
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
                <div className="mt-3">
                  <ScoredAction
                    data-testid="door-note-read"
                    actionKey="door_read_note"
                    regionKey="gate"
                    surfaceKey="the_threshold"
                    variant="tertiary"
                    href="#note"
                    // The hash alone would only scroll: `Link` handles the
                    // navigation itself, so the letter is focused here or a
                    // keyboard reader is left standing on the door leaf.
                    onClick={() => document.getElementById('note')?.focus()}
                  >
                    Read the note
                  </ScoredAction>
                </div>
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
                      disabled={submitting || !!signedAt || declined || expired}
                      onChange={(event) => setAgreed(event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 border border-current"
                    />
                    <span>{consentLineFor(kind)}</span>
                  </label>

                  {/* The name goes on a rule with the day beside it, and the
                      electronic-signature sentence is printed there rather
                      than in the hint below — one paper says it once. */}
                  <div className="mt-4">
                    <SignatureLine
                      id={nameId}
                      testId="door-sign-name"
                      value={name}
                      onChange={setName}
                      disabled={submitting || !!signedAt || declined || expired}
                      describedBy={hintId}
                    />
                  </div>
                  <p
                    id={hintId}
                    data-testid="door-hint"
                    className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
                  >
                    {declined
                      ? 'You declined this paper. Your studio has been told.'
                      : expired
                        ? 'This paper is past its date. Ask your studio to reissue it.'
                        : !drawn
                        ? bundle.isError
                          ? 'This paper could not be drawn just now. Reload to try again.'
                          : 'Drawing this paper.'
                        : ready
                          ? 'Ready when you are.'
                          : 'Type your full name and tick the line to sign.'}
                  </p>
                  {/* A refused signature is a genuine error, so it takes the
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
              }
            />

            {/* THE ACT SITS ON THE LEAF, NOT IN THE GATE. It is the scored
                primary of this door, and on a narrow viewport it docks: sticky
                to the bottom edge for as long as the paper it belongs to is on
                screen, so a long document cannot bury the one thing the door is
                asking for, and the four answers below it stay reachable.

                Sticky needs a containing block with room to travel, which is
                the leaf — inside the gate's act slot it would have had a few
                pixels of range and docked nothing. Fixed would have been worse:
                the doorway carries `perspective` for the swing, which makes it
                the containing block for anything fixed inside it. */}
            {!signedAt && (
              <HoldAction
                actionKey="gate_sign"
                regionKey="gate"
                surfaceKey="the_threshold"
                variant="primary"
                presentation="mobile_dock"
                verb="sign"
                wrapperClassName="mt-5 max-[600px]:-mx-5 max-[600px]:px-5"
                disabled={!ready}
                loading={submitting}
                loadingLabel="Signing"
                aria-describedby={hintId}
                onHold={onSign}
              >
                {signLabelFor(kind)}
              </HoldAction>
            )}

            {/* The other four answers the old /proposals/[id] page took, on
                the leaf rather than at the end of a route. They stand only
                while the paper is still asking: once it opens on her name the
                leaf goes, and with it the acts. */}
            {!signedAt && (
              <DoorActs
                proposalId={proposal.id}
                projectId={projectId}
                title={proposal.title}
                kind={resolvedKind}
                validUntil={proposal.validUntil ?? null}
                onDeclined={() => setDeclined(true)}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
