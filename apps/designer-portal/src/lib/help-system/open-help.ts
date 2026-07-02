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
 * opener without pulling the panel's component graph.
 */
export const DOCUMENT_HELP_EVENT = 'document:open-help';

export function openHelp(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOCUMENT_HELP_EVENT));
}
