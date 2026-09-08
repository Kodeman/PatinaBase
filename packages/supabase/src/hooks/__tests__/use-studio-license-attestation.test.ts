import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery/useMutation are identity
// functions, so a hook call returns its own config object and the test reads
// the key, runs the queryFn, and invokes the mutationFn and onSuccess directly.
//
// The attestation read is `.select().eq().maybeSingle()`; the write is
// `.upsert().select().single()`.
// ─────────────────────────────────────────────────────────────────────────────

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const single = vi.fn();
const selectAfterUpsert = vi.fn(() => ({ single }));
const upsert = vi.fn(() => ({ select: selectAfterUpsert }));
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
  licenseAttestationIsLive,
  mapStudioLicenseAttestation,
  studioLicenseAttestationKeys,
  useSaveStudioLicenseAttestation,
  useStudioLicenseAttestation,
  type StudioLicenseAttestationRow,
} from '../use-studio-license-attestation';

const row: StudioLicenseAttestationRow = {
  studio_id: 'studio-1',
  credential_type: 'WI Dwelling Contractor',
  credential_number: '1234567',
  state: 'WI',
  expires_on: '2027-03-31',
  attested_by: 'designer-1',
  attested_at: '2026-09-07T12:00:00.000Z',
  created_at: '2026-09-07T12:00:00.000Z',
  updated_at: '2026-09-07T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ maybeSingle });
  select.mockReturnValue({ eq });
  selectAfterUpsert.mockReturnValue({ single });
  upsert.mockReturnValue({ select: selectAfterUpsert });
  from.mockReturnValue({ select, upsert });
});

describe('mapStudioLicenseAttestation', () => {
  it('maps the row into the camelCase domain shape', () => {
    expect(mapStudioLicenseAttestation(row)).toEqual({
      studioId: 'studio-1',
      credentialType: 'WI Dwelling Contractor',
      credentialNumber: '1234567',
      state: 'WI',
      expiresOn: '2027-03-31',
      attestedBy: 'designer-1',
      attestedAt: '2026-09-07T12:00:00.000Z',
    });
  });
});

describe('licenseAttestationIsLive', () => {
  const attestation = mapStudioLicenseAttestation(row);

  it('is false with no attestation at all — the fail-closed answer', () => {
    expect(licenseAttestationIsLive(null)).toBe(false);
    expect(licenseAttestationIsLive(undefined)).toBe(false);
  });

  it('is true while the expiry is still ahead', () => {
    expect(licenseAttestationIsLive(attestation, new Date(2027, 2, 30))).toBe(true);
  });

  it('is false on the expiry date itself — the SQL is `expires_on > current_date`', () => {
    expect(licenseAttestationIsLive(attestation, new Date(2027, 2, 31))).toBe(false);
  });

  it('is false once the expiry has passed', () => {
    expect(licenseAttestationIsLive(attestation, new Date(2027, 3, 1))).toBe(false);
  });

  it('reads the local calendar day, not a UTC instant', () => {
    // 23:30 local on the 30th is still the 30th; a UTC-midnight coercion in a
    // US timezone would call it the 31st and lock the studio a day early.
    expect(licenseAttestationIsLive(attestation, new Date(2027, 2, 30, 23, 30))).toBe(true);
  });
});

describe('useStudioLicenseAttestation', () => {
  it('keys on the studio and reads the row', async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });
    const config = useStudioLicenseAttestation('studio-1') as any;
    expect(config.queryKey).toEqual(studioLicenseAttestationKeys.detail('studio-1'));
    expect(config.enabled).toBe(true);
    await expect(config.queryFn()).resolves.toEqual(mapStudioLicenseAttestation(row));
    expect(from).toHaveBeenCalledWith('studio_license_attestations');
    expect(eq).toHaveBeenCalledWith('studio_id', 'studio-1');
  });

  it('answers null when the studio has attested nothing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const config = useStudioLicenseAttestation('studio-1') as any;
    await expect(config.queryFn()).resolves.toBeNull();
  });

  it('answers null — not a throw — when the relation is not there yet', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    const config = useStudioLicenseAttestation('studio-1') as any;
    await expect(config.queryFn()).resolves.toBeNull();
  });

  it('does not run without a studio', () => {
    const config = useStudioLicenseAttestation(null) as any;
    expect(config.enabled).toBe(false);
  });
});

describe('useSaveStudioLicenseAttestation', () => {
  it('upserts on the studio id, trimming and upper-casing the state', async () => {
    single.mockResolvedValue({ data: row, error: null });
    const config = useSaveStudioLicenseAttestation() as any;
    await config.mutationFn({
      studioId: 'studio-1',
      credentialType: '  WI Dwelling Contractor ',
      credentialNumber: ' 1234567 ',
      state: ' wi ',
      expiresOn: '2027-03-31',
      attestedBy: 'designer-1',
    });
    const [payload, options] = upsert.mock.calls[0] as any[];
    expect(options).toEqual({ onConflict: 'studio_id' });
    expect(payload.studio_id).toBe('studio-1');
    expect(payload.credential_type).toBe('WI Dwelling Contractor');
    expect(payload.credential_number).toBe('1234567');
    expect(payload.state).toBe('WI');
    expect(payload.expires_on).toBe('2027-03-31');
    expect(payload.attested_by).toBe('designer-1');
    expect(typeof payload.attested_at).toBe('string');
  });

  it('surfaces the database refusal rather than swallowing it', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    const config = useSaveStudioLicenseAttestation() as any;
    await expect(
      config.mutationFn({
        studioId: 'studio-1',
        credentialType: 'CA CSLB',
        credentialNumber: '9',
        state: 'CA',
        expiresOn: '2027-01-01',
        attestedBy: 'member-1',
      })
    ).rejects.toEqual({ message: 'new row violates row-level security policy' });
  });

  it('invalidates the studio it wrote', () => {
    const config = useSaveStudioLicenseAttestation() as any;
    config.onSuccess(undefined, { studioId: 'studio-1' });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: studioLicenseAttestationKeys.detail('studio-1'),
    });
  });
});
