import { render, screen } from '@testing-library/react';
import { createServiceClient } from '@patina/supabase/server';
import PaperworkPage from '../page';

jest.mock('@patina/supabase/server', () => ({ createServiceClient: jest.fn() }));
// A plain function, not a jest.fn: this config sets `resetMocks`, which would
// strip a mock implementation declared here before the first test runs.
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.7' }),
}));
jest.mock('@/components/paperwork/paperwork-sheet', () => ({
  PaperworkSheet: ({ studioName }: { studioName: string }) => (
    <div data-testid="paperwork-sheet">{studioName}</div>
  ),
}));

const TOKEN = 'a'.repeat(64);

const CONTEXT = {
  studio_name: 'Local Dev Studio',
  company_name: 'Twin Cities Drywall & Plaster',
  expires_at: '2026-10-15T19:03:15.870504+00:00',
  documents: [],
};

/** rpc() answers per function name, so the rate bucket and the resolve differ. */
function mockRpc(answers: Record<string, { data: unknown; error?: unknown }>) {
  const rpc = jest.fn(async (name: string) => ({
    data: answers[name]?.data ?? null,
    error: answers[name]?.error ?? null,
  }));
  (createServiceClient as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

describe('/paperwork/[token]', () => {
  it('dies into the dead sheet for a malformed token, before any round-trip', async () => {
    mockRpc({});
    render(await PaperworkPage({ params: Promise.resolve({ token: 'not-a-token' }) }));
    expect(screen.getByTestId('paperwork-dead-link')).toBeInTheDocument();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('draws the firm its paperwork under the studio name', async () => {
    mockRpc({
      paperwork_link_rate_limit_hit: { data: true },
      resolve_paperwork_link: { data: CONTEXT },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));

    expect(
      screen.getByRole('heading', { name: 'Paperwork for Local Dev Studio' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Twin Cities Drywall & Plaster')).toBeInTheDocument();
    expect(screen.getByTestId('paperwork-sheet')).toHaveTextContent('Local Dev Studio');
  });

  it('resolves by raw token and bumps the shared rate bucket with the caller address', async () => {
    const rpc = mockRpc({
      paperwork_link_rate_limit_hit: { data: true },
      resolve_paperwork_link: { data: CONTEXT },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));

    expect(rpc).toHaveBeenCalledWith('paperwork_link_rate_limit_hit', {
      p_ip: '203.0.113.7',
      p_token: TOKEN,
    });
    expect(rpc).toHaveBeenCalledWith('resolve_paperwork_link', { p_token: TOKEN });
  });

  // W4 r2 MAJOR-4: one calm sheet for every miss. It says the link is closed
  // and who can open another, and it names no firm, no studio, no paper and no
  // destination — so the four misses stay indistinguishable from each other.
  it.each([
    ['a revoked or expired link', { data: null }],
    ['an unknown link', { data: null }],
    ['a read that failed', { data: null, error: { message: 'boom' } }],
  ])('hands %s the same dead sheet, telling a guesser nothing', async (_name, answer) => {
    mockRpc({
      paperwork_link_rate_limit_hit: { data: true },
      resolve_paperwork_link: answer,
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));

    const sheet = screen.getByTestId('paperwork-dead-link');
    expect(sheet).toHaveTextContent('This link isn’t available');
    expect(sheet).toHaveTextContent('The studio that sent it can open a new one.');
    // No firm, no studio, no paper, and no act pointing anywhere.
    expect(sheet).not.toHaveTextContent('Twin Cities');
    expect(sheet).not.toHaveTextContent('Local Dev Studio');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('stops a caller over the shared bucket without resolving the token', async () => {
    const rpc = mockRpc({
      paperwork_link_rate_limit_hit: { data: false },
      resolve_paperwork_link: { data: CONTEXT },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));

    expect(
      screen.getByRole('heading', { name: 'Too many tries just now.' }),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('resolve_paperwork_link', expect.anything());
  });

  // R-CA (W4 r10 MAJOR-2): THE DOOR FAILS CLOSED. This used to let the request
  // through, which made the limiter optional for anyone who could make it
  // fail — and on a door whose caller writes `cf-connecting-ip`, that was
  // everyone: one malformed header raised 22P02 inside the old `inet`
  // parameter and the error read as "within limit".
  it('refuses the request when the limiter itself cannot be read', async () => {
    const rpc = mockRpc({
      paperwork_link_rate_limit_hit: { data: null, error: { message: 'down' } },
      resolve_paperwork_link: { data: CONTEXT },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(
      screen.getByRole('heading', { name: 'Too many tries just now.' }),
    ).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('resolve_paperwork_link', expect.anything());
  });

  it('unwraps a single-row answer and names the studio when the row does not', async () => {
    mockRpc({
      paperwork_link_rate_limit_hit: { data: true },
      resolve_paperwork_link: { data: [{ ...CONTEXT, studio_name: '  ' }] },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(
      screen.getByRole('heading', { name: 'Paperwork for the studio' }),
    ).toBeInTheDocument();
  });
});
