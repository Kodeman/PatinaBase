import { render, screen, within } from '@testing-library/react';

import { WorkflowStageDocument } from '../workflow-stage-document';
import type { WorkflowPhaseLike } from '@/lib/document/workflow-stage-derivation';

function activeConceptPhase(
  partial: Partial<WorkflowPhaseLike> = {},
): WorkflowPhaseLike {
  return {
    id: 'concept',
    name: 'Concept',
    phase_key: 'concept_development',
    status: 'in_progress',
    sort_order: 0,
    gate_condition: 'Household approves one direction',
    deliverables: [{ label: 'Concept folio' }],
    follows_phase_id: null,
    lane: 'main',
    ...partial,
  };
}

describe('WorkflowStageDocument', () => {
  it('renders an ordered eleven-stage rail with stages 04–09 nested inside Project', () => {
    const { container } = render(
      <WorkflowStageDocument
        phases={[activeConceptPhase()]}
        coordinationItems={[]}
      />,
    );

    const rail = screen.getByRole('list', {
      name: 'Residential design workflow stages',
    });
    expect(rail).toBeVisible();
    expect(container.querySelectorAll('[data-workflow-stage]')).toHaveLength(
      11,
    );

    const projectStages = screen.getByRole('list', {
      name: 'Project stages 04 through 09',
    });
    expect(within(projectStages).getAllByRole('listitem')).toHaveLength(6);
    expect(
      within(projectStages).getByText('Kickoff & Existing Conditions'),
    ).toBeVisible();
    expect(
      within(projectStages).getByText(
        'Renovation / Construction Administration',
      ),
    ).toBeVisible();
    expect(screen.getByText('Project · stages 04–09')).toBeVisible();

    const active = container.querySelector('[aria-current="step"]');
    expect(active).toHaveAttribute(
      'data-workflow-stage',
      'concept_schematic_design',
    );
    expect(within(active as HTMLElement).getByText('Active')).toBeVisible();
  });

  it('shows the active stage record from configured phase and coordination data', () => {
    render(
      <WorkflowStageDocument
        phases={[activeConceptPhase()]}
        coordinationItems={[
          {
            id: 'blocker',
            title: 'Choose the stone sample',
            phase_id: 'concept',
            status: 'pending',
            blocking_status: 'blocks_phase',
          },
        ]}
      />,
    );

    expect(screen.getByText('05 · Concept / Schematic Design')).toBeVisible();
    expect(screen.getAllByText('Design').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Establish the spatial, material, and aesthetic direction of the work.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Household approves one direction')).toBeVisible();
    expect(screen.getByText('Concept direction')).toBeVisible();
    expect(screen.getByText('Concept presentation')).toBeVisible();
    expect(screen.getByText('Concept folio')).toBeVisible();
    expect(screen.getByText('Choose the stone sample')).toBeVisible();
    expect(screen.getByText('Lead designer / studio')).toBeVisible();
    expect(
      screen.getByText('Resolve 1 phase blocker before advancing.'),
    ).toBeVisible();
  });

  it('names an unmapped legacy phase without claiming a canonical stage or track', () => {
    const { container } = render(
      <WorkflowStageDocument
        phases={[
          activeConceptPhase({
            id: 'legacy',
            name: 'Concept Development',
            phase_key: null,
          }),
        ]}
        coordinationItems={[]}
      />,
    );

    expect(
      screen.getByText('Legacy phase · Concept Development'),
    ).toBeVisible();
    expect(screen.getByText('Not mapped to a canonical track')).toBeVisible();
    expect(
      screen.getByText(
        'This schedule phase has no recognized canonical key. The Document will not infer a stage from its name.',
      ),
    ).toBeVisible();
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
  });

  it('keeps the 320px base layout semantic and free of tabs, cards, and shadows', () => {
    const { container } = render(
      <WorkflowStageDocument
        phases={[activeConceptPhase()]}
        coordinationItems={[]}
      />,
    );

    const documentSection = screen.getByRole('region', {
      name: 'Residential project workflow',
    });
    expect(documentSection).toHaveAttribute(
      'data-layout',
      'single-column-base-two-column-wide',
    );
    expect(documentSection).toHaveClass('min-w-0');
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[class*="shadow"]')).toBeNull();
    expect(container.querySelector('[class*="rounded"]')).toBeNull();
  });
});
