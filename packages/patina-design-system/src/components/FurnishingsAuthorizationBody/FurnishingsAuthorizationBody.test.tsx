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
