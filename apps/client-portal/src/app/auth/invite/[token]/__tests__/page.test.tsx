import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import InvitePage from '../page';

const maybeSingle = jest.fn();
const rpc = jest.fn();
jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc,
  }),
}));

const ROW = {
  id: 'i1',
  token: 'tok1',
  email: 'dave@okonkwo.net',
  kind: 'invite',
  recipient_name: 'Dave Okonkwo',
  studio_name: 'Middle West Studio',
  studio_logo_url: null,
  signature_city: 'Madison',
  designer_full_name: 'Leah Hartwell',
  designer_given_name: 'Leah',
  project_name: 'Van Hise kitchen and back hall',
  rendered_standing_sentence:
    'Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September.',
  personal_message: 'Dave — the drawings are in.',
  sent_at: '2026-09-08T14:00:00.000Z',
  expires_at: '2099-01-01T00:00:00.000Z',
  accepted_at: null,
  revoked_at: null,
  superseded_by: null,
};

async function renderPage(row: unknown) {
  maybeSingle.mockResolvedValue({ data: row });
  // A mailed token that resolves answers before any capability is asked about;
  // one that does not falls through to a capability nobody minted.
  rpc.mockResolvedValue({ data: null });
  const ui = await InvitePage({ params: Promise.resolve({ token: 'tok1' }) });
  render(ui as ReactElement);
}

/**
 * P21 — the texted homeowner. Her token is not in the table at all (only its
 * sha256 is), so the first read misses and `resolve_client_link` is the only
 * thing that can name her letter; the second read is that letter, by id.
 */
async function renderCapability(
  row: unknown,
  resolved: unknown = { invitation_id: 'i1' },
) {
  maybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: row });
  rpc.mockResolvedValue({ data: resolved });
  const ui = await InvitePage({ params: Promise.resolve({ token: 'cap-token' }) });
  render(ui as ReactElement);
}

it('renders page two of the letter from the snapshot alone', async () => {
  await renderPage(ROW);
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE WEST STUDIO');
  expect(screen.getByTestId('letter-standing')).toHaveTextContent(
    ROW.rendered_standing_sentence,
  );
  expect(screen.getByRole('button', { name: 'Open the project' })).toBeInTheDocument();
});

it('never reads a live profile, project or organization row', async () => {
  await renderPage(ROW);
  // One query — client_invitations — and nothing else. If the page ever grows a
  // second read, the email and the page can disagree again.
  expect(maybeSingle).toHaveBeenCalledTimes(1);
});

it('names the button for a letter with no project', async () => {
  await renderPage({ ...ROW, project_name: null });
  expect(screen.getByRole('button', { name: 'Open the page' })).toBeInTheDocument();
});

