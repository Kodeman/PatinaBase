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

  it('does not submit while the direct-entry date is partial or invalid', () => {
    render(
      <MarkSignedSheet
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onSigned={jest.fn()}
      />,
    );

    const date = screen.getByRole('textbox', { name: 'Date signed' });
    fireEvent.change(date, { target: { value: '8/3/' } });
    fireEvent.click(screen.getByRole('button', { name: /record signed/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /record signed/i })).toBeDisabled();
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
    const date = screen.getByRole('textbox', { name: 'Date signed' });
    expect(date).toHaveValue('07/31/2026');

    fireEvent.change(date, { target: { value: '08/15/2026' } });
    fireEvent.blur(date);
    fireEvent.click(screen.getByRole('button', { name: /record signed/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ signedDate: '2026-08-15' }),
      expect.any(Object),
    );
  });
});
