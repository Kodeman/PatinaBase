'use client';

/**
 * Today (US-25 slice 4; US-28 S3 change 1) — the top of the Desk: the day's
 * lines as cards, one per job (DeskJobCard), each line one sentence with its
 * act. US-43 R7: the card holding the top line spans the row, the rest stand
 * two to a row; each card prints one state sentence under its name; a line's
 * foot is its act, "Record payment" where it has one, then a "Later" menu
 * holding "Not today" and "Until…". A line settles in place, muted, at the
 * height it stood, with what was done and who the studio now waits on. What
 * is past the fifth line, waiting on others or coming back lives in the
 * ledger below (DeskRoster).
 *
 * Colour by rule: the stage edge on the card, terracotta-ink on an overdue
 * clause, ink everywhere else. No badge, count, "cleared" or streak.
 *
 * US-14 arrival marks moved here with the content they lifted: the eyebrow is
 * the `head` (and, on a working sheet, the `settle`); line one carries
 * `headline` / `act`, card one's name `job`, and lines two and three are the
 * facts `f1` / `f2`. A quiet sheet's one sentence is its `headline settle`.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSetNeedState, type TeammateActed } from '@patina/supabase';
import type { DeskHolder, DeskScope } from '@/lib/document/desk-scope';
import { deskActionLabel, deskNeedText } from '@/lib/document/desk-derivation';
import {
  cardStateWords,
  draftedForWords,
  localDay,
  nextWorkingDay,
  type DaySheet as DaySheetModel,
  type SheetCard,
  type SheetEntry,
  type SheetSettled,
} from '@/lib/document/day-sheet';
import { dayMonth, WEEKDAY_FORMAT, parseSourceDate } from '@/lib/document/dates';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { useNeedActSheet } from './acts/need-act-sheet';
import { actSheetKindOf, recordsPayment } from './acts/act-sheet-kind';
import { SetAsideSheet } from './acts/set-aside-sheet';
import { actLanding } from './desk-ledger-row';
import { openLedger } from './command-bar';
import { clockTime, DeskJobCard, holderWord } from './desk-job-card';

/** The quiet sheet's sentences (uplift.md change 1). */
export const TODAY_HANDLED = 'Today’s lines are handled. What can wait is below.';
export const NOTHING_NEEDS_YOU_TONIGHT = 'Nothing more needs you today.';
export const NOTHING_NEEDS_YOU = 'Nothing needs you today.';

const SCOPES: readonly (readonly [DeskScope, string])[] = [
  ['mine', 'Mine'],
  ['studio', 'The studio’s'],
];

export { clockTime };

/** "Friday 16 October" — a local day (`YYYY-MM-DD`) in words. */
export function dayWords(day: string | null | undefined): string | null {
  const date = parseSourceDate(day ?? null);
  return date ? `${WEEKDAY_FORMAT.format(date)} ${dayMonth(date)}` : null;
}

/** What was done, by the need it settled. */
const DONE_WORD: Record<string, string> = {
  overdue_invoice: 'Reminder sent',
  po_unacknowledged: 'Chase sent',
  proposal_declined: 'Follow-up sent',
  hesitating_proposal: 'Follow-up sent',
  proposal_expired: 'Follow-up sent',
  po_unsent: 'Released',
  new_lead: 'Replied',
};

/** The settled line's words: what was done, then who the studio waits on. */
export function settledWords(
  entry: SheetEntry,
  settled: SheetSettled,
  names?: ReadonlyMap<string, string>,
): string {
  const by = settled.by ? names?.get(settled.by)?.trim().split(/\s+/)[0] : null;
  switch (settled.kind) {
    case 'drafted':
      return draftedForWords(settled.who ?? 'the lead');
    case 'read':
      return `Note read · ${clockTime(settled.at)}`;
    case 'not_today': {
      const back = dayWords(settled.until);
      return `Not today · ${clockTime(settled.at)}${back ? ` · back ${back}` : ''}`;
    }
    case 'set_aside': {
      const back = dayWords(settled.until);
      return `Set aside${back ? ` until ${back}` : ''}${settled.reason ? ` · waiting on ${settled.reason}` : ''}`;
    }
    default: {
      if (entry.need.releasedOrder || entry.need.releaseHeld) {
        const buyer = entry.need.assignedToUserId ? names?.get(entry.need.assignedToUserId) : null;
        const who = (buyer || entry.need.releaseBuyerName)?.trim().split(/\s+/)[0] || 'the buyer';
        return `Released · waiting on ${who} to send`;
      }
      const done = `${DONE_WORD[entry.need.kind] ?? 'Done'}${by ? ` by ${by}` : ''}`;
      return settled.who
        ? `${done} · waiting on ${settled.who} since ${clockTime(settled.at)}`
        : `${done} · ${clockTime(settled.at)}`;
    }
  }
}

