"use client";

/**
 * Save as template… — this agreement's part set, kept for the next one.
 *
 * R3 draws the line the button is drawn on: **owners and admins edit the
 * Library, every active member composes from it.** `save_agreement_as_template`
 * enforces it (`insufficient_privilege`); this hides the act as a courtesy on
 * top, and prints the RPC's own sentence when the two ever disagree — a member
 * promoted in another tab, say.
 *
 * Draft only. `save_agreement_as_template` snapshots
 * `proposal_agreement_parts`, and those freeze when the agreement leaves draft
 * (R6), so offering it on a sent agreement would name an act with nothing new
 * behind it.
 */

import { useState } from "react";
import { useSaveAgreementAsTemplate } from "@patina/supabase";
import { Button, Input } from "@/components/ui/controls";
import { documentEvents } from "@/lib/analytics/document-events";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const SAVED_NOTE = "Saved to your Library.";
export const NOT_PERMITTED_NOTE =
  "Only a studio owner or admin can save a template.";

/** The refusal a member without the role earns, as PostgREST hands it over. */
function refusalNote(error: unknown): string {
  const shape =
    error !== null && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : {};
  if (shape.code === "42501") return NOT_PERMITTED_NOTE;
  const message = typeof shape.message === "string" ? shape.message : "";
  if (/insufficient_privilege|owner or admin/i.test(message)) {
    return NOT_PERMITTED_NOTE;
  }
  return message.trim().length > 0
    ? message
    : "This agreement could not be saved to your Library.";
}

export function SaveAsTemplateAction({
  proposalId,
  canManage,
  disabled = false,
}: {
  proposalId: string;
  /** Owner or admin of the acting studio — the same predicate Account →
   *  Studio uses to decide who may change the studio's own settings. */
  canManage: boolean;
  /** Composition frozen (R6), or nothing to save yet. */
  disabled?: boolean;
}) {
  const save = useSaveAgreementAsTemplate();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!canManage) return null;

  const commit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setNote("Name this template before saving it.");
      return;
    }
    setNote(null);
    try {
      await save.mutateAsync({ proposalId, title: trimmed });
      documentEvents.agreementTemplateSaved({ proposal_id: proposalId });
      setNaming(false);
      setTitle("");
      setNote(SAVED_NOTE);
    } catch (error) {
      setNote(refusalNote(error));
    }
  };

  return (
    <div className="space-y-1">
      {naming ? (
        <div className="space-y-2">
          <label className={LABEL}>
            Template name
            <Input
              autoFocus
              className="mt-1.5"
              aria-label="Template name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Full-service residential"
              maxLength={120}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => void commit()}
            >
              Save to Library
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNaming(false);
                setTitle("");
                setNote(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setNote(null);
            setNaming(true);
          }}
        >
          Save as template…
        </Button>
      )}
      {note && (
        <p role="status" className="text-[11px] text-[var(--color-mocha)]">
          {note}
        </p>
      )}
    </div>
  );
}
