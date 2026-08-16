'use client';

/**
 * "Release for authorization", lifted to the Delivery table's head (W4b).
 *
 * The ceremony itself does not move: selection stays on the schedule, the
 * composition bar and the review sheet stay where they are. Only the leader
 * moves — the table head is where a designer looks for the one act the studio
 * owes, and hunting for it inside the FF&E region's ledger was the complaint.
 *
 * The trigger is the window event the release ceremony ALREADY listens for
 * (VoidAct's superseding-release door), not a second entry point: the ceremony
 * provider is section-local by design (release is the schedule's own state),
 * so a leader standing outside the schedule cannot reach its context — and
 * forking a `begin()` of its own is exactly the duplicate machinery this lift
 * is meant to avoid. An empty pre-tick list is what `ceremony.begin()` passes.
 */

import {
  START_RELEASE_EVENT,
  type StartReleaseEventDetail,
} from '../commercial/void-supersede-act';
import { DocumentAction, DocumentActionRow } from '../document-action';

export function ReleaseLift() {
  return (
    <div data-release-lift className="mb-1">
      <DocumentActionRow
        surfaceKey="open-document"
        regionKey="delivery-table-head"
        aria-label="The table's leader"
      >
        <DocumentAction
          actionKey="release-for-authorization"
          variant="inked"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent<StartReleaseEventDetail>(START_RELEASE_EVENT, {
                detail: { preTickIds: [] },
              }),
            );
          }}
        >
          Release for authorization
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}
