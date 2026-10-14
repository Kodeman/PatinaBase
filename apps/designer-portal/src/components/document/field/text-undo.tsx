"use client";

/**
 * The quiet Undo on a text Patina applied by itself (V23 R2, 00787). One act,
 * shared by the margin's field-text row and the Desk's "Applied by text" list:
 * a whisper-weight "Undo" that puts back everything the text changed in one
 * transaction (revert_model_apply_group).
 *
 *   restored / already → the line reads "Undone."
 *   conflict           → "Changed since — left as is.", and Undo is not
 *                        offered again (nothing was written).
 *
 * After the act the line settles in place and focus moves to it (the Day
 * Sheet's Undo behaviour), so the keyboard never falls off the page when the
 * control disappears. No badge, no count, zero shadows (D4).
 */

import { useEffect, useRef, useState } from "react";
import {
  useRevertModelApply,
  type RevertModelApplyOutcome,
} from "@patina/supabase";
import { DocumentAction } from "../document-action";

export const UNDONE = "Undone.";
export const CHANGED_SINCE = "Changed since — left as is.";
export const UNDO_FAILED = "Undo did not save. Try again.";

export function useTextUndo(sourceId: string, projectId: string | null) {
  const revert = useRevertModelApply();
  const [outcome, setOutcome] = useState<RevertModelApplyOutcome | null>(null);
  const [failed, setFailed] = useState(false);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const settling = useRef(false);

  useEffect(() => {
    if (!outcome || !settling.current) return;
    settling.current = false;
    lineRef.current?.focus();
  }, [outcome]);

  const undo = () => {
    settling.current = true;
    setFailed(false);
    revert.mutate(
      { sourceId, projectId },
      {
        onSuccess: (result) => setOutcome(result?.outcome ?? "already"),
        onError: () => {
          settling.current = false;
          setFailed(true);
        },
      },
    );
  };

  return { outcome, failed, pending: revert.isPending, undo, lineRef };
}

export function TextUndoAct({
  label,
  pending,
  onUndo,
}: {
  /** What is being undone, for the accessible name. */
  label: string;
  pending: boolean;
  onUndo: () => void;
}) {
  return (
    <DocumentAction
      actionKey="model-apply-undo"
      variant="tertiary"
      aria-label={`Undo — ${label}`}
      disabled={pending}
      onClick={onUndo}
    >
      Undo
    </DocumentAction>
  );
}

export function TextUndoFailed({ failed }: { failed: boolean }) {
  if (!failed) return null;
  return (
    <p role="alert" className="mt-1 text-[11px] text-[var(--color-error)]">
      {UNDO_FAILED}
    </p>
  );
}
