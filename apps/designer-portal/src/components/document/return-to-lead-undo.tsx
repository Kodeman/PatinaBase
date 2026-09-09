'use client';

/**
 * The Undo offer for "Accept · begin" (F2).
 *
 * "Accept · begin" is one click and it navigates away, so the offer to take it
 * back cannot live in the surface that fired it — that surface is already
 * unmounted by the time the designer notices the mistake. It is mounted once in
 * the (document) shell instead, and the triage bar publishes to it just before
 * it navigates.
 *
 * NOT the portal ToastProvider, and not a revival of it: R83 removed the toast
 * layer from every (document) surface and the shell still mounts no provider
 * (see the layout's note). Reaching for it here would switch on every `toast()`
 * call already sitting dormant in this tree. R83's subject is a FAILURE — which
 * still belongs inline at the act site — while this is an offer with a
 * deadline, which has nowhere else to stand. So it is one band, for one act,
 * with one action, holding the document's quiet grammar: hairline, flat, value
 * only, no shadow (D4).
 *
 * The mutation lives HERE rather than in the publisher, because the component
 * that published is gone; a mutation fired from its unmounted hook has no
 * observer left to run its callbacks.
 *
 * The DEADLINE lives in the store, not in this component. An offer whose band
 * unmounted mid-window (the designer walked to /preferences inside the eight
 * seconds) must expire on schedule anyway — a component-owned timer died with
 * the band and left the offer to reappear, live, hours later on the next
 * document route.
 *
 * The live region is mounted unconditionally and stays empty until there is
 * something to say: a polite region that appears with its content already in
 * place is not reliably announced.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReturnToLead } from '@patina/supabase';
import { DocumentAction } from './document-action';

/** How long the offer stands. Long enough to notice, short enough to mean it. */
const OFFER_MS = 8000;

export interface UndoOffer {
  /** What just happened, in the past tense. */
  message: string;
  /** The relationship the undo would remove. */
  designerClientId: string;
}

interface StandingOffer extends UndoOffer {
  /** Wall-clock deadline, so a remount cannot resurrect a dead offer. */
  expiresAt: number;
}

type Listener = (offer: StandingOffer | null) => void;

const listeners = new Set<Listener>();
let pending: StandingOffer | null = null;
let dwell: ReturnType<typeof setTimeout> | null = null;

function clearDwell(): void {
  if (dwell === null) return;
  clearTimeout(dwell);
  dwell = null;
}

/** Publish the offer. Safe to call from a component about to unmount. */
export function offerReturnToLeadUndo(offer: UndoOffer): void {
  clearDwell();
  pending = { ...offer, expiresAt: Date.now() + OFFER_MS };
  dwell = setTimeout(() => dismissReturnToLeadUndo(), OFFER_MS);
  listeners.forEach((listen) => listen(pending));
}

/** Withdraw the offer (taken, expired, or refused). */
export function dismissReturnToLeadUndo(): void {
  clearDwell();
  pending = null;
  listeners.forEach((listen) => listen(null));
}

/** The offer only if its window is still open; a lapsed one is discarded. */
function standingOffer(): StandingOffer | null {
  if (pending && pending.expiresAt <= Date.now()) {
    clearDwell();
    pending = null;
  }
  return pending;
}

export function ReturnToLeadUndo() {
  const router = useRouter();
  const returnToLead = useReturnToLead();
  const [offer, setOffer] = useState<StandingOffer | null>(standingOffer);
  const [failure, setFailure] = useState<string | null>(null);
  // A reversal in flight owns the band: the dwell timer must not blank the
  // sentence out from under a click made at the very end of the window.
  const acting = useRef(false);

  useEffect(() => {
    const listen: Listener = (next) => {
      if (next === null && acting.current) return;
      setFailure(null);
      setOffer(next);
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);

  // A refusal gets a window of its own, starting when it arrives — otherwise a
  // late failure is printed onto a band the dwell timer has already retired.
  useEffect(() => {
    if (!failure) return;
    const timer = window.setTimeout(() => {
      setFailure(null);
      setOffer(null);
      dismissReturnToLeadUndo();
    }, OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [failure]);

  const undo = useCallback(() => {
    if (!offer) return;
    acting.current = true;
    returnToLead.mutate(offer.designerClientId, {
      onSuccess: ({ lead_id }) => {
        acting.current = false;
        dismissReturnToLeadUndo();
        setOffer(null);
        router.replace(`/doc/${lead_id}`);
      },
      onError: (error) => {
        acting.current = false;
        // The RPC rejects with a PostgrestError — message-shaped, not always an
        // `instanceof Error` — so read `.message` off whatever arrived. The
        // server owns both the verdict and the sentence.
        const message = (error as { message?: string } | null)?.message;
        setFailure(message || 'That move could not be taken back.');
      },
    });
  }, [offer, returnToLead, router]);

  const standing = offer !== null || failure !== null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="return-to-lead-undo-region"
      className={
        standing
          ? 'fixed bottom-24 left-1/2 z-[45] -translate-x-1/2 min-[1180px]:bottom-6 min-[1180px]:left-6 min-[1180px]:translate-x-0'
          : 'sr-only'
      }
    >
      {standing && (
        <div
          data-testid="return-to-lead-undo"
          className="flex max-w-[min(92vw,420px)] flex-wrap items-center gap-x-4 gap-y-1 border border-[var(--color-pearl)] border-l-2 border-l-[var(--color-clay)] bg-[var(--bg-surface)] px-4 py-2.5"
        >
          {failure ? (
            <span
              role="alert"
              className="text-[13px] text-[var(--color-charcoal)]"
            >
              {failure}
            </span>
          ) : (
            <>
              <span className="text-[13px] text-[var(--color-charcoal)]">
                {offer?.message}
              </span>
              <DocumentAction
                actionKey="undo-begin-discovery"
                surfaceKey="open-document"
                regionKey="undo-offer"
                variant="tertiary"
                disabled={returnToLead.isPending}
                loading={returnToLead.isPending}
                loadingLabel="Moving…"
                onClick={undo}
              >
                Undo
              </DocumentAction>
            </>
          )}
        </div>
      )}
    </div>
  );
}
