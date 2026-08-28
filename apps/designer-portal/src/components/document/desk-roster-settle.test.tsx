/**
 * R126 — the one orchestrated moment. Its own file because the guard is a
 * module-level flag: a suite that rendered the roster earlier would have
 * spent it, and this is exactly the behaviour under test.
 */

import { render } from '@testing-library/react';
import type { DeskRoster as DeskRosterModel } from '@/lib/document/desk-roster-derivation';
import { DeskRoster } from './desk-roster';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function roster(): DeskRosterModel {
  return {
    heading: 'Every job · 3 live · 0 overdue',
    overdueLine: 'Nothing is overdue.',
    liveCount: 3,
    overdueCount: 0,
    groups: [
      {
        key: 'brief',
        label: 'Brief',
        count: 2,
        lines: [
          {
            engagementId: 'chen',
            name: 'Full Room',
            state: 'Sarah Chen · new lead',
            overdueText: null,
            mark: 'quiet',
            needKind: 'new_lead',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/chen',
            act: { label: 'Open the job', href: '/doc/chen' },
          },
          {
            engagementId: 'tanaka',
            name: 'Full Room',
            state: 'Lily Tanaka · new lead',
            overdueText: null,
            mark: 'quiet',
            needKind: 'new_lead',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/tanaka',
            act: { label: 'Open the job', href: '/doc/tanaka' },
          },
        ],
      },
      {
        key: 'project',
        label: 'Project',
        count: 1,
        lines: [
          {
            engagementId: 'vandersteen',
            name: 'Vandersteen residence',
            state: 'Anne Vandersteen · procurement',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/vandersteen',
            act: { label: 'Open the job', href: '/doc/vandersteen' },
          },
        ],
      },
    ],
  };
}

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-roster-line]'),
  );
}

describe('DeskRoster — the roster settles once per page load', () => {
  it('settles on the first mount, staggering by the row’s own index', () => {
    const { container, unmount } = render(<DeskRoster roster={roster()} />);

    const settled = rows(container);
    expect(settled).toHaveLength(3);
    for (const row of settled) {
      expect(row.className).toContain('desk-settle');
    }
    // The index runs across the whole roster, not per stage group — the CSS
    // caps the stagger at the seventh line.
    expect(settled.map((row) => row.style.getPropertyValue('--i'))).toEqual([
      '0',
      '1',
      '2',
    ]);

    unmount();
  });

  it('never settles again — returning to the desk remounts, quietly', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const remounted = rows(container);
    expect(remounted).toHaveLength(3);
    for (const row of remounted) {
      expect(row.className).not.toContain('desk-settle');
      expect(row.style.getPropertyValue('--i')).toBe('');
    }
  });
});
