'use client';

/**
 * The threshold band on /doc/[id] — the paper's one line about the drawings.
 *
 * It states the vitals and offers a single door; it never becomes the room. The
 * band goes golden-hour the moment anyone holds a revision that is no longer
 * current, because that is the wound this whole surface exists to close.
 *
 * Holders come from `deriveHolders`, the ONE derivation — the same function the
 * set view, the amber sentences, and the ceremony's recipient hints read. The
 * holdings RPC is deliberately not consulted here: two sources that settle at
 * different moments can disagree mid-load, and a band that says "Boone is
 * current" for one paint is worse than a band that says nothing.
 *
 * It renders NOTHING until the bundle resolves — a band that flashed "no
 * drawings filed yet" on every load would be lying for a frame. There is no
 * dismissal: a set nobody is current on is not something to hide.
 */

import { usePlanRoom } from '@patina/supabase';
import { deriveHolders, holderSentence } from '@/lib/plans/model';
import { fmtDay } from '@/lib/document/format';
import { planRoomEvents } from '@/lib/analytics/plan-room-events';
import { DocumentAction, DocumentActionRow } from '../document-action';

export function PlanRoomBand({
  routeId,
  projectId,
}: {
  routeId: string;
  projectId: string;
}) {
  const room = usePlanRoom(projectId);

  if (!room.data) return null;
  const bundle = room.data;

  const behind = deriveHolders(bundle).filter((holder) => holder.behindCount > 0);

  const lastFiledAt = bundle.prints.reduce<string | null>(
    (latest, print) =>
      latest == null || print.created_at > latest ? print.created_at : latest,
    null,
  );

  const lead =
    bundle.sheets.length === 0
      ? 'The plan room — no drawings filed yet.'
      : `The plan room — ${bundle.sheets.length} ${bundle.sheets.length === 1 ? 'sheet' : 'sheets'}${lastFiledAt ? ` · last filed ${fmtDay(lastFiledAt)}` : ''}`;

  return (
    <div
      data-plan-room-band
      className={`mt-4 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-l-2 bg-white/40 px-3 py-2.5 ${
        behind.length > 0
          ? 'border-[var(--color-golden-hour)]'
          : 'border-[var(--color-aged-oak)]'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[0.8rem] text-[var(--color-charcoal)]">{lead}</p>
        {behind.map((holder) => (
          <p
            key={holder.partyKey}
            className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-golden-hour)]"
          >
            {holderSentence(holder)}
          </p>
        ))}
      </div>
      <DocumentActionRow
        surfaceKey="plan-room"
        regionKey="plan-room-band"
        aria-label="The drawings"
      >
        <DocumentAction
          actionKey="open-plan-room"
          variant="primary"
          href={`/doc/${routeId}/plans`}
          onClick={() =>
            planRoomEvents.bandOpened({
              project_id: projectId,
              sheet_count: bundle.sheets.length,
            })
          }
        >
          Open the plan room
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}
