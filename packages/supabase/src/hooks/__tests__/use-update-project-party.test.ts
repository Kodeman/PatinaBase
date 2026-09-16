/**
 * `useUpdateProjectParty`'s phone-change handling, after R-AS.
 *
 * WHAT THIS FILE USED TO PIN, AND WHY IT NO LONGER DOES. A genuine phone change
 * used to REVERT the seat's consent: `pending`/`granted` back to `not_asked`,
 * or across to `opted_out` when a sibling row on the new number had refused,
 * inheriting that sibling's date. Every one of those writes named a column
 * 00594 froze, so every one of them raised. More to the point, they were
 * writes to a COPY: `studio_channel_consent` is keyed on the NUMBER, so moving
 * a seat's number already moves which record the seat reads, and a revert on
 * the seat could only ever contradict the one live ledger.
 *
 * WHAT SURVIVES IS A READ. A number the studio's RECORD refused cannot move
 * (close-review r3 MAJOR-4, repointed at the record in r14 BLOCKING-1): the
 * refusal belongs to the number on file and must not travel to a corrected one.
 * The hook asks `project_consent_org()` then `channel_consent_status()` — the
 * same pair 00594's freeze asks — and refuses in a sentence.
 *
 * A cosmetic reformat of the same digits is not a change and still lands.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

/** `.update(dbPatch).eq('id', …).select().single()` — the write itself. */
function makeBuilder(result: { data: unknown; error: unknown }): MockBuilder {
  const builder: MockBuilder = {};
  builder.update = vi.fn((patch: unknown) => {
    builder.__patch = patch;
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(result));
  return builder;
}

/** `.select('phone_e164, project_id').eq('id', …).maybeSingle()` — the ONE
 *  lookup a phone patch runs. It no longer selects `sms_consent_status`: the
 *  seat's own column is frozen at its `not_asked` default for every row any
 *  live write path produces, so reading it could only ever answer for
 *  pre-freeze rows the backfill already folded into the record. */
function currentRowBuilder(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, maybeSingle };
}

let builder: MockBuilder;
const from = vi.fn(() => builder);

/** The two RPCs a genuine phone change asks. The default says "this studio
 *  holds no record for that number", which is every test but the refusals. */
const rpc = vi.fn();
function defaultRpc(consentVerdict: string | null = null) {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'project_consent_org') return Promise.resolve({ data: 'org-1', error: null });
    if (fn === 'channel_consent_status')
      return Promise.resolve({ data: consentVerdict, error: null });
    throw new Error(`unexpected rpc ${fn}`);
  });
}

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useUpdateProjectParty } from '../use-coordination';

beforeEach(() => {
  builder = makeBuilder({ data: { id: 'party-1' }, error: null });
  from.mockClear();
  rpc.mockReset();
  defaultRpc(null);
});

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn;
}

/** The eight columns 00594 froze. None may appear in an UPDATE patch. */
const FROZEN_COLUMNS = [
  'sms_consent_status',
  'sms_consent_source',
  'sms_consent_evidence',
  'sms_consent_recorded_at',
  'sms_consent_recorded_by',
  'sms_consent_disclosure_version',
  'sms_consented_at',
  'sms_opt_out_at',
];

function expectNoFrozenColumns(patch: Record<string, unknown>) {
  for (const column of FROZEN_COLUMNS) expect(patch).not.toHaveProperty(column);
}

describe('useUpdateProjectParty — R-AS: a phone change writes no consent column', () => {
  it('sends only the phone on a genuine change, whatever the seat once said', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '555-999-0000' },
    });

    expect(builder.__patch).toEqual({ phone: '555-999-0000' });
    expectNoFrozenColumns(builder.__patch as Record<string, unknown>);
  });

  it('runs NO sibling probe — the record is keyed on the number, not on a row', async () => {
    // The old body's `.eq('phone_e164', next).eq('sms_consent_status',
    // 'opted_out')` scan existed to find a refusal on the number being moved
    // TO. `studio_channel_consent` is that scan, done once, per studio.
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '555-999-0000' },
    });

    // Exactly two `from()` calls: the current-row lookup, then the update.
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('reads only phone_e164 and project_id — never the frozen status column', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '555-999-0000' },
    });

    expect(currentRow.select).toHaveBeenCalledWith('phone_e164, project_id');
  });
});

