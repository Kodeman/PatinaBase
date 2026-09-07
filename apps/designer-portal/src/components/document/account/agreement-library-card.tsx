"use client";

/**
 * Account → Studio → Agreement Library (M4).
 *
 * What the studio has to compose from: its Templates, and its Parts. Patina's
 * seeded templates sit on the same shelf and carry no acts — they are the
 * floor every studio starts on, not something a studio can edit.
 *
 * R3 — owners and admins edit the Library; every active member composes from
 * it. The acts below are hidden for a member and refused by RLS underneath, so
 * hiding them is a courtesy rather than the wall.
 *
 * R7 vocabulary: Agreement · Part · Library · Template · Addendum. Never
 * "clause library", never "contract builder".
 *
 * Wave 2 gives a template rename, delete, and re-save. There is deliberately
 * no editor for a template's composition — the copy below says so rather than
 * leaving a designer hunting for one.
 *
 * The card mirrors Billing's shell and changes nothing about it. The studio's
 * Agreement defaults already have their own card above this one (Wave 1); this
 * one does not build a second editor for them.
 */

import { useMemo, useState } from "react";
import {
  useAgreementTemplates,
  useDeleteAgreementTemplate,
  useDeleteStudioAgreementPart,
  useRenameAgreementTemplate,
  useSaveAgreementPart,
  useStudioAgreementParts,
} from "@patina/supabase";
import type { AgreementTemplate, StudioAgreementPart } from "@patina/types";
// One place says what a kind or a variant is called, and it is the room's.
// Printing `part.variant` here would put a database word on the studio's page.
import { partKindLabel } from "../rooms/drafting/agreement/part-kinds";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]";
const HELP = "mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]";
const ACT =
  "font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)] disabled:text-[var(--text-faint)]";
const INPUT =
  "w-full border-b border-[var(--color-pearl)] bg-transparent py-1 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]";

export const MEMBERS_COMPOSE_NOTE =
  "Owners and admins edit the Library. Every member composes from it.";
export const NO_COMPOSITION_EDITOR_NOTE =
  "A template keeps the parts it was saved with. To change them, compose an agreement the way you want it and save that as a template.";
/** The sentence the second click reads. Agreements already composed from a
 *  Template or a Part keep what they were composed with — `source_part_id` is
 *  a soft pointer — so what is lost is the shelf entry, and only that. */
export const REMOVE_TEMPLATE_WARNING =
  "This takes the template off the studio's shelf. Agreements already composed from it are untouched.";
export const REMOVE_PART_WARNING =
  "This takes the part off the studio's shelf. Agreements already composed from it are untouched.";

/** Kind → the plural the count line uses. */
const KIND_PLURAL: Record<string, string> = {
  clause: "Clauses",
  list: "Lists",
  phases: "Phases",
  schedule: "Schedules",
  attachment: "Attachments",
  attestation: "Attestations",
};

const KIND_ORDER = [
  "clause",
  "list",
  "phases",
  "schedule",
  "attachment",
  "attestation",
];

