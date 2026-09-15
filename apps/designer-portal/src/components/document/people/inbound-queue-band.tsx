"use client";

/**
 * THE INBOUND QUEUE — paper the FIRM sent, waiting for the studio's check
 * (upload-door-spec §6, PR-a / VISION V10).
 *
 * It prints ABOVE the Paper region's table and only while at least one pending
 * row exists for this holder: a band that says "0 documents waiting" is a
 * region stating nothing (R-V / C32 cuts the other way here — an empty QUEUE
 * is not an absent RECORD, it is simply no queue).
 *
 * Both acts are TWO-STEP INLINE CONFIRMS, never a modal (direction §5.3), and
 * the reject's reason is REQUIRED — 00637 refuses a refusal with no words in
 * it, because a refusal the firm cannot read is one it cannot fix. The act is
 * held with a visible sentence rather than `disabled` (direction §5.5).
 *
 * WHAT CONFIRM COSTS IS SAID BEFORE IT IS TAKEN. Confirming retires the
 * certificate this one replaces — the old row is kept and pointed at the new
 * one, never deleted (spec §5.5) — and R-AZ refuses a successor that is
 * undated, lapsed, or carries fewer gates than the paper it would retire. Both
 * refusals reach the face as sentences (`asInboundDocumentError`).
 */

import { useState } from "react";
import {
  inboundDocumentLine,
  inboundQueueHeading,
  useConfirmInboundDocument,
  useInboundDocuments,
  useRejectInboundDocument,
  type StudioComplianceDocument,
} from "@patina/supabase";
import { DocumentAction, DocumentActionRow } from "../document-action";

const LABEL =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-subtle)]";
const FIELD =
  "min-h-11 w-full border-0 border-b border-[var(--hairline-strong)] bg-transparent py-2 text-[0.8rem] text-[var(--ink)] outline-none focus:border-[var(--color-clay)]";

export const CONFIRM_CONSEQUENCE_SENTENCE =
  "Confirming makes this the paper the studio holds. The certificate it " +
  "replaces is retired, kept, and readable.";
export const REJECT_REASON_PROMPT =
  "Say why it is refused. The firm reads this, and a note asking for the " +
  "replacement is filed for your review.";
export const REJECT_HELD_SENTENCE =
  "Write the reason first — a refusal the firm cannot read is one it cannot fix.";

/** One pending row, with its two acts. */
function InboundRow({
  doc,
  firmName,
  onAnnounce,
}: {
  doc: StudioComplianceDocument;
  firmName: string;
  onAnnounce: (message: string) => void;
}) {
  const [step, setStep] = useState<"idle" | "confirming" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirmDoc = useConfirmInboundDocument();
  const rejectDoc = useRejectInboundDocument();

  const line = inboundDocumentLine(doc, firmName);
  const reasonId = `inbound-reason-${doc.id}`;
  const heldId = `inbound-reject-held-${doc.id}`;
  const reasonWritten = reason.trim().length > 0;

  return (
    <li
      data-inbound-document={doc.id}
      className="border-t border-[var(--hairline-strong)] py-3"
    >
      <p className="t-body-sm text-[var(--ink)]">{line}</p>

      {step === "idle" && (
        <DocumentActionRow
          surfaceKey="people"
          regionKey="company-paper-inbound"
          className="mt-1"
          aria-label={`Check ${line}`}
        >
          <DocumentAction
            actionKey="confirm-inbound-document"
            variant="secondary"
            onClick={() => {
              setError(null);
              setStep("confirming");
            }}
          >
            Confirm
          </DocumentAction>
          <DocumentAction
            actionKey="reject-inbound-document"
            variant="tertiary"
            onClick={() => {
              setError(null);
              setStep("rejecting");
            }}
          >
            Reject
          </DocumentAction>
        </DocumentActionRow>
      )}

      {step === "confirming" && (
        <div className="mt-2 border-l-2 border-[var(--color-clay)] bg-[var(--rail)] px-3 py-2.5">
          <p className="t-body-sm text-[var(--ink)]">
            – {CONFIRM_CONSEQUENCE_SENTENCE}
          </p>
          <DocumentActionRow
            surfaceKey="people"
            regionKey="company-paper-inbound-confirm"
            className="mt-2"
            aria-label="Confirm this document"
          >
            <DocumentAction
              actionKey="confirm-inbound-document-confirm"
              variant="primary"
              loading={confirmDoc.isPending}
              loadingLabel="Recording…"
              onClick={() =>
                void confirmDoc
                  .mutateAsync({ documentId: doc.id, holderId: doc.holder_id })
                  .then(() => {
                    setStep("idle");
                    onAnnounce(`${line.replace(/\.$/, "")} is confirmed.`);
                  })
                  .catch((e: unknown) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not confirm that just now.",
                    ),
                  )
              }
            >
              Confirm the document
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-confirm-inbound-document"
              variant="tertiary"
              onClick={() => setStep("idle")}
            >
              Not yet
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {step === "rejecting" && (
        <div className="mt-2 border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] px-3 py-2.5">
          <p className="t-body-sm text-[var(--ink)]">– {REJECT_REASON_PROMPT}</p>
          <label className={`mt-2 block ${LABEL}`} htmlFor={reasonId}>
            Why it is refused
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={FIELD}
          />
          <DocumentActionRow
            surfaceKey="people"
            regionKey="company-paper-inbound-reject"
            className="mt-2"
            aria-label="Refuse this document"
          >
            <DocumentAction
              actionKey="reject-inbound-document-confirm"
              variant="danger"
              held={!reasonWritten}
              disabled={!reasonWritten}
              aria-describedby={!reasonWritten ? heldId : undefined}
              loading={rejectDoc.isPending}
              loadingLabel="Recording…"
              onClick={() =>
                void rejectDoc
                  .mutateAsync({
                    documentId: doc.id,
                    holderId: doc.holder_id,
                    reason,
                  })
                  .then(() => {
                    setStep("idle");
                    setReason("");
                    onAnnounce(
                      `${line.replace(/\.$/, "")} is refused. A note to ${firmName} is waiting for your review.`,
                    );
                  })
                  .catch((e: unknown) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not record that just now.",
                    ),
                  )
              }
            >
              Refuse it
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-reject-inbound-document"
              variant="tertiary"
              onClick={() => setStep("idle")}
            >
              Not now
            </DocumentAction>
          </DocumentActionRow>
          {/* Direction §5.5: a held act carries a VISIBLE consequence sentence
              beside it — never `disabled` alone. */}
          {!reasonWritten && (
            <p id={heldId} className="t-body-sm mt-1 text-[var(--ink-subtle)]">
              {REJECT_HELD_SENTENCE}
            </p>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-inbound-error
          className="t-body-sm mt-1.5 text-[var(--terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </li>
  );
}

export function InboundQueueBand({
  holderId,
  firmName,
  onAnnounce,
}: {
  holderId: string;
  firmName: string;
  onAnnounce: (message: string) => void;
}) {
  const { data: pending } = useInboundDocuments(holderId);
  const rows = pending ?? [];
  if (rows.length === 0) return null;

  return (
    <div
      data-inbound-queue
      className="mb-4 border-l-2 border-[var(--color-clay)] bg-[var(--rail)] px-3 py-2.5"
    >
      <h4 className="t-head text-[var(--ink-subtle)]">
        {inboundQueueHeading(rows.length)}
      </h4>
      <ul className="m-0 list-none p-0">
        {rows.map((doc) => (
          <InboundRow
            key={doc.id}
            doc={doc}
            firmName={firmName}
            onAnnounce={onAnnounce}
          />
        ))}
      </ul>
    </div>
  );
}
