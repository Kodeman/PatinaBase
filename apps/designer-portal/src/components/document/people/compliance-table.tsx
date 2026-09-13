"use client";

/**
 * THE PAPER A FIRM HOLDS (E10, SPEC §5.3 #3).
 *
 * One table, seven headings: Type, Number, Issuer, Expires, State, Held by,
 * Blocks. The company card is the ONLY place a compliance document is written
 * (direction §1 line 5); every other surface reads the word this table's rows
 * reduce to.
 *
 * The paper word is a `StateWord`, never a badge and never a colour alone, and
 * "what it blocks" is printed in the studio's words — site access, payment,
 * the draw — because a token no gate honours is a promise on a face.
 *
 * At 390 a table never scrolls sideways: each row becomes a label-over-value
 * stack (SPEC §6.2). One component renders both, so the two widths cannot
 * drift.
 */

import {
  COMPLIANCE_BLOCK_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  type ComplianceBlock,
  type StudioComplianceDocument,
} from "@patina/supabase";
import { StateWord } from "./state-word";
import { formatSeatDate } from "./seat-line";
import { capitalise, joinWords } from "./people-format";

export const NO_PAPER_OWED_SENTENCE = "No paper is held for this firm.";

/** The blocks one document holds, in the studio's words. */
export function documentBlockWords(doc: StudioComplianceDocument): string[] {
  return (doc.blocks ?? []).map(
    (block) => COMPLIANCE_BLOCK_LABELS[block as ComplianceBlock] ?? block,
  );
}

/** A document's own word: what it is, and what it holds up. */
export function documentTypeLabel(doc: StudioComplianceDocument): string {
  if (doc.doc_type === "other_named") return doc.doc_label ?? "Other";
  return (
    COMPLIANCE_DOC_TYPE_LABELS[
      doc.doc_type as keyof typeof COMPLIANCE_DOC_TYPE_LABELS
    ] ?? String(doc.doc_type)
  );
}

/** One paper's own state word, from its own dates. The firm's rolled-up word
 *  comes from `compliance_state()`; this is the row's. */
export function documentPaperState(
  doc: StudioComplianceDocument,
  today: Date,
): "current" | "lapses_soon" | "lapsed" | "not_on_file" {
  if (!doc.expires_on) return "current";
  const expires = Date.parse(`${doc.expires_on}T00:00:00Z`);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(expires)) return "current";
  if (expires < now) return "lapsed";
  if (expires - now <= 30 * 24 * 60 * 60 * 1000) return "lapses_soon";
  return "current";
}

/**
 * "Site access, payment and the draw are held until a current certificate is
 * on file." — the clause, in words, beneath the table (SPEC §5.3 #4). Only a
 * document that is actually lapsed or missing holds anything up, so a firm
 * whose paper is current prints no clause at all.
 */
export function paperHeldClause(
  documents: readonly StudioComplianceDocument[],
  today: Date,
): string | null {
  const held = new Set<string>();
  for (const doc of documents) {
    const state = documentPaperState(doc, today);
    if (state !== "lapsed") continue;
    for (const word of documentBlockWords(doc)) held.add(word);
  }
  if (held.size === 0) return null;
  return `${capitalise(joinWords([...held]))} ${held.size === 1 ? "is" : "are"} held until a current certificate is on file.`;
}

const TH =
  "font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-subtle)] text-left pr-3 pb-2";
const TD = "t-body-sm border-t border-[var(--hairline)] py-3 pr-3 align-top";

export function ComplianceTable({
  documents,
  today,
}: {
  documents: readonly StudioComplianceDocument[];
  today: Date;
}) {
  if (documents.length === 0) return null;

  return (
    <>
      {/* 1200 band: the ledger table. */}
      <table
        data-compliance-table
        className="hidden w-full border-collapse sm:table"
      >
        <thead>
          <tr>
            <th className={TH}>Type</th>
            <th className={TH}>Number</th>
            <th className={TH}>Issuer</th>
            <th className={TH}>Expires</th>
            <th className={TH}>State</th>
            <th className={TH}>Held by</th>
            <th className={TH}>Blocks</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} data-compliance-row={doc.id}>
              <td className={TD}>{documentTypeLabel(doc)}</td>
              <td className={TD}>{doc.number ?? "—"}</td>
              <td className={TD}>{doc.issuer ?? "—"}</td>
              <td className={TD}>
                {formatSeatDate(doc.expires_on) ??
                  (formatSeatDate(doc.issued_on)
                    ? `on file ${formatSeatDate(doc.issued_on)}`
                    : "—")}
              </td>
              <td className={TD}>
                <StateWord
                  family="paper"
                  value={documentPaperState(doc, today)}
                />
              </td>
              <td className={TD}>{doc.held_by === "gc" ? "GC" : "studio"}</td>
              <td className={TD}>
                {joinWords(documentBlockWords(doc)) || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 390: label over value, one stack per paper. A table never scrolls
          sideways on a phone (SPEC §6.2). */}
      <ul data-compliance-stack className="m-0 list-none p-0 sm:hidden">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="border-t border-[var(--hairline)] py-3"
            data-compliance-row-390={doc.id}
          >
            <p className="t-body-sm font-medium text-[var(--ink)]">
              {documentTypeLabel(doc)}
            </p>
            <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
              {[
                doc.number,
                doc.issuer,
                formatSeatDate(doc.expires_on) ??
                  (formatSeatDate(doc.issued_on)
                    ? `on file ${formatSeatDate(doc.issued_on)}`
                    : null),
                doc.held_by === "gc" ? "held by the GC" : "held by the studio",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1">
              <StateWord
                family="paper"
                value={documentPaperState(doc, today)}
              />
            </p>
            {documentBlockWords(doc).length > 0 && (
              <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
                Blocks {joinWords(documentBlockWords(doc))}.
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
