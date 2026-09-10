/**
 * F3-R1-02 / F3-R1-12 / F3-R2-01 / F3-R2-02 — `useUpdateProjectParty`'s
 * phone-change consent handling.
 *
 * A GENUINE phone change (normalized E.164, not the raw string) reverts a
 * `pending`/`granted` party to `not_asked` — unless the number being moved TO
 * already has its own `opted_out` sibling row, in which case this row is set
 * to `opted_out` too rather than wrongly reopening an already-opted-out
 * number. An `opted_out` party is NEVER touched by this hook (F3-R2-01): that
 * status is the only stored record of a recipient's STOP, and lifting it
 * would both erase that record and reopen the invite path for a number that
 * opted out. A `not_asked` party has nothing to revert. A save that never
 * touches the phone must leave consent columns untouched, and neither must a
 * save whose phone patch normalizes to the same number already on file
 * (F3-R2-03's cosmetic-reformat case, mirrored here at the hook level).
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

/** `.select('sms_consent_status, phone_e164').eq('id', …).maybeSingle()` —
 *  the current-row lookup a phone patch always runs first. */
function currentRowBuilder(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, maybeSingle };
}

/** `.select('id, sms_opt_out_at').eq('phone_e164', …).eq('sms_consent_status',
 *  'opted_out').neq('id', …).order('sms_opt_out_at', …).limit(1)` — checked
 *  only when a pending/granted row's phone genuinely changes to a normalizable
 *  number. The order is what makes the inherited opt-out date the latest word
 *  on that number. */
function siblingBuilder(result: { data: unknown; error: unknown }) {
  const limit = vi.fn().mockResolvedValue(result);
  const order = vi.fn(() => ({ limit }));
  const neq = vi.fn(() => ({ order }));
  const eq2 = vi.fn(() => ({ neq }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  return { select, eq1, eq2, neq, order, limit };
}

let builder: MockBuilder;
const from = vi.fn(() => builder);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useUpdateProjectParty } from '../use-coordination';

beforeEach(() => {
  builder = makeBuilder({ data: { id: 'party-1' }, error: null });
  from.mockClear();
});

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn;
}

