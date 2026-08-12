import {
  RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANE_KEYS,
  RESIDENTIAL_WORKFLOW_SCHEDULE_LANE_KEYS,
  RESIDENTIAL_WORKFLOW_STAGES,
  RESIDENTIAL_WORKFLOW_TRACK_KEYS,
} from '@patina/types';

import {
  deriveSectionWorkflowStageDocument,
  deriveWorkflowStageDocument,
  stageForCanonicalStageKey,
  trackForWorkflowTrack,
  type WorkflowPhaseLike,
} from '../workflow-stage-derivation';

function phase(
  overrides: Partial<WorkflowPhaseLike> = {},
): WorkflowPhaseLike {
  return {
    phase_id: 'phase-1',
    phase_name: 'Concept work',
    phase_status: 'active',
    phase_key: 'local_concept_label',
    canonical_stage_key: 'concept_schematic',
    workflow_track: 'core',
    sort_order: 10,
    lane: 'main',
    follows_phase_id: null,
    gate_note: null,
    deliverables: [],
    template_provenance: {},
    current_blockers: { count: 0, phase: [], tasks: [], ffe: [] },
    advance_blocker_count: 0,
    blocks_advance: false,
    ...overrides,
  };
}

describe('residential workflow persistence contract', () => {
  it('pins migration 00434 keys and Capability Ledger titles exactly', () => {
    expect(
      RESIDENTIAL_WORKFLOW_STAGES.map(({ key, title }) => ({ key, title })),
    ).toEqual([
      { key: 'inquiry_qualification', title: 'Inquiry & Qualification' },
      { key: 'discovery_programming', title: 'Discovery & Programming' },
      { key: 'scope_engagement', title: 'Scope & Engagement' },
      {
        key: 'kickoff_existing_conditions',
        title: 'Kickoff & Existing Conditions',
      },
      { key: 'concept_schematic', title: 'Concept / Schematic' },
      { key: 'design_development', title: 'Design Development' },
      {
        key: 'documentation_authorization',
        title: 'Documentation / Authorization',
      },
      {
        key: 'bidding_permitting_procurement',
        title: 'Bidding, Permitting & Procurement',
      },
      {
        key: 'contract_administration',
        title: 'Contract Administration',
      },
      {
        key: 'delivery_installation',
        title: 'Delivery, Installation & Styling',
      },
      {
        key: 'closeout_post_occupancy',
        title: 'Closeout & Post-Occupancy',
      },
    ]);
    expect(RESIDENTIAL_WORKFLOW_TRACK_KEYS).toEqual([
      'core',
      'ffe',
      'construction',
    ]);
  });

  it('keeps schedule topology and responsibility ownership distinct', () => {
    expect(RESIDENTIAL_WORKFLOW_SCHEDULE_LANE_KEYS).toEqual([
      'main',
      'thread',
    ]);
    expect(RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANE_KEYS).toHaveLength(6);
    expect(RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANE_KEYS).not.toContain(
      'main',
    );
  });
});

