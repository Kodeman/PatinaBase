import { fireEvent, render, screen } from '@testing-library/react';

let mockProject: Record<string, unknown> | undefined;

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: mockProject }),
  useProjectPhases: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-time-tracking', () => ({
  useUpdatePhaseEstimates: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-project-lifecycle', () => ({
  usePhaseActualMinutes: () => ({ data: {} }),
  useSaveProjectVitals: () => ({ mutateAsync: jest.fn() }),
}));

import { LetterheadVitals } from './letterhead-vitals';

const baseProject = {
  current_phase: 'design_development',
  start_date: null,
  target_end_date: null,
  budget_min: null,
  budget_max: null,
  total_amount_cents: null,
};

describe('LetterheadVitals band-honest empty rendering', () => {
  it('offers a ghost affordance instead of an empty band when no bound is recorded', () => {
    mockProject = { ...baseProject };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByRole('button', { name: 'Set a budget band' })).toBeVisible();
    expect(screen.queryByText('Band')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('$');
    expect(
      screen.queryByLabelText('Budget band minimum (dollars)'),
    ).not.toBeInTheDocument();
  });

  it('states no total when the contract amount is zero rather than a bare $0', () => {
    mockProject = { ...baseProject, total_amount_cents: 0 };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(container).not.toHaveTextContent('$0');
  });

  it('keeps the blur-save inputs one click away from the ghost affordance', () => {
    mockProject = { ...baseProject };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Set a budget band' }));

    expect(screen.getByLabelText('Budget band minimum (dollars)')).toHaveFocus();
    expect(screen.getByLabelText('Budget band maximum (dollars)')).toBeVisible();
  });

  it('renders the band and the total normally once either is recorded', () => {
    mockProject = {
      ...baseProject,
      budget_min: 5_000_00,
      budget_max: 9_000_00,
      total_amount_cents: 7_500_00,
    };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.queryByRole('button', { name: 'Set a budget band' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Budget band minimum (dollars)')).toHaveValue('5000');
    expect(screen.getByText('$7,500')).toBeVisible();
  });
});
