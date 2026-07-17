import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomScanPhoto } from '@patina/supabase';
import {
  clampIndex,
  fmtStamp,
  initialViewerStage,
  nextViewerStageOnError,
  PhotoViewer,
  stageSrc,
  viewerFooterLine,
} from '../photo-viewer';

// A full-resolution + thumb pair; caption + kind + capture time.
function photo(over: Partial<RoomScanPhoto> = {}): RoomScanPhoto {
  return {
    id: over.id ?? 'p1',
    signedImageUrl: 'full.heic',
    signedThumbUrl: 'thumb.jpg',
    photo_kind: 'auto',
    caption: null,
    captured_at: '2026-07-16T15:24:00Z',
    ...over,
  } as unknown as RoomScanPhoto;
}

describe('photo-viewer — pure helpers', () => {
  it('initialViewerStage: full when a full URL exists, else thumb, else failed', () => {
    expect(initialViewerStage({ signedImageUrl: 'a', signedThumbUrl: 'b' })).toBe('full');
    expect(initialViewerStage({ signedImageUrl: null, signedThumbUrl: 'b' })).toBe('thumb');
    expect(initialViewerStage({ signedImageUrl: null, signedThumbUrl: null })).toBe('failed');
  });

  it('nextViewerStageOnError: full → thumb only when a DISTINCT thumb exists', () => {
    expect(nextViewerStageOnError('full', { signedImageUrl: 'a', signedThumbUrl: 'b' })).toBe('thumb');
    // no thumb → failed
    expect(nextViewerStageOnError('full', { signedImageUrl: 'a', signedThumbUrl: null })).toBe('failed');
    // thumb identical to the full url (nothing new to try) → failed
    expect(nextViewerStageOnError('full', { signedImageUrl: 'a', signedThumbUrl: 'a' })).toBe('failed');
    // a thumb that itself errored → failed
    expect(nextViewerStageOnError('thumb', { signedImageUrl: 'a', signedThumbUrl: 'b' })).toBe('failed');
  });

  it('stageSrc: maps a stage to its URL or null', () => {
    const p = { signedImageUrl: 'full', signedThumbUrl: 'thumb' };
    expect(stageSrc('full', p)).toBe('full');
    expect(stageSrc('thumb', p)).toBe('thumb');
    expect(stageSrc('failed', p)).toBeNull();
  });

  it('clampIndex: clamps into range, 0 for empty', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(1, 0)).toBe(0);
  });

  it('fmtStamp: date+time, feet-free; — on bad input', () => {
    expect(fmtStamp(null)).toBe('—');
    expect(fmtStamp('not-a-date')).toBe('—');
    const s = fmtStamp('2026-07-16T15:24:00Z');
    expect(s).toMatch(/\d/);
    expect(s).not.toContain('′');
    expect(s).not.toContain('″');
  });

  it('viewerFooterLine: photo N of M · kind · stamp · caption?', () => {
    const line = viewerFooterLine(
      { photo_kind: 'auto', caption: 'By the window', captured_at: '2026-07-16T15:24:00Z' },
      0,
      6,
    );
    expect(line).toContain('photo 1 of 6');
    expect(line).toContain('auto');
    expect(line).toContain('By the window');
    // caption omitted cleanly when absent (no trailing separator)
    const noCap = viewerFooterLine({ photo_kind: 'auto', caption: null, captured_at: null }, 2, 6);
    expect(noCap).toContain('photo 3 of 6');
    expect(noCap).not.toMatch(/·\s*$/);
  });
});

describe('PhotoViewer — component', () => {
  const photos = [photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })];

  it('shows the footer line for the current photo', () => {
    render(<PhotoViewer photos={photos} index={1} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/photo 2 of 3/)).toBeInTheDocument();
  });

  it('arrow keys navigate through the clamped setter', () => {
    const onIndexChange = jest.fn();
    render(<PhotoViewer photos={photos} index={1} onIndexChange={onIndexChange} onClose={() => {}} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it('prev is hidden at the first photo, next hidden at the last', () => {
    const { rerender } = render(
      <PhotoViewer photos={photos} index={0} onIndexChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByLabelText('Previous photo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Next photo')).toBeInTheDocument();

    rerender(<PhotoViewer photos={photos} index={2} onIndexChange={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText('Previous photo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Next photo')).not.toBeInTheDocument();
  });

  it('Escape closes', () => {
    const onClose = jest.fn();
    render(<PhotoViewer photos={photos} index={0} onIndexChange={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to the thumb + HEIC note when the full image errors', () => {
    render(
      <PhotoViewer
        photos={[photo({ signedImageUrl: 'full.heic', signedThumbUrl: 'thumb.jpg' })]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('full.heic');
    expect(screen.queryByText(/preview quality/i)).not.toBeInTheDocument();

    fireEvent.error(img);

    const img2 = screen.getByRole('img') as HTMLImageElement;
    expect(img2.getAttribute('src')).toBe('thumb.jpg');
    expect(screen.getByText(/preview quality — full image is HEIC/i)).toBeInTheDocument();
  });

  it('shows a quiet "preview unavailable" tile when neither url is loadable', () => {
    render(
      <PhotoViewer
        photos={[photo({ signedImageUrl: null, signedThumbUrl: null })]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