describe('deriveWorkflowStageDocument', () => {
  it('classifies only canonical_stage_key and workflow_track', () => {
    const ambiguous = phase({
      phase_id: 'ambiguous',
      phase_name: 'Looks canonical only by local key',
      phase_key: 'contract_administration',
      canonical_stage_key: null,
      workflow_track: 'construction',
    });
    const canonical = phase({
      phase_id: 'canonical',
      phase_name: 'Canonical contract work',
      phase_key: 'concept_development',
      canonical_stage_key: 'contract_administration',
      workflow_track: 'construction',
    });
    const invalidTrack = phase({
      phase_id: 'invalid-track',
      phase_name: 'Known stage with an invented track',
      canonical_stage_key: 'design_development',
      workflow_track: 'design',
    });

    const state = deriveWorkflowStageDocument([
      ambiguous,
      canonical,
      invalidTrack,
    ]);

    expect(state.activeGroups).toHaveLength(1);
    expect(state.activeGroups[0].stage.key).toBe('contract_administration');
    expect(state.activeGroups[0].track.key).toBe('construction');
    expect(state.unclassifiedActivePhases).toHaveLength(2);
    expect(state.unclassifiedActivePhases[0].phase.phase_id).toBe('ambiguous');
    expect(state.stageStatus.design_development).toBe('canonical');
    expect(stageForCanonicalStageKey('contract_administration')?.number).toBe(
      '09',
    );
    expect(stageForCanonicalStageKey('concept_development')).toBeNull();
    expect(trackForWorkflowTrack('construction')?.label).toBe('Construction');
    expect(trackForWorkflowTrack('design')).toBeNull();
  });

  it('retains parallel main and thread rows in one stage-track aggregate', () => {
    const completedMain = phase({
      phase_id: 'main-complete',
      phase_name: 'Main procurement',
      phase_status: 'completed',
      canonical_stage_key: 'bidding_permitting_procurement',
      workflow_track: 'ffe',
      lane: 'main',
    });
    const activeThread = phase({
      phase_id: 'thread-active',
      phase_name: 'Custom fabrication',
      phase_status: 'active',
      canonical_stage_key: 'bidding_permitting_procurement',
      workflow_track: 'ffe',
      lane: 'thread',
    });

    const state = deriveWorkflowStageDocument([
      completedMain,
      activeThread,
    ]);
    const group = state.activeGroups[0];

    expect(group.phases.map((row) => row.phase_id)).toEqual([
      'main-complete',
      'thread-active',
    ]);
    expect(group.activePhases.map((row) => row.phase_id)).toEqual([
      'thread-active',
    ]);
    expect(group.scheduleLanes).toEqual(['thread']);
    expect(
      state.stageStatus.bidding_permitting_procurement,
    ).toBe('active');
  });

  it('keeps simultaneous tracks as separate groups at the same stage', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        phase_id: 'ffe',
        canonical_stage_key: 'bidding_permitting_procurement',
        workflow_track: 'ffe',
      }),
      phase({
        phase_id: 'construction',
        canonical_stage_key: 'bidding_permitting_procurement',
        workflow_track: 'construction',
        lane: 'thread',
      }),
    ]);

    expect(state.activeGroups.map((group) => group.key)).toEqual([
      'bidding_permitting_procurement:ffe',
      'bidding_permitting_procurement:construction',
    ]);
  });

  it('lets a delayed parallel row outrank a completed row', () => {
    const state = deriveWorkflowStageDocument([
      phase({ phase_id: 'complete', phase_status: 'completed' }),
      phase({ phase_id: 'delayed', phase_status: 'delayed', lane: 'thread' }),
    ]);

    expect(state.activeGroups[0].status).toBe('delayed');
    expect(state.stageStatus.concept_schematic).toBe('delayed');
  });

  it('follows exact successor edges across schedule lanes', () => {
    const state = deriveWorkflowStageDocument([
      phase({ phase_id: 'active-main', phase_name: 'Main concept' }),
      phase({
        phase_id: 'thread-successor',
        phase_name: 'Thread engineering review',
        phase_status: 'pending',
        lane: 'thread',
        follows_phase_id: 'active-main',
        canonical_stage_key: 'design_development',
        workflow_track: 'construction',
        sort_order: 1,
      }),
    ]);

    expect(state.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'active-main',
      kind: 'advance',
      label:
        'Complete Main concept to advance to Thread engineering review.',
    });
  });

  it('treats zero exact followers as terminal without catalog fallback', () => {
    const state = deriveWorkflowStageDocument([
      phase({ phase_id: 'active', phase_name: 'Concept decision' }),
      phase({
        phase_id: 'unconnected-next-stage',
        phase_name: 'Development work',
        phase_status: 'pending',
        follows_phase_id: null,
        canonical_stage_key: 'design_development',
      }),
    ]);

    expect(state.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'active',
      kind: 'terminal',
      label:
        'Concept decision is terminal in the configured schedule graph.',
    });
  });

  it('aggregates configured work, provenance, and blockers from live rows', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        gate_note: 'Household approval',
        deliverables: [{ label: 'Concept folio' }],
        template_provenance: { slug: 'full-service', version: 4 },
        current_blockers: {
          count: 2,
          phase: [{ id: 'decision-1', kind: 'coordination', title: 'Approve plan' }],
          tasks: [{ id: 'task-1', kind: 'task', title: 'Survey missing' }],
          ffe: [],
        },
      }),
    ]);
    const group = state.activeGroups[0];

    expect(group.configuredGates).toEqual(['Household approval']);
    expect(group.configuredDeliverables).toEqual(['Concept folio']);
    expect(group.provenance).toEqual([{ slug: 'full-service', version: 4 }]);
    expect(group.blockers.map((blocker) => blocker.title)).toEqual([
      'Approve plan',
      'Survey missing',
    ]);
    expect(group.nextActions[0].label).not.toContain('Resolve');
    expect(group.nextActions[0].kind).toBe('terminal');
  });

  it('uses only exact phase decision blockers to gate advance language', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        phase_name: 'Concept work',
        blocks_advance: true,
        advance_blocker_count: 1,
        current_blockers: {
          count: 3,
          phase: [{ id: 'decision-1', title: 'Approve plan' }],
          tasks: [{ id: 'task-1', title: 'Survey missing' }],
          ffe: [{ id: 'ffe-1', title: 'Sofa delayed' }],
        },
      }),
      phase({
        phase_id: 'successor',
        phase_name: 'Design development',
        phase_status: 'pending',
        follows_phase_id: 'phase-1',
        canonical_stage_key: 'design_development',
      }),
    ]);

    expect(state.activeGroups[0].blockers).toHaveLength(3);
    expect(state.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'phase-1',
      kind: 'advance',
      label:
        'Resolve 1 phase blocker before advancing from Concept work to Design development.',
    });
  });

  it('makes delayed work resume-first even with followers and informational blockers', () => {
    const state = deriveWorkflowStageDocument([
      phase({
        phase_name: 'Delayed concept',
        phase_status: 'delayed',
        current_blockers: {
          count: 2,
          phase: [],
          tasks: [{ id: 'task-1', title: 'Survey missing' }],
          ffe: [{ id: 'ffe-1', title: 'Sofa delayed' }],
        },
      }),
      phase({
        phase_id: 'successor',
        phase_name: 'Design development',
        phase_status: 'pending',
        follows_phase_id: 'phase-1',
        canonical_stage_key: 'design_development',
      }),
    ]);

    expect(state.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'phase-1',
      kind: 'resume',
      label:
        'Resume Delayed concept before following the configured schedule graph.',
    });
    expect(state.activeGroups[0].blockers).toHaveLength(2);
  });

  it('keeps delayed blockers informational until resume, then gates completion', () => {
    const delayed = deriveWorkflowStageDocument([
      phase({
        phase_name: 'Delayed concept',
        phase_status: 'delayed',
        blocks_advance: true,
        advance_blocker_count: 1,
        current_blockers: {
          count: 1,
          phase: [{ id: 'decision-1', title: 'Approve concept' }],
          tasks: [],
          ffe: [],
        },
      }),
    ]);
    const inProgress = deriveWorkflowStageDocument([
      phase({
        phase_name: 'Concept work',
        phase_status: 'in_progress',
        blocks_advance: true,
        advance_blocker_count: 1,
        current_blockers: {
          count: 1,
          phase: [{ id: 'decision-1', title: 'Approve concept' }],
          tasks: [],
          ffe: [],
        },
      }),
      phase({
        phase_id: 'successor',
        phase_name: 'Design development',
        phase_status: 'pending',
        follows_phase_id: 'phase-1',
        canonical_stage_key: 'design_development',
      }),
    ]);

    expect(delayed.activeGroups[0].blockers).toHaveLength(1);
    expect(delayed.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'phase-1',
      kind: 'resume',
      label:
        'Resume Delayed concept before following the configured schedule graph.',
    });
    expect(inProgress.activeGroups[0].blockers).toHaveLength(1);
    expect(inProgress.activeGroups[0].nextActions[0]).toEqual({
      phaseId: 'phase-1',
      kind: 'advance',
      label:
        'Resolve 1 phase blocker before advancing from Concept work to Design development.',
    });
  });
});

describe('deriveSectionWorkflowStageDocument', () => {
  it('maps only explicit non-project sections without manufacturing phases', () => {
    const discovery = deriveSectionWorkflowStageDocument('discovery');

    expect(discovery.mode).toBe('section');
    expect(discovery.activeGroups[0].stage.key).toBe('discovery_programming');
    expect(discovery.activeGroups[0].track.key).toBe('core');
    expect(discovery.activeGroups[0].phases).toEqual([]);
    expect(discovery.activeGroups[0].activePhases).toEqual([]);
    expect(discovery.activeGroups[0].nextActions[0].kind).toBe('section');

    expect(deriveSectionWorkflowStageDocument('install').activeGroups).toEqual(
      [],
    );
    expect(deriveSectionWorkflowStageDocument('care').activeGroups).toEqual(
      [],
    );
  });
});
