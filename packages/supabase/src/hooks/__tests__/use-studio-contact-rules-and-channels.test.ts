/**
 * CR3-2 and CR3-3 — the two writes the Add sheet chains behind a seat.
 *
 * CR3-2 `useSetContactRule` is a FULL-ROW upsert, right for the person card's
 * editor (which round-trips every column it does not own) and wrong for a
 * caller that knows only part of the rule. 00626's
 * `apply_party_rolodex_link_trg` auto-links a new seat to an EXISTING card by
 * phone, so adding a repeat sub to a second job with a sentence typed in the
 * sheet erased that person's standing do-not-contact rule and the route behind
 * it. `merge: true` reads the standing row first.
 *
 * CR3-3 `useAddStudioContactChannel` was a bare `.insert()` against a UNIQUE
 * `(owner_id, channel_kind, value)` index, so the same repeat add raised 23505
 * and the sheet printed the index name on a face.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

interface TableScript {
  /** `.select(...).eq().eq().maybeSingle()` */
  read?: { data: unknown; error: unknown };
  /** `.upsert(row, opts).select().single()` / `.insert(row).select().single()` */
  write?: { data: unknown; error: unknown };
}

const scripts: Record<string, TableScript> = {};
const written: Record<string, unknown> = {};

function makeBuilder(table: string): MockBuilder {
  const builder: MockBuilder = {};
  const script = scripts[table] ?? {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(script.read ?? { data: null, error: null }),
  );
  builder.upsert = vi.fn((row: unknown) => {
    written[table] = row;
    return builder;
  });
  builder.insert = vi.fn((row: unknown) => {
    written[table] = row;
    return builder;
  });
  builder.single = vi.fn(() =>
    Promise.resolve(script.write ?? { data: { id: 'written' }, error: null }),
  );
  return builder;
}

const from = vi.fn((table: string) => makeBuilder(table));

/** CR-8: the rule write sends `set_by` itself, so it asks who is signed in —
 *  `set_by`'s DEFAULT auth.uid() fires on the INSERT leg alone, and the row
 *  kept its ORIGINAL setter while `set_at` moved to today. */
const SIGNED_IN_USER = 'user-priya';
const auth = {
  getUser: vi.fn(() =>
    Promise.resolve({ data: { user: { id: SIGNED_IN_USER } }, error: null }),
  ),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, auth }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import {
  useAddStudioContactChannel,
  useSetContactRule,
} from '../use-studio-contacts';

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> })
    .mutationFn;
}

const FRANKS_STANDING_RULE = {
  id: 'rule-frank',
  subject_type: 'person',
  subject_id: 'card-frank',
  channels_allowed: [],
  channels_forbidden: [
    'mobile',
    'office',
    'dispatch',
    'after_hours',
    'email',
    'ap_email',
    'sms',
  ],
  route_to_person_id: 'card-rosa',
  contact_hours: 'Weekdays 08:00 to 16:00.',
  escalation_by_class: { emergency: 'card-rosa' },
  reason: 'No direct contact, at his request. Write Rosa Delgado.',
};

beforeEach(() => {
  for (const key of Object.keys(scripts)) delete scripts[key];
  for (const key of Object.keys(written)) delete written[key];
  from.mockClear();
});

describe('CR3-2 — useSetContactRule merge mode', () => {
  it('carries a standing rule’s forbidden list, route and hours across a reason-only write', async () => {
    scripts.studio_contact_rules = {
      read: { data: FRANKS_STANDING_RULE, error: null },
    };
    const mutationFn = mutationFnOf(useSetContactRule());
    await mutationFn({
      subjectType: 'person',
      subjectId: 'card-frank',
      channelsForbidden: [],
      reason: 'Site kickoff, 12 Oct.',
      merge: true,
    });

    const row = written.studio_contact_rules as Record<string, unknown>;
    // The caller PASSED an empty forbidden list, so that one wins…
    expect(row.channels_forbidden).toEqual([]);
    // …but everything it said nothing about survives.
    expect(row.route_to_person_id).toBe('card-rosa');
    expect(row.contact_hours).toBe('Weekdays 08:00 to 16:00.');
    expect(row.escalation_by_class).toEqual({ emergency: 'card-rosa' });
    expect(row.reason).toBe('Site kickoff, 12 Oct.');
  });

  it('leaves every unspoken field of a standing rule exactly as it stands', async () => {
    scripts.studio_contact_rules = {
      read: { data: FRANKS_STANDING_RULE, error: null },
    };
    const mutationFn = mutationFnOf(useSetContactRule());
    await mutationFn({
      subjectType: 'person',
      subjectId: 'card-frank',
      contactHours: 'Weekends only.',
      merge: true,
    });

    const row = written.studio_contact_rules as Record<string, unknown>;
    expect(row.channels_forbidden).toEqual(
      FRANKS_STANDING_RULE.channels_forbidden,
    );
    expect(row.reason).toBe(FRANKS_STANDING_RULE.reason);
    expect(row.contact_hours).toBe('Weekends only.');
  });

  it('writes the plain empty defaults when there is no standing rule to merge', async () => {
    scripts.studio_contact_rules = { read: { data: null, error: null } };
    const mutationFn = mutationFnOf(useSetContactRule());
    await mutationFn({
      subjectType: 'person',
      subjectId: 'card-new',
      channelsForbidden: [],
      reason: 'Text only.',
      merge: true,
    });

    const row = written.studio_contact_rules as Record<string, unknown>;
    expect(row.channels_forbidden).toEqual([]);
    expect(row.channels_allowed).toEqual([]);
    expect(row.route_to_person_id).toBeNull();
    expect(row.contact_hours).toBeNull();
  });

  // The person card's editor is the caller merge mode is NOT for: it loads the
  // rule and round-trips every column, so a replace is what it means (CR-3).
  it('still replaces the whole row when merge is not asked for', async () => {
    scripts.studio_contact_rules = {
      read: { data: FRANKS_STANDING_RULE, error: null },
    };
    const mutationFn = mutationFnOf(useSetContactRule());
    await mutationFn({
      subjectType: 'person',
      subjectId: 'card-frank',
      reason: 'Text only.',
    });

    const row = written.studio_contact_rules as Record<string, unknown>;
    expect(row.channels_forbidden).toEqual([]);
    expect(row.route_to_person_id).toBeNull();
  });
});

describe('CR3-3 — useAddStudioContactChannel on a repeat person', () => {
  it('treats a duplicate as already on file and returns the standing row', async () => {
    const standing = {
      id: 'ch-frank-mobile',
      owner_id: 'card-frank',
      channel_kind: 'mobile',
      value: '(612) 555-0115',
      status: 'bounced',
      preferred: true,
    };
    scripts.studio_contact_channels = {
      write: {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "idx_studio_contact_channels_owner_kind_value"',
        },
      },
      read: { data: standing, error: null },
    };
    const mutationFn = mutationFnOf(useAddStudioContactChannel());
    const result = await mutationFn({
      ownerType: 'person',
      ownerId: 'card-frank',
      channelKind: 'mobile',
      value: '(612) 555-0115',
    });

    // A HELD channel is not a deleted one: nothing about the standing row moved.
    expect(result).toEqual(standing);
  });

  it('still throws anything that is not a duplicate', async () => {
    scripts.studio_contact_channels = {
      write: {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      },
    };
    const mutationFn = mutationFnOf(useAddStudioContactChannel());
    await expect(
      mutationFn({
        ownerType: 'person',
        ownerId: 'card-frank',
        channelKind: 'mobile',
        value: '(612) 555-0115',
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
