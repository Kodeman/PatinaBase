import { fireEvent, render, screen } from '@testing-library/react';
import type { TradeDrawDraft } from '@/lib/document/project-commerce';
import {
  DrawScheduleEditor,
  defaultDrawSchedule,
  DEPOSIT_LABEL,
  FINAL_LABEL,
} from './draw-schedule-editor';

describe('DrawScheduleEditor', () => {
  it('arrives with a deposit on signature and a final on acceptance', () => {
    const schedule = defaultDrawSchedule();
    expect(schedule).toEqual([
      { label: DEPOSIT_LABEL, percentage: 50, gatesOnAcceptance: false },
      { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: true },
    ]);
  });

  it('states each draw in money as well as percent', () => {
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(DEPOSIT_LABEL)).toBeVisible();
    expect(screen.getByText(FINAL_LABEL)).toBeVisible();
    expect(screen.getAllByText('$3,400')).toHaveLength(2);
    expect(screen.getByText('100% of $6,800')).toBeVisible();
  });

  it('says when the draws do not come to the whole price', () => {
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={[
          { label: DEPOSIT_LABEL, percentage: 40, gatesOnAcceptance: false },
          { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: true },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'The draws come to 90% — they must come to 100%.',
    );
  });

  it('edits a percentage in place', () => {
    const onChange = jest.fn();
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(`${DEPOSIT_LABEL} percent`), {
      target: { value: '30' },
    });
    expect(onChange).toHaveBeenCalledWith([
      { label: DEPOSIT_LABEL, percentage: 30, gatesOnAcceptance: false },
      { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: true },
    ]);
  });

  it('adds a middle draw between the two pinned ones', () => {
    const onChange = jest.fn();
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Add a draw'));

    const next = onChange.mock.calls[0][0] as TradeDrawDraft[];
    expect(next).toHaveLength(3);
    expect(next[0].label).toBe(DEPOSIT_LABEL);
    expect(next[2].label).toBe(FINAL_LABEL);
    expect(next[2].gatesOnAcceptance).toBe(true);
  });

  it('lets a middle draw be renamed and removed, never a pinned one', () => {
    const onChange = jest.fn();
    const draws: TradeDrawDraft[] = [
      { label: DEPOSIT_LABEL, percentage: 40, gatesOnAcceptance: false },
      { label: 'Progress draw', percentage: 30, gatesOnAcceptance: false },
      { label: FINAL_LABEL, percentage: 30, gatesOnAcceptance: true },
    ];
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={draws}
        onChange={onChange}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Draw 2 name'), {
      target: { value: 'At rough-in' },
    });
    expect(onChange).toHaveBeenCalledWith([
      draws[0],
      { ...draws[1], label: 'At rough-in' },
      draws[2],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenLastCalledWith([draws[0], draws[2]]);
  });

  it('says a single draw is not a schedule — the new no-single-draw floor', () => {
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={[{ label: 'Everything', percentage: 100, gatesOnAcceptance: true }]}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByText('A schedule needs at least a deposit and a separate final draw.'),
    ).toBeVisible();
  });

  it('shows an "On acceptance" tag on the draw that actually carries the gate', () => {
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={() => {}}
      />,
    );
    const tags = screen.getAllByTestId('draw-gates-on-acceptance');
    expect(tags).toHaveLength(1);
    expect(tags[0].closest('td')).toHaveTextContent('$3,400');
  });

  it('does not repin or show a notice when the schedule already satisfies the invariant', () => {
    const onChange = jest.fn();
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('draw-schedule-repaired-notice')).not.toBeInTheDocument();
  });

  // A hydrated schedule — an older save, a direct-table edit — could arrive
  // with gatesOnAcceptance set on the wrong row, or on more than one, with
  // nothing in the table to show it. The editor must re-pin it to the last
  // draw on load and say so, rather than silently let the studio send a
  // scope whose acceptance draw does not match its own paper.
  it('repins a hydrated schedule that violates the pinning invariant, once, with a visible notice', () => {
    const onChange = jest.fn();
    const corrupted: TradeDrawDraft[] = [
      { label: DEPOSIT_LABEL, percentage: 50, gatesOnAcceptance: true },
      { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: false },
    ];
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={corrupted}
        onChange={onChange}
      />,
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { label: DEPOSIT_LABEL, percentage: 50, gatesOnAcceptance: false },
      { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: true },
    ]);
    expect(screen.getByTestId('draw-schedule-repaired-notice')).toHaveTextContent(
      /repinned/i,
    );
  });

  it('re-pins to the new last draw after a middle removal changes who is last', () => {
    const onChange = jest.fn();
    const draws: TradeDrawDraft[] = [
      { label: DEPOSIT_LABEL, percentage: 34, gatesOnAcceptance: false },
      { label: 'Progress draw', percentage: 33, gatesOnAcceptance: false },
      { label: FINAL_LABEL, percentage: 33, gatesOnAcceptance: true },
    ];
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={draws}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).toHaveBeenLastCalledWith([
      { ...draws[0], gatesOnAcceptance: false },
      { ...draws[2], gatesOnAcceptance: true },
    ]);
  });

  it('goes quiet when the scope is no longer a draft', () => {
    render(
      <DrawScheduleEditor
        clientPriceCents={680_000}
        draws={defaultDrawSchedule()}
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.queryByText('Add a draw')).not.toBeInTheDocument();
    expect(screen.getByLabelText(`${DEPOSIT_LABEL} percent`)).toBeDisabled();
  });
});
