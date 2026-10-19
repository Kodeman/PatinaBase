import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjectPurchasingAgreement, useRecordProjectSignedAgreement } from '../use-project-purchasing-agreement';

const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockBucket = jest.fn(() => ({ upload: mockUpload }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ rpc: mockRpc, storage: { from: mockBucket } }),
}));
jest.mock('../use-commercial-documents', () => ({
  commercialDocumentKeys: { authority: (id: string) => ['project-authority', id] },
}));
const projectId = '83500000-0000-4000-8000-000000000100';
const key = `${projectId}/83500000-0000-4000-8000-000000000601.pdf`;
const evidence = { id: 'evidence', project_id: projectId, storage_key: key,
  signed_on: '2020-01-01', attested_by: 'author', attested_at: '2020-01-02' };
const file = new File(['%PDF-1.4'], 'synthetic.pdf', { type: 'application/pdf' });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true,
    value: () => '83500000-0000-4000-8000-000000000601' });
  mockUpload.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: evidence, error: null });
});

test('opening hooks does not upload or record; missing agreement is read project-bound', async () => {
  mockRpc.mockResolvedValue({ data: { state: 'missing', evidence: null }, error: null });
  const { wrapper } = setup();
  const query = renderHook(() => useProjectPurchasingAgreement(projectId), { wrapper });
  renderHook(() => useRecordProjectSignedAgreement(projectId), { wrapper });
  await waitFor(() => expect(query.result.current.isSuccess).toBe(true));
  expect(query.result.current.data?.state).toBe('missing');
  expect(mockRpc).toHaveBeenCalledWith('get_project_purchasing_agreement', { p_project_id: projectId });
  expect(mockUpload).not.toHaveBeenCalled();
});

test('query errors and mismatched external evidence fail closed', async () => {
  mockRpc.mockResolvedValue({ data: { state: 'external_recorded', evidence: { ...evidence, project_id: 'wrong' } }, error: null });
  const { wrapper } = setup();
  const query = renderHook(() => useProjectPurchasingAgreement(projectId), { wrapper });
  await waitFor(() => expect(query.result.current.isError).toBe(true));
  expect(query.result.current.data).toBeUndefined();
});

test('explicit record uploads privately without overwrite and invalidates eligibility after confirmed success', async () => {
  const { client, wrapper } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useRecordProjectSignedAgreement(projectId), { wrapper });
  await act(async () => { await result.current.mutateAsync({ file, signedOn: '2020-01-01', coversProject: true }); });
  expect(mockBucket).toHaveBeenCalledWith('project-agreements');
  expect(mockUpload).toHaveBeenCalledWith(key, file, { contentType: 'application/pdf', upsert: false });
  expect(mockRpc).toHaveBeenCalledWith('record_project_external_agreement_evidence', {
    p_project_id: projectId, p_storage_key: key, p_signed_on: '2020-01-01', p_covers_project: true,
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-purchasing-agreement', projectId] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-authority', projectId] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-ffe-items', projectId] });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

test('upload failure never records or invalidates', async () => {
  mockUpload.mockResolvedValue({ error: new Error('Upload refused') });
  const { client, wrapper } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useRecordProjectSignedAgreement(projectId), { wrapper });
  await act(async () => {
    await expect(result.current.mutateAsync({ file, signedOn: '2020-01-01', coversProject: true })).rejects.toThrow('Upload refused');
  });
  expect(mockRpc).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

test('record failure keeps the completed upload for an identical retry, never reports false success', async () => {
  mockRpc.mockResolvedValueOnce({ error: new Error('Record refused'), data: null });
  const { client, wrapper } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useRecordProjectSignedAgreement(projectId), { wrapper });
  const input = { file, signedOn: '2020-01-01', coversProject: true };
  await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Record refused'); });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => { await result.current.mutateAsync(input); });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test.each([
  ['not PDF', new File(['x'], 'x.txt', { type: 'text/plain' }), '2020-01-01', true],
  ['future date', file, '2999-01-01', true],
  ['missing date', file, '', true],
  ['false coverage', file, '2020-01-01', false],
] as const)('rejects %s before upload', async (_label, inputFile, signedOn, coversProject) => {
  const { wrapper } = setup();
  const { result } = renderHook(() => useRecordProjectSignedAgreement(projectId), { wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ file: inputFile, signedOn, coversProject })).rejects.toThrow(); });
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});
