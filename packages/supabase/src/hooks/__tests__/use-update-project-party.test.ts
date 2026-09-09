/**
 * F3-R1-02 / F3-R1-12 — `useUpdateProjectParty`'s phone-change consent reset.
 *
 * A field-party edit that changes the phone number must revert SMS consent to
 * `not_asked` regardless of the prior state: a `granted` party must not keep a
 * texting-enabled state for a number that never consented (F3-R1-02), and an
 * `opted_out` party's new number — which never opted out — must not be
 * stranded un-inviteable behind the old one's STOP (F3-R1-12). A save that
 * never touches the phone must leave consent columns untouched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

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
  it('reverts a granted party to not_asked when the phone changes (F3-R1-02)', async () => {
    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-1',
      projectId: 'project-1',
      patch: { phone: '5559876543' },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '5559876543',
        sms_consent_status: 'not_asked',
        sms_consent_source: null,
        sms_consent_evidence: null,
        sms_consent_recorded_at: null,
        sms_consent_recorded_by: null,
        sms_consent_disclosure_version: null,
      }),
    );
  });

  it('reverts an opted-out party to not_asked too, so the new number can be invited (F3-R1-12)', async () => {
    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-2',
      projectId: 'project-1',
      patch: { phone: '5551112222' },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ sms_consent_status: 'not_asked' }),
    );
  });

  it('leaves consent columns untouched when the save never touches the phone', async () => {
    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-3',
      projectId: 'project-1',
      patch: { displayName: 'New Name' },
    });

    expect(builder.update).toHaveBeenCalledWith({ display_name: 'New Name' });
    const patchArg = builder.update.mock.calls[0][0];
    expect(patchArg).not.toHaveProperty('sms_consent_status');
  });

  it('clears the phone (and still reverts consent) when the patch sets it to null', async () => {
    const mutationFn = mutationFnOf(useUpdateProjectParty());
    await mutationFn({
      id: 'party-4',
      projectId: 'project-1',
      patch: { phone: null },
    });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, sms_consent_status: 'not_asked' }),
    );
  });
});
