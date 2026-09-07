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
import type { AgreementTemplate } from "@patina/types";
import { Button } from "@/components/ui/controls";
import { DocSheet } from "../../../overlays/doc-sheet";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const REPLACE_WARNING =
  "This replaces the parts on this agreement. Nothing else on the draft changes.";

/** A `service_addendum` is composed from the design-services shelf — the
 *  addendum amends a design-services agreement, so it draws on its templates
 *  (`save_agreement_as_template` files an addendum's set the same way). */
export function templateClassFor(documentKind: string): string {
  return documentKind === "service_addendum" ? "design_services" : documentKind;
}

export function TemplatePickerSheet({
  open,
  onClose,
  studioId,
  documentKind,
  onMaterialize,
  pending = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string | null;
  documentKind: string;
  onMaterialize: (template: AgreementTemplate) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const templates = useAgreementTemplates(studioId);
  const [chosen, setChosen] = useState<AgreementTemplate | null>(null);
  const [confirming, setConfirming] = useState(false);

  const shelf = useMemo(() => {
    const wanted = templateClassFor(documentKind);
    return ((templates.data ?? []) as AgreementTemplate[])
      .filter((template) => template.class === wanted)
      .sort((a, b) => {
        // Seeded first, then alphabetical — Patina's shelf is where a studio
        // that has saved nothing yet starts.
        if (a.kind !== b.kind) return a.kind === "seeded" ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  }, [templates.data, documentKind]);

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
            {shelf.map((template) => (
              <li
                key={template.templateKey}
                className="border-b border-[var(--doc-ink-border)]"
              >
                <button
                  type="button"
                  aria-pressed={chosen?.templateKey === template.templateKey}
                  onClick={() => {
                    setChosen(template);
                    setConfirming(false);
                  }}
                  className={`block w-full py-2.5 text-left ${
                    chosen?.templateKey === template.templateKey
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
              </li>
            ))}
          </ul>
        )}

        {confirming && chosen && (
          <p
            role="alert"
            className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]"
          >
            {REPLACE_WARNING}
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
