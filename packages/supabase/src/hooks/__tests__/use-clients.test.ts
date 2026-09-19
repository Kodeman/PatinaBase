import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors use-decisions.test.ts / use-client-notifications.test.ts:
// intercept the chained query builder at the `@supabase/ssr` boundary and
// React Query so we can invoke `queryFn` directly and inspect which tables
// were actually queried, without a live database.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  order: any;
  limit: any;
  update: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // terminal calls — return a Promise of the result
  maybeSingle: () => Promise<BuilderResult>;
  single: () => Promise<BuilderResult>;
  // thenable so awaiting the chain itself resolves to result (the `.order()`
  // tail on the projects query never calls a terminal method explicitly)
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __chain: Array<{ method: string; args: unknown[] }>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: null, error: null }): MockBuilder {
  const builder = {
    __chain: [] as Array<{ method: string; args: unknown[] }>,
    __result: initial,
  } as MockBuilder;

  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.__chain.push({ method, args });
      return builder;
    });

  builder.select = record('select');
  builder.eq = record('eq');
  builder.order = record('order');
  builder.limit = record('limit');
  builder.update = record('update');

  builder.maybeSingle = vi.fn(() => {
    builder.__chain.push({ method: 'maybeSingle', args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.single = vi.fn(() => {
    builder.__chain.push({ method: 'single', args: [] });
    return Promise.resolve(builder.__result);
  });

  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);

  return builder;
}

// Per-table builder registry — `from('table')` returns the registered builder
// for that table, or `undefined` tracking via `wasQueried` if never touched.
const builders: Record<string, MockBuilder> = {};

function setTableResult(table: string, result: BuilderResult): MockBuilder {
  const b = makeBuilder(result);
  builders[table] = b;
  return b;
}

const fromCalls: string[] = [];

const rpc = vi.fn();

const supabaseClient = {
  auth: {
    getUser: vi.fn(() =>
      Promise.resolve({ data: { user: { id: 'designer-1' } }, error: null }),
    ),
  },
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (!builders[table]) builders[table] = makeBuilder();
    return builders[table];
  }),
  rpc,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Import AFTER mocks are wired up.
import {
  useAddClient,
  useClientProjects,
  useDesignerClientForClientUser,
  useUpdateClientContact,
} from '../use-clients';

beforeEach(() => {
  for (const k of Object.keys(builders)) delete builders[k];
  fromCalls.length = 0;
  supabaseClient.from.mockClear();
  supabaseClient.auth.getUser.mockClear();
  rpc.mockReset();
});

describe('useDesignerClientForClientUser — relationship history', () => {
  it('scopes to the signed-in designer and deterministically caps the lookup to one row', async () => {
    const row = {
      id: 'relationship-newest',
      designer_id: 'designer-1',
      client_id: 'client-1',
      lead_id: 'lead-newest',
    };
    setTableResult('designer_clients', { data: row, error: null });

    const config = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<typeof row | null>;
      meta?: { errorSurface?: string };
    };

    await expect(config.queryFn()).resolves.toEqual(row);
    expect(config.meta).toEqual({ errorSurface: 'silent' });
    expect(supabaseClient.auth.getUser).toHaveBeenCalledTimes(1);

    const chain = builders['designer_clients'].__chain;
    expect(chain).toContainEqual({ method: 'eq', args: ['client_id', 'client-1'] });
    expect(chain).toContainEqual({ method: 'eq', args: ['designer_id', 'designer-1'] });
    expect(chain).toContainEqual({
      method: 'order',
      args: ['updated_at', { ascending: false }],
    });
    expect(chain).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false }],
    });
    expect(chain).toContainEqual({ method: 'order', args: ['id', { ascending: false }] });
    expect(chain).toContainEqual({ method: 'limit', args: [1] });
    expect(chain.at(-1)?.method).toBe('maybeSingle');
  });

  it('treats a signed-out or no-match lookup as an ordinary null result', async () => {
    supabaseClient.auth.getUser.mockImplementationOnce(async () =>
      ({ data: { user: null }, error: null }) as any,
    );

    const signedOut = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(signedOut.queryFn()).resolves.toBeNull();
    expect(fromCalls).toEqual([]);

    setTableResult('designer_clients', { data: null, error: null });
    const missing = useDesignerClientForClientUser('client-1') as unknown as {
      queryFn: () => Promise<unknown>;
    };
    await expect(missing.queryFn()).resolves.toBeNull();
  });
});

describe('useClientProjects — no-login household guard (I63)', () => {
  it('returns [] and never queries projects when the resolved client_id is null', async () => {
    // A no-login household: designer_clients.client_id is NULL.
    setTableResult('designer_clients', {
      data: { client_id: null, designer_id: 'designer-1' },
      error: null,
    });

    const config = useClientProjects('dc-no-login') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([]);
    // The whole point of the guard: supabase-js would otherwise serialize
    // `.eq('client_id', null)` as the literal `eq.null`, which Postgres
    // rejects on a uuid column (400 / 22P02). Prove the second query was
    // never issued at all.
    expect(fromCalls).toEqual(['designer_clients']);
    expect(builders['projects']).toBeUndefined();
  });

  it('returns [] without querying projects when the designer_clients row is missing', async () => {
    setTableResult('designer_clients', { data: null, error: null });

    const config = useClientProjects('dc-missing') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([]);
    expect(builders['projects']).toBeUndefined();
  });

  it('queries projects scoped to designer_id + client_id when client_id resolves', async () => {
    setTableResult('designer_clients', {
      data: { client_id: 'profile-1', designer_id: 'designer-1' },
      error: null,
    });
    setTableResult('projects', { data: [{ id: 'proj-1' }], error: null });

    const config = useClientProjects('dc-login') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([{ id: 'proj-1' }]);
    const projectEqs = builders['projects'].__chain.filter((c) => c.method === 'eq');
    expect(
      projectEqs.some((c) => c.args[0] === 'designer_id' && c.args[1] === 'designer-1'),
    ).toBe(true);
    expect(
      projectEqs.some((c) => c.args[0] === 'client_id' && c.args[1] === 'profile-1'),
    ).toBe(true);
  });
});

