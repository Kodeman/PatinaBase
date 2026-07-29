import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomScanPhoto } from '@patina/supabase';
import {
  clampIndex,
  fmtStamp,
  initialViewerStage,
  isBrowserDecodableMime,
  nextViewerStageOnError,
  PhotoViewer,
  stageSrc,
  viewerFooterLine,
  viewerQualityNote,
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

  it('stageSrc: the preview rung reads signedPreviewUrl, null when absent', () => {
    expect(
      stageSrc('preview', { signedImageUrl: 'f', signedThumbUrl: 't', signedPreviewUrl: 'p' }),
    ).toBe('p');
    // A photo that predates the preview rung has no such field at all — the
    // rung reads null, it does not read `undefined` into an <img src>.
    expect(stageSrc('preview', { signedImageUrl: 'f', signedThumbUrl: 't' })).toBeNull();
  });

  it('isBrowserDecodableMime: false ONLY for the HEIC/HEIF family', () => {
    expect(isBrowserDecodableMime('image/heic')).toBe(false);
    expect(isBrowserDecodableMime('image/heif')).toBe(false);
    expect(isBrowserDecodableMime('image/heic-sequence')).toBe(false);
    expect(isBrowserDecodableMime('IMAGE/HEIC')).toBe(false);
    expect(isBrowserDecodableMime('image/heic; codecs=hvc1')).toBe(false);
    expect(isBrowserDecodableMime('image/jpeg')).toBe(true);
    expect(isBrowserDecodableMime('image/png')).toBe(true);
  });

  it('isBrowserDecodableMime: NEVER demotes on missing information', () => {
    // The whole ladder rests on this: an unknown, empty or absent mime is
    // treated as decodable, so a call site that knows nothing behaves exactly
    // as it did before the preview rung existed.
    expect(isBrowserDecodableMime(null)).toBe(true);
    expect(isBrowserDecodableMime(undefined)).toBe(true);
    expect(isBrowserDecodableMime('')).toBe(true);
    expect(isBrowserDecodableMime('application/octet-stream')).toBe(true);
  });

  it('initialViewerStage: a HEIC row with a preview OPENS at the preview — no HEIC request at all', () => {
    expect(
      initialViewerStage({
        signedImageUrl: 'full.heic',
        signedPreviewUrl: 'preview_1600.jpg',
        signedThumbUrl: 'thumb_512.jpg',
        mime_type: 'image/heic',
      }),
    ).toBe('preview');
  });

  it('initialViewerStage: a decodable original still wins over its own derivatives', () => {
    expect(
      initialViewerStage({
        signedImageUrl: 'full.jpg',
        signedPreviewUrl: 'preview_1600.jpg',
        signedThumbUrl: 'thumb_512.jpg',
        mime_type: 'image/jpeg',
      }),
    ).toBe('full');
  });

  it('initialViewerStage: a HEIC row with only a thumb opens at the thumb', () => {
    expect(
      initialViewerStage({
        signedImageUrl: 'full.heic',
        signedPreviewUrl: null,
        signedThumbUrl: 'thumb_512.jpg',
        mime_type: 'image/heic',
      }),
    ).toBe('thumb');
  });

  it('initialViewerStage: a derivative-less HEIC still opens at the original rather than nothing', () => {
    // The mime skip is a preference, not a ban — Safari decodes HEIC, and in
    // Chrome this is exactly the old behaviour (try, fail, fall through).
    expect(
      initialViewerStage({
        signedImageUrl: 'full.heic',
        signedPreviewUrl: null,
        signedThumbUrl: null,
        mime_type: 'image/heic',
      }),
    ).toBe('full');
  });

  it('nextViewerStageOnError: the error walk picks up the preview rung', () => {
    const p = {
      signedImageUrl: 'full.jpg',
      signedPreviewUrl: 'preview_1600.jpg',
      signedThumbUrl: 'thumb_512.jpg',
    };
    expect(nextViewerStageOnError('full', p)).toBe('preview');
    expect(nextViewerStageOnError('preview', p)).toBe('thumb');
    expect(nextViewerStageOnError('thumb', p)).toBe('failed');
    // A preview identical to the URL that just failed is not retried.
    expect(
      nextViewerStageOnError('full', {
        signedImageUrl: 'same.jpg',
        signedPreviewUrl: 'same.jpg',
        signedThumbUrl: 'thumb.jpg',
      }),
    ).toBe('thumb');
  });

  it('viewerQualityNote: silent at full AND preview; a note only at the 512 px thumb', () => {
    const p = {
      signedImageUrl: 'full.heic',
      signedPreviewUrl: 'preview_1600.jpg',
      signedThumbUrl: 'thumb_512.jpg',
    };
    // 1600 px is the intended quality for a HEIC row, not a degradation.
    expect(viewerQualityNote('full', p)).toBeNull();
    expect(viewerQualityNote('preview', p)).toBeNull();
    expect(viewerQualityNote('failed', p)).toBeNull();
    expect(viewerQualityNote('thumb', p)).toMatch(/reduced quality/i);
    // Mime-agnostic: a JPEG row can reach the thumb too, so the note must not
    // name a format.
    expect(viewerQualityNote('thumb', p)).not.toMatch(/heic/i);
    // Nothing better existed — the thumb IS the photo, so no apology.
    expect(
      viewerQualityNote('thumb', { signedImageUrl: null, signedThumbUrl: 'thumb_512.jpg' }),
    ).toBeNull();
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

  // ───────────────────────────────────────────────────────────────────────
  // THE REGRESSION GUARD for the defect this change exists to fix.
  //
  // Before: PHOTO_COLUMNS never selected `preview_url`, so a HEIC photo had
  // no preview rung; the viewer requested the undecodable original, Chrome
  // failed, `onError` dropped to the 512 px thumbnail, and the footer
  // apologised. Two-thirds of production photos were shown at a third of the
  // resolution already sitting in storage.
  //
  // This test fires NO error event. If the ladder ever regresses to
  // discovering undecodability by failing, the very first src will be the
  // HEIC and this goes red before any fallback can paper over it.
  // ───────────────────────────────────────────────────────────────────────
  it('opens a HEIC photo directly at the 1600 px preview — no error event, no note, no HEIC request', () => {
    const { container } = render(
      <PhotoViewer
        photos={[
          photo({
            signedImageUrl: 'https://signed/original.heic',
            signedPreviewUrl: 'https://signed/derivative_1600.jpg',
            signedThumbUrl: 'https://signed/derivative_512.jpg',
            mime_type: 'image/heic',
          }),
        ]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );

    const img = screen.getByRole('img') as HTMLImageElement;

    // The first — and only — source the browser is ever handed.
    expect(img.getAttribute('src')).toBe('https://signed/derivative_1600.jpg');
    // The undecodable original is never requested, at any point.
    expect(container.innerHTML).not.toContain('original.heic');
    // Nor did we settle for the 512 px thumb.
    expect(img.getAttribute('src')).not.toBe('https://signed/derivative_512.jpg');
    // 1600 px is the intended quality, so nothing is apologised for.
    expect(screen.queryByText(/reduced quality/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preview quality/i)).not.toBeInTheDocument();
    // Decode hygiene: the opened photo is explicitly EAGER (lazy here is a bug).
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('decoding')).toBe('async');

    // A successful load settles the ladder — no further transitions.
    fireEvent.load(img);
    expect((screen.getByRole('img') as HTMLImageElement).getAttribute('src')).toBe(
      'https://signed/derivative_1600.jpg',
    );
    expect(screen.queryByText(/reduced quality/i)).not.toBeInTheDocument();
  });

  it('walks full → preview → thumb when each source errors in turn', () => {
    render(
      <PhotoViewer
        photos={[
          photo({
            signedImageUrl: 'full.jpg',
            signedPreviewUrl: 'preview_1600.jpg',
            signedThumbUrl: 'thumb_512.jpg',
            mime_type: 'image/jpeg',
          }),
        ]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );

    // A decodable original opens at full.
    expect((screen.getByRole('img') as HTMLImageElement).getAttribute('src')).toBe('full.jpg');

    fireEvent.error(screen.getByRole('img'));
    expect((screen.getByRole('img') as HTMLImageElement).getAttribute('src')).toBe(
      'preview_1600.jpg',
    );
    // Still 1600 px — no apology on this rung either.
    expect(screen.queryByText(/reduced quality/i)).not.toBeInTheDocument();

    fireEvent.error(screen.getByRole('img'));
    expect((screen.getByRole('img') as HTMLImageElement).getAttribute('src')).toBe('thumb_512.jpg');
    expect(screen.getByText(/reduced quality/i)).toBeInTheDocument();

    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  });

  it('falls back to the thumb + quality note when the full image errors', () => {
    render(
      <PhotoViewer
        photos={[photo({ signedImageUrl: 'full.heic', signedThumbUrl: 'thumb.jpg' })]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    // No `mime_type` on this literal — the ladder never demotes on missing
    // information, so it still opens at the original.
    expect(img.getAttribute('src')).toBe('full.heic');
    expect(screen.queryByText(/reduced quality/i)).not.toBeInTheDocument();

    fireEvent.error(img);

    const img2 = screen.getByRole('img') as HTMLImageElement;
    expect(img2.getAttribute('src')).toBe('thumb.jpg');
    expect(
      screen.getByText(/reduced quality — the larger image could not be loaded/i),
    ).toBeInTheDocument();
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
