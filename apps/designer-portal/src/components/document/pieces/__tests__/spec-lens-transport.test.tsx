import { render } from '@testing-library/react';
import { createClient } from '@supabase/supabase-js';

const mockQuery = jest.fn();
const mockIds = Array.from({ length: 2000 }, (_, i) => `e6591000-0000-4000-8000-${String(i).padStart(12, '0')}`);
const mockRequests: string[] = [];
let mockActive = 0;
let mockPeak = 0;
let mockRefuse = false;
const mockClient = createClient('http://127.0.0.1:54321', 'fixture-anon', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    mockRequests.push(url.toString()); mockActive++; mockPeak = Math.max(mockPeak, mockActive);
    await new Promise(resolve => setTimeout(resolve, 0));
    mockActive--;
    const specs = url.pathname.endsWith('project_ffe_specs');
    const filter = url.searchParams.get(specs ? 'ffe_item_id' : 'id')!;
    const ids = filter.slice(4, -1).split(',');
    const data = specs ? ids.map(id => ({ id: `spec-${id}`, ffe_item_id: id, finish: 'Oak' })) : ids.map(id => ({ id, need_label: `Need ${id}` }));
    return { ok: !mockRefuse, status: mockRefuse ? 403 : 200, statusText: mockRefuse ? 'Forbidden' : 'OK',
      headers: new Headers(), text: async () => JSON.stringify(mockRefuse ? { message: 'read refused' } : data) } as Response;
  }) as typeof fetch },
});
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => { mockQuery(options); return {}; },
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => mockClient,
  useProjectFFEItems: () => ({ data: mockIds.map(id => ({ id, name: id, selection_thread_id: id })) }),
  useProjectRoomPlacements: () => ({ data: [] }), useProjectLineGroups: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-document-rooms', () => ({ useDocumentRooms: () => ({ data: [] }) }));
jest.mock('../spec-fields-pane', () => ({ SpecFieldsPane: () => null, INKED_ACT_CLS: '' }));
jest.mock('../placement-chips', () => ({ AlsoInLine: () => null }));
import { SpecLens, specFieldRowsKey } from '../spec-lens';

beforeEach(() => { mockQuery.mockClear(); mockRequests.length = 0; mockActive = 0; mockPeak = 0; mockRefuse = false; });
function query() {
  render(<SpecLens docId="job" projectId="job" room={null} canSeeMoney={false} />);
  return mockQuery.mock.calls[0][0];
}
it('keeps every real serialized request below 8 KB and merges all 2000 specs and threads with at most four in flight', async () => {
  const options = query();
  const result = await options.queryFn();
  expect(Math.max(...mockRequests.map(url => new TextEncoder().encode(url).length))).toBeLessThan(8192);
  expect(mockPeak).toBeLessThanOrEqual(4);
  expect(Object.keys(result.specs).sort()).toEqual([...mockIds].sort());
  expect(Object.keys(result.needLabels).sort()).toEqual([...mockIds].sort());
  expect(result.specs[mockIds[1999]].finish).toBe('Oak');
  expect(result.needLabels[mockIds[1999]]).toBe(`Need ${mockIds[1999]}`);
  expect(options.queryKey).toEqual(specFieldRowsKey('job', [...mockIds].sort()));
});
it('rejects transport errors instead of returning partially merged field rows', async () => {
  mockRefuse = true;
  await expect(query().queryFn()).rejects.toMatchObject({ message: 'read refused' });
});
