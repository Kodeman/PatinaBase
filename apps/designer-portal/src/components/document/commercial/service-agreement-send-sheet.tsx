"use client";

import { useState } from "react";
import { DocSheet } from "../overlays/doc-sheet";
import { Button, Textarea } from "@/components/ui/controls";
import { useSendServiceAgreement } from "@/hooks/use-commercial-documents";
import {
  assessServiceAgreementReadiness,
  type CommercialDocument,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "@/lib/document/commercial-documents";

export function ServiceAgreementSendSheet({
  open,
  onClose,
  onSent,
  document,
  terms,
  rates,
  recipientEmail,
  recipientName,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  document: CommercialDocument;
  terms: ServiceAgreementTerms | null;
  rates: ServiceRate[];
  recipientEmail: string | null;
  recipientName?: string;
}) {
  const send = useSendServiceAgreement(document.id);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const readiness = assessServiceAgreementReadiness({
    document,
    terms,
    rates,
    recipientEmail,
  });

  const submit = async () => {
    setResult(null);
    try {
      const response = await send.mutateAsync({
        personalMessage: message,
        validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      });
      setResult(
        response.emailDispatched
          ? "Agreement sent and email delivery confirmed."
          : "Agreement sent. Email delivery is still being confirmed.",
      );
      onSent?.();
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : "The agreement could not be sent.",
      );
    }
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Send design agreement">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-clay)]">
          Yes to the designer
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          Send for the client signature
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          {recipientName ? `${recipientName} receives` : "The client receives"}{" "}
          the services, rates, retainer policy, billing cadence, ceiling, and
          terms. Their signature preserves consent; the agreement still awaits
          the studio countersignature before work is authorized.
        </p>

        <div className="mt-5 rounded-[4px] border border-[var(--doc-ink-border)] px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Recipient
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {recipientEmail || "No client email linked"}
          </p>
        </div>

        {terms && (
          <div className="mt-3 rounded-[4px] border border-[var(--doc-ink-border)] px-4 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Furnishings deposit
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
              {terms.furnishingsDepositPercent === null
                ? "No furnishings deposit set — authorizations will default to 50%."
                : `Furnishings deposit · ${terms.furnishingsDepositPercent}% on each authorization`}
            </p>
          </div>
        )}

        {readiness.notes.length > 0 && (
          <div className="mt-3 border-l-2 border-[var(--color-golden-hour)] pl-3">
            <ul className="space-y-1 text-[11.5px] text-[var(--color-mocha)]">
              {readiness.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {readiness.ready ? (
          <p className="mt-4 border-l-2 border-[var(--color-sage)] pl-3 text-[12px] text-[var(--color-mocha)]">
            Ready to send · every contractual facet is present.
          </p>
        ) : (
          <div className="mt-4 border-l-2 border-[var(--color-terracotta)] pl-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
              Finish before sending
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-mocha)]">
              {readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="mt-5 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          A note to the client · optional
          <Textarea
            className="mt-2 min-h-24 normal-case tracking-normal"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="A short personal note to accompany the agreement."
          />
        </label>

        {result && (
          <p
            role="status"
            className="mt-4 text-[12px] text-[var(--color-mocha)]"
          >
            {result}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Send later
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!readiness.ready}
            loading={send.isPending}
          >
            Send agreement →
          </Button>
        </div>
      </div>
    </DocSheet>
  );
}
