"use client";

/**
 * THE ARCHIVE DOOR — a standing act on a rolodex card (direction §3.2 R1,
 * §8 P2: "archive and restore as a standing door").
 *
 * Putting a card away is not deleting it and not merging it: the card keeps
 * every seat, every document and every channel it ever held, and the studio
 * can bring it back. 00629's `archive_studio_contact()` / `restore_studio_contact()`
 * restate 00417's owner/admin rule in a body SECURITY DEFINER cannot bypass.
 *
 * THE REASON LINE IS VISIBLE, ALWAYS — not only after a refusal. Direction
 * §5.5's gated-act grammar: `aria-disabled` plus `aria-describedby` plus a
 * sentence on the face, never a `disabled` attribute and never a silent
 * absence. A member who cannot archive should be able to read why standing
 * beside the act, so they know who to ask.
 */

import { useState } from "react";
import {
  STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE,
  useArchiveStudioContact,
  useRestoreStudioContact,
} from "@patina/supabase";
import { formatLongDate } from "./people-format";
import { DocumentAction, DocumentActionRow } from "../document-action";

/** What the card says about its own state, in words. */
export function archivedSentence(
  archivedAt: string | null | undefined,
): string {
  const when = formatLongDate(archivedAt);
  return when
    ? `This card was put away ${when}. It stays out of the book until it is brought back.`
    : "This card is put away. It stays out of the book until it is brought back.";
}

export function ArchiveCardDoor({
  contactId,
  name,
  archivedAt,
  /** Owner or admin of the studio that holds the card (00417 / 00629). */
  canArchive,
  onDone,
  className,
}: {
  contactId: string;
  name: string;
  archivedAt: string | null | undefined;
  canArchive: boolean;
  onDone?: (message: string) => void;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const archive = useArchiveStudioContact();
  const restore = useRestoreStudioContact();
  const reasonId = `archive-held-${contactId}`;
  const isArchived = !!archivedAt;

  const run = async (which: "archive" | "restore") => {
    setError(null);
    try {
      if (which === "archive") {
        await archive.mutateAsync({ id: contactId });
        onDone?.(`${name} is put away.`);
      } else {
        await restore.mutateAsync({ id: contactId });
        onDone?.(`${name} is back in the book.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The card did not move.");
    }
  };

  return (
    <div data-archive-door={contactId} className={className}>
      {isArchived && (
        <p
          data-archived-sentence
          className="t-body-sm text-[var(--ink-subtle)]"
        >
          {archivedSentence(archivedAt)}
        </p>
      )}

      <DocumentActionRow
        surfaceKey="people-room"
        regionKey="archive-card"
        className="mt-1"
        aria-label={`Put ${name} away, or bring them back`}
      >
        <DocumentAction
          actionKey={
            isArchived ? "restore-studio-contact" : "archive-studio-contact"
          }
          variant="tertiary"
          disabled={!canArchive}
          held={!canArchive}
          aria-describedby={!canArchive ? reasonId : undefined}
          onHeldActivate={() =>
            setError(STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE)
          }
          onClick={() => void run(isArchived ? "restore" : "archive")}
          loading={archive.isPending || restore.isPending}
          loadingLabel={isArchived ? "Bringing back…" : "Putting away…"}
        >
          {isArchived ? "Bring this card back" : "Put this card away"}
        </DocumentAction>
      </DocumentActionRow>

      {/* The reason stands beside the act whether or not it has been pressed. */}
      {!canArchive && (
        <p
          id={reasonId}
          className="mt-1 text-[0.7rem] text-[var(--ink-subtle)]"
        >
          {STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-1 text-[0.72rem] text-[var(--terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
