/**
 * The claims grid (R143 · D3) — what the grid itself owns.
 *
 * Three facts the roster leans on and neither the card's own suite nor the
 * roster's would catch: the walkthrough anchor lands on ONE card, the settle
 * stagger keeps running across person groups, and an empty grid is still a
 * list rather than nothing at all.
 */

import { render } from '@testing-library/react';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimsGrid } from './desk-claims';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function card(engagementId: string, over: Partial<ClaimCard> = {}): ClaimCard {
  return {
    stage: 'project',
    stageLabel: 'Project',
    custody: 'Your pen',
    band: 0,
    line: {
      engagementId,
      name: `${engagementId} residence`,
      stage: 'project',
      designerId: null,
      state: 'Anne Vandersteen · Procurement And Orders',
      overdueText: null,
      mark: 'urgent',
      needKind: 'overdue_invoice',
      overdue: { isOverdue: false, days: 0 },
      jobHref: `/doc/${engagementId}`,
      act: { label: 'Open the job', href: `/doc/${engagementId}` },
      client: 'Anne Vandersteen',
      custody: 'Your pen',
      needOwner: 'designer',
      needText: 'Two rooms await your mark-up',
      motionText: null,
      projectId: null,
    },
    ...over,
  };
}

const CARDS = [card('vandersteen'), card('byrne'), card('reinhardt')];

describe('DeskClaimsGrid', () => {
  it('lands the tour anchor on the first card and on no other', () => {
    const { container } = render(
      <DeskClaimsGrid cards={CARDS} settle={false} firstTourAnchor="desk-folio" />,
    );

    const anchored = Array.from(
      container.querySelectorAll('[data-tour-anchor="desk-folio"]'),
    );
    expect(anchored).toHaveLength(1);
    expect(anchored[0].getAttribute('data-claim-card')).toBe('vandersteen');
  });

  it('offsets the settle index by startIndex, so the stagger runs across groups', () => {
    // By person prints N grids; the CSS caps the stagger at the seventh card,
    // and a per-group index would restart it inside every person's plate.
    const { container } = render(
      <DeskClaimsGrid cards={CARDS} settle startIndex={4} />,
    );

    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>('[data-claim-card]'),
      ).map((el) => el.style.getPropertyValue('--i')),
    ).toEqual(['4', '5', '6']);
  });

  it('renders an empty list rather than nothing when there are no cards', () => {
    // The roster's `#desk-claims` anchor is this element: a grid that vanished
    // would leave the day's line's more-link pointing at nothing.
    const { container } = render(
      <DeskClaimsGrid cards={[]} settle={false} id="desk-claims" />,
    );

    const list = container.querySelector('ul#desk-claims')!;
    expect(list).not.toBeNull();
    expect(list.children).toHaveLength(0);
  });
});