describe('useUpdateProjectParty — the refusal that cannot travel', () => {
  it("refuses when the STUDIO RECORD says the number on file opted out (r14 BLOCKING-1)", async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-77' },
      error: null,
    });
    from.mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder);
    defaultRpc('opted_out');

    await expect(
      mutationFnOf(useUpdateProjectParty())({
        id: 'party-1',
        projectId: 'proj-1',
        patch: { phone: '612-555-0199' },
      }),
    ).rejects.toThrow(/refusal is attached to the number on file/i);

    expect(builder.update).not.toHaveBeenCalled();
    // The project on the ROW resolves the studio, not the one the caller
    // passed: a seat's ledger belongs to the seat's own job.
    expect(rpc).toHaveBeenCalledWith('project_consent_org', { p_project_id: 'proj-77' });
    expect(rpc).toHaveBeenCalledWith('channel_consent_status', {
      p_organization_id: 'org-1',
      p_channel_kind: 'sms',
      p_channel_value: '+15551112222',
    });
  });

  it('asks the record for the OLD number, not the new one', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '612-555-0199' },
    });

    const verdictCall = rpc.mock.calls.find(([name]) => name === 'channel_consent_status');
    expect(verdictCall?.[1]).toMatchObject({ p_channel_value: '+15551112222' });
  });

  it('lets a cosmetic reformat of a refused number through, asking nothing', async () => {
    // Same digits is not a change, so the refusal never comes up.
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);
    defaultRpc('opted_out');

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '(555) 111-2222' },
    });

    expect(builder.__patch).toEqual({ phone: '(555) 111-2222' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lands the edit when the project resolves to no studio at all', async () => {
    // A studio-less project has no ledger to hold a refusal. The edit is not
    // refused on a verdict nobody can read.
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);
    rpc.mockImplementation((fn: string) => {
      if (fn === 'project_consent_org') return Promise.resolve({ data: null, error: null });
      throw new Error(`unexpected rpc ${fn}`);
    });

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '612-555-0199' },
    });

    expect(builder.__patch).toEqual({ phone: '612-555-0199' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('lets a pending or granted record move — only a refusal is stuck', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);
    defaultRpc('granted');

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '612-555-0199' },
    });

    expect(builder.__patch).toEqual({ phone: '612-555-0199' });
  });
});

describe('useUpdateProjectParty — the phone column itself', () => {
  it('sends phone_e164: null alongside a cleared phone', async () => {
    // 00281's normalizer reads COALESCE(NEW.phone, NEW.phone_e164), so clearing
    // the raw phone alone leaves the old E.164 standing — and that column is
    // the inbound SMS conversation key.
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: null },
    });

    expect(builder.__patch).toEqual({ phone: null, phone_e164: null });
  });

  it('does not send phone_e164 when the phone is set rather than cleared', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: null, project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '555-999-0000' },
    });

    expect(builder.__patch).not.toHaveProperty('phone_e164');
  });

  it('runs no lookup and no RPC when the save never touches the phone', async () => {
    from.mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { displayName: 'Rosa Delgado', showToClient: true },
    });

    expect(builder.__patch).toEqual({ display_name: 'Rosa Delgado', show_to_client: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('still patches the other columns beside a phone change', async () => {
    const currentRow = currentRowBuilder({
      data: { phone_e164: '+15551112222', project_id: 'proj-1' },
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select } as unknown as MockBuilder)
      .mockReturnValueOnce(builder);

    await mutationFnOf(useUpdateProjectParty())({
      id: 'party-1',
      projectId: 'proj-1',
      patch: { phone: '555-999-0000', trade: 'electrical', email: ' dana@x.com ' },
    });

    expect(builder.__patch).toEqual({
      phone: '555-999-0000',
      trade: 'electrical',
      email: 'dana@x.com',
    });
  });
});
