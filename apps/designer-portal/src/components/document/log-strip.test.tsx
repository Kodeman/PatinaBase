import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogStrip } from './log-strip';

const mockLogOffer = jest.fn().mockResolvedValue(undefined);
const mockDiscardOffer = jest.fn().mockResolvedValue(undefined);
type MockOffer = {
  projectId: string;
  projectName: string;
  suggestedMinutes: number;
  rawSeconds: number;
  idleSeconds: number;
  billable: boolean;
  hourlyRateCents: number | null;
  rateSource: string | null;
  rateRole: string | null;
  ratedAmountCents: number | null;
};
let mockOffer: MockOffer | null = null;
let mockHeldProjectId: string | null = null;
/** HT-41 — the strip's role mark reads the viewer's live seats. */
let mockRateRoles: string[] = ['lead_designer'];

/** W3 — the strip's rate readout and role mark read the written row, so the
 *  offer fixture carries what the server stored. Defaults: the shape a
 *  fail-closed auto-timer produces on a project with no signed authority. */
const offerFixture = (over: Partial<MockOffer> = {}): MockOffer => ({
  projectId: 'whitfield-project',
  projectName: 'Whitfield House',
  suggestedMinutes: 26,
  rawSeconds: 1560,
  idleSeconds: 0,
  billable: false,
  hourlyRateCents: null,
  rateSource: 'none',
  rateRole: null,
  ratedAmountCents: null,
  ...over,
});

jest.mock('@patina/supabase', () => ({
  useMyRateRoles: () => ({ data: mockRateRoles }),
}));

// D-B54 — the cross-project rule moved into the provider, which publishes it
// as one boolean both edge tenants read (`mobile-bar.tsx` yields on exactly
// this). The stub calls the provider's OWN exported rule rather than copying
// it: a re-derived formula in a mock asserts the mock.
jest.mock('@/hooks/document-time-provider', () => {
  const actual = jest.requireActual('@/hooks/document-time-provider');
  return {
    useDocumentTime: () => ({
      offer: mockOffer,
      offerOwnsEdge: actual.offerOwnsThumbEdge(mockOffer, mockHeldProjectId),
      logOffer: mockLogOffer,
      discardOffer: mockDiscardOffer,
    }),
  };
});

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
    mockRateRoles = ['lead_designer'];
    mockLogOffer.mockClear();
    mockDiscardOffer.mockClear();
  });

  it('becomes the mobile edge owner with readable, full-size form controls', async () => {
    mockOffer = offerFixture();
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
    mockOffer = offerFixture();
    render(<LogStrip />);

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Minutes to log' }),
      {
        target: { value: '31' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    // HT-24 — the activity is NOT defaulted to 'design' any more, and HT-11
    // puts the billable answer on the wire from the pill rather than leaving
    // it to a `?? true` two layers down.
    await waitFor(() =>
      expect(mockLogOffer).toHaveBeenCalledWith(31, null, false),
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
    mockOffer = offerFixture({
      projectId: 'ashford-project',
      projectName: 'Ashford Heights — main floor refresh',
      suggestedMinutes: 32,
      rawSeconds: 32 * 60,
    });

    render(<LogStrip />);

    expect(screen.queryByRole('region', { name: 'Log time offer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ashford Heights — main floor refresh')).not.toBeInTheDocument();
  });

  it('resurfaces the saved offer when no different project is in hand', () => {
    mockOffer = offerFixture({
      projectId: 'ashford-project',
      projectName: 'Ashford Heights — main floor refresh',
      suggestedMinutes: 32,
      rawSeconds: 32 * 60,
    });

    render(<LogStrip />);

    expect(screen.getByRole('region', { name: 'Log time offer' })).toBeVisible();
    expect(screen.getByText('Ashford Heights — main floor refresh')).toBeVisible();
  });

  // ── W3 ────────────────────────────────────────────────────────────────────

  it('starts with the activity UNSET and offers "activity not set" (HT-24)', () => {
    mockOffer = offerFixture();
    render(<LogStrip />);

    const activity = screen.getByRole('combobox', { name: 'Activity' });
    expect(activity).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'activity not set' }),
    ).toBeInTheDocument();
  });

  it('seeds the billable pill from the row the server wrote, and never from true (HT-11)', () => {
    mockOffer = offerFixture({ billable: false });
    render(<LogStrip />);

    const pill = screen.getByRole('button', { name: /Non-billable/ });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
  });

  it('prints the resolved rate, and "rate pending" rather than a blank (HT-26)', () => {
    mockOffer = offerFixture({ rateSource: 'none', hourlyRateCents: null, billable: true });
    render(<LogStrip />);

    expect(screen.getByText(/rate pending/)).toBeInTheDocument();
  });

  it('prints the rate and amount the server stored when the hour is priced', () => {
    mockOffer = offerFixture({
      billable: true,
      rateSource: 'studio_member',
      hourlyRateCents: 18000,
      ratedAmountCents: 7800,
    });
    render(<LogStrip />);

    expect(screen.getByText(/Studio rate/)).toBeInTheDocument();
    expect(screen.getByText(/\$180/)).toBeInTheDocument();
  });

  it('names the role only for a member who holds more than one seat (HT-41)', () => {
    mockRateRoles = ['lead_designer'];
    mockOffer = offerFixture({ rateRole: 'lead_designer' });
    const single = render(<LogStrip />);
    expect(screen.queryByText(/as lead designer/)).not.toBeInTheDocument();
    single.unmount();

    mockRateRoles = ['lead_designer', 'bookkeeper'];
    mockOffer = offerFixture({ rateRole: 'bookkeeper' });
    render(<LogStrip />);
    expect(screen.getByText(/as bookkeeper/)).toBeInTheDocument();
  });

  it('logs the pill answer the designer actually chose', async () => {
    mockOffer = offerFixture({ billable: false });
    render(<LogStrip />);

    fireEvent.click(screen.getByRole('button', { name: /Non-billable/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Log' }));

    await waitFor(() =>
      expect(mockLogOffer).toHaveBeenCalledWith(26, null, true),
    );
  });

  it('keeps the zero-tap path zero — Log works with nothing touched', async () => {
    mockOffer = offerFixture();
    render(<LogStrip />);

    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() =>
      expect(mockLogOffer).toHaveBeenCalledWith(26, null, false),
    );
  });
});