export function AgreementLibraryCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const templates = useAgreementTemplates(studioId);
  const parts = useStudioAgreementParts(studioId);
  const renameTemplate = useRenameAgreementTemplate(studioId);
  const deleteTemplate = useDeleteAgreementTemplate(studioId);
  const savePart = useSaveAgreementPart();
  const deletePart = useDeleteStudioAgreementPart(studioId);

  const [renamingTemplate, setRenamingTemplate] = useState<string | null>(null);
  const [renamingPart, setRenamingPart] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Removing is the one act on this card that cannot be typed back. It asks
  // twice, the way the room's template picker does before it replaces a
  // composition — one id at a time, so a second Delete elsewhere puts the
  // first row back to rest.
  const [removing, setRemoving] = useState<{
    shelf: "template" | "part";
    id: string;
  } | null>(null);

  const shelf = ((templates.data ?? []) as AgreementTemplate[])
    .slice()
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "seeded" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  const libraryParts = useMemo(
    () => (parts.data ?? []) as StudioAgreementPart[],
    [parts.data],
  );

  const countLine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const part of libraryParts) {
      counts.set(part.kind, (counts.get(part.kind) ?? 0) + 1);
    }
    return KIND_ORDER.filter((kind) => counts.has(kind))
      .map((kind) => `${KIND_PLURAL[kind] ?? kind} ${counts.get(kind)}`)
      .join(" · ");
  }, [libraryParts]);

  const beginRenameTemplate = (template: AgreementTemplate) => {
    setNote(null);
    setRemoving(null);
    setRenamingPart(null);
    setRenamingTemplate(template.templateKey);
    setDraft(template.title);
  };

  const beginRenamePart = (part: StudioAgreementPart) => {
    setNote(null);
    setRemoving(null);
    setRenamingTemplate(null);
    setRenamingPart(part.id);
    setDraft(part.title);
  };

  const askToRemove = (shelf: "template" | "part", id: string) => {
    setNote(null);
    setRenamingTemplate(null);
    setRenamingPart(null);
    setRemoving({ shelf, id });
  };

  const commitTemplateRename = async (template: AgreementTemplate) => {
    const title = draft.trim();
    if (!title) {
      setNote("Name this template before saving it.");
      return;
    }
    try {
      await renameTemplate.mutateAsync({ id: template.id, title });
      setRenamingTemplate(null);
    } catch (error) {
      setNote(refusal(error, "That template could not be renamed."));
    }
  };

  const commitPartRename = async (part: StudioAgreementPart) => {
    const title = draft.trim();
    if (!title) {
      setNote("Name this part before saving it.");
      return;
    }
    try {
      await savePart.mutateAsync({
        studioId,
        partKey: part.partKey,
        kind: part.kind,
        variant: part.variant,
        title,
        payload: part.payload,
        requiredDefault: part.requiredDefault,
        clientVisibleDefault: part.clientVisibleDefault,
      });
      setRenamingPart(null);
    } catch (error) {
      setNote(refusal(error, "That part could not be renamed."));
    }
  };

  const commitTemplateRemove = async (template: AgreementTemplate) => {
    try {
      await deleteTemplate.mutateAsync(template.id);
      setRemoving(null);
    } catch (error) {
      setNote(refusal(error, "That template could not be removed."));
    }
  };

  const commitPartRemove = async (part: StudioAgreementPart) => {
    try {
      await deletePart.mutateAsync(part.id);
      setRemoving(null);
    } catch (error) {
      setNote(refusal(error, "That part could not be removed."));
    }
  };

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      <h3 className={`${LABEL} mb-3`}>Agreement Library</h3>
      <p className={`${HELP} mb-4 mt-0`}>
        The Templates and Parts this studio composes agreements from.
        Patina&apos;s own are always here.
      </p>

      <div className="mb-5 max-w-md">
        <span className={LABEL}>Templates</span>
        {templates.isLoading ? (
          <p className={HELP}>Opening the Library…</p>
        ) : shelf.length === 0 ? (
          <p className={HELP}>No templates yet.</p>
        ) : (
          <ul className="mt-2">
            {shelf.map((template) => (
              <li
                key={template.templateKey}
                className="border-b border-[var(--color-pearl)] py-2"
              >
                {renamingTemplate === template.templateKey ? (
                  <div className="flex items-center gap-3">
                    <input
                      autoFocus
                      aria-label={`Rename ${template.title}`}
                      className={INPUT}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className={ACT}
                      onClick={() => void commitTemplateRename(template)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={ACT}
                      onClick={() => setRenamingTemplate(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <span className={`block ${LABEL}`}>
                        {template.kind === "seeded" ? "Patina" : "studio"}
                      </span>
                      <span className="block text-[13px] text-[var(--color-charcoal)]">
                        {template.title}
                      </span>
                    </span>
                    {canManage &&
                      template.kind === "studio" &&
                      (removing?.shelf === "template" &&
                      removing.id === template.id ? (
                        <span className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            className={ACT}
                            onClick={() => void commitTemplateRemove(template)}
                          >
                            Remove it
                          </button>
                          <button
                            type="button"
                            className={ACT}
                            onClick={() => setRemoving(null)}
                          >
                            Keep it
                          </button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            className={ACT}
                            onClick={() => beginRenameTemplate(template)}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className={ACT}
                            onClick={() => askToRemove("template", template.id)}
                          >
                            Delete
                          </button>
                        </span>
                      ))}
                  </div>
                )}
                {removing?.shelf === "template" &&
                  removing.id === template.id && (
                    <p role="alert" className={HELP}>
                      {REMOVE_TEMPLATE_WARNING}
                    </p>
                  )}
              </li>
            ))}
          </ul>
        )}
        <p className={HELP}>{NO_COMPOSITION_EDITOR_NOTE}</p>
        {!canManage && <p className={HELP}>{MEMBERS_COMPOSE_NOTE}</p>}
      </div>

      <div className="max-w-md">
        <span className={LABEL}>Parts</span>
        {parts.isLoading ? (
          <p className={HELP}>Opening the Library…</p>
        ) : libraryParts.length === 0 ? (
          <p className={HELP}>
            No parts saved yet. Compose an agreement, and what you write there
            can be kept here.
          </p>
        ) : (
          <>
            <p className={`${LABEL} mt-1 normal-case tracking-[0.04em]`}>
              {countLine}
            </p>
            <ul className="mt-2">
              {libraryParts.map((part) => (
                <li
                  key={part.id}
                  className="border-b border-[var(--color-pearl)] py-2"
                >
                  {renamingPart === part.id ? (
                    <div className="flex items-center gap-3">
                      <input
                        autoFocus
                        aria-label={`Rename ${part.title}`}
                        className={INPUT}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <button
                        type="button"
                        className={ACT}
                        onClick={() => void commitPartRename(part)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={ACT}
                        onClick={() => setRenamingPart(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        <span className={`block ${LABEL}`}>
                          {partKindLabel(part.kind, part.variant)}
                        </span>
                        <span className="block text-[13px] text-[var(--color-charcoal)]">
                          {part.title}
                        </span>
                      </span>
                      {canManage &&
                        (removing?.shelf === "part" &&
                        removing.id === part.id ? (
                          <span className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              className={ACT}
                              onClick={() => void commitPartRemove(part)}
                            >
                              Remove it
                            </button>
                            <button
                              type="button"
                              className={ACT}
                              onClick={() => setRemoving(null)}
                            >
                              Keep it
                            </button>
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center gap-3">
                            <button
                              type="button"
                              className={ACT}
                              onClick={() => beginRenamePart(part)}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className={ACT}
                              onClick={() => askToRemove("part", part.id)}
                            >
                              Delete
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                  {removing?.shelf === "part" && removing.id === part.id && (
                    <p role="alert" className={HELP}>
                      {REMOVE_PART_WARNING}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {note && (
        <p role="alert" className={HELP}>
          {note}
        </p>
      )}
    </div>
  );
}

/** The sentence the database refused with, or the card's own. */
function refusal(error: unknown, fallback: string): string {
  const message =
    error !== null && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : null;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : fallback;
}
