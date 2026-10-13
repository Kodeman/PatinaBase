'use client';

/**
 * The ledger row (R143 · US-25 slice 4 · US-28 S3 change 2).
 *
 * One S1 ledger row per job: the job's name on its stage tick, the phase as
 * an ink word, one sentence, when, and at most one act. A job with the studio
 * waiting on someone else, or put off until a day ahead, prints no act. A
 * line that settled today stays in place, muted. Every word stays selectable.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import Link from 'next/link';
import { useSetNeedState } from '@patina/supabase';
import type { Landing } from '@/lib/arrival/types';
import { STAGE_WORD } from '@/lib/document/act-names';
import { paperRegionsForSection } from '@/lib/document/document-index';
import type { DeskLedgerLine, RosterLine } from '@/lib/document/desk-roster-derivation';
import type { DeskHolder } from '@/lib/document/desk-scope';
import { parseSourceDate } from '@/lib/document/dates';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { clockTime, holderWord, stageClass } from './desk-job-card';

/** F4 — the quiet row says what the roster's quiet state says
 *  (desk-roster-derivation's QUIET_STATE). */
const AT_REST_SENTENCE = 'No current alert';

/** The id a link lands on — the put-down row lands on it after a return,
 *  and F6's Back falls back to it when the held offset no longer fits. */
export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

/** US-14 R-DM21 A — where the act lands when it opens the job's own
 *  Document: where the Document's own act for the same need lands
 *  (needGuideAction, document-guide.ts), in the arrival token's shape. A
 *  purchase order lands on the FF&E region; every other need on its stage's
 *  section. An act that opens a sheet or another room carries none. */
