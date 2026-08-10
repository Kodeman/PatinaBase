import { RESIDENTIAL_WORKFLOW_STAGES } from '@patina/types';

import {
  configuredDeliverablesFrom,
  deriveWorkflowStageDocument,
  stageForCanonicalPhaseKey,
  type WorkflowPhaseLike,
} from '../workflow-stage-derivation';

function phase(
  partial: Partial<WorkflowPhaseLike> & Pick<WorkflowPhaseLike, 'id' | 'name'>,
): WorkflowPhaseLike {
  return {
    phase_key: null,
    status: 'pending',
    sort_order: 0,
    gate_condition: null,
    deliverables: null,
    follows_phase_id: null,
    lane: 'main',
    ...partial,
  };
}

describe('residential workflow catalog', () => {
  it('defines eleven ordered stages with Project occupying stages 04–09', () => {
    expect(RESIDENTIAL_WORKFLOW_STAGES).toHaveLength(11);
    expect(RESIDENTIAL_WORKFLOW_STAGES.map((stage) => stage.number)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
    ]);
    expect(
      RESIDENTIAL_WORKFLOW_STAGES.slice(3, 9).map((stage) => stage.title),
    ).toEqual([
      'Kickoff & Existing Conditions',
      'Concept / Schematic Design',
      'Design Development',
      'Documentation & Budget Authorization',
      'Procurement & Fabrication',
      'Renovation / Construction Administration',
    ]);
  });
});

describe('deriveWorkflowStageDocument', () => {
  it('maps an explicit phase key and keeps configured project truth separate from the catalog', () => {
    const phases = [
      phase({
        id: 'concept',
        name: 'Concept',
        phase_key: 'concept_development',
        status: 'in_progress',
        gate_condition: 'Household approves one direction',
        deliverables: [{ label: 'Concept folio' }, 'Preliminary selections'],
      }),
      phase({
        id: 'development',
        name: 'Design Development',
        phase_key: 'design_refinement',
        sort_order: 1,
        follows_phase_id: 'concept',
      }),
    ];

    const state = deriveWorkflowStageDocument(phases, []);

    expect(state.activeStage?.number).toBe('05');
    expect(state.activeTrack?.label).toBe('Design');
    expect(state.responsibleLane?.label).toBe('Lead designer / studio');
    expect(state.configuredGate).toBe('Household approves one direction');
    expect(state.configuredDeliverables).toEqual([
      'Concept folio',
      'Preliminary selections',
    ]);
    expect(state.activeStage?.expectedGate).toBe(
      'One concept direction approved for development',
    );
    expect(state.nextAction).toEqual({
      kind: 'advance',
      label: 'Review the configured gate, then advance to Design Development.',
    });
    expect(state.stageStatus.concept_schematic_design).toBe('active');
    expect(state.stageStatus.design_development).toBe('scheduled');
  });

  it('uses the same blocker authority as phase handoffs', () => {
    const active = phase({
      id: 'procurement',
      name: 'Procurement',
      phase_key: 'procurement',
      status: 'in_progress',
    });

    const state = deriveWorkflowStageDocument(
      [active],
      [
        {
          id: 'blocking',
          title: 'Approve revised freight',
          phase_id: 'procurement',
          status: 'pending',
          blocks_kind: 'phase',
        },
        {
          id: 'resolved',
          title: 'Old blocker',
          phase_id: 'procurement',
          status: 'responded',
          blocking_status: 'blocks_phase',
        },
        {
          id: 'informational',
          title: 'FYI only',
          phase_id: 'procurement',
          status: 'pending',
          blocks_kind: 'none',
        },
      ],
    );

    expect(state.blockers.map((blocker) => blocker.id)).toEqual(['blocking']);
    expect(state.nextAction).toEqual({
      kind: 'resolve_blockers',
      label: 'Resolve 1 phase blocker before advancing.',
    });
  });

  it('never guesses a legacy phase from its display name', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        id: 'legacy',
        name: 'Concept Development',
        phase_key: null,
        status: 'in_progress',
      }),
    ]);

    expect(state.activePhase?.name).toBe('Concept Development');
    expect(state.activeStage).toBeNull();
    expect(state.activeTrack).toBeNull();
    expect(state.isLegacyPhase).toBe(true);
    expect(state.nextAction).toEqual({
      kind: 'map_phase',
      label:
        'Assign a canonical phase key to Concept Development before using workflow guidance.',
    });
    expect(state.stageStatus.concept_schematic_design).toBe('canonical');
  });

  it('uses the active main-lane phase instead of a stitched thread phase', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        id: 'thread',
        name: 'Construction thread',
        phase_key: 'construction_administration',
        status: 'in_progress',
        lane: 'thread',
      }),
      phase({
        id: 'main',
        name: 'Concept',
        phase_key: 'concept_development',
        status: 'in_progress',
        sort_order: 1,
      }),
    ]);

    expect(state.activePhase?.id).toBe('main');
    expect(state.activeStage?.number).toBe('05');
  });

  it('points to the next configured phase without inventing an active stage', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        id: 'closed',
        name: 'Concept',
        phase_key: 'concept_development',
        status: 'completed',
      }),
      phase({
        id: 'next',
        name: 'Procurement',
        phase_key: 'procurement',
        status: 'pending',
        sort_order: 1,
      }),
    ]);

    expect(state.activePhase).toBeNull();
    expect(state.activeStage).toBeNull();
    expect(state.stageStatus.concept_schematic_design).toBe('complete');
    expect(state.stageStatus.procurement_fabrication).toBe('scheduled');
    expect(state.nextAction).toEqual({
      kind: 'start_phase',
      label: 'Start Procurement.',
    });
  });
});

describe('workflow phase boundaries', () => {
  it('normalizes only an explicit key and does not normalize a label', () => {
    expect(stageForCanonicalPhaseKey(' CONCEPT_DEVELOPMENT ')?.number).toBe(
      '05',
    );
    expect(stageForCanonicalPhaseKey('Concept Development')).toBeNull();
    expect(stageForCanonicalPhaseKey(null)).toBeNull();
  });

  it('extracts supported deliverable labels and drops malformed values', () => {
    expect(
      configuredDeliverablesFrom([
        { label: 'Drawing set' },
        { title: 'Budget' },
        'Care notes',
        { label: 'Drawing set' },
        { unknown: true },
        null,
      ]),
    ).toEqual(['Drawing set', 'Budget', 'Care notes']);
  });
});
