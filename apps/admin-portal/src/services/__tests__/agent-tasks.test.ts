import { agentTasksService } from '@/services/agent-tasks';

const fetchMock = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = fetchMock as any;

function okJson(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('agentTasksService.list', () => {
  it('hits the bare endpoint with no filters', async () => {
    fetchMock.mockResolvedValue(okJson([]));
    await agentTasksService.list();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/agent-tasks');
  });

  it('builds the query string from filters in a stable order', async () => {
    fetchMock.mockResolvedValue(okJson([]));
    await agentTasksService.list({ status: 'awaiting_review', assignee: 'leah', taskType: 'vendor_qualification', limit: 25 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/admin/agent-tasks?status=awaiting_review&assignee=leah&task_type=vendor_qualification&limit=25',
    );
  });

  it('unwraps json.data', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    fetchMock.mockResolvedValue(okJson(rows));
    await expect(agentTasksService.list()).resolves.toEqual(rows);
  });
});

describe('agentTasksService.get', () => {
  it('requests the id-scoped endpoint', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'x1' }));
    await agentTasksService.get('x1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/agent-tasks/x1');
  });
});

describe('agentTasksService.review', () => {
  it('POSTs the decision payload with normalized nulls', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'x1', status: 'rejected' }));
    await agentTasksService.review({ id: 'x1', decision: 'rejected', note: 'nope' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/agent-tasks/x1/review');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      decision: 'rejected',
      note: 'nope',
      payloadPatch: null,
      reviewMeta: null,
    });
  });

  it('forwards payloadPatch and reviewMeta when provided', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'x1' }));
    await agentTasksService.review({
      id: 'x1',
      decision: 'approved',
      payloadPatch: { a: 1 },
      reviewMeta: { brand_score: 200, rubric_max: 250 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payloadPatch).toEqual({ a: 1 });
    expect(body.reviewMeta).toEqual({ brand_score: 200, rubric_max: 250 });
    expect(body.note).toBeNull();
  });
});

describe('agentTasksService.stats', () => {
  it('requests the stats endpoint', async () => {
    fetchMock.mockResolvedValue(okJson([]));
    await agentTasksService.stats();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/agent-tasks/stats');
  });
});

describe('error surfacing', () => {
  it('throws the server-provided error message on a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'A rejection requires a note' }),
    });
    await expect(agentTasksService.review({ id: 'x1', decision: 'rejected' })).rejects.toThrow(
      'A rejection requires a note',
    );
  });

  it('falls back to a status-code message when the body has no error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    });
    await expect(agentTasksService.list()).rejects.toThrow('Request failed: 500');
  });
});
