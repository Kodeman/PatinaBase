import { render, within } from '@testing-library/react';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard } from './desk-claim-card';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function card(over: Partial<ClaimCard> = {}): ClaimCard {
  return {
    stage: 'project',
    stageLabel: 'Project',
    custody: 'Your pen',
    band: 0,
    line: {
      engagementId: 'vandersteen',
      name: 'Vandersteen residence',
      stage: 'project',
      designerId: null,
      state: 'Anne Vandersteen · Procurement And Orders',
      overdueText: 'Overdue 6 days — Invoice 1042 · $17,500 overdue',
      mark: 'urgent',
      needKind: 'overdue_invoice',
      overdue: { isOverdue: true, days: 6 },
      jobHref: '/doc/vandersteen',
      act: { label: 'Send reminder', href: '/doc/vandersteen' },
      client: 'Anne Vandersteen',
      custody: 'Your pen',
      needOwner: 'designer',
      dueOn: '2026-08-12',
      valueText: '12 Aug',
      needText: 'Invoice 1042 · $17,500 overdue',
      motionText: null,
      projectId: null,
    },
    ...over,
  };
}

describe('DeskClaimCard — the six registers, in DOM order', () => {
  it('prints stage, custody, name, person, sentence, act — in that order', () => {
    // DOM order IS the screen-reader order, and the registers ARE an order.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const registers = Array.from(
      container.querySelectorAll('[data-register]'),
    ).map((el) => el.getAttribute('data-register'));

    expect(registers).toEqual([
      'stage',
      'custody',
      'name',
      'person',
      'sentence',
      'act',
    ]);
  });

  it('carries the custody word beside the mark, and hides the mark', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const custody = container.querySelector('[data-register="custody"]')!;

    expect(custody).toHaveTextContent('Your pen');
    expect(custody.querySelector('[data-roster-mark]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('marks urgent in terracotta-ink and quiet in mocha (D9)', () => {
    const { container: hot } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const quietCard = card();
    const { container: cool } = render(
      <DeskClaimCard
        card={{ ...quietCard, line: { ...quietCard.line, mark: 'quiet' } }}
        tone="project"
        settle={false}
      />,
    );

    expect(
      hot.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-terracotta-ink)');
    expect(
      cool.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-mocha)');
  });

  it('names the job on the link, and on the act’s accessible name', () => {
    // Eleven cards otherwise announce eleven identical "Send reminder"s.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('[data-roster-name]')).toHaveAttribute(
      'href',
      '/doc/vandersteen',
    );
    expect(
      container.querySelector('[data-action-key^="roster-"]'),
    ).toHaveAttribute('aria-label', 'Send reminder — Vandersteen residence');
  });

  it('prints the overdue clause in terracotta-ink', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const sentence = container.querySelector('[data-register="sentence"]')!;

    expect(
      within(sentence as HTMLElement).getByText(/Overdue 6 days/),
    ).toHaveClass('text-[var(--color-terracotta-ink)]');
  });

  it('says the need’s own sentence when nothing is overdue', () => {
    const quiet = card();
    const { container } = render(
      <DeskClaimCard
        card={{ ...quiet, line: { ...quiet.line, overdueText: null } }}
        tone="project"
        settle={false}
      />,
    );

    expect(container.querySelector('[data-register="sentence"]')).toHaveTextContent(
      'Invoice 1042 · $17,500 overdue',
    );
  });

  it('lands the day’s line’s anchor on the card itself', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('#roster-line-vandersteen')).not.toBeNull();
  });

  it('D10 — the custody and person lines do not swallow the click', () => {
    // The whole 88px upper block is one target: those two lines take
    // pointer-events:none so a click on them reaches the name link's overlay.
    // The trade-off — they are not selectable — is recorded in R143.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    for (const register of ['stage', 'custody', 'person']) {
      const el = container.querySelector(`[data-register="${register}"]`)!;
      expect(el.closest('[data-claim-inert]')).not.toBeNull();
    }
    // The sentence stays selectable — it is outside the block entirely.
    expect(
      container
        .querySelector('[data-register="sentence"]')!
        .closest('[data-claim-inert]'),
    ).toBeNull();
  });

  it('writes no shadow utility anywhere (D4)', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('[data-claim-card]')!.className).toContain(
      'desk-claim-card',
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
