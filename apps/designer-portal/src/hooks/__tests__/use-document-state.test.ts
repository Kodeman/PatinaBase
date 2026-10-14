const rpcMock = jest.fn();
const fromMock = jest.fn();
let deskCache: unknown;

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ rpc: rpcMock, from: fromMock }),
  docKeys: {
    all: ['document-state'],
    desk: (organizationId?: string) => ['document-state', 'desk', ...(organizationId ? [organizationId] : [])],
    engagement: (id: string) => ['document-state', 'engagement', id],
    sectionTasks: (projectId: string | null) => ['section-tasks', projectId],
    sectionGates: (projectId: string | null) => ['section-gates', projectId],
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ getQueryData: () => deskCache }),
}));

import { useDocumentEngagement } from '../use-document-state';

const ID = '11111111-1111-1111-1111-111111111111';
const CHAIN_ROOT_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const RELATIONSHIP_ID = '44444444-4444-4444-4444-444444444444';
const LIVE_PROPOSAL_ID = '55555555-5555-5555-5555-555555555555';
const LEAD_ID = '88888888-8888-8888-8888-888888888888';

type OpenQuery = {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
  placeholderData?: unknown;
};

const open = (id: string) => useDocumentEngagement(id) as unknown as OpenQuery;

/** Any table read resolves empty, so a resolver that still walks the tables
 *  answers 'missing' instead of crashing on the mock. */
function emptyTableRead(): unknown {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'or', 'limit', 'eq', 'order', 'maybeSingle']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null });
  return chain;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  fromMock.mockImplementation(emptyTableRead);
  deskCache = undefined;
});

describe('useDocumentEngagement — one document_open read over the six resolution branches', () => {
  const row = { engagement_id: ID, engagement_kind: 'project', project_id: ID, active_section: 'project' };
  const ids = {
    project_id: ID,
    proposal_id: null,
    lead_id: null,
    designer_client_id: RELATIONSHIP_ID,
    studio_id: '66666666-6666-6666-6666-666666666666',
    lead_user_id: '77777777-7777-7777-7777-777777777777',
  };

  it.each([
    ['engagement: any key of a document_state row answers the row and its ids', { kind: 'engagement', row, ids }],
    ['R6: an activated proposal redirects to its project', { kind: 'redirect', projectId: PROJECT_ID }],
    ['F1: an accepted lead redirects to its relationship', { kind: 'redirect', projectId: RELATIONSHIP_ID }],
    ['J6: a relationship that started a Direction chain redirects to the chain root', { kind: 'redirect', projectId: CHAIN_ROOT_ID }],
    ['R21: a decision redirects to the document it belongs to', { kind: 'redirect', projectId: PROJECT_ID }],
    ['missing: nothing answers the id', { kind: 'missing' }],
  ])('%s', async (_branch, resolution) => {
    rpcMock.mockResolvedValue({ data: resolution, error: null });

    await expect(open(ID).queryFn()).resolves.toEqual(resolution);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('document_open', { p_id: ID });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws the read error instead of answering missing', async () => {
    const error = { message: 'permission denied for function document_open', code: '42501' };
    rpcMock.mockResolvedValue({ data: null, error });

    await expect(open(ID).queryFn()).rejects.toBe(error);
  });

  it('keys the read on docKeys.engagement and never runs it for a non-uuid id', () => {
    expect(open(ID)).toEqual(
      expect.objectContaining({ queryKey: ['document-state', 'engagement', ID], enabled: true }),
    );
    expect(open('not-a-uuid').enabled).toBe(false);
  });
});

describe('useDocumentEngagement Desk cache seed', () => {
  beforeEach(() => {
    deskCache = {
      live: [
        { engagement_id: ID, project_id: ID, proposal_id: null, lead_id: null, title: 'Desk-seeded title' },
        {
          engagement_id: CHAIN_ROOT_ID,
          project_id: null,
          proposal_id: LIVE_PROPOSAL_ID,
          lead_id: null,
          title: 'Desk chain',
        },
        {
          engagement_id: RELATIONSHIP_ID,
          project_id: null,
          proposal_id: null,
          lead_id: LEAD_ID,
          title: 'Desk relationship',
        },
      ],
    };
  });

  it('returns the matching Desk row as placeholder data before the query resolves, without ids', () => {
    expect(open(ID).placeholderData).toEqual({
      kind: 'engagement',
      row: expect.objectContaining({ title: 'Desk-seeded title' }),
    });
    expect(open(CHAIN_ROOT_ID).placeholderData).toEqual({
      kind: 'engagement',
      row: expect.objectContaining({ title: 'Desk chain' }),
    });
  });

  it('seeds only on the row\'s engagement_id, never on a proposal or lead id that may have moved', () => {
    expect(open(LIVE_PROPOSAL_ID).placeholderData).toBeUndefined();
    expect(open(LEAD_ID).placeholderData).toBeUndefined();
  });
});
