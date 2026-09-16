"use client";

/**
 * From your Library — the Wave 2 Add-a-part picker (M2).
 *
 * Two columns. On the left, the parts the studio already has: Patina's nine
 * standard parts and everything the studio has saved to its own Library. On
 * the right, a blank one — a Clause, a List, a Schedule of any of the fifteen
 * variants, or an Attachment.
 *
 * Nothing here writes. A choice is added to the composer's list at the end of
 * the rail and saved with the rest of the composition through
 * `upsert_agreement_parts`, which is the only door the parts table has.
 *
 * R18 — a money part the agreement already carries is shown, and refused,
 * rather than hidden: the designer sees that Patina has a Ceiling and that
 * this agreement already has one. The RPC would raise `an agreement carries
 * only one ceiling`; the picker never lets the click happen.
 *
 * R7 vocabulary: Agreement · Part · Library · Template · Addendum. Never
 * "clause library", never "contract builder", never "block" or "snippet".
 */

import { useMemo, useState } from "react";
import { useStudioAgreementParts } from "@patina/supabase";
import {
  AGREEMENT_SCHEDULE_VARIANTS,
  PATINA_STANDARD_AGREEMENT_PARTS,
  type AgreementPart,
  type AgreementPartKind,
  type AgreementScheduleVariant,
  type StudioAgreementPart,
} from "@patina/types";
import { Button } from "@/components/ui/controls";
import { DocSheet } from "../../../overlays/doc-sheet";
import {
  blankPayload,
  feeBasisParts,
  FEE_BASIS_VARIANTS,
  partKindLabel,
  SINGLE_INSTANCE_VARIANTS,
} from "./part-kinds";
import { AuthorityChip } from "./schedules/authority-chip";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

/** A kind, in one mono mark. Type, not iconography — the room has no badges
 *  and no emoji. */
const KIND_GLYPH: Record<string, string> = {
  clause: "¶",
  list: "—",
  phases: "◇",
  schedule: "§",
  attachment: "▤",
  attestation: "✧",
};

/** What the designer has picked, before it is added. */
export interface AddPartChoice {
  partKey: string;
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  title: string;
  payload: Record<string, unknown>;
  required: boolean;
  clientVisible: boolean;
  /** The `studio_agreement_parts` row this came from, so the saved part can
   *  be traced back to the Library entry it was composed from. */
  sourcePartId: string | null;
}

/** The blank kinds, in the order the sheet offers them. */
const BLANK_KINDS: { kind: AgreementPartKind; label: string }[] = [
  { kind: "clause", label: "Clause" },
  { kind: "list", label: "List" },
  { kind: "attachment", label: "Attachment" },
];

function newCustomKey(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `custom.${uuid}`;
}

/** The picker's word for a second fee basis. `flat` and `per_phase` are not
 *  the same part, so "already on this agreement" would be a lie — what the
 *  agreement already has is A fee basis, and it carries one (R18, 00577). */
export const FEE_BASIS_REFUSAL = "this agreement carries one fee basis";

/**
 * Why this choice cannot be added — or null when it can.
 *
 * Three reasons: the agreement already carries this exact part (same key), it
 * already carries a part of this money shape, or it already names a fee basis
 * and a second one would leave the projection choosing between two (R18).
 */
function refusalFor(
  choice: { partKey: string; kind: string; variant: string | null },
  parts: AgreementPart[],
): string | null {
  if (parts.some((part) => part.partKey === choice.partKey)) {
    return "already on this agreement";
  }
  if (choice.kind === "schedule" && choice.variant) {
    if (
      choice.variant in SINGLE_INSTANCE_VARIANTS &&
      parts.some(
        (part) => part.kind === "schedule" && part.variant === choice.variant,
      )
    ) {
      return "already on this agreement";
    }
    if (
      FEE_BASIS_VARIANTS.includes(choice.variant) &&
      feeBasisParts(parts).length > 0
    ) {
      return FEE_BASIS_REFUSAL;
    }
  }
  return null;
}

