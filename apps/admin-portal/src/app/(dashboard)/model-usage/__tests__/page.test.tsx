import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ModelUsageOverview } from '@/app/api/admin/model-usage/route';
import ModelUsagePage from '../page';

const overview: ModelUsageOverview = {
  controls: { killSwitch: false, globalDailyCapUsd: 25, studioMonthlyCapUsd: 50, updatedAt: '2026-10-13T00:00:00Z' },
  todayUsd: 1.5,
  monthUsd: 12.25,
  features: [
    { feature: 'aesthete-dna-draft', enabled: true, dailyCapUsd: 20, studioMonthlyCapUsd: null, todayUsd: 1.5, monthUsd: 12.25 },
    { feature: 'field-parse', enabled: false, dailyCapUsd: null, studioMonthlyCapUsd: null, todayUsd: 0, monthUsd: 0 },
    { feature: 'client-edition-compose', enabled: true, dailyCapUsd: 5, studioMonthlyCapUsd: null, todayUsd: 0.34, monthUsd: 0.34 },
  ],
  studios: [
    { studioId: '00000000-0000-0000-0000-0000000000aa', name: 'Leah Studio', monthUsd: 12.25, monthCalls: 40, hasOverride: false, overrideMonthlyCapUsd: null },
  ],
  audit: [
    { id: 7, at: '2026-10-13T10:00:00Z', actor: 'a1', actorEmail: 'ops@patina.cloud', target: 'controls', before: { kill_switch: true }, after: { kill_switch: false } },
  ],
  window: { dayStart: '2026-10-13T00:00:00Z', monthStart: '2026-10-01T00:00:00Z' },
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function setup() {
  const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return jsonResponse({ data: overview });
    }
    return jsonResponse({ data: { ok: true } });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ModelUsagePage />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('ModelUsagePage', () => {
  it('renders features, studio spend and recent changes as rows', async () => {
    setup();
    expect(await screen.findByText('aesthete-dna-draft')).toBeInTheDocument();
    expect(screen.getByText('field-parse')).toBeInTheDocument();
    expect(screen.getByText('Client page editions')).toBeInTheDocument();
    expect(screen.getByText('client-edition-compose')).toBeInTheDocument();
    expect(screen.getByText('Leah Studio')).toBeInTheDocument();
    expect(screen.getByText('ops@patina.cloud')).toBeInTheDocument();
    expect(screen.getByLabelText('aesthete-dna-draft daily cap in USD')).toHaveValue('20');
  });

  it('asks for confirmation before turning the kill switch on, then posts the switch alone, never the cap', async () => {
    const fetchMock = setup();
    fireEvent.click(await screen.findByLabelText('Kill switch'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Turn the kill switch on?')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/model-usage/controls', expect.anything());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/model-usage/controls',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ killSwitch: true }) }),
      ),
    );
  });

  it('posts only the global studio cap and uses null for a blank no-cap value', async () => {
    const fetchMock = setup();
    const input = await screen.findByLabelText('Per-studio monthly cap (all features) in USD');
    const row = input.closest('tr') as HTMLElement;
    const save = within(row).getByRole('button', { name: 'Save' });
    expect(input).toHaveValue('50');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/model-usage/controls',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ studioMonthlyCapUsd: null }) }),
      ),
    );
  });

  it('saves a studio override cap but never a blank one', async () => {
    const fetchMock = setup();
    const input = await screen.findByLabelText('Leah Studio monthly cap override in USD');
    const row = input.closest('tr') as HTMLElement;
    const save = within(row).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: '5' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/model-usage/studios/00000000-0000-0000-0000-0000000000aa',
        expect.objectContaining({ body: JSON.stringify({ monthlyCapUsd: 5 }) }),
      ),
    );
  });
});
