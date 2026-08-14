const fromMock = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ from: fromMock }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

import { useDocumentEngagement } from '../use-document-state';

const ID = '11111111-1111-1111-1111-111111111111';
const CHAIN_ROOT_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';

/**
 * Chainable stub for `.from(table).select(...).or(...).limit(1)` (the primary
 * document_state read) and `.from('proposals').select(...).eq(...)` reads
 * (both the R6 leg and the J6 designer_client_id leg use this shape, keyed
 * off which columns are selected/filtered so tests can tell them apart).
 */
function stubTables(opts: {
  documentStateRows?: unknown[];
  r6ProjectId?: string | null;
  leadStatus?: string | null;
  designerClientsRow?: { id: string } | null;
  chainProposals?: Array<{
    id: string;
    parent_proposal_id: string | null;
    project_id: string | null;
    status: string;
  }>;
  decision?: { project_id: string | null; designer_client_id: string | null } | null;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'document_state') {
      return {
        select: () => ({
          or: () => ({
            limit: () => Promise.resolve({ data: opts.documentStateRows ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === 'proposals') {
      return {
        select: (cols: string) => {
          // R6 leg: .select('project_id').eq('id', id).maybeSingle()
          if (cols === 'project_id') {
            return {
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: opts.r6ProjectId !== undefined && opts.r6ProjectId !== null
                      ? { project_id: opts.r6ProjectId }
                      : null,
                    error: null,
                  }),
              }),
            };
          }
          // J6 leg: .select('id, parent_proposal_id, project_id, status').eq('designer_client_id', id)
          return {
            eq: () => Promise.resolve({ data: opts.chainProposals ?? [], error: null }),
          };
        },
      };
    }
    if (table === 'leads') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.leadStatus ? { id: ID, status: opts.leadStatus } : null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'designer_clients') {
      return {
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data: opts.designerClientsRow ? [opts.designerClientsRow] : [],
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'client_decisions') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.decision ?? null, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('useDocumentEngagement — J6 designer_client_id chain leg', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('redirects a pre-Direction relationship id to the live draft chain root', async () => {
    stubTables({
      documentStateRows: [],
      r6ProjectId: null,
      leadStatus: null,
      chainProposals: [
        { id: CHAIN_ROOT_ID, parent_proposal_id: null, project_id: null, status: 'draft' },
      ],
    });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string; projectId?: string }>;
    };
    const resolution = await query.queryFn();

    expect(resolution).toEqual({ kind: 'redirect', projectId: CHAIN_ROOT_ID });
  });

  it('redirects a pre-Direction relationship id to the chain root when the matched row is a later, non-root revision', async () => {
    stubTables({
      documentStateRows: [],
      r6ProjectId: null,
      leadStatus: null,
      chainProposals: [
        {
          id: 'revision-2',
          parent_proposal_id: CHAIN_ROOT_ID,
          project_id: null,
          status: 'sent',
        },
      ],
    });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string; projectId?: string }>;
    };
    const resolution = await query.queryFn();

    expect(resolution).toEqual({ kind: 'redirect', projectId: CHAIN_ROOT_ID });
  });

  it('redirects to the activated project when the chain has already signed, even if other rows are live', async () => {
    stubTables({
      documentStateRows: [],
      r6ProjectId: null,
      leadStatus: null,
      chainProposals: [
        { id: 'revision-1', parent_proposal_id: null, project_id: null, status: 'expired' },
        { id: 'revision-2', parent_proposal_id: 'revision-1', project_id: PROJECT_ID, status: 'accepted' },
      ],
    });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string; projectId?: string }>;
    };
    const resolution = await query.queryFn();

    expect(resolution).toEqual({ kind: 'redirect', projectId: PROJECT_ID });
  });

  it('falls through to the R21 decision leg, and ultimately to missing, when no proposal chain matches', async () => {
    stubTables({
      documentStateRows: [],
      r6ProjectId: null,
      leadStatus: null,
      chainProposals: [],
      decision: null,
    });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string }>;
    };
    const resolution = await query.queryFn();

    expect(resolution).toEqual({ kind: 'missing' });
  });

  it('still resolves the direct document_state hit without touching the chain leg at all', async () => {
    const row = { engagement_id: ID, active_section: 'discovery' };
    stubTables({ documentStateRows: [row] });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string; row?: unknown }>;
    };
    const resolution = await query.queryFn();

    expect(resolution).toEqual({ kind: 'engagement', row });
    expect(fromMock).toHaveBeenCalledWith('document_state');
    expect(fromMock).not.toHaveBeenCalledWith('proposals');
  });
});
