/** @jest-environment node */
import { createServerClient, getUser } from '@patina/supabase/server';
import { POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
  getUser: jest.fn(),
}));

const mockCreateServerClient = createServerClient as jest.Mock;
const mockGetUser = getUser as jest.Mock;

describe('POST budget checkpoint acknowledgement', () => {
  const params = { params: Promise.resolve({ projectId: 'p1', checkpointId: 'c1' }) };

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ id: 'client-1' });
  });

  it('requires an authenticated client before reaching the RPC', async () => {
    mockGetUser.mockResolvedValue(null);
    const response = await POST(new Request('http://localhost'), params);
    expect(response.status).toBe(401);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it('passes only the checkpoint id to the nonbinding acknowledgement RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { checkpoint_id: 'c1', status: 'acknowledged', newly_acknowledged: true },
      error: null,
    });
    mockCreateServerClient.mockResolvedValue({ rpc });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ authorizePurchases: true, overrideReason: 'caller controlled' }),
    }), params);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('acknowledge_budget_checkpoint', { p_checkpoint_id: 'c1' });
    expect(await response.json()).toMatchObject({ checkpointId: 'c1', newlyAcknowledged: true });
  });
});
