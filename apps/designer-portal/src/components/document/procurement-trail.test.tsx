/**
 * R7 / M7 — the trail's rendering grammar.
 *
 * The derivation is proved in `lib/document/__tests__/procurement-lifecycle.test.ts`.
 * This suite proves only what the glass does with a reading.
 */

import { render, screen } from '@testing-library/react';
import { deriveProcurementLifecycle } from '@/lib/document/procurement-lifecycle';
import { ProcurementTrail } from './procurement-trail';

function trailFor(input: Parameters<typeof deriveProcurementLifecycle>[0]) {
  const { container } = render(
    <ProcurementTrail reading={deriveProcurementLifecycle(input)} />,
  );
  return container;
}

const base = { status: 'specified' as const };

describe('ProcurementTrail (M7)', () => {
  it('draws all fifteen steps and all three gates', () => {
    const c = trailFor(base);
    expect(c.querySelectorAll('[data-trail-step]')).toHaveLength(15);
    expect(c.querySelectorAll('[data-trail-gate]')).toHaveLength(3);
  });

  it('renders the ratified step names verbatim', () => {
    trailFor(base);
    for (const label of [
      'Cleared to produce',
      'Released to maker',
      'Received / inspect',
      'Punch / service',
      'Closed',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('stamps the live step and marks exactly one', () => {
    const c = trailFor({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production' },
    });
    const live = c.querySelectorAll('[data-trail-state="live"]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('data-trail-step')).toBe('in_production');
  });

  it('says "no record" on a step the book cannot evidence, and nothing else', () => {
    const c = trailFor({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production' },
    });
    const noRecord = c.querySelector('[data-trail-step="awaiting_inputs"]');
    expect(noRecord).toHaveAttribute('data-trail-state', 'no-record');
    expect(noRecord).toHaveTextContent('no record');
  });

  it('leaves future steps outlined and unstamped — dashed, never a stamp', () => {
    const c = trailFor(base);
    const future = c.querySelector('[data-trail-step="installed"]');
    expect(future).toHaveAttribute('data-trail-state', 'future');
    expect(future?.querySelector('.border-dashed')).toBeTruthy();
    expect(future).not.toHaveTextContent('no record');
  });

  it('marks a reached gate with the oak border and an unreached one without', () => {
    const c = trailFor({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production' },
    });
    const reached = c.querySelector('[data-trail-gate="complete_to_produce"]');
    expect(reached).toHaveAttribute('data-trail-state', 'open');
    expect(reached?.className).toContain('border-[var(--color-aged-oak)]');

    const unreached = c.querySelector(
      '[data-trail-gate="warehouse_and_site_ready"]',
    );
    expect(unreached).toHaveAttribute('data-trail-state', 'unreached');
    expect(unreached?.className).toContain('border-[var(--color-pearl)]');
  });

  it('names the term holding an open gate', () => {
    trailFor({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production', payments: [] },
    });
    expect(screen.getByText('awaiting acknowledgment')).toBeInTheDocument();
  });

  // Charter constraints — D4 and the 12px metadata floor (I114–I120).
  it('carries no shadow anywhere', () => {
    const c = trailFor({ ...base, status: 'installed' });
    expect(c.innerHTML).not.toMatch(/shadow/);
  });

  it('never renders type below the 12px floor', () => {
    const c = trailFor({ ...base, status: 'installed' });
    const sizes = c.innerHTML.match(/text-\[(\d+)px\]/g) ?? [];
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(Number(s.match(/(\d+)px/)![1])).toBeGreaterThanOrEqual(12);
    }
  });

  it('never renders a commercial actor word (№7)', () => {
    const c = trailFor({ ...base, status: 'installed' });
    expect(c.textContent).not.toMatch(
      /authoriz|PO issued|purchase authorized/i,
    );
  });
});
