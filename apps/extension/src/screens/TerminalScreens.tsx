/** Terminal + error screens: S4 (saved to library), S5 (sent to inbox), R5 (error). */
import { useState } from 'react';
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { useController } from '../panel/controller-context';
import { useReferenceData } from '../hooks/use-reference-data';
import { FFESlotPicker } from '../components/FFESlotPicker';

function NextActions() {
  const dispatch = useCaptureDispatch();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: 'CAPTURE_NEXT' })}
      className="mt-5 rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
    >
      Capture another
    </button>
  );
}

function Terminal({
  tone,
  title,
  sub,
}: {
  tone: 'verdigris' | 'brass';
  title: string;
  sub: string;
}) {
  const ring = tone === 'verdigris' ? 'text-verdigris' : 'text-brass';
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className={`font-display text-[1.6rem] ${ring}`}>✓</span>
      <h2 className="mt-2 font-display text-[1.3rem] text-ink">{title}</h2>
      <p className="mt-1 max-w-[28ch] text-[0.85rem] text-ink-soft">{sub}</p>
      <NextActions />
    </div>
  );
}

export function SavedScreen() {
  const { io, draft, routing } = useCapture();
  const dispatch = useCaptureDispatch();
  const { projects } = useReferenceData();
  const [showFfe, setShowFfe] = useState(false);

  const productId = io.lastSavedProductId;
  const placementMessage = io.lastPlacementOutcome
    ? io.lastPlacementOutcome.outcome === 'reused'
      ? 'The piece is in your library and its existing project selection was reused.'
      : io.lastPlacementOutcome.outcome === 'filled'
        ? 'The piece is in your library and filled the selected project need.'
        : io.lastPlacementOutcome.outcome === 'held'
          ? 'The piece is in your library and its project placement is held for review.'
          : 'The piece is in your library and a project selection was created.'
    : 'The piece is in your library, ready to place.';
  const initialContext =
    routing.destination.type === 'project-room'
      ? {
          projectId: routing.destination.projectId,
          roomId: routing.destination.roomId,
        }
      : { projectId: null, roomId: null };

  if (showFfe && productId) {
    return (
      <FFESlotPicker
        productId={productId}
        productName={draft?.fields.name.value || 'Captured piece'}
        projects={projects}
        initialContext={initialContext}
        onComplete={() => setShowFfe(false)}
        onCancel={() => setShowFfe(false)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="font-display text-[1.6rem] text-verdigris">✓</span>
      <h2 className="mt-2 font-display text-[1.3rem] text-ink">Saved to your library</h2>
      <p className="mt-1 max-w-[28ch] text-[0.85rem] text-ink-soft">
        {placementMessage}
      </p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'CAPTURE_NEXT' })}
        className="mt-5 rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
      >
        Capture another
      </button>
      {productId && !routing.specBookPlacementPilot && (
        <button
          type="button"
          onClick={() => setShowFfe(true)}
          className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-soft hover:text-verdigris"
        >
          Send to a project slot →
        </button>
      )}
    </div>
  );
}

export function InboxSavedScreen() {
  return (
    <Terminal
      tone="brass"
      title="Sent to your inbox"
      sub="Tucked into the inbox to sort when you're back at the desk."
    />
  );
}

export function ErrorScreen() {
  const { refresh, currentUrl } = useController();
  const dispatch = useCaptureDispatch();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="font-display text-[1.4rem] text-rust">—</span>
      <h2 className="mt-2 font-display text-[1.2rem] text-ink">Couldn't read this page</h2>
      <p className="mt-1 max-w-[30ch] text-[0.85rem] text-ink-soft">
        The page blocked extraction or timed out. Try again, or capture it by hand.
      </p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={refresh}
          className="rounded-md bg-verdigris px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-paper hover:bg-verdigris-ink"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'NAV', screen: 'R2' })}
          className="rounded-md border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-soft hover:border-ink-soft"
        >
          Snapshot
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'MANUAL_START', url: currentUrl })}
          className="rounded-md border border-line px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-soft hover:border-ink-soft"
        >
          By hand
        </button>
      </div>
    </div>
  );
}
