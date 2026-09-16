// @vitest-environment node
/**
 * THE UNSUBSCRIBE LANDING (CRM-12, D-4, 00635) — the door an account-less
 * recipient has and nothing else.
 *
 * Until this file existed, `applyUnsubscribeToken`'s channel branch, the
 * cross-card address write, the `dead`-row skip, the unknown-channel answer
 * and `parseUnsubscribeSubject`'s whole "a channel token cannot be read as an
 * account token" rule were exercised by NOTHING: six suites in this folder,
 * none naming either function, and no *.test.ts anywhere in packages or apps
 * importing `applyUnsubscribeToken`. The brief's check "unsubscribe tokens
 * cannot cross subjects" could only be asserted by reading (W4 r3 MAJOR-2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyUnsubscribeToken } from '../unsubscribe';
import { generateUnsubscribeToken, parseUnsubscribeSubject } from '../tokens';

beforeAll(() => {
  process.env.UNSUBSCRIBE_TOKEN_SECRET =
    'test-secret-key-for-unit-tests-must-be-long-enough';
});
afterAll(() => {
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
});

const CHANNEL_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_CHANNEL_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'a0000000-0000-0000-0000-000000000004';

interface ChannelRow {
  id: string;
  value: string;
  channel_kind: string;
  status: string;
}

interface Recorded {
  tables: string[];
  channelUpdates: Array<{
    values: Record<string, unknown>;
    value: string | null;
    kinds: string[];
    statuses: string[];
  }>;
  prefInserts: Array<Record<string, unknown>>;
  prefUpdates: Array<{ values: Record<string, unknown>; userId: string | null }>;
  /** The second ledger campaign-dispatch reads (W4 r12 MAJOR-2). */
  profileUpdates: Array<{ values: Record<string, unknown>; email: string | null }>;
}

function blank(): Recorded {
  return {
    tables: [],
    channelUpdates: [],
    prefInserts: [],
    prefUpdates: [],
    profileUpdates: [],
  };
}

/**
 * The narrow surface `unsubscribe.ts` touches. Deliberately NOT a generic
 * stub: every filter the real code sends is recorded by column, so a write
 * that quietly widened (or narrowed) its predicate fails here by name.
 */
