"use client";

/**
 * THE STUDIO'S BOOK, AS A FILE (P3 · "The second house" Wave 2).
 *
 * One act on the Accounts book's Ledger page: the studio's invoices, their
 * lines, their payments and the client/household records needed to read them,
 * as one .xlsx with a manifest. No lock-in is what makes a subscription honest;
 * this is the file that makes the claim true.
 *
 * The act says afterwards what left the studio — the row counts and, when
 * there are any, the disclosed exclusions — because a billing file that
 * quietly omitted rows is worse than no file. A failed read prints the step
 * that failed and writes nothing.
 *
 * The studio is the one this viewer's account answers for (`useAccountStudio`,
 * the same choice the Hours sheet's studio picker writes), and it is NAMED on
 * the act, so an owner of two studios cannot export the wrong book in silence.
 */

import { useState } from "react";

import { DocumentAction, DocumentActionGroup } from "../document-action";
import { useAccountStudio } from "@/hooks/use-viewer-studio";
import {
  downloadStudioBillingExport,
  StudioBillingExportError,
} from "@/lib/document/studio-billing-export-download";
import type { StudioBillingManifest } from "@/lib/document/studio-billing-export";

const TERRACOTTA_INK = "var(--color-terracotta-ink)";

/** What left the studio, in one sentence a studio owner can check. */
function tookSentence(manifest: StudioBillingManifest): string {
  const c = manifest.counts;
  return `Saved ${c.invoices ?? 0} invoices, ${c.invoice_lines ?? 0} lines, ${
    c.payments ?? 0
  } payments and ${c.clients ?? 0} client records, snapshot ${manifest.snapshotAt.slice(
    0,
    10,
  )}.`;
}

/** The exclusions worth a sentence on screen; the manifest sheet carries all
 *  of them either way. */
function withheldSentence(manifest: StudioBillingManifest): string | null {
  const parts: string[] = [];
  const { invoicesNullStudio, clientRecordsNoStudioPath } = manifest.exclusions;
  if (invoicesNullStudio > 0)
    parts.push(
      `${invoicesNullStudio} invoice${
        invoicesNullStudio === 1 ? "" : "s"
      } you can read carry no studio and are not in this file`,
    );
  // The counter is every roster row with NO studio path — a co-member's row in
  // another studio's engagement AND the designer's own studio-less lead (00588's
  // email-only shape, `client_id` and `household_id` both null). So the sentence
  // says what was measured and does not name a second studio.
  if (clientRecordsNoStudioPath > 0)
    parts.push(
      clientRecordsNoStudioPath === 1
        ? "1 client record carries no path to this studio's work and was left out"
        : `${clientRecordsNoStudioPath} client records carry no path to this studio's work and were left out`,
    );
  if (parts.length === 0) return null;
  return `${parts.join("; ")} — the manifest says so.`;
}

export function AccountsExportAction() {
  const { studio, isSettled } = useAccountStudio();
  const [running, setRunning] = useState(false);
  const [manifest, setManifest] = useState<StudioBillingManifest | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // No studio to answer for means no studio book to hand over; the act is not
  // offered rather than offered and refused.
  if (!isSettled || !studio) return null;

  const take = async () => {
    setRunning(true);
    setFailure(null);
    setManifest(null);
    try {
      const built = await downloadStudioBillingExport(
        studio.id,
        studio.name ?? null,
      );
      setManifest(built.manifest);
    } catch (error) {
      setFailure(
        error instanceof StudioBillingExportError
          ? `${error.step} could not be read.`
          : "The book could not be written to a file.",
      );
    } finally {
      setRunning(false);
    }
  };

  const withheld = manifest ? withheldSentence(manifest) : null;

  return (
    <div className="-mt-1 mb-3">
      <DocumentActionGroup surfaceKey="accounts" regionKey="ledger-export">
        <DocumentAction
          actionKey="export-studio-billing"
          variant="tertiary"
          loading={running}
          loadingLabel="Writing the file"
          disabled={running}
          title={`Download ${studio.name}'s invoices, payments and client records as one spreadsheet`}
          onClick={take}
        >
          Export the book → XLSX
        </DocumentAction>
      </DocumentActionGroup>
      <p className="mt-1 max-w-[62ch] text-[11px] leading-relaxed text-[var(--color-aged-oak)]">
        Invoices, their lines, their payments and the client and household
        records needed to read them — {studio.name} only, with a manifest of
        scope, exclusions and missing values.
      </p>
      {manifest && (
        <p
          role="status"
          className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed text-[var(--color-charcoal)]"
        >
          {tookSentence(manifest)}
          {withheld ? ` ${withheld}` : ""}
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed"
          style={{ color: TERRACOTTA_INK }}
        >
          {failure} Nothing was written — the file would have been short a
          section. Try the export again.
        </p>
      )}
    </div>
  );
}
