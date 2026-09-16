import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      personLine: 'Anne Vandersteen · Procurement And Orders',
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

  it('register 4 is person · phase and never repeats register 5', () => {
    const { container } = render(
      <DeskClaimCard
        card={card({
          line: {
            ...card().line,
            personLine: 'Marcus Wright',
            needText: 'New lead — respond by 12 September',
            overdueText: null,
          },
        })}
        tone="project"
        settle={false}
      />,
    );
    const person = container.querySelector('[data-register="person"]')!;
    const sentence = container.querySelector('[data-register="sentence"]')!;

    expect(person).toHaveTextContent('Marcus Wright');
    expect(sentence).toHaveTextContent('New lead — respond by 12 September');
    expect(person.textContent).not.toContain(sentence.textContent!);
  });

  it('writes no person line where there is neither client nor phase', () => {
    const { container } = render(
      <DeskClaimCard
        card={card({ line: { ...card().line, personLine: '' } })}
        tone="project"
        settle={false}
      />,
    );

    expect(container.querySelector('[data-register="person"]')).toBeNull();
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

  it('guards the stage plate and the custody word against a long single token — the card is overflow:hidden', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const stage = container.querySelector('[data-register="stage"]')!;
    const custody = container.querySelector('[data-register="custody"]')!;

    for (const el of [stage, custody]) {
      expect(el.className).toMatch(/\bmin-w-0\b/);
      expect(el.className).toContain('[overflow-wrap:anywhere]');
    }
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

/**
 * D10 fix-round-1 — the 88px link zone was not real: `.row-wash-score` (which
 * sets `position: relative`) rode the SAME element as `data-roster-name`, so
 * that element — not `.desk-claim-upper` — became the containing block for
 * the overlay's `::before`. The overlay shrank to the word's own box (~34px)
 * while stage/custody/person stayed `pointer-events: none`, leaving most of
 * the advertised 88px zone dead. The fix: the link itself now stays
 * `position: static`, and `.row-wash-score` rides a NESTED span instead.
 *
 * jsdom does not load globals.css (desk-focus-ring.test.ts's own note), so
 * the real coverage here is the source guards, not computed style.
 */
describe('D10 fix — the link zone is the upper block, not the word', () => {
  const CSS_PATH = join(__dirname, '../../app/globals.css');
  const TSX_PATH = join(__dirname, './desk-claim-card.tsx');
  const css = readFileSync(CSS_PATH, 'utf8');
  const tsx = readFileSync(TSX_PATH, 'utf8');

  it('keeps the name link outside the inert wrapper', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(
      container.querySelector('[data-roster-name]')!.closest('[data-claim-inert]'),
    ).toBeNull();
  });

  it('(weak, jsdom-only) the rendered link carries no inline position: relative', () => {
    // jsdom applies no stylesheet, so this only catches an inline-style
    // regression — the source guards below are the real assertion.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const anchor = container.querySelector('[data-roster-name]') as HTMLElement;

    expect(getComputedStyle(anchor).position).not.toBe('relative');
  });

  it('globals.css: .desk-claim-upper is itself the positioned ancestor', () => {
    const upperRule = css.match(/\.desk-claim-upper\s*\{[^}]*\}/)?.[0] ?? '';

    expect(upperRule).toMatch(/position:\s*relative/);
  });

  it('globals.css: no rule ever sets [data-roster-name] to position: relative', () => {
    // Every rule block whose selector mentions [data-roster-name] — except the
    // ::before overlay itself, which is legitimately position: absolute.
    const rules = css.match(/\.desk-claim-upper[^{]*\[data-roster-name\][^{]*\{[^}]*\}/g) ?? [];
    const nonOverlayRules = rules.filter((rule) => !rule.includes('::before'));

    expect(nonOverlayRules.length).toBeGreaterThan(0);
    for (const rule of nonOverlayRules) {
      expect(rule).not.toMatch(/position:\s*relative/);
    }
    // And at least one of them says so explicitly, rather than relying on the
    // browser default.
    expect(nonOverlayRules.some((rule) => /position:\s*static/.test(rule))).toBe(
      true,
    );
  });

  it('globals.css: the overlay pseudo-element is scoped under .desk-claim-upper', () => {
    expect(css).toMatch(/\.desk-claim-upper \[data-roster-name\]::before\s*\{/);
  });

  it('desk-claim-card.tsx: .row-wash-score never lands on the element carrying data-roster-name', () => {
    const idx = tsx.indexOf('data-roster-name');
    expect(idx).toBeGreaterThan(-1);

    const tagStart = tsx.lastIndexOf('<Link', idx);
    const tagEnd = tsx.indexOf('>', idx);
    expect(tagStart).toBeGreaterThan(-1);
    expect(tagEnd).toBeGreaterThan(tagStart);

    const tag = tsx.slice(tagStart, tagEnd);
    expect(tag).not.toMatch(/row-wash-score/);
  });
});
