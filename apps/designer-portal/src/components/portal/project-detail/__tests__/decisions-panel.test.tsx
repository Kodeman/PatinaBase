import { render, screen, fireEvent } from '@testing-library/react';

const useDecisionsByProject = jest.fn();
const useSendDecisionReminder = jest.fn();
// Composer also depends on useCreateDecision + useProjectFFEItems — mock them too so
// opening the modal doesn't crash.
const mutateAsync = jest.fn().mockResolvedValue({});

jest.mock('@patina/supabase', () => ({
  useDecisionsByProject: (...args: unknown[]) => useDecisionsByProject(...args),
  useSendDecisionReminder: (...args: unknown[]) => useSendDecisionReminder(...args),
  useCreateDecision: () => ({ mutateAsync, isPending: false }),
  useProjectFFEItems: () => ({ data: [] }),
}));

import { DecisionsPanel } from '../decisions-panel';

beforeEach(() => {
  useDecisionsByProject.mockReset();
  useSendDecisionReminder.mockReset();
  useSendDecisionReminder.mockReturnValue({ mutate: jest.fn() });
});

describe('DecisionsPanel', () => {
  it('renders both "Open" and "Decided" sections when there are pending and responded decisions', () => {
    useDecisionsByProject.mockReturnValue({
      data: [
        {
          id: 'd1',
          title: 'Choose fabric',
          description: 'Need to pick before the next milestone',
          status: 'pending',
          decision_type: 'material',
          blocking_status: 'non_blocking',
          due_date: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        },
        {
          id: 'd2',
          title: 'Pick wood finish',
          status: 'responded',
          decision_type: 'material',
          blocking_status: 'non_blocking',
          due_date: null,
        },
      ],
      isLoading: false,
    });

    render(<DecisionsPanel projectId="proj-1" designerClientId="dc-1" />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Decided')).toBeInTheDocument();
    expect(screen.getByText('Choose fabric')).toBeInTheDocument();
    expect(screen.getByText('Pick wood finish')).toBeInTheDocument();
  });

  it('renders the "No decisions yet" empty state when array is empty', () => {
    useDecisionsByProject.mockReturnValue({ data: [], isLoading: false });

    render(<DecisionsPanel projectId="proj-1" designerClientId="dc-1" />);

    expect(screen.getByText(/No decisions yet/i)).toBeInTheDocument();
  });

  it('mounts the composer modal when "+ New decision" is clicked', () => {
    useDecisionsByProject.mockReturnValue({ data: [], isLoading: false });

    render(<DecisionsPanel projectId="proj-1" designerClientId="dc-1" />);

    // Modal not yet shown
    expect(screen.queryByRole('heading', { name: /new decision/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ new decision/i }));

    expect(screen.getByRole('heading', { name: /new decision/i })).toBeInTheDocument();
  });
});
