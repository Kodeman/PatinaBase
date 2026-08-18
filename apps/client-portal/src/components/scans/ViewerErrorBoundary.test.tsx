/**
 * ViewerErrorBoundary — the guard that keeps the r3f@8 crash out of the route.
 *
 * The failure this exists for is a throw during render, so the test throws during
 * render. `componentDidCatch` logs, and React itself also logs the caught error, so
 * console.error is silenced for the duration rather than asserted on.
 */

import { render, screen } from '@testing-library/react';
import { ScanStillFallback, ViewerErrorBoundary } from './ViewerErrorBoundary';

function Exploding(): JSX.Element {
  throw new Error('Cannot read properties of undefined (reading ReactCurrentOwner)');
}

describe('ViewerErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders its children while nothing throws', () => {
    render(
      <ViewerErrorBoundary fallback={<p>fallback</p>}>
        <p>the viewer</p>
      </ViewerErrorBoundary>,
    );

    expect(screen.getByText('the viewer')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('swaps in the fallback when the viewer throws during render', () => {
    render(
      <ViewerErrorBoundary fallback={<p>fallback</p>}>
        <Exploding />
      </ViewerErrorBoundary>,
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
  });
});

describe('ScanStillFallback', () => {
  it('shows the scan still, described by the room name', () => {
    render(<ScanStillFallback thumbnailUrl="https://cdn.invalid/still.jpg" roomName="Kitchen" />);

    const img = screen.getByAltText('Still image of Kitchen');
    expect(img).toHaveAttribute('src', 'https://cdn.invalid/still.jpg');
    expect(
      screen.getByText(
        'The interactive 3D view isn’t available right now — here’s your room as scanned.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to a generic alt when the room has no name', () => {
    render(<ScanStillFallback thumbnailUrl="https://cdn.invalid/still.jpg" roomName={null} />);
    expect(screen.getByAltText('Still image of your room scan')).toBeInTheDocument();
  });

  it('carries a line of its own when there is no still to show', () => {
    render(<ScanStillFallback thumbnailUrl={null} roomName="Kitchen" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByText('The interactive 3D view isn’t available right now. Check back shortly.'),
    ).toBeInTheDocument();
  });
});
