/**
 * RenderGallerySection — the Room File render-gallery strip (Rendered Room v2,
 * W2 finale). `useRenderShots` is mocked at its `@patina/supabase` boundary
 * (same idiom `drawings-section.test.tsx` uses for the signing client) so the
 * suite asserts the section's own contract — which states hide it, which show
 * the strip, fixed shot order, turntable exclusion, and the lightbox — without
 * a network or a real Supabase client.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { RenderGallerySection } from '../render-gallery-section';

const mockUseRenderShots = jest.fn();

jest.mock('@patina/supabase', () => ({
  useRenderShots: (...args: unknown[]) => mockUseRenderShots(...args),
}));

jest.mock('@/components/document/overlays/full-screen-viewer-shell', () => ({
  FullScreenViewerShell: ({
    title,
    onClose,
    children,
  }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="lightbox" aria-label={title}>
      <button type="button" onClick={onClose}>
        close
      </button>
      {children}
    </div>
  ),
}));

function shot(url: string) {
  return { url, expiresAt: '2026-08-18T12:44:56.789Z' };
}

function renderSection(overrides: Partial<Record<string, unknown>> = {}) {
  return render(<RenderGallerySection roomFileId="rf-1" roomName="Living room" {...overrides} />);
}

beforeEach(() => {
  mockUseRenderShots.mockReset();
});

describe('RenderGallerySection — hidden states', () => {
  it('renders nothing when there is no artifact', () => {
    mockUseRenderShots.mockReturnValue({
      hasArtifact: false,
      shots: null,
      unavailable: 'no-artifact',
      isLoading: false,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the read path is pending (env-unset)', () => {
    mockUseRenderShots.mockReturnValue({
      hasArtifact: true,
      shots: null,
      unavailable: 'read-path-pending',
      isLoading: false,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the resolved shot map is empty', () => {
    mockUseRenderShots.mockReturnValue({
      hasArtifact: true,
      shots: {},
      unavailable: null,
      isLoading: false,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RenderGallerySection — the strip', () => {
  const SHOTS = {
    turntable_003: shot('https://r2/turntable_003.jpg'),
    top_down: shot('https://r2/top_down.jpg'),
    corner_sw: shot('https://r2/corner_sw.jpg'),
    corner_ne: shot('https://r2/corner_ne.jpg'),
    corner_nw: shot('https://r2/corner_nw.jpg'),
    corner_se: shot('https://r2/corner_se.jpg'),
  };

  beforeEach(() => {
    mockUseRenderShots.mockReturnValue({
      hasArtifact: true,
      shots: SHOTS,
      unavailable: null,
      isLoading: false,
    });
  });

  it('shows corners + top-down in a fixed order, excluding turntable frames', () => {
    renderSection();

    const tiles = screen.getAllByRole('button', { name: /Living room, .* view/ });
    expect(tiles).toHaveLength(5);
    expect(tiles.map((t) => t.querySelector('img')?.getAttribute('alt'))).toEqual([
      'Living room, corner ne view',
      'Living room, corner nw view',
      'Living room, corner se view',
      'Living room, corner sw view',
      'Living room, top down view',
    ]);
    expect(screen.queryByAltText(/turntable/)).not.toBeInTheDocument();
  });

  it('shows the section heading with the tile count', () => {
    renderSection();
    expect(screen.getByText('Renders')).toBeInTheDocument();
    expect(screen.getByText('5 views')).toBeInTheDocument();
  });

  it('opens a lightbox with the full-size image on tile click, and closes it', () => {
    renderSection();

    fireEvent.click(screen.getByAltText('Living room, top down view'));
    const lightbox = screen.getByTestId('lightbox');
    expect(lightbox).toHaveAttribute('aria-label', 'Living room · Top-down');
    expect(lightbox.querySelector('img')).toHaveAttribute('src', 'https://r2/top_down.jpg');

    fireEvent.click(screen.getByText('close'));
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });
});

describe('RenderGallerySection — cover key', () => {
  it('shows a distinct cover tile first when the route returns one', () => {
    mockUseRenderShots.mockReturnValue({
      hasArtifact: true,
      shots: { cover: shot('https://r2/cover.jpg'), top_down: shot('https://r2/top_down.jpg') },
      unavailable: null,
      isLoading: false,
    });
    renderSection();

    const tiles = screen.getAllByRole('button', { name: /Living room, .* view/ });
    expect(tiles.map((t) => t.querySelector('img')?.getAttribute('alt'))).toEqual([
      'Living room, cover view',
      'Living room, top down view',
    ]);
  });
});
