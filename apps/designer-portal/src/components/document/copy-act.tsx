"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { DocumentAction } from "./document-action";

/**
 * A quiet copy act. Nothing is sent (M4): the text goes to the clipboard, or,
 * where the clipboard refuses, the visible text is selected for a manual copy.
 * writeText is called inside the click, which Safari requires.
 */
export function CopyAct({
  text,
  selectRef,
  actionKey,
  surfaceKey = "accounts",
  regionKey = "invoice-composer",
  children,
}: {
  text: string;
  selectRef: RefObject<HTMLElement | null>;
  actionKey: string;
  surfaceKey?: string;
  regionKey?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const selectText = () => {
    const node = selectRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <DocumentAction
        actionKey={actionKey}
        surfaceKey={surfaceKey}
        regionKey={regionKey}
        variant="tertiary"
        onClick={() => {
          setCopied(false);
          try {
            navigator.clipboard
              .writeText(text)
              .then(() => setCopied(true), selectText);
          } catch {
            selectText();
          }
        }}
      >
        {children}
      </DocumentAction>
      <span
        role="status"
        className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
      >
        {copied ? "Copied." : ""}
      </span>
    </div>
  );
}
