/**
 * openHelp (R89) — open the Document's ContextualHelpPanel from anywhere: ⌘K's
 * alias-aware "Help…" row, a sheet head's `?` doorway, a ledger's front-matter,
 * or any surface that wants to summon help.
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
 * where the door was opened from; `surfaceKey` (help-desk Wave 1) lets an
 * explicit doorway — a sheet head's `?`, a front-matter `?`, the court bar —
 * scope the panel to a key the pathname can't see (sheets never change the
 * pathname).
 */
export const DOCUMENT_HELP_EVENT = 'document:open-help';

/** Where the help door was opened from (F1 telemetry vocabulary). */
export type HelpOpenSource = 'palette' | 'sheet-head' | 'front-matter' | 'court-bar';

export interface OpenHelpEventDetail {
  source: HelpOpenSource;
  /** Explicit surface key for the panel — set by `?` doorways whose surface
   *  the pathname can't derive. Omitted, the panel keeps its current key. */
  surfaceKey?: string;
}

export function openHelp(
  options: HelpOpenSource | { source?: HelpOpenSource; surfaceKey?: string } = 'palette',
): void {
  if (typeof window === 'undefined') return;
  const detail: OpenHelpEventDetail =
    typeof options === 'string'
      ? { source: options }
      : { source: options.source ?? 'palette', surfaceKey: options.surfaceKey };
  window.dispatchEvent(new CustomEvent<OpenHelpEventDetail>(DOCUMENT_HELP_EVENT, { detail }));
}
