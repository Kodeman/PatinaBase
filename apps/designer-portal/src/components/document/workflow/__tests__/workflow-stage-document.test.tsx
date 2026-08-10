import { render, screen, within } from '@testing-library/react';

import { WorkflowStageDocument } from '../workflow-stage-document';
import {
  deriveWorkflowStageDocument,
  type WorkflowPhaseLike,
} from '@/lib/document/workflow-stage-derivation';

function phase(
  overrides: Partial<WorkflowPhaseLike> = {},
): WorkflowPhaseLike {
  return {
    phase_id: 'concept',
    phase_name: 'Concept',
    phase_status: 'in_progress',
    phase_key: 'concept_development',
    canonical_stage_key: 'concept_schematic',
    workflow_track: 'core',
    sort_order: 0,
    gate_note: 'Household approves one direction',
    deliverables: [{ label: 'Concept folio' }],
    follows_phase_id: null,
    lane: 'main',
    template_provenance: { slug: 'full-service', version: 4 },
    current_blockers: { count: 0, phase: [], tasks: [], ffe: [] },
    advance_blocker_count: 0,
    blocks_advance: false,
    ...overrides,
  };
}

describe('WorkflowStageDocument', () => {
  it('renders an ordered eleven-stage rail with stages 04–09 nested inside Project', () => {
    const { container } = render(
      <WorkflowStageDocument
        state={deriveWorkflowStageDocument([phase()])}
      />,
    );

    const rail = screen.getByRole('region', {
      name: 'Residential design workflow stages',
    });
    expect(rail).toBeVisible();
    expect(
      rail.querySelectorAll('[data-workflow-stage]'),
    ).toHaveLength(11);
    expect(within(rail).getAllByRole('list').length).toBeGreaterThanOrEqual(2);
    expect(
      within(rail).getByText('Kickoff & Existing Conditions'),
    ).toBeVisible();
    expect(within(rail).getByText('Contract Administration')).toBeVisible();
    expect(screen.getByText('Project · stages 04–09')).toBeVisible();

    const active = container.querySelector('[aria-current="step"]');
    expect(active).toHaveAttribute('data-workflow-stage', 'concept_schematic');
    expect(within(active as HTMLElement).getByText('Active')).toBeVisible();
    expect(container.querySelector('nav')).toBeNull();
  });

  it('shows parallel active stage-track records with distinct schedule and responsibility lanes', () => {
    render(
      <WorkflowStageDocument
        state={deriveWorkflowStageDocument([
          phase({
            phase_id: 'ffe',
            phase_name: 'Order furnishings',
            canonical_stage_key: 'bidding_permitting_procurement',
            workflow_track: 'ffe',
            lane: 'main',
            current_blockers: {
              count: 1,
              phase: [
                {
                  id: 'blocker',
                  kind: 'coordination',
                  title: 'Choose the stone sample',
                },
              ],
              tasks: [],
              ffe: [],
            },
          }),
          phase({
            phase_id: 'construction',
            phase_name: 'Permit set',
            canonical_stage_key: 'bidding_permitting_procurement',
            workflow_track: 'construction',
            lane: 'thread',
            gate_note: 'Permit issued',
            deliverables: [{ label: 'Permit drawings' }],
          }),
        ])}
      />,
    );

    expect(
      screen.getByText('08 · Bidding, Permitting & Procurement · FF&E'),
    ).toBeVisible();
    expect(
      screen.getByText(
        '08 · Bidding, Permitting & Procurement · Construction',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('coordination: Choose the stone sample'),
    ).toBeVisible();
    expect(screen.getAllByText('Project operations / procurement')).toHaveLength(
      2,
    );
    expect(screen.getByText('main')).toBeVisible();
    expect(screen.getByText('thread')).toBeVisible();
    expect(screen.getByText('Permit issued')).toBeVisible();
    expect(screen.getByText('Permit drawings')).toBeVisible();
    expect(screen.getAllByText('full-service · version 4')).toHaveLength(2);
  });

  it('names an unclassified row without claiming a stage from phase_key', () => {
    const { container } = render(
      <WorkflowStageDocument
        state={deriveWorkflowStageDocument([
          phase({
            phase_id: 'legacy',
            phase_name: 'Concept Development',
            phase_key: 'concept_schematic',
            canonical_stage_key: null,
          }),
        ])}
      />,
    );

    expect(
      screen.getByText('Unclassified active phase · Concept Development'),
    ).toBeVisible();
    expect(
      screen.getByText(/local phase key “concept_schematic”/i),
    ).toBeVisible();
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('keeps the 320px base contract semantic and free of tabs, cards, fixed widths, and shadows', () => {
    const { container } = render(
      <WorkflowStageDocument
        state={deriveWorkflowStageDocument([phase()])}
      />,
    );

    const documentSection = screen.getByRole('region', {
      name: 'Residential project workflow',
    });
    expect(documentSection).toHaveAttribute(
      'data-layout',
      'single-column-base-two-column-wide',
    );
    expect(documentSection).toHaveClass(
      'min-w-0',
      'max-w-full',
      'overflow-x-clip',
    );
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[class*="shadow"]')).toBeNull();
    expect(container.querySelector('[class*="rounded"]')).toBeNull();
    expect(container.querySelector('[style*="min-width"]')).toBeNull();
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });
});
