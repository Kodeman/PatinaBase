import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClientFurnishingsAuthorizationItem } from '@patina/types';
import { FurnishingsAuthorizationBody } from './FurnishingsAuthorizationBody';

const items: ClientFurnishingsAuthorizationItem[] = [
  {
    description: 'White oak floor', roomName: 'Hall', quantity: 913,
    unit: 'sq_ft', currency: 'USD', clientUnitPriceCents: 219,
    clientLineTotalCents: 200000, allowance: true,
    rooms: [
      { name: 'Hall', quantity: 400, unit: 'sq_ft' },
      { name: 'Living room', quantity: 513, unit: 'sq_ft' },
    ],
  },
  {
    description: 'Wallpaper', roomName: 'Study', quantity: 9, unit: 'roll',
    currency: 'USD', clientUnitPriceCents: 10000, clientLineTotalCents: 90000,
  },
];

function body(depositRequiredCents = 145000, totalAmountCents = 300000) {
  return <FurnishingsAuthorizationBody items={items} depositRequiredCents={depositRequiredCents}
    totalAmountCents={totalAmountCents} depositPercent={50} />;
}

describe('FurnishingsAuthorizationBody', () => {
  it('prints frozen rooms, units, allowance ceilings and authoritative line totals', () => {
    render(body());
    expect(screen.getByRole('heading', { name: 'Named furnishing lines' })).toBeInTheDocument();
    expect(screen.getAllByTestId('authorization-room-heading').map(node => node.textContent)).toEqual(['Hall', 'Study']);
    expect(screen.getByText('White oak floor · 913 sq ft · Hall · Living room')).toBeInTheDocument();
    expect(screen.getByText('Quantity 9 roll')).toBeInTheDocument();
    expect(screen.getByText('Up to $2,000')).toBeInTheDocument();
    expect(screen.getByText('Authorized furnishings').parentElement).toHaveTextContent('$2,900');
  });

  it.each([
    [913, 'sq_ft', '913 sq ft'], [40, 'lin_ft', '40 lin ft'],
    [9, 'roll', '9 roll'], [1200, 'sq_ft', '1,200 sq ft'],
    [8, 'each', '8'], [8, undefined, '8'],
  ] as const)('prints quantity %s %s through the actual shared renderer', (quantity, unit, label) => {
    render(<FurnishingsAuthorizationBody items={[{ ...items[1], quantity, unit, rooms: [] }]}
      totalAmountCents={0} depositPercent={0} />);
    expect(screen.getByText(`Quantity ${label}`)).toBeInTheDocument();
    expect(screen.getByText('Wallpaper')).toBeInTheDocument();
  });

  it('keeps legacy, absent-room and single-room lines separate from multi-room labels', () => {
    render(<FurnishingsAuthorizationBody items={[
      { ...items[1], description: 'Legacy', unit: undefined, rooms: undefined },
      { ...items[1], description: 'One room', rooms: [{ name: 'Study', quantity: 9, unit: 'roll' }] },
      { ...items[1], description: 'No room', roomName: '', rooms: [] },
    ]} totalAmountCents={0} depositPercent={0} />);
    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(screen.getByText('One room')).toBeInTheDocument();
    expect(screen.getByText('No room')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('preserves stated totals, nonzero deposit and exact client consent text', () => {
    render(body());
    expect(screen.getByTestId('authorization-terms-strip')).toHaveTextContent('Total $3,000 · Deposit $1,450 (50%) on signature');
    expect(screen.getByText('This signature covers only the descriptions, quantities, and client prices shown here. It does not alter the design-services agreement.')).toBeInTheDocument();
    expect(screen.queryByText(/Preview|Not sent|Deposit handoff|Open payments/)).not.toBeInTheDocument();
  });

  it('omits zero-deposit terms and uses summed total when no stated total exists', () => {
    const { rerender } = render(body(0, 0));
    expect(screen.queryByTestId('authorization-terms-strip')).not.toBeInTheDocument();
    rerender(body(145000, 0));
    expect(screen.getByTestId('authorization-terms-strip')).toHaveTextContent('Total $2,900');
  });

  it('uses fingerprinted contractual deposit when no executed invoice override is supplied', () => {
    render(<FurnishingsAuthorizationBody items={items} totalAmountCents={300001} depositPercent={50} />);
    expect(screen.getByTestId('authorization-terms-strip')).toHaveTextContent('Deposit $1,500 (50%) on signature');
  });

  it('renders no private prices or metadata even when runtime input contains extra fields', () => {
    const untrusted = items.map(item => ({ ...item, tradeUnitPriceCents: 12345678, margin: 'private margin', notes: 'private operational note' }));
    const { container } = render(<FurnishingsAuthorizationBody items={untrusted} depositRequiredCents={0} totalAmountCents={0} depositPercent={0} />);
    expect(container).not.toHaveTextContent(/12345678|private margin|private operational note/);
    expect(within(container).getByText('Up to $2,000')).toBeInTheDocument();
  });
});


describe('frozen authorization photos', () => {
  const photo = (clientImage: unknown) => <FurnishingsAuthorizationBody items={[{ ...items[1], clientImage } as ClientFurnishingsAuthorizationItem]} totalAmountCents={0} depositPercent={0} />;
  it('renders the frozen photo with descriptive alt and bounded private-referrer-safe loading', () => {
    render(photo({ version: 1, url: 'https://images.example.test/frozen.jpg', notes: 'PRIVATE' }));
    const image = screen.getByRole('img', { name: 'Wallpaper — item photo' });
    expect(image).toHaveAttribute('src', 'https://images.example.test/frozen.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(image).toHaveClass('object-contain');
    expect(image).toHaveStyle({ maxHeight: '160px', maxWidth: '160px' });
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  });
  it('keeps legacy absent media image-less and distinguishes an explicit missing photo', () => {
    const { rerender } = render(photo(undefined));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('No item photo saved.')).not.toBeInTheDocument();
    rerender(photo({ version: 1, url: null }));
    expect(screen.getByText('No item photo saved.')).toBeInTheDocument();
  });
  it('shows a broken frozen reference without fallback and resets failure for a different source', () => {
    const { rerender } = render(photo({ version: 1, url: 'https://images.example.test/one.jpg' }));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Item photo unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(photo({ version: 1, url: 'https://images.example.test/two.jpg' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://images.example.test/two.jpg');
    expect(screen.queryByText('Item photo unavailable.')).not.toBeInTheDocument();
  });
  it.each([
    'javascript:alert(1)', 'data:image/png;base64,AA', 'http://images.example.test/a.jpg',
    'https://user:pass@images.example.test/a.jpg', 'https://images.example.test/storage/v1/object/sign/private/a.jpg?token=secret',
    'https://images.example.test/a.jpg?X-Amz-Signature=secret', 'https://images.example.test/a.jpg?%65xpires=100',
    'https://images.example.test/a.jpg?sig=secret', 'https://images.example.test/a.jpg?token=secret',
  ])('never renders an unsafe or expiring photo %s', url => {
    render(photo({ version: 1, url }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No item photo saved.')).toBeInTheDocument();
  });
});


describe('authorization unit prices and lead times', () => {
  const consent = 'This signature covers only the descriptions, quantities, and client prices shown here. It does not alter the design-services agreement.';
  const estimate = " Lead times are the studio's current estimates, not delivery dates.";
  const fixed = { ...items[1], description: 'Chair', quantity: 3, unit: 'each', clientUnitPriceCents: 10000, clientLineTotalCents: 30000 };

  it('matches the exact pre-US-41 legacy fixed, allowance and multi-room strings', () => {
    const { container } = render(<FurnishingsAuthorizationBody items={[
      { ...fixed, description: 'Legacy fixed', clientUnitPriceCents: 3333, clientLineTotalCents: 9999 },
      { ...items[0], description: 'Legacy allowance', quantity: 3, unit: 'each', rooms: [], clientLineTotalCents: 10000 },
      { ...fixed, description: 'Multi-room', roomName: 'Living room', quantity: 2, rooms: [{ name: 'Living room', quantity: 1 }, { name: 'Hall', quantity: 1 }], clientLineTotalCents: 1050 },
    ]} totalAmountCents={21049} depositPercent={50} />);
    // Golden markup rendered by 17e543c44: classes, structure, whole-dollar rounding and consent.
    expect(container.innerHTML).toBe([
      '<section><h2 class="type-section-head">Named furnishing lines</h2><div class="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">',
      '<div data-testid="authorization-room-group"><p class="type-meta pt-4 text-[var(--accent-primary)]" data-testid="authorization-room-heading">Study</p><div class="divide-y divide-[var(--border-subtle)]"><div class="grid grid-cols-[1fr_auto] gap-x-4 py-3"><div><p class="type-body-small text-[var(--text-primary)]">Legacy fixed</p><p class="type-meta-small mt-0.5">Quantity 3</p></div><p class="type-label text-right">$100</p></div></div></div>',
      '<div data-testid="authorization-room-group"><p class="type-meta pt-4 text-[var(--accent-primary)]" data-testid="authorization-room-heading">Hall</p><div class="divide-y divide-[var(--border-subtle)]"><div class="grid grid-cols-[1fr_auto] gap-x-4 py-3"><div><p class="type-body-small text-[var(--text-primary)]">Legacy allowance</p><p class="type-meta-small mt-0.5">Quantity 3</p></div><p class="type-label text-right">Up to $100</p></div></div></div>',
      '<div data-testid="authorization-room-group"><p class="type-meta pt-4 text-[var(--accent-primary)]" data-testid="authorization-room-heading">Living room</p><div class="divide-y divide-[var(--border-subtle)]"><div class="grid grid-cols-[1fr_auto] gap-x-4 py-3"><div><p class="type-body-small text-[var(--text-primary)]">Multi-room · 2 · Living room · Hall</p></div><p class="type-label text-right">$11</p></div></div></div>',
      '<div class="flex items-baseline justify-between py-4"><span class="type-body-small font-medium">Authorized furnishings</span><span class="type-data-large">$210</span></div></div>',
      '<p class="type-body-small mt-3 text-[var(--text-primary)]" data-testid="authorization-terms-strip">Total $210 · Deposit $105 (50%) on signature</p>',
      '<p class="type-body-small mt-3 text-[var(--text-muted)]">This signature covers only the descriptions, quantities, and client prices shown here. It does not alter the design-services agreement.</p></section>',
    ].join(''));
    expect(container).not.toHaveTextContent('×');
  });

  it.each([
    [3, 10000, '3 × $100', '$300'],
    [2, 3333, '2 × $33.33', '$66.66'],
  ] as const)('prints new-format quantity %s with exact unit and line prices', (quantity, clientUnitPriceCents, label, price) => {
    const total = quantity * clientUnitPriceCents;
    render(<FurnishingsAuthorizationBody items={[{ ...fixed, quantity, clientUnitPriceCents, clientLineTotalCents: total, leadTime: { version: 1, weeks: 12 } }]}
      totalAmountCents={total} depositPercent={50} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByText(price)).toHaveLength(2);
    expect(screen.getByTestId('authorization-terms-strip').textContent).toBe(quantity === 2 ? 'Total $66.66 · Deposit $33.33 (50%) on signature' : 'Total $300 · Deposit $150 (50%) on signature');
  });

  it('keeps Quantity for a new-format mismatch and preserves its authoritative cents', () => {
    const { container } = render(<FurnishingsAuthorizationBody items={[{ ...fixed, quantity: 3, clientUnitPriceCents: 3333, clientLineTotalCents: 10001, leadTime: { version: 1, weeks: 1 } }]}
      totalAmountCents={10001} depositPercent={0} />);
    expect(screen.getByText('Quantity 3')).toBeInTheDocument();
    expect(screen.getAllByText('$100.01')).toHaveLength(2);
    expect(container).not.toHaveTextContent('×');
  });

  it('keeps new-format Quantity 1 and an allowance ceiling free of unit-price lines', () => {
    const { container } = render(<FurnishingsAuthorizationBody items={[
      { ...fixed, quantity: 1, leadTime: { version: 1, weeks: 0 } },
      { ...items[0], rooms: [], leadTime: { version: 1, weeks: 12 } },
    ]} totalAmountCents={0} depositPercent={0} />);
    expect(screen.getByText('Quantity 1')).toBeInTheDocument();
    expect(screen.getByText('Quantity 913 sq ft')).toBeInTheDocument();
    const allowance = screen.getByText('Up to $2,000').parentElement!;
    expect(within(allowance).getByText('Lead time · About 12 weeks')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('×');
  });

  it.each([[0, 'Lead time · In stock'], [1, 'Lead time · About 1 week'], [12, 'Lead time · About 12 weeks'], [null, 'Lead time to be confirmed']] as const)('prints frozen lead time %s and the exact estimate consent', (weeks, label) => {
    render(<FurnishingsAuthorizationBody items={[{ ...fixed, leadTime: { version: 1, weeks } }]}
      totalAmountCents={30000} depositPercent={50} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(consent + estimate)).toBeInTheDocument();
    expect(screen.getByTestId('authorization-terms-strip')).toHaveTextContent('Total $300 · Deposit $150 (50%) on signature');
  });

  it('gates per-item pricing while extending consent once on a mixed document', () => {
    render(<FurnishingsAuthorizationBody items={[
      { ...fixed, description: 'New chair', leadTime: { version: 1, weeks: 0 } },
      { ...fixed, description: 'Legacy chair', clientUnitPriceCents: 3333, clientLineTotalCents: 9999 },
    ]} totalAmountCents={39999} depositPercent={0} />);
    const newLine = screen.getByText('New chair').parentElement!.parentElement!;
    const legacyLine = screen.getByText('Legacy chair').parentElement!.parentElement!;
    expect(within(newLine).getByText('3 × $100')).toBeInTheDocument();
    expect(within(newLine).getByText('Lead time · In stock')).toBeInTheDocument();
    expect(within(legacyLine).getByText('Quantity 3')).toBeInTheDocument();
    expect(within(legacyLine).getByText('$100')).toBeInTheDocument();
    expect(legacyLine).not.toHaveTextContent(/×|Lead time/);
    expect(screen.getByText('Authorized furnishings').parentElement?.textContent).toBe('Authorized furnishings$399.99');
    expect(screen.getByText(consent + estimate)).toBeInTheDocument();
  });

  it.each([undefined, null, {}, { version: 2, weeks: 12 }, { version: '1', weeks: 12 }, { version: 1, weeks: 105 }, { version: 1, weeks: -1 }, { version: 1, weeks: 1.5 }, { version: 1, weeks: '12' }])('renders invalid raw leadTime %j exactly as legacy', leadTime => {
    const { container } = render(<FurnishingsAuthorizationBody items={[{ ...fixed, clientLineTotalCents: 9999, leadTime } as ClientFurnishingsAuthorizationItem]}
      totalAmountCents={9999} depositPercent={0} />);
    expect(screen.getByText('Quantity 3')).toBeInTheDocument();
    expect(screen.getAllByText('$100')).toHaveLength(2);
    expect(screen.getByText(consent)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/×|Lead time/);
  });

  it('keeps multi-room text with wrapping left-column metadata and a right-column total', () => {
    render(<FurnishingsAuthorizationBody items={[{ ...items[0], allowance: false, clientUnitPriceCents: 219, clientLineTotalCents: 199947, leadTime: { version: 1, weeks: 12 } }]}
      totalAmountCents={199947} depositPercent={0} />);
    const name = screen.getByText('White oak floor · 913 sq ft · Hall · Living room');
    expect(name.parentElement).toHaveClass('min-w-0', 'break-words');
    expect(within(name.parentElement!).getByText('913 sq ft × $2.19')).toBeInTheDocument();
    expect(within(name.parentElement!).getByText('Lead time · About 12 weeks')).toBeInTheDocument();
    expect(name.parentElement!.parentElement).toHaveClass('grid-cols-[minmax(0,1fr)_auto]');
    expect(within(name.parentElement!.parentElement!).getByText('$1,999.47')).toHaveClass('text-right');
  });
});
