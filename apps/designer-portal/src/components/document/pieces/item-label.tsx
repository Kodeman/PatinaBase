"use client";

/**
 * US-37 #3 (R192): the item label (`project_ffe_items.doc_code`, 00808) on
 * the Pieces sheet. `ItemLabelPrefix` prints it quietly before a line's name;
 * `ItemLabelField` edits it through `set_project_ffe_item_label`, refusing a
 * label another item in the same job holds with the server's sentence.
 */

import { useEffect, useId, useRef, useState } from "react";
import { itemLabelRefusal, useSetFfeItemLabel } from "@patina/supabase";
import { Input } from "@/components/ui/controls";

const SAVED = "Label saved.";

/** The label before a line's name; nothing when the line has none. */
export function ItemLabelPrefix({ label }: { label?: string | null }) {
  const text = (label ?? "").trim();
  if (!text) return null;
  return (
    <span
      data-item-label=""
      className="font-mono text-[11px] font-medium tracking-[0.06em] text-[var(--sheet-ink-muted)] [overflow-wrap:anywhere]"
    >
      {text}
    </span>
  );
}

/** A line's name with its label before it, as one accessible string. */
export function labelledName(label: string | null | undefined, name: string): string {
  const text = (label ?? "").trim();
  return text ? `${text} ${name}` : name;
}

export function ItemLabelField({
  projectId,
  itemId,
  docCode,
  canEdit = true,
  className = "mb-3 block min-w-0",
  captionClassName = "t-head mb-1 block text-[var(--text-muted)]",
}: {
  projectId: string;
  itemId: string;
  docCode: string | null | undefined;
  canEdit?: boolean;
  className?: string;
  captionClassName?: string;
}) {
  const setLabel = useSetFfeItemLabel();
  const statusId = useId();
  const labelInputRef = useRef<HTMLInputElement>(null);
  const skipLabelBlurCommit = useRef(false);
  const [labelDraft, setLabelDraft] = useState(docCode ?? "");
  const labelBaseline = useRef(docCode ?? "");
  useEffect(() => {
    labelBaseline.current = docCode ?? "";
    setLabelDraft(labelBaseline.current);
  }, [docCode]);
  const [labelStatus, setLabelStatus] = useState<string | null>(null);
  const labelRefusal = labelStatus !== null && labelStatus !== SAVED;
  // A ref, not render-time isPending: a second Enter or blur before the
  // re-render would otherwise send the write twice.
  const labelInFlight = useRef(false);
  const labelRefused = useRef<string | null>(null);
  const commitLabel = async (fromEnter: boolean) => {
    const next = labelDraft.trim();
    if (next === labelBaseline.current || next === labelRefused.current || labelInFlight.current) return;
    labelInFlight.current = true;
    setLabelStatus(null);
    try {
      const row = await setLabel.mutateAsync({ projectId, itemId, label: next || null });
      labelRefused.current = null;
      labelBaseline.current = row.doc_code ?? "";
      setLabelDraft(labelBaseline.current);
      setLabelStatus(SAVED);
    } catch (error) {
      labelRefused.current = next;
      setLabelStatus(itemLabelRefusal((error as Error).message, next) ?? (error as Error).message);
    } finally {
      labelInFlight.current = false;
      // Only Enter keeps the designer in the field; a blur commit leaves focus
      // wherever they went, and nothing takes it back from another control.
      const active = document.activeElement;
      if (fromEnter && (!active || active === document.body)) labelInputRef.current?.focus();
    }
  };

  return (
    <label className={className}>
      <span className={captionClassName}>Item label</span>
      <Input
        ref={labelInputRef}
        aria-label="Item label"
        aria-busy={setLabel.isPending}
        aria-invalid={labelRefusal || undefined}
        aria-describedby={labelRefusal ? statusId : undefined}
        value={labelDraft}
        readOnly={setLabel.isPending || !canEdit}
        onChange={(event) => {
          const next = event.target.value;
          setLabelDraft(next);
          if (next.trim() !== labelRefused.current) {
            labelStatus !== null && setLabelStatus(null);
            labelRefused.current = null;
          }
        }}
        onBlur={() => {
          if (skipLabelBlurCommit.current) {
            skipLabelBlurCommit.current = false;
            return;
          }
          void commitLabel(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); void commitLabel(true); }
          if (event.key === "Escape") {
            skipLabelBlurCommit.current = true;
            setLabelDraft(labelBaseline.current);
            setLabelStatus(null);
            event.currentTarget.blur();
          }
        }}
        variant="underline"
        invalid={labelRefusal}
        className="max-w-full font-mono text-[12px] text-[var(--color-charcoal)]"
      />
      <p id={statusId} role="status" className={`t-meta mt-1 min-h-[1.5em] ${labelRefusal ? "text-[var(--color-terracotta-ink)]" : "text-[var(--color-charcoal)]"}`}>
        {labelStatus}
      </p>
    </label>
  );
}
