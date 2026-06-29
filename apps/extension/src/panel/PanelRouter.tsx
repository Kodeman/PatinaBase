/** Switches the scrollable body + the overlay layer on the nav state. */
import { useCapture, useCaptureDispatch } from '../state/CaptureProvider';
import { ExtractingScreen } from '../screens/ExtractingScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { SavedScreen, InboxSavedScreen, ErrorScreen } from '../screens/TerminalScreens';
import { VendorScreen } from '../screens/VendorScreen';
import { ImageSelectSheet } from '../overlays/ImageSelectSheet';
import { InsightSheet } from '../overlays/InsightSheet';

function Placeholder({ label }: { label: string }) {
  const dispatch = useCaptureDispatch();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-[1.1rem] text-ink">{label}</p>
      <p className="mt-1 text-[0.8rem] text-ink-soft">Coming in a later phase.</p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'NAV', screen: 'C2' })}
        className="mt-4 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-verdigris hover:text-verdigris-ink"
      >
        Back to capture
      </button>
    </div>
  );
}

export function PanelRouter() {
  const { nav } = useCapture();
  switch (nav.screen) {
    case 'C1':
      return <ExtractingScreen />;
    case 'C2':
      return <RecordScreen />;
    case 'R5':
      return <ErrorScreen />;
    case 'S4':
      return <SavedScreen />;
    case 'S5':
      return <InboxSavedScreen />;
    case 'vendor':
      return <VendorScreen />;
    case 'R2':
      return <Placeholder label="Snapshot fallback" />;
    case 'R3':
      return <Placeholder label="Add by hand" />;
    case 'R4':
      return <Placeholder label="Not a product page" />;
    case 'D1':
      return <Placeholder label="Duplicate found" />;
    case 'X1':
      return <Placeholder label="Image capture" />;
    case 'X2':
      return <Placeholder label="Selection capture" />;
    case 'U2':
      return <Placeholder label="Offline queue" />;
    default:
      return <RecordScreen />;
  }
}

export function OverlayLayer() {
  const { nav } = useCapture();
  if (!nav.overlay) return null;
  switch (nav.overlay) {
    case 'C3':
      return <ImageSelectSheet />;
    case 'C5':
      return <InsightSheet />;
    default:
      return null;
  }
}
