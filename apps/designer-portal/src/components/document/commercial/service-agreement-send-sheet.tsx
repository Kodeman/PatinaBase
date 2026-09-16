"use client";

import { useId, useState } from "react";
import {
  agreementConsequenceSentence,
  type AgreementPart,
} from "@patina/types";
import { DocSheet } from "../overlays/doc-sheet";
import { Button, Textarea } from "@/components/ui/controls";
import { useSendServiceAgreement } from "@/hooks/use-commercial-documents";
import {
  assessServiceAgreementReadiness,
  type CommercialDocument,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "@/lib/document/commercial-documents";

/** The retainer named on the terminal act. `null` when the composition has no
 *  written retainer, in which case the act carries no figure. */
function retainerLabel(
  parts: AgreementPart[] | undefined,
  currency: string,
): string | null {
  const retainer = parts?.find(
    (part) => part.kind === "schedule" && part.variant === "retainer",
  );
  const raw = retainer?.payload?.cents;
  const cents = typeof raw === "number" ? Math.round(raw) : Number(raw);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

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
  parts,
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
   *  above its terminal act (FS-22). Absent when the caller has none — the
   *  sentence then says the agreement has written nothing yet, and the act
   *  carries no figure. */
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
  /* W3R2-05 — THE SHEET DESCRIBES THE PAPER IT IS SENDING. The class is named
     once, in the sheet's title; the consequence sentence below is composed
     from the parts this agreement actually carries, whichever class it is. */
  const turnkey = document.kind === "design_build";
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const blockerListId = useId();
  const noteHintId = useId();
  const readiness =
    readinessOverride ??
    assessServiceAgreementReadiness({
      document,
      terms,
      rates,
      recipientEmail,
    });
  const currency = terms?.currency ?? "USD";
  const consequence = agreementConsequenceSentence({
    recipientName,
    parts: parts ?? [],
    currency,
  });
  const retainer = retainerLabel(parts, currency);
  const sendLabel = retainer
    ? `Send the agreement · ${retainer} retainer`
    : "Send the agreement";
  // IA-23 — set, the deposit is one clause inside the consequence sentence
  // (its procurement part carries it). Unset, it is the sheet's one caution.
  // `== null` — with no terms row at all the value is `undefined`, and the
  // strict test called a document with no deposit "set".
  const depositUnset = !turnkey && terms?.furnishingsDepositPercent == null;

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
        {(depositUnset || readiness.notes.length > 0) && (
          <div className="border-l-2 border-[var(--color-golden-hour)] pl-3">
            <ul className="space-y-1 text-[11.5px] text-[var(--color-mocha)]">
              {depositUnset && (
                <li>
                  The furnishings deposit is not set. Authorizations will
                  default to 50%.
                </li>
              )}
              {readiness.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {!readiness.ready && (
          <div
            id={blockerListId}
            className="mt-4 border-l-2 border-[var(--color-terracotta)] pl-3"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
              Finish before sending
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-[var(--color-mocha)]">
              {readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="mt-5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          A note to the client · optional
          <span
            id={noteHintId}
            className="t-meta mt-1 block text-[var(--text-muted)]"
          >
            A short personal note to accompany the agreement.
          </span>
          <Textarea
            className="mt-2 min-h-24 normal-case tracking-normal"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-describedby={noteHintId}
          />
        </label>

        {/* One region, two voices: the send's own result, and the reason a
            held act refused. Present so an activation is never silent. */}
        <p
          role="status"
          aria-live="polite"
          className="mt-4 text-[12px] text-[var(--color-mocha)]"
        >
          {result ?? held}
        </p>

        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          {consequence}
        </p>

        {/* Walk D1 — the acts row is `justify-end`, and an act wider than the
            sheet overflows to the LEFT: at 390 the sheet goes full-bleed and
            "Send the agreement · $5,000.00 retainer" had its leading "Se" cut
            off past the sheet's own bound. Below 480 the two acts stack
            full-width, and the terminal act's label wraps inside it — the
            house sheet wraps, never truncates, and the amount stays in the
            label. */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 max-[480px]:flex-col max-[480px]:items-stretch">
          <Button
            variant="ghost"
            onClick={onClose}
            className="max-[480px]:w-full"
          >
            Not yet
          </Button>
          <Button
            className="whitespace-normal text-center max-[480px]:w-full"
            onClick={() => void submit()}
            disabled={!readiness.ready}
            /* Check 7 — `held` is what the READINESS says, not what the
               network is doing: a bare `held` also fired while the send was
               in flight, marking the act `aria-disabled` with no reason
               attached and announcing that a ready agreement was not ready. */
            held={!readiness.ready}
            onHeldActivate={() => {
              setResult(null);
              setHeld(
                readiness.blockers[0] ??
                  "This agreement is not ready to send yet.",
              );
            }}
            aria-describedby={readiness.ready ? undefined : blockerListId}
            loading={send.isPending}
          >
            {sendLabel}
          </Button>
        </div>

        {onRecordOffline && (
          <div className="mt-6 border-t border-[var(--doc-ink-border)] pt-4">
            <button
              type="button"
              onClick={onRecordOffline}
              className="text-[12px] text-[var(--color-mocha)] underline underline-offset-4"
            >
              Record a signature received outside Patina
            </button>
          </div>
        )}
      </div>
    </DocSheet>
  );
}
