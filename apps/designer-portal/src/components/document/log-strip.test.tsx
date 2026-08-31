import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogStrip } from './log-strip';

const mockLogOffer = jest.fn().mockResolvedValue(undefined);
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
let mockOffer: null | {
  projectId: string;
  projectName: string;
  suggestedMinutes: number;
  rawSeconds: number;
  idleSeconds: number;
} = null;
let mockHeldProjectId: string | null = null;

// D-B54 — the cross-project rule moved into the provider, which publishes it
// as one boolean both edge tenants read (`mobile-bar.tsx` yields on exactly
// this). The stub derives it the same way the provider does, so these cases
// keep asserting the behaviour they always did.
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({
    offer: mockOffer,
    offerOwnsEdge:
      mockOffer !== null &&
      !(mockHeldProjectId && mockHeldProjectId !== mockOffer.projectId),
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
    mockHeldProjectId = null;
    mockLogOffer.mockClear();
    mockDiscardOffer.mockClear();
  });

  it('becomes the mobile edge owner with readable, full-size form controls', async () => {
    mockOffer = {
      projectId: 'whitfield-project',
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
      projectId: 'whitfield-project',
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


  it('does not overlay an unrelated saved offer on the project in hand', () => {
    mockHeldProjectId = 'harper-project';
    mockOffer = {
      projectId: 'ashford-project',
      projectName: 'Ashford Heights — main floor refresh',
      suggestedMinutes: 32,
      rawSeconds: 32 * 60,
      idleSeconds: 0,
    };

    render(<LogStrip />);

    expect(screen.queryByRole('region', { name: 'Log time offer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ashford Heights — main floor refresh')).not.toBeInTheDocument();
  });

  it('resurfaces the saved offer when no different project is in hand', () => {
    mockOffer = {
      projectId: 'ashford-project',
      projectName: 'Ashford Heights — main floor refresh',
      suggestedMinutes: 32,
      rawSeconds: 32 * 60,
      idleSeconds: 0,
    };

    render(<LogStrip />);

    expect(screen.getByRole('region', { name: 'Log time offer' })).toBeVisible();
    expect(screen.getByText('Ashford Heights — main floor refresh')).toBeVisible();
  });
});
