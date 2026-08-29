/**
 * R126 — the filled stamp. One recipe per state: the state's own --fill-*-tint,
 * a 1.5px border in that state's own -ink, a charcoal word, and the same −1.5°
 * tilt the outline wears. The outline stamp is untouched, and stays the
 * default.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { Stamp, type StampTone } from './stamp';

// jsdom's cssstyle drops any inline value containing `var()`, so the pigment
// tokens themselves are asserted at the source; the DOM carries the tone.
const SOURCE = readFileSync(join(__dirname, 'stamp.tsx'), 'utf8');

const CANON: Record<StampTone, { fill: string; border: string }> = {
  ordered: { fill: 'var(--fill-ordered-tint)', border: 'var(--color-clay-ink)' },
  delivered: {
    fill: 'var(--fill-delivered-tint)',
    border: 'var(--color-sage-ink)',
  },
  decision: {
    fill: 'var(--fill-decision-tint)',
    border: 'var(--color-golden-hour-ink)',
  },
  damaged: {
    fill: 'var(--fill-damaged-tint)',
    border: 'var(--color-terracotta-ink)',
  },
  anchor: { fill: 'var(--fill-anchor-tint)', border: 'var(--color-dusty-blue)' },
};

describe('Stamp', () => {
  it('keeps today’s outline look by default', () => {
    const { container } = render(
      <Stamp label="Decision due" color="var(--color-terracotta)" ink="var(--color-terracotta-ink)" />,
    );
    const stamp = container.firstElementChild as HTMLElement;
    expect(stamp).not.toHaveAttribute('data-stamp-variant');
    expect(stamp).toHaveClass('bg-transparent', '-rotate-[1.5deg]', 'text-[11px]');
    expect(SOURCE).toContain('style={{ borderColor: color, color: ink ?? color }}');
  });

  it.each(Object.keys(CANON) as StampTone[])(
    'fills %s with its own tint and inks its border in the state’s own pigment',
    (tone) => {
      const { container } = render(
        <Stamp label="Ordered" color="var(--color-clay)" variant="filled" tone={tone} />,
      );
      const stamp = container.firstElementChild as HTMLElement;
      expect(stamp).toHaveAttribute('data-stamp-variant', 'filled');
      expect(stamp).toHaveAttribute('data-stamp-tone', tone);
      // Legibility is charcoal on every filled kind alike.
      expect(stamp).toHaveClass('text-[var(--text-primary)]', 'border-[1.5px]', 'rounded-[3px]');
    },
  );

  it('spends one pigment per state, on the tint and on the border alike', () => {
    (Object.keys(CANON) as StampTone[]).forEach((tone) => {
      expect(SOURCE).toContain(`${tone}: '${CANON[tone].fill}'`);
      expect(SOURCE).toContain(`${tone}: '${CANON[tone].border}'`);
    });
  });

  it('keeps the tilt and prints mono 12px semibold uppercase when filled', () => {
    const { container } = render(
      <Stamp label="Ordered" color="var(--color-clay)" variant="filled" tone="ordered" />,
    );
    const stamp = container.firstElementChild as HTMLElement;
    // The mockup rotates every stamp alike; the tilt is not the outline's alone.
    expect(stamp).toHaveClass('-rotate-[1.5deg]');
    expect(stamp).toHaveClass(
      'font-mono',
      'text-[12px]',
      'font-semibold',
      'uppercase',
      'tracking-[0.08em]',
    );
  });

  it('inks in on a state change, and never under reduced motion', () => {
    const { container } = render(
      <Stamp label="Damaged" color="var(--color-terracotta)" variant="filled" tone="damaged" />,
    );
    const stamp = container.firstElementChild as HTMLElement;
    expect(stamp).toHaveClass(
      'motion-safe:transition-[background-color,border-color]',
      'motion-safe:duration-[260ms]',
      'motion-safe:ease-[var(--ease-editorial)]',
    );
    // Every motion class is motion-safe gated, so reduce gets a still stamp.
    stamp.className
      .split(' ')
      .filter((c) => /transition|duration|ease/.test(c))
      .forEach((c) => expect(c.startsWith('motion-safe:')).toBe(true));
  });

  it('falls back to the outline when a filled stamp names no tone', () => {
    const { container } = render(
      <Stamp label="Sent" color="var(--color-dusty-blue)" variant="filled" />,
    );
    const stamp = container.firstElementChild as HTMLElement;
    expect(stamp).not.toHaveAttribute('data-stamp-variant');
    expect(stamp).toHaveClass('bg-transparent');
  });

  it('gives DELIVERED its own sage plate, not ORDERED’s clay one', () => {
    // S5: eight states used to collapse onto the ordered fill, so a designer
    // scanning Pieces for what was still on order saw delivered and installed
    // lines wearing the ordered-money plate. Two answers, two pigments.
    const ordered = render(
      <Stamp label="Ordered" color="var(--color-clay)" variant="filled" tone="ordered" />,
    ).container.firstElementChild as HTMLElement;
    const delivered = render(
      <Stamp label="Delivered" color="var(--color-sage)" variant="filled" tone="delivered" />,
    ).container.firstElementChild as HTMLElement;
    expect(ordered.getAttribute('data-stamp-tone')).toBe('ordered');
    expect(delivered.getAttribute('data-stamp-tone')).toBe('delivered');
    expect(CANON.delivered.fill).not.toBe(CANON.ordered.fill);
    expect(CANON.delivered.border).not.toBe(CANON.ordered.border);
  });

  it('carries no shadow (D4)', () => {
    const { container } = render(
      <Stamp label="Ordered" color="var(--color-clay)" variant="filled" tone="ordered" />,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/shadow/);
  });
});
