/**
 * openHelp (R89) — open the Document's ContextualHelpPanel from anywhere: ⌘K's
 * alias-aware "Help…" row, or any surface that wants to summon help.
 *
 * The panel is mounted once in the (document) layout (DocumentHelpProvider), so
 * — unlike the Desk-mounted sheets that need a pending-flag hand-off across a
 * navigation (openCaptureLead / openOpenProject) — it is ALWAYS listening. A
 * plain window event reaches it, exactly like `openCommandBar` / `openLedger`.
 * No module flag is needed; the listener never unmounts inside the document.
 *
 * Kept in this tiny React-free module so the ⌘K integration can import the
 * opener without pulling the panel's component graph. That also means this
 * module can't know the current surface key (it lives with whatever context
 * DocumentHelpPanel is scoped to) — so the F1 `wayfinding.helpOpened` event
 * fires from document-help.tsx, where the surface key is already in hand, not
 * here. `source` rides along on the event detail so that firing site can say
 * where the door was opened from; today the ⌘K "Help…" row is the only
 * caller, hence the 'palette' default.
 */
export const DOCUMENT_HELP_EVENT = 'document:open-help';

export interface OpenHelpEventDetail {
  source: string;
}

export function openHelp(source = 'palette'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OpenHelpEventDetail>(DOCUMENT_HELP_EVENT, { detail: { source } }),
  );
}