export function AddPartSheet({
  open,
  onClose,
  studioId,
  parts,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string | null;
  /** The composition as it stands, so the picker can refuse a duplicate. */
  parts: AgreementPart[];
  onAdd: (choice: AddPartChoice) => void;
}) {
  const library = useStudioAgreementParts(studioId);
  const [chosen, setChosen] = useState<AddPartChoice | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const patinaRows = useMemo(
    () =>
      PATINA_STANDARD_AGREEMENT_PARTS.map((standard) => ({
        origin: "Patina" as const,
        sourcePartId: null,
        choice: {
          partKey: standard.partKey,
          kind: standard.kind as AgreementPartKind,
          variant: (standard.variant ??
            null) as AgreementScheduleVariant | null,
          title: standard.defaultTitle,
          payload: blankPayload(
            standard.kind as AgreementPartKind,
            (standard.variant ?? null) as AgreementScheduleVariant | null,
          ),
          required: standard.required,
          clientVisible: true,
          sourcePartId: null,
        } satisfies AddPartChoice,
      })),
    [],
  );

  const studioRows = useMemo(
    () =>
      ((library.data ?? []) as StudioAgreementPart[]).map((row) => ({
        origin: "studio" as const,
        sourcePartId: row.id,
        choice: {
          partKey: row.partKey,
          kind: row.kind,
          variant: row.variant,
          title: row.title,
          payload: row.payload ?? {},
          required: row.requiredDefault,
          clientVisible: row.clientVisibleDefault,
          sourcePartId: row.id,
        } satisfies AddPartChoice,
      })),
    [library.data],
  );

  const rows = [...patinaRows, ...studioRows];

  const close = () => {
    setChosen(null);
    setScheduleOpen(false);
    onClose();
  };

  const add = () => {
    if (!chosen) return;
    onAdd(chosen);
    close();
  };

  return (
    <DocSheet open={open} onClose={close} title="From your Library">
      <div className="mx-auto max-w-[720px] space-y-6">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
          Add a part this studio already has, or start a blank one. Nothing is
          written until you save the agreement.
        </p>

        <div className="grid gap-8 sm:grid-cols-2">
          <section aria-label="Parts">
            <p className={LABEL}>Parts</p>
            {library.isLoading ? (
              <p className="mt-3 text-[12px] italic text-[var(--text-muted)]">
                Opening the Library…
              </p>
            ) : (
              <ul className="mt-3 border-t border-[var(--doc-ink-border)]">
                {rows.map((row) => {
                  const refusal = refusalFor(row.choice, parts);
                  const picked = chosen?.partKey === row.choice.partKey;
                  return (
                    <li
                      key={row.choice.partKey}
                      className="border-b border-[var(--doc-ink-border)]"
                    >
                      <button
                        type="button"
                        disabled={refusal !== null}
                        aria-pressed={picked}
                        onClick={() => setChosen(row.choice)}
                        className={`block w-full py-2 text-left disabled:opacity-60 ${
                          picked
                            ? "text-[var(--color-charcoal)]"
                            : "text-[var(--color-mocha)]"
                        }`}
                      >
                        <span className={`block ${LABEL}`}>
                          <span aria-hidden className="mr-1.5">
                            {KIND_GLYPH[row.choice.kind] ?? "·"}
                          </span>
                          {partKindLabel(row.choice.kind, row.choice.variant)}
                          {" · "}
                          <span>{row.origin}</span>
                          {row.choice.kind === "schedule" && (
                            <>
                              {" · "}
                              <AuthorityChip variant={row.choice.variant} />
                            </>
                          )}
                        </span>
                        <span className="block text-[13px]">
                          {row.choice.title}
                        </span>
                        {refusal && (
                          <span className="block text-[11px] italic text-[var(--text-muted)]">
                            {refusal}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Blank">
            <p className={LABEL}>Blank</p>
            <div className="mt-3 space-y-1">
              {BLANK_KINDS.map((blank) => (
                <Button
                  key={blank.kind}
                  variant="ghost"
                  size="sm"
                  aria-pressed={
                    chosen?.kind === blank.kind && chosen.variant === null
                  }
                  onClick={() =>
                    setChosen({
                      partKey: newCustomKey(),
                      kind: blank.kind,
                      variant: null,
                      title: partKindLabel(blank.kind, null),
                      payload: blankPayload(blank.kind, null),
                      required: false,
                      clientVisible: true,
                      sourcePartId: null,
                    })
                  }
                >
                  {blank.label}
                </Button>
              ))}

              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={scheduleOpen}
                  onClick={() => setScheduleOpen((current) => !current)}
                >
                  Schedule ▾
                </Button>
                {scheduleOpen && (
                  <ul
                    aria-label="Schedule variants"
                    className="mt-1 border-t border-[var(--doc-ink-border)]"
                  >
                    {AGREEMENT_SCHEDULE_VARIANTS.map((variant) => {
                      const refusal = refusalFor(
                        { partKey: "", kind: "schedule", variant },
                        parts,
                      );
                      const picked = chosen?.variant === variant;
                      return (
                        <li
                          key={variant}
                          className="border-b border-[var(--doc-ink-border)]"
                        >
                          <button
                            type="button"
                            disabled={refusal !== null}
                            aria-pressed={picked}
                            onClick={() =>
                              setChosen({
                                partKey: newCustomKey(),
                                kind: "schedule",
                                variant,
                                title: partKindLabel("schedule", variant),
                                payload: blankPayload("schedule", variant),
                                required: false,
                                clientVisible: true,
                                sourcePartId: null,
                              })
                            }
                            className={`block w-full py-1.5 text-left disabled:opacity-60 ${
                              picked
                                ? "text-[var(--color-charcoal)]"
                                : "text-[var(--color-mocha)]"
                            }`}
                          >
                            <span className="block text-[13px]">
                              {partKindLabel("schedule", variant)}
                            </span>
                            <span className="block">
                              <AuthorityChip variant={variant} />
                              {refusal && (
                                <span className="ml-2 text-[11px] italic normal-case tracking-normal text-[var(--text-muted)]">
                                  {refusal}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--doc-ink-border)] pt-4">
          <Button disabled={!chosen} onClick={add}>
            Add to this agreement
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {chosen && (
            <span className="text-[11.5px] text-[var(--color-mocha)]">
              {chosen.title}
            </span>
          )}
        </div>
      </div>
    </DocSheet>
  );
}
