'use client';

/**
 * Plan room, on a shelf — a thin read of the same bundle PlanRoomBand
 * showed: the current set and when it was last filed, with one door to the room
 * itself. No CRUD lives here; the room owns that.
 *
 * Lens-inert: `plan_sheets` carries no room association (00429 — the sheet's
 * only axes are discipline and sheet number), so the room lens has nothing to
 * lift and the leaf makes no claim about it.
 */

import Link from 'next/link';
import { usePlanRoom } from '@patina/supabase';
import { deriveHolders, holderSentence } from '@/lib/plans/model';
import { fmtDay } from '@/lib/document/format';
import { ShelfSection, ShelfRow, ShelfNote, ShelfDoor } from './shelf-parts';

export function PlanRoomLeaf({
  projectId,
  routeId,
}: {
  projectId: string;
  routeId: string;
}) {
  const room = usePlanRoom(projectId);
  const bundle = room.data;

  if (room.isError) {
    return <ShelfNote>Plan room could not be read.</ShelfNote>;
  }
  if (!bundle) return <ShelfNote>Reading the plan room…</ShelfNote>;

  const lastFiledAt = bundle.prints.reduce<string | null>(
    (latest, print) =>
      latest == null || print.created_at > latest ? print.created_at : latest,
    null,
  );
  // The wound this surface exists to close: somebody is holding a revision that
  // is no longer current. It followed the plan room onto the shelf.
  const behind = deriveHolders(bundle).filter((h) => h.behindCount > 0);

  return (
    <>
      {behind.length > 0 && (
        <div className="mb-4 border-l-2 border-[var(--color-golden-hour)] px-2.5 py-2">
          {behind.map((holder) => (
            <p
              key={holder.partyKey}
              className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-[var(--color-golden-hour)]"
            >
              {holderSentence(holder)}
            </p>
          ))}
        </div>
      )}
      <ShelfSection label="Current set">
        {bundle.sheets.length === 0 ? (
          <ShelfNote>No drawings filed yet.</ShelfNote>
        ) : (
          bundle.sheets.map((sheet) => (
            <ShelfRow
              key={sheet.id}
              name={`${sheet.sheet_number} ${sheet.title}`}
              meta={sheet.discipline ?? undefined}
              value={
                sheet.current_print_number != null
                  ? `Rev ${sheet.current_print_number}`
                  : 'No print'
              }
              sub={sheet.state === 'shared' ? 'Issued' : 'Draft'}
            />
          ))
        )}
      </ShelfSection>

      {lastFiledAt && (
        <ShelfNote>Last filed {fmtDay(lastFiledAt)}.</ShelfNote>
      )}

      <ShelfDoor>
        <Link href={`/doc/${routeId}/plans`} className="block">
          Open the plan room →
        </Link>
      </ShelfDoor>
    </>
  );
}
