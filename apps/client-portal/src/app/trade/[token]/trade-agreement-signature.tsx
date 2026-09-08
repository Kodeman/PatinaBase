'use client';

/**
 * The one act on the Trade Agreement guest page: a typed full name and a held
 * press (P14, R16).
 *
 * Kept as its own client component so the page shell stays a server component,
 * exactly like rfq/[token]/rfq-response-form.tsx. The instruments are the
 * portal's own — SignatureLine carries the electronic-signature sentence, and
 * HoldAction is the held act the client's own signature already uses, so a sub
 * signs with the same gesture and the same ink as the homeowner rather than a
 * second, lesser one invented here.
 *
 * Every end state is a plain sentence. A dead link, a withdrawn agreement and
 * a replay each read differently, and none of them is a raw DB message.
 */

import { useState, useTransition } from 'react';
import { HoldAction } from '@/components/threshold/instruments/scored-action';
import {
  SignatureLine,
  signatureIsComplete,
} from '@/components/threshold/instruments/signature-line';
import { signTradeAgreement } from './actions';
import { formatLongDate, type TradeAgreementSignatureReceipt } from './types';

type Outcome =
  | { kind: 'signed'; signedName: string | null; signedAt: string | null }
  | { kind: 'agreement_void' };

/**
 * The receipt's second line is whatever the receipt actually carries. A replay
 * whose receipt names nobody (N3) prints no name rather than the name the
 * replayer just typed, so a receipt never credits the wrong person.
 */
function Receipt({
  signedName,
  signedAt,
}: {
  signedName: string | null;
  signedAt: string | null;
}) {
  const line = [signedName, formatLongDate(signedAt)].filter(Boolean).join(' · ');
  return (
    <section
      data-testid="trade-agreement-receipt"
      aria-label="Your signature"
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-6"
    >
      <p className="type-item-name">Signed.</p>
      {line && <p className="type-body-small mt-2 text-[var(--text-muted)]">{line}</p>}
      <p className="type-body-small mt-3 text-[var(--text-muted)]">
        Your studio holds a copy of this agreement as you signed it.
      </p>
    </section>
  );
}

export function TradeAgreementSignature({
  token,
  existingSignature,
}: {
  token: string;
  existingSignature: TradeAgreementSignatureReceipt | null;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [isPending, startTransition] = useTransition();

  // A link opened again after signing is the settled receipt, never a second
  // form — the signature is already on the agreement and there is nothing to
  // press.
  if (existingSignature) return <Receipt {...existingSignature} />;

  if (outcome?.kind === 'signed') {
    return <Receipt signedName={outcome.signedName} signedAt={outcome.signedAt} />;
  }

  if (outcome?.kind === 'agreement_void') {
    return (
      <p className="type-body rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-8 text-center">
        This agreement was withdrawn. Your studio can send a new one.
      </p>
    );
  }

  // NO VALIDATION VOICE (signature-line.tsx): the rule never reports that it
  // is empty and never turns a colour — the act simply stays unarmed until
  // there is a name, which is how every door in this portal already works.
  const sign = () => {
    setError(null);
    startTransition(async () => {
      const result = await signTradeAgreement(token, { signedName: name });
      if (result.status === 'invalid') {
        setError('This link is no longer active.');
        return;
      }
      // N2: the answer was neither a signature nor a failure this page can
      // read. Ink nothing — go back to the server and be told the truth,
      // rather than print "Signed." over a signature that may not exist.
      if (result.status === 'unknown') {
        if (typeof window !== 'undefined') window.location.reload();
        return;
      }
      if (result.status === 'agreement_void') {
        setOutcome({ kind: 'agreement_void' });
        return;
      }
      // saved and already_signed settle the same way: the receipt, carrying
      // the ORIGINAL name and date on a replay.
      setOutcome({
        kind: 'signed',
        signedName: result.signedName,
        signedAt: result.signedAt,
      });
    });
  };

  return (
    <section aria-label="Sign this agreement" className="space-y-4">
      <SignatureLine
        id="trade-agreement-signed-name"
        testId="trade-agreement-signed-name"
        value={name}
        onChange={setName}
        disabled={isPending}
      />
      {error && (
        <p role="alert" className="type-body-small text-[var(--color-terracotta)]">
          {error}
        </p>
      )}
      <HoldAction
        actionKey="trade_agreement_sign"
        surfaceKey="trade_agreement"
        regionKey="signature"
        verb="sign this agreement"
        onHold={sign}
        loading={isPending}
        loadingLabel="Signing…"
        disabled={!signatureIsComplete(name)}
      >
        Sign this agreement
      </HoldAction>
    </section>
  );
}
