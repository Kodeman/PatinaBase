'use client';

/**
 * HT-8 — the one door into the Hours sheet's member scope: the person.
 *
 * There is no staff picker inside a money ledger, so a teammate's hours are
 * reached from their profile in the People Room and from nowhere else. The Hours
 * sheet is opened by the same `document:open-ledger` event the Studio Drawer
 * listens for; the person rides across in the module value below rather than in
 * a doorway param, on the `callSheetPending` idiom.
 *
 * It dispatches the event itself rather than calling `openLedger`, because
 * `command-bar.tsx` pulls the whole command palette — and the Post sheet's help
 * package with it — into anything that imports it. The event's shape (a bare
 * lowercase ledger key as `detail`) is command-bar's contract, mirrored here.
 */

export const hoursMemberScopePending: {
  userId: string | null;
  name: string | null;
} = { userId: null, name: null };

export function openHoursForMember(userId: string, name?: string | null): void {
  hoursMemberScopePending.userId = userId;
  hoursMemberScopePending.name = name ?? null;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('document:open-ledger', { detail: 'hours' }),
  );
}