describe('useUpdateProjectParty — phone change resets SMS consent', () => {
  it('reverts a granted party to not_asked when the phone genuinely changes (F3-R1-02)', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'granted', phone_e164: '+15551112222' },
      error: null,
    });
    const sibling = siblingBuilder({ data: [], error: null });
    from
      .mockReturnValueOnce({ select: currentRow.select })
      .mockReturnValueOnce({ select: sibling.select })
      .mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '5559876543' },
    });

    expect(sibling.eq1).toHaveBeenCalledWith('phone_e164', '+15559876543');
    expect(sibling.eq2).toHaveBeenCalledWith('sms_consent_status', 'opted_out');
    expect(sibling.neq).toHaveBeenCalledWith('id', 'party-1');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '5559876543',
        sms_consent_status: 'not_asked',
        sms_consent_source: null,
        sms_consent_evidence: null,
        sms_consent_recorded_at: null,
        sms_consent_recorded_by: null,
        sms_consent_disclosure_version: null,
        sms_consented_at: null,
        sms_opt_out_at: null,
      }),
    );
  });

  it('sets a pending party to opted_out (not not_asked) when the new number already opted out elsewhere', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'pending', phone_e164: '+15551112222' },
      error: null,
    });
    const sibling = siblingBuilder({
      data: [{ id: 'party-9', sms_opt_out_at: '2026-09-01T14:32:00.000Z' }],
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select })
      .mockReturnValueOnce({ select: sibling.select })
      .mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '5559876543' },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '5559876543',
        sms_consent_status: 'opted_out',
        sms_consent_source: null,
        sms_consented_at: null,
      }),
    );
    // The opt-out moment is the SIBLING's, inherited: nobody replied STOP on
    // this row, so stamping the edit's own clock would date an opt-out that
    // never happened here.
    const optedOutPatch = builder.update.mock.calls[0][0] as Record<string, unknown>;
    expect(optedOutPatch.sms_opt_out_at).toBe('2026-09-01T14:32:00.000Z');
    expect(sibling.order).toHaveBeenCalledWith('sms_opt_out_at', {
      ascending: false,
      nullsFirst: false,
    });
  });

  it('inherits no opt-out date when the sibling carries none', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'granted', phone_e164: '+15551112222' },
      error: null,
    });
    const sibling = siblingBuilder({
      data: [{ id: 'party-9', sms_opt_out_at: null }],
      error: null,
    });
    from
      .mockReturnValueOnce({ select: currentRow.select })
      .mockReturnValueOnce({ select: sibling.select })
      .mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '5559876543' },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        sms_consent_status: 'opted_out',
        sms_opt_out_at: null,
      }),
    );
  });

  it('never lifts an opted-out party’s consent — the phone changes, the compliance record does not (F3-R2-01)', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'opted_out', phone_e164: '+15550001111' },
      error: null,
    });
    // opted_out never reaches the sibling check — only two `from` calls.
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-2',
      projectId: 'project-1',
      patch: { phone: '5551112222' },
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(builder.update).toHaveBeenCalledWith({ phone: '5551112222' });
    const patchArg = builder.update.mock.calls[0][0];
    expect(patchArg).not.toHaveProperty('sms_consent_status');
    expect(patchArg).not.toHaveProperty('sms_opt_out_at');
  });

  it('leaves a not_asked party’s consent columns alone on a phone change — nothing to revert', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'not_asked', phone_e164: '+15550001111' },
      error: null,
    });
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-5',
      projectId: 'project-1',
      patch: { phone: '5551112222' },
    });

    expect(builder.update).toHaveBeenCalledWith({ phone: '5551112222' });
  });

  it('does not touch consent when the phone patch normalizes to the same number already on file (F3-R2-03)', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'granted', phone_e164: '+15551112222' },
      error: null,
    });
    // Cosmetically reformatted — same digits as the E.164 on file — so no
    // sibling check should run either.
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '(555) 111-2222' },
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(builder.update).toHaveBeenCalledWith({ phone: '(555) 111-2222' });
    const patchArg = builder.update.mock.calls[0][0];
    expect(patchArg).not.toHaveProperty('sms_consent_status');
  });

  it('leaves consent columns untouched when the save never touches the phone', async () => {
    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-3',
      projectId: 'project-1',
      patch: { displayName: 'New Name' },
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(builder.update).toHaveBeenCalledWith({ display_name: 'New Name' });
    const patchArg = builder.update.mock.calls[0][0];
    expect(patchArg).not.toHaveProperty('sms_consent_status');
  });

  it('clears the phone (and still reverts a granted party’s consent) when the patch sets it to null', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'pending', phone_e164: '+15551234567' },
      error: null,
    });
    // nextE164 normalizes to null for a cleared phone — the sibling check
    // never runs (nothing to look up an opted-out match against).
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-4',
      projectId: 'project-1',
      patch: { phone: null },
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, sms_consent_status: 'not_asked' }),
    );
  });

  // 00281's normalizer derives phone_e164 from COALESCE(NEW.phone,
  // NEW.phone_e164), so a cleared phone alone leaves the old E.164 standing —
  // and that column is the inbound SMS conversation key.
  it('sends phone_e164: null alongside a cleared phone', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'not_asked', phone_e164: '+15551234567' },
      error: null,
    });
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-6',
      projectId: 'project-1',
      patch: { phone: '   ' },
    });

    expect(builder.update).toHaveBeenCalledWith({ phone: null, phone_e164: null });
  });

  it('does not send phone_e164 when the phone is set rather than cleared', async () => {
    const currentRow = currentRowBuilder({
      data: { sms_consent_status: 'not_asked', phone_e164: null },
      error: null,
    });
    from.mockReturnValueOnce({ select: currentRow.select }).mockReturnValueOnce(builder);

    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-7',
      projectId: 'project-1',
      patch: { phone: '5551234567' },
    });

    expect(builder.update).toHaveBeenCalledWith({ phone: '5551234567' });
  });
});
