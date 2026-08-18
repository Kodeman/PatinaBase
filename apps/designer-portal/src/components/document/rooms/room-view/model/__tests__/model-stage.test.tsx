/**
 * ModelStage — mode gate + stage states (Rendered Room v2, P1).
 *
 * `next/dynamic` and the design-system `ErrorBoundary` are mocked exactly as
 * `overlays/scan-viewer-sheet.test.tsx` mocks them, which keeps the real
 * `model-canvas` chunk (three + the GLTF/Draco/KTX2 loaders, all ESM-only under
 * `three/examples/`) out of the Jest module graph. What is asserted here is the stage's
 * own contract: which of the three quiet states it shows, and that the canvas is handed
 * the signed URL only when there is one.
 */

import { render, screen } from '@testing-library/react';
import { hasMeshModel, ModelStage } from '../model-stage';

jest.mock('next/dynamic', () => {
  const MockModelCanvas = ({ modelUrl }: { modelUrl: string }) => (
    <div data-testid="model-canvas" data-model-url={modelUrl} />
  );
  return { __esModule: true, default: () => MockModelCanvas };
});

jest.mock('@patina/design-system', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

describe('hasMeshModel — the MESH mode gate', () => {
  it('is true only for a scan carrying a GLB (`model_url_gltf`)', () => {
    expect(hasMeshModel({ model_url_gltf: 'https://storage.invalid/room.glb' })).toBe(true);
  });

  it('is false without a GLB — a USDZ-only scan never offers MESH', () => {
    // model_url (the iOS USDZ) is deliberately NOT a fallback: GLTFLoader can't read it.
    expect(hasMeshModel({ model_url_gltf: null })).toBe(false);
    expect(hasMeshModel({ model_url_gltf: '' })).toBe(false);
    expect(hasMeshModel({})).toBe(false);
  });

  it('is false while the scan row is unresolved', () => {
    expect(hasMeshModel(null)).toBe(false);
    expect(hasMeshModel(undefined)).toBe(false);
  });
});

describe('ModelStage', () => {
  it('hands the canvas the signed URL once one resolves', () => {
    render(<ModelStage modelUrl="https://storage.example/signed.glb" />);
    expect(screen.getByTestId('model-canvas')).toHaveAttribute(
      'data-model-url',
      'https://storage.example/signed.glb',
    );
  });

  it('holds a quiet line while the URL is being signed — never mounts the canvas', () => {
    render(<ModelStage modelUrl={null} isSigning />);
    expect(screen.getByText('Fetching the mesh…')).toBeInTheDocument();
    expect(screen.queryByTestId('model-canvas')).not.toBeInTheDocument();
  });

  it('degrades to a no-mesh line when signing comes back empty', () => {
    render(<ModelStage modelUrl={null} />);
    expect(
      screen.getByText('This scan has no mesh file yet — Plan carries the measurements.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('model-canvas')).not.toBeInTheDocument();
  });

  it('keeps the stagecap chrome in every state', () => {
    const { rerender } = render(<ModelStage modelUrl={null} isSigning />);
    expect(screen.getByText('Mesh · the room as scanned')).toBeInTheDocument();

    rerender(<ModelStage modelUrl="https://storage.example/signed.glb" />);
    expect(screen.getByText('Mesh · the room as scanned')).toBeInTheDocument();
    expect(screen.getByText('drag to orbit · scroll to move closer')).toBeInTheDocument();
  });
});
