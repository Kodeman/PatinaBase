/**
 * SplatStage — the projection's quiet states (Rendered Room v2, W2).
 *
 * Every state this stage can be in is reachable today, because none of them needs a
 * WebGL context: the canvas is not in this build (see `splat/README.md`). What is
 * asserted is that the stage says the RIGHT true thing for each answer `useSplatUrl`
 * can give it, and that the stagecap chrome — the thing that makes Splat read as a
 * face of the same instrument as Plan/Orbit/Mesh — is present in all of them.
 */

import { render, screen } from '@testing-library/react';
import { SplatStage } from '../splat-stage';

const CAPTURED = 'This room’s walkthrough is captured — the viewer is waiting on its read path.';
const NONE = 'This scan has no walkthrough yet — Mesh and Plan carry the room.';
const NO_VIEWER = 'The walkthrough viewer isn’t in this build yet — Mesh and Plan carry the room.';

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

  it('admits there is no viewer when a URL does resolve', () => {
    // A dev `?splatUrl=` override today, a capability URL later. Until
    // `splat-canvas.tsx` exists the stage must not pretend to render it.
    render(<SplatStage url="/fixtures/splat/room-fixture.ply" unavailable={null} />);
    expect(screen.getByText(NO_VIEWER)).toBeInTheDocument();
  });

  it('prefers the loading line over every settled state', () => {
    render(<SplatStage url="/fixtures/splat/room-fixture.ply" unavailable={null} isLoading />);
    expect(screen.getByText('Fetching the walkthrough…')).toBeInTheDocument();
    expect(screen.queryByText(NO_VIEWER)).not.toBeInTheDocument();
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
