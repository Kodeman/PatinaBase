/**
 * Rulings III, V and VI — the gate the margin, the guide, and the Desk share.
 */

import type { ProjectContextualHandoff } from '@patina/supabase';

import {
  deriveGate,
  deriveGates,
  gateActVerb,
  gateActionLabel,
  gateSentence,
  gateStageLabel,
  handoffAnchorId,
  nearestOpenGate,
  studioPulseGateSentence,
} from '../workflow-gate';
import { deriveOverdue, NOT_OVERDUE } from '../overdue-condition';

const NOW = new Date('2026-05-12T09:00:00.000Z');

/**
 * The projection moves sourceState, expectedResponse, sender, recipient, and
 * currentOwner together (00442). A fixture that pins one without the others
 * describes a row the read model cannot emit, so this builder derives the
 * whole cluster from the state — the review found two fixtures that had paired
 * `ready_to_publish` with a client recipient, which the projection never does.
 */
const APPROVAL_SHAPE: Record<
  string,
  { expectedResponse: string; party: 'client' | 'studio' }
> = {
  review_required: {
    expectedResponse: 'confirm_artifact_review',
    party: 'client',
  },
  ready_to_publish: {
    expectedResponse: 'publish_confirmed_approval',
    party: 'studio',
  },
  response_required: {
    expectedResponse: 'select_approval_outcome',
    party: 'client',
  },
  changes_requested: {
    expectedResponse: 'revise_and_resubmit',
    party: 'studio',
  },
  needs_discussion: {
    expectedResponse: 'resolve_client_discussion',
    party: 'studio',
  },
};

function approval(
  overrides: Partial<ProjectContextualHandoff> = {},
): ProjectContextualHandoff {
  const state = (overrides.sourceState as string) ?? 'response_required';
  const shape = APPROVAL_SHAPE[state];
  const other = shape.party === 'client' ? 'studio' : 'client';
  return {
    sourceKind: 'project_approval',
    sourceId: 'decision-1',
    projectId: 'project-1',
    phaseId: 'phase-1',
    canonicalStageKey: 'design_development',
    workflowTrack: 'ffe',
    stageAttribution: 'exact_project_phase',
    sourceState: state,
    responsibility: {
      sender: { kind: other, label: null },
      recipient: { kind: shape.party, label: null },
      currentOwner: { kind: shape.party, label: null },
    },
    expectedResponse: shape.expectedResponse,
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

  it('attributes a studio-owned approval to the studio, not the household', () => {
    // The projection addresses this state to the studio (confirmations done).
    const publish = approval({ sourceState: 'ready_to_publish' as never });
    expect(publish.responsibility.recipient.kind).toBe('studio');
    expect(deriveGate(publish, NOW, 'Marta Chen').lane).toBe('With the studio');
    expect(deriveGate(publish, NOW, 'Marta Chen').studioLane).toBe(true);
  });

  it('overrides a client-addressed row whose act is the studio’s own review', () => {
    // 00442 sets recipient='client' on an unconfirmed draft, but the act it
    // waits on is `confirm_artifact_review` — studio work. The lane must not
    // claim "With Marta" for something Marta cannot do.
    const review = approval({ sourceState: 'review_required' as never });
    expect(review.responsibility.recipient.kind).toBe('client');
    expect(review.expectedResponse).toBe('confirm_artifact_review');
    expect(deriveGate(review, NOW, 'Marta Chen').lane).toBe('With the studio');
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
    ['sent', 'nudge', 'Nudge'],
    ['in_progress', 'nudge', 'Nudge'],
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

  it('reads the publish state as the studio’s own next act', () => {
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
    ).toBe('Direction approval is ready to publish.');
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

  it('names the same act with the same verb at both scales', () => {
    // The margin prints the verb alone; the guide prints verb + object. A
    // margin reading "Open" beside a guide reading "Nudge" was the drift.
    for (const handoff of [
      approval(),
      approval({ sourceState: 'ready_to_publish' as never }),
      approval({ sourceState: 'review_required' as never }),
      siteRequest(),
      siteRequest({ sourceState: 'sent' as never }),
      siteRequest({ sourceState: 'completed' as never }),
    ]) {
      const gate = deriveGate(handoff, NOW, 'Marta');
      const verb = gateActVerb(gate.act!.kind, gate.sourceState);
      expect(gate.act!.label).toBe(verb);
      expect(gateActionLabel(gate).startsWith(`${verb} `)).toBe(true);
    }
  });

  it('publishes one anchor per gate so the guide names a mounted control', () => {
    expect(handoffAnchorId('decision-1')).toBe('document-handoff-decision-1');
  });
});

describe('Studio Pulse gets exactly one aggregate sentence', () => {
  it('states the shape of the week in a single line', () => {
    expect(studioPulseGateSentence({ overdueCount: 1, onTheWayCount: 2 })).toBe(
      '1 decision is overdue, and 2 pieces are on the way.',
    );
  });

  it('uses the Desk’s own word for an in-flight piece', () => {
    // "In production" would claim a fabrication state the read model never
    // reports; deriveMotion calls these pieces "on the way".
    const sentence = studioPulseGateSentence({
      overdueCount: 0,
      onTheWayCount: 1,
    });
    expect(sentence).toBe('1 piece is on the way.');
    expect(sentence).not.toContain('production');
  });

  it('does not restate the folio count the Desk eyebrow already carries', () => {
    expect(studioPulseGateSentence({ overdueCount: 2, onTheWayCount: 0 })).toBe(
      '2 decisions are overdue.',
    );
  });

  it('says so plainly when nothing is waiting', () => {
    expect(studioPulseGateSentence({ overdueCount: 0, onTheWayCount: 0 })).toBe(
      'Nothing is overdue, and nothing is on the way.',
    );
  });
});
