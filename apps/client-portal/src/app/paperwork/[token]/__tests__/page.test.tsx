import { render, screen } from '@testing-library/react';
import { createServiceClient } from '@patina/supabase/server';
import PaperworkPage from '../page';

jest.mock('@patina/supabase/server', () => ({ createServiceClient: jest.fn() }));
// A plain function, not a jest.fn: this config sets `resetMocks`, which would
// strip a mock implementation declared here before the first test runs.
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.7' }),
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
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
  it('404s a malformed token before any round-trip', async () => {
    mockRpc({});
    await expect(
      PaperworkPage({ params: Promise.resolve({ token: 'not-a-token' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
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
    });
    expect(rpc).toHaveBeenCalledWith('resolve_paperwork_link', { p_token: TOKEN });
  });

  it.each([
    ['a revoked or expired link', { data: null }],
    ['an unknown link', { data: null }],
    ['a read that failed', { data: null, error: { message: 'boom' } }],
  ])('404s %s, telling a guesser nothing', async (_name, answer) => {
    mockRpc({
      paperwork_link_rate_limit_hit: { data: true },
      resolve_paperwork_link: answer,
    });
    await expect(
      PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
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

  it('lets the request through when the limiter itself cannot be read', async () => {
    mockRpc({
      paperwork_link_rate_limit_hit: { data: null, error: { message: 'down' } },
      resolve_paperwork_link: { data: CONTEXT },
    });
    render(await PaperworkPage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(screen.getByTestId('paperwork-sheet')).toBeInTheDocument();
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
