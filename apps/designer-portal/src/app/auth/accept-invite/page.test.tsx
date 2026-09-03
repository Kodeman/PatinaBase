/**
 * Accept-invite heading (L8). The `accept_workspace_invitation` RPC (00295)
 * returns `organization_name` — this page's success heading names it. The
 * "You're in — {studio}." phrasing is gated behind `onboarding-teammate-persona`
 * (W2): flag off, or still loading, must reproduce today's exact
 * "Welcome to {studio}." heading.
 */
import { act, render, screen } from '@testing-library/react';
import AcceptInvitePage from './page';

let mockFlagValue = false;
let mockFlagLoading = false;
const mockMutate = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('token=tok-1'),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'session' } } }),
    },
  }),
  useAcceptInvitation: () => ({ mutate: mockMutate }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: mockFlagValue, isLoading: mockFlagLoading }),
}));

jest.mock('@/lib/analytics/studio-events', () => ({
  studioEvents: { invitationAccepted: jest.fn() },
}));

jest.mock('@/components/ui/strata-sweep', () => ({
  StrataSweep: () => null,
}));

jest.mock('../auth-shell', () => ({
  DesignerAuthShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFlagValue = false;
  mockFlagLoading = false;
});

function triggerAcceptSuccess(organizationName: string) {
  act(() => {
    mockMutate.mock.calls[0][1].onSuccess({
      organization_id: 'org-1',
      organization_name: organizationName,
    });
  });
}

describe('Accept-invite heading — onboarding-teammate-persona gate', () => {
  it('shows today\'s "Welcome to {studio}." heading when the flag is off', async () => {
    render(<AcceptInvitePage />);
    await screen.findByText('Joining your studio…');
    triggerAcceptSuccess('Leah Warner Interiors');

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to Leah Warner Interiors.',
      }),
    ).toBeInTheDocument();
  });

  it('shows today\'s heading while the flag is still loading, never the new copy', async () => {
    mockFlagLoading = true;
    render(<AcceptInvitePage />);
    await screen.findByText('Joining your studio…');
    triggerAcceptSuccess('Leah Warner Interiors');

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to Leah Warner Interiors.',
      }),
    ).toBeInTheDocument();
  });

  it('shows "You\'re in — {studio}." when the flag is on', async () => {
    mockFlagValue = true;
    render(<AcceptInvitePage />);
    await screen.findByText('Joining your studio…');
    triggerAcceptSuccess('Leah Warner Interiors');

    expect(
      await screen.findByRole('heading', {
        name: "You're in — Leah Warner Interiors.",
      }),
    ).toBeInTheDocument();
  });
});
