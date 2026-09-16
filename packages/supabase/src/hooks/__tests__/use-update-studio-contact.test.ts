/**
 * `useUpdateStudioContact` — clearing a phone must clear its E.164 derivation.
 *
 * studio_contacts runs 00281's `normalize_party_phone_e164()` trigger (00417),
 * whose body is `phone_e164 := normalize_phone_e164(COALESCE(NEW.phone,
 * NEW.phone_e164))`. On an UPDATE that sets phone to NULL the COALESCE falls
 * through to the OLD e164 and re-derives the same value, so the number the
 * studio just removed survives in the column the rolodex dedupes on. The patch
 * has to name both columns.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

/** `.update(updates).eq('id', …).select('*').single()` */
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

import { useUpdateStudioContact } from '../use-studio-contacts';

beforeEach(() => {
  builder = makeBuilder({ data: { id: 'contact-1' }, error: null });
  from.mockClear();
});

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn;
}

describe('useUpdateStudioContact — phone_e164 follows the raw phone', () => {
  it('sends phone_e164: null when the phone is cleared to null', async () => {
    const mutationFn = mutationFnOf(useUpdateStudioContact());
    await mutationFn({ id: 'contact-1', organizationId: 'org-1', phone: null });

    expect(builder.update).toHaveBeenCalledWith({ phone: null, phone_e164: null });
  });

  // A space-only phone is an emptied field, not a number: stored as '   ' the
  // row reads as "has a phone" to anything testing `phone != null` while
  // carrying nothing dialable. useUpdateProjectParty writes the same
  // normalizer's other table this way already.
  it('stores a whitespace-only phone as null, with its e164', async () => {
    const mutationFn = mutationFnOf(useUpdateStudioContact());
    await mutationFn({ id: 'contact-1', organizationId: 'org-1', phone: '   ' });

    expect(builder.update).toHaveBeenCalledWith({ phone: null, phone_e164: null });
  });

  it('leaves phone_e164 to the trigger when a real number is set', async () => {
    const mutationFn = mutationFnOf(useUpdateStudioContact());
    await mutationFn({
      id: 'contact-1',
      organizationId: 'org-1',
      phone: '(555) 123-4567',
    });

    expect(builder.update).toHaveBeenCalledWith({ phone: '(555) 123-4567' });
  });

  it('trims a number the studio typed with stray spaces', async () => {
    const mutationFn = mutationFnOf(useUpdateStudioContact());
    await mutationFn({
      id: 'contact-1',
      organizationId: 'org-1',
      phone: '  (555) 123-4567 ',
    });

    expect(builder.update).toHaveBeenCalledWith({ phone: '(555) 123-4567' });
  });

  it('never names phone_e164 on a patch that does not touch the phone', async () => {
    const mutationFn = mutationFnOf(useUpdateStudioContact());
    await mutationFn({
      id: 'contact-1',
      organizationId: 'org-1',
      fullName: 'Sal Moretti',
    });

    expect(builder.update).toHaveBeenCalledWith({ full_name: 'Sal Moretti' });
  });
});