it('R10 — a lapsed letter offers one tap, not an apology', async () => {
  await renderPage({ ...ROW, expires_at: '2020-01-01T00:00:00.000Z' });
  expect(screen.getByText("This letter’s gone stale.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send a fresh letter' })).toBeInTheDocument();
});

it('an already-opened letter says so and points at the front door', async () => {
  await renderPage({ ...ROW, accepted_at: '2026-09-09T00:00:00.000Z' });
  expect(screen.getByText('This letter has already been opened.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin');
});

it('a revoked or superseded token says only what a lapsed one says', async () => {
  await renderPage({ ...ROW, revoked_at: '2026-09-09T00:00:00.000Z' });
  expect(screen.getByText("This letter’s gone stale.")).toBeInTheDocument();
  expect(screen.queryByTestId('letter-letterhead')).toBeNull();
});

it('an unknown token says nothing about whether it ever existed', async () => {
  await renderPage(null);
  expect(screen.getByText("This letter’s gone stale.")).toBeInTheDocument();
});

it('P21 — a capability is not asked about while the mailed token answers', async () => {
  await renderPage(ROW);
  expect(rpc).not.toHaveBeenCalled();
});

it('P21 — a texted capability opens the same letter, word for word', async () => {
  await renderCapability(ROW);
  expect(rpc).toHaveBeenCalledWith('resolve_client_link', {
    p_token: 'cap-token',
    p_action: 'open',
    p_source: 'client_portal',
  });
  // The SAME frozen snapshot, not a second rendering of it.
  expect(screen.getByTestId('letter-letterhead')).toHaveTextContent('MIDDLE WEST STUDIO');
  expect(screen.getByTestId('letter-standing')).toHaveTextContent(
    ROW.rendered_standing_sentence,
  );
  // And no session on offer: the email letter's button is not here.
  expect(screen.getByRole('button', { name: 'Let them know I have it' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open the project' })).toBeNull();
});

it('P21 — a capability that resolves to nothing says only what a lapsed one says', async () => {
  await renderCapability(ROW, null);
  expect(screen.getByText('This letter’s gone stale.')).toBeInTheDocument();
  expect(screen.queryByTestId('letter-letterhead')).toBeNull();
});

/**
 * SQ-108 LOW-4 — THE LAPSED CAPABILITY'S ONE TAP.
 *
 * A homeowner reached by text has no account and no portal to ask anything in;
 * this button is the whole of what she can do when her 90 days run out. It must
 * carry the token SHE holds — the capability, not a mailed token she was never
 * sent — because that string is all the refresh leg has to find her letter by
 * (client_link_refresh_target, 00654). Keyed on anything else, the tap answers
 * "a fresh letter is on its way" and re-mints nothing.
 */
describe('P21 — the lapsed capability taps for a fresh letter', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  it('posts the capability token she holds to the refresh leg', async () => {
    // Her capability is dead, so resolve_client_link answers NULL and the page
    // falls through to the bare stale door — the same door an unknown token gets.
    maybeSingle.mockResolvedValue({ data: null });
    rpc.mockResolvedValue({ data: null });
    const ui = await InvitePage({ params: Promise.resolve({ token: 'lapsed-cap-token' }) });
    render(ui as ReactElement);

    fireEvent.click(screen.getByRole('button', { name: 'Send a fresh letter' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/auth/invite/refresh');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: 'lapsed-cap-token' });

    // And she is told the same thing whatever the token was: this page is no
    // oracle for which tokens are real.
    expect(await screen.findByText('A fresh letter is on its way.')).toBeInTheDocument();
  });

  it('asks once, however many times she taps', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    rpc.mockResolvedValue({ data: null });
    const ui = await InvitePage({ params: Promise.resolve({ token: 'lapsed-cap-token' }) });
    render(ui as ReactElement);

    const button = screen.getByRole('button', { name: 'Send a fresh letter' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it('never puts a mailed token in her hand — the refresh carries hers alone', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    rpc.mockResolvedValue({ data: null });
    const ui = await InvitePage({ params: Promise.resolve({ token: 'lapsed-cap-token' }) });
    const { container } = render(ui as ReactElement);

    // The page printed no snapshot and no other token: the only string it holds
    // is the one she arrived with.
    expect(container.innerHTML).not.toContain('tok1');
    expect(screen.queryByTestId('letter-letterhead')).toBeNull();
  });
});

it('P21 — a letter already opened still opens for the capability holder', async () => {
  await renderCapability({ ...ROW, accepted_at: '2026-09-09T00:00:00.000Z' });
  expect(screen.queryByText('This letter has already been opened.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Let them know I have it' })).toBeInTheDocument();
});

it('P21 — the mailed token’s seven days do not lapse a capability', async () => {
  await renderCapability({ ...ROW, expires_at: '2020-01-01T00:00:00.000Z' });
  expect(screen.queryByRole('button', { name: 'Send a fresh letter' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Let them know I have it' })).toBeInTheDocument();
});

it('R13 — a notice opens the house directly, with nothing to accept', async () => {
  await renderPage({ ...ROW, kind: 'notice', accepted_at: '2026-09-08T14:00:00.000Z' });
  expect(screen.getByRole('link', { name: 'Open the project' })).toBeInTheDocument();
  expect(screen.queryByTestId('letter-expiry')).toBeNull();
});
