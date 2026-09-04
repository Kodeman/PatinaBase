// Pinned BEFORE the imports, for the same reason derive.test.ts pins it: the
// letters carry timestamptz moments, and a UTC-only runner hides the seam.
process.env.TZ = 'America/Chicago';

import type { CommsMessage, InboxNotification, ThreadSummary } from '@patina/supabase';

import { deriveThreshold, type ThresholdInput } from '../derive';
import {
  letterMoments,
  pickProjectThread,
  toLetters,
  toNotices,
} from '../correspondence';

const PROJECT = 'proj-vale';
const READER = 'user-harper';

function thread(over: Partial<ThreadSummary> & { id: string }): ThreadSummary {
  return {
    kind: 'project',
    project_id: PROJECT,
    proposal_id: null,
    title: null,
    created_by: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-08-04T09:00:00.000Z',
    last_message_at: '2026-08-04T09:00:00.000Z',
    metadata: {},
    participants: [],
    last_message: null,
    unread_count: 0,
    my_participant: null,
    ...over,
  };
}

function message(over: Partial<CommsMessage> & { id: string }): CommsMessage {
  return {
    thread_id: 'thr-1',
    sender_id: 'user-nora',
    body: 'The sconces ship Friday.',
    attachments: [],
    reply_to_message_id: null,
    decision_id: null,
    mentions: [],
    system: false,
    created_at: '2026-08-04T09:00:00.000Z',
    edited_at: null,
    deleted_at: null,
    sender: { id: 'user-nora', full_name: 'Nora Quist', avatar_url: null },
    ...over,
  };
}

function notification(
  over: Partial<InboxNotification> & { id: string },
): InboxNotification {
  return {
    user_id: READER,
    type: 'invoice_sent',
    channel: 'email',
    status: 'sent',
    template_id: null,
    metadata: {},
    opened_at: null,
    clicked_at: null,
    sent_at: '2026-08-02T09:00:00.000Z',
    created_at: '2026-08-02T09:00:00.000Z',
    ...over,
  };
}

describe('pickProjectThread', () => {
  it('takes only threads filed under this house', () => {
    const picked = pickProjectThread(
      [thread({ id: 'thr-other', project_id: 'proj-other' })],
      PROJECT,
    );
    expect(picked).toBeNull();
  });

  it('prefers the thread the studio opened for the project over a direct one', () => {
    const picked = pickProjectThread(
      [
        thread({ id: 'thr-direct', kind: 'direct', last_message_at: '2026-08-09T00:00:00.000Z' }),
        thread({ id: 'thr-project', kind: 'project', last_message_at: '2026-08-01T00:00:00.000Z' }),
      ],
      PROJECT,
    );
    expect(picked?.id).toBe('thr-project');
  });

  it('takes the most recently spoken-in when the house has two of a kind', () => {
    const picked = pickProjectThread(
      [
        thread({ id: 'thr-old', last_message_at: '2026-07-01T00:00:00.000Z' }),
        thread({ id: 'thr-new', last_message_at: '2026-08-04T09:00:00.000Z' }),
      ],
      PROJECT,
    );
    expect(picked?.id).toBe('thr-new');
  });

  it('is null with nothing to pick from', () => {
    expect(pickProjectThread(undefined, PROJECT)).toBeNull();
    expect(pickProjectThread([], PROJECT)).toBeNull();
  });
});

