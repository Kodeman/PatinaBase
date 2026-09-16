/**
 * R126 — the one orchestrated moment. Its own file because the guard is a
 * module-level flag: a suite that rendered the roster earlier would have
 * spent it, and this is exactly the behaviour under test.
 *
 * T5 — the two `it`s below are ORDERED, deliberately: the second asserts what
 * the first consumed. `jest -t 'never settles again'` in isolation fails, and
 * should — the flag is the subject, not a fixture.
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

// The day's line's own read — mocked so the roster renders without a
// QueryClient. This suite is about the settle flag, not the band.
jest.mock('@/hooks/use-answered-notes', () => ({
  useAnsweredNotes: () => ({ data: [] }),
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
            stage: 'brief',
            state: 'Sarah Chen · new lead',
            overdueText: null,
            mark: 'quiet',
            custody: 'Your pen',
            needOwner: 'designer',
            needKind: 'new_lead',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/chen',
            act: { label: 'Open the job', href: '/doc/chen' },
          },
          {
            engagementId: 'tanaka',
            name: 'Full Room',
            stage: 'brief',
            state: 'Lily Tanaka · new lead',
            overdueText: null,
            mark: 'quiet',
            custody: 'Your pen',
            needOwner: 'designer',
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
            stage: 'project',
            state: 'Anne Vandersteen · procurement',
            overdueText: null,
            mark: null,
            custody: 'Your pen',
            needOwner: 'designer',
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
    container.querySelectorAll<HTMLElement>(
      '[data-claim-card], [data-ledger-row]',
    ),
  );
}

describe('DeskRoster — the roster settles once per page load', () => {
  it('settles on the first mount, staggering by the card’s own index', () => {
    const { container, unmount } = render(<DeskRoster roster={roster()} />);

    // Two marked jobs take cards; the unmarked one takes an at-rest row. The
    // orchestrated moment belongs to the claims: DeskLedgerRow takes no
    // settle, so the ledger arrives already at rest.
    const settled = rows(container);
    expect(settled).toHaveLength(3);
    const cards = settled.filter((row) => row.hasAttribute('data-claim-card'));
    const ledger = settled.filter((row) => row.hasAttribute('data-ledger-row'));
    expect(cards).toHaveLength(2);
    expect(ledger).toHaveLength(1);
    for (const card of cards) {
      expect(card.className).toContain('desk-settle');
    }
    // The index runs across the whole grid, not per person group — the CSS
    // caps the stagger at the seventh card.
    expect(cards.map((card) => card.style.getPropertyValue('--i'))).toEqual([
      '0',
      '1',
    ]);
    for (const row of ledger) {
      expect(row.className).not.toContain('desk-settle');
      expect(row.style.getPropertyValue('--i')).toBe('');
    }

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
