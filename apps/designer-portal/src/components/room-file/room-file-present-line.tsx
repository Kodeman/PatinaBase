/**
 * RoomFilePresentLine — the ONLY reader of `room_files.present_status`.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `refine_delivery.deliver()` advances a version's `present_status` to
 * `'refining'` when it lands. Nothing in the product read that column, so a
 * successful production delivery left no ungated trace anywhere a person
 * looks: the Room View's refine readout is behind the `room-view-refined-path`
 * flag AND requires its artifacts to sign and parse, so a flag-off operator —
 * or a delivery whose pose deltas failed to resolve — saw a page identical to
 * one where Refine had never run.
 *
 * This is deliberately a STATUS TOKEN and nothing more. It says which
 * Present-Layer stage the version reached and, when the manifest names it,
 * which engine ran. It reports no drift, no residual and no verdict: those
 * numbers belong to the refine readout, which frames them properly. A line
 * that quoted a figure here would be a second, unframed accuracy surface.
 *
 * Pure prop — no query, no state. `null` for a P1-only version, which is every
 * version in production today.
 */

import type { RoomFile } from '@patina/supabase';
import { ROOM_FILE_COPY as C } from './room-file-copy';

export interface RoomFilePresentLineProps {
  roomFile: Pick<RoomFile, 'present' | 'present_status'> | null | undefined;
}

export function RoomFilePresentLine({ roomFile }: RoomFilePresentLineProps) {
  const status = roomFile?.present_status;
  // NULL is the honest "no Present Layer has run" — render nothing at all.
  if (!status) return null;

  const label = C.presentStatusLabel[status];
  // An unknown value means the 00376 CHECK was widened without this catalogue
  // being updated. Show the raw token rather than nothing: an operator reading
  // an unfamiliar word is strictly better off than one reading a blank page.
  const text = label ?? status;

  // `present.refine_engine` is a STRING (00377 reads it as TEXT). Anything
  // else is not a name and is not rendered.
  const engine = roomFile?.present?.refine_engine;
  const engineText = typeof engine === 'string' && engine ? engine : null;

  return (
    <p
      data-testid="room-file-present-line"
      className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
    >
      {C.presentPrefix} · {text}
      {engineText && C.presentEngineSuffix(engineText)}
    </p>
  );
}
