import { fireEvent, render, screen } from '@testing-library/react';
import { MarkSignedSheet } from './mark-signed-sheet';

const mutate = jest.fn();

jest.mock('@/hooks/use-proposals', () => ({
  useRecordOfflineSignature: () => ({ mutate, isPending: false }),
}));

// The Folio-backed trigger is proven in its own suite (date-text-input.test.tsx);
// here we only need a controlled stand-in so the sheet's own plumbing (default,
// change, clear, AND the validity gate it wires to submit) can be exercised
// directly — the real trigger can never itself go invalid, but the prop still
// has to reach the sheet's submit gate correctly.
jest.mock('../date-text-input', () => ({
  DateTextInput: ({
    value,
    onChange,
    ariaLabel,
    onValidityChange,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    ariaLabel?: string;
    onValidityChange?: (valid: boolean) => void;
  }) => (
    <span>
      <input
        type="text"
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      />
      <button type="button" aria-label={`${ariaLabel} invalid`} onClick={() => onValidityChange?.(false)}>
        Mark invalid
      </button>
      <button type="button" aria-label={`${ariaLabel} valid`} onClick={() => onValidityChange?.(true)}>
        Mark valid
      </button>
    </span>
  ),
}));

describe('MarkSignedSheet date validity', () => {
  beforeEach(() => {
    mutate.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-01T00:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never hands the mutation a partial or invalid date', () => {
    render(
      <MarkSignedSheet
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onSigned={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'Harper Vale' },
    });

    // The Folio can only ever commit a whole calendar date or clear to
    // nothing — there is no pathway left for a partial string like '8/3/' to
    // reach state, so clearing is the only "no date" case left to prove.
    const date = screen.getByLabelText('Date signed');
    fireEvent.change(date, { target: { value: '' } });
    expect(date).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /record signed/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).not.toHaveProperty('signedDate', '8/3/');
    expect(mutate.mock.calls[0][0].signedDate).toBeUndefined();
  });

  it('prefills Chicago local today and preserves the selected calendar day', () => {
    render(
      <MarkSignedSheet
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onSigned={jest.fn()}
      />,
    );

    // 00:30 UTC on Aug 1 is still July 31 in America/Chicago.
    const date = screen.getByLabelText('Date signed');
    expect(date).toHaveValue('2026-07-31');

    fireEvent.change(date, { target: { value: '2026-08-15' } });
    fireEvent.click(screen.getByRole('button', { name: /record signed/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ signedDate: '2026-08-15' }),
      expect.any(Object),
    );
  });

  it('disables recording the signature while the date reports invalid, and re-enables once it reports valid', () => {
    render(
      <MarkSignedSheet
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onSigned={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Signed by'), {
      target: { value: 'Harper Vale' },
    });
    const submit = screen.getByRole('button', { name: /record signed/i });
    expect(submit).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Date signed invalid' }));
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Date signed valid' }));
    expect(submit).not.toBeDisabled();
  });
});
