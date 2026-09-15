'use client';

/**
 * "LOG WHO WAS TOLD" — an inline band, never a modal (SPEC §5.6 #8).
 *
 * It reuses the confirm-band grammar the roster row already uses: the band
 * opens in the card's own pixels, carries the seats it can tell, and confirms
 * in place. Telling people appends to `told_refs` and stamps the change; a
 * change to the way in clears the list, because telling the crew about the OLD
 * lockbox is not telling them about this one.
 *
 * CRM-23 (direction §7 P3) — AND IT WRITES THE NOTICE. `told_refs` is the
 * CARD's own list, which is what Patina Field reads back (`w5-build-report.md`
 * §3) and which the next change to the way in clears. The notice is the
 * studio's DURABLE record that a fact changed and who was told, on
 * `studio_touches`, which nothing clears. Two records of two different things,
 * written in one press.
 *
 * THE CARD IS WRITTEN FIRST. The list is what the phone on the site reads; if
 * the notice then fails, the band says exactly that and offers the press
 * again, rather than pretending the names never landed.
 */

import { useId, useState } from 'react';
import {
  asNoticeError,
  useLogSiteAccessTold,
  useRecordNotice,
} from '@patina/supabase';
import { peopleEvents } from '@/lib/analytics/people-events';
import { DocumentAction, DocumentActionRow } from '../document-action';

/** What the record says changed when the card names nothing more precise. */
export const DEFAULT_NOTICE_FACT = 'The way in changed.';

export interface NoticeLogSeat {
  seatId: string;
  name: string;
}

export function NoticeLog({
  projectId,
  seats,
  told,
  panelId,
  fact = DEFAULT_NOTICE_FACT,
}: {
  projectId: string;
  /** Everyone on the job who could be told. */
  seats: NoticeLogSeat[];
  /** Seat ids already logged against this change. */
  told: string[];
  panelId: string;
  /** CRM-23 — the fact that changed, in the studio's own words. The card
   *  passes the sentence it is already printing, so the record and the face
   *  say the same thing. */
  fact?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const heldId = useId();
  const [note, setNote] = useState<string | null>(null);
  const logTold = useLogSiteAccessTold();
  const recordNotice = useRecordNotice();

  const untold = seats.filter((seat) => !told.includes(seat.seatId));

  const toggle = (seatId: string) =>
    setPicked((current) =>
      current.includes(seatId)
        ? current.filter((id) => id !== seatId)
        : [...current, seatId],
    );

  return (
    <div data-notice-log>
      <DocumentActionRow
        surfaceKey="site-access"
        regionKey="notice-log"
        aria-label="Who was told"
      >
        <DocumentAction
          actionKey="log-who-was-told"
          variant="secondary"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          Log who was told
        </DocumentAction>
      </DocumentActionRow>

      <div id={panelId} hidden={!open}>
        {open && (
          <div className="mt-2 border-l-2 border-[var(--color-clay)] bg-white/40 px-3 py-2.5">
            {untold.length === 0 ? (
              <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
                – Everyone on the job has been told.
              </p>
            ) : (
              <ul className="flex flex-col">
                {untold.map((seat) => (
                  <li key={seat.seatId}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={picked.includes(seat.seatId)}
                      onClick={() => toggle(seat.seatId)}
                      className="flex min-h-11 w-full items-center gap-2.5 text-left text-[0.8rem] text-[var(--color-charcoal)]"
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-[13px] w-[13px] shrink-0 rounded-[2px] border-[1.5px]"
                        style={{
                          borderColor: picked.includes(seat.seatId)
                            ? 'var(--color-sage)'
                            : 'var(--doc-ink-border)',
                          background: picked.includes(seat.seatId)
                            ? 'rgba(168,181,160,0.15)'
                            : 'transparent',
                        }}
                      />
                      {seat.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <DocumentActionRow
              surfaceKey="site-access"
              regionKey="notice-log-confirm"
              className="mt-2"
              aria-label="Confirm who was told"
            >
              <DocumentAction
                actionKey="confirm-who-was-told"
                variant="primary"
                onClick={() =>
                  void logTold
                    .mutateAsync({ projectId, seatIds: picked })
                    .then(async () => {
                      peopleEvents.siteAccessChanged({
                        region: 'told',
                        told_count: picked.length,
                      });
                      const landed =
                        picked.length === 1
                          ? 'One more name is on the notice.'
                          : `${picked.length} more names are on the notice.`;
                      try {
                        // CRM-23's durable half. `record_notice` resolves this
                        // job's studio itself and drops any ref that does not
                        // resolve, so what it stores and what it reads back
                        // can never disagree about who was told.
                        await recordNotice.mutateAsync({
                          projectId,
                          what: fact,
                          told: picked,
                        });
                        setNote(landed);
                      } catch (e: unknown) {
                        setNote(
                          `${landed} The record of the change did not save — ${asNoticeError(e)}`,
                        );
                      }
                      setPicked([]);
                      setOpen(false);
                    })
                    .catch((e: unknown) =>
                      setNote(
                        e instanceof Error ? e.message : 'Could not write the notice.',
                      ),
                    )
                }
                held={picked.length === 0}
                disabled={
                  picked.length === 0 ||
                  logTold.isPending ||
                  recordNotice.isPending
                }
                aria-describedby={picked.length === 0 ? heldId : undefined}
                loading={logTold.isPending || recordNotice.isPending}
                loadingLabel="Writing…"
              >
                Save this note
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-who-was-told"
                variant="tertiary"
                onClick={() => setOpen(false)}
              >
                Not now
              </DocumentAction>
            </DocumentActionRow>
            {/* Direction §5.5: a gated act is `aria-disabled` with a VISIBLE
                consequence sentence — never `disabled` (CR-26). */}
            {picked.length === 0 && (
              <p id={heldId} className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]">
                Pick who was told first — a notice with no names on it records
                nothing.
              </p>
            )}
          </div>
        )}
      </div>

      {note && (
        <p className="mt-2 text-[0.72rem] text-[var(--color-aged-oak)]">{note}</p>
      )}
    </div>
  );
}
