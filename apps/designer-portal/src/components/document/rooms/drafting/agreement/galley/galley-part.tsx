"use client";

/**
 * One part of the paper, printed — and, beneath it, the fold that writes it.
 *
 * The printed form is `AgreementPartSection`, the very renderer the client's
 * copy is made of (FS-5): the galley never draws a second version of a part.
 * A part that puts nothing on the paper prints nothing here either (R21,
 * FS-6) — its head, its standing and its rest row live in the studio's strip,
 * and its fold still opens in place.
 *
 * The head carries the title once (FS-7). Move up / Move down / Hide sit on
 * the head's own row in a RESERVED box: a ghost pair holds their exact width
 * whenever they are not showing, so revealing them costs 0px of reflow and
 * the paper does not move under a keyboard walk (FS-19, check 18).
 */

import { useEffect, useRef } from "react";
import type { AgreementPart } from "@patina/types";
import { AgreementPartSection } from "../../../../commercial/agreement-parts-body";

export interface GalleyPartIds {
  section: string;
  head: string;
  foldAct: string;
  foldPanel: string;
}

export function GalleyPart({
  part,
  ids,
  currency,
  turnkey,
  attachmentLetter,
  drawsNothing,
  open,
  readOnly,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  onHide,
  children,
}: {
  part: AgreementPart;
  ids: GalleyPartIds;
  currency: string;
  turnkey: boolean;
  attachmentLetter?: string;
  /** The paper prints nothing for this part; the strip carries its head. */
  drawsNothing: boolean;
  open: boolean;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (direction: "up" | "down") => void;
  /** R39/AR-e — absent on the two parts that state the money (R48) and on a
   *  frozen agreement. */
  onHide?: (next: boolean) => void;
  /** The fold's contents — rendered only while it is open. */
  children: React.ReactNode;
}) {
  const fold = useRef<HTMLDivElement>(null);
  // The keyboard model: opening a fold lands focus in its first field, and Esc
  // anywhere inside the part folds it and hands focus back to the act that
  // opened it. `preventScroll` because the anchor restore below owns the
  // reading position (FS-19) and a focus scroll would fight it.
  useEffect(() => {
    if (!open) return;
    // The caret lands in the part's own first field — the clause body, the
    // first money row — and not in the rename input the fold happens to open
    // with (SPEC §4's keyboard model).
    const node = fold.current;
    const first =
      node?.querySelector<HTMLElement>(
        "textarea:not([data-fold-rename]), input:not([data-fold-rename]), select",
      ) ?? node?.querySelector<HTMLElement>("textarea, input, select");
    first?.focus({ preventScroll: true });
  }, [open]);

  const hidden = part.clientVisible === false;
  const moveActs = !readOnly && (canMoveUp || canMoveDown);
  const hideLabel = hidden ? "Show to the client" : "Hide from the client";

  return (
    <section
      className={drawsNothing ? "g-part g-part--unwritten" : "g-part"}
      data-part-key={part.partKey}
      data-selected={open ? "true" : undefined}
      id={ids.section}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        // The room's own Esc leaves the room (`room-shell.tsx`), and a fold is
        // the deeper thing: it stops the event where it stands.
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        onToggle();
        window.document.getElementById(ids.foldAct)?.focus();
      }}
    >
      {!drawsNothing && (
        <>
          <div className="g-part__head-row">
            {/* The title carries the id, not the heading: AX-11's selected
                marker is a `::after` word on the heading, and a pseudo-element
                joins the accessible name of whatever it hangs on — so a fold
                act labelled by the heading would be renamed the moment its
                own part was opened. */}
            <h3 className="g-part__head t-d3">
              <span id={ids.head}>{part.title}</span>
            </h3>
            <div className="g-part__acts">
              <FoldAct ids={ids} open={open} onToggle={onToggle} />
              {(moveActs || onHide) && (
                <>
                  <span className="g-part__acts-ghost" aria-hidden="true">
                    {canMoveUp && (
                      <span className="g-act g-act--tertiary">
                        <span className="g-label">Move up</span>
                      </span>
                    )}
                    {canMoveDown && (
                      <span className="g-act g-act--tertiary">
                        <span className="g-label">Move down</span>
                      </span>
                    )}
                    {onHide && (
                      <span className="g-act g-act--tertiary">
                        <span className="g-label">{hideLabel}</span>
                      </span>
                    )}
                  </span>
                  <span className="g-part__acts-live">
                    {canMoveUp && (
                      <MoveAct
                        part={part}
                        headId={ids.head}
                        direction="up"
                        onMove={onMove}
                      />
                    )}
                    {canMoveDown && (
                      <MoveAct
                        part={part}
                        headId={ids.head}
                        direction="down"
                        onMove={onMove}
                      />
                    )}
                    {onHide && (
                      <button
                        type="button"
                        className="g-act g-act--tertiary"
                        data-client-visible={hidden ? "false" : "true"}
                        onClick={() => onHide(!hidden)}
                      >
                        <span className="g-label">{hideLabel}</span>
                      </button>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="g-part__printed">
            <AgreementPartSection
              part={part}
              currency={currency}
              turnkey={turnkey}
              attachmentLetter={attachmentLetter}
              headless
            />
          </div>
        </>
      )}
      <div
        className="g-fold"
        id={ids.foldPanel}
        role="group"
        aria-labelledby={ids.foldAct}
        hidden={!open}
        ref={fold}
      >
        {open && children}
      </div>
    </section>
  );
}

/**
 * The fold act — AR-h's word. It is rendered on the head when the paper
 * prints the part, and inside the studio's rest row when it does not; the ids
 * are the same either way, so the fold has exactly one labelling control.
 */
export function FoldAct({
  ids,
  open,
  onToggle,
  labelledBy,
}: {
  ids: GalleyPartIds;
  open: boolean;
  onToggle: () => void;
  /** The head's id on the paper, the strip's name id in the margin. */
  labelledBy?: string;
}) {
  return (
    <button
      type="button"
      id={ids.foldAct}
      className="g-act g-act--tertiary"
      aria-expanded={open}
      aria-controls={ids.foldPanel}
      aria-labelledby={`${labelledBy ?? ids.head} ${ids.foldAct}`}
      onClick={onToggle}
    >
      <span className="g-label">Write</span>
    </button>
  );
}

function MoveAct({
  part,
  headId,
  direction,
  onMove,
}: {
  part: AgreementPart;
  headId: string;
  direction: "up" | "down";
  onMove: (direction: "up" | "down") => void;
}) {
  const label = direction === "up" ? "Move up" : "Move down";
  const id = `${headId}-move-${direction}`;
  return (
    <button
      type="button"
      id={id}
      data-move-act={`${part.partKey}:${direction}`}
      className="g-act g-act--tertiary"
      aria-labelledby={`${headId} ${id}`}
      onClick={() => onMove(direction)}
    >
      <span className="g-label">{label}</span>
    </button>
  );
}
