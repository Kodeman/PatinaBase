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
 */

import { useCallback, useEffect, useState } from 'react';
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

type Listener = (offer: UndoOffer | null) => void;

const listeners = new Set<Listener>();
let pending: UndoOffer | null = null;

/** Publish the offer. Safe to call from a component about to unmount. */
export function offerReturnToLeadUndo(offer: UndoOffer): void {
  pending = offer;
  listeners.forEach((listen) => listen(offer));
}

/** Withdraw the offer (taken, expired, or refused). */
export function dismissReturnToLeadUndo(): void {
  pending = null;
  listeners.forEach((listen) => listen(null));
}

export function ReturnToLeadUndo() {
  const router = useRouter();
  const returnToLead = useReturnToLead();
  const [offer, setOffer] = useState<UndoOffer | null>(pending);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const listen: Listener = (next) => {
      setFailure(null);
      setOffer(next);
    };
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => dismissReturnToLeadUndo(), OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [offer]);

  const undo = useCallback(() => {
    if (!offer) return;
    returnToLead.mutate(offer.designerClientId, {
      onSuccess: ({ lead_id }) => {
        dismissReturnToLeadUndo();
        router.replace(`/doc/${lead_id}`);
      },
      onError: (error) => {
        setFailure(
          error instanceof Error
            ? error.message
            : 'That move could not be taken back.',
        );
      },
    });
  }, [offer, returnToLead, router]);

  if (!offer) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="return-to-lead-undo"
      className="fixed bottom-24 left-1/2 z-40 flex max-w-[min(92vw,420px)] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-1 border border-[var(--color-pearl)] border-l-2 border-l-[var(--color-clay)] bg-[var(--bg-surface)] px-4 py-2.5 md:bottom-6 md:left-6 md:translate-x-0"
    >
      <span className="text-[13px] text-[var(--color-charcoal)]">
        {failure ?? offer.message}
      </span>
      {!failure && (
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
      )}
    </div>
  );
}
