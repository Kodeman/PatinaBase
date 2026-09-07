import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-invoices rig, plus the from().upsert().select().single()
// chain the write path uses.
// ─────────────────────────────────────────────────────────────────────────────

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

const upsertSingle = vi.fn();
const upsertSelect = vi.fn(() => ({ single: upsertSingle }));
const upsert = vi.fn(() => ({ select: upsertSelect }));

const from = vi.fn(() => ({ select, upsert }));

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
  studioAgreementDefaultsKeys,
  defaultStudioAgreementDefaults,
  useStudioAgreementDefaults,
  useUpdateStudioAgreementDefaults,
  type StudioAgreementDefaultsRow,
} from '../use-studio-agreement-defaults';

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ eq });
  upsertSelect.mockReturnValue({ single: upsertSingle });
  upsert.mockReturnValue({ select: upsertSelect });
  from.mockReturnValue({ select, upsert });
});

const row: StudioAgreementDefaultsRow = {
  studio_id: 'studio-1',
  rate_card: [{ roleName: 'Principal', hourlyRateCents: 22500, sortOrder: 0 }],
  deposit_percent: 40,
  cadence: 'biweekly',
  retainer_credit_rule: 'non_refundable',
  default_exclusions: ['Permit fees'],
  updated_by: 'user-1',
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
};

// ─────────────────────────────────────────────────────────────────────────────
// useStudioAgreementDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe('useStudioAgreementDefaults', () => {
  interface Config {
    queryKey: unknown[];
    queryFn: () => Promise<any>;
    enabled: boolean;
  }

  it('uses the ["studio-agreement-defaults", studioId] key', () => {
    const config = useStudioAgreementDefaults('studio-1') as unknown as Config;
    expect(config.queryKey).toEqual(['studio-agreement-defaults', 'studio-1']);
    expect(studioAgreementDefaultsKeys.detail('studio-1')).toEqual([
      'studio-agreement-defaults',
      'studio-1',
    ]);
  });

  it('is disabled without a studio id', () => {
    expect((useStudioAgreementDefaults(null) as unknown as Config).enabled).toBe(false);
  });

  it('maps a stored row onto the camelCase domain shape', async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });
    const config = useStudioAgreementDefaults('studio-1') as unknown as Config;
    const defaults = await config.queryFn();

    expect(from).toHaveBeenCalledWith('studio_agreement_defaults');
    expect(eq).toHaveBeenCalledWith('studio_id', 'studio-1');
    expect(defaults).toEqual({
      studioId: 'studio-1',
      rateCard: [{ roleName: 'Principal', hourlyRateCents: 22500, sortOrder: 0 }],
      depositPercent: 40,
      cadence: 'biweekly',
      retainerCreditRule: 'non_refundable',
      defaultExclusions: ['Permit fees'],
      updatedBy: 'user-1',
      updatedAt: '2026-09-06T00:00:00Z',
    });
  });

  it('reads an ABSENT row as the Patina standard, not as null', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const config = useStudioAgreementDefaults('studio-1') as unknown as Config;
    await expect(config.queryFn()).resolves.toEqual(
      defaultStudioAgreementDefaults('studio-1')
    );
    expect(defaultStudioAgreementDefaults('studio-1')).toEqual({
      studioId: 'studio-1',
      rateCard: [],
      depositPercent: null,
      cadence: 'monthly',
      retainerCreditRule: 'credited',
      defaultExclusions: [],
      updatedBy: null,
      updatedAt: null,
    });
  });

  it('reads null jsonb columns as empty arrays', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...row, rate_card: null, default_exclusions: null },
      error: null,
    });
    const config = useStudioAgreementDefaults('studio-1') as unknown as Config;
    const defaults = await config.queryFn();
    expect(defaults.rateCard).toEqual([]);
    expect(defaults.defaultExclusions).toEqual([]);
  });

  // 00575 lands on Strata on its own schedule and the portals deploy on
  // theirs. In the window between, this read fails because the relation is
  // not there yet — and the Account page must still render. A studio that has
  // never set a default and a studio whose table has not arrived are the same
  // thing to every reader: the Patina standard.
  it('reads a failed lookup as the Patina standard, so the card still renders', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'relation "studio_agreement_defaults" does not exist' },
    });
    const config = useStudioAgreementDefaults('studio-1') as unknown as Config;
    const defaults = (await config.queryFn()) as any;
    expect(defaults.studioId).toBe('studio-1');
    expect(defaults.cadence).toBe('monthly');
    expect(defaults.retainerCreditRule).toBe('credited');
    expect(defaults.rateCard).toEqual([]);
    expect(defaults.depositPercent).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateStudioAgreementDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe('useUpdateStudioAgreementDefaults', () => {
  interface Config {
    mutationFn: (input: unknown) => Promise<any>;
    onSuccess: (data: unknown, input: unknown) => void;
  }

  const input = {
    studioId: 'studio-1',
    rateCard: [{ roleName: 'Principal', hourlyRateCents: 22500, sortOrder: 0 }],
    depositPercent: 40,
    cadence: 'biweekly' as const,
    retainerCreditRule: 'non_refundable' as const,
    defaultExclusions: ['Permit fees'],
    updatedBy: 'user-1',
  };

  it('upserts on the studio_id primary key in snake_case', async () => {
    upsertSingle.mockResolvedValue({ data: row, error: null });
    const config = useUpdateStudioAgreementDefaults() as unknown as Config;
    const saved = await config.mutationFn(input);

    expect(from).toHaveBeenCalledWith('studio_agreement_defaults');
    expect(upsert).toHaveBeenCalledWith(
      {
        studio_id: 'studio-1',
        rate_card: [{ roleName: 'Principal', hourlyRateCents: 22500, sortOrder: 0 }],
        deposit_percent: 40,
        cadence: 'biweekly',
        retainer_credit_rule: 'non_refundable',
        default_exclusions: ['Permit fees'],
        updated_by: 'user-1',
      },
      { onConflict: 'studio_id' }
    );
    expect(saved.cadence).toBe('biweekly');
  });

  it('sends a null updated_by when the caller omits it', async () => {
    upsertSingle.mockResolvedValue({ data: row, error: null });
    const config = useUpdateStudioAgreementDefaults() as unknown as Config;
    const { updatedBy, ...withoutActor } = input;
    await config.mutationFn(withoutActor);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: null }),
      { onConflict: 'studio_id' }
    );
  });

  it('throws the postgrest error', async () => {
    upsertSingle.mockResolvedValue({ data: null, error: { message: 'denied' } });
    const config = useUpdateStudioAgreementDefaults() as unknown as Config;
    await expect(config.mutationFn(input)).rejects.toEqual({ message: 'denied' });
  });

  it('invalidates only its own key', () => {
    const config = useUpdateStudioAgreementDefaults() as unknown as Config;
    config.onSuccess(null, input);
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      ['studio-agreement-defaults', 'studio-1'],
    ]);
  });
});
