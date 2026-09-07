"use client";

/**
 * `+ Add a part` — blank kinds only.
 *
 * Wave 1 has no Library, so this menu offers what a designer can write from
 * nothing: a Clause, a List, and the seven schedule variants the composer
 * ships editors for. The Library picker (and `Save as template…`) are Wave 2
 * and are deliberately absent rather than disabled — an act that does not
 * exist yet should not be named here.
 */

import { useState } from "react";
import type {
  AgreementPartKind,
  AgreementScheduleVariant,
} from "@patina/types";
import { Button } from "@/components/ui/controls";
import { ADD_PART_OPTIONS } from "./part-kinds";

export function AddPartMenu({
  onAdd,
}: {
  onAdd: (input: {
    kind: AgreementPartKind;
    variant: AgreementScheduleVariant | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        + Add a part
      </Button>
      {open && (
        <div className="absolute left-0 z-10 mt-1 w-56 border border-[var(--doc-ink-border)] bg-white py-1">
          {ADD_PART_OPTIONS.map((option) => (
            <button
              key={`${option.kind}:${option.variant ?? ""}`}
              type="button"
              onClick={() => {
                setOpen(false);
                onAdd({ kind: option.kind, variant: option.variant });
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--color-charcoal)] hover:bg-[var(--color-parchment)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
