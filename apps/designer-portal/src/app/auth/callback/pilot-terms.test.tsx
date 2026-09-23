import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthCallbackPage from './page';

const DESIGNER_ID = 'a8f1d0c2-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

const NEW_PROFILE: Row = {
  created_at: '2026-09-23T16:00:00Z',
  pilot_terms_accepted_at: null,
  is_designer: true,
};

const INVITE_QUERY = 'code=pkce&next=%2Fdesk';

const updates: Array<{ table: string; values: Row }> = [];
const gateQueries: string[] = [];
let profileRow: Row | null = NEW_PROFILE;
let profileError: { message: string } | null = null;
let updateResult: { data: Row | null; error: { message: string } | null } = {
  data: { id: DESIGNER_ID },
  error: null,
};
let searchParamsQuery = INVITE_QUERY;
let callbackMethod = 'pkce';
let fragmentIsRecovery = false;

function fakeClient() {
  return {
    auth: {},
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              gateQueries.push(table);
              return Promise.resolve({ data: profileRow, error: profileError });
            },
          }),
        }),
        update: (values: Row) => {
          updates.push({ table, values });
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve(updateResult),
              }),
            }),
          };
        },
      };
    },
  };
}

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsQuery),
}));

jest.mock('@patina/supabase', () => ({
  buildSignInPath: jest.requireActual('@patina/supabase/auth').buildSignInPath,
  safeAuthReturnPath: jest.requireActual('@patina/supabase/auth')
    .safeAuthReturnPath,
  consumeAuthCallbackFragment: () => ({
    isRecovery: fragmentIsRecovery,
    oauthError: null,
  }),
  createBrowserClient: () => fakeClient(),
  finalizeAuthCallback: () =>
    Promise.resolve({
      status: 'authenticated',
      session: { access_token: 'session', user: { id: DESIGNER_ID } },
      method: callbackMethod,
    }),
  normalizeOAuthCallbackError: jest.requireActual('@patina/supabase/auth')
    .normalizeOAuthCallbackError,
  recoveryFinalReturnPath: jest.requireActual('@patina/supabase/auth')
    .recoveryFinalReturnPath,
}));

const acceptButton = { name: 'Accept and open the desk' };

describe('Pilot terms on the designer-invite leg', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { replace, href: 'http://localhost/auth/callback' },
    });
  });

  beforeEach(() => {
    updates.length = 0;
    gateQueries.length = 0;
    replace.mockClear();
    profileRow = NEW_PROFILE;
    profileError = null;
    updateResult = { data: { id: DESIGNER_ID }, error: null };
    searchParamsQuery = INVITE_QUERY;
    callbackMethod = 'pkce';
    fragmentIsRecovery = false;
  });

  it('shows the step to a new designer and records both columns on accept', async () => {
    render(<AuthCallbackPage />);

    const accept = await screen.findByRole('button', acceptButton);
    expect(
      screen.getByRole('heading', { name: 'Before your desk opens.' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('link', {
        name: 'Read the pilot terms (opens in a new tab)',
      }),
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
      is_designer: true,
    };
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(updates).toHaveLength(0);
  });

  it('recovery never shows the step', async () => {
    searchParamsQuery = 'type=recovery&code=pkce&next=%2Fdesk';
    callbackMethod = 'recovery-token';
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(gateQueries).toHaveLength(0);
    expect(updates).toHaveLength(0);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/auth/reset-password'),
    );
  });

  it('an existing-session callback never shows the step', async () => {
    searchParamsQuery = 'next=%2Fdesk';
    callbackMethod = 'existing-session';
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(gateQueries).toHaveLength(0);
    expect(updates).toHaveLength(0);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/desk'));
  });

  it('an already-accepted profile skips the step', async () => {
    profileRow = {
      created_at: '2026-09-23T16:00:00Z',
      pilot_terms_accepted_at: '2026-09-23T17:00:00Z',
      is_designer: true,
    };
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(gateQueries).toEqual(['profiles']);
    expect(updates).toHaveLength(0);
  });

  it('a non-designer profile never shows the step', async () => {
    profileRow = {
      created_at: '2026-09-23T16:00:00Z',
      pilot_terms_accepted_at: null,
      is_designer: false,
    };
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(gateQueries).toEqual(['profiles']);
    expect(updates).toHaveLength(0);
  });

  it('a gate query error falls through to the desk', async () => {
    profileRow = null;
    profileError = { message: 'permission denied for table profiles' };
    render(<AuthCallbackPage />);

    expect(await screen.findByText('You’re signed in.')).toBeVisible();
    expect(screen.queryByRole('button', acceptButton)).not.toBeInTheDocument();
    expect(updates).toHaveLength(0);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/desk'));
  });

  it('a failed acceptance write keeps the designer on the step', async () => {
    // PostgREST answers a zero-row UPDATE with 204 and no error, which is the
    // shape the step must refuse to treat as an acceptance.
    updateResult = { data: null, error: null };
    render(<AuthCallbackPage />);

    const accept = await screen.findByRole('button', acceptButton);
    await userEvent.click(accept);
    // The rejection lands a tick after the click, so flush it inside act().
    await act(async () => {});

    expect(screen.getByText('That didn’t save. Try again.')).toBeVisible();
    expect(updates).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', acceptButton)).toBeEnabled();
  });
});
