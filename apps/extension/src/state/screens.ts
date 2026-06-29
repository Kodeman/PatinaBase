/**
 * Screen taxonomy for the capture panel state machine.
 *
 * The spec's navigation is two-layer: a BASE screen plus an optional OVERLAY
 * that "returns to the prior state". Onboarding O1–O4 live in a separate Plasmo
 * tab (src/tabs/onboarding.tsx), not in this panel FSM.
 *
 * See docs/design/Chrome ext/patina-extension-ux-flow.html (T-01) and the plan
 * at ~/.claude/plans/review-the-new-ui-lovely-meteor.md.
 */

/** How the panel was invoked for this capture session. */
export type EntryPoint =
  | 'toolbar' // E1 — toolbar icon
  | 'shortcut' // keyboard command
  | 'ctx-page' // E3 — right-click page
  | 'ctx-image' // X1 — right-click image
  | 'ctx-selection' // X2 — right-click selection
  | 'onboarding'; // arrived from the onboarding tab

/** Full-screen states the panel can rest in. */
export type BaseScreen =
  | 'boot' // resolving session
  | 'signedOut' // A1
  | 'C1' // extracting
  | 'C2' // captured & enriched (also renders R1 when fields are flagged)
  | 'R2' // snapshot fallback
  | 'R3' // add fields manually
  | 'R4' // not a product page
  | 'R5' // extraction error
  | 'D1' // duplicate detected
  | 'S4' // saved to library (terminal)
  | 'S5' // sent to inbox (terminal)
  | 'X1' // capture image only
  | 'X2' // capture selection
  | 'U2' // offline queue takeover
  | 'vendor'; // vendor capture base

/** Sheets that sit ON TOP of a base screen and pop back to it. */
export type OverlayId =
  | 'C3' // image & variant select
  | 'C4' // inline field edit
  | 'C5' // patina insight expanded
  | 'S1' // assign project/room/shelf
  | 'S2' // create project inline
  | 'S3' // choose destination
  | 'D2' // merge resolution
  | 'A2' // workspace switcher (stubbed)
  | 'U1' // recent captures
  | 'T1' // settings
  | 'T2'; // account

export type Screen = BaseScreen | OverlayId;

/** Runtime set of overlay ids, for guards in the reducer/router. */
export const OVERLAY_IDS: readonly OverlayId[] = [
  'C3',
  'C4',
  'C5',
  'S1',
  'S2',
  'S3',
  'D2',
  'A2',
  'U1',
  'T1',
  'T2',
];

export function isOverlayId(value: string): value is OverlayId {
  return (OVERLAY_IDS as readonly string[]).includes(value);
}

export interface NavState {
  screen: BaseScreen;
  /** A single overlay (not a stack — the spec never nests more than one deep). */
  overlay: OverlayId | null;
  /** Where CLOSE_OVERLAY returns to. */
  returnTo: BaseScreen | null;
  entry: EntryPoint;
}

export const INITIAL_NAV: NavState = {
  screen: 'boot',
  overlay: null,
  returnTo: null,
  entry: 'toolbar',
};
