/**
 * SplatStage — state transitions + the canvas seam (Rendered Room v2, W2).
 *
 * `next/dynamic` and the design-system `ErrorBoundary` are mocked exactly as
 * `model/__tests__/model-stage.test.tsx` mocks them, which keeps the real
 * `splat-canvas` chunk (three + `@sparkjsdev/spark`, neither of which can start
 * without a WebGL context) out of the Jest module graph. What is asserted is the
 * stage's own contract: that it says the RIGHT true thing for each answer
 * `useSplatUrl` can give it, that the canvas is mounted with the URL exactly when
 * there is one, and that the stagecap chrome — the thing that makes Splat read as a
 * face of the same instrument as Plan/Orbit/Mesh — is present in every state.
 */

import { render, screen } from '@testing-library/react';
import { SplatStage } from '../splat-stage';

jest.mock('next/dynamic', () => {
  const MockSplatCanvas = ({ splatUrl }: { splatUrl: string }) => (
    <div data-testid="splat-canvas" data-splat-url={splatUrl} />
  );
  return { __esModule: true, default: () => MockSplatCanvas };
});

jest.mock('@patina/design-system', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

const CAPTURED = 'This room’s walkthrough is captured — the viewer is waiting on its read path.';
const NONE = 'This scan has no walkthrough yet — Mesh and Plan carry the room.';

describe('SplatStage', () => {
  it('holds a mono line while the Room File row is in flight', () => {
    render(<SplatStage url={null} unavailable={null} isLoading />);
    expect(screen.getByText('Fetching the walkthrough…')).toBeInTheDocument();
  });

  it('says the splat exists and the read path does not, for read-path-pending', () => {
    // The honest state this whole lane is built around: the artifact IS registered
    // on the Room File; what is missing is the capability-URL route (PR #28).
    render(<SplatStage url={null} unavailable="read-path-pending" />);
    expect(screen.getByText(CAPTURED)).toBeInTheDocument();
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
  });

  it('says there is nothing to show when no splat is registered', () => {
    render(<SplatStage url={null} unavailable="no-artifact" />);
    expect(screen.getByText(NONE)).toBeInTheDocument();
  });

  it('does not claim a splat exists when the reason is absent and so is the URL', () => {
    render(<SplatStage url={null} unavailable={null} />);
    expect(screen.getByText(NONE)).toBeInTheDocument();
  });

  it('mounts the canvas with the URL when one resolves', () => {
    // A dev `?splatUrl=` override today, a capability URL later. Either way the
    // stage hands it straight to the dynamic chunk and stops talking.
    render(<SplatStage url="/fixtures/splat/room-fixture.ply" unavailable={null} />);
    expect(screen.getByTestId('splat-canvas')).toHaveAttribute(
      'data-splat-url',
      '/fixtures/splat/room-fixture.ply',
    );
    expect(screen.queryByText(NONE)).not.toBeInTheDocument();
  });

  it('never mounts the canvas without a URL, whatever the reason', () => {
    const { rerender } = render(<SplatStage url={null} unavailable="read-path-pending" />);
    expect(screen.queryByTestId('splat-canvas')).not.toBeInTheDocument();

    rerender(<SplatStage url={null} unavailable="no-artifact" />);
    expect(screen.queryByTestId('splat-canvas')).not.toBeInTheDocument();
  });

  it('prefers the loading line over every settled state, canvas included', () => {
    render(<SplatStage url="/fixtures/splat/room-fixture.ply" unavailable={null} isLoading />);
    expect(screen.getByText('Fetching the walkthrough…')).toBeInTheDocument();
    expect(screen.queryByTestId('splat-canvas')).not.toBeInTheDocument();
  });

  it('keeps the stagecap chrome in every state', () => {
    const { rerender } = render(<SplatStage url={null} unavailable="read-path-pending" />);
    expect(screen.getByText('Splat · the room as photographed')).toBeInTheDocument();
    expect(screen.getByText('seen, never measured against')).toBeInTheDocument();

    rerender(<SplatStage url="/fixtures/splat/room-fixture.ply" unavailable={null} />);
    expect(screen.getByText('Splat · the room as photographed')).toBeInTheDocument();
    expect(screen.getByText('seen, never measured against')).toBeInTheDocument();
  });
});
