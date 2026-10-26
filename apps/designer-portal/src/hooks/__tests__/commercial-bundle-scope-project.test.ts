const from = jest.fn();
jest.mock('@patina/supabase', () => ({ createBrowserClient: () => ({ from }) }));
import { fetchCommercialDocumentBundle } from '../use-commercial-documents';

function stub(projectId: string | null, link: { project_id: string } | null, error: unknown = null) {
  const proposal = { id: 'addendum-1', project_id: projectId, document_kind: 'service_addendum', commercial_state: 'draft', title: 'Fictional addendum' };
  const queries: Array<[string, string, unknown]> = [];
  from.mockImplementation((table: string) => {
    const result = { data: table === 'proposals' ? proposal : table === 'project_commercial_documents' ? link : null,
      error: table === 'project_commercial_documents' ? error : null };
    const chain: any = {
      select: (columns: string) => { queries.push([table, 'select', columns]); return chain; },
      eq: (column: string, value: string) => { queries.push([table, column, value]); return chain; },
      order: () => chain, single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  });
  return { proposal, queries };
}
beforeEach(() => jest.clearAllMocks());

describe('commercial bundle scope project identity (#207)', () => {
  it('resolves a NULL-project addendum through only its own commercial document link without mutating the proposal', async () => {
    const { proposal, queries } = stub(null, { project_id: 'linked-job' });
    const before = { ...proposal };
    expect((await fetchCommercialDocumentBundle('addendum-1')).document.projectId).toBe('linked-job');
    expect(proposal).toEqual(before);
    expect(queries.filter(row => row[0] === 'project_commercial_documents')).toEqual([
      ['project_commercial_documents', 'select', 'project_id'],
      ['project_commercial_documents', 'proposal_id', 'addendum-1'],
    ]);
    expect(from.mock.calls.map(([table]) => table)).not.toContain('projects');
  });
  it('keeps the native proposal project path and precedence unchanged', async () => {
    const { proposal } = stub('native-job', { project_id: 'different-job' });
    expect((await fetchCommercialDocumentBundle('addendum-1')).document.projectId).toBe('native-job');
    expect(from).not.toHaveBeenCalledWith('project_commercial_documents');
    expect(proposal.project_id).toBe('native-job');
  });
  it('leaves a document with no link project-less for the typed unavailable reading', async () => {
    stub(null, null);
    expect((await fetchCommercialDocumentBundle('addendum-1')).document.projectId).toBeNull();
    expect(from.mock.calls.map(([table]) => table)).not.toContain('projects');
  });
  it('propagates a failed link read rather than inventing absence', async () => {
    const error = { message: 'read refused' };
    stub(null, null, error);
    await expect(fetchCommercialDocumentBundle('addendum-1')).rejects.toBe(error);
  });
});
