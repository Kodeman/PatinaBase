import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectParty } from '@patina/supabase';
import { PromoteBand } from '../promote-band';

const mutateAsync = jest.fn();
const promoteState = { isPending: false, isError: false, error: null as unknown };

jest.mock('@patina/supabase', () => ({
  usePromoteToStudioContact: () => ({
    mutateAsync,
    isPending: promoteState.isPending,
    isError: promoteState.isError,
    error: promoteState.error,
  }),
}));

const PARTY: ProjectParty = {
  id: 'party-1',
  project_id: 'project-1',
  party_kind: 'sub',
  display_name: 'Rosa Martínez',
  company_name: 'Martínez Tile Works',
  email: null,
  phone: '5551234567',
  phone_e164: '+15551234567',
  trade: 'tile',
  sms_consent_status: 'granted',
  sms_consented_at: null,
  sms_opt_out_at: null,
  vendor_id: null,
  profile_id: null,
  studio_contact_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ id: 'contact-1' });
  promoteState.isPending = false;
  promoteState.isError = false;
  promoteState.error = null;
});

describe('PromoteBand — state A (before)', () => {
  it('reads "not in the rolodex yet" with the scored promote word', () => {
    render(<PromoteBand organizationId="org-1" party={PARTY} promoted={false} />);
    expect(screen.getByText(/Not in the studio rolodex yet/)).toBeInTheDocument();
    expect(screen.getByText('Add to the rolodex')).toBeInTheDocument();
  });

  it('calls the promote mutation with the org and the full party, then reports success', async () => {
    const onPromoted = jest.fn();
    render(
      <PromoteBand organizationId="org-1" party={PARTY} promoted={false} onPromoted={onPromoted} />,
    );

    fireEvent.click(screen.getByText('Add to the rolodex'));

    expect(mutateAsync).toHaveBeenCalledWith({ organizationId: 'org-1', party: PARTY });
    await waitFor(() => expect(onPromoted).toHaveBeenCalledTimes(1));
  });
});

describe('PromoteBand — state B (after) swaps IN PLACE', () => {
  it('the confirmation renders in the same band region, no promote word left', () => {
    render(<PromoteBand organizationId="org-1" party={PARTY} promoted={true} />);
    expect(
      screen.getByText('In the rolodex — the whole studio can find them now.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Add to the rolodex')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not in the studio rolodex yet/)).not.toBeInTheDocument();
  });

  it('is an inline status region, not a toast', () => {
    render(<PromoteBand organizationId="org-1" party={PARTY} promoted={true} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('In the rolodex');
    // R83 — the app's actual toast idiom carries `data-people-status` and is
    // `fixed`-positioned (people-room.tsx); the band carries neither.
    expect(document.querySelector('[data-people-status]')).toBeNull();
  });
});

describe('PromoteBand — error surfaces inline, not as a toast', () => {
  it('renders the mutation error text beside the promote word', () => {
    promoteState.isError = true;
    promoteState.error = new Error('Could not add them to the rolodex just now.');
    render(<PromoteBand organizationId="org-1" party={PARTY} promoted={false} />);
    expect(
      screen.getByText('Could not add them to the rolodex just now.'),
    ).toBeInTheDocument();
  });
});
