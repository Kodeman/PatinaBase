const fromMock = jest.fn();
/** Every `.eq()`/`.order()` call the J6 chain leg makes, in call order —
 *  lets NAV-1's tie-break test assert the exact ORDER BY shape without
 *  re-deriving it from the mock's resolved data. */
let orderCalls: Array<{ leg: string; args: unknown[] }> = [];

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
    created_at?: string;
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
          // J6 leg: .select(...).eq('designer_client_id', id)
          //   .order('created_at', {...}).order('id', {...})
          // — chained, resolving only after both .order() calls (NAV-1's
          // deterministic tie-break). The mock returns whatever order the
          // test configured `chainProposals` in — same as a real ORDER BY
          // already having sorted them server-side.
          return {
            eq: (...eqArgs: unknown[]) => {
              orderCalls.push({ leg: 'eq', args: eqArgs });
              return {
                order: (...firstArgs: unknown[]) => {
                  orderCalls.push({ leg: 'order-1', args: firstArgs });
                  return {
                    order: (...secondArgs: unknown[]) => {
                      orderCalls.push({ leg: 'order-2', args: secondArgs });
                      return Promise.resolve({ data: opts.chainProposals ?? [], error: null });
                    },
                  };
                },
              };
            },
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
    orderCalls = [];
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

  it('NAV-1: orders the chain leg by created_at then id, ascending, so two independent duplicate-mode chains sharing one designer_client_id resolve deterministically', async () => {
    // Two unrelated roots (both parent_proposal_id: null, as clone_proposal's
    // 'duplicate' mode always produces) sharing one designer_client_id — the
    // exact ambiguity NAV-1 flagged. The mock returns them pre-sorted (as a
    // real ORDER BY would); the fix's job is issuing that ORDER BY at all.
    stubTables({
      documentStateRows: [],
      r6ProjectId: null,
      leadStatus: null,
      chainProposals: [
        {
          id: 'older-duplicate-root',
          parent_proposal_id: null,
          project_id: null,
          status: 'draft',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'newer-duplicate-root',
          parent_proposal_id: null,
          project_id: null,
          status: 'draft',
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const query = useDocumentEngagement(ID) as unknown as {
      queryFn: () => Promise<{ kind: string; projectId?: string }>;
    };
    const resolution = await query.queryFn();

    // The mock already returned them oldest-first (matching a real ORDER BY
    // created_at ASC); the resolver's `.find()` picks the first live row as
    // before — this test's real job is pinning that the query issues the
    // ORDER BY at all, asserted below.
    expect(resolution).toEqual({ kind: 'redirect', projectId: 'older-duplicate-root' });
    expect(orderCalls).toEqual([
      { leg: 'eq', args: ['designer_client_id', ID] },
      { leg: 'order-1', args: ['created_at', { ascending: true }] },
      { leg: 'order-2', args: ['id', { ascending: true }] },
    ]);
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
