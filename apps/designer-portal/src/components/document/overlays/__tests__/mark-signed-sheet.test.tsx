import { render, screen } from '@testing-library/react';
import { MarkSignedSheet } from '../mark-signed-sheet';

const mutate = jest.fn();

jest.mock('@/hooks/use-proposals', () => ({
  useRecordOfflineSignature: () => ({ mutate, isPending: false }),
}));

jest.mock('../doc-sheet', () => ({
  DocSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

describe('MarkSignedSheet date-only defaults', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 8:00 PM Jul 31 in America/Chicago, but already Aug 1 in UTC.
    jest.setSystemTime(new Date('2026-08-01T01:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defaults to the browser calendar day instead of the UTC day', () => {
    render(
      <MarkSignedSheet
        proposalId="proposal-1"
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
        onSigned={jest.fn()}
      />,
    );

    // A native date control holds the canonical ISO value, not the display form.
    expect(screen.getByLabelText('Date signed')).toHaveValue('2026-07-31');
  });
});
