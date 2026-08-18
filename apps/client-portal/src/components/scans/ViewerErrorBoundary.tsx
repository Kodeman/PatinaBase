'use client';

/**
 * ViewerErrorBoundary — the guard around the client-portal 3D scan viewer.
 *
 * `ClientViewerCanvas` runs on @react-three/fiber 8, which reads a React internal
 * removed in React 19: mounting it throws during render and takes the whole
 * /scans/[scanId] route to its error page — a live crash on a surface clients reach.
 * This boundary keeps the failure inside the viewer's own frame and shows the scan's
 * still instead, so the page around it (the room's details, the share panel) survives.
 *
 * It is a stop-gap, not the fix: the fix is porting the designer portal's plain-three.js
 * ModelStage across (PROPOSAL §4). r3f is deliberately left in place this wave.
 *
 * This portal has no shared boundary, so this is a small local one — the same shape the
 * designer portal's `@patina/design-system` ErrorBoundary presents at its call sites
 * (children + a static `fallback` node), and the same shape `board-block.tsx` already
 * uses locally here.
 */

import { Component, type ReactNode } from 'react';

interface ViewerErrorBoundaryProps {
  children: ReactNode;
  /** Shown in place of the children once anything below throws while rendering. */
  fallback: ReactNode;
}

export class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ViewerErrorBoundary] 3D viewer failed to render:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The static degrade: the scan's own still if one was captured, plus one line so the
 * client knows the room is fine and the viewer isn't.
 */
export function ScanStillFallback({
  thumbnailUrl,
  roomName,
}: {
  thumbnailUrl: string | null;
  roomName: string | null;
}) {
  return (
    <div
      data-testid="client-viewer-still"
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-patina-charcoal p-6 text-center"
    >
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt={roomName ? `Still image of ${roomName}` : 'Still image of your room scan'}
          className="max-h-[70%] max-w-full object-contain"
        />
      )}
      <p className="text-sm text-white/80">
        {thumbnailUrl
          ? 'The interactive 3D view isn’t available right now — here’s your room as scanned.'
          : 'The interactive 3D view isn’t available right now. Check back shortly.'}
      </p>
    </div>
  );
}
