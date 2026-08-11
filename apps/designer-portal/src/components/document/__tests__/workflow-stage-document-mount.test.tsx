import { render, screen } from '@testing-library/react';

const mockUseProjectWorkflow = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectWorkflow: (projectId: string | null) =>
    mockUseProjectWorkflow(projectId),
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
    render(
      <WorkflowStageDocumentMount projectId="project-1" activeSection="care" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith('project-1');
    // Ruling III: the mount renders the stage document alone. Handoffs are
    // margin items now, and nothing here mounts a band.
    expect(screen.queryByRole('region', { name: 'Project handoffs' })).toBeNull();
    expect(screen.getByText('05 · Concept / Schematic · Core')).toBeVisible();
    expect(screen.queryByText(/Closeout & Post-Occupancy · Core/)).toBeNull();
  });
});
