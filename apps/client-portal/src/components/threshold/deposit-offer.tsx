'use client';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import { moneyToTheCent } from '@/components/commercial/design-build-body';

/* ── SIGN, THEN OFFER (Wave 3, P13 · R15) ────────────────────────────────────
   A turnkey agreement's first draw is due on signing, and the honest place to
   say so is the moment after she signs — not a second email a day later, and
   never a condition on the signature itself.

   THE RULE IS STRUCTURAL, NOT CAREFUL. This component knows nothing about
   whether the signature succeeded, because by the time it can render, it has:
   the door only hands it an offer after `setSignedAt` and `onSigned` have run,
   and the offer itself is minted by a separate, independently failable call
   the sign route makes AFTER the signature RPC returned. So there is no state
   in which a billing failure can reach the signature — and none in which this
   component can hold it up.

   AND A FAILURE IS SILENCE. `offer === null` renders nothing at all: no error,
   no retry prompt, no "payment unavailable". Her signature is complete and
   recorded either way, and a studio that cannot mint the invoice will simply
   send it. Telling her, on the receipt for her own signature, that a system
   she has no part in did not work would make the failure hers.

   It is a plain link to the shipped payer surface (`/pay/<token>`), which owns
   the card and ACH chooser. Wave 3 mints no Checkout session and holds no
   Stripe key. ────────────────────────────────────────────────────────────── */

export interface DepositOfferModel {
  invoiceId: string;
  amountCents: number;
  /** The draw's own label, as the studio wrote it. */
  label: string;
  /** `/pay/<token>` — built by the sign route from the invoice's own link. */
  payPath: string;
}

export function DepositOffer({
  offer,
  drawCount = null,
  currency = 'USD',
}: {
  offer: DepositOfferModel | null;
  /** How many draws the paper carries, when the door knows. */
  drawCount?: number | null;
  currency?: string;
}) {
  if (!offer) return null;

  const place =
    drawCount !== null && drawCount > 1
      ? `The first of ${countInWords(drawCount)} draws · due on signing.`
      : `${offer.label} · due on signing.`;

  return (
    <section
      data-testid="deposit-offer"
      className="mt-4 max-w-[56ch] border-t border-[var(--border-subtle)] pt-4"
    >
      <p className="font-heading text-[1.1rem] leading-snug text-[var(--text-primary)]">
        {`Your deposit is ready — ${moneyToTheCent(offer.amountCents, currency)}`}
      </p>
      <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-body)]">
        {`${place} You can pay now, or your studio will send it.`}
      </p>
      <div className="mt-3">
        <ScoredAction
          actionKey="door_pay_deposit"
          regionKey="door"
          surfaceKey="the_threshold"
          variant="secondary"
          href={offer.payPath}
          data-testid="deposit-offer-pay"
        >
          Pay the deposit
        </ScoredAction>
      </div>
    </section>
  );
}
