'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@patina/shared';
import type { CommercialDocumentKind } from '@patina/types';

import { HoldAction, ScoredAction } from '@/components/threshold/instruments/scored-action';
import {
  SignatureLine,
  signatureIsComplete,
} from '@/components/threshold/instruments/signature-line';
import { SpineGate } from '@/components/threshold/instruments/spine-gate';
import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import {
  invalidateSignedCommercialDocument,
  useClientCommercialDocument,
} from '@/hooks/use-commercial-client';
import { makingEvents, proposalClientEvents } from '@/lib/analytics/events';
import { DAY_MONTH_FORMAT as DAY_MONTH, legalDate } from '@/lib/threshold/dates';
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
  composeConsentLine,
  composeSummaryLine,
  refusalSentence,
  signLabelFor,
  type ConsentPart,
} from './consent-copy';
import { DepositOffer, type DepositOfferModel } from './deposit-offer';
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
  /**
   * R30 — a paper that comes before a house. An agreement is bound to no
   * project until it is countersigned, so it stands on the doorstep of every
   * house she has rather than belonging to one of them; the leaf says so, and
   * the house ledger leaves its figure out.
   */
  houseless?: boolean;
  /**
   * R47 — the designer whose studio sent this paper. Carried on the paper so a
   * HOUSELESS door can hand it to `DoorActs`: with no project there is no
   * project thread, and a question about a paper that comes before the house
   * must reach the studio that sent it rather than an unrelated project's
   * thread.
   */
  designerId?: string | null;
  /**
   * R50 (W3R2-02) — the Threshold already knows, from the proposals list, that
   * this paper carries her signature; the door would otherwise have to wait for
   * its own bundle to find out, and in that window it drew the block that asks
   * for a name she has already given. The DATE still comes from the bundle's
   * signature row — this only says that one exists.
   */
  signedAlready?: boolean;
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
  /**
   * Null on the household door (R30): an ORIGIN agreement is bound to no
   * project until the studio countersigns it, and `DoorActs` and the
   * invalidation both already take null — the ask simply has no thread.
   */
  projectId: string | null;
  /**
   * R30 — the designer whose studio sent this paper. Only the household door
   * has to supply it: with no project there is no project thread, and this is
   * what lets "Ask a question" reach the studio anyway. A project-bound door
   * leaves it null and asks in the project's thread as it always has.
   */
  designerId?: string | null;
  /**
   * Fired the moment the signature lands, BEFORE the refetch that takes the
   * paper out of the open papers. The Threshold answers it by keeping this
   * mark and its paper for the rest of the visit, which is what leaves the
   * receipt on the page (W3-01) instead of unmounting it mid-crossfade.
   */
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
  designerId = null,
  onSigned,
  first = true,
  studioName,
}: DoorGateProps) {
  const queryClient = useQueryClient();
  const bundle = useClientCommercialDocument(proposal.id);

  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  /**
   * Wave 2, P6. One tick per attachment the studio marked
   * `acknowledgeRequired`, keyed by `part_key` — the keys the sign route
   * validates against the bundle's own attachments before the RPC records
   * them beside the signature.
   */
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<Date | null>(null);
  const [declined, setDeclined] = useState(false);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [replay, setReplay] = useState<string | null>(null);
  /**
   * P13 — what the sign route offered once the signature was already
   * recorded. Null until then, null when the route could not mint the
   * invoice, and null on every kind of paper but a turnkey prime. It takes no
   * part in `ready`, in the act's `disabled`, or in any preflight.
   *
   * IT IS A MOMENT, NOT A FIXTURE (ruled round 1 — client-notes.md §11, walk
   * step 13 amended). This is the visit in which she signed; on the next one
   * the paper is a record and the deposit is a LETTER, standing in her
   * letterbox with its own `/pay/<token>` act, which is the surface that owns
   * money. Nothing is blocked either way, and a second "Your deposit is
   * ready" printed permanently over a signed paper would be the same ask
   * repeated at her. Re-minting the sentence here on a later visit would need
   * the draw ledger to carry its invoice's id (PART 12, backend) — named in
   * the notes rather than guessed at from a title match.
   */
  const [depositOffer, setDepositOffer] = useState<DepositOfferModel | null>(null);
  const [doorState, setDoorState] = useState<DoorState>('shut');
  const [swingHeight, setSwingHeight] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [receiptInked, setReceiptInked] = useState(false);

  const doorwayRef = useRef<HTMLDivElement | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The wait that holds the refetch back until the leaf has finished (W2-01). */
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Its resolver, so an unmount can let the refetch through rather than strand it. */
  const releaseWait = useRef<(() => void) | null>(null);
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
      // Released, not just cancelled. The signature has landed by the time
      // anything is waiting here, and a refetch that never runs leaves the
      // signed paper standing on the doorstep until something else asks.
      releaseWait.current?.();
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

  /* ── R50 (W3R2-02) — THE RECEIPT SURVIVES ──────────────────────────────────
     The post-signature region used to live entirely in this component's memory:
     `signedAt` was set by the sign call and `depositOffer` came back in its
     response, so a reload took the receipt, KEEP A COPY, the deposit offer and
     the pay link with it. The walk signed, reloaded, and read "Nothing waits
     for your name" over a paper carrying her signature and an open first draw.

     Both halves are state, so both are read as state. The signature is the
     bundle's own client row; the offer is the deposit draw's live invoice and
     its link, re-derived by the bundle RPC (00578) and answered null the moment
     that invoice is settled. In-session values still win — they are the same
     facts, arriving a beat before the refetch that carries them. */
  const bundleSignature =
    bundle.data?.signatures?.find((row) => row.party === 'client') ?? null;
  const bundleSignedAt = parseSourceDate(bundleSignature?.signedAt ?? null);
  const standingSignedAt = signedAt ?? bundleSignedAt;
  // What the door knows before its own bundle answers (the paper) and after
  // (the signature row). Either one means she is not being asked again.
  const arrivedSigned = proposal.signedAlready === true || bundleSignedAt !== null;
  const bundleOffer = bundle.data?.designBuild?.depositOffer ?? null;
  const standingOffer: DepositOfferModel | null =
    depositOffer ??
    (bundleOffer
      ? {
          invoiceId: bundleOffer.invoiceId,
          amountCents: bundleOffer.amountCents,
          label: bundleOffer.label,
          payPath: `/pay/${encodeURIComponent(bundleOffer.payToken)}`,
        }
      : null);

  const items = isFurnishings ? (bundle.data?.furnishings?.items ?? []) : [];
  // The Making's fallback, verbatim: a trade scope carries no deposit percent,
  // its deposit is simply the first draw in the schedule.
  const depositCents =
    bundle.data?.furnishings?.depositRequiredCents ??
    bundle.data?.tradeScope?.draws[0]?.amountCents ??
    null;
  const sent = parseSourceDate(proposal.sentAt);

  /* THE CONSEQUENCE SENTENCE (R141, sheet §A6), composed from what the door
     already holds: the studio that sent the paper and the deposit the bundle
     names. A signature is not a payment, and the sentence says so — the
     deposit becomes payable and is paid from the letterbox, not from here. */
  const doorConsequence = [
    studioName
      ? `Signing records your name on this paper and returns it to ${studioName}.`
      : 'Signing records your name on this paper and returns it to your studio.',
    depositCents !== null && depositCents > 0
      ? `The deposit of ${formatCurrency(
          depositCents,
          bundle.data?.serviceTerms?.currency ?? 'USD',
        )} becomes payable; signing does not pay it.`
      : 'Nothing is charged by signing.',
  ].join(' ');

  /* ── THE COMPOSED CONSENT AND ITS ATTACHMENTS (Wave 2, P6) ────────────────
     The bundle drops every part the studio hid before the row crosses this
     edge (lib/commercial-documents.ts), so what arrives here IS the
     client-visible set — that is why `clientVisible` is true below rather
     than read off a field the RPC does not send. An agreement with no parts
     composes to today's line, byte for byte. */
  const parts = bundle.data?.parts ?? [];
  const consentParts: ConsentPart[] = parts.map((part) => ({
    kind: part.kind,
    variant: part.variant,
    clientVisible: true,
    payload: part.payload,
  }));
  const acknowledgeable = parts.filter(
    (part) => part.kind === 'attachment' && part.payload.acknowledgeRequired === true,
  );
  const acknowledgedKeys = acknowledgeable
    .filter((part) => acknowledged[part.partKey] === true)
    .map((part) => part.partKey);
  const allAcknowledged = acknowledgedKeys.length === acknowledgeable.length;

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
    drawn &&
    !declined &&
    !expired &&
    agreed &&
    // Every attachment the agreement requires her to acknowledge is a gate on
    // the act, not a footnote under it.
    allAcknowledged &&
    signatureIsComplete(name);

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
        body: JSON.stringify({ signedByName, attachmentsAcknowledged: acknowledgedKeys }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string | null;
        notificationDelivery?: { state?: string };
        depositOffer?: DepositOfferModel | null;
      };
      if (!response.ok) throw new Error(refusalSentence(body.error));

      proposalClientEvents.signed({ proposalId: proposal.id, signedByName });

      const stampedAt = new Date();
      signedAtRef.current = stampedAt;
      setSignedAt(stampedAt);
      // W3-02. The recovery lives here and only here: the retired
      // /proposals/[id] route pushed ?delivery=pending_retry at a
      // CommercialNotificationRecovery that no longer exists, and no other
      // surface reads the state — the sign response is the only place it is
      // ever spoken. So the block stands for as long as the door does, and
      // the Threshold keeps a signed door standing for the rest of the visit
      // (threshold.tsx, `sealedDoors`).
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

      // P13 / R15 — THE MONEY IS MENTIONED LAST, AND ONLY AFTER THE SIGNATURE
      // IS COMPLETE AND VISIBLE. The receipt has inked and the Threshold has
      // been told to keep this door standing before the offer exists at all.
      // The route already returns `null` here whenever it could not mint the
      // invoice, and `DepositOffer` renders nothing for a null — so a billing
      // failure is silence on a page that otherwise reads exactly the same.
      setDepositOffer(body.depositOffer ?? null);

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
      //
      // W3-01. The refetch no longer ends the section either: `onSigned` has
      // already told the Threshold to keep this mark and its paper, so what
      // is left standing after the leaf goes is the header, the P-19 receipt
      // and the delivery recovery — read for as long as she likes rather than
      // for the 520 ms the swing lasted.
      await new Promise<void>((resolve) => {
        releaseWait.current = resolve;
        invalidateTimer.current = setTimeout(resolve, stilled ? 0 : SWING_MS);
      });
      releaseWait.current = null;
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
  const receipt = standingSignedAt
    ? `${proposal.title} · signed ${legalDate(standingSignedAt)} · ${holder} has your signature. You’ll have a copy.`
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
      {...(standingSignedAt || arrivedSigned ? {} : { 'data-never-dim': '' })}
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
          {standingSignedAt || arrivedSigned
            ? 'Open. It opened on your name.'
            : declined
              ? 'Shut. You declined it.'
              : sent
                ? `Shut since ${legalDate(sent)} · it opens on your name`
                : 'Shut · it opens on your name'}
        </p>
      </div>

      {/* R30 — the paper that comes before a house. It is addressed to her,
          not to this house, so it stands on every door she has and says which
          it is; without the line the same paper on three doorsteps reads as
          three papers. */}
      {proposal.houseless && !standingSignedAt && !arrivedSigned && (
        <p
          data-testid="door-houseless"
          className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]"
        >
          This one comes before a house. It is addressed to you, so it waits on
          every door until you sign it.
        </p>
      )}

      {receipt && (
        <p
          data-testid="door-receipt"
          style={{ opacity: receiptInked ? 1 : 0 }}
          className="mt-3 font-mono text-[11px] leading-relaxed tracking-[0.04em] text-[var(--text-body)] transition-opacity duration-[420ms]"
        >
          {receipt}
        </p>
      )}

      {/* P-26. "You'll have a copy" is a promise the receipt makes one line
          above; this is where it is kept. A new tab, because the door has just
          swung on a page she may still be reading. */}
      {receipt && (
        <div className="mt-2" data-testid="door-keep-a-copy">
          <ScoredAction
            actionKey="keep_proposal_record"
            regionKey="door"
            surfaceKey="the_threshold"
            variant="tertiary"
            href={`/proposals/${encodeURIComponent(proposal.id)}/record`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Keep a copy
          </ScoredAction>
        </div>
      )}

      {/* P13 — the offer stands in the post-signature region, under the
          receipt and the copy she keeps: the signature is finished and said so
          before any money is named. Null renders nothing at all. */}
      {standingSignedAt && (
        <DepositOffer
          offer={standingOffer}
          drawCount={bundle.data?.designBuild?.draws.length ?? null}
          currency={bundle.data?.serviceTerms?.currency ?? 'USD'}
        />
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

      {/* A door she signed on an earlier visit opens on arrival: the leaf is
          the block that asks for her name, and it may not ask again. An
          in-session signature keeps the leaf until the swing finishes, which is
          what `signedAt` distinguishes. */}
      {doorState !== 'open' && !(arrivedSigned && !signedAt) && (
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
              {/* A composed agreement drops the four-facet half of this
                  sentence: it named role rates, a ceiling and a retainer that
                  a flat-fee or per-phase agreement does not carry, and the
                  consent line below names what this paper actually holds. An
                  agreement with no parts reads exactly as it always has. */}
              {composeSummaryLine(kind, proposal.title, consentParts)}
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
                      {formatCurrency(
                        item.clientLineTotalCents || 0,
                        bundle.data?.serviceTerms?.currency ?? 'USD',
                      )}
                    </dd>
                  </div>
                ))}
                <div
                  data-testid="door-total"
                  className="flex justify-between gap-4 border-b border-current py-1.5 text-[15px]"
                >
                  <dt>{caption ?? 'The whole of it'}</dt>
                  <dd className="font-mono text-[13px]">
                    {formatCurrency(
                      totalCents,
                      bundle.data?.serviceTerms?.currency ?? 'USD',
                    )}
                  </dd>
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
                  {/* THE ATTACHMENTS COME FIRST. An attachment the agreement
                      requires her to acknowledge is a separate act from
                      agreeing to the terms — she says she received the paper,
                      and then she says she agrees to it. Each tick is carried
                      to the signature by `part_key`. */}
                  {acknowledgeable.map((part) => (
                    <label
                      key={part.partKey}
                      data-testid="door-attachment-ack"
                      data-part-key={part.partKey}
                      className="mb-3 flex max-w-[52ch] cursor-pointer items-start gap-3 text-[15px] leading-normal text-[var(--text-body)]"
                      htmlFor={`door-ack-${fieldId}-${part.id}`}
                    >
                      <input
                        id={`door-ack-${fieldId}-${part.id}`}
                        type="checkbox"
                        checked={acknowledged[part.partKey] === true}
                        disabled={submitting || !!signedAt || declined || expired}
                        onChange={(event) =>
                          setAcknowledged((current) => ({
                            ...current,
                            [part.partKey]: event.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 shrink-0 border border-current"
                      />
                      <span>{`I received ${part.title}.`}</span>
                    </label>
                  ))}

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
                    <span data-testid="door-consent-line">
                      {composeConsentLine(kind, consentParts)}
                    </span>
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
                          : acknowledgeable.length > 0
                            ? 'Tick each attachment you received, type your full name, and tick the line to sign.'
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
              <>
                {/* The sentence stands over the act in every state, armed or
                    not (R141): a filled act carrying a paper's name has
                    already said it is heavy — this says what the weight is. */}
                <p data-testid="door-consequence" className="consequence mt-5">
                  {doorConsequence}
                </p>
                <HoldAction
                  actionKey="gate_sign"
                  regionKey="gate"
                  surfaceKey="the_threshold"
                  variant="terminal"
                  presentation="mobile_dock"
                  verb="sign"
                  wrapperClassName="max-[600px]:-mx-5 max-[600px]:px-5"
                  disabled={!ready}
                  loading={submitting}
                  loadingLabel="Signing"
                  unmetReason={
                    acknowledgeable.length > 0
                      ? 'Tick each attachment you received, type your full name, and tick the line to sign.'
                      : 'Type your full name and tick the line to sign.'
                  }
                  unmetFocusId={nameId}
                  aria-describedby={hintId}
                  onHold={onSign}
                >
                  {signLabelFor(kind)}
                </HoldAction>
              </>
            )}

            {/* The other four answers the old /proposals/[id] page took, on
                the leaf rather than at the end of a route. They stand only
                while the paper is still asking: once it opens on her name the
                leaf goes, and with it the acts. */}
            {!signedAt && (
              <DoorActs
                proposalId={proposal.id}
                projectId={projectId}
                studioProfileId={designerId}
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
