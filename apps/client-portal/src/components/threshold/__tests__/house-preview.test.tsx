import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ClientSelection } from '@/lib/commercial-documents';
import type { RoomBandModel } from '@/lib/threshold/derive';
import { HousePreview } from '../house-preview';

function piece(overrides: Partial<ClientSelection> = {}): ClientSelection {
  return {
    id: 'chair', kind: 'furnishings', name: 'Oak chair', roomId: 'living',
    roomName: 'Living room', quantity: 1, clientUnitPriceCents: 240000,
    clientLineTotalCents: 240000, itemType: 'seating', logisticsStatus: 'specified',
    tradeJourney: null, allowance: null, instrument: null, productId: null,
    imageUrl: '/chair.jpg', docCode: null, ...overrides,
  };
}

function room(overrides: Partial<RoomBandModel> = {}): RoomBandModel {
  return {
    roomId: 'living', name: 'Living room', anchor: 'room-living', totalCents: 240000,
    targetCents: null, agreedCents: 0, varianceLine: null, pieces: [piece()], marks: [],
    ...overrides,
  };
}

describe('HousePreview', () => {
  it('shows selection imagery with its provenance and existing room destination', () => {
    render(<HousePreview bands={[room()]} />);
    expect(screen.getByRole('img', { name: 'Oak chair' })).toHaveAttribute('src', '/chair.jpg');
    expect(screen.getByText('Selection image · not an installation photo')).toBeInTheDocument();
    expect(screen.getByText('$2,400')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore this room/ })).toHaveAttribute('href', '#room-living');
    expect(screen.queryByRole('button', { name: /approve|pay|order/i })).not.toBeInTheDocument();
  });

  it('switches rooms and pieces without changing a selection or its status', () => {
    render(<HousePreview bands={[
      room({ pieces: [piece(), piece({ id: 'lamp', name: 'Reading lamp', imageUrl: '/lamp.jpg' })] }),
      room({ roomId: 'study', name: 'Study', anchor: 'room-study', pieces: [] }),
    ]} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Preview pieces in Living room' })).getByRole('button', { name: /Reading lamp/ }));
    expect(screen.getByRole('img', { name: 'Reading lamp' })).toHaveAttribute('src', '/lamp.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Study', exact: true }));
    expect(screen.getByRole('button', { name: 'Study', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Explore this room/ })).toHaveAttribute('href', '#room-study');
    expect(screen.getByText('The room is here. Its pieces will follow.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Living room', exact: true }));
    expect(screen.getByRole('img', { name: 'Oak chair' })).toBeInTheDocument();
  });

  it('handles missing and failed images without a misleading installation picture', () => {
    const { rerender } = render(<HousePreview bands={[room()]} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('An image is not available for this piece yet.')).toBeInTheDocument();
    rerender(<HousePreview bands={[room({ pieces: [piece({ imageUrl: '/new-chair.jpg' })] })]} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/new-chair.jpg');
    rerender(<HousePreview bands={[room({ pieces: [piece({ imageUrl: null, clientLineTotalCents: 0 })] })]} />);
    expect(screen.getByTestId('house-preview-placeholder')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('shows no preview before rooms are available and recovers when a chosen room disappears', () => {
    const { rerender } = render(<HousePreview bands={[]} />);
    expect(screen.queryByTestId('house-preview')).not.toBeInTheDocument();
    rerender(<HousePreview bands={[room(), room({ roomId: 'study', name: 'Study', pieces: [] })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Study', exact: true }));
    rerender(<HousePreview bands={[room()]} />);
    expect(screen.getByRole('img', { name: 'Oak chair' })).toBeInTheDocument();
  });
});
