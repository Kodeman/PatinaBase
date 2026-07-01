/**
 * The panel chrome: header + scrollable region body (+ overlay layer) + sticky
 * commit footer. Mounts the capture controller once and gates boot / signed-out
 * before showing the full capture surface.
 */
import { useCapture } from '../state/CaptureProvider';
import { useCaptureController } from '../hooks/use-capture-controller';
import { useSettingsSync } from '../hooks/use-settings';
import { ControllerContext } from './controller-context';
import { ConnectionStrip } from './ConnectionStrip';
import { CommitBar } from './CommitBar';
import { PanelRouter, OverlayLayer } from './PanelRouter';
import { AuthScreen } from '../components/AuthScreen';
import { UpdateBanner } from '../components/UpdateBanner';
import { LoadingStrata } from '../components/LoadingStrata';

export function PanelShell() {
  const controller = useCaptureController();
  useSettingsSync();
  const { session } = useCapture();

  // Boot — resolving session / adopting the portal cookie.
  if (controller.portalChecking || session.status === 'checking') {
    return (
      <div className="flex h-screen w-full min-w-[320px] max-w-[600px] items-center justify-center bg-paper">
        <LoadingStrata size="lg" />
      </div>
    );
  }

  // A1 — signed out.
  if (session.status === 'signed-out') {
    return <AuthScreen />;
  }

  return (
    <ControllerContext.Provider value={controller}>
      <div className="flex h-screen w-full min-w-[320px] max-w-[600px] flex-col bg-paper font-body text-ink">
        <UpdateBanner />
        <ConnectionStrip />
        <div className="relative flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto p-4">
            <PanelRouter />
          </div>
          <OverlayLayer />
        </div>
        <CommitBar />
      </div>
    </ControllerContext.Provider>
  );
}
