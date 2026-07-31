import { fireEvent, render, screen } from '@testing-library/react';
import { ScanViewerSheet } from './scan-viewer-sheet';

const mockUseRoomScan = jest.fn();
const mockUseSignedScanModelUrl = jest.fn();

jest.mock('next/dynamic', () => {
  const MockRoomScanViewer = ({
    scan,
    onClose,
  }: {
    scan: { model_url: string | null; model_url_gltf: string | null };
    onClose: () => void;
  }) => (
    <div
      data-testid="room-scan-viewer"
      data-model-url={scan.model_url}
      data-model-url-gltf={scan.model_url_gltf}
    >
      <button type="button" onClick={onClose}>
        Close viewer
      </button>
    </div>
  );
  return { __esModule: true, default: () => MockRoomScanViewer };
});

jest.mock('@patina/supabase', () => ({
  useRoomScan: (...args: unknown[]) => mockUseRoomScan(...args),
  useSignedScanModelUrl: (...args: unknown[]) =>
    mockUseSignedScanModelUrl(...args),
}));

jest.mock('@patina/design-system', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

describe('ScanViewerSheet', () => {
  it('keeps one dialog owner and gives the interactive viewer only the signed model URL', () => {
    const onClose = jest.fn();
    mockUseRoomScan.mockReturnValue({
      data: {
        id: 'scan-1',
        name: 'Studio scan',
        model_url: 'https://storage.invalid/raw-model',
        model_url_gltf: 'https://storage.invalid/raw-gltf',
        thumbnail_url: null,
      },
      isError: false,
    });
    mockUseSignedScanModelUrl.mockReturnValue({
      data: 'https://storage.example/signed-model',
      isLoading: false,
    });

    render(<ScanViewerSheet scanId="scan-1" onClose={onClose} />);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Studio scan' })).toHaveAttribute(
      'data-overlay-viewer-shell',
    );
    expect(
      screen.queryByRole('button', { name: 'Back to the document' }),
    ).not.toBeInTheDocument();
    const viewer = screen.getByTestId('room-scan-viewer');
    expect(viewer).toHaveAttribute(
      'data-model-url',
      'https://storage.example/signed-model',
    );
    expect(viewer).toHaveAttribute(
      'data-model-url-gltf',
      'https://storage.example/signed-model',
    );
    expect(viewer.parentElement).toHaveClass('[&_button]:min-h-11');

    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
