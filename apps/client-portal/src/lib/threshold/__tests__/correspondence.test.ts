// Pinned BEFORE the imports, for the same reason derive.test.ts pins it: the
// letters carry timestamptz moments, and a UTC-only runner hides the seam.
process.env.TZ = 'America/Chicago';

import type { CommsMessage, InboxNotification, ThreadSummary } from '@patina/supabase';

import { deriveThreshold, type ThresholdInput } from '../derive';
import {
  letterMoments,
  noticeAnchor,
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
    metadata: { project_id: PROJECT },
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

  it('keeps what came with the letter, named the way /messages named it', () => {
    const letters = toLetters(
      [
        message({
          id: 'm-1',
          attachments: [
            { storage_path: 'proj/vale/elevation.pdf', mime: 'application/pdf', size: 12 },
            {
              storage_path: 'proj/vale/x.jpg',
              mime: 'image/jpeg',
              size: 12,
              filename: 'Sconce, as found.jpg',
            },
          ],
        }),
      ],
      READER,
    );
    expect(letters[0].enclosures).toEqual([
      { id: 'm-1-att-0', name: 'elevation.pdf' },
      { id: 'm-1-att-1', name: 'Sconce, as found.jpg' },
    ]);
  });
});

describe('letterMoments', () => {
  it('reports every surviving letter’s moment', () => {
    expect(
      letterMoments(
        [
          message({ id: 'm-1', created_at: '2026-08-04T09:00:00.000Z' }),
          message({ id: 'm-2', created_at: '2026-08-05T09:00:00.000Z', deleted_at: '2026-08-06' }),
        ],
        READER,
      ),
    ).toEqual(['2026-08-04T09:00:00.000Z']);
  });

  it('never counts the reader’s own hand as something that changed', () => {
    expect(
      letterMoments(
        [
          message({ id: 'm-mine', sender_id: READER, created_at: '2026-08-05T09:00:00.000Z' }),
          message({ id: 'm-theirs', created_at: '2026-08-04T09:00:00.000Z' }),
        ],
        READER,
      ),
    ).toEqual(['2026-08-04T09:00:00.000Z']);
  });

  it('counts only what actually prints as a letter', () => {
    expect(
      letterMoments(
        [
          message({ id: 'm-sys', system: true, created_at: '2026-08-05T09:00:00.000Z' }),
          message({ id: 'm-blank', body: '  ', created_at: '2026-08-06T09:00:00.000Z' }),
          message({ id: 'm-keep', created_at: '2026-08-04T09:00:00.000Z' }),
        ],
        READER,
      ),
    ).toEqual(['2026-08-04T09:00:00.000Z']);
  });
});

describe('noticeAnchor', () => {
  it('lands a retired route on the region of this page that answers for it', () => {
    expect(noticeAnchor('/invoices/inv-4')).toBe('#letterbox');
    expect(noticeAnchor('/projects/proj-vale/reviews/ed-1')).toBe('#doorstep');
    expect(noticeAnchor('/scans/scan-2')).toBe('#mat');
  });

  it('drops a link with no home here rather than faking one', () => {
    expect(noticeAnchor('/projects/proj-vale')).toBeNull();
    expect(noticeAnchor('https://patina.cloud/invoices/inv-4')).toBeNull();
    expect(noticeAnchor(null)).toBeNull();
  });
});

describe('toNotices', () => {
  it('titles a notice the way /inbox did, newest first', () => {
    const notices = toNotices(
      [
        notification({
          id: 'n-1',
          metadata: { project_id: PROJECT, subject: 'Invoice No. 4 is ready' },
        }),
        notification({
          id: 'n-2',
          type: 'proposal_sent',
          metadata: { project_id: PROJECT },
          created_at: '2026-08-03T09:00:00.000Z',
        }),
      ],
      PROJECT,
    );
    expect(notices.map((notice) => [notice.id, notice.label])).toEqual([
      ['n-2', 'Proposal Sent'],
      ['n-1', 'Invoice No. 4 is ready'],
    ]);
  });

  it('prefers subject, then headline, then title', () => {
    expect(
      toNotices(
        [
          notification({
            id: 'n-1',
            metadata: { project_id: PROJECT, headline: 'Head', title: 'Title' },
          }),
        ],
        PROJECT,
      )[0].label,
    ).toBe('Head');
  });

  it('files a notice under the house it names, and no other', () => {
    const notices = toNotices(
      [
        notification({ id: 'n-mine', metadata: { project_id: PROJECT } }),
        notification({ id: 'n-theirs', metadata: { project_id: 'proj-other' } }),
        notification({ id: 'n-nowhere', metadata: {} }),
      ],
      PROJECT,
    );
    expect(notices.map((notice) => notice.id)).toEqual(['n-mine']);
  });

  it('reads the house out of the deep link where the metadata does not name it', () => {
    const notices = toNotices(
      [
        notification({
          id: 'n-1',
          metadata: { deep_link: `/projects/${PROJECT}/reviews/ed-1` },
        }),
      ],
      PROJECT,
    );
    expect(notices.map((notice) => [notice.id, notice.anchor])).toEqual([['n-1', '#doorstep']]);
  });

  it('keeps /inbox’s body preview, so two of a type are told apart', () => {
    const notices = toNotices(
      [
        notification({
          id: 'n-1',
          type: 'proposal_sent',
          metadata: { project_id: PROJECT, preview: 'The furnishings authorization.' },
        }),
        notification({
          id: 'n-2',
          type: 'proposal_sent',
          metadata: { project_id: PROJECT },
          created_at: '2026-08-01T09:00:00.000Z',
        }),
      ],
      PROJECT,
    );
    expect(notices[0].detail).toBe('The furnishings authorization.');
    expect(notices[1].detail).toBeNull();
  });

  it('reports which notices the reader has not been marked on', () => {
    const notices = toNotices(
      [
        notification({ id: 'n-read', metadata: { project_id: PROJECT, read_at: '2026-08-03' } }),
        notification({
          id: 'n-unread',
          metadata: { project_id: PROJECT },
          created_at: '2026-08-01T09:00:00.000Z',
        }),
      ],
      PROJECT,
    );
    expect(notices.map((notice) => [notice.id, notice.unread])).toEqual([
      ['n-read', false],
      ['n-unread', true],
    ]);
  });

  it('is empty with nothing to print', () => {
    expect(toNotices(undefined, PROJECT)).toEqual([]);
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

  const STANDING = {
    id: 'note-1',
    body: 'A line to you.',
    state: 'standing' as const,
    sentAt: '2026-07-01T09:00:00.000Z',
    retiredAt: null,
    enclosures: [],
  };

  it('ticks note and previously for a letter sent since the last reading', () => {
    const model = deriveThreshold(
      input({ notes: [STANDING], messageSentAts: ['2026-08-04T09:00:00.000Z'] }),
    );
    expect(model.changed.has('note')).toBe(true);
    expect(model.changed.has('previously')).toBe(true);
  });

  it('ticks only previously where no note is standing to be answered', () => {
    const model = deriveThreshold(input({ messageSentAts: ['2026-08-04T09:00:00.000Z'] }));
    expect(model.changed.has('note')).toBe(false);
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
    expect(deriveThreshold(input({ notes: [STANDING] })).changed.has('note')).toBe(false);
    expect(deriveThreshold(input()).changed.has('previously')).toBe(false);
  });
});
