/** Switches the scrollable body + the overlay layer on the nav state. */
import { useCapture } from '../state/CaptureProvider';
import { ExtractingScreen } from '../screens/ExtractingScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { SavedScreen, InboxSavedScreen, ErrorScreen } from '../screens/TerminalScreens';
import { VendorScreen } from '../screens/VendorScreen';
import { SnapshotScreen } from '../screens/SnapshotScreen';
import { ImageSelectSheet } from '../overlays/ImageSelectSheet';
import { InsightSheet } from '../overlays/InsightSheet';
import { DecisionSheet } from '../overlays/DecisionSheet';
import { CreateProjectSheet } from '../overlays/CreateProjectSheet';
import { SettingsSheet } from '../overlays/SettingsSheet';
import { AccountSheet } from '../overlays/AccountSheet';
import { RecentCapturesSheet } from '../overlays/RecentCapturesSheet';

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
      return <SnapshotScreen />;
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
    case 'DEC':
      return <DecisionSheet />;
    case 'S2':
      return <CreateProjectSheet />;
    case 'T1':
      return <SettingsSheet />;
    case 'T2':
      return <AccountSheet />;
    case 'U1':
      return <RecentCapturesSheet />;
    default:
      return null;
  }
}
