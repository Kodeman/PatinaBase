"use client";

import { ScoredAction } from "@/components/threshold/instruments/scored-action";
import { countInWords } from "@/components/threshold/instruments/standing-sentence";
import type { InvoiceProjection } from "@/lib/threshold/invoice-rollup";

/* ── The landmark ledger (PP-5 · IA-20 · R141, US-45 CPUX-01) ───────────────
   Literal names under the doorplate — Invoices, Approvals, Progress, then the
   page's other landmarks in the canvas order (A7 · F1, F3) — each a jump to
   the place it names. It is page furniture, not a header and not persistent
   navigation: it is struck once at the top of the page and scrolls with it.

   A LANDMARK WHOSE TARGET DOES NOT RENDER IS OMITTED — never drawn dim, never
   drawn disabled. An index pointing at an id that is not on the page is the
   failure IA-21 names. The caller answers for each target, because only the
   page knows which of its regions drew; every destination the caller names
   holds content, an honest empty state, or a recovery message.

   "Invoices" carries `data-never-dim`: the money is the one landmark that
   must stay legible while the house is read as it moved.

   The action keys are the ledger's existing analytics keys, kept through the
   rename. ─────────────────────────────────────────────────────────────────── */

/** The arrival's one purpose sentence (A7 · F6), on the house and the studio door alike. */
export const ARRIVAL_PURPOSE =
  "Pay invoices, review approvals, and follow your project here.";

interface Landmark {
  key: string;
  label: string;
  /** The element id, without its hash. */
  anchor: string;
  neverDim?: true;
}

export interface LandmarkLedgerProps {
  /** `#letterbox` drew. */
  invoices: boolean;
  /**
   * The first ask that actually drew (`wall`, `door`, `approval-<id>`), or the
   * approvals section's own id when nothing is asking; null omits it.
   */
  approvals: string | null;
  /** `#road` — the progress summary (or the studio door's explanation) drew. */
  progress: boolean;
  /** `note` or `previously` — where the designer's updates are on this page. */
  updates?: string | null;
  /** `#changed` — the doorstep's since-yesterday block drew. */
  whatChanged?: boolean;
  /** `#mat-papers` — the mat's documents column drew. */
  documents?: boolean;
  /** The help section and its literal name ("Contact Maren Holt"). */
  contact?: { anchor: string; label: string } | null;
}

/* Ledger links at 16px (A7 · F2), forest ink and score (A2). The house type
   classes are unlayered and outrank utilities, so the overrides are marked. */
const LINK_CLASS =
  "t-body !font-medium !tracking-normal !text-[color:var(--color-forest)] hover:!text-[color:var(--color-forest-press)] [&_.da-label]:before:!bg-[var(--color-forest)]";

export function LandmarkLedger({
  invoices,
  approvals,
  progress,
  updates = null,
  whatChanged = false,
  documents = false,
  contact = null,
}: LandmarkLedgerProps) {
  const landmarks: Landmark[] = [
    ...(invoices
      ? [
          {
            key: "what_you_owe",
            label: "Invoices",
            anchor: "letterbox",
            neverDim: true as const,
          },
        ]
      : []),
    ...(approvals
      ? [{ key: "what_needs_you", label: "Approvals", anchor: approvals }]
      : []),
    ...(progress
      ? [{ key: "where_we_are", label: "Progress", anchor: "road" }]
      : []),
    ...(updates ? [{ key: "updates", label: "Updates", anchor: updates }] : []),
    ...(whatChanged
      ? [{ key: "what_changed", label: "What changed", anchor: "changed" }]
      : []),
    ...(documents
      ? [{ key: "the_papers", label: "Documents", anchor: "mat-papers" }]
      : []),
    ...(contact
      ? [{ key: "contact", label: contact.label, anchor: contact.anchor }]
      : []),
  ];

  if (landmarks.length === 0) return null;

  return (
    <nav
      aria-label="On this page"
      data-testid="landmark-ledger"
      className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-0 p-0.5"
    >
      {landmarks.map((landmark) => (
        <ScoredAction
          key={landmark.key}
          href={`#${landmark.anchor}`}
          actionKey={`landmark_${landmark.key}`}
          regionKey="landmarks"
          surfaceKey="the_threshold"
          variant="tertiary"
          className={LINK_CLASS}
          data-landmark={landmark.key}
          data-never-dim={landmark.neverDim ? "" : undefined}
        >
          {landmark.label}
        </ScoredAction>
      ))}
    </nav>
  );
}

/* ── What the invoices say at the arrival (CPUX-01.6/.7) ─────────────────────
   Derived from the one projection, never re-counted here. A withheld count
   (loading, a failed or partial read, unread payment evidence) prints no
   number at all, and an empty group prints nothing: the Invoices section
   says which of loading, failure or "No invoices to pay." is true. ──────── */
export function invoiceArrivalLines(
  projection: InvoiceProjection | null,
): string[] {
  const counts = projection?.counts;
  if (!counts) return [];
  return [
    counts.payable > 0
      ? `You have ${countInWords(counts.payable)} ${counts.payable === 1 ? "invoice" : "invoices"} to pay.`
      : null,
    counts.processing > 0
      ? `${capitalize(countInWords(counts.processing))} ${
          counts.processing === 1 ? "payment is" : "payments are"
        } in progress.`
      : null,
    counts.review > 0
      ? `${capitalize(countInWords(counts.review))} ${
          counts.review === 1 ? "payment needs" : "payments need"
        } review.`
      : null,
  ].filter((line): line is string => line !== null);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The purpose sentence, or a derived arrival line, at body size under the doorplate. */
export function ArrivalLine({
  children,
  testId,
}: {
  children: string;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className="t-body mt-4 max-w-[56ch] text-[var(--text-primary)]"
    >
      {children}
    </p>
  );
}
