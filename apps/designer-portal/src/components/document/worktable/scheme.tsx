'use client';

/**
 * The Scheme (Start to Signature · W3a) — the loose FF&E scheme ON the paper
 * for a direction-stage document. The Speccing table mounts the Drafting
 * Room's own schedule builder here (FFEScheduleBuilder + ScheduleLineUnfold —
 * one write path, no fork): lines print, unfold, and are authored in place on
 * the paper, while the Room's FF&E facet keeps the same builder untouched.
 *
 * roomFilter is the rooms rail's lens (W3d): a non-null scope-room id LIFTS
 * that room's lines to the front of the scheme — it never hides the rest
 * (room-lens doctrine). An empty scheme leads with a scored-ink "Add a line"
 * that opens the builder's own add flow in place, never a route away. Every
 * tool at every width — nothing gated behind 1440 (doctrine A4).
 */

import { FFEScheduleBuilder } from '@/components/portal/scope-builder/ffe-schedule-builder';
import { ScheduleLineUnfold } from '../rooms/drafting/schedule-line-unfold';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export interface SchemeProps {
  proposalId: string;
  /**
   * The table head's room lens — a scope-room id. Non-null lifts that room's
   * lines to the front; null/omitted composes the schedule's own order.
   */
  roomFilter?: string | null;
}

export function Scheme({ proposalId, roomFilter = null }: SchemeProps) {
  return (
    <section aria-label="The scheme" data-scheme>
      {/* D4 inside the paper: the shared builder's bulk bar + filter popover
          carry shadow-lg in the old zones — strip them here without touching
          them, the same move the Drafting Room's FF&E facet makes. */}
      <div className="contents [&_.shadow-lg]:shadow-none [&_.shadow-xl]:shadow-none">
        <FFEScheduleBuilder
          proposalId={proposalId}
          liftRoomId={roomFilter}
          renderEmptyLead={(openAddItem) => (
            <div data-scheme-empty className="py-3">
              <DocumentActionGroup
                surfaceKey="open-document"
                regionKey="scheme"
                aria-label="Start the scheme"
              >
                <DocumentAction
                  actionKey="scheme-add-line"
                  variant="inked"
                  onClick={openAddItem}
                >
                  Add a line
                </DocumentAction>
              </DocumentActionGroup>
              <p className="doc-type-body mt-1 text-[var(--color-quiet-ink)]">
                The scheme starts loose — a first line is enough.
              </p>
            </div>
          )}
          renderUnfold={(item, fold) => (
            <ScheduleLineUnfold
              item={item}
              proposalId={proposalId}
              onFold={fold}
            />
          )}
        />
      </div>
    </section>
  );
}
