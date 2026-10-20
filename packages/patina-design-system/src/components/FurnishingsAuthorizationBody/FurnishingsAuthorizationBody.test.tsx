import { render, screen, within } from '@testing-library/react';
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
