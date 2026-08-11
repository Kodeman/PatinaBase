/**
 * Rulings III, V and VI — the gate the margin, the guide, and the Desk share.
 */

import type { ProjectContextualHandoff } from '@patina/supabase';

import {
  deriveGate,
  deriveGates,
  deskGateSentence,
  gateActionLabel,
  gateSentence,
  gateStageLabel,
  handoffAnchorId,
  nearestOpenGate,
  studioPulseGateSentence,
} from '../workflow-gate';
import { deriveOverdue, NOT_OVERDUE } from '../overdue-condition';

const NOW = new Date('2026-05-12T09:00:00.000Z');

function approval(
  overrides: Partial<ProjectContextualHandoff> = {},
): ProjectContextualHandoff {
  return {
    sourceKind: 'project_approval',
    sourceId: 'decision-1',
    projectId: 'project-1',
    phaseId: 'phase-1',
    canonicalStageKey: 'design_development',
    workflowTrack: 'ffe',
    stageAttribution: 'exact_project_phase',
    sourceState: 'response_required',
    responsibility: {
      sender: { kind: 'studio', label: null },
      recipient: { kind: 'client', label: null },
      currentOwner: { kind: 'client', label: null },
    },
    expectedResponse: 'select_approval_outcome',
    dueAt: '2026-05-06T09:00:00.000Z',
    isOverdue: true,
    escalation: null,
    artifact: {
      kind: 'proposal_edition',
      version: 3,
      checksum: '9f4c1ab7'.repeat(8),
      title: 'Direction',
    },
    actionKind: 'open_approval_response',
    updatedAt: '2026-05-06T09:00:00.000Z',
    ...overrides,
  } as ProjectContextualHandoff;
}

function siteRequest(
  overrides: Partial<ProjectContextualHandoff> = {},
): ProjectContextualHandoff {
  return {
    sourceKind: 'site_request',
    sourceId: 'request-1',
    projectId: 'project-1',
    phaseId: null,
    canonicalStageKey: 'contract_administration',
    workflowTrack: null,
    stageAttribution: 'source_domain',
    sourceState: 'delivered',
    responsibility: {
      sender: { kind: 'studio', label: null },
      recipient: { kind: 'site_party', label: 'Hale Joinery' },
      currentOwner: { kind: 'studio', label: null },
    },
    expectedResponse: 'acknowledgment',
    dueAt: '2026-05-14T09:00:00.000Z',
    isOverdue: false,
    escalation: { nudgeSent: true, dueReminderSent: false },
    artifact: {
      kind: 'site_request_item_set',
      dueContext: 'Shop drawings due',
      itemCount: 2,
      items: [],
    },
    actionKind: 'review_site_request',
    updatedAt: '2026-05-06T09:00:00.000Z',
    ...overrides,
  } as ProjectContextualHandoff;
}

describe('lane attribution and provenance', () => {
  it('names the client from the document when the projection carries no label', () => {
    expect(deriveGate(approval(), NOW, 'Marta Chen').lane).toBe(
      'With Marta Chen',
    );
    expect(deriveGate(approval(), NOW, null).lane).toBe('With the client');
  });

  it('keeps the site party label the projection snapshotted', () => {
    expect(deriveGate(siteRequest(), NOW, 'Marta Chen').lane).toBe(
      'With Hale Joinery',
    );
  });

  it('demotes stage provenance to microtext and drops the designer-facing register', () => {
    const gate = deriveGate(approval(), NOW, 'Marta Chen');
    expect(gate.provenance).toBe(
      'Stage 06 · Design Development · FF&E · edition 3',
    );
    // No checksum, no phase-attribution wording, no escalation booleans.
    expect(gate.provenance).not.toContain('9f4c1ab7');
    expect(gate.provenance).not.toMatch(/exact phase|source domain/i);
    expect(gate.provenance).not.toMatch(/nudge sent|reminder sent/i);
    expect(JSON.stringify(gate)).not.toContain('9f4c1ab7');
  });

  it('reads stage titles from the single canonical vocabulary', () => {
    expect(gateStageLabel('documentation_authorization')).toBe(
      'Stage 07 · Documentation / Authorization',
    );
    expect(gateStageLabel('delivery_installation')).toBe(
      'Stage 10 · Delivery, Installation & Styling',
    );
    expect(gateStageLabel(null)).toBeNull();
  });

  it('counts site-request items instead of listing their versions', () => {
    expect(deriveGate(siteRequest(), NOW, null).provenance).toBe(
      'Stage 09 · Contract Administration · 2 items',
    );
  });
});

describe('the one act, mapped 1:1', () => {
  it.each([
    ['response_required', 'nudge', 'Nudge'],
    ['ready_to_publish', 'open', 'Publish'],
    ['review_required', 'open', 'Review'],
    ['changes_requested', 'open', 'Open'],
    ['needs_discussion', 'open', 'Open'],
  ])('an approval at %s offers exactly one act: %s', (state, kind, label) => {
    const gate = deriveGate(
      approval({ sourceState: state as never }),
      NOW,
      'Marta',
    );
    expect(gate.act).toEqual({ kind, label });
  });

  it.each([
    ['sent', 'nudge', 'Open'],
    ['in_progress', 'nudge', 'Open'],
    ['delivered', 'approve', 'Review'],
    ['completed', 'close', 'Close'],
  ])(
    'a Site Request at %s offers exactly one act: %s',
    (state, kind, label) => {
      const gate = deriveGate(
        siteRequest({ sourceState: state as never }),
        NOW,
        null,
      );
      expect(gate.act).toEqual({ kind, label });
    },
  );

  it('offers no studio act while a site party has not consented', () => {
    const gate = deriveGate(
      siteRequest({ sourceState: 'awaiting_consent' as never }),
      NOW,
      null,
    );
    expect(gate.act).toBeNull();
    expect(gate.terms).toBe('Site Request');
  });
});

