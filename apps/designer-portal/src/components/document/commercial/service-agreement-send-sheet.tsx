"use client";

import { useState } from "react";
import { DESIGN_BUILD_PAPER_COPY, type AgreementPart } from "@patina/types";
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
  onRecordOffline,
  document,
  terms,
  rates,
  recipientEmail,
  recipientName,
  readinessOverride,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  /** 00477 — the third path out of this sheet, offered only while the
   *  agreement is still in the studio's hands and the server would accept a
   *  paper issuance. Omitted otherwise, because an act that would be refused
   *  should not be named here. */
  onRecordOffline?: () => void;
  document: CommercialDocument;
  terms: ServiceAgreementTerms | null;
  rates: ServiceRate[];
  recipientEmail: string | null;
  recipientName?: string;
  /** The composition itself, for the consequence sentence the sheet prints
   *  above its terminal act (FS-22). Declared here so the composer and the
   *  instruments strip can both pass it; read in a later task of this wave. */
  parts?: AgreementPart[];
  /** The composed agreement's verdict, when the room is running under
   *  `agreement-parts`. The seven-facet function below asks for a role rate
   *  and a ceiling unconditionally — true of the fixed facets, false of a
   *  flat-fee composition, which would otherwise be refused a send it is
   *  entitled to (R4). Omitted on the flag-off path, where nothing moves. */
  readinessOverride?: {
    ready: boolean;
    blockers: string[];
    notes: string[];
  };
}) {
  const send = useSendServiceAgreement(document.id);
  /* W3R2-05 — THE SHEET DESCRIBES THE PAPER IT IS SENDING.
     A design-build prime carries a pricing basis, draws, allowances, a sub
     disclosure, supervision, change orders, termination, terms and two
     attachments — not "services, rates, retainer policy, billing cadence,
     ceiling", and no furnishings deposit at all. Keyed off the document's
     KIND, so a frozen turnkey draft reads correctly too. */
  const turnkey = document.kind === "design_build";
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const readiness =
    readinessOverride ??
    assessServiceAgreementReadiness({
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
    <DocSheet
      open={open}
      onClose={onClose}
      title={turnkey ? "Send design-build agreement" : "Send design agreement"}
    >
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)]">
          {turnkey ? DESIGN_BUILD_PAPER_COPY.documentLabel : "Yes to the designer"}
        </p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          Send for the client signature
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          {recipientName ? `${recipientName} receives` : "The client receives"}{" "}
          {turnkey
            ? "the price, the schedule of values, the draw schedule, the allowances, who is doing the work, and the terms."
            : "the services, rates, retainer policy, billing cadence, ceiling, and terms."}{" "}
          Their signature preserves consent; the agreement still awaits the
          studio countersignature before work is authorized.
        </p>

        <div className="mt-5 rounded-[4px] border border-[var(--doc-ink-border)] px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Recipient
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-charcoal)]">
            {recipientEmail || "No client email linked"}
          </p>
        </div>

        {/* No furnishings pass through a design-build agreement, so a
            furnishings deposit is not a term it has. */}
        {terms && !turnkey && (
          <div className="mt-3 rounded-[4px] border border-[var(--doc-ink-border)] px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
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

        {/* W3R2-17 — "every contractual facet is present" is not something to
            say over a warning about missing allowance lines. A sheet that
            carries a caution carries only the caution. */}
        {readiness.ready && readiness.notes.length === 0 ? (
          <p className="mt-4 border-l-2 border-[var(--color-sage)] pl-3 text-[12px] text-[var(--color-mocha)]">
            Ready to send · every contractual facet is present.
          </p>
        ) : !readiness.ready ? (
          <div className="mt-4 border-l-2 border-[var(--color-terracotta)] pl-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
              Finish before sending
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-mocha)]">
              {readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="mt-5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {onRecordOffline ? (
            <button
              type="button"
              onClick={onRecordOffline}
              className="text-[12px] text-[var(--color-mocha)] underline underline-offset-4"
            >
              Record a signature received outside Patina
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
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
      </div>
    </DocSheet>
  );
}
