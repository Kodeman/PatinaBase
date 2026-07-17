import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomScanPhoto } from '@patina/supabase';
import { PhotoStrip } from '../photo-strip';

function photo(over: Partial<RoomScanPhoto> = {}): RoomScanPhoto {
  return {
    id: over.id ?? 'p1',
    signedImageUrl: 'full.jpg',
    signedThumbUrl: 'thumb.jpg',
    captured_at: '2026-07-16T15:24:00Z',
    ...over,
  } as unknown as RoomScanPhoto;
}

describe('PhotoStrip', () => {
  it('renders nothing at all when there are no photos (Field scans)', () => {
    const { container } = render(<PhotoStrip photos={[]} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one tile per photo and counts them honestly', () => {
    const photos = [photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })];
    render(<PhotoStrip photos={photos} onOpen={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    // header count reflects the honest total
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens the viewer at the clicked index', () => {
    const onOpen = jest.fn();
    const photos = [photo({ id: 'a' }), photo({ id: 'b' })];
    render(<PhotoStrip photos={photos} onOpen={onOpen} />);
    fireEvent.click(screen.getAllByRole('listitem')[1]);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('shows a quiet placeholder tile for a photo with no loadable source', () => {
    const photos = [photo({ id: 'a', signedImageUrl: null, signedThumbUrl: null })];
    render(<PhotoStrip photos={photos} onOpen={() => {}} />);
    // still counted (one tile), but a placeholder instead of a broken img
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('HEIC')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
