"use client";

/**
 * R2 · M2 — a gate has six parts and no more.
 *
 * M2's left-margin annotations are pedagogical and do not ship, so the
 * read-only ceremony separates its parts by typography and order rather than
 * by a label column; each part keeps an accessible name so the anatomy still
 * reaches assistive technology. The authoring form labels its groups because a
 * form's fieldsets must be named.
 *
 * D4: the artifact's depth is flat stacked edges over the paper tokens — never
 * a shadow.
 */

import type { CSSProperties, ReactNode } from "react";

export const GATE_PARTS = [
  "artifact",
  "question",
  "scope",
  "impact",
  "authority",
  "confirmation",
] as const;

export type GatePart = (typeof GATE_PARTS)[number];

const PART_LABEL: Record<GatePart, string> = {
  artifact: "Artifact",
  question: "Question",
  scope: "Scope",
  impact: "Impact",
  authority: "Authority",
  confirmation: "Confirmation",
};

export function gatePartLabel(part: GatePart): string {
  return PART_LABEL[part];
}

export function GateCeremony({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-gate-ceremony
      className="mt-3 grid min-w-0 grid-cols-1 gap-4"
    >
      {children}
    </div>
  );
}

/** A part of the settled-facing ceremony: named for AT, unlabelled on paper. */
export function GatePartBlock({
  part,
  children,
}: {
  part: GatePart;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={PART_LABEL[part]}
      data-gate-part={part}
      className="min-w-0"
    >
      {children}
    </div>
  );
}

/** A part of the authoring flow: the fieldset wears its name. */
export function GateFieldset({
  part,
  children,
}: {
  part: GatePart;
  children: ReactNode;
}) {
  return (
    <fieldset
      data-gate-part={part}
      className="m-0 min-w-0 border-0 border-b border-solid border-[var(--color-pearl)] p-0 pb-4 last:border-b-0 last:pb-0"
    >
      <legend className="mb-2 font-mono text-[12px] font-semibold uppercase tracking-[0.17em] text-[var(--color-mocha)]">
        {PART_LABEL[part]}
      </legend>
      <div className="min-w-0">{children}</div>
    </fieldset>
  );
}

const SHEET =
  "h-1.5 border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-tint)]";

/** ARTIFACT — the exact thing, at a stated edition. */
export function ArtifactEdges({
  title,
  meta,
}: {
  title: string;
  meta: string;
}) {
  return (
    <div className="min-w-0" data-artifact-edges>
      <div
        aria-hidden="true"
        className={`ml-4 ${SHEET}`}
        style={{ "--doc-sheet-tint": "var(--doc-sheet-3)" } as CSSProperties}
      />
      <div
        aria-hidden="true"
        className={`ml-2 mt-0.5 ${SHEET}`}
        style={{ "--doc-sheet-tint": "var(--doc-sheet-2)" } as CSSProperties}
      />
      <div className="mt-0.5 min-w-0 border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-3 py-2.5">
        <p className="min-w-0 break-words text-[13px] font-semibold leading-snug text-[var(--color-charcoal)]">
          {title}
        </p>
        <p className="mt-1 min-w-0 break-words font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]">
          {meta}
        </p>
      </div>
    </div>
  );
}

/** QUESTION — one sentence, answerable. */
export function GateQuestion({ children }: { children: ReactNode }) {
  return (
    <p className="min-w-0 break-words font-heading text-[20px] font-medium leading-tight text-[var(--color-charcoal)]">
      {children}
    </p>
  );
}

/** SCOPE / AUTHORITY — plain sentences at the body floor. */
export function GatePlain({ children }: { children: ReactNode }) {
  return (
    <p className="min-w-0 break-words text-[14px] leading-relaxed text-[var(--color-charcoal)]">
      {children}
    </p>
  );
}

/** IMPACT — signed, never implied. */
export function GateImpact({ children }: { children: ReactNode }) {
  return (
    <p className="min-w-0 break-words font-mono text-[13px] tracking-[0.05em] text-[var(--color-charcoal)]">
      {children}
    </p>
  );
}
