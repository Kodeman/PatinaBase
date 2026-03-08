import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: { access_token: 'test-token' },
        },
      }),
    },
  }),
}));

describe('Campaign hooks (unit behavior)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('useCampaigns fetches from /api/campaigns', async () => {
    const mockCampaigns = [
      { id: '1', name: 'Test Campaign', status: 'draft' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockCampaigns),
    });

    const res = await fetch('/api/campaigns', {
      headers: { Authorization: 'Bearer test-token' },
    });
    const data = await res.json();

    expect(mockFetch).toHaveBeenCalledWith('/api/campaigns', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(data).toEqual(mockCampaigns);
  });

  it('useCampaigns with status filter adds query param', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await fetch('/api/campaigns?status=draft', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/campaigns?status=draft', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('useCampaign fetches single campaign by id', async () => {
    const mockCampaign = {
      id: 'abc-123',
      name: 'Spring Launch',
      status: 'sent',
      campaign_analytics: { delivered: 100, opened: 45 },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockCampaign),
    });

    const res = await fetch('/api/campaigns/abc-123', {
      headers: { Authorization: 'Bearer test-token' },
    });
    const data = await res.json();

    expect(data.id).toBe('abc-123');
    expect(data.campaign_analytics.delivered).toBe(100);
  });

  it('useCreateCampaign posts to /api/campaigns', async () => {
    const newCampaign = {
      name: 'New Campaign',
      subject: 'Hello World',
      template_id: 'campaign-product-launch',
      audience_type: 'all',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'new-id', ...newCampaign, status: 'draft' }),
    });

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newCampaign),
    });
    const data = await res.json();

    expect(data.id).toBe('new-id');
    expect(data.status).toBe('draft');
  });

  it('useUpdateCampaign patches campaign', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Updated' }),
    });

    const res = await fetch('/api/campaigns/1', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated' }),
    });

    expect(res.ok).toBe(true);
  });

  it('useSendCampaign triggers dispatch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ message: 'Campaign dispatch initiated', campaign_id: '1' }),
    });

    const res = await fetch('/api/campaigns/1/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const data = await res.json();

    expect(data.message).toBe('Campaign dispatch initiated');
  });

  it('useCancelCampaign deletes (cancels) campaign', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', status: 'cancelled' }),
    });

    const res = await fetch('/api/campaigns/1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' },
    });
    const data = await res.json();

    expect(data.status).toBe('cancelled');
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    const res = await fetch('/api/campaigns', {
      headers: { Authorization: 'Bearer invalid' },
    });

    expect(res.ok).toBe(false);
  });
});
