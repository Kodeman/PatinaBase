"use client";

/**
 * Start from a template… — the Library's Templates, laid into a draft.
 *
 * `materialize_agreement_template` replaces the draft's part set **wholesale**,
 * so this sheet asks twice: pick a template, then confirm what picking it
 * costs. The warning is the whole reason the sheet has a second step — a
 * designer who has written half an agreement should not lose it to a click.
 *
 * Templates are filtered to the class this document is. A studio's own
 * templates and Patina's seeded ones both appear; the chip says which.
 *
 * W2 gives a studio template rename, delete, and re-save — not an editor for
 * its composition. That is deliberate, and the Library card says so.
 */

import { useMemo, useState } from "react";
import { useAgreementTemplates } from "@patina/supabase";
import { DESIGN_BUILD_COPY, type AgreementTemplate } from "@patina/types";
import { Button } from "@/components/ui/controls";
import { DocSheet } from "../../../overlays/doc-sheet";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const REPLACE_WARNING =
  "This replaces the parts on this agreement. Nothing else on the draft changes.";

/** The sentence above is true of the saved agreement and false of the room
 *  the designer is standing in: `materialize_agreement_template` replaces the
 *  saved set, and the composer throws away the composition it was holding to
 *  re-read it — so anything typed since the last Save goes too. Say it. */
export const REPLACE_WARNING_UNSAVED =
  "This replaces the parts on this agreement, including the changes you have not saved yet. Nothing else on the draft changes.";

/** A `service_addendum` is composed from the design-services shelf — the
 *  addendum amends a design-services agreement, so it draws on its templates
 *  (`save_agreement_as_template` files an addendum's set the same way). */
export function templateClassFor(documentKind: string): string {
  return documentKind === "service_addendum" ? "design_services" : documentKind;
}

/**
 * R35 — the picker filters by KIND, not by class.
 *
 * A Template's class says what shape of engagement it is —
 * `design_services`, `consultation`, `furnishings_services`, `design_build` —
 * and the first three are all composed onto a `design_services` document.
 * Comparing class to document kind matched only the one class named the same
 * as the kind, so `Consultation / hourly` and `Furnishings only` sat on the
 * shelf where the designer could see them and could never reach them: two of
 * Patina's three seeded Templates, dark.
 *
 * `design_build` alone stays out until Wave 3, where R10 gates it on an
 * attestation nothing in this build collects.
 */
export function documentKindForTemplateClass(templateClass: string): string {
  return templateClass === "design_build" ? "design_build" : "design_services";
}

/**
 * Wave 3 — the turnkey template is reachable from a design-services draft.
 *
 * `materialize_agreement_template` flips `proposals.document_kind` to
 * `design_build` in the same transaction that lays down its parts (build
 * sheet PART 8), so the door into the class is a template on an ordinary
 * draft. With `design-build` off the filter is exactly Wave 2's and the
 * turnkey template is not on the shelf at all.
 */
export function templateIsSelectableOn(
  templateClass: string,
  documentKind: string,
  designBuildOn: boolean,
): boolean {
  const wanted = templateClassFor(documentKind);
  if (templateClass === "design_build") {
    return (
      designBuildOn &&
      (wanted === "design_services" || wanted === "design_build")
    );
  }
  return documentKindForTemplateClass(templateClass) === wanted;
}

export function TemplatePickerSheet({
  open,
  onClose,
  studioId,
  documentKind,
  onMaterialize,
  pending = false,
  error,
  unsavedChanges = false,
  designBuildOn = false,
  attestationLive = false,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string | null;
  documentKind: string;
  onMaterialize: (template: AgreementTemplate) => void;
  pending?: boolean;
  error?: string | null;
  /** The room is holding edits that have not been saved. They go with the
   *  parts, so the warning has to name them. */
  unsavedChanges?: boolean;
  /** `design-build`, resolved by the composer. Off, the turnkey template is
   *  absent from the shelf and this sheet is Wave 2's sheet exactly. */
  designBuildOn?: boolean;
  /** R10 — a live `studio_license_attestations` row. Without one the turnkey
   *  template is LISTED and DISABLED: a studio must be able to see the door
   *  before it can be told it is locked. */
  attestationLive?: boolean;
}) {
  const templates = useAgreementTemplates(studioId);
  const [chosen, setChosen] = useState<AgreementTemplate | null>(null);
  const [confirming, setConfirming] = useState(false);

  const shelf = useMemo(() => {
    return ((templates.data ?? []) as AgreementTemplate[])
      .filter((template) =>
        templateIsSelectableOn(template.class, documentKind, designBuildOn),
      )
      .sort((a, b) => {
        // Seeded first, then alphabetical — Patina's shelf is where a studio
        // that has saved nothing yet starts.
        if (a.kind !== b.kind) return a.kind === "seeded" ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [templates.data, documentKind, designBuildOn]);

  const close = () => {
    setChosen(null);
    setConfirming(false);
    onClose();
  };

  return (
    <DocSheet open={open} onClose={close} title="Start from a template">
      <div className="mx-auto max-w-[560px] space-y-5">
        {templates.isLoading ? (
          <p className="text-[12px] italic text-[var(--text-muted)]">
            Opening the Library…
          </p>
        ) : shelf.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-[var(--color-mocha)]">
            Your Library has no template for this kind of agreement yet. Compose
            one here, then save it from the rail.
          </p>
        ) : (
          <ul className="border-t border-[var(--doc-ink-border)]">
            {shelf.map((template) => {
              // R10 — the turnkey template is never hidden, only locked. A
              // studio has to be able to see the door before it can be told
              // what opens it, and the line beneath says exactly that.
              const locked =
                template.class === "design_build" && !attestationLive;
              return (
                <li
                  key={template.templateKey}
                  data-template-locked={locked ? "true" : undefined}
                  className="border-b border-[var(--doc-ink-border)]"
                >
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={chosen?.templateKey === template.templateKey}
                    onClick={() => {
                      setChosen(template);
                      setConfirming(false);
                    }}
                    className={`block w-full py-2.5 text-left ${
                      locked
                        ? "text-[var(--text-faint)]"
                        : chosen?.templateKey === template.templateKey
                          ? "text-[var(--color-charcoal)]"
                          : "text-[var(--color-mocha)]"
                    }`}
                  >
                    <span className={`block ${LABEL}`}>
                      {template.kind === "seeded" ? "Patina" : "studio"}
                    </span>
                    <span className="block text-[13px]">{template.title}</span>
                    <span className="block text-[11.5px] italic text-[var(--text-muted)]">
                      {template.parts.map((entry) => entry.title).join(" · ")}
                    </span>
                  </button>
                  {locked && (
                    <p className="pb-2.5 text-[11.5px] leading-relaxed text-[var(--color-mocha)]">
                      {DESIGN_BUILD_COPY.templateNeedsAttestation}{" "}
                      <a
                        href="/desk?account=studio"
                        className="underline decoration-[var(--color-aged-oak)] underline-offset-2"
                      >
                        Account → Studio
                      </a>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {confirming && chosen && (
          <p
            role="alert"
            className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]"
          >
            {unsavedChanges ? REPLACE_WARNING_UNSAVED : REPLACE_WARNING}
          </p>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-[var(--color-mocha)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-[var(--doc-ink-border)] pt-4">
          {confirming ? (
            <Button
              loading={pending}
              onClick={() => {
                if (chosen) onMaterialize(chosen);
              }}
            >
              Replace the parts
            </Button>
          ) : (
            <Button disabled={!chosen} onClick={() => setConfirming(true)}>
              Use this template
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </div>
      </div>
    </DocSheet>
  );
}