// R3-05 — the household sheet trims at the call site, but a lead-capture path
// or a hand write does not. A whitespace-only number stored on the captured
// column reads as "has a phone" to anything testing `!= null` and renders an
// empty directory cell.
describe('useUpdateClientContact — a blank phone is no phone', () => {
  it('trims the captured phone and stores a whitespace-only one as null', async () => {
    const b = setTableResult('designer_clients', { data: { id: 'dc-1' }, error: null });

    const config = useUpdateClientContact() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      clientId: 'dc-1',
      updates: { client_phone: '   ', client_name: 'The Ellsworths' },
    });

    expect(b.__chain).toContainEqual({
      method: 'update',
      args: [{ client_phone: null, client_name: 'The Ellsworths' }],
    });
  });

  it('keeps a real number, trimmed', async () => {
    const b = setTableResult('designer_clients', { data: { id: 'dc-1' }, error: null });

    const config = useUpdateClientContact() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      clientId: 'dc-1',
      updates: { client_phone: ' (555) 010-2020 ' },
    });

    expect(b.__chain).toContainEqual({
      method: 'update',
      args: [{ client_phone: '(555) 010-2020' }],
    });
  });

  it('leaves a patch that never mentions the phone alone', async () => {
    const b = setTableResult('designer_clients', { data: { id: 'dc-1' }, error: null });

    const config = useUpdateClientContact() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    await config.mutationFn({
      clientId: 'dc-1',
      updates: { notes: 'Prefers Tuesdays' },
    });

    expect(b.__chain).toContainEqual({
      method: 'update',
      args: [{ notes: 'Prefers Tuesdays' }],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SQ-108 INFO-3 — the kickoff consent write had no test at all.
//
// P22: the box is born unchecked, and when a studio ticks it the fact goes
// through `record_channel_invite` (00594) — the SAME door the trade addParty
// path uses (useRecordPartySmsConsent, asserted at
// use-coordination-authority.test.ts:373), because that ledger is the only thing
// the send gate reads a consent word from. This mirrors those assertions for the
// client branch: the same RPC, the same argument shape, no status named, nothing
// written to the frozen seat columns, and the record landing BEFORE the letter
// so a refusal on file stops a letter that would otherwise have been sent.
// ─────────────────────────────────────────────────────────────────────────────
describe('useAddClient — the kickoff consent box writes to the studio ledger (P22)', () => {
  const ORG_ID = 'org-beta';

  function config() {
    return useAddClient() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
  }

  const input = {
    clientEmail: '',
    clientPhone: ' (608) 555-0143 ',
    clientName: 'Dana Ellsworth',
    letter: true,
    note: 'The drawings are in.',
    projectId: 'proj-1',
    kickoffConsent: true,
    organizationId: ORG_ID,
  };

  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        designerClientId: 'dc-1',
        profileId: null,
        invited: true,
        alreadyExists: false,
        kind: 'invite',
        deliver: 'sms_sent',
      }),
    })) as unknown as typeof fetch;
  });

  it('records the invite on the studio ledger, and names no status', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(input);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('record_channel_invite');
    expect(args).toEqual({
      p_organization_id: ORG_ID,
      p_channel_kind: 'sms',
      // Her number AS TYPED, trimmed: normalizing is the RPC's own job
      // (normalize_channel_value, 00593:176), so the letter and the ledger cannot
      // be keyed on two different readings of one phone.
      p_channel_value: '(608) 555-0143',
      p_source: 'kickoff_checkbox',
      p_evidence: expect.stringContaining('Dana Ellsworth'),
      p_disclosure_version: 'field-sms-v1',
      p_origin_project_id: 'proj-1',
    });
    // close-review r2 MAJOR-1: record_channel_consent(…, 'pending', …) would
    // demote a standing grant. This door cannot, and never says the word.
    expect(args).not.toHaveProperty('p_status');
  });

  it('touches project_parties — and every other table — not at all', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn(input);

    // 00594's R-AS froze project_parties.sms_consent_*; the trade path writes
    // none of them, and this path mirrors it exactly. The roster row is the
    // route's to write, not the hook's.
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('records BEFORE the letter, so a refusal on file sends nothing', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'channel_opted_out', code: 'P0001' },
    });

    await expect(config().mutationFn(input)).rejects.toThrow(/already opted out/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("turns an un-textable number into a sentence, before a letter is written", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid_channel_value', code: 'P0001' },
    });

    await expect(config().mutationFn(input)).rejects.toThrow(/can't receive texts/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses before the RPC when there is no studio to record against', async () => {
    await expect(
      config().mutationFn({ ...input, organizationId: null }),
    ).rejects.toThrow(/aren't in a studio yet/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('writes nothing to the ledger when the box was left unticked', async () => {
    // Born unchecked, and absence is not consent: an add with no tick records
    // nothing and still sends the letter.
    await config().mutationFn({ ...input, kickoffConsent: false });

    expect(rpc).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('writes nothing to the ledger when there is no number to record', async () => {
    await config().mutationFn({
      ...input,
      clientEmail: 'dana@ellsworth.test',
      clientPhone: '   ',
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('carries a studio-supplied disclosure version instead of the default', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await config().mutationFn({ ...input, smsConsentDisclosureVersion: 'field-sms-v2' });

    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_disclosure_version).toBe('field-sms-v2');
  });
});
