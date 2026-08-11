import { fireEvent, render, screen } from '@testing-library/react';
import { MarkSignedSheet } from './mark-signed-sheet';

const mutate = jest.fn();

jest.mock('@/hooks/use-proposals', () => ({
  useRecordOfflineSignature: () => ({ mutate, isPending: false }),
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

    // The native date control refuses a partial entry outright, so the garbage
    // never becomes state — the field clears rather than carrying '8/3/'.
    const date = screen.getByLabelText('Date signed');
    fireEvent.change(date, { target: { value: '8/3/' } });
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
});
