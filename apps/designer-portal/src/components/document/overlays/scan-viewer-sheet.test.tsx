/**
 * ScanViewerSheet — one dialog owner, the scan's still as content.
 *
 * The r3f `RoomScanViewer` this sheet used to lazy-load was deleted with the rest
 * of the React-19-incompatible viewer stack (Rendered Room v2, W2), so there is no
 * `next/dynamic` boundary and no ErrorBoundary left to mock: what the sheet renders
 * in practice — the still it always degraded to — it now renders directly.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { ScanViewerSheet } from './scan-viewer-sheet';

const mockUseRoomScan = jest.fn();

jest.mock('@patina/supabase', () => ({
  useRoomScan: (...args: unknown[]) => mockUseRoomScan(...args),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

describe('ScanViewerSheet', () => {
  it('keeps one dialog owner and shows the scan still, with no WebGL viewer', () => {
    const onClose = jest.fn();
    mockUseRoomScan.mockReturnValue({
      data: {
        id: 'scan-1',
        name: 'Studio scan',
        model_url: 'https://storage.invalid/raw-model',
        model_url_gltf: 'https://storage.invalid/raw-gltf',
        thumbnail_url: 'https://storage.example/still.jpg',
      },
      isError: false,
    });

    render(<ScanViewerSheet scanId="scan-1" onClose={onClose} />);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Studio scan' })).toHaveAttribute(
      'data-overlay-viewer-shell',
    );
    expect(screen.queryByTestId('room-scan-viewer')).not.toBeInTheDocument();

    const still = screen.getByAltText('Studio scan');
    expect(still).toHaveAttribute('src', 'https://storage.example/still.jpg');
    expect(still.closest('[data-overlay-scan-still]')).toBeInTheDocument();
    // The sheet's touch-target chrome is unchanged by the viewer's removal.
    expect(
      screen.getByRole('dialog').querySelector('[data-overlay-scan-viewer]'),
    ).toHaveClass('[&_button]:min-h-11');
  });

  it('says so plainly when the scan carries no still', () => {
    mockUseRoomScan.mockReturnValue({
      data: { id: 'scan-2', name: 'Bare scan', thumbnail_url: null },
      isError: false,
    });

    render(<ScanViewerSheet scanId="scan-2" onClose={jest.fn()} />);

    expect(
      screen.getByText('No preview image is available for this scan.'),
    ).toBeInTheDocument();
  });

  it('holds a paper state while the scan row is unresolved', () => {
    mockUseRoomScan.mockReturnValue({ data: undefined, isError: false });
    render(<ScanViewerSheet scanId="scan-3" onClose={jest.fn()} />);
    expect(screen.getByText('Opening the scan…')).toBeInTheDocument();
  });

  it('closes from the still’s own header', () => {
    const onClose = jest.fn();
    mockUseRoomScan.mockReturnValue({
      data: { id: 'scan-1', name: 'Studio scan', thumbnail_url: null },
      isError: false,
    });

    render(<ScanViewerSheet scanId="scan-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the document' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
