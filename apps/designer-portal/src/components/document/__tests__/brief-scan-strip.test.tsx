/**
 * BriefScanStrip — door-navigation intent (I74a / W2-T5) + cover photo
 * fallback order (Room Photos W2-T6, I81). `@patina/supabase` is not
 * tsconfig-paths-aliased in this app, so `jest.mock('@patina/supabase', ...)`
 * fires cleanly (patina-testing Trap 1 doesn't apply here — see
 * decisions-panel.test.tsx for the same pattern). `useLeadScans` +
 * `useRoomScanCovers` are the only data the component reads, alongside
 * `next/navigation`'s router.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { useLeadScans, useRoomScanCovers } from '@patina/supabase';
import { BriefScanStrip } from '../brief-scan-strip';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@patina/supabase', () => ({
  useLeadScans: jest.fn(),
  useRoomScanCovers: jest.fn(),
}));

const mockUseLeadScans = useLeadScans as jest.Mock;
const mockUseRoomScanCovers = useRoomScanCovers as jest.Mock;

describe('BriefScanStrip — scan tiles navigate to the Room View', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseLeadScans.mockReset();
    mockUseRoomScanCovers.mockReset();
    mockUseRoomScanCovers.mockReturnValue({ data: undefined });
  });

  it('a scan tile pushes /room/<scanId>?from=document', () => {
    mockUseLeadScans.mockReturnValue({
      data: [
        {
          id: 'row-1',
          scan_id: 'scan-abc',
          is_primary: true,
          scan: { name: 'Kitchen scan', thumbnail_url: 'https://example.com/thumb.jpg' },
        },
      ],
    });
    render(<BriefScanStrip leadId="lead-1" />);

    fireEvent.click(screen.getByTitle('Kitchen scan'));
    expect(mockPush).toHaveBeenCalledWith('/room/scan-abc?from=document');
  });

  it('renders nothing (and never navigates) when the lead has no scans', () => {
    mockUseLeadScans.mockReturnValue({ data: [] });
    const { container } = render(<BriefScanStrip leadId="lead-1" />);
    expect(container).toBeEmptyDOMElement();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('passes only the scan ids attached to the lead to the batch cover hook', () => {
    mockUseLeadScans.mockReturnValue({
      data: [
        { id: 'row-1', scan_id: 'scan-a', is_primary: false, scan: { name: 'A' } },
        { id: 'row-2', scan_id: 'scan-b', is_primary: false, scan: { name: 'B' } },
      ],
    });
    render(<BriefScanStrip leadId="lead-1" />);
    expect(mockUseRoomScanCovers).toHaveBeenCalledWith(['scan-a', 'scan-b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cover fallback order (I81): scalar → resolved cover thumb → cover image →
// "No preview" only when the scan truly has zero photos.
// ─────────────────────────────────────────────────────────────────────────────

describe('BriefScanStrip — cover fallback order', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseLeadScans.mockReset();
    mockUseRoomScanCovers.mockReset();
  });

  function renderTile(overrides: {
    thumbnail_url?: string | null;
    cover?: {
      signedThumbUrl: string | null;
      signedPreviewUrl?: string | null;
      signedImageUrl: string | null;
    } | null;
    coversLoaded?: boolean;
  }) {
    mockUseLeadScans.mockReturnValue({
      data: [
        {
          id: 'row-1',
          scan_id: 'scan-1',
          is_primary: false,
          scan: { name: 'Scan tile', thumbnail_url: overrides.thumbnail_url ?? null },
        },
      ],
    });
    const covers =
      overrides.coversLoaded === false
        ? undefined
        : new Map([['scan-1', overrides.cover ?? null]]);
    mockUseRoomScanCovers.mockReturnValue({ data: covers });
    return render(<BriefScanStrip leadId="lead-1" />);
  }

  it('scalar thumbnail_url wins over a resolved cover when both exist', () => {
    renderTile({
      thumbnail_url: 'https://example.com/legacy-thumb.jpg',
      cover: { signedThumbUrl: 'https://signed/cover-thumb.jpg', signedImageUrl: 'https://signed/cover-image.jpg' },
    });
    const img = screen.getByAltText('Scan tile') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/legacy-thumb.jpg');
  });

  it('falls back to the resolved cover\'s signed thumbnail when there is no legacy scalar', () => {
    renderTile({
      thumbnail_url: null,
      cover: { signedThumbUrl: 'https://signed/cover-thumb.jpg', signedImageUrl: 'https://signed/cover-image.jpg' },
    });
    const img = screen.getByAltText('Scan tile') as HTMLImageElement;
    expect(img.src).toBe('https://signed/cover-thumb.jpg');
  });

  it('falls back to the resolved cover\'s signed full image when there is no signed thumbnail', () => {
    renderTile({
      thumbnail_url: null,
      cover: { signedThumbUrl: null, signedImageUrl: 'https://signed/cover-image.jpg' },
    });
    const img = screen.getByAltText('Scan tile') as HTMLImageElement;
    expect(img.src).toBe('https://signed/cover-image.jpg');
  });

  it('prefers the 1600 px preview over the original when there is no signed thumbnail', () => {
    renderTile({
      thumbnail_url: null,
      cover: {
        signedThumbUrl: null,
        signedPreviewUrl: 'https://signed/cover-preview-1600.jpg',
        signedImageUrl: 'https://signed/cover-image.heic',
      },
    });
    const img = screen.getByAltText('Scan tile') as HTMLImageElement;
    expect(img.src).toBe('https://signed/cover-preview-1600.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
  });

  it('shows "No preview" only when the scan truly has zero photos (cover resolved to null)', () => {
    renderTile({ thumbnail_url: null, cover: null });
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the same quiet placeholder (no spinner) while the batch cover query is still loading', () => {
    renderTile({ thumbnail_url: null, coversLoaded: false });
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed states — several tiles in one strip, each resolving independently.
// ─────────────────────────────────────────────────────────────────────────────

describe('BriefScanStrip — mixed cover states in one strip', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseLeadScans.mockReset();
    mockUseRoomScanCovers.mockReset();
  });

  it('renders each tile from its own resolved source without cross-tile bleed', () => {
    mockUseLeadScans.mockReturnValue({
      data: [
        {
          id: 'row-legacy',
          scan_id: 'scan-legacy',
          is_primary: true,
          scan: { name: 'Legacy scan', thumbnail_url: 'https://example.com/legacy.jpg' },
        },
        {
          id: 'row-cover-thumb',
          scan_id: 'scan-cover-thumb',
          is_primary: false,
          scan: { name: 'Cover-thumb scan', thumbnail_url: null },
        },
        {
          id: 'row-empty',
          scan_id: 'scan-empty',
          is_primary: false,
          scan: { name: 'Empty scan', thumbnail_url: null },
        },
      ],
    });
    mockUseRoomScanCovers.mockReturnValue({
      data: new Map([
        ['scan-legacy', { signedThumbUrl: 'https://signed/should-not-win.jpg', signedImageUrl: null }],
        ['scan-cover-thumb', { signedThumbUrl: 'https://signed/thumb.jpg', signedImageUrl: null }],
        ['scan-empty', null],
      ]),
    });

    render(<BriefScanStrip leadId="lead-1" />);

    expect((screen.getByAltText('Legacy scan') as HTMLImageElement).src).toBe(
      'https://example.com/legacy.jpg',
    );
    expect((screen.getByAltText('Cover-thumb scan') as HTMLImageElement).src).toBe(
      'https://signed/thumb.jpg',
    );
    expect(screen.getByText('No preview')).toBeInTheDocument();
    expect(screen.getByText('Room scans · 3')).toBeInTheDocument();

    // Primary marker still only on the primary row.
    expect(screen.getByTitle('Legacy scan').textContent).toContain('Primary');
    expect(screen.getByTitle('Cover-thumb scan').textContent).not.toContain('Primary');
  });
});
