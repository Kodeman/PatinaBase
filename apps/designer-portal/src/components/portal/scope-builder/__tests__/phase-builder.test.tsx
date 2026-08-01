import { act, fireEvent, render, screen } from '@testing-library/react';
import { PhaseBuilder } from '../phase-builder';

const updateMutate = jest.fn();
const updateMutateAsync = jest.fn();

const phases = [
  {
    id: 'phase-1',
    proposal_id: 'proposal-1',
    name: 'Concept',
    phase_key: 'concept_development',
    duration_weeks: 3,
    fee_cents: 250_000,
    revision_limit: 2,
    gate_condition: null,
    sort_order: 0,
    duration_days: 21,
    follows_phase_id: null,
    anchor_date: null,
    lane: 'main',
  },
];
const noRows: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  useProposalPhases: () => ({ data: phases, isLoading: false }),
  useAddProposalPhase: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useUpdateProposalPhase: () => ({
    mutate: updateMutate,
    mutateAsync: updateMutateAsync,
    isPending: false,
    isError: false,
  }),
  useRemoveProposalPhase: () => ({ mutate: jest.fn(), isPending: false }),
  useProposalPaymentMilestones: () => ({ data: noRows }),
  useProposalScheduleMilestones: () => ({ data: noRows }),
  useProjects: () => ({ data: noRows, isPending: false }),
  useProjectPhaseCounts: () => ({ data: {}, isPending: false }),
  useApplyPhaseTemplate: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  useCopyScheduleAsBuilt: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
  mapProposalPhaseRowToScheduleInput: (row: unknown) => row,
  mapProposalScheduleMilestoneRowToScheduleInput: (row: unknown) => row,
}));

jest.mock('@patina/design-system', () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn() },
}));
jest.mock('@/lib/analytics/schedule-events', () => ({
  scheduleEvents: { scheduleAnchorSet: jest.fn(), scheduleBorn: jest.fn(), schedulePhaseAdded: jest.fn() },
}));
jest.mock('../deliverables-editor', () => ({ DeliverablesEditor: () => null }));
jest.mock('../gate-conditions-editor', () => ({ GateConditionsEditor: () => null }));
jest.mock('../proposal-milestones-editor', () => ({ ProposalMilestonesEditor: () => null }));
jest.mock('../phase-template-picker', () => ({ PhaseTemplatePicker: () => null }));
jest.mock('../phase-timeline-view', () => ({ PhaseTimelineView: () => null }));
jest.mock('@/components/document/schedule/schedule-birth', () => ({ ScheduleBirth: () => null }));
jest.mock('@/components/document/schedule/schedule-entry-field', () => ({
  ScheduleEntryField: ({
    onCommit,
  }: {
    onCommit: (entry: { kind: 'duration'; days: number }) => void;
  }) => (
    <button
      type="button"
      aria-label="Commit 28 day duration"
      onClick={() => onCommit({ kind: 'duration', days: 28 })}
    >
      Commit duration
    </button>
  ),
}));
jest.mock('@/components/document/schedule/milestone-row', () => ({ AnchorChip: () => null }));

describe('PhaseBuilder autosave integrity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    updateMutate.mockReset();
    updateMutateAsync.mockReset();
    updateMutateAsync.mockResolvedValue({});
  });

  afterEach(() => jest.useRealTimers());

  it('merges rapid name, fee, and duration edits into one phase write', async () => {
    const { container } = render(<PhaseBuilder proposalId="proposal-1" />);
    const name = container.querySelector('input[type="text"]');
    const fee = container.querySelector('input[type="number"]');
    if (!name || !fee) throw new Error('phase inputs were not rendered');

    fireEvent.change(name, { target: { value: 'Design direction' } });
    fireEvent.change(fee, { target: { value: '4200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit 28 day duration' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({
      phaseId: 'phase-1',
      proposalId: 'proposal-1',
      updates: {
        name: 'Design direction',
        fee_cents: 420_000,
        duration_days: 28,
        duration_weeks: 4,
      },
    });
  });

  it('flushes the final field value immediately on blur', async () => {
    const { container } = render(<PhaseBuilder proposalId="proposal-1" />);
    const name = container.querySelector('input[type="text"]');
    if (!name) throw new Error('phase name was not rendered');

    fireEvent.change(name, { target: { value: 'Final concept' } });
    fireEvent.blur(name);
    await act(async () => Promise.resolve());

    expect(updateMutateAsync).toHaveBeenCalledWith({
      phaseId: 'phase-1',
      proposalId: 'proposal-1',
      updates: { name: 'Final concept' },
    });
  });

  it('flushes pending phase edits when the builder unmounts', async () => {
    const { container, unmount } = render(<PhaseBuilder proposalId="proposal-1" />);
    const name = container.querySelector('input[type="text"]');
    if (!name) throw new Error('phase name was not rendered');

    fireEvent.change(name, { target: { value: 'Kept on navigation' } });
    unmount();
    await act(async () => Promise.resolve());

    expect(updateMutateAsync).toHaveBeenCalledWith({
      phaseId: 'phase-1',
      proposalId: 'proposal-1',
      updates: { name: 'Kept on navigation' },
    });
  });

  it('surfaces saving, saved, and error states inline', async () => {
    let resolveSave: (value: unknown) => void = () => {};
    updateMutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { container } = render(<PhaseBuilder proposalId="proposal-1" />);
    const name = container.querySelector('input[type="text"]');
    if (!name) throw new Error('phase name was not rendered');

    fireEvent.change(name, { target: { value: 'Saving phase' } });
    fireEvent.blur(name);
    expect(screen.getByRole('status')).toHaveTextContent('Saving phases…');

    await act(async () => {
      resolveSave({});
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Phases saved');

    updateMutateAsync.mockRejectedValueOnce(new Error('phase write failed'));
    fireEvent.change(name, { target: { value: 'Retry phase' } });
    fireEvent.blur(name);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('phase write failed');
  });
});