export function actLanding(
  line: Pick<RosterLine, 'act' | 'jobHref' | 'needKind' | 'projectId' | 'stage'>,
): Landing | null {
  if (line.act.ledger || line.act.href !== line.jobHref) return null;
  const po = line.needKind === 'po_unsent' || line.needKind === 'po_unacknowledged';
  if (po && line.projectId && paperRegionsForSection(line.stage).some((r) => r.key === 'ffe')) {
    return { kind: 'region', region: 'ffe' };
  }
  return { kind: 'section', sectionKey: line.stage };
}

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Fri 16 Oct" — the ledger's short day, from a local day or a timestamp. */
function shortDay(value: string | null | undefined): string | null {
  const date = parseSourceDate(value ?? null) ?? (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return null;
  return SHORT_DAY.format(date).replace(',', '');
}

/** Undo on her own "Not today" or set-aside, settled today: it clears the
 *  state row, and the line returns to its place. Its own component, so a
 *  plain row reads no query client. */
function LedgerUndo({ line, undoing }: { line: RosterLine; undoing: MutableRefObject<boolean> }) {
  const undo = useSetNeedState({ errorSurface: 'inline' });
  const [failed, setFailed] = useState(false);
  return (
    <>
      <DocumentAction
        actionKey={`roster-undo-${line.engagementId}`}
        aria-label={`Undo — ${line.name}`}
        variant="tertiary"
        disabled={undo.isPending || !line.needKey}
        onClick={() => {
          if (!line.needKey) return;
          setFailed(false);
          // The row holds the mark: a landed Undo unmounts this control.
          undoing.current = true;
          undo.mutate(
            { needKey: line.needKey, engagementId: line.projectId ?? line.engagementId, action: 'clear' },
            {
              onError: () => {
                undoing.current = false;
                setFailed(true);
              },
            },
          );
        }}
      >
        Undo
      </DocumentAction>
      {failed && (
        <span role="alert" className="block t-body-sm">
          Undo did not save. Try again.
        </span>
      )}
    </>
  );
}

export function DeskLedgerRow({
  line,
  standing,
  settled = null,
  waiting = null,
  back = null,
  holder = null,
  onUndone,
}: { line: RosterLine } & Partial<Omit<DeskLedgerLine, 'line'>> & {
  /** Who carries the job; a row she does not carry prints no act. */
  holder?: DeskHolder | null;
  /** Says a landed Undo in the ledger's one status region. */
  onUndone?: (words: string) => void;
}) {
  const undoing = useRef(false);
  const actRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const nameRef = useRef<HTMLAnchorElement>(null);
  const ownDeferral = !!settled && !settled.by && (settled.kind === 'not_today' || settled.kind === 'set_aside');
  // R6 — once Undo lands her deferral is gone, and its Undo with it, whatever
  // the row reads now: open again, or settled by the holder's act today that
  // her deferral had masked (R6b). Focus moves to its act, or to its name
  // where it prints none.
  useEffect(() => {
    if (ownDeferral || !undoing.current) return;
    undoing.current = false;
    (actRef.current ?? nameRef.current)?.focus();
    onUndone?.(`${line.name}: Undone.`);
  }, [ownDeferral, line.name, onUndone]);
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;
  const landing = line.needKind ? actLanding(line) : null;
  const need = line.needKind ? (line.overdueText ?? line.needText ?? '') : '';
  const theirs = standing === 'yours' && !!holder && !holder.mine;

  let sentence = line.needKind ? need : (line.motionText ?? line.notChecked ?? AT_REST_SENTENCE);
  let when: string | null = line.valueText ?? null;
  if (settled) {
    sentence = settled.kind === 'not_today' || settled.kind === 'set_aside'
      ? `${settled.kind === 'not_today' ? 'Not today' : 'Set aside'} · ${clockTime(settled.at)}${settled.until ? ` · back ${shortDay(settled.until)}` : ''}`
      : `${need || 'Done'} · ${settled.who ? `waiting on ${settled.who} since ` : ''}${clockTime(settled.at)}`;
    when = null;
  } else if (waiting) {
    sentence = `${need || sentence} · waiting on ${waiting.who}`;
    when = `Since ${shortDay(waiting.since) ?? 'today'}`;
  } else if (back) {
    sentence = back.reason ? `${need || sentence} · ${back.reason}` : need || sentence;
    when = `Back ${shortDay(back.until) ?? 'soon'}`;
  } else if (theirs) {
    sentence = `${sentence} The move is ${holder?.name ? holderWord(holder.name) : 'the lead’s'}.`;
  }
  const quietRow = !!waiting || !!back || theirs || !!settled;

  return (
    <li
      id={rosterLineAnchorId(line.engagementId)}
      data-ledger-row={line.engagementId}
      className={settled ? 'lrow settled' : 'lrow'}
    >
      <p data-ledger-cell="name" className={`lname tick ${stageClass(line.stage)}`}>
        <Link ref={nameRef} href={line.jobHref} data-roster-name className="name t-d4 [overflow-wrap:anywhere]">
          {line.name}
        </Link>
      </p>
      <span data-ledger-cell="phase" className="lphase word">
        {STAGE_WORD[line.stage]}
      </span>
      <span data-ledger-cell="sentence" className="lsent t-body-sm [overflow-wrap:anywhere]">
        {sentence}
      </span>
      {/* Tabular figures: the moment one row carries a date, it lines up
          with every other one that does. */}
      <span data-ledger-cell="value" className="lwhen t-meta tabular-nums">
        {when ?? ''}
      </span>
      {/* `data-register="act"` is what the arrival click token reads (US-14
          R-DM21 A): an act opens the record straight, with its landing. */}
      <span data-ledger-cell="act" data-register="act" className="lact">
        {ownDeferral ? (
          <LedgerUndo line={line} undoing={undoing} />
        ) : quietRow ? null : line.act.ledger ? (
          <DocumentAction
            ref={actRef}
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="secondary"
            wrap
            onClick={() => openLedger(line.act.ledger!.name, line.act.ledger!.context)}
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            ref={actRef}
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="secondary"
            wrap
            data-landing={landing ? JSON.stringify(landing) : undefined}
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}
