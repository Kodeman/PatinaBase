import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { RoomShell } from '../../rooms/room-shell';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

it('reserves the measured drawer height beneath the firm card instead of a fixed height', () => {
  const { container } = render(
    <RoomShell title="Studio contacts" topLevel>
      <button type="button">Open the door</button>
    </RoomShell>,
  );
  const act = screen.getByRole('button', { name: 'Open the door' });
  const frame = container.querySelector('[data-spotlight-frame]');
  expect(frame).toContainElement(act);
  // jsdom has no layout: the CSS reserve is the testable contract. It follows
  // the shell's measured inset at both widths, plus the existing 24px gap.
  expect(frame).toHaveClass('pb-[var(--doc-shell-floating-bottom)]');
});

it('gives the window scroller dock clearance in every Room at both widths', () => {
  // RoomShell and its document-route parent have min-height, not constrained
  // overflow: the window scrolls, so the CSS contract belongs on html.
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
  const rules = [...css.matchAll(/html:has\(\.document-route-shell\)\s*\{([^}]*)\}/g)]
    .map((match) => match[1]);
  expect(rules).toEqual(expect.arrayContaining([
    expect.stringContaining('scroll-padding-bottom: max(\n    var(--doc-mobile-bar-height, 72px),'),
    expect.stringContaining('scroll-padding-bottom: max(72px, var(--doc-drawer-height, 0px))'),
  ]));
});

it('reserves the measured dock beneath the independent round-8 contents scrollport', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/document/paper/round8.css'), 'utf8');
  const rule = css.match(/\[data-paper-renderer="round8"\] \[data-contents-margin\]\s*\{([^}]*)\}/)?.[1];
  expect(rule).toContain('max-height: calc(100dvh - (var(--r8-head) + 24px) - var(--doc-shell-floating-bottom))');
});
