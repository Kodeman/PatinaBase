/**
 * Whether a piece is here — the one selector the Install region's head and
 * rows both read (rulings D6, 0a-2). The two counts it replaces were deleted,
 * not merged: each row prints a state word and nothing prints a ratio.
 *
 * Field names are `useProjectFFEItems`'s row: `project_ffe_items.status`
 * carries no `received` value (RECEIVED is a derived stamp over `delivered`,
 * `stamp-derivation.ts`), so an arrived piece is `delivered`; `delivered_date`
 * lives on the line's purchase order, embedded when the hook is called with
 * `withLifecycle: true`.
 */

export interface InstallStateInput {
  status?: string | null;
  purchase_order?: { delivered_date?: string | null } | null;
}

export type PieceInstallState = 'not-here' | 'here' | 'installed';

export const STATE_WORDS: Record<PieceInstallState, string> = {
  'not-here': 'Not here',
  here: 'Here',
  installed: 'Installed',
};

const HERE_STATUSES = new Set(['delivered', 'installed']);

export function isPieceHere(item: InstallStateInput): boolean {
  return (
    Boolean(item.purchase_order?.delivered_date) ||
    HERE_STATUSES.has(item.status ?? '')
  );
}

export function pieceInstallState(item: InstallStateInput): PieceInstallState {
  if (item.status === 'installed') return 'installed';
  return isPieceHere(item) ? 'here' : 'not-here';
}
