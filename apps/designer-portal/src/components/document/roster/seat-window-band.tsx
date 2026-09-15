'use client';

/**
 * THE ENGAGEMENT WINDOW, AND THE NOTICE THAT IT MOVED (direction §7 P3,
 * CRM-23).
 *
 * "Notice records on the site access card AND the engagement window."
 *
 * The window is the days this seat is on the job. It bands the Call Sheet
 * (`rosterBandFor`), it dates the field link the seat holds (`create_field_link`
 * reads `max(on_site_to, warranty_until)`), and it dates the firm's paperwork
 * door (`mint_paperwork_link`). Moving it moves all three — which is exactly
 * why CRM-23 pairs it with a record: "nothing records who was told when a fact
 * changed: a gate code, a SCHEDULE SLIP, a key handover".
 *
 * TWO WRITES, IN THIS ORDER, AND THE FACE SAYS WHICH LANDED. The window is
 * written first, because it is the fact; the notice follows. A notice that
 * failed is reported as a notice that failed — never swallowed, and never
 * written ahead of the change it claims to be about.
 *
 * WHO WAS TOLD IS ASKED, NEVER ASSUMED. `notified_refs` is a record of people
 * the studio SAYS it told. Stamping the seat holder in unasked would put a
 * claim in the record that nobody made, so the box starts unticked and a
 * notice with nobody on it is still a true record of the change.
 */

import { useEffect, useId, useState } from 'react';
import {
  asNoticeError,
  useRecordNotice,
  useUpdateProjectParty,
} from '@patina/supabase';
import { rosterShortDate, seatWindowText } from '@/lib/document/roster-derivation';
import { writeErrorMessage } from '@/lib/document/write-error';
import { DocumentAction, DocumentActionRow } from '../document-action';

const META = 'font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const FIELD =
  'min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';

/** CRM-23's `notice_of` for a window move, in the studio's own words. */
export function windowNoticeFact(
  name: string,
  from: string | null,
  to: string | null,
): string {
  const words = seatWindowText(from, to);
  return words
    ? `${name} is on the job ${words}.`
    : `${name} has no dates on the job.`;
}

/** What the studio reads back after the write lands. */
export function windowWrittenSentence(
  name: string,
  from: string | null,
  to: string | null,
): string {
  const words = seatWindowText(from, to);
  return words
    ? `${name}’s window runs ${words}.`
    : `${name}’s window is cleared.`;
}

export const WINDOW_CONSEQUENCE_SENTENCE =
  'The window bands this seat on the Call Sheet and dates the doors it holds. ' +
  'The change is recorded with whoever you say was told.';

export function SeatWindowBand({
  seatId,
  projectId,
  name,
  onSiteFrom,
  onSiteTo,
  onWritten,
}: {
  seatId: string;
  projectId: string;
  name: string;
  onSiteFrom: string | null;
  onSiteTo: string | null;
  /** The row's own announcer — one live region per surface (CR11-10). */
  onWritten: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(onSiteFrom ?? '');
  const [to, setTo] = useState(onSiteTo ?? '');
  const [toldThem, setToldThem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateParty = useUpdateProjectParty();
  const recordNotice = useRecordNotice();
  const bandId = useId();

  // r20 major-1's rule, on this band: the field opens ON THE RECORD, never
  // empty, so a correction restates the window rather than blanking it.
  useEffect(() => {
    if (!open) return;
    setFrom(onSiteFrom ?? '');
    setTo(onSiteTo ?? '');
    setToldThem(false);
  }, [open, onSiteFrom, onSiteTo]);

  const save = async () => {
    setError(null);
    const nextFrom = from.trim() || null;
    const nextTo = to.trim() || null;
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setError('The last day on site is before the first. Check the dates.');
      return;
    }
    try {
      await updateParty.mutateAsync({
        id: seatId,
        projectId,
        patch: { onSiteFrom: nextFrom, onSiteTo: nextTo },
      });
    } catch (e: unknown) {
      setError(writeErrorMessage(e, 'Could not move the window.'));
      return;
    }
    const written = windowWrittenSentence(name, nextFrom, nextTo);
    try {
      await recordNotice.mutateAsync({
        projectId,
        what: windowNoticeFact(name, nextFrom, nextTo),
        told: toldThem ? [seatId] : [],
      });
      setOpen(false);
      onWritten(written);
    } catch (e: unknown) {
      // The window MOVED. Saying so and then saying the record did not save is
      // the only honest report of a two-write act.
      setOpen(false);
      onWritten(
        `${written} The record of the change did not save — ${asNoticeError(e)}`,
      );
    }
  };

  // THE TRIGGER STAYS, AND THE PANEL IS ALWAYS IN THE DOM (W4 r3 MAJOR-2).
  //
  // The collapsed branch used to RETURN the trigger alone, carrying
  // `aria-controls={bandId}` at an id nothing in the document had — a dangling
  // IDREF — and on press the whole branch was replaced by the band, so the
  // button under the caret was unmounted and focus fell to `document.body`: a
  // keyboard user on a thirty-row Call Sheet was returned to the top of the
  // page. Saving did it again (`setOpen(false)` while focus sat on "Write the
  // window"). Both siblings in this folder do it the other way, and
  // `roster-row.tsx:14` states it as the room's rule (SPEC §7 #5): the trigger
  // keeps its place with `aria-expanded`, and the panel is an always-present
  // `<div id={panelId} hidden={!open}>`.
  return (
    <div className="mt-3 border-t border-[var(--color-pearl)] pt-2.5">
      <button
        type="button"
        data-edit-window={seatId}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={bandId}
        className="da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
      >
        {onSiteFrom || onSiteTo ? 'Change the window' : 'Set the window'}
      </button>

      <div id={bandId} hidden={!open} data-seat-window-band={seatId}>
        {open && (
          <div className="mt-2.5">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <label className={`mb-1 block ${META}`} htmlFor={`${bandId}-from`}>
                  First day on site
                </label>
                <input
                  id={`${bandId}-from`}
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={`mb-1 block ${META}`} htmlFor={`${bandId}-to`}>
                  Last day on site
                </label>
                <input
                  id={`${bandId}-to`}
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>

            <label className="mt-2 flex min-h-11 items-center gap-2 text-[0.8rem] text-[var(--color-charcoal)]">
              <input
                type="checkbox"
                checked={toldThem}
                onChange={(e) => setToldThem(e.target.checked)}
              />
              {`${name} has been told`}
            </label>

            <p className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]">
              {WINDOW_CONSEQUENCE_SENTENCE}
            </p>

            <DocumentActionRow
              surfaceKey="call-sheet"
              regionKey="roster-row-window"
              className="mt-2"
              aria-label={`Change ${name}'s window`}
            >
              <DocumentAction
                actionKey="save-seat-window"
                variant="primary"
                loading={updateParty.isPending || recordNotice.isPending}
                loadingLabel="Writing…"
                onClick={() => void save()}
              >
                Write the window
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-seat-window"
                variant="tertiary"
                onClick={() => setOpen(false)}
              >
                Leave it
              </DocumentAction>
            </DocumentActionRow>

            {(onSiteFrom || onSiteTo) && (
              <p className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]">
                {`It reads ${seatWindowText(onSiteFrom, onSiteTo) || rosterShortDate(onSiteFrom)} now.`}
              </p>
            )}

            {error && (
              <p
                role="alert"
                data-seat-window-error
                className="mt-1.5 text-[0.72rem] text-[var(--color-terracotta-ink)]"
              >
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