describe('toLetters', () => {
  it('marks the reader’s own hand and every other hand as the studio’s', () => {
    const letters = toLetters(
      [
        message({ id: 'm-1', sender_id: 'user-nora' }),
        message({
          id: 'm-2',
          sender_id: READER,
          body: 'Friday works.',
          created_at: '2026-08-04T11:00:00.000Z',
        }),
      ],
      READER,
    );
    expect(letters.map((letter) => [letter.id, letter.from])).toEqual([
      ['m-2', 'you'],
      ['m-1', 'studio'],
    ]);
    expect(letters.find((letter) => letter.id === 'm-1')?.authorName).toBe('Nora Quist');
  });

  it('drops deleted, system and empty letters', () => {
    const letters = toLetters(
      [
        message({ id: 'm-del', deleted_at: '2026-08-05T00:00:00.000Z' }),
        message({ id: 'm-sys', system: true }),
        message({ id: 'm-blank', body: '   ' }),
        message({ id: 'm-keep' }),
      ],
      READER,
    );
    expect(letters.map((letter) => letter.id)).toEqual(['m-keep']);
  });

  it('reads newest first, the order Previously keeps', () => {
    const letters = toLetters(
      [
        message({ id: 'm-old', created_at: '2026-07-01T09:00:00.000Z' }),
        message({ id: 'm-new', created_at: '2026-08-04T09:00:00.000Z' }),
      ],
      READER,
    );
    expect(letters.map((letter) => letter.id)).toEqual(['m-new', 'm-old']);
  });

  it('calls an unsigned-in reader’s letters the studio’s rather than guessing', () => {
    const letters = toLetters([message({ id: 'm-1', sender_id: READER })], null);
    expect(letters[0].from).toBe('studio');
  });
});

describe('letterMoments', () => {
  it('reports every surviving letter’s moment', () => {
    expect(
      letterMoments([
        message({ id: 'm-1', created_at: '2026-08-04T09:00:00.000Z' }),
        message({ id: 'm-2', created_at: '2026-08-05T09:00:00.000Z', deleted_at: '2026-08-06' }),
      ]),
    ).toEqual(['2026-08-04T09:00:00.000Z']);
  });
});

describe('toNotices', () => {
  it('titles a notice the way /inbox did, newest first', () => {
    const notices = toNotices([
      notification({ id: 'n-1', metadata: { subject: 'Invoice No. 4 is ready' } }),
      notification({
        id: 'n-2',
        type: 'proposal_sent',
        metadata: {},
        created_at: '2026-08-03T09:00:00.000Z',
      }),
    ]);
    expect(notices.map((notice) => [notice.id, notice.label])).toEqual([
      ['n-2', 'Proposal Sent'],
      ['n-1', 'Invoice No. 4 is ready'],
    ]);
  });

  it('prefers subject, then headline, then title', () => {
    expect(
      toNotices([notification({ id: 'n-1', metadata: { headline: 'Head', title: 'Title' } })])[0]
        .label,
    ).toBe('Head');
  });

  it('is empty with nothing to print', () => {
    expect(toNotices(undefined)).toEqual([]);
  });
});

describe('deriveThreshold — a letter ticks the note and the record', () => {
  function input(over: Partial<ThresholdInput> = {}): ThresholdInput {
    return {
      rooms: [{ id: 'r-lib', name: 'Library', sortOrder: 0, floorAreaSqft: null }],
      selections: { origin: 'commercial', selections: [] },
      proposals: { signatureGates: [], instrumentReceipts: [] },
      invoices: [],
      approvals: [],
      notes: [],
      previousReadAt: '2026-08-01T00:00:00.000Z',
      today: new Date(2026, 7, 5),
      ...over,
    };
  }

  it('ticks note and previously for a letter sent since the last reading', () => {
    const model = deriveThreshold(input({ messageSentAts: ['2026-08-04T09:00:00.000Z'] }));
    expect(model.changed.has('note')).toBe(true);
    expect(model.changed.has('previously')).toBe(true);
  });

  it('ticks neither for a letter older than the mark', () => {
    const model = deriveThreshold(input({ messageSentAts: ['2026-07-04T09:00:00.000Z'] }));
    expect(model.changed.has('note')).toBe(false);
    expect(model.changed.has('previously')).toBe(false);
  });

  it('ticks nothing on a first reading, letters and all', () => {
    const model = deriveThreshold(
      input({ previousReadAt: null, messageSentAts: ['2026-08-04T09:00:00.000Z'] }),
    );
    expect(model.changed.size).toBe(0);
  });

  it('stands unchanged when no letters are given at all', () => {
    expect(deriveThreshold(input()).changed.has('note')).toBe(false);
  });
});
