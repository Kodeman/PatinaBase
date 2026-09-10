"use client";

/**
 * What unfolds beneath a printed part: the editor, at the galley's own
 * measure, and the record that says whether it is written down yet.
 *
 * `PartEditor` mounts headless — the galley's head already carries the title,
 * the standing and the visibility act, so the editor prints no head of its
 * own (FS-7). The part's own record line, its Library history and the acts
 * that are not about the paper's order sit under it.
 */

import type { AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";
import { PartHistoryStrip } from "../part-history-strip";
import type { TurnkeyContext } from "../turnkey";

export function GalleyFold({
  part,
  proposalId,
  record,
  readOnly,
  libraryOn,
  blockers,
  turnkey,
  onChange,
  onRename,
  onRemove,
  onKeepInLibrary,
  kept,
}: {
  part: AgreementPart;
  proposalId: string;
  /** The dated record, with this part's own unsaved clause when it has one. */
  record: string;
  readOnly: boolean;
  libraryOn: boolean;
  blockers: string[];
  turnkey?: TurnkeyContext;
  onChange: (payload: Record<string, unknown>) => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  /** R3 — owners and admins keep parts; every active member composes. */
  onKeepInLibrary?: () => void;
  kept: boolean;
}) {
  return (
    <>
      {!readOnly && (
        <div className="field">
          <label className="label" htmlFor={`rename-${part.partKey}`}>
            The name of this part
          </label>
          <input
            id={`rename-${part.partKey}`}
            className="field-control"
            type="text"
            value={part.title}
            onChange={(event) => onRename(event.target.value)}
          />
        </div>
      )}
      <PartEditor
        part={part}
        onChange={onChange}
        readOnly={readOnly}
        libraryOn={libraryOn}
        blockers={blockers}
        turnkey={turnkey}
        headless
      />
      <p className="t-meta g-record">{record}</p>
      {!readOnly && (
        <div className="g-part__acts">
          {onKeepInLibrary && (
            <button
              type="button"
              className="g-act g-act--tertiary"
              aria-disabled={kept ? "true" : undefined}
              onClick={() => {
                if (!kept) onKeepInLibrary();
              }}
            >
              <span className="g-label">
                {kept ? "In your Library" : "Keep in my Library"}
              </span>
            </button>
          )}
          <button
            type="button"
            className="g-act g-act--tertiary"
            onClick={onRemove}
          >
            <span className="g-label">Remove from this agreement</span>
          </button>
        </div>
      )}
      {/* P8 — under the open part, and only under a part that has a history.
          A part nobody has touched draws nothing. */}
      {libraryOn && (
        <PartHistoryStrip proposalId={proposalId} partKey={part.partKey} />
      )}
    </>
  );
}
