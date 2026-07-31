import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogStrip } from './log-strip';

const mockLogOffer = jest.fn().mockResolvedValue(undefined);
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
let mockOffer: null | {
  projectName: string;
  suggestedMinutes: number;
  rawSeconds: number;
  idleSeconds: number;
} = null;

jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    offer: mockOffer,
    logOffer: mockLogOffer,
    discardOffer: mockDiscardOffer,
  }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    logStripActed: jest.fn(),
  },
}));

describe('LogStrip', () => {
  beforeEach(() => {
    mockOffer = null;
    mockLogOffer.mockClear();
    mockDiscardOffer.mockClear();
  });

  it('becomes the mobile edge owner with readable, full-size form controls', async () => {
    mockOffer = {
      projectName: 'Whitfield House',
      suggestedMinutes: 26,
      rawSeconds: 1560,
      idleSeconds: 0,
    };
    render(<LogStrip />);

    const strip = screen.getByRole('region', { name: 'Log time offer' });
    expect(strip).toHaveAttribute('data-mobile-edge-owner', 'log-offer');
    expect(strip).toHaveClass('bottom-0', 'min-[1180px]:bottom-[60px]');

    const minutes = screen.getByRole('spinbutton', { name: 'Minutes to log' });
    const activity = screen.getByRole('combobox', { name: 'Activity' });
    expect(minutes).toHaveClass('min-h-11', 'text-[16px]');
    expect(activity).toHaveClass('min-h-11', 'text-[16px]');
    await waitFor(() => expect(minutes).toHaveValue(26));
  });

  it('preserves log and discard behavior through Scored Ink actions', async () => {
    mockOffer = {
      projectName: 'Whitfield House',
      suggestedMinutes: 26,
      rawSeconds: 1560,
      idleSeconds: 0,
    };
    render(<LogStrip />);

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Minutes to log' }),
      {
        target: { value: '31' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() =>
      expect(mockLogOffer).toHaveBeenCalledWith(31, 'design'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(mockDiscardOffer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Log' })).toHaveAttribute(
      'data-action-key',
      'log-time-offer',
    );
  });
});
