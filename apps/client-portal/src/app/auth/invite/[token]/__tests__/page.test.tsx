import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import InvitePage from '../page';

const maybeSingle = jest.fn();
jest.mock('@patina/supabase/client', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
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
  const ui = await InvitePage({ params: Promise.resolve({ token: 'tok1' }) });
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

it('R13 — a notice opens the house directly, with nothing to accept', async () => {
  await renderPage({ ...ROW, kind: 'notice', accepted_at: '2026-09-08T14:00:00.000Z' });
  expect(screen.getByRole('link', { name: 'Open the project' })).toBeInTheDocument();
  expect(screen.queryByTestId('letter-expiry')).toBeNull();
});
