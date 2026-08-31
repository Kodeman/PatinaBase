import { describe, expect, it } from 'vitest';
import { summarizeBoardVerdicts } from '../board-verdicts';

describe('summarizeBoardVerdicts', () => {
  it('counts only the latest verdict for each client on each pin', () => {
    expect(
      summarizeBoardVerdicts([
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: 'client-1',
              verdict: 'rejected',
              created_at: '2026-08-01T10:00:00Z',
            },
            {
              id: 'feedback-2',
              client_id: 'client-1',
              verdict: 'approved',
              created_at: '2026-08-02T10:00:00Z',
            },
          ],
        },
        {
          verdicts: [
            {
              id: 'feedback-3',
              client_id: 'client-1',
              verdict: 'comment',
              created_at: '2026-08-03T10:00:00Z',
            },
            {
              id: 'feedback-4',
              client_id: 'client-2',
              verdict: 'rejected',
              created_at: '2026-08-03T11:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 1, rejected: 1, comment: 1, total: 3 });
  });

  it('counts a guest link as its own author and keeps its latest tap', () => {
    expect(
      summarizeBoardVerdicts([
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: 'client-1',
              verdict: 'approved',
              created_at: '2026-08-01T10:00:00Z',
            },
            {
              id: 'feedback-2',
              client_id: null,
              guest_share_id: 'share-1',
              verdict: 'rejected',
              created_at: '2026-08-01T11:00:00Z',
            },
            {
              id: 'feedback-3',
              client_id: null,
              guest_share_id: 'share-1',
              verdict: 'approved',
              created_at: '2026-08-01T12:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 2, rejected: 0, comment: 0, total: 2 });
  });

  it('drops a row that names neither a client nor a share', () => {
    expect(
      summarizeBoardVerdicts([
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: null,
              guest_share_id: null,
              verdict: 'approved',
              created_at: '2026-08-01T10:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 0, rejected: 0, comment: 0, total: 0 });
  });

  it('ignores unknown values and empty item projections', () => {
    expect(
      summarizeBoardVerdicts([
        {},
        {
          verdicts: [
            {
              id: 'feedback-1',
              client_id: 'client-1',
              verdict: 'pending',
              created_at: '2026-08-01T10:00:00Z',
            },
          ],
        },
      ]),
    ).toEqual({ approved: 0, rejected: 0, comment: 0, total: 0 });
  });
});
