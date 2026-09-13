/**
 * Three writes that told the room something untrue after they landed.
 *
 * CR-4 `useUpdateSiteAccessCard` stamped `changed_at` / `changed_by` and
 * cleared `told_refs` on EVERY write, before it looked at which field the
 * caller passed — and the site access card routes seven acts through it. So
 * logging who was told and then adding a gas company's phone number restamped
 * "The way in changed 13 Sep 2026, by <me>." over the lockbox and destroyed the
 * notice that had just been recorded, with no undo.
 *
 * CR-5 `useRevokeFieldLink` invalidated the link list alone, so the Directory
 * row, the seat line and every roster row went on printing reach `Field link`
 * for a door that was already shut.
 *
 * CR-6 `useAddProjectParty` calls `record_channel_invite` — it MOVES the
 * consent ledger — and never invalidated it, so the Directory's consent clause
 * and the person card's verdict stayed stale beside a word that had flipped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

const upserted: { current: Record<string, unknown> | null } = { current: null };
const inserted: { current: Record<string, unknown> | null } = { current: null };

function makeBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  builder.upsert = vi.fn((row: Record<string, unknown>) => {
    upserted.current = row;
    return builder;
  });
  builder.insert = vi.fn((row: Record<string, unknown>) => {
    inserted.current = row;
    return builder;
  });
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(() =>
    Promise.resolve({
      data: { id: 'row-1', project_id: 'proj-okonkwo' },
      error: null,
    }),
  );
  return builder;
}

const from = vi.fn(() => makeBuilder());
const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
const getUser = vi.fn(() =>
  Promise.resolve({ data: { user: { id: 'user-me' } }, error: null }),
);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc, auth: { getUser } }),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useAddProjectParty, useUpdateSiteAccessCard } from '../use-coordination';
import { useRevokeFieldLink } from '../use-party-sms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hookOf = (hook: any) => hook as {
  mutationFn: (input: unknown) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess: (data: any, input: any) => void;
};

/** Every key the fan-out touched, flattened to strings for containment tests. */
function invalidatedKeys(): string[] {
  return invalidateQueries.mock.calls.map((call) =>
    JSON.stringify((call[0] as { queryKey: unknown }).queryKey),
  );
}

beforeEach(() => {
  upserted.current = null;
  inserted.current = null;
  invalidateQueries.mockClear();
  rpc.mockClear();
});

describe('CR-4 — only the way in restamps the card', () => {
  it('a lockbox change stamps who changed it and clears who was told', async () => {
    await hookOf(useUpdateSiteAccessCard()).mutationFn({
      projectId: 'proj-okonkwo',
      lockboxVersion: '4417',
    });
    expect(upserted.current).toMatchObject({
      project_id: 'proj-okonkwo',
      lockbox_version: '4417',
      changed_by: 'user-me',
      told_refs: [],
    });
    expect(upserted.current?.changed_at).toEqual(expect.any(String));
  });

  it('the alarm and the key holder are the way in too', async () => {
    await hookOf(useUpdateSiteAccessCard()).mutationFn({
      projectId: 'proj-okonkwo',
      keyHolderEngagementId: 'seat-luis',
    });
    expect(upserted.current).toHaveProperty('told_refs', []);

    upserted.current = null;
    await hookOf(useUpdateSiteAccessCard()).mutationFn({
      projectId: 'proj-okonkwo',
      alarmRef: 'panel by the back door',
    });
    expect(upserted.current).toHaveProperty('told_refs', []);
  });

  it('an emergency line, the hours, the notes and receiving are NOT', async () => {
    for (const patch of [
      { emergencyLines: [{ label: 'Gas', phone: '(612) 555-0199' }] },
      { siteHours: '7am to 4pm, weekdays' },
      { siteNotes: 'Park on the alley side.' },
      { receiverInstructions: 'Leave crates in the garage.' },
    ]) {
      upserted.current = null;
      await hookOf(useUpdateSiteAccessCard()).mutationFn({
        projectId: 'proj-okonkwo',
        ...patch,
      });
      expect(upserted.current).not.toHaveProperty('told_refs');
      expect(upserted.current).not.toHaveProperty('changed_at');
      expect(upserted.current).not.toHaveProperty('changed_by');
    }
  });

  it('starting the card claims nothing about a lockbox nobody has written', async () => {
    await hookOf(useUpdateSiteAccessCard()).mutationFn({
      projectId: 'proj-okonkwo',
    });
    expect(upserted.current).toEqual({ project_id: 'proj-okonkwo' });
  });
});

describe('CR-5 — the reach word shuts with the door', () => {
  it('a revoke moves every read model the mint moves', () => {
    hookOf(useRevokeFieldLink()).onSuccess(true, {
      tokenId: 'tok-1',
      partyId: 'seat-dana',
      projectId: 'proj-okonkwo',
    });
    const keys = invalidatedKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['access-grants']),
        JSON.stringify(['people-directory']),
        JSON.stringify(['people-directory-seats']),
        JSON.stringify(['project-roster', 'proj-okonkwo']),
      ]),
    );
  });
});

describe('CR-6 — the add door moves the consent ledger it wrote to', () => {
  it('invalidates the consent root beside the roster keys', () => {
    hookOf(useAddProjectParty()).onSuccess(
      { id: 'seat-1', project_id: 'proj-okonkwo' },
      { projectId: 'proj-okonkwo' },
    );
    expect(invalidatedKeys()).toContain(JSON.stringify(['channel-consent']));
  });
});