/** Walk W-D8 — the fact's own dashes read as commas, not a chain of dashes. */
const asOneClause = (fact: string) => fact.replace(/\s+—\s+/g, ', ');

/** The overdue clause is the one terracotta on the sheet. */
const OVERDUE_CLAUSE = /(\$[\d,]+(?:\.\d+)? overdue|\d+ days? overdue|overdue)/i;

function Sentence({ text, overdue }: { text: string; overdue: boolean }) {
  const parts = overdue ? text.split(OVERDUE_CLAUSE) : [text];
  if (parts.length < 3) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <span className="od">{parts[1]}</span>
      {parts.slice(2).join('')}
    </>
  );
}

/**
 * US-43 R7 — "Later ▾": the line's postponements behind one disclosure. Its
 * items mount only while it is open; Escape, or focus leaving it, closes it,
 * and Escape hands focus back to "Later".
 */
function LaterMenu({
  jobName,
  disabled,
  onNotToday,
  onUntil,
}: {
  jobName: string;
  disabled: boolean;
  onNotToday: () => void;
  onUntil: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // SQ-1518 — below 1180px the menu can open under the fixed bottom bar. The
  // document route's `scroll-padding-bottom` is that bar's height, so the
  // nearest scroll lands the opened menu above it. Focus stays on "Later".
  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  return (
    <div
      className="later"
      data-holds-escape={open ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        toggleRef.current?.focus();
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <DocumentAction
        ref={toggleRef}
        actionKey="day-sheet-later"
        variant="tertiary"
        aria-label={`Later — ${jobName}`}
        aria-expanded={open}
        aria-controls={menuId}
        trailing="▾"
        onClick={() => setOpen((was) => !was)}
      >
        Later
      </DocumentAction>
      <div ref={menuRef} id={menuId} className="later-menu" hidden={!open}>
        {open && (
          <>
            {/* SQ-778 N5 — every line can be set aside for today: the line's
                engagement names its studio. */}
            <DocumentAction
              actionKey="day-sheet-not-today"
              variant="tertiary"
              aria-label={`Not today — ${jobName}`}
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
                onNotToday();
              }}
            >
              Not today
            </DocumentAction>
            {/* U-Q5 — Set aside has its own door: a day and a reason. Either
                choice rests focus on "Later" until the line settles, so the
                sheet hands it back there. */}
            <DocumentAction
              actionKey="day-sheet-set-aside"
              variant="tertiary"
              aria-label={`Set aside until a day — ${jobName}`}
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
                onUntil();
              }}
            >
              Until…
            </DocumentAction>
          </>
        )}
      </div>
    </div>
  );
}

