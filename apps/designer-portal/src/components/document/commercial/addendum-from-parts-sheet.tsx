"use client";

/**
 * An addendum, composed from the agreement it amends — P7.
 *
 * Wave 1's act made a draft and dropped the designer into an empty Contract
 * Room. Wave 2 asks two questions first: what to call it, and **why**. The why
 * is the 00569 pattern, wearing 00569's rules — one line, at most 200
 * characters, optional, and attributed to the given name of the person writing
 * it, shown here so the designer reads the attribution they are about to
 * freeze.
 *
 * Then, in order: `create_service_addendum` (unchanged), the origin's part set
 * copied in with the why, and the room.
 *
 * The homeowner reads the why beside the change. Nothing else about it is
 * hers: the change history behind it is studio-only (R8).
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui/controls";
import { DocSheet } from "../overlays/doc-sheet";
import { firstNameOf } from "@/lib/document/account-identity";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const WHY_HELP =
  "One line, kept with the addendum. Your client reads it beside the change.";
export const WHY_PLACEHOLDER = "Added the study to the scope";
export const WHY_MAX = 200;
/** The draft exists; only the parts are still to come across. Retitling it is
 *  the room's act from here, not this sheet's. */
export const TITLE_FROZEN_NOTE =
  "The draft is made. Rename it in the Contract Room.";

export function AddendumFromPartsSheet({
  open,
  onClose,
  defaultTitle,
  authorName,
  pending = false,
  error,
  titleFrozen = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  defaultTitle: string;
  /** The signed-in profile's full name; only its first token is shown. */
  authorName: string | null | undefined;
  pending?: boolean;
  error?: string | null;
  /** A draft has already been created by this act — a retry writes onto it,
   *  so the title it was minted with is the title it keeps. */
  titleFrozen?: boolean;
  onConfirm: (input: { title: string; why: string | null }) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [why, setWhy] = useState("");

  // Reopening the sheet starts clean — a why abandoned once is not a why the
  // next addendum inherits.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setWhy("");
    }
  }, [open, defaultTitle]);

  const givenName = firstNameOf(authorName);

  return (
    <DocSheet open={open} onClose={onClose} title="Create services addendum">
      <div className="mx-auto max-w-[460px] space-y-5">
        <div>
          <label className={LABEL}>
            Title
            <Input
              className="mt-2"
              aria-label="Addendum title"
              value={title}
              disabled={titleFrozen}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </label>
          {titleFrozen && (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {TITLE_FROZEN_NOTE}
            </p>
          )}
        </div>

        <div>
          <label className={LABEL}>
            Why this addendum
            <Input
              className="mt-2"
              aria-label="Why this addendum"
              value={why}
              onChange={(event) => setWhy(event.target.value)}
              placeholder={WHY_PLACEHOLDER}
              maxLength={WHY_MAX}
            />
          </label>
          <p className={`mt-1.5 ${LABEL} normal-case tracking-[0.04em]`}>
            — {givenName}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {WHY_HELP}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-[var(--color-mocha)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-[var(--doc-ink-border)] pt-4">
          <Button
            loading={pending}
            disabled={title.trim().length === 0}
            onClick={() =>
              onConfirm({
                title: title.trim(),
                why: why.trim().length > 0 ? why.trim() : null,
              })
            }
          >
            Create the addendum
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </DocSheet>
  );
}
