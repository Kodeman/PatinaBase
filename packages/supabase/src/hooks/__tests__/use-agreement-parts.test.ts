import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-invoices rig. useQuery/useMutation are replaced by identity
// functions, so a hook call returns its own config object and the test can
// read the query key, run the queryFn, and invoke the mutationFn directly.
// ─────────────────────────────────────────────────────────────────────────────

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke: vi.fn() },
  from,
  rpc: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  agreementPartsKeys,
  mapAgreementPart,
  useAgreementParts,
  useSaveAgreementParts,
  useMaterializeStandardParts,
  type AgreementPartRow,
} from '../use-agreement-parts';

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ order });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

const row = (over: Partial<AgreementPartRow> = {}): AgreementPartRow => ({
  id: 'part-1',
  proposal_id: 'prop-1',
  position: 1,
  kind: 'clause',
  variant: null,
  part_key: 'patina.services',
  title: 'Services',
  payload: { body: 'Design services.' },
  required: true,
  client_visible: true,
  source_template_key: null,
  source_part_id: null,
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// mapAgreementPart
// ─────────────────────────────────────────────────────────────────────────────

describe('mapAgreementPart', () => {
  it('maps the snake_case row onto the camelCase @patina/types shape', () => {
    expect(mapAgreementPart(row())).toEqual({
      id: 'part-1',
      proposalId: 'prop-1',
      position: 1,
      kind: 'clause',
      variant: null,
      partKey: 'patina.services',
      title: 'Services',
      payload: { body: 'Design services.' },
      required: true,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
      updatedAt: '2026-09-06T00:00:00Z',
    });
  });

  it('reads a null payload as an empty object rather than passing null through', () => {
    expect(mapAgreementPart(row({ payload: null })).payload).toEqual({});
  });

  it('carries the schedule variant', () => {
    const mapped = mapAgreementPart(
      row({ kind: 'schedule', variant: 'rate_card', part_key: 'patina.role_rates' })
    );
    expect(mapped.kind).toBe('schedule');
    expect(mapped.variant).toBe('rate_card');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useAgreementParts
// ─────────────────────────────────────────────────────────────────────────────

describe('useAgreementParts', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<unknown[]>;
    enabled: boolean;
  }

  it('uses the ["agreement-parts", proposalId] key', () => {
    const config = useAgreementParts('prop-1') as unknown as Config;
    expect(config.queryKey).toEqual(['agreement-parts', 'prop-1']);
    expect(agreementPartsKeys.list('prop-1')).toEqual(['agreement-parts', 'prop-1']);
  });

  it('is disabled without a proposal id', () => {
    expect((useAgreementParts(null) as unknown as Config).enabled).toBe(false);
    expect((useAgreementParts('prop-1') as unknown as Config).enabled).toBe(true);
  });

  it('reads proposal_agreement_parts ordered by position and maps every row', async () => {
    order.mockResolvedValue({
      data: [row(), row({ id: 'part-2', position: 2, part_key: 'patina.terms', title: 'Terms' })],
      error: null,
    });
    const config = useAgreementParts('prop-1') as unknown as Config;
    const parts = await config.queryFn();

    expect(from).toHaveBeenCalledWith('proposal_agreement_parts');
    expect(eq).toHaveBeenCalledWith('proposal_id', 'prop-1');
    expect(order).toHaveBeenCalledWith('position', { ascending: true });
    expect(parts.map((p: any) => p.partKey)).toEqual(['patina.services', 'patina.terms']);
  });

  it('reads an agreement with no parts as an empty list', async () => {
    order.mockResolvedValue({ data: null, error: null });
    const config = useAgreementParts('prop-1') as unknown as Config;
    await expect(config.queryFn()).resolves.toEqual([]);
  });

  it('throws the postgrest error rather than swallowing it', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'denied' } });
    const config = useAgreementParts('prop-1') as unknown as Config;
    await expect(config.queryFn()).rejects.toEqual({ message: 'denied' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSaveAgreementParts
// ─────────────────────────────────────────────────────────────────────────────

describe('useSaveAgreementParts', () => {
  interface Config {
    mutationFn: (input: unknown) => Promise<unknown>;
    onSuccess: (data: unknown, input: unknown) => void;
  }

  const parts = [
    {
      kind: 'clause',
      partKey: 'patina.services',
      title: 'Services',
      payload: { body: 'Design services.' },
      required: true,
    },
  ];

  it('calls upsert_agreement_parts with p_proposal_id and the ordered p_parts array', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: {
        proposalId: 'prop-1',
        documentKind: 'design_services',
        commercialState: 'draft',
        partCount: 1,
        documentFingerprint: 'abc',
      },
      error: null,
    });
    const config = useSaveAgreementParts() as unknown as Config;
    const result = (await config.mutationFn({ proposalId: 'prop-1', parts })) as any;

    expect(supabaseClient.rpc).toHaveBeenCalledWith('upsert_agreement_parts', {
      p_proposal_id: 'prop-1',
      p_parts: parts,
    });
    expect(result.partCount).toBe(1);
    expect(result.documentFingerprint).toBe('abc');
  });

  it('throws the RPC error', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'an agreement that bills time needs a ceiling' },
    });
    const config = useSaveAgreementParts() as unknown as Config;
    await expect(config.mutationFn({ proposalId: 'prop-1', parts })).rejects.toEqual({
      message: 'an agreement that bills time needs a ceiling',
    });
  });

  it('invalidates the parts, commercial-document and proposal keys', () => {
    const config = useSaveAgreementParts() as unknown as Config;
    config.onSuccess(null, { proposalId: 'prop-1', parts });
    expect(invalidatedKeys()).toEqual([
      ['agreement-parts', 'prop-1'],
      ['commercial-documents', 'prop-1'],
      ['proposal', 'prop-1'],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMaterializeStandardParts
// ─────────────────────────────────────────────────────────────────────────────

describe('useMaterializeStandardParts', () => {
  interface Config {
    mutationFn: (input: unknown) => Promise<unknown>;
    onSuccess: (data: unknown, input: unknown) => void;
  }

  it('calls materialize_standard_parts and maps the returned rows', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { proposalId: 'prop-1', materialized: true, partCount: 1, parts: [row()] },
      error: null,
    });
    const config = useMaterializeStandardParts() as unknown as Config;
    const result = (await config.mutationFn({ proposalId: 'prop-1' })) as any;

    expect(supabaseClient.rpc).toHaveBeenCalledWith('materialize_standard_parts', {
      p_proposal_id: 'prop-1',
    });
    expect(result.materialized).toBe(true);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].partKey).toBe('patina.services');
  });

  it('reads an already-composed agreement as materialized: false with its existing set', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { proposalId: 'prop-1', materialized: false, partCount: 9, parts: null },
      error: null,
    });
    const config = useMaterializeStandardParts() as unknown as Config;
    const result = (await config.mutationFn({ proposalId: 'prop-1' })) as any;
    expect(result.materialized).toBe(false);
    expect(result.partCount).toBe(9);
    expect(result.parts).toEqual([]);
  });

  it('invalidates the same three keys the save does', () => {
    const config = useMaterializeStandardParts() as unknown as Config;
    config.onSuccess(null, { proposalId: 'prop-1' });
    expect(invalidatedKeys()).toEqual([
      ['agreement-parts', 'prop-1'],
      ['commercial-documents', 'prop-1'],
      ['proposal', 'prop-1'],
    ]);
  });
});