function fakeClient(
  channels: ChannelRow[],
  recorded: Recorded,
  opts: {
    prefRowExists?: boolean;
    channelReadError?: string;
    profileUpdateError?: string;
  } = {},
): SupabaseClient {
  return {
    from(table: string) {
      recorded.tables.push(table);
      if (table === 'studio_contact_channels') {
        return {
          select() {
            let id: string | null = null;
            const q = {
              eq(_col: string, v: string) {
                id = v;
                return q;
              },
              maybeSingle() {
                if (opts.channelReadError) {
                  return Promise.resolve({
                    data: null,
                    error: { message: opts.channelReadError },
                  });
                }
                const row = channels.find((c) => c.id === id) ?? null;
                return Promise.resolve({
                  data: row ? { id: row.id, value: row.value } : null,
                  error: null,
                });
              },
            };
            return q;
          },
          update(values: Record<string, unknown>) {
            const write = {
              values,
              value: null as string | null,
              kinds: [] as string[],
              statuses: [] as string[],
            };
            const q = {
              eq(col: string, v: string) {
                if (col === 'value') write.value = v;
                return q;
              },
              in(col: string, vals: string[]) {
                if (col === 'channel_kind') write.kinds = vals;
                if (col === 'status') write.statuses = vals;
                // The real builder resolves on await; the second `.in()` is
                // the last link, so this is the thenable.
                return q;
              },
              then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
                recorded.channelUpdates.push(write);
                for (const row of channels) {
                  if (row.value !== write.value) continue;
                  if (!write.kinds.includes(row.channel_kind)) continue;
                  if (!write.statuses.includes(row.status)) continue;
                  Object.assign(row, values);
                }
                return Promise.resolve(resolve({ data: null, error: null }));
              },
            };
            return q;
          },
        } as never;
      }
      if (table === 'profiles') {
        return {
          update(values: Record<string, unknown>) {
            return {
              // Recorded by column, like every other filter here: a write that
              // moved to another predicate fails by name rather than passing.
              eq: (col: string, v: string) => {
                recorded.profileUpdates.push({
                  values,
                  email: col === 'email' ? v : null,
                });
                return Promise.resolve({
                  data: null,
                  error: opts.profileUpdateError
                    ? { message: opts.profileUpdateError }
                    : null,
                });
              },
            };
          },
        } as never;
      }
      // notification_preferences
      return {
        select() {
          const q = {
            eq: () => q,
            maybeSingle: () =>
              Promise.resolve({
                data: opts.prefRowExists === false ? null : { id: 'pref-1' },
                error: null,
              }),
          };
          return q;
        },
        insert(payload: Record<string, unknown>) {
          recorded.prefInserts.push(payload);
          return Promise.resolve({ data: null, error: null });
        },
        update(values: Record<string, unknown>) {
          return {
            eq: (_col: string, v: string) => {
              recorded.prefUpdates.push({ values, userId: v });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      } as never;
    },
  } as unknown as SupabaseClient;
}

describe('parseUnsubscribeSubject', () => {
  it.each([
    ['a plain profile id', USER_ID, { kind: 'user', id: USER_ID }],
    [
      'a channel subject',
      `channel:${CHANNEL_ID}`,
      { kind: 'channel', id: CHANNEL_ID },
    ],
    // The prefix is the whole rule; a uuid that HAPPENS to be a channel id
    // carries no prefix and is still an account subject.
    ['a uuid that happens to be a channel id', CHANNEL_ID, {
      kind: 'user',
      id: CHANNEL_ID,
    }],
    ['an empty subject', '', { kind: 'user', id: '' }],
    // "channel" without the colon is not the prefix.
    ['a lookalike', 'channelish', { kind: 'user', id: 'channelish' }],
  ])('reads %s', (_name, sub, expected) => {
    expect(parseUnsubscribeSubject(sub as string)).toEqual(expected);
  });
});

describe('applyUnsubscribeToken — the channel branch (CRM-12 / D-4)', () => {
  it('marks EVERY email-kind row on the address, across cards and studios', async () => {
    const channels: ChannelRow[] = [
      // Studio A's card.
      { id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' },
      // Studio B's own card for the same mailbox — one person saying stop.
      { id: OTHER_CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'bounced' },
      // The firm's AP inbox, same address kind family.
      { id: 'ap-1', value: 'rosa@tcdrywall.test', channel_kind: 'ap_email', status: 'active' },
      // A different address is untouched.
      { id: 'other-addr', value: 'luis@tcdrywall.test', channel_kind: 'email', status: 'active' },
      // A PHONE on the same value space must never be caught by an email door.
      { id: 'sms-1', value: 'rosa@tcdrywall.test', channel_kind: 'sms', status: 'active' },
    ];
    const recorded = blank();
    const client = fakeClient(channels, recorded);
    const token = await generateUnsubscribeToken(
      `channel:${CHANNEL_ID}`,
      'all_marketing',
    );

    const outcome = await applyUnsubscribeToken(client, token);

    expect(outcome).toMatchObject({
      ok: true,
      status: 'applied',
      scope: 'address',
      columnUpdated: 'status',
    });
    expect(recorded.channelUpdates).toHaveLength(1);
    const write = recorded.channelUpdates[0];
    expect(write.value).toBe('rosa@tcdrywall.test');
    expect(write.kinds).toEqual(['email', 'ap_email']);
    expect(write.values).toMatchObject({ status: 'unsubscribed' });
    expect(typeof write.values.status_at).toBe('string');

    expect(channels.find((c) => c.id === CHANNEL_ID)?.status).toBe('unsubscribed');
    expect(channels.find((c) => c.id === OTHER_CHANNEL_ID)?.status).toBe('unsubscribed');
    expect(channels.find((c) => c.id === 'ap-1')?.status).toBe('unsubscribed');
    expect(channels.find((c) => c.id === 'other-addr')?.status).toBe('active');
    expect(channels.find((c) => c.id === 'sms-1')?.status).toBe('active');
  });

  it('leaves a `dead` row alone — dead is the worse fact and must not walk back', async () => {
    const channels: ChannelRow[] = [
      { id: CHANNEL_ID, value: 'dana@northgate.test', channel_kind: 'email', status: 'active' },
      { id: OTHER_CHANNEL_ID, value: 'dana@northgate.test', channel_kind: 'email', status: 'dead' },
    ];
    const recorded = blank();
    const token = await generateUnsubscribeToken(
      `channel:${CHANNEL_ID}`,
      'all_marketing',
    );

    await applyUnsubscribeToken(fakeClient(channels, recorded), token);

    expect(recorded.channelUpdates[0].statuses).toEqual(['active', 'bounced']);
    expect(channels.find((c) => c.id === OTHER_CHANNEL_ID)?.status).toBe('dead');
  });

  it('touches notification_preferences for nobody — an address has no account', async () => {
    const recorded = blank();
    const channels: ChannelRow[] = [
      { id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' },
    ];
    const token = await generateUnsubscribeToken(
      `channel:${CHANNEL_ID}`,
      'all_marketing',
    );

    await applyUnsubscribeToken(fakeClient(channels, recorded), token);

    expect(recorded.tables).toEqual([
      'studio_contact_channels',
      'studio_contact_channels',
      // The address ledger, not an account preference (W4 r12 MAJOR-2).
      'profiles',
    ]);
    expect(recorded.prefInserts).toHaveLength(0);
    expect(recorded.prefUpdates).toHaveLength(0);
  });

  /**
   * W4 r12 MAJOR-2 — `campaign-dispatch` never asks the channel gate: it posts
   * to Resend's batch endpoint and picks its audience from `profiles`
   * .eq('email_suppressed', false). An address that is both a typed channel and
   * a Patina account said stop here and was still mailed there.
   */
  it('suppresses the profile carrying the address, so the campaign rail stops too', async () => {
    const channels: ChannelRow[] = [
      { id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' },
    ];
    const recorded = blank();
    const token = await generateUnsubscribeToken(`channel:${CHANNEL_ID}`, 'po_sent');

    const outcome = await applyUnsubscribeToken(fakeClient(channels, recorded), token);

    expect(outcome).toMatchObject({ ok: true, status: 'applied', scope: 'address' });
    expect(recorded.profileUpdates).toHaveLength(1);
    const write = recorded.profileUpdates[0];
    expect(write.email).toBe('rosa@tcdrywall.test');
    expect(write.values).toMatchObject({ email_suppressed: true });
    expect(typeof write.values.email_suppressed_at).toBe('string');
  });

  it('answers error when the profile ledger cannot be written, rather than reporting a stop it did not finish', async () => {
    const channels: ChannelRow[] = [
      { id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' },
    ];
    const recorded = blank();
    const token = await generateUnsubscribeToken(`channel:${CHANNEL_ID}`, 'all_marketing');

    const outcome = await applyUnsubscribeToken(
      fakeClient(channels, recorded, { profileUpdateError: 'connection refused' }),
      token,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe('error');
    expect(outcome.message).toBe('connection refused');
    // The channel write still landed: this rail is idempotent and a retry
    // finishes the stop.
    expect(channels[0].status).toBe('unsubscribed');
  });

  it("answers 'invalid' for an unknown channel id, never 'error'", async () => {
    // The one-click endpoint must not tell a guesser which it was.
    const recorded = blank();
    const token = await generateUnsubscribeToken(
      `channel:${OTHER_CHANNEL_ID}`,
      'all_marketing',
    );

    const outcome = await applyUnsubscribeToken(fakeClient([], recorded), token);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe('invalid');
    expect(recorded.channelUpdates).toHaveLength(0);
  });

  /**
   * W4 r4 MAJOR-2 — the token's `type` is the LETTER's type (`po_sent`,
   * `invoice_sent`, `trade_rfq`), and the write ignores it: the whole address
   * stops. The outcome must therefore say what it did, or the landing prints
   * the narrow type as though the stop were scoped to it.
   */
  it("reports an address-wide scope whatever narrow type the letter carried", async () => {
    for (const type of ['po_sent', 'invoice_sent', 'trade_rfq'] as const) {
      const channels: ChannelRow[] = [
        { id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' },
        { id: 'ap-1', value: 'rosa@tcdrywall.test', channel_kind: 'ap_email', status: 'active' },
      ];
      const recorded = blank();
      const token = await generateUnsubscribeToken(`channel:${CHANNEL_ID}`, type as never);

      const outcome = await applyUnsubscribeToken(fakeClient(channels, recorded), token);

      expect(outcome.scope).toBe('address');
      expect(outcome.type).toBe(type);
      // The record backing the sentence: every email-kind row on the address.
      expect(channels.every((c) => c.status === 'unsubscribed')).toBe(true);
    }
  });

  it("answers 'error' when the read itself fails, so a broken table is not read as a bad link", async () => {
    const recorded = blank();
    const token = await generateUnsubscribeToken(
      `channel:${CHANNEL_ID}`,
      'all_marketing',
    );

    const outcome = await applyUnsubscribeToken(
      fakeClient([], recorded, { channelReadError: 'connection refused' }),
      token,
    );

    expect(outcome.status).toBe('error');
    expect(outcome.message).toBe('connection refused');
  });
});

describe('applyUnsubscribeToken — the account branch, and the line between them', () => {
  it('a plain-uuid token writes notification_preferences and touches no channel', async () => {
    const recorded = blank();
    const channels: ChannelRow[] = [
      // The same uuid IS a live channel id. It must not be reachable that way.
      { id: USER_ID, value: 'designer@patina.dev', channel_kind: 'email', status: 'active' },
    ];
    const token = await generateUnsubscribeToken(USER_ID, 'price_drop');

    const outcome = await applyUnsubscribeToken(
      fakeClient(channels, recorded),
      token,
    );

    expect(outcome).toMatchObject({
      ok: true,
      status: 'applied',
      userId: USER_ID,
      scope: 'account',
      columnUpdated: 'type_price_drop',
    });
    expect(recorded.tables).not.toContain('studio_contact_channels');
    expect(recorded.channelUpdates).toHaveLength(0);
    expect(channels[0].status).toBe('active');
    expect(recorded.prefUpdates).toEqual([
      { values: { type_price_drop: false }, userId: USER_ID },
    ]);
  });

  it('all_marketing clears channels_email, and a type with no column falls back to it', async () => {
    for (const [type, column] of [
      ['all_marketing', 'channels_email'],
      ['security_alert', 'channels_email'],
    ] as const) {
      const recorded = blank();
      const token = await generateUnsubscribeToken(USER_ID, type as never);
      const outcome = await applyUnsubscribeToken(fakeClient([], recorded), token);
      expect(outcome.columnUpdated).toBe(column);
      expect(recorded.prefUpdates[0].values).toEqual({ [column]: false });
    }
  });

  it('seeds a preferences row when the account has none, then applies the opt-out', async () => {
    const recorded = blank();
    const token = await generateUnsubscribeToken(USER_ID, 'weekly_inspiration');

    const outcome = await applyUnsubscribeToken(
      fakeClient([], recorded, { prefRowExists: false }),
      token,
    );

    expect(recorded.prefInserts).toEqual([{ user_id: USER_ID }]);
    expect(outcome.status).toBe('applied');
    expect(recorded.prefUpdates[0].values).toEqual({ type_weekly_inspiration: false });
  });

  it('a token that is not signed by us applies nothing at all', async () => {
    const recorded = blank();
    const outcome = await applyUnsubscribeToken(
      fakeClient(
        [{ id: CHANNEL_ID, value: 'rosa@tcdrywall.test', channel_kind: 'email', status: 'active' }],
        recorded,
      ),
      'not.a.token',
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe('invalid');
    expect(recorded.tables).toEqual([]);
  });
});
