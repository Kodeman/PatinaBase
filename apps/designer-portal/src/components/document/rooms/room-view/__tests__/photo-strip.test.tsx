import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomScanPhoto } from '@patina/supabase';
import { PhotoStrip, stripSrcLadder } from '../photo-strip';

function photo(over: Partial<RoomScanPhoto> = {}): RoomScanPhoto {
  return {
    id: over.id ?? 'p1',
    signedImageUrl: 'full.jpg',
    signedThumbUrl: 'thumb.jpg',
    captured_at: '2026-07-16T15:24:00Z',
    ...over,
  } as unknown as RoomScanPhoto;
}

describe('stripSrcLadder', () => {
  it('orders thumb → preview → original, cheapest first', () => {
    expect(
      stripSrcLadder({
        signedThumbUrl: 'thumb_512.jpg',
        signedPreviewUrl: 'preview_1600.jpg',
        signedImageUrl: 'original.jpg',
        mime_type: 'image/jpeg',
      }),
    ).toEqual(['thumb_512.jpg', 'preview_1600.jpg', 'original.jpg']);
  });

  it('never offers an undecodable original to a 64px tile', () => {
    // The real fix beyond the preview wiring: without this gate a
    // derivative-less HEIC row makes a 64×64 tile download ~237 KB it cannot
    // draw, and reach the placeholder anyway.
    expect(
      stripSrcLadder({
        signedThumbUrl: null,
        signedPreviewUrl: null,
        signedImageUrl: 'original.heic',
        mime_type: 'image/heic',
      }),
    ).toEqual([]);
    // …but the 1600 px derivative of that same row is fine.
    expect(
      stripSrcLadder({
        signedThumbUrl: null,
        signedPreviewUrl: 'preview_1600.jpg',
        signedImageUrl: 'original.heic',
        mime_type: 'image/heic',
      }),
    ).toEqual(['preview_1600.jpg']);
  });

  it('keeps an original whose mime is unknown or absent — no demotion on missing info', () => {
    expect(
      stripSrcLadder({ signedThumbUrl: null, signedImageUrl: 'original.bin' }),
    ).toEqual(['original.bin']);
  });

  it('collapses duplicate URLs so a failure never retries the same source', () => {
    expect(
      stripSrcLadder({
        signedThumbUrl: 'same.jpg',
        signedPreviewUrl: 'same.jpg',
        signedImageUrl: 'same.jpg',
        mime_type: 'image/jpeg',
      }),
    ).toEqual(['same.jpg']);
  });
});

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
    // still counted (one tile), but a placeholder instead of a broken img.
    // The label is mime-agnostic: a JPEG row with no derivatives and an
    // unreachable original lands here too, so "HEIC" was a guess.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('no preview')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('tiles are natively lazy and async-decoded (no virtualization needed)', () => {
    render(<PhotoStrip photos={[photo({ id: 'a' })]} onOpen={() => {}} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('a HEIC tile with derivatives never renders the original, and steps thumb → preview on error', () => {
    render(
      <PhotoStrip
        photos={[
          photo({
            id: 'heic',
            signedThumbUrl: 'thumb_512.jpg',
            signedPreviewUrl: 'preview_1600.jpg',
            signedImageUrl: 'original.heic',
            mime_type: 'image/heic',
          }),
        ]}
        onOpen={() => {}}
      />,
    );

    expect(screen.getByRole('img').getAttribute('src')).toBe('thumb_512.jpg');

    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toBe('preview_1600.jpg');

    // Ladder exhausted — the undecodable original is NOT the next rung.
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('no preview')).toBeInTheDocument();
  });
});
