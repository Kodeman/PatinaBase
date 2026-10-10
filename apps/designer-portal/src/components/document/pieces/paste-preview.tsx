"use client";

/**
 * US-21 T-25 — the paste preview (S1, D13).
 *
 * Pasting a list into Rough in's entry row splits it on newlines and previews
 * the N lines before anything is written. `ADD N LINES` confirms them through
 * one `batch_create_named_project_needs` call; `CANCEL` (or Esc) writes
 * nothing. Every pasted line lands as a placeholder in the room it was pasted
 * into, or with no room when pasted under `Not in a room yet`.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useBatchCreateNamedProjectNeeds } from "@patina/supabase";

/** The batch RPC takes 1 to 100 lines (00730). */
export const PASTE_BATCH_MAX = 100;

/** One name per non-blank line, trimmed. */
export function parsePastedLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const linesWord = (count: number) => (count === 1 ? "line" : "lines");

const ACT_CLASS =
  "min-h-[44px] min-w-[44px] font-mono text-[12px] font-medium uppercase tracking-[.06em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

export interface PastePreviewProps {
  projectId: string;
  /** null pastes under `Not in a room yet`. */
  roomId: string | null;
  /** The room as the sheet prints it, e.g. `Living Room` or `Not in a room yet`. */
  roomName: string;
  /** The pasted text, as the clipboard gave it. */
  text: string;
  /** After the batch lands, with the new lines' ids in paste order. */
  onAdded: (selectionIds: string[]) => void;
  /** Cancel or Esc. Nothing was written. */
  onCancel: () => void;
}

export function PastePreview({
  projectId,
  roomId,
  roomName,
  text,
  onAdded,
  onCancel,
}: PastePreviewProps) {
  const names = parsePastedLines(text);
  const count = names.length;
  const batch = useBatchCreateNamedProjectNeeds();
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const baseId = useId();
  const headId = `${baseId}-head`;
  const reasonId = `${baseId}-reason`;

  const gateReason =
    count === 0
      ? "Nothing in the paste has a name."
      : count > PASTE_BATCH_MAX
        ? `A paste adds at most ${PASTE_BATCH_MAX} lines at a time. This one has ${count}.`
        : null;
  const pending = batch.isPending;
  const blocked = gateReason !== null || pending;

  // The count is set after mount so a screen reader hears the live region change.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    setAnnouncement(
      `${count} ${linesWord(count)} ready to add to ${roomName}.`,
    );
  }, [count, roomName]);

  // Enter confirms and Esc cancels from the moment the preview opens.
  useEffect(() => {
    (gateReason ? cancelRef : confirmRef).current?.focus({
      preventScroll: true,
    });
    // Only on open: a gate never changes for the same paste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async () => {
    if (blocked) return;
    setError(null);
    const request = {
      projectId,
      roomId,
      assignmentScope: roomId ? ("room" as const) : ("unassigned" as const),
      lines: names.map((name) => ({ name })),
    };
    // A retry of the same paste reuses its key, so it never doubles the lines.
    const fingerprint = JSON.stringify(request);
    if (requestKey.current?.fingerprint !== fingerprint) {
      requestKey.current = {
        fingerprint,
        key:
          globalThis.crypto?.randomUUID?.() ??
          `paste-${projectId}-${Date.now()}`,
      };
    }
    try {
      const result = await batch.mutateAsync({
        ...request,
        idempotencyKey: requestKey.current.key,
      });
      onAdded(result.selectionIds);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The lines could not be added. Nothing was added; try again.",
      );
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <section
      data-paste-preview
      aria-labelledby={headId}
      onKeyDown={onKeyDown}
      className="border border-[var(--sheet-rule-strong)] bg-[var(--sheet)] p-6"
    >
      <h3
        id={headId}
        className="font-mono text-[11px] font-medium uppercase leading-none tracking-[.06em] text-[var(--sheet-ink-muted)]"
      >
        {`Pasted · ${count} ${linesWord(count)} for ${roomName}`}
      </h3>

      <ol aria-label="Pasted lines" className="mt-3">
        {names.map((name, index) => (
          <li
            key={`${index}-${name}`}
            className="flex min-h-[var(--row,40px)] items-center justify-between gap-3 border-b border-[var(--sheet-rule)] text-[14px] font-medium leading-[1.4] text-[var(--sheet-ink)]"
          >
            <span>{name}</span>
            <span className="stamp stamp--placeholder">Placeholder</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 max-w-[56ch] text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        {`They land in ${roomName} as placeholders. Nothing is released until you say so.`}
      </p>

      {gateReason && (
        <p
          id={reasonId}
          className="mt-2 max-w-[56ch] text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
        >
          {gateReason}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 max-w-[56ch] text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-6">
        <button
          ref={confirmRef}
          type="button"
          aria-disabled={blocked || undefined}
          aria-describedby={gateReason ? reasonId : undefined}
          onClick={() => void confirm()}
          className={`${ACT_CLASS} ${
            blocked
              ? "cursor-not-allowed text-[var(--sheet-ink-faint)]"
              : "text-[var(--sheet-ink)]"
          }`}
        >
          {/* The one heavy act here: a second rule in clay under the ink one. */}
          <span
            className={`inline-block border-b pb-px ${
              blocked ? "border-transparent" : "border-[var(--clay-ink)]"
            }`}
          >
            <span
              className={`border-b ${
                blocked
                  ? "border-[var(--sheet-ink-faint)]"
                  : "border-[var(--sheet-ink)]"
              }`}
            >
              {pending ? "Adding…" : `Add ${count} ${linesWord(count)}`}
            </span>
          </span>
        </button>
        <button
          ref={cancelRef}
          type="button"
          aria-disabled={pending || undefined}
          onClick={() => {
            if (!pending) onCancel();
          }}
          className={`${ACT_CLASS} text-[var(--sheet-ink-muted)]`}
        >
          <span className="border-b border-[var(--sheet-ink)]">Cancel</span>
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