function SheetLine({
  entry,
  index,
  card,
  oneVoice,
  now,
  teammateActed,
  names,
  onSettle,
}: {
  entry: SheetEntry;
  /** Its place on the whole sheet, across cards (arrival marks). */
  index: number;
  card: SheetCard;
  oneVoice: boolean;
  now: Date;
  teammateActed?: ReadonlyMap<string, readonly TeammateActed[]>;
  names?: ReadonlyMap<string, string>;
  onSettle: (words: string) => void;
}) {
  const acts = useNeedActSheet();
  const router = useRouter();
  // SQ-777 F2 — a failed mark says so on its line, never in a toast.
  const setNeedState = useSetNeedState({ errorSurface: 'inline' });
  const undo = useSetNeedState({ errorSurface: 'inline' });
  const [failed, setFailed] = useState<string | null>(null);
  const [asideOpen, setAsideOpen] = useState(false);
  const armed = useRef(false);
  const undoing = useRef(false);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const undoRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const actRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const { need, settled } = entry;
  const handoff = need.kind === 'handoff';
  const top = index === 0;
  const theirs = !!card.holder && !card.holder.mine;
  const words = settled ? settledWords(entry, settled, names) : null;
  const ownDeferral = !!settled && !settled.by && (settled.kind === 'not_today' || settled.kind === 'set_aside');

  // After her act the line settles in place: focus moves to it (to Undo,
  // after "Not today"), and the one status region says what happened.
  useEffect(() => {
    if (!settled || !armed.current || !words) return;
    armed.current = false;
    (undoRef.current ?? lineRef.current)?.focus();
    onSettle(`${card.name}: ${words}`);
  }, [settled, words, card.name, onSettle]);

  // R6 — once Undo lands her deferral is gone, and its Undo with it, whatever
  // the line reads now: open again, or settled by the holder's act today that
  // her deferral had masked (R6b). Focus moves to the act left on the line,
  // else to the line itself.
  useEffect(() => {
    if (ownDeferral || !undoing.current) return;
    undoing.current = false;
    (actRef.current ?? lineRef.current)?.focus();
    onSettle(`${card.name}: Undone.`);
  }, [ownDeferral, card.name, onSettle]);

  // US-43 R7 — a line that settles in place keeps the height it stood at, so
  // its card never shrinks under her. Both renders are the same <li>; the
  // open one records its height, the settled one holds it as a floor.
  const itemRef = useRef<HTMLLIElement>(null);
  const openHeight = useRef(0);
  const isSettled = !!(settled && words);
  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) return;
    if (!isSettled) {
      item.style.minHeight = '';
      lineRef.current?.style.removeProperty('--settle-lines');
      openHeight.current = item.offsetHeight;
      return;
    }
    if (openHeight.current <= 0) return;
    item.style.minHeight = `${openHeight.current}px`;
    // SQ-1518 — on a phone her settled words can wrap past the room the open
    // line stood in. Clamp them to the lines that room holds, so the card
    // keeps its height; the whole sentence stays in the DOM and was said in
    // the status region.
    const line = lineRef.current;
    if (!line) return;
    line.style.removeProperty('--settle-lines');
    item.style.flex = '0 0 auto';
    const excess = item.offsetHeight - openHeight.current;
    item.style.flex = '';
    const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
    if (excess <= 0 || !(lineHeight > 0)) return;
    const shown = Math.round(line.offsetHeight / lineHeight);
    const keep = Math.max(1, shown - Math.ceil(excess / lineHeight));
    if (keep < shown) line.style.setProperty('--settle-lines', String(keep));
  });

  if (settled && words) {
    return (
      <li
        ref={itemRef}
        data-day-sheet-line={entry.key}
        data-part={index === 1 ? 'f1' : index === 2 ? 'f2' : undefined}
        className="ln-item settled"
      >
        <p ref={lineRef} tabIndex={-1} data-part={top ? 'headline' : undefined} className="line">
          {words}
        </p>
        {ownDeferral && (
          <div className="foot">
            <DocumentAction
              ref={undoRef}
              actionKey="day-sheet-undo"
              variant="tertiary"
              aria-label={`Undo — ${card.name}`}
              disabled={undo.isPending}
              onClick={() => {
                undoing.current = true;
                setFailed(null);
                undo.mutate(
                  { needKey: entry.key, engagementId: entry.projectId, action: 'clear' },
                  {
                    onError: () => {
                      undoing.current = false;
                      setFailed('Undo did not save. Try again.');
                    },
                  },
                );
              }}
            >
              Undo
            </DocumentAction>
          </div>
        )}
        {failed && (
          <p role="alert" data-day-sheet-failed className="t-body-sm">
            {failed}
          </p>
        )}
      </li>
    );
  }

  const sentence = handoff ? deskNeedText(need, oneVoice) : asOneClause(deskNeedText(need, oneVoice));
  // A hand-off names its own act: one-voice's kind name ("Read the note")
  // would promise a note the hire's invite never carried.
  const label = (handoff ? need.actionLabel : deskActionLabel(need, oneVoice)) ?? 'Open project file';
  const href = need.deepLink ?? `/doc/${entry.projectId}`;
  const jobHref = `/doc/${card.jobId}`;
  // US-14 R-DM21 A — the act lands where the job's own act lands: its stage.
  // One that opens a sheet carries none.
  const landing =
    card.stage && !actSheetKindOf(entry)
      ? actLanding({
          stage: card.stage,
          projectId: entry.projectId,
          needKind: need.kind,
          jobHref,
          act: { label, href, ...(need.ledger ? { ledger: need.ledger } : {}) },
        })
      : null;
  // U-Q4 — a teammate who does not carry the job acted on it today: a fact
  // on her line, never a settle.
  const fact = card.holder?.mine
    ? (teammateActed?.get(entry.key) ?? [])
        .filter((act) => act.userId !== card.holder?.userId && localDay(new Date(act.actedAt)) === localDay(now))
        .sort((a, b) => a.actedAt.localeCompare(b.actedAt))
        .at(-1)
    : undefined;
  const factName = fact ? names?.get(fact.userId)?.trim().split(/\s+/)[0] : null;

  const act = (event: MouseEvent<HTMLAnchorElement>) => {
    armed.current = true;
    // Walk W-D6 — opening the hand-off is reading it: the same `acted` mark
    // the Document's MARK READ writes. SQ-774 R7 — she leaves once the mark
    // has landed; a refused or offline mark stays here and says so.
    if (handoff) {
      event.preventDefault();
      setNeedState.mutate(
        { needKey: entry.key, projectId: entry.projectId, action: 'acted' },
        {
          onSuccess: () => router.push(href),
          onError: () => setFailed('The hand-off was not marked read. Try again.'),
        },
      );
      return;
    }
    if (acts.open(entry)) {
      event.preventDefault();
      return;
    }
    if (need.ledger) {
      event.preventDefault();
      openLedger(need.ledger.name, need.ledger.context);
    }
  };

  return (
    <li
      ref={itemRef}
      data-day-sheet-line={entry.key}
      data-part={index === 1 ? 'f1' : index === 2 ? 'f2' : undefined}
      className="ln-item"
    >
      <p ref={lineRef} tabIndex={-1} data-part={top ? 'headline' : undefined} className="line [overflow-wrap:anywhere]">
        <Sentence text={sentence} overdue={need.kind.startsWith('overdue_')} />
        {theirs && ` The move is ${card.holder?.name ? holderWord(card.holder.name) : 'the lead’s'}.`}
      </p>
      {fact && factName && (
        <p data-day-sheet-fact className="t-body-sm text-[var(--text-subtle)]">
          {`${factName} drafted this for you · ${clockTime(fact.actedAt)}`}
        </p>
      )}
      {/* Someone else's move prints no act: the line is hers to read. The
          arrival click token reads an act by `data-register="act"`. */}
      {!theirs && (
        <div className="foot" data-register="act">
          <DocumentAction
            ref={actRef}
            actionKey={`day-sheet-${need.kind}`}
            variant="secondary"
            href={href}
            onClick={act}
            aria-label={`${label} — ${card.name}`}
            data-part={top ? 'act' : undefined}
            data-landing={landing ? JSON.stringify(landing) : undefined}
          >
            {label}
          </DocumentAction>
          {/* U-Q6 — an overdue invoice can also be recorded as paid, in the
              same one act sheet; the door is quiet text. US-43 R7 — it stays
              in the foot, never behind Later: it reconciles, it does not
              postpone. */}
          {recordsPayment(entry) && actSheetKindOf(entry) !== 'record-payment' && (
            <DocumentAction
              actionKey="day-sheet-record-payment"
              variant="tertiary"
              aria-label={`Record payment — ${card.name}`}
              onClick={() => {
                acts.open(entry, 'record-payment');
              }}
            >
              Record payment
            </DocumentAction>
          )}
          {!handoff && (
            <LaterMenu
              jobName={card.name}
              disabled={setNeedState.isPending}
              onNotToday={() => {
                armed.current = true;
                setFailed(null);
                setNeedState.mutate(
                  {
                    needKey: entry.key,
                    engagementId: entry.projectId,
                    action: 'not_today',
                    until: nextWorkingDay(now),
                  },
                  { onError: () => setFailed('Not today did not save. Try again.') },
                );
              }}
              onUntil={() => {
                setFailed(null);
                setAsideOpen(true);
              }}
            />
          )}
        </div>
      )}
      {!handoff && !theirs && (
        <SetAsideSheet
          open={asideOpen}
          onClose={() => setAsideOpen(false)}
          jobName={card.name}
          line={sentence}
          now={now}
          onSave={({ until, reason }) => {
            armed.current = true;
            return setNeedState
              .mutateAsync({ needKey: entry.key, engagementId: entry.projectId, action: 'set_aside', until, reason })
              .catch((error: unknown) => {
                armed.current = false;
                throw error;
              });
          }}
        />
      )}
      {failed && (
        <p role="alert" data-day-sheet-failed className="t-body-sm">
          {failed}
        </p>
      )}
    </li>
  );
}

