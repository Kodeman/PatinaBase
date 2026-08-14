import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DateTextInput, displayDateText, parseDateText } from '../date-text-input';

// The Folio itself is proven in its own suites (folio-popover.test.tsx,
// folio-calendar.test.tsx) — here we only need a stand-in that opens, shows
// what it was seeded with, and fires onCommit once from a SET press.
jest.mock('../date', () => ({
  FolioPopover: ({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div data-testid="folio-popover">
      {children}
      <button type="button" onClick={onClose}>
        Stub close
      </button>
    </div>
  ),
  FolioCalendar: ({
    value,
    minDate,
    onCommit,
  }: {
    value: { kind: 'day'; date: string } | null;
    minDate?: string | null;
    onCommit: (selection: { kind: 'day'; date: string }) => void;
  }) => (
    <div
      data-testid="folio-calendar"
      data-seeded={value?.date ?? ''}
      data-min-date={minDate ?? ''}
    >
      <button
        type="button"
        onClick={() => onCommit({ kind: 'day', date: '2026-08-19' })}
      >
        Stub set
      </button>
    </div>
  ),
}));

describe('parseDateText', () => {
  it('accepts ISO and US shapes and normalizes to canonical YYYY-MM-DD', () => {
    expect(parseDateText('2026-08-07')).toBe('2026-08-07');
    expect(parseDateText('8/7/2026')).toBe('2026-08-07');
    expect(parseDateText('08/07/2026')).toBe('2026-08-07');
  });

  it('rejects blank, malformed, and out-of-range input', () => {
    expect(parseDateText('')).toBeNull();
    expect(parseDateText('not a date')).toBeNull();
    expect(parseDateText('2026-13-01')).toBeNull();
    expect(parseDateText('2026-02-30')).toBeNull();
  });
});

describe('displayDateText', () => {
  it('renders canonical ISO as US MM/DD/YYYY', () => {
    expect(displayDateText('2026-08-07')).toBe('08/07/2026');
  });

  it('passes non-canonical or null input through unchanged', () => {
    expect(displayDateText(null)).toBe('');
    expect(displayDateText('not-a-date')).toBe('not-a-date');
  });
});

describe('DateTextInput', () => {
  it('shows the displayed value on the trigger and opens the Folio on click', () => {
    render(
      <DateTextInput value="2026-08-07" onChange={jest.fn()} ariaLabel="Start date" />,
    );

    const trigger = screen.getByRole('button', { name: 'Start date' });
    expect(trigger).toHaveTextContent('08/07/2026');
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByTestId('folio-popover')).toBeInTheDocument();
    expect(screen.getByTestId('folio-calendar')).toHaveAttribute(
      'data-seeded',
      '2026-08-07',
    );
  });

  it('shows an italic placeholder when there is no value', () => {
    render(<DateTextInput value={null} onChange={jest.fn()} ariaLabel="Start date" />);

    expect(screen.getByRole('button', { name: 'Start date' })).toHaveTextContent(
      'MM/DD/YYYY',
    );
  });

  it('commits a new date only when the Folio fires SET, and reports it valid', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();

    render(
      <DateTextInput
        value="2026-08-07"
        onChange={onChange}
        ariaLabel="Start date"
        onValidityChange={onValidityChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start date' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Stub set'));

    expect(onChange).toHaveBeenCalledWith('2026-08-19');
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
  });

  it('writes the set date onto its trigger (the discovery Timeline plumbing)', () => {
    // Exactly how field-kit's DateInput is wired on the Timeline fields:
    // `value={draft.target_date} onChange={(v) => commit({ target_date: v })}`.
    function ControlledField() {
      const [value, setValue] = useState<string | null>(null);
      return <DateTextInput value={value} onChange={setValue} ariaLabel="Target (move-in)" />;
    }
    render(<ControlledField />);

    const trigger = screen.getByRole('button', { name: 'Target (move-in)' });
    expect(trigger).toHaveTextContent('MM/DD/YYYY');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Stub set'));

    expect(trigger).toHaveTextContent('08/19/2026');
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
  });

  it('closes the Folio without committing when it asks to close', () => {
    const onChange = jest.fn();

    render(<DateTextInput value="2026-08-07" onChange={onChange} ariaLabel="Start date" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start date' }));
    fireEvent.click(screen.getByText('Stub close'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
  });

  it('clears through the affordance and reports the empty value as valid', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();

    render(
      <DateTextInput
        value="2026-08-07"
        onChange={onChange}
        ariaLabel="Start date"
        onValidityChange={onValidityChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
  });

  it('has no clear affordance when there is no value', () => {
    render(<DateTextInput value={null} onChange={jest.fn()} ariaLabel="Start date" />);

    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
  });

  it('rejects non-canonical controlled values instead of showing free-form text', () => {
    const onValidityChange = jest.fn();

    render(
      <DateTextInput
        value="08/07/2026"
        onChange={jest.fn()}
        ariaLabel="Start date"
        onValidityChange={onValidityChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Start date' })).toHaveTextContent(
      'MM/DD/YYYY',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid calendar date.');
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  it('disables the trigger, hides the clear affordance, and never opens the Folio', () => {
    const onChange = jest.fn();

    render(
      <DateTextInput
        value="2026-08-07"
        onChange={onChange}
        ariaLabel="Start date"
        disabled
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Start date' });
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.queryByTestId('folio-popover')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes minDate through to the Folio', () => {
    render(
      <DateTextInput
        value={null}
        onChange={jest.fn()}
        ariaLabel="Extend due date to"
        minDate="2026-08-15"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Extend due date to' }));

    expect(screen.getByTestId('folio-calendar')).toHaveAttribute(
      'data-min-date',
      '2026-08-15',
    );
  });
});
