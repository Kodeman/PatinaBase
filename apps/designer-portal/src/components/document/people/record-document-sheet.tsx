"use client";

/**
 * RECORD A DOCUMENT — the one door a compliance paper enters through.
 *
 * The company card is the only place a document is written (direction §1 line
 * 5), and this is the sheet it is written on. Every field carries a visible
 * label above the control — never a `placeholder` attribute, which vanishes
 * the moment a studio starts typing and takes the question with it.
 *
 * A dated paper — a COI, a licence, a bond — must carry an expiry, because a
 * paper that cannot lapse cannot be chased. The sheet says so in words rather
 * than refusing in silence.
 */

import { useEffect, useId, useState } from "react";
import {
  ALL_COMPLIANCE_BLOCKS,
  ALL_COMPLIANCE_DOC_TYPES,
  COMPLIANCE_BLOCK_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  complianceDocRequiresExpiry,
  useRecordComplianceDocument,
  type ComplianceBlock,
  type ComplianceDocType,
} from "@patina/supabase";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { RoomSheet } from "../rooms/room-sheet";

const LABEL = "t-head mb-1 block text-[var(--ink-subtle)]";
const INPUT =
  "w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55] text-[var(--ink)]";

export const EXPIRY_REQUIRED_SENTENCE =
  "A certificate that can lapse needs the date it lapses on.";

export function RecordDocumentSheet({
  open,
  onClose,
  organizationId,
  holderId,
  holderName,
  holderType = "company",
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  holderId: string;
  holderName: string;
  holderType?: "person" | "company";
  onRecorded?: (message: string) => void;
}) {
  const record = useRecordComplianceDocument();
  const [docType, setDocType] = useState<ComplianceDocType>("coi_gl");
  const [docLabel, setDocLabel] = useState("");
  const [number, setNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [heldBy, setHeldBy] = useState<"studio" | "gc">("studio");
  const [blocks, setBlocks] = useState<ComplianceBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    if (!open) return;
    setDocType("coi_gl");
    setDocLabel("");
    setNumber("");
    setIssuer("");
    setIssuedOn("");
    setExpiresOn("");
    setHeldBy("studio");
    setBlocks([]);
    setError(null);
  }, [open]);

  const needsExpiry = complianceDocRequiresExpiry(docType);

  const submit = async () => {
    setError(null);
    if (needsExpiry && !expiresOn) {
      setError(EXPIRY_REQUIRED_SENTENCE);
      return;
    }
    if (docType === "other_named" && !docLabel.trim()) {
      setError(
        "Name this document — an unnamed one is the one that goes dark.",
      );
      return;
    }
    try {
      await record.mutateAsync({
        organizationId,
        holderType,
        holderId,
        docType,
        docLabel: docLabel.trim() || null,
        number: number.trim() || null,
        issuer: issuer.trim() || null,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        heldBy,
        blocks,
      });
      onRecorded?.(`${holderName}'s paper is on file.`);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not file that just now. Try again.",
      );
    }
  };

  return (
    <RoomSheet open={open} onClose={onClose} title="Record a document">
      <p className="t-head text-[var(--ink-subtle)]">Paper · {holderName}</p>
      <h2 className="t-d3 mt-1 font-heading">Record a document</h2>
      <p className="t-body-sm mb-6 mt-1 max-w-[56ch] text-[var(--ink-subtle)]">
        What the studio holds, who issued it, and what it holds up until it is
        current.
      </p>

      <label className={LABEL} htmlFor={`${ids}-type`}>
        Document
      </label>
      <select
        id={`${ids}-type`}
        value={docType}
        onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
        className={`${INPUT} mb-4`}
      >
        {ALL_COMPLIANCE_DOC_TYPES.map((t) => (
          <option key={t} value={t}>
            {COMPLIANCE_DOC_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {docType === "other_named" && (
        <>
          <label className={LABEL} htmlFor={`${ids}-label`}>
            What it is
          </label>
          <input
            id={`${ids}-label`}
            type="text"
            value={docLabel}
            onChange={(e) => setDocLabel(e.target.value)}
            className={`${INPUT} mb-4`}
          />
        </>
      )}

      <label className={LABEL} htmlFor={`${ids}-number`}>
        Number
      </label>
      <input
        id={`${ids}-number`}
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        className={`${INPUT} mb-4`}
      />

      <label className={LABEL} htmlFor={`${ids}-issuer`}>
        Issuer
      </label>
      <input
        id={`${ids}-issuer`}
        type="text"
        value={issuer}
        onChange={(e) => setIssuer(e.target.value)}
        className={`${INPUT} mb-4`}
      />

      <label className={LABEL} htmlFor={`${ids}-issued`}>
        On file
      </label>
      <input
        id={`${ids}-issued`}
        type="date"
        value={issuedOn}
        onChange={(e) => setIssuedOn(e.target.value)}
        className={`${INPUT} mb-4`}
      />

      <label className={LABEL} htmlFor={`${ids}-expires`}>
        Expires
      </label>
      <input
        id={`${ids}-expires`}
        type="date"
        value={expiresOn}
        onChange={(e) => setExpiresOn(e.target.value)}
        className={`${INPUT} mb-1`}
      />
      <p className="t-body-sm mb-4 text-[var(--ink-subtle)]">
        {needsExpiry
          ? EXPIRY_REQUIRED_SENTENCE
          : "This one does not lapse, so it needs no date."}
      </p>

      <label className={LABEL} htmlFor={`${ids}-held`}>
        Held by
      </label>
      <select
        id={`${ids}-held`}
        value={heldBy}
        onChange={(e) => setHeldBy(e.target.value as "studio" | "gc")}
        className={`${INPUT} mb-4`}
      >
        <option value="studio">The studio</option>
        <option value="gc">The GC</option>
      </select>

      <fieldset className="mb-4 border-0 p-0">
        <legend className={LABEL}>What it holds up until it is current</legend>
        {ALL_COMPLIANCE_BLOCKS.map((block) => (
          <label
            key={block}
            className="t-body-sm flex min-h-11 items-center gap-2 text-[var(--ink)]"
          >
            <input
              type="checkbox"
              checked={blocks.includes(block)}
              onChange={(e) =>
                setBlocks((current) =>
                  e.target.checked
                    ? [...current, block]
                    : current.filter((b) => b !== block),
                )
              }
            />
            {COMPLIANCE_BLOCK_LABELS[block]}
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="t-body-sm mb-3 text-[var(--terracotta-ink)]">
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="people"
        regionKey="record-document-sheet"
      >
        <DocumentAction
          actionKey="save-compliance-document"
          variant="primary"
          loading={record.isPending}
          loadingLabel="Filing…"
          onClick={() => void submit()}
        >
          File this document
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-compliance-document"
          variant="tertiary"
          onClick={onClose}
        >
          Cancel
        </DocumentAction>
      </DocumentActionGroup>
    </RoomSheet>
  );
}
