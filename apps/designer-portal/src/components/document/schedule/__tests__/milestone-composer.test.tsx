import { fireEvent, render, screen } from '@testing-library/react';

// The Folio is house-mocked (per the date/ suites' own coverage of
// FolioPopover/FolioCalendar) — this suite only needs to assert the
// composer wires FolioCalendar's onCommit into the right MilestoneDraft
// field, not the Folio's own grid/preset behavior.
jest.mock('@/components/document/date', () => ({
  FolioPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="folio-popover">{children}</div>
  ),
  FolioCalendar: ({
    onCommit,
  }: {
    onCommit: (selection: { kind: 'day'; date: string }) => void;
  }) => (
    <button type="button" onClick={() => onCommit({ kind: 'day', date: '2026-09-21' })}>
      commit-picked-date
    </button>
  ),
}));

import { MilestoneComposer, type MilestoneDraft } from '../milestone-composer';

const TODAY = '2026-08-14';

function renderComposer(overrides: Partial<Parameters<typeof MilestoneComposer>[0]> = {}) {
  const onSubmit = jest.fn<void, [MilestoneDraft]>();
  const onCancel = jest.fn();
  render(
    <MilestoneComposer today={TODAY} onSubmit={onSubmit} onCancel={onCancel} {...overrides} />,
  );
  return { onSubmit, onCancel };
}

function nameTheMilestone(name = 'Fabric order') {
  fireEvent.change(screen.getByLabelText('Milestone name'), { target: { value: name } });
}

describe('MilestoneComposer — timing presets (D3)', () => {
  it('defaults to "At phase end" and submits with no offsetDays key at all', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    expect(screen.getByRole('button', { name: 'At phase end' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0][0];
    expect(draft).toEqual({ name: 'Fabric order', kind: 'event' });
    expect('offsetDays' in draft).toBe(false);
    expect('anchorDate' in draft).toBe(false);
  });

  it('"Before end" reveals a stepper starting at 3 and submits a negative offsetDays', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    fireEvent.click(screen.getByRole('button', { name: 'Before end' }));
    expect(screen.getByText('3 days before end')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fabric order',
      kind: 'event',
      offsetDays: -3,
    });
  });

  it('stepping the "Before end" control changes N before submit', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();
    fireEvent.click(screen.getByRole('button', { name: 'Before end' }));

    fireEvent.click(screen.getByRole('button', { name: 'More days before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'More days before end' }));
    expect(screen.getByText('5 days before end')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fewer days before end' }));
    expect(screen.getByText('4 days before end')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fabric order',
      kind: 'event',
      offsetDays: -4,
    });
  });

  it('the "Before end" stepper cannot go below 1 day', () => {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Before end' }));

    fireEvent.click(screen.getByRole('button', { name: 'Fewer days before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fewer days before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fewer days before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fewer days before end' }));

    expect(screen.getByText('1 day before end')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer days before end' })).toBeDisabled();
  });

  it('"Pick a date" opens the Folio and a committed day submits as anchorDate', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Milestone date' }));
    fireEvent.click(screen.getByText('commit-picked-date'));

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fabric order',
      kind: 'event',
      anchorDate: '2026-09-21',
    });
  });

  it('blocks submit when "Pick a date" is chosen but nothing has been picked yet', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('pick a date')).toBeInTheDocument();
  });

  it('switching from "Before end" back to "At phase end" submits with no offsetDays key', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    fireEvent.click(screen.getByRole('button', { name: 'Before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'More days before end' }));
    fireEvent.click(screen.getByRole('button', { name: 'More days before end' }));
    expect(screen.getByText('5 days before end')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'At phase end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0][0];
    expect(draft).toEqual({ name: 'Fabric order', kind: 'event' });
    expect('offsetDays' in draft).toBe(false);
  });

  it('switching from "Pick a date" back to "At phase end" submits with no anchorDate key', () => {
    const { onSubmit } = renderComposer();
    nameTheMilestone();

    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Milestone date' }));
    fireEvent.click(screen.getByText('commit-picked-date'));

    fireEvent.click(screen.getByRole('button', { name: 'At phase end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const draft = onSubmit.mock.calls[0][0];
    expect(draft).toEqual({ name: 'Fabric order', kind: 'event' });
    expect('anchorDate' in draft).toBe(false);
  });
});

describe('MilestoneComposer — write-error and name-required guards', () => {
  it('keeps the composer open and readable when the write fails (errorText)', () => {
    const { onSubmit, onCancel } = renderComposer({ errorText: 'could not save the milestone' });
    nameTheMilestone('Site visit');

    expect(screen.getByText('could not save the milestone')).toBeInTheDocument();
    // The composer is still a live, functioning form — not torn down.
    expect(screen.getByLabelText('Milestone name')).toHaveValue('Site visit');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('blocks submit with no name typed', () => {
    const { onSubmit } = renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('name the milestone')).toBeInTheDocument();
  });
});
