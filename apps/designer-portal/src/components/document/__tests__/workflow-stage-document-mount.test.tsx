import { render, screen } from '@testing-library/react';

const mockUseProjectWorkflow = jest.fn();
const mockUseProjectContextualHandoffs = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectWorkflow: (projectId: string | null) =>
    mockUseProjectWorkflow(projectId),
  useProjectContextualHandoffs: (projectId: string | null) =>
    mockUseProjectContextualHandoffs(projectId),
}));

import { WorkflowStageDocumentMount } from '../workflow-stage-document-mount';

const EMPTY_QUERY = {
  data: [],
  isLoading: false,
  isError: false,
};

describe('WorkflowStageDocumentMount', () => {
  beforeEach(() => {
    mockUseProjectWorkflow.mockReturnValue(EMPTY_QUERY);
    mockUseProjectContextualHandoffs.mockReturnValue(EMPTY_QUERY);
  });

  it('uses explicit section guidance for a non-project Document', () => {
    render(
      <WorkflowStageDocumentMount projectId={null} activeSection="discovery" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith(null);
    expect(
      screen.getByText('02 · Discovery & Programming · Core'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Section guidance only; no project phase topology is available.',
      ),
    ).toBeVisible();
  });

  it('uses project workflow rows regardless of the active Document section', () => {
    mockUseProjectWorkflow.mockReturnValue({
      data: [
        {
          phase_id: 'phase-1',
          phase_name: 'Concept work',
          phase_status: 'active',
          phase_key: 'ambiguous_local_key',
          canonical_stage_key: 'concept_schematic',
          workflow_track: 'core',
          sort_order: 0,
          lane: 'main',
          follows_phase_id: null,
          gate_note: null,
          deliverables: [],
          template_provenance: {},
          current_blockers: {
            count: 0,
            phase: [],
            tasks: [],
            ffe: [],
          },
          advance_blocker_count: 0,
          blocks_advance: false,
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockUseProjectContextualHandoffs.mockReturnValue({
      data: [
        {
          sourceKind: 'project_approval',
          sourceId: 'decision-1',
          projectId: 'project-1',
          phaseId: 'phase-1',
          canonicalStageKey: 'concept_schematic',
          workflowTrack: 'core',
          stageAttribution: 'exact_project_phase',
          sourceState: 'response_required',
          responsibility: {
            sender: { kind: 'studio', label: null },
            recipient: { kind: 'client', label: null },
            currentOwner: { kind: 'client', label: null },
          },
          expectedResponse: 'select_approval_outcome',
          dueAt: '2099-08-20T12:00:00.000Z',
          isOverdue: false,
          escalation: null,
          artifact: {
            kind: 'plan_issue',
            version: 2,
            checksum: 'a'.repeat(64),
            title: 'Issued drawing set 02',
          },
          actionKind: 'open_approval_response',
          updatedAt: '2026-08-11T12:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(
      <WorkflowStageDocumentMount projectId="project-1" activeSection="care" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith('project-1');
    expect(mockUseProjectContextualHandoffs).toHaveBeenCalledWith('project-1');
    expect(
      screen.getByRole('region', { name: 'Project handoffs' }),
    ).toBeVisible();
    expect(screen.getByText('05 · Concept / Schematic · Core')).toBeVisible();
    expect(screen.queryByText(/Closeout & Post-Occupancy · Core/)).toBeNull();
  });
});
