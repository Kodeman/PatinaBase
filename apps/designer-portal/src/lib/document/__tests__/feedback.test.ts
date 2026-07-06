import {
  BUCKETS,
  STATUSES,
  bucketMeta,
  statusMeta,
  weightDots,
  screenNameFromPath,
  captureContext,
  buildTimeline,
} from '../feedback';
import type { FeedbackEvent } from '@patina/supabase';

function statusEvent(to: string, when: string): FeedbackEvent {
  return {
    id: `e-${to}`,
    feedback_id: 'f1',
    created_at: when,
    actor: 'a1',
    kind: 'status_change',
    payload: { from: 'noted', to },
  };
}

describe('feedback vocabulary', () => {
  it('has the four buckets and four statuses', () => {
    expect(BUCKETS.map((b) => b.key)).toEqual(['working', 'not_working', 'missing', 'change']);
    expect(STATUSES.map((s) => s.key)).toEqual(['noted', 'building', 'shipped', 'archived']);
  });

  it('maps bucket + status keys to their meta', () => {
    expect(bucketMeta('missing').label).toBe('Missing');
    expect(bucketMeta('not_working').glyph).toBe('✕');
    expect(statusMeta('shipped').label).toBe('Shipped');
  });
});

describe('weightDots', () => {
  it('ranks high/med/low and treats absent as zero', () => {
    expect(weightDots('high')).toBe(3);
    expect(weightDots('med')).toBe(2);
    expect(weightDots('low')).toBe(1);
    expect(weightDots(null)).toBe(0);
    expect(weightDots(undefined)).toBe(0);
  });
});

describe('screenNameFromPath', () => {
  it('names the document surfaces', () => {
    expect(screenNameFromPath('/desk')).toBe('The Desk');
    expect(screenNameFromPath('/library/personal')).toBe('Library');
    expect(screenNameFromPath('/drafting/abc')).toBe('Drafting Room');
    expect(screenNameFromPath('/doc/xyz')).toBe('Document');
    expect(screenNameFromPath('/people')).toBe('People');
  });

  it('title-cases an unknown leaf and falls back to Portal', () => {
    expect(screenNameFromPath('/some/room-schedule')).toBe('Room schedule');
    expect(screenNameFromPath('')).toBe('Portal');
  });
});

describe('captureContext', () => {
  it('derives screen_name + route from the pathname with a version fallback', () => {
    const ctx = captureContext('/projects/kilkenny/schedule');
    expect(ctx.route).toBe('/projects/kilkenny/schedule');
    expect(ctx.screen_name).toBe('Schedule');
    expect(ctx.app_version).toBe(process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev');
    expect(ctx.viewport).toMatch(/^\d+x\d+$/);
  });
});

describe('buildTimeline', () => {
  it('starts at Noted and marks it now when nothing has moved', () => {
    const tl = buildTimeline('2026-07-01T00:00:00Z', 'noted', []);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ label: 'Noted', now: true });
  });

  it('appends each status_change in order, last is now', () => {
    const events = [
      statusEvent('building', '2026-07-02T00:00:00Z'),
      statusEvent('shipped', '2026-07-03T00:00:00Z'),
    ];
    const tl = buildTimeline('2026-07-01T00:00:00Z', 'shipped', events);
    expect(tl.map((e) => e.label)).toEqual(['Noted', 'Building', 'Shipped']);
    expect(tl[2].now).toBe(true);
    expect(tl[0].now).toBe(false);
  });

  it('reconciles a status that has no matching final transition', () => {
    const tl = buildTimeline('2026-07-01T00:00:00Z', 'archived', [
      statusEvent('building', '2026-07-02T00:00:00Z'),
    ]);
    expect(tl[tl.length - 1]).toMatchObject({ label: 'Archived', now: true });
  });
});
