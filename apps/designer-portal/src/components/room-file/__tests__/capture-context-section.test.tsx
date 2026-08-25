import { render, screen } from '@testing-library/react';
import { CaptureContextSection } from '../capture-context-section';
import type { ScanContextCapture } from '@patina/supabase';

const signed: Record<string, string> = {
  'uid/cap-1/photo.jpg': 'https://signed.example/1?sig=a',
};

let seenPaths: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: (paths: (string | null | undefined)[]) => {
    seenPaths = paths;
    return { data: signed };
  },
}));

function capture(over: Partial<ScanContextCapture> = {}): ScanContextCapture {
  return {
    id: 'cap-1',
    title: 'Baseboard',
    notes: null,
    category: null,
    destination: null,
    status: null,
    photos: [{}],
    primary_photo_path: null,
    thumbnail_url: null,
    voice_transcript: null,
    captured_lat: null,
    captured_lng: null,
    provenance: null,
    committed_at: '2026-08-24T10:00:00Z',
    created_at: '2026-08-24T10:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  seenPaths = [];
});

describe('CaptureContextSection thumbnails', () => {
  it('renders the SIGNED capture-media URL when the row carries a storage path', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ primary_photo_path: 'uid/cap-1/photo.jpg' })]}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://signed.example/1?sig=a');
  });

  it('batches every storage path on the page into one signing call', () => {
    render(
      <CaptureContextSection
        captures={[
          capture({ id: 'a', primary_photo_path: 'uid/cap-1/photo.jpg' }),
          capture({ id: 'b', primary_photo_path: 'uid/cap-2/photo.jpg' }),
          capture({ id: 'c', primary_photo_path: null }),
        ]}
      />,
    );
    expect(seenPaths).toEqual(['uid/cap-1/photo.jpg', 'uid/cap-2/photo.jpg']);
  });

  it('falls back to an already-usable thumbnail_url when there is no storage path', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ thumbnail_url: 'https://cdn.example/legacy.jpg' })]}
      />,
    );
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'https://cdn.example/legacy.jpg',
    );
  });

  it('shows the count placeholder — never a broken image — when the path did not sign', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ id: 'cap-9', primary_photo_path: 'uid/cap-9/missing.jpg' })]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('1◻')).toBeInTheDocument();
  });

  it('renders nothing but the empty line for a scan with no captures', () => {
    const { container } = render(<CaptureContextSection captures={[]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText('No photos or notes were pinned to this scan.'),
    ).toBeInTheDocument();
  });
});
