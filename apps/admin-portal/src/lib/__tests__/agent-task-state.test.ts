import { isReviewable, decisionToStatus, validateReview } from '@/lib/agent-task-state';
import type { AgentTaskStatus } from '@patina/agent-queue';

describe('agent-task-state', () => {
  describe('isReviewable', () => {
    it('is true only for awaiting_review', () => {
      expect(isReviewable('awaiting_review')).toBe(true);
    });

    it('is false for every other status', () => {
      const others: AgentTaskStatus[] = [
        'queued',
        'running',
        'approved',
        'rejected',
        'done',
        'failed',
        'cancelled',
      ];
      for (const s of others) {
        expect(isReviewable(s)).toBe(false);
      }
    });
  });

  describe('decisionToStatus', () => {
    it('maps approved -> approved and rejected -> rejected', () => {
      expect(decisionToStatus('approved')).toBe('approved');
      expect(decisionToStatus('rejected')).toBe('rejected');
    });
  });

  describe('validateReview', () => {
    it('accepts an approval with no note', () => {
      expect(validateReview({ decision: 'approved' })).toEqual({ valid: true });
    });

    it('accepts an approval even with a note', () => {
      expect(validateReview({ decision: 'approved', note: 'looks good' })).toEqual({ valid: true });
    });

    it('rejects a rejection with no note', () => {
      const res = validateReview({ decision: 'rejected' });
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/note/i);
    });

    it('rejects a rejection with a whitespace-only note', () => {
      const res = validateReview({ decision: 'rejected', note: '   ' });
      expect(res.valid).toBe(false);
    });

    it('accepts a rejection with a real note', () => {
      expect(validateReview({ decision: 'rejected', note: 'not a fit' })).toEqual({ valid: true });
    });

    it('rejects an unknown decision', () => {
      // @ts-expect-error — exercising the runtime guard
      const res = validateReview({ decision: 'maybe' });
      expect(res.valid).toBe(false);
    });
  });
});
