import type { AccountPage } from './account-sheet';

/** R21 dissolve — open the Account sheet ONTO a page. Same event, optional
 *  `{ page }` detail; the listener in account-sheet.tsx falls back to
 *  'profile' when the detail is absent or carries an unknown page, so every
 *  existing dispatcher (nameplate, mobile drawer, ⌘K) keeps its old behaviour.
 *  This is what /desk?account=<page> rides on. `rateFor` (K8) opens Studio
 *  onto that member's rate field. `aboveFolio` is for a caller inside a
 *  PaperFolioSheet (the invoice composer): the sheet then lays above the folio
 *  instead of beneath its backdrop.
 *
 *  Kept apart from the sheet so a caller can open it without importing every
 *  page the sheet renders. */
export function openAccountPage(
  page: AccountPage,
  options: { rateFor?: string; aboveFolio?: boolean } = {},
) {
  window.dispatchEvent(
    new CustomEvent('document:open-account', {
      detail: {
        page,
        rateFor: options.rateFor,
        aboveFolio: options.aboveFolio,
      },
    }),
  );
}
