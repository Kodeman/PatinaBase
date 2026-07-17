// @patina/fulfillment — S4 notification helpers (spec §6).
//
// Pure, portal-side pairing to supabase/functions/_shared/fulfillment-
// templates.ts's Deno-side ClientNotificationTransition. These two files
// intentionally do NOT share an import (Deno edge functions and the Next.js
// portal are different runtimes/bundlers in this repo — every other _shared/*
// vs packages/* pair in BOH follows the same "mirror, documented, tested on
// both sides" pattern as format.ts mirrors fulfillment_confirm_split's SQL).

import type { Band } from './types';

// ClientNotificationChannel lives in ./types (the canonical DTO module) —
// not redefined here to avoid a duplicate-export ambiguity on `export *`.

export type ClientNotificationTransition =
  | 'confirmed'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'eta_change'
  | 'substitution';

export const CLIENT_NOTIFICATION_TRANSITIONS: readonly ClientNotificationTransition[] = [
  'confirmed',
  'in_production',
  'shipped',
  'delivered',
  'eta_change',
  // S7: an approved substitution drafts its own client note — distinct from
  // eta_change (a price-Δ-$0 finish swap is not a delay). Mirrored in
  // supabase/functions/_shared/fulfillment-templates.ts.
  'substitution',
];

/**
 * Which client-note transition applies to a Queue row's CURRENT derived
 * state — the note-drawer's `n` key uses this to decide what to draft. Mirrors
 * client_order_status_v's derived_status -> client_status CASE (00353) for the
 * status half, plus an eta_change override when the order carries an open
 * exception (client_status='delayed' in that view).
 */
export function transitionForDerivedStatus(
  derivedStatus: string,
  openExceptions: number,
): ClientNotificationTransition {
  if (openExceptions > 0) return 'eta_change';
  switch (derivedStatus) {
    case 'intake':
    case 'split':
    case 'transmitted':
      return 'confirmed';
    case 'acknowledged':
    case 'in_production':
      return 'in_production';
    case 'shipped':
      return 'shipped';
    case 'delivered':
    case 'settled':
      return 'delivered';
    case 'needs_mapping':
    case 'exception':
      return 'eta_change';
    default:
      return 'confirmed';
  }
}

/** Bands where drafting a client note is a meaningful next action — mirrors
 *  the note-drawer's `n` affordance being live everywhere except... nowhere,
 *  actually (every band has SOME client-appropriate note); kept as a named
 *  export so a future gate (e.g. suppress on 'quiet') has one place to live. */
export function noteDraftableForBand(_band: Band): boolean {
  return true;
}

export type NoteSendMode = 'fast' | 'edited';

/**
 * The note-drawer's core decision: has the operator changed the drafted text?
 * 'fast' (unedited) sends exactly what was drafted, no edit_diff — bound to a
 * bare `n` or Enter. 'edited' demotes to an explicit action (button or
 * Cmd+Enter) since the text no longer matches what was rendered — spec §6
 * "edits diffed into client_notifications." Trims trailing/leading whitespace
 * only (a pasted note with different internal whitespace still counts as
 * edited) so an incidental focus/blur trim doesn't manufacture a false edit.
 */
export function resolveNoteSendMode(draftedBody: string, currentBody: string): NoteSendMode {
  return currentBody.trim() === draftedBody.trim() ? 'fast' : 'edited';
}

export interface NoteDrawerKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * Pure key resolver for the note drawer's send shortcuts (mirrors
 * use-queue-keyboard.ts's resolveQueueAction split of decision-from-DOM).
 * Unedited: `n` or bare `Enter` sends immediately (the fast path — spec §6
 * "one-key send"). Edited: only Cmd/Ctrl+Enter sends (the explicit-action
 * demotion); a bare Enter or `n` while editing is presumed to be TEXT ENTRY
 * (the operator is typing in the textarea) and must NOT fire a send.
 */
export function resolveNoteDrawerSendAction(
  e: NoteDrawerKeyEvent,
  mode: NoteSendMode,
): 'send' | null {
  // Cmd/Ctrl+Enter always sends, in either mode — the explicit-action
  // shortcut is never blocked, it's just the ONLY thing that sends once edited.
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return 'send';
  if (mode === 'fast') {
    if (e.key === 'n' || e.key === 'Enter') return 'send';
    return null;
  }
  // edited: a bare n/Enter is presumed text entry — do nothing.
  return null;
}
