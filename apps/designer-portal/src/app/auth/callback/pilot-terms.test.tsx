import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthCallbackPage from './page';

const DESIGNER_ID = 'a8f1d0c2-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

const NEW_PROFILE: Row = {
  created_at: '2026-09-23T16:00:00Z',
  pilot_terms_accepted_at: null,
};

const updates: Array<{ table: string; values: Row }> = [];
let profileRow: Row | null = NEW_PROFILE;

function fakeClient() {
  return {
    auth: {},
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: profileRow, error: null }),
        update: (values: Row) => {
          updates.push({ table, values });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return builder;
    },
  };
}

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('code=pkce&next=%2Fdesk'),
}));

jest.mock('@patina/supabase', () => ({
  buildSignInPath: jest.requireActual('@patina/supabase/auth').buildSignInPath,
  safeAuthReturnPath: jest.requireActual('@patina/supabase/auth')
    .safeAuthReturnPath,
  consumeAuthCallbackFragment: () => ({ isRecovery: false, oauthError: null }),
  createBrowserClient: () => fakeClient(),
  finalizeAuthCallback: () =>
    Promise.resolve({
      status: 'authenticated',
      session: { access_token: 'session', user: { id: DESIGNER_ID } },
      method: 'pkce',
    }),
  normalizeOAuthCallbackError: jest.requireActual('@patina/supabase/auth')
    .normalizeOAuthCallbackError,
  recoveryFinalReturnPath: jest.requireActual('@patina/supabase/auth')
    .recoveryFinalReturnPath,
}));

describe('Pilot terms on the designer-invite leg', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { replace, href: 'http://localhost/auth/callback' },
    });
  });

  beforeEach(() => {
    updates.length = 0;
    replace.mockClear();
    profileRow = NEW_PROFILE;
  });

  it('shows the step to a new designer and records both columns on accept', async () => {
    render(<AuthCallbackPage />);

    const accept = await screen.findByRole('button', {
      name: 'Accept and open the desk',
    });
    expect(
      screen.getByRole('link', { name: 'Read the pilot terms' }),
    ).toHaveAttribute('href', '/pilot-terms');

    await userEvent.click(accept);

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].table).toBe('profiles');
    expect(updates[0].values.pilot_terms_version).toBe('2026-09-free-90');
    expect(
      Number.isFinite(
        Date.parse(String(updates[0].values.pilot_terms_accepted_at)),
      ),
    ).toBe(true);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/desk'));
  });

  it('skips the step for a member whose profile predates the terms', async () => {
    profileRow = {
      created_at: '2026-08-01T12:00:00Z',
      pilot_terms_accepted_at: null,
    };
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Accept and open the desk' }),
    ).not.toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });
});
