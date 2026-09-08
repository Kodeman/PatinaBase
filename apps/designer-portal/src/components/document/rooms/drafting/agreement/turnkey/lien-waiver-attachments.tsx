"use client";

/**
 * Lien waivers, per draw — P12.
 *
 * The attachment part carries the FORM the trades sign; this strip records
 * the EXCHANGE: which trade gave which kind of waiver against which draw, and
 * when. The two are deliberately different objects — a form is authored and
 * freezes at send, an exchange happens months later and has to be writable
 * long after the agreement is executed.
 *
 * A waiver is evidence about a past act, so the trade's name is SNAPSHOT onto
 * the row: the record has to keep naming the trade that gave it after the
 * studio tidies its rolodex.
 */

import { useState } from "react";
import {
  useRecordAgreementDrawLienWaiver,
  useStudioContacts,
} from "@patina/supabase";
import {
  LIEN_WAIVER_TYPES,
  type AgreementDraw,
  type LienWaiverType,
} from "@patina/types";
import { Button, Select } from "@/components/ui/controls";
import { documentEvents } from "@/lib/analytics/document-events";
import { turnkeyMoney } from "./money";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const WAIVER_LABELS: Record<LienWaiverType, string> = {
  conditional_progress: "Conditional · progress",
  unconditional_progress: "Unconditional · progress",
  conditional_final: "Conditional · final",
  unconditional_final: "Unconditional · final",
};

export function LienWaiverAttachments({
  proposalId,
  studioId,
  draws,
  recordedBy,
  readOnly = false,
}: {
  proposalId: string;
  studioId: string | null;
  draws: AgreementDraw[];
  recordedBy: string | null;
  readOnly?: boolean;
}) {
  const contacts = useStudioContacts(studioId);
  const record = useRecordAgreementDrawLienWaiver(proposalId);
  const [openDrawId, setOpenDrawId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string>("");
  const [waiverType, setWaiverType] = useState<LienWaiverType>(
    "conditional_progress",
  );
  const [note, setNote] = useState<string | null>(null);

  // W3R2-14 — nothing. `DrawLedger` stands directly above this in the rail and
  // already says "The draw ledger opens when this agreement is sent."; a
  // second copy of the sentence printed the same fact twice in one column.
  if (draws.length === 0) return null;

  const submit = async (draw: AgreementDraw) => {
    const contact = (contacts.data ?? []).find((row) => row.id === contactId);
    if (!contact || !recordedBy) {
      setNote("Pick the trade that gave this waiver.");
      return;
    }
    setNote(null);
    try {
      // R42 — the RPC's seven arguments, and nothing else: it snapshots the
      // trade's name off the studio's roster and stamps the recorder from the
      // session itself.
      await record.mutateAsync({
        drawId: draw.id,
        waiverType,
        contactId: contact.id,
        throughDate: null,
        amountCents: draw.netCents,
        storagePath: null,
        receivedAt: new Date().toISOString(),
      });
      documentEvents.agreementLienWaiverRecorded({
        proposal_id: proposalId,
        waiver_type: waiverType,
      });
      setOpenDrawId(null);
      setContactId("");
    } catch (error) {
      setNote(
        error instanceof Error
          ? error.message
          : "That waiver could not be recorded.",
      );
    }
  };

  return (
    <section aria-label="Lien waivers" className="space-y-3">
      <p className={LABEL}>Lien waivers</p>
      <ul className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
        {draws.map((draw) => (
          <li key={draw.id} data-draw-key={draw.drawKey} className="py-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[12px] text-[var(--text-body)]">
                {draw.label}
              </span>
              <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                {turnkeyMoney(draw.netCents)}
              </span>
            </div>
            {draw.lienWaivers.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {draw.lienWaivers.map((waiver) => (
                  <li
                    key={waiver.id}
                    className="text-[11.5px] text-[var(--color-mocha)]"
                  >
                    {waiver.contactDisplayName ?? "A trade"} ·{" "}
                    {WAIVER_LABELS[waiver.waiverType] ?? waiver.waiverType}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && openDrawId === draw.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`Trade for ${draw.label}`}
                  value={contactId}
                  onChange={(event) => setContactId(event.target.value)}
                  className="max-w-[220px]"
                >
                  <option value="">Pick a trade…</option>
                  {(contacts.data ?? []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.company_name || contact.full_name || "Unnamed"}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label={`Waiver kind for ${draw.label}`}
                  value={waiverType}
                  onChange={(event) =>
                    setWaiverType(event.target.value as LienWaiverType)
                  }
                  className="max-w-[220px]"
                >
                  {LIEN_WAIVER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {WAIVER_LABELS[type]}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  loading={record.isPending}
                  onClick={() => void submit(draw)}
                >
                  Record
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenDrawId(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              !readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenDrawId(draw.id)}
                >
                  Record a waiver
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      {note && (
        <p role="alert" className="text-[11.5px] text-[var(--color-mocha)]">
          {note}
        </p>
      )}
    </section>
  );
}
