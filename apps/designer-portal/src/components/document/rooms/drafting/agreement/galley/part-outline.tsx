"use client";

/**
 * The outline — the agreement's table of contents.
 *
 * It keeps the shipped rail's own contract (FS-16): a `nav` labelled
 * `Agreement parts` wrapping a `ul` of `li`, one row per part, so every
 * selector written against the rail still finds the room. What it no longer
 * is: the place order is decided. Order is a part act on the paper now, and a
 * row here is a way to reach a part, nothing more.
 *
 * At 1440 it is the left column and always open; below 1248 it is a
 * disclosure at the galley's head. Same markup either way.
 */

import { useEffect, useId, useState } from "react";
import type { AgreementPart } from "@patina/types";

export function PartOutline({
  parts,
  openKey,
  attentionKeys,
  onSelect,
  libraryOn = false,
  readOnly,
  onOpenTemplatePicker,
  saveAsTemplate,
}: {
  /** Already filtered: the attestation gate is not a page of the paper. */
  parts: AgreementPart[];
  openKey: string | null;
  /** Part keys readiness is holding — the row says so in words. */
  attentionKeys: ReadonlySet<string>;
  onSelect: (partKey: string) => void;
  libraryOn?: boolean;
  readOnly: boolean;
  onOpenTemplatePicker?: () => void;
  saveAsTemplate?: React.ReactNode;
}) {
  const bodyId = useId();
  const toggleId = useId();
  // The column is always open; the disclosure below 1248 is not. `true` is
  // the server's answer and the wide answer, and the effect corrects it on a
  // narrow client before paint of the first interaction.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia("(min-width: 1248px)");
    const sync = () => setExpanded(wide.matches);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  return (
    <nav className="g-outline" aria-label="Agreement parts">
      <h2 className="g-outline__head">
        <button
          type="button"
          id={toggleId}
          className="g-act g-act--tertiary g-outline__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="g-caret" aria-hidden="true" />
          <span className="g-label">The parts</span>
        </button>
      </h2>
      <div id={bodyId} hidden={!expanded}>
        <ul>
          {parts.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                className="g-act g-act--tertiary g-outline__row"
                aria-current={part.partKey === openKey ? "true" : undefined}
                onClick={() => onSelect(part.partKey)}
              >
                <span className="g-label">{part.title}</span>
              </button>
              {attentionKeys.has(part.partKey) && (
                <span className="t-head g-attn">needs attention</span>
              )}
            </li>
          ))}
        </ul>
        {parts.length === 0 && (
          <p className="t-body-sm">This agreement has no parts yet.</p>
        )}
        {libraryOn && !readOnly && (
          <div className="g-outline__foot">
            <button
              type="button"
              className="g-act g-act--tertiary"
              onClick={onOpenTemplatePicker}
            >
              <span className="g-label">Start from a template…</span>
            </button>
            {saveAsTemplate}
          </div>
        )}
      </div>
    </nav>
  );
}
