"use client";

/**
 * Invoice overlays host (R74) — mounted once in the (document) layout, the
 * way the StudioDrawer owns the open-ledger event. Any surface — Accounts-book
 * rows, the Account band, the Money margin, the Hours ledger, the FF&E
 * section, ⌘K — opens the folio or the composer with one call:
 *
 *   openInvoiceFolio(invoiceId)          → the Invoice folio (paper sheet)
 *   openInvoiceComposer({ projectId? })  → the drawing composer (R74b)
 *
 * Both render ABOVE the charcoal ledger sheets (z-60, capture-phase Esc), so
 * the Accounts book stays mounted beneath — pull, act, put it back (D14).
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperFolioSheet } from "../overlays/paper-folio-sheet";
import { SectionLoadingLine } from "../section-loading-line";
import { InvoiceFolio } from "./invoice-folio";

// Keep the event/context owner and dismissible sheet eager; only an opened
// sheet needs the composer, not every importer of its openers.
const InvoiceComposer = lazy(() =>
  import("./invoice-composer").then((module) => ({ default: module.InvoiceComposer })),
);

// ── One-act openers ─────────────────────────────────────────────────────────

interface InvoiceComposerPrefill {
  /** Bill this project; omitted = the composer asks (project picker). */
  projectId?: string;
  /** R136 — open straight into the houseless choice (ruling S1). Honoured only
   *  while the `studio-invoice` flag is on, and never alongside a projectId. */
  mode?: "studio";
  /** R76 — the ?ffeItemIds= descendant: these FF&E items arrive ticked. */
  initialFfeItemIds?: string[];
  /** R75 — Bill week / bill-it: these unbilled entries arrive ticked
   *  (intersected per project when the composer has to ask which project). */
  initialTimeEntryIds?: string[];
  /** C-25 — "Bill N unbilled purchases": these purchases arrive ticked. */
  initialPurchaseIds?: string[];
  /** C-31 — "Bill N unbilled riders": these PO riders arrive ticked. */
  initialCostLineIds?: string[];
}

export type InvoiceComposerContext = InvoiceComposerPrefill | (Omit<InvoiceComposerPrefill, "mode"> & { mode: "edit"; invoiceId: string });

/** Where the folio puts focus when it opens (US-19 F3-3). `record` opens the
 *  payment panel with focus on its filled `Record the payment · $X`. */
export interface InvoiceFolioOptions {
  landOn?: "record";
}

/** Open the Invoice folio from anywhere in the document model. */
export function openInvoiceFolio(invoiceId: string, options?: InvoiceFolioOptions) {
  window.dispatchEvent(
    new CustomEvent("document:open-invoice-folio", {
      detail: { invoiceId, landOn: options?.landOn },
    }),
  );
}

/** Open the invoice composer ("Draw an invoice") from anywhere. */
export function openInvoiceComposer(context?: InvoiceComposerContext) {
  window.dispatchEvent(
    new CustomEvent("document:open-invoice-composer", {
      detail: context ?? {},
    }),
  );
}

// ── The host ────────────────────────────────────────────────────────────────

type OverlayState =
  | { kind: "folio"; invoiceId: string; landOn?: InvoiceFolioOptions["landOn"] }
  | { kind: "composer"; context: InvoiceComposerContext }
  | null;

export function InvoiceOverlays() {
  const router = useRouter();
  const [overlay, setOverlay] = useState<OverlayState>(null);

  useEffect(() => {
    const onFolio = (e: Event) => {
      const { invoiceId, landOn } =
        (e as CustomEvent<{ invoiceId: string } & InvoiceFolioOptions>).detail ?? {};
      if (invoiceId) setOverlay({ kind: "folio", invoiceId, landOn });
    };
    const onComposer = (e: Event) => {
      const context = (e as CustomEvent<InvoiceComposerContext>).detail ?? {};
      setOverlay({ kind: "composer", context });
    };
    window.addEventListener("document:open-invoice-folio", onFolio);
    window.addEventListener("document:open-invoice-composer", onComposer);
    return () => {
      window.removeEventListener("document:open-invoice-folio", onFolio);
      window.removeEventListener("document:open-invoice-composer", onComposer);
    };
  }, []);

  const close = () => setOverlay(null);

  return (
    <>
      <PaperFolioSheet
        open={overlay?.kind === "folio"}
        onClose={close}
        title="Invoice folio"
      >
        {overlay?.kind === "folio" && (
          <InvoiceFolio
            invoiceId={overlay.invoiceId}
            landOn={overlay.landOn}
            onOpenDocument={(projectId) => {
              // The doorway: close the folio and walk into the document. If an
              // Accounts sheet is open beneath, it stays (put it back with Esc).
              // A studio invoice has no house, so there is nowhere to walk.
              if (!projectId) return;
              close();
              router.push(`/doc/${projectId}`);
            }}
          />
        )}
      </PaperFolioSheet>

      <PaperFolioSheet
        open={overlay?.kind === "composer"}
        onClose={close}
        title={overlay?.kind === "composer" && overlay.context.mode === "edit" ? "Edit the draft" : "Draw an invoice"}
        wide
      >
        {overlay?.kind === "composer" && (
          <Suspense fallback={<SectionLoadingLine label="Loading invoice composer" />}>
            <InvoiceComposer
              key={overlay.context.mode === "edit" ? overlay.context.invoiceId : "new"}
              context={overlay.context}
              // The handoff: the fresh draft opens as the folio — issue & send
              // live there (review-then-send, R74).
              onDrafted={(invoiceId) => setOverlay({ kind: "folio", invoiceId })}
              onClose={close}
            />
          </Suspense>
        )}
      </PaperFolioSheet>
    </>
  );
}
