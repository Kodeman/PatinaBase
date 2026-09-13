'use client';

/**
 * The reach word (PD-12) — "eight and a half pixels of mono, on every row,
 * saying whether this person logs in, opens a link, or only ever gets a call.
 * Nothing else in the product says it at all."
 *
 * Three words and no fourth: Account · Field link · On paper. A forbidding or
 * routing rule prints as a SENTENCE beside the word (ContactRuleLine), never as
 * a fourth word (PR-e).
 *
 * The three tints are gone: reach is one of the four word families now, so the
 * word and its pigment come from `StateWord` — one primitive, one table, one
 * reduction (direction §3.8). This wrapper stays because four call sites and
 * two specs name it, and because `reach` is the only family the Call Sheet's
 * collapsed row prints beside the stage.
 */

import type { ReachState } from '@patina/types';
import { StateWord } from '../people/state-word';

export function ReachChip({
  state,
  plain = false,
}: {
  state: ReachState | null | undefined;
  /** At 390 the row's words print plain and middle-dot separated (R-M). */
  plain?: boolean;
}) {
  return <StateWord family="reach" value={state} plain={plain} />;
}
