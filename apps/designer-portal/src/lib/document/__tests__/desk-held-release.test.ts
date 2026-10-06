/**
 * C-32 (SQ-430): the Desk need for an order held for release. It reaches only
 * a seat that can release it (viewerCanRelease, asked of the server per
 * studio), says whose order and to whom, carries the total, and opens the
 * Orders ledger on the project. Its signal rides after exceptions.
 */

import {
  deriveNeed,
  partitionDesk,
  type DeskHeldReleaseSignal,
  type DocumentStateRow,
} from '../desk-derivation';

const NOW = new Date('2026-10-06T12:00:00Z');

function mkRow(partial: Partial<DocumentStateRow> = {}): DocumentStateRow {
  return {
    engagement_kind: 'project',
    engagement_id: 'e1',
    project_id: 'p1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'd1',
    client_profile_id: 'c1',
    client_name: 'Greta Whitfield',
    title: 'Whitfield Residence',
    project_status: 'active',
    current_phase: 'procurement',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    proposal_sent_at: null,
    proposal_viewed_at: null,
    proposal_updated_at: null,
    proposal_open_count: null,
    proposal_last_opened_at: null,
    lead_response_deadline: null,
    lead_status: null,
    overdue_decision_count: 0,
    earliest_overdue_due: null,
    awaiting_inspection_count: 0,
    blocked_item_count: 0,
    in_flight_count: 0,
    installed_count: 0,
    item_count: 0,
    updated_at: '2026-10-05T12:00:00Z',
    open_claim_count: 0,
    open_claim_po: null,
    unsent_pulse_count: 0,
    pulse_week_of: null,
    draft_unsent_po_count: 0,
    oldest_draft_po_created_at: null,
    draft_po_label: null,
    unacked_po_count: 0,
    oldest_unacked_sent_at: null,
    unacked_po_label: null,
    ...partial,
  };
}

function held(partial: Partial<DeskHeldReleaseSignal> = {}): DeskHeldReleaseSignal {
  return {
    purchaseOrderId: 'po-1',
    vendorName: 'Hewn',
    totalCents: 1_248_000,
    heldAt: '2026-10-05T15:00:00Z',
    heldByName: 'Maya Okafor',
    viewerCanRelease: true,
    ...partial,
  };
}

const derive = (...signals: DeskHeldReleaseSignal[]) =>
  deriveNeed(mkRow(), NOW, null, null, null, null, null, null, null, null, null, null, null, signals);

describe('C-32 — the held-for-release need', () => {
  it("asks the releasing seat to release Maya's order to Hewn, with the total", () => {
    const need = derive(held());
    expect(need!.text).toBe("Release Maya's order to Hewn · $12,480");
    expect(need!.actionLabel).toBe('Release');
    expect(need!.stamp.label).toBe('HELD');
    expect(need!.ledger).toEqual({ name: 'orders', context: { page: 'ledger', projectId: 'p1' } });
  });

  it('is shown only to a seat that can release it', () => {
    expect(derive(held({ viewerCanRelease: false }))).toBeNull();
    expect(derive()).toBeNull();
  });

  it('gathers several held orders into one line over their total', () => {
    expect(derive(held(), held({ purchaseOrderId: 'po-2', totalCents: 252_000 }))!.text).toBe(
      'Maya is holding 2 orders for your release · $15,000',
    );
    expect(
      derive(held(), held({ purchaseOrderId: 'po-2', heldByName: 'Ari Lund', totalCents: 252_000 }))!.text,
    ).toBe('2 orders held for your release · $15,000');
    // A held order this seat cannot release is not counted.
    expect(derive(held(), held({ purchaseOrderId: 'po-2', viewerCanRelease: false }))!.text).toBe(
      "Release Maya's order to Hewn · $12,480",
    );
  });

  it('partitionDesk routes the signal by project_id, after exceptions', () => {
    const { folders } = partitionDesk(
      [mkRow(), mkRow({ engagement_id: 'e2', project_id: 'p2' })],
      NOW,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Map([['p2', [held()]]]),
    );
    expect(folders).toHaveLength(1);
    expect(folders[0].row.project_id).toBe('p2');
    expect(folders[0].need.text).toBe("Release Maya's order to Hewn · $12,480");
  });
});
