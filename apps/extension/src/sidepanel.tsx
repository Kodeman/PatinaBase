/**
 * Patina Capture side panel.
 *
 * Thin mount: the CaptureProvider holds the panel's state machine and the
 * PanelShell renders the chrome + screens. All capture logic lives in
 * src/state/* (reducer, draft adapters, save effects) and src/panel/* — the
 * legacy 1869-line monolith was retired in the T-01 rebuild.
 */
import { CaptureProvider } from './state/CaptureProvider';
import { PanelShell } from './panel/PanelShell';
import './style.css';

function Popup() {
  return (
    <CaptureProvider>
      <PanelShell />
    </CaptureProvider>
  );
}

export default Popup;