describe('overdue rides the single derivation', () => {
  it('takes the same condition the stamp and the Desk read', () => {
    const gate = deriveGate(approval(), NOW, 'Marta');
    expect(gate.overdue).toEqual(deriveOverdue(gate.dueAt, NOW, true));
    expect(gate.overdue).toEqual({ isOverdue: true, days: 6 });
  });

  it('withholds the condition when the projection says the gate is not overdue', () => {
    const gate = deriveGate(approval({ isOverdue: false }), NOW, 'Marta');
    expect(gate.overdue).toEqual(NOT_OVERDUE);
  });
});

describe('ordering and the nearest open gate', () => {
  it('rises overdue gates above earlier due dates', () => {
    const gates = deriveGates(
      [
        siteRequest({ dueAt: '2026-05-01T09:00:00.000Z', isOverdue: false }),
        approval(),
      ],
      NOW,
      'Marta',
    );
    expect(gates.map((gate) => gate.id)).toEqual([
      'project_approval-decision-1',
      'site_request-request-1',
    ]);
  });

  it('skips a gate the studio cannot act on when choosing the guide’s subject', () => {
    const gates = deriveGates(
      [
        siteRequest({
          sourceState: 'awaiting_consent' as never,
          dueAt: '2026-05-01T09:00:00.000Z',
        }),
        approval({ isOverdue: false, dueAt: '2026-05-20T09:00:00.000Z' }),
      ],
      NOW,
      'Marta',
    );
    expect(nearestOpenGate(gates)?.sourceKind).toBe('project_approval');
  });

  it('answers null when no gate is open to the studio', () => {
    expect(nearestOpenGate([])).toBeNull();
  });
});

describe('the gate rendered as a sentence', () => {
  it('states the elapsed time once the condition holds', () => {
    expect(gateSentence(deriveGate(approval(), NOW, 'Marta'))).toBe(
      "Marta's Direction approval has waited 6 days.",
    );
  });

  it('states the terms and the party while the gate is still in time', () => {
    expect(gateSentence(deriveGate(siteRequest(), NOW, null))).toBe(
      'The delivery from Hale Joinery is ready to review.',
    );
  });

  it('reads the deck’s publish state as a gate that is ready for the party', () => {
    expect(
      gateSentence(
        deriveGate(
          approval({
            sourceState: 'ready_to_publish' as never,
            isOverdue: false,
          }),
          NOW,
          'Marta',
        ),
      ),
    ).toBe('Direction approval is ready for Marta.');
  });

  it('names the act for what it does', () => {
    expect(gateActionLabel(deriveGate(approval(), NOW, 'Marta'))).toBe(
      'Nudge Marta',
    );
    expect(
      gateActionLabel(
        deriveGate(
          approval({ sourceState: 'ready_to_publish' as never }),
          NOW,
          'Marta',
        ),
      ),
    ).toBe('Publish the Direction approval');
    expect(gateActionLabel(deriveGate(siteRequest(), NOW, null))).toBe(
      'Review the delivery',
    );
  });

  it('publishes one anchor per gate so the guide names a mounted control', () => {
    expect(handoffAnchorId('decision-1')).toBe('document-handoff-decision-1');
  });
});

describe('the Desk keys to the same gate', () => {
  it('states the party, the artifact, and the elapsed time', () => {
    expect(
      deskGateSentence({
        clientName: 'Marta',
        activeSection: 'direction',
        overdue: { isOverdue: true, days: 6 },
      }),
    ).toBe("Marta's Direction approval has waited 6 days.");
  });

  it('leaves the need its own line where the folio has no gate', () => {
    expect(
      deskGateSentence({
        clientName: 'Marta',
        activeSection: 'direction',
        overdue: NOT_OVERDUE,
      }),
    ).toBeNull();
  });
});

describe('Studio Pulse gets exactly one aggregate sentence', () => {
  it('states the shape of the week in a single line', () => {
    expect(
      studioPulseGateSentence({
        folderCount: 3,
        overdueCount: 1,
        inProductionCount: 2,
      }),
    ).toBe('3 folios need your hand, 1 overdue, 2 pieces are in production.');
  });

  it('reads as prose at one of everything', () => {
    expect(
      studioPulseGateSentence({
        folderCount: 1,
        overdueCount: 0,
        inProductionCount: 1,
      }),
    ).toBe('1 folio needs your hand, 1 piece is in production.');
  });

  it('says so plainly when nothing is waiting', () => {
    expect(
      studioPulseGateSentence({
        folderCount: 0,
        overdueCount: 0,
        inProductionCount: 0,
      }),
    ).toBe('Nothing is waiting on the studio.');
  });
});