export function DaySheet({
  sheet,
  cards,
  scope,
  onScope,
  oneVoice = false,
  now,
  dateLabel,
  teammateActed,
  names,
}: {
  sheet: DaySheetModel;
  /** Today's lines by job (`groupSheetByJob(sheet.lines, …)`). */
  cards: readonly SheetCard[];
  scope: DeskScope;
  onScope: (scope: DeskScope) => void;
  oneVoice?: boolean;
  now: Date;
  /** U-Q3 — the day, as "Monday 12 October"; blank until hydrated. */
  dateLabel?: string;
  /** U-Q4 — teammates' acted facts, by need key (`useTeammateActed`). */
  teammateActed?: ReadonlyMap<string, readonly TeammateActed[]>;
  /** The studio's members' names, by user id. */
  names?: ReadonlyMap<string, string>;
}) {
  const [said, setSaid] = useState('');
  const open = sheet.lines.filter((line) => !line.settled);
  const notChecked =
    sheet.unchecked.length > 0 ? `Not checked: ${sheet.unchecked.join(', ')}.` : null;
  // Fix-now 6 — an unread feed never lets the sheet say nothing needs her:
  // its quiet sentence is the feeds it could not read.
  const quietWords =
    open.length > 0
      ? null
      : notChecked
        ? notChecked
        : sheet.empty
          ? NOTHING_NEEDS_YOU
          : sheet.lines.length > 0 && sheet.alsoYours.some((line) => !line.settled)
            ? TODAY_HANDLED
            : NOTHING_NEEDS_YOU_TONIGHT;
  const quiet = sheet.lines.length === 0;
  let index = 0;

  return (
    <section aria-labelledby="day-sheet-head" data-testid="day-sheet" className="section day-sheet">
      <div className="sec-head">
        {/* US-14 `head` — the arrival's landing focus and the card's place. */}
        <p
          id="day-sheet-head"
          className="eb"
          data-part={quiet ? 'head' : 'head settle'}
          tabIndex={-1}
        >
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>{dateLabel ? `${dateLabel} · Today` : 'Today'}</span>
        </p>
        <div role="group" aria-label="Whose lines" className="filters">
          {SCOPES.map(([key, word], i) => (
            <span key={key} className="inline-flex items-baseline gap-4">
              {i > 0 && <span aria-hidden="true">·</span>}
              <button type="button" aria-pressed={scope === key} onClick={() => onScope(key)}>
                {word}
              </button>
            </span>
          ))}
        </div>
      </div>
      {quietWords && (
        <p data-part={quiet ? 'headline settle' : undefined} className="t-d3 desk-quiet">
          {quietWords}
        </p>
      )}

      {!quiet && (
        <DocumentActionGroup surfaceKey="desk" regionKey="day-sheet" aria-label="Today’s actions">
          {/* `w-full`: an inline-size container sized by its flex row measures 0. */}
          <div className="cards-wrap w-full">
            {/* US-43 R7 — `cards-lead`: card one, holding the top line, spans the row. */}
            <div className="cards cards-lead">
              {cards.map((card, position) => (
                <DeskJobCard
                  key={`${card.jobId}:${card.holder?.userId ?? ''}`}
                  card={card}
                  scope={scope}
                  now={now}
                  first={position === 0}
                  state={cardStateWords(card)}
                >
                  {card.lines.map((entry) => (
                    <SheetLine
                      key={entry.key}
                      entry={entry}
                      index={index++}
                      card={card}
                      oneVoice={oneVoice}
                      now={now}
                      teammateActed={teammateActed}
                      names={names}
                      onSettle={setSaid}
                    />
                  ))}
                </DeskJobCard>
              ))}
            </div>
          </div>
        </DocumentActionGroup>
      )}
      {open.length > 0 && notChecked && <p className="t-body-sm mt-4 text-[var(--text-muted)]">{notChecked}</p>}
      <p role="status" className="sr-only">
        {said}
      </p>
    </section>
  );
}
